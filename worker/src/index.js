/*
 * Dienstplan-Proxy + Änderungs-Benachrichtigungen (Cloudflare Worker)
 *
 * 1) GET /dienstplan.ics – liefert genau EINEN Kalender aus: die private
 *    ICS-Adresse aus dem Secret ICS_URL (unverändert wie in RKTel; kein offener
 *    Proxy, kein Ziel-URL-Parameter).
 *
 * 2) Optional: Benachrichtigungen bei Dienstplan-Änderungen (Web Push).
 *    Ein Zeitplan (Cron, z. B. alle 10 Minuten) lädt den Kalender, vergleicht
 *    ihn mit dem letzten Stand und schickt bei Änderungen eine Mitteilung an
 *    alle angemeldeten Geräte:
 *      „Neu: …“          Dienst ist dazugekommen
 *      „Aktualisiert: …“ Zeit, Fahrzeug, Ort oder Besatzung haben sich geändert
 *      „Ausfall: …“      Dienst ist weggefallen (oder abgesagt)
 *    Verglichen wird pro Termin-UID; nur Dienste, die noch nicht vorbei sind.
 *    Die Schlüssel für Web Push (VAPID) erzeugt der Worker selbst beim ersten
 *    Aufruf und legt sie im KV-Speicher ab.
 *
 *    Endpunkte (alle mit Zugangsschlüssel):
 *      GET  /push/key          öffentlicher VAPID-Schlüssel
 *      GET  /push/status       Anzahl Geräte, letzte Prüfung
 *      GET  /push/changes      letzte Änderungen (für Markierungen in der App)
 *      GET  /push/history      Verlauf pro Dienst (bis 30 Tage nach Dienstende)
 *      POST /push/subscribe    { subscription, label }
 *      POST /push/unsubscribe  { endpoint }
 *      POST /push/test         { endpoint? }  Testmitteilung
 *
 * Zugriff nur mit "Authorization: Bearer <ACCESS_TOKEN>" (Secret, mind. 32 Zeichen).
 * CORS-Header nur für Herkünfte aus ALLOWED_ORIGINS – CORS ist dabei nur eine
 * Browser-Regel, der eigentliche Schutz ist der Zugangsschlüssel.
 * ICS-Adresse und Zugangsschlüssel werden nie geloggt oder zurückgegeben.
 *
 * Konfiguration:
 *   Secret ICS_URL          vollständiger privater Kalenderlink (https)
 *   Secret ACCESS_TOKEN     zufälliger Zugangsschlüssel (>= 32 Zeichen)
 *   Var    ALLOWED_ORIGINS  kommagetrennt, z. B. "https://vitushg.github.io"
 *   Var    UPSTREAM_HOST    erlaubter Host der ICS_URL (Schutz vor Fehlkonfiguration)
 *   KV     PUSH_KV          (nur für Benachrichtigungen) Speicher für Geräte & Stand
 *   Cron   z. B. "*\/10 * * * *" (nur für Benachrichtigungen)
 */

const ENDPOINT = "/dienstplan.ics";
const MIN_TOKEN_LENGTH = 32;
const UPSTREAM_TIMEOUT_MS = 15000;
const MAX_ICS_BYTES = 5 * 1024 * 1024;
const TIME_ZONE = "Europe/Vienna";
const MAX_SUBSCRIPTIONS = 10;
const MAX_CHANGES_KEPT = 60;
const MAX_SINGLE_NOTIFICATIONS = 4; // mehr Änderungen auf einmal → eine Sammelmitteilung

const BASE_HEADERS = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function corsHeaders(origin, allowed) {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(status, body, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8", Vary: "Origin", ...extra },
  });
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

// Vergleich in konstanter Zeit (über Hashes gleicher Länge).
async function tokenMatches(given, expected) {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function configError(env) {
  if (typeof env.ACCESS_TOKEN !== "string" || env.ACCESS_TOKEN.length < MIN_TOKEN_LENGTH) return true;
  let url;
  try {
    url = new URL(env.ICS_URL);
  } catch {
    return true;
  }
  if (url.protocol !== "https:") return true;
  if (env.UPSTREAM_HOST && url.hostname !== env.UPSTREAM_HOST) return true;
  return false;
}

/** Lädt den Kalender. Liefert { ok, body } oder { ok:false, status, error }. */
async function fetchIcs(env, fetchImpl) {
  let upstream;
  try {
    upstream = await fetchImpl(env.ICS_URL, {
      method: "GET",
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "User-Agent": "RKTel-Dienstplan-Worker" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, status: timeout ? 504 : 502, error: timeout ? "upstream_timeout" : "upstream_unreachable" };
  }
  if (!upstream.ok) return { ok: false, status: 502, error: "upstream_status", upstreamStatus: upstream.status };
  const declared = Number(upstream.headers.get("Content-Length") || 0);
  if (declared > MAX_ICS_BYTES) return { ok: false, status: 502, error: "upstream_too_large" };
  let body;
  try {
    body = await upstream.text();
  } catch {
    return { ok: false, status: 502, error: "upstream_unreachable" };
  }
  if (body.length > MAX_ICS_BYTES) return { ok: false, status: 502, error: "upstream_too_large" };
  if (!/^\s*BEGIN:VCALENDAR/i.test(body.slice(0, 1024).replace(/^﻿/, ""))) {
    return { ok: false, status: 502, error: "upstream_invalid" };
  }
  return { ok: true, body };
}

export async function handleRequest(request, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const allowed = parseOrigins(env.ALLOWED_ORIGINS);
  const cors = corsHeaders(origin, allowed);
  const isPush = url.pathname.startsWith("/push/");

  if (url.pathname !== ENDPOINT && !isPush) return json(404, { error: "not_found" }, cors);

  // Fremde Browser-Herkünfte grundsätzlich abweisen (Anfragen ohne Origin,
  // z. B. curl, brauchen trotzdem den Zugangsschlüssel).
  if (origin && !allowed.includes(origin)) return json(403, { error: "forbidden" });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...BASE_HEADERS, Vary: "Origin", ...cors } });
  }
  if (url.search) return json(400, { error: "bad_request" }, cors);

  if (configError(env)) return json(500, { error: "worker_config" }, cors);

  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(\S+)$/);
  if (!match || !(await tokenMatches(match[1], env.ACCESS_TOKEN))) {
    return json(401, { error: "unauthorized" }, { ...cors, "WWW-Authenticate": 'Bearer realm="dienstplan"' });
  }

  if (isPush) return handlePush(request, env, url.pathname, cors, fetchImpl);

  if (request.method !== "GET") {
    return json(405, { error: "method_not_allowed" }, { ...cors, Allow: "GET, OPTIONS" });
  }
  const res = await fetchIcs(env, fetchImpl);
  if (!res.ok) {
    const body = { error: res.error };
    if (res.upstreamStatus) body.status = res.upstreamStatus;
    return json(res.status, body, cors);
  }
  return new Response(res.body, {
    status: 200,
    headers: { ...BASE_HEADERS, "Content-Type": "text/calendar; charset=utf-8", Vary: "Origin", ...cors },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Benachrichtigungen
// ═══════════════════════════════════════════════════════════════════════════

const KV_SUBS = "subscriptions";
const KV_SNAPSHOT = "snapshot";
const KV_CHANGES = "changes";
const KV_VAPID = "vapid";
const KV_STATUS = "status";
const KV_HISTORY = "history";
const HISTORY_KEEP_MS = 30 * 24 * 3600 * 1000; // Verlauf bis 30 Tage nach Dienstende
const HISTORY_MAX_ENTRIES = 40;                // je Dienst
const HISTORY_MAX_SERVICES = 400;

async function kvGet(env, key, fallback) {
  try {
    const v = await env.PUSH_KV.get(key, "json");
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}
const kvPut = (env, key, value) => env.PUSH_KV.put(key, JSON.stringify(value));

async function readJsonBody(request) {
  const text = await request.text();
  if (text.length > 8192) throw new Error("too_large");
  return text ? JSON.parse(text) : {};
}

function validSubscription(s) {
  if (!s || typeof s !== "object" || typeof s.endpoint !== "string" || !s.keys) return false;
  let u;
  try {
    u = new URL(s.endpoint);
  } catch {
    return false;
  }
  return u.protocol === "https:" && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
}

async function handlePush(request, env, path, cors, fetchImpl) {
  if (!env.PUSH_KV) return json(501, { error: "push_not_configured" }, cors);
  const method = request.method;

  if (path === "/push/key" && method === "GET") {
    const vapid = await getVapidKeys(env);
    return json(200, { publicKey: vapid.publicKey }, cors);
  }
  if (path === "/push/status" && method === "GET") {
    const subs = await kvGet(env, KV_SUBS, []);
    const status = await kvGet(env, KV_STATUS, {});
    return json(200, { devices: subs.length, ...status }, cors);
  }
  if (path === "/push/changes" && method === "GET") {
    const changes = await kvGet(env, KV_CHANGES, []);
    const status = await kvGet(env, KV_STATUS, {});
    return json(200, { changes, lastCheck: status.lastCheck || null, lastError: status.lastError || null }, cors);
  }
  if (path === "/push/history" && method === "GET") {
    const history = await kvGet(env, KV_HISTORY, {});
    return json(200, { history }, cors);
  }
    if (method !== "POST") return json(405, { error: "method_not_allowed" }, { ...cors, Allow: "GET, POST, OPTIONS" });

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    return json(400, { error: "bad_request" }, cors);
  }

  if (path === "/push/subscribe") {
    const sub = body.subscription;
    if (!validSubscription(sub)) return json(400, { error: "bad_subscription" }, cors);
    const label = String(body.label || "").slice(0, 40);
    let subs = (await kvGet(env, KV_SUBS, [])).filter((s) => s.endpoint !== sub.endpoint);
    subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, label, at: Date.now() });
    subs = subs.slice(-MAX_SUBSCRIPTIONS);
    await kvPut(env, KV_SUBS, subs);
    // Erster Stand sofort anlegen, damit die nächste Prüfung vergleichen kann
    const snap = await kvGet(env, KV_SNAPSHOT, null);
    if (!snap) await checkForChanges(env, fetchImpl).catch(() => {});
    return json(200, { ok: true, devices: subs.length }, cors);
  }
  if (path === "/push/unsubscribe") {
    const subs = await kvGet(env, KV_SUBS, []);
    const rest = subs.filter((s) => s.endpoint !== body.endpoint);
    if (rest.length !== subs.length) await kvPut(env, KV_SUBS, rest);
    return json(200, { ok: true, devices: rest.length }, cors);
  }
  if (path === "/push/test") {
    const subs = (await kvGet(env, KV_SUBS, [])).filter((s) => !body.endpoint || s.endpoint === body.endpoint);
    if (!subs.length) return json(404, { error: "no_devices" }, cors);
    const results = await notifyAll(env, subs, [{
      title: "Test: Benachrichtigungen aktiv",
      body: "So sieht eine Mitteilung bei Dienstplan-Änderungen aus.",
      tag: "etb-test",
    }], fetchImpl);
    return json(results.sent ? 200 : 502, results, cors);
  }
  return json(404, { error: "not_found" }, cors);
}

// — ICS lesen (bewusst schlank: nur was für den Vergleich nötig ist) ————————

function unfoldLines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(v) {
  return v.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

// Versatz einer Zeitzone zu einem Zeitpunkt in Minuten (über Intl)
function zoneOffsetMinutes(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - ms) / 60000);
}

/** "20261103T070000" (+ Zone) → Millisekunden; null bei Ganztagesterminen. */
function parseIcsDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value.trim());
  if (!m) return null;
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7]) return local;
  let tz = (/TZID=("?)([^";:]+)\1/i.exec(params || "") || [])[2] || TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = TIME_ZONE;
  }
  let guess = local - zoneOffsetMinutes(local, tz) * 60000;
  guess = local - zoneOffsetMinutes(guess, tz) * 60000; // Sommerzeit-Grenze
  return guess;
}

export function parseEvents(icsText) {
  const events = [];
  let cur = null;
  for (const line of unfoldLines(icsText)) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const semi = head.indexOf(";");
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
    const params = semi < 0 ? "" : head.slice(semi + 1);
    switch (name) {
      case "UID": cur.uid = value.trim(); break;
      case "DTSTART": cur.start = parseIcsDate(value, params); break;
      case "DTEND": cur.end = parseIcsDate(value, params); break;
      case "SUMMARY": cur.summary = unescapeText(value).trim(); break;
      case "LOCATION": cur.location = unescapeText(value).trim(); break;
      case "DESCRIPTION": cur.description = unescapeText(value).trim(); break;
      case "STATUS": cur.status = value.trim().toUpperCase(); break;
      case "RECURRENCE-ID": cur.rid = value.trim(); break;
      case "RRULE": cur.recurring = true; break;
      default: break;
    }
  }
  const out = {};
  for (const e of events) {
    if (!e.uid || !e.start || !e.end || e.recurring) continue; // Serien: nicht Teil des Dienstplans
    if (e.status === "CANCELLED") continue; // abgesagt = weggefallen
    const key = e.rid ? `${e.uid}|${e.rid}` : e.uid;
    out[key] = { uid: e.uid, s: e.start, e: e.end, t: e.summary || "", l: e.location || "", d: e.description || "" };
  }
  return out;
}

// — Vergleich wie in der Dienstplan-App: UID gleich, „langer Text“ verschieden —

const longSummary = (x) => `${x.s}|${x.e}|${x.t}|${x.d}|${x.l}`;

export function diffSchedules(prev, next, now) {
  const changes = [];
  for (const [key, n] of Object.entries(next)) {
    if (n.e <= now) continue;
    const p = prev[key];
    if (!p) changes.push({ type: "added", key, uid: n.uid, now: n });
    else if (longSummary(p) !== longSummary(n)) changes.push({ type: "updated", key, uid: n.uid, now: n, before: p });
  }
  for (const [key, p] of Object.entries(prev)) {
    if (p.e <= now || next[key]) continue;
    changes.push({ type: "removed", key, uid: p.uid, before: p });
  }
  return changes.sort((a, b) => (a.now || a.before).s - (b.now || b.before).s);
}

const fmtDay = (ms) => new Intl.DateTimeFormat("de-AT", { timeZone: TIME_ZONE, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(ms));
const fmtTime = (ms) => new Intl.DateTimeFormat("de-AT", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const fmtRange = (x) => `${fmtDay(x.s)} ${fmtTime(x.s)}–${fmtTime(x.e)}`;

function changeNotification(c) {
  const x = c.now || c.before;
  const title = { added: "Neu", updated: "Aktualisiert", removed: "Ausfall" }[c.type] + ": " + (x.t || "Dienst");
  const lines = [fmtRange(x) + (x.l ? " · " + x.l : "")];
  if (c.type === "updated") {
    const b = c.before;
    if (b.s !== x.s || b.e !== x.e) lines.push(`Vorher: ${fmtRange(b)}`);
    if (b.t !== x.t) lines.push(`Vorher: ${b.t || "—"}`);
    if (b.l !== x.l) lines.push(`Ort vorher: ${b.l || "—"}`);
    if (b.d !== x.d) lines.push("Besatzung/Info geändert");
  }
  return { title, body: lines.join("\n"), tag: "etb-" + c.key, url: "./#verlauf=" + encodeURIComponent(c.key) };
}

function summaryNotification(changes) {
  const n = (t) => changes.filter((c) => c.type === t).length;
  const parts = [];
  if (n("added")) parts.push(`${n("added")} neu`);
  if (n("updated")) parts.push(`${n("updated")} geändert`);
  if (n("removed")) parts.push(`${n("removed")} Ausfall`);
  const first = changes[0].now || changes[0].before;
  return {
    title: `Dienstplan: ${changes.length} Änderungen`,
    body: `${parts.join(" · ")}\nAb ${fmtDay(first.s)}`,
    tag: "etb-summary",
    url: "./#dienstplan",
  };
}

/** Verlauf pro Dienst fortschreiben und alte Einträge aufräumen. */
export function updateHistory(history, changes, now) {
  const h = { ...history };
  for (const c of changes) {
    const item = h[c.key] || { uid: c.uid, entries: [] };
    item.entries = item.entries.concat({ at: now, type: c.type, now: c.now || null, before: c.before || null }).slice(-HISTORY_MAX_ENTRIES);
    item.last = c.now || c.before;
    h[c.key] = item;
  }
  const keys = Object.keys(h).filter((k) => h[k] && h[k].last && h[k].last.e + HISTORY_KEEP_MS > now);
  keys.sort((a, b) => h[b].entries[h[b].entries.length - 1].at - h[a].entries[h[a].entries.length - 1].at);
  const out = {};
  for (const k of keys.slice(0, HISTORY_MAX_SERVICES)) out[k] = h[k];
  return out;
}

/** Kalender prüfen, Unterschiede melden. Wird vom Zeitplan aufgerufen. */
export async function checkForChanges(env, fetchImpl = fetch) {
  if (!env.PUSH_KV || configError(env)) return { skipped: true };
  const now = Date.now();
  const status = await kvGet(env, KV_STATUS, {});
  const res = await fetchIcs(env, fetchImpl);
  if (!res.ok) {
    await kvPut(env, KV_STATUS, { ...status, lastCheck: now, lastError: res.error });
    return { error: res.error };
  }
  const all = parseEvents(res.body);
  // Nur Dienste, die noch nicht vorbei sind, merken (hält den Speicher klein)
  const next = {};
  for (const [k, v] of Object.entries(all)) if (v.e > now) next[k] = v;

  const prevSnap = await kvGet(env, KV_SNAPSHOT, null);
  if (!prevSnap) {
    await kvPut(env, KV_SNAPSHOT, { at: now, events: next });
    await kvPut(env, KV_STATUS, { ...status, lastCheck: now, lastError: null, lastChange: status.lastChange || null });
    return { initialized: true, events: Object.keys(next).length };
  }
  const prev = prevSnap.events || {};
  const prevFuture = Object.values(prev).filter((v) => v.e > now).length;
  // Schutz vor Fehlalarm: plötzlich leerer Kalender ist eher ein Fehler beim Server
  if (!Object.keys(next).length && prevFuture >= 2) {
    await kvPut(env, KV_STATUS, { ...status, lastCheck: now, lastError: "empty_calendar" });
    return { error: "empty_calendar" };
  }

  const changes = diffSchedules(prev, next, now);
  if (changes.length) {
    await kvPut(env, KV_SNAPSHOT, { at: now, events: next });
    const history = await kvGet(env, KV_CHANGES, []);
    const stamped = changes.map((c) => ({ at: now, type: c.type, uid: c.uid, key: c.key, now: c.now || null, before: c.before || null }));
    await kvPut(env, KV_CHANGES, stamped.concat(history).slice(0, MAX_CHANGES_KEPT));
    await kvPut(env, KV_HISTORY, updateHistory(await kvGet(env, KV_HISTORY, {}), changes, now));
    const subs = await kvGet(env, KV_SUBS, []);
    if (subs.length) {
      const messages = changes.length > MAX_SINGLE_NOTIFICATIONS ? [summaryNotification(changes)] : changes.map(changeNotification);
      await notifyAll(env, subs, messages, fetchImpl);
    }
  } else if (Object.keys(prev).length !== Object.keys(next).length) {
    // nur vergangene Dienste herausgefallen → Stand still aufräumen (selten schreiben)
    if (now - (prevSnap.at || 0) > 6 * 3600 * 1000) await kvPut(env, KV_SNAPSHOT, { at: now, events: next });
  }
  // Alle 10 Minuten ≈ 144 Schreibvorgänge/Tag – weit unter der Gratis-Grenze (1000)
  await kvPut(env, KV_STATUS, { lastCheck: now, lastError: null, lastChange: changes.length ? now : status.lastChange || null });
  return { changes: changes.length };
}

async function notifyAll(env, subs, messages, fetchImpl) {
  const vapid = await getVapidKeys(env);
  const subject = parseOrigins(env.ALLOWED_ORIGINS)[0] || "https://vitushg.github.io";
  let sent = 0;
  const gone = new Set();
  for (const sub of subs) {
    for (const msg of messages) {
      try {
        const status = await sendWebPush(sub, msg, vapid, subject, fetchImpl);
        if (status === 404 || status === 410) { gone.add(sub.endpoint); break; }
        if (status >= 200 && status < 300) sent++;
      } catch {
        // einzelnes Gerät nicht erreichbar – nächstes versuchen
      }
    }
  }
  if (gone.size) {
    const rest = (await kvGet(env, KV_SUBS, [])).filter((s) => !gone.has(s.endpoint));
    await kvPut(env, KV_SUBS, rest);
  }
  return { sent, removed: gone.size };
}

// — Web Push (RFC 8291 Verschlüsselung, RFC 8292 VAPID) mit Web Crypto ——————

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function getVapidKeys(env) {
  const stored = await kvGet(env, KV_VAPID, null);
  if (stored && stored.publicKey && stored.privateJwk) return stored;
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const keys = { publicKey, privateJwk };
  await kvPut(env, KV_VAPID, keys);
  return keys;
}

async function vapidAuthHeader(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapid.publicKey}`;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

export async function encryptPayload(sub, payload) {
  const uaPublic = unb64url(sub.keys.p256dh);
  const authSecret = unb64url(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const plain = concat(enc.encode(payload), new Uint8Array([2])); // letzter Block, ohne Füllung
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plain));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

async function sendWebPush(sub, message, vapid, subject, fetchImpl) {
  const body = await encryptPayload(sub, JSON.stringify(message));
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthHeader(sub.endpoint, vapid, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body,
  });
  return res.status;
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch {
      // Bewusst ohne Details: keine URLs oder Schlüssel in Logs/Antworten.
      return json(500, { error: "server" });
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkForChanges(env).catch(() => {}));
  },
};
