/* global window, document, localStorage, navigator */
'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'einsatzTagebuchV4';
// Einsatz-Zeiten (früh definiert, da normalizeState sie beim Laden braucht)
const INC_TIME_STEPS = [['erhalten', 'Erhalten', '📟'], ['anfahrt', 'Anfahrt', '🚑'], ['ort', 'Am Einsatzort', '📍'],
  ['transport', 'Transport', '🛏️'], ['ziel', 'Am Ziel', '🏥'], ['beendet', 'Beendet', '🏁']];
// frühere Schlüssel (Version 82–84) → neue Status
const INC_TIME_LEGACY = { alarm: 'erhalten', ab: 'anfahrt', an: 'ort', frei: 'beendet' };
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
    dienststellen: [],
    places: [],
  };
}

function normalizeState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return defaultState();
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const objList = (x) => (Array.isArray(x) ? x.filter(isObj) : []);
  const str = (x) => (typeof x === 'string' ? x : '');
  s.profile = isObj(s.profile) ? s.profile : { displayName: 'Privat' };
  s.profile.displayName = toDisplayName(s.profile.displayName);
  s.places = Array.isArray(s.places) ? [...new Set(s.places.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean))] : [];
  // früher „abteilungen“ – jetzt eine Liste der Dienststellen (Name, Dienstplan-ID, Standort)
  if (!Array.isArray(s.dienststellen) && Array.isArray(s.abteilungen)) s.dienststellen = s.abteilungen;
  delete s.abteilungen;
  s.dienststellen = Array.isArray(s.dienststellen) ? s.dienststellen.filter(isObj).map((a) => ({ name: toDisplayName(a.name), deptId: String(a.deptId ?? a.id ?? ''), ...(toDisplayName(a.address) ? { address: toDisplayName(a.address) } : {}) })) : [];
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
    // Feld „Abteilung“ entfällt: ohne Dienststelle wird es zur Dienststelle
    if (!svc.isSeg && !txt(svc.location) && txt(svc.abteilung)) svc.location = txt(svc.abteilung);
    delete svc.abteilung;
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
      const t = isObj(inc.times) ? inc.times : {};
      inc.times = {};
      Object.entries(INC_TIME_LEGACY).forEach(([o, n]) => { if (t[o] && !t[n]) t[n] = t[o]; });
      INC_TIME_STEPS.forEach(([k]) => { if (/^\d{2}:\d{2}$/.test(String(t[k] || ''))) inc.times[k] = String(t[k]); });
      inc.incidentNumber = txt(inc.incidentNumber);
      inc.from = txt(inc.from);
      inc.to = txt(inc.to);
      inc.links = objList(inc.links).map((l) => ({ url: txt(l.url), name: txt(l.name) })).filter((l) => /^https?:\/\//i.test(l.url));
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
    checkNewBadges();
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
/** Immer in Safari öffnen (iOS: x-safari-https://, ab iOS 17), sonst neuer Tab. */
function safariLinkAttrs(url) {
  if (isIOSDevice() && /^https:\/\//.test(url)) return `href="${escHtml('x-safari-' + url)}"`;
  return `href="${escHtml(url)}" target="_blank" rel="noopener noreferrer"`;
}
function dpLinkAttrs(url) {
  if (dpLinkMode() === 'safari' && isIOSDevice() && /^https:\/\//.test(url)) {
    // x-safari-https:// öffnet Safari direkt (ab iOS 17) – dort bleibt man angemeldet
    return `href="${escHtml('x-safari-' + url)}"`;
  }
  return `href="${escHtml(url)}" target="_blank" rel="noopener noreferrer"`;
}

/** Text sicher ausgeben und darin enthaltene Links anklickbar machen (Öffnen wie beim Tagesdienstplan: Safari oder App). */
function linkifyHtml(text) {
  const src = String(text || '');
  const re = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    let url = m[1].replace(/[),.;:!?]+$/, '');
    out += escHtml(src.slice(last, m.index));
    const href = /^www\./i.test(url) ? 'https://' + url : url;
    let label = url;
    try { const u = new URL(href); label = u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? (u.pathname.length > 22 ? u.pathname.slice(0, 20) + '…' : u.pathname) : ''); } catch (_) {}
    out += `<a class="note-link" ${dpLinkAttrs(href)}>🔗 ${escHtml(label)}</a>`;
    last = m.index + url.length;
    re.lastIndex = last;
  }
  return out + escHtml(src.slice(last));
}

// ── Einsatz-Zeiten, Start/Ziel, Links ─────────────────────────────────────
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const hmToMin = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
/** Minuten zwischen zwei Zeiten (über Mitternacht hinweg). */
function hmDiff(a, b) { const x = hmToMin(a), y = hmToMin(b); if (x === null || y === null) return null; let d = y - x; if (d < 0) d += 1440; return d; }
const fmtMin = (m) => (m === null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const hmShort = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
function incTimeSummary(times) {
  const t = times || {};
  const parts = [
    ['Ausrücken', hmDiff(t.erhalten, t.anfahrt)],
    ['Anfahrt', hmDiff(t.anfahrt || t.erhalten, t.ort)],
    ['Vor Ort', hmDiff(t.ort, t.transport || t.beendet)],
    ['Transport', hmDiff(t.transport, t.ziel)],
    ['Gesamt', hmDiff(t.erhalten || t.anfahrt, t.beendet || t.ziel)],
  ].filter(([, m]) => m !== null && m < 12 * 60); // über 12 h ist eher ein Tippfehler
  return parts;
}
/** Kompakte Zeitleiste für die Einsatzansicht: Von–Bis, Dauer, Phasenbalken; Einzelzeiten per Tipp. */
const INC_PHASES = { erhalten: ['Ausrücken', '#8e8e93'], anfahrt: ['Anfahrt', '#ff9f0a'], ort: ['Vor Ort', '#30d158'], transport: ['Transport', '#0a84ff'], ziel: ['Am Ziel', '#bf5af2'] };
function incTimesViewHtml(times) {
  const t = times || {};
  const st = INC_TIME_STEPS.filter(([k]) => t[k]);
  if (!st.length) return '';
  const first = t[st[0][0]], last = t[st[st.length - 1][0]];
  const total = st.length > 1 ? hmDiff(first, last) : null;
  const ph = [];
  for (let i = 0; i < st.length - 1; i++) {
    const m = hmDiff(t[st[i][0]], t[st[i + 1][0]]);
    const p = INC_PHASES[st[i][0]];
    if (p && m !== null) ph.push([p[0], p[1], m]);
  }
  const ok = total !== null && total > 0 && total < 12 * 60;
  return `<div class="iv-tl" onclick="this.classList.toggle('is-open')">
    <div class="iv-tl-head"><b>${first}${st.length > 1 ? ` – ${last}` : ''}</b>${ok ? `<span>${fmtMin(total)}</span>` : ''}<i class="iv-tl-more">›</i></div>
    ${ok && ph.length ? `<div class="iv-tl-bar">${ph.filter((p) => p[2] > 0).map(([l, c, m]) => `<span style="flex:${m};background:${c}" title="${l}"></span>`).join('')}</div>
    <div class="iv-tl-leg">${ph.filter((p) => p[2] > 0).map(([l, c, m]) => `<span><i style="background:${c}"></i>${l} <b>${fmtMin(m)}</b></span>`).join('')}</div>` : ''}
    <div class="iv-tl-all">${st.map(([k, l]) => `<span>${l}<b>${t[k]}</b></span>`).join('')}</div>
  </div>`;
}
/** Bekannte Portale; sonst aus der Adresse abgeleitet (ff-xyz.at → FF Xyz). */
const PORTAL_NAMES = {
  'kleinezeitung.at': 'Kleine Zeitung', '5min.at': '5 Minuten', 'krone.at': 'Kronen Zeitung', 'noen.at': 'NÖN', 'meinbezirk.at': 'MeinBezirk',
  'heute.at': 'Heute', 'oe24.at': 'oe24', 'derstandard.at': 'Der Standard', 'diepresse.com': 'Die Presse', 'kurier.at': 'Kurier', 'puls24.at': 'PULS 24',
  'bvz.at': 'BVZ', 'nachrichten.at': 'OÖN', 'sn.at': 'Salzburger Nachrichten', 'tt.com': 'Tiroler Tageszeitung', 'vol.at': 'VOL.AT', 'feuerwehr.at': 'ÖBFV',
  'facebook.com': 'Facebook', 'instagram.com': 'Instagram', 'youtube.com': 'YouTube',
};
const umlautize = (w) => w.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü');
const capWords = (s) => s.split(/[-_.]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
function portalName(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return ''; }
  const parts = host.split('.');
  const base = parts.slice(-2).join('.');
  if (base === 'orf.at') return parts.length > 2 && parts[0] !== 'orf' ? 'ORF ' + capWords(parts[0]) : 'ORF';
  if (PORTAL_NAMES[host]) return PORTAL_NAMES[host];
  if (PORTAL_NAMES[base]) return PORTAL_NAMES[base];
  const label = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  // Feuerwehren: ff-hartberg, ffpoellau, bff-…
  const ff = /^(b?ff)-?(.+)$/.exec(label);
  if (ff) return ff[1].toUpperCase() + ' ' + capWords(umlautize(ff[2]));
  const fw = /^(?:feuerwehr|fw)-?(.+)$/.exec(label);
  if (fw) return 'FF ' + capWords(umlautize(fw[1]));
  return capWords(label);
}
function faviconUrl(url) {
  try { return 'https://icons.duckduckgo.com/ip3/' + new URL(url).hostname + '.ico'; } catch (_) { return ''; }
}
function linkChipHtml(l, removable, i) {
  const fav = faviconUrl(l.url);
  return `<span class="link-chip">${fav ? `<img class="link-fav-img" src="${escHtml(fav)}" alt="" onerror="this.style.visibility='hidden'">` : ''}
    <a class="link-chip-a" ${dpLinkAttrs(l.url)}>${escHtml(l.name || portalName(l.url) || l.url)}</a>
    ${removable ? `<button type="button" class="link-chip-x" data-link-edit="${i}" aria-label="Link bearbeiten">✎</button><button type="button" class="link-chip-x" data-link-del="${i}" aria-label="Link entfernen">✕</button>` : ''}</span>`;
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

/** Eintrag der Dienststellen-Liste zu einem Dienst (Name exakt, sonst unscharf wie RKTel). */
function findAbteilung(svc) {
  const abtName = (svc && svc.location) || '';
  if (!abtName) return null;
  let abt = (state.dienststellen || []).find((a) => a.name && a.name.toLowerCase() === abtName.toLowerCase());
  if (!abt && window.RKDienstplan && (state.dienststellen || []).length) {
    try {
      const match = window.RKDienstplan.createDepartmentMatcher(state.dienststellen);
      abt = match(abtName) || null;
    } catch (_) { abt = null; }
  }
  return abt || null;
}
/** Google-Maps-Route vom aktuellen Standort zur Dienststelle (oder hinterlegter Maps-Link). */
function mapsRouteUrl(address) {
  const a = String(address || '').trim();
  if (!a) return '';
  if (/^https?:\/\//i.test(a)) return a;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}&travelmode=driving`;
}
const ICON_CAR_FRONT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 5.8A2.5 2.5 0 0 1 8.6 4h6.8a2.5 2.5 0 0 1 2.4 1.8L19 10h.5a1.5 1.5 0 0 1 1.5 1.5V17a1 1 0 0 1-1 1h-.5v1.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V18H8v1.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V18H4a1 1 0 0 1-1-1v-5.5A1.5 1.5 0 0 1 4.5 10H5zm1.3 4.2h9l-1-3.4a.9.9 0 0 0-.9-.6H9.4a.9.9 0 0 0-.9.6zM6.5 15.3a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zm11 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z" fill="currentColor"/></svg>';
const ICON_BUS_FRONT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2.5h10A2.5 2.5 0 0 1 19.5 5v13a1 1 0 0 1-1 1h-.5v1.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V19h-5v1.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V19h-.5a1 1 0 0 1-1-1V5A2.5 2.5 0 0 1 7 2.5zM9 4.2a.6.6 0 0 0 0 1.2h6a.6.6 0 0 0 0-1.2zM6.6 7v5.2h10.8V7zm1.2 9.9a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm8.4 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zM3 8.2h1v3H3zm17 0h1v3h-1z" fill="currentColor"/></svg>';
/** Navigation rechts oben in der Dienstkarte: Auto (Google Maps) und Öffis (BusBahnBim). */
function homeNavBtnsHtml(svcLike) {
  const abt = findAbteilung(svcLike);
  const addr = abt && String(abt.address || '').trim();
  if (!addr) return '';
  const car = mapsRouteUrl(addr);
  const isLink = /^https?:\/\//i.test(addr);
  const bus = isLink ? '' : `https://verkehrsauskunft.verbundlinie.at/?Z=${encodeURIComponent(addr)}`;
  return `<div class="hm-navs">
    <a class="hm-navbtn is-car" href="${escHtml(car)}" target="_blank" rel="noopener" aria-label="Mit dem Auto zu ${escHtml(abt.name)} (Google Maps)">${ICON_CAR_FRONT}</a>
    ${bus ? `<a class="hm-navbtn is-bus" ${safariLinkAttrs(bus)} aria-label="Öffentlich zu ${escHtml(abt.name)} (BusBahnBim)">${ICON_BUS_FRONT}</a>` : ''}
  </div>`;
}

function dienstplanUrl(svc) {
  const abt = findAbteilung(svc);
  if (!abt || !abt.deptId) return null;
  const dateStr = (svc.startAt || '').slice(0, 10);
  if (!dateStr) return null;
  return tdpUrl(abt.deptId, dateStr);
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

/** Liste stabil nach Häufigkeit sortieren: was am öftesten eingetragen wurde, steht oben. */
function byUsage(list, usedValues, keyOf = (x) => x) {
  const n = new Map();
  usedValues.forEach((v) => { if (v !== null && v !== undefined && v !== '') { const k = String(v).toLowerCase(); n.set(k, (n.get(k) || 0) + 1); } });
  return list.map((x, i) => ({ x, i, c: n.get(String(keyOf(x)).toLowerCase()) || 0 })).sort((a, b) => b.c - a.c || a.i - b.i).map((o) => o.x);
}
function allIncidentsFlat() { return state.services.flatMap((sv) => sv.incidents || []); }

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
    const hits = inputEl._smItems.filter((it) => it.toLowerCase().includes(q));
    render([...hits.filter((it) => it.toLowerCase().startsWith(q)), ...hits.filter((it) => !it.toLowerCase().startsWith(q))]);
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
        if (tab === 'dienste') {
          const si = document.getElementById('search-input');
          if (target) {
            if (si && si.value) { si.value = ''; si.blur(); renderServiceList(); }
            popAnimated(target);
            return;
          }
          // schon auf der Tagebuch-Liste → nach oben und direkt ins Suchfeld
          if (si) {
            if (si.value) { si.value = ''; renderServiceList(); }
            scrollActiveToTop();
            si.focus({ preventScroll: true });
          }
          return;
        }
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
        svc.location || '', svc.vehicle || '',
        svc.note || '', (svc.colleagues || []).join(' '),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }
  listEl.innerHTML = '';
  // Personen: Kolleg:innen, deren Name passt → Profil
  if (q) {
    const people = new Map();
    state.services.forEach((sv) => (sv.colleagues || []).forEach((c) => {
      if (!c || !String(c).toLowerCase().includes(q)) return;
      const k = String(c).trim().toLowerCase();
      const e = people.get(k) || { name: String(c).trim(), n: 0 };
      e.n++; people.set(k, e);
    }));
    const list = [...people.values()].sort((a, b) => b.n - a.n).slice(0, 8);
    if (list.length) {
      const sec = document.createElement('div');
      sec.className = 'srch-section';
      sec.innerHTML = `<div class="svc-month"><span>Personen</span><span class="svc-month-meta">${people.size} Treffer</span></div>
        <div class="srch-people">${list.map((p) => `<button type="button" class="srch-person" data-colleague="${escHtml(p.name)}">
          <span class="srch-av" style="--h:${colleagueHue(p.name)}">${escHtml(colleagueInitials(p.name))}</span>
          <span class="srch-person-t"><b>${escHtml(p.name)}</b><small>${p.n} gemeinsame ${p.n === 1 ? 'Dienst' : 'Dienste'}</small></span>
          <span class="srch-person-c">›</span></button>`).join('')}</div>`;
      listEl.appendChild(sec);
    }
  }
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
      ${row('Dienststelle', escHtml(svc.location || '—'))}
      ${row('Besatzung', crew.length ? crew.map((c) => `<button type="button" class="crew-link" data-colleague="${escHtml(c)}">${escHtml(c)}</button>`).join('<br>') : '<span class="dv-muted">—</span>', 'is-multi')}
      ${svc.note ? row('Notiz', linkifyHtml(svc.note).replace(/\n/g, '<br>'), 'is-multi') : ''}
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
  if (inc.statKz) sub.push(STATKZ_MAP.get(String(inc.statKz)) || `KZ ${inc.statKz}`);
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
    + (Object.keys(inc.times || {}).length ? group('Zeiten', [incTimesViewHtml(inc.times)]) : '')
    + (inc.from || inc.to ? group('Transport', [`<div class="iv-route"><span><i class="route-dot is-from"></i>${escHtml(inc.from || '—')}</span><span><i class="route-dot is-to"></i>${escHtml(inc.to || '—')}</span></div>`]) : '')
    + ((inc.links || []).length ? group('Berichte & Links', [`<div class="inc-links is-view">${inc.links.map((l) => linkChipHtml(l, false)).join('')}</div>`]) : '')
    + (inc.note ? group('Notiz', [`<div class="iv-note">${linkifyHtml(inc.note)}</div>`]) : '')
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
  if (!svc.isSeg) {
    body.insertAdjacentHTML('beforeend', `<div class="iv-group iv-actions">
      <div class="iv-card">
        <button type="button" class="iv-jump" id="btn-iv-dup">Einsatz duplizieren<span aria-hidden="true">›</span></button>
        <button type="button" class="iv-jump" id="btn-iv-move">In anderen Dienst verschieben<span aria-hidden="true">›</span></button>
      </div>
    </div>`);
    document.getElementById('btn-iv-dup').onclick = () => {
      closeDialog('dialog-incident-view');
      const copy = { ...inc, pzc: { ...(inc.pzc || {}) }, extraVehicles: [...(inc.extraVehicles || [])], note: '', favorite: false };
      setTimeout(() => openIncidentDialog(svc.id, null, { prefill: copy }), 280);
    };
    document.getElementById('btn-iv-move').onclick = () => openMoveIncident(svc.id, inc.id);
  }
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
      const fields = [inc.alarmCode, inc.note, ea, kz, p.diag, pzcDiagnosis(p.diag), hasNaca ? `naca ${inc.naca}` : '', (inc.extraVehicles || []).join(' '), svc.isSeg ? svc.location : '', inc.from, inc.to, (inc.links || []).map((l) => l.name).join(' ')];
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
  const kz = inc.statKz ? STATKZ_MAP.get(String(inc.statKz)) || '' : '';
  const sub = [day, svc.isSeg ? 'SEG' : svc.vehicle, ea, kz, hasNaca ? `NACA ${inc.naca}` : ''].filter(Boolean).join(' · ');
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

// ── Dienstblöcke („Runs“): direkt aufeinanderfolgende Schichten ────────────
// Beginnt ein Dienst weniger als RUN_GAP_H Stunden nach dem Ende des vorigen,
// zählt beides als ein zusammenhängender Block.
const RUN_GAP_H = 5;
function computeRuns(services) {
  const list = services.filter((x) => !x.isSeg && x.startAt && x.endAt)
    .map((x) => ({ svc: x, s: parseLocalDt(x.startAt), e: parseLocalDt(x.endAt) }))
    .filter((x) => x.s && x.e)
    .sort((a, b) => a.s - b.s);
  const runs = [];
  for (const it of list) {
    const cur = runs[runs.length - 1];
    if (cur && it.s - cur.end < RUN_GAP_H * 3600000 && it.s >= cur.start) {
      cur.items.push(it.svc);
      if (it.e > cur.end) cur.end = it.e;
    } else runs.push({ items: [it.svc], start: it.s, end: it.e });
  }
  runs.forEach((r) => {
    r.hours = r.items.reduce((n, x) => n + +serviceDurationHours(x), 0);
    r.span = (r.end - r.start) / 3600000;
    r.incidents = r.items.reduce((n, x) => n + (x.incidents || []).length, 0);
  });
  return runs;
}

function runLabel(r) {
  const a = r.start, b = r.end;
  const d = (x) => x.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${d(a)} ${formatTimeHM(a)} – ${a.toDateString() === b.toDateString() ? '' : d(b) + ' '}${formatTimeHM(b)}`;
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
  mountSuggestions(document.getElementById('svc-location'), document.getElementById('svc-location-suggestions'), [...new Set([...rankByFrequency(regular.map((s) => s.location).filter(Boolean)), ...(state.dienststellen || []).map((a) => a.name).filter(Boolean)])], 8, true);
  mountSuggestions(document.getElementById('svc-vehicle'), document.getElementById('svc-vehicle-suggestions'), rankByFrequency(regular.map((s) => s.vehicle).filter(Boolean)), 8, true);
  bindVehicleIconPreview('svc-vehicle', 'svc-vehicle-icon');
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
  // Vorlage (z. B. „Duplizieren“): Felder füllen, aber als neuen Einsatz speichern
  const src = inc || opts.prefill || null;
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

  incLights = src ? !!src.lights : false;
  incExtraVehicles = src ? [...(src.extraVehicles || [])] : [];
  updateLightsBtn();
  renderIncExtraVehicles();

  document.getElementById('inc-keyword').value = src ? (src.alarmCode || '') : '';
  document.getElementById('pzc-diag').value = src && src.pzc ? (src.pzc.diag || '') : '';
  document.getElementById('pzc-age').value = src && src.pzc ? (src.pzc.age || '') : '';
  document.getElementById('pzc-yob').value = '';
  setYobOpen(false);
  renderYobChips();
  document.getElementById('pzc-prio').value = src && src.pzc ? (src.pzc.prio || '') : '';
  document.getElementById('inc-note').value = inc ? (inc.note || '') : '';
  setupIncExtras(inc);
  setupKennzahlField('einsatzart', EINSATZART_MAP, EINSATZART_CODES, src ? src.einsatzart : '');
  setupKennzahlField('statkz', STATKZ_MAP, STATKZ_CODES, src ? src.statKz : '');
  setupPzcField();
  setupNacaField(src && src.naca !== null && src.naca !== undefined ? String(src.naca) : '');
  if (opts.prefill && !inc) document.getElementById('dialog-incident-title').textContent = 'Neuer Einsatz (Kopie)';

  const deleteBtn = document.getElementById('btn-inc-delete');
  if (deleteBtn) deleteBtn.style.display = inc ? '' : 'none';

  openDialog('dialog-incident');
  const body = document.querySelector('#dialog-incident .dialog-box');
  if (body) body.scrollTop = 0;

  const kwInput = document.getElementById('inc-keyword');
  kwInput._smDecorate = blaulichtDotHtml;
  // meistverwendete Stichwörter zuerst; beim Antippen gleich die Top 10 zeigen
  const usedKw = allIncidentsFlat().map((i) => i.alarmCode);
  mountSuggestions(kwInput, document.getElementById('inc-keyword-suggestions'), byUsage(state.alarmCodes || [], usedKw), 10, usedKw.length > 0);
  document.getElementById('inc-keyword').onchange = () => {
    const val = document.getElementById('inc-keyword').value.trim();
    const bl = keywordBlaulicht(val);
    if (bl !== undefined && bl !== incLights) { incLights = bl; updateLightsBtn(); }
  };
}

// ── Zeiten / Start→Ziel / Links im Einsatz-Formular ────────────────────────
let incTimes = {};
let incLinks = [];
let routeLastField = null;
function setupIncExtras(inc) {
  incTimes = { ...((inc && inc.times) || {}) };
  incTimeSel = null;
  incLinks = ((inc && inc.links) || []).map((l) => ({ ...l }));
  renderIncTimes();
  // Start → Ziel
  const from = document.getElementById('inc-from'), to = document.getElementById('inc-to');
  from.value = inc ? inc.from || '' : '';
  to.value = inc ? inc.to || '' : '';
  mountRouteSuggestions();
  [from, to].forEach((el) => { el.onfocus = () => { routeLastField = el; }; el.oninput = updateRouteSaveBtns; el.onchange = renderPlaceChips; el.onblur = () => setTimeout(renderPlaceChips, 200); });
  document.getElementById('btn-route-swap').onclick = () => { const v = from.value; from.value = to.value; to.value = v; renderPlaceChips(); };
  routeLastField = null;
  renderPlaceChips();
  // Links
  const url = document.getElementById('inc-link-url'), name = document.getElementById('inc-link-name');
  url.value = ''; name.value = '';
  document.getElementById('link-add-row').hidden = true;
  url.oninput = () => {
    const v = url.value.trim();
    const ok = /^https?:\/\/[^\s]+\.[^\s]+/i.test(v);
    document.getElementById('link-add-row').hidden = !ok;
    if (ok) {
      if (!name.dataset.touched) name.value = portalName(v);
      const fav = faviconUrl(v);
      document.getElementById('link-add-fav').innerHTML = fav ? `<img src="${escHtml(fav)}" alt="" onerror="this.style.visibility='hidden'">` : '';
    }
  };
  name.oninput = () => { name.dataset.touched = name.value ? '1' : ''; };
  name.dataset.touched = '';
  incLinkEdit = -1;
  document.getElementById('btn-link-add').textContent = 'Hinzufügen';
  const add = () => {
    const v = url.value.trim();
    if (!/^https?:\/\//i.test(v)) { toast('Bitte einen Link mit https:// einfügen.', 'info'); return; }
    const entry = { url: v, name: name.value.trim() || portalName(v) };
    if (incLinkEdit >= 0 && incLinks[incLinkEdit]) incLinks[incLinkEdit] = entry;
    else if (!incLinks.some((l) => l.url === v)) incLinks.push(entry);
    resetLinkForm();
    renderIncLinks();
  };
  document.getElementById('btn-link-add').onclick = add;
  url.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  renderIncLinks();
  // Start/Ziel und Links nur aufgeklappt, wenn etwas drinsteht
  setIncSection('links', incLinks.length > 0);
}
function setIncSection(name, open) {
  const sec = document.querySelector(`.inc-sec[data-sec="${name}"]`);
  if (sec) sec.classList.toggle('is-open', open);
}
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('.inc-sec-toggle');
  if (!t) return;
  const sec = t.closest('.inc-sec');
  sec.classList.toggle('is-open');
  if (sec.classList.contains('is-open')) { const i = sec.querySelector('input'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 50); }
});

let incTimeSel = null; // (früher: Feinjustierung) – bleibt für Kompatibilität
/** Ziffern „0938“ → „09:38“ (oder null, wenn ungültig). */
function digitsToHM(d) {
  d = String(d || '').replace(/\D/g, '');
  if (d.length === 3) d = '0' + d;
  if (d.length !== 4) return null;
  const h = +d.slice(0, 2), m = +d.slice(2);
  return h < 24 && m < 60 ? d.slice(0, 2) + ':' + d.slice(2) : null;
}
function renderIncTimes() {
  const box = document.getElementById('inc-times');
  if (!box) return;
  box.innerHTML = `<div class="it-grid">${INC_TIME_STEPS.map(([k, l, ic]) => `<label class="it-tile${incTimes[k] ? ' is-set' : ''}" data-step="${k}">
      <span class="it-ic" aria-hidden="true">${ic}</span>
      <input class="it-num" data-k="${k}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="next" value="${incTimes[k] || ''}" placeholder="–:–" aria-label="${l}">
      <span class="it-lab">${l}</span>
      <button type="button" class="it-clr" aria-label="${l} löschen">✕</button>
    </label>`).join('')}</div>
    <div class="it-hint">Kurz tippen: Uhrzeit eingeben · Lange drücken: jetzt</div>
    <div class="it-sum" id="it-sum"></div>`;
  box.querySelectorAll('.it-tile').forEach((tile) => {
    const k = tile.dataset.step;
    const inp = tile.querySelector('.it-num');
    let timer = 0, long = false;
    const set = (v) => { if (v) incTimes[k] = v; else delete incTimes[k]; tile.classList.toggle('is-set', !!v); inp.value = v || ''; updateIncTimeSummary(); updateNextTimeBtn(); };
    // lange drücken → jetzt
    tile.addEventListener('touchstart', () => {
      long = false; clearTimeout(timer);
      timer = setTimeout(() => { long = true; set(nowHM()); tile.classList.add('is-flash'); setTimeout(() => tile.classList.remove('is-flash'), 400); if (navigator.vibrate) navigator.vibrate(15); }, 450);
    }, { passive: true });
    tile.addEventListener('touchmove', () => clearTimeout(timer), { passive: true });
    tile.addEventListener('touchend', (e) => { clearTimeout(timer); if (long) { e.preventDefault(); inp.blur(); } }, { passive: false });
    tile.addEventListener('contextmenu', (e) => e.preventDefault());
    // ✕ rechts oben: Eintrag löschen (ohne Tastatur/Long-Press auszulösen)
    const clr = tile.querySelector('.it-clr');
    ['touchstart', 'mousedown', 'pointerdown'].forEach((ev) => clr.addEventListener(ev, (e) => { e.stopPropagation(); }, { passive: true }));
    clr.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); clearTimeout(timer); set(''); inp.blur(); });
    // Maus (Desktop): lange klicken
    tile.addEventListener('mousedown', () => { long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; set(nowHM()); }, 450); });
    tile.addEventListener('mouseup', (e) => { clearTimeout(timer); if (long) { e.preventDefault(); setTimeout(() => inp.blur(), 0); } });
    // Eingabe: nur Ziffern, Doppelpunkt automatisch
    inp.addEventListener('focus', () => { inp.dataset.prev = inp.value; inp.value = inp.value.replace(':', ''); tile.classList.add('is-edit'); setTimeout(() => inp.setSelectionRange(0, inp.value.length), 0); });
    inp.addEventListener('input', () => {
      const d = inp.value.replace(/\D/g, '').slice(0, 4);
      inp.value = d;
      if (d.length === 4) {
        const v = digitsToHM(d);
        if (v) { set(v); const i = INC_TIME_STEPS.findIndex(([x]) => x === k); const nx = box.querySelectorAll('.it-num')[i + 1]; if (nx && !incTimes[INC_TIME_STEPS[i + 1][0]]) nx.focus(); else inp.blur(); }
      }
    });
    inp.addEventListener('blur', () => {
      tile.classList.remove('is-edit');
      const d = inp.value.replace(/\D/g, '');
      if (!d) { set(''); return; }
      const v = digitsToHM(d);
      if (v) set(v); else { toast('Bitte als HHMM eingeben, z. B. 0938.', 'info', 2200); set(inp.dataset.prev && digitsToHM(inp.dataset.prev) ? digitsToHM(inp.dataset.prev) : incTimes[k] || ''); }
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  });
  updateIncTimeSummary();
  updateNextTimeBtn();
}
function updateNextTimeBtn() {
  const next = INC_TIME_STEPS.find(([k]) => !incTimes[k]);
  const nb = document.getElementById('btn-inc-next-time');
  if (!nb) return;
  nb.hidden = !next;
  if (next) { nb.textContent = `⏱ ${next[1]} jetzt`; nb.onclick = () => { incTimes[next[0]] = nowHM(); renderIncTimes(); }; }
}
function updateIncTimeSummary() {
  const el = document.getElementById('it-sum');
  if (!el) return;
  const parts = incTimeSummary(incTimes);
  el.innerHTML = parts.map(([l, m]) => `<span>${l} <b>${fmtMin(m)}</b></span>`).join('');
}

/** Vorschläge für Start/Ziel: Kürzel + bisherige Einträge, sortiert nach Häufigkeit. */
function mountRouteSuggestions() {
  const used = allIncidentsFlat().flatMap((i) => [i.from, i.to]).filter(Boolean);
  const seen = new Set(), items = [];
  [...(state.places || []), ...used].forEach((v) => { const k = String(v).trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); items.push(String(v).trim()); } });
  const sorted = byUsage(items, used);
  mountSuggestions(document.getElementById('inc-from'), document.getElementById('inc-from-suggestions'), sorted, 8, true);
  mountSuggestions(document.getElementById('inc-to'), document.getElementById('inc-to-suggestions'), sorted, 8, true);
}
function renderPlaceChips() { updateRouteSaveBtns(); }
/** „+“ im Start-/Ziel-Feld: nur sichtbar, wenn der Text noch kein Kürzel ist. */
function updateRouteSaveBtns() {
  const places = state.places || [];
  document.querySelectorAll('.route-save').forEach((b) => {
    const inp = document.getElementById(b.dataset.for);
    const v = inp ? inp.value.trim() : '';
    const show = !!v && !places.some((p) => p.toLowerCase() === v.toLowerCase());
    b.hidden = !show;
    b.closest('.route-field').classList.toggle('has-save', show);
    if (!b.dataset.bound) {
      b.dataset.bound = '1';
      b.addEventListener('pointerdown', (e) => e.preventDefault()); // Fokus/Tastatur behalten
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const val = document.getElementById(b.dataset.for).value.trim();
        if (!val) return;
        if (!(state.places || []).some((p) => p.toLowerCase() === val.toLowerCase())) { state.places = [...(state.places || []), val]; saveState(); }
        mountRouteSuggestions();
        renderPlaceChips();
      });
    }
  });
}

let incLinkEdit = -1; // Index des gerade bearbeiteten Links (-1 = neuer Link)
function resetLinkForm() {
  const url = document.getElementById('inc-link-url'), name = document.getElementById('inc-link-name');
  url.value = ''; name.value = ''; name.dataset.touched = '';
  incLinkEdit = -1;
  document.getElementById('link-add-row').hidden = true;
  document.getElementById('btn-link-add').textContent = 'Hinzufügen';
}
function renderIncLinks() {
  const box = document.getElementById('inc-links');
  if (!box) return;
  box.innerHTML = incLinks.map((l, i) => linkChipHtml(l, true, i).replace('class="link-chip"', `class="link-chip${i === incLinkEdit ? ' is-editing' : ''}"`)).join('');
  box.querySelectorAll('[data-link-del]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    const i = +b.dataset.linkDel;
    incLinks.splice(i, 1);
    if (incLinkEdit === i) resetLinkForm(); else if (incLinkEdit > i) incLinkEdit--;
    renderIncLinks();
  }));
  box.querySelectorAll('[data-link-edit]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    const i = +b.dataset.linkEdit, l = incLinks[i];
    if (!l) return;
    if (incLinkEdit === i) { resetLinkForm(); renderIncLinks(); return; } // nochmal tippen = abbrechen
    const url = document.getElementById('inc-link-url'), name = document.getElementById('inc-link-name');
    url.value = l.url;
    url.oninput && url.oninput();
    name.value = l.name || '';
    name.dataset.touched = l.name ? '1' : '';
    incLinkEdit = i;
    document.getElementById('btn-link-add').textContent = 'Speichern';
    renderIncLinks();
    name.focus({ preventScroll: true });
  }));
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
  const field = key === 'statkz' ? 'statKz' : key;
  // nach Nummer sortiert (nicht nach Häufigkeit)
  mountSuggestions(searchEl, dropEl, codes.slice().sort((a, b) => +a[0] - +b[0]).map(([c, l]) => `${c} – ${l}`), 60, true);
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

/**
 * Jahrgang (JJ) → mögliche Alter für den PZC: je nachdem, ob der Geburtstag
 * heuer schon war, ist die Person Jahr−Jahrgang oder ein Jahr jünger.
 */
function yobAges(yy, now = new Date()) {
  if (!/^\d{2}$/.test(yy)) return [];
  const y = now.getFullYear();
  const birth = 2000 + +yy <= y ? 2000 + +yy : 1900 + +yy;
  const a = y - birth;
  return [a - 1, a].filter((n) => n >= 0 && n <= 99);
}
function setYobOpen(open) {
  const row = document.getElementById('pzc-yob-row'), t = document.getElementById('pzc-yob-toggle');
  if (!row || !t) return;
  row.hidden = !open;
  t.setAttribute('aria-expanded', String(open));
  t.classList.toggle('is-open', open);
}
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('#pzc-yob-toggle');
  if (!t) return;
  const open = t.getAttribute('aria-expanded') !== 'true';
  setYobOpen(open);
  if (open) setTimeout(() => document.getElementById('pzc-yob')?.focus(), 50);
});
function renderYobChips() {
  const box = document.getElementById('pzc-yob-chips');
  const yob = document.getElementById('pzc-yob');
  const age = document.getElementById('pzc-age');
  if (!box || !yob) return;
  const ages = yobAges(yob.value);
  if (!ages.length) { box.innerHTML = ''; return; }
  const cur = age.value.trim();
  box.innerHTML = ages.map((n, i) => {
    const v = String(n).padStart(2, '0');
    return `<button type="button" class="pzc-yob-chip${cur === v ? ' is-on' : ''}" data-age="${v}"><b>${n}</b></button>`;
  }).join('');
  box.querySelectorAll('[data-age]').forEach((b) => b.addEventListener('pointerdown', (e) => e.preventDefault()));
  box.querySelectorAll('[data-age]').forEach((b) => b.addEventListener('click', () => {
    age.value = b.dataset.age;
    updatePzcPreview();
    renderYobChips();
    const prio = document.getElementById('pzc-prio');
    if (prio && !prio.value) focusField(prio);
  }));
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
  age.oninput = () => { if (digitsOnly(age, 2).length === 2) focusField(prio); show(); renderYobChips(); };
  const yob = document.getElementById('pzc-yob');
  yob.oninput = () => { digitsOnly(yob, 2); renderYobChips(); };
  prio.oninput = () => { if (digitsOnly(prio, 1, /[1-3]/).length === 1) focusNextCodeField(prio); show(); };
  const items = byUsage(state.pzcCodes || [], allIncidentsFlat().map((i) => i.pzc && i.pzc.diag), (p) => p.code).map((p) => `${p.code} - ${p.diagnosis}`);
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
  const fields = { alarmCode: keyword, lights: incLights, note, pzc: { diag, age, prio }, naca: nacaVal, einsatzart, statKz, extraVehicles: [...incExtraVehicles],
    times: { ...incTimes }, from: document.getElementById('inc-from').value.trim(), to: document.getElementById('inc-to').value.trim(), links: incLinks.map((l) => ({ ...l })) };
  // halb eingegebener Link: mitnehmen statt verlieren
  const pendingUrl = document.getElementById('inc-link-url').value.trim();
  if (/^https?:\/\//i.test(pendingUrl) && !fields.links.some((l) => l.url === pendingUrl)) fields.links.push({ url: pendingUrl, name: document.getElementById('inc-link-name').value.trim() || portalName(pendingUrl) });

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
      svc = { id: uid(), ...segData, note: '', incidents: [], isSeg: true };
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
  // Schnellauswahl: meistgenutzte weitere Einsatzmittel
  const top = rankByFrequency(allIncidentsFlat().flatMap((i) => i.extraVehicles || []))
    .filter((v) => !incExtraVehicles.some((x) => x.toLowerCase() === v.toLowerCase())).slice(0, 8);
  let quick = null;
  if (top.length) {
    quick = document.createElement('div');
    quick.className = 'ev-quick';
    quick.innerHTML = top.map((v) => { const ic = vehicleIconSrc(v); return `<button type="button" class="ev-quick-b" data-ev="${escHtml(v)}">${ic ? `<img src="${escHtml(ic)}" alt="">` : ''}${escHtml(v)}</button>`; }).join('');
    quick.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-ev]');
      if (!b) return;
      e.preventDefault();
      input.value = b.dataset.ev;
      input.blur();
    });
    input.after(quick);
  }

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
    if (quick) quick.remove();
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

/** Vollständige Rangliste als Popup – mit Podest-Medaillen, Anteil und Suche. */
function showListPopup(title, items, meta = {}) {
  const color = meta.color || 'var(--accent)';
  const total = items.reduce((n, [, c]) => n + c, 0);
  const max = items.length ? items[0][1] : 1;
  const medal = ['🥇', '🥈', '🥉'];
  const row = ([label, count], i) => `<li class="lp-row${i < 3 ? ' is-top' : ''}" style="--i:${Math.min(i, 12)}" data-q="${escHtml(String(label).toLowerCase())}"${meta.colleague ? ` data-colleague="${escHtml(String(label))}"` : ''}>
      <span class="lp-n">${i < 3 ? medal[i] : i + 1}</span>
      ${meta.lead ? meta.lead(label) : ''}
      <span class="lp-main"><span class="lp-l">${escHtml(String(label))}</span>
        <span class="lp-bar"><span style="width:${Math.max(4, Math.round((count / max) * 100))}%"></span></span></span>
      <span class="lp-c"><b>${count}</b><small>${total ? Math.round((count / total) * 100) : 0} %</small></span>
    </li>`;
  const ov = document.createElement('div');
  ov.className = 'dialog-overlay lp-ov';
  ov.style.zIndex = '2000';
  ov.innerHTML = `<div class="dialog-box lp-box" style="--mc:${color}">
    <div class="lp-head">
      <span class="lp-ic">${meta.icon || '📋'}</span>
      <div class="lp-head-t"><h3>${escHtml(title)}</h3><span>${items.length} Einträge · ${total} ${escHtml(meta.unit || 'gesamt')}</span></div>
      <button class="dialog-close lp-x" aria-label="Schließen">✕</button>
    </div>
    ${items.length > 8 ? '<div class="lp-search"><input type="search" placeholder="Suchen …" aria-label="Suchen"></div>' : ''}
    <div class="dialog-body lp-body"><ol class="lp-list">${items.map(row).join('') || '<li class="lp-empty">Keine Daten</li>'}</ol></div>
  </div>`;
  const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 200); };
  ov.querySelector('.dialog-close').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const q = ov.querySelector('.lp-search input');
  if (q) q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    ov.querySelectorAll('.lp-row').forEach((li) => { li.hidden = !!v && !li.dataset.q.includes(v); });
  });
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
  // Einsatzzeiten, Start und Ziel
  const timeStats = (() => {
    const keys = ['Ausrücken', 'Anfahrt', 'Vor Ort', 'Transport', 'Gesamt'];
    const acc = Object.fromEntries(keys.map((k) => [k, []]));
    allInc.forEach((i) => incTimeSummary(i.times).forEach(([l, m]) => acc[l] && acc[l].push(m)));
    return keys.map((k) => { const a = acc[k].slice().sort((x, y) => x - y); return { k, n: a.length, avg: a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null, med: a.length ? a[Math.floor(a.length / 2)] : null, min: a[0] ?? null, max: a[a.length - 1] ?? null }; });
  })();
  const timesFilled = allInc.filter((i) => Object.keys(i.times || {}).length).length;
  const rankText = (vals) => { const m = new Map(); vals.forEach((v) => { if (!v) return; const k = v.trim().toLowerCase(); const e = m.get(k) || [v.trim(), 0]; e[1]++; m.set(k, e); }); return [...m.values()].sort((a, b) => b[1] - a[1]); };
  const allTo = rankText(allInc.map((i) => i.to));
  const allFrom = rankText(allInc.map((i) => i.from));
  const routeFilled = allInc.filter((i) => i.from || i.to).length;
  const timeStatsHtml = (cls) => `<div class="${cls}">${timeStats.filter((t) => t.n).map((t) => `<div class="tt-tile"><small>${t.k}</small><b>${fmtMin(t.avg)}</b><span title="Ø aus ${t.n} Einsätzen">${t.min === t.max ? `${t.n}×` : t.max < 60 ? `${t.min}–${t.max} min` : `${hmShort(t.min)}–${hmShort(t.max)} h`}</span></div>`).join('') || '<p class="sx-empty">Noch keine Zeiten erfasst</p>'}</div>`;
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

  if (statsStyle() === 'classic') {
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
    ${reviewsEntryHtml()}
    <div class="stats-filter-bar">
      <button class="stats-filter-bar-btn" id="btn-open-stats-filter">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="sf-icon"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg> Filter${activeFilterCount > 0 ? ` <span class="stats-filter-bar-badge">${activeFilterCount}</span>` : ''}
      </button>
      ${activeFilterCount > 0 ? `<button class="stats-filter-bar-reset" id="btn-stats-reset" title="Filter zurücksetzen">✕ Zurücksetzen</button>` : ''}
    </div>
    <div class="stats-facts">
      <div class="fact-tile"><div class="fact-tile-value">${totalInc}</div><div class="fact-tile-label">Einsätze${segInc ? `<span class="fact-tile-sub">davon ${segInc} SEG</span>` : ''}</div></div>
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
      ${allTo.length ? statsCard('Top Ziele', allTo, false, `${routeFilled}/${totalInc} Einsätze`) : ''}
      ${allFrom.length ? statsCard('Top Startorte', allFrom, false) : ''}
      ${timesFilled ? `<div class="stats-rank-section"><div class="stats-section-head"><h4>Einsatzzeiten</h4><span class="stats-coverage">${timesFilled}/${totalInc} Einsätze</span></div>${timeStatsHtml('tt-grid is-classic')}</div>` : ''}
      <div class="stats-group-title">Kennzahlen &amp; Patient</div>
      ${statsCard('Einsatzart', allEinsatzart, true, `${eaFilled}/${totalInc} Einsätze`)}
      ${statsCard('Statistikkennzahl', allStatKz, true, `${kzFilled}/${totalInc} Einsätze`)}
      ${statsCard('Top PZC', allPzc, false, `${pzcFilled}/${totalInc} Einsätze`, ageInfo)}
      ${nacaSection()}
    </div>
    ${badgesSectionHtml()}
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

  } else {
  // ── Bausteine für die Module ──────────────────────────────────────────
  const pctOf = (n, t) => (t ? Math.round((n / t) * 100) : 0);
  const fmt1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  const initials = (name) => String(name).replace(/,.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const avatarHue = (name) => [...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const ring = (pct, color) => {
    const r = 34, c = 2 * Math.PI * r;
    return `<svg class="sx-ring" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="${r}" class="sx-ring-bg"/><circle cx="42" cy="42" r="${r}" class="sx-ring-fg" stroke="${color}" stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 42 42)"/></svg>`;
  };
  const head = (icon, title, meta, key, total) => `<div class="sx-head"><span class="sx-ic">${icon}</span><h4>${escHtml(title)}</h4>
    ${meta ? `<span class="sx-meta">${escHtml(meta)}</span>` : ''}${key && total > 5 ? `<button class="btn-show-all sx-all" data-title="${escHtml(key)}">Alle ${total} ›</button>` : ''}</div>`;
  const empty = '<p class="sx-empty">Noch keine Daten</p>';

  // Ranking mit Siegerpodest für Platz 1–3 und Balken für Platz 4–6
  function podiumCard({ key, title, icon, color, items, meta, lead, attr }) {
    const at = (l) => (attr ? attr(l) : '');
    const top = items.slice(0, 3), rest = items.slice(3, 6);
    const max = items.length ? items[0][1] : 1;
    const ld = (label) => (lead ? lead(label) : '');
    const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);
    return `<section class="sx-card" style="--mc:${color}">${head(icon, title, meta, key, items.length)}
      ${!items.length ? empty : `<div class="sx-podium${top.length < 3 ? ' is-short' : ''}">${order.map((i) => { const [l, n] = top[i]; return `
        <div class="sx-pod sx-pod-${i + 1}" title="${escHtml(String(l))}" ${at(l)}>
          ${ld(l) || `<span class="sx-medal">${['🥇', '🥈', '🥉'][i]}</span>`}
          <span class="sx-pod-l">${escHtml(String(l))}</span>
          <span class="sx-pod-bar"><b>${n}×</b><i>${i + 1}</i></span>
        </div>`; }).join('')}</div>
      ${rest.length ? `<ol class="sx-rest" start="4">${rest.map(([l, n], i) => `<li ${at(l)}><span class="sx-rest-n">${i + 4}</span>${ld(l)}<span class="sx-rest-l">${escHtml(String(l))}</span>
        <span class="sx-rest-bar"><span style="width:${Math.max(6, Math.round((n / max) * 100))}%"></span></span><span class="sx-rest-c">${n}</span></li>`).join('')}</ol>` : ''}`}
    </section>`;
  }

  // Anteile als segmentierter Balken + Legende
  const SHARE_COLS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a', '#8e8e93'];
  function shareCard({ key, title, icon, color, items, meta }) {
    const tot = items.reduce((n, [, c]) => n + c, 0);
    const shown = items.slice(0, 6);
    const other = tot - shown.reduce((n, [, c]) => n + c, 0);
    const parts = other > 0 ? [...shown, ['Sonstige', other]] : shown;
    return `<section class="sx-card" style="--mc:${color}">${head(icon, title, meta, key, items.length)}
      ${!tot ? empty : `<div class="sx-share">${parts.map(([, c], i) => `<span style="flex:${c};background:${SHARE_COLS[i % SHARE_COLS.length]}"></span>`).join('')}</div>
      <ul class="sx-legend">${parts.map(([l, c], i) => `<li><span class="sx-dot" style="background:${SHARE_COLS[i % SHARE_COLS.length]}"></span><span class="sx-legend-l">${escHtml(String(l))}</span><span class="sx-legend-p">${pctOf(c, tot)} %</span><span class="sx-legend-c">${c}</span></li>`).join('')}</ul>`}
    </section>`;
  }

  // NACA als farbige Säulen
  function nacaCard() {
    const counts = Array(8).fill(0); let sum = 0, filled = 0;
    allInc.forEach((i) => { const n = parseInt(i.naca, 10); if (!isNaN(n) && n >= 0 && n <= 7) { counts[n]++; sum += n; filled++; } });
    const max = Math.max(1, ...counts);
    const avg = filled ? sum / filled : null;
    return `<section class="sx-card" style="--mc:#ff9f0a">${head('🩺', 'NACA-Skala', `${filled}/${totalInc} Einsätze`)}
      ${!filled ? empty : `<div class="sx-naca">${counts.map((n, i) => `<div class="sx-naca-col" title="${escHtml(NACA_LABELS[i])}"><span class="sx-naca-n">${n || ''}</span><span class="sx-naca-bar naca-${i}" style="height:${n ? Math.max(6, Math.round((n / max) * 100)) : 0}%"></span><span class="naca-badge naca-${i}">${i}</span></div>`).join('')}</div>
      <div class="sx-naca-avg"><span class="naca-badge naca-${Math.round(avg)}">${fmt1(avg)}</span><span><strong>Ø NACA ${fmt1(avg)}</strong><small>${escHtml(NACA_LABELS[Math.round(avg)])}</small></span></div>`}
    </section>`;
  }

  // Patientenalter in Altersgruppen
  function ageCard() {
    const groups = [['0–17', 0, 17, '🧒'], ['18–39', 18, 39, '🧑'], ['40–64', 40, 64, '🧔'], ['65–79', 65, 79, '🧓'], ['80+', 80, 200, '👵']];
    const cnt = groups.map(([, lo, hi]) => ages.filter((a) => a >= lo && a <= hi).length);
    const max = Math.max(1, ...cnt);
    return `<section class="sx-card" style="--mc:#bf5af2">${head('👤', 'Patient:innen', ages.length ? `${ages.length} mit Alter` : '')}
      ${!ages.length ? '<p class="sx-empty">Kein Alter im PZC erfasst</p>' : `<div class="sx-age-top"><div><strong>${avgAge}</strong><small>Ø Jahre</small></div><div><strong>${Math.min(...ages)}</strong><small>jüngste:r</small></div><div><strong>${Math.max(...ages)}</strong><small>älteste:r</small></div></div>
      <div class="sx-age">${groups.map(([l, , , e], i) => `<div class="sx-age-col"><span class="sx-age-n">${cnt[i] || ''}</span><span class="sx-age-bar" style="height:${cnt[i] ? Math.max(6, Math.round((cnt[i] / max) * 100)) : 0}%"></span><span class="sx-age-e">${e}</span><span class="sx-age-l">${l}</span></div>`).join('')}</div>`}
    </section>`;
  }

  // Wann ist was los? Wochentag × Tageszeit (nur Einsätze mit plausibler Uhrzeit)
  const incX = filteredSvcs.flatMap((sv) => (sv.incidents || []).filter(incFilter).map((inc) => ({ inc, svc: sv })));
  function timeCard() {
    const wd = Array(7).fill(0), hb = Array(8).fill(0);
    let n = 0;
    incX.forEach(({ inc, svc }) => {
      const a = parseLocalDt(svc.startAt), e = parseLocalDt(svc.endAt);
      let c = inc.createdAt ? new Date(inc.createdAt) : null;
      const al = (inc.times || {}).erhalten || (inc.times || {}).anfahrt;
      if (al && a) { c = new Date(a); c.setHours(+al.slice(0, 2), +al.slice(3), 0, 0); if (c < a) c = new Date(c.getTime() + 864e5); }
      if (!c || !a || !e || c < a || c > new Date(e.getTime() + 2 * 3600e3)) c = a; // keine plausible Uhrzeit → Dienstbeginn
      if (!c) return;
      wd[(c.getDay() + 6) % 7]++; hb[Math.floor(c.getHours() / 3)]++; n++;
    });
    const days = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
    const bestD = wd.indexOf(Math.max(...wd)), bestH = hb.indexOf(Math.max(...hb));
    const strip = (arr, best, lbl) => { const mx = Math.max(1, ...arr); return `<div class="sx-mini">${arr.map((v, i) => `<div class="sx-mini-col${i === best && v ? ' is-best' : ''}"><span class="sx-mini-bar" style="height:${v ? Math.max(8, Math.round((v / mx) * 100)) : 0}%"></span><span class="sx-mini-l">${lbl(i)}</span></div>`).join('')}</div>`; };
    const hh = (h) => String(h * 3).padStart(2, '0');
    return `<section class="sx-card" style="--mc:#0a84ff">${head('🕒', 'Wann ist was los?', '')}
      ${!n ? empty : `<p class="sx-note sx-when"><strong>${WEEKDAY_LONG[(bestD + 1) % 7]}</strong> · <strong>${hh(bestH)}–${hh(bestH + 1)} Uhr</strong></p>
      <div class="sx-mini-wrap">${strip(wd, bestD, (i) => days[i])}${strip(hb, bestH, (i) => (i % 2 ? '' : hh(i)))}</div>`}
    </section>`;
  }

  // Übersicht oben
  const nights = nonSegSvcs.filter((x) => { const c = shiftCode(x.startAt); return c && !c.day; }).length;
  const longestH = nonSegSvcs.reduce((m, x) => Math.max(m, +serviceDurationHours(x)), 0);
  const favCount = allInc.filter((i) => i.favorite).length;
  const lightPct = totalInc ? Math.round((lightsCount / totalInc) * 100) : 0;
  const hero = `<section class="sx-hero">
    <div class="sx-hero-main">
      <div class="sx-hero-big">${totalInc}</div><div class="sx-hero-lbl">Einsätze</div>
      <div class="sx-hero-sub">in <strong>${totalSvcs}</strong> Diensten · <strong>${Math.round(totalHours)}</strong> Stunden</div>
    </div>
    <div class="sx-hero-ring">${ring(lightPct, '#64d2ff')}<div><strong>${totalInc ? lightPct + '%' : '–'}</strong><small>Blaulicht</small></div></div>
    <div class="sx-hero-chips">
      <span>Ø <strong>${String(avgInc).replace('.', ',')}</strong> pro Dienst</span>
      <span>🌙 <strong>${nights}</strong> Nachtdienste</span>
      ${longestH ? `<span>⏱ längster <strong>${fmt1(longestH)} h</strong></span>` : ''}
      ${favCount ? `<span>★ <strong>${favCount}</strong> Favoriten</span>` : ''}
      ${segInc ? `<span>⚡ <strong>${segInc}</strong> SEG</span>` : ''}
    </div>
  </section>`;

  const vehLead = (name) => { const src = vehicleIconSrc(name); return src ? `<img class="sx-veh" src="${escHtml(src)}" alt="">` : ''; };
  const avLead = (name) => `<span class="sx-av" style="--h:${avatarHue(name)}">${escHtml(initials(name))}</span>`;

  const activeFilterCount = (statsFromDate ? 1 : 0) + (statsToDate ? 1 : 0) +
    statsVehicles.length + statsLocations.length + statsColleagues.length +
    statsKeywords.length + statsPzcs.length + statsNacaValues.length +
    statsEinsatzarten.length + statsStatKz.length;

  container.innerHTML = `
    ${reviewsEntryHtml()}
    <div class="stats-filter-bar">
      <button class="stats-filter-bar-btn" id="btn-open-stats-filter">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="sf-icon"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg> Filter${activeFilterCount > 0 ? ` <span class="stats-filter-bar-badge">${activeFilterCount}</span>` : ''}
      </button>
      ${activeFilterCount > 0 ? `<button class="stats-filter-bar-reset" id="btn-stats-reset" title="Filter zurücksetzen">✕ Zurücksetzen</button>` : ''}
    </div>
    ${hero}
    <div class="sx-grid">
      ${podiumCard({ key: 'Top Einsätze', title: 'Top-Stichwörter', icon: '🚨', color: '#ff453a', items: allAlarm })}
      ${podiumCard({ key: 'Top Fahrzeug', title: 'Fahrzeuge', icon: '🚑', color: '#0a84ff', items: allVehicle.filter(([k]) => k !== '-'), lead: vehLead })}
      ${podiumCard({ key: 'Top Kolleg:innen', title: 'Crew', icon: '🤝', color: '#30d158', items: allColleagues, lead: avLead, attr: (l) => `data-colleague="${escHtml(String(l))}"` })}
      ${podiumCard({ key: 'Top Dienststelle', title: 'Dienststellen', icon: '🏠', color: '#ff9f0a', items: allLocation.filter(([k]) => k !== '-') })}
      ${(() => { const comp = countTop(allInc.flatMap((i) => i.extraVehicles || []), 999); return comp.length ? podiumCard({ key: 'Companions', title: 'Liebste Companions', icon: '🚨', color: '#64d2ff', items: comp, meta: `${allInc.filter((i) => (i.extraVehicles || []).length).length} Einsätze`, lead: vehLead }) : ''; })()}
      ${timeCard()}
      ${timesFilled ? `<section class="sx-card sx-wide" style="--mc:#30d158">${head('⏱', 'Einsatzzeiten', `${timesFilled}/${totalInc} Einsätze`)}${timeStatsHtml('tt-grid')}<p class="sx-note sx-small">Durchschnitt, Anzahl und Spanne – aus den erfassten Status-Zeiten</p></section>` : ''}
      ${allTo.length ? podiumCard({ key: 'Top Ziele', title: 'Häufigste Ziele', icon: '🏥', color: '#ff375f', items: allTo, meta: `${routeFilled}/${totalInc} Einsätze` }) : ''}
      ${allFrom.length ? podiumCard({ key: 'Top Startorte', title: 'Häufigste Startorte', icon: '📍', color: '#5e5ce6', items: allFrom }) : ''}
      <div class="stats-group-title sx-group">Kennzahlen &amp; Patient</div>
      ${shareCard({ key: 'Einsatzart', title: 'Einsatzart', icon: '🧭', color: '#0a84ff', items: allEinsatzart, meta: `${eaFilled}/${totalInc} Einsätze` })}
      ${shareCard({ key: 'Statistikkennzahl', title: 'Statistikkennzahl', icon: '📊', color: '#30d158', items: allStatKz, meta: `${kzFilled}/${totalInc} Einsätze` })}
      ${nacaCard()}
      ${ageCard()}
      ${podiumCard({ key: 'Top PZC', title: 'PZC', icon: '🏥', color: '#bf5af2', items: allPzc, meta: `${pzcFilled}/${totalInc} Einsätze` })}
    </div>
    ${badgesSectionHtml()}
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

  }

  // Build popup data map keyed by title
  const popupData = {
    'Top Einsätze': allAlarm,
    'Top PZC': allPzc,
    'Einsatzart': allEinsatzart,
    'Statistikkennzahl': allStatKz,
    'Top Kolleg:innen': allColleagues,
    'Top Fahrzeug': allVehicle,
    'Top Dienststelle': allLocation,
    'Top Ziele': allTo,
    'Top Startorte': allFrom,
    'Companions': countTop(allInc.flatMap((i) => i.extraVehicles || []), 999),
  };
  const popupVeh = (name) => { const src = vehicleIconSrc(name); return src ? `<img class="lp-veh" src="${escHtml(src)}" alt="">` : ''; };
  const popupAv = (name) => `<span class="sx-av lp-av" style="--h:${[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)}">${escHtml(String(name).replace(/,.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase())}</span>`;
  const popupMeta = {
    'Top Einsätze': { icon: '🚨', color: '#ff453a', unit: 'Einsätze' },
    'Top PZC': { icon: '🏥', color: '#bf5af2', unit: 'Einsätze' },
    'Einsatzart': { icon: '🧭', color: '#0a84ff', unit: 'Einsätze' },
    'Statistikkennzahl': { icon: '📊', color: '#30d158', unit: 'Einsätze' },
    'Top Kolleg:innen': { icon: '🤝', color: '#30d158', unit: 'Dienste', lead: popupAv, colleague: true },
    'Top Fahrzeug': { icon: '🚑', color: '#0a84ff', unit: 'Dienste', lead: popupVeh },
    'Top Dienststelle': { icon: '🏠', color: '#ff9f0a', unit: 'Dienste' },
    'Top Ziele': { icon: '🏥', color: '#ff375f', unit: 'Einsätze' },
    'Top Startorte': { icon: '📍', color: '#5e5ce6', unit: 'Einsätze' },
    'Companions': { icon: '🚨', color: '#64d2ff', unit: 'Einsätze', lead: popupVeh },
  };
  container.querySelectorAll('.btn-show-all').forEach((btn) => {
    btn.addEventListener('click', () => showListPopup(btn.dataset.title, popupData[btn.dataset.title] || [], popupMeta[btn.dataset.title]));
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
      <div class="sf-section-title"><span class="sf-ic">📅</span>Zeitraum</div>
      <div class="sf-presets">${[['month', 'Dieser Monat'], ['last30', 'Letzte 30 Tage'], ['year', 'Dieses Jahr'], ['lastyear', 'Letztes Jahr'], ['all', 'Alles']].map(([k, l]) => `<button type="button" class="sf-preset" data-preset="${k}">${l}</button>`).join('')}</div>
      <div class="sf-date-row">
        <label>Von<input type="date" id="sf-from" value="${statsFromDate || ''}"></label>
        <label>Bis<input type="date" id="sf-to" value="${statsToDate || ''}"></label>
      </div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title"><span class="sf-ic">🚑</span>Fahrzeug</div>
      <div class="sf-chip-group">${chipHtml(allVehicleOpts, statsVehicles, 'vehicles')}</div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title"><span class="sf-ic">🏠</span>Dienststelle</div>
      <div class="sf-chip-group">${chipHtml(allLocationOpts, statsLocations, 'locations')}</div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title"><span class="sf-ic">🤝</span>Kolleg:innen</div>
      ${tagInputHtml('sf-colleague', 'Name')}
      ${tagsHtml(statsColleagues, 'colleagues')}
    </div>
    <div class="sf-section">
      <div class="sf-section-title"><span class="sf-ic">🚨</span>Einsatzstichwort</div>
      ${tagInputHtml('sf-keyword', 'Stichwort')}
      ${tagsHtml(statsKeywords, 'keywords')}
    </div>
    <div class="sf-section">
      <div class="sf-section-title"><span class="sf-ic">🏥</span>PZC</div>
      ${tagInputHtml('sf-pzc', 'PZC-Code')}
      ${tagsHtml(statsPzcs, 'pzcs')}
    </div>
    <div class="sf-section">
      <div class="sf-section-title"><span class="sf-ic">🩺</span>NACA-Score</div>
      <div class="sf-chip-group">${nacaChipsHtml()}</div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title"><span class="sf-ic">🧭</span>Einsatzart</div>
      <div class="sf-chip-group">${kennzahlChipsHtml('einsatzart', EINSATZART_MAP, statsEinsatzarten, 'einsatzart')}</div>
    </div>
    <div class="sf-section">
      <div class="sf-section-title"><span class="sf-ic">📊</span>Statistikkennzahl</div>
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

  // Schnellauswahl Zeitraum
  body.querySelectorAll('.sf-preset').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(), y = d.getFullYear(), pad = (n) => String(n).padStart(2, '0'), iso = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    const r = { month: [new Date(y, d.getMonth(), 1), new Date(y, d.getMonth() + 1, 0)], last30: [new Date(Date.now() - 29 * 864e5), d], year: [new Date(y, 0, 1), new Date(y, 11, 31)], lastyear: [new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)], all: [null, null] }[b.dataset.preset];
    body.querySelector('#sf-from').value = r[0] ? iso(r[0]) : '';
    body.querySelector('#sf-to').value = r[1] ? iso(r[1]) : '';
    body.querySelectorAll('.sf-preset').forEach((x) => x.classList.toggle('active', x === b));
  }));

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
  updateQuickBell();
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
    <img src="${escHtml(cat.iconNormal)}" class="hm-veh-img hm-veh-normal${vehSquareSrcs.has(cat.iconNormal) ? ' veh-sq' : ''}" alt="" />
    ${cat.iconSoSi ? `<img src="${escHtml(cat.iconSoSi)}" class="hm-veh-img hm-veh-sosi${vehSquareSrcs.has(cat.iconSoSi) ? ' veh-sq' : ''}" alt="" style="animation-delay:-${Date.now() % 1200}ms" />` : ''}
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
  const kz = inc.statKz && STATKZ_MAP.has(String(inc.statKz)) ? STATKZ_MAP.get(String(inc.statKz)) : '';
  const sub = [ea, kz, naca].filter(Boolean).join(' · ');
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

/** Laufende Dienstkarte nur in den Zeitangaben aktualisieren (Animation & Bilder bleiben). */
function patchHomeActiveCard() {
  const card = document.querySelector('#home-container .hm-hero.is-active');
  const svc = runningService();
  if (!card || !svc || card.dataset.svc !== svc.id || card.dataset.end !== svc.endAt) return false;
  const now = new Date(), start = parseLocalDt(svc.startAt), end = parseLocalDt(svc.endAt);
  if (!start || !end) return false;
  const pct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  const fill = card.querySelector('.hm-progress-fill'), p = card.querySelector('.hm-progress-pct'), left = card.querySelector('.hm-progress-left');
  if (fill) fill.style.width = pct.toFixed(1) + '%';
  if (p) p.textContent = Math.floor(pct) + ' %';
  if (left) left.textContent = homeRemainingText(end - now);
  return true;
}
function homeRemainingText(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60), m = min % 60;
  return 'noch ' + (h ? `${h} h${m ? ' ' + m + ' min' : ''}` : `${m} min`);
}

function homeActiveCardHtml(svc, now) {
  const start = parseLocalDt(svc.startAt);
  const end = parseLocalDt(svc.endAt);
  const pct = start && end && end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : 0;
  const incs = svc.incidents || [];
  const lights = incs.filter((i) => i.lights).length;
  const shown = incs.slice().reverse().slice(0, 4);
  const crew = (svc.colleagues || []).filter(Boolean);
  const navs = homeNavBtnsHtml(svc);
  return `<section class="hm-card hm-hero is-active${navs ? ' has-navs' : ''}" data-svc="${escHtml(svc.id)}" data-end="${escHtml(svc.endAt || '')}">${navs}
    <button type="button" class="hm-hero-open" data-open-svc="${escHtml(svc.id)}" aria-label="Dienst öffnen">
      <div class="hm-hero-top">
        <span class="hm-live"><span class="home-active-pulse"></span>Im Dienst</span>
        ${shiftCodeHtml(svc.startAt, 'is-small')}
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
      ${start && end && end > start ? `<div class="hm-progress-meta"><span class="hm-progress-pct">${Math.floor(pct)} %</span><span class="hm-progress-left">${homeRemainingText(end - now)}</span></div>` : ''}
      ${crew.length ? `<div class="hm-crew">👥 ${crew.map((c) => `<span class="crew-link" role="button" data-colleague="${escHtml(c)}">${escHtml(c)}</span>`).join(' · ')}</div>` : ''}
    </button>
    <div class="hm-hero-incs-hd">
      <span>${incs.length} ${incs.length === 1 ? 'Einsatz' : 'Einsätze'}${lights ? ` · <span class="hm-blue">🔵 ${lights}</span>` : ''}</span>
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
    const navs = homeNavBtnsHtml(item.svc);
    return `<section class="hm-card hm-hero${navs ? ' has-navs' : ''}">${navs}<button type="button" class="hm-hero-open" data-open-svc="${escHtml(item.svc.id)}">${inner}</button></section>`;
  }
  const icsNavs = homeNavBtnsHtml({ location });
  return `<section class="hm-card hm-hero${icsNavs ? ' has-navs' : ''}">${icsNavs}<div class="hm-hero-open is-static">${inner}</div>
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
  ${storyBannerHtml(now)}
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
// Versionsnummer = Cache-Version in sw.js (bei jedem Update beide erhöhen)
const APP_VERSION = 110;
const APP_VERSION_DATE = '07.11.2026';
const SETTINGS_PAGES = {
  profil: 'Profil',
  darstellung: 'Darstellung',
  dienstplan: 'Dienstplan',
  bedienung: 'Bedienung',
  orte: 'Orte & Ziele',
  benachrichtigungen: 'Benachrichtigungen',
  daten: 'Daten & Backup',
  speicher: 'Speicher',
  ueber: 'Über',
};
let settingsSub = null;

const SET_ICONS = {
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5a7 7 0 0 1 14 0"/></svg>',
  brush: '<svg viewBox="0 0 24 24"><path d="M14.5 4.5 19.5 9.5 11 18l-5-5z"/><path d="M6 13c-2 1-2.5 3-2.5 6.5C7 19.5 9 19 10 17"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8.5 12V5.5a1.5 1.5 0 0 1 3 0V11M11.5 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14.5 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 3.6-2.6 6.5-6 6.5-2.4 0-4-1.2-5.2-3.3L4.6 13.4a1.5 1.5 0 0 1 2.5-1.6l1.4 1.7"/></svg>',
  disk: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 1.5h-14z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
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

    <div class="set-group-header">App</div>
    <div class="set-group">
      ${setRow({ icon: 'brush', color: 'indigo', title: 'Darstellung', value: themeLabel(currentTheme()) + (compactOn() ? ' · Kompakt' : ''), push: 'darstellung' })}
      ${setRow({ icon: 'hand', color: 'teal', title: 'Bedienung', sub: 'Beim Öffnen, Links, Kurzbefehle', value: ({ '': 'Start', 'neu-einsatz': 'Neuer Einsatz', tagebuch: 'Tagebuch', dienstplan: 'Dienstplan', statistik: 'Statistik' })[lsGet('etb_launch_action') || ''] || 'Start', push: 'bedienung' })}
    </div>

    <div class="set-group-header">Dienstplan</div>
    <div class="set-group">
      ${setRow({ icon: 'calendar', color: 'red', title: 'Dienstplan', sub: 'Verbindung, Dienststellen', value: icsUrl ? 'Verbunden' : 'Aus', push: 'dienstplan' })}
      ${setRow({ icon: 'bell', color: 'red', title: 'Benachrichtigungen', sub: 'Neuer Einsatz?, Dienstplan-Änderungen', value: quickPushEnabled() ? 'An' : 'Aus', push: 'benachrichtigungen' })}
    </div>

    <div class="set-group-header">Stammdaten</div>
    <div class="set-group">
      ${setRow({ icon: 'car', color: 'orange', title: 'Fahrzeuge &amp; Icons', value: `${cats.length} · ${vehicles.size}`, id: 'btn-open-vehicles-popup' })}
      ${setRow({ icon: 'siren', color: 'green', title: 'Stichwörter &amp; PZC', value: `${(state.alarmCodes || []).length} · ${(state.pzcCodes || []).length}`, id: 'btn-open-codes-popup' })}
      ${setRow({ icon: 'building', color: 'blue', title: 'Dienststellen', value: abtRowValue(), id: 'btn-open-abt-popup' })}
      ${setRow({ icon: 'pin', color: 'teal', title: 'Orte &amp; Ziele', sub: 'Kürzel für Start → Ziel', value: String((state.places || []).length), push: 'orte' })}
    </div>

    <div class="set-group-header">Daten</div>
    <div class="set-group">
      ${setRow({ icon: 'archive', color: 'blue', title: 'Daten &amp; Backup', sub: 'Sichern, Import, Kalender-Export', push: 'daten' })}
      ${setRow({ icon: 'disk', color: 'pink', title: 'Speicher', sub: 'Belegung, Fahrzeuggrafiken', value: iconsOfflineEnabled() ? '' : 'Grafiken ausgelagert', push: 'speicher' })}
    </div>

    <div class="set-group">
      ${setRow({ icon: 'info', color: 'gray', title: 'Über', value: 'Version ' + APP_VERSION, push: 'ueber' })}
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
    bedienung: settingsPageBedienung,
    orte: settingsPageOrte,
    benachrichtigungen: settingsPageBenachrichtigungen,
    speicher: settingsPageSpeicher,
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
function statsStyle() { return lsGet('etb_stats_style') === 'classic' ? 'classic' : 'dynamic'; }

const compactOn = () => lsGet('etb_compact') === '1';
function applyCompact(on) {
  lsSet('etb_compact', on ? '1' : null);
  document.documentElement.toggleAttribute('data-compact', on);
  if (on) document.documentElement.setAttribute('data-compact', '1');
}
function settingsPageDarstellung(el, title) {
  const cur = currentTheme();
  const choice = (attr, val, label, on) => `<button type="button" class="set-row set-choice" role="radio" aria-checked="${on}" data-${attr}="${val}">
      <span class="set-row-text"><span class="set-row-title">${label}</span></span>
      <span class="set-check">${SET_ICONS.check}</span>
    </button>`;
  el.innerHTML = `${title}
    <div class="set-group-header">Design</div>
    <div class="set-group" role="radiogroup" aria-label="Design">
      ${choice('theme-choice', 'system', 'Wie System', cur === 'system')}
      ${choice('theme-choice', 'light', 'Hell', cur === 'light')}
      ${choice('theme-choice', 'dark', 'Dunkel', cur === 'dark')}
    </div>
    <div class="set-group">
      <label class="set-row set-row-switch">
        <span class="set-row-text"><span class="set-row-title">Kompakt</span></span>
        <input type="checkbox" class="set-switch" id="set-compact" ${compactOn() ? 'checked' : ''}>
      </label>
    </div>
    <div class="set-group-header">Statistik</div>
    <div class="set-group" role="radiogroup" aria-label="Statistik">
      ${choice('stats-choice', 'dynamic', 'Dynamisch', statsStyle() === 'dynamic')}
      ${choice('stats-choice', 'classic', 'Klassisch', statsStyle() === 'classic')}
    </div>`;
  el.querySelector('#set-compact').addEventListener('change', (e) => { applyCompact(e.target.checked); renderSettings(); });
  el.querySelectorAll('[data-stats-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lsSet('etb_stats_style', btn.dataset.statsChoice);
      el.querySelectorAll('[data-stats-choice]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      renderStats();
    });
  });
  el.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeChoice);
      el.querySelectorAll('[data-theme-choice]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      renderSettings();
    });
  });
}

// — Dienstplan ——————————————————————————————————————————————————————————
function settingsPageBenachrichtigungen(el, title) {
  const svc = runningService();
  el.innerHTML = `${title}
    <div class="set-group-header">Schnell-Nachricht „Neuer Einsatz?“</div>
    <div class="set-group">
      <label class="set-row set-row-switch">
        <span class="set-row-text"><span class="set-row-title">Im Dienst bereitlegen</span><span class="set-row-sub">Während eines laufenden Dienstes liegt „🚑 Neuer Einsatz?“ im Sperrbildschirm – antippen öffnet sofort die Einsatzerfassung.</span></span>
        <input type="checkbox" class="set-switch" id="nb-quick" ${quickPushEnabled() ? 'checked' : ''}>
      </label>
      <button type="button" class="set-row set-action" id="nb-quick-now" ${svc ? '' : 'disabled'}><span class="set-row-text"><span class="set-row-title">Jetzt bereitlegen</span><span class="set-row-sub">${svc ? escHtml(svc.vehicle || 'Laufender Dienst') : 'Gerade läuft kein Dienst'}</span></span></button>
    </div>
    <p class="set-group-footer">Die Schnell-Nachricht kommt immer lautlos – ohne Ton und Vibration.</p>
    <div id="push-settings"></div>`;
  el.querySelector('#nb-quick').addEventListener('change', async (e) => {
    await setQuickPushEnabled(e.target.checked);
    toast(e.target.checked ? 'Schnell-Nachricht an.' : 'Schnell-Nachricht aus.', 'success', 1500);
    renderSettings();
  });
  el.querySelector('#nb-quick-now').addEventListener('click', () => quickPushManual());
  renderPushSettings(el.querySelector('#push-settings')).catch(() => {});
}

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

    ${legacy ? `
    <div class="set-group-header">Alte Kalender-URL</div>
    <div class="set-group">
      <div class="set-form"><label>Bisher direkt gespeichert</label><input type="text" id="dp-legacy-url" value="${escHtml(legacy)}" readonly></div>
      <button type="button" class="set-row set-action" id="btn-dp-legacy-copy"><span class="set-row-text set-row-title">URL kopieren</span></button>
      <button type="button" class="set-row set-destructive" id="btn-dp-legacy-del"><span class="set-row-text set-row-title">Alte URL vom Gerät löschen</span></button>
    </div>
    <p class="set-group-footer">Wird nicht mehr gebraucht – der Dienstplan kommt über den Worker.</p>` : ''}

    <div class="set-group">
      ${setRow({ icon: 'building', color: 'blue', title: 'Dienststellen', value: abtRowValue(), id: 'btn-dp-open-abt' })}
    </div>
    <p class="set-group-footer">Verknüpft die Dienststelle eines Dienstes mit der Dienstplan-ID – so öffnet „Tagesdienstplan“ direkt den richtigen Tag. Ob Links in Safari oder in der App aufgehen, stellst du unter <strong>Einstellungen → Bedienung</strong> ein.</p>`;
  el.querySelector('#btn-dp-open-abt').addEventListener('click', openAbteilungenPopup);

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
  el.querySelector('#btn-export-ics').addEventListener('click', openIcsExportDialog);
  el.querySelector('#btn-import-trigger').addEventListener('click', () => el.querySelector('#file-import').click());
  el.querySelector('#file-import').addEventListener('change', (e) => { if (e.target.files[0]) openImportDialog(e.target.files[0]); e.target.value = ''; });
  setupDropZone(el.querySelector('#settings-backup-group'), (file) => doImport(file));
  el.querySelector('#btn-open-reset').addEventListener('click', openResetDialog);
}

// — Bedienung —————————————————————————————————————————————————————————
function settingsPageBedienung(el, title) {
  el.innerHTML = `${title}
    <div class="set-group-header">Beim Öffnen</div>
    <div class="set-group" role="radiogroup" aria-label="Beim Öffnen">
      ${[['', 'Startseite', ''], ['neu-einsatz', 'Neuer Einsatz', 'Läuft gerade ein Dienst, öffnet sich sofort „Neuer Einsatz“ – sonst die Startseite'], ['tagebuch', 'Tagebuch', ''], ['dienstplan', 'Dienstplan', ''], ['statistik', 'Statistik', '']].map(([v, l, sub]) => `<button type="button" class="set-row set-choice" role="radio" aria-checked="${(lsGet('etb_launch_action') || '') === v}" data-launch-choice="${v}">
        <span class="set-row-text"><span class="set-row-title">${l}</span>${sub ? `<span class="set-row-sub">${sub}</span>` : ''}</span><span class="set-check">${SET_ICONS.check}</span></button>`).join('')}
    </div>
    <p class="set-group-footer">Gilt, wenn die App frisch gestartet wird oder länger als 10 Minuten im Hintergrund war.</p>
    <div class="set-group-header">Kurzbefehle</div>
    <div class="set-group">
      ${SHORTCUTS.map((x) => `<div class="set-row sc-row"><span class="sc-ic">${x.icon}</span><span class="set-row-text"><span class="set-row-title">${x.label}</span><span class="set-row-sub sc-url">${escHtml(location.origin + location.pathname + x.hash)}</span></span>
        <button type="button" class="btn-ghost sc-copy" data-sc="${x.hash}">Kopieren</button></div>`).join('')}
    </div>
    <p class="set-group-footer">Diese Adressen öffnen die App direkt an der passenden Stelle – z. B. als Lesezeichen, auf Android/Desktop als App-Verknüpfung (lange auf das App-Symbol drücken). Hinweis iPhone: Kurzbefehle-App und Links öffnen solche Adressen in Safari statt in der installierten App – dort nutzt du am besten „Beim Öffnen → Neuer Einsatz“.</p>    <div class="set-group-header">Links öffnen</div>
    <div class="set-group" role="radiogroup" aria-label="Links öffnen">
      <button type="button" class="set-row set-choice" role="radio" aria-checked="${dpLinkMode() === 'safari'}" data-dp-link="safari">
        <span class="set-row-text"><span class="set-row-title">In Safari</span><span class="set-row-sub">Du bleibst im Online Dienstplan angemeldet</span></span>
        <span class="set-check">${SET_ICONS.check}</span>
      </button>
      <button type="button" class="set-row set-choice" role="radio" aria-checked="${dpLinkMode() === 'app'}" data-dp-link="app">
        <span class="set-row-text"><span class="set-row-title">In der App</span><span class="set-row-sub">Öffnet ein Fenster über dem Tagebuch</span></span>
        <span class="set-check">${SET_ICONS.check}</span>
      </button>
    </div>
    <p class="set-group-footer">Gilt für den Tagesdienstplan und für Links in Notizen. ${isIOSDevice() ? '„In Safari“ nutzt ein iOS-Schema (ab iOS 17). Passiert beim Tippen nichts, „In der App“ wählen.' : 'Auf diesem Gerät öffnen Links immer in einem neuen Tab; die Auswahl gilt für iPhone/iPad.'}</p>`;
  el.querySelectorAll('[data-launch-choice]').forEach((btn) => btn.addEventListener('click', () => {
    lsSet('etb_launch_action', btn.dataset.launchChoice || null);
    el.querySelectorAll('[data-launch-choice]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
  }));
  el.querySelectorAll('.sc-copy').forEach((btn) => btn.addEventListener('click', async () => {
    const url = location.origin + location.pathname + btn.dataset.sc;
    try { await navigator.clipboard.writeText(url); toast('Adresse kopiert.', 'success', 1500); } catch (_) { prompt('Adresse kopieren:', url); }
  }));
  el.querySelectorAll('[data-dp-link]').forEach((btn) => btn.addEventListener('click', () => {
    lsSet(DP_LINK_KEY, btn.dataset.dpLink);
    el.querySelectorAll('[data-dp-link]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    renderServiceList(); if (selectedServiceId) renderServiceDetail();
  }));
}

// — Orte & Ziele ——————————————————————————————————————————————————————
function settingsPageOrte(el, title) {
  const places = state.places || [];
  // Anzeige sortiert (Häufigkeit in Start/Ziel oder alphabetisch); data-i bleibt der echte Index
  const mode = lsGet('etb_places_sort') === 'alpha' ? 'alpha' : 'freq';
  const used = new Map();
  allIncidentsFlat().forEach((inc) => [inc.from, inc.to].forEach((v) => { const k = String(v || '').trim().toLowerCase(); if (k) used.set(k, (used.get(k) || 0) + 1); }));
  const count = (p) => used.get(p.toLowerCase()) || 0;
  const order = places.map((p, i) => i).sort((a, b) => mode === 'alpha'
    ? places[a].localeCompare(places[b], 'de')
    : count(places[b]) - count(places[a]) || places[a].localeCompare(places[b], 'de'));
  el.innerHTML = `${title}
    ${places.length > 1 ? `<div class="place-sort" role="radiogroup" aria-label="Sortierung">
      <button type="button" role="radio" aria-checked="${mode === 'freq'}" data-place-sort="freq">Häufigkeit</button>
      <button type="button" role="radio" aria-checked="${mode === 'alpha'}" data-place-sort="alpha">A–Z</button>
    </div>` : ''}
    <div class="set-group-header">Deine Kürzel</div>
    <div class="set-group">
      ${places.length ? order.map((i) => [places[i], i]).map(([p, i]) => `<div class="set-row place-row"><input type="text" class="place-edit" data-i="${i}" value="${escHtml(p)}" autocomplete="off" enterkeyhint="done" aria-label="Kürzel bearbeiten">${mode === 'freq' && count(p) ? `<span class="place-n">${count(p)}×</span>` : ''}<button type="button" class="btn-ghost place-del" data-i="${i}" aria-label="Entfernen">Entfernen</button></div>`).join('') : '<div class="set-row"><span class="set-row-text set-row-sub">Noch keine Kürzel – z. B. „KH Oberwart ZAE“ oder „AH Menda“.</span></div>'}
      <div class="set-row place-add-row"><input type="text" id="place-new" placeholder="Neues Kürzel" autocomplete="off" enterkeyhint="done"><button type="button" class="btn-secondary" id="btn-place-add">Hinzufügen</button></div>
    </div>
    <p class="set-group-footer">Zum Bearbeiten in den Eintrag tippen.</p>`;
  const save = (list) => { state.places = [...new Set(list.map((x) => x.trim()).filter(Boolean))]; saveState(); renderSettingsPage(); };
  el.querySelectorAll('.place-del').forEach((b) => b.addEventListener('click', () => save(places.filter((_, i) => i !== +b.dataset.i))));
  el.querySelectorAll('[data-place-sort]').forEach((b) => b.addEventListener('click', () => { lsSet('etb_places_sort', b.dataset.placeSort === 'alpha' ? 'alpha' : null); renderSettingsPage(); }));
  el.querySelectorAll('.place-edit').forEach((inp) => {
    const commit = () => {
      const i = +inp.dataset.i, v = inp.value.trim();
      if (v === places[i]) return;
      if (!v) { inp.value = places[i]; return; } // leer = nichts ändern (Löschen über „Entfernen“)
      const list = [...places]; list[i] = v; save(list);
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } if (e.key === 'Escape') { inp.value = places[+inp.dataset.i]; inp.blur(); } });
  });
  const inp = el.querySelector('#place-new');
  const add = () => { if (inp.value.trim()) save([...places, inp.value]); };
  el.querySelector('#btn-place-add').addEventListener('click', add);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
}

// — Speicher ——————————————————————————————————————————————————————————
function settingsPageSpeicher(el, title) {
  el.innerHTML = `${title}
    <div class="set-group-header">Speicher auf diesem Gerät</div>
    <div class="set-group" id="about-storage"><div class="set-row"><span class="set-row-text set-row-title">Wird berechnet …</span></div></div>
    <p class="set-group-footer" id="about-storage-foot"></p>
    <div class="set-group">
      <label class="set-row set-row-switch">
        <span class="set-row-text"><span class="set-row-title">Fahrzeuggrafiken offline speichern</span><span class="set-row-sub">Aus: Grafiken werden jedes Mal aus dem Netz geladen und nicht auf dem Gerät abgelegt.</span></span>
        <input type="checkbox" class="set-switch" id="about-icons-offline" ${iconsOfflineEnabled() ? 'checked' : ''}>
      </label>
    </div>
    <p class="set-group-footer">Tipp: Unter „Daten &amp; Backup“ regelmäßig eine Sicherung exportieren.</p>`;
  renderStorageOverview(el);
  el.querySelector('#about-icons-offline').addEventListener('change', async (e) => {
    const on = e.target.checked;
    if (!on && !confirm('Fahrzeuggrafiken nicht mehr auf dem Gerät speichern?\n\nDie gespeicherten Grafiken werden gelöscht. Ohne Netz werden dann keine Fahrzeugbilder angezeigt.')) { e.target.checked = true; return; }
    await setIconsOffline(on);
    toast(on ? 'Grafiken werden wieder offline gespeichert.' : 'Fahrzeuggrafiken ausgelagert.', 'success', 2200);
    renderStorageOverview(el);
  });
}

// — Über ————————————————————————————————————————————————————————————————
function settingsPageUeber(el, title) {
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  el.innerHTML = `${title}
    <div class="set-about">
      <img src="icons/icon-192.png" alt="">
      <h3>Einsatztagebuch</h3>
      <p>Version ${APP_VERSION} · ${APP_VERSION_DATE}</p>
    </div>
    <div class="set-group">
      <div class="set-row"><span class="set-row-text set-row-title">Version</span><span class="set-row-value">${APP_VERSION}</span></div>
      <div class="set-row"><span class="set-row-text set-row-title">Stand</span><span class="set-row-value">${APP_VERSION_DATE}</span></div>
      <div class="set-row"><span class="set-row-text set-row-title">Offline gespeichert</span><span class="set-row-value" id="about-sw">…</span></div>
      <div class="set-row"><span class="set-row-text set-row-title">Neueste Version</span><span class="set-row-value" id="about-latest">…</span></div>
      <button type="button" class="set-row set-action" id="btn-app-update"><span class="set-row-text set-row-title">Nach Update suchen</span></button>
    </div>
    <p class="set-group-footer">Lädt die App-Dateien frisch vom Server. Deine Daten, Einstellungen und Mitteilungen bleiben erhalten.</p>
    <div class="set-group">
      <div class="set-row"><span class="set-row-text set-row-title">Als App installiert</span><span class="set-row-value">${standalone ? 'Ja' : 'Nein'}</span></div>
      <div class="set-row"><span class="set-row-text set-row-title">Dauerhafter Speicher</span><span class="set-row-value" id="about-persist">…</span></div>
    </div>
    <p class="set-group-footer">${standalone ? '' : 'Tipp: In Safari „Teilen → Zum Home-Bildschirm“ wählen, dann startet das Tagebuch wie eine App. '}Privates Eigenprojekt – kein Angebot des ÖRK.</p>`;
  // Neueste Version am Server prüfen, bei Bedarf aktualisieren
  const latestEl = el.querySelector('#about-latest');
  const upd = el.querySelector('#btn-app-update');
  let latest = null;
  const check = async () => {
    latestEl.textContent = 'wird geprüft …';
    latest = await latestAppVersion();
    if (latest === null) { latestEl.textContent = 'nicht erreichbar'; upd.querySelector('.set-row-title').textContent = 'Nach Update suchen'; return; }
    const newer = latest > APP_VERSION;
    latestEl.textContent = newer ? `Version ${latest} verfügbar` : `Version ${latest} ✓ aktuell`;
    upd.querySelector('.set-row-title').textContent = newer ? `Jetzt auf Version ${latest} aktualisieren` : 'Trotzdem neu laden';
    upd.classList.toggle('is-strong', newer);
  };
  check();
  upd.addEventListener('click', async () => {
    if (latest === null) { check(); return; }
    upd.disabled = true;
    upd.querySelector('.set-row-title').textContent = 'Wird aktualisiert …';
    await forceAppUpdate();
  });
  // Welche Version liegt offline auf dem Gerät (Service-Worker-Cache)?
  const swEl = el.querySelector('#about-sw');
  if ('caches' in window) {
    caches.keys().then((keys) => {
      const v = keys.map((k) => (/^etb-cache-v(\d+)$/.exec(k) || [])[1]).filter(Boolean).map(Number).sort((a, b) => b - a)[0];
      swEl.textContent = !v ? '—' : v === APP_VERSION ? `Version ${v} ✓` : v < APP_VERSION ? `Version ${v} · Update wird geladen` : `Version ${v}`;
    }).catch(() => { swEl.textContent = '—'; });
  } else swEl.textContent = '—';
  const persistEl = el.querySelector('#about-persist');
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => { persistEl.textContent = p ? 'Ja' : 'Nein'; }).catch(() => { persistEl.textContent = '—'; });
  } else persistEl.textContent = '—';
}

/** Bytes hübsch: 1,2 MB / 340 KB / 12 B */
function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return fmtNum(Math.round(n / 102.4) / 10) + ' KB';
  return fmtNum(Math.round(n / 104857.6) / 10) + ' MB';
}

/** Größe der Einträge eines Caches (undurchsichtige Antworten zählen als unbekannt). */
async function cacheSize(name) {
  const c = await caches.open(name);
  let bytes = 0, unknown = 0, count = 0;
  for (const req of await c.keys()) {
    const res = await c.match(req);
    count++;
    if (!res || res.type === 'opaque') { unknown++; continue; }
    const len = +res.headers.get('content-length');
    if (len) bytes += len;
    else { try { bytes += (await res.clone().blob()).size; } catch (_) { unknown++; } }
  }
  return { bytes, unknown, count };
}

/** Übersicht: was belegt wie viel Platz (localStorage + Caches). */
async function renderStorageOverview(root) {
  const box = root.querySelector('#about-storage'), foot = root.querySelector('#about-storage-foot');
  if (!box) return;
  // localStorage: Zeichen × 2 Byte (Safari zählt UTF-16)
  const ls = (k) => { try { const v = localStorage.getItem(k); return v ? (k.length + v.length) * 2 : 0; } catch (_) { return 0; } };
  const size = (x) => (x === undefined ? 0 : JSON.stringify(x).length * 2);
  const listKeys = ['alarmCodes', 'pzcCodes', 'alarmBlaulicht', 'dienststellen'];
  const diary = size(state.services);
  const lists = listKeys.reduce((n, k) => n + size(state[k]), 0);
  const stateTotal = ls(STORAGE_KEY);
  let dp = 0, own = 0, foreign = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k === STORAGE_KEY) continue;
      if (/^etb_(ics|dp)/.test(k)) dp += ls(k);
      else if (/^etb_/.test(k)) own += ls(k);
      else foreign += ls(k);
    }
  } catch (_) {}
  const other = Math.max(0, stateTotal - diary - lists) + own;
  let app = null, icons = null;
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      app = { bytes: 0, unknown: 0, count: 0 };
      for (const k of keys.filter((x) => x.startsWith('etb-cache-'))) { const r = await cacheSize(k); app.bytes += r.bytes; app.unknown += r.unknown; app.count += r.count; }
      icons = await cacheSize(ICON_CACHE);
    } catch (_) {}
  }
  const rows = [
    { t: 'Tagebuch', sub: `${state.services.length} Dienste · ${state.services.reduce((n, x) => n + (x.incidents || []).length, 0)} Einsätze`, b: diary, c: '#ff453a' },
    { t: 'Stichwörter & Listen', sub: `${(state.alarmCodes || []).length} Stichwörter · ${(state.pzcCodes || []).length} PZC`, b: lists, c: '#ff9f0a' },
    { t: 'Dienstplan-Zwischenspeicher', sub: 'Kalender, Änderungen, Verlauf', b: dp, c: '#30d158' },
    { t: 'Einstellungen & Sonstiges', sub: 'Fahrzeuge, Profil, Merker', b: other, c: '#8e8e93' },
  ];
  // Größe der Grafiken: vom Fremdserver nicht lesbar → aus der Systemangabe schätzen
  let sysUsage = null;
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e && e.usage != null) sysUsage = e; } } catch (_) {}
  let iconEst = null;
  if (icons && icons.unknown && sysUsage) {
    const rest = sysUsage.usage - (app ? app.bytes : 0) - icons.bytes;
    if (rest > 0) iconEst = rest + icons.bytes;
  }
  if (icons) rows.push({ t: 'Fahrzeuggrafiken', sub: icons.count ? `${icons.count} ${icons.count === 1 ? 'Grafik' : 'Grafiken'}${icons.unknown ? (iconEst ? ' · Obergrenze' : ' · Größe unbekannt') : ''}` : iconsOfflineEnabled() ? 'noch keine gespeichert' : 'ausgelagert – nicht auf dem Gerät', b: iconEst || icons.bytes, est: !!iconEst, c: '#0a84ff', unknown: icons.unknown && !iconEst, icons: true });
  if (app) rows.push({ t: 'App-Dateien (offline)', sub: `Version ${APP_VERSION}`, b: app.bytes, c: '#bf5af2' });
  if (foreign) rows.push({ t: 'Andere Apps dieser Adresse', sub: 'z. B. RKTel – wird hier nicht angefasst', b: foreign, c: '#48484a' });
  const total = rows.reduce((n, r) => n + r.b, 0) || 1;
  const lsUsed = stateTotal + dp + own + foreign;
  box.innerHTML = `<div class="set-row st-mem-bar-row"><div class="st-mem-bar">${rows.filter((r) => r.b && !r.est).map((r) => `<span style="flex:${r.b};background:${r.c}"></span>`).join('')}</div></div>` +
    rows.map((r) => `<div class="set-row st-mem-row"><span class="st-mem-dot" style="background:${r.c}"></span>
      <span class="set-row-text"><span class="set-row-title">${r.t}</span><span class="set-row-sub">${escHtml(r.sub)}</span></span>
      <span class="set-row-value">${r.unknown && !r.b ? '–' : (r.est ? 'max. ' : '') + fmtBytes(r.b) + (r.unknown ? ' +' : '')}</span></div>
      ${r.icons && icons.count ? `<div class="set-row st-mem-actrow"><span class="set-row-text"><span class="set-row-sub">${r.est ? 'Der Grafik-Server gibt die Dateigröße aus Sicherheitsgründen nicht preis. Angezeigt ist der Rest der Gesamtbelegung – die echte Größe ist meist deutlich kleiner. ' : ''}Auslagern löscht die gespeicherten Grafiken vom Gerät.</span></span><button type="button" class="btn-ghost st-mem-act" id="about-icons-drop">Auslagern</button></div>` : ''}`).join('');
  const est = sysUsage ? ` Laut System belegt diese Adresse insgesamt ${fmtBytes(sysUsage.usage)}${sysUsage.quota ? ` von erlaubten ${fmtBytes(sysUsage.quota)}` : ''}.` : '';
  const pct = Math.round((lsUsed / (5 * 1024 * 1024)) * 100);
  foot.innerHTML = `Tagebuch, Listen und Einstellungen liegen im Browser-Speicher (localStorage). Safari erlaubt dort etwa 5 MB pro Adresse – davon sind <strong>${fmtBytes(lsUsed)} (${pct} %)</strong> belegt${foreign ? ', inklusive anderer Apps auf dieser Adresse' : ''}.${est} Regelmäßig sichern lohnt sich: iOS kann Daten von Web-Apps löschen, die länger nicht geöffnet wurden.`;
  const drop = box.querySelector('#about-icons-drop');
  if (drop) drop.addEventListener('click', async () => {
    if (!confirm('Gespeicherte Fahrzeuggrafiken vom Gerät löschen?\n\nSie werden ab jetzt nicht mehr offline gespeichert, sondern bei Bedarf aus dem Netz geladen.')) return;
    await setIconsOffline(false);
    const sw = root.querySelector('#about-icons-offline'); if (sw) sw.checked = false;
    toast('Fahrzeuggrafiken ausgelagert.', 'success', 2200);
    renderStorageOverview(root);
  });
}

/** Version, die gerade am Server liegt (aus sw.js gelesen, am Cache vorbei). */
async function latestAppVersion() {
  try {
    const res = await fetch('./sw.js?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    const m = /CACHE_PREFIX \+ 'v(\d+)'/.exec(await res.text());
    return m ? Number(m[1]) : null;
  } catch (_) { return null; }
}

/** App-Dateien frisch holen und neu starten – Daten und Mitteilungen bleiben. */
async function forceAppUpdate() {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.update().catch(() => {});
    // Browser-Zwischenspeicher für die App-Dateien auffrischen
    await Promise.all(['./', './index.html', './app.js', './styles.css', './sw.js', './manifest.json']
      .map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
    // eigene Offline-Kopien verwerfen (Fahrzeuggrafiken & Hinweise bleiben)
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('etb-cache-')).map((k) => caches.delete(k)));
    }
    if (reg && reg.waiting) reg.waiting.postMessage({ type: 'skip-waiting' });
  } catch (_) {}
  location.reload();
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
  if (!iconsOfflineEnabled()) { el.innerHTML = '<span>☁️ Grafiken werden nicht lokal gespeichert (Einstellungen → Über)</span>'; return; }
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

// ── Dienststellen (Aufbau wie Stichwörter & PZC) ────────────────────────────
function abtRowValue() { const n = (state.dienststellen || []).length, k = abteilungSuggestions().length; return k ? `${n} · ${k} Vorschl.` : String(n); }
function abtSuggestHidden() { try { const a = JSON.parse(lsGet('etb_abt_sug_hidden') || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
/** Dienststellen aus Tagebuch/Dienstplan ohne Eintrag in der Liste. */
function abteilungSuggestions() {
  const hidden = new Set(abtSuggestHidden());
  const map = new Map();
  const add = (name, src) => {
    const n = String(name || '').trim();
    if (!n) return;
    // „MINA“ und „MINA RKZ“ / „MINA West“ als eine Dienststelle zählen; kürzeste Schreibweise anzeigen
    const k = n.toLowerCase().split(/\s+/).filter((w) => w !== 'rkz' && w !== 'west').join(' ') || n.toLowerCase();
    const e = map.get(k) || { name: n, n: 0, tb: 0, dp: 0 };
    if (n.length < e.name.length) e.name = n;
    e.n++; e[src]++; map.set(k, e);
  };
  state.services.filter((s) => !s.isSeg).forEach((s) => add(s.location, 'tb'));
  const cache = readIcsCache();
  ((cache && cache.shifts) || []).forEach((x) => add(x.location, 'dp'));
  return [...map.values()]
    .filter((e) => !hidden.has(e.name.toLowerCase()) && !findAbteilung({ location: e.name }))
    .map((e) => ({ ...e, src: e.tb && e.dp ? 'Tagebuch & Dienstplan' : e.tb ? 'im Tagebuch' : 'im Dienstplan' }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de'))
    .slice(0, 30);
}

function openAbteilungenPopup() {
  _abtEditIdx = null;
  renderAbteilungenPopup();
  openDialog('dialog-abteilungen');
}

function renderAbteilungenPopup() {
  const body = document.querySelector('#dialog-abteilungen .abt-popup');
  if (!body) return;
  const list = state.dienststellen || [];
  const editing = _abtEditIdx !== null ? list[_abtEditIdx] : null;
  body.innerHTML = `
    <h4 class="popup-col-title">Dienststellen <span class="popup-col-count">${list.length}</span></h4>
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
    <input type="text" id="new-abt-addr" class="abt-addr-input" placeholder="📍 Standort (Adresse oder Maps-Link)" value="${escHtml(editing ? editing.address || '' : '')}" autocomplete="off">
    ${editing ? '<button type="button" id="btn-abt-cancel" class="btn-ghost" style="align-self:flex-start">Bearbeiten abbrechen</button>' : ''}
    <input type="search" id="abt-filter" class="settings-filter-input" placeholder="Dienststellen filtern…" value="${escHtml(_abtFilter)}" style="margin-top:6px">
    <div class="settings-code-list" id="abt-list" style="margin-top:4px"></div>
    <div id="abt-suggest"></div>
    <p class="settings-hint" style="margin-top:6px">Die ID ist die Zahl am Ende der Tagesdienstplan-Adresse. Mit Standort erscheinen auf Start beim aktuellen bzw. nächsten Dienst Knöpfe für Google Maps und BusBahnBim. Antippen zum Bearbeiten. Mehrere Schreibweisen (z. B. „MINA RKZ“, „MINA West“) dürfen dieselbe ID haben. Import: Liste <code>[{ "name", "deptId" }]</code> oder <code>{ "dienststellen": […] }</code>.</p>`;

  const refreshList = () => {
    const el = body.querySelector('#abt-list');
    const q = _abtFilter.toLowerCase().trim();
    const rows = list.map((a, i) => ({ a, i })).filter(({ a }) => !q || (a.name || '').toLowerCase().includes(q) || String(a.deptId || '').includes(q));
    el.innerHTML = rows.length
      ? rows.map(({ a, i }) => `<div class="code-item code-item-tap${i === _abtEditIdx ? ' is-editing' : ''}" data-idx="${i}">
          <span class="code-item-code">${escHtml(a.deptId || '—')}</span>
          <span class="code-item-text">${escHtml(a.name || '(ohne Namen)')}${a.address ? `<small class="abt-addr">📍 ${escHtml(a.address.length > 40 ? a.address.slice(0, 39) + '…' : a.address)}</small>` : ''}</span>
          <button class="btn-code-del" data-idx="${i}" title="Löschen" aria-label="${escHtml(a.name)} löschen">✕</button>
        </div>`).join('')
      : `<div class="code-empty">Keine Einträge${q ? ' für diese Suche' : ''}.</div>`;
    el.querySelectorAll('.code-item-tap').forEach((row) => row.addEventListener('click', () => {
      _abtEditIdx = +row.dataset.idx; renderAbteilungenPopup();
      body.querySelector('#new-abt-name').focus();
    }));
    el.querySelectorAll('.btn-code-del').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      list.splice(+b.dataset.idx, 1); state.dienststellen = list;
      _abtEditIdx = null; saveState(); renderAbteilungenPopup(); renderSettings();
    }));
    enableCodeListSwipe(el);
  };
  refreshList();

  // Vorschläge: Dienststellen aus Tagebuch und Dienstplan, die noch fehlen
  const renderSuggest = () => {
    const box = body.querySelector('#abt-suggest');
    const sug = abteilungSuggestions();
    box.innerHTML = sug.length ? `<h4 class="popup-col-title" style="margin-top:14px">Vorschläge <span class="popup-col-count">${sug.length}</span></h4>
      <div class="settings-code-list">${sug.map((x) => `<div class="code-item abt-sug">
        <span class="code-item-text">${escHtml(x.name)}<small class="abt-addr">${x.n}× ${x.src}</small></span>
        <button type="button" class="btn-secondary abt-sug-add" data-sug="${escHtml(x.name)}">Anlegen</button>
        <button type="button" class="btn-code-del" data-sug-hide="${escHtml(x.name)}" title="Ausblenden" aria-label="${escHtml(x.name)} ausblenden">✕</button>
      </div>`).join('')}</div>` : '';
    box.querySelectorAll('[data-sug]').forEach((b) => b.addEventListener('click', () => {
      _abtEditIdx = null;
      const n = body.querySelector('#new-abt-name');
      n.value = b.dataset.sug;
      body.querySelector('#new-abt-id').focus();
      body.querySelector('.settings-add-row').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }));
    box.querySelectorAll('[data-sug-hide]').forEach((b) => b.addEventListener('click', () => {
      const hidden = abtSuggestHidden();
      hidden.push(b.dataset.sugHide.toLowerCase());
      lsSet('etb_abt_sug_hidden', JSON.stringify([...new Set(hidden)]));
      renderSuggest();
    }));
  };
  renderSuggest();

  const nameEl = body.querySelector('#new-abt-name');
  const idEl = body.querySelector('#new-abt-id');
  idEl.addEventListener('input', () => digitsOnly(idEl, 6));
  const commit = () => {
    const name = nameEl.value.trim(), deptId = idEl.value.trim();
    const address = body.querySelector('#new-abt-addr').value.trim();
    if (!name || (!deptId && !address)) { toast('Bitte Name und ID oder Standort eingeben.', 'error'); return; }
    state.dienststellen = list;
    const entry = { name, deptId, ...(address ? { address } : {}) };
    const clash = list.findIndex((a, i) => a.name.toLowerCase() === name.toLowerCase() && i !== _abtEditIdx);
    if (clash >= 0) list.splice(clash, 1, entry);
    else if (_abtEditIdx !== null) list.splice(_abtEditIdx, 1, entry);
    else list.push(entry);
    list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    _abtEditIdx = null; saveState(); renderAbteilungenPopup(); renderSettings();
    body.querySelector('#new-abt-name').focus();
  };
  body.querySelector('#btn-add-abt').addEventListener('click', commit);
  [nameEl, idEl, body.querySelector('#new-abt-addr')].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }));
  const cancel = body.querySelector('#btn-abt-cancel');
  if (cancel) cancel.addEventListener('click', () => { _abtEditIdx = null; renderAbteilungenPopup(); });
  body.querySelector('#abt-filter').addEventListener('input', (e) => { _abtFilter = e.target.value; refreshList(); });

  const importFile = async (file) => {
    try {
      const data = parseJsonText(await file.text());
      const raw = Array.isArray(data) ? data : (data.dienststellen || data.abteilungen || data.departments || []);
      const valid = raw.filter((a) => a && (a.name || '').trim() && (String(a.deptId ?? a.id ?? '').trim() || String(a.address || '').trim()))
        .map((a) => ({ name: a.name.trim(), deptId: String(a.deptId ?? a.id ?? '').trim(), ...(String(a.address || '').trim() ? { address: String(a.address).trim() } : {}) }));
      const byName = new Map(list.map((a) => [a.name.toLowerCase(), a]));
      let added = 0, updated = 0;
      valid.forEach((a) => {
        const ex = byName.get(a.name.toLowerCase());
        if (!ex) { list.push(a); byName.set(a.name.toLowerCase(), a); added++; }
        else if (ex.deptId !== a.deptId || (a.address && ex.address !== a.address)) { if (a.deptId) ex.deptId = a.deptId; if (a.address) ex.address = a.address; updated++; }
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      state.dienststellen = list; saveState(); _abtFilter = ''; renderAbteilungenPopup(); renderSettings();
      toast(`${added} Dienststellen importiert${updated ? `, ${updated} aktualisiert` : ''}.`, 'success');
    } catch (err) { toast('Fehler: ' + err.message, 'error', 5000); }
  };
  body.querySelector('#btn-import-abt').addEventListener('click', () => body.querySelector('#file-abt-json').click());
  body.querySelector('#file-abt-json').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
  const exp = body.querySelector('#btn-export-abt');
  if (exp) exp.addEventListener('click', () => {
    saveFile(new Blob([JSON.stringify({ dienststellen: list }, null, 2)], { type: 'application/json' }), 'dienststellen.json');
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
    { id: 'dienststellen', icon: '🏢', label: 'Dienststellen', count: (state.dienststellen || []).length, run: () => { state.dienststellen = []; } },
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
      resource: svc.vehicle || '',
      tip: svc.isSeg ? 'seg' : '',
      note: svc.note || '',
      crew: svc.colleagues || [],
      dpUid: svc.dpUid || '',
      dpAck: svc.dpAck || '',
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
        extraVehicles: inc.extraVehicles || [],
        times: inc.times || {},
        from: inc.from || '',
        to: inc.to || '',
        links: inc.links || []
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
    // ältere Sicherungen: Abteilung nur noch als Ersatz, wenn keine Dienststelle da ist
    location: toDisplayName(shift.location) || (shift.tip === 'seg' ? '' : toDisplayName(shift.abteilung)) || '',
    vehicle: shift.resource || '',
    note: shift.note || '',
    isSeg: shift.tip === 'seg',
    colleagues: Array.isArray(shift.crew) ? shift.crew : [],
    ...(shift.dpUid ? { dpUid: String(shift.dpUid) } : {}),
    ...(shift.dpAck ? { dpAck: String(shift.dpAck) } : {}),
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
      extraVehicles: m.extraVehicles || [],
      times: m.times || {},
      from: m.from || '',
      to: m.to || '',
      links: m.links || []
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
      settings: !!(document.getElementById('exp-settings') && document.getElementById('exp-settings').checked),
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

// App-Einstellungen, die mit „Einstellungen“ gesichert und übernommen werden
const SETTINGS_EXPORT_KEYS = ['etb_theme', 'etb_compact', 'etb_stats_style', 'etb_launch_action', 'etb_dp_link_mode', 'etb_quick_push', 'etb_quick_sound', 'etb_icons_offline'];
function buildExportPayload(sel) {
  const payload = { version: 2, exportedAt: new Date().toISOString() };
  if (sel.profile) payload.profile = { displayName: state.profile.displayName || '' };
  if (sel.profile) payload.dienststellen = state.dienststellen || [];
  if (sel.profile) payload.places = state.places || [];
  if (sel.calendar) payload.dienstplanWorker = lsGet(DP_WORKER_KEY); // Zugangsschlüssel bewusst nicht im Export
  if (sel.services) payload.services = toCompatExport().shifts;
  if (sel.vehicles) {
    payload.vehicleCategories = state.vehicleCategories || [];
    payload.vehicleAssignments = state.vehicleAssignments || {};
  }
  if (sel.alarm) { payload.alarmCodes = state.alarmCodes || []; payload.alarmBlaulicht = state.alarmBlaulicht || {}; }
  if (sel.pzc) payload.pzcCodes = state.pzcCodes || [];
  if (sel.settings) {
    payload.settings = {};
    SETTINGS_EXPORT_KEYS.forEach((k) => { const v = lsGet(k); if (v !== null && v !== undefined && v !== '') payload.settings[k] = v; });
  }
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
          { key: 'profile',           id: 'imp-profile',  icon: '👤', label: 'Profil, Dienststellen & Orte', count: null },
          { key: 'settings',          id: 'imp-settings', icon: '⚙️', label: 'App-Einstellungen',            count: null },
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
    if (Array.isArray(data.dienststellen || data.abteilungen)) state.dienststellen = data.dienststellen || data.abteilungen; // ältere Sicherungen: „abteilungen“
    if (Array.isArray(data.places)) state.places = [...new Set([...(state.places || []), ...data.places])];
    msgs.push('Profil');
  }
  if (chosen['imp-settings'] && data.settings && typeof data.settings === 'object') {
    const iconsBefore = iconsOfflineEnabled();
    SETTINGS_EXPORT_KEYS.forEach((k) => { if (typeof data.settings[k] === 'string') lsSet(k, data.settings[k]); });
    if (data.settings.etb_theme) applyTheme(data.settings.etb_theme);
    applyCompact(lsGet('etb_compact') === '1');
    if (iconsOfflineEnabled() !== iconsBefore) setIconsOffline(iconsOfflineEnabled()).catch(() => {});
    msgs.push('Einstellungen');
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

/** Fenster „Kalender exportieren“: Zeitraum wählen, Anzahl sehen, exportieren. */
let icsRange = { preset: 'year', from: '', to: '' };
function icsPresetRange(preset) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const d = (yy, mm, dd) => localDateStr(new Date(yy, mm, dd));
  switch (preset) {
    case 'year': return { from: d(y, 0, 1), to: d(y, 11, 31) };
    case 'lastyear': return { from: d(y - 1, 0, 1), to: d(y - 1, 11, 31) };
    case 'month': return { from: d(y, m, 1), to: d(y, m + 1, 0) };
    case 'lastmonth': return { from: d(y, m - 1, 1), to: d(y, m, 0) };
    case 'all': return { from: '', to: '' };
    default: return { from: icsRange.from, to: icsRange.to };
  }
}

function servicesInRange(from, to) {
  return state.services.filter((svc) => {
    const day = (svc.startAt || '').slice(0, 10);
    if (!day) return false;
    return (!from || day >= from) && (!to || day <= to);
  });
}

let icsMode = 'range';            // 'range' = Zeitraum, 'pick' = Dienste auswählen
let icsPicked = new Set();
let icsPickFilter = '';

function openIcsExportDialog() {
  const box = document.getElementById('ics-export-body');
  const btn = document.getElementById('btn-ics-export-confirm');
  const presets = [['year', 'Dieses Jahr'], ['lastyear', 'Letztes Jahr'], ['month', 'Dieser Monat'], ['lastmonth', 'Letzter Monat'], ['all', 'Alles'], ['custom', 'Zeitraum']];
  // Auswahl auf noch vorhandene Dienste beschränken
  icsPicked = new Set([...icsPicked].filter((id) => state.services.some((x) => x.id === id)));
  const svcLabel = (svc) => {
    if (svc.isSeg) { const inc = (svc.incidents || [])[0]; return '⚡ ' + ((inc && inc.alarmCode) || 'SEG-Einsatz'); }
    return svc.vehicle || 'Dienst';
  };
  const countLine = (list) => {
    const nInc = list.reduce((n, x) => n + (x.incidents || []).length, 0);
    return list.length ? `<strong>${list.length}</strong> ${list.length === 1 ? 'Eintrag' : 'Einträge'} mit ${nInc} ${nInc === 1 ? 'Einsatz' : 'Einsätzen'}` : (icsMode === 'pick' ? 'Noch nichts ausgewählt.' : 'Keine Dienste in diesem Zeitraum.');
  };
  const render = () => {
    const modeHtml = `<div class="seg-control" role="tablist">
        <button type="button" role="tab" class="${icsMode === 'range' ? 'active' : ''}" data-mode="range" aria-selected="${icsMode === 'range'}">Zeitraum</button>
        <button type="button" role="tab" class="${icsMode === 'pick' ? 'active' : ''}" data-mode="pick" aria-selected="${icsMode === 'pick'}">Dienste auswählen</button>
      </div>`;
    let list, inner;
    if (icsMode === 'range') {
      const r = icsRange.preset === 'custom' ? { from: icsRange.from, to: icsRange.to } : icsPresetRange(icsRange.preset);
      list = servicesInRange(r.from, r.to);
      inner = `<div class="ics-presets">${presets.map(([k, l]) => `<button type="button" class="sf-chip${icsRange.preset === k ? ' active' : ''}" data-preset="${k}">${l}</button>`).join('')}</div>
        <div class="ics-dates">
          <label>Von<input type="date" id="ics-from" value="${escHtml(r.from)}"></label>
          <label>Bis<input type="date" id="ics-to" value="${escHtml(r.to)}"></label>
        </div>`;
    } else {
      const all = state.services.filter((x) => x.startAt).sort((x, y) => (y.startAt || '').localeCompare(x.startAt || ''));
      const q = icsPickFilter.trim().toLowerCase();
      const shown = q ? all.filter((x) => [svcLabel(x), x.location, x.startAt, svcWhenText(x)].join(' ').toLowerCase().includes(q)) : all;
      list = all.filter((x) => icsPicked.has(x.id));
      let lastMonth = '';
      const rows = shown.map((x) => {
        const d = parseLocalDt(x.startAt);
        const mk = d ? `${d.getFullYear()}-${d.getMonth()}` : '';
        const head = mk !== lastMonth ? `<div class="ics-pick-month">${escHtml(d ? d.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' }) : '')}</div>` : '';
        lastMonth = mk;
        const n = (x.incidents || []).length;
        return `${head}<label class="ics-pick-row">
          <input type="checkbox" data-pick="${escHtml(x.id)}" ${icsPicked.has(x.id) ? 'checked' : ''}>
          <span class="ics-pick-main"><span class="ics-pick-title">${escHtml(svcLabel(x))}</span><span class="ics-pick-sub">${escHtml([svcWhenText(x), x.location].filter(Boolean).join(' · '))}</span></span>
          <span class="ics-pick-n">${n}</span>
        </label>`;
      }).join('');
      inner = `<input type="search" id="ics-pick-filter" class="settings-filter-input" placeholder="Fahrzeug, Ort, Datum …" value="${escHtml(icsPickFilter)}">
        <div class="ics-pick-tools">
          <button type="button" class="btn-ghost" id="ics-pick-all">${q ? 'Treffer auswählen' : 'Alle auswählen'}</button>
          <button type="button" class="btn-ghost" id="ics-pick-none">Auswahl leeren</button>
        </div>
        <div class="ics-pick-list">${rows || '<div class="code-empty">Keine Dienste gefunden.</div>'}</div>`;
      box.dataset.shown = JSON.stringify(shown.map((x) => x.id));
    }
    box.innerHTML = `${modeHtml}${inner}
      <p class="ics-count">${countLine(list)}</p>
      <p class="settings-hint">Jeder Dienst wird ein Kalendertermin: Fahrzeug als Titel, Dienststelle als Ort, in der Beschreibung Besatzung, Notiz und alle Einsätze.</p>`;
    btn.disabled = !list.length;
    btn.textContent = list.length ? `${list.length} exportieren` : 'Exportieren';

    box.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { icsMode = b.dataset.mode; render(); }));
    if (icsMode === 'range') {
      box.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
        icsRange.preset = b.dataset.preset;
        if (icsRange.preset === 'custom' && !icsRange.from && !icsRange.to) Object.assign(icsRange, icsPresetRange('year'));
        render();
      }));
      const onDate = () => { icsRange = { preset: 'custom', from: box.querySelector('#ics-from').value, to: box.querySelector('#ics-to').value }; render(); };
      box.querySelector('#ics-from').addEventListener('change', onDate);
      box.querySelector('#ics-to').addEventListener('change', onDate);
    } else {
      // Häkchen ohne kompletten Neuaufbau (Scrollposition und Tastatur bleiben)
      const refreshCount = () => {
        const sel = state.services.filter((x) => icsPicked.has(x.id));
        box.querySelector('.ics-count').innerHTML = countLine(sel);
        btn.disabled = !sel.length;
        btn.textContent = sel.length ? `${sel.length} exportieren` : 'Exportieren';
      };
      box.querySelectorAll('[data-pick]').forEach((cb) => cb.addEventListener('change', () => {
        if (cb.checked) icsPicked.add(cb.dataset.pick); else icsPicked.delete(cb.dataset.pick);
        refreshCount();
      }));
      const shownIds = JSON.parse(box.dataset.shown || '[]');
      box.querySelector('#ics-pick-all').addEventListener('click', () => { shownIds.forEach((id) => icsPicked.add(id)); render(); });
      box.querySelector('#ics-pick-none').addEventListener('click', () => { icsPicked.clear(); render(); });
      const f = box.querySelector('#ics-pick-filter');
      f.addEventListener('input', () => {
        icsPickFilter = f.value;
        const pos = f.selectionStart;
        render();
        const nf = box.querySelector('#ics-pick-filter');
        nf.focus(); try { nf.setSelectionRange(pos, pos); } catch (_) {}
      });
    }
    btn.onclick = () => {
      let sel;
      if (icsMode === 'range') {
        const r = icsRange.preset === 'custom' ? { from: icsRange.from, to: icsRange.to } : icsPresetRange(icsRange.preset);
        sel = servicesInRange(r.from, r.to);
        exportIcsServices(sel, r.from || r.to ? `${r.from || 'anfang'}_bis_${r.to || 'heute'}` : localDateStr(new Date()));
      } else {
        sel = state.services.filter((x) => icsPicked.has(x.id));
        exportIcsServices(sel, `auswahl-${sel.length}-${localDateStr(new Date())}`);
      }
      closeDialog('dialog-ics-export');
    };
  };
  render();
  openDialog('dialog-ics-export');
}

function exportIcs(from = '', to = '') {
  exportIcsServices(servicesInRange(from, to), from || to ? `${from || 'anfang'}_bis_${to || 'heute'}` : localDateStr(new Date()));
}

function exportIcsServices(services, nameSuffix) {
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
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const list = services.slice().sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
  for (const svc of list) {
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
      // Blaulicht vorne: 🔵 = mit Sonderrechten, ⚪ = ohne
      descLines.push((inc.lights ? '🔵 ' : '⚪ ') + (inc.alarmCode || '—'));
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
    lines.push('DTSTAMP:' + stamp);
    lines.push('DTSTART:' + toIcsDt(svc.startAt));
    if (svc.endAt) lines.push('DTEND:' + toIcsDt(svc.endAt));
    lines.push('SUMMARY:' + icsEscape(summary));
    if (location) lines.push('LOCATION:' + icsEscape(location));
    if (descLines.length) lines.push('DESCRIPTION:' + icsEscape(descLines.join('\n')));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  // Zeilen nach RFC 5545 auf 75 Byte falten (Kalender-Apps erwarten das)
  const fold = (line) => {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const parts = []; let cur = '';
    for (const ch of line) {
      if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ch; } else cur += ch;
    }
    parts.push(cur);
    return parts.join('\r\n ');
  };
  const blob = new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar' });
  saveFile(blob, `dienste-${nameSuffix}.ics`, 'Dienste (Kalender)');
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

/**
 * Quadratische Fahrzeuggrafiken (z. B. 200×200 mit viel transparentem Rand)
 * würden in den breiten Icon-Feldern winzig wirken. Sie bekommen die Klasse
 * „veh-sq“ und werden per CSS auf den Fahrzeugstreifen in der Mitte zugeschnitten.
 */
function isVehicleIconImg(img) {
  const src = img.currentSrc || img.src || '';
  return (state.vehicleCategories || []).some((c) => [c.iconNormal, c.iconSoSi].some((u) => {
    if (!u) return false;
    if (u === src) return true;
    try { return new URL(u, location.href).href === src; } catch (_) { return false; }
  }));
}
const vehSquareSrcs = new Set();
function tagSquareVehicleIcon(img) {
  if (!img.naturalWidth || !img.naturalHeight) return;
  const sq = img.naturalWidth / img.naturalHeight < 1.25;
  const src = img.getAttribute('src') || '';
  if (sq && isVehicleIconImg(img)) { img.classList.add('veh-sq'); vehSquareSrcs.add(src); }
  else { img.classList.remove('veh-sq'); vehSquareSrcs.delete(src); }
}
// Bereits bekannte quadratische Grafiken schon vor dem ersten Zeichnen markieren
new MutationObserver((muts) => {
  if (!vehSquareSrcs.size) return;
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    const imgs = n.tagName === 'IMG' ? [n] : n.querySelectorAll ? n.querySelectorAll('img') : [];
    imgs.forEach((im) => { if (vehSquareSrcs.has(im.getAttribute('src') || '')) im.classList.add('veh-sq'); });
  }
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'IMG') tagSquareVehicleIcon(e.target); }, true);

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
function iconsOfflineEnabled() { return lsGet('etb_icons_offline') !== '0'; }

/** Grafiken lokal speichern ein/aus – der Service Worker liest die Einstellung aus etb-meta. */
async function setIconsOffline(on) {
  lsSet('etb_icons_offline', on ? '1' : '0');
  if (!('caches' in window)) return;
  try {
    const meta = await caches.open(BADGE_CACHE);
    await meta.put('./__prefs', new Response(JSON.stringify({ iconsOffline: on }), { headers: { 'Content-Type': 'application/json' } }));
    if (on) await syncVehicleIcons({ force: true });
    else await caches.delete(ICON_CACHE);
  } catch (_) {}
}

// ── Fahrzeuggrafiken über den Worker: zuschneiden & mit echter Größe speichern ──
async function fetchIconViaWorker(url) {
  const base = workerBase();
  if (!base || !dpConfigured()) throw new Error('kein Worker');
  const res = await fetch(base + '/img?u=' + encodeURIComponent(url), { headers: { Authorization: 'Bearer ' + dpConfig().token }, cache: 'no-store' });
  if (!res.ok) { const e = new Error('Worker ' + res.status); e.status = res.status; throw e; }
  return res.blob();
}
/** Sichtbarer Bereich (Alpha > Schwelle) eines Bildes. */
function alphaBox(bmp) {
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
function cropBlob(bmp, box) {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, box.x0, box.y0, w, h, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}
/** Animiertes PNG (APNG)? Dann nicht neu rechnen – die Animation ginge verloren. */
async function isAnimatedPng(blob) {
  try {
    const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
    for (let i = 8; i + 8 < head.length;) {
      const len = (head[i] << 24 | head[i + 1] << 16 | head[i + 2] << 8 | head[i + 3]) >>> 0;
      const type = String.fromCharCode(head[i + 4], head[i + 5], head[i + 6], head[i + 7]);
      if (type === 'acTL') return true;
      if (type === 'IDAT') return false;
      i += 12 + len;
    }
  } catch (_) {}
  return false;
}
const ICON_PROC_VERSION = '2';
/** Normal- und SoSi-Grafik einer Kategorie mit gemeinsamem Ausschnitt zuschneiden (Blinken bleibt deckungsgleich). */
async function processIconPair(urls) {
  const blobs = await Promise.all(urls.map(fetchIconViaWorker));
  // animierte Grafiken (APNG/GIF) unverändert speichern – dann beide, damit sie deckungsgleich bleiben
  const animated = (await Promise.all(blobs.map((b) => (/gif/i.test(b.type) ? true : isAnimatedPng(b))))).some(Boolean);
  if (animated) return blobs.map((b) => new Response(b, { headers: { 'Content-Type': b.type || 'image/png', 'Content-Length': String(b.size), 'X-Etb-Orig-Size': String(b.size), 'X-Etb-Cropped': '0', 'X-Etb-V': ICON_PROC_VERSION } }));
  const bmps = await Promise.all(blobs.map((b) => createImageBitmap(b)));
  const sameSize = bmps.every((b) => b.width === bmps[0].width && b.height === bmps[0].height);
  let box = null;
  bmps.forEach((b) => {
    const bb = alphaBox(b);
    if (!bb) return;
    box = !box ? bb : { x0: Math.min(box.x0, bb.x0), y0: Math.min(box.y0, bb.y0), x1: Math.max(box.x1, bb.x1), y1: Math.max(box.y1, bb.y1) };
  });
  const out = [];
  for (let i = 0; i < bmps.length; i++) {
    const bmp = bmps[i];
    let blob = blobs[i], cropped = false;
    if (box && sameSize) {
      const pad = 2;
      const bx = { x0: Math.max(0, box.x0 - pad), y0: Math.max(0, box.y0 - pad), x1: Math.min(bmp.width - 1, box.x1 + pad), y1: Math.min(bmp.height - 1, box.y1 + pad) };
      const area = (bx.x1 - bx.x0 + 1) * (bx.y1 - bx.y0 + 1);
      if (area < bmp.width * bmp.height * 0.92) { blob = await cropBlob(bmp, bx); cropped = true; }
    }
    out.push(new Response(blob, { headers: { 'Content-Type': blob.type || 'image/png', 'Content-Length': String(blob.size), 'X-Etb-Orig-Size': String(blobs[i].size), 'X-Etb-Cropped': cropped ? '1' : '0', 'X-Etb-V': ICON_PROC_VERSION } }));
  }
  return out;
}

function syncVehicleIcons({ force = false } = {}) {
  if (!('caches' in window)) return Promise.resolve({ total: 0, cached: 0, failed: 0 });
  if (!iconsOfflineEnabled()) return caches.delete(ICON_CACHE).then(() => ({ total: 0, cached: 0, failed: 0, off: true }));
  if (iconSyncRunning && !force) return iconSyncRunning;
  iconSyncRunning = (async () => {
    const cache = await caches.open(ICON_CACHE);
    const wanted = vehicleIconUrls();
    const keys = await cache.keys();
    await Promise.all(keys.filter((r) => !wanted.includes(r.url)).map((r) => cache.delete(r)));
    // bereits über den Worker aufbereitet?
    const done = new Set();
    for (const r of await cache.keys()) { const res = await cache.match(r); if (res && res.type !== 'opaque' && res.headers.get('X-Etb-V') === ICON_PROC_VERSION) done.add(r.url); else if (res) done.add('raw:' + r.url); }
    const abs = (u) => { try { return new URL(u, location.href).href; } catch (_) { return u; } };
    let failed = 0, viaWorker = true;
    const handled = new Set();
    // 1) je Kategorie Normal + SoSi gemeinsam über den Worker
    if (dpConfigured()) {
      for (const c of state.vehicleCategories || []) {
        const urls = [c.iconNormal, c.iconSoSi].filter((u) => u && /^https?:\/\//i.test(u)).map(abs);
        if (!urls.length || !viaWorker) continue;
        if (!force && urls.every((u) => done.has(u))) { urls.forEach((u) => handled.add(u)); continue; }
        try {
          const resps = await processIconPair(urls);
          await Promise.all(urls.map((u, i) => cache.put(u, resps[i])));
          urls.forEach((u) => handled.add(u));
        } catch (err) {
          if (err && (err.status === 404 || err.message === 'kein Worker')) viaWorker = false; // älterer Worker → wie bisher
        }
      }
    }
    // 2) Rest wie bisher direkt (undurchsichtig, ohne Zuschnitt)
    for (const url of wanted) {
      if (handled.has(url)) continue;
      if (!force && (done.has(url) || done.has('raw:' + url))) continue;
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

// ── Einsatz in einen anderen Dienst verschieben ───────────────────────────
let moveRef = null;
let moveFilter = '';
function openMoveIncident(svcId, incId) {
  moveRef = { svcId, incId };
  moveFilter = '';
  renderMoveList();
  openDialog('dialog-move');
}

function renderMoveList() {
  const body = document.getElementById('move-body');
  if (!body || !moveRef) return;
  const from = state.services.find((x) => x.id === moveRef.svcId);
  const inc = from && (from.incidents || []).find((i) => i.id === moveRef.incId);
  if (!inc) { closeDialog('dialog-move'); return; }
  const ref = parseLocalDt(from.startAt) || new Date();
  const q = moveFilter.trim().toLowerCase();
  const list = state.services
    .filter((x) => !x.isSeg && x.id !== from.id && x.startAt)
    .filter((x) => !q || [x.vehicle, x.location, svcWhenText(x)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => Math.abs(parseLocalDt(a.startAt) - ref) - Math.abs(parseLocalDt(b.startAt) - ref))
    .slice(0, 40);
  body.innerHTML = `<p class="inbox-hint">„${escHtml(inc.alarmCode || 'Einsatz')}“ aus ${escHtml(from.vehicle || 'Dienst')} · ${escHtml(svcWhenText(from))} verschieben nach:</p>
    <input type="search" id="move-filter" class="settings-filter-input" placeholder="Fahrzeug, Ort, Datum …" value="${escHtml(moveFilter)}">
    <div class="ics-pick-list move-list">${list.map((x) => `<button type="button" class="ics-pick-row move-row" data-move-to="${escHtml(x.id)}">
        ${shiftCodeHtml(x.startAt, 'is-small')}
        <span class="ics-pick-main"><span class="ics-pick-title">${escHtml(x.vehicle || 'Dienst')}</span><span class="ics-pick-sub">${escHtml([svcWhenText(x), x.location].filter(Boolean).join(' · '))}</span></span>
        <span class="ics-pick-n">${(x.incidents || []).length}</span>
      </button>`).join('') || '<div class="code-empty">Kein passender Dienst.</div>'}</div>`;
  const f = body.querySelector('#move-filter');
  f.addEventListener('input', () => { moveFilter = f.value; const pos = f.selectionStart; renderMoveList(); const nf = document.getElementById('move-filter'); nf.focus(); try { nf.setSelectionRange(pos, pos); } catch (_) {} });
  body.querySelectorAll('[data-move-to]').forEach((b) => b.addEventListener('click', () => moveIncidentTo(b.dataset.moveTo)));
}

function moveIncidentTo(targetId) {
  const from = state.services.find((x) => x.id === moveRef.svcId);
  const to = state.services.find((x) => x.id === targetId);
  if (!from || !to) return;
  const idx = (from.incidents || []).findIndex((i) => i.id === moveRef.incId);
  if (idx < 0) return;
  const [inc] = from.incidents.splice(idx, 1);
  (to.incidents = to.incidents || []).push(inc);
  saveState();
  closeDialog('dialog-move');
  closeDialog('dialog-incident-view');
  renderServiceList(); if (selectedServiceId) renderServiceDetail();
  if (activeTab === 'home') renderHome().catch(() => {});
  if (activeTab === 'favoriten') renderFavorites();
  toast(`Verschoben nach ${to.vehicle || 'Dienst'} · ${svcWhenText(to).split(' · ')[0]}`, 'success', 2500);
  moveRef = null;
}

// ── Rückblick im Story-Stil (Jahr und Monate) ──────────────────────────────
// Vollbild-Folien wie bei bekannten Jahresrückblicken: antippen rechts = weiter,
// links = zurück, gedrückt halten = Pause, nach unten wischen = schließen.
const MONTHS_DE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const STORY_SLIDE_MS = 6500;

function reviewPeriod(kind, year, month) {
  if (kind === 'all') {
    const first = state.services.map((x) => (x.startAt || '').slice(0, 10)).filter(Boolean).sort()[0] || '';
    const fy = first ? first.slice(0, 4) : '';
    const ny = String(new Date().getFullYear());
    return { kind, from: '', to: '', first, label: 'All-Time', title: fy && fy !== ny ? `Deine Dienstzeit ${fy}–${ny}` : 'Deine Dienstzeit' };
  }
  if (kind === 'year') return { kind, year, from: `${year}-01-01`, to: `${year}-12-31`, label: String(year), title: `Dein Dienstjahr ${year}` };
  const mm = String(month + 1).padStart(2, '0');
  const last = new Date(year, month + 1, 0).getDate();
  return { kind, year, month, from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}`, label: `${MONTHS_DE[month]} ${year}`, title: `Dein ${MONTHS_DE[month]}` };
}

function countTop(values, n = 3) {
  const m = new Map();
  values.forEach((v) => { if (v) m.set(v, (m.get(v) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);
}

/** Zahlen für einen Zeitraum; null, wenn darin nichts erfasst ist. */
function computeReview(period) {
  const list = servicesInRange(period.from, period.to);
  if (!list.length) return null;
  const duty = list.filter((x) => !x.isSeg);
  const segs = list.filter((x) => x.isSeg);
  const incs = list.flatMap((x) => (x.incidents || []).map((inc) => ({ inc, svc: x })));
  const hours = duty.reduce((n, x) => n + +serviceDurationHours(x), 0);
  const nights = duty.filter((x) => { const c = shiftCode(x.startAt); return c && !c.day; }).length;
  const lights = incs.filter((x) => x.inc.lights).length;
  const busiest = duty.slice().sort((a, b) => (b.incidents || []).length - (a.incidents || []).length)[0];
  const longest = duty.slice().sort((a, b) => +serviceDurationHours(b) - +serviceDurationHours(a))[0];
  const ages = incs.map((x) => parseInt(x.inc.pzc && x.inc.pzc.age, 10)).filter((a) => a >= 0 && a < 120);
  const naca = Array.from({ length: 8 }, (_, n) => incs.filter((x) => String(x.inc.naca) === String(n)).length);
  const weekdays = Array.from({ length: 7 }, () => 0);
  duty.forEach((x) => { const d = parseLocalDt(x.startAt); if (d) weekdays[d.getDay()]++; });
  const perMonth = Array.from({ length: 12 }, () => 0);
  incs.forEach((x) => { const d = parseLocalDt(x.svc.startAt); if (d) perMonth[d.getMonth()]++; });
  const runs = computeRuns(duty);
  // Einsätze nach Wochentag (Mo … So)
  const perWeekday = Array.from({ length: 7 }, () => 0);
  incs.forEach((x) => { const d = parseLocalDt(x.svc.startAt); if (d) perWeekday[(d.getDay() + 6) % 7]++; });
  // Fahrzeuge: Schichten, Einsätze, Blaulicht
  const vm = new Map();
  duty.forEach((x) => {
    if (!x.vehicle) return;
    const v = vm.get(x.vehicle) || { name: x.vehicle, shifts: 0, incs: 0, lights: 0 };
    v.shifts++; v.incs += (x.incidents || []).length; v.lights += (x.incidents || []).filter((i) => i.lights).length;
    vm.set(x.vehicle, v);
  });
  const vehStats = [...vm.values()].sort((a, b) => b.shifts - a.shifts || b.incs - a.incs);
  const chrono = duty.slice().sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
  let vehStreak = null;
  for (let i = 0, run = 0; i < chrono.length; i++) {
    run = i && chrono[i].vehicle && chrono[i].vehicle === chrono[i - 1].vehicle ? run + 1 : 1;
    if (chrono[i].vehicle && (!vehStreak || run > vehStreak.n)) vehStreak = { name: chrono[i].vehicle, n: run };
  }
  // Uhrzeit: nur Einsätze, die während der Schicht angelegt wurden
  const perHour = Array.from({ length: 24 }, () => 0);
  incs.forEach((x) => {
    const c = x.inc.createdAt ? new Date(x.inc.createdAt) : null;
    const a = parseLocalDt(x.svc.startAt), b = parseLocalDt(x.svc.endAt);
    if (c && a && b && c >= a && c <= new Date(b.getTime() + 2 * 3600e3)) perHour[c.getHours()]++;
  });
  // Crew-Chemie: Ø Einsätze pro Schicht je Kolleg:in (ab 2 gemeinsamen Schichten)
  const cm = new Map();
  duty.forEach((x) => (x.colleagues || []).filter(Boolean).forEach((c) => {
    const e = cm.get(c) || { name: c, shifts: 0, incs: 0 };
    e.shifts++; e.incs += (x.incidents || []).length; cm.set(c, e);
  }));
  const crewChem = [...cm.values()].filter((e) => e.shifts >= 2).map((e) => ({ ...e, avg: e.incs / e.shifts })).sort((a, b) => b.avg - a.avg);
  // Längste Pause zwischen zwei Diensten
  let longestGap = null;
  for (let i = 1; i < chrono.length; i++) {
    const a = parseLocalDt(chrono[i - 1].endAt), b = parseLocalDt(chrono[i].startAt);
    if (!a || !b) continue;
    const days = Math.floor((b - a) / 864e5);
    if (!longestGap || days > longestGap.days) longestGap = { days, from: a, to: b };
  }
  const svcPerMonth = Array.from({ length: 12 }, () => 0);
  duty.forEach((x) => { const d = parseLocalDt(x.startAt); if (d) svcPerMonth[d.getMonth()]++; });
  // Vergleich mit dem Zeitraum davor
  const prev = period.kind === 'all' ? { label: '', from: '9999', to: '9999' } : period.kind === 'year' ? reviewPeriod('year', period.year - 1) : reviewPeriod('month', period.month === 0 ? period.year - 1 : period.year, (period.month + 11) % 12);
  const prevList = period.kind === 'all' ? [] : servicesInRange(prev.from, prev.to);
  // Einsätze und Schichten je Kalenderjahr (für All-Time)
  const perYear = {};
  list.forEach((x) => { const y = (x.startAt || '').slice(0, 4); if (!y) return; const e = perYear[y] || (perYear[y] = { shifts: 0, incs: 0 }); if (!x.isSeg) e.shifts++; e.incs += (x.incidents || []).length; });
  const prevInc = prevList.reduce((n, x) => n + (x.incidents || []).length, 0);
  return {
    period, list, duty, segs, incs, hours, nights, lights, busiest, longest,
    avgAge: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
    naca, weekdays, perMonth, svcPerMonth,
    topKeywords: countTop(incs.map((x) => x.inc.alarmCode)),
    topEinsatzart: countTop(incs.map((x) => x.inc.einsatzart && EINSATZART_MAP.get(String(x.inc.einsatzart))), 1)[0] || null,
    topStatKz: countTop(incs.map((x) => x.inc.statKz && STATKZ_MAP.get(String(x.inc.statKz))), 1)[0] || null,
    topVehicle: countTop(duty.map((x) => x.vehicle), 1)[0] || null,
    topCrew: countTop(duty.flatMap((x) => x.colleagues || []), 3),
    favorites: incs.filter((x) => x.inc.favorite).length,
    favList: incs.filter((x) => x.inc.favorite),
    notes: incs.filter((x) => x.inc.note && x.inc.note.trim().length >= 4 && x.inc.note.length <= 160),
    minAge: ages.length ? Math.min(...ages) : null,
    maxAge: ages.length ? Math.max(...ages) : null,
    topPzc: countTop(incs.map((x) => x.inc.pzc && x.inc.pzc.diag), 1).filter(([, n]) => n >= 2)[0] || null,
    pzcList: countTop(incs.map((x) => x.inc.pzc && x.inc.pzc.diag), 999),
    statKzList: countTop(incs.map((x) => x.inc.statKz && STATKZ_MAP.get(String(x.inc.statKz))), 10).filter(([, n]) => n >= 2),
    einsatzartList: countTop(incs.map((x) => x.inc.einsatzart && EINSATZART_MAP.get(String(x.inc.einsatzart))), 10),
    topVehicles: countTop(duty.map((x) => x.vehicle), 3),
    vehicleCount: new Set(duty.map((x) => x.vehicle).filter(Boolean)).size,
    runs, longestRun: runs.slice().sort((a, b) => b.hours - a.hours)[0] || null,
    lightsRecord: duty.map((x) => ({ svc: x, n: (x.incidents || []).filter((i) => i.lights).length })).sort((a, b) => b.n - a.n)[0] || null,
    perWeekday,
    vehStats, vehStreak, perHour, crewChem, longestGap, perYear,
    prev: { label: prev.label, services: prevList.filter((x) => !x.isSeg).length, incidents: prevInc, has: prevList.length > 0 },
  };
}

/** Monate (neueste zuerst) mit erfassten Diensten. */
function reviewMonthsWithData() {
  const set = new Set();
  state.services.forEach((x) => { const d = parseLocalDt(x.startAt); if (d) set.add(`${d.getFullYear()}-${d.getMonth()}`); });
  return [...set].map((k) => k.split('-').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
}

function reviewYearsWithData() {
  return [...new Set(reviewMonthsWithData().map(([y]) => y))];
}

function fmtNum(n) { return Number(n).toLocaleString('de-AT', { maximumFractionDigits: 1 }); }

/** Grobe PZC-Gruppe nach der Hunderterstelle (keine Codeliste). */
function pzcGroup(code) {
  const c = String(code || '').trim();
  return /^[1-9]\d\d$/.test(c) ? c[0] + 'xx' : '';
}
const PZC_GROUP_TEXT = {
  '1xx': 'Reanimation – Respekt. ❤️',
  '2xx': 'Trauma & Chirurgie – du bist Unfall-Profi. 🦴',
  '3xx': 'Internistisch – du bist eigentlich Internist:in. 🩺',
  '4xx': 'Neuro & Psych – Kopfsache. 🧠',
  '5xx': 'Kinder, Gyn & Geburt – Storch-Express. 🍼',
  '7xx': 'Uro, Augen, HNO & Co – die bunte Ecke. 🎨',
};

/** Spruch zum häufigsten PZC – sucht nur nach Wörtern im Diagnosetext. */
function pzcQuip(t, n) {
  const q = [
    [/katheter/, 'Du bist offiziell das <strong>Katheter-Taxi</strong> 🚕💧'],
    [/sonstige internist/, 'Diagnosen stellen? Machen andere – du fährst unter „sonstige internistische“. Bist ja kein Doktor. 🩺😉'],
    [/^\S+\s+sonstige/, 'Diagnose: „sonstige“. Präzise wie ein Wetterbericht. 🌦️'],
    [/harnverhalt/, 'Wasser marsch! 🚰'],
    [/hypoglyk/, 'Der Zuckerlieferant deines Vertrauens. 🍬'],
    [/hyperglyk/, 'Zu süß für diese Welt. 🍭'],
    [/synkope|kollaps/, 'Umfall-Expert:in – die Leute liegen dir zu Füßen. 🫠'],
    [/schenkelhals/, 'Hüft-Express für die Generation Rollator. 🦴'],
    [/exsikkose/, 'Wasserträger:in – trinkt mehr, Leute! 💧'],
    [/alkoholintox|mischintox/, 'Prost Mahlzeit. 🍻'],
    [/intox|vergift/, 'Giftnotruf auf Rädern. ☠️'],
    [/psychiatr|ubg|suizid/, 'Seelentröster:in im Einsatz. 🫂'],
    [/schwindel/, 'Alles dreht sich um dich. 🌀'],
    [/verwirrt/, 'Wo bin ich, wer bin ich? – du weißt es wenigstens. 🧭'],
    [/insult|tia/, 'Time is brain – und du bist schnell. 🧠⚡'],
    [/krampf/, 'Ruhe bewahren, wenn alles zuckt. ⚡'],
    [/reanimation/, 'Lebensretter:in. Mehr gibt’s nicht zu sagen. ❤️'],
    [/herzinfarkt|koronar|kardial/, 'Herzensangelegenheiten. ❤️‍🩹'],
    [/atemnot|asthma|copd|respirator/, 'Durchatmen – für dich und andere. 🌬️'],
    [/fieber|infekt/, 'Fieberthermometer im Dauereinsatz. 🌡️'],
    [/übelkeit|erbrechen/, 'Speibsackerl-Service. 🤢'],
    [/durchfall/, 'Lieber nicht nachfragen. 🚽'],
    [/prellung|verstauchung|zerrung/, 'Kühlpack-Kurier. 🧊'],
    [/fraktur/, 'Knochenarbeit. 🦴'],
    [/wunde/, 'Pflasterkönig:in. 🩹'],
    [/nasenbluten/, 'Taschentuch-Taxi. 🤧'],
    [/geburt|entbindung|schwanger/, 'Storch-Assistenz. 🍼'],
    [/covid/, 'Schutzanzug-Saison. 😷'],
    [/polytrauma|sht/, 'Schwere Kost. Pass auf dich auf. ❤️'],
  ].find(([re]) => re.test(t));
  return q ? q[1] : `Dein PZC-Liebling – ${n}× gewählt.`;
}

// ── Kolleg:innen-Profil ─────────────────────────────────────────────────────
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
function colleagueInitials(name) { return String(name).replace(/,.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
function colleagueHue(name) { return [...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7); }

function openColleagueProfile(name) {
  const box = document.getElementById('colleague-body');
  if (!box) return;
  const shared = state.services.filter((x) => (x.colleagues || []).some((c) => sameName(c, name)))
    .sort((a, b) => (b.startAt || '').localeCompare(a.startAt || ''));
  const duty = shared.filter((x) => !x.isSeg);
  const incs = shared.flatMap((x) => x.incidents || []);
  const hours = duty.reduce((n, x) => n + +serviceDurationHours(x), 0);
  const lights = incs.filter((i) => i.lights).length;
  const nights = duty.filter((x) => { const c = shiftCode(x.startAt); return c && !c.day; }).length;
  const veh = countTop(duty.map((x) => x.vehicle), 1)[0];
  const kws = countTop(incs.map((i) => i.alarmCode), 3);
  const allDuty = state.services.filter((x) => !x.isSeg);
  const avgAll = allDuty.length ? allDuty.reduce((n, x) => n + (x.incidents || []).length, 0) / allDuty.length : 0;
  const avgWith = duty.length ? duty.reduce((n, x) => n + (x.incidents || []).length, 0) / duty.length : 0;
  const fmt1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  const day = (x) => { const d = parseLocalDt(x.startAt); return d ? d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; };
  const others = countTop(shared.flatMap((x) => (x.colleagues || []).filter((c) => !sameName(c, name))), 3);
  const vic = veh ? vehicleIconSrc(veh[0]) : '';
  const vibe = !duty.length ? '' : avgWith >= avgAll + 0.5 ? `🌪️ Mit ${escHtml(name.split(/\s|,/)[0])} wird’s wild – mehr los als sonst.` : avgWith <= avgAll - 0.5 ? '🍀 Glücksbringer:in – mit euch bleibt’s ruhiger.' : '⚖️ Ganz normales Pensum.';
  document.getElementById('colleague-title').textContent = 'Kolleg:in';
  box.innerHTML = `<div class="cp-head">
      <span class="cp-av" style="--h:${colleagueHue(name)}">${escHtml(colleagueInitials(name))}</span>
      <div><h3>${escHtml(name)}</h3><span>${shared.length ? `seit ${escHtml(day(shared[shared.length - 1]))} gemeinsam` : 'noch kein gemeinsamer Dienst'}</span></div>
    </div>
    <div class="cp-tiles">
      <div><strong>${duty.length}</strong><small>Dienste</small></div>
      <div><strong>${Math.round(hours)}</strong><small>Stunden</small></div>
      <div><strong>${incs.length}</strong><small>Einsätze</small></div>
      <div><strong>${incs.length ? Math.round((lights / incs.length) * 100) + '%' : '–'}</strong><small>Blaulicht</small></div>
    </div>
    ${duty.length ? `<p class="cp-line">Ø <strong>${fmt1(avgWith)}</strong> Einsätze pro Dienst (dein Schnitt ${fmt1(avgAll)}) · 🌙 ${nights} Nachtdienste</p><p class="cp-line">${vibe}</p>` : ''}
    ${veh ? `<div class="cp-veh">${vic ? `<img src="${escHtml(vic)}" alt="">` : '🚑'}<span>Meist zusammen auf <strong>${escHtml(veh[0])}</strong> · ${veh[1]}×</span></div>` : ''}
    ${kws.length ? `<div class="cp-sub">Häufigste Stichwörter</div><div class="cp-chips">${kws.map(([k, n]) => `<span>${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    ${others.length ? `<div class="cp-sub">Oft auch dabei</div><div class="cp-chips">${others.map(([k, n]) => `<span class="crew-link" role="button" data-colleague="${escHtml(k)}">${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    <div class="cp-sub">Gemeinsame Dienste</div>
    <div class="cp-list">${shared.slice(0, 40).map((x) => `<button type="button" class="cp-svc" data-cp-svc="${escHtml(x.id)}">
      <span class="cp-svc-d">${shiftCodeHtml(x.startAt, 'is-small')}<span>${escHtml(day(x))}</span></span>
      <span class="cp-svc-t">${escHtml(x.isSeg ? ((x.incidents || [])[0] || {}).alarmCode || 'SEG' : x.vehicle || 'Dienst')}</span>
      <span class="cp-svc-n">${(x.incidents || []).length}</span></button>`).join('')}
      ${shared.length > 40 ? `<p class="cp-line">… und ${shared.length - 40} weitere</p>` : ''}</div>`;
  box.querySelectorAll('[data-cp-svc]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.cpSvc;
    closeDialog('dialog-colleague');
    document.querySelectorAll('.lp-ov').forEach((x) => x.remove());
    if (story) closeStory();
    const sv = state.services.find((x) => x.id === id);
    setTimeout(() => { if (sv && sv.isSeg) openIncidentView(id, (sv.incidents[0] || {}).id); else openServiceDetail(id); }, 260);
  }));
  box.scrollTop = 0;
  openDialog('dialog-colleague');
}
// Namen überall anklickbar (vor anderen Klick-Handlern)
document.addEventListener('click', (e) => {
  const c = e.target.closest && e.target.closest('[data-colleague]');
  if (!c) return;
  e.stopPropagation(); e.preventDefault();
  openColleagueProfile(c.dataset.colleague);
}, true);

// ── Abzeichen ────────────────────────────────────────────────────────────────
/** Alle Abzeichen mit Fortschritt und dem Datum, an dem sie erreicht wurden. */
function computeBadges() {
  const svcs = state.services.slice().sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
  const duty = svcs.filter((x) => !x.isSeg);
  const incs = svcs.flatMap((x) => (x.incidents || []).map((inc) => ({ inc, svc: x })));
  const dOf = (x) => (x ? (x.svc || x).startAt || '' : '');
  const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';
  const nth = (arr, n) => (arr.length >= n ? dOf(arr[n - 1]) : '');
  const count = (id, icon, title, desc, arr, goal, tier) => ({ id, icon, title, desc, cur: Math.min(arr.length, goal), goal, date: nth(arr, goal), tier });
  const once = (id, icon, title, desc, item, tier) => ({ id, icon, title, desc, cur: item ? 1 : 0, goal: 1, date: item ? dOf(item) : '', tier });
  const nights = duty.filter((x) => { const c = shiftCode(x.startAt); return c && !c.day; });
  const lightsArr = incs.filter((x) => x.inc.lights);
  const weekend = duty.filter((x) => { const d = parseLocalDt(x.startAt); return d && (d.getDay() === 0 || d.getDay() === 6); });
  const notes = incs.filter((x) => has(x.inc.note));
  const favs = incs.filter((x) => x.inc.favorite);
  const segs = svcs.filter((x) => x.isSeg);
  const fullDoc = incs.filter((x) => has(x.inc.naca) && has(x.inc.einsatzart) && has(x.inc.statKz) && has((x.inc.pzc || {}).diag));
  // verschiedene Kolleg:innen / Fahrzeuge in zeitlicher Reihenfolge
  const distinctAt = (getList, goal) => { const seen = new Set(); for (const x of duty) { getList(x).forEach((v) => v && seen.add(String(v).toLowerCase())); if (seen.size >= goal) return { n: seen.size, date: x.startAt }; } return { n: seen.size, date: '' }; };
  const crew10 = distinctAt((x) => x.colleagues || [], 10);
  const fleet5 = distinctAt((x) => [x.vehicle], 5);
  let dream = { n: 0, date: '' };
  { const m = new Map(); for (const x of duty) for (const c of x.colleagues || []) { const k = String(c).toLowerCase(); const v = (m.get(k) || 0) + 1; m.set(k, v); if (v > dream.n) dream = { n: v, date: v === 25 ? x.startAt : dream.date }; } }
  let streak = { n: 0, date: '' };
  for (let i = 0, run = 0; i < duty.length; i++) { run = i && duty[i].vehicle && duty[i].vehicle === duty[i - 1].vehicle ? run + 1 : 1; if (run > streak.n) streak = { n: run, date: run === 10 ? duty[i].startAt : streak.date }; }
  const runs = computeRuns(duty);
  const marathon = runs.find((r) => r.items.length >= 3);
  const wild = duty.find((x) => (x.incidents || []).length >= 8);
  const long = duty.find((x) => +serviceDurationHours(x) >= 24);
  const cpr = incs.find((x) => String(x.inc.naca) === '6');
  const stork = incs.find((x) => /geburt|entbindung/i.test(pzcDiagnosis((x.inc.pzc || {}).diag) || '') || /geburt/i.test(x.inc.alarmCode || ''));
  // NACA-Sammler: Stufen 0–6 je einmal
  const firstNaca = {}; incs.forEach((x) => { const n = String(x.inc.naca); if (/^[0-6]$/.test(n) && !firstNaca[n]) firstNaca[n] = dOf(x); });
  const nacaSeen = Object.keys(firstNaca).length;
  const first = svcs[0] ? parseLocalDt(svcs[0].startAt) : null;
  const anniv = first && Date.now() - first >= 365 * 864e5;
  const annivDate = first ? new Date(first.getTime() + 365 * 864e5).toISOString().slice(0, 16) : '';
  return [
    count('inc1', '🚑', 'Erster Einsatz', 'Der Anfang von allem', incs, 1, 1),
    count('inc50', '🎯', '50 Einsätze', 'Langsam wird’s Routine', incs, 50, 1),
    count('inc100', '💯', '100 Einsätze', 'Dreistellig!', incs, 100, 2),
    count('inc250', '🏅', '250 Einsätze', 'Alter Hase', incs, 250, 2),
    count('inc500', '🏆', '500 Einsätze', 'Legende auf Rädern', incs, 500, 3),
    count('inc1000', '👑', '1000 Einsätze', 'Hall of Fame', incs, 1000, 3),
    count('svc10', '📋', '10 Dienste', 'Gut eingegroovt', duty, 10, 1),
    count('svc50', '🗓️', '50 Dienste', 'Fixer Bestandteil der Wache', duty, 50, 2),
    count('svc100', '🎖️', '100 Dienste', 'Dienstplan-Dauergast', duty, 100, 3),
    count('night10', '🌙', 'Nachteule', '10 Nachtdienste', nights, 10, 1),
    count('night50', '🦉', 'Nachtschwärmer:in', '50 Nachtdienste', nights, 50, 3),
    count('lights25', '🔵', 'Blaulicht-Fan', '25 Einsätze mit Sonderrechten', lightsArr, 25, 1),
    count('lights100', '🚨', 'Tatütata', '100 Einsätze mit Sonderrechten', lightsArr, 100, 2),
    count('weekend20', '🎉', 'Wochenend-Krieger:in', '20 Dienste am Wochenende', weekend, 20, 2),
    count('notes25', '✍️', 'Chronist:in', '25 Einsätze mit Notiz', notes, 25, 1),
    count('fav10', '⭐', 'Sammler:in', '10 Favoriten', favs, 10, 1),
    count('doc50', '📑', 'Dokumentations-Profi', '50 Einsätze mit NACA, Einsatzart, Statistikkennzahl und PZC', fullDoc, 50, 3),
    once('seg1', '⚡', 'Großveranstaltung', 'Erster SEG-Einsatz', segs[0], 1),
    once('marathon', '🏃', 'Marathon', '3 Schichten am Stück (Dienstblock)', marathon ? { startAt: marathon.items[marathon.items.length - 1].startAt } : null, 2),
    once('wild', '🌪️', 'Wilder Ritt', '8 Einsätze in einer Schicht', wild, 2),
    once('long24', '⏱️', 'Durchgemacht', 'Eine Schicht mit 24 Stunden oder mehr', long, 2),
    once('cpr', '❤️‍🩹', 'Herzensretter:in', 'Einsatz mit NACA 6', cpr, 3),
    once('stork', '🍼', 'Storch-Express', 'Einsatz rund um eine Geburt', stork, 3),
    { id: 'naca', icon: '🎨', title: 'NACA-Sammler:in', desc: 'Jede NACA-Stufe von 0 bis 6 mindestens einmal', cur: nacaSeen, goal: 7, date: nacaSeen >= 7 ? Object.values(firstNaca).sort().pop() : '', tier: 3 },
    { id: 'crew10', icon: '🤝', title: 'Teamplayer', desc: 'Mit 10 verschiedenen Kolleg:innen im Dienst', cur: Math.min(crew10.n, 10), goal: 10, date: crew10.n >= 10 ? crew10.date : '', tier: 1 },
    { id: 'dream25', icon: '💞', title: 'Dreamteam', desc: '25 Dienste mit derselben Person', cur: Math.min(dream.n, 25), goal: 25, date: dream.n >= 25 ? dream.date : '', tier: 2 },
    { id: 'fleet5', icon: '🚐', title: 'Fuhrpark-Kenner:in', desc: '5 verschiedene Fahrzeuge gefahren', cur: Math.min(fleet5.n, 5), goal: 5, date: fleet5.n >= 5 ? fleet5.date : '', tier: 1 },
    { id: 'loyal10', icon: '💍', title: 'Treue Seele', desc: '10 Schichten in Folge auf demselben Fahrzeug', cur: Math.min(streak.n, 10), goal: 10, date: streak.n >= 10 ? streak.date : '', tier: 2 },
    { id: 'anniv', icon: '🎂', title: 'Ein Jahr Tagebuch', desc: 'Seit einem Jahr dabei', cur: anniv ? 1 : 0, goal: 1, date: anniv ? annivDate : '', tier: 2 },
  ].map((b) => ({ ...b, done: b.cur >= b.goal }));
}

function badgeTileHtml(b, i = 0) {
  const d = b.done && b.date ? parseLocalDt(b.date.length > 10 ? b.date.slice(0, 16) : b.date + 'T00:00') : null;
  return `<button type="button" class="bd${b.done ? ' is-done' : ''} bd-t${b.tier}" style="--i:${i}" data-badge="${b.id}">
    <span class="bd-ic">${b.done ? b.icon : '🔒'}</span>
    <span class="bd-t">${escHtml(b.title)}</span>
    ${b.done ? `<span class="bd-d">${d ? escHtml(d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })) : ''}</span>` : `<span class="bd-p"><span style="width:${Math.round((b.cur / b.goal) * 100)}%"></span></span><span class="bd-d">${b.cur}/${b.goal}</span>`}
  </button>`;
}

function badgesSectionHtml() {
  const all = computeBadges();
  const done = all.filter((b) => b.done).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const next = all.filter((b) => !b.done).sort((a, b) => b.cur / b.goal - a.cur / a.goal).slice(0, Math.max(0, 6 - Math.min(done.length, 3)));
  const shown = [...done.slice(0, 3), ...next].slice(0, 6);
  return `<section class="bd-card">
    <div class="bd-head"><span class="bd-head-ic">🏅</span><h4>Abzeichen</h4><span class="bd-count">${done.length}/${all.length}</span><button type="button" class="bd-all" data-badges-all>Alle ›</button></div>
    <div class="bd-bar"><span style="width:${Math.round((done.length / all.length) * 100)}%"></span></div>
    <div class="bd-grid">${shown.map(badgeTileHtml).join('')}</div>
  </section>`;
}

function openBadgesDialog(focusId) {
  const box = document.getElementById('badges-body');
  if (!box) return;
  const all = computeBadges();
  const done = all.filter((b) => b.done).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const open = all.filter((b) => !b.done).sort((a, b) => b.cur / b.goal - a.cur / a.goal);
  const sec = (t, list) => list.length ? `<div class="cp-sub">${t}</div><div class="bd-list">${list.map((b, i) => `<div class="bd-row${b.done ? ' is-done' : ''}${b.id === focusId ? ' is-focus' : ''}" style="--i:${i}">${badgeTileHtml(b, i)}<div class="bd-row-t"><strong>${escHtml(b.title)}</strong><span>${escHtml(b.desc)}</span></div></div>`).join('')}</div>` : '';
  document.getElementById('badges-title').textContent = `Abzeichen · ${done.length}/${all.length}`;
  box.innerHTML = sec('Erreicht', done) + sec('Noch offen', open);
  openDialog('dialog-badges');
  const f = box.querySelector('.is-focus'); if (f) setTimeout(() => f.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
}
document.addEventListener('click', (e) => {
  const all = e.target.closest && e.target.closest('[data-badges-all]');
  const one = !all && e.target.closest && e.target.closest('.bd-card [data-badge]');
  if (all || one) openBadgesDialog(one ? one.dataset.badge : null);
});

/** Neu erreichte Abzeichen melden (beim ersten Mal nur still merken). */
let badgeCheckTimer = 0;
function checkNewBadges() {
  clearTimeout(badgeCheckTimer);
  badgeCheckTimer = setTimeout(() => {
    let known = null;
    try { known = JSON.parse(lsGet('etb_badges_seen') || 'null'); } catch (_) {}
    const done = computeBadges().filter((b) => b.done);
    const ids = done.map((b) => b.id);
    if (known) {
      const fresh = done.filter((b) => !known.includes(b.id));
      if (fresh.length === 1) toast(`🏅 Neues Abzeichen: ${fresh[0].icon} ${fresh[0].title}`, 'success', 4000);
      else if (fresh.length > 1) toast(`🏅 ${fresh.length} neue Abzeichen: ${fresh.map((b) => b.icon).join(' ')}`, 'success', 4000);
    }
    lsSet('etb_badges_seen', JSON.stringify(ids));
  }, 700);
}

/** Wie „ergiebig“ ist ein Einsatz? Kennzahlen zählen, eine Notiz und Favorit deutlich mehr. */
/** Lange Notizen für Story-Anzeigen an einer Wortgrenze kürzen. */
function shortNote(text, max = 140) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, '') + ' …';
}

function incRichness(inc) {
  const p = inc.pzc || {};
  const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';
  return [inc.naca, inc.einsatzart, inc.statKz, p.diag, p.age, p.prio].filter(has).length
    + ((inc.extraVehicles || []).length ? 1 : 0) + (has(inc.note) ? 4 : 0) + (inc.favorite ? 2 : 0) + (inc.lights ? 0.5 : 0);
}
/** Zufällig, aber Einsätze mit mehr Daten werden deutlich öfter gezogen. Erwartet [{inc, svc}]. */
function pickRich(list) {
  if (!list.length) return null;
  const w = list.map((x) => Math.pow(1 + incRichness(x.inc), 1.6));
  let t = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { t -= w[i]; if (t <= 0) return list[i]; }
  return list[list.length - 1];
}

function buildStorySlides(r) {
  const p = r.period;
  const isAll = p.kind === 'all';
  const full = !!p.full; // alle Module, keine Auswahl
  const isYear = p.kind !== 'month'; // All-Time verhält sich wie ein (langes) Jahr
  const zr = isAll ? 'insgesamt' : isYear ? 'dieses Jahr' : 'diesen Monat';
  const big = (n, cls = '') => `<div class="st-big ${cls}" data-count="${n}">0</div>`;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const diff = (a, b, what) => {
    if (!r.prev.has) return '';
    const d = a - b;
    if (!d) return `<div class="st-chip">genauso viele ${what} wie ${escHtml(r.prev.label)}</div>`;
    return `<div class="st-chip">${d > 0 ? '▲ ' + d + ' mehr' : '▼ ' + Math.abs(d) + ' weniger'} als ${escHtml(r.prev.label)}</div>`;
  };
  const fmtDay = (svc) => { const d = parseLocalDt(svc.startAt); return d ? d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' }) : ''; };
  const rank = (rows) => `<ol class="st-rank">${rows.map(([k, n, extra], i) => `<li style="--i:${i}"><span class="st-rank-n">${i + 1}</span>${extra || ''}<span class="st-rank-t">${escHtml(k)}</span><span class="st-rank-c">${n}×</span></li>`).join('')}</ol>`;

  // ── fester Anfang ────────────────────────────────────────────────────────
  const head = [];
  head.push({ bg: 'st-bg-1', html: `<div class="st-emoji">🚑</div><div class="st-kicker">${isAll ? 'All-Time-Rückblick' : isYear ? 'Rückblick' : 'Monatsrückblick'}</div><h2 class="st-title">${escHtml(p.title)}</h2><p class="st-text">${pick(isAll ? ['Alles, was du je eingetragen hast – in einer Story.', 'Von der ersten Schicht bis heute. Bereit?', 'Die ganz große Runde – Blaulicht an!'] : isYear ? ['Ein Jahr voller Dienste, Einsätze und Kaffee. Bereit?', 'Schnall dich an – es wird ein wilder Ritt.', 'Blaulicht an, wir fahren zurück durchs Jahr.'] : ['Schauen wir, was in diesem Monat los war.', 'Kurzer Funkspruch: dein Monat in Zahlen.', 'Einsatzbereit für deinen Monatsrückblick?'])}</p><div class="st-hint">Mit „Weiter“ geht’s los</div>` });

  const days = r.hours / 24;
  head.push({ bg: 'st-bg-2', html: `<div class="st-kicker">Im Dienst</div>${big(r.duty.length)}<p class="st-lead">${r.duty.length === 1 ? 'Schicht' : 'Schichten'}</p>
    <p class="st-text"><strong>${fmtNum(Math.round(r.hours))} Stunden</strong> – das sind ${days >= 1 ? `<strong>${fmtNum(Math.round(days * 10) / 10)} Tage</strong> am Stück` : 'einige Stunden'}.</p>
    ${r.runs.length && r.runs.length < r.duty.length ? `<p class="st-text">Zusammengezählt <strong>${r.runs.length} ${r.runs.length === 1 ? 'Dienstblock' : 'Dienstblöcke'}</strong> – manche Schichten gingen direkt ineinander über.</p>` : ''}
    ${r.segs.length ? `<p class="st-text">Dazu <strong>${r.segs.length} SEG-${r.segs.length === 1 ? 'Einsatz' : 'Einsätze'}</strong> ⚡</p>` : ''}
    ${diff(r.duty.length, r.prev.services, 'Schichten')}` });

  if (r.incs.length) {
    const avg = r.duty.length ? Math.round((r.incs.length / r.duty.length) * 10) / 10 : 0;
    head.push({ bg: 'st-bg-3', html: `<div class="st-kicker">Einsätze</div>${big(r.incs.length)}<p class="st-lead">${r.incs.length === 1 ? 'Einsatz' : 'Einsätze'}</p>
      ${avg ? `<p class="st-text">Im Schnitt <strong>${fmtNum(avg)}</strong> pro Schicht.</p>` : ''}
      ${diff(r.incs.length, r.prev.incidents, 'Einsätze')}` });
  }

  // ── Pool: wird jedes Mal neu gemischt ─────────────────────────────────────
  const pool = [];

  if (r.incs.length) {
    const pct = Math.round((r.lights / r.incs.length) * 100);
    const verdict = pct >= 60 ? 'Du lebst auf der linken Spur. 🏎️' : pct >= 30 ? 'Gesunde Mischung aus Tatütata und Gemütlichkeit.' : pct > 0 ? 'Meistens ganz entspannt unterwegs. 🐢' : 'Kein einziges Mal Blaulicht – Zen-Meister:in. 🧘';
    pool.push({ bg: 'st-bg-4', fx: pct >= 30 ? 'sosi' : '', html: `<div class="st-kicker">Sonderrechte</div><div class="st-big"><span data-count="${pct}">0</span>%</div><p class="st-lead">mit Blaulicht 🔵</p>
      <div class="st-bar"><span style="width:${pct}%"></span></div>
      <p class="st-text">${r.lights} mit, ${r.incs.length - r.lights} ohne Sonderrechte.</p><p class="st-text">${verdict}</p>` });
  }

  if (r.topKeywords.length) {
    pool.push({ bg: 'st-bg-5', html: `<div class="st-kicker">Deine Top-Stichwörter</div>${rank(r.topKeywords)}
      ${r.topEinsatzart ? `<p class="st-text">Häufigste Einsatzart: <strong>${escHtml(r.topEinsatzart[0])}</strong></p>` : ''}` });
  }

  // Wildester Dienst mit Einsatzliste (antippbar)
  if (r.busiest && (r.busiest.incidents || []).length > 1) {
    const incs = incidentsNewestFirst(r.busiest.incidents).reverse().slice(0, 7);
    pool.push({ bg: 'st-bg-6', rain: '🔥', html: `<div class="st-kicker">Dein wildester Dienst</div>
      <div class="st-big st-big-sm" data-count="${r.busiest.incidents.length}">0</div><p class="st-lead">Einsätze in einer Schicht 🔥</p>
      <p class="st-text"><strong>${escHtml(fmtDay(r.busiest))}</strong> · ${escHtml(r.busiest.vehicle || 'Dienst')}</p>
      <div class="st-list">${incs.map((inc, i) => `<button type="button" class="st-list-row" style="--i:${i}" data-st-inc="${escHtml(inc.id)}" data-st-svc="${escHtml(r.busiest.id)}">
        <span class="st-dot${inc.lights ? ' on' : ''}"></span><span class="st-list-t">${escHtml(inc.alarmCode || 'Einsatz')}</span><span class="st-list-c">›</span></button>`).join('')}
        ${r.busiest.incidents.length > incs.length ? `<div class="st-list-more">… und ${r.busiest.incidents.length - incs.length} weitere</div>` : ''}</div>` });
  }

  // Liebste Companions: weitere Einsatzmittel bei deinen Einsätzen
  {
    const comp = countTop(r.incs.flatMap((x) => x.inc.extraVehicles || []), 3);
    const withComp = r.incs.filter((x) => (x.inc.extraVehicles || []).length).length;
    if (comp.length) {
      const [c1, n1] = comp[0];
      const t = c1.toLowerCase();
      const quip = /nef|nah|nea/.test(t) ? 'Notarzt an Bord – die schweren Fälle. 🩺' : /rth|heli|christophorus|c\s?\d/.test(t) ? 'Rotor-Romantik. 🚁' : /fw|feuer|hlf|tlf|rlf/.test(t) ? 'Feuerwehr-Freundschaft. 🚒' : /pol|streife/.test(t) ? 'Mit Blaulicht-Kolleg:innen in Grün-Weiß. 👮' : /rtw|ktw|ntw/.test(t) ? 'Doppelt hält besser. 🚑🚑' : 'Ein eingespieltes Duo. 🤝';
      pool.push({ bg: 'st-bg-9', html: `<div class="st-kicker">Liebste Companions</div>
        ${rank(comp.map(([k, n]) => { const ic = vehicleIconSrc(k, true); return [k, n, ic ? `<img class="st-rank-veh" src="${escHtml(ic)}" alt="">` : '<span class="st-rank-veh st-rank-e">🚨</span>']; }))}
        <p class="st-text"><strong>${withComp}</strong> ${withComp === 1 ? 'Einsatz' : 'Einsätze'} mit weiteren Einsatzmitteln – am öftesten mit <strong>${escHtml(c1)}</strong> (${n1}×).</p>
        <p class="st-text">${quip}</p>` });
    }
  }

  // Fahrzeuge: Top 3 (bzw. Lieblingsfahrzeug)
  if (r.topVehicles.length >= 2) {
    pool.push({ bg: 'st-bg-7', html: `<div class="st-kicker">Deine Fahrzeuge</div>
      ${rank(r.topVehicles.map(([k, n]) => { const ic = vehicleIconSrc(k); return [k, n, ic ? `<img class="st-rank-veh" src="${escHtml(ic)}" alt="">` : '']; }))}
      <p class="st-text">${r.vehicleCount} verschiedene Fahrzeuge ${zr}.</p>` });
  } else if (r.topVehicles.length === 1) {
    const [name, n] = r.topVehicles[0];
    const icon = vehicleIconSrc(name, true);
    pool.push({ bg: 'st-bg-7', html: `<div class="st-kicker">Dein Lieblingsfahrzeug</div>
      ${icon ? `<img class="st-veh" src="${escHtml(icon)}" alt="">` : '<div class="st-emoji">🚐</div>'}
      <h2 class="st-title">${escHtml(name)}</h2><p class="st-text"><strong>${n}</strong> ${n === 1 ? 'Schicht' : 'Schichten'} gemeinsam – treue Seele.</p>` });
  }

  if (r.topCrew.length) {
    pool.push({ bg: 'st-bg-8', html: `<div class="st-kicker">Am öftesten mit dir unterwegs</div><div class="st-emoji">🤝</div>${rank(r.topCrew)}
      <p class="st-text">${pick(['Danke fürs Mitfahren!', 'Das Dreamteam auf vier Rädern.', 'Ohne euch wär’s nur halb so lustig.'])}</p>` });
  }

  // NACA mit Beschriftung
  const nacaTotal = r.naca.reduce((a, b) => a + b, 0);
  if (nacaTotal) {
    const max = Math.max(1, ...r.naca);
    const avgNaca = r.naca.reduce((a, n, i) => a + n * i, 0) / nacaTotal;
    const comment = avgNaca < 1.5 ? 'Überwiegend Leichtgewichte – gut so. 🍃' : avgNaca < 3 ? 'Solide Mitte: ambulant bis stationär.' : avgNaca < 4.5 ? 'Ordentlich was los – Respekt. 💪' : 'Schwere Kost. Pass auf dich auf. ❤️';
    pool.push({ bg: 'st-bg-9', html: `<div class="st-kicker">NACA-Score</div>
      <div class="st-big st-big-sm">Ø ${fmtNum(Math.round(avgNaca * 10) / 10)}</div><p class="st-text">${nacaTotal} Einsätze mit NACA</p>
      <div class="st-naca-list">${r.naca.map((n, i) => n ? `<div class="st-naca-row" style="--i:${i}"><span class="naca-badge naca-${i}">${i}</span><span class="st-naca-track"><span style="width:${Math.round((n / max) * 100)}%"></span></span><span class="st-naca-n">${n}×</span></div>` : '').join('')}</div>
      <p class="st-text st-small">${comment}</p>` });
  }

  if (r.avgAge !== null) {
    pool.push({ bg: 'st-bg-10', html: `<div class="st-kicker">Deine Patient:innen</div>${big(r.avgAge)}<p class="st-lead">Jahre im Schnitt</p>
      ${r.minAge !== null && r.maxAge !== null && r.maxAge !== r.minAge ? `<p class="st-text">Von <strong>${r.minAge}</strong> bis <strong>${r.maxAge}</strong> Jahren war alles dabei.</p>` : ''}
      <p class="st-text">${r.avgAge >= 70 ? 'Dein Publikum hat Lebenserfahrung. 👵👴' : r.avgAge >= 45 ? 'Bunt gemischt quer durch die Generationen.' : 'Erstaunlich junges Publikum! 🧒'}</p>` });
  }

  // PZC-Analyse mit Augenzwinkern – die Diagnosetexte kommen aus der
  // importierten PZC-Liste auf dem Gerät, der Code selbst enthält keine Liste.
  if (r.pzcList.length) {
    const pzcTotal = r.pzcList.reduce((n, [, c]) => n + c, 0);
    const label = (code) => pzcDiagnosis(code) || 'PZC ' + code;
    const pzcSlides = [];
    if (r.topPzc) {
      const [code, n] = r.topPzc;
      const quip = pzcQuip(`${code} ${pzcDiagnosis(code)}`.toLowerCase(), n);
      const others = r.pzcList.slice(1, 3).filter(([, c]) => c >= 2);
      const tt = `${code} ${pzcDiagnosis(code)}`.toLowerCase();
      pzcSlides.push({ bg: 'st-bg-11', rain: /katheter|harn/.test(tt) ? '💧' : /alkohol/.test(tt) ? '🍻' : /hypogly/.test(tt) ? '🍬' : /übelkeit|erbrechen/.test(tt) ? '🤢' : '', html: `<div class="st-kicker">PZC-Analyse</div>
        <div class="st-big st-big-sm">${escHtml(code)}</div><p class="st-lead">${escHtml(label(code))}</p>
        <p class="st-text"><strong>${n}×</strong> ${zr} – ${Math.round((n / pzcTotal) * 100)} % aller vergebenen PZCs.</p>
        <p class="st-text">${quip}</p>
        ${others.length ? `<p class="st-text st-small">Dahinter: ${others.map(([c, k]) => `${escHtml(c)} ${escHtml(pzcDiagnosis(c))} (${k}×)`).join(' · ')}</p>` : ''}` });
    }
    // Fachgebiete nach Hunderterstelle
    const groups = {};
    r.pzcList.forEach(([code, n]) => { const g = pzcGroup(code); if (g) groups[g] = (groups[g] || 0) + n; });
    const gl = Object.entries(groups).sort((x, y) => y[1] - x[1]);
    if (gl.length >= 2 && pzcTotal >= 4) {
      const [topG, topN] = gl[0];
      const pct = Math.round((topN / pzcTotal) * 100);
      pzcSlides.push({ bg: 'st-bg-9', html: `<div class="st-kicker">Dein Fachgebiets-Mix</div>
        <div class="st-big st-big-sm"><span data-count="${pct}">0</span>%</div><p class="st-lead">${escHtml(PZC_GROUP_TEXT[topG] || topG)}</p>
        <div class="st-naca-list">${gl.slice(0, 5).map(([g, n], i) => `<div class="st-naca-row" style="--i:${i}"><span class="st-grp">${escHtml(g)}</span><span class="st-naca-track"><span style="width:${Math.round((n / topN) * 100)}%"></span></span><span class="st-naca-n">${Math.round((n / pzcTotal) * 100)}%</span></div>`).join('')}</div>
        <p class="st-text st-small">nach PZC-Gruppen, ${pzcTotal} Einsätze mit PZC</p>` });
    }
    // Vielfalt und Exot
    const singles = r.pzcList.filter(([, n]) => n === 1);
    if (r.pzcList.length >= 3) {
      const exot = singles.length ? pick(singles)[0] : null;
      pzcSlides.push({ bg: 'st-bg-10', html: `<div class="st-kicker">PZC-Vielfalt</div><div class="st-emoji">🎲</div>
        ${big(r.pzcList.length)}<p class="st-lead">verschiedene PZCs</p>
        <p class="st-text">${r.pzcList.length >= 25 ? 'Du hast den Katalog quasi durchgespielt. 📚' : r.pzcList.length >= 10 ? 'Ordentlich Abwechslung im Patientenzustand.' : 'Überschaubar – du weißt, was kommt.'}</p>
        ${exot ? `<p class="st-text">Der Exot: <strong>${escHtml(exot)}</strong> ${escHtml(pzcDiagnosis(exot))} – nur 1× ${zr}. 🦄</p>` : ''}` });
    }
    // höchstens zwei PZC-Folien pro Story, damit es abwechslungsreich bleibt
    shuffle(pzcSlides).slice(0, full ? 99 : 2).forEach((x) => pool.push(x));
  }

  // Zufällige Statistikkennzahl
  if (r.statKzList.length) {
    const [label, n] = pick(r.statKzList.slice(0, 4));
    const t = label.toLowerCase();
    const quip = /alkohol|rausch|intox/.test(t) ? `${isAll ? 'Rauschige Zeiten' : isYear ? 'Ein rauschiges Jahr' : 'Ein rauschiger Monat'} 🍻`
      : /psych/.test(t) ? 'Viel Seelenarbeit. 🫂'
      : /verkehr|unfall/.test(t) ? 'Asphalt-Cowboy. 🛣️'
      : /sturz/.test(t) ? 'Hoppala! 🍂'
      : /chirurg/.test(t) ? 'Schnipp, schnapp – chirurgisch unterwegs. ✂️'
      : /intern/.test(t) ? 'Internistisch durch und durch. 🩺'
      : /neuro/.test(t) ? 'Nervenstark. 🧠'
      : /kind|pädiat/.test(t) ? 'Kleine Patient:innen, große Herzen. 🧸'
      : /geburt|gyn/.test(t) ? 'Storch-Express. 🍼'
      : 'Spannend, was alles dabei war.';
    pool.push({ bg: 'st-bg-5', rain: /alkohol|rausch|intox/.test(t) ? '🍻' : '', html: `<div class="st-kicker">Statistikkennzahl im Fokus</div><div class="st-emoji">🔎</div>
      ${big(n)}<p class="st-lead">× ${escHtml(label)}</p><p class="st-text">${quip}</p>` });
  }

  // Zufällige Einsatzart
  if (r.einsatzartList.length > 1) {
    const [label, n] = pick(r.einsatzartList.slice(0, 3));
    const t = label.toLowerCase();
    const quip = /heim/.test(t) ? 'Heimbringer-Service – alle wieder gut nach Hause. 🏠' : /hin/.test(t) ? 'Hin und weg. 🏥' : /ambul/.test(t) ? 'Ambulant-Abo. 🎟️' : 'So viel dazu.';
    pool.push({ bg: 'st-bg-3', html: `<div class="st-kicker">Einsatzart</div>${big(n)}<p class="st-lead">× ${escHtml(label)}</p><p class="st-text">${quip}</p>` });
  }

  // Ein Favorit aus dem Zeitraum
  if (r.favList.length) {
    const f = pickRich(r.favList);
    const ea = f.inc.einsatzart ? EINSATZART_MAP.get(String(f.inc.einsatzart)) : '';
    pool.push({ bg: 'st-bg-8', html: `<div class="st-kicker">Aus deinen Favoriten</div><div class="st-emoji">⭐</div>
      <h2 class="st-title">${escHtml(f.inc.alarmCode || 'Einsatz')}</h2>
      <p class="st-text">${escHtml(fmtDay(f.svc))}${f.svc.vehicle ? ' · ' + escHtml(f.svc.vehicle) : ''}</p>
      ${ea ? `<p class="st-text">${escHtml(ea)}</p>` : ''}
      ${f.inc.note ? `<p class="st-quote">„${escHtml(shortNote(f.inc.note))}“</p>` : ''}
      <button type="button" class="st-link" data-st-inc="${escHtml(f.inc.id)}" data-st-svc="${escHtml(f.svc.id)}">Einsatz ansehen ›</button>` });
  }

  // Zufälliges Zitat aus den Notizen
  if (r.notes.length >= 2) {
    const n = pickRich(r.notes);
    pool.push({ bg: 'st-bg-2', html: `<div class="st-kicker">Zitat ${isAll ? 'für die Ewigkeit' : isYear ? 'des Jahres' : 'des Monats'}</div><div class="st-emoji">💬</div>
      <p class="st-quote st-quote-big">„${escHtml(shortNote(n.inc.note, 160))}“</p><p class="st-text st-small">${escHtml(n.inc.alarmCode || '')} · ${escHtml(fmtDay(n.svc))}</p>` });
  }

  // Längster Dienstblock
  if (r.longestRun && r.longestRun.items.length > 1) {
    const lr = r.longestRun;
    pool.push({ bg: 'st-bg-6', rain: '☕', html: `<div class="st-kicker">Marathon-Block</div><div class="st-emoji">🏃</div>
      ${big(Math.round(lr.hours))}<p class="st-lead">Stunden am Stück</p>
      <p class="st-text"><strong>${lr.items.length} Schichten</strong> hintereinander · ${lr.incidents} Einsätze</p>
      <p class="st-text st-small">${escHtml(runLabel(lr))}</p>
      <p class="st-text">${pick(['Wer braucht schon Schlaf? ☕', 'Durchhaltevermögen: legendär.', 'Kaffee-Verbrauch: geschätzt hoch.'])}</p>` });
  }

  // Blaulicht-Rekord in einer Schicht
  if (r.lightsRecord && r.lightsRecord.n >= 2) {
    pool.push({ bg: 'st-bg-4', fx: 'sosi', html: `<div class="st-kicker">Blaulicht-Rekord</div><div class="st-emoji">🚨</div>
      ${big(r.lightsRecord.n)}<p class="st-lead">Blaulichtfahrten in einer Schicht</p>
      <p class="st-text">${escHtml(fmtDay(r.lightsRecord.svc))} · ${escHtml(r.lightsRecord.svc.vehicle || 'Dienst')}</p>` });
  }

  // Rhythmus
  if (r.duty.length >= 2) {
    const wd = r.weekdays.indexOf(Math.max(...r.weekdays));
    const dayShifts = r.duty.length - r.nights;
    pool.push({ bg: 'st-bg-10', html: `<div class="st-kicker">Dein Rhythmus</div><div class="st-emoji">${r.nights > dayShifts ? '🌙' : '☀️'}</div>
      <h2 class="st-title">${r.nights > dayShifts ? 'Nachteule' : r.nights === dayShifts ? 'Tag & Nacht' : 'Frühaufsteher:in'}</h2>
      <p class="st-text">${dayShifts} Tag- und ${r.nights} Nachtschichten.</p>
      <p class="st-text">Am liebsten im Dienst: <strong>${WEEKDAY_LONG[wd]}</strong></p>` });
  }

  // Jahr: Monatsverlauf
  if (isYear) {
    const max = Math.max(1, ...r.perMonth);
    const best = r.perMonth.indexOf(Math.max(...r.perMonth));
    pool.push({ bg: 'st-bg-11', html: `<div class="st-kicker">${isAll ? 'Einsätze nach Monat' : 'Dein Jahr in Monaten'}</div>
      <div class="st-months">${r.perMonth.map((n, i) => `<div class="st-month${i === best && n ? ' is-best' : ''}"><span class="st-month-n">${n || ''}</span><span class="st-month-bar" style="height:${Math.round((n / max) * 100)}%"></span><span class="st-month-l">${MONTHS_DE[i].slice(0, 1)}</span></div>`).join('')}</div>
      ${r.perMonth[best] ? `<p class="st-text">Stärkster Monat: <strong>${MONTHS_DE[best]}</strong> mit ${r.perMonth[best]} Einsätzen</p>` : ''}` });
  }

  // All-Time: Jahre im Vergleich
  if (isAll) {
    const ys = Object.keys(r.perYear).sort();
    if (ys.length >= 2) {
      const max = Math.max(1, ...ys.map((y) => r.perYear[y].incs));
      const best = ys.reduce((a, y) => (r.perYear[y].incs > r.perYear[a].incs ? y : a), ys[0]);
      pool.push({ bg: 'st-bg-11', html: `<div class="st-kicker">Deine Jahre</div>
        <div class="st-months">${ys.map((y) => `<div class="st-month${y === best ? ' is-best' : ''}"><span class="st-month-n">${r.perYear[y].incs || ''}</span><span class="st-month-bar" style="height:${Math.round((r.perYear[y].incs / max) * 100)}%"></span><span class="st-month-l">${"'" + y.slice(2)}</span></div>`).join('')}</div>
        <p class="st-text">Stärkstes Jahr: <strong>${best}</strong> mit ${r.perYear[best].incs} Einsätzen</p>` });
    }
    if (p.first) {
      const d0 = new Date(p.first + 'T00:00');
      const days = Math.max(1, Math.round((Date.now() - d0) / 864e5));
      pool.push({ bg: 'st-bg-10', html: `<div class="st-kicker">Dabei seit</div><div class="st-emoji">📅</div>
        <h2 class="st-title">${escHtml(d0.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' }))}</h2>
        ${big(days)}<p class="st-lead">Tage Einsatztagebuch</p>
        <p class="st-text">Im Schnitt alle <strong>${fmtNum(Math.round((days / Math.max(1, r.duty.length)) * 10) / 10)} Tage</strong> eine Schicht.</p>` });
    }
  }

  // Monat: Wochen-Verlauf
  if (!isYear && r.incs.length >= 3) {
    const max = Math.max(1, ...r.perWeekday);
    pool.push({ bg: 'st-bg-11', html: `<div class="st-kicker">Einsätze nach Wochentag</div>
      <div class="st-months">${r.perWeekday.map((n, i) => `<div class="st-month${n === max ? ' is-best' : ''}"><span class="st-month-n">${n || ''}</span><span class="st-month-bar" style="height:${Math.round((n / max) * 100)}%"></span><span class="st-month-l">${WEEKDAY_2[(i + 1) % 7]}</span></div>`).join('')}</div>
      <p class="st-text">Am meisten los: <strong>${WEEKDAY_LONG[(r.perWeekday.indexOf(max) + 1) % 7]}</strong></p>` });
  }

  // ── Fahrzeug-Spielereien ──────────────────────────────────────────────
  const vimg = (name, sosi, cls = '') => {
    const src = vehicleIconSrc(name, sosi);
    return src ? `<img class="st-vimg ${cls}" src="${escHtml(src)}" alt="">` : `<span class="st-vimg st-vemoji ${cls}">🚑</span>`;
  };
  const hasIcons = r.vehStats.some((v) => vehicleIconSrc(v.name));

  // Fuhrpark-Parade: alle Fahrzeuge fahren im Konvoi durchs Bild
  if (r.vehStats.length >= 2 && hasIcons) {
    const cars = r.vehStats.slice(0, 6);
    pool.push({ bg: 'st-bg-2', html: `<div class="st-kicker">Fuhrpark-Parade</div>
      <h2 class="st-title">${r.vehStats.length} Fahrzeuge</h2>
      <div class="st-road">${cars.map((v, i) => `<div class="st-car" style="--i:${i};--n:${cars.length}">${vimg(v.name, true)}</div>`).join('')}</div>
      <div class="st-chips">${cars.map((v, i) => `<span class="st-chip-s" style="--i:${i}">${escHtml(v.name)} · ${v.shifts}×</span>`).join('')}</div>
      <p class="st-text">${pick(['Alle mit Blaulicht – Platz da! 🚨', 'Rettungsgasse bitte! 🛣️', 'Der Konvoi deines Vertrauens.'])}</p>` });
  }

  // Jede Schicht ein Icon
  if (r.duty.length >= 6 && hasIcons) {
    const shown = r.duty.slice().sort((a, b) => (a.startAt || '').localeCompare(b.startAt || '')).slice(-60);
    const withL = shown.filter((x) => (x.incidents || []).some((i) => i.lights)).length;
    pool.push({ bg: 'st-bg-10', html: `<div class="st-kicker">${isAll ? 'Deine Dienstzeit' : isYear ? 'Dein Jahr' : 'Dein Monat'} in Fahrzeugen</div>
      <div class="st-wall${shown.length > 30 ? ' is-dense' : ''}">${shown.map((x, i) => { const l = (x.incidents || []).some((k) => k.lights); return `<span class="st-wall-i${l ? ' is-l' : ''}" style="--i:${i}">${vimg(x.vehicle, l)}</span>`; }).join('')}</div>
      <p class="st-text">Jedes Icon eine Schicht – <strong>${withL}</strong> davon mit Blaulicht 🔵</p>` });
  }

  // Blaulicht-Champion: Fahrzeug mit der höchsten Blaulichtquote
  const champ = r.vehStats.filter((v) => v.incs >= 3).sort((a, b) => b.lights / b.incs - a.lights / a.incs)[0];
  if (champ && champ.lights) {
    const pct = Math.round((champ.lights / champ.incs) * 100);
    pool.push({ bg: 'st-bg-4', fx: 'sosi', html: `<div class="st-kicker">Blaulicht-Champion</div>
      <div class="st-champ">${vimg(champ.name, false, 'is-n')}${vimg(champ.name, true, 'is-s')}</div>
      <h2 class="st-title">${escHtml(champ.name)}</h2>
      <div class="st-big st-big-sm"><span data-count="${pct}">0</span>%</div><p class="st-lead">der Einsätze mit Sonderrechten</p>
      <p class="st-text">${pct >= 60 ? 'Das Ding kennt nur eine Spur: die linke. 🏎️' : pct >= 30 ? 'Tatütata mit Ansage.' : 'Selbst der Champion fährt meistens gemütlich. 🐢'}</p>` });
  }

  // Fahrzeug-Duell der beiden häufigsten Fahrzeuge
  if (r.vehStats.length >= 2 && r.vehStats[1].shifts >= 2) {
    const [a, b] = r.vehStats;
    const per = (v) => v.shifts ? v.incs / v.shifts : 0;
    const lp = (v) => v.incs ? Math.round((v.lights / v.incs) * 100) : 0;
    const row = (label, x, y, fmt) => `<div class="st-duel-row"><span class="${x > y ? 'win' : ''}">${fmt(x)}</span><small>${label}</small><span class="${y > x ? 'win' : ''}">${fmt(y)}</span></div>`;
    const score = (per(a) > per(b)) + (lp(a) > lp(b)) + (a.shifts > b.shifts) - (per(b) > per(a)) - (lp(b) > lp(a)) - (b.shifts > a.shifts);
    pool.push({ bg: 'st-bg-6', html: `<div class="st-kicker">Fahrzeug-Duell</div>
      <div class="st-duel"><div class="st-duel-a">${vimg(a.name, false, 'is-flip')}<b>${escHtml(a.name)}</b></div><div class="st-vs">VS</div><div class="st-duel-b">${vimg(b.name, false)}<b>${escHtml(b.name)}</b></div></div>
      <div class="st-duel-rows">
        ${row('Schichten', a.shifts, b.shifts, String)}
        ${row('Ø Einsätze/Schicht', per(a), per(b), (v) => fmtNum(Math.round(v * 10) / 10))}
        ${row('Blaulicht', lp(a), lp(b), (v) => v + ' %')}
      </div>
      <p class="st-text">${score === 0 ? 'Unentschieden – beide gleich gut. 🤝' : `Sieger: <strong>${escHtml((score > 0 ? a : b).name)}</strong> 🏆`}</p>` });
  }

  // Treueste Beziehung: meiste Schichten in Folge auf demselben Fahrzeug
  if (r.vehStreak && r.vehStreak.n >= 3) {
    pool.push({ bg: 'st-bg-7', html: `<div class="st-kicker">Treueste Beziehung</div>
      <div class="st-love">${vimg(r.vehStreak.name, false)}<span class="st-heart">❤️</span></div>
      ${big(r.vehStreak.n)}<p class="st-lead">Schichten in Folge auf ${escHtml(r.vehStreak.name)}</p>
      <p class="st-text">${r.vehStreak.n >= 6 ? 'Ihr seid quasi verheiratet. 💍' : 'Da bahnt sich was an. 😍'}</p>` });
  }

  // ── weitere Auswertungen ─────────────────────────────────────────────────
  // Rush-Hour nach Uhrzeit der Einsätze
  const hourTotal = r.perHour.reduce((a, b) => a + b, 0);
  if (hourTotal >= 6) {
    const max = Math.max(...r.perHour);
    const h = r.perHour.indexOf(max);
    const night = r.perHour.slice(0, 6).reduce((a, b) => a + b, 0);
    pool.push({ bg: 'st-bg-9', html: `<div class="st-kicker">Deine Rush-Hour</div>
      <h2 class="st-title">${String(h).padStart(2, '0')}–${String((h + 1) % 24).padStart(2, '0')} Uhr</h2>
      <div class="st-hours">${r.perHour.map((n, i) => `<span class="${i === h ? 'is-best' : ''}" style="--i:${i};height:${Math.max(4, Math.round((n / max) * 100))}%"></span>`).join('')}</div>
      <div class="st-hours-l"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
      <p class="st-text">${night / hourTotal >= 0.2 ? `${night} Einsätze zwischen 0 und 6 Uhr – Geisterstunde. 👻` : h < 10 ? 'Morgenstund hat Blaulicht im Mund. 🌅' : h < 17 ? 'Mittags ist am meisten los. 🍝' : 'Abends geht’s rund. 🌆'}</p>` });
  }

  // Couch-Schichten ohne Einsatz
  const quiet = r.duty.filter((x) => !(x.incidents || []).length).length;
  if (quiet && r.duty.length >= 3) {
    pool.push({ bg: 'st-bg-5', rain: '🛋️', html: `<div class="st-kicker">Couch-Schichten</div><div class="st-emoji">🛋️</div>
      ${big(quiet)}<p class="st-lead">${quiet === 1 ? 'Schicht' : 'Schichten'} ganz ohne Einsatz</p>
      <p class="st-text">${pick(['Netflix & Chill auf der Wache. 📺', 'Fahrzeugpflege deluxe. 🧽', 'Der Kaffee war wenigstens heiß. ☕'])}</p>` });
  }

  // Crew-Chemie: mit wem wird es wild, mit wem ruhig?
  if (r.crewChem.length >= 2) {
    const wild = r.crewChem[0], calm = r.crewChem[r.crewChem.length - 1];
    if (wild.avg - calm.avg >= 0.5) {
      pool.push({ bg: 'st-bg-3', html: `<div class="st-kicker">Crew-Chemie</div><div class="st-emoji">⚗️</div>
        <p class="st-text">Mit <strong>${escHtml(wild.name)}</strong> wird’s wild:</p><div class="st-big st-big-sm">Ø ${fmtNum(Math.round(wild.avg * 10) / 10)}</div><p class="st-lead">Einsätze pro Schicht 🌪️</p>
        <p class="st-text">Mit <strong>${escHtml(calm.name)}</strong> bleibt’s ruhig: Ø ${fmtNum(Math.round(calm.avg * 10) / 10)} – Glücksbringer:in 🍀</p>` });
    }
  }

  // Erster und letzter Einsatz
  if (r.incs.length >= 3) {
    const sorted = r.incs.slice().sort((a, b) => (a.svc.startAt || '').localeCompare(b.svc.startAt || '') || (a.inc.createdAt || '').localeCompare(b.inc.createdAt || ''));
    const f = sorted[0], l = sorted[sorted.length - 1];
    const card = (x, k) => `<button type="button" class="st-fl" data-st-inc="${escHtml(x.inc.id)}" data-st-svc="${escHtml(x.svc.id)}"><small>${k}</small><b>${escHtml(x.inc.alarmCode || 'Einsatz')}</b><span>${escHtml(fmtDay(x.svc))}</span></button>`;
    pool.push({ bg: 'st-bg-8', html: `<div class="st-kicker">Anfang & Ende</div><div class="st-emoji">🎬</div>
      ${card(f, 'Alles begann mit')}<div class="st-fl-dots">⋮</div>${card(l, 'und endete mit')}
      <p class="st-text st-small">${r.incs.length - 2} Einsätze dazwischen</p>` });
  }

  // Längste Pause (Jahr)
  if (isYear && r.longestGap && r.longestGap.days >= 7) {
    const g = r.longestGap;
    pool.push({ bg: 'st-bg-5', rain: '🏝️', html: `<div class="st-kicker">Längste Pause</div><div class="st-emoji">🏝️</div>
      ${big(g.days)}<p class="st-lead">Tage ohne Dienst</p>
      <p class="st-text">${escHtml(g.from.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' }))} bis ${escHtml(g.to.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' }))}</p>
      <p class="st-text">${g.days >= 21 ? 'Urlaub verdient! 🌴' : 'Kurz durchschnaufen. 😮‍💨'}</p>` });
  }

  // Wochenend-Krieger:in
  const we = r.weekdays[0] + r.weekdays[6];
  if (r.duty.length >= 4 && we) {
    const pct = Math.round((we / r.duty.length) * 100);
    pool.push({ bg: 'st-bg-11', html: `<div class="st-kicker">Wochenende</div><div class="st-emoji">${pct >= 40 ? '🎉' : '🗓️'}</div>
      <div class="st-big"><span data-count="${pct}">0</span>%</div><p class="st-lead">deiner Schichten am Wochenende</p>
      <p class="st-text">${pct >= 40 ? 'Wochenend-Krieger:in – Party machen die anderen. 🪩' : pct >= 25 ? 'Ganz normal verteilt.' : 'Wochenende ist heilig. 😇'}</p>` });
  }

  // Quiz: Frage antippen, die Story wartet auf die Antwort
  const quizzes = [];
  const uniqueTop = (rows) => rows.length >= 3 && rows[0][1] > rows[1][1];
  const numOpts = (n) => {
    const set = new Set();
    shuffle([0.5, 0.7, 1.35, 1.6, 2]).forEach((f) => { const v = Math.max(1, Math.round(n * f)); if (v !== n && set.size < 3) set.add(v); });
    for (let d = 1; set.size < 3; d++) { if (n + d * 2 !== n) set.add(n + d * 2); }
    return shuffle([n, ...set]);
  };
  const choice = (q, rows, render, answer) => quizzes.push({ q, answer, opts: shuffle(rows.slice(0, rows.length >= 4 ? 4 : 3)).map((row) => ({ ...render(row), ok: row === rows[0] })) });
  const vRows = r.vehStats.map((v) => [v.name, v.shifts]);
  if (uniqueTop(vRows)) choice('Mit welchem Fahrzeug warst du am öftesten unterwegs?', vRows,
    ([name, n]) => ({ html: `${vimg(name, false, 'is-q')}<span>${escHtml(name)}</span>`, sub: `${n}×` }), `${escHtml(vRows[0][0])} – ${vRows[0][1]} Schichten`);
  if (uniqueTop(r.topKeywords)) choice('Welches Stichwort hattest du am häufigsten?', r.topKeywords,
    ([k, n]) => ({ html: `<span>${escHtml(k)}</span>`, sub: `${n}×` }), `${escHtml(r.topKeywords[0][0])} – ${r.topKeywords[0][1]}×`);
  if (uniqueTop(r.topCrew)) choice('Mit wem warst du am häufigsten im Dienst?', r.topCrew,
    ([k, n]) => ({ html: `<span>${escHtml(k)}</span>`, sub: `${n}×` }), `${escHtml(r.topCrew[0][0])} – ${r.topCrew[0][1]} Schichten`);
  if (r.topKeywords.length >= 2) {
    const [kw, n] = pick(r.topKeywords.slice(0, 3));
    quizzes.push({ q: `Wie oft hattest du „${escHtml(kw)}“?`, answer: `${n}× ${zr}`, opts: numOpts(n).map((v) => ({ html: `<span class="st-q-n">${v}×</span>`, ok: v === n })) });
  }
  if (r.incs.length >= 5) {
    const n = r.incs.length;
    quizzes.push({ q: `Wie viele Einsätze hattest du ${zr}?`, answer: `${n} Einsätze`, opts: numOpts(n).map((v) => ({ html: `<span class="st-q-n">${v}</span>`, ok: v === n })) });
  }
  if (r.incs.length >= 5) {
    const pct = Math.round((r.lights / r.incs.length) * 100);
    const buckets = [[0, 24, 'unter 25 %'], [25, 49, '25 – 49 %'], [50, 74, '50 – 74 %'], [75, 100, '75 % oder mehr']];
    quizzes.push({ q: 'Wie viel Prozent deiner Einsätze waren mit Blaulicht?', answer: `${pct} % mit Blaulicht`, opts: buckets.map(([lo, hi, l]) => ({ html: `<span class="st-q-n">${l}</span>`, ok: pct >= lo && pct <= hi })) });
  }
  if (isYear) {
    const m = r.perMonth.map((n, i) => [MONTHS_DE[i], n]).filter(([, n]) => n).sort((x, y) => y[1] - x[1]);
    if (uniqueTop(m)) choice('In welchem Monat war am meisten los?', m, ([k, n]) => ({ html: `<span>${k}</span>`, sub: `${n} Einsätze` }), `${m[0][0]} – ${m[0][1]} Einsätze`);
  }
  const nacaRows = r.naca.map((n, i) => ['NACA ' + i, n]).filter(([, n]) => n).sort((x, y) => y[1] - x[1]);
  if (uniqueTop(nacaRows)) choice('Welcher NACA-Wert kam am häufigsten vor?', nacaRows, ([k, n]) => ({ html: `<span>${k}</span>`, sub: `${n}×` }), `${nacaRows[0][0]} – ${nacaRows[0][1]}×`);
  // bis zu zwei verschiedene Fragen pro Story
  const qs = shuffle(quizzes).slice(0, full ? 99 : quizzes.length >= 4 ? 2 : 1);
  qs.forEach((qz, qi) => {
    pool.push({ bg: qi ? 'st-bg-3' : 'st-bg-7', quiz: true, html: `<div class="st-kicker">Quiz<!--qn--></div><div class="st-emoji st-q-emoji">🤔</div>
      <h2 class="st-title st-title-sm">${qz.q}</h2>
      <div class="st-quiz${qz.opts.length === 4 ? ' is-4' : ''}">${qz.opts.map((o, i) => `<button type="button" class="st-q" style="--i:${i}" data-quiz="${o.ok ? 1 : 0}">${o.html}${o.sub ? `<small>${escHtml(o.sub)}</small>` : ''}<i class="st-q-mark" aria-hidden="true"></i></button>`).join('')}</div>
      <p class="st-text st-q-hint">Tippe auf deine Antwort – die Story wartet.</p>
      <p class="st-text st-q-answer" hidden>${qz.answer}</p>` });
  });

  // Abzeichen, die in diesem Zeitraum erreicht wurden
  {
    const inP = (d) => d && (!p.from || d.slice(0, 10) >= p.from) && (!p.to || d.slice(0, 10) <= p.to);
    const got = computeBadges().filter((b) => b.done && inP(b.date));
    if (got.length) pool.push({ bg: 'st-bg-8', fx: 'confetti', html: `<div class="st-kicker">Neue Abzeichen</div><div class="st-emoji">🏅</div>
      ${big(got.length)}<p class="st-lead">${got.length === 1 ? 'Abzeichen' : 'Abzeichen'} ${zr} freigeschaltet</p>
      <div class="st-badges">${got.slice(0, 9).map((b, i) => `<div class="st-badge" style="--i:${i}"><span>${b.icon}</span><small>${escHtml(b.title)}</small></div>`).join('')}</div>` });
  }

  // ── Mini-Spiele ────────────────────────────────────────────────────────
  const games = [];
  // Rubbellos: verdeckt einen zufälligen Einsatz aus dem Zeitraum
  if (r.incs.length) {
    const x = pickRich(r.incs);
    const ic = vehicleIconSrc(x.svc.vehicle, !!x.inc.lights);
    games.push({ bg: 'st-bg-8', game: 'scratch', html: `<div class="st-kicker">Rubbellos</div>
      <h2 class="st-title st-title-sm">Rubbel deinen Zufalls-Einsatz frei!</h2>
      <div class="st-scratch st-game">
        <div class="st-scratch-prize">
          ${ic ? `<img class="st-vimg st-prize-veh" src="${escHtml(ic)}" alt="">` : '<div class="st-emoji">🎁</div>'}
          <b>${escHtml(x.inc.alarmCode || 'Einsatz')}</b>
          <span>${escHtml(fmtDay(x.svc))}${x.svc.vehicle ? ' · ' + escHtml(x.svc.vehicle) : ''}</span>
          ${x.inc.lights ? '<span class="st-prize-tag">🔵 mit Blaulicht</span>' : ''}
        </div>
        <canvas class="st-scratch-c" aria-label="Rubbelfeld"></canvas>
      </div>
      <p class="st-text st-g-hint">Mit dem Finger rubbeln ✋</p>
      <button type="button" class="st-link st-g-after" hidden data-st-inc="${escHtml(x.inc.id)}" data-st-svc="${escHtml(x.svc.id)}">Einsatz ansehen ›</button>` });
  }
  // Slot-Maschine: Walzen mit den Fahrzeugen aus dem Zeitraum, Gewinn = meistgefahrenes Fahrzeug
  if (r.vehStats.length) {
    const sym = (src, emoji) => src ? `<img class="st-vimg" src="${escHtml(src)}" alt="">` : `<span class="st-slot-e">${emoji || '🚑'}</span>`;
    const keyOf = (name) => vehicleIconSrc(name, true) || 'veh:' + name;
    const syms = [];
    const seen = new Set();
    r.vehStats.forEach((v) => { const k = keyOf(v.name); if (!seen.has(k) && syms.length < 5) { seen.add(k); syms.push({ key: k, html: sym(vehicleIconSrc(v.name, true)) }); } });
    // zu wenig verschiedene: andere Fahrzeuggrafiken aus der Liste, dann Emojis
    (state.vehicleCategories || []).forEach((c) => { const src = c.iconSoSi || c.iconNormal; if (src && !seen.has(src) && syms.length < 5) { seen.add(src); syms.push({ key: src, html: sym(src) }); } });
    ['🚨', '☕', '⭐', '🍀', '🩺'].forEach((e) => { if (syms.length < 5) syms.push({ key: e, html: sym('', e) }); });
    // Gewinne der Reihe nach: Platz 1, 2, 3 der meistgefahrenen Fahrzeuge
    const prizes = r.vehStats.slice(0, 3).map((v, i) => ({ key: keyOf(v.name), rank: i + 1,
      text: `<strong>${i === 0 ? 'JACKPOT! 🎰💰' : `Platz ${i + 1}! ${i === 1 ? '🥈' : '🥉'}`}</strong><br>${i === 0 ? 'Dein meistgefahrenes Fahrzeug' : 'Auf Platz ' + (i + 1)}: <strong>${escHtml(v.name)}</strong><br><span class="st-small">${v.shifts} ${v.shifts === 1 ? 'Schicht' : 'Schichten'} · ${v.incs} Einsätze · ${v.lights}× Blaulicht ${zr}</span>` }));
    games.push({ bg: 'st-bg-6', game: 'slot', data: { syms, prizes },
      html: `<div class="st-kicker">Einarmiger Bandit</div><div class="st-emoji">🎰</div>
      <div class="st-slot st-game"><div class="st-reel"><div class="st-strip"></div></div><div class="st-reel"><div class="st-strip"></div></div><div class="st-reel"><div class="st-strip"></div></div></div>
      <button type="button" class="st-spin">Drehen 🎰</button>
      <p class="st-text st-g-hint">Zieh am Hebel – was hast du am öftesten gefahren?</p>` });
  }
  // Blaulicht-Reaktionstest
  games.push({ bg: 'st-bg-2', game: 'react', html: `<div class="st-kicker">Reaktionstest</div>
    <h2 class="st-title st-title-sm">Tippe, sobald das Blaulicht angeht!</h2>
    <button type="button" class="st-react st-game"><span class="st-react-t">Tippen zum Starten</span></button>
    <p class="st-text st-g-hint">Bestzeit: –</p>` });
  // Schätzen mit Schieberegler
  {
    const est = [];
    if (r.hours >= 10) est.push({ q: `Wie viele Stunden warst du ${zr} im Dienst?`, n: Math.round(r.hours), unit: 'Stunden' });
    if (r.incs.length >= 5) est.push({ q: `Wie viele Einsätze hattest du ${zr}?`, n: r.incs.length, unit: 'Einsätze' });
    if (r.lights >= 3) est.push({ q: `Wie oft bist du ${zr} mit Blaulicht gefahren?`, n: r.lights, unit: 'Blaulichtfahrten' });
    if (est.length) {
      const e = pick(est);
      const max = Math.max(10, Math.round((e.n * (1.6 + Math.random() * 0.8)) / 5) * 5);
      games.push({ bg: 'st-bg-9', game: 'guess', data: { n: e.n, max, unit: e.unit }, html: `<div class="st-kicker">Schätz mal!</div><div class="st-emoji">🎯</div>
        <h2 class="st-title st-title-sm">${e.q}</h2>
        <div class="st-guess st-game"><div class="st-guess-v">${Math.round(max / 2)}</div>
          <div class="st-guess-track"><div class="st-guess-fill"></div><div class="st-guess-real" hidden></div><div class="st-guess-thumb"></div></div>
          <div class="st-guess-l"><span>0</span><span>${max}</span></div></div>
        <button type="button" class="st-spin st-guess-ok">Tipp abgeben</button>
        <p class="st-text st-g-hint">Regler ziehen</p>` });
    }
  }
  // Memory mit Fahrzeugen und Rettungsdienst-Symbolen
  {
    const seen = new Set(), syms = [];
    r.vehStats.forEach((v) => { const src = vehicleIconSrc(v.name, true); if (src && !seen.has(src) && syms.length < 3) { seen.add(src); syms.push(`<img class="st-vimg" src="${escHtml(src)}" alt="">`); } });
    shuffle(['🚑', '🚨', '🩺', '💉', '☕', '📟', '🦺', '🧯', '❤️‍🩹']).forEach((e) => { if (syms.length < 6) syms.push(`<span class="st-mem-e">${e}</span>`); });
    games.push({ bg: 'st-bg-10', game: 'memory', data: { syms }, html: `<div class="st-kicker">Memory</div>
      <h2 class="st-title st-title-sm">Finde die Paare!</h2>
      <div class="st-memory st-game"></div>
      <p class="st-text st-g-hint">Züge: 0</p>` });
  }
  // Höher oder tiefer mit den eigenen Stichwörtern
  {
    const kws = countTop(r.incs.map((x) => x.inc.alarmCode), 12);
    if (kws.length >= 4) games.push({ bg: 'st-bg-3', game: 'hilo', data: { kws }, html: `<div class="st-kicker">Öfter oder seltener?</div>
      <div class="st-hilo st-game"></div>
      <p class="st-text st-g-hint"></p>` });
  }
  // Reanimations-Takt: 100–120 pro Minute
  games.push({ bg: 'st-bg-1', game: 'cpr', html: `<div class="st-kicker">Drück im Takt!</div>
    <h2 class="st-title st-title-sm">Herzdruckmassage: 100–120 pro Minute</h2>
    <button type="button" class="st-cpr st-game"><span class="st-cpr-h">❤️</span><span class="st-cpr-v">Tippen zum Starten</span></button>
    <p class="st-text st-g-hint">15× im Takt tippen</p>` });
  // Glücksrad: dreht über deine Top-Stichwörter und zieht einen Einsatz
  {
    const kws = countTop(r.incs.map((x) => x.inc.alarmCode), 6);
    if (kws.length >= 3) {
      const byKw = {};
      kws.forEach(([k]) => { byKw[k] = r.incs.filter((x) => x.inc.alarmCode === k); });
      const segs = kws.map(([k, n]) => ({ k, n }));
      games.push({ bg: 'st-bg-8', game: 'wheel', data: { segs, byKw, fmt: (x) => fmtDay(x.svc) }, html: `<div class="st-kicker">Glücksrad</div>
        <div class="st-wheel-wrap st-game"><div class="st-wheel-pin">▼</div><div class="st-wheel"></div></div>
        <button type="button" class="st-spin">Drehen 🎡</button>
        <div class="st-wheel-res"></div>
        <p class="st-text st-g-hint">Das Rad wählt ein Stichwort – und einen Einsatz dazu.</p>` });
    }
  }
  const gameCount = full ? games.length : Math.min(games.length, isYear ? 2 : 1 + Math.round(Math.random()));
  const chosenGames = shuffle(games).slice(0, gameCount);

  // Auswahl: jedes Mal anders gemischt, nicht immer alle Module
  const body = full ? shuffle(pool) : shuffle(pool).slice(0, (isYear ? 11 : 9) - chosenGames.length);
  // Spiele an zufälligen Stellen einstreuen (nicht direkt hintereinander)
  chosenGames.forEach((g, gi) => {
    const lo = Math.floor((gi * body.length) / chosenGames.length), hi = Math.floor(((gi + 1) * body.length) / chosenGames.length);
    body.splice(lo + Math.floor(Math.random() * (hi - lo + 1)), 0, g);
  });
  // Quizfragen in Reihenfolge nummerieren
  const qSlides = body.filter((x) => x.quiz);
  qSlides.forEach((x, i) => { x.html = x.html.replace('<!--qn-->', qSlides.length > 1 ? ` · Frage ${i + 1}` : ''); });

  const tail = { bg: 'st-bg-1', fx: 'confetti', html: `<div class="st-kicker">${escHtml(p.label)} in Zahlen</div>
    <div class="st-sum">
      <div><span>${r.duty.length}</span>Schichten</div>
      <div><span>${fmtNum(Math.round(r.hours))}</span>Stunden</div>
      <div><span>${r.incs.length}</span>Einsätze</div>
      <div><span>${r.lights}</span>Blaulicht</div>
    </div>
    <p class="st-text st-q-score" hidden></p>
    <p class="st-text">Danke für deinen Einsatz ❤️</p>
    <div class="st-end-btns"><button type="button" class="st-again">Nochmal mischen 🔀</button><button type="button" class="st-done">Fertig</button></div>` };
  return [...head, ...body, tail];
}

let story = null;
function openStory(kind, year, month, full = false) {
  const period = reviewPeriod(kind, year, month);
  if (full) { period.full = true; period.label = 'All-Time komplett'; period.title += ' – komplett'; }
  const r = computeReview(period);
  if (!r) { toast('Für diesen Zeitraum ist nichts erfasst.', 'info'); return; }
  const slides = buildStorySlides(r);
  closeStory();
  const el = document.createElement('div');
  el.className = 'story';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', period.title);
  el.innerHTML = `<div class="st-progress">${slides.map(() => '<span><i></i></span>').join('')}</div>
    <div class="st-stage"></div>
    <div class="st-nav"><button type="button" class="st-prev">‹ Zurück</button><button type="button" class="st-close" aria-label="Schließen">✕</button><button type="button" class="st-next">Weiter ›</button></div>`;
  document.body.appendChild(el);
  story = { el, slides, i: 0, timer: 0, started: 0, elapsed: 0, paused: false, period };
  showStorySlide(0);
  bindStoryGestures(el);
  // Monatsrückblick gesehen → Hinweis auf Start ausblenden
  lsSet('etb_story_seen_' + period.label, '1');
}

function closeStory() {
  if (!story) return;
  clearTimeout(story.timer);
  const el = story.el;
  el.classList.add('closing');
  setTimeout(() => el.remove(), 250);
  story = null;
  if (activeTab === 'home') renderHome().catch(() => {});
}

function pick1(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** Hintergrund-Effekte einer Folie: Blaulicht-Blitzer, Konfetti, Emoji-Regen. */
function storyFxHtml(sl) {
  if (prefersReducedMotion()) return '';
  if (sl.fx === 'sosi') return '<div class="st-fx st-fx-sosi" aria-hidden="true"><i></i><i></i></div>';
  if (sl.fx === 'confetti') {
    const cols = ['#ffd60a', '#ff453a', '#64d2ff', '#30d158', '#bf5af2', '#fff'];
    return `<div class="st-fx" aria-hidden="true">${Array.from({ length: 42 }, (_, i) => `<i class="st-conf" style="left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.8).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg"></i>`).join('')}</div>`;
  }
  if (sl.rain) {
    return `<div class="st-fx" aria-hidden="true">${Array.from({ length: 16 }, () => `<i class="st-rain" style="left:${Math.random() * 96}%;font-size:${Math.round(18 + Math.random() * 22)}px;animation-delay:${(Math.random() * 4).toFixed(2)}s;animation-duration:${(3.5 + Math.random() * 3).toFixed(2)}s">${sl.rain}</i>`).join('')}</div>`;
  }
  return '';
}

/** Mini-Spiele in der Story. */
function initStoryGame(stage, sl) {
  const hint = stage.querySelector('.st-g-hint');
  // Läuft die Folie noch? (Spiele mit Zeitverzögerung dürfen nach dem Weiterblättern nichts mehr anfassen)
  const live = () => !!story && story.slides[story.i] === sl && stage.isConnected;
  const win = () => { if (live()) stage.insertAdjacentHTML('afterbegin', storyFxHtml({ fx: 'confetti' })); };
  const finish = () => {
    sl.played = true;
    const k = story ? story.slides.indexOf(sl) : -1;
    const bar = k >= 0 && story.el.querySelectorAll('.st-progress span')[k];
    if (bar) bar.classList.add('done');
  };

  if (sl.game === 'scratch') {
    const box = stage.querySelector('.st-scratch'), cv = box.querySelector('canvas');
    const after = stage.querySelector('.st-g-after');
    const reveal = () => { cv.classList.add('gone'); if (after) after.hidden = false; if (hint) hint.innerHTML = '<strong>Freigerubbelt! 🎉</strong>'; finish(); };
    if (sl.played) { reveal(); return; }
    requestAnimationFrame(() => {
      const w = box.clientWidth, h = box.clientHeight, dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr; cv.height = h * dpr;
      const c = cv.getContext('2d');
      c.scale(dpr, dpr);
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#d9d9de'); g.addColorStop(0.5, '#a9a9b2'); g.addColorStop(1, '#e8e8ec');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,.18)';
      for (let k = 0; k < 140; k++) c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      c.fillStyle = 'rgba(60,60,70,.75)'; c.font = '800 22px -apple-system, system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText('🚑  RUBBELN  🚑', w / 2, h / 2 + 8);
      c.globalCompositeOperation = 'destination-out';
      c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 44;
      let last = null, moves = 0, done = false;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const check = () => {
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        let clear = 0, n = 0;
        for (let k = 3; k < d.length; k += 4 * 97) { n++; if (d[k] < 40) clear++; }
        if (clear / n > 0.5 && !done) { done = true; reveal(); win(); }
      };
      cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); last = pos(e); cv.setPointerCapture(e.pointerId); c.beginPath(); c.arc(last[0], last[1], 22, 0, Math.PI * 2); c.fill(); });
      cv.addEventListener('pointermove', (e) => {
        if (!last || done) return;
        const p = pos(e);
        c.beginPath(); c.moveTo(last[0], last[1]); c.lineTo(p[0], p[1]); c.stroke();
        last = p;
        if (++moves % 12 === 0) check();
      });
      const up = () => { if (last) check(); last = null; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    });
    return;
  }

  if (sl.game === 'slot') {
    const { syms, prizes } = sl.data;
    const reels = [...stage.querySelectorAll('.st-strip')];
    const btn = stage.querySelector('.st-spin');
    const H = 84;
    let spinning = false;
    sl.spins = sl.spins || 0;
    const symFor = (key) => syms.find((x) => x.key === key) || syms[0];
    const rnd = () => syms[Math.floor(Math.random() * syms.length)];
    const fill = (strip, list) => { strip.innerHTML = list.map((x) => `<div class="st-sym">${x.html}</div>`).join(''); };
    const label = () => {
      const more = sl.spins < prizes.length;
      btn.textContent = sl.spins === 0 ? 'Drehen 🎰' : more ? `Nochmal – Platz ${sl.spins + 1}? 🎰` : 'Alle Gewinne abgeräumt 🏆';
      btn.disabled = !more;
    };
    // Startbild bzw. letztes Ergebnis
    const shown = sl.spins ? symFor(prizes[sl.spins - 1].key) : null;
    reels.forEach((rl) => { fill(rl, [shown || rnd()]); rl.style.transform = 'none'; });
    if (sl.spins) hint.innerHTML = prizes[sl.spins - 1].text;
    label();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (spinning || sl.spins >= prizes.length) return;
      spinning = true; btn.disabled = true;
      const prize = prizes[sl.spins];
      const target = symFor(prize.key);
      reels.forEach((rl, k) => {
        const n = 18 + k * 7;
        const list = Array.from({ length: n }, rnd);
        list.push(target);
        fill(rl, list);
        rl.style.transition = 'none'; rl.style.transform = 'translateY(0)';
        void rl.offsetWidth;
        rl.style.transition = `transform ${1.2 + k * 0.5}s cubic-bezier(.15,.7,.25,1)`;
        rl.style.transform = `translateY(${-n * H}px)`;
      });
      setTimeout(() => {
        spinning = false;
        sl.spins++;
        const box = stage.querySelector('.st-slot');
        if (box) { box.classList.remove('is-win'); void box.offsetWidth; box.classList.add('is-win'); }
        if (prize.rank === 1) win();
        hint.innerHTML = prize.text;
        finish();
        label();
      }, 2350);
    });
    return;
  }

  if (sl.game === 'memory') {
    const grid = stage.querySelector('.st-memory');
    if (!sl.deck) sl.deck = [...sl.data.syms, ...sl.data.syms].map((h, i) => ({ h, k: sl.data.syms.indexOf(h), i })).sort(() => Math.random() - 0.5);
    sl.found = sl.found || [];
    let open = [], moves = sl.moves || 0, busy = false;
    grid.innerHTML = sl.deck.map((c, i) => `<button type="button" class="st-mc${sl.found.includes(c.k) ? ' is-open is-done' : ''}" data-i="${i}" style="--i:${i}"><span class="st-mc-b">?</span><span class="st-mc-f">${c.h}</span></button>`).join('');
    const upd = () => { hint.innerHTML = sl.found.length === sl.data.syms.length ? `<strong>Alle Paare in ${moves} Zügen! ${moves <= 9 ? '🧠 Gedächtnis wie ein Elefant.' : moves <= 13 ? '👍 Solide.' : '☕ Mehr Kaffee!'}</strong>` : `Züge: ${moves}`; };
    upd();
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.st-mc');
      if (!b || busy || b.classList.contains('is-open')) return;
      e.stopPropagation();
      b.classList.add('is-open'); open.push(b);
      if (open.length < 2) return;
      moves++; sl.moves = moves;
      const [a, c] = open; open = [];
      const ka = sl.deck[+a.dataset.i].k, kc = sl.deck[+c.dataset.i].k;
      if (ka === kc) {
        a.classList.add('is-done'); c.classList.add('is-done'); sl.found.push(ka);
        if (sl.found.length === sl.data.syms.length) { win(); finish(); }
        upd();
      } else {
        busy = true; upd();
        setTimeout(() => { a.classList.remove('is-open'); c.classList.remove('is-open'); busy = false; }, 800);
      }
    });
    return;
  }

  if (sl.game === 'hilo') {
    const box = stage.querySelector('.st-hilo');
    const kws = sl.data.kws;
    const order = sl.order || (sl.order = [...kws].sort(() => Math.random() - 0.5).slice(0, 6));
    let round = sl.round || 0, score = sl.score || 0;
    const draw = () => {
      if (round >= order.length - 1) {
        box.innerHTML = `<div class="st-hilo-end"><div class="st-big st-big-sm">${score}/${order.length - 1}</div><p class="st-lead">richtig</p></div>`;
        hint.innerHTML = score === order.length - 1 ? '<strong>Perfekt! Du kennst deine Einsätze. 🏆</strong>' : score >= (order.length - 1) / 2 ? '<strong>Gar nicht schlecht! 👍</strong>' : '<strong>Das Tagebuch weiß es besser. 📓</strong>';
        finish(); return;
      }
      const [a, an] = order[round], [b] = order[round + 1];
      box.innerHTML = `<div class="st-hilo-card is-known"><b>${escHtml(a)}</b><span>${an}×</span></div>
        <div class="st-hilo-vs">Hattest du …</div>
        <div class="st-hilo-card is-new"><b>${escHtml(b)}</b><span class="st-hilo-q">?</span></div>
        <div class="st-hilo-btns"><button type="button" class="st-q" data-hl="up">▲ öfter</button><button type="button" class="st-q" data-hl="down">▼ seltener</button></div>`;
      hint.textContent = `Runde ${round + 1} von ${order.length - 1} · ${score} richtig`;
    };
    draw();
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hl]');
      if (!btn || box.classList.contains('busy')) return;
      e.stopPropagation();
      const an = order[round][1], bn = order[round + 1][1];
      const ok = bn === an || (btn.dataset.hl === 'up' ? bn > an : bn < an);
      box.classList.add('busy');
      const q = box.querySelector('.st-hilo-q'); q.textContent = bn + '×'; q.classList.add(ok ? 'ok' : 'no');
      btn.classList.add(ok ? 'is-ok' : 'is-no');
      if (ok) score++;
      sl.score = score;
      setTimeout(() => { round++; sl.round = round; box.classList.remove('busy'); draw(); }, 1100);
    });
    return;
  }

  if (sl.game === 'cpr') {
    const btn = stage.querySelector('.st-cpr'), v = btn.querySelector('.st-cpr-v');
    let taps = [];
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
      taps.push(now);
      btn.classList.remove('beat'); void btn.offsetWidth; btn.classList.add('beat');
      if (taps.length < 3) { v.textContent = `${taps.length} / 15`; return; }
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      const bpm = Math.round(60000 / iv);
      v.innerHTML = `${bpm}<small>/min · ${taps.length} / 15</small>`;
      btn.classList.toggle('is-good', bpm >= 100 && bpm <= 120);
      if (taps.length >= 15) {
        const q = bpm >= 100 && bpm <= 120 ? '<strong>Leitliniengerecht! 💪 Staying alive …</strong>' : bpm < 100 ? '<strong>Zu langsam 🐢</strong> – mehr Tempo, 100–120!' : '<strong>Zu schnell 🐇</strong> – nicht übertreiben!';
        hint.innerHTML = `${q}<br><span class="st-small">Nochmal tippen für einen neuen Versuch</span>`;
        if (bpm >= 100 && bpm <= 120) win();
        sl.best = bpm; finish(); taps = [];
      }
    });
    btn.addEventListener('click', (e) => e.stopPropagation());
    return;
  }

  if (sl.game === 'wheel') {
    const { segs, byKw } = sl.data;
    const wheel = stage.querySelector('.st-wheel'), btn = stage.querySelector('.st-spin'), res = stage.querySelector('.st-wheel-res');
    const cols = ['#ff453a', '#0a84ff', '#30d158', '#ffd60a', '#bf5af2', '#ff9f0a'];
    const n = segs.length, step = 360 / n;
    wheel.style.background = `conic-gradient(${segs.map((x, i) => `${cols[i % cols.length]} ${i * step}deg ${(i + 1) * step}deg`).join(',')})`;
    wheel.innerHTML = segs.map((x, i) => `<span class="st-wheel-l" style="transform:rotate(${i * step + step / 2}deg);--lr:${i * step + step / 2 < 180 ? -90 : 90}deg"><b>${escHtml(x.k.length > 14 ? x.k.slice(0, 13) + '…' : x.k)}</b></span>`).join('');
    let rot = sl.rot || 0, spinning = false;
    wheel.style.transform = `rotate(${rot}deg)`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (spinning) return;
      spinning = true; btn.disabled = true; res.innerHTML = '';
      // Stichwort nach Häufigkeit gewichtet
      let t = Math.random() * segs.reduce((a, x) => a + x.n, 0), idx = 0;
      for (let i = 0; i < n; i++) { t -= segs[i].n; if (t <= 0) { idx = i; break; } }
      const target = 360 - (idx * step + step / 2) + (Math.random() - 0.5) * step * 0.6;
      rot = rot - (rot % 360) + 360 * 5 + target;
      sl.rot = rot;
      wheel.style.transition = 'transform 3.2s cubic-bezier(.12,.7,.2,1)';
      wheel.style.transform = `rotate(${rot}deg)`;
      setTimeout(() => {
        spinning = false; btn.disabled = false; btn.textContent = 'Nochmal drehen 🎡';
        const kw = segs[idx].k;
        const x = pickRich(byKw[kw]);
        if (x) res.innerHTML = `<button type="button" class="st-fl st-wheel-hit" data-st-inc="${escHtml(x.inc.id)}" data-st-svc="${escHtml(x.svc.id)}"><small>${escHtml(kw)} · ${segs[idx].n}×</small><b>${escHtml(x.inc.alarmCode || 'Einsatz')}</b><span>${escHtml(sl.data.fmt(x))}${x.svc.vehicle ? ' · ' + escHtml(x.svc.vehicle) : ''} – antippen ›</span></button>`;
        const hitBtn = res.querySelector('[data-st-inc]');
        if (hitBtn) hitBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openStoryIncCard(hitBtn.dataset.stSvc, hitBtn.dataset.stInc); });
        hint.innerHTML = '<strong>Das Rad hat entschieden! 🎡</strong>';
        finish();
      }, 3300);
    });
    return;
  }

  if (sl.game === 'react') {
    const btn = stage.querySelector('.st-react'), t = btn.querySelector('.st-react-t');
    let st8 = 'idle', timer = 0, t0 = 0, best = sl.best || 0;
    const showBest = () => { hint.innerHTML = `Bestzeit: <strong>${best ? best + ' ms' : '–'}</strong>`; };
    showBest();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (st8 === 'idle' || st8 === 'result') {
        st8 = 'wait'; btn.className = 'st-react st-game is-wait'; t.textContent = 'Warten …';
        timer = setTimeout(() => { st8 = 'go'; btn.className = 'st-react st-game is-go'; t.textContent = 'JETZT!'; t0 = performance.now(); }, 1500 + Math.random() * 2500);
      } else if (st8 === 'wait') {
        clearTimeout(timer); st8 = 'result'; btn.className = 'st-react st-game is-early'; t.innerHTML = 'Fehlstart! 🚦<small>Nochmal tippen</small>';
      } else if (st8 === 'go') {
        const ms = Math.round(performance.now() - t0);
        st8 = 'result'; btn.className = 'st-react st-game is-done';
        const q = ms < 230 ? 'Schneller als die Leitstelle! ⚡' : ms < 320 ? 'Ausrückzeit: vorbildlich. 👍' : ms < 450 ? 'Solide – Kaffee schon ausgetrunken? ☕' : 'Noch im Bereitschaftsraum? 😴';
        t.innerHTML = `${ms} ms<small>${q}</small>`;
        if (!best || ms < best) { best = ms; sl.best = ms; if (ms < 320) win(); }
        showBest(); finish();
      }
    });
    return;
  }

  if (sl.game === 'guess') {
    const { n, max, unit } = sl.data;
    const track = stage.querySelector('.st-guess-track'), thumb = track.querySelector('.st-guess-thumb'), fillEl = track.querySelector('.st-guess-fill');
    const real = track.querySelector('.st-guess-real'), out = stage.querySelector('.st-guess-v'), ok = stage.querySelector('.st-guess-ok');
    let val = sl.val != null ? sl.val : Math.round(max / 2), locked = !!sl.played;
    const draw = () => { const f = val / max; thumb.style.left = f * 100 + '%'; fillEl.style.width = f * 100 + '%'; out.textContent = val; };
    const set = (e) => { const r = track.getBoundingClientRect(); val = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * max); draw(); };
    let drag = false;
    track.parentElement.addEventListener('pointerdown', (e) => { if (locked) return; e.stopPropagation(); drag = true; track.parentElement.setPointerCapture(e.pointerId); set(e); });
    track.parentElement.addEventListener('pointermove', (e) => { if (drag && !locked) set(e); });
    track.parentElement.addEventListener('pointerup', () => { drag = false; });
    const resolve = () => {
      locked = true; sl.played = true; sl.val = val; ok.disabled = true; ok.hidden = true;
      real.hidden = false; real.style.left = Math.min(100, (n / max) * 100) + '%';
      const dev = n ? Math.abs(val - n) / n : 1;
      out.innerHTML = `${val} <small>dein Tipp</small> · <span class="st-guess-n">${n}</span> <small>${escHtml(unit)}</small>`;
      hint.innerHTML = dev <= 0.05 ? '<strong>Volltreffer! 🎯</strong> Du kennst dich.' : dev <= 0.15 ? '<strong>Sehr nah dran! 👏</strong>' : dev <= 0.35 ? `<strong>Gar nicht schlecht.</strong> ${Math.round(dev * 100)} % daneben.` : `<strong>Uff – ${Math.round(dev * 100)} % daneben. 🙈</strong>`;
      if (dev <= 0.15) win();
      finish();
    };
    draw();
    if (locked) { resolve(); return; }
    ok.addEventListener('click', (e) => { e.stopPropagation(); resolve(); });
  }
}

/** Einsatz aus der Story als verspielte Karte über der Story – die Story bleibt offen. */
function openStoryIncCard(svcId, incId) {
  if (!story) return;
  const { svc, inc } = findIncident(svcId, incId);
  if (!svc || !inc) { toast('Einsatz nicht gefunden.', 'error'); return; }
  story.el.querySelectorAll('.st-card-ov').forEach((x) => x.remove());
  const d = parseLocalDt(svc.startAt);
  const ea = inc.einsatzart && EINSATZART_MAP.has(String(inc.einsatzart)) ? EINSATZART_MAP.get(String(inc.einsatzart)) : '';
  const kz = inc.statKz && STATKZ_MAP.has(String(inc.statKz)) ? STATKZ_MAP.get(String(inc.statKz)) : '';
  const p = inc.pzc || {};
  const dx = p.diag ? `${p.diag}${pzcDiagnosis(p.diag) ? ' – ' + pzcDiagnosis(p.diag) : ''}` : '';
  const hasNaca = inc.naca !== null && inc.naca !== undefined && inc.naca !== '';
  const icN = vehicleIconSrc(svc.vehicle), icS = vehicleIconSrc(svc.vehicle, true);
  const veh = icN ? `<div class="st-card-veh${inc.lights ? ' is-l' : ''}"><img class="st-vimg is-n" src="${escHtml(icN)}" alt="">${inc.lights && icS ? `<img class="st-vimg is-s" src="${escHtml(icS)}" alt="">` : ''}</div>` : `<div class="st-emoji">${inc.lights ? '🚨' : '🚑'}</div>`;
  const chips = [
    inc.lights ? '<span class="st-card-chip is-blue">🔵 Blaulicht</span>' : '<span class="st-card-chip">⚪ ohne Blaulicht</span>',
    hasNaca ? `<span class="st-card-chip"><span class="naca-badge naca-${escHtml(String(inc.naca))}">${escHtml(String(inc.naca))}</span> NACA</span>` : '',
    ea ? `<span class="st-card-chip">${escHtml(ea)}</span>` : '',
    kz ? `<span class="st-card-chip">${escHtml(kz)}</span>` : '',
    p.age ? `<span class="st-card-chip">👤 ${escHtml(String(p.age))} J.</span>` : '',
    inc.favorite ? '<span class="st-card-chip is-gold">★ Favorit</span>' : '',
  ].filter(Boolean).join('');
  const ov = document.createElement('div');
  ov.className = 'st-card-ov';
  ov.innerHTML = `<div class="st-card${inc.lights ? ' is-l' : ''}" role="dialog" aria-label="Einsatz">
      ${inc.lights ? storyFxHtml({ fx: 'sosi' }) : ''}
      <button type="button" class="st-card-x" aria-label="Zurück zur Story">✕</button>
      <div class="st-card-in">
        <div class="st-kicker">${d ? escHtml(d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) : 'Einsatz'}</div>
        ${veh}
        <h2 class="st-title st-card-t">${escHtml(inc.alarmCode || 'Einsatz')}</h2>
        <p class="st-text st-small">${escHtml(svc.vehicle || 'Dienst')}${svc.location ? ' · ' + escHtml(svc.location) : ''}</p>
        <div class="st-card-chips">${chips}</div>
        ${dx ? `<p class="st-text st-card-dx">🩺 ${escHtml(dx)}</p>` : ''}
        ${inc.note ? `<p class="st-quote">„${linkifyHtml(shortNote(inc.note))}“</p>` : ''}
        <div class="st-card-btns">
          <button type="button" class="st-card-b" data-card="inc">📋 Einsatz anzeigen</button>
          <button type="button" class="st-card-b" data-card="svc">🚑 Dienst anzeigen</button>
        </div>
      </div>
    </div>`;
  const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 220); };
  ov.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === ov || e.target.closest('.st-card-x')) { close(); return; }
    const b = e.target.closest('[data-card]');
    if (!b) return;
    if (b.dataset.card === 'inc') openIncidentView(svcId, incId);
    else openStoryServicePeek(svcId);
  });
  story.el.appendChild(ov);
}

/** Dienst als Popup über der Story. */
function openStoryServicePeek(svcId) {
  const svc = state.services.find((x) => x.id === svcId);
  const box = document.getElementById('svc-peek-body');
  if (!svc || !box) return;
  const icon = vehicleIconSrc(svc.vehicle);
  const incs = incidentsNewestFirst(svc.incidents || []);
  const crew = (svc.colleagues || []).filter(Boolean);
  document.getElementById('svc-peek-title').textContent = svc.vehicle || 'Dienst';
  box.innerHTML = `<div class="peek-head">
      ${icon ? `<img class="peek-veh" src="${escHtml(icon)}" alt="">` : ''}
      <div class="peek-head-t">${shiftCodeHtml(svc.startAt, 'is-small')}<strong>${escHtml(svcWhenText(svc))}</strong>${svc.location ? `<span>${escHtml(svc.location)}</span>` : ''}</div>
    </div>
    ${crew.length ? `<p class="peek-line">👥 ${escHtml(crew.join(' · '))}</p>` : ''}
    ${svc.note ? `<p class="peek-line peek-note">📝 ${linkifyHtml(svc.note)}</p>` : ''}
    <div class="peek-sub">${incs.length} ${incs.length === 1 ? 'Einsatz' : 'Einsätze'}${incs.filter((i) => i.lights).length ? ` · ${incs.filter((i) => i.lights).length} mit Blaulicht` : ''}</div>
    <div class="hm-list">${incs.map((i) => homeIncRowHtml(i, svc, false).replace('class="hm-row hm-inc"', 'class="hm-row hm-inc peek-inc"')).join('') || '<p class="peek-line">Keine Einsätze in diesem Dienst.</p>'}</div>
    <button type="button" class="btn-ghost peek-open">Im Tagebuch öffnen ›</button>`;
  box.querySelectorAll('.peek-inc').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openIncidentView(b.dataset.svcId, b.dataset.incId); }));
  box.querySelector('.peek-open').addEventListener('click', () => { closeDialog('dialog-svc-peek'); closeStory(); setTimeout(() => openServiceDetail(svcId), 260); });
  openDialog('dialog-svc-peek');
}

function showStorySlide(i) {
  if (!story) return;
  if (i < 0) i = 0;
  if (i >= story.slides.length) { closeStory(); return; }
  story.i = i;
  const sl = story.slides[i];
  const stage = story.el.querySelector('.st-stage');
  stage.className = 'st-stage ' + sl.bg;
  if (!sl.tr) sl.tr = 1 + Math.floor(Math.random() * 5);
  stage.innerHTML = `${storyFxHtml(sl)}<div class="st-slide st-tr-${sl.tr}">${sl.html}</div>`;
  story.el.querySelectorAll('.st-progress span').forEach((b, k) => {
    b.classList.toggle('done', k < i);
    b.classList.toggle('active', k === i);
    const bar = b.querySelector('i');
    bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
    bar.style.animationDuration = k === i ? (sl.ms || STORY_SLIDE_MS) + 'ms' : '';
  });
  // Zahlen hochzählen
  stage.querySelectorAll('[data-count]').forEach((n) => {
    const target = +n.dataset.count;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      n.textContent = fmtNum(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && story) requestAnimationFrame(step);
    };
    if (prefersReducedMotion()) n.textContent = fmtNum(target); else requestAnimationFrame(step);
  });
  const prev = story.el.querySelector('.st-prev'), next = story.el.querySelector('.st-next');
  if (prev) prev.disabled = i === 0;
  if (next) next.disabled = i === story.slides.length - 1;
  story.el.classList.toggle('is-interactive', !!(sl.game || sl.quiz));
  if (sl.game) initStoryGame(stage, sl);
  const done = stage.querySelector('.st-done');
  if (done) done.addEventListener('click', (e) => { e.stopPropagation(); closeStory(); });
  const again = stage.querySelector('.st-again');
  if (again) again.addEventListener('click', (e) => {
    e.stopPropagation();
    const per = story.period;
    openStory(per.kind, per.year, per.month, !!per.full);
  });
  stage.querySelectorAll('[data-quiz]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const box = b.closest('.st-quiz');
    if (box.classList.contains('answered')) return;
    box.classList.add('answered');
    b.classList.add('picked');
    const ok = b.dataset.quiz === '1';
    sl.answered = ok ? 'ok' : 'no';
    sl.picked = [...box.children].indexOf(b);
    const hint = stage.querySelector('.st-q-hint');
    if (hint) hint.innerHTML = `<strong>${ok ? pick1(['Richtig! 🎯', 'Volltreffer! 🎉', 'Genau so war’s! 👏', 'Du kennst dich aus! 🧠']) : pick1(['Knapp daneben! 😅', 'Leider nein. 🙈', 'Nope! Gut, dass es das Tagebuch gibt. 📓', 'Daneben! 🙃'])}</strong>`;
    const ans = stage.querySelector('.st-q-answer');
    if (ans) { ans.hidden = false; ans.innerHTML = (ok ? '' : 'Richtig wäre: ') + ans.innerHTML; }
    const em = stage.querySelector('.st-q-emoji');
    if (em) { em.textContent = ok ? '🥳' : '🫣'; em.style.animation = 'none'; void em.offsetWidth; em.style.animation = ''; }
    if (ok) stage.insertAdjacentHTML('afterbegin', storyFxHtml({ fx: 'confetti' }));
    // weiter nur über den Knopf
    const bar = story.el.querySelectorAll('.st-progress span')[story.i];
    if (bar) bar.classList.add('done');
  }));
  // schon beantwortete Frage (zurückgeblättert): Ergebnis direkt zeigen
  if (sl.quiz && sl.answered) {
    const box = stage.querySelector('.st-quiz');
    box.classList.add('answered');
    if (box.children[sl.picked]) box.children[sl.picked].classList.add('picked');
    const ans = stage.querySelector('.st-q-answer'); if (ans) ans.hidden = false;
    const hint = stage.querySelector('.st-q-hint'); if (hint) hint.hidden = true;
  }
  const score = stage.querySelector('.st-q-score');
  if (score) {
    const asked = story.slides.filter((x) => x.answered);
    if (asked.length) { score.hidden = false; const n = asked.filter((x) => x.answered === 'ok').length; score.innerHTML = `Quiz: <strong>${n} von ${asked.length}</strong> richtig ${n === asked.length ? '🧠' : n ? '👍' : '🙈'}`; }
  }
  stage.querySelectorAll('[data-st-inc]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openStoryIncCard(b.dataset.stSvc, b.dataset.stInc);
  }));
  story.elapsed = 0;
  scheduleStoryNext();
}

function scheduleStoryNext() {
  if (!story) return;
  clearTimeout(story.timer);
  story.started = Date.now();
  story.el.classList.remove('paused');
  if (story.i === story.slides.length - 1) return; // letzte Folie bleibt stehen
  const cur = story.slides[story.i];
  story.el.classList.toggle('is-quiz', !!(cur.quiz || cur.game));
  if (cur.quiz || cur.game) return; // Quiz und Spiele: weiter nur per Knopf
  // kein automatisches Weiterblättern – nur über die Knöpfe
}

function pauseStory() {
  if (!story || story.paused) return;
  story.paused = true;
  clearTimeout(story.timer);
  story.elapsed += Date.now() - story.started;
  story.el.classList.add('paused');
}

function resumeStory() {
  if (!story || !story.paused) return;
  story.paused = false;
  scheduleStoryNext();
}

function bindStoryGestures(el) {
  // Geblättert wird nur über die Knöpfe unten – Tippen oder Wischen auf der Folie schaltet nie weiter.
  el.querySelector('.st-close').addEventListener('click', (e) => { e.stopPropagation(); closeStory(); });
  el.querySelector('.st-prev').addEventListener('click', (e) => { e.stopPropagation(); if (story) showStorySlide(story.i - 1); });
  el.querySelector('.st-next').addEventListener('click', (e) => { e.stopPropagation(); if (story) showStorySlide(story.i + 1); });
  const onKey = (e) => {
    if (!story) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') closeStory();
    if (e.key === 'ArrowRight') showStorySlide(story.i + 1);
    if (e.key === 'ArrowLeft') showStorySlide(story.i - 1);
  };
  document.addEventListener('keydown', onKey);
}

/** Einstieg in der Statistik: Jahreskarte + Monate als Kacheln. */
function reviewsEntryHtml() {
  const months = reviewMonthsWithData();
  if (!months.length) return '';
  const now = new Date();
  const years = reviewYearsWithData();
  const y = years.includes(now.getFullYear()) ? now.getFullYear() : years[0];
  const [my, mm] = months.find(([yy, m]) => yy === now.getFullYear() && m === now.getMonth()) || months[0];
  const more = months.length > 1 || years.length > 1;
  return `<section class="rv-entry">
    <div class="rv-years">
      <button type="button" class="rv-year" data-story="year" data-y="${y}">
        <span class="rv-year-k">Jahr</span><span class="rv-year-t">${y}</span><span class="rv-play" aria-hidden="true">▶</span></button>
      <button type="button" class="rv-year is-month" data-story="month" data-y="${my}" data-m="${mm}">
        <span class="rv-year-k">Monat</span><span class="rv-year-t">${MONTHS_DE[mm]}</span><span class="rv-play" aria-hidden="true">▶</span></button>
    </div>
    <div class="rv-row">
      <button type="button" class="rv-all rv-alltime" data-story="all"><span aria-hidden="true">∞</span> All-Time</button>
      ${more ? '<button type="button" class="rv-all" data-rv-all>Alle Rückblicke <span aria-hidden="true">›</span></button>' : ''}
    </div>
  </section>`;
}

/** Popup mit allen Jahres- und Monatsrückblicken. */
function openReviewsDialog() {
  const box = document.getElementById('reviews-body');
  if (!box) return;
  const months = reviewMonthsWithData();
  box.innerHTML = `<div class="rv-group-allrow"><button type="button" class="rv-group-year rv-group-all" data-story="all" data-full="0"><span>🔀 All-Time gemischt</span><span class="rv-play" aria-hidden="true">▶</span></button>
    <button type="button" class="rv-group-year rv-group-all is-full" data-story="all" data-full="1"><span>∞ All-Time komplett</span><span class="rv-play" aria-hidden="true">▶</span></button></div>` + reviewYearsWithData().map((y) => `<div class="rv-group">
    <button type="button" class="rv-group-year" data-story="year" data-y="${y}"><span>Jahresrückblick ${y}</span><span class="rv-play" aria-hidden="true">▶</span></button>
    <div class="rv-group-months">${months.filter(([yy]) => yy === y).sort((a, b) => a[1] - b[1]).map(([yy, m]) =>
      `<button type="button" class="rv-month" data-story="month" data-y="${yy}" data-m="${m}"><span>${MONTHS_DE[m].slice(0, 3)}</span></button>`).join('')}</div>
  </div>`).join('');
  openDialog('dialog-reviews');
}

/** Hinweis auf Start: zu Monatsbeginn der Vormonat, zum Jahreswechsel das Jahr. */
function storyBannerHtml(now) {
  const d = now.getDate(), m = now.getMonth(), y = now.getFullYear();
  let kind = null, yy, mm;
  if ((m === 11 && d >= 15) || (m === 0 && d <= 31)) { kind = 'year'; yy = m === 11 ? y : y - 1; }
  if (!kind && d <= 10) { kind = 'month'; yy = m === 0 ? y - 1 : y; mm = (m + 11) % 12; }
  if (!kind) return '';
  const period = reviewPeriod(kind, yy, mm);
  if (lsGet('etb_story_seen_' + period.label) || !servicesInRange(period.from, period.to).length) return '';
  return `<button type="button" class="rv-banner" data-story="${kind}" data-y="${yy}" ${kind === 'month' ? `data-m="${mm}"` : ''}>
    <span class="rv-banner-emoji" aria-hidden="true">✨</span>
    <span class="rv-banner-text"><strong>${kind === 'year' ? `Dein Dienstjahr ${yy}` : `Dein ${MONTHS_DE[mm]}-Rückblick`}</strong><span>ist da – jetzt ansehen</span></span>
    <span class="rv-play" aria-hidden="true">▶</span>
  </button>`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-story]');
  if (!b) {
    if (e.target.closest && e.target.closest('[data-rv-all]')) openReviewsDialog();
    return;
  }
  const dlg = document.getElementById('dialog-reviews');
  if (dlg && dlg.contains(b)) closeDialog('dialog-reviews');
  if (b.dataset.story === 'all' && b.dataset.full === undefined && !(dlg && dlg.contains(b))) {
    showActionSheet({ title: 'All-Time-Rückblick', actions: [
      { icon: '🔀', label: 'Gemischt', sub: 'eine zufällige Auswahl der Module', run: () => openStory('all') },
      { icon: '∞', label: 'Komplett', sub: 'wirklich alle Module, Quizfragen und Spiele', run: () => openStory('all', undefined, undefined, true) },
    ] });
    return;
  }
  openStory(b.dataset.story, +b.dataset.y, b.dataset.m !== undefined ? +b.dataset.m : undefined, b.dataset.full === '1');
});

// ── Datei speichern: auf iPhone/iPad über das Teilen-Menü ─────────────────
// (In Dateien sichern, iCloud Drive, AirDrop …); sonst normaler Download.
// Liefert true, wenn gespeichert/geteilt wurde, false bei Abbruch.
async function saveFile(blob, filename, title) {
  try {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.share && (isIOSDevice() || isMobile()) && navigator.canShare({ files: [file] })) {
      // Nur die Datei teilen: Ein mitgegebener Titel/Text landet bei „In Dateien
      // sichern“ sonst als zusätzliche text.txt.
      await navigator.share({ files: [file] });
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
  updateQuickBell();

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
  updateDpInboxBadge();
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
  const headActions = document.getElementById('dp-head-actions');
  if (headActions) headActions.hidden = false; // Tagesdienstplan geht auch ohne Kalender
  ['btn-dp-reload', 'btn-dp-inbox'].forEach((id) => { const b = document.getElementById(id); if (b) b.hidden = !dpConfigured(); });
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
  updateDpInboxBadge();
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
  container.innerHTML = '';
  updateDpInboxBadge();
  for (const dayShifts of groups.values()) {
    const group = document.createElement('div');
    group.className = 'dp-day-group';
    group.innerHTML = `<h3 class="dp-day-heading">${escHtml(dpFormatDayHeading(dayShifts[0].start))}</h3>`;
    for (const s of dayShifts) {
      const saved = findSavedServiceForShift(s);
      const savedChange = saved ? pendingPlanChange(saved) : null;
      const dpLink = (saved && dienstplanUrl(saved)) || dienstplanUrl({ location: s.location || '', startAt: localDtStr(new Date(s.start)) });
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
  return (p.colleagues.length ? `<div class="dp-shift-meta is-crew">👥 ${p.colleagues.map(escHtml).join(' · ')}</div>` : '')
    + (p.note ? `<div class="dp-shift-meta is-note">ℹ️ ${escHtml(p.note).replace(/\n/g, ' · ')}</div>` : '');
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

// ── Tagesdienstplan nachsehen: Dienststelle + Kalender ─────────────────────
function tdpUrl(deptId, dateStr) {
  return `https://dienstplan.st.roteskreuz.at/Home/Dienstplan/${dateStr}-00000000-0000-0000-0000-000000000000-${deptId}`;
}
let tdpMonth = null; // erster Tag des angezeigten Monats
/** Alle Dienststellen mit ID (auch mehrere Schreibweisen mit gleicher ID). */
function tdpDepts() {
  return (state.dienststellen || []).filter((d) => d.deptId).slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
/** Tage mit eigenem Dienst (Tagebuch ohne SEG + Dienstplan), als „YYYY-MM-DD“ → Dienststellen-IDs. */
function tdpDutyDays() {
  const days = new Map();
  const add = (d, loc) => {
    if (!d || isNaN(d)) return;
    const k = localDateStr(d);
    const abt = findAbteilung({ location: loc || '' });
    if (!days.has(k)) days.set(k, new Set());
    if (abt && abt.deptId) days.get(k).add(abt.deptId);
  };
  state.services.filter((s) => !s.isSeg).forEach((s) => add(parseLocalDt(s.startAt), s.location));
  const cache = readIcsCache();
  ((cache && cache.shifts) || []).forEach((x) => add(new Date(x.start), x.location));
  return days;
}
function openTdpPopup() {
  const now = new Date();
  tdpMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  renderTdpPopup();
  openDialog('dialog-tdp');
}
function renderTdpPopup() {
  const box = document.getElementById('tdp-body');
  if (!box) return;
  const depts = tdpDepts();
  if (!depts.length) {
    box.innerHTML = `<div class="list-empty"><div class="list-empty-icon">🏢</div><strong>Keine Dienststelle mit ID</strong><span>Unter Einstellungen → Dienststellen eine Dienststelle mit Dienstplan-ID anlegen.</span></div>
      <button type="button" class="btn-secondary" id="tdp-to-settings">Dienststellen öffnen</button>`;
    box.querySelector('#tdp-to-settings').onclick = () => { closeDialog('dialog-tdp'); setTimeout(openAbteilungenPopup, 250); };
    return;
  }
  // Vorauswahl: zuletzt gewählt, sonst Dienststelle des laufenden/nächsten Dienstes
  // Auswahl über den Namen merken (gleiche ID kann mehrfach vorkommen)
  let selName = lsGet('etb_tdp_dept');
  if (!depts.some((d) => d.name === selName)) {
    const svc = runningService() || state.services.filter((s) => !s.isSeg && parseLocalDt(s.startAt) > new Date()).sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    const abt = svc && findAbteilung(svc);
    selName = abt && abt.deptId && depts.some((d) => d.name === abt.name) ? abt.name : depts[0].name;
  }
  const sel = depts.find((d) => d.name === selName).deptId;
  const duty = tdpDutyDays();
  const m = tdpMonth, y = m.getFullYear(), mo = m.getMonth();
  const first = (new Date(y, mo, 1).getDay() + 6) % 7; // Montag zuerst
  const nDays = new Date(y, mo + 1, 0).getDate();
  const today = localDateStr(new Date());
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span class="tdp-day is-empty"></span>';
  for (let d = 1; d <= nDays; d++) {
    const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const set = duty.get(ds);
    const cls = ['tdp-day', set ? 'is-duty' : '', set && set.has(sel) ? 'is-here' : '', ds === today ? 'is-today' : ''].filter(Boolean).join(' ');
    cells += `<a class="${cls}" ${dpLinkAttrs(tdpUrl(sel, ds))} aria-label="Tagesdienstplan ${d}.${mo + 1}.${y}${set ? ' (Dienst)' : ''}">${d}</a>`;
  }
  // immer 6 Wochen zeigen, damit das Fenster beim Blättern gleich hoch bleibt
  for (let i = first + nDays; i < 42; i++) cells += '<span class="tdp-day is-empty"></span>';
  box.innerHTML = `<label class="tdp-dept"><span>Dienststelle</span>
      <select id="tdp-dept">${depts.map((d) => `<option value="${escHtml(d.name)}"${d.name === selName ? ' selected' : ''}>${escHtml(d.name)}</option>`).join('')}</select></label>
    <div class="tdp-cal">
      <div class="tdp-head">
        <button type="button" class="tdp-nav" data-tdp-m="-1" aria-label="Voriger Monat">‹</button>
        <strong>${m.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })}</strong>
        <button type="button" class="tdp-nav" data-tdp-m="1" aria-label="Nächster Monat">›</button>
      </div>
      <div class="tdp-grid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<span class="tdp-wd">${w}</span>`).join('')}${cells}</div>
    </div>
    <p class="tdp-legend"><span class="tdp-dot"></span> eigener Dienst · Tag antippen öffnet den Tagesdienstplan</p>
    <button type="button" class="btn-ghost tdp-today" id="tdp-today">Heute</button>`;
  box.querySelector('#tdp-dept').onchange = (e) => { lsSet('etb_tdp_dept', e.target.value); renderTdpPopup(); };
  box.querySelectorAll('[data-tdp-m]').forEach((b) => b.addEventListener('click', () => { tdpMonth = new Date(y, mo + +b.dataset.tdpM, 1); renderTdpPopup(); }));
  box.querySelector('#tdp-today').onclick = () => { const n = new Date(); tdpMonth = new Date(n.getFullYear(), n.getMonth(), 1); renderTdpPopup(); };
  box.querySelectorAll('a.tdp-day').forEach((a) => a.addEventListener('click', () => lsSet('etb_tdp_dept', selName)));
}
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#btn-tdp')) openTdpPopup(); });

function initDpButtons() {
  const inboxBtn = document.getElementById('btn-dp-inbox');
  if (inboxBtn && !inboxBtn._bound) {
    inboxBtn._bound = true;
    inboxBtn.addEventListener('click', openDpInbox);
    document.getElementById('btn-dp-inbox-readall').addEventListener('click', dpInboxMarkAllRead);
  }
  const reloadBtn = document.getElementById('btn-dp-reload');
  if (reloadBtn && !reloadBtn._bound) {
    reloadBtn._bound = true;
    reloadBtn.addEventListener('click', async () => {
      if (reloadBtn.dataset.busy) return;
      reloadBtn.dataset.busy = '1';
      reloadBtn.classList.add('is-busy');
      try { await refreshDienstplanTab(); } finally { delete reloadBtn.dataset.busy; reloadBtn.classList.remove('is-busy'); }
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

async function workerApi(path, { method = 'GET', body, keepalive = false } = {}) {
  const base = workerBase();
  if (!base || !dpConfigured()) throw new Error('Dienstplan ist nicht verbunden.');
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + dpConfig().token }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      keepalive,
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

// ── Schnell-Einsatz per Mitteilung ─────────────────────────────────────────
// Läuft ein Dienst, liegt eine Mitteilung „Neuer Einsatz?“ bereit. Antippen öffnet
// „Neuer Einsatz“; beim Verlassen der App wird sie neu verschickt. Dienstplan-
// Dienste meldet zusätzlich der Worker kurz nach Dienstbeginn.
const QUICK_PUSH_KEY = 'etb_quick_push';
const QUICK_SOUND_KEY = 'etb_quick_sound';
function quickPushEnabled() { return lsGet(QUICK_PUSH_KEY) !== '0'; }
function quickPushSilent() { return true; } // „Neuer Einsatz?“ kommt immer ohne Ton/Vibration
// Früher mit Ton eingestellt? Einmalig beim Worker auf lautlos umstellen.
setTimeout(() => {
  if (lsGet(QUICK_SOUND_KEY) !== '1') return;
  const endpoint = lsGet(PUSH_ENDPOINT_KEY);
  if (!endpoint || !dpConfigured()) { lsSet(QUICK_SOUND_KEY, '0'); return; }
  workerApi('/push/quick', { method: 'POST', body: { endpoint, sound: false } }).then(() => lsSet(QUICK_SOUND_KEY, '0')).catch(() => {});
}, 4000);
async function quickNotifications() {
  try { const reg = await navigator.serviceWorker.getRegistration(); return reg && reg.getNotifications ? await reg.getNotifications({ tag: 'etb-quick' }) : []; } catch (_) { return []; }
}
/** Liegt keine „Neuer Einsatz?“-Mitteilung bereit, eine anzeigen (lokal, ohne Server). */
/** Zum Ausprobieren: Schnell-Einsatz-Mitteilung sofort zeigen (2 Minuten gültig). */
async function quickPushTest() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('Service Worker nicht bereit – App neu laden.');
  (await quickNotifications()).forEach((n) => n.close());
  const silent = quickPushSilent();
  await reg.showNotification('🚑 Neuer Einsatz? (Test)', {
    body: silent ? 'Diese Mitteilung sollte ohne Ton/Vibration kommen.' : 'Diese Mitteilung kommt mit Ton.',
    tag: 'etb-quick', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    silent, data: { url: './#neu-einsatz-push', until: Date.now() + 2 * 60e3, silent },
  });
}

async function quickPushArm(force = false) {
  if ((!quickPushEnabled() && !force) || typeof Notification === 'undefined' || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return false;
  const svc = runningService();
  const shown = await quickNotifications();
  if (!svc) { shown.forEach((n) => n.close()); return false; } // Dienst vorbei → aufräumen
  if (shown.length && !force) return true;
  shown.forEach((n) => n.close());
  const end = parseLocalDt(svc.endAt);
  const until = end ? end.getTime() : Date.now() + 3600e3;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification('🚑 Neuer Einsatz?', {
        body: `${svc.vehicle ? svc.vehicle + ' · ' : ''}Tippen, um einen Einsatz einzutragen.`,
        tag: 'etb-quick', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
        silent: quickPushSilent(), data: { url: './#neu-einsatz-push', until, silent: quickPushSilent() },
      });
      return true;
    }
  } catch (_) {}
  // Rückfall: über den Worker schicken
  const endpoint = lsGet(PUSH_ENDPOINT_KEY);
  if (endpoint && dpConfigured()) { workerApi('/push/quick', { method: 'POST', keepalive: true, body: { endpoint, send: { title: svc.vehicle || 'Dienst', until } } }).catch(() => {}); return true; }
  return false;
}

async function setQuickPushEnabled(on) {
  lsSet(QUICK_PUSH_KEY, on ? '1' : '0');
  if (!on) (await quickNotifications()).forEach((n) => n.close());
  updateQuickBell();
  const endpoint = lsGet(PUSH_ENDPOINT_KEY);
  if (endpoint && dpConfigured()) workerApi('/push/quick', { method: 'POST', body: { endpoint, enabled: on, sound: false } }).catch(() => {});
}
async function setQuickPushSilent(silent) {
  lsSet(QUICK_SOUND_KEY, silent ? '0' : '1');
  (await quickNotifications()).forEach((n) => n.close());
  const endpoint = lsGet(PUSH_ENDPOINT_KEY);
  if (endpoint && dpConfigured()) workerApi('/push/quick', { method: 'POST', body: { endpoint, sound: !silent } }).catch(() => {});
}
function updateQuickBell() {
  // Glocke ersetzt durch das Postfach (Schnell-Nachricht-Einstellungen stehen dort)
  if (document.getElementById('dialog-dp-inbox')?.style.display === 'flex') renderInboxQuick();
}
/** Postfach oben: Verweis auf Einstellungen → Benachrichtigungen. */
function renderInboxQuick() {
  const box = document.getElementById('inbox-quick');
  if (!box) return;
  box.innerHTML = `<button type="button" class="iq-link" id="iq-settings"><span class="iq-ic">🔔</span><span class="iq-t"><b>Benachrichtigungen</b><small>„Neuer Einsatz?“ ${quickPushEnabled() ? 'an' : 'aus'} · Dienstplan-Änderungen</small></span><span class="set-row-chev">›</span></button>`;
  box.querySelector('#iq-settings').onclick = () => {
    closeDialog('dialog-dp-inbox');
    setTimeout(() => { switchTab('einstellungen'); if (settingsSub !== 'benachrichtigungen') openSettingsPage('benachrichtigungen'); }, 200);
  };
}
/** Glocke neben „Start“: Schnell-Nachrichten steuern und für den laufenden Dienst auslösen. */
function openQuickBellSheet() {
  const svc = runningService();
  const on = quickPushEnabled(), silent = quickPushSilent();
  showActionSheet({
    title: 'Schnell-Nachricht „Neuer Einsatz?“',
    message: svc ? `Laufender Dienst: ${svc.vehicle || 'Dienst'}` : 'Gerade läuft kein Dienst.',
    actions: [
      ...(svc ? [{ icon: '🔔', label: 'Jetzt bereitlegen', sub: 'Mitteilung im Sperrbildschirm', run: () => quickPushManual() }] : []),
      { icon: on ? '🔕' : '🔔', label: on ? 'Schnell-Nachrichten ausschalten' : 'Schnell-Nachrichten einschalten', sub: on ? 'Keine automatischen Mitteilungen im Dienst' : 'Im Dienst liegt immer eine Mitteilung bereit', run: () => { setQuickPushEnabled(!on); toast(on ? 'Schnell-Nachrichten aus.' : 'Schnell-Nachrichten an.', 'success', 1500); } },
    ],
  });
}

/** Mitteilung jetzt bereitlegen. */
async function quickPushManual() {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) { toast('Mitteilungen werden auf diesem Gerät nicht unterstützt.', 'error'); return; }
  if (Notification.permission !== 'granted') {
    const r = await Notification.requestPermission().catch(() => 'denied');
    if (r !== 'granted') { toast('Mitteilungen sind nicht erlaubt (iOS-Einstellungen → Mitteilungen).', 'error', 5000); return; }
  }
  const ok = await quickPushArm(true);
  if (!ok) toast('Gerade läuft kein Dienst.', 'info', 3000); // bei Erfolg sieht man die Mitteilung ohnehin
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('#btn-home-inbox');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  initDpButtons();
  openDpInbox();
});

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
  // Schnell-Nachricht beim Worker: Stand übernehmen, immer lautlos
  workerApi('/push/quick', { method: 'POST', body: { endpoint: sub.endpoint, enabled: quickPushEnabled(), sound: false } }).catch(() => {});
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
  if (!dpConfigured()) { host.innerHTML = '<div class="set-group-header">Dienstplan-Änderungen</div><div class="set-group"><button type="button" class="set-row" data-push-dp><span class="set-row-text"><span class="set-row-title">Dienstplan verbinden</span><span class="set-row-sub">Mitteilungen bei neuen, geänderten und ausgefallenen Diensten gibt es mit verbundenem Dienstplan.</span></span></button></div>'; host.querySelector('[data-push-dp]').onclick = () => { closeSettingsPage(); setTimeout(() => openSettingsPage('dienstplan'), 50); }; return; }
  const sup = pushSupport();
  const sub = await currentPushSubscription();
  const active = !!(sub && lsGet(PUSH_ENDPOINT_KEY) === sub.endpoint && Notification.permission === 'granted');
  host.innerHTML = `
    <div class="set-group-header">Dienstplan-Änderungen</div>
    <div class="set-group">
      ${active
        ? `<div class="set-row"><span class="set-row-text"><span class="set-row-title">Aktiv auf diesem Gerät</span><span class="set-row-sub" id="push-status">Status wird geladen…</span></span></div>
           <button type="button" class="set-row set-action" id="btn-push-test"><span class="set-row-text"><span class="set-row-title">Testmitteilung senden</span><span class="set-row-sub">Wie eine Dienstplan-Änderung – mit Ton</span></span></button>
           <button type="button" class="set-row set-action" id="btn-push-quicktest"><span class="set-row-text"><span class="set-row-title">Schnell-Einsatz testen</span><span class="set-row-sub">Kommt nach 8 Sekunden lautlos – iPhone gleich sperren</span></span></button>
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
  const qt = host.querySelector('#btn-push-quicktest');
  if (qt) qt.addEventListener('click', async () => {
    qt.disabled = true;
    try {
      await workerApi('/push/quick', { method: 'POST', body: { endpoint: sub.endpoint, test: true, delay: 8, send: { title: 'Test', until: Date.now() + 2 * 60e3 } } });
      toast('Kommt in 8 Sekunden – jetzt iPhone sperren.', 'info', 6000);
    } catch (err) {
      // älterer Worker: sofort lokal zeigen
      quickPushTest().then(() => toast('Test-Mitteilung angezeigt (Worker kann noch nicht verzögern).', 'info', 5000)).catch((e2) => toast(e2.message, 'error', 5000));
    }
    setTimeout(() => { qt.disabled = false; }, 8000);
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
    updateDpInboxBadge();
    return entry;
  } catch (_) { return readDpChanges(); }
}

/** „Ausfall“ eines bereits begonnenen Dienstes = Eintrag zu Dienstende entfernt, keine echte Änderung. */
function isEndOfShiftRemoval(c) {
  return c && c.type === 'removed' && c.before && c.before.s <= c.at;
}

function recentDpChanges() {
  const c = readDpChanges();
  if (!c) return [];
  const since = Date.now() - DP_CHANGES_DAYS * 86400000;
  return c.changes.filter((x) => x.at >= since && !isEndOfShiftRemoval(x));
}

/** Markierung für eine Dienstkarte: jüngste Änderung zu dieser UID. */
function dpChangeFor(shift, changes) {
  const st = new Date(shift.start).getTime();
  return changes.find((c) => c.type !== 'removed' && c.now && ((shift.uid && c.uid === shift.uid) || c.now.s === st) && isDpChangeUnread(c)) || null;
}

// — Postfach „Änderungen“: je Dienst eine Zeile, gelesen/ungelesen ———————————
const DP_READ_KEY = 'etb_dp_read';

function readDpRead() {
  try { const r = JSON.parse(lsGet(DP_READ_KEY, 'null')); return r && typeof r === 'object' ? r : {}; } catch (_) { return {}; }
}
function saveDpRead(r) {
  // nur Einträge der letzten Wochen behalten
  const since = Date.now() - 30 * 86400000;
  const out = {};
  Object.entries(r).forEach(([k, v]) => { if (v > since) out[k] = v; });
  lsSet(DP_READ_KEY, JSON.stringify(out));
}

/** Änderungen desselben Termins zusammenfassen (neueste zuerst). */
function groupDpChanges(changes) {
  const groups = new Map();
  for (const c of changes) {
    const k = c.key || c.uid;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const read = readDpRead();
  return [...groups.entries()].map(([key, list]) => {
    list.sort((x, y) => y.at - x.at);
    const latest = list[0], oldest = list[list.length - 1];
    const type = latest.type === 'removed' ? 'removed' : list.some((c) => c.type === 'added') ? 'added' : 'updated';
    const x = latest.now || latest.before;
    const first = oldest.before;
    const moved = type === 'updated' && first && x && (first.s !== x.s || first.e !== x.e);
    const unread = latest.at > (read[key] || 0);
    return { key, list, latest, type, x, first, moved, unread };
  }).sort((p, q) => q.latest.at - p.latest.at);
}

function dpUnreadCount() {
  return groupDpChanges(recentDpChanges()).filter((g) => g.unread).length;
}

function isDpChangeUnread(c) {
  return c.at > (readDpRead()[c.key || c.uid] || 0);
}

function markDpRead(keys) {
  const r = readDpRead();
  const now = Date.now();
  keys.forEach((k) => { r[k] = now; });
  saveDpRead(r);
  updateDpInboxBadge();
  // Markierungen auf den Dienstkarten gleich mit aktualisieren
  const cache = readIcsCache(), box = document.getElementById('dienstplan-container');
  if (cache && box && activeTab === 'dienstplan') renderDpShifts(cache.shifts, box);
}

function updateDpInboxBadge() {
  const n = dpConfigured() ? dpUnreadCount() : 0;
  ['dp-inbox-badge', 'home-inbox-badge'].forEach((id) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = !n;
  });
  ['btn-dp-inbox', 'btn-home-inbox'].forEach((id) => { const btn = document.getElementById(id); if (btn) btn.setAttribute('aria-label', n ? `Postfach (${n} ungelesen)` : 'Postfach'); });
  syncAppBadge(dpConfigured() ? groupDpChanges(recentDpChanges()).filter((g) => g.unread).map((g) => g.key) : []);
}

// ── Zahl am App-Symbol (ungelesene Dienstplan-Änderungen) ─────────────────
// Die App schreibt die ungelesenen Dienste in einen kleinen Cache-Eintrag;
// der Service Worker zählt bei eingehenden Mitteilungen dort weiter.
const BADGE_CACHE = 'etb-meta';
let lastBadgeSig = '';
async function syncAppBadge(keys) {
  const sig = keys.slice().sort().join('|');
  if (sig === lastBadgeSig) return;
  lastBadgeSig = sig;
  try {
    if ('caches' in window) {
      const c = await caches.open(BADGE_CACHE);
      await c.put('./__badge', new Response(JSON.stringify({ keys, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
    }
    if (navigator.setAppBadge) {
      if (keys.length) await navigator.setAppBadge(keys.length);
      else if (navigator.clearAppBadge) await navigator.clearAppBadge();
    }
  } catch (_) { /* Badge ist nur ein Zusatz */ }
}

function dpInboxRowsHtml(items) {
  const meta = { added: ['＋', 'Neu'], updated: ['✎', 'Geändert'], removed: ['✕', 'Ausfall'] };
  const now = new Date();
  const range = (x) => `${formatTimeHM(new Date(x.s))}–${formatTimeHM(new Date(x.e))}`;
  return items.map(({ key, list, latest, type, x, first, moved, unread }) => {
    const [ic, lbl] = meta[type] || meta.updated;
    const s = new Date(x.s);
    const title = [x.t || 'Dienst', x.l].filter(Boolean).join(' · ');
    const old = moved && first ? `vorher ${localDateStr(new Date(first.s)) === localDateStr(s) ? '' : homeDayLabel(new Date(first.s), now) + ' '}${range(first)}` : '';
    const n = list.length;
    return `<button type="button" class="ib-row is-${type}${unread ? ' is-unread' : ''}" data-inbox-key="${escHtml(key)}" aria-label="${escHtml(lbl + ': ' + title)}${unread ? ' (ungelesen)' : ''}">
      <span class="ib-ic" aria-hidden="true">${ic}</span>
      <span class="ib-main">
        <span class="ib-title">${escHtml(title)}</span>
        <span class="ib-when"><span class="ib-type">${lbl}</span> · ${escHtml(homeDayLabel(s, now))} · ${escHtml(range(x))}</span>
        ${old ? `<span class="ib-old">${escHtml(old)}</span>` : ''}
      </span>
      <span class="ib-side">
        <span class="ib-at">${escHtml(homeDayLabel(new Date(latest.at), now))}</span>
        ${n > 1 ? `<span class="ib-n">${n}×</span>` : ''}
        ${unread ? '<span class="ib-dot" aria-hidden="true"></span>' : ''}
      </span>
    </button>`;
  }).join('');
}

function renderDpInbox() {
  const body = document.getElementById('dp-inbox-body');
  if (!body) return;
  const items = groupDpChanges(recentDpChanges());
  const unread = items.filter((g) => g.unread).length;
  document.getElementById('btn-dp-inbox-readall').disabled = !unread;
  body.innerHTML = items.length
    ? (() => {
      const fresh = items.filter((g) => g.unread), seen = items.filter((g) => !g.unread);
      const sec = (hd, list) => list.length ? `<div class="ib-hd">${hd}</div><div class="ib-list">${dpInboxRowsHtml(list)}</div>` : '';
      return sec(`Ungelesen · ${fresh.length}`, fresh) + sec(fresh.length ? 'Gelesen' : `Letzte ${DP_CHANGES_DAYS} Tage`, seen);
    })()
    : `<div class="list-empty"><div class="list-empty-icon">📭</div><strong>Keine Änderungen</strong><span>${dpConfigured() ? 'In den letzten 7 Tagen hat sich im Dienstplan nichts geändert.' : 'Der Dienstplan ist nicht verbunden – Änderungen erscheinen hier, sobald er in den Einstellungen verbunden ist.'}</span></div>`;
  body.querySelectorAll('[data-inbox-key]').forEach((row) => row.addEventListener('click', () => {
    const key = row.dataset.inboxKey;
    markDpRead([key]);
    row.classList.remove('is-unread');
    renderDpInbox();
    openHistorySheet(key);
  }));
}

function openDpInbox() {
  updateDpInboxBadge();
  renderInboxQuick();
  renderDpInbox();
  openDialog('dialog-dp-inbox');
}

function dpInboxMarkAllRead() {
  markDpRead(groupDpChanges(recentDpChanges()).map((g) => g.key));
  renderDpInbox();
  toast('Alle Änderungen als gelesen markiert.', 'success', 1800);
}

// — Verlauf pro Dienst (wie „Verlauf“ in der Dienstplan-App) ——————————————
const DP_HISTORY_KEY = 'etb_dp_history';

function readDpHistory() {
  let h = {};
  try { const x = JSON.parse(lsGet(DP_HISTORY_KEY, 'null')); h = x && x.history && typeof x.history === 'object' ? x.history : {}; } catch (_) { return {}; }
  // ältere Einträge „Ausfall zu Dienstende“ (vor der Korrektur im Worker) ausblenden
  const out = {};
  for (const [k, item] of Object.entries(h)) {
    const entries = (item.entries || []).filter((e) => !isEndOfShiftRemoval(e));
    if (!entries.length) continue;
    out[k] = { ...item, entries, last: item.last && entries[entries.length - 1].type !== 'removed' && (item.entries || []).length !== entries.length ? (entries[entries.length - 1].now || item.last) : item.last };
  }
  return out;
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
  let item = history[key];
  if (!item) {
    // kein gespeicherter Verlauf (z. B. älterer Worker): aus der Änderungsliste zusammenstellen
    const entries = recentDpChanges().filter((c) => (c.key || c.uid) === key).sort((a, b) => a.at - b.at)
      .map((c) => ({ at: c.at, type: c.type, now: c.now, before: c.before }));
    if (entries.length) item = { uid: key, entries, last: entries[entries.length - 1].now || entries[entries.length - 1].before };
  }
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

let launchActionDone = false;
// Öffnen aus einer Mitteilung (#dienstplan) bzw. Nachricht vom Service Worker
/** Dienst, der gerade läuft (kein SEG). */
function runningService(now = new Date()) {
  return state.services.find((s) => { if (s.isSeg) return false; const a = parseLocalDt(s.startAt), b = parseLocalDt(s.endAt); return a && b && a <= now && now <= b; }) || null;
}

/** Kurzbefehle per Adresse, z. B. …/#neu-einsatz */
const SHORTCUTS = [
  { hash: '#neu-einsatz', label: 'Neuer Einsatz', sub: 'im laufenden Dienst – sonst neuer Dienst', icon: '🚑' },
  { hash: '#neu-dienst', label: 'Neuer Dienst', sub: 'Dienst anlegen', icon: '📋' },
  { hash: '#neu-seg', label: 'Neuer SEG-Einsatz', sub: 'einzelner Einsatz mit Beginn/Ende', icon: '⚡' },
  { hash: '#tagebuch', label: 'Tagebuch', sub: 'direkt zur Liste', icon: '📖' },
  { hash: '#statistik', label: 'Statistik', sub: '', icon: '📊' },
  { hash: '#rueckblick', label: 'Jahresrückblick', sub: 'Story des aktuellen Jahres', icon: '✨' },
];
function runShortcut(hash) {
  const now = new Date();
  if (hash === '#neu-einsatz') {
    const svc = runningService(now);
    switchTab('home');
    setTimeout(() => {
      if (svc) openIncidentDialog(svc.id, null);
      else { toast('Gerade läuft kein Dienst – lege zuerst einen an.', 'info', 2600); openServiceDialog(null); }
    }, 250);
    return true;
  }
  if (hash === '#neu-dienst') { switchTab('home'); setTimeout(() => openServiceDialog(null), 250); return true; }
  if (hash === '#neu-seg') { switchTab('home'); setTimeout(() => openIncidentDialog(null, null, { newSeg: true }), 250); return true; }
  if (hash === '#tagebuch') { switchTab('dienste'); return true; }
  if (hash === '#statistik') { switchTab('statistik'); return true; }
  if (hash === '#rueckblick') { switchTab('statistik'); setTimeout(() => openStory('year', now.getFullYear()), 300); return true; }
  return false;
}
window.addEventListener('hashchange', () => { if (location.hash === '#neu-einsatz-push' || SHORTCUTS.some((x) => x.hash === location.hash)) handleLaunchTarget(); });

function handleLaunchTarget(hash = location.hash) {
  if (hash === '#neu-einsatz-push') {
    if (hash === location.hash) history.replaceState(null, '', location.pathname + location.search);
    return runShortcut('#neu-einsatz');
  }
  if (SHORTCUTS.some((x) => x.hash === hash)) {
    if (hash === location.hash) history.replaceState(null, '', location.pathname + location.search);
    return runShortcut(hash);
  }
  // Start-Aktion beim Öffnen (Einstellungen → Darstellung)
  if (!hash && !launchActionDone) {
    launchActionDone = true;
    const act = lsGet('etb_launch_action') || '';
    if (act === 'neu-einsatz' && runningService()) return runShortcut('#neu-einsatz');
    if (act === 'tagebuch' || act === 'dienstplan' || act === 'statistik') { switchTab(act === 'tagebuch' ? 'dienste' : act); return true; }
  }
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
  // Statistik scrollt im eigenen Container
  if (activeTab === 'statistik') return [document.getElementById('tab-statistik'), document.getElementById('stats-container')].filter(Boolean);
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
  checkNewBadges();
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
  launchActionDone = false; handleLaunchTarget(''); // Start-Aktion auch nach längerer Pause
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
    updateQuickBell();
    if (reason === 'tick' && patchHomeActiveCard()) return;
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
    if (document.hidden) { hiddenSince = Date.now(); quickPushArm(); return; }
    if (!runningService()) quickNotifications().then((l) => l.forEach((n) => n.close()));
    if ('serviceWorker' in navigator && Date.now() - (window.__swCheckedAt || 0) > 30 * 60e3) {
      window.__swCheckedAt = Date.now();
      navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
    }
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
