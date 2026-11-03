/* global window, document, localStorage, navigator */
'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'einsatzTagebuchV4';
const PRIO_TEXT = { '1': 'Kritischer Patient', '2': 'Voraussichtl. Stationäre Behandlung', '3': 'Voraussichtl. Ambulante Behandlung' };
const NACA_LABELS = [
  'Keine Erkrankung oder Verletzung',
  'Geringfügige Verletzung bzw. Funktionsstörung',
  'Leichte bis mäßig schwere Funktionsstörung',
  'Mäßige bis schwere, nicht lebensbedrohliche Störung',
  'Schwere Störung, Lebensbedrohung nicht ausgeschlossen',
  'Akute Lebensgefahr',
  'Atem- und/oder Kreislaufstillstand',
  'Tödliche Verletzung oder Erkrankung',
];
// Merkhilfe zum NACA-Score: Beispiele und typische Maßnahme
const NACA_HELP = [
  { ex: 'Dialyse, Krankentransport, Fehleinsatz', tx: '' },
  { ex: 'Prellung, Hautabschürfung, Verbrennung I. Grades', tx: 'Keine akute Therapie notwendig' },
  { ex: 'Finger-/Zehenfrakturen, mäßige Schnittverletzungen, Verbrennung II. Grades', tx: 'Ambulante Abklärung, keine notärztlichen Maßnahmen erforderlich' },
  { ex: 'Größere Frakturen, offene Wunden, Rauchgasvergiftung', tx: 'Stationäre Abklärung + Therapie' },
  { ex: 'Myokardinfarkt, schwerer Asthmaanfall, Wirbelkörperverletzung mit neurologischen Ausfällen, Medikamentenintoxikationen', tx: 'Notärztliche Versorgung erforderlich' },
  { ex: 'Atemwegsverlegung, schweres Schädel-Hirn-Trauma, schwerer Myokardinfarkt, Schlaganfall, offene Beckenfraktur', tx: 'Transport unter CPR-Bereitschaft' },
  { ex: '', tx: 'Akut-Therapie: CPR' },
  { ex: '', tx: 'Todesfeststellung oder erfolglose Reanimation' },
];
// Einsatzart (Kennzahl laut Einsatzprotokoll)
const EINSATZART_CODES = [
  ['1', 'Hintransport stationär'],
  ['2', 'Heimtransport stationär'],
  ['3', 'Hintransport ambulant'],
  ['4', 'Heimtransport ambulant'],
  ['7', 'Verlegung'],
  ['10', 'Übergabe NAH'],
  ['11', 'Übergabe NAW'],
  ['12', 'Mitfahrt verweigert'],
  ['13', 'Leerfahrt'],
  ['14', 'Übergabe RTW von RTW'],
  ['15', 'Belassung vor Ort'],
  ['17', 'Dialyse'],
  ['59', 'Einsatzrücknahme'],
  ['99', 'sonstiger Transport'],
];
// Statistikkennzahl
const STATKZ_CODES = [
  ['1', 'Alkoholmissbrauch'],
  ['2', 'Ambulanz'],
  ['3', 'Anpassung Heilbefehle'],
  ['4', 'Arbeitsunfall'],
  ['5', 'Augenklinik'],
  ['6', 'Berufskrankheit'],
  ['7', 'Bluttransport'],
  ['8', 'Chirurgisch'],
  ['9', 'Dialyse'],
  ['10', 'Dienstfahrt'],
  ['11', 'Unfall sonstiges'],
  ['12', 'Entbindung'],
  ['13', 'Erkrankung allg/med'],
  ['14', 'Erstickung'],
  ['15', 'Schul/Erziehung/Unfall'],
  ['16', 'Freizeit/Unfall'],
  ['17', 'Gefäßchirurgie'],
  ['18', 'Geisteskrankheit'],
  ['20', 'Gewalt/Verbrechen'],
  ['21', 'Haushalt/Unfall'],
  ['23', 'Hundebiss'],
  ['24', 'Infektion'],
  ['25', 'K-Einsatzübung'],
  ['26', 'Kieferchirurgie'],
  ['27', 'Kontrolle Arzt/Ordination'],
  ['28', 'Landwirtschaft/Unfall'],
  ['29', 'Leerfahrt'],
  ['30', 'Medikamente/Sachtransport'],
  ['31', 'Physiotherapie'],
  ['32', 'Plastische Chirurgie'],
  ['33', 'Raufhandel'],
  ['34', 'Rehabilitation (Reha)'],
  ['36', 'Schritmacherkontrolle'],
  ['37', 'Selbstmord'],
  ['38', 'Sozialdienst'],
  ['39', 'Sport/Spiel Unfall'],
  ['40', 'Strahlen/Chemo Therapie'],
  ['41', 'Stromunfall'],
  ['42', 'Suchtgiftmissbrauch'],
  ['44', 'Tierverletzung allgemein'],
  ['45', 'Tod angetroffen'],
  ['47', 'Vergiftung'],
  ['48', 'Verkehr/Unfall'],
  ['49', 'Wagengeburt'],
  ['50', 'CT'],
  ['51', 'Paragraph 8 / mit POL-Begl'],
  ['52', 'Einsatzrücknahme'],
  ['99', 'Sonstiges'],
];
const EINSATZART_MAP = new Map(EINSATZART_CODES);

// Akademische Grade/Titel – im Dienstplan stehen sie als eigener Listeneintrag
// hinter dem Namen: "Nachname Vorname, BSc, Beispiel Anna". Gleiche Liste wie
// in RKTel (rk-dienstplan.js), hier ergänzt um Schreibweisen mit Punkten.
const CREW_TITLE_WORDS = new Set([
  'mag', 'mmag', 'dr', 'ddr', 'prof', 'univ', 'med', 'dent', 'vet', 'rer', 'nat', 'techn', 'jur',
  'phil', 'oec', 'pharm', 'habil', 'di', 'dipl', 'ing', 'dipl-ing', 'di(fh)', 'fh', 'bsc', 'msc',
  'ba', 'ma', 'bed', 'mba', 'mas', 'mpa', 'mph', 'llb', 'llm', 'phd', 'bakk', 'dgkp',
  'dgks', 'dsa', 'pd', 'ao', 'emer', 'hon', 'rn', 'ol', 'beng', 'meng', 'msc(wu)', 'mbs',
]);

function isCrewTitleOnly(segment) {
  const words = String(segment).trim().split(/\s+/).filter(Boolean);
  const isTitle = (w) => {
    const k = w.toLowerCase().replace(/\./g, '').replace(/[–—]/g, '-');
    return CREW_TITLE_WORDS.has(k) || (k.includes('-') && k.split('-').every((x) => CREW_TITLE_WORDS.has(x)));
  };
  // bekannte Titel – oder lauter Kürzel mit Punkt („Prof. Ing.“)
  return words.length > 0 && (words.every(isTitle) || words.every((w) => /^[A-ZÄÖÜ][a-zäöü]*\.$/.test(w)));
}

const STATKZ_MAP = new Map(STATKZ_CODES);

/** "1" → "1 – Hintransport stationär"; unbekannte IDs bleiben sichtbar. */
function kennzahlLabel(map, code) {
  if (code === undefined || code === null || code === '') return '';
  const c = String(code).trim();
  return map.has(c) ? `${c} – ${map.get(c)}` : `${c} (unbekannt)`;
}

// Blaulicht EIN – für Dialog-Button (groß) und Einsatzliste (klein, per CSS skaliert)
const LIGHTS_ON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28">
  <rect x="4" y="16" width="20" height="8" rx="2.5" fill="#1a44bb"/>
  <path d="M8 16V10a6 6 0 0 1 12 0v6H8z" fill="#3366ff"/>
  <rect x="6" y="19" width="16" height="1" rx=".5" fill="rgba(255,255,255,.2)"/>
  <circle cx="10" cy="23" r="1.5" fill="rgba(255,255,255,.25)"/>
  <circle cx="18" cy="23" r="1.5" fill="rgba(255,255,255,.25)"/>
  <rect x="13" y="2" width="2" height="4" rx="1" fill="#ffcc00" opacity=".9"/>
  <rect x="3" y="9" width="3" height="2" rx="1" fill="#ffcc00" opacity=".6"/>
  <rect x="22" y="9" width="3" height="2" rx="1" fill="#ffcc00" opacity=".6"/>
</svg>`;

// Kein Blaulicht – für Dialog-Button
const LIGHTS_OFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28">
  <rect x="4" y="7" width="20" height="16" rx="3" fill="#404040"/>
  <path d="M10 7V5h8v2" fill="#333"/>
  <rect x="13" y="10" width="2" height="10" rx="1" fill="#3a9e3a"/>
  <rect x="9" y="14" width="10" height="2" rx="1" fill="#3a9e3a"/>
</svg>`;

// Koffer-Icon – normale Fahrt in der Einsatzliste
const BRIEFCASE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="2" y="8" width="20" height="13" rx="2.5" fill="#5a6a7a"/>
  <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="none" stroke="#5a6a7a" stroke-width="2" stroke-linecap="round"/>
  <line x1="2" y1="15" x2="22" y2="15" stroke="rgba(255,255,255,.2)" stroke-width="1.5"/>
  <rect x="10.5" y="13.5" width="3" height="3" rx="1" fill="rgba(255,255,255,.3)"/>
</svg>`;

// ── State ──────────────────────────────────────────────────────────────────
let state = loadState();
let activeTab = 'home';
let selectedServiceId = null;
let statsFromDate = null;
let statsToDate = null;
let statsVehicles = [];
let statsLocations = [];
let statsColleagues = [];
let statsKeywords = [];
let statsPzcs = [];
let statsNacaValues = [];
let statsEinsatzarten = [];
let statsStatKz = [];
let heatmapYear = new Date().getFullYear();
let globalLightsOn = false;
let segColleagues = [];
// Home tab ICS cache (null = not yet loaded)
let homeIcsShifts = null;
// Incident dialog transient state
let incDialogServiceId = null;
let incDialogIncidentId = null;
let incLights = false;
let incExtraVehicles = [];
// Service dialog transient state
let svcDialogId = null;
let svcDialogDpUid = '';
let svcColleagues = [];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (_) {}
  return defaultState();
}

function defaultState() {
  return {
    profile: { displayName: 'Privat' },
    services: [],
    alarmCodes: [],
    pzcCodes: [],
    vehicleCategories: [],
    vehicleAssignments: {},
    abteilungen: [],
  };
}

function normalizeState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return defaultState();
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const objList = (x) => (Array.isArray(x) ? x.filter(isObj) : []);
  const str = (x) => (typeof x === 'string' ? x : '');
  s.profile = isObj(s.profile) ? s.profile : { displayName: 'Privat' };
  s.profile.displayName = toDisplayName(s.profile.displayName);
  s.abteilungen = Array.isArray(s.abteilungen) ? s.abteilungen.filter(isObj).map((a) => ({ name: toDisplayName(a.name), deptId: String(a.deptId ?? a.id ?? '') })) : [];
  // Einträge ohne Objektform (null, Zahlen …) verwerfen statt später abzustürzen
  s.services = objList(s.services);
  s.alarmCodes = Array.isArray(s.alarmCodes) ? s.alarmCodes.filter((c) => typeof c === 'string') : [];
  s.pzcCodes = objList(s.pzcCodes);
  s.vehicleCategories = objList(s.vehicleCategories);
  s.vehicleAssignments = (s.vehicleAssignments && typeof s.vehicleAssignments === 'object' && !Array.isArray(s.vehicleAssignments)) ? s.vehicleAssignments : {};
  s.alarmCodes = s.alarmCodes.map((c) => c.trim()).filter(Boolean);
  s.alarmBlaulicht = isObj(s.alarmBlaulicht) ? s.alarmBlaulicht : {};
  Object.keys(s.alarmBlaulicht).forEach((k) => { s.alarmBlaulicht[k] = !!s.alarmBlaulicht[k]; });
  s.pzcCodes = s.pzcCodes.map((p) => ({ code: toDisplayName(p.code), diagnosis: toDisplayName(p.diagnosis) })).filter((p) => p.code);
  s.vehicleCategories.forEach((c) => { c.id = c.id ? String(c.id) : uid(); c.name = toDisplayName(c.name); c.iconNormal = str(c.iconNormal); c.iconSoSi = str(c.iconSoSi); });
  // Textfelder können aus Fremd-Exporten (Henri) als Objekte kommen → in Text wandeln
  const txt = (v) => toDisplayName(v);
  s.services.forEach((svc) => {
    svc.id = svc.id ? String(svc.id) : uid();
    svc.startAt = str(svc.startAt);
    svc.endAt = str(svc.endAt);
    svc.vehicle = txt(svc.vehicle);
    svc.location = txt(svc.location);
    svc.abteilung = txt(svc.abteilung);
    svc.note = txt(svc.note);
    svc.isSeg = !!svc.isSeg;
    if (svc.dpUid !== undefined) svc.dpUid = str(svc.dpUid);
    if (svc.dpAck !== undefined) svc.dpAck = str(svc.dpAck);
    // Titel, die früher als eigene Person gespeichert wurden („BSc“), wieder anhängen
    svc.colleagues = Array.isArray(svc.colleagues) ? mergeCrewTitles(svc.colleagues.map(txt).filter(Boolean)) : [];
    svc.incidents = objList(svc.incidents);
    svc.incidents.forEach((inc) => {
      inc.id = inc.id ? String(inc.id) : uid();
      inc.alarmCode = txt(inc.alarmCode);
      inc.note = txt(inc.note);
      inc.lights = !!inc.lights;
      inc.pzc = isObj(inc.pzc) ? { diag: txt(inc.pzc.diag), age: txt(inc.pzc.age), prio: txt(inc.pzc.prio) } : { diag: '', age: '', prio: '' };
      inc.naca = /^[0-7]$/.test(String(inc.naca ?? '')) ? Number(inc.naca) : null;
      inc.favorite = !!inc.favorite;
      inc.einsatzart = inc.einsatzart != null && inc.einsatzart !== '' ? String(inc.einsatzart) : '';
      inc.statKz = inc.statKz != null && inc.statKz !== '' ? String(inc.statKz) : '';
      inc.extraVehicles = Array.isArray(inc.extraVehicles) ? inc.extraVehicles.map(txt).filter(Boolean) : [];
    });
  });
  return s;
}

/**
 * Macht aus beliebigen Import-Werten einen Anzeigenamen. Henri & Co. liefern
 * „user“ teils als Objekt (z. B. { firstName, lastName }) statt als Text.
 */
function toDisplayName(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(toDisplayName).filter(Boolean).join(' ');
  if (typeof v === 'object') {
    const direct = v.displayName || v.name || v.fullName || v.username || v.userName;
    if (direct) return toDisplayName(direct);
    const parts = [v.firstName || v.firstname || v.vorname, v.lastName || v.lastname || v.nachname].map(toDisplayName).filter(Boolean);
    if (parts.length) return parts.join(' ');
    if (v.email) return toDisplayName(v.email);
  }
  return '';
}

// Speichert den Zustand. Schlägt das fehl (Speicher voll, privater Modus),
// bleibt der Stand im Arbeitsspeicher erhalten und der Anwender wird gewarnt,
// statt dass die Oberfläche mitten in einer Aktion stehen bleibt.
let saveErrorShownAt = 0;
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Speichern fehlgeschlagen:', err);
    if (Date.now() - saveErrorShownAt > 4000) {
      saveErrorShownAt = Date.now();
      toast('Speichern fehlgeschlagen – Gerätespeicher voll? Bitte Daten exportieren.', 'error', 6000);
    }
    return false;
  }
}

// Sicherer Zugriff auf einfache Einstellungen in localStorage
function lsGet(key, fallback = '') {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (_) { return fallback; }
}
function lsSet(key, value) {
  try {
    if (value === null || value === undefined || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch (_) { return false; }
}

// ── Toast (iOS-Banner statt blockierender alert()-Dialoge) ────────────────
function toast(message, type = 'info', duration = 2600) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  const icon = type === 'error' ? '⚠️' : type === 'success' ? '✓' : 'ℹ︎';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg"></span>`;
  el.querySelector('.toast-msg').textContent = String(message);
  // Gleiche Meldung nicht stapeln
  [...host.children].forEach((c) => { if (c.dataset.msg === el.querySelector('.toast-msg').textContent) c.remove(); });
  el.dataset.msg = el.querySelector('.toast-msg').textContent;
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  const hide = () => {
    if (el._hidden) return;
    el._hidden = true;
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  };
  el.addEventListener('click', hide);
  setTimeout(hide, duration);
  return el;
}

// ── Netzwerk: Timeout + verständliche Fehler ──────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    return await fetch(url, ctrl ? { ...options, signal: ctrl.signal } : options);
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('Zeitüberschreitung – Server antwortet nicht');
    if (!navigator.onLine) throw new Error('Keine Internetverbindung');
    throw new Error('Server nicht erreichbar');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Dienstplan-Cache (ICS) ────────────────────────────────────────────────
// Ein gemeinsamer, zwischengespeicherter Abruf für Start und Dienstplan:
// - parallele Aufrufe teilen sich eine Anfrage (kein Request-Sturm)
// - letzter Stand bleibt offline verfügbar
// - nach ICS_TTL wird im Hintergrund aktualisiert
const ICS_CACHE_KEY = 'etb_ics_cache';
const ICS_TTL = 10 * 60 * 1000;
let icsInflight = null;
let icsLastError = null;
let icsLastErrorAt = 0;
const ICS_RETRY_AFTER = 60 * 1000;

// Dienstplan über den eigenen Cloudflare Worker (wie RKTel): die private
// Kalender-URL liegt als Secret im Worker, die App kennt nur Adresse + Schlüssel.
const DP_WORKER_KEY = 'etb_dp_worker';
const DP_TOKEN_KEY = 'etb_dp_token';
const LEGACY_ICS_KEY = 'dienstplan_ics_url'; // frühere Direkt-URL (Server-Version)

function dpConfig() {
  return { url: lsGet(DP_WORKER_KEY), token: lsGet(DP_TOKEN_KEY) };
}
function dpConfigured() {
  const c = dpConfig();
  return !!(c.url && c.token);
}

function readIcsCache() {
  try {
    const c = JSON.parse(lsGet(ICS_CACHE_KEY, 'null'));
    if (c && Array.isArray(c.shifts) && c.url === dpConfig().url) return c;
  } catch (_) {}
  return null;
}

/** RKTel-Termin → Dienst-Objekt, wie es Start/Dienstplan erwarten. */
function occurrenceToShift(o) {
  const crew = (o.colleagues || []).join(', ');
  return {
    uid: o.uid || o.id,
    start: new Date(o.start).toISOString(),
    end: new Date(o.end).toISOString(),
    summary: o.title || '',
    location: o.location || '',
    description: [crew, o.note].filter(Boolean).join('\n'),
    colleagues: o.colleagues || [],
    note: o.note || '',
  };
}

function invalidateIcsCache() {
  lsSet(ICS_CACHE_KEY, null);
  homeIcsShifts = null;
  icsLastError = null;
}

function getIcsShifts(force = false) {
  const cfg = dpConfig();
  const url = cfg.url;
  if (!dpConfigured()) return Promise.resolve({ shifts: [], at: null, calName: '' });
  const cache = readIcsCache();
  if (!force && cache && Date.now() - cache.at < ICS_TTL) return Promise.resolve(cache);
  if (icsInflight && icsInflight.url === url) return icsInflight.promise;
  const promise = (async () => {
    try {
      if (!window.RKDienstplan) throw new Error('Kalender-Modul nicht geladen');
      // Abruf + Zerlegen wie in RKTel (Zeitzonen, Serien, Ausnahmen)
      const text = await window.RKDienstplan.fetchCalendarText(cfg, { timeoutMs: 15000 });
      const occ = window.RKDienstplan.parseCalendar(text, { now: Date.now() - 24 * 3600 * 1000, horizonDays: 400 });
      const shifts = occ.filter((o) => !o.cancelled && !o.allDay).map(occurrenceToShift)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      const entry = { url, at: Date.now(), shifts, calName: '' };
      lsSet(ICS_CACHE_KEY, JSON.stringify(entry));
      icsLastError = null;
      return entry;
    } catch (err) {
      icsLastError = err;
      icsLastErrorAt = Date.now();
      if (cache) return { ...cache, stale: true, error: err };
      throw err;
    } finally {
      icsInflight = null;
    }
  })();
  icsInflight = { url, promise };
  return promise;
}

function futureIcsShifts(shifts, now) {
  return (shifts || [])
    .filter((s) => s && s.start && s.end && new Date(s.end) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

// ── Helpers ────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function parseLocalDt(str) {
  if (!str) return null;
  // Parse "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS" as local time
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

function localDateStr(dt) {
  // Returns "YYYY-MM-DD" in local time from a Date object
  const y = dt.getFullYear(), mo = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function localDtStr(dt) {
  return localDateStr(dt) + 'T' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
}

function formatDtDisplay(str) {
  const d = parseLocalDt(str);
  if (!d) return '-';
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function formatTimeHM(dt) {
  return String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
}

function formatServiceTimeRange(svc) {
  const s = parseLocalDt(svc.startAt);
  const e = parseLocalDt(svc.endAt);
  if (!s) return '-';
  const dateStr = s.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const startTime = formatTimeHM(s);
  if (!e) return `${dateStr}, ${startTime}`;
  const endTime = formatTimeHM(e);
  return `${dateStr}, ${startTime}–${endTime}`;
}

function isDayShift(startAt) {
  if (!startAt) return null;
  const h = parseInt(startAt.slice(11, 13), 10);
  return h >= 6 && h < 17;
}

// ── Dienstkürzel: Wochentag + Tag/Nacht (MITA, MINA, FRNA, SATA, SONA …) ───
const WEEKDAY_2 = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
const WEEKDAY_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const ICON_SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 14.6A8.3 8.3 0 0 1 9.4 3.8a8.3 8.3 0 1 0 10.8 10.8z" fill="currentColor"/></svg>';

/** Kürzel aus Beginn (Date oder "YYYY-MM-DDTHH:MM"); Nacht ab 17 Uhr bzw. vor 6 Uhr. */
function shiftCode(start) {
  const d = start instanceof Date ? start : parseLocalDt(start);
  if (!d || isNaN(d)) return null;
  const h = d.getHours();
  const day = h >= 6 && h < 17;
  return { code: WEEKDAY_2[d.getDay()] + (day ? 'TA' : 'NA'), day, label: `${WEEKDAY_LONG[d.getDay()]} – ${day ? 'Tagdienst' : 'Nachtdienst'}` };
}

function shiftCodeHtml(start, extraCls = '') {
  const c = shiftCode(start);
  if (!c) return '';
  return `<span class="shift-code ${c.day ? 'is-day' : 'is-night'} ${extraCls}" title="${escHtml(c.label)}" aria-label="${escHtml(c.label)}">${c.day ? ICON_SUN : ICON_MOON}<span>${c.code}</span></span>`;
}

// ── Tagesdienstplan-Link: in Safari (angemeldet bleiben) oder in der App ───
const DP_LINK_KEY = 'etb_dp_link_mode';
function isIOSDevice() {
  return window.RKDienstplan ? window.RKDienstplan.isIOS() : /iPhone|iPad|iPod/.test(navigator.userAgent);
}
function dpLinkMode() {
  const v = lsGet(DP_LINK_KEY);
  if (v === 'safari' || v === 'app') return v;
  return isIOSDevice() ? 'safari' : 'app'; // Standard wie in RKTel
}
/** href/target-Attribute für einen Link zum Online Dienstplan. */
function dpLinkAttrs(url) {
  if (dpLinkMode() === 'safari' && isIOSDevice() && /^https:\/\//.test(url)) {
    // x-safari-https:// öffnet Safari direkt (ab iOS 17) – dort bleibt man angemeldet
    return `href="${escHtml('x-safari-' + url)}"`;
  }
  return `href="${escHtml(url)}" target="_blank" rel="noopener noreferrer"`;
}

const ICON_CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M14 14.5h3.5v3.5" /></svg>';

function formatDateDisplay(str) {
  if (!str) return '-';
  const d = parseLocalDt(str + 'T00:00');
  if (!d) return str;
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function serviceDurationHours(svc) {
  const start = parseLocalDt(svc.startAt);
  const end = parseLocalDt(svc.endAt);
  if (!start || !end) return 0;
  return ((end - start) / 3600000).toFixed(1);
}

function dienstplanUrl(svc) {
  const abtName = svc.abteilung || svc.location || '';
  let abt = (state.abteilungen || []).find((a) => a.name && a.name.toLowerCase() === abtName.toLowerCase());
  // sonst unscharf wie in RKTel („MINA RKZ“ → „MINA“, Groß-/Kleinschreibung, Kurzformen)
  if (!abt && window.RKDienstplan && (state.abteilungen || []).length) {
    try {
      const match = window.RKDienstplan.createDepartmentMatcher(state.abteilungen);
      abt = (svc.abteilung && match(svc.abteilung)) || (svc.location && match(svc.location)) || null;
    } catch (_) { abt = null; }
  }
  if (!abt || !abt.deptId) return null;
  const dateStr = (svc.startAt || '').slice(0, 10);
  if (!dateStr) return null;
  return `https://dienstplan.st.roteskreuz.at/Home/Dienstplan/${dateStr}-00000000-0000-0000-0000-000000000000-${abt.deptId}`;
}

// Convert UTC ISO string (from Henri export) to local datetime string "YYYY-MM-DDTHH:MM"
function utcIsoToLocalDtStr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${localDateStr(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}


function pzcDiagnosis(code) {
  if (!code) return '';
  const found = (state.pzcCodes || []).find((p) => p.code === String(code));
  return found ? found.diagnosis : '';
}

function pzcFullLabel(diag, age, prio) {
  const parts = [];
  if (diag) {
    const dx = pzcDiagnosis(diag);
    parts.push(dx ? `${diag} - ${dx}` : diag);
  }
  if (age) parts.push(`Alter: ${age}`);
  if (prio) parts.push(PRIO_TEXT[prio] || `Prio ${prio}`);
  return parts.join(' · ');
}

/** JSON aus einer Datei lesen – mit verständlicher Meldung, falls statt der
 *  Datei die GitHub-Webseite gespeichert wurde. */
function parseJsonText(text) {
  const t = String(text || '').replace(/^\uFEFF/, '').trim();
  if (/^<(!doctype|html)/i.test(t)) {
    throw new Error('Das ist eine Webseite, keine JSON-Datei. Auf GitHub die Datei öffnen und „Raw“ bzw. das Download-Symbol verwenden.');
  }
  try { return JSON.parse(t); } catch (_) { throw new Error('Die Datei ist kein gültiges JSON.'); }
}

/** Erkennt eine reine Stichwortliste (Texte oder { code, blaulicht }). */
function looksLikeKeywordList(data) {
  const raw = Array.isArray(data) ? data : (data && Array.isArray(data.alarmCodes) && !data.version ? data.alarmCodes : null);
  if (!raw || !raw.length) return null;
  const ok = raw.every((it) => typeof it === 'string' || (it && typeof it.code === 'string' && it.diagnosis === undefined));
  return ok ? raw : null;
}

/** Erkennt eine reine PZC-Liste ({ code, diagnosis }). */
function looksLikePzcList(data) {
  const raw = Array.isArray(data) ? data : (data && Array.isArray(data.pzcCodes) && !data.version ? data.pzcCodes : null);
  if (!raw || !raw.length) return null;
  return raw.every((p) => p && typeof p.code === 'string' && typeof p.diagnosis === 'string') ? raw : null;
}

function importKeywordListWithToast(raw, blMap) {
  const before = JSON.stringify(state.alarmBlaulicht || {});
  const added = mergeKeywordList(raw, blMap);
  const changedBl = raw.filter((it) => it && typeof it === 'object').length && before !== JSON.stringify(state.alarmBlaulicht || {});
  saveState();
  const total = state.alarmCodes.length;
  toast(added
    ? `${added} Stichwörter neu übernommen (insgesamt ${total}).`
    : (changedBl ? `Blaulicht-Zuordnung aktualisiert – alle ${total} Stichwörter waren schon vorhanden.` : `Alle Stichwörter waren schon vorhanden (${total}).`), 'success', 4000);
}

function importPzcList(raw) {
  const existing = new Set((state.pzcCodes || []).map((p) => p.code));
  let added = 0;
  raw.forEach((p) => { if (!existing.has(p.code)) { (state.pzcCodes = state.pzcCodes || []).push({ code: p.code, diagnosis: p.diagnosis }); existing.add(p.code); added++; } });
  saveState();
  toast(added ? `${added} PZC-Codes übernommen.` : 'Alle PZC-Codes waren schon vorhanden.', 'success');
}

/** Stichwörter übernehmen: Liste aus Texten oder { code, blaulicht }; optional Zuordnung als Objekt. */
function mergeKeywordList(raw, blMap) {
  state.alarmCodes = state.alarmCodes || [];
  state.alarmBlaulicht = state.alarmBlaulicht || {};
  const existing = new Set(state.alarmCodes);
  let added = 0;
  (raw || []).forEach((it) => {
    const code = typeof it === 'string' ? it.trim() : (it && typeof it.code === 'string' ? it.code.trim() : '');
    if (!code) return;
    if (!existing.has(code)) { state.alarmCodes.push(code); existing.add(code); added++; }
    if (it && typeof it === 'object' && typeof it.blaulicht === 'boolean') state.alarmBlaulicht[code] = it.blaulicht;
  });
  if (blMap && typeof blMap === 'object') Object.entries(blMap).forEach(([k, v]) => { if (existing.has(k)) state.alarmBlaulicht[k] = !!v; });
  state.alarmCodes.sort((a, b) => a.localeCompare(b, 'de'));
  return added;
}

/** Blaulicht laut Stichwortliste: true / false, oder undefined (Stichwort unbekannt). */
function keywordBlaulicht(keyword) {
  const k = String(keyword || '').trim();
  if (!k) return undefined;
  const map = state.alarmBlaulicht || {};
  if (Object.prototype.hasOwnProperty.call(map, k)) return !!map[k];
  const lk = k.toLowerCase();
  const hit = Object.keys(map).find((c) => c.toLowerCase() === lk);
  return hit !== undefined ? !!map[hit] : undefined;
}

function blaulichtDotHtml(code) {
  const b = keywordBlaulicht(code);
  if (b === undefined) return '<span class="kw-dot is-unknown" aria-hidden="true"></span>';
  return `<span class="kw-dot ${b ? 'is-on' : 'is-off'}" title="${b ? 'Mit Blaulicht' : 'Ohne Blaulicht'}"></span>`;
}

// ── Suggestions ────────────────────────────────────────────────────────────
function rankByFrequency(arr) {
  const counts = {};
  arr.forEach((v) => { if (v) counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

// Idempotent: listeners are attached only once; items list is updated in place.
function mountSuggestions(inputEl, dropdownEl, items, max, showOnFocus) {
  max = max || 8;
  // Update item list reference so future renders pick up new data
  inputEl._smItems = items;
  if (inputEl._smMounted) return;
  inputEl._smMounted = true;

  let focusedIdx = -1;

  function render(list) {
    dropdownEl.innerHTML = '';
    if (!list.length) { dropdownEl.classList.remove('open'); return; }
    list.slice(0, max).forEach((item) => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      if (inputEl._smDecorate) { div.classList.add('has-deco'); div.innerHTML = inputEl._smDecorate(item) + '<span>' + escHtml(item) + '</span>'; }
      else div.textContent = item;
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        inputEl.value = item;
        dropdownEl.classList.remove('open');
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
      dropdownEl.appendChild(div);
    });
    focusedIdx = -1;
    dropdownEl.classList.add('open');
  }

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim().toLowerCase();
    if (!q) {
      if (showOnFocus) render(inputEl._smItems);
      else dropdownEl.classList.remove('open');
      return;
    }
    render(inputEl._smItems.filter((it) => it.toLowerCase().includes(q)));
  });

  inputEl.addEventListener('focus', () => {
    if (showOnFocus && !inputEl.value.trim()) render(inputEl._smItems);
  });

  inputEl.addEventListener('keydown', (e) => {
    const items2 = dropdownEl.querySelectorAll('.suggestion-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); focusedIdx = Math.min(focusedIdx + 1, items2.length - 1); items2.forEach((el, i) => el.classList.toggle('focused', i === focusedIdx)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIdx = Math.max(focusedIdx - 1, 0); items2.forEach((el, i) => el.classList.toggle('focused', i === focusedIdx)); }
    else if (e.key === 'Enter') { if (focusedIdx >= 0 && items2[focusedIdx]) { e.preventDefault(); inputEl.value = items2[focusedIdx].textContent.trim(); dropdownEl.classList.remove('open'); inputEl.dispatchEvent(new Event('change', { bubbles: true })); } }
    else if (e.key === 'Escape') { dropdownEl.classList.remove('open'); }
  });

  inputEl.addEventListener('blur', () => { setTimeout(() => dropdownEl.classList.remove('open'), 150); });
}


// ── Tab navigation ─────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      // iOS-Verhalten: Tippen auf den bereits aktiven Tab führt zurück zur
      // Wurzel des Tabs; ist man schon dort, wird nach oben gescrollt.
      if (tab === (TAB_ROOT[activeTab] || activeTab)) {
        if (navAnimating) return;
        const target = getBackTarget();
        if (target) popAnimated(target);
        else scrollActiveToTop();
        return;
      }
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  const prevTab = activeTab;
  activeTab = tab;
  const navTab = TAB_ROOT[tab] || tab;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === navTab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
  renderTab(tab, prevTab);
  updateNavBar();
  // Unterseite (Dienstplan) wie in iOS von rechts hereinschieben
  if (TAB_ROOT[tab] === prevTab && isMobile()) pushAnimated(getBackTarget());
}

// Rendert einen Tab. Ein Fehler in einer Ansicht darf weder die Navigation
// noch andere Tabs lahmlegen – stattdessen erscheint ein Hinweis im Tab.
function renderTab(tab, prevTab) {
  const fail = (err) => {
    console.error('Ansicht „' + tab + '“ fehlgeschlagen:', err);
    const host = { home: 'home-container', statistik: 'stats-container', einstellungen: 'settings-container', dienstplan: 'dienstplan-container', favoriten: 'favoriten-container' }[tab];
    const el = host && document.getElementById(host);
    if (el) el.innerHTML = `<div class="empty-hint">Diese Ansicht konnte nicht angezeigt werden.<br><small>${escHtml(err && err.message ? err.message : String(err))}</small></div>`;
  };
  try {
    if (tab === 'home') renderHome().catch(fail);
    if (tab === 'statistik') renderStats();
    if (tab === 'einstellungen') renderSettings();
    if (tab === 'dienste') { renderServiceList(); renderServiceDetail(); }
    if (tab === 'favoriten') renderFavorites();
    if (tab === 'dienstplan') {
      const panel = document.getElementById('tab-dienstplan');
      if (panel && prevTab !== 'dienstplan') panel.scrollTop = 0;
      loadDienstplan().catch(fail);
    }
  } catch (err) { fail(err); }
}

// ── Service List ───────────────────────────────────────────────────────────
function renderServiceList() {
  updateFavoritesEntry();
  const listEl = document.getElementById('service-list');
  const q = (document.getElementById('search-input') ? document.getElementById('search-input').value : '').toLowerCase().trim();
  let services = state.services.slice().sort((a, b) => (b.startAt || '').localeCompare(a.startAt || ''));
  let incHits = [];
  if (q) {
    // Einsätze direkt finden (Stichwort, Notiz, Kennzahlen, PZC, NACA, weitere Einsatzmittel)
    incHits = searchIncidents(q);
    // Dienste über ihre eigenen Angaben (Datum, Ort, Fahrzeug, Besatzung, Notiz)
    services = services.filter((svc) => {
      const d = parseLocalDt(svc.startAt);
      const haystack = [
        svc.startAt || '', d ? d.toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        d ? d.toLocaleDateString('de-AT', { month: 'long' }) : '',
        svc.location || '', svc.abteilung || '', svc.vehicle || '',
        svc.note || '', (svc.colleagues || []).join(' '),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }
  listEl.innerHTML = '';
  if (q && incHits.length) {
    const sec = document.createElement('div');
    sec.className = 'srch-section';
    const shown = incHits.slice(0, 80);
    sec.innerHTML = `<div class="svc-month"><span>Einsätze</span><span class="svc-month-meta">${incHits.length} ${incHits.length === 1 ? 'Treffer' : 'Treffer'}</span></div>
      <div class="srch-list">${shown.map((h) => searchIncidentRowHtml(h, q)).join('')}</div>
      ${incHits.length > shown.length ? `<div class="srch-more">… und ${incHits.length - shown.length} weitere – Suche verfeinern</div>` : ''}`;
    listEl.appendChild(sec);
    sec.querySelectorAll('.srch-inc').forEach((row) => row.addEventListener('click', (e) => {
      if (navAnimating) return;
      const jump = e.target.closest('.srch-svc-btn');
      if (jump) { e.stopPropagation(); openServiceDetail(row.dataset.svcId); return; }
      openIncidentView(row.dataset.svcId, row.dataset.incId);
    }));
    if (services.length) {
      const hd = document.createElement('div');
      hd.className = 'svc-month';
      hd.innerHTML = `<span>Dienste</span><span class="svc-month-meta">${services.length} Treffer</span>`;
      listEl.appendChild(hd);
    }
  }
  if (!services.length) {
    if (q && incHits.length) return;
    listEl.innerHTML = q
      ? `<div class="list-empty">Keine Treffer für „${escHtml(q)}“.</div>`
      : '<div class="list-empty"><div class="list-empty-icon">📒</div><strong>Noch keine Dienste</strong><span>Mit ＋ oben rechts legst du deinen ersten Dienst an.</span></div>';
    return;
  }
  const nowD = new Date();
  let lastMonth = '';
  services.forEach((svc) => {
    // Abschnittsköpfe pro Monat (wie in iOS-Listen)
    const sd = parseLocalDt(svc.startAt);
    const monthKey = sd ? `${sd.getFullYear()}-${sd.getMonth()}` : 'none';
    if (!q && monthKey !== lastMonth) {
      lastMonth = monthKey;
      const hd = document.createElement('div');
      hd.className = 'svc-month';
      const inMonth = services.filter((x) => { const d = parseLocalDt(x.startAt); return d && `${d.getFullYear()}-${d.getMonth()}` === monthKey; });
      const nInc = inMonth.reduce((n, x) => n + (x.incidents || []).length, 0);
      hd.innerHTML = `<span>${escHtml(sd ? sd.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' }) : 'Ohne Datum')}</span><span class="svc-month-meta">${inMonth.filter((x) => !x.isSeg).length} Dienste · ${nInc} Einsätze</span>`;
      listEl.appendChild(hd);
    }
    const card = document.createElement('div');
    card.className = 'service-card' + (svc.id === selectedServiceId ? ' selected' : '') + (svc.isSeg ? ' is-seg' : '');
    const label = svc.isSeg ? '⚡ SEG' : 'Dienst';
    const incCount = (svc.incidents || []).length;

    // Vehicle icon via assignments map
    const assignedCatId = svc.vehicle ? (state.vehicleAssignments || {})[svc.vehicle] : null;
    const cat = assignedCatId
      ? (state.vehicleCategories || []).find((c) => c.id === assignedCatId)
      : null;
    const isSelected = svc.id === selectedServiceId;
    const alwaysSosi = isSelected || globalLightsOn;
    const iconHtml = cat && cat.iconNormal
      ? `<div class="svc-card-icon-wrap${alwaysSosi ? ' always-sosi' : ''}">
           <img class="svc-card-icon svc-card-icon-normal" src="${escHtml(cat.iconNormal)}" alt="" loading="lazy" />
           ${cat.iconSoSi ? `<img class="svc-card-icon svc-card-icon-sosi" src="${escHtml(cat.iconSoSi)}" alt="" loading="lazy" />` : ''}
         </div>`
      : '';

    const segInc = svc.isSeg ? (svc.incidents || [])[0] : null;
    if (svc.isSeg) {
      // SEG = ein einzelner Einsatz: Stichwort als Titel, Zeit/Ort darunter
      const a = parseLocalDt(svc.startAt), b = parseLocalDt(svc.endAt);
      const when = a ? a.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + formatTimeHM(a) + (b ? '–' + formatTimeHM(b) : '') : '—';
      card.innerHTML = `
        ${iconHtml}
        <div class="svc-card-body">
          <div class="svc-card-top">
            <span class="service-card-badge badge-seg">⚡ SEG</span>
            <div class="service-card-title">${segInc && segInc.favorite ? '<span class="inc-row-fav">★</span>' : ''}${escHtml((segInc && segInc.alarmCode) || 'SEG-Einsatz')}</div>
          </div>
          <div class="service-card-sub">${escHtml([svcWhenText(svc), svc.location].filter(Boolean).join(' · '))}</div>
          ${segInc && segInc.note ? `<div class="inc-row-note svc-card-note">${ICON_NOTE}<span>${escHtml(segInc.note.replace(/\s+/g, ' '))}</span></div>` : ''}
        </div>
        <span class="svc-card-chev" aria-hidden="true">›</span>`;
      card.addEventListener('click', () => { if (segInc) openIncidentView(svc.id, segInc.id); });
      listEl.appendChild(card);
      if (segInc) enableSwipe(card, {
        edit: () => openIncidentDialog(svc.id, segInc.id),
        del: { confirm: () => confirmDeleteIncident(svc.id, segInc.id), run: () => deleteIncident(svc.id, segInc.id, { skipConfirm: true }) },
      });
      return;
    }
    const ss = parseLocalDt(svc.startAt), se = parseLocalDt(svc.endAt);
    const running = ss && se && ss <= nowD && nowD <= se;
    card.innerHTML = `
      ${iconHtml}
      <div class="svc-card-body">
        <div class="svc-card-top">
          ${shiftCodeHtml(svc.startAt, 'is-small') || `<span class="service-card-badge">${escHtml(label)}</span>`}
          <div class="service-card-title">${escHtml(svc.vehicle || 'Dienst')}</div>
          ${running ? '<span class="svc-live"><span class="home-active-pulse"></span>Läuft</span>' : ''}
          ${pendingPlanChange(svc) ? '<span class="dp-chg-badge is-updated">Geändert</span>' : ''}
        </div>
        <div class="service-card-sub">${escHtml([svcWhenText(svc), svc.location].filter(Boolean).join(' · '))}</div>
        ${svc.note ? `<div class="inc-row-note svc-card-note">${ICON_NOTE}<span>${escHtml(svc.note.replace(/\s+/g, ' '))}</span></div>` : ''}
      </div>
      <div class="svc-card-side">
        <span class="svc-card-count${incCount ? '' : ' is-zero'}" title="${incCount} ${incCount === 1 ? 'Einsatz' : 'Einsätze'}">${incCount}</span>
        <span class="svc-card-chev" aria-hidden="true">›</span>
      </div>`;
    card.addEventListener('click', () => { if (!navAnimating) openServiceDetail(svc.id); });
    listEl.appendChild(card);
    enableSwipe(card, {
      edit: () => openServiceDialog(svc.id),
      del: { confirm: () => confirmDeleteService(svc.id), run: () => deleteService(svc.id) },
    });
  });
}

// ── Service Detail ─────────────────────────────────────────────────────────
function isMobile() { return window.matchMedia('(max-width: 700px)').matches; }

function renderServiceDetail() {
  renderServiceDetailContent();
  updateNavBar();
}

function renderServiceDetailContent() {
  const emptyEl = document.getElementById('service-detail-empty');
  const contentEl = document.getElementById('service-detail-content');
  const layout = document.getElementById('dienste-layout');
  if (!selectedServiceId) {
    emptyEl.style.display = '';
    contentEl.style.display = 'none';
    if (layout) layout.classList.remove('detail-open');
    return;
  }
  const svc = state.services.find((s) => s.id === selectedServiceId && !s.isSeg);
  if (!svc) {
    selectedServiceId = null;
    emptyEl.style.display = ''; contentEl.style.display = 'none';
    if (layout) layout.classList.remove('detail-open');
    return;
  }
  if (isMobile() && layout) layout.classList.add('detail-open');
  emptyEl.style.display = 'none';
  contentEl.style.display = '';
  const label = svc.isSeg ? '⚡ SEG' : 'Dienst';
  // Mobile: Zurück-Navigation erfolgt über die Navigationsleiste bzw. Wischgeste
  const backBtn = '';
  const addIncBtn = `<button class="btn-primary" id="btn-add-incident">+ Einsatz</button>`;
  const dpUrl = dienstplanUrl(svc);
  const svcHistKey = historyKeyForService(svc);
  const row = (label, value, cls = '') => `<div class="dv-row ${cls}"><span class="dv-label">${label}</span><span class="dv-value">${value}</span></div>`;
  const crew = (svc.colleagues || []).filter(Boolean);
  const links = [
    dpUrl ? `<a ${dpLinkAttrs(dpUrl)} class="dv-row dv-link">${ICON_CAL}<span class="dv-link-text">Dienstplan</span><span class="dv-link-ext" aria-hidden="true">↗</span></a>` : '',
    svcHistKey ? `<button type="button" class="dv-row dv-link" data-hist="${escHtml(svcHistKey)}">${HIST_ICON}<span class="dv-link-text">Dienstplan-Verlauf</span><span class="dv-value">${readDpHistory()[svcHistKey].entries.length}</span><span class="hm-chev" aria-hidden="true">›</span></button>` : '',
  ].filter(Boolean).join('');
  contentEl.innerHTML = `
    ${backBtn}
    <div class="svc-detail-header">
      <div class="svc-detail-title">
        ${vehicleIconSrc(svc.vehicle) ? `<span class="svc-detail-veh${globalLightsOn ? ' sosi' : ''}" title="${escHtml(svc.vehicle)}"><img src="${escHtml(vehicleIconSrc(svc.vehicle, true))}" alt="" /></span>` : ''}
        <div><h2>${escHtml(svc.vehicle || label)}</h2><div class="svc-detail-sub">${shiftCodeHtml(svc.startAt, 'is-small')}<span>${escHtml(svcWhenText(svc))}</span></div></div>
      </div>
      <button class="btn-secondary dv-edit" id="btn-edit-svc">Bearbeiten</button>
    </div>
    ${planChangeBannerHtml(svc)}
    <div class="dv-group">
      ${svc.abteilung ? row('Abteilung', escHtml(svc.abteilung)) : ''}
      ${row('Dienststelle', escHtml(svc.location || '—'))}
      ${row('Besatzung', crew.length ? crew.map(escHtml).join('<br>') : '<span class="dv-muted">—</span>', 'is-multi')}
      ${svc.note ? row('Notiz', escHtml(svc.note).replace(/\n/g, '<br>'), 'is-multi') : ''}
    </div>
    ${links ? `<div class="dv-group">${links}</div>` : ''}
    <div class="incidents-header">
      <span class="incidents-title">Einsätze (${(svc.incidents || []).length})</span>
      ${addIncBtn}
    </div>
    <div id="incidents-list"></div>
    <div class="dv-group dv-danger-group">
      <button type="button" class="dv-row dv-destructive" id="btn-delete-svc">Dienst löschen</button>
    </div>`;

  if (isMobile()) {
    const backMobile = document.getElementById('btn-back-mobile');
    if (backMobile) backMobile.addEventListener('click', () => {
      selectedServiceId = null;
      if (layout) layout.classList.remove('detail-open');
      renderServiceList();
      renderServiceDetail();
    });
  }
  document.getElementById('btn-edit-svc').addEventListener('click', () => openServiceDialog(svc.id));
  document.getElementById('btn-delete-svc').addEventListener('click', () => {
    if (confirmDeleteService(svc.id)) { deleteService(svc.id); if (isMobile()) updateNavBar(); }
  });
  document.getElementById('btn-add-incident').addEventListener('click', () => openIncidentDialog(svc.id, null));

  const incList = document.getElementById('incidents-list');
  const incs = svc.incidents || [];
  if (!incs.length) {
    incList.innerHTML = '<div class="inc-list-empty">Noch keine Einsätze erfasst.</div>';
    return;
  }
  // Kompakt: Blaulicht, Stichwort, Einsatzart (+ NACA, weitere Einsatzmittel).
  // Alle Details stehen in der Leseansicht.
  incList.innerHTML = `<div class="inc-list">${incidentsNewestFirst(incs).map((inc) => incidentRowHtml(svc, inc)).join('')}</div>`;
  bindIncidentRows(incList);
}

const ICON_VIEW = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.2 15.2 5 5"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19.2 8.8a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.6 6.4 4 4"/></svg>';
const ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8.5L19 8v12a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z"/><path d="M14 3.5V8h4.5M9 12h6M9 15.5h4"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';

function incidentRowHtml(svc, inc) {
  const sub = [];
  if (inc.einsatzart) sub.push(EINSATZART_MAP.get(String(inc.einsatzart)) || `EA ${inc.einsatzart}`);
  if (inc.naca !== null && inc.naca !== undefined && inc.naca !== '') sub.push(`NACA ${inc.naca}`);
  const extra = (inc.extraVehicles || []).length;
  if (extra) sub.push(`+${extra} Einsatzmittel`);
  const ids = `data-svc-id="${escHtml(svc.id)}" data-inc-id="${escHtml(inc.id)}"`;
  const name = escHtml(inc.alarmCode || 'Einsatz');
  return `<div class="inc-row${inc.lights ? ' lights-on' : ''}" ${ids} role="button" tabindex="0" aria-label="${name} ansehen">
    <span class="inc-row-dot" title="${inc.lights ? 'Mit Blaulicht' : 'Ohne Blaulicht'}"></span>
    <div class="inc-row-main">
      <div class="inc-row-title">${inc.favorite ? '<span class="inc-row-fav" title="Favorit">★</span>' : ''}${escHtml(inc.alarmCode || '—')}</div>
      ${sub.length ? `<div class="inc-row-sub">${escHtml(sub.join(' · '))}</div>` : ''}
      ${inc.note ? `<div class="inc-row-note" title="Notiz">${ICON_NOTE}<span>${escHtml(inc.note.replace(/\s+/g, ' '))}</span></div>` : ''}
    </div>
    <div class="inc-row-actions">
      <button type="button" class="inc-act inc-act-view" data-act="view" ${ids} title="Ansehen" aria-label="${name} ansehen">${ICON_VIEW}</button>
      <button type="button" class="inc-act inc-act-edit" data-act="edit" ${ids} title="Bearbeiten" aria-label="${name} bearbeiten">${ICON_EDIT}</button>
      <button type="button" class="inc-act inc-act-del" data-act="delete" ${ids} title="Löschen" aria-label="${name} löschen">${ICON_DELETE}</button>
    </div>
  </div>`;
}

function bindIncidentRows(root) {
  root.querySelectorAll('.inc-row').forEach((row) => {
    const { svcId, incId } = row.dataset;
    enableSwipe(row, {
      edit: () => openIncidentDialog(svcId, incId),
      del: { confirm: () => confirmDeleteIncident(svcId, incId), run: () => deleteIncident(svcId, incId, { skipConfirm: true }) },
    });
  });
  root.querySelectorAll('.inc-row').forEach((row) => {
    const open = () => openIncidentView(row.dataset.svcId, row.dataset.incId);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  root.querySelectorAll('.inc-act').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { svcId, incId, act } = btn.dataset;
      if (act === 'view') openIncidentView(svcId, incId);
      else if (act === 'edit') openIncidentDialog(svcId, incId);
      else if (act === 'delete') deleteIncident(svcId, incId);
    });
  });
}

// ── Einsatz: Leseansicht ───────────────────────────────────────────────────
let incViewRef = null; // { svcId, incId } der gerade angezeigten Leseansicht

function findIncident(svcId, incId) {
  const svc = state.services.find((s) => s.id === svcId);
  const inc = svc ? (svc.incidents || []).find((i) => i.id === incId) : null;
  return { svc, inc };
}

function openIncidentView(svcId, incId) {
  const { svc, inc } = findIncident(svcId, incId);
  if (!svc || !inc) { toast('Einsatz nicht gefunden.', 'error'); return; }
  incViewRef = { svcId, incId };
  renderIncidentView();
  const body = document.getElementById('inc-view-body');
  if (body) body.scrollTop = 0;
  openDialog('dialog-incident-view');
}

function renderIncidentView() {
  if (!incViewRef) return;
  const { svc, inc } = findIncident(incViewRef.svcId, incViewRef.incId);
  const body = document.getElementById('inc-view-body');
  if (!svc || !inc || !body) return;
  document.getElementById('inc-view-title').textContent = svc.isSeg ? 'SEG-Einsatz' : 'Einsatz';

  const missing = '<span class="iv-missing">nicht erfasst</span>';
  const row = (label, valueHtml) => `<div class="iv-row"><span class="iv-label">${label}</span><span class="iv-value">${valueHtml}</span></div>`;
  const group = (title, rows) => rows.filter(Boolean).length
    ? `<div class="iv-group">${title ? `<div class="iv-group-title">${title}</div>` : ''}<div class="iv-card">${rows.filter(Boolean).join('')}</div></div>` : '';

  // Kopf: Fahrzeug-Icon (mit SoSi bei Blaulicht), Stichwort, Blaulicht-Badge
  const catId = svc.vehicle ? (state.vehicleAssignments || {})[svc.vehicle] : null;
  const cat = catId ? (state.vehicleCategories || []).find((c) => c.id === catId) : null;
  const iconSrc = cat && cat.iconNormal ? (inc.lights && cat.iconSoSi ? cat.iconSoSi : cat.iconNormal) : '';
  const hero = `<div class="iv-hero">
    ${iconSrc ? `<img class="iv-hero-icon" src="${escHtml(iconSrc)}" alt="" />` : `<span class="iv-hero-dot${inc.lights ? ' lights' : ''}"></span>`}
    <div class="iv-hero-text">
      <div class="iv-hero-title">${escHtml(inc.alarmCode || '—')}</div>
      <div class="iv-hero-sub">${inc.lights ? '<span class="iv-badge iv-badge-blue">Blaulicht</span>' : '<span class="iv-badge">Ohne Blaulicht</span>'}</div>
    </div>
    <button type="button" id="btn-iv-fav" class="iv-fav${inc.favorite ? ' active' : ''}" aria-pressed="${inc.favorite ? 'true' : 'false'}"
      title="${inc.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}" aria-label="${inc.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">${inc.favorite ? '★' : '☆'}</button>
  </div>`;

  const ea = inc.einsatzart ? escHtml(kennzahlLabel(EINSATZART_MAP, inc.einsatzart)) : missing;
  const kz = inc.statKz ? escHtml(kennzahlLabel(STATKZ_MAP, inc.statKz)) : missing;
  // Weitere Einsatzmittel mit ihren (bei Blaulicht animierten) Icons
  const extra = (inc.extraVehicles || []).length
    ? `<div class="iv-vehicles">${inc.extraVehicles.map((v) => {
        const src = vehicleIconSrc(v, !!inc.lights);
        return `<span class="iv-veh">${src ? `<img src="${escHtml(src)}" alt="" />` : '<span class="iv-veh-noicon">🚑</span>'}<span class="iv-veh-name">${escHtml(v)}</span></span>`;
      }).join('')}</div>`
    : '';

  const p = inc.pzc || {};
  const pzcDx = p.diag ? escHtml(p.diag + (pzcDiagnosis(p.diag) ? ' – ' + pzcDiagnosis(p.diag) : '')) : '';
  const hasNaca = inc.naca !== null && inc.naca !== undefined && inc.naca !== '';
  const naca = hasNaca ? escHtml(`${inc.naca} – ${NACA_LABELS[inc.naca] || ''}`) : missing;

  const svcWhen = formatServiceTimeRange(svc);
  const segDur = (() => { const a = parseLocalDt(svc.startAt), b = parseLocalDt(svc.endAt); return a && b && b > a ? formatDurationMs(b - a) : ''; })();
  const created = inc.createdAt ? new Date(inc.createdAt) : null;
  const createdStr = created && !isNaN(created) ? created.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  body.innerHTML = hero
    + group('Einsatz', [
      row('Einsatzart', ea),
      row('Statistikkennzahl', kz),
    ])
    + (extra ? group('Weitere Einsatzmittel', [extra]) : '')
    + group('Patient', [
      row('PZC', pzcDx || missing),
      p.age && row('Alter', escHtml(p.age)),
      p.prio && row('Priorität', escHtml(PRIO_TEXT[p.prio] || p.prio)),
      row('NACA', naca),
    ])
    + (inc.note ? group('Notiz', [`<div class="iv-note">${escHtml(inc.note)}</div>`]) : '')
    + (svc.isSeg
      ? group('SEG', [
        row('Zeitraum', escHtml(svcWhen || '—')),
        segDur && row('Dauer', escHtml(segDur)),
        svc.location && row('Ort', escHtml(svc.location)),
        svc.vehicle && row('Fahrzeug', escHtml(svc.vehicle)),
        (svc.colleagues || []).length && row('Kolleg:innen', svc.colleagues.map(escHtml).join('<br>')),
      ])
      : group('Dienst', [
        row('Zeitraum', escHtml(svcWhen || '—')),
        svc.vehicle && row('Fahrzeug', escHtml(svc.vehicle)),
        svc.location && row('Dienststelle', escHtml(svc.location)),
        createdStr && row('Erfasst', escHtml(createdStr)),
        `<button type="button" class="iv-jump" id="btn-iv-jump">Dienst öffnen<span aria-hidden="true">›</span></button>`,
      ]));
  const jump = document.getElementById('btn-iv-jump');
  if (jump) jump.onclick = () => {
    closeDialog('dialog-incident-view');
    if (selectedServiceId === svc.id && activeTab === 'dienste') return;
    setTimeout(() => openServiceDetail(svc.id), 280);
  };
  const favBtn = document.getElementById('btn-iv-fav');
  if (favBtn) favBtn.onclick = () => toggleFavorite(svc.id, inc.id);
}

function toggleFavorite(svcId, incId) {
  const { inc } = findIncident(svcId, incId);
  if (!inc) return;
  inc.favorite = !inc.favorite;
  saveState();
  refreshIncidentViews();
  toast(inc.favorite ? 'Zu Favoriten hinzugefügt.' : 'Aus Favoriten entfernt.', 'success', 1600);
}

/** Alle Ansichten neu zeichnen, die Einsätze zeigen. */
function refreshIncidentViews() {
  renderServiceList(); renderServiceDetail();
  if (incViewRef) renderIncidentView();
  if (activeTab === 'favoriten') renderFavorites();
  if (activeTab === 'home') renderHome().catch(() => {});
}

// ── Favoriten (Unterseite des Tagebuchs) ──────────────────────────────────
function favoriteIncidents() {
  const list = [];
  state.services.forEach((svc) => (svc.incidents || []).forEach((inc) => { if (inc.favorite) list.push({ svc, inc }); }));
  return list.sort((a, b) => (b.svc.startAt || '').localeCompare(a.svc.startAt || '')
    || (b.inc.createdAt || '').localeCompare(a.inc.createdAt || ''));
}

/** Öffnet die Detailansicht eines Dienstes (auf dem iPhone mit Push-Animation). */
function openServiceDetail(id) {
  if (!state.services.some((x) => x.id === id && !x.isSeg)) return;
  if (activeTab !== 'dienste') { selectedServiceId = id; switchTab('dienste'); return; }
  const mobile = isMobile();
  if (mobile) {
    const listPanel = document.getElementById('service-list-panel');
    if (listPanel) serviceListScrollTop = listPanel.scrollTop;
  }
  selectedServiceId = id; renderServiceList(); renderServiceDetail();
  if (mobile) {
    const detailPanel = document.getElementById('service-detail-panel');
    if (detailPanel) detailPanel.scrollTop = 0;
    pushAnimated(getBackTarget());
  }
}

/** Alle Einsätze, die zum Suchbegriff passen – neueste zuerst. */
function searchIncidents(q) {
  const hits = [];
  for (const svc of state.services) {
    for (const inc of svc.incidents || []) {
      const ea = inc.einsatzart ? EINSATZART_MAP.get(String(inc.einsatzart)) || '' : '';
      const kz = inc.statKz ? STATKZ_MAP.get(String(inc.statKz)) || '' : '';
      const p = inc.pzc || {};
      const hasNaca = inc.naca !== null && inc.naca !== undefined && inc.naca !== '';
      const fields = [inc.alarmCode, inc.note, ea, kz, p.diag, pzcDiagnosis(p.diag), hasNaca ? `naca ${inc.naca}` : '', (inc.extraVehicles || []).join(' '), svc.isSeg ? svc.location : ''];
      if (fields.some((f) => f && String(f).toLowerCase().includes(q))) hits.push({ svc, inc });
    }
  }
  return hits.sort((a, b) => (b.svc.startAt || '').localeCompare(a.svc.startAt || '') || (b.inc.createdAt || '').localeCompare(a.inc.createdAt || ''));
}

function markMatch(text, q) {
  const t = String(text || '');
  const i = t.toLowerCase().indexOf(q);
  if (!q || i < 0) return escHtml(t);
  return escHtml(t.slice(0, i)) + '<mark>' + escHtml(t.slice(i, i + q.length)) + '</mark>' + escHtml(t.slice(i + q.length));
}

function searchIncidentRowHtml({ svc, inc }, q) {
  const d = parseLocalDt(svc.startAt);
  const day = d ? d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  const ea = inc.einsatzart ? EINSATZART_MAP.get(String(inc.einsatzart)) || '' : '';
  const hasNaca = inc.naca !== null && inc.naca !== undefined && inc.naca !== '';
  const sub = [day, svc.isSeg ? 'SEG' : svc.vehicle, ea, hasNaca ? `NACA ${inc.naca}` : ''].filter(Boolean).join(' · ');
  const noteHit = inc.note && inc.note.toLowerCase().includes(q);
  return `<div class="srch-inc" role="button" tabindex="0" data-svc-id="${escHtml(svc.id)}" data-inc-id="${escHtml(inc.id)}">
    <span class="home-inc-dot ${inc.lights ? 'lights' : 'normal'}"></span>
    <span class="srch-main">
      <span class="srch-title">${inc.favorite ? '<span class="inc-row-fav">★</span>' : ''}${markMatch(inc.alarmCode || 'Einsatz', q)}</span>
      <span class="srch-sub">${markMatch(sub, q)}</span>
      ${noteHit ? `<span class="srch-note">${ICON_NOTE}<span>${markMatch(inc.note.replace(/\s+/g, ' '), q)}</span></span>` : ''}
    </span>
    ${svc.isSeg ? '<span class="hm-chev" aria-hidden="true">›</span>' : `<button type="button" class="srch-svc-btn" aria-label="Zum Dienst" title="Zum Dienst">Dienst<span aria-hidden="true">›</span></button>`}
  </div>`;
}

/** Zuletzt angelegter Einsatz zuerst (Anlagezeit, sonst Reihenfolge der Erfassung). */
function incidentsNewestFirst(list) {
  return (list || []).map((inc, i) => ({ inc, i }))
    .sort((a, b) => (b.inc.createdAt || '').localeCompare(a.inc.createdAt || '') || b.i - a.i)
    .map((x) => x.inc);
}

/** „Mo., 02.11. · 17:30–05:30 (12 h)“ für Listen. */
function svcWhenText(svc) {
  const a = parseLocalDt(svc.startAt), b = parseLocalDt(svc.endAt);
  if (!a) return '';
  const day = a.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  if (!b) return `${day} · ${formatTimeHM(a)}`;
  const h = (b - a) / 3600000;
  return `${day} · ${formatTimeHM(a)}–${formatTimeHM(b)} (${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h)`;
}

function updateFavoritesEntry() {
  const el = document.getElementById('fav-entry-count');
  if (el) el.textContent = String(favoriteIncidents().length);
}

function renderFavorites() {
  const container = document.getElementById('favoriten-container');
  if (!container) return;
  const favs = favoriteIncidents();
  if (!favs.length) {
    container.innerHTML = `<div class="fav-empty">
      <div class="fav-empty-star">☆</div>
      <div class="fav-empty-title">Noch keine Favoriten</div>
      <div class="fav-empty-text">Öffne einen Einsatz und tippe auf den Stern, um ihn hier zu sammeln.</div>
    </div>`;
    return;
  }
  // nach Dienst gruppieren (Reihenfolge: neueste Dienste zuerst)
  const groups = [];
  favs.forEach(({ svc, inc }) => {
    let g = groups.find((x) => x.svc === svc);
    if (!g) { g = { svc, incs: [] }; groups.push(g); }
    g.incs.push(inc);
  });
  container.innerHTML = groups.map(({ svc, incs }) => {
    const d = parseLocalDt(svc.startAt);
    const date = d ? d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const title = [date, svc.isSeg ? 'SEG' : svc.vehicle].filter(Boolean).join(' · ');
    return `<div class="fav-group">
      <div class="iv-group-title">${escHtml(title)}</div>
      <div class="inc-list">${incs.map((inc) => incidentRowHtml(svc, inc)).join('')}</div>
    </div>`;
  }).join('');
  bindIncidentRows(container);
}

function closeIncidentView() {
  incViewRef = null;
  closeDialog('dialog-incident-view');
}

/** Zentrales Löschen (Liste, Leseansicht, Bearbeiten-Dialog). */
function confirmDeleteService(svcId) {
  const svc = state.services.find((s) => s.id === svcId);
  if (!svc) return false;
  const n = (svc.incidents || []).length;
  const d = parseLocalDt(svc.startAt);
  const when = d ? d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  return confirm(`Dienst ${[when, svc.vehicle].filter(Boolean).join(' · ')} wirklich löschen?${n ? `\n\nDabei werden auch ${n} ${n === 1 ? 'Einsatz' : 'Einsätze'} gelöscht.` : ''}`);
}

function deleteService(svcId) {
  state.services = state.services.filter((s) => s.id !== svcId);
  if (selectedServiceId === svcId) selectedServiceId = null;
  saveState();
  refreshIncidentViews();
  toast('Dienst gelöscht.', 'success', 1800);
}

function confirmDeleteIncident(svcId, incId) {
  const { svc, inc } = findIncident(svcId, incId);
  if (!svc || !inc) return false;
  return confirm(`${svc.isSeg ? 'SEG-Einsatz' : 'Einsatz'} „${inc.alarmCode || 'ohne Stichwort'}“ wirklich löschen?`);
}

function deleteIncident(svcId, incId, opts = {}) {
  const { svc, inc } = findIncident(svcId, incId);
  if (!svc || !inc) return false;
  if (!opts.skipConfirm && !confirmDeleteIncident(svcId, incId)) return false;
  if (svc.isSeg) state.services = state.services.filter((s) => s.id !== svc.id);
  else svc.incidents = svc.incidents.filter((i) => i.id !== incId);
  saveState();
  if (incViewRef && incViewRef.incId === incId) closeIncidentView();
  if (incDialogIncidentId === incId) closeDialog('dialog-incident');
  refreshIncidentViews();
  toast('Einsatz gelöscht.', 'success', 1800);
  return true;
}

// ── Service Dialog ─────────────────────────────────────────────────────────
// ── Gemeinsame Formular-Bausteine ──────────────────────────────────────────
/** Icon eines Fahrzeugs (Kategorie-Zuweisung); sosi = animiertes SoSi-Bild. */
function vehicleIconSrc(vehicleName, sosi = false) {
  const catId = vehicleName ? (state.vehicleAssignments || {})[vehicleName] : null;
  const cat = catId ? (state.vehicleCategories || []).find((c) => c.id === catId) : null;
  if (!cat || !cat.iconNormal) return '';
  return sosi && cat.iconSoSi ? cat.iconSoSi : cat.iconNormal;
}

/** Zeigt neben einem Fahrzeug-Feld das zugewiesene Icon (live beim Tippen). */
function bindVehicleIconPreview(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input || !icon) return;
  const update = () => {
    const src = vehicleIconSrc(input.value.trim());
    icon.innerHTML = src ? `<img src="${escHtml(src)}" alt="" />` : '';
    icon.classList.toggle('has-icon', !!src);
  };
  input.oninput = update;
  input.onchange = update;
  update();
}

/**
 * Namens-Chips mit Eingabefeld. Hinzufügen per Enter, Vorschlag oder beim
 * Speichern (commitPending) – nie still beim Verlassen des Feldes.
 */
function setupChipInput({ inputId, tagsId, dropId, list, suggestions }) {
  const input = document.getElementById(inputId);
  const tags = document.getElementById(tagsId);
  const drop = document.getElementById(dropId);
  const render = () => {
    tags.innerHTML = list.map((name, i) => `<span class="chip"><button type="button" class="chip-name" data-idx="${i}" title="Antippen zum Bearbeiten">${escHtml(name)}</button><button type="button" class="chip-del" data-idx="${i}" aria-label="${escHtml(name)} entfernen">✕</button></span>`).join('');
    tags.querySelectorAll('.chip-del').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      list.splice(+b.dataset.idx, 1); render();
    }));
    // Antippen = Namen bearbeiten (egal ob aus Vorschlag oder getippt)
    tags.querySelectorAll('.chip-name').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = +b.dataset.idx;
      const chip = b.closest('.chip');
      const ed = document.createElement('input');
      ed.type = 'text'; ed.className = 'chip-edit'; ed.value = list[i];
      ed.setAttribute('enterkeyhint', 'done'); ed.setAttribute('aria-label', 'Namen bearbeiten');
      ed.size = Math.max(6, list[i].length + 1);
      chip.replaceWith(ed);
      ed.focus(); ed.select();
      let done = false;
      const commit = (save) => {
        if (done) return; done = true;
        const v = ed.value.trim();
        if (save) {
          if (!v) list.splice(i, 1);
          else if (!list.some((x, j) => j !== i && x.toLowerCase() === v.toLowerCase())) list[i] = v;
          else list.splice(i, 1); // Doppelt → zusammenführen
        }
        render();
      };
      ed.addEventListener('input', () => { ed.size = Math.max(6, ed.value.length + 1); });
      ed.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
        if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
      });
      ed.addEventListener('blur', () => commit(true));
    }));
  };
  const add = (raw) => {
    const v = (raw || '').trim();
    if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
    input.value = '';
    render();
  };
  input.value = '';
  mountSuggestions(input, drop, suggestions, 8, true);
  input.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      if (drop.querySelector('.suggestion-item.focused')) return; // Auswahl übernimmt mountSuggestions
      e.preventDefault(); add(input.value);
    } else if (e.key === 'Backspace' && !input.value && list.length) {
      list.pop(); render();
    }
  };
  // Vorschlag angetippt (mountSuggestions löst „change“ aus) → als Chip übernehmen
  input.onchange = (e) => { if (!e.isTrusted) add(input.value); };
  const box = input.closest('.chip-input');
  if (box) box.onclick = (e) => { if (e.target === box || e.target === tags) input.focus(); };
  render();
  return { commitPending: () => { if (input.value.trim()) add(input.value); } };
}

function formatDurationMs(ms) {
  if (!(ms > 0)) return '';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

// ── Dienst-Dialog ──────────────────────────────────────────────────────────
let svcChips = null;

function openServiceDialog(serviceId, prefill = null) {
  svcDialogId = serviceId || null;
  svcDialogDpUid = (!serviceId && prefill && prefill.dpUid) || '';
  const svc = serviceId ? state.services.find((s) => s.id === serviceId) : null;
  document.getElementById('dialog-service-title').textContent = svc ? 'Dienst bearbeiten' : 'Neuer Dienst';
  const startEl = document.getElementById('svc-start');
  const endEl = document.getElementById('svc-end');
  const customEl = document.getElementById('svc-duration-custom');
  startEl.value = svc ? (svc.startAt || '') : (prefill?.start || localDtStr(roundToQuarter(new Date())));
  endEl.value = svc ? (svc.endAt || '') : (prefill?.end || '');
  if (!svc && !prefill?.end) {
    // Neuer Dienst: 12 h als sinnvoller Standard
    const st = parseLocalDt(startEl.value);
    if (st) endEl.value = localDtStr(new Date(st.getTime() + 12 * 3600000));
  }
  document.getElementById('svc-abteilung').value = svc ? (svc.abteilung || '') : (prefill?.abteilung || '');
  document.getElementById('svc-location').value = svc ? (svc.location || '') : (prefill?.location || '');
  document.getElementById('svc-vehicle').value = svc ? (svc.vehicle || '') : (prefill?.vehicle || '');
  document.getElementById('svc-note').value = svc ? (svc.note || '') : '';
  customEl.value = '';
  svcColleagues = svc ? [...(svc.colleagues || [])] : [...(prefill?.colleagues || [])];
  const deleteBtn = document.getElementById('btn-svc-delete');
  if (deleteBtn) deleteBtn.style.display = svc ? '' : 'none';

  // Dauer: Chips setzen das Ende; Beginn verschieben behält die Dauer bei
  let durationMs = (() => {
    const a = parseLocalDt(startEl.value), b = parseLocalDt(endEl.value);
    return a && b && b > a ? b - a : null;
  })();
  const refreshDuration = () => {
    const a = parseLocalDt(startEl.value), b = parseLocalDt(endEl.value);
    durationMs = a && b && b > a ? b - a : null;
    const lbl = document.getElementById('svc-duration-label');
    lbl.textContent = durationMs ? formatDurationMs(durationMs) : (a && b ? 'Ende liegt vor Beginn' : '');
    lbl.classList.toggle('is-invalid', !!(a && b && b <= a));
    document.querySelectorAll('#dialog-service .dur-chip').forEach((c) => {
      c.classList.toggle('active', !!durationMs && Math.abs(durationMs - c.dataset.hours * 3600000) < 60000);
    });
  };
  const setDurationHours = (h) => {
    const a = parseLocalDt(startEl.value);
    if (!a || !(h > 0)) return;
    endEl.value = localDtStr(new Date(a.getTime() + h * 3600000));
    refreshDuration();
  };
  document.querySelectorAll('#dialog-service .dur-chip').forEach((btn) => {
    btn.onclick = () => { customEl.value = ''; setDurationHours(+btn.dataset.hours); };
  });
  customEl.oninput = () => {
    const digits = customEl.value.replace(/[^0-9]/g, '').slice(0, 2);
    if (digits !== customEl.value) customEl.value = digits;
    const h = parseInt(digits, 10);
    if (h > 0) setDurationHours(h);
  };
  startEl.onchange = () => {
    const a = parseLocalDt(startEl.value);
    if (a && durationMs) endEl.value = localDtStr(new Date(a.getTime() + durationMs));
    refreshDuration();
  };
  endEl.onchange = refreshDuration;
  refreshDuration();

  openDialog('dialog-service');

  // Vorschläge nach Häufigkeit
  const abteilungen = [...new Set([
    ...(state.abteilungen || []).map((a) => a.name).filter(Boolean),
    ...rankByFrequency(state.services.map((s) => s.abteilung).filter(Boolean)),
  ])];
  const regular = state.services.filter((s) => !s.isSeg);
  mountSuggestions(document.getElementById('svc-abteilung'), document.getElementById('svc-abteilung-suggestions'), abteilungen, 8, true);
  mountSuggestions(document.getElementById('svc-location'), document.getElementById('svc-location-suggestions'), rankByFrequency(regular.map((s) => s.location).filter(Boolean)), 8, true);
  mountSuggestions(document.getElementById('svc-vehicle'), document.getElementById('svc-vehicle-suggestions'), rankByFrequency(regular.map((s) => s.vehicle).filter(Boolean)), 8, true);
  bindVehicleIconPreview('svc-vehicle', 'svc-vehicle-icon');
  // Dienststelle aus Abteilung übernehmen, solange leer
  document.getElementById('svc-abteilung').onchange = () => {
    const locEl = document.getElementById('svc-location');
    if (!locEl.value.trim()) locEl.value = document.getElementById('svc-abteilung').value.trim();
  };
  svcChips = setupChipInput({
    inputId: 'svc-colleague-input', tagsId: 'svc-colleague-tags', dropId: 'svc-colleague-suggestions',
    list: svcColleagues, suggestions: rankByFrequency(state.services.flatMap((s) => s.colleagues || [])),
  });
}

function roundToQuarter(d) {
  const r = new Date(d);
  r.setMinutes(Math.round(r.getMinutes() / 15) * 15, 0, 0);
  return r;
}

function saveService() {
  const startVal = document.getElementById('svc-start').value;
  const endVal = document.getElementById('svc-end').value;
  if (!startVal) { toast('Bitte Beginn eingeben.', 'error'); return; }
  const a = parseLocalDt(startVal), b = parseLocalDt(endVal);
  if (a && b && b <= a) { toast('Das Ende liegt vor dem Beginn.', 'error'); return; }
  if (svcChips) svcChips.commitPending();
  const data = {
    startAt: startVal, endAt: endVal,
    abteilung: document.getElementById('svc-abteilung').value.trim(),
    location: document.getElementById('svc-location').value.trim(),
    vehicle: document.getElementById('svc-vehicle').value.trim(),
    note: document.getElementById('svc-note').value.trim(),
    colleagues: [...svcColleagues],
  };
  if (svcDialogId) {
    const svc = state.services.find((s) => s.id === svcDialogId);
    if (svc) Object.assign(svc, data);
  } else {
    const svc = { id: uid(), ...data, incidents: [], isSeg: false };
    if (svcDialogDpUid) svc.dpUid = svcDialogDpUid;
    state.services.push(svc);
    selectedServiceId = svc.id; // neuen Dienst gleich öffnen
  }
  saveState(); closeDialog('dialog-service');
  if (activeTab === 'dienste') { renderServiceList(); renderServiceDetail(); if (!svcDialogId && isMobile()) pushAnimated(getBackTarget()); }
  else refreshIncidentViews();
}

// ── Incident Dialog ────────────────────────────────────────────────────────
// ── Einsatz-Dialog (auch für SEG) ──────────────────────────────────────────
// Ein SEG ist ein eigenständiger Einsatz mit Beginn/Ende, Ort und Besatzung –
// intern als Eintrag mit isSeg und genau einem Einsatz gespeichert.
let incDialogSegMode = false;
let segChips = null;

function openIncidentDialog(serviceId, incidentId, opts = {}) {
  const svc = serviceId ? state.services.find((s) => s.id === serviceId) : null;
  const inc = incidentId && svc ? (svc.incidents || []).find((i) => i.id === incidentId) : null;
  incDialogSegMode = !!(opts.newSeg || (svc && svc.isSeg));
  incDialogServiceId = svc ? svc.id : null;
  incDialogIncidentId = inc ? inc.id : null;

  document.getElementById('dialog-incident-title').textContent = incDialogSegMode
    ? (inc ? 'SEG-Einsatz bearbeiten' : 'Neuer SEG-Einsatz')
    : (inc ? 'Einsatz bearbeiten' : 'Neuer Einsatz');

  // SEG-Teil
  const segSection = document.getElementById('inc-seg-section');
  segSection.hidden = !incDialogSegMode;
  if (incDialogSegMode) {
    const now = roundToQuarter(new Date());
    document.getElementById('seg-start').value = svc ? (svc.startAt || '') : localDtStr(now);
    document.getElementById('seg-end').value = svc ? (svc.endAt || '') : '';
    document.getElementById('seg-location').value = svc ? (svc.location || '') : '';
    document.getElementById('seg-vehicle').value = svc ? (svc.vehicle || '') : '';
    segColleagues = svc ? [...(svc.colleagues || [])] : [];
    mountSuggestions(document.getElementById('seg-location'), document.getElementById('seg-location-suggestions'), rankByFrequency(state.services.map((s) => s.location).filter(Boolean)), 8, true);
    mountSuggestions(document.getElementById('seg-vehicle'), document.getElementById('seg-vehicle-suggestions'), rankByFrequency(state.services.map((s) => s.vehicle).filter(Boolean)), 8, true);
    bindVehicleIconPreview('seg-vehicle', 'seg-vehicle-icon');
    const segVeh = document.getElementById('seg-vehicle');
    const prevInput = segVeh.oninput;
    segVeh.oninput = () => { prevInput && prevInput(); updateLightsBtn(); };
    segVeh.onchange = segVeh.oninput;
    segChips = setupChipInput({
      inputId: 'seg-colleague-input', tagsId: 'seg-colleague-tags', dropId: 'seg-colleague-suggestions',
      list: segColleagues, suggestions: rankByFrequency(state.services.flatMap((s) => s.colleagues || [])),
    });
  }

  incLights = inc ? !!inc.lights : false;
  incExtraVehicles = inc ? [...(inc.extraVehicles || [])] : [];
  updateLightsBtn();
  renderIncExtraVehicles();

  document.getElementById('inc-keyword').value = inc ? (inc.alarmCode || '') : '';
  document.getElementById('pzc-diag').value = inc && inc.pzc ? (inc.pzc.diag || '') : '';
  document.getElementById('pzc-age').value = inc && inc.pzc ? (inc.pzc.age || '') : '';
  document.getElementById('pzc-prio').value = inc && inc.pzc ? (inc.pzc.prio || '') : '';
  document.getElementById('inc-note').value = inc ? (inc.note || '') : '';
  setupKennzahlField('einsatzart', EINSATZART_MAP, EINSATZART_CODES, inc ? inc.einsatzart : '');
  setupKennzahlField('statkz', STATKZ_MAP, STATKZ_CODES, inc ? inc.statKz : '');
  setupPzcField();
  setupNacaField(inc && inc.naca !== null && inc.naca !== undefined ? String(inc.naca) : '');

  const deleteBtn = document.getElementById('btn-inc-delete');
  if (deleteBtn) deleteBtn.style.display = inc ? '' : 'none';

  openDialog('dialog-incident');
  const body = document.querySelector('#dialog-incident .dialog-box');
  if (body) body.scrollTop = 0;

  const kwInput = document.getElementById('inc-keyword');
  kwInput._smDecorate = blaulichtDotHtml;
  mountSuggestions(kwInput, document.getElementById('inc-keyword-suggestions'), state.alarmCodes, 10);
  document.getElementById('inc-keyword').onchange = () => {
    const val = document.getElementById('inc-keyword').value.trim();
    const bl = keywordBlaulicht(val);
    if (bl !== undefined && bl !== incLights) { incLights = bl; updateLightsBtn(); }
  };
}

/** Nur Ziffern zulassen (iOS ignoriert keypress-Filter zuverlässig nicht). */
function digitsOnly(el, max, allowed = /[0-9]/) {
  const v = [...el.value].filter((ch) => allowed.test(ch)).join('').slice(0, max);
  if (v !== el.value) el.value = v;
  return v;
}

// ── Kennzahl-Zeile: ID + Suchfeld, das die Bedeutung anzeigt ───────────────
function setupKennzahlField(key, map, codes, value) {
  const idEl = document.getElementById(`inc-${key}`);
  const searchEl = document.getElementById(`inc-${key}-search`);
  const dropEl = document.getElementById(`inc-${key}-suggestions`);
  if (!idEl || !searchEl || !dropEl) return;
  idEl.value = value !== undefined && value !== null ? String(value) : '';
  const showResolved = () => {
    const code = idEl.value.trim();
    const valid = map.has(code);
    idEl.classList.toggle('is-invalid', !!code && !valid);
    searchEl.classList.toggle('is-invalid', !!code && !valid);
    searchEl.classList.toggle('is-resolved', valid);
    if (document.activeElement !== searchEl) searchEl.value = valid ? map.get(code) : '';
    searchEl.placeholder = code && !valid ? 'Unbekannte ID' : 'Suchen…';
  };
  idEl.oninput = () => {
    digitsOnly(idEl, 2);
    // „01“ = Kennzahl 1 – damit lässt sich auch bei 1 vs. 10–17 sofort weiterspringen
    let explicit = false;
    if (/^0\d$/.test(idEl.value) && map.has(idEl.value[1])) { idEl.value = idEl.value[1]; explicit = true; }
    showResolved();
    const code = idEl.value.trim();
    const unambiguous = !codes.some(([c]) => c !== code && c.startsWith(code));
    if (map.has(code) && (explicit || code.length === 2 || unambiguous)) focusNextCodeField(idEl);
  };
  mountSuggestions(searchEl, dropEl, codes.map(([c, l]) => `${c} – ${l}`), 60, true);
  const pick = (code) => { idEl.value = code; searchEl.blur(); dropEl.classList.remove('open'); showResolved(); };
  // Beim Antippen leeren, damit sofort gesucht werden kann; Liste zeigt alles
  searchEl.onfocus = () => { if (searchEl.classList.contains('is-resolved')) searchEl.value = ''; };
  searchEl.onblur = () => setTimeout(showResolved, 160);
  searchEl.onchange = () => {
    const code = searchEl.value.split(' – ')[0].trim();
    if (map.has(code)) pick(code);
  };
  searchEl.onkeydown = (e) => {
    if (e.key !== 'Enter' || dropEl.querySelector('.suggestion-item.focused')) return;
    const q = searchEl.value.trim().toLowerCase();
    if (!q) return;
    const exact = codes.find(([c]) => c === q);
    const hits = codes.filter(([c, l]) => `${c} – ${l}`.toLowerCase().includes(q));
    const hit = exact || (hits.length === 1 ? hits[0] : null);
    if (hit) { e.preventDefault(); pick(hit[0]); }
  };
  showResolved();
}

/** Liest eine Kennzahl aus dem Dialog; null = ungültige Eingabe. */
function readKennzahl(key, map) {
  const code = (document.getElementById(`inc-${key}`).value || '').trim();
  if (!code) return '';
  return map.has(code) ? code : null;
}

// ── PZC: drei ID-Felder + Suche (zeigt die Diagnose) ───────────────────────
function setupPzcField() {
  const diag = document.getElementById('pzc-diag');
  const age = document.getElementById('pzc-age');
  const prio = document.getElementById('pzc-prio');
  const search = document.getElementById('pzc-search');
  const drop = document.getElementById('pzc-search-suggestions');
  const show = () => updatePzcPreview();
  diag.oninput = () => { if (digitsOnly(diag, 3).length === 3) focusField(age); show(); };
  age.oninput = () => { if (digitsOnly(age, 2).length === 2) focusField(prio); show(); };
  prio.oninput = () => { if (digitsOnly(prio, 1, /[1-3]/).length === 1) focusNextCodeField(prio); show(); };
  const items = (state.pzcCodes || []).map((p) => `${p.code} - ${p.diagnosis}`);
  mountSuggestions(search, drop, items, 40, items.length > 0);
  search.onfocus = () => { if (search.classList.contains('is-resolved')) search.value = ''; };
  search.onblur = () => setTimeout(show, 160);
  search.onchange = () => {
    const code = search.value.split(' - ')[0].trim();
    if (code && (state.pzcCodes || []).some((p) => p.code === code)) { diag.value = code; search.blur(); drop.classList.remove('open'); }
    show();
  };
  search.placeholder = items.length ? 'Suchen…' : 'Keine PZC-Liste';
  show();
}

function updatePzcPreview() {
  const diag = document.getElementById('pzc-diag').value.trim();
  const age = document.getElementById('pzc-age').value.trim();
  const prio = document.getElementById('pzc-prio').value.trim();
  const search = document.getElementById('pzc-search');
  const dx = pzcDiagnosis(diag);
  search.classList.toggle('is-resolved', !!dx);
  if (document.activeElement !== search) search.value = dx || '';
  const hint = [];
  if (diag && !dx && (state.pzcCodes || []).length) hint.push(`Diagnose ${diag} nicht in der PZC-Liste`);
  if (age) hint.push(`Alter ${age}`);
  if (prio) hint.push(PRIO_TEXT[prio] || `Prio ${prio}`);
  const el = document.getElementById('pzc-resolution');
  if (el) { el.textContent = hint.join(' · '); el.hidden = !hint.length; }
}

// ── NACA: ID-Feld + Auswahlliste mit dem Text ──────────────────────────────
function setupNacaField(value) {
  const idEl = document.getElementById('naca-score');
  const sel = document.getElementById('naca-select');
  if (!sel.options.length) {
    sel.innerHTML = '<option value="">Auswählen…</option>' + NACA_LABELS.map((l, n) => `<option value="${n}">${n} – ${escHtml(l)}</option>`).join('');
  }
  idEl.value = value;
  const sync = () => {
    const v = idEl.value;
    sel.value = /^[0-7]$/.test(v) ? v : '';
    sel.classList.toggle('is-empty', sel.value === '');
  };
  idEl.oninput = () => { if (digitsOnly(idEl, 1, /[0-7]/).length === 1) focusNextCodeField(idEl); sync(); };
  sel.onchange = () => { idEl.value = sel.value; sync(); };
  sync();
}

/** Setzt den NACA-Wert im Einsatz-Fenster (z. B. aus der Merkhilfe). */
function setNacaValue(n) {
  const idEl = document.getElementById('naca-score');
  const sel = document.getElementById('naca-select');
  if (!idEl || !sel) return;
  idEl.value = String(n); sel.value = String(n); sel.classList.remove('is-empty');
}

function openNacaInfo() {
  const cur = (document.getElementById('naca-score') || {}).value;
  const body = document.getElementById('naca-info-body');
  body.innerHTML = `<p class="naca-info-intro">Antippen übernimmt den Wert in den Einsatz.</p>
    <div class="naca-info-list">${NACA_LABELS.map((label, n) => {
      const h = NACA_HELP[n];
      return `<button type="button" class="naca-info-row${String(n) === cur ? ' is-current' : ''}" data-naca="${n}">
        <span class="naca-badge naca-${n}">${n}</span>
        <span class="naca-info-text">
          <strong>${escHtml(label)}</strong>
          ${h.ex ? `<span class="naca-info-ex">${escHtml(h.ex)}</span>` : ''}
          ${h.tx ? `<span class="naca-info-tx">→ ${escHtml(h.tx)}</span>` : ''}
        </span>
      </button>`;
    }).join('')}</div>`;
  body.querySelectorAll('[data-naca]').forEach((b) => b.addEventListener('click', () => {
    setNacaValue(b.dataset.naca);
    closeDialog('dialog-naca-info');
  }));
  openDialog('dialog-naca-info');
}

// ── Kennzahlen nacheinander eintippen: nach gültiger Eingabe weiterspringen ─
const CODE_FIELD_ORDER = ['inc-einsatzart', 'inc-statkz', 'pzc-diag', 'pzc-age', 'pzc-prio', 'naca-score'];

function focusField(el) {
  if (!el) return;
  // erst nach dem aktuellen Eingabe-Ereignis wechseln (iOS behält die Tastatur)
  setTimeout(() => { el.focus(); try { el.select(); } catch (_) {} }, 0);
}

function focusNextCodeField(from) {
  const i = CODE_FIELD_ORDER.indexOf(from.id);
  if (i < 0) return;
  const next = CODE_FIELD_ORDER[i + 1];
  if (next) focusField(document.getElementById(next));
  else setTimeout(() => from.blur(), 0); // NACA war das letzte Feld → Tastatur zu
}

function saveIncident() {
  const keyword = document.getElementById('inc-keyword').value.trim();
  const note = document.getElementById('inc-note').value.trim();
  const diag = document.getElementById('pzc-diag').value.trim();
  const age = document.getElementById('pzc-age').value.trim();
  const prio = document.getElementById('pzc-prio').value.trim();
  const nacaRaw = document.getElementById('naca-score').value.trim();
  const nacaVal = /^[0-7]$/.test(nacaRaw) ? parseInt(nacaRaw, 10) : null;
  const einsatzart = readKennzahl('einsatzart', EINSATZART_MAP);
  const statKz = readKennzahl('statkz', STATKZ_MAP);
  if (einsatzart === null) { toast('Unbekannte Einsatzart – bitte ID prüfen oder über die Suche wählen.', 'error'); document.getElementById('inc-einsatzart').focus(); return; }
  if (statKz === null) { toast('Unbekannte Statistikkennzahl – bitte ID prüfen oder über die Suche wählen.', 'error'); document.getElementById('inc-statkz').focus(); return; }
  const fields = { alarmCode: keyword, lights: incLights, note, pzc: { diag, age, prio }, naca: nacaVal, einsatzart, statKz, extraVehicles: [...incExtraVehicles] };

  let svc = incDialogServiceId ? state.services.find((s) => s.id === incDialogServiceId) : null;
  if (incDialogSegMode) {
    const startAt = document.getElementById('seg-start').value;
    const endAt = document.getElementById('seg-end').value;
    if (!startAt) { toast('Bitte Beginn des SEG-Einsatzes eingeben.', 'error'); return; }
    const a = parseLocalDt(startAt), b = parseLocalDt(endAt);
    if (a && b && b <= a) { toast('Das Ende liegt vor dem Beginn.', 'error'); return; }
    if (segChips) segChips.commitPending();
    const segData = {
      startAt, endAt,
      location: document.getElementById('seg-location').value.trim(),
      vehicle: document.getElementById('seg-vehicle').value.trim(),
      colleagues: [...segColleagues],
    };
    if (!svc) {
      svc = { id: uid(), ...segData, abteilung: '', note: '', incidents: [], isSeg: true };
      state.services.push(svc);
    } else Object.assign(svc, segData);
  }
  if (!svc) return;
  svc.incidents = svc.incidents || [];
  const inc = incDialogIncidentId ? svc.incidents.find((i) => i.id === incDialogIncidentId) : null;
  if (inc) Object.assign(inc, fields);
  else svc.incidents.push({ id: uid(), createdAt: new Date().toISOString(), favorite: false, ...fields });
  saveState(); closeDialog('dialog-incident');
  refreshIncidentViews();
}

function vehicleIconHtml(vehicleName, showSoSi, cls = '') {
  const catId = vehicleName ? (state.vehicleAssignments || {})[vehicleName] : null;
  const cat = catId ? (state.vehicleCategories || []).find((c) => c.id === catId) : null;
  if (!cat || !cat.iconNormal) return '';
  if (showSoSi && cat.iconSoSi) {
    return `<img class="veh-icon ${cls}" src="${escHtml(cat.iconSoSi)}" alt="" />`;
  }
  return `<img class="veh-icon ${cls}" src="${escHtml(cat.iconNormal)}" alt="" />`;
}

function updateLightsBtn() {
  const btn = document.getElementById('btn-lights');
  if (!btn) return;
  if (incLights) btn.classList.add('active'); else btn.classList.remove('active');
  btn.setAttribute('aria-pressed', String(!!incLights));
  const cap = document.getElementById('lights-caption');
  if (cap) cap.textContent = incLights ? 'Mit Blaulicht' : 'Ohne Blaulicht';

  // Re-render extra vehicle chips so their icons swap too
  renderIncExtraVehicles();

  // Show vehicle icon in the button instead of SVG
  const svc = incDialogServiceId ? state.services.find((s) => s.id === incDialogServiceId) : null;
  const vName = incDialogSegMode ? document.getElementById('seg-vehicle').value.trim() : (svc ? svc.vehicle : null);
  const catId = vName ? (state.vehicleAssignments || {})[vName] : null;
  const cat = catId ? (state.vehicleCategories || []).find((c) => c.id === catId) : null;
  const iconEl = document.getElementById('lights-icon');
  if (iconEl) {
    if (cat && cat.iconNormal) {
      const src = (incLights && cat.iconSoSi) ? cat.iconSoSi : cat.iconNormal;
      iconEl.innerHTML = `<img src="${escHtml(src)}" class="lights-btn-veh-icon" alt="" />`;
    } else {
      // Fallback to original SVG if no vehicle icon assigned
      iconEl.innerHTML = incLights ? LIGHTS_ON_SVG : LIGHTS_OFF_SVG;
    }
  }
}

function renderIncExtraVehicles() {
  const row = document.getElementById('einsatzmittel-row');
  const addBtn = document.getElementById('btn-add-extra-vehicle');
  if (!row || !addBtn) return;

  row.querySelectorAll('.extra-vehicle-chip').forEach((el) => el.remove());

  incExtraVehicles.forEach((vName, i) => {
    const catId = (state.vehicleAssignments || {})[vName];
    const cat = catId ? (state.vehicleCategories || []).find((c) => c.id === catId) : null;
    const chip = document.createElement('button');
    chip.className = 'extra-vehicle-chip btn-lights';
    chip.title = `${vName} entfernen`;
    chip.type = 'button';

    const src = cat && cat.iconNormal
      ? (incLights && cat.iconSoSi ? cat.iconSoSi : cat.iconNormal)
      : null;
    chip.innerHTML = src
      ? `<img src="${escHtml(src)}" class="lights-btn-veh-icon" alt="" /><span class="extra-veh-label">${escHtml(vName)}</span>`
      : `<span class="extra-veh-label extra-veh-label-text">${escHtml(vName)}</span>`;

    chip.addEventListener('click', () => {
      incExtraVehicles.splice(i, 1);
      renderIncExtraVehicles();
    });
    row.insertBefore(chip, addBtn);
  });
}

function activateAddVehicleInput() {
  const addBtn = document.getElementById('btn-add-extra-vehicle');
  if (!addBtn) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'extra-vehicle-inline-input';
  input.placeholder = 'z.B. FR, FW …';
  input.autocomplete = 'off';

  addBtn.replaceWith(input);
  input.focus();

  const commit = () => {
    const raw = input.value.trim();
    if (raw) {
      // Case-insensitive dedup: if name exists (any case), skip
      const lower = raw.toLowerCase();
      const exists = incExtraVehicles.some((v) => v.toLowerCase() === lower);
      if (!exists) {
        // Try to reuse existing name with matching case from assignments
        const existing = Object.keys(state.vehicleAssignments || {}).find((k) => k.toLowerCase() === lower);
        const name = existing || raw;
        incExtraVehicles.push(name);
        if (!state.vehicleAssignments) state.vehicleAssignments = {};
        if (!(name in state.vehicleAssignments)) state.vehicleAssignments[name] = null;
        saveState();
      }
    }
    // Restore the + button
    const newBtn = document.createElement('button');
    newBtn.id = 'btn-add-extra-vehicle';
    newBtn.className = 'btn-add-vehicle';
    newBtn.title = 'Weiteres Fahrzeug hinzufügen';
    newBtn.type = 'button';
    newBtn.textContent = '＋';
    newBtn.addEventListener('click', activateAddVehicleInput);
    input.replaceWith(newBtn);
    renderIncExtraVehicles();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });
}

function addExtraVehicle() {
  activateAddVehicleInput();
}


// ── Stats helpers ──────────────────────────────────────────────────────────
const PIE_COLORS = ['#e05252','#e08840','#c8a800','#5baa5b','#3ea8cc','#7766dd','#cc55aa','#888'];

function renderPieSvg(items) {
  if (!items.length) return '<div class="pie-empty">Keine Daten</div>';
  const total = items.reduce((s, [, n]) => s + n, 0);
  const cx = 60, cy = 60, r = 52, inner = 26;
  let angle = -Math.PI / 2;
  let paths = '';
  items.forEach(([label, count], i) => {
    const sweep = (count / total) * 2 * Math.PI;
    const safeSwp = Math.min(sweep, 2 * Math.PI - 0.001);
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + safeSwp), y2 = cy + r * Math.sin(angle + safeSwp);
    const ix1 = cx + inner * Math.cos(angle + safeSwp), iy1 = cy + inner * Math.sin(angle + safeSwp);
    const ix2 = cx + inner * Math.cos(angle), iy2 = cy + inner * Math.sin(angle);
    const large = safeSwp > Math.PI ? 1 : 0;
    const c = PIE_COLORS[i % PIE_COLORS.length];
    paths += `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r},0,${large},1,${x2.toFixed(1)},${y2.toFixed(1)} L${ix1.toFixed(1)},${iy1.toFixed(1)} A${inner},${inner},0,${large},0,${ix2.toFixed(1)},${iy2.toFixed(1)} Z" fill="${c}"><title>${escHtml(String(label))}: ${count}</title></path>`;
    angle += sweep;
  });
  const legend = items.map(([label, count], i) =>
    `<div class="pie-legend-item"><span class="pie-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span><span class="pie-lbl">${escHtml(String(label))}</span><span class="pie-cnt">${Math.round(count/total*100)}%</span></div>`
  ).join('');
  return `<div class="pie-wrap"><svg viewBox="0 0 120 120" class="pie-svg">${paths}</svg><div class="pie-legend">${legend}</div></div>`;
}

function showListPopup(title, items) {
  const max = items.length ? items[0][1] : 1;
  const rows = items.map(([label, count], i) => `
    <li class="rank-item">
      <span class="rank-num">${i + 1}.</span>
      <span class="rank-label">${escHtml(String(label))}</span>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.round(count/max*100)}%"></div></div>
      <span class="rank-count">${count}</span>
    </li>`).join('');
  const ov = document.createElement('div');
  ov.className = 'dialog-overlay';
  ov.style.zIndex = '2000';
  ov.innerHTML = `<div class="dialog-box" style="max-height:80vh;display:flex;flex-direction:column">
    <div class="dialog-header"><h3>${escHtml(title)}</h3><button class="dialog-close">✕</button></div>
    <div class="dialog-body" style="overflow-y:auto"><ul class="rank-list">${rows}</ul></div>
  </div>`;
  ov.querySelector('.dialog-close').addEventListener('click', () => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ── Stats ──────────────────────────────────────────────────────────────────
function renderStats() {
  const container = document.getElementById('stats-container');
  if (!container) return;
  
  let fromD = statsFromDate ? parseLocalDt(statsFromDate + 'T00:00') : null;
  let toD = statsToDate ? parseLocalDt(statsToDate + 'T23:59') : null;

  const filteredSvcs = state.services.filter((svc) => {
    const start = parseLocalDt(svc.startAt);
    if (!start) return true;
    if (fromD && start < fromD) return false;
    if (toD && start > toD) return false;
    if (statsVehicles.length > 0 && !statsVehicles.includes(svc.vehicle || '')) return false;
    if (statsLocations.length > 0 && !statsLocations.includes(svc.location || '')) return false;
    if (statsColleagues.length > 0 && !statsColleagues.some((c) => (svc.colleagues || []).some((col) => col.toLowerCase().includes(c.toLowerCase())))) return false;
    return true;
  });

  // Incident-level filters applied after service filter
  const incFilter = (inc) => {
    if (statsKeywords.length > 0 && !statsKeywords.some((k) => (inc.alarmCode || '').toLowerCase().includes(k.toLowerCase()))) return false;
    if (statsPzcs.length > 0 && !statsPzcs.includes(inc.pzc?.diag || '')) return false;
    if (statsNacaValues.length > 0 && !statsNacaValues.includes(String(inc.naca))) return false;
    if (statsEinsatzarten.length > 0 && !statsEinsatzarten.includes(String(inc.einsatzart || ''))) return false;
    if (statsStatKz.length > 0 && !statsStatKz.includes(String(inc.statKz || ''))) return false;
    return true;
  };

  const allInc = filteredSvcs.flatMap((s) => s.incidents || []).filter(incFilter);
  const totalInc = allInc.length;
  const nonSegSvcs = filteredSvcs.filter((s) => !s.isSeg);
  const totalSvcs = nonSegSvcs.length;
  const segInc = filteredSvcs.filter((s) => s.isSeg).flatMap((s) => s.incidents || []).filter(incFilter).length;
  const totalHours = nonSegSvcs.reduce((sum, s) => sum + +serviceDurationHours(s), 0);
  // SEG-Einsätze zählen als Einsatz, aber nicht in „Ø Einsätze pro Dienst“
  const avgInc = totalSvcs ? ((totalInc - segInc) / totalSvcs).toFixed(1) : '0';
  const lightsCount = allInc.filter((i) => i.lights).length;
  const blaulichtQuote = totalInc ? Math.round((lightsCount / totalInc) * 100) + '%' : '-';

  // Rankings (full lists for popup; top-5 shown inline)
  function rankBy(arr, key) {
    const map = {};
    arr.forEach((item) => { const k = item[key] || '-'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }
  const allAlarm = rankBy(allInc, 'alarmCode');
  const allVehicle = rankBy(filteredSvcs, 'vehicle');
  const allLocation = rankBy(filteredSvcs, 'location');
  const allColleagues = (() => {
    const map = {};
    filteredSvcs.forEach((s) => (s.colleagues || []).forEach((c) => { map[c] = (map[c] || 0) + 1; }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  })();
  const allPzc = (() => {
    const map = {};
    allInc.forEach((i) => { const c = i.pzc && i.pzc.diag ? i.pzc.diag : null; if (c) map[c] = (map[c] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([code, n]) => [code + (pzcDiagnosis(code) ? ' - ' + pzcDiagnosis(code) : ''), n]);
  })();
  const pzcFilled = allInc.filter((i) => i.pzc && i.pzc.diag).length;
  const rankKennzahl = (field, map) => {
    const m = {};
    allInc.forEach((i) => { const c = i[field]; if (c) m[c] = (m[c] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([c, n]) => [kennzahlLabel(map, c), n]);
  };
  const allEinsatzart = rankKennzahl('einsatzart', EINSATZART_MAP);
  const allStatKz = rankKennzahl('statKz', STATKZ_MAP);
  const eaFilled = allInc.filter((i) => i.einsatzart).length;
  const kzFilled = allInc.filter((i) => i.statKz).length;

  function renderRankList(items, limit) {
    const shown = limit ? items.slice(0, limit) : items;
    if (!shown.length) return '<li class="rank-item"><span style="color:var(--text3)">Keine Daten</span></li>';
    const max = shown[0][1];
    return shown.map(([label, count], i) => `
      <li class="rank-item">
        <span class="rank-num">${i + 1}.</span>
        <span class="rank-label">${escHtml(String(label))}</span>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.round((count / max) * 100)}%"></div></div>
        <span class="rank-count">${count}</span>
      </li>`).join('');
  }

  // Ø Patientenalter aus dem Altersteil des PZC (zweistellig, „00“ = unter 1 Jahr)
  const ages = allInc.map((i) => (i.pzc && i.pzc.age !== undefined ? String(i.pzc.age).trim() : ''))
    .filter((a) => /^\d{1,3}$/.test(a)).map(Number);
  const avgAge = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
  const ageInfo = ages.length
    ? `<div class="naca-avg stats-age">Ø Patientenalter: <strong>${avgAge} Jahre</strong><span class="stats-age-range">${Math.min(...ages)}–${Math.max(...ages)} J. · ${ages.length} ${ages.length === 1 ? 'Einsatz' : 'Einsätze'}</span></div>`
    : '<div class="naca-avg stats-age">Ø Patientenalter: <strong>—</strong><span class="stats-age-range">kein Alter im PZC erfasst</span></div>';

  function statsCard(title, allItems, withPie, meta, footerHtml = '') {
    const total = allItems.length;
    const moreBtn = total > 5 ? `<button class="btn-show-all" data-title="${escHtml(title)}">Alle (${total})</button>` : '';
    const pie = withPie && allItems.length > 0 ? renderPieSvg(allItems.slice(0, 8)) : '';
    const metaHtml = meta ? `<span class="stats-coverage">${escHtml(meta)}</span>` : '';
    return `<div class="stats-rank-section">
      <div class="stats-section-head"><h4>${escHtml(title)}</h4><div class="stats-head-right">${metaHtml}${moreBtn}</div></div>
      <ul class="rank-list">${renderRankList(allItems, 5)}</ul>
      ${pie}
      ${footerHtml}
    </div>`;
  }

  function nacaSection() {
    const filled = allInc.filter((i) => i.naca !== null && i.naca !== undefined && i.naca !== '').length;
    const counts = Array(8).fill(0);
    let sum = 0;
    allInc.forEach((i) => {
      const n = parseInt(i.naca, 10);
      if (!isNaN(n) && n >= 0 && n <= 7) { counts[n]++; sum += n; }
    });
    const maxCount = Math.max(...counts, 1);
    const avg = filled ? Math.round(sum / filled) : null;
    const items = counts.map((count, n) => {
      const pct = Math.round(count / maxCount * 100);
      return `<li class="rank-item">
        <span class="rank-num">${n}</span>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%"></div></div>
        <span class="rank-label">${escHtml(NACA_LABELS[n])}</span>
        <span class="rank-count">${count || ''}</span>
      </li>`;
    }).join('');
    return `<div class="stats-rank-section">
      <div class="stats-section-head">
        <h4>NACA-Skala</h4>
        <span class="stats-coverage">${filled}/${totalInc} Einsätze</span>
      </div>
      <ul class="rank-list">${items}</ul>
      ${avg !== null ? `<div class="naca-avg">Ø NACA: <strong>${avg}</strong></div>` : ''}
    </div>`;
  }

  const activeFilterCount = (statsFromDate ? 1 : 0) + (statsToDate ? 1 : 0) +
    statsVehicles.length + statsLocations.length + statsColleagues.length +
    statsKeywords.length + statsPzcs.length + statsNacaValues.length +
    statsEinsatzarten.length + statsStatKz.length;

  container.innerHTML = `
    <div class="stats-filter-bar">
      <button class="stats-filter-bar-btn" id="btn-open-stats-filter">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="sf-icon"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg> Filter${activeFilterCount > 0 ? ` <span class="stats-filter-bar-badge">${activeFilterCount}</span>` : ''}
      </button>
      ${activeFilterCount > 0 ? `<button class="stats-filter-bar-reset" id="btn-stats-reset" title="Filter zurücksetzen">✕ Zurücksetzen</button>` : ''}
    </div>
    <div class="stats-facts">
      <div class="fact-tile"><div class="fact-tile-value">${totalInc}</div><div class="fact-tile-label">Einsätze${segInc ? ` <span class="fact-tile-sub">· ${segInc} SEG</span>` : ''}</div></div>
      <div class="fact-tile"><div class="fact-tile-value">${totalSvcs}</div><div class="fact-tile-label">Dienste</div></div>
      <div class="fact-tile"><div class="fact-tile-value">${Math.round(totalHours)}</div><div class="fact-tile-label">Stunden</div></div>
      <div class="fact-tile"><div class="fact-tile-value">${String(avgInc).replace('.', ',')}</div><div class="fact-tile-label">Ø pro Dienst</div></div>
      <div class="fact-tile"><div class="fact-tile-value">${blaulichtQuote}</div><div class="fact-tile-label">Blaulicht</div></div>
      <div class="fact-tile"><div class="fact-tile-value">${avgAge !== null ? avgAge : '—'}</div><div class="fact-tile-label">Ø Alter</div></div>
    </div>
    <div class="stats-grid">
      ${statsCard('Top Einsätze', allAlarm, true)}
      ${statsCard('Top Kolleg:innen', allColleagues, true)}
      ${statsCard('Top Fahrzeug', allVehicle, true)}
      ${statsCard('Top Dienststelle', allLocation, true)}
      <div class="stats-group-title">Kennzahlen &amp; Patient</div>
      ${statsCard('Einsatzart', allEinsatzart, true, `${eaFilled}/${totalInc} Einsätze`)}
      ${statsCard('Statistikkennzahl', allStatKz, true, `${kzFilled}/${totalInc} Einsätze`)}
      ${statsCard('Top PZC', allPzc, false, `${pzcFilled}/${totalInc} Einsätze`, ageInfo)}
      ${nacaSection()}
    </div>
    <div id="heatmap-section">
      <div id="heatmap-header">
        <span class="section-title">Aktivität</span>
        <div id="heatmap-year-nav"></div>
      </div>
      <div id="heatmap-body">
        <div id="heatmap-container"></div>
        <div class="heatmap-legend">
          <div class="hm-legend-item"><span class="heatmap-cell hm-none"></span>Kein Dienst</div>
          <div class="hm-legend-item"><span class="heatmap-cell hm-empty"></span>Dienst, 0 Einsätze</div>
          <div class="hm-legend-item"><span class="heatmap-cell hm-1"></span>1–2 Einsätze</div>
          <div class="hm-legend-item"><span class="heatmap-cell hm-2"></span>3–4 Einsätze</div>
          <div class="hm-legend-item"><span class="heatmap-cell hm-3"></span>5–6 Einsätze</div>
          <div class="hm-legend-item"><span class="heatmap-cell hm-4"></span>7–8 Einsätze</div>
          <div class="hm-legend-item"><span class="heatmap-cell hm-5"></span>9–10 Einsätze</div>
          <div class="hm-legend-item"><span class="heatmap-cell hm-6"></span>11+ Einsätze</div>
        </div>
      </div>
    </div>`;

  // Build popup data map keyed by title
  const popupData = {
    'Top Einsätze': allAlarm,
    'Top PZC': allPzc,
    'Einsatzart': allEinsatzart,
    'Statistikkennzahl': allStatKz,
    'Top Kolleg:innen': allColleagues,
    'Top Fahrzeug': allVehicle,
    'Top Dienststelle': allLocation,
  };
  container.querySelectorAll('.btn-show-all').forEach((btn) => {
    btn.addEventListener('click', () => showListPopup(btn.dataset.title, popupData[btn.dataset.title] || []));
  });

  document.getElementById('btn-open-stats-filter').addEventListener('click', () => {
    openStatsFilterPopup();
  });
  const resetBtn = document.getElementById('btn-stats-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      statsFromDate = null; statsToDate = null;
      statsVehicles = []; statsLocations = []; statsColleagues = [];
      statsKeywords = []; statsPzcs = []; statsNacaValues = [];
      statsEinsatzarten = []; statsStatKz = [];
      renderStats();
    });
  }

  renderHeatmap(heatmapYear);
}

// ── Stats filter popup ─────────────────────────────────────────────────────
function openStatsFilterPopup() {
  const dlg = document.getElementById('dialog-stats-filter');
  if (!dlg) return;

  const allVehicleOpts = [...new Set(state.services.map((s) => s.vehicle).filter(Boolean))].sort();
  const allLocationOpts = [...new Set(state.services.map((s) => s.location).filter(Boolean))].sort();
  const allColleagueOpts = [...new Set(state.services.flatMap((s) => s.colleagues || []).filter(Boolean))].sort();
  const allKeywordOpts = [...new Set(state.services.flatMap((s) => (s.incidents || []).map((i) => i.alarmCode).filter(Boolean)))].sort();
  const allPzcOpts = [...new Set(state.services.flatMap((s) => (s.incidents || []).map((i) => i.pzc?.diag).filter(Boolean)))].sort();

  function chipHtml(opts, selected, name) {
    if (!opts.length) return '<span class="sf-no-opts">Keine Einträge</span>';
    return opts.map((v) => `<button type="button" class="sf-chip${selected.includes(v) ? ' active' : ''}" data-group="${name}" data-val="${escHtml(v)}">${escHtml(v)}</button>`).join('');
  }

  // Kennzahl-Chips: nur Werte, die in den Daten vorkommen
  function kennzahlChipsHtml(field, map, selected, group) {
    const used = [...new Set(state.services.flatMap((s) => (s.incidents || []).map((i) => i[field]).filter(Boolean).map(String)))]
      .sort((a, b) => Number(a) - Number(b));
    if (!used.length) return '<span class="sf-no-opts">Noch nicht erfasst</span>';
    return used.map((c) => `<button type="button" class="sf-chip${selected.includes(c) ? ' active' : ''}" data-group="${group}" data-val="${escHtml(c)}" title="${escHtml(kennzahlLabel(map, c))}">${escHtml(kennzahlLabel(map, c))}</button>`).join('');
  }

  function nacaChipsHtml() {
    return [0,1,2,3,4,5,6,7].map((n) =>
      `<button type="button" class="sf-chip sf-naca-chip${statsNacaValues.includes(String(n)) ? ' active' : ''}" data-group="naca" data-val="${n}" title="${escHtml(NACA_LABELS[n])}">${n}</button>`
    ).join('');
  }

  function tagInputHtml(id, label) {
    return `<div class="sf-tag-input-row">
      <div class="sf-suggestion-wrap">
        <input type="text" id="${id}" class="sf-tag-input" placeholder="${label}…" autocomplete="off" />
        <div id="${id}-drop" class="suggestions-dropdown"></div>
      </div>
      <button type="button" class="sf-tag-add-btn" data-for="${id}">＋</button>
    </div>`;
  }

  function tagsHtml(arr, group) {
    return `<div class="sf-tag-list" data-group="${group}">${arr.map((v) => `<span class="sf-tag">${escHtml(v)}<button type="button" class="sf-tag-del" data-group="${group}" data-val="${escHtml(v)}">×</button></span>`).join('')}</div>`;
  }

  const body = dlg.querySelector('.dialog-body');
  body.innerHTML = `
    <div class="sf-section">
      <div class="sf-section-title">Zeitraum</div>
      <div class="sf-date-row">
        <label>Von<input type="date" id="sf-from" value="${statsFromDate || ''}"></label>
        <label>Bis<input type="date" id="sf-to" value="${statsToDate || ''}"></label>
      </div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title">Fahrzeug</div>
      <div class="sf-chip-group">${chipHtml(allVehicleOpts, statsVehicles, 'vehicles')}</div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title">Dienststelle</div>
      <div class="sf-chip-group">${chipHtml(allLocationOpts, statsLocations, 'locations')}</div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title">Kolleg:innen</div>
      ${tagInputHtml('sf-colleague', 'Name')}
      ${tagsHtml(statsColleagues, 'colleagues')}
    </div>
    <div class="sf-section">
      <div class="sf-section-title">Einsatzstichwort</div>
      ${tagInputHtml('sf-keyword', 'Stichwort')}
      ${tagsHtml(statsKeywords, 'keywords')}
    </div>
    <div class="sf-section">
      <div class="sf-section-title">PZC</div>
      ${tagInputHtml('sf-pzc', 'PZC-Code')}
      ${tagsHtml(statsPzcs, 'pzcs')}
    </div>
    <div class="sf-section">
      <div class="sf-section-title">NACA-Score</div>
      <div class="sf-chip-group">${nacaChipsHtml()}</div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title">Einsatzart</div>
      <div class="sf-chip-group">${kennzahlChipsHtml('einsatzart', EINSATZART_MAP, statsEinsatzarten, 'einsatzart')}</div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title">Statistikkennzahl</div>
      <div class="sf-chip-group">${kennzahlChipsHtml('statKz', STATKZ_MAP, statsStatKz, 'statkz')}</div>
    </div>`;

  // Temp state (deep copy, apply on confirm)
  let tmpVehicles = [...statsVehicles];
  let tmpLocations = [...statsLocations];
  let tmpColleagues = [...statsColleagues];
  let tmpKeywords = [...statsKeywords];
  let tmpPzcs = [...statsPzcs];
  let tmpNaca = [...statsNacaValues];
  let tmpEinsatzart = [...statsEinsatzarten];
  let tmpStatKz = [...statsStatKz];

  function syncGroup(group) {
    const map = { vehicles: tmpVehicles, locations: tmpLocations, colleagues: tmpColleagues, keywords: tmpKeywords, pzcs: tmpPzcs, naca: tmpNaca, einsatzart: tmpEinsatzart, statkz: tmpStatKz };
    const arr = map[group];
    const tagList = body.querySelector(`.sf-tag-list[data-group="${group}"]`);
    if (tagList) tagList.innerHTML = arr.map((v) => `<span class="sf-tag">${escHtml(v)}<button type="button" class="sf-tag-del" data-group="${group}" data-val="${escHtml(v)}">×</button></span>`).join('');
    body.querySelectorAll(`.sf-chip[data-group="${group}"]`).forEach((c) => {
      c.classList.toggle('active', arr.includes(c.dataset.val));
    });
    bindTagDels();
  }

  function bindTagDels() {
    body.querySelectorAll('.sf-tag-del').forEach((btn) => {
      btn.onclick = () => {
        const map = { vehicles: tmpVehicles, locations: tmpLocations, colleagues: tmpColleagues, keywords: tmpKeywords, pzcs: tmpPzcs, naca: tmpNaca, einsatzart: tmpEinsatzart, statkz: tmpStatKz };
        const arr = map[btn.dataset.group];
        const idx = arr.indexOf(btn.dataset.val);
        if (idx >= 0) arr.splice(idx, 1);
        syncGroup(btn.dataset.group);
      };
    });
  }
  bindTagDels();

  // All chip clicks (vehicles, locations, naca)
  body.addEventListener('click', (e) => {
    const chip = e.target.closest('.sf-chip');
    if (!chip) return;
    const group = chip.dataset.group;
    const val = chip.dataset.val;
    const map = { vehicles: tmpVehicles, locations: tmpLocations, naca: tmpNaca, einsatzart: tmpEinsatzart, statkz: tmpStatKz };
    const arr = map[group];
    if (!arr) return;
    const idx = arr.indexOf(val);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(val);
    syncGroup(group);
  });

  // Custom suggestion dropdowns for text inputs
  const sfDropConfig = [
    { id: 'sf-colleague', opts: allColleagueOpts, arr: () => tmpColleagues, group: 'colleagues' },
    { id: 'sf-keyword', opts: allKeywordOpts, arr: () => tmpKeywords, group: 'keywords' },
    { id: 'sf-pzc', opts: allPzcOpts, arr: () => tmpPzcs, group: 'pzcs' },
  ];

  function addTag(id, arr, group) {
    const input = body.querySelector(`#${id}`);
    if (!input) return;
    const val = input.value.trim();
    if (!val || arr.includes(val)) { input.value = ''; const drop = body.querySelector(`#${id}-drop`); if (drop) drop.classList.remove('open'); return; }
    arr.push(val);
    input.value = '';
    const drop = body.querySelector(`#${id}-drop`); if (drop) drop.classList.remove('open');
    syncGroup(group);
  }

  sfDropConfig.forEach(({ id, opts, arr, group }) => {
    const inputEl = body.querySelector(`#${id}`);
    const dropEl = body.querySelector(`#${id}-drop`);
    if (!inputEl || !dropEl) return;
    mountSuggestions(inputEl, dropEl, opts, 8, true);
    // Override select behavior to add as tag instead of filling input
    inputEl.addEventListener('change', (e) => {
      if (!e.isTrusted) return; // only from mountSuggestions mousedown
      const val = inputEl.value.trim();
      if (val && !arr().includes(val)) { arr().push(val); inputEl.value = ''; dropEl.classList.remove('open'); syncGroup(group); }
    });
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addTag(id, arr(), group); }
    };
  });

  body.querySelectorAll('.sf-tag-add-btn').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.for;
      const cfg = sfDropConfig.find((c) => c.id === id);
      if (cfg) addTag(id, cfg.arr(), cfg.group);
    };
  });

  // Apply button
  dlg.querySelector('#btn-sf-apply').onclick = () => {
    statsFromDate = body.querySelector('#sf-from').value || null;
    statsToDate = body.querySelector('#sf-to').value || null;
    statsVehicles = [...tmpVehicles];
    statsLocations = [...tmpLocations];
    statsColleagues = [...tmpColleagues];
    statsKeywords = [...tmpKeywords];
    statsPzcs = [...tmpPzcs];
    statsNacaValues = [...tmpNaca];
    statsEinsatzarten = [...tmpEinsatzart];
    statsStatKz = [...tmpStatKz];
    dlg.style.display = 'none';
    renderStats();
  };

  dlg.style.display = 'flex';
}

// ── Heatmap ────────────────────────────────────────────────────────────────
function renderHeatmap(year) {
  heatmapYear = year;
  const nav = document.getElementById('heatmap-year-nav');
  const container = document.getElementById('heatmap-container');
  if (!nav || !container) return;

  // Collect all years from ALL services (unfiltered)
  const years = [...new Set(state.services.map((s) => { const d = parseLocalDt(s.startAt); return d ? d.getFullYear() : null; }).filter(Boolean))];
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);

  nav.innerHTML = years.map((y) =>
    `<button class="heatmap-year-btn${y === year ? ' active' : ''}" data-year="${y}">${y}</button>`
  ).join('');
  nav.querySelectorAll('.heatmap-year-btn').forEach((btn) => {
    btn.addEventListener('click', () => renderHeatmap(+btn.dataset.year));
  });

  // Build day map from ALL services (unfiltered by stats date filter)
  const dayMap = {}; // "YYYY-MM-DD" -> { count, hasService, hours }
  state.services.forEach((svc) => {
    const d = parseLocalDt(svc.startAt);
    if (!d || d.getFullYear() !== year) return;
    const key = localDateStr(d);
    if (!dayMap[key]) dayMap[key] = { count: 0, hasService: false, hours: 0 };
    dayMap[key].count += (svc.incidents || []).length;
    if (!svc.isSeg) {                       // SEG zählt nur als Einsatz
      dayMap[key].hasService = true;
      dayMap[key].hours += +serviceDurationHours(svc);
    }
  });

  // Build week summary map: weekStart (Mon) -> { hours, incidents }
  const weekMap = {}; // weekStart ISO string -> { hours, incidents }

  // Build grid: Jan 1 to Dec 31
  const startDay = new Date(year, 0, 1);
  const endDay = new Date(year, 11, 31);
  
  // Pad to start of week (Mon=0)
  const startDow = (startDay.getDay() + 6) % 7; // 0=Mon
  const gridStart = new Date(startDay.getTime() - startDow * 86400000);
  
  const endDow = (endDay.getDay() + 6) % 7;
  const gridEnd = new Date(endDay.getTime() + (6 - endDow) * 86400000);

  const totalDays = Math.round((gridEnd - gridStart) / 86400000) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  const WD_LABELS = ['Mo', '', 'Mi', '', 'Fr', '', 'So'];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  // ISO week number helper
  function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  // First pass: collect week stats
  for (let w = 0; w < totalWeeks; w++) {
    const firstDayOfWeek = new Date(gridStart.getTime() + w * 7 * 86400000);
    let wHours = 0, wInc = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(firstDayOfWeek.getTime() + d * 86400000);
      if (day.getFullYear() !== year) continue;
      const info = dayMap[localDateStr(day)];
      if (info) { wHours += info.hours; wInc += info.count; }
    }
    weekMap[w] = { hours: Math.round(wHours * 10) / 10, incidents: wInc };
  }

  let html = '<div class="heatmap-grid">';
  // Weekday labels column
  html += '<div class="heatmap-weekdays"><div class="heatmap-wd heatmap-wd-kw">KW</div>' + WD_LABELS.map((l) => `<div class="heatmap-wd">${l}</div>`).join('') + '<div class="heatmap-week-footer-label">h</div><div class="heatmap-week-footer-label">🚑</div></div>';

  for (let w = 0; w < totalWeeks; w++) {
    html += '<div class="heatmap-week-col">';
    const firstDayOfWeek = new Date(gridStart.getTime() + w * 7 * 86400000);

    // KW label (use Thursday of the week for correct ISO week)
    const thursday = new Date(firstDayOfWeek.getTime() + 3 * 86400000);
    const kw = isoWeek(thursday);
    html += `<div class="heatmap-kw-label">KW${String(kw).padStart(2,'0')}</div>`;

    // Month label
    let monthLabel = '';
    if (w === 0) {
      monthLabel = MONTH_NAMES[new Date(year, 0, 1).getMonth()];
    } else {
      for (let d = 0; d < 7; d++) {
        const day = new Date(firstDayOfWeek.getTime() + d * 86400000);
        if (day.getDate() === 1 && day.getFullYear() === year) {
          monthLabel = MONTH_NAMES[day.getMonth()];
          break;
        }
      }
    }
    html += `<div class="heatmap-month-label">${escHtml(monthLabel)}</div>`;
    html += '<div class="heatmap-days">';
    for (let d = 0; d < 7; d++) {
      const day = new Date(firstDayOfWeek.getTime() + d * 86400000);
      const dayYear = day.getFullYear();
      const dayKey = localDateStr(day);
      const inYear = dayYear === year;
      let cls = 'hm-none';
      let title = '';
      if (inYear) {
        const info = dayMap[dayKey];
        const dateLabel = day.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (!info) { cls = 'hm-none'; title = `${dateLabel} – Kein Dienst`; }
        else if (info.count === 0) { cls = 'hm-empty'; title = `${dateLabel} – Dienst ohne Fahrten`; }
        else if (info.count <= 2) { cls = 'hm-1'; title = `${dateLabel} – ${info.count} Fahrt${info.count > 1 ? 'en' : ''}`; }
        else if (info.count <= 4) { cls = 'hm-2'; title = `${dateLabel} – ${info.count} Fahrten`; }
        else if (info.count <= 6) { cls = 'hm-3'; title = `${dateLabel} – ${info.count} Fahrten`; }
        else if (info.count <= 8) { cls = 'hm-4'; title = `${dateLabel} – ${info.count} Fahrten`; }
        else if (info.count <= 10) { cls = 'hm-5'; title = `${dateLabel} – ${info.count} Fahrten`; }
        else { cls = 'hm-6'; title = `${dateLabel} – ${info.count} Fahrten`; }
      }
      const dayNum = inYear ? String(day.getDate()).padStart(2, '0') : '';
      html += `<div class="heatmap-cell ${cls}" title="${escHtml(title)}">${dayNum}</div>`;
    }
    html += '</div>';

    // Week footer: hours + incidents
    const ws = weekMap[w];
    const hasData = ws && (ws.hours > 0 || ws.incidents > 0);
    html += `<div class="heatmap-week-footer">${hasData ? `<span>${ws.hours}h</span><span>${ws.incidents}</span>` : ''}</div>`;
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

// ── Home helpers ───────────────────────────────────────────────────────────
function formatRelativeTime(dt) {
  const now = new Date();
  const diff = dt - now;
  const abs = Math.abs(diff);
  if (abs < 60000) return 'jetzt';
  const mins = Math.round(abs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  const remM = mins % 60;
  let str = '';
  if (days > 0) str += `${days}T `;
  if (remH > 0) str += `${remH}h `;
  if (remM > 0 || (!days && !remH)) str += `${remM}min`;
  str = str.trim();
  return diff < 0 ? `vor ${str}` : `in ${str}`;
}

// Merges future local services with ICS shifts; ICS shifts within 90 min of a
// local service start are fused into one entry (type:'merged').
function buildUpcomingList(futureLocal, icsShifts, now) {
  const matched = new Set();
  const result = [];
  for (const ics of icsShifts) {
    const icsStart = new Date(ics.start);
    let localMatch = null;
    for (const svc of futureLocal) {
      if (matched.has(svc.id)) continue;
      const svcStart = parseLocalDt(svc.startAt);
      if (svcStart && Math.abs(svcStart - icsStart) < 5400000) { localMatch = svc; break; }
    }
    if (localMatch) {
      matched.add(localMatch.id);
      result.push({ type: 'merged', svc: localMatch, ics, start: parseLocalDt(localMatch.startAt) || icsStart });
    } else {
      result.push({ type: 'ics', ics, start: icsStart });
    }
  }
  for (const svc of futureLocal) {
    if (!matched.has(svc.id)) result.push({ type: 'local', svc, start: parseLocalDt(svc.startAt) });
  }
  return result.filter((i) => i.start).sort((a, b) => a.start - b.start);
}

// ── Home ───────────────────────────────────────────────────────────────────
// Aufbau (von oben nach unten, wichtigstes zuerst):
//  1. Hauptkarte: laufender Dienst (mit Fortschritt & Einsätzen) – sonst der
//     nächste Dienst mit Countdown – sonst ein leerer Zustand mit „+ Dienst“.
//  2. Schnellaktionen: Dienst, SEG und – kurz nach Dienstende – „Nachtragen“.
//  3. Demnächst: die folgenden Dienste (Tagebuch + Dienstplan zusammengeführt).
//  4. Letzte Einsätze und kompakte Jahreszahlen (führen zu Tagebuch/Statistik).
const HOME_LATE_ENTRY_MS = 24 * 3600 * 1000; // so lange nach Dienstende „Nachtragen“ anbieten

async function renderHome() {
  const container = document.getElementById('home-container');
  if (!container) return;
  const now = new Date();

  const svcs = state.services.filter((s) => s.startAt && !s.isSeg).sort((a, b) => a.startAt.localeCompare(b.startAt));

  let currentSvc = null;
  for (const s of svcs) {
    const st = parseLocalDt(s.startAt), en = parseLocalDt(s.endAt);
    if (st && en && st <= now && now <= en) { currentSvc = s; break; }
  }

  // Zuletzt beendeter Dienst (für „Einsatz nachtragen“)
  let lastEnded = null;
  if (!currentSvc) {
    for (const s of svcs) {
      const en = parseLocalDt(s.endAt);
      if (en && en < now && now - en < HOME_LATE_ENTRY_MS && (!lastEnded || en > parseLocalDt(lastEnded.endAt))) lastEnded = s;
    }
  }

  // Dienstplan: sofort mit dem letzten bekannten Stand rendern und – falls
  // veraltet – im Hintergrund aktualisieren. Nie auf das Netz warten.
  if (!dpConfigured()) {
    homeIcsShifts = [];
  } else {
    const cache = readIcsCache();
    homeIcsShifts = cache ? futureIcsShifts(cache.shifts, now) : null;
    const stale = !cache || Date.now() - cache.at >= ICS_TTL;
    const recentlyFailed = icsLastError && Date.now() - icsLastErrorAt < ICS_RETRY_AFTER;
    if (stale && !icsInflight && !recentlyFailed) {
      getIcsShifts().then(() => {
        if (activeTab === 'home' && !homeIsBusy()) renderHome().catch(() => {});
      }).catch(() => {
        if (homeIcsShifts === null) homeIcsShifts = [];
        if (activeTab === 'home' && !homeIsBusy()) renderHome().catch(() => {});
      });
    } else if (homeIcsShifts === null && recentlyFailed) {
      homeIcsShifts = []; // kein Endlos-„wird geladen“ nach einem Fehler
    }
  }

  const futureLocal = svcs.filter((s) => {
    if (s === currentSvc) return false;
    const st = parseLocalDt(s.startAt);
    return st && st > now;
  });
  // Laufender Dienst aus dem Dienstplan nicht nochmal als „demnächst“ zeigen
  const icsFuture = (homeIcsShifts || []).filter((x) => new Date(x.start) > now);
  const upcoming = buildUpcomingList(futureLocal, icsFuture, now);

  container.innerHTML = buildHomeHtml({ now, currentSvc, lastEnded, upcoming, icsLoading: homeIcsShifts === null });
  bindHomeEvents(container);
}

// Start-Ansicht nicht neu aufbauen, während dort getippt wird
function homeIsBusy() {
  const c = document.getElementById('home-container');
  const a = document.activeElement;
  return !!(c && a && c.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}

function homeVehIconHtml(vehicle, cls) {
  const catId = vehicle ? (state.vehicleAssignments || {})[vehicle] : null;
  const cat = catId ? (state.vehicleCategories || []).find((c) => c.id === catId) : null;
  if (!cat || !cat.iconNormal) return '';
  return `<div class="hm-veh ${cls || ''}">
    <img src="${escHtml(cat.iconNormal)}" class="hm-veh-img hm-veh-normal" alt="" />
    ${cat.iconSoSi ? `<img src="${escHtml(cat.iconSoSi)}" class="hm-veh-img hm-veh-sosi" alt="" />` : ''}
  </div>`;
}

function homeDayLabel(d, now) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function homeIncRowHtml(inc, svc, showDate) {
  const ea = inc.einsatzart && EINSATZART_MAP.has(String(inc.einsatzart)) ? EINSATZART_MAP.get(String(inc.einsatzart)) : '';
  const naca = inc.naca !== null && inc.naca !== undefined && inc.naca !== '' ? `NACA ${inc.naca}` : '';
  const sub = [ea, naca].filter(Boolean).join(' · ');
  const d = showDate ? parseLocalDt(svc.startAt) : null;
  return `<button type="button" class="hm-row hm-inc" data-svc-id="${escHtml(svc.id)}" data-inc-id="${escHtml(inc.id)}">
    <span class="home-inc-dot ${inc.lights ? 'lights' : 'normal'}"></span>
    <span class="hm-row-main">
      <span class="hm-row-title">${inc.favorite ? '<span class="hm-fav">★</span> ' : ''}${escHtml(inc.alarmCode || '—')}</span>
      ${sub ? `<span class="hm-row-sub">${escHtml(sub)}</span>` : ''}
    </span>
    ${d ? `<span class="hm-row-meta">${escHtml(d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }))}</span>` : ''}
    <span class="hm-chev" aria-hidden="true">›</span>
  </button>`;
}

function homeActiveCardHtml(svc, now) {
  const start = parseLocalDt(svc.startAt);
  const end = parseLocalDt(svc.endAt);
  const pct = start && end && end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : 0;
  const incs = svc.incidents || [];
  const lights = incs.filter((i) => i.lights).length;
  const shown = incs.slice().reverse().slice(0, 4);
  const crew = (svc.colleagues || []).filter(Boolean);
  return `<section class="hm-card hm-hero is-active">
    <button type="button" class="hm-hero-open" data-open-svc="${escHtml(svc.id)}" aria-label="Dienst öffnen">
      <div class="hm-hero-top">
        <span class="hm-live"><span class="home-active-pulse"></span>Im Dienst</span>
        ${shiftCodeHtml(svc.startAt, 'is-small')}
        <span class="hm-hero-right">${end ? 'endet ' + escHtml(formatRelativeTime(end)) : ''}</span>
      </div>
      <div class="hm-hero-body">
        ${homeVehIconHtml(svc.vehicle, 'is-active')}
        <div class="hm-hero-text">
          <div class="hm-hero-title">${escHtml(svc.vehicle || 'Dienst')}</div>
          ${svc.location ? `<div class="hm-hero-sub">${escHtml(svc.location)}</div>` : ''}
        </div>
        <span class="hm-chev" aria-hidden="true">›</span>
      </div>
      <div class="hm-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}">
        <span class="hm-progress-time">${start ? formatTimeHM(start) : '?'}</span>
        <span class="hm-progress-track"><span class="hm-progress-fill" style="width:${pct.toFixed(1)}%"></span></span>
        <span class="hm-progress-time">${end ? formatTimeHM(end) : '?'}</span>
      </div>
      ${crew.length ? `<div class="hm-crew">👥 ${escHtml(crew.join(' · '))}</div>` : ''}
    </button>
    <div class="hm-hero-incs-hd">
      <span>${incs.length} ${incs.length === 1 ? 'Einsatz' : 'Einsätze'}${lights ? ` · <span class="hm-blue">${lights} mit Blaulicht</span>` : ''}</span>
      <button type="button" class="btn-primary hm-add-inc" data-add-inc="${escHtml(svc.id)}">+ Einsatz</button>
    </div>
    ${shown.length ? `<div class="hm-list is-flush">${shown.map((i) => homeIncRowHtml(i, svc, false)).join('')}</div>` : ''}
    ${incs.length > shown.length ? `<button type="button" class="hm-more" data-open-svc="${escHtml(svc.id)}">Alle ${incs.length} Einsätze anzeigen</button>` : ''}
  </section>`;
}

function homeNextCardHtml(item, now) {
  const start = item.start;
  const vehicle = item.svc?.vehicle || item.ics?.summary || '';
  const location = item.svc?.location || item.ics?.location || '';
  const end = item.svc ? parseLocalDt(item.svc.endAt) : (item.ics ? new Date(item.ics.end) : null);
  const crew = item.svc ? (item.svc.colleagues || []) : (Array.isArray(item.ics?.colleagues) ? mergeCrewTitles(item.ics.colleagues) : crewOf(item.ics?.description || '').colleagues);
  const when = `${homeDayLabel(start, now)}, ${formatTimeHM(start)}${end ? '–' + formatTimeHM(end) : ''}`;
  const inner = `
      <div class="hm-hero-top">
        <span class="hm-eyebrow">Nächster Dienst</span>
        ${shiftCodeHtml(start, 'is-small')}
        ${item.svc ? '' : '<span class="hm-tag">Dienstplan</span>'}
      </div>
      <div class="hm-countdown">${escHtml(formatRelativeTime(start))}</div>
      <div class="hm-hero-body">
        ${homeVehIconHtml(vehicle)}
        <div class="hm-hero-text">
          <div class="hm-hero-title">${escHtml(vehicle || 'Dienst')}</div>
          ${location ? `<div class="hm-hero-sub">${escHtml(location)}</div>` : ''}
          <div class="hm-hero-sub is-time">${escHtml(when)}</div>
        </div>
        ${item.svc ? '<span class="hm-chev" aria-hidden="true">›</span>' : ''}
      </div>
      ${crew.length ? `<div class="hm-crew">👥 ${escHtml(crew.join(' · '))}</div>` : ''}`;
  if (item.svc) {
    return `<section class="hm-card hm-hero"><button type="button" class="hm-hero-open" data-open-svc="${escHtml(item.svc.id)}">${inner}</button></section>`;
  }
  return `<section class="hm-card hm-hero"><div class="hm-hero-open is-static">${inner}</div>
    <button type="button" class="btn-secondary hm-hero-btn" data-save-ics="${escHtml(JSON.stringify(item.ics))}">Ins Tagebuch übernehmen</button>
  </section>`;
}

function homeEmptyCardHtml() {
  const hint = dpConfigured()
    ? 'Im Dienstplan ist gerade nichts eingetragen.'
    : 'Lege einen Dienst an – oder verbinde in den Einstellungen den Dienstplan, dann erscheinen deine Dienste hier automatisch.';
  return `<section class="hm-card hm-hero is-empty">
    <div class="hm-empty-icon" aria-hidden="true">🚑</div>
    <div class="hm-hero-title">Kein Dienst geplant</div>
    <div class="hm-hero-sub">${escHtml(hint)}</div>
  </section>`;
}

function homeQuickActionsHtml(currentSvc, lastEnded) {
  const btns = [];
  if (!currentSvc && lastEnded) {
    const d = parseLocalDt(lastEnded.startAt);
    btns.push(`<button type="button" class="hm-qa is-primary" data-add-inc="${escHtml(lastEnded.id)}">
      <span class="hm-qa-icon">🚨</span><span class="hm-qa-label">Nachtragen</span><span class="hm-qa-sub">${escHtml(d ? homeDayLabel(d, new Date()) + ', ' + formatTimeHM(d) : 'Einsatz')}</span></button>`);
  }
  btns.push(`<button type="button" class="hm-qa" id="hm-qa-service"><span class="hm-qa-icon">＋</span><span class="hm-qa-label">Dienst</span></button>`);
  btns.push(`<button type="button" class="hm-qa" id="hm-qa-seg"><span class="hm-qa-icon">⚡</span><span class="hm-qa-label">SEG</span></button>`);
  return `<div class="hm-qa-row cols-${btns.length}">${btns.join('')}</div>`;
}

function homeUpcomingHtml(items, now, icsLoading) {
  const rows = items.slice(0, 4).map((item) => {
    const vehicle = item.svc?.vehicle || item.ics?.summary || '';
    const location = item.svc?.location || item.ics?.location || '';
    const end = item.svc ? parseLocalDt(item.svc.endAt) : (item.ics ? new Date(item.ics.end) : null);
    const when = `${homeDayLabel(item.start, now)} · ${formatTimeHM(item.start)}${end ? '–' + formatTimeHM(end) : ''}`;
    const main = `${shiftCodeHtml(item.start, 'is-small hm-code')}
      <span class="hm-row-main">
        <span class="hm-row-title">${escHtml(vehicle || 'Dienst')}</span>
        <span class="hm-row-sub">${escHtml([when, location].filter(Boolean).join(' · '))}</span>
      </span>`;
    if (item.svc) {
      return `<button type="button" class="hm-row" data-open-svc="${escHtml(item.svc.id)}">${main}<span class="hm-chev" aria-hidden="true">›</span></button>`;
    }
    return `<div class="hm-row">${main}<button type="button" class="hm-save" data-save-ics="${escHtml(JSON.stringify(item.ics))}" aria-label="Ins Tagebuch übernehmen" title="Ins Tagebuch übernehmen">＋</button></div>`;
  }).join('');
  const link = dpConfigured() ? '<button type="button" class="hm-link" data-goto="dienstplan">Dienstplan ›</button>' : '';
  if (!rows && !icsLoading) return '';
  return `<section class="hm-section">
    <div class="hm-section-hd"><span>Demnächst</span>${link}</div>
    <div class="hm-list">${rows || '<div class="hm-row is-muted"><span class="ios-spinner"></span>Dienstplan wird geladen…</div>'}</div>
  </section>`;
}

function homeRecentHtml() {
  const items = [];
  [...state.services].sort((a, b) => (b.startAt || '').localeCompare(a.startAt || '')).forEach((svc) => {
    [...(svc.incidents || [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).forEach((inc) => items.push({ inc, svc }));
  });
  if (!items.length) return '';
  return `<section class="hm-section">
    <div class="hm-section-hd"><span>Letzte Einsätze</span><button type="button" class="hm-link" data-goto="dienste">Tagebuch ›</button></div>
    <div class="hm-list">${items.slice(0, 5).map(({ inc, svc }) => homeIncRowHtml(inc, svc, true)).join('')}</div>
  </section>`;
}

function homeStatsHtml(now) {
  const y = now.getFullYear(), m = now.getMonth();
  const inYear = state.services.filter((s) => { const d = parseLocalDt(s.startAt); return d && d.getFullYear() === y; });
  const inMonth = inYear.filter((s) => parseLocalDt(s.startAt).getMonth() === m);
  const sum = (list) => {
    const duty = list.filter((s) => !s.isSeg); // SEG ist kein Dienst
    const incs = list.flatMap((s) => s.incidents || []);
    return {
      svcs: duty.length,
      hours: Math.round(duty.reduce((a, s) => a + +serviceDurationHours(s), 0)),
      incs: incs.length,
      lights: incs.filter((i) => i.lights).length,
    };
  };
  const ys = sum(inYear), ms = sum(inMonth);
  if (!state.services.length) return '';
  const tile = (val, label, sub) => `<div class="hm-stat"><span class="hm-stat-val">${val}</span><span class="hm-stat-label">${label}</span><span class="hm-stat-sub">${sub}</span></div>`;
  const monthName = now.toLocaleDateString('de-AT', { month: 'long' });
  return `<section class="hm-section">
    <div class="hm-section-hd"><span>Dienstjahr ${y}</span><button type="button" class="hm-link" data-goto="statistik">Statistik ›</button></div>
    <button type="button" class="hm-card hm-stats" data-goto="statistik" aria-label="Zur Statistik">
      ${tile(ys.svcs, 'Dienste', `${monthName}: ${ms.svcs}`)}
      ${tile(ys.hours, 'Stunden', `${monthName}: ${ms.hours}`)}
      ${tile(ys.incs, 'Einsätze', `${monthName}: ${ms.incs}`)}
      ${tile(ys.lights, 'Blaulicht', `${monthName}: ${ms.lights}`)}
    </button>
  </section>`;
}

function buildHomeHtml({ now, currentSvc, lastEnded, upcoming, icsLoading }) {
  let hero;
  let rest = upcoming;
  if (currentSvc) hero = homeActiveCardHtml(currentSvc, now);
  else if (upcoming.length) { hero = homeNextCardHtml(upcoming[0], now); rest = upcoming.slice(1); }
  else hero = homeEmptyCardHtml();
  const dateLine = now.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${backupReminderHtml()}
  <div class="hm-date">${escHtml(dateLine)}</div>
  <div class="hm-grid">
    <div class="hm-col">
      ${hero}
      ${homeQuickActionsHtml(currentSvc, lastEnded)}
      ${homeUpcomingHtml(rest, now, icsLoading && !upcoming.length ? true : false)}
    </div>
    <div class="hm-col">
      ${homeRecentHtml()}
      ${homeStatsHtml(now)}
    </div>
  </div>`;
}

// ── Backup-Erinnerung ─────────────────────────────────────────────────────
// Die Daten liegen nur auf diesem Gerät. Ist die letzte Sicherung älter als
// BACKUP_INTERVAL (oder gab es noch keine), erinnert Start freundlich daran.
const BACKUP_KEY = 'etb_last_backup';
const BACKUP_SNOOZE_KEY = 'etb_backup_snooze';
const BACKUP_INTERVAL = 30 * 24 * 3600 * 1000;

function lastBackupAt() { const n = Number(lsGet(BACKUP_KEY, '0')); return n > 0 ? n : null; }

function backupReminderDue() {
  const incCount = state.services.reduce((n, s) => n + (s.incidents || []).length, 0);
  if (!state.services.length || (!incCount && state.services.length < 3)) return false; // noch kaum Daten
  const snooze = Number(lsGet(BACKUP_SNOOZE_KEY, '0'));
  if (snooze && Date.now() < snooze) return false;
  const last = lastBackupAt();
  return !last || Date.now() - last > BACKUP_INTERVAL;
}

function backupReminderHtml() {
  if (!backupReminderDue()) return '';
  const last = lastBackupAt();
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const text = last ? `Letzte Sicherung vor ${days} Tagen.` : 'Noch keine Sicherung erstellt.';
  return `<div class="backup-banner" role="status">
    <span class="backup-banner-icon" aria-hidden="true">💾</span>
    <div class="backup-banner-text"><strong>Daten sichern</strong><span>${escHtml(text)} Deine Einträge liegen nur auf diesem Gerät.</span></div>
    <div class="backup-banner-actions">
      <button type="button" class="btn-primary" id="btn-backup-now">Jetzt sichern</button>
      <button type="button" class="btn-ghost" id="btn-backup-later">Später</button>
    </div>
  </div>`;
}

/** Öffnet einen Dienst im Tagebuch (auf dem iPhone direkt die Detailansicht). */
function openServiceFromHome(id) {
  if (!state.services.some((s) => s.id === id)) return;
  selectedServiceId = id;
  switchTab('dienste');
}

function bindHomeEvents(container) {
  const bNow = container.querySelector('#btn-backup-now');
  if (bNow) bNow.addEventListener('click', openExportDialog);
  const bLater = container.querySelector('#btn-backup-later');
  if (bLater) bLater.addEventListener('click', () => {
    lsSet(BACKUP_SNOOZE_KEY, String(Date.now() + 7 * 86400000));
    const banner = container.querySelector('.backup-banner');
    if (banner) banner.remove();
    toast('Erinnerung in 7 Tagen.', 'info', 1800);
  });
  const qaSvc = container.querySelector('#hm-qa-service');
  if (qaSvc) qaSvc.addEventListener('click', () => openServiceDialog(null));
  const qaSeg = container.querySelector('#hm-qa-seg');
  if (qaSeg) qaSeg.addEventListener('click', () => openIncidentDialog(null, null, { newSeg: true }));

  container.querySelectorAll('[data-add-inc]').forEach((el) => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openIncidentDialog(el.dataset.addInc, null); });
  });
  container.querySelectorAll('[data-open-svc]').forEach((el) => {
    el.addEventListener('click', () => { if (!navAnimating) openServiceFromHome(el.dataset.openSvc); });
  });
  container.querySelectorAll('.hm-inc').forEach((el) => {
    el.addEventListener('click', () => openIncidentView(el.dataset.svcId, el.dataset.incId));
  });
  container.querySelectorAll('[data-save-ics]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      try { importShiftToService(JSON.parse(el.dataset.saveIcs)); } catch (_) {}
    });
  });
  container.querySelectorAll('[data-goto]').forEach((el) => {
    el.addEventListener('click', () => { if (!navAnimating) switchTab(el.dataset.goto); });
  });
}


// ── Settings ───────────────────────────────────────────────────────────────
let _alarmFilter = '';
let _pzcFilter = '';

function setupDropZone(el, onFile) {
  if (!el) return;
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); });
  el.addEventListener('drop', (e) => {
    e.preventDefault(); el.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  });
}

let _vcatDialogId = null;

function openVehicleCatDialog(catId) {
  _vcatDialogId = catId;
  const cat = catId ? (state.vehicleCategories || []).find((c) => c.id === catId) : null;
  document.getElementById('vcat-dialog-title').textContent = cat ? 'Kategorie bearbeiten' : 'Neue Kategorie';
  document.getElementById('vcat-name').value = cat ? cat.name : '';
  document.getElementById('vcat-icon-normal').value = cat ? (cat.iconNormal || '') : '';
  document.getElementById('vcat-icon-sosi').value = cat ? (cat.iconSoSi || '') : '';
  updateVcatPreview();
  openDialog('dialog-vehicle-cat');
  // Ensure vehicle cat dialog appears above the vehicles popup
  const catDlg = document.getElementById('dialog-vehicle-cat');
  if (catDlg) catDlg.style.zIndex = '2100';
}

function updateVcatPreview() {
  const normal = document.getElementById('vcat-icon-normal').value.trim();
  const sosi = document.getElementById('vcat-icon-sosi').value.trim();
  const pre = document.getElementById('vcat-preview');
  if (!pre) return;
  pre.innerHTML = '';
  if (normal) {
    const img = document.createElement('img');
    img.src = normal; img.style.cssText = 'height:43px;max-width:90px;object-fit:contain;margin-right:12px';
    img.onerror = () => { img.style.opacity = '.3'; img.title = 'Bild nicht erreichbar'; };
    pre.appendChild(img);
  }
  if (sosi) {
    const img = document.createElement('img');
    img.src = sosi; img.style.cssText = 'height:43px;max-width:90px;object-fit:contain';
    img.title = 'SoSi (APNG)';
    img.onerror = () => { img.style.opacity = '.3'; img.title = 'Bild nicht erreichbar'; };
    pre.appendChild(img);
  }
  if (!normal && !sosi) pre.innerHTML = '<span style="color:var(--text3);font-size:12px">Vorschau erscheint nach URL-Eingabe</span>';
}

function saveVehicleCat() {
  const name = document.getElementById('vcat-name').value.trim();
  if (!name) { toast('Bitte Name eingeben.', 'error'); return; }
  const iconNormal = document.getElementById('vcat-icon-normal').value.trim();
  const iconSoSi = document.getElementById('vcat-icon-sosi').value.trim();
  if (_vcatDialogId) {
    const cat = (state.vehicleCategories || []).find((c) => c.id === _vcatDialogId);
    if (cat) { cat.name = name; cat.iconNormal = iconNormal; cat.iconSoSi = iconSoSi; }
  } else {
    if (!state.vehicleCategories) state.vehicleCategories = [];
    state.vehicleCategories.push({ id: uid(), name, iconNormal, iconSoSi });
  }
  saveState(); closeDialog('dialog-vehicle-cat'); renderSettings();
  syncVehicleIcons().then(() => { if (document.getElementById('dialog-vehicles').style.display === 'flex') renderIconCacheRow(); }).catch(() => {});
  if (document.getElementById('dialog-vehicles').style.display === 'flex') renderVehiclesPopupContent();
  renderServiceList(); if (selectedServiceId) renderServiceDetail();
}

function refreshAlarmList() {
  const el = document.getElementById('alarm-code-list');
  if (!el) return;
  const q = _alarmFilter.toLowerCase().trim();
  const codes = (state.alarmCodes || []).filter((c) => !q || c.toLowerCase().includes(q));
  el.innerHTML = codes.length
    ? codes.map((c) => `<div class="code-item"><button type="button" class="kw-toggle" data-kw="${escHtml(c)}" title="Blaulicht umschalten" aria-label="${escHtml(c)}: Blaulicht umschalten">${blaulichtDotHtml(c)}</button><span class="code-item-text">${escHtml(c)}</span><button class="btn-code-del" data-val="${escHtml(c)}" title="Löschen">✕</button></div>`).join('')
    : `<div class="code-empty">Keine Einträge${q ? ' für diese Suche' : ''}.</div>`;
  setTimeout(() => enableCodeListSwipe(el), 0);
  el.querySelectorAll('.kw-toggle').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const k = b.dataset.kw;
    state.alarmBlaulicht = state.alarmBlaulicht || {};
    state.alarmBlaulicht[k] = !keywordBlaulicht(k);
    saveState();
    b.innerHTML = blaulichtDotHtml(k);
  }));
  el.querySelectorAll('.btn-code-del').forEach((b) => {
    b.addEventListener('click', () => {
      state.alarmCodes = state.alarmCodes.filter((c) => c !== b.dataset.val);
      if (state.alarmBlaulicht) delete state.alarmBlaulicht[b.dataset.val];
      saveState();
      const badge = document.getElementById('alarm-count-badge');
      if (badge) badge.textContent = state.alarmCodes.length;
      if (!state.alarmCodes.length) { renderSettings(); return; }
      refreshAlarmList();
    });
  });
}

function refreshPzcList() {
  const el = document.getElementById('pzc-code-list');
  if (!el) return;
  const q = _pzcFilter.toLowerCase().trim();
  const codes = (state.pzcCodes || []).filter((p) => !q || p.code.toLowerCase().includes(q) || p.diagnosis.toLowerCase().includes(q));
  el.innerHTML = codes.length
    ? codes.map((p) => `<div class="code-item"><span class="code-item-code">${escHtml(p.code)}</span><span class="code-item-text">${escHtml(p.diagnosis)}</span><button class="btn-code-del" data-val="${escHtml(p.code)}" title="Löschen">✕</button></div>`).join('')
    : `<div class="code-empty">Keine Einträge${q ? ' für diese Suche' : ''}.</div>`;
  setTimeout(() => enableCodeListSwipe(el), 0);
  el.querySelectorAll('.btn-code-del').forEach((b) => {
    b.addEventListener('click', () => {
      state.pzcCodes = state.pzcCodes.filter((p) => p.code !== b.dataset.val);
      saveState();
      const badge = document.getElementById('pzc-count-badge');
      if (badge) badge.textContent = state.pzcCodes.length;
      if (!state.pzcCodes.length) { renderSettings(); return; }
      refreshPzcList();
    });
  });
}

// ── Einstellungen (Aufbau nach Vorbild RKTel) ─────────────────────────────
// Hauptliste mit gruppierten Zeilen; jede Zeile öffnet eine Unterseite, die –
// wie im Tagebuch – von rechts hereingeschoben und per Wischen verlassen wird.
const APP_VERSION = '2026.11';
const SETTINGS_PAGES = {
  profil: 'Profil',
  darstellung: 'Darstellung',
  dienstplan: 'Dienstplan',
  daten: 'Daten & Backup',
  ueber: 'Über',
};
let settingsSub = null;

const SET_ICONS = {
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5a7 7 0 0 1 14 0"/></svg>',
  brush: '<svg viewBox="0 0 24 24"><path d="M14.5 4.5 19.5 9.5 11 18l-5-5z"/><path d="M6 13c-2 1-2.5 3-2.5 6.5C7 19.5 9 19 10 17"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="M3.5 16.5V9.5a2 2 0 0 1 2-2h8l4.5 4h1a1.5 1.5 0 0 1 1.5 1.5v3.5"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/><path d="M9.5 11.5h-3M8 10v3"/></svg>',
  siren: '<svg viewBox="0 0 24 24"><path d="M7 17v-5a5 5 0 0 1 10 0v5"/><path d="M5 17.5h14v2.5H5zM12 3v2M4.5 6l1.5 1.5M19.5 6 18 7.5"/></svg>',
  archive: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="4.5" rx="1.2"/><path d="M5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  building: '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 7.5h2M13 7.5h2M9 11h2M13 11h2M9 14.5h2M13 14.5h2M10.5 20.5v-3h3v3"/></svg>',
  chev: '<svg viewBox="0 0 10 16"><path d="m2 2 6 6-6 6"/></svg>',
};

function themeLabel(t) {
  return { system: 'Wie System', light: 'Hell', dark: 'Dunkel' }[t] || 'Wie System';
}

function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  return ['system', 'light', 'dark'].includes(t) ? t : 'system';
}

function isLightTheme() {
  const t = currentTheme();
  return t === 'light' || (t === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
}

function applyTheme(t) {
  if (!['system', 'light', 'dark'].includes(t)) t = 'system';
  document.documentElement.setAttribute('data-theme', t);
  lsSet('etb_theme', t);
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.setAttribute('content', isLightTheme() ? '#f2f2f7' : '#000000');
}

function setRow({ icon, color, title, sub, value, push, id, cls = '' }) {
  const attrs = push ? `data-push="${push}"` : id ? `id="${id}"` : '';
  return `<button type="button" class="set-row has-icon ${cls}" ${attrs}>
    <span class="sq-icon sq-${color}">${SET_ICONS[icon]}</span>
    <span class="set-row-text"><span class="set-row-title">${title}</span>${sub ? `<span class="set-row-sub">${sub}</span>` : ''}</span>
    ${value !== undefined ? `<span class="set-row-value">${value}</span>` : ''}
    <span class="set-row-chev">${SET_ICONS.chev}</span>
  </button>`;
}

function renderSettings() {
  const container = document.getElementById('settings-container');
  if (!container) return;
  const cats = state.vehicleCategories || [];
  const vehicles = new Set([...state.services.map((s) => s.vehicle).filter(Boolean), ...Object.keys(state.vehicleAssignments || {})]);
  const name = toDisplayName(state.profile.displayName);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const icsUrl = dpConfigured();
  const incCount = state.services.reduce((n, s) => n + (s.incidents || []).length, 0);

  container.innerHTML = `
    <div class="set-group">
      <button type="button" class="set-row set-profile" data-push="profil">
        <span class="set-avatar">${escHtml(initials)}</span>
        <span class="set-row-text"><span class="set-row-title set-profile-name">${escHtml(name || 'Name festlegen')}</span><span class="set-row-sub">Anzeigename</span></span>
        <span class="set-row-chev">${SET_ICONS.chev}</span>
      </button>
    </div>

    <div class="set-group">
      ${setRow({ icon: 'brush', color: 'indigo', title: 'Darstellung', value: themeLabel(currentTheme()), push: 'darstellung' })}
      ${setRow({ icon: 'calendar', color: 'red', title: 'Dienstplan', value: icsUrl ? 'Verbunden' : 'Aus', push: 'dienstplan' })}
    </div>

    <div class="set-group-header">Stammdaten</div>
    <div class="set-group">
      ${setRow({ icon: 'car', color: 'orange', title: 'Fahrzeuge &amp; Icons', value: `${cats.length} · ${vehicles.size}`, id: 'btn-open-vehicles-popup' })}
      ${setRow({ icon: 'siren', color: 'green', title: 'Stichwörter &amp; PZC', value: `${(state.alarmCodes || []).length} · ${(state.pzcCodes || []).length}`, id: 'btn-open-codes-popup' })}
      ${setRow({ icon: 'building', color: 'blue', title: 'Abteilungen', value: String((state.abteilungen || []).length), id: 'btn-open-abt-popup' })}
    </div>

    <div class="set-group">
      ${setRow({ icon: 'archive', color: 'blue', title: 'Daten &amp; Backup', push: 'daten' })}
      ${setRow({ icon: 'info', color: 'gray', title: 'Über', push: 'ueber' })}
    </div>
    <p class="set-group-footer">${state.services.length} Dienste · ${incCount} Einsätze – gespeichert nur auf diesem Gerät.</p>`;

  container.querySelectorAll('[data-push]').forEach((btn) => {
    btn.addEventListener('click', () => openSettingsPage(btn.dataset.push));
  });
  document.getElementById('btn-open-vehicles-popup').addEventListener('click', openVehiclesPopup);
  document.getElementById('btn-open-codes-popup').addEventListener('click', openCodesPopup);
  document.getElementById('btn-open-abt-popup').addEventListener('click', openAbteilungenPopup);

  if (settingsSub) renderSettingsPage();
  const tab = document.getElementById('tab-einstellungen');
  if (tab) tab.classList.toggle('sub-open', !!settingsSub);
}

function openSettingsPage(page) {
  if (!SETTINGS_PAGES[page] || navAnimating) return;
  const root = document.getElementById('settings-root');
  settingsSub = page;
  renderSettingsPage();
  document.getElementById('tab-einstellungen').classList.add('sub-open');
  const sub = document.getElementById('settings-sub');
  if (sub) sub.scrollTop = 0;
  updateNavBar();
  if (isMobile() && root) pushAnimated(getBackTarget());
}

function closeSettingsPage() {
  settingsSub = null;
  document.getElementById('tab-einstellungen').classList.remove('sub-open');
  renderSettings();
  updateNavBar();
}

function renderSettingsPage() {
  const el = document.getElementById('settings-sub');
  if (!el || !settingsSub) return;
  const title = `<h2 class="set-page-title">${escHtml(SETTINGS_PAGES[settingsSub])}</h2>`;
  const builders = {
    profil: settingsPageProfil,
    darstellung: settingsPageDarstellung,
    dienstplan: settingsPageDienstplan,
    daten: settingsPageDaten,
    ueber: settingsPageUeber,
  };
  builders[settingsSub](el, title);
}

// — Profil ——————————————————————————————————————————————————————————————
function settingsPageProfil(el, title) {
  el.innerHTML = `${title}
    <div class="set-group-header">Anzeigename</div>
    <div class="set-group">
      <div class="set-form"><input type="text" id="settings-name" value="${escHtml(state.profile.displayName || '')}" placeholder="Vorname Nachname" autocomplete="name" enterkeyhint="done" aria-label="Anzeigename"></div>
    </div>
    <p class="set-group-footer">Erscheint oben in der Leiste und in Exporten. Wird automatisch gespeichert.</p>`;
  const input = el.querySelector('#settings-name');
  const save = () => {
    const v = input.value.trim();
    if (v === (state.profile.displayName || '')) return;
    state.profile.displayName = v;
    saveState(); updateUserLabel();
    toast('Anzeigename gespeichert.', 'success', 1500);
  };
  input.addEventListener('change', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

// — Darstellung —————————————————————————————————————————————————————————
function settingsPageDarstellung(el, title) {
  const cur = currentTheme();
  const opt = (val, label, sub) => `<button type="button" class="set-row set-choice" role="radio" aria-checked="${cur === val}" data-theme-choice="${val}">
      <span class="set-row-text"><span class="set-row-title">${label}</span>${sub ? `<span class="set-row-sub">${sub}</span>` : ''}</span>
      <span class="set-check">${SET_ICONS.check}</span>
    </button>`;
  el.innerHTML = `${title}
    <div class="set-group-header">Design</div>
    <div class="set-group" role="radiogroup" aria-label="Design">
      ${opt('system', 'Wie System', 'Hell oder dunkel nach Geräteeinstellung')}
      ${opt('light', 'Hell', '')}
      ${opt('dark', 'Dunkel', 'Angenehm im Nachtdienst')}
    </div>
    <p class="set-group-footer">Bedienung und Funktionen sind in allen Designs gleich.</p>`;
  el.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeChoice);
      el.querySelectorAll('[data-theme-choice]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      renderSettings();
    });
  });
}

// — Dienstplan ——————————————————————————————————————————————————————————
function settingsPageDienstplan(el, title) {
  const cfg = dpConfig();
  const legacy = lsGet(LEGACY_ICS_KEY);
  const cache = readIcsCache();
  const status = !dpConfigured() ? 'Nicht verbunden – Dienstplan ist optional.'
    : icsLastError && !cache ? 'Fehler: ' + icsLastError.message
    : cache ? `${futureIcsShifts(cache.shifts, new Date()).length} kommende Dienste · Stand ${formatTimeHM(new Date(cache.at))}`
    : 'Noch nicht geladen.';
  const minLen = (window.RKDienstplan && window.RKDienstplan.MIN_TOKEN_LENGTH) || 32;
  el.innerHTML = `${title}

    <div class="set-group-header">Verbindung</div>
    <div class="set-group">
      <div class="set-form">
        <label for="dp-worker-url">Worker-Adresse</label>
        <input type="url" id="dp-worker-url" value="${escHtml(cfg.url)}" placeholder="https://….workers.dev" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false">
      </div>
      <div class="set-form">
        <label for="dp-worker-token">Zugangsschlüssel</label>
        <input type="password" id="dp-worker-token" value="${escHtml(cfg.token)}" placeholder="ACCESS_TOKEN (mind. ${minLen} Zeichen)" autocapitalize="off" autocomplete="off" spellcheck="false">
      </div>
      <button type="button" class="set-row set-action" id="btn-dp-save"><span class="set-row-text set-row-title" style="font-weight:600">Speichern &amp; laden</span></button>
      <button type="button" class="set-row set-action" id="btn-dp-gen"><span class="set-row-text set-row-title">Neuen Schlüssel erzeugen</span></button>
      ${dpConfigured() ? '<button type="button" class="set-row set-destructive" id="btn-dp-remove"><span class="set-row-text set-row-title">Verbindung entfernen</span></button>' : ''}
    </div>
    <p class="set-group-footer" id="ics-status">${escHtml(status)}</p>
    <div id="push-settings"></div>

    ${legacy ? `
    <div class="set-group-header">Alte Kalender-URL</div>
    <div class="set-group">
      <div class="set-form"><label>Bisher direkt gespeichert</label><input type="text" id="dp-legacy-url" value="${escHtml(legacy)}" readonly></div>
      <button type="button" class="set-row set-action" id="btn-dp-legacy-copy"><span class="set-row-text set-row-title">URL kopieren</span></button>
      <button type="button" class="set-row set-destructive" id="btn-dp-legacy-del"><span class="set-row-text set-row-title">Alte URL vom Gerät löschen</span></button>
    </div>
    <p class="set-group-footer">Wird nicht mehr gebraucht – der Dienstplan kommt über den Worker.</p>` : ''}

    <div class="set-group">
      ${setRow({ icon: 'building', color: 'blue', title: 'Abteilungen', value: String((state.abteilungen || []).length), id: 'btn-dp-open-abt' })}
    </div>
    <p class="set-group-footer">Verknüpft den Abteilungsnamen eines Dienstes mit der Dienstplan-ID – so öffnet „Tagesdienstplan“ direkt den richtigen Tag.</p>

    <div class="set-group-header">Tagesdienstplan öffnen</div>
    <div class="set-group" role="radiogroup" aria-label="Tagesdienstplan öffnen">
      <button type="button" class="set-row set-choice" role="radio" aria-checked="${dpLinkMode() === 'safari'}" data-dp-link="safari">
        <span class="set-row-text"><span class="set-row-title">In Safari</span><span class="set-row-sub">Du bleibst im Online Dienstplan angemeldet</span></span>
        <span class="set-check">${SET_ICONS.check}</span>
      </button>
      <button type="button" class="set-row set-choice" role="radio" aria-checked="${dpLinkMode() === 'app'}" data-dp-link="app">
        <span class="set-row-text"><span class="set-row-title">In der App</span><span class="set-row-sub">Öffnet ein Fenster über dem Tagebuch</span></span>
        <span class="set-check">${SET_ICONS.check}</span>
      </button>
    </div>
    <p class="set-group-footer">${isIOSDevice() ? '„In Safari“ nutzt ein iOS-Schema (ab iOS 17). Passiert beim Tippen nichts, „In der App“ wählen.' : 'Auf diesem Gerät öffnen Links immer in einem neuen Tab; die Auswahl gilt für iPhone/iPad.'}</p>`;
  el.querySelector('#btn-dp-open-abt').addEventListener('click', openAbteilungenPopup);
  renderPushSettings(el.querySelector('#push-settings')).catch(() => {});
  el.querySelectorAll('[data-dp-link]').forEach((btn) => btn.addEventListener('click', () => {
    lsSet(DP_LINK_KEY, btn.dataset.dpLink);
    el.querySelectorAll('[data-dp-link]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    renderServiceList(); if (selectedServiceId) renderServiceDetail();
  }));

  const urlEl = el.querySelector('#dp-worker-url');
  const tokEl = el.querySelector('#dp-worker-token');
  const saveBtn = el.querySelector('#btn-dp-save');
  saveBtn.addEventListener('click', async () => {
    const RK = window.RKDienstplan;
    const raw = urlEl.value.trim();
    const url = raw ? (RK ? RK.normalizeWorkerUrl(raw) : raw.replace(/\/+$/, '')) : '';
    const token = tokEl.value.trim();
    if (raw && !url) { toast('Bitte eine gültige https-Adresse des Workers eingeben.', 'error'); return; }
    if (url && token.length < minLen) { toast(`Der Zugangsschlüssel braucht mindestens ${minLen} Zeichen.`, 'error'); return; }
    const urlChanged = url !== cfg.url;
    lsSet(DP_WORKER_KEY, url);
    lsSet(DP_TOKEN_KEY, url ? token : '');
    // Letzten Stand nur verwerfen, wenn ein anderer Worker eingetragen wurde –
    // sonst bleibt der Dienstplan bei einem Fehlversuch offline verfügbar.
    if (urlChanged || !url) invalidateIcsCache(); else { icsLastError = null; icsLastErrorAt = 0; }
    if (!url) { toast('Dienstplan-Verbindung entfernt.', 'success'); renderSettingsPage(); renderSettings(); return; }
    saveBtn.disabled = true;
    el.querySelector('#ics-status').textContent = 'Wird geladen…';
    try {
      const data = await getIcsShifts(true);
      if (data.stale) toast(`Gespeichert, aber nicht erreichbar: ${data.error ? data.error.message : 'Fehler'} Es bleibt der letzte Stand.`, 'error', 6000);
      else toast(`Dienstplan verbunden – ${futureIcsShifts(data.shifts, new Date()).length} kommende Dienste.`, 'success');
    } catch (err) {
      toast('Gespeichert, aber nicht erreichbar: ' + err.message, 'error', 6000);
    } finally {
      if (settingsSub === 'dienstplan') renderSettingsPage();
      renderSettings();
    }
  });
  el.querySelector('#btn-dp-gen').addEventListener('click', async () => {
    if (tokEl.value.trim() && !confirm('Neuen Schlüssel erzeugen? Er muss danach auch im Worker als ACCESS_TOKEN hinterlegt werden.')) return;
    const t = window.RKDienstplan ? window.RKDienstplan.generateToken() : '';
    if (!t) return;
    tokEl.type = 'text';
    tokEl.value = t;
    try { await navigator.clipboard.writeText(t); toast('Schlüssel erzeugt und kopiert. Im Worker als Secret ACCESS_TOKEN hinterlegen, dann speichern.', 'success', 6000); }
    catch (_) { toast('Schlüssel erzeugt – bitte kopieren und im Worker als ACCESS_TOKEN hinterlegen.', 'info', 6000); }
  });
  const rm = el.querySelector('#btn-dp-remove');
  if (rm) rm.addEventListener('click', () => {
    if (!confirm('Dienstplan-Verbindung entfernen?')) return;
    lsSet(DP_WORKER_KEY, ''); lsSet(DP_TOKEN_KEY, '');
    invalidateIcsCache();
    toast('Verbindung entfernt.', 'success');
    renderSettingsPage(); renderSettings();
  });
  const cp = el.querySelector('#btn-dp-legacy-copy');
  if (cp) cp.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(legacy); toast('Alte URL kopiert.', 'success'); }
    catch (_) { const i = el.querySelector('#dp-legacy-url'); i.select(); toast('Bitte manuell kopieren.', 'info'); }
  });
  const dl = el.querySelector('#btn-dp-legacy-del');
  if (dl) dl.addEventListener('click', () => {
    if (!confirm('Alte Kalender-URL von diesem Gerät löschen?')) return;
    lsSet(LEGACY_ICS_KEY, ''); renderSettingsPage();
  });
}

// — Daten & Backup ——————————————————————————————————————————————————————
function settingsPageDaten(el, title) {
  el.innerHTML = `${title}
    <div class="set-group-header">Sicherung</div>
    <div class="set-group" id="settings-backup-group">
      <button type="button" class="set-row set-action" id="btn-export"><span class="set-row-text set-row-title">Daten exportieren…</span></button>
      <button type="button" class="set-row set-action" id="btn-import-trigger"><span class="set-row-text set-row-title">Daten importieren…</span></button>
    </div>
    <p class="set-group-footer">${lastBackupAt() ? `Letzte Sicherung: ${escHtml(new Date(lastBackupAt()).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }))}. ` : 'Noch keine Sicherung erstellt. '}Am iPhone öffnet „Exportieren“ das Teilen-Menü – z. B. „In Dateien sichern“ (iCloud Drive). Auch Henri-Exporte können importiert werden.</p>
    <input type="file" id="file-import" accept=".json,application/json,text/json,text/plain,.txt" hidden>

    <div class="set-group-header">Kalender</div>
    <div class="set-group">
      <button type="button" class="set-row set-action" id="btn-export-ics"><span class="set-row-text set-row-title">Dienste als Kalender exportieren (.ics)</span></button>
    </div>

    <div class="set-group-header">Zurücksetzen</div>
    <div class="set-group">
      <button type="button" class="set-row set-destructive" id="btn-open-reset"><span class="set-row-text set-row-title">Daten zurücksetzen…</span></button>
    </div>
    <p class="set-group-footer">Du wählst aus, welche Bereiche gelöscht werden – z. B. nur Dienste oder nur Stichwortlisten.</p>

    <div class="set-group-header">Datenschutz</div>
    <div class="set-info">
      <p>Alle Einträge bleiben ausschließlich auf diesem Gerät. Es gibt keine Analyse- oder Tracking-Skripte. Einzige Verbindung nach außen ist der Abruf deines Dienstplans.</p>
      <p>Einsatzdaten sind sensibel: Gerät sperren, Sicherungen nicht weitergeben.</p>
    </div>`;
  el.querySelector('#btn-export').addEventListener('click', openExportDialog);
  el.querySelector('#btn-export-ics').addEventListener('click', exportIcs);
  el.querySelector('#btn-import-trigger').addEventListener('click', () => el.querySelector('#file-import').click());
  el.querySelector('#file-import').addEventListener('change', (e) => { if (e.target.files[0]) openImportDialog(e.target.files[0]); e.target.value = ''; });
  setupDropZone(el.querySelector('#settings-backup-group'), (file) => doImport(file));
  el.querySelector('#btn-open-reset').addEventListener('click', openResetDialog);
}

// — Über ————————————————————————————————————————————————————————————————
function settingsPageUeber(el, title) {
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  el.innerHTML = `${title}
    <div class="set-about">
      <img src="icons/icon-192.png" alt="">
      <h3>Einsatztagebuch</h3>
      <p>Version ${APP_VERSION} · Progressive Web App</p>
    </div>
    <div class="set-group">
      <div class="set-row"><span class="set-row-text set-row-title">Als App installiert</span><span class="set-row-value">${standalone ? 'Ja' : 'Nein'}</span></div>
      <div class="set-row"><span class="set-row-text set-row-title">Dauerhafter Speicher</span><span class="set-row-value" id="about-persist">…</span></div>
    </div>
    <p class="set-group-footer">${standalone ? '' : 'Tipp: In Safari „Teilen → Zum Home-Bildschirm“ wählen, dann startet das Tagebuch wie eine App. '}Privates Eigenprojekt – kein Angebot des ÖRK.</p>`;
  const persistEl = el.querySelector('#about-persist');
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => { persistEl.textContent = p ? 'Ja' : 'Nein'; }).catch(() => { persistEl.textContent = '—'; });
  } else persistEl.textContent = '—';
}

function updateUserLabel() {
  const el = document.getElementById('user-label');
  if (el) el.textContent = state.profile.displayName || '';
}

// ── Vehicles Popup ─────────────────────────────────────────────────────────
function openVehiclesPopup() {
  const dlg = document.getElementById('dialog-vehicles');
  if (!dlg) return;
  renderVehiclesPopupContent();
  dlg.style.display = 'flex';
}

function renderVehiclesPopupContent() {
  const popup = document.getElementById('dialog-vehicles');
  const cats = state.vehicleCategories || [];
  const vehicles = allVehicleNames();
  popup.querySelector('.veh-popup-left').innerHTML = `
    <h4 class="popup-col-title">Fahrzeugkategorien <span class="popup-col-count">${cats.length}</span></h4>
    <div class="settings-row codes-popup-import-row">
      <button id="btn-add-vehicle-cat" class="btn-secondary">+ Neue Kategorie</button>
    </div>
    <div class="icon-cache-row" id="icon-cache-row"></div>
    <input type="search" id="vcat-filter" class="settings-filter-input" placeholder="Kategorien filtern…" value="${escHtml(_vcatFilter)}" style="margin-top:6px">
    <div class="settings-code-list" id="vehicle-cat-list" style="margin-top:4px"></div>`;
  popup.querySelector('.veh-popup-right').innerHTML = `
    <h4 class="popup-col-title">Fahrzeuge <span class="popup-col-count">${vehicles.length}</span></h4>
    <div class="settings-add-row">
      <input type="text" id="new-vehicle-name" class="settings-code-input" placeholder="Neues Fahrzeug, z. B. RTW 1/23" autocomplete="off">
      <button id="btn-add-vehicle" class="btn-secondary settings-add-btn" aria-label="Fahrzeug hinzufügen">+</button>
    </div>
    <input type="search" id="vehicle-filter" class="settings-filter-input" placeholder="Fahrzeuge filtern…" value="${escHtml(_vehicleFilter)}" style="margin-top:6px">
    <div class="settings-code-list" id="vehicle-assign-list" style="margin-top:4px"></div>`;
  refreshVehicleCatList();
  refreshVehicleAssignList();
  renderIconCacheRow();

  popup.querySelector('#btn-add-vehicle-cat').addEventListener('click', () => openVehicleCatDialog(null));
  popup.querySelector('#vcat-filter').addEventListener('input', (e) => { _vcatFilter = e.target.value; refreshVehicleCatList(); });
  popup.querySelector('#vehicle-filter').addEventListener('input', (e) => { _vehicleFilter = e.target.value; refreshVehicleAssignList(); });
  const addVehicle = () => {
    const input = popup.querySelector('#new-vehicle-name');
    const v = input.value.trim(); if (!v) return;
    state.vehicleAssignments = state.vehicleAssignments || {};
    const existing = Object.keys(state.vehicleAssignments).find((k) => k.toLowerCase() === v.toLowerCase());
    if (!existing) { state.vehicleAssignments[v] = null; saveState(); }
    input.value = ''; _vehicleFilter = ''; renderVehiclesPopupContent();
  };
  popup.querySelector('#btn-add-vehicle').addEventListener('click', addVehicle);
  popup.querySelector('#new-vehicle-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addVehicle(); } });
}

/** Zeile „Grafiken auf dem Gerät: 8 von 8“ mit „Neu laden“ im Fahrzeug-Fenster. */
async function renderIconCacheRow() {
  const el = document.getElementById('icon-cache-row');
  if (!el) return;
  const st = await vehicleIconCacheStatus().catch(() => null);
  if (!st || !st.total) { el.innerHTML = ''; return; }
  el.innerHTML = `<span>📥 Grafiken auf dem Gerät: <strong>${st.cached} von ${st.total}</strong></span>
    <button type="button" class="btn-ghost icon-cache-btn">${st.cached < st.total ? 'Jetzt laden' : 'Neu laden'}</button>`;
  el.querySelector('.icon-cache-btn').addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Lädt…';
    const r = await syncVehicleIcons({ force: true }).catch(() => null);
    if (r && r.failed) toast(`${r.failed} Grafik(en) nicht erreichbar – Adresse prüfen.`, 'error', 5000);
    else if (r) toast('Grafiken gespeichert.', 'success', 1800);
    renderIconCacheRow();
  });
}

let _vcatFilter = '';
let _vehicleFilter = '';
let _abtFilter = '';
let _abtEditIdx = null;

function allVehicleNames() {
  return [...new Set([
    ...state.services.map((s) => s.vehicle).filter(Boolean),
    ...Object.keys(state.vehicleAssignments || {}),
  ])].sort((a, b) => a.localeCompare(b, 'de'));
}

function refreshVehicleCatList() {
  const el = document.getElementById('vehicle-cat-list');
  if (!el) return;
  const q = _vcatFilter.toLowerCase().trim();
  const cats = (state.vehicleCategories || []).filter((c) => !q || (c.name || '').toLowerCase().includes(q));
  el.innerHTML = cats.length
    ? cats.map((c) => `<div class="code-item code-item-tap" data-id="${escHtml(c.id)}" title="Bearbeiten">
        <span class="code-item-icon">${c.iconNormal ? `<img src="${escHtml(c.iconNormal)}" alt="" loading="lazy">` : '—'}</span>
        <span class="code-item-text">${escHtml(c.name)}</span>
        ${c.iconSoSi ? '<span class="code-item-badge">SoSi</span>' : ''}
        <button class="btn-code-del" data-id="${escHtml(c.id)}" title="Löschen" aria-label="${escHtml(c.name)} löschen">✕</button>
      </div>`).join('')
    : `<div class="code-empty">${q ? 'Keine Kategorie für diese Suche.' : 'Noch keine Kategorien – z. B. „RTW T6“ mit Icon-URL anlegen.'}</div>`;
  el.querySelectorAll('.code-item-tap').forEach((row) => row.addEventListener('click', () => openVehicleCatDialog(row.dataset.id)));
  el.querySelectorAll('.btn-code-del').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const cat = (state.vehicleCategories || []).find((c) => c.id === btn.dataset.id);
    if (!cat || !confirm(`Kategorie „${cat.name}“ löschen? Zugewiesene Fahrzeuge verlieren ihr Icon.`)) return;
    state.vehicleCategories = state.vehicleCategories.filter((c) => c.id !== cat.id);
    Object.keys(state.vehicleAssignments || {}).forEach((v) => { if (state.vehicleAssignments[v] === cat.id) state.vehicleAssignments[v] = null; });
    saveState(); renderVehiclesPopupContent(); renderServiceList();
  }));
  enableCodeListSwipe(el);
}

function refreshVehicleAssignList() {
  const el = document.getElementById('vehicle-assign-list');
  if (!el) return;
  const cats = state.vehicleCategories || [];
  const q = _vehicleFilter.toLowerCase().trim();
  const list = allVehicleNames().filter((v) => !q || v.toLowerCase().includes(q));
  const used = new Set(state.services.map((s) => s.vehicle).filter(Boolean));
  el.innerHTML = list.length
    ? list.map((v) => {
      const curId = (state.vehicleAssignments || {})[v] || '';
      const src = vehicleIconSrc(v);
      return `<div class="code-item">
        <span class="code-item-icon">${src ? `<img src="${escHtml(src)}" alt="" loading="lazy">` : '—'}</span>
        <span class="code-item-text">${escHtml(v)}</span>
        <select class="code-item-select" data-vehicle="${escHtml(v)}" aria-label="Icon für ${escHtml(v)}">
          <option value="">kein Icon</option>
          ${cats.map((c) => `<option value="${escHtml(c.id)}"${c.id === curId ? ' selected' : ''}>${escHtml(c.name)}</option>`).join('')}
        </select>
        <button class="btn-code-del" data-vehicle="${escHtml(v)}" title="${used.has(v) ? 'Zuweisung entfernen' : 'Löschen'}" aria-label="${escHtml(v)} entfernen">✕</button>
      </div>`;
    }).join('')
    : `<div class="code-empty">${q ? 'Kein Fahrzeug für diese Suche.' : 'Noch keine Fahrzeuge. Sie erscheinen automatisch aus deinen Diensten oder oben hinzufügen.'}</div>`;
  el.querySelectorAll('.code-item-select').forEach((sel) => sel.addEventListener('change', () => {
    state.vehicleAssignments = state.vehicleAssignments || {};
    state.vehicleAssignments[sel.dataset.vehicle] = sel.value || null;
    saveState();
    const icon = sel.closest('.code-item').querySelector('.code-item-icon');
    const src = vehicleIconSrc(sel.dataset.vehicle);
    icon.innerHTML = src ? `<img src="${escHtml(src)}" alt="">` : '—';
    renderServiceList(); if (selectedServiceId) renderServiceDetail();
  }));
  el.querySelectorAll('.btn-code-del').forEach((btn) => btn.addEventListener('click', () => {
    if (state.vehicleAssignments) delete state.vehicleAssignments[btn.dataset.vehicle];
    saveState(); renderVehiclesPopupContent(); renderServiceList();
  }));
  enableCodeListSwipe(el);
}

// ── Abteilungen (Aufbau wie Stichwörter & PZC) ────────────────────────────
function openAbteilungenPopup() {
  _abtEditIdx = null;
  renderAbteilungenPopup();
  openDialog('dialog-abteilungen');
}

function renderAbteilungenPopup() {
  const body = document.querySelector('#dialog-abteilungen .abt-popup');
  if (!body) return;
  const list = state.abteilungen || [];
  const editing = _abtEditIdx !== null ? list[_abtEditIdx] : null;
  body.innerHTML = `
    <h4 class="popup-col-title">Abteilungen <span class="popup-col-count">${list.length}</span></h4>
    <div class="settings-row codes-popup-import-row">
      <button id="btn-import-abt" class="btn-secondary">JSON importieren</button>
      ${list.length ? '<button id="btn-export-abt" class="btn-secondary">Exportieren</button>' : ''}
    </div>
    <input type="file" id="file-abt-json" accept=".json,application/json,text/json,text/plain,.txt" hidden>
    <div class="settings-add-row">
      <input type="text" id="new-abt-name" class="settings-pzc-diag-input" placeholder="Name, z. B. MINA" value="${escHtml(editing ? editing.name : '')}" autocomplete="off">
      <input type="text" id="new-abt-id" class="settings-pzc-code-input" placeholder="ID" inputmode="numeric" pattern="[0-9]*" value="${escHtml(editing ? editing.deptId : '')}" autocomplete="off">
      <button id="btn-add-abt" class="btn-secondary settings-add-btn" aria-label="${editing ? 'Übernehmen' : 'Hinzufügen'}">${editing ? '✓' : '+'}</button>
    </div>
    ${editing ? '<button type="button" id="btn-abt-cancel" class="btn-ghost" style="align-self:flex-start">Bearbeiten abbrechen</button>' : ''}
    <input type="search" id="abt-filter" class="settings-filter-input" placeholder="Abteilungen filtern…" value="${escHtml(_abtFilter)}" style="margin-top:6px">
    <div class="settings-code-list" id="abt-list" style="margin-top:4px"></div>
    <p class="settings-hint" style="margin-top:6px">Die ID ist die Zahl am Ende der Tagesdienstplan-Adresse. Antippen zum Bearbeiten. Import: Liste <code>[{ "name", "deptId" }]</code> oder RKTel-Datei <code>{ "abteilungen": […] }</code>.</p>`;

  const refreshList = () => {
    const el = body.querySelector('#abt-list');
    const q = _abtFilter.toLowerCase().trim();
    const rows = list.map((a, i) => ({ a, i })).filter(({ a }) => !q || (a.name || '').toLowerCase().includes(q) || String(a.deptId || '').includes(q));
    el.innerHTML = rows.length
      ? rows.map(({ a, i }) => `<div class="code-item code-item-tap${i === _abtEditIdx ? ' is-editing' : ''}" data-idx="${i}">
          <span class="code-item-code">${escHtml(a.deptId || '—')}</span>
          <span class="code-item-text">${escHtml(a.name || '(ohne Namen)')}</span>
          <button class="btn-code-del" data-idx="${i}" title="Löschen" aria-label="${escHtml(a.name)} löschen">✕</button>
        </div>`).join('')
      : `<div class="code-empty">Keine Einträge${q ? ' für diese Suche' : ''}.</div>`;
    el.querySelectorAll('.code-item-tap').forEach((row) => row.addEventListener('click', () => {
      _abtEditIdx = +row.dataset.idx; renderAbteilungenPopup();
      body.querySelector('#new-abt-name').focus();
    }));
    el.querySelectorAll('.btn-code-del').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      list.splice(+b.dataset.idx, 1); state.abteilungen = list;
      _abtEditIdx = null; saveState(); renderAbteilungenPopup(); renderSettings();
    }));
    enableCodeListSwipe(el);
  };
  refreshList();

  const nameEl = body.querySelector('#new-abt-name');
  const idEl = body.querySelector('#new-abt-id');
  idEl.addEventListener('input', () => digitsOnly(idEl, 6));
  const commit = () => {
    const name = nameEl.value.trim(), deptId = idEl.value.trim();
    if (!name || !deptId) { toast('Bitte Name und ID eingeben.', 'error'); return; }
    state.abteilungen = list;
    const clash = list.findIndex((a, i) => a.name.toLowerCase() === name.toLowerCase() && i !== _abtEditIdx);
    if (clash >= 0) list.splice(clash, 1, { name, deptId });
    else if (_abtEditIdx !== null) list.splice(_abtEditIdx, 1, { name, deptId });
    else list.push({ name, deptId });
    list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    _abtEditIdx = null; saveState(); renderAbteilungenPopup(); renderSettings();
    body.querySelector('#new-abt-name').focus();
  };
  body.querySelector('#btn-add-abt').addEventListener('click', commit);
  [nameEl, idEl].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }));
  const cancel = body.querySelector('#btn-abt-cancel');
  if (cancel) cancel.addEventListener('click', () => { _abtEditIdx = null; renderAbteilungenPopup(); });
  body.querySelector('#abt-filter').addEventListener('input', (e) => { _abtFilter = e.target.value; refreshList(); });

  const importFile = async (file) => {
    try {
      const data = parseJsonText(await file.text());
      const raw = Array.isArray(data) ? data : (data.abteilungen || data.departments || []);
      const valid = raw.filter((a) => a && (a.name || '').trim() && String(a.deptId ?? a.id ?? '').trim())
        .map((a) => ({ name: a.name.trim(), deptId: String(a.deptId ?? a.id).trim() }));
      const byName = new Map(list.map((a) => [a.name.toLowerCase(), a]));
      let added = 0, updated = 0;
      valid.forEach((a) => {
        const ex = byName.get(a.name.toLowerCase());
        if (!ex) { list.push(a); byName.set(a.name.toLowerCase(), a); added++; }
        else if (ex.deptId !== a.deptId) { ex.deptId = a.deptId; updated++; }
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      state.abteilungen = list; saveState(); _abtFilter = ''; renderAbteilungenPopup(); renderSettings();
      toast(`${added} Abteilungen importiert${updated ? `, ${updated} aktualisiert` : ''}.`, 'success');
    } catch (err) { toast('Fehler: ' + err.message, 'error', 5000); }
  };
  body.querySelector('#btn-import-abt').addEventListener('click', () => body.querySelector('#file-abt-json').click());
  body.querySelector('#file-abt-json').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
  const exp = body.querySelector('#btn-export-abt');
  if (exp) exp.addEventListener('click', () => {
    saveFile(new Blob([JSON.stringify({ abteilungen: list }, null, 2)], { type: 'application/json' }), 'abteilungen.json');
  });
  setupDropZone(body, importFile);
}

// ── Zurücksetzen: Datenbereiche wählen ─────────────────────────────────────
function resetSections() {
  const incCount = state.services.reduce((n, s) => n + (s.incidents || []).length, 0);
  const favCount = favoriteIncidents().length;
  return [
    { id: 'services', icon: '📋', label: 'Dienste, Einsätze & SEG', count: `${state.services.length} · ${incCount}`, run: () => { state.services = []; selectedServiceId = null; } },
    { id: 'favorites', icon: '★', label: 'Nur Favoriten-Markierungen', count: favCount, run: () => state.services.forEach((s) => (s.incidents || []).forEach((i) => { i.favorite = false; })) },
    { id: 'profile', icon: '👤', label: 'Profil (Anzeigename)', run: () => { state.profile = { displayName: '' }; } },
    { id: 'calendar', icon: '📅', label: 'Dienstplan-Verbindung & Zwischenspeicher', run: () => { lsSet(DP_WORKER_KEY, ''); lsSet(DP_TOKEN_KEY, ''); lsSet(LEGACY_ICS_KEY, ''); invalidateIcsCache(); } },
    { id: 'abteilungen', icon: '🏢', label: 'Abteilungen', count: (state.abteilungen || []).length, run: () => { state.abteilungen = []; } },
    { id: 'vehicles', icon: '🚑', label: 'Fahrzeug-Icons & Zuweisungen', count: (state.vehicleCategories || []).length, run: () => { state.vehicleCategories = []; state.vehicleAssignments = {}; } },
    { id: 'alarm', icon: '🚨', label: 'Einsatzstichwörter', count: (state.alarmCodes || []).length, run: () => { state.alarmCodes = []; state.alarmBlaulicht = {}; } },
    { id: 'pzc', icon: '🏥', label: 'PZC-Codes', count: (state.pzcCodes || []).length, run: () => { state.pzcCodes = []; } },
    { id: 'appearance', icon: '🎨', label: 'Darstellung', run: () => { applyTheme('system'); } },
  ];
}

function openResetDialog() {
  const sections = resetSections();
  const list = document.getElementById('reset-checklist');
  list.innerHTML = sections.map((s) => `
    <label class="export-check-row">
      <input type="checkbox" data-reset="${s.id}" />
      <span class="export-check-icon">${s.icon}</span>
      <span class="export-check-label">${escHtml(s.label)}</span>
      ${s.count !== undefined ? `<span class="export-check-count">${escHtml(String(s.count))}</span>` : ''}
    </label>`).join('');
  const boxes = () => [...list.querySelectorAll('input[data-reset]')];
  const confirmBtn = document.getElementById('btn-reset-confirm');
  const sync = () => {
    const all = boxes();
    const svc = all.find((b) => b.dataset.reset === 'services');
    const fav = all.find((b) => b.dataset.reset === 'favorites');
    // Wer alle Dienste löscht, löscht die Favoriten ohnehin mit
    fav.disabled = svc.checked; if (svc.checked) fav.checked = false;
    const n = all.filter((b) => b.checked).length;
    confirmBtn.disabled = !n;
    confirmBtn.textContent = n ? `Löschen (${n})` : 'Löschen';
  };
  list.onchange = sync;
  document.getElementById('btn-reset-all').onclick = () => { boxes().forEach((b) => { b.checked = b.dataset.reset !== 'favorites'; }); sync(); };
  document.getElementById('btn-reset-none').onclick = () => { boxes().forEach((b) => { b.checked = false; }); sync(); };
  document.getElementById('btn-reset-export-first').onclick = () => { closeDialog('dialog-reset'); openExportDialog(); };
  confirmBtn.onclick = () => {
    const chosen = sections.filter((s) => boxes().some((b) => b.checked && b.dataset.reset === s.id));
    if (!chosen.length) return;
    const summary = chosen.map((s) => '• ' + s.label).join('\n');
    if (!confirm(`Diese Daten werden unwiderruflich gelöscht:\n\n${summary}\n\nFortfahren?`)) return;
    chosen.forEach((s) => s.run());
    saveState();
    closeDialog('dialog-reset');
    updateUserLabel();
    renderServiceList(); renderServiceDetail(); renderSettings();
    if (settingsSub) renderSettingsPage();
    toast(`${chosen.length} ${chosen.length === 1 ? 'Bereich' : 'Bereiche'} zurückgesetzt.`, 'success');
  };
  sync();
  openDialog('dialog-reset');
}

// ── Codes Popup ────────────────────────────────────────────────────────────
function openCodesPopup() {
  const dlg = document.getElementById('dialog-codes');
  if (!dlg) return;
  renderCodesPopupContent();
  dlg.style.display = 'flex';
}

function renderCodesPopupContent() {
  const alarm = state.alarmCodes || [];
  const pzc = state.pzcCodes || [];
  const popup = document.getElementById('dialog-codes');

  // Left: Alarmcodes/Stichwörter
  popup.querySelector('.codes-popup-left').innerHTML = `
    <h4 class="popup-col-title">Einsatzstichwörter <span class="popup-col-count">${alarm.length}</span></h4>
    <div class="settings-row codes-popup-import-row">
      <button id="btn-import-alarm" class="btn-secondary">JSON importieren</button>
      ${alarm.length ? `<button id="btn-export-alarm" class="btn-secondary">Exportieren</button>` : ''}
    </div>
    <input type="file" id="file-alarm-json" accept=".json,application/json,text/json,text/plain,.txt" style="display:none">
    <div class="settings-add-row">
      <input type="text" id="new-alarm-code" class="settings-code-input" placeholder="Neuer Code, z.B. A1 CODE">
      <button id="btn-add-alarm" class="btn-secondary settings-add-btn">+</button>
    </div>
    <input type="text" id="alarm-filter" class="settings-filter-input" placeholder="Codes filtern…" value="${escHtml(_alarmFilter)}" style="margin-top:6px">
    <p class="settings-hint kw-legend"><span class="kw-dot is-on"></span> mit Blaulicht · <span class="kw-dot is-off"></span> ohne – Punkt antippen zum Umschalten</p>
    <div class="settings-code-list" id="alarm-code-list" style="margin-top:4px"></div>`;

  // Right: PZC
  popup.querySelector('.codes-popup-right').innerHTML = `
    <h4 class="popup-col-title">PZC-Codes <span class="popup-col-count">${pzc.length}</span></h4>
    <div class="settings-row codes-popup-import-row">
      <button id="btn-import-pzc" class="btn-secondary">JSON importieren</button>
      ${pzc.length ? `<button id="btn-export-pzc" class="btn-secondary">Exportieren</button>` : ''}
    </div>
    <input type="file" id="file-pzc-json" accept=".json,application/json,text/json,text/plain,.txt" style="display:none">
    <div class="settings-add-row">
      <input type="text" id="new-pzc-code" class="settings-pzc-code-input" placeholder="Code" maxlength="5">
      <input type="text" id="new-pzc-diag" class="settings-pzc-diag-input" placeholder="Diagnose">
      <button id="btn-add-pzc" class="btn-secondary settings-add-btn">+</button>
    </div>
    <input type="text" id="pzc-filter" class="settings-filter-input" placeholder="PZC filtern…" value="${escHtml(_pzcFilter)}" style="margin-top:6px">
    <div class="settings-code-list" id="pzc-code-list" style="margin-top:4px"></div>`;

  refreshAlarmList();
  refreshPzcList();

  // Alarm events
  popup.querySelector('#btn-import-alarm').addEventListener('click', () => popup.querySelector('#file-alarm-json').click());
  popup.querySelector('#file-alarm-json').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = parseJsonText(await file.text());
      const raw = Array.isArray(data) ? data : (data.codes || data.alarmCodes || []);
      if (!raw.length) throw new Error('In der Datei wurden keine Stichwörter gefunden.');
      importKeywordListWithToast(raw, data.alarmBlaulicht);
      _alarmFilter = ''; renderCodesPopupContent();
    } catch (err) { toast('Fehler: ' + err.message, 'error', 5000); }
    e.target.value = '';
  });
  const exportAlarmBtn = popup.querySelector('#btn-export-alarm');
  if (exportAlarmBtn) exportAlarmBtn.addEventListener('click', () => {
    const list = state.alarmCodes.map((c) => ({ code: c, blaulicht: keywordBlaulicht(c) === true }));
    saveFile(new Blob([JSON.stringify(list, null, 1)], { type: 'application/json' }), 'alarmcodes.json');
  });
  const addAlarmFn = () => {
    const input = popup.querySelector('#new-alarm-code');
    const val = input.value.trim(); if (!val) return;
    state.alarmCodes = state.alarmCodes || [];
    if (!state.alarmCodes.includes(val)) {
      state.alarmCodes.push(val); state.alarmCodes.sort((a, b) => a.localeCompare(b, 'de'));
      state.alarmBlaulicht = state.alarmBlaulicht || {};
      if (state.alarmBlaulicht[val] === undefined) state.alarmBlaulicht[val] = false;
      saveState();
    }
    input.value = ''; refreshAlarmList();
  };
  popup.querySelector('#btn-add-alarm').addEventListener('click', addAlarmFn);
  popup.querySelector('#new-alarm-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addAlarmFn(); } });
  popup.querySelector('#alarm-filter').addEventListener('input', (e) => { _alarmFilter = e.target.value; refreshAlarmList(); });

  // PZC events
  popup.querySelector('#btn-import-pzc').addEventListener('click', () => popup.querySelector('#file-pzc-json').click());
  popup.querySelector('#file-pzc-json').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = parseJsonText(await file.text());
      const raw = Array.isArray(data) ? data : (data.codes || data.pzcCodes || []);
      const valid = raw.filter((p) => p && typeof p.code === 'string' && typeof p.diagnosis === 'string');
      if (!valid.length) throw new Error('In der Datei wurden keine PZC-Codes gefunden.');
      importPzcList(valid);
      _pzcFilter = ''; renderCodesPopupContent();
    } catch (err) { toast('Fehler: ' + err.message, 'error', 5000); }
    e.target.value = '';
  });
  const exportPzcBtn = popup.querySelector('#btn-export-pzc');
  if (exportPzcBtn) exportPzcBtn.addEventListener('click', () => {
    saveFile(new Blob([JSON.stringify(state.pzcCodes, null, 2)], { type: 'application/json' }), 'pzccodes.json');
  });
  const addPzcFn = () => {
    const codeInput = popup.querySelector('#new-pzc-code');
    const diagInput = popup.querySelector('#new-pzc-diag');
    const code = codeInput.value.trim(), diag = diagInput.value.trim();
    if (!code || !diag) return;
    state.pzcCodes = state.pzcCodes || [];
    if (!state.pzcCodes.find((p) => p.code === code)) { state.pzcCodes.push({ code, diagnosis: diag }); saveState(); }
    codeInput.value = ''; diagInput.value = ''; refreshPzcList();
  };
  popup.querySelector('#btn-add-pzc').addEventListener('click', addPzcFn);
  popup.querySelector('#new-pzc-diag').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPzcFn(); } });
  popup.querySelector('#pzc-filter').addEventListener('input', (e) => { _pzcFilter = e.target.value; refreshPzcList(); });

  // Drop zones in popup
  setupDropZone(popup.querySelector('.codes-popup-left'), async (file) => {
    try {
      const data = parseJsonText(await file.text());
      const raw = Array.isArray(data) ? data : (data.codes || data.alarmCodes || []);
      const codes = raw.filter((c) => typeof c === 'string').map((c) => c.trim()).filter(Boolean);
      const existing = new Set(state.alarmCodes || []);
      let added = 0;
      codes.forEach((c) => { if (!existing.has(c)) { (state.alarmCodes = state.alarmCodes || []).push(c); existing.add(c); added++; } });
      if (added) state.alarmCodes.sort();
      saveState(); _alarmFilter = ''; renderCodesPopupContent(); toast(`${added} Alarmcodes importiert.`, 'success');
    } catch (err) { toast('Fehler: ' + err.message, 'error', 5000); }
  });
  setupDropZone(popup.querySelector('.codes-popup-right'), async (file) => {
    try {
      const data = parseJsonText(await file.text());
      const raw = Array.isArray(data) ? data : (data.codes || data.pzcCodes || []);
      const valid = raw.filter((p) => p && typeof p.code === 'string' && typeof p.diagnosis === 'string');
      const existing = new Set((state.pzcCodes || []).map((p) => p.code));
      let added = 0;
      valid.forEach((p) => { if (!existing.has(p.code)) { (state.pzcCodes = state.pzcCodes || []).push(p); existing.add(p.code); added++; } });
      saveState(); _pzcFilter = ''; renderCodesPopupContent(); toast(`${added} PZC-Codes importiert.`, 'success');
    } catch (err) { toast('Fehler: ' + err.message, 'error', 5000); }
  });
}

// ── Import / Export ────────────────────────────────────────────────────────
function toCompatExport() {
  return {
    exportedAt: new Date().toISOString(),
    user: state.profile.displayName || 'Privat',
    shifts: state.services.map((svc) => ({
      shiftId: svc.id,
      startTime: svc.startAt || '',
      endTime: svc.endAt || '',
      duration: serviceDurationHours(svc),
      location: svc.location || '',
      abteilung: svc.abteilung || '',
      resource: svc.vehicle || '',
      tip: svc.isSeg ? 'seg' : '',
      note: svc.note || '',
      crew: svc.colleagues || [],
      missions: (svc.incidents || []).map((inc) => ({
        missionId: inc.id,
        title: inc.alarmCode || '',
        emergency: !!inc.lights,
        tip: '',
        note: inc.note || '',
        creation: inc.createdAt || '',
        highlighted: !!inc.favorite,
        incidentNumber: inc.incidentNumber || '',
        pzc: Object.assign({}, inc.pzc || {}),
        naca: inc.naca ?? null,
        einsatzart: inc.einsatzart || '',
        statKz: inc.statKz || '',
        extraVehicles: inc.extraVehicles || []
      }))
    }))
  };
}

function fromCompatibleImport(data) {
  if (!data || !Array.isArray(data.shifts)) throw new Error('Ungültiges Format');
  state.profile.displayName = toDisplayName(data.user) || state.profile.displayName;
  state.services = data.shifts.map((shift) => ({
    id: shift.shiftId || uid(),
    startAt: utcIsoToLocalDtStr(shift.startTime) || shift.startTime || '',
    endAt: utcIsoToLocalDtStr(shift.endTime) || shift.endTime || '',
    // Abteilung fehlt (z. B. Henri-Export, alte Sicherung) oder ist leer → Dienststelle übernehmen
    abteilung: toDisplayName(shift.abteilung) || toDisplayName(shift.location),
    location: toDisplayName(shift.location) || '',
    vehicle: shift.resource || '',
    note: shift.note || '',
    isSeg: shift.tip === 'seg',
    colleagues: Array.isArray(shift.crew) ? shift.crew : [],
    incidents: Array.isArray(shift.missions) ? shift.missions.map((m) => ({
      id: m.missionId || uid(),
      alarmCode: m.title || '',
      lights: m.emergency === true || m.emergency === 'yes',
      favorite: m.highlighted === true,
      note: m.note || '',
      createdAt: m.creation || '',
      incidentNumber: m.incidentNumber || '',
      pzc: m.pzc || { diag: '', age: '', prio: '' },
      naca: m.naca ?? null,
      einsatzart: m.einsatzart ? String(m.einsatzart) : '',
      statKz: m.statKz ? String(m.statKz) : '',
      extraVehicles: m.extraVehicles || []
    })).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')) : []
  }));
  saveState();
}

// ── Selective Export ───────────────────────────────────────────────────────
function openExportDialog() {
  const dlg = document.getElementById('dialog-export');

  // fill counts
  const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n ? `${n}` : ''; };
  setCount('exp-services-count', state.services.length);
  setCount('exp-vehicles-count', (state.vehicleCategories || []).length);
  setCount('exp-alarm-count', (state.alarmCodes || []).length);
  setCount('exp-pzc-count', (state.pzcCodes || []).length);

  dlg.style.display = 'flex';

  document.getElementById('btn-export-select-all').onclick = () =>
    dlg.querySelectorAll('input[type=checkbox]').forEach((cb) => (cb.checked = true));
  document.getElementById('btn-export-none').onclick = () =>
    dlg.querySelectorAll('input[type=checkbox]').forEach((cb) => (cb.checked = false));
  document.getElementById('btn-export-confirm').onclick = async () => {
    const sel = {
      services: document.getElementById('exp-services').checked,
      profile: document.getElementById('exp-profile').checked,
      calendar: document.getElementById('exp-calendar').checked,
      vehicles: document.getElementById('exp-vehicles').checked,
      alarm: document.getElementById('exp-alarm').checked,
      pzc: document.getElementById('exp-pzc').checked,
    };
    const payload = buildExportPayload(sel);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const ok = await saveFile(blob, `einsatztagebuch-${localDateStr(new Date())}.json`, 'Einsatztagebuch – Sicherung');
    if (!ok) { toast('Sicherung abgebrochen.', 'info', 1800); return; }
    // Nur eine Sicherung mit Diensten zählt für die Backup-Erinnerung
    if (sel.services) { lsSet(BACKUP_KEY, String(Date.now())); lsSet(BACKUP_SNOOZE_KEY, ''); }
    closeDialog('dialog-export');
    if (activeTab === 'home') renderHome().catch(() => {});
    if (settingsSub === 'daten') renderSettingsPage();
    toast('Sicherung erstellt.', 'success', 1800);
  };
}

function buildExportPayload(sel) {
  const payload = { version: 2, exportedAt: new Date().toISOString() };
  if (sel.profile) payload.profile = { displayName: state.profile.displayName || '' };
  if (sel.profile) payload.abteilungen = state.abteilungen || [];
  if (sel.calendar) payload.dienstplanWorker = lsGet(DP_WORKER_KEY); // Zugangsschlüssel bewusst nicht im Export
  if (sel.services) payload.services = toCompatExport().shifts;
  if (sel.vehicles) {
    payload.vehicleCategories = state.vehicleCategories || [];
    payload.vehicleAssignments = state.vehicleAssignments || {};
  }
  if (sel.alarm) { payload.alarmCodes = state.alarmCodes || []; payload.alarmBlaulicht = state.alarmBlaulicht || {}; }
  if (sel.pzc) payload.pzcCodes = state.pzcCodes || [];
  return payload;
}

// ── Selective Import ───────────────────────────────────────────────────────
let _importPayload = null;

function openImportDialog(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = parseJsonText(e.target.result);
      _importPayload = data;
      // Reine Stichwort- bzw. PZC-Listen direkt übernehmen
      const kw = looksLikeKeywordList(data);
      if (kw) {
        importKeywordListWithToast(kw, data.alarmBlaulicht);
        renderSettings(); if (settingsSub) renderSettingsPage();
        return;
      }
      const pzc = looksLikePzcList(data);
      if (pzc) { importPzcList(pzc); renderSettings(); if (settingsSub) renderSettingsPage(); return; }

      if (data.version === 2) {
        // new selective format — show checklist
        const sections = [
          { key: 'services',          id: 'imp-services', icon: '📋', label: 'Dienste & Einsätze',          count: Array.isArray(data.services) ? data.services.length : null },
          { key: 'profile',           id: 'imp-profile',  icon: '👤', label: 'Profil (Anzeigename)',         count: null },
          { key: data.dienstplanWorker !== undefined ? 'dienstplanWorker' : 'calendarUrl', id: 'imp-calendar', icon: '📅', label: 'Dienstplan-Worker', count: null },
          { key: 'vehicleCategories', id: 'imp-vehicles', icon: '🚑', label: 'Fahrzeug-Icons & Zuweisungen', count: Array.isArray(data.vehicleCategories) ? data.vehicleCategories.length : null },
          { key: 'alarmCodes',        id: 'imp-alarm',    icon: '🚨', label: 'Einsatzstichwörter',           count: Array.isArray(data.alarmCodes) ? data.alarmCodes.length : null },
          { key: 'pzcCodes',          id: 'imp-pzc',      icon: '🏥', label: 'PZC-Codes',                   count: Array.isArray(data.pzcCodes) ? data.pzcCodes.length : null },
        ].filter((s) => data[s.key] !== undefined);

        const list = document.getElementById('import-checklist');
        list.innerHTML = sections.map((s) => `
          <label class="export-check-row">
            <input type="checkbox" id="${s.id}" checked />
            <span class="export-check-icon">${s.icon}</span>
            <span class="export-check-label">${s.label}</span>
            ${s.count !== null ? `<span class="export-check-count">${s.count}</span>` : ''}
          </label>`).join('');

        const warnEl = document.getElementById('import-warn');
        warnEl.style.display = 'none';

        document.getElementById('btn-import-confirm').onclick = () => {
          const chosen = {};
          sections.forEach((s) => { chosen[s.id] = document.getElementById(s.id)?.checked; });
          doSelectiveImport(data, chosen);
          document.getElementById('dialog-import').style.display = 'none';
        };

        document.getElementById('dialog-import').style.display = 'flex';
      } else if (Array.isArray(data.shifts)) {
        // legacy format — import directly
        fromCompatibleImport(data);
        state = normalizeState(state); saveState();
        toast('Import erfolgreich: ' + state.services.length + ' Dienste geladen.', 'success', 4000);
        renderServiceList(); renderServiceDetail(); updateUserLabel(); renderSettings();
      } else {
        toast('Unbekanntes Format. Erkannt werden Sicherungen des Einsatztagebuchs, Henri-Exporte sowie Stichwort- und PZC-Listen.', 'error', 6000);
      }
    } catch (err) { toast('Importfehler: ' + err.message, 'error', 5000); }
  };
  reader.readAsText(file);
}

function doSelectiveImport(data, chosen) {
  const msgs = [];

  if (chosen['imp-services'] && Array.isArray(data.services)) {
    fromCompatibleImport({ shifts: data.services, user: data.profile?.displayName });
    msgs.push(`${state.services.length} Dienste`);
  }
  if (chosen['imp-profile'] && data.profile) {
    const n = toDisplayName(data.profile.displayName);
    if (n) state.profile.displayName = n;
    if (data.abteilungen) state.abteilungen = data.abteilungen;
    msgs.push('Profil');
  }
  if (chosen['imp-calendar'] && (data.dienstplanWorker !== undefined || data.calendarUrl !== undefined)) {
    if (data.dienstplanWorker) lsSet(DP_WORKER_KEY, data.dienstplanWorker);
    if (data.calendarUrl) lsSet(LEGACY_ICS_KEY, data.calendarUrl); // alte Sicherung: als Hinweis für den Worker
    invalidateIcsCache();
    msgs.push('Dienstplan-Worker');
  }
  if (chosen['imp-vehicles'] && Array.isArray(data.vehicleCategories)) {
    state.vehicleCategories = data.vehicleCategories;
    setTimeout(() => syncVehicleIcons().catch(() => {}), 500);
    if (data.vehicleAssignments) state.vehicleAssignments = data.vehicleAssignments;
    msgs.push(`${data.vehicleCategories.length} Fahrzeugkategorien`);
  }
  if (chosen['imp-alarm'] && Array.isArray(data.alarmCodes)) {
    const added = mergeKeywordList(data.alarmCodes, data.alarmBlaulicht);
    msgs.push(`${added} Alarmcodes`);
  }
  if (chosen['imp-pzc'] && Array.isArray(data.pzcCodes)) {
    const existing = new Set((state.pzcCodes || []).map((p) => p.code));
    let added = 0;
    data.pzcCodes.forEach((p) => { if (!existing.has(p.code)) { (state.pzcCodes = state.pzcCodes || []).push(p); existing.add(p.code); added++; } });
    msgs.push(`${added} PZC-Codes`);
  }

  state = normalizeState(state);   // importierte Daten wie beim Laden prüfen
  saveState();
  renderServiceList(); renderServiceDetail(); updateUserLabel(); renderSettings();
  toast('Import erfolgreich: ' + (msgs.length ? msgs.join(', ') : 'Nichts ausgewählt.'), 'success', 4500);
}

function doImport(file) { openImportDialog(file); }

function exportIcs() {
  const toIcsDt = (s) => {
    if (!s) return null;
    return s.replace(/-/g, '').replace(':', '').replace(':', '') + '00';
  };
  const icsEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Einsatztagebuch//DE',
    'CALSCALE:GREGORIAN',
  ];
  for (const svc of state.services) {
    if (!svc.startAt) continue;
    const vehicle = svc.vehicle || '';
    const location = svc.location || '';
    // Title: only vehicle (location is in LOCATION field)
    const summary = vehicle || (svc.isSeg ? 'SEG-Einsatz' : 'Dienst');

    const descLines = [];
    // Line 1: Kolleg:innen
    if (svc.colleagues && svc.colleagues.length) descLines.push(svc.colleagues.join(', '));
    // Line 2: Dienst-Notiz
    if (svc.note) descLines.push(svc.note);
    // Tagesdienstplan-Link
    const dpUrl = dienstplanUrl(svc);
    if (dpUrl) descLines.push(dpUrl);

    // Each incident as its own paragraph
    for (const inc of (svc.incidents || [])) {
      descLines.push('');
      // Header: Alarmcode + Blaulicht
      let header = (inc.alarmCode || '—');
      if (inc.lights) header += ' 🔵';
      descLines.push(header);
      // Kennzahlen
      if (inc.einsatzart) descLines.push('Einsatzart: ' + kennzahlLabel(EINSATZART_MAP, inc.einsatzart));
      if (inc.statKz) descLines.push('Statistik-KZ: ' + kennzahlLabel(STATKZ_MAP, inc.statKz));
      // NACA
      if (inc.naca !== null && inc.naca !== undefined && inc.naca !== '') descLines.push('NACA: ' + inc.naca);
      // PZC
      if (inc.pzc && (inc.pzc.diag || inc.pzc.age || inc.pzc.prio)) {
        const pzcLabel = pzcFullLabel(inc.pzc.diag, inc.pzc.age, inc.pzc.prio);
        if (pzcLabel) descLines.push('PZC: ' + pzcLabel);
      }
      // Notiz/Kommentar
      if (inc.note) descLines.push(inc.note);
      // Sonstige Einsatzmittel
      if ((inc.extraVehicles || []).length) descLines.push('Weitere Einsatzmittel: ' + inc.extraVehicles.join(', '));
    }

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + svc.id + '@einsatztagebuch');
    lines.push('DTSTART:' + toIcsDt(svc.startAt));
    if (svc.endAt) lines.push('DTEND:' + toIcsDt(svc.endAt));
    lines.push('SUMMARY:' + icsEscape(summary));
    if (location) lines.push('LOCATION:' + icsEscape(location));
    if (descLines.length) lines.push('DESCRIPTION:' + icsEscape(descLines.join('\n')));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  saveFile(blob, `dienste-${localDateStr(new Date())}.ics`, 'Dienste (Kalender)');
}

// ── Fahrzeuggrafiken lokal speichern ──────────────────────────────────────
// Die Bilder liegen meist auf fremden Servern und laden langsam. Sie werden
// einmal geholt und im Cache „etb-icons“ abgelegt; der Service Worker liefert
// sie danach sofort vom Gerät. Nicht mehr benutzte Grafiken werden entfernt.
const ICON_CACHE = 'etb-icons';

function vehicleIconUrls() {
  const set = new Set();
  (state.vehicleCategories || []).forEach((c) => [c.iconNormal, c.iconSoSi].forEach((u) => {
    if (u && /^https?:\/\//i.test(u)) { try { set.add(new URL(u, location.href).href); } catch (_) {} }
  }));
  return [...set];
}

async function fetchIconForCache(url) {
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (res.ok) return res;
  } catch (_) {}
  // Server ohne CORS → „undurchsichtige“ Antwort; für <img> trotzdem verwendbar
  const res = await fetch(url, { mode: 'no-cors', cache: 'no-store' });
  if (res.ok || res.type === 'opaque') return res;
  throw new Error('HTTP ' + res.status);
}

let iconSyncRunning = null;
/** Fehlende Grafiken holen, unbenutzte löschen. force = alle neu laden. */
function syncVehicleIcons({ force = false } = {}) {
  if (!('caches' in window)) return Promise.resolve({ total: 0, cached: 0, failed: 0 });
  if (iconSyncRunning && !force) return iconSyncRunning;
  iconSyncRunning = (async () => {
    const cache = await caches.open(ICON_CACHE);
    const wanted = vehicleIconUrls();
    const keys = await cache.keys();
    const have = new Set(keys.map((r) => r.url));
    await Promise.all(keys.filter((r) => !wanted.includes(r.url)).map((r) => cache.delete(r)));
    let failed = 0;
    for (const url of wanted) {
      if (have.has(url) && !force) continue;
      try { await cache.put(url, await fetchIconForCache(url)); } catch (_) { failed++; }
    }
    return { total: wanted.length, cached: wanted.length - failed, failed };
  })().finally(() => { iconSyncRunning = null; });
  return iconSyncRunning;
}

async function vehicleIconCacheStatus() {
  if (!('caches' in window)) return null;
  const wanted = vehicleIconUrls();
  const cache = await caches.open(ICON_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  return { total: wanted.length, cached: wanted.filter((u) => have.has(u)).length };
}

// ── Datei speichern: auf iPhone/iPad über das Teilen-Menü ─────────────────
// (In Dateien sichern, iCloud Drive, AirDrop …); sonst normaler Download.
// Liefert true, wenn gespeichert/geteilt wurde, false bei Abbruch.
async function saveFile(blob, filename, title) {
  try {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.share && (isIOSDevice() || isMobile()) && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || filename });
      return true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return false; // Teilen abgebrochen
    // anderer Fehler → auf Download zurückfallen
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

// ── Aktionsblatt (wie iOS UIAlertController .actionSheet) ──────────────────
function showActionSheet({ title, message, actions }) {
  document.querySelectorAll('.action-sheet-overlay').forEach((el) => el.remove());
  const ov = document.createElement('div');
  ov.className = 'action-sheet-overlay';
  ov.innerHTML = `<div class="action-sheet" role="dialog" aria-label="${escHtml(title || 'Aktionen')}">
    <div class="as-group">
      ${title || message ? `<div class="as-head">${title ? `<strong>${escHtml(title)}</strong>` : ''}${message ? `<span>${escHtml(message)}</span>` : ''}</div>` : ''}
      ${actions.map((a, i) => `<button type="button" class="as-btn${a.destructive ? ' is-destructive' : ''}" data-i="${i}">
        ${a.icon ? `<span class="as-icon" aria-hidden="true">${a.icon}</span>` : ''}
        <span class="as-text"><span>${escHtml(a.label)}</span>${a.sub ? `<small>${escHtml(a.sub)}</small>` : ''}</span>
      </button>`).join('')}
    </div>
    <button type="button" class="as-btn as-cancel">Abbrechen</button>
  </div>`;
  const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 220); };
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('.as-btn');
    if (e.target === ov || (b && b.classList.contains('as-cancel'))) { close(); return; }
    if (b && b.dataset.i !== undefined) { close(); setTimeout(() => actions[+b.dataset.i].run(), 120); }
  });
  document.body.appendChild(ov);
}

// ── Dialog helpers ─────────────────────────────────────────────────────────
function openDialog(id) {
  const el = document.getElementById(id);
  if (!el) return;
  clearTimeout(el._closeTimer);
  el.classList.remove('closing');
  resetSheetStyles(el);
  el.style.display = 'flex';
}

function closeDialog(id) {
  const el = document.getElementById(id);
  if (!el || el.style.display === 'none') return;
  if (prefersReducedMotion()) { finalizeDialogClose(el); return; }
  const box = el.querySelector('.dialog-box');
  if (box) { box.style.animation = ''; box.style.transition = ''; }
  el.classList.add('closing');
  clearTimeout(el._closeTimer);
  el._closeTimer = setTimeout(() => finalizeDialogClose(el), 260);
}

function finalizeDialogClose(el) {
  clearTimeout(el._closeTimer);
  el.classList.remove('closing');
  if (el.id) el.style.display = 'none';
  else el.remove();
  resetSheetStyles(el);
}

function resetSheetStyles(overlay) {
  overlay.style.backgroundColor = '';
  overlay.style.transition = '';
  const box = overlay.querySelector('.dialog-box');
  if (box) { box.style.animation = ''; box.style.transform = ''; box.style.transition = ''; }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
  initTabs();
  updateUserLabel();

  // Dialog close buttons
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeDialog(btn.dataset.close));
  });
  // Close dialog on overlay click
  document.querySelectorAll('.dialog-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(overlay.id); });
  });

  // Service toolbar
  document.getElementById('btn-add-menu').addEventListener('click', () => showActionSheet({
    title: 'Neuer Eintrag',
    actions: [
      { label: 'Dienst', sub: 'Schicht mit Fahrzeug und Besatzung', icon: '🚑', run: () => openServiceDialog(null) },
      { label: 'SEG-Einsatz', sub: 'Einzelner Einsatz mit Beginn und Ende', icon: '⚡', run: () => openIncidentDialog(null, null, { newSeg: true }) },
    ],
  }));
  const globalLightsBtn = document.getElementById('btn-global-lights');
  if (globalLightsBtn) {
    globalLightsBtn.innerHTML = LIGHTS_ON_SVG;
    globalLightsBtn.addEventListener('click', () => {
      globalLightsOn = !globalLightsOn;
      globalLightsBtn.classList.toggle('lights-on', globalLightsOn);
      renderServiceList();
    });
  }
  document.getElementById('search-input').addEventListener('input', renderServiceList);

  // Save buttons
  document.getElementById('btn-svc-save').addEventListener('click', saveService);
  document.getElementById('btn-inc-save').addEventListener('click', saveIncident);
  document.getElementById('btn-vcat-save').addEventListener('click', saveVehicleCat);

  // Vehicle cat dialog: live preview on URL input
  ['vcat-icon-normal', 'vcat-icon-sosi'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateVcatPreview);
  });

  // Delete buttons
  const deleteBtn = document.getElementById('btn-svc-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!svcDialogId) return;
      if (!confirm('Dienst wirklich löschen?')) return;
      state.services = state.services.filter((s) => s.id !== svcDialogId);
      saveState(); closeDialog('dialog-service'); selectedServiceId = null; renderServiceList(); renderServiceDetail();
    });
  }
  const incDeleteBtn = document.getElementById('btn-inc-delete');
  if (incDeleteBtn) {
    incDeleteBtn.addEventListener('click', () => {
      if (!incDialogIncidentId) return;
      deleteIncident(incDialogServiceId, incDialogIncidentId);
    });
  }

  // Tagebuch → Favoriten (Unterseite)
  document.getElementById('btn-open-favorites').addEventListener('click', () => { if (!navAnimating) switchTab('favoriten'); });

  // Leseansicht: Bearbeiten öffnet ein weiteres Fenster darüber
  document.getElementById('btn-inc-view-edit').addEventListener('click', () => {
    if (incViewRef) openIncidentDialog(incViewRef.svcId, incViewRef.incId);
  });
  document.getElementById('btn-inc-view-delete').addEventListener('click', () => {
    if (incViewRef) deleteIncident(incViewRef.svcId, incViewRef.incId);
  });

  document.getElementById('btn-naca-info').addEventListener('click', openNacaInfo);

  // Lights toggle
  document.getElementById('btn-lights').addEventListener('click', () => { incLights = !incLights; updateLightsBtn(); });
  document.getElementById('btn-add-extra-vehicle').addEventListener('click', activateAddVehicleInput);


  renderServiceList();
  initIosNavigation();
  initAppLifecycle();
  restoreUiState();

  // PWA service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  // Fahrzeuggrafiken im Hintergrund lokal ablegen (nach dem ersten Zeichnen)
  setTimeout(() => { if (navigator.onLine !== false) syncVehicleIcons().catch(() => {}); }, 2500);
}

document.addEventListener('DOMContentLoaded', init);

// ── Dienstplan (ICS via CORS-Proxy) ───────────────────────────────────────

async function loadDienstplan() {
  initDpButtons();
  await loadDpShifts();
  // Änderungen (vom Worker erkannt) nachladen und Markierungen setzen
  const before = JSON.stringify(recentDpChanges()) + lsGet(DP_HISTORY_KEY, '').length;
  await Promise.all([loadDpChanges(), loadDpHistory()]);
  if (activeTab === 'dienstplan' && JSON.stringify(recentDpChanges()) + lsGet(DP_HISTORY_KEY, '').length !== before) {
    const cache = readIcsCache();
    const container = document.getElementById('dienstplan-container');
    if (cache && container) renderDpShifts(cache.shifts, container);
  }
}

function dpFormatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
}

function dpFormatDayHeading(iso) {
  const d = new Date(iso);
  const heute = new Date();
  const morgen = new Date(heute);
  morgen.setDate(morgen.getDate() + 1);
  const weekday = d.toLocaleDateString('de-AT', { weekday: 'long' });
  const date = d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (d.toDateString() === heute.toDateString()) return `Heute · ${date}`;
  if (d.toDateString() === morgen.toDateString()) return `Morgen · ${date}`;
  return `${weekday} · ${date}`;
}

function dpDuration(start, end) {
  const h = ((new Date(end) - new Date(start)) / 3600000).toFixed(1);
  return `${h} h`;
}

let dpLoadSeq = 0;
async function loadDpShifts(force = false) {
  const container = document.getElementById('dienstplan-container');
  const statusEl = document.getElementById('dienstplan-sync-status');
  const reloadBtn = document.getElementById('btn-dp-reload');
  if (!container) return;
  const toolbar = document.getElementById('dienstplan-toolbar');
  if (toolbar) toolbar.hidden = !dpConfigured();
  if (!dpConfigured()) {
    if (statusEl) statusEl.textContent = '—';
    container.innerHTML = '<div class="empty-hint">Noch kein Dienstplan verbunden.<br><button type="button" class="btn-primary dp-connect" style="margin-top:14px">Dienstplan verbinden</button></div>';
    const btn = container.querySelector('.dp-connect');
    if (btn) btn.addEventListener('click', () => { switchTab('einstellungen'); setTimeout(() => openSettingsPage('dienstplan'), 60); });
    return;
  }
  const seq = ++dpLoadSeq; // nur die jüngste Anfrage darf rendern
  const cache = readIcsCache();
  if (cache && !force) renderDpShifts(cache.shifts, container);
  else if (!container.querySelector('.dp-day-group')) container.innerHTML = '<div class="empty-hint dp-loading"><span class="ios-spinner"></span>Dienstplan wird geladen…</div>';
  if (statusEl) statusEl.textContent = 'Aktualisiere…';
  if (reloadBtn) reloadBtn.disabled = true;
  try {
    const data = await getIcsShifts(force);
    if (seq !== dpLoadSeq) return;
    renderDpShifts(data.shifts, container);
    const at = data.at ? new Date(data.at) : null;
    const atStr = at ? formatTimeHM(at) : '';
    if (statusEl) {
      statusEl.textContent = data.stale
        ? `Offline · Stand ${atStr}`
        : `${data.shifts.length} ${data.shifts.length === 1 ? "Dienst" : "Dienste"} · aktualisiert ${atStr}`;
      statusEl.classList.toggle('is-stale', !!data.stale);
    }
    if (data.stale && force) toast('Aktualisierung fehlgeschlagen – zeige letzten Stand.', 'error');
  } catch (err) {
    if (seq !== dpLoadSeq) return;
    if (statusEl) { statusEl.textContent = 'Nicht erreichbar'; statusEl.classList.add('is-stale'); }
    container.innerHTML = `<div class="empty-hint">Dienstplan konnte nicht geladen werden.<br><small>${escHtml(err.message || String(err))}</small><br><button class="btn-secondary dp-retry" style="margin-top:12px">Erneut versuchen</button></div>`;
    const retry = container.querySelector('.dp-retry');
    if (retry) retry.addEventListener('click', () => loadDpShifts(true));
  } finally {
    if (seq === dpLoadSeq && reloadBtn) reloadBtn.disabled = false;
  }
}

function renderDpShifts(shifts, container) {
  shifts = (shifts || []).filter((x) => x && x.start && x.end).sort((a, b) => new Date(a.start) - new Date(b.start));
  if (!shifts.length) {
    container.innerHTML = '<div class="empty-hint">Keine Dienste im Kalender gefunden.</div>';
    return;
  }
  const groups = new Map();
  for (const s of shifts) {
    const key = new Date(s.start).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const changes = recentDpChanges();
  const hist = readDpHistory();
  container.innerHTML = dpChangesPanelHtml(changes);
  for (const dayShifts of groups.values()) {
    const group = document.createElement('div');
    group.className = 'dp-day-group';
    group.innerHTML = `<h3 class="dp-day-heading">${escHtml(dpFormatDayHeading(dayShifts[0].start))}</h3>`;
    for (const s of dayShifts) {
      const saved = findSavedServiceForShift(s);
      const savedChange = saved ? pendingPlanChange(saved) : null;
      const dpLink = (saved && dienstplanUrl(saved)) || dienstplanUrl({ abteilung: '', location: s.location || '', startAt: localDtStr(new Date(s.start)) });
      const chg = dpChangeFor(s, changes);
      const histKey = historyKeyForShift(s, hist);
      const card = document.createElement('div');
      card.className = 'dp-shift-card' + (saved ? ' is-saved' : '') + (dpLink ? ' has-dplink' : '');
      card.innerHTML = `
        <div class="dp-shift-top">
          ${shiftCodeHtml(new Date(s.start), 'is-small')}
          ${chg ? `<span class="dp-chg-badge is-${chg.type}">${chg.type === 'added' ? 'Neu' : 'Geändert'}</span>` : ''}
          <span class="dp-shift-time">${escHtml(dpFormatTime(s.start))} – ${escHtml(dpFormatTime(s.end))}</span>
          <span class="dp-shift-dur">${escHtml(dpDuration(s.start, s.end))}</span>
        </div>
        <div class="dp-shift-summary">${escHtml(s.summary || '—')}</div>
        ${s.location ? `<div class="dp-shift-meta">📍 ${escHtml(s.location)}</div>` : ''}
        ${dpCrewHtml(s)}
        ${savedChange ? `<div class="dp-shift-meta dp-pc-hint">⚠︎ Tagebuch weicht ab: ${escHtml(savedChange.diff.map((d) => d.label).join(', '))}</div>` : ''}
        <div class="dp-shift-actions">
          ${historyCountHtml(histKey, hist)}
          ${saved
            ? (savedChange
              ? `<button type="button" class="btn-primary" data-pc-apply="${escHtml(saved.id)}">Übernehmen</button><button type="button" class="btn-secondary btn-dp-open">Öffnen</button>`
              : '<button type="button" class="btn-secondary btn-dp-open">✓ Im Tagebuch</button>')
            : '<button type="button" class="btn-primary btn-dp-import">Ins Tagebuch übernehmen</button>'}
        </div>
        ${dpLink ? `<a ${dpLinkAttrs(dpLink)} class="dp-icon-link" title="Tagesdienstplan öffnen" aria-label="Tagesdienstplan öffnen">${ICON_CAL}</a>` : ''}`;
      const imp = card.querySelector('.btn-dp-import');
      if (imp) imp.addEventListener('click', () => importShiftToService(s));
      const open = card.querySelector('.btn-dp-open');
      if (open) open.addEventListener('click', () => { selectedServiceId = saved.id; switchTab('dienste'); });
      group.appendChild(card);
    }
    container.appendChild(group);
  }
}

/** Besatzung (+ Zusatzinfo) einer Dienstplan-Karte; Personen mit „·“ getrennt,
 *  damit „Name, BSc“ als eine Person erkennbar bleibt. */
function dpCrewHtml(shift) {
  const p = Array.isArray(shift.colleagues) ? { colleagues: mergeCrewTitles(shift.colleagues), note: shift.note || '' } : crewOf(shift.description || '');
  return (p.colleagues.length ? `<div class="dp-shift-meta">👥 ${p.colleagues.map(escHtml).join(' · ')}</div>` : '')
    + (p.note ? `<div class="dp-shift-meta">ℹ️ ${escHtml(p.note).replace(/\n/g, ' · ')}</div>` : '');
}

/** Bereits ins Tagebuch übernommener Dienst zu einem Dienstplan-Eintrag (±90 min). */
function findSavedServiceForShift(shift) {
  const svcs = state.services.filter((x) => !x.isSeg);
  if (shift.uid) {
    // 1. gemerkte Termin-ID, 2. Zuordnung über Verlauf/Beginnzeit (auch wenn sich die Zeit verschoben hat)
    const byId = svcs.find((x) => x.dpUid === shift.uid);
    if (byId) return byId;
    const viaPlan = svcs.find((x) => { const p = planShiftForService(x); return p && p.uid === shift.uid && p.start === shift.start; });
    if (viaPlan) return viaPlan;
  }
  const st = new Date(shift.start);
  return svcs.find((x) => { const d = parseLocalDt(x.startAt); return d && Math.abs(d - st) < 5400000; }) || null;
}

/** Hängt reine Titel-Einträge an die Person davor („Name Vorname, BSc“). */
function mergeCrewTitles(list) {
  const people = [];
  for (const raw of list || []) {
    const t = String(raw || '').trim();
    if (!t) continue;
    if (people.length && isCrewTitleOnly(t)) people[people.length - 1] += ', ' + t;
    else people.push(t);
  }
  return people;
}

// Teilt die Besatzungszeile per Komma auf und erkennt Titel-Einträge.
// Beispiel: "Muster Max, BSc, Beispiel Anna, Prof. Ing. Mag."
//        → ["Muster Max, BSc", "Beispiel Anna, Prof. Ing. Mag."]
function parseCrew(description) {
  if (!description) return [];
  return mergeCrewTitles(String(description).split(/\s*[,;]\s*/));
}

/** Werte eines Dienstplan-Eintrags so, wie sie im Tagebuch gespeichert werden. */
function planValuesFromShift(shift) {
  // Besatzung direkt aus dem Kalender-Parser (Titel wie „BSc“ bleiben beim
  // Namen); weitere Beschreibungszeilen (z. B. Zimmer) → an den Ort anhängen.
  const parsed = Array.isArray(shift.colleagues) ? { colleagues: mergeCrewTitles(shift.colleagues), note: shift.note || '' } : crewOf(shift.description || '');
  const extras = String(parsed.note || '').split(/\n/).map((x) => x.trim()).filter(Boolean).join(' · ');
  let location = shift.location || '';
  if (extras) location = location ? `${location} · ${extras}` : extras;
  return {
    startAt: localDtStr(new Date(shift.start)),
    endAt: localDtStr(new Date(shift.end)),
    vehicle: shift.summary || '',
    location,
    colleagues: parsed.colleagues,
  };
}

function importShiftToService(shift) {
  const v = planValuesFromShift(shift);
  const dup = state.services.find((x) => (shift.uid && x.dpUid === shift.uid) || (x.startAt === v.startAt && (x.vehicle || '') === v.vehicle));
  if (dup && !confirm('Dieser Dienst ist bereits im Tagebuch. Trotzdem nochmal anlegen?')) {
    selectedServiceId = dup.id;
    switchTab('dienste');
    return;
  }
  openServiceDialog(null, { start: v.startAt, end: v.endAt, location: v.location, vehicle: v.vehicle, colleagues: v.colleagues, dpUid: shift.uid || '' });
}

// ── Abgleich Tagebuch ↔ Dienstplan ────────────────────────────────────────
// Ein übernommener Dienst merkt sich die Termin-ID (dpUid). Ändert sich der
// Termin im Dienstplan, zeigt das Tagebuch die Unterschiede mit „Übernehmen“.
function planShiftForService(svc) {
  if (!svc || svc.isSeg) return null;
  const cache = readIcsCache();
  if (!cache || !Array.isArray(cache.shifts)) return null;
  const st = parseLocalDt(svc.startAt);
  const byUid = (uid) => {
    const hits = cache.shifts.filter((x) => x.uid === uid);
    if (hits.length <= 1 || !st) return hits[0] || null;
    return hits.sort((a, b) => Math.abs(new Date(a.start) - st) - Math.abs(new Date(b.start) - st))[0];
  };
  if (svc.dpUid) return byUid(svc.dpUid);
  // ältere Dienste ohne Termin-ID: über den Verlauf oder gleiche Beginnzeit (±90 min)
  const hk = historyKeyForService(svc);
  const hist = hk ? readDpHistory()[hk] : null;
  if (hist && hist.uid) { const s = byUid(hist.uid); if (s) return s; }
  if (!st) return null;
  let best = null, bestD = Infinity;
  for (const x of cache.shifts) {
    const d = Math.abs(new Date(x.start) - st);
    const sameVeh = (x.summary || '').toLowerCase() === (svc.vehicle || '').toLowerCase();
    if (d < 5400000 && d - (sameVeh ? 1 : 0) < bestD) { best = x; bestD = d - (sameVeh ? 1 : 0); }
  }
  return best;
}

/** Unterschiede zwischen Tagebuch-Dienst und Dienstplan (leer = gleich). */
function planDiff(svc, plan) {
  if (!plan) return [];
  const v = planValuesFromShift(plan);
  const out = [];
  const range = (a, b) => { const x = parseLocalDt(a), y = parseLocalDt(b); return x ? `${x.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${formatTimeHM(x)}${y ? '–' + formatTimeHM(y) : ''}` : '—'; };
  if (svc.startAt !== v.startAt || (svc.endAt || '') !== v.endAt) out.push({ key: 'time', label: 'Zeit', from: range(svc.startAt, svc.endAt), to: range(v.startAt, v.endAt) });
  if ((svc.vehicle || '').trim() !== v.vehicle.trim()) out.push({ key: 'vehicle', label: 'Fahrzeug', from: svc.vehicle, to: v.vehicle });
  if ((svc.location || '').trim() !== v.location.trim()) out.push({ key: 'location', label: 'Dienststelle', from: svc.location, to: v.location });
  const norm = (x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim();
  const a = new Set((svc.colleagues || []).map(norm)), b = new Set(v.colleagues.map(norm));
  const added = v.colleagues.filter((x) => !a.has(norm(x)));
  const removed = (svc.colleagues || []).filter((x) => !b.has(norm(x)));
  if (added.length || removed.length) out.push({ key: 'crew', label: 'Besatzung', added, removed });
  return out;
}

/** Fingerabdruck eines Plan-Stands – „Ignorieren“ gilt nur bis zur nächsten Änderung. */
function planSignature(plan) {
  const v = planValuesFromShift(plan);
  return [v.startAt, v.endAt, v.vehicle, v.location, v.colleagues.join('|')].join('#');
}

/** Offene (nicht ignorierte) Abweichung eines Dienstes oder null. */
function pendingPlanChange(svc) {
  const plan = planShiftForService(svc);
  if (!plan) return null;
  const diff = planDiff(svc, plan);
  if (!diff.length || svc.dpAck === planSignature(plan)) return null;
  return { plan, diff };
}

function applyPlanChange(svcId) {
  const svc = state.services.find((x) => x.id === svcId);
  const pc = svc && pendingPlanChange(svc);
  if (!pc) return;
  const v = planValuesFromShift(pc.plan);
  for (const d of pc.diff) {
    if (d.key === 'time') { svc.startAt = v.startAt; svc.endAt = v.endAt; }
    if (d.key === 'vehicle') svc.vehicle = v.vehicle;
    if (d.key === 'location') svc.location = v.location;
    if (d.key === 'crew') svc.colleagues = v.colleagues;
  }
  if (pc.plan.uid) svc.dpUid = pc.plan.uid;
  delete svc.dpAck;
  saveState();
  toast('Dienst an den Dienstplan angepasst.', 'success');
  refreshAfterPlanChange();
}

function ignorePlanChange(svcId) {
  const svc = state.services.find((x) => x.id === svcId);
  const plan = svc && planShiftForService(svc);
  if (!plan) return;
  svc.dpAck = planSignature(plan);
  if (plan.uid) svc.dpUid = plan.uid;
  saveState();
  refreshAfterPlanChange();
}

function refreshAfterPlanChange() {
  renderServiceList(); if (selectedServiceId) renderServiceDetail();
  const c = readIcsCache(), box = document.getElementById('dienstplan-container');
  if (activeTab === 'dienstplan' && c && box) renderDpShifts(c.shifts, box);
  if (activeTab === 'home') renderHome().catch(() => {});
}

function planChangeBannerHtml(svc) {
  const pc = pendingPlanChange(svc);
  if (!pc) return '';
  const rows = pc.diff.map((d) => d.key === 'crew'
    ? `<div class="pc-row"><span class="pc-label">${d.label}</span><span class="pc-val">${d.added.map((x) => `<span class="hist-crew is-add">+ ${escHtml(x)}</span>`).join('')}${d.removed.map((x) => `<span class="hist-crew is-del">− ${escHtml(x)}</span>`).join('')}</span></div>`
    : `<div class="pc-row"><span class="pc-label">${d.label}</span><span class="pc-val"><s>${escHtml(d.from || '—')}</s> → <strong>${escHtml(d.to || '—')}</strong></span></div>`).join('');
  return `<div class="pc-banner" role="status">
    <div class="pc-head">⚠︎ Im Dienstplan geändert</div>
    ${rows}
    <div class="pc-actions">
      <button type="button" class="btn-primary" data-pc-apply="${escHtml(svc.id)}">Übernehmen</button>
      <button type="button" class="btn-ghost" data-pc-ignore="${escHtml(svc.id)}">Ignorieren</button>
    </div>
  </div>`;
}

document.addEventListener('click', (e) => {
  const ap = e.target.closest && e.target.closest('[data-pc-apply]');
  if (ap) { e.stopPropagation(); applyPlanChange(ap.dataset.pcApply); return; }
  const ig = e.target.closest && e.target.closest('[data-pc-ignore]');
  if (ig) { e.stopPropagation(); ignorePlanChange(ig.dataset.pcIgnore); }
});

function initDpButtons() {
  const reloadBtn = document.getElementById('btn-dp-reload');
  if (reloadBtn && !reloadBtn._bound) {
    reloadBtn._bound = true;
    reloadBtn.addEventListener('click', async () => {
      if (reloadBtn.dataset.busy) return;
      reloadBtn.dataset.busy = '1';
      try { await refreshDienstplanTab(); } finally { delete reloadBtn.dataset.busy; }
    });
  }
}

// ── Benachrichtigungen bei Dienstplan-Änderungen (Web Push über den Worker) ─
// Der Worker prüft den Kalender per Zeitplan und schickt Mitteilungen; die App
// meldet hier nur das Gerät an/ab und zeigt die letzten Änderungen an.
const PUSH_ENDPOINT_KEY = 'etb_push_endpoint';
// Testmitteilungen – ein bisschen Wachenhumor (zufällig ausgewählt)
const PUSH_TEST_MESSAGES = [
  { title: '📻 Funkprobe', body: 'Hier Einsatztagebuch, wie hören Sie mich? Kommen! – Laut und deutlich. Mitteilungen funktionieren.' },
  { title: '🚨 Alarm! … oder doch nicht', body: 'Nur ein Test. Der Kaffee darf in Ruhe ausgetrunken werden. ☕' },
  { title: 'Neu: Dienst „Sofa“', body: 'Heute 20:00 – open end · Besatzung: du und die Fernbedienung. (Leider nur ein Test.)' },
  { title: 'Einsatzstichwort: TESTMITTEILUNG', body: 'Lage: alles ruhig. Maßnahme: weiterschlafen. 😴' },
  { title: 'NACA 0', body: 'Keine Erkrankung oder Verletzung. Nur eine kerngesunde Testmitteilung. ✅' },
  { title: 'Übergabe', body: 'Patientin „Benachrichtigung“: wach, orientiert, Kreislauf stabil. Übergabe ohne Besonderheiten.' },
  { title: 'Ausfall: Kaffeemaschine', body: 'Die Mitteilungen funktionieren. Die Kaffeemaschine auf der Wache leider weiterhin nicht.' },
  { title: 'Aktualisiert: Dienstplan', body: 'Vorher: Stress · Jetzt: Feierabend. (Wunschdenken – das ist nur ein Test.)' },
  { title: '🚑 Blaulicht an!', body: 'Keine Sorge, nur zur Deko. Die Testmitteilung ist sicher angekommen.' },
  { title: 'Rückmeldung vom Fahrzeug', body: 'Einsatzbereit, vollgetankt, Snacks an Bord. Mitteilungen: läuft.' },
];
const DP_CHANGES_KEY = 'etb_dp_changes';
const DP_CHANGES_DAYS = 7;
let launchTabAt = 0;

function workerBase() {
  const url = dpConfig().url;
  if (!url) return null;
  return window.RKDienstplan ? window.RKDienstplan.normalizeWorkerUrl(url) : url.replace(/\/dienstplan\.ics$/, '').replace(/\/+$/, '');
}

async function workerApi(path, { method = 'GET', body } = {}) {
  const base = workerBase();
  if (!base || !dpConfigured()) throw new Error('Dienstplan ist nicht verbunden.');
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + dpConfig().token }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (_) { throw new Error('Worker nicht erreichbar.'); }
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const msg = {
      push_not_configured: 'Der Worker unterstützt noch keine Benachrichtigungen.',
      unauthorized: 'Zugangsschlüssel passt nicht zum Worker.',
      not_found: 'Der Worker kennt diese Funktion noch nicht.',
      no_devices: 'Kein Gerät angemeldet.',
    }[data.error] || ('Fehler vom Worker (' + (data.error || res.status) + ').');
    const err = new Error(msg); err.code = data.error || res.status; throw err;
  }
  return data;
}

function pushSupport() {
  const ios = isIOSDevice();
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: ios && !standalone ? 'Auf dem iPhone gehen Mitteilungen nur in der Home-Bildschirm-App (Safari → Teilen → Zum Home-Bildschirm), ab iOS 16.4.' : 'Dieser Browser unterstützt keine Mitteilungen.' };
  }
  if (Notification.permission === 'denied') return { ok: false, reason: 'Mitteilungen sind blockiert. In den iOS-Einstellungen → Mitteilungen → Einsatztagebuch erlauben.' };
  return { ok: true };
}

function b64urlToBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function currentPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (_) { return null; }
}

async function enablePush() {
  const sup = pushSupport();
  if (!sup.ok) throw new Error(sup.reason);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt.');
  const { publicKey } = await workerApi('/push/key');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Anderer Schlüssel (z. B. neuer Worker) → neu anmelden
  if (sub && sub.options && sub.options.applicationServerKey) {
    const cur = new Uint8Array(sub.options.applicationServerKey);
    const want = b64urlToBytes(publicKey);
    if (cur.length !== want.length || cur.some((v, i) => v !== want[i])) { await sub.unsubscribe().catch(() => {}); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) });
  const label = isIOSDevice() ? 'iPhone' : (navigator.userAgentData && navigator.userAgentData.platform) || 'Gerät';
  await workerApi('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), label } });
  lsSet(PUSH_ENDPOINT_KEY, sub.endpoint);
}

async function disablePush() {
  const sub = await currentPushSubscription();
  const endpoint = (sub && sub.endpoint) || lsGet(PUSH_ENDPOINT_KEY);
  if (endpoint) await workerApi('/push/unsubscribe', { method: 'POST', body: { endpoint } }).catch(() => {});
  if (sub) await sub.unsubscribe().catch(() => {});
  lsSet(PUSH_ENDPOINT_KEY, '');
}

/** Baut die Gruppe „Benachrichtigungen“ in Einstellungen → Dienstplan auf. */
async function renderPushSettings(host) {
  if (!host) return;
  if (!dpConfigured()) { host.innerHTML = ''; return; }
  const sup = pushSupport();
  const sub = await currentPushSubscription();
  const active = !!(sub && lsGet(PUSH_ENDPOINT_KEY) === sub.endpoint && Notification.permission === 'granted');
  host.innerHTML = `
    <div class="set-group-header">Benachrichtigungen</div>
    <div class="set-group">
      ${active
        ? `<div class="set-row"><span class="set-row-text"><span class="set-row-title">Aktiv auf diesem Gerät</span><span class="set-row-sub" id="push-status">Status wird geladen…</span></span></div>
           <button type="button" class="set-row set-action" id="btn-push-test"><span class="set-row-text set-row-title">Testmitteilung senden</span></button>
           <button type="button" class="set-row set-destructive" id="btn-push-off"><span class="set-row-text set-row-title">Benachrichtigungen ausschalten</span></button>`
        : `<button type="button" class="set-row set-action" id="btn-push-on" ${sup.ok ? '' : 'disabled'}><span class="set-row-text set-row-title" style="font-weight:600">Bei Änderungen benachrichtigen</span></button>`}
    </div>
    <p class="set-group-footer">${escHtml(sup.ok
      ? 'Der Worker prüft den Dienstplan alle 10 Minuten und meldet neue, geänderte und ausgefallene Dienste – auch wenn die App geschlossen ist.'
      : sup.reason)}</p>`;
  const on = host.querySelector('#btn-push-on');
  if (on) on.addEventListener('click', async () => {
    on.disabled = true;
    try { await enablePush(); toast('Benachrichtigungen aktiv.', 'success'); }
    catch (err) { toast(err.message, 'error', 6000); }
    renderPushSettings(host);
  });
  const off = host.querySelector('#btn-push-off');
  if (off) off.addEventListener('click', async () => {
    off.disabled = true;
    await disablePush();
    toast('Benachrichtigungen ausgeschaltet.', 'success');
    renderPushSettings(host);
  });
  const test = host.querySelector('#btn-push-test');
  if (test) test.addEventListener('click', async () => {
    test.disabled = true;
    const m = PUSH_TEST_MESSAGES[Math.floor(Math.random() * PUSH_TEST_MESSAGES.length)];
    try { await workerApi('/push/test', { method: 'POST', body: { endpoint: sub.endpoint, title: m.title, body: m.body } }); toast('Testmitteilung gesendet.', 'success'); }
    catch (err) {
      // Anmeldung beim Worker verloren (z. B. neuer KV-Speicher) → neu anmelden
      if (err.code === 'no_devices') { try { await enablePush(); toast('Gerät neu angemeldet – bitte nochmal testen.', 'info', 4000); } catch (e2) { toast(e2.message, 'error', 6000); } }
      else toast(err.message, 'error', 6000);
    }
    test.disabled = false;
  });
  const st = host.querySelector('#push-status');
  if (st) {
    try {
      const s = await workerApi('/push/status');
      const when = s.lastCheck ? new Date(s.lastCheck) : null;
      st.textContent = (when ? `Zuletzt geprüft ${homeDayLabel(when, new Date())}, ${formatTimeHM(when)}` : 'Noch nicht geprüft')
        + (s.lastError ? ` · Fehler: ${s.lastError}` : '')
        + ` · ${s.devices} ${s.devices === 1 ? 'Gerät' : 'Geräte'}`;
    } catch (err) { st.textContent = err.message; }
  }
}

// — Änderungen im Dienstplan-Tab anzeigen ——————————————————————————————————
function readDpChanges() {
  try { const c = JSON.parse(lsGet(DP_CHANGES_KEY, 'null')); return c && Array.isArray(c.changes) ? c : null; } catch (_) { return null; }
}

/** Holt die letzten Änderungen vom Worker (still; ohne Push-Einrichtung leer). */
async function loadDpChanges() {
  if (!dpConfigured()) return null;
  try {
    const data = await workerApi('/push/changes');
    const entry = { at: Date.now(), changes: data.changes || [] };
    lsSet(DP_CHANGES_KEY, JSON.stringify(entry));
    return entry;
  } catch (_) { return readDpChanges(); }
}

function recentDpChanges() {
  const c = readDpChanges();
  if (!c) return [];
  const since = Date.now() - DP_CHANGES_DAYS * 86400000;
  return c.changes.filter((x) => x.at >= since);
}

/** Markierung für eine Dienstkarte: jüngste Änderung zu dieser UID. */
function dpChangeFor(shift, changes) {
  const st = new Date(shift.start).getTime();
  return changes.find((c) => c.type !== 'removed' && c.now && ((shift.uid && c.uid === shift.uid) || c.now.s === st)) || null;
}

function dpChangesPanelHtml(changes) {
  if (!changes.length) return '';
  const label = { added: 'Neu', updated: 'Geändert', removed: 'Ausfall' };
  const fmt = (x) => {
    const s = new Date(x.s), e = new Date(x.e);
    return `${s.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${formatTimeHM(s)}–${formatTimeHM(e)}`;
  };
  // Je Dienst eine Zeile: alle Änderungen desselben Termins zusammenfassen
  const groups = new Map();
  for (const c of changes) {
    const k = c.key || c.uid;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const items = [...groups.entries()].map(([key, list]) => {
    list.sort((x, y) => y.at - x.at);           // neueste zuerst
    const latest = list[0], oldest = list[list.length - 1];
    const type = latest.type === 'removed' ? 'removed' : list.some((c) => c.type === 'added') ? 'added' : 'updated';
    const x = latest.now || latest.before;
    const first = oldest.before; // Stand vor der ersten Änderung im Zeitraum
    const moved = type === 'updated' && first && x && (first.s !== x.s || first.e !== x.e);
    return { key, list, latest, type, x, first, moved };
  }).sort((p, q) => q.latest.at - p.latest.at);
  const rows = items.map(({ key, list, latest, type, x, first, moved }) => {
    const extra = moved ? ` <span class="dp-chg-old">vorher ${escHtml(fmt(first))}</span>` : '';
    const n = list.length;
    return `<div class="dp-chg-row" role="button" tabindex="0" data-hist="${escHtml(key)}">
      <span class="dp-chg-badge is-${type}">${label[type]}</span>
      <span class="dp-chg-main"><span class="dp-chg-title">${escHtml(x.t || 'Dienst')}${n > 1 ? ` <span class="dp-chg-n">${n} Änderungen</span>` : ''}</span><span class="dp-chg-sub">${escHtml(fmt(x))}${extra}</span></span>
      <span class="dp-chg-at">${escHtml(homeDayLabel(new Date(latest.at), new Date()))}</span>
    </div>`;
  }).join('');
  return `<details class="dp-chg" ${changes.some((c) => Date.now() - c.at < 86400000) ? 'open' : ''}>
    <summary>Änderungen der letzten ${DP_CHANGES_DAYS} Tage <span class="dp-chg-count">${items.length}</span></summary>
    <div class="dp-chg-list">${rows}</div>
  </details>`;
}

// — Verlauf pro Dienst (wie „Verlauf“ in der Dienstplan-App) ——————————————
const DP_HISTORY_KEY = 'etb_dp_history';

function readDpHistory() {
  try { const h = JSON.parse(lsGet(DP_HISTORY_KEY, 'null')); return h && h.history && typeof h.history === 'object' ? h.history : {}; } catch (_) { return {}; }
}

async function loadDpHistory() {
  if (!dpConfigured()) return readDpHistory();
  try {
    const data = await workerApi('/push/history');
    lsSet(DP_HISTORY_KEY, JSON.stringify({ at: Date.now(), history: data.history || {} }));
    return data.history || {};
  } catch (_) { return readDpHistory(); } // alter Worker oder offline → letzter Stand
}

/** Verlaufs-Schlüssel zu einem Dienstplan-Eintrag (UID, sonst gleicher Beginn). */
function historyKeyForShift(shift, history = readDpHistory()) {
  const st = new Date(shift.start).getTime();
  if (shift.uid && history[shift.uid] && history[shift.uid].last && (history[shift.uid].last.s === st || !Object.keys(history).some((k) => k.startsWith(shift.uid + '|')))) return shift.uid;
  return Object.keys(history).find((k) => history[k].last && history[k].last.s === st && (!shift.uid || history[k].uid === shift.uid)) || null;
}

/** Verlauf zu einem Tagebuch-Dienst: irgendein Stand beginnt ±90 min gleich. */
function historyKeyForService(svc, history = readDpHistory()) {
  const st = parseLocalDt(svc.startAt);
  if (!st || svc.isSeg) return null;
  let best = null, bestDiff = Infinity;
  for (const [k, item] of Object.entries(history)) {
    for (const e of item.entries || []) {
      for (const x of [e.now, e.before]) {
        if (!x) continue;
        const d = Math.abs(x.s - st.getTime());
        const sameVeh = svc.vehicle && x.t && svc.vehicle.toLowerCase() === x.t.toLowerCase();
        const score = d - (sameVeh ? 1 : 0);
        if (d < 5400000 && score < bestDiff) { best = k; bestDiff = score; }
      }
    }
  }
  return best;
}

function historyCountHtml(key, history) {
  const n = key && history[key] ? history[key].entries.length : 0;
  return n ? `<button type="button" class="hist-btn" data-hist="${escHtml(key)}" aria-label="Verlauf (${n} ${n === 1 ? 'Änderung' : 'Änderungen'})" title="Verlauf">${HIST_ICON}<span>${n}</span></button>` : '';
}
const HIST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 3.5V8h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function crewOf(desc) {
  if (!desc) return { colleagues: [], note: '' };
  if (window.RKDienstplan && window.RKDienstplan.parseDescription) {
    try { const r = window.RKDienstplan.parseDescription(desc); return { colleagues: mergeCrewTitles(r.colleagues), note: r.note }; } catch (_) {}
  }
  const lines = desc.split('\n');
  return { colleagues: parseCrew(lines[0]), note: lines.slice(1).join('\n') };
}

function histFmtRange(x) {
  const s = new Date(x.s), e = new Date(x.e);
  return `${s.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${formatTimeHM(s)}–${formatTimeHM(e)}`;
}

function histFmtAt(ms) {
  const d = new Date(ms);
  return `${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })} um ${formatTimeHM(d)}`;
}

/** Liste der Unterschiede zwischen zwei Ständen (für „Geändert“). */
function historyDiffHtml(b, n) {
  const rows = [];
  const row = (label, from, to) => rows.push(`<div class="hist-diff"><span class="hist-diff-label">${label}</span><span class="hist-diff-val"><s>${escHtml(from || '—')}</s> → <strong>${escHtml(to || '—')}</strong></span></div>`);
  if (b.s !== n.s || b.e !== n.e) row('Zeit', histFmtRange(b), histFmtRange(n));
  if (b.t !== n.t) row('Fahrzeug', b.t, n.t);
  if (b.l !== n.l) row('Ort', b.l, n.l);
  if (b.d !== n.d) {
    const cb = crewOf(b.d), cn = crewOf(n.d);
    const norm = (x) => x.toLowerCase().replace(/\s+/g, ' ').trim();
    const oldSet = new Set(cb.colleagues.map(norm)), newSet = new Set(cn.colleagues.map(norm));
    const added = cn.colleagues.filter((x) => !oldSet.has(norm(x)));
    const removed = cb.colleagues.filter((x) => !newSet.has(norm(x)));
    if (added.length || removed.length) {
      rows.push(`<div class="hist-diff"><span class="hist-diff-label">Besatzung</span><span class="hist-diff-val">${
        added.map((x) => `<span class="hist-crew is-add">+ ${escHtml(x)}</span>`).join('')}${
        removed.map((x) => `<span class="hist-crew is-del">− ${escHtml(x)}</span>`).join('')}</span></div>`);
    }
    if ((cb.note || '') !== (cn.note || '')) row('Info', cb.note, cn.note);
    if (!added.length && !removed.length && (cb.note || '') === (cn.note || '')) row('Beschreibung', b.d, n.d);
  }
  return rows.join('') || '<div class="hist-diff"><span class="hist-diff-val">Kleine Änderung im Kalendereintrag</span></div>';
}

function historyEntryHtml(e) {
  const label = { added: 'Neu', updated: 'Geändert', removed: 'Ausfall' }[e.type] || e.type;
  let body = '';
  if (e.type === 'added' && e.now) {
    const crew = crewOf(e.now.d).colleagues;
    body = `<div class="hist-detail">${escHtml([histFmtRange(e.now), e.now.t, e.now.l].filter(Boolean).join(' · '))}</div>${crew.length ? `<div class="hist-detail is-muted">👥 ${escHtml(crew.join(' · '))}</div>` : ''}`;
  } else if (e.type === 'updated' && e.now && e.before) {
    body = historyDiffHtml(e.before, e.now);
  } else if (e.type === 'removed' && e.before) {
    body = `<div class="hist-detail">Aus dem Dienstplan entfernt: ${escHtml(histFmtRange(e.before))}</div>`;
  }
  return `<li class="hist-item is-${e.type}">
    <span class="hist-dot" aria-hidden="true"></span>
    <div class="hist-head"><span class="dp-chg-badge is-${e.type}">${label}</span><span class="hist-at">am ${escHtml(histFmtAt(e.at))}</span></div>
    ${body}
  </li>`;
}

function openHistorySheet(key) {
  const history = readDpHistory();
  const item = history[key];
  const box = document.getElementById('hist-body');
  if (!box) return;
  if (!item) { toast('Zu diesem Dienst gibt es keinen Verlauf.', 'info'); return; }
  const last = item.last || {};
  const removed = item.entries.length && item.entries[item.entries.length - 1].type === 'removed';
  document.getElementById('hist-title').textContent = last.t || 'Dienst';
  box.innerHTML = `
    <div class="hist-summary${removed ? ' is-removed' : ''}">
      ${shiftCodeHtml(new Date(last.s), 'is-small')}
      <span>${escHtml(histFmtRange(last))}${last.l ? ' · ' + escHtml(last.l) : ''}</span>
      ${removed ? '<span class="dp-chg-badge is-removed">Ausgefallen</span>' : ''}
    </div>
    <ol class="hist-list">${item.entries.slice().reverse().map(historyEntryHtml).join('')}</ol>
    <p class="hist-foot">Aufgezeichnet vom Dienstplan-Worker seit dem Einrichten der Benachrichtigungen. Gespeichert bis 30 Tage nach Dienstende.</p>`;
  openDialog('dialog-history');
}

/** Klicks auf Verlaufs-Knöpfe überall in der App (eine Stelle für alle). */
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-hist]');
  if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  openHistorySheet(btn.dataset.hist);
});

// Öffnen aus einer Mitteilung (#dienstplan) bzw. Nachricht vom Service Worker
function handleLaunchTarget(hash = location.hash) {
  const m = /^#verlauf=(.+)$/.exec(hash || '');
  if (hash === '#dienstplan' || m) {
    if (hash === location.hash) history.replaceState(null, '', location.pathname + location.search);
    switchTab('dienstplan');
    if (m) {
      const key = decodeURIComponent(m[1]);
      // Verlauf erst frisch laden, dann öffnen (Mitteilung kann neuer sein als der Speicher)
      loadDpHistory().then(() => openHistorySheet(key)).catch(() => openHistorySheet(key));
    }
    return true;
  }
  return false;
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'open-url' && typeof e.data.hash === 'string') {
      launchTabAt = Date.now(); // verhindert das automatische Zurück zu „Start“ beim Aufwachen
      if (!topVisibleOverlay() || /^#verlauf=/.test(e.data.hash)) handleLaunchTarget(e.data.hash);
    }
  });
}

// ── iOS-Navigation: Navigationsleiste, Stack, Wischgesten, Sheets ─────────
// Unterseiten gehören zu einem Tab (Favoriten → Tagebuch). Der Tab-Button bleibt
// dabei aktiv, ein erneuter Tipp darauf führt zurück zur Tab-Wurzel.
const TAB_ROOT = { favoriten: 'dienste' };
const TAB_TITLES = {
  home: 'Start', dienste: 'Tagebuch', statistik: 'Statistik',
  dienstplan: 'Dienstplan', favoriten: 'Favoriten', einstellungen: 'Einstellungen',
};
let navAnimating = false;
let serviceListScrollTop = 0;
let navBarRaf = 0;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Liefert die übergeordnete Ebene der aktuellen Ansicht (oder null auf Tab-Wurzel). */
function getBackTarget() {
  if (activeTab === 'dienste' && selectedServiceId && isMobile()) {
    const top = document.getElementById('service-detail-panel');
    const under = document.getElementById('service-list-panel');
    if (!top || !under) return null;
    return {
      label: TAB_TITLES.dienste, top, under,
      pop: () => {
        selectedServiceId = null;
        renderServiceList();
        renderServiceDetail();
        under.scrollTop = serviceListScrollTop;
      },
    };
  }
  if (activeTab === 'einstellungen' && settingsSub) {
    const top = document.getElementById('settings-sub');
    const under = document.getElementById('settings-root');
    if (!top || !under) return null;
    return { label: TAB_TITLES.einstellungen, top, under, pop: closeSettingsPage };
  }
  if (TAB_ROOT[activeTab]) {
    const parent = TAB_ROOT[activeTab];
    const top = document.getElementById('tab-' + activeTab);
    const under = document.getElementById('tab-' + parent);
    if (!top || !under) return null;
    return { label: TAB_TITLES[parent], top, under, pop: () => switchTab(parent) };
  }
  return null;
}

function isServiceDetailView() {
  return activeTab === 'dienste' && !!selectedServiceId && isMobile();
}

function getActiveScrollers() {
  if (activeTab === 'dienste') {
    if (!isMobile()) return [document.getElementById('service-list'), document.getElementById('service-detail-panel')].filter(Boolean);
    return [document.getElementById(selectedServiceId ? 'service-detail-panel' : 'service-list-panel')].filter(Boolean);
  }
  if (activeTab === 'einstellungen') {
    const el = document.getElementById(settingsSub ? 'settings-sub' : 'settings-root');
    return el ? [el] : [];
  }
  const el = document.getElementById('tab-' + activeTab);
  return el ? [el] : [];
}

function scrollActiveToTop() {
  getActiveScrollers().forEach((el) => {
    el.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
}

function navTitleText() {
  if (isServiceDetailView()) {
    const svc = state.services.find((s) => s.id === selectedServiceId);
    if (svc) {
      const d = parseLocalDt(svc.startAt);
      const date = d ? d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '';
      return date || (svc.isSeg ? 'SEG' : 'Dienst');
    }
  }
  if (activeTab === 'einstellungen' && settingsSub) return SETTINGS_PAGES[settingsSub];
  return TAB_TITLES[activeTab] || '';
}

function updateNavBar() {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  const target = getBackTarget();
  const back = document.getElementById('nav-back');
  if (back) {
    back.hidden = !target;
    const lbl = document.getElementById('nav-back-label');
    // Wie iOS: zu langer Zurück-Text wird zu „Zurück“, damit er den Titel nicht überdeckt
    if (target && lbl) lbl.textContent = target.label.length > 10 && isMobile() ? 'Zurück' : target.label;
  }
  const titleEl = document.getElementById('nav-title');
  if (titleEl) titleEl.textContent = navTitleText();
  const scroller = getActiveScrollers()[0];
  const y = scroller ? scroller.scrollTop : 0;
  bar.classList.toggle('scrolled', y > 2);
  // Kleiner Titel erscheint, sobald der große Titel unter der Leiste verschwindet.
  // Detailansichten haben keinen großen Titel → Titel immer sichtbar.
  bar.classList.toggle('show-title', isServiceDetailView() || (activeTab === 'einstellungen' && !!settingsSub) || y > 40);
}

function scheduleNavBarUpdate() {
  if (navBarRaf) return;
  navBarRaf = requestAnimationFrame(() => { navBarRaf = 0; updateNavBar(); });
}

// — Übergänge (Push/Pop) ————————————————————————————————————————————————
function setNavProgress(t, x, w) {
  const p = Math.max(0, Math.min(1, x / w));
  t.top.style.transform = `translate3d(${x}px,0,0)`;
  t.under.style.transform = `translate3d(${(p - 1) * w * 0.3}px,0,0)`;
  t.under.style.opacity = String(0.5 + 0.5 * p);
}

function beginNavLayers(t) {
  navAnimating = true;
  t.under.classList.add('nav-under');
  t.top.classList.add('nav-top');
  if (t.under.id === 'service-list-panel') t.under.scrollTop = serviceListScrollTop;
  [t.top, t.under].forEach((el) => { el.style.transition = 'none'; });
}

function endNavLayers(t) {
  [t.top, t.under].forEach((el) => {
    el.classList.remove('nav-under', 'nav-top');
    el.style.transform = ''; el.style.opacity = ''; el.style.transition = '';
  });
  navAnimating = false;
}

function animateNavTo(t, fromX, toX, done, duration) {
  const w = t.top.clientWidth || window.innerWidth;
  setNavProgress(t, fromX, w);
  void t.top.offsetWidth; // Reflow, damit die Transition vom Startwert aus läuft
  const ms = duration || 380;
  const tr = `transform ${ms}ms cubic-bezier(.32,.72,0,1), opacity ${ms}ms cubic-bezier(.32,.72,0,1)`;
  t.top.style.transition = tr;
  t.under.style.transition = tr;
  setNavProgress(t, toX, w);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    t.top.removeEventListener('transitionend', onEnd);
    done();
  };
  function onEnd(e) { if (e.target === t.top && e.propertyName === 'transform') finish(); }
  t.top.addEventListener('transitionend', onEnd);
  setTimeout(finish, ms + 80);
}

function pushAnimated(t) {
  if (!t || prefersReducedMotion()) return;
  beginNavLayers(t);
  const w = t.top.clientWidth || window.innerWidth;
  animateNavTo(t, w, 0, () => endNavLayers(t));
}

function popAnimated(t) {
  if (!t) return;
  if (prefersReducedMotion() || !isMobile()) { t.pop(); return; }
  beginNavLayers(t);
  const w = t.top.clientWidth || window.innerWidth;
  animateNavTo(t, 0, w, () => { t.pop(); endNavLayers(t); });
}

function topVisibleOverlay() {
  const open = [...document.querySelectorAll('.dialog-overlay')]
    .filter((o) => !o.classList.contains('closing') && getComputedStyle(o).display !== 'none');
  return open.length ? open[open.length - 1] : null;
}

function dismissOverlay(ov) {
  if (ov.id) closeDialog(ov.id);
  else finalizeDialogClose(ov);
}

// — Wischgeste nach rechts: zurück zur übergeordneten Ebene ————————————————
const SWIPE_IGNORE = 'input:focus, textarea, select, iframe, #heatmap-container, #heatmap-section, .einsatzmittel-row, .suggestions-dropdown, [data-no-swipe]';

function initSwipeBack() {
  let g = null;
  document.addEventListener('touchstart', (e) => {
    g = null;
    if (navAnimating || e.touches.length !== 1 || topVisibleOverlay()) return;
    const target = getBackTarget();
    if (!target || !isMobile()) return;
    if (e.target.closest && e.target.closest(SWIPE_IGNORE)) return;
    const p = e.touches[0];
    if (e.target.closest && e.target.closest('.swipe-row') && p.clientX >= 24) return; // Zeilen-Wischen
    g = { t: target, x0: p.clientX, y0: p.clientY, x: p.clientX, lastX: p.clientX, lastT: e.timeStamp, v: 0, active: false };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!g) return;
    const p = e.touches[0];
    const dx = p.clientX - g.x0;
    const dy = p.clientY - g.y0;
    if (!g.active) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.2) { g = null; return; }
      if (dx < -10) { g = null; return; }
      if (dx > 10 && dx > Math.abs(dy) * 1.1) {
        g.active = true;
        g.x0 = p.clientX - 1; // weicher Start ohne Sprung
        beginNavLayers(g.t);
        g.w = g.t.top.clientWidth || window.innerWidth;
      } else return;
    }
    e.preventDefault();
    const x = Math.max(0, p.clientX - g.x0);
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.v = (p.clientX - g.lastX) / dt;
    g.lastX = p.clientX; g.lastT = e.timeStamp; g.x = x;
    setNavProgress(g.t, x, g.w);
  }, { passive: false });

  const end = () => {
    if (!g) return;
    const st = g; g = null;
    if (!st.active) return;
    const commit = st.x > st.w * 0.3 || (st.v > 0.3 && st.x > 24);
    if (commit) {
      const ms = Math.max(160, Math.min(340, (st.w - st.x) / Math.max(st.v, 1.2)));
      animateNavTo(st.t, st.x, st.w, () => { st.t.pop(); endNavLayers(st.t); }, ms);
    } else {
      animateNavTo(st.t, st.x, 0, () => endNavLayers(st.t), 260);
    }
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
}

// — Sheets: am Griff/Kopf nach unten ziehen zum Schließen ——————————————————
function initSheetGestures() {
  let g = null;
  document.addEventListener('touchstart', (e) => {
    g = null;
    if (!isMobile() || e.touches.length !== 1 || !e.target.closest) return;
    // Überall im Fenster ziehbar, sobald der Inhalt ganz oben steht (wie iOS)
    const box = e.target.closest('.dialog-box');
    const ov = box && box.closest('.dialog-overlay');
    if (!ov || !box || ov.classList.contains('closing')) return;
    if (e.target.closest('textarea, select, .suggestions-dropdown, .chip-del')) return;
    if (box.scrollTop > 0) return;
    for (let el = e.target; el && el !== box; el = el.parentElement) {
      if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return; // innerer Bereich gescrollt
    }
    const p = e.touches[0];
    g = { ov, box, x0: p.clientX, y0: p.clientY, y: 0, lastY: p.clientY, lastT: e.timeStamp, v: 0, active: false };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!g) return;
    const p = e.touches[0];
    const dx = p.clientX - g.x0;
    const dy = p.clientY - g.y0;
    if (!g.active) {
      if (dy > 8 && dy > Math.abs(dx) * 1.2) {
        if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) document.activeElement.blur();
        g.active = true;
        g.box.style.animation = 'none';
        g.box.style.transition = 'none';
        g.ov.style.transition = 'none';
      } else if (Math.abs(dx) > 10 || dy < -6) { g = null; return; } else return;
    }
    e.preventDefault();
    const y = Math.max(0, dy);
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.v = (p.clientY - g.lastY) / dt;
    g.lastY = p.clientY; g.lastT = e.timeStamp; g.y = y;
    g.box.style.transform = `translate3d(0,${y}px,0)`;
    const h = g.box.offsetHeight || 1;
    g.ov.style.backgroundColor = `rgba(0,0,0,${(0.5 * (1 - Math.min(1, y / h))).toFixed(3)})`;
  }, { passive: false });

  const end = () => {
    if (!g) return;
    const st = g; g = null;
    if (!st.active) return;
    const h = st.box.offsetHeight || 1;
    if (st.y > Math.min(150, h * 0.3) || (st.v > 0.5 && st.y > 20)) {
      st.box.style.transition = 'transform .26s cubic-bezier(.4,0,1,1)';
      st.ov.style.transition = 'background-color .26s ease';
      st.box.style.transform = 'translate3d(0,100%,0)';
      st.ov.style.backgroundColor = 'rgba(0,0,0,0)';
      clearTimeout(st.ov._closeTimer);
      st.ov._closeTimer = setTimeout(() => finalizeDialogClose(st.ov), 270);
    } else {
      st.box.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
      st.ov.style.transition = 'background-color .3s ease';
      st.box.style.transform = '';
      st.ov.style.backgroundColor = '';
    }
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
}

function initIosNavigation() {
  const back = document.getElementById('nav-back');
  if (back) {
    back.addEventListener('click', () => {
      if (navAnimating) return;
      popAnimated(getBackTarget());
    });
  }
  // Scroll-Position steuert Leistenhintergrund und kleinen Titel
  document.addEventListener('scroll', (e) => {
    if (getActiveScrollers().includes(e.target)) scheduleNavBarUpdate();
  }, true);
  window.addEventListener('resize', scheduleNavBarUpdate);
  // Escape schließt das oberste Fenster (Tastatur am iPad / Desktop)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Escape in einem Vorschlagsfeld schließt nur die Vorschlagsliste
    if (e.target.closest && e.target.closest('.suggestion-wrap, .pzc-search-wrap, .sf-suggestion-wrap')) return;
    const ov = topVisibleOverlay();
    if (ov) dismissOverlay(ov);
  });
  if (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches) {
    document.documentElement.classList.add('is-standalone');
  }
  // Systemwechsel hell/dunkel (Darstellung „Wie System“)
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const onScheme = () => { if (currentTheme() === 'system') applyTheme('system'); };
  if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
  initSwipeBack();
  initSheetGestures();
  initSwipeRows();
  enablePullToRefresh(document.getElementById('tab-dienstplan'), refreshDienstplanTab, () => activeTab === 'dienstplan' && dpConfigured());
  enablePullToRefresh(document.getElementById('tab-home'), refreshHomeTab, () => activeTab === 'home');
  initStatusBarTap();
  // Tipp auf die Navigationsleiste (außer „Zurück“) → ebenfalls nach oben
  const topbar = document.getElementById('topbar');
  if (topbar) topbar.addEventListener('click', (e) => { if (!e.target.closest('#nav-back, button, a')) scrollActiveToTop(); });
  updateNavBar();
}

// ── Ziehen zum Aktualisieren (wie in RKTel) ────────────────────────────────
// Am Seitenanfang nach unten ziehen → loslassen lädt neu. Gilt für Start und
// Dienstplan. Die Anzeige ist eine kleine Pille unter der Navigationsleiste.
const PTR_THRESHOLD = 70;
const PTR_MAX = 110;
let ptrBusy = false;

function ptrPill() {
  let el = document.getElementById('ptr-pill');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ptr-pill';
    el.className = 'ptr-pill';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="ptr-icon">↓</span><span class="ptr-text">Zum Aktualisieren ziehen</span>';
    document.body.appendChild(el);
  }
  return el;
}

function ptrShow(dist, state) {
  const el = ptrPill();
  const ready = state === 'ready';
  el.classList.add('visible');
  el.classList.toggle('ready', ready || state === 'loading');
  el.classList.toggle('loading', state === 'loading');
  el.style.transform = `translate(-50%, ${Math.round(Math.min(dist, PTR_MAX) - 50)}px)`;
  el.querySelector('.ptr-icon').textContent = state === 'loading' ? '↻' : state === 'done' ? '✓' : ready ? '↻' : '↓';
  el.querySelector('.ptr-text').textContent = state === 'loading' ? 'Wird aktualisiert…' : state === 'done' ? 'Aktualisiert' : ready ? 'Loslassen zum Aktualisieren' : 'Zum Aktualisieren ziehen';
}

function ptrHide() {
  const el = document.getElementById('ptr-pill');
  if (!el) return;
  el.classList.remove('visible', 'ready', 'loading');
  el.style.transform = '';
}

/** Aktiviert Ziehen-zum-Aktualisieren auf einem Scroll-Bereich. */
function enablePullToRefresh(scroller, onRefresh, isEnabled = () => true) {
  if (!scroller) return;
  let startY = null, startX = 0, dist = 0;
  scroller.addEventListener('touchstart', (e) => {
    startY = null;
    if (e.touches.length !== 1 || ptrBusy || scroller.scrollTop > 0 || topVisibleOverlay() || !isEnabled()) return;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; dist = 0;
  }, { passive: true });
  scroller.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    const dx = Math.abs(e.touches[0].clientX - startX);
    // nur senkrechtes Ziehen nach unten am Seitenanfang zählt
    if (dy <= 0 || dx > dy || scroller.scrollTop > 0) {
      if (scroller.scrollTop > 0 || dx > Math.abs(dy)) startY = null;
      dist = 0; ptrHide(); return;
    }
    dist = Math.min(PTR_MAX, dy * 0.5);
    if (dist > 8) ptrShow(dist, dist >= PTR_THRESHOLD ? 'ready' : 'pull');
  }, { passive: true });
  const end = async () => {
    if (startY === null) return;
    const trigger = dist >= PTR_THRESHOLD;
    startY = null; dist = 0;
    if (!trigger) { ptrHide(); return; }
    ptrBusy = true;
    ptrShow(PTR_THRESHOLD, 'loading');
    try { await onRefresh(); ptrShow(PTR_THRESHOLD, 'done'); }
    catch (_) { /* Fehler zeigt die Ansicht selbst */ }
    finally { setTimeout(() => { ptrHide(); ptrBusy = false; }, 600); }
  };
  scroller.addEventListener('touchend', end);
  scroller.addEventListener('touchcancel', () => { startY = null; dist = 0; ptrHide(); });
}

/** Lässt den Worker sofort auf Änderungen prüfen (Verlauf + Mitteilungen wie beim Zeitplan). */
async function workerCheckNow() {
  if (!dpConfigured()) return null;
  try { return await workerApi('/push/check', { method: 'POST', body: {} }); }
  catch (_) { return null; } // älterer Worker oder ohne Benachrichtigungen – dann nur neu laden
}

async function refreshDienstplanTab() {
  icsLastError = null;
  const check = workerCheckNow(); // parallel zum Laden des Kalenders
  await loadDpShifts(true);
  await check;
  await Promise.all([loadDpChanges(), loadDpHistory()]);
  const cache = readIcsCache();
  const box = document.getElementById('dienstplan-container');
  if (cache && box && activeTab === 'dienstplan') renderDpShifts(cache.shifts, box);
}

async function refreshHomeTab() {
  if (dpConfigured()) {
    icsLastError = null;
    const check = workerCheckNow();
    await getIcsShifts(true).catch(() => {});
    await check;
    await Promise.all([loadDpChanges(), loadDpHistory()]);
  }
  await renderHome();
}

// ── Tippen auf die Statusleiste (Uhrzeit) → nach oben ─────────────────────
// iOS scrollt dabei nur das Dokument selbst. Die App scrollt in eigenen
// Bereichen; deshalb steht das Dokument 1 px tiefer. Springt es durch den
// Tipp auf die Statusleiste auf 0, wird die aktuelle Ansicht nach oben
// gescrollt und das Dokument wieder um 1 px versetzt.
let lastTouchAt = 0;
function initStatusBarTap() {
  if (!isIOSDevice() && !/[?&]sbtap=1/.test(location.search)) return;
  document.documentElement.classList.add('sb-tap');
  const arm = () => { if (window.scrollY < 1) window.scrollTo(0, 1); };
  const touch = () => { lastTouchAt = Date.now(); };
  ['touchstart', 'touchmove', 'touchend'].forEach((t) => document.addEventListener(t, touch, { passive: true, capture: true }));
  window.addEventListener('scroll', () => {
    if (window.scrollY > 0) return;
    const userGesture = Date.now() - lastTouchAt < 500;
    if (!userGesture && !isTypingSomewhere()) {
      const ov = topVisibleOverlay();
      if (ov) {
        const body = ov.querySelector('.dialog-body') || ov.querySelector('.dialog-box');
        if (body) body.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      } else {
        scrollActiveToTop();
      }
    }
    setTimeout(arm, 350);
  }, { passive: true });
  window.addEventListener('resize', () => setTimeout(arm, 300));
  document.addEventListener('focusout', () => setTimeout(arm, 400));
  setTimeout(arm, 50);
}

// ── App-Lebenszyklus: Stabilität im Alltag ─────────────────────────────────

// Beim Öffnen der App (Kaltstart) und nach längerer Pause im Hintergrund
// geht es immer zu „Start“.
const UI_RESET_AFTER = 10 * 60 * 1000;
let hiddenSince = 0;

function restoreUiState() {
  lsSet('etb_ui_state', null); // Altlast: früher gemerkte letzte Ansicht
  if (!handleLaunchTarget()) switchTab('home');
}

/** Zurück zur Startseite, alle Unterseiten schließen (nicht bei offenen Fenstern). */
function resetToHome() {
  if (topVisibleOverlay() || navAnimating) return false;
  if (settingsSub) { settingsSub = null; document.getElementById('tab-einstellungen').classList.remove('sub-open'); }
  selectedServiceId = null;
  renderServiceList(); renderServiceDetail();
  switchTab('home');
  ['tab-home', 'service-list-panel', 'settings-root'].forEach((id) => { const el = document.getElementById(id); if (el) el.scrollTop = 0; });
  return true;
}

function isTypingSomewhere() {
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}

// Ansicht auffrischen (z. B. Countdown, laufender Dienst), ohne den
// Anwender zu stören: nicht während Eingaben, Dialogen oder Animationen.
function refreshActiveView(reason) {
  if (document.hidden || navAnimating || isTypingSomewhere() || topVisibleOverlay()) return;
  if (activeTab === 'home') {
    renderHome().catch(() => {});
  } else if (activeTab === 'dienste' && reason !== 'tick') { renderServiceList(); renderServiceDetail(); }
  else if (activeTab === 'dienstplan' && reason === 'resume') loadDpShifts().catch(() => {});
}

function initAppLifecycle() {
  // Klicks auf ein sich gerade schließendes Fenster verwerfen
  // (verhindert doppelt angelegte Dienste/Einsätze bei Doppeltipp).
  document.addEventListener('click', (e) => {
    const ov = e.target.closest && e.target.closest('.dialog-overlay.closing');
    if (ov) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // Rückkehr aus dem Hintergrund: Uhr, Countdown & Daten sofort aktuell
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenSince = Date.now(); return; }
    const away = hiddenSince ? Date.now() - hiddenSince : 0;
    hiddenSince = 0;
    if (away > UI_RESET_AFTER && activeTab !== 'home' && Date.now() - launchTabAt > 5000 && resetToHome()) return;
    refreshActiveView('resume');
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) refreshActiveView('resume'); });

  // Countdown/„läuft noch“-Anzeigen jede Minute nachführen
  setInterval(() => refreshActiveView('tick'), 60 * 1000);

  // Änderungen aus einem zweiten Fenster (Safari + Homescreen-App) übernehmen,
  // damit sich die beiden nicht gegenseitig Daten überschreiben.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue === null) return;
    try {
      state = normalizeState(JSON.parse(e.newValue));
      if (selectedServiceId && !state.services.some((s) => s.id === selectedServiceId)) selectedServiceId = null;
      renderServiceList(); renderServiceDetail();
      refreshActiveView('sync');
    } catch (_) {}
  });

  // Netzstatus sichtbar machen
  window.addEventListener('offline', () => toast('Offline – Einträge werden lokal gespeichert.', 'info', 3500));
  window.addEventListener('online', () => {
    toast('Wieder online.', 'success', 2000);
    if (activeTab === 'home' || activeTab === 'dienstplan') { icsLastError = null; refreshActiveView('resume'); }
  });

  // Unerwartete Fehler abfangen und melden statt still hängen zu bleiben
  let lastErrAt = 0;
  const report = (msg) => {
    if (Date.now() - lastErrAt < 3000) return;
    lastErrAt = Date.now();
    toast('Unerwarteter Fehler: ' + msg, 'error', 5000);
    // Hängende Übergänge zurücksetzen, damit die App bedienbar bleibt
    document.querySelectorAll('.nav-under, .nav-top').forEach((el) => {
      el.classList.remove('nav-under', 'nav-top');
      el.style.transform = ''; el.style.opacity = ''; el.style.transition = '';
    });
    navAnimating = false;
  };
  window.addEventListener('error', (e) => { if (e.error || e.message) report(e.message || String(e.error)); });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report(r && r.message ? r.message : String(r));
  });

  // Bildschirmtastatur: Tab Bar ausblenden, Eingabefeld sichtbar halten
  document.addEventListener('focusin', (e) => {
    if (!isMobile() || !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (/^(checkbox|radio|button|submit|file|range|color)$/i.test(e.target.type || '')) return;
    document.body.classList.add('kb-open');
    setTimeout(() => {
      if (document.activeElement === e.target && e.target.scrollIntoView) e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 320);
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!isTypingSomewhere()) document.body.classList.remove('kb-open'); }, 80);
  });

  // Daten vor automatischer Löschung durch den Browser schützen
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); }).catch(() => {});
  }

  // Neue App-Version: Hinweis zum Neuladen anbieten
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    let shown = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (shown) return;
      shown = true;
      const t = toast('Neue Version verfügbar – tippen zum Aktualisieren.', 'info', 15000);
      t.addEventListener('click', () => window.location.reload());
    });
  }
}

// ── Wischaktionen in Listen (wie iOS) ──────────────────────────────────────
// Nach links wischen: „Löschen“ erscheint (ganz durchwischen löscht direkt),
// nach rechts wischen: Bearbeiten öffnen. Vom linken Rand aus bleibt das
// Wischen die Zurück-Geste.
const SWIPE_ACTION_W = 88;
let swipeOpenWrap = null;

const ICON_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15M9.5 6.5V4.8c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3v1.7M6.5 6.5l.9 12.6c.1.8.7 1.4 1.5 1.4h6.2c.8 0 1.4-.6 1.5-1.4l.9-12.6"/></svg>';

/**
 * Macht eine Listenzeile wischbar.
 * opts.edit: () => void              – rechts wischen
 * opts.del:  { confirm?, run }        – links wischen / Löschen-Knopf
 */
function enableSwipe(row, opts) {
  if (!row || row.closest('.swipe-wrap') || (!opts.edit && !opts.del)) return;
  const wrap = document.createElement('div');
  wrap.className = 'swipe-wrap';
  row.parentNode.insertBefore(wrap, row);
  wrap.innerHTML = `
    ${opts.edit ? `<div class="swipe-act swipe-act-edit" aria-hidden="true"><span class="swipe-act-inner">${ICON_EDIT}<span>Bearbeiten</span></span></div>` : ''}
    ${opts.del ? `<div class="swipe-act swipe-act-del"><button type="button" class="swipe-del-btn" tabindex="-1">${ICON_TRASH}<span>Löschen</span></button></div>` : ''}`;
  wrap.appendChild(row);
  row.classList.add('swipe-row');
  wrap._swipe = opts;
  const delBtn = wrap.querySelector('.swipe-del-btn');
  if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); swipeDelete(wrap); });
}

function swipeSet(wrap, x, animate) {
  const row = wrap.querySelector('.swipe-row');
  row.style.transition = animate ? 'transform .3s cubic-bezier(.32,.72,0,1)' : 'none';
  row.style.transform = x ? `translate3d(${x}px,0,0)` : '';
  wrap.classList.toggle('swiping-left', x < 0);
  wrap.classList.toggle('swiping-right', x > 0);
  wrap._x = x;
}

function swipeClose(wrap, animate = true) {
  if (!wrap) return;
  swipeSet(wrap, 0, animate);
  wrap.classList.remove('swipe-full', 'swipe-armed', 'swipe-open');
  if (swipeOpenWrap === wrap) swipeOpenWrap = null;
}

function swipeDelete(wrap) {
  const del = wrap._swipe && wrap._swipe.del;
  if (!del) return;
  if (del.confirm && !del.confirm()) { swipeClose(wrap); return; }
  // Zeile hinausschieben, dann zusammenklappen – erst danach wirklich löschen
  const w = wrap.offsetWidth || window.innerWidth;
  wrap.classList.add('swipe-full');
  swipeSet(wrap, -w, true);
  wrap.style.height = wrap.offsetHeight + 'px';
  setTimeout(() => {
    wrap.classList.add('swipe-collapsing');
    wrap.style.height = '0px';
  }, 180);
  setTimeout(() => {
    swipeOpenWrap = null;
    del.run();
    // Abgebrochen (z. B. eigene Rückfrage verneint)? Zeile wiederherstellen.
    setTimeout(() => {
      if (document.contains(wrap)) {
        wrap.classList.remove('swipe-collapsing');
        wrap.style.height = '';
        swipeClose(wrap);
      }
    }, 60);
  }, 430);
}

function initSwipeRows() {
  let g = null;
  document.addEventListener('touchstart', (e) => {
    g = null;
    if (e.touches.length !== 1 || !e.target.closest) return;
    const p = e.touches[0];
    // Geöffnete Zeile schließen, wenn woanders hingetippt wird
    if (swipeOpenWrap && !e.target.closest('.swipe-del-btn')) {
      const sameRow = swipeOpenWrap.contains(e.target);
      swipeClose(swipeOpenWrap);
      if (sameRow) { g = { suppress: true }; return; }
    }
    const row = e.target.closest('.swipe-row');
    if (!row || navAnimating) return;
    if (p.clientX < 24) return; // linker Rand = Zurück-Geste
    if (e.target.closest('input, textarea, select')) return;
    g = { wrap: row.parentElement, x0: p.clientX, y0: p.clientY, active: false, lastX: p.clientX, lastT: e.timeStamp, v: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!g || g.suppress || !g.wrap) return;
    const p = e.touches[0];
    const dx = p.clientX - g.x0, dy = p.clientY - g.y0;
    if (!g.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const o = g.wrap._swipe;
      if ((dx > 0 && !o.edit) || (dx < 0 && !o.del)) { g = null; return; }
      g.active = true;
      g.w = g.wrap.offsetWidth || window.innerWidth;
    }
    e.preventDefault();
    e.stopPropagation();
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.v = (p.clientX - g.lastX) / dt;
    g.lastX = p.clientX; g.lastT = e.timeStamp;
    let x = dx;
    if (x > 0) x = Math.min(x, g.w * 0.6) * (x > 120 ? 0.9 : 1);
    swipeSet(g.wrap, x, false);
    g.wrap.classList.toggle('swipe-full', x < -g.w * 0.55);
    g.wrap.classList.toggle('swipe-armed', x > 80);
    g.x = x;
  }, { passive: false });

  const end = () => {
    if (!g) return;
    const st = g; g = null;
    if (st.suppress || !st.active) return;
    st.wrap._suppressClick = Date.now();
    const x = st.x || 0;
    if (x > 80 || (x > 40 && st.v > 0.5)) {
      swipeClose(st.wrap);
      setTimeout(() => st.wrap._swipe.edit(), 120);
    } else if (x < -st.w * 0.55 || (x < -120 && st.v < -0.9)) {
      swipeDelete(st.wrap);
    } else if (x < -40) {
      if (swipeOpenWrap && swipeOpenWrap !== st.wrap) swipeClose(swipeOpenWrap);
      swipeSet(st.wrap, -SWIPE_ACTION_W, true);
      st.wrap.classList.add('swipe-open');
      st.wrap.classList.remove('swipe-full');
      swipeOpenWrap = st.wrap;
    } else {
      swipeClose(st.wrap);
    }
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });

  // Nach einer Wischbewegung keinen „Klick“ auf die Zeile auslösen
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return; // interne Klicks (z. B. Löschen nach Wischen) durchlassen
    const wrap = e.target.closest && e.target.closest('.swipe-wrap');
    if (wrap && wrap._suppressClick && Date.now() - wrap._suppressClick < 450) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
}

/** Wischen-zum-Löschen für die kompakten Listen in den Einstellungen. */
function enableCodeListSwipe(listEl) {
  if (!listEl) return;
  listEl.querySelectorAll('.code-item').forEach((row) => {
    const delBtn = row.querySelector('.btn-code-del');
    enableSwipe(row, {
      edit: row.classList.contains('code-item-tap') ? () => row.click() : null,
      del: delBtn ? { run: () => delBtn.click() } : null,
    });
  });
}
