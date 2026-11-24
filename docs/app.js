/* global window, document, localStorage, navigator */
'use strict';

// Klickbare Flächen merken (für die Tasten-Bedienung im Leicht-Modus): jedes Element mit Klick-Handler,
// das kein Knopf/Link/Eingabefeld ist, bekommt data-clickable – im normalen Modus ohne Wirkung.
(() => {
  const NATIVE = 'button, a[href], input, select, textarea, label';
  const tag = (el) => { if (el instanceof HTMLElement && !el.matches(NATIVE)) el.setAttribute('data-clickable', ''); };
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) { if (type === 'click') tag(this); return add.call(this, type, fn, opts); };
  const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onclick');
  if (d && d.set) Object.defineProperty(HTMLElement.prototype, 'onclick', { ...d, set(v) { if (v) tag(this); d.set.call(this, v); } });
})();

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
  ['5', 'Kombination Hintransport/Heimtransport stationär'],
  ['6', 'Kombination Hintransport/Heimtransport ambulant'],
  ['7', 'Verlegung'],
  ['8', 'Zwischentransport'],
  ['9', 'Anschlusstransport'],
  ['10', 'Übergabe NAH'],
  ['11', 'Übergabe NAW'],
  ['12', 'Mitfahrt verweigert'],
  ['13', 'Leerfahrt'],
  ['14', 'Übergabe RTW von RTW'],
  ['15', 'Belassung vor Ort'],
  ['16', 'Erste Hilfe-Einsatz'],
  ['17', 'Dialyse'],
  ['51', 'LKH West ↔ BHB 1 Pat.'],
  ['52', 'LKH West ↔ BHB 2 Pat.'],
  ['53', 'LKH West ↔ BHB 3 Pat.'],
  ['54', 'LKH West → BHB II'],
  ['55', 'AUKH → BHB II'],
  ['56', 'LKH West 1 Pat.'],
  ['57', 'LKH West 2 Pat.'],
  ['58', 'LKH West 3 Pat.'],
  ['59', 'Einsatzrücknahme'],
  ['99', 'sonstiger Transport'],
];
// Statistikkennzahl
const STATKZ_CODES = [
  ['1', 'Alkoholmissbrauch'],
  ['2', 'Ambulanz'],
  ['3', 'Anpassung Heilbehelfe'],
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
  ['19', 'Gesundheitsvorsorge'],
  ['20', 'Gewalt/Verbrechen'],
  ['21', 'Haushalt/Unfall'],
  ['22', 'Hilfeleistung'],
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
  ['35', 'Schnellschnitt'],
  ['36', 'Schrittmacherkontrolle'],
  ['37', 'Selbstmord'],
  ['38', 'Sozialdienst'],
  ['39', 'Sport/Spiel Unfall'],
  ['40', 'Strahlen/Chemo Therapie'],
  ['41', 'Stromunfall'],
  ['42', 'Suchtgiftmissbrauch'],
  ['43', 'Therapie'],
  ['44', 'Tierverletzung allgemein'],
  ['45', 'Tod angetroffen'],
  ['46', 'Tod fraglich'],
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
let statsPlaceIncidents = [];
let statsCmpMode = 'year';
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
    placeAddresses: {},
    portalPlans: {},
  };
}

function normalizeState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return defaultState();
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const objList = (x) => (Array.isArray(x) ? x.filter(isObj) : []);
  const str = (x) => (typeof x === 'string' ? x : '');
  s.profile = isObj(s.profile) ? s.profile : { displayName: 'Privat' };
  s.profile.displayName = toDisplayName(s.profile.displayName);
  // Tagesdienstpläne aus dem Portal: je Dienststelle + Tag der letzte Stand und die Änderungen.
  // 7 Tage nach dem Dienst (Nachtdienst: ab dem Folgetag gerechnet) fällt der Änderungsverlauf weg –
  // der letzte Stand des Tages bleibt.
  s.portalPlans = isObj(s.portalPlans) ? s.portalPlans : {};
  { const cut = localDateStr(new Date(Date.now() - 8 * 864e5));
    Object.keys(s.portalPlans).forEach((k) => {
      const v = s.portalPlans[k];
      if (!isObj(v) || !Array.isArray(v.rows) || !/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) { delete s.portalPlans[k]; return; }
      if (v.date < cut) { delete v.log; delete v.lastChanges; delete v.prevAt; }
      else v.log = Array.isArray(v.log) ? v.log.filter(isObj).slice(-60) : [];
    }); }
  s.placeAddresses = (s.placeAddresses && typeof s.placeAddresses === 'object' && !Array.isArray(s.placeAddresses))
    ? Object.fromEntries(Object.entries(s.placeAddresses).map(([k, v]) => [String(k).trim().toLowerCase().replace(/\s+/g, ' '), toDisplayName(v)]).filter(([k, v]) => k && v)) : {};
  s.places = Array.isArray(s.places) ? [...new Set(s.places.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean))] : [];
  // früher „abteilungen“ – jetzt eine Liste der Dienststellen (Name, Dienstplan-ID, Standort)
  if (!Array.isArray(s.dienststellen) && Array.isArray(s.abteilungen)) s.dienststellen = s.abteilungen;
  delete s.abteilungen;
  s.dienststellen = Array.isArray(s.dienststellen) ? s.dienststellen.filter(isObj).map((a) => ({ name: toDisplayName(a.name), deptId: String(a.deptId ?? a.id ?? ''), ...(toDisplayName(a.address) ? { address: toDisplayName(a.address) } : {}), ...(+a.mapZoom >= 11 && +a.mapZoom <= 18 ? { mapZoom: +a.mapZoom } : {}) })) : [];
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
  s.vehicleCategories.forEach((c) => { c.id = c.id ? String(c.id) : uid(); c.name = toDisplayName(c.name); c.iconNormal = str(c.iconNormal); c.iconSoSi = str(c.iconSoSi); if (Number(c.sprite) > 1) c.sprite = Number(c.sprite); else delete c.sprite; if (c.spriteGuess && c.sprite) c.spriteGuess = true; else delete c.spriteGuess; const fr = Number(c.frames); if (fr >= 1 && fr <= 12) c.frames = fr; else delete c.frames; if (c.mirror) c.mirror = true; else delete c.mirror; delete c.zoom; delete c.ox; delete c.oy; });
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
    if (svc.vehicleType !== undefined) { svc.vehicleType = txt(svc.vehicleType); if (!svc.vehicleType) delete svc.vehicleType; }
    if (svc.tdp !== undefined && !(isObj(svc.tdp) && Array.isArray(svc.tdp.rows) && /^\d{4}-\d{2}-\d{2}$/.test(svc.tdp.date || ''))) delete svc.tdp;
    if (svc.planLog !== undefined) svc.planLog = (Array.isArray(svc.planLog) ? svc.planLog : []).filter((e) => e && e.id && e.txt).map((e) => ({ id: str(e.id), at: Number(e.at) || 0, txt: txt(e.txt) })).sort((a, b) => a.at - b.at);
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
    try { syncNoteChange(); } catch (_) { /* Sync noch nicht geladen */ }
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
/** Alarmzeit eines Einsatzes (Status-Zeit oder Anlegezeit), nur wenn sie zum Dienst passt – sonst null. */
function incAlarmAt(inc, svc) {
  const a = parseLocalDt(svc.startAt), e = parseLocalDt(svc.endAt);
  let c = inc.createdAt ? new Date(inc.createdAt) : null;
  const al = (inc.times || {}).erhalten || (inc.times || {}).anfahrt;
  if (al && a) { c = new Date(a); c.setHours(+al.slice(0, 2), +al.slice(3), 0, 0); if (c < a) c = new Date(c.getTime() + 864e5); }
  if (!c || !a || !e || isNaN(c) || c < a || c > new Date(e.getTime() + 2 * 3600e3)) return null;
  return c;
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
    // ohne offene Vorschläge gehören die Pfeiltasten der normalen Navigation
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (!dropdownEl.classList.contains('open') || !items2.length)) return;
    // am Ende bzw. Anfang der Vorschläge: Liste schließen und normal weiter (Pfeiltasten-Bedienung)
    if ((e.key === 'ArrowDown' && focusedIdx >= items2.length - 1) || (e.key === 'ArrowUp' && focusedIdx <= 0)) { dropdownEl.classList.remove('open'); focusedIdx = -1; return; }
    if (e.key === 'Escape' && dropdownEl.classList.contains('open')) { e.preventDefault(); e.stopPropagation(); dropdownEl.classList.remove('open'); return; }
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
  // Fahrzeuge (eigene und weitere Einsatzmittel) → Profil
  if (q) {
    const vm = new Map();
    const hit = (name, k) => { if (!name || !String(name).toLowerCase().includes(q)) return; const key = String(name).trim().toLowerCase(); const e = vm.get(key) || { name: String(name).trim(), svc: 0, inc: 0 }; e[k]++; vm.set(key, e); };
    state.services.forEach((sv) => { hit(sv.vehicle, 'svc'); (sv.incidents || []).forEach((i) => (i.extraVehicles || []).forEach((v) => hit(v, 'inc'))); });
    const list = [...vm.values()].sort((a, b) => b.svc + b.inc - a.svc - a.inc).slice(0, 8);
    if (list.length) {
      const sec = document.createElement('div');
      sec.className = 'srch-section';
      sec.innerHTML = `<div class="svc-month"><span>Fahrzeuge</span><span class="svc-month-meta">${vm.size} Treffer</span></div>
        <div class="srch-people">${list.map((v) => { const ic = vehicleIconSrc(v.name); return `<button type="button" class="srch-person" data-vehicle="${escHtml(v.name)}">
          ${ic ? `<img class="srch-veh" src="${escHtml(ic)}" alt="">` : '<span class="srch-av srch-av-veh">🚑</span>'}
          <span class="srch-person-t"><b>${escHtml(v.name)}</b><small>${[v.svc ? `${v.svc} ${v.svc === 1 ? 'Dienst' : 'Dienste'}` : '', v.inc ? `${v.inc} gemeinsame ${v.inc === 1 ? 'Einsatz' : 'Einsätze'}` : ''].filter(Boolean).join(' · ')}</small></span>
          <span class="srch-person-c">›</span></button>`; }).join('')}</div>`;
      listEl.appendChild(sec);
    }
  }
  // Dienststellen → Profil
  if (q) {
    const sm = new Map();
    const hitS = (name) => { if (!name || !String(name).toLowerCase().includes(q)) return; const k = stationKey(name); const e = sm.get(k) || { name: String(name).trim(), n: 0 }; e.n++; sm.set(k, e); };
    state.services.forEach((sv) => hitS(sv.location));
    (state.dienststellen || []).forEach((a) => { if (a.name && a.name.toLowerCase().includes(q) && !sm.has(stationKey(a.name))) sm.set(stationKey(a.name), { name: a.name, n: 0 }); });
    const list = [...sm.values()].sort((a, b) => b.n - a.n).slice(0, 6);
    if (list.length) {
      const sec = document.createElement('div');
      sec.className = 'srch-section';
      sec.innerHTML = `<div class="svc-month"><span>Dienststellen</span><span class="svc-month-meta">${sm.size} Treffer</span></div>
        <div class="srch-people">${list.map((v) => `<button type="button" class="srch-person" data-station="${escHtml(v.name)}">
          <span class="srch-av cp-station" style="--h:${colleagueHue((findAbteilung({ location: v.name }) || v).name)}">${ICON_STATION}</span>
          <span class="srch-person-t"><b>${escHtml(v.name)}</b><small>${v.n ? `${v.n} ${v.n === 1 ? 'Dienst' : 'Dienste'}` : 'noch keine Dienste'}</small></span>
          <span class="srch-person-c">›</span></button>`).join('')}</div>`;
      listEl.appendChild(sec);
    }
  }
  // Ziele & Startorte → Profil
  if (q) {
    const pm = new Map();
    state.services.forEach((sv) => (sv.incidents || []).forEach((i) => [i.to, i.from].forEach((v) => { if (!v || !String(v).toLowerCase().includes(q)) return; const k = placeKey(v); const e = pm.get(k) || { name: String(v).trim(), n: 0 }; e.n++; pm.set(k, e); })));
    const list = [...pm.values()].sort((a, b) => b.n - a.n).slice(0, 6);
    if (list.length) {
      const sec = document.createElement('div');
      sec.className = 'srch-section';
      sec.innerHTML = `<div class="svc-month"><span>Orte</span><span class="svc-month-meta">${pm.size} Treffer</span></div>
        <div class="srch-people">${list.map((v) => `<button type="button" class="srch-person" data-place="${escHtml(v.name)}">
          <span class="srch-av cp-station" style="--h:${colleagueHue(v.name)}">${ICON_PLACE}</span>
          <span class="srch-person-t"><b>${escHtml(v.name)}</b><small>${v.n} ${v.n === 1 ? 'Einsatz' : 'Einsätze'}</small></span>
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
    const iconHtml = cat && catNormal(cat)
      ? `<div class="svc-card-icon-wrap${alwaysSosi ? ' always-sosi' : ''}">
           <img class="svc-card-icon svc-card-icon-normal" src="${escHtml(catNormal(cat))}" alt="" loading="lazy" />
           ${catSoSi(cat) ? `<img class="svc-card-icon svc-card-icon-sosi" src="${escHtml(catSoSi(cat))}" alt="" loading="lazy" />` : ''}
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
          ${svcCardWhenHtml(svc)}
          ${svcCardPlaceHtml(svc.location)}
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
        ${svcCardWhenHtml(svc)}
        ${svcCardPlaceHtml(svc.location)}
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
  // Dienstplan-Verlauf aktuell halten (wird sonst nur im Dienstplan-Tab geladen)
  const id = selectedServiceId;
  const sv = id && state.services.find((x) => x.id === id);
  if (sv && !sv.isSeg) refreshDpHistory(() => { if (selectedServiceId === id) renderServiceDetailContent(); });
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
  const svcHistKeys = historyKeysForService(svc);
  const svcHistKey = svcHistKeys.join(',');
  const svcHistCount = (() => { const h = readDpHistory(); return svcHistKeys.reduce((n, k) => n + ((h[k] || {}).entries || []).length, 0); })();
  const row = (label, value, cls = '') => `<div class="dv-row ${cls}"><span class="dv-label">${label}</span><span class="dv-value">${value}</span></div>`;
  const crew = (svc.colleagues || []).filter(Boolean);
  const links = [
    dpUrl ? `<a ${dpLinkAttrs(dpUrl)} class="dv-row dv-link">${ICON_CAL}<span class="dv-link-text">Dienstplan</span><span class="dv-link-ext" aria-hidden="true">↗</span></a>` : '',
    svcHistKey ? `<button type="button" class="dv-row dv-link" data-hist="${escHtml(svcHistKey)}" data-hist-svc="${escHtml(svc.id)}">${HIST_ICON}<span class="dv-link-text">Dienstplan-Verlauf</span><span class="dv-value">${svcHistCount}</span><span class="hm-chev" aria-hidden="true">›</span></button>` : '',
  ].filter(Boolean).join('');
  contentEl.innerHTML = `
    ${backBtn}
    <div class="svc-detail-header">
      <div class="svc-detail-title">
        ${vehicleIconSrc(svc.vehicle) ? `<span class="svc-detail-veh${globalLightsOn ? ' sosi' : ''}" title="${escHtml(svc.vehicle)}"><img src="${escHtml(vehicleIconSrc(svc.vehicle, true))}" alt="" /></span>` : ''}
        <div><h2>${svc.vehicle ? `<span class="veh-link" role="button" data-vehicle="${escHtml(svc.vehicle)}">${escHtml(svc.vehicle)}</span>` : escHtml(label)}</h2><div class="svc-detail-sub">${shiftCodeHtml(svc.startAt, 'is-small')}<span>${escHtml(svcWhenText(svc))}</span></div></div>
      </div>
      <button class="btn-secondary dv-edit" id="btn-edit-svc">Bearbeiten</button>
    </div>
    ${planChangeBannerHtml(svc)}
    <div class="dv-group">
      ${row('Dienststelle', svc.location ? `<span class="crew-link" role="button" data-station="${escHtml(svc.location)}">${escHtml(svc.location)}</span>` : '—')}
      ${row('Besatzung', crew.length ? crew.map((c) => `<button type="button" class="crew-link" data-colleague="${escHtml(c)}">${escHtml(c)}</button>`).join('<br>') : '<span class="dv-muted">—</span>', 'is-multi')}
      ${svc.note ? row('Notiz', linkifyHtml(svc.note).replace(/\n/g, '<br>'), 'is-multi') : ''}
    </div>
    ${links ? `<div class="dv-group">${links}</div>` : ''}
    ${svcTdpHtml(svc)}
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
  const iconSrc = cat && catNormal(cat) ? (inc.lights && catSoSi(cat) ? catSoSi(cat) : catNormal(cat)) : '';
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
        return `<span class="iv-veh" role="button" data-vehicle="${escHtml(v)}">${src ? `<img src="${escHtml(src)}" alt="" />` : '<span class="iv-veh-noicon">🚑</span>'}<span class="iv-veh-name">${escHtml(v)}</span></span>`;
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
    + (inc.from || inc.to ? group('Transport', [`<div class="iv-route"><span><i class="route-dot is-from"></i>${inc.from ? `<span class="crew-link" role="button" data-place="${escHtml(inc.from)}">${escHtml(inc.from)}</span>` : '—'}</span><span><i class="route-dot is-to"></i>${inc.to ? `<span class="crew-link" role="button" data-place="${escHtml(inc.to)}">${escHtml(inc.to)}</span>` : '—'}</span></div>`]) : '')
    + ((inc.links || []).length ? group('Berichte & Links', [`<div class="inc-links is-view">${inc.links.map((l) => linkChipHtml(l, false)).join('')}</div>`]) : '')
    + (inc.note ? group('Notiz', [`<div class="iv-note">${linkifyHtml(inc.note)}</div>`]) : '')
    + (svc.isSeg
      ? group('SEG', [
        row('Zeitraum', escHtml(svcWhen || '—')),
        segDur && row('Dauer', escHtml(segDur)),
        svc.location && row('Ort', escHtml(svc.location)),
        svc.vehicle && row('Fahrzeug', `<span class="crew-link" role="button" data-vehicle="${escHtml(svc.vehicle)}">${escHtml(svc.vehicle)}</span>`),
        (svc.colleagues || []).length && row('Kolleg:innen', svc.colleagues.map(escHtml).join('<br>')),
      ])
      : group('Dienst', [
        row('Zeitraum', escHtml(svcWhen || '—')),
        svc.vehicle && row('Fahrzeug', `<span class="crew-link" role="button" data-vehicle="${escHtml(svc.vehicle)}">${escHtml(svc.vehicle)}</span>`),
        svc.location && row('Dienststelle', `<span class="crew-link" role="button" data-station="${escHtml(svc.location)}">${escHtml(svc.location)}</span>`),
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
/** Karten-Zeilen für die Dienstliste: Datum fett vorne, Uhrzeit und Dauer zurückhaltend dahinter; Ort darunter. */
function svcCardWhenHtml(svc) {
  const a = parseLocalDt(svc.startAt), b = parseLocalDt(svc.endAt);
  if (!a) return '';
  const wd = a.toLocaleDateString('de-AT', { weekday: 'short' }) + ', ';
  const dm = a.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
  let time = formatTimeHM(a), dur = '';
  if (b) { const h = (b - a) / 3600000; time += `–${formatTimeHM(b)}`; dur = `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`; }
  return `<div class="svc-card-when"><span class="svc-card-date"><span class="svc-card-wd">${escHtml(wd)}</span>${escHtml(dm)}</span><span class="svc-card-time">${escHtml(time)}</span>${dur ? `<span class="svc-card-dur">· ${escHtml(dur)}</span>` : ''}</div>`;
}
const svcCardPlaceHtml = (place) => (place ? `<div class="svc-card-place"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.3" fill="currentColor"/></svg><span>${escHtml(place)}</span></div>` : '');

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
// LstSim-Grafiken: ein Bild mit mehreren Einzelbildern untereinander (oben ohne Licht, darunter Blaulicht
// abwechselnd). Die App zerlegt sie in ein Standbild und eine Blaulicht-Animation; beide liegen auf dem Gerät
// unter eigenen Adressen (…?etb=n bzw. …?etb=s), die der Service Worker von dort liefert.
function spriteKey(url, k) { return url + (url.includes('?') ? '&' : '?') + 'etb=' + k; }
function catNormal(c) { return c && c.iconNormal ? (c.sprite ? spriteKey(c.iconNormal, 'n' + c.sprite) : c.iconNormal) : ''; }
function catSoSi(c) { return c && c.iconSoSi ? c.iconSoSi : c && c.iconNormal && c.sprite ? spriteKey(c.iconNormal, 's' + c.sprite) : ''; } // eigene SoSi-Grafik hat Vorrang
/** Höhe deutlich größer als Breite → LstSim-Streifen. Anzahl der Bilder grob übers Seitenverhältnis geschätzt
 *  (Fahrzeuge sind etwa doppelt so breit wie hoch); genau bestimmt wird sie beim Zerlegen (spriteFrameCount). */
function spriteFramesOf(w, h) {
  if (!w || !h || h <= w * 1.15) return 0;
  let best = 3, bestD = Infinity;
  for (let n = 2; n <= 12; n++) { const d = Math.abs(w / (h / n) - 1.95); if (d < bestD) { bestD = d; best = n; } }
  return best;
}
/** Tempo der Blaulicht-Animation je nach Zahl der Phasen (2: links/rechts, 4: stark/schwach, 6+: Blitzer). */
function spriteDelay(frames) { return frames > 6 ? 150 : frames > 3 ? 200 : 400; }
/** Anzahl der Einzelbilder aus den Bildpunkten: bei der richtigen Zerlegung sind die Umrisse aller Bilder deckungsgleich. */
function spriteFrameCount(bmp, hint = 3) {
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, w = c.width, h = c.height;
  const on = (x, y) => d[(Math.min(h - 1, y) * w + x) * 4 + 3] > 40;
  let best = 0, bestScore = Infinity;
  for (let n = 2; n <= 12; n++) {
    const fh = h / n, ratio = w / fh;
    if (ratio < 1.15 || ratio > 4.5) continue;
    let diff = 0, cnt = 0;
    for (let i = 0; i < n - 1; i++) for (let y = 0; y < Math.floor(fh); y += 1) for (let x = 0; x < w; x += 2) {
      diff += on(x, Math.floor(i * fh) + y) !== on(x, Math.floor((i + 1) * fh) + y); cnt++;
    }
    const score = diff / Math.max(1, cnt);
    if (score < bestScore) { bestScore = score; best = n; }
  }
  return best && bestScore < 0.2 ? best : hint;
}
function measureImage(url, ms = 8000) {
  return new Promise((res) => {
    const img = new Image(); const t = setTimeout(() => res(null), ms);
    img.onload = () => { clearTimeout(t); res({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { clearTimeout(t); res(null); };
    img.src = url;
  });
}

/** Gespiegelte Kategorien: alle Bilder mit ihren Adressen werden per CSS waagrecht gespiegelt (überall in der App). */
function applyVehicleMirror() {
  let el = document.getElementById('veh-mirror-css');
  if (!el) { el = document.createElement('style'); el.id = 'veh-mirror-css'; document.head.appendChild(el); }
  const q = (u) => '"' + String(u).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const rules = [];
  const srcs = (c) => [catNormal(c), catSoSi(c)].filter(Boolean).flatMap((u) => { const out = [u]; try { const abs = new URL(u, location.href).href; if (abs !== u) out.push(abs); } catch (_) {} return out; });
  for (const c of state.vehicleCategories || []) {
    if (c.mirror) rules.push(`${srcs(c).map((u) => `img[src=${q(u)}]`).join(',')} { scale: -1 1; }`);
  }
  el.textContent = rules.join('\n');
}

function vehicleIconSrc(vehicleName, sosi = false) {
  const catId = vehicleName ? (state.vehicleAssignments || {})[vehicleName] : null;
  const cat = catId ? (state.vehicleCategories || []).find((c) => c.id === catId) : null;
  if (!cat || !catNormal(cat)) return '';
  return sosi && catSoSi(cat) ? catSoSi(cat) : catNormal(cat);
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
  const regular = state.services.filter((s) => !s.isSeg);
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
  if (!cat || !catNormal(cat)) return '';
  if (showSoSi && catSoSi(cat)) {
    return `<img class="veh-icon ${cls}" src="${escHtml(catSoSi(cat))}" alt="" />`;
  }
  return `<img class="veh-icon ${cls}" src="${escHtml(catNormal(cat))}" alt="" />`;
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
    if (cat && catNormal(cat)) {
      const src = (incLights && catSoSi(cat)) ? catSoSi(cat) : catNormal(cat);
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

    const src = cat && catNormal(cat)
      ? (incLights && catSoSi(cat) ? catSoSi(cat) : catNormal(cat))
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

/** Torte fürs Ranglisten-Popup: Top 8 + „Sonstige“, Summe in der Mitte. */
function lpPieHtml(items, total, unit) {
  if (!total || items.length < 2) return '';
  const top = items.slice(0, 8), rest = total - top.reduce((n, [, c]) => n + c, 0);
  const parts = rest > 0 ? [...top, ['Sonstige', rest]] : top;
  const cx = 70, cy = 70, r = 62, inner = 38;
  let angle = -Math.PI / 2, paths = '';
  parts.forEach(([label, count], i) => {
    const sweep = Math.min((count / total) * 2 * Math.PI, 2 * Math.PI - 0.001);
    const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`;
    const large = sweep > Math.PI ? 1 : 0;
    const col = i < top.length ? PIE_COLORS[i % PIE_COLORS.length] : 'var(--fill2)';
    paths += `<path d="M${p(r, angle)} A${r},${r},0,${large},1,${p(r, angle + sweep)} L${p(inner, angle + sweep)} A${inner},${inner},0,${large},0,${p(inner, angle)} Z" fill="${col}"><title>${escHtml(String(label))}: ${count} (${Math.round((count / total) * 100)} %)</title></path>`;
    angle += (count / total) * 2 * Math.PI;
  });
  const legend = parts.map(([l, c], i) => `<li><span class="pie-dot" style="background:${i < top.length ? PIE_COLORS[i % PIE_COLORS.length] : 'var(--fill2)'}"></span><span class="pie-lbl">${escHtml(String(l))}</span><span class="pie-cnt">${Math.round((c / total) * 100)} %</span></li>`).join('');
  return `<div class="lp-pie"><div class="lp-pie-chart"><svg viewBox="0 0 140 140" aria-hidden="true">${paths}</svg><span class="lp-pie-sum"><b>${total}</b><small>${escHtml(unit || 'gesamt')}</small></span></div><ul class="lp-pie-legend">${legend}</ul></div>`;
}

// ── Karte aller Einsatzorte (Leaflet, bei Bedarf geladen) ──────────────────
let leafletP = null;
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = '';
    document.head.appendChild(css);
    const sc = document.createElement('script');
    sc.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    sc.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; sc.crossOrigin = '';
    sc.onload = () => res(window.L);
    sc.onerror = () => { leafletP = null; sc.remove(); rej(new Error('Karte konnte nicht geladen werden')); };
    document.head.appendChild(sc);
  });
  return leafletP;
}
const PLACE_MAP_MAX = 60;
// Straßenrouten (OSRM-Demo-Server, höchstens 1 Abfrage/s). Nur im Arbeitsspeicher, solange die App offen ist –
// nichts davon wird auf dem Gerät gespeichert.
const routeMem = new Map();
try { localStorage.removeItem('etb_route_cache'); } catch (_) {} // frühere Version hat Routen gespeichert
let routeQueue = Promise.resolve();
function decodePolyline(str) {
  const out = []; let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d; else lon += d;
    }
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}
function roadRoute(a, b) {
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const key = `${r4(a.lat)},${r4(a.lon)}|${r4(b.lat)},${r4(b.lon)}`;
  if (routeMem.has(key)) return Promise.resolve(routeMem.get(key));
  if (!navigator.onLine) return Promise.resolve(null);
  const run = () => fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=simplified&geometries=polyline`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((j) => {
      const g = j && j.routes && j.routes[0] && j.routes[0].geometry;
      const pts = g ? decodePolyline(g) : null;
      routeMem.set(key, pts);
      return pts;
    })
    .catch(() => null);
  const p = routeQueue.then(run);
  routeQueue = p.then(() => new Promise((r) => setTimeout(r, 1100)));
  return p;
}
const PM_LINES_KEY = 'etb_pm_lines', PM_ROAD_KEY = 'etb_pm_road', PM_ALL_KEY = 'etb_pm_all', PM_PAIRS_MAX = 80;
function openPlaceMap(incs) {
  const showAll = lsGet(PM_ALL_KEY) === '1';
  const agg = new Map();
  const skip = (key) => !key || /^(lokal|vor ort|-|—)$/.test(key);
  (incs || []).forEach((i) => [['to', i.to], ['from', i.from]].forEach(([k, v]) => {
    const key = placeKey(v);
    if (skip(key)) return;
    const e = agg.get(key) || { key, name: String(v).trim(), to: 0, from: 0 };
    e[k]++; agg.set(key, e);
  }));
  // Fahrten Start → Ziel (gleiche Strecke zusammengefasst, Richtung egal)
  const pairMap = new Map();
  (incs || []).forEach((i) => {
    const a = placeKey(i.from), b = placeKey(i.to);
    if (skip(a) || skip(b) || a === b) return;
    const k = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    const e = pairMap.get(k) || { a: a < b ? a : b, b: a < b ? b : a, n: 0 }; e.n++; pairMap.set(k, e);
  });
  const allPairs = [...pairMap.values()].sort((x, y) => y.n - x.n);
  const pairs = showAll ? allPairs : allPairs.slice(0, PM_PAIRS_MAX);
  const places = [...agg.values()].sort((a, b) => b.to + b.from - a.to - a.from);
  const shown = showAll ? places : places.slice(0, PLACE_MAP_MAX);
  const capped = places.length > PLACE_MAP_MAX || allPairs.length > PM_PAIRS_MAX;
  document.querySelectorAll('.pm-ov').forEach((x) => x.remove());
  const ov = document.createElement('div');
  ov.className = 'dialog-overlay pm-ov';
  ov.style.zIndex = '1500';
  let showLines = lsGet(PM_LINES_KEY) === '1', showRoad = lsGet(PM_ROAD_KEY) === '1';
  ov.innerHTML = `<div class="pm-box">
    <div class="pm-head"><div><h3>Einsatzorte</h3><span class="pm-status">${places.length ? `${shown.length} von ${places.length} Orten` : 'Keine Start- oder Zielorte erfasst'}</span></div>
      <div class="pm-seg" role="group" aria-label="Anzeigen">
        <button type="button" class="is-on" data-pm="all">Alle</button><button type="button" data-pm="to">Ziele</button><button type="button" data-pm="from">Start</button></div>
      <button class="dialog-close lp-x" aria-label="Schließen">✕</button></div>
    <div class="pm-missing" hidden></div>
    <div class="pm-map" id="pm-map"></div>
    <div class="pm-legend">
      <span><i style="background:#ff375f"></i>meist Ziel</span><span><i style="background:#5e5ce6"></i>meist Start</span>
      <label class="pm-switch"><input type="checkbox" id="pm-lines"${showLines ? ' checked' : ''}${pairs.length ? '' : ' disabled'}> Fahrten${pairs.length ? ` (${pairs.length})` : ''}</label>
      <label class="pm-switch"><input type="checkbox" id="pm-road"${showRoad ? ' checked' : ''}${showLines ? '' : ' disabled'}> echte Route</label>
      ${capped || showAll ? `<label class="pm-switch" title="Sonst nur die ${PLACE_MAP_MAX} häufigsten Orte und ${PM_PAIRS_MAX} häufigsten Fahrten"><input type="checkbox" id="pm-all"${showAll ? ' checked' : ''}> alles (${places.length} Orte · ${allPairs.length} Fahrten)</label>` : ''}
    </div>
  </div>`;
  const close = () => { ov.classList.add('closing'); const dc = document.getElementById('dialog-colleague'); if (dc) dc.style.zIndex = ''; setTimeout(() => ov.remove(), 200); };
  ov.querySelector('.dialog-close').onclick = close;
  document.body.appendChild(ov);
  const status = ov.querySelector('.pm-status');
  const missingBox = ov.querySelector('.pm-missing');
  if (!shown.length) return;
  if (!navigator.onLine) { status.textContent = 'Offline – die Karte braucht eine Internetverbindung.'; return; }
  status.textContent = 'Karte wird geladen …';
  loadLeaflet().then((L) => {
    if (!ov.isConnected) return;
    const map = L.map(ov.querySelector('#pm-map'), { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
    const near = homeGeoBias();
    map.setView(near ? [near.lat, near.lon] : [47.5, 14.5], near ? 10 : 7);
    const lineLayer = L.featureGroup().addTo(map);
    const layer = L.featureGroup().addTo(map);
    const maxN = Math.max(...shown.map((p) => p.to + p.from));
    const coords = new Map(); // key → {lat, lon}
    const missing = [];
    let mode = 'all', touched = false, done = 0;
    map.on('dragstart', () => { touched = true; });
    const radius = (n) => 7 + 18 * Math.sqrt(n / maxN);
    const maxPair = Math.max(1, ...pairs.map((x) => x.n));
    const roads = new Map(); // Paar → Koordinatenliste der Straßenroute
    let roadsPending = 0;
    const drawLines = () => {
      lineLayer.clearLayers();
      if (!showLines) return;
      pairs.forEach((pr) => {
        const a = coords.get(pr.a), b = coords.get(pr.b);
        if (!a || !b) return;
        const pts = (showRoad && roads.get(`${pr.a}\n${pr.b}`)) || [[a.lat, a.lon], [b.lat, b.lon]];
        L.polyline(pts, { color: '#ff9f0a', weight: 1.5 + 5 * (pr.n / maxPair), opacity: 0.75, dashArray: showRoad && !roads.get(`${pr.a}\n${pr.b}`) ? '4 6' : null })
          .bindTooltip(`${escHtml((agg.get(pr.a) || {}).name || pr.a)} ↔ ${escHtml((agg.get(pr.b) || {}).name || pr.b)}: ${pr.n}×`, { sticky: true })
          .addTo(lineLayer);
      });
    };
    const loadRoads = () => {
      if (!showLines || !showRoad) return;
      pairs.forEach((pr) => {
        const k = `${pr.a}\n${pr.b}`, a = coords.get(pr.a), b = coords.get(pr.b);
        if (!a || !b || roads.has(k)) return;
        roads.set(k, null); roadsPending++; tick();
        roadRoute(a, b).then((pts) => { roadsPending--; if (pts) roads.set(k, pts); if (ov.isConnected) { drawLines(); tick(); } });
      });
    };
    const redraw = () => {
      layer.clearLayers();
      shown.forEach((p) => {
        const c = coords.get(p.key);
        if (!c) return;
        const n = mode === 'all' ? p.to + p.from : p[mode];
        if (!n) return;
        const col = p.to >= p.from ? '#ff375f' : '#5e5ce6';
        L.circleMarker([c.lat, c.lon], { radius: radius(n), color: '#fff', weight: 1.5, fillColor: mode === 'from' ? '#5e5ce6' : mode === 'to' ? '#ff375f' : col, fillOpacity: 0.75 })
          .bindPopup(`<b>${escHtml(p.name)}</b><br>${[p.to ? `${p.to}× Ziel` : '', p.from ? `${p.from}× Start` : ''].filter(Boolean).join(' · ')}${placeAddress(p.name) ? `<br><small>📍 ${escHtml(placeAddress(p.name))}</small>` : ''}<br><button type="button" class="pm-prof" data-pm-place="${escHtml(p.name)}">Profil öffnen ›</button>`)
          .addTo(layer);
      });
      drawLines();
      if (!touched && layer.getLayers().length) map.fitBounds(layer.getBounds().pad(0.15), { maxZoom: 14 });
    };
    ov.querySelectorAll('[data-pm]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.pm; ov.querySelectorAll('[data-pm]').forEach((x) => x.classList.toggle('is-on', x === b)); touched = false; redraw();
    }));
    const roadBox = ov.querySelector('#pm-road');
    ov.querySelector('#pm-lines').addEventListener('change', (e) => { showLines = e.target.checked; lsSet(PM_LINES_KEY, showLines ? '1' : null); roadBox.disabled = !showLines; drawLines(); loadRoads(); tick(); });
    const allBox = ov.querySelector('#pm-all');
    if (allBox) allBox.addEventListener('change', (e) => { lsSet(PM_ALL_KEY, e.target.checked ? '1' : null); openPlaceMap(incs); });
    roadBox.addEventListener('change', (e) => { showRoad = e.target.checked; lsSet(PM_ROAD_KEY, showRoad ? '1' : null); drawLines(); loadRoads(); tick(); });
    ov.addEventListener('click', (e) => {
      const pb = e.target.closest && e.target.closest('[data-pm-place]');
      if (!pb) return;
      const dc = document.getElementById('dialog-colleague'); if (dc) dc.style.zIndex = '1600';
      openPlaceProfile(pb.dataset.pmPlace);
    });
    // Nicht gefundene Orte: antippen → Liste mit Adressfeldern, neue Adresse sofort suchen
    const renderMissing = () => {
      missingBox.innerHTML = `<div class="pm-miss-head"><b>Nicht gefunden · ${missing.length}</b><span>Adresse eintragen, z. B. „8230 Hartberg“ – wird auch in Einstellungen → Orte & Ziele gespeichert.</span><button type="button" class="pm-miss-x" aria-label="Liste schließen">✕</button></div>
        <div class="pm-miss-list">${missing.map((p) => `<div class="pm-miss-row"><span class="pm-miss-n">${escHtml(p.name)}<small>${p.to + p.from}×</small></span><input type="text" data-miss="${escHtml(p.key)}" value="${escHtml(placeAddress(p.name))}" placeholder="Adresse oder PLZ Ort" enterkeyhint="search" autocomplete="off"><button type="button" class="btn-secondary" data-miss-go="${escHtml(p.key)}">Suchen</button></div>`).join('')}</div>`;
      missingBox.querySelector('.pm-miss-x').onclick = () => { missingBox.hidden = true; setTimeout(() => map.invalidateSize(), 50); };
      const go = (key) => {
        const p = missing.find((x) => x.key === key);
        const inp = missingBox.querySelector(`[data-miss="${CSS.escape(key)}"]`);
        const v = inp.value.trim();
        if (!p || !v) return;
        state.placeAddresses = state.placeAddresses || {};
        state.placeAddresses[key] = v; saveState();
        const btn = missingBox.querySelector(`[data-miss-go="${CSS.escape(key)}"]`); btn.disabled = true; btn.textContent = '…';
        geocodeAddress(v, near).then((c) => {
          if (!ov.isConnected) return;
          if (c) {
            coords.set(key, c); missing.splice(missing.indexOf(p), 1);
            touched = false; redraw(); loadRoads(); tick(); renderMissing();
            if (!missing.length) { missingBox.hidden = true; setTimeout(() => map.invalidateSize(), 50); }
          } else { btn.disabled = false; btn.textContent = 'Suchen'; inp.classList.add('is-bad'); toast(`„${v}“ nicht gefunden – etwas allgemeiner versuchen, z. B. nur PLZ und Ort.`, 'error', 4000); }
        });
      };
      missingBox.querySelectorAll('[data-miss-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.missGo)));
      missingBox.querySelectorAll('[data-miss]').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(i.dataset.miss); } }));
    };
    status.addEventListener('click', () => { if (!missing.length) return; renderMissing(); missingBox.hidden = false; setTimeout(() => map.invalidateSize(), 50); });
    const tick = () => {
      const found = coords.size;
      const base = done < shown.length ? `Orte werden gesucht … ${done}/${shown.length}` : `${found} von ${places.length} Orten auf der Karte`;
      status.innerHTML = escHtml(base) + (done >= shown.length && missing.length ? ` · <u class="pm-miss-link">${missing.length} nicht gefunden – antippen</u>` : '')
        + (roadsPending ? ` · Routen ${escHtml(String(roadsPending))} offen` : '');
      status.classList.toggle('is-link', !!missing.length && done >= shown.length);
    };
    tick();
    shown.forEach((p) => geocodeAddress(placeAddress(p.name) || p.name, near).then((c) => {
      done++;
      if (!ov.isConnected) return;
      if (c) { coords.set(p.key, c); redraw(); } else missing.push(p);
      if (done === shown.length) loadRoads();
      tick();
    }));
    setTimeout(() => map.invalidateSize(), 250);
  }).catch((err) => { status.textContent = err.message; });
}

// ── Monatsübersicht für die Abrechnung ─────────────────────────────────────
/** Gesetzliche Feiertage in Österreich (YYYY-MM-DD). */
function atHolidays(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  const rel = (n) => { const x = new Date(easter); x.setDate(x.getDate() + n); return localDateStr(x); };
  const fix = (mo, da) => `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  return new Map([
    [fix(1, 1), 'Neujahr'], [fix(1, 6), 'Heilige Drei Könige'], [rel(1), 'Ostermontag'], [fix(5, 1), 'Staatsfeiertag'],
    [rel(39), 'Christi Himmelfahrt'], [rel(50), 'Pfingstmontag'], [rel(60), 'Fronleichnam'], [fix(8, 15), 'Mariä Himmelfahrt'],
    [fix(10, 26), 'Nationalfeiertag'], [fix(11, 1), 'Allerheiligen'], [fix(12, 8), 'Mariä Empfängnis'], [fix(12, 25), 'Christtag'], [fix(12, 26), 'Stefanitag'],
  ]);
}
const NIGHT_KEY = 'etb_night_window';
function nightWindow() { const m = String(lsGet(NIGHT_KEY, '22-6')).match(/^(\d{1,2})-(\d{1,2})$/); return m ? [+m[1] % 24, +m[2] % 24] : [22, 6]; }
/** Stunden eines Dienstes aufgeteilt: gesamt, Nacht, Wochenende (Sa/So), Feiertag. */
function serviceHourSplit(svc, [nf, nt] = nightWindow()) {
  const a = parseLocalDt(svc.startAt), b = parseLocalDt(svc.endAt);
  const out = { total: 0, night: 0, weekend: 0, holiday: 0, holidays: [] };
  if (!a || !b || b <= a || b - a > 48 * 3600e3) return out;
  const hol = new Map();
  for (let t = +a; t < +b; t += 60000) {
    const d = new Date(t), h = d.getHours(), ds = localDateStr(d), yr = d.getFullYear();
    if (!hol.has(yr)) hol.set(yr, atHolidays(yr));
    out.total++;
    if (nf > nt ? (h >= nf || h < nt) : (h >= nf && h < nt)) out.night++;
    if (d.getDay() === 0 || d.getDay() === 6) out.weekend++;
    const hn = hol.get(yr).get(ds);
    if (hn) { out.holiday++; if (!out.holidays.includes(hn)) out.holidays.push(hn); }
  }
  ['total', 'night', 'weekend', 'holiday'].forEach((k) => { out[k] = out[k] / 60; });
  return out;
}
const fmtH = (h) => (Math.round(h * 100) / 100).toLocaleString('de-AT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
let monthSheetYM = null;
function monthSheetData(y, m) {
  const svcs = state.services.filter((x) => { const d = parseLocalDt(x.startAt); return !x.isSeg && d && d.getFullYear() === y && d.getMonth() === m; })
    .sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
  const nw = nightWindow();
  const rows = svcs.map((svc) => ({ svc, h: serviceHourSplit(svc, nw) }));
  const sum = rows.reduce((t, { h }) => ({ total: t.total + h.total, night: t.night + h.night, weekend: t.weekend + h.weekend, holiday: t.holiday + h.holiday }), { total: 0, night: 0, weekend: 0, holiday: 0 });
  const segs = state.services.filter((x) => { const d = parseLocalDt(x.startAt); return x.isSeg && d && d.getFullYear() === y && d.getMonth() === m; });
  return { rows, sum, nw, incs: svcs.reduce((n, x) => n + (x.incidents || []).length, 0), segs };
}
function openMonthSheet(y, m) {
  const now = new Date();
  if (y === undefined) { const last = monthSheetYM || [now.getFullYear(), now.getMonth()]; [y, m] = last; }
  monthSheetYM = [y, m];
  const { rows, sum, nw, incs, segs } = monthSheetData(y, m);
  const title = new Date(y, m, 1).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
  const p2 = (n) => String(n).padStart(2, '0');
  const tm = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const dd = (d) => d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  document.querySelectorAll('.ms-ov').forEach((x) => x.remove());
  const ov = document.createElement('div');
  ov.className = 'dialog-overlay lp-ov ms-ov';
  ov.style.zIndex = '2000';
  ov.innerHTML = `<div class="dialog-box lp-box ms-box" style="--mc:#0a84ff">
    <div class="lp-head"><span class="lp-ic">📄</span>
      <div class="lp-head-t"><h3>Monatsübersicht</h3><span>für die Abrechnung</span></div>
      <button class="dialog-close lp-x" aria-label="Schließen">✕</button></div>
    <div class="dialog-body lp-body">
      <div class="ms-nav"><button type="button" class="ms-step" data-d="-1" aria-label="Voriger Monat">‹</button><b>${escHtml(title)}</b><button type="button" class="ms-step" data-d="1" aria-label="Nächster Monat">›</button></div>
      <div class="cp-tiles ms-tiles">
        <div><strong>${rows.length}</strong><small>Dienste</small></div>
        <div><strong>${fmtH(sum.total)}</strong><small>Stunden</small></div>
        <div><strong>${fmtH(sum.night)}</strong><small>Nacht ${nw[0]}–${nw[1]} Uhr</small></div>
        <div><strong>${fmtH(sum.weekend)}</strong><small>Sa/So</small></div>
        <div><strong>${fmtH(sum.holiday)}</strong><small>Feiertag</small></div>
      </div>
      ${rows.length ? `<div class="ms-table-wrap"><table class="ms-table">
        <thead><tr><th>Dienst</th><th>Std.</th><th>Nacht</th><th>Sa/So</th><th>Ftg.</th></tr></thead>
        <tbody>${rows.map(({ svc, h }) => { const a = parseLocalDt(svc.startAt), b = parseLocalDt(svc.endAt); return `<tr data-ms-svc="${escHtml(svc.id)}">
          <td><b>${escHtml(dd(a))}</b> ${tm(a)}–${b ? tm(b) : '?'}<small class="ms-sub">${escHtml([svc.vehicle, svc.location].filter(Boolean).join(' · ') || '—')}</small>${h.holidays.length ? `<small class="ms-hol">🎉 ${escHtml(h.holidays.join(', '))}</small>` : ''}</td>
          <td>${fmtH(h.total)}</td><td>${h.night ? fmtH(h.night) : ''}</td><td>${h.weekend ? fmtH(h.weekend) : ''}</td><td>${h.holiday ? fmtH(h.holiday) : ''}</td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td>Summe</td><td>${fmtH(sum.total)}</td><td>${fmtH(sum.night)}</td><td>${fmtH(sum.weekend)}</td><td>${fmtH(sum.holiday)}</td></tr></tfoot>
      </table></div>` : '<p class="sx-empty">In diesem Monat keine Dienste im Tagebuch.</p>'}
      <p class="cp-line">${incs} Einsätze${segs.length ? ` · ${segs.length} SEG-Einsätze (nicht in den Stunden)` : ''} · Monat nach Dienstbeginn</p>
      <label class="ms-night">Nachtstunden von <select id="ms-nf">${Array.from({ length: 24 }, (_, i) => `<option${i === nw[0] ? ' selected' : ''}>${i}</option>`).join('')}</select> bis <select id="ms-nt">${Array.from({ length: 24 }, (_, i) => `<option${i === nw[1] ? ' selected' : ''}>${i}</option>`).join('')}</select> Uhr</label>
      <div class="ms-actions">
        <button type="button" class="btn-secondary" id="ms-csv"${rows.length ? '' : ' disabled'}>CSV (Excel)</button>
        <button type="button" class="btn-primary" id="ms-print"${rows.length ? '' : ' disabled'}>Drucken / PDF</button>
      </div>
    </div></div>`;
  const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 200); };
  ov.querySelector('.dialog-close').onclick = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelectorAll('.ms-step').forEach((b) => b.addEventListener('click', () => { const d = new Date(y, m + +b.dataset.d, 1); ov.remove(); openMonthSheet(d.getFullYear(), d.getMonth()); }));
  const setNight = () => { lsSet(NIGHT_KEY, `${ov.querySelector('#ms-nf').value}-${ov.querySelector('#ms-nt').value}`); ov.remove(); openMonthSheet(y, m); };
  ov.querySelector('#ms-nf').addEventListener('change', setNight);
  ov.querySelector('#ms-nt').addEventListener('change', setNight);
  ov.querySelectorAll('[data-ms-svc]').forEach((tr) => tr.addEventListener('click', () => { close(); setTimeout(() => { switchTab('dienste'); openServiceDetail(tr.dataset.msSvc); }, 220); }));
  ov.querySelector('#ms-csv').addEventListener('click', () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Datum', 'Beginn', 'Ende', 'Fahrzeug', 'Dienststelle', 'Stunden', `Nacht ${nw[0]}-${nw[1]}`, 'Sa/So', 'Feiertag', 'Feiertagsname', 'Einsätze'].map(q).join(';')];
    rows.forEach(({ svc, h }) => { const a = parseLocalDt(svc.startAt), b = parseLocalDt(svc.endAt); lines.push([a.toLocaleDateString('de-AT'), tm(a), b ? tm(b) : '', svc.vehicle || '', svc.location || '', fmtH(h.total), fmtH(h.night), fmtH(h.weekend), fmtH(h.holiday), h.holidays.join(', '), (svc.incidents || []).length].map(q).join(';')); });
    lines.push(['Summe', '', '', '', '', fmtH(sum.total), fmtH(sum.night), fmtH(sum.weekend), fmtH(sum.holiday), '', incs].map(q).join(';'));
    saveFile(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `Dienste-${y}-${p2(m + 1)}.csv`, 'Monatsübersicht');
  });
  ov.querySelector('#ms-print').addEventListener('click', () => {
    let area = document.getElementById('print-area');
    if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
    const who = (state.profile && state.profile.displayName) || '';
    area.innerHTML = `<h1>Dienste ${escHtml(title)}</h1>${who ? `<p>${escHtml(who)}</p>` : ''}${ov.querySelector('.ms-table-wrap').innerHTML}
      <p>Nachtstunden ${nw[0]}–${nw[1]} Uhr · Feiertage: gesetzliche Feiertage Österreich · erstellt am ${escHtml(new Date().toLocaleDateString('de-AT'))}</p>`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1500); }, 50);
  });
  document.body.appendChild(ov);
}

/** Vollständige Rangliste als Popup – mit Podest-Medaillen, Anteil und Suche. */
function showListPopup(title, items, meta = {}) {
  const color = meta.color || 'var(--accent)';
  const total = items.reduce((n, [, c]) => n + c, 0);
  const max = items.length ? items[0][1] : 1;
  const medal = ['🥇', '🥈', '🥉'];
  const row = ([label, count], i) => `<li class="lp-row${i < 3 ? ' is-top' : ''}" style="--i:${Math.min(i, 12)}" data-q="${escHtml(String(label).toLowerCase())}"${meta.colleague ? ` data-colleague="${escHtml(String(label))}"` : ''}${meta.vehicle ? ` data-vehicle="${escHtml(String(label))}"` : ''}${meta.place ? ` data-place="${escHtml(String(label))}"` : ''}${meta.station ? ` data-station="${escHtml(String(label))}"` : ''}>
      <span class="lp-n"${i < 8 && items.length > 1 ? ` style="--pc:${PIE_COLORS[i % PIE_COLORS.length]}"` : ''}>${i < 3 ? medal[i] : i + 1}</span>
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
    <div class="dialog-body lp-body">${lpPieHtml(items, total, meta.unit)}<ol class="lp-list">${items.map(row).join('') || '<li class="lp-empty">Keine Daten</li>'}</ol></div>
  </div>`;
  const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 200); };
  ov.querySelector('.dialog-close').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const q = ov.querySelector('.lp-search input');
  if (q) q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    ov.querySelectorAll('.lp-row').forEach((li) => { li.hidden = !!v && !li.dataset.q.includes(v); });
    const pie = ov.querySelector('.lp-pie'); if (pie) pie.hidden = !!v;
  });
  document.body.appendChild(ov);
}

// ── Stats ──────────────────────────────────────────────────────────────────
function renderStats() {
  const container = document.getElementById('stats-container');
  if (!container) return;
  
  let fromD = statsFromDate ? parseLocalDt(statsFromDate + 'T00:00') : null;
  let toD = statsToDate ? parseLocalDt(statsToDate + 'T23:59') : null;

  const svcMatch = (svc) => {
    if (statsVehicles.length > 0 && !statsVehicles.includes(svc.vehicle || '')) return false;
    if (statsLocations.length > 0 && !statsLocations.includes(svc.location || '')) return false;
    if (statsColleagues.length > 0 && !statsColleagues.some((c) => (svc.colleagues || []).some((col) => col.toLowerCase().includes(c.toLowerCase())))) return false;
    return true;
  };
  const filteredSvcs = state.services.filter((svc) => {
    const start = parseLocalDt(svc.startAt);
    if (!start) return true;
    if (fromD && start < fromD) return false;
    if (toD && start > toD) return false;
    return svcMatch(svc);
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
  statsPlaceIncidents = allInc;
  // ── Vergleich mit dem Vorzeitraum (gleiche Filter außer Datum) ──
  const aggPeriod = (a, b) => {
    const sv = state.services.filter((x) => { const d = parseLocalDt(x.startAt); return d && d >= a && d <= b && svcMatch(x); });
    const duty = sv.filter((x) => !x.isSeg);
    const inc = sv.flatMap((x) => x.incidents || []).filter(incFilter);
    const segN = sv.filter((x) => x.isSeg).flatMap((x) => x.incidents || []).filter(incFilter).length;
    return { inc: inc.length, svc: duty.length, hours: duty.reduce((n, x) => n + +serviceDurationHours(x), 0), lights: inc.length ? (inc.filter((i) => i.lights).length / inc.length) * 100 : null,
      perSvc: duty.length ? (inc.length - segN) / duty.length : null, nights: duty.filter((x) => { const c = shiftCode(x.startAt); return c && !c.day; }).length };
  };
  const cmpPeriods = (() => {
    const now = new Date();
    if (fromD) {
      const b = toD || now, span = b - fromD;
      return { label: 'Filterzeitraum', prevLabel: 'gleich langer Zeitraum davor', cur: [fromD, b], prev: [new Date(+fromD - span - 1), new Date(+fromD - 1)] };
    }
    if (statsCmpMode === 'month') {
      const a = new Date(now.getFullYear(), now.getMonth(), 1), pa = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const pb = new Date(pa.getFullYear(), pa.getMonth(), Math.min(now.getDate(), new Date(pa.getFullYear(), pa.getMonth() + 1, 0).getDate()), now.getHours(), now.getMinutes());
      const mn = (d) => d.toLocaleDateString('de-AT', { month: 'long' });
      return { label: `${mn(now)} bis heute`, prevLabel: `${mn(pa)} bis zum ${pb.getDate()}.`, cur: [a, now], prev: [pa, pb] };
    }
    const a = new Date(now.getFullYear(), 0, 1), pa = new Date(now.getFullYear() - 1, 0, 1);
    const pb = new Date(now); pb.setFullYear(now.getFullYear() - 1);
    return { label: `${now.getFullYear()} bis heute`, prevLabel: `${now.getFullYear() - 1} bis ${pb.toLocaleDateString('de-AT', { day: 'numeric', month: 'numeric' })}`, cur: [a, now], prev: [pa, pb] };
  })();
  const cmpCur = aggPeriod(...cmpPeriods.cur), cmpPrev = aggPeriod(...cmpPeriods.prev);
  const deltaHtml = (c, p, { pts = false } = {}) => {
    if (c === null || p === null || (!p && !c)) return '';
    if (pts) { const d = Math.round(c - p); return `<span class="sx-delta ${d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''}">${d > 0 ? '+' : ''}${d} %-P.</span>`; }
    if (!p) return '<span class="sx-delta is-up">neu</span>';
    const d = Math.round(((c - p) / p) * 100);
    return `<span class="sx-delta ${d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''}">${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '± '}${d} %</span>`;
  };
  const cmpRow = (label, c, p, fmt, opt) => `<tr><th>${label}</th><td>${c === null ? '–' : fmt(c)}</td><td>${p === null ? '–' : fmt(p)}</td><td>${deltaHtml(c, p, opt)}</td></tr>`;
  const cmpFmt1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  const compareBodyHtml = `${fromD ? '' : `<div class="pm-seg sx-cmp-seg" role="group" aria-label="Zeitraum"><button type="button" data-cmp="month"${statsCmpMode === 'month' ? ' class="is-on"' : ''}>Monat</button><button type="button" data-cmp="year"${statsCmpMode === 'year' ? ' class="is-on"' : ''}>Jahr</button></div>`}
    <table class="sx-cmp-t"><thead><tr><th></th><th>${escHtml(cmpPeriods.label)}</th><th>${escHtml(cmpPeriods.prevLabel)}</th><th></th></tr></thead><tbody>
      ${cmpRow('Einsätze', cmpCur.inc, cmpPrev.inc, String)}
      ${cmpRow('Dienste', cmpCur.svc, cmpPrev.svc, String)}
      ${cmpRow('Stunden', cmpCur.hours, cmpPrev.hours, (v) => String(Math.round(v)))}
      ${cmpRow('pro Dienst', cmpCur.perSvc, cmpPrev.perSvc, cmpFmt1)}
      ${cmpRow('Blaulicht', cmpCur.lights, cmpPrev.lights, (v) => Math.round(v) + ' %', { pts: true })}
      ${cmpRow('Nachtdienste', cmpCur.nights, cmpPrev.nights, String)}
    </tbody></table>`;
  const statsToolsHtml = `<div class="sx-tools">
      <button type="button" class="sx-tool" id="btn-month-sheet"><span>📄</span><b>Monatsübersicht</b><small>Stunden für die Abrechnung</small></button>
      <button type="button" class="sx-tool" id="btn-place-map"><span>🗺️</span><b>Einsatzorte</b><small>Karte aller Start- und Zielorte</small></button>
    </div>`;
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
    ${statsToolsHtml}
    <div class="stats-rank-section sx-cmp is-classic"><div class="stats-section-head"><h4>Vergleich</h4></div>${compareBodyHtml}</div>
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
          ${ld(l)}
          <span class="sx-pod-l">${escHtml(String(l))}</span>
          <span class="sx-pod-n">${n}×</span>
          <span class="sx-pod-bar"><i>${i + 1}</i></span>
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
    const grid = Array.from({ length: 7 }, () => Array(8).fill(0));
    let n = 0;
    incX.forEach(({ inc, svc }) => {
      const a = parseLocalDt(svc.startAt), e = parseLocalDt(svc.endAt);
      let c = inc.createdAt ? new Date(inc.createdAt) : null;
      const al = (inc.times || {}).erhalten || (inc.times || {}).anfahrt;
      if (al && a) { c = new Date(a); c.setHours(+al.slice(0, 2), +al.slice(3), 0, 0); if (c < a) c = new Date(c.getTime() + 864e5); }
      if (!c || !a || !e || c < a || c > new Date(e.getTime() + 2 * 3600e3)) c = a; // keine plausible Uhrzeit → Dienstbeginn
      if (!c) return;
      grid[(c.getDay() + 6) % 7][Math.floor(c.getHours() / 3)]++; n++;
    });
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const hh = (h) => String(h * 3).padStart(2, '0');
    let best = [0, 0], bv = 0;
    grid.forEach((r, d) => r.forEach((v, h) => { if (v > bv) { bv = v; best = [d, h]; } }));
    const rowSum = grid.map((r) => r.reduce((x, y) => x + y, 0));
    const colSum = grid[0].map((_, h) => grid.reduce((x, r) => x + r[h], 0));
    const bestD = rowSum.indexOf(Math.max(...rowSum)), bestH = colSum.indexOf(Math.max(...colSum));
    const quietH = colSum.indexOf(Math.min(...colSum));
    const cell = (v, d, h) => { const p = bv ? Math.round((v / bv) * 100) : 0; return `<span class="sx-hm-c${p > 55 ? ' is-hi' : ''}" style="${v ? `background:color-mix(in srgb, var(--mc) ${Math.max(10, p)}%, transparent)` : ''}" title="${WEEKDAY_LONG[(d + 1) % 7]} ${hh(h)}–${hh(h + 1)} Uhr: ${v} Einsätze">${v || ''}</span>`; };
    return `<section class="sx-card" style="--mc:#0a84ff">${head('🕒', 'Wann ist was los?', n ? `${n} Einsätze` : '')}
      ${!n ? empty : `<p class="sx-when">Am meisten los: <strong>${WEEKDAY_LONG[(best[0] + 1) % 7]}, ${hh(best[1])}–${hh(best[1] + 1)} Uhr</strong></p>
      <div class="sx-hm"><span></span>${colSum.map((_, h) => `<span class="sx-hm-x">${hh(h)}</span>`).join('')}
        ${grid.map((r, d) => `<span class="sx-hm-y${d === bestD ? ' is-best' : ''}">${days[d]}</span>${r.map((v, h) => cell(v, d, h)).join('')}`).join('')}</div>
      <p class="sx-note sx-small">Zeilen = Wochentag, Spalten = Uhrzeit in 3-Stunden-Blöcken, Zahl = Einsätze. Stärkster Tag: <strong>${WEEKDAY_LONG[(bestD + 1) % 7]}</strong> · stärkste Zeit: <strong>${hh(bestH)}–${hh(bestH + 1)} Uhr</strong> · ruhigste: <strong>${hh(quietH)}–${hh(quietH + 1)} Uhr</strong></p>`}
    </section>`;
  }

  // Einsatzzeiten: Ø-Ablauf als ein Balken
  function timesCard() {
    const COLS = { 'Ausrücken': '#8e8e93', 'Anfahrt': '#ff9f0a', 'Vor Ort': '#30d158', 'Transport': '#0a84ff' };
    const ph = timeStats.filter((t) => COLS[t.k] && t.n);
    const tot = timeStats.find((t) => t.k === 'Gesamt');
    const span = (t) => (t.min === t.max ? `${t.n}×` : t.max < 60 ? `${t.min}–${t.max} min` : `${hmShort(t.min)}–${hmShort(t.max)} h`);
    return `<section class="sx-card" style="--mc:#30d158">${head('⏱', 'Einsatzzeiten', `${timesFilled}/${totalInc} Einsätze`)}
      ${!ph.length ? '<p class="sx-empty">Noch keine Zeiten erfasst</p>' : `${tot && tot.n ? `<div class="sx-tt-top"><b>${fmtMin(tot.avg)}</b><span>Ø vom Alarm bis Einsatzende<small>Spanne ${span(tot)}</small></span></div>` : ''}
      <div class="sx-tbar">${ph.map((t) => `<span style="flex:${Math.max(1, t.avg)};background:${COLS[t.k]}"></span>`).join('')}</div>
      <ul class="sx-tleg">${ph.map((t) => `<li><span class="sx-dot" style="background:${COLS[t.k]}"></span><span>${t.k}</span><b>${fmtMin(t.avg)}</b><small>${span(t)}</small></li>`).join('')}</ul>`}
    </section>`;
  }

  // Übersicht oben
  const nights = nonSegSvcs.filter((x) => { const c = shiftCode(x.startAt); return c && !c.day; }).length;
  const longestH = nonSegSvcs.reduce((m, x) => Math.max(m, +serviceDurationHours(x)), 0);
  const favCount = allInc.filter((i) => i.favorite).length;
  const lightPct = totalInc ? Math.round((lightsCount / totalInc) * 100) : 0;
  const maxShift = nonSegSvcs.reduce((m, x) => Math.max(m, (x.incidents || []).filter(incFilter).length), 0);
  const totT = timeStats.find((t) => t.k === 'Gesamt');
  const nacaVals = allInc.map((i) => parseInt(i.naca, 10)).filter((v) => v >= 0 && v <= 7);
  const avgNaca = nacaVals.length ? nacaVals.reduce((x, y) => x + y, 0) / nacaVals.length : null;
  const kpi = (v, l, sub, delta = '') => `<div class="sx-kpi"><b>${v}</b><span>${l}${delta}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const hd = fromD ? { inc: deltaHtml(cmpCur.inc, cmpPrev.inc), svc: deltaHtml(cmpCur.svc, cmpPrev.svc), hours: deltaHtml(cmpCur.hours, cmpPrev.hours) } : {};
  const compareCard = `<section class="sx-card sx-cmp" style="--mc:#64d2ff">${head('📈', 'Vergleich', '')}${compareBodyHtml}</section>`;
  const hero = `<section class="sx-hero">
    ${kpi(totalInc, 'Einsätze', `${lightPct} % Blaulicht${segInc ? ` · ${segInc} SEG` : ''}`, hd.inc)}
    ${kpi(totalSvcs, 'Dienste', `${nights} Nacht · ${totalSvcs - nights} Tag`, hd.svc)}
    ${kpi(Math.round(totalHours), 'Stunden', totalSvcs ? `Ø ${fmt1(totalHours / totalSvcs)} h · max ${fmt1(longestH)} h` : '', hd.hours)}
    ${kpi(String(avgInc).replace('.', ','), 'pro Dienst', maxShift ? `Rekord: ${maxShift}` : '')}
    ${totT && totT.n ? kpi(totT.avg < 60 ? `${totT.avg} min` : `${hmShort(totT.avg)} h`, 'Ø Dauer', `${totT.n} mit Zeiten`) : ''}
    ${avgNaca !== null ? kpi(fmt1(avgNaca), 'Ø NACA', avgAge !== null ? `Ø Alter ${avgAge}` : `${nacaVals.length} erfasst`) : ''}
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
    ${statsToolsHtml}
    <div class="sx-grid">
      ${compareCard}
      ${podiumCard({ key: 'Top Einsätze', title: 'Top-Stichwörter', icon: '🚨', color: '#ff453a', items: allAlarm })}
      ${podiumCard({ key: 'Top Fahrzeug', title: 'Fahrzeuge', icon: '🚑', color: '#0a84ff', items: allVehicle.filter(([k]) => k !== '-'), lead: vehLead, attr: (l) => `data-vehicle="${escHtml(String(l))}"` })}
      ${podiumCard({ key: 'Top Kolleg:innen', title: 'Crew', icon: '🤝', color: '#30d158', items: allColleagues, lead: avLead, attr: (l) => `data-colleague="${escHtml(String(l))}"` })}
      ${podiumCard({ key: 'Top Dienststelle', title: 'Dienststellen', icon: '🏠', color: '#ff9f0a', items: allLocation.filter(([k]) => k !== '-'), attr: (l) => `data-station="${escHtml(String(l))}"` })}
      ${(() => { const comp = countTop(allInc.flatMap((i) => i.extraVehicles || []), 999); return comp.length ? podiumCard({ key: 'Companions', title: 'Liebste Companions', icon: '🚨', color: '#64d2ff', items: comp, meta: `${allInc.filter((i) => (i.extraVehicles || []).length).length} Einsätze`, lead: vehLead, attr: (l) => `data-vehicle="${escHtml(String(l))}"` }) : ''; })()}
      ${timeCard()}
      ${timesFilled ? timesCard() : ''}
      ${allTo.length ? podiumCard({ key: 'Top Ziele', title: 'Häufigste Ziele', icon: '🏥', color: '#ff375f', items: allTo, meta: `${routeFilled}/${totalInc} Einsätze`, attr: (l) => `data-place="${escHtml(String(l))}"` }) : ''}
      ${allFrom.length ? podiumCard({ key: 'Top Startorte', title: 'Häufigste Startorte', icon: '📍', color: '#5e5ce6', items: allFrom, attr: (l) => `data-place="${escHtml(String(l))}"` }) : ''}
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
    'Top Fahrzeug': { icon: '🚑', color: '#0a84ff', unit: 'Dienste', lead: popupVeh, vehicle: true },
    'Top Dienststelle': { icon: '🏠', color: '#ff9f0a', unit: 'Dienste', station: true },
    'Top Ziele': { icon: '🏥', color: '#ff375f', unit: 'Einsätze', place: true },
    'Top Startorte': { icon: '📍', color: '#5e5ce6', unit: 'Einsätze', place: true },
    'Companions': { icon: '🚨', color: '#64d2ff', unit: 'Einsätze', lead: popupVeh, vehicle: true },
  };
  container.querySelectorAll('.btn-show-all').forEach((btn) => {
    btn.addEventListener('click', () => showListPopup(btn.dataset.title, popupData[btn.dataset.title] || [], popupMeta[btn.dataset.title]));
  });

  container.querySelectorAll('[data-cmp]').forEach((b) => b.addEventListener('click', () => { statsCmpMode = b.dataset.cmp; renderStats(); }));
  const msb = document.getElementById('btn-month-sheet');
  if (msb) msb.addEventListener('click', () => openMonthSheet());
  const pmb = document.getElementById('btn-place-map');
  if (pmb) pmb.addEventListener('click', () => openPlaceMap(statsPlaceIncidents));
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
  if (!cat || !catNormal(cat)) return '';
  return `<div class="hm-veh ${cls || ''}">
    <img src="${escHtml(catNormal(cat))}" class="hm-veh-img hm-veh-normal" alt="" />
    ${catSoSi(cat) ? `<img src="${escHtml(catSoSi(cat))}" class="hm-veh-img hm-veh-sosi" alt="" style="animation-delay:-${Date.now() % 1200}ms" />` : ''}
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
  document.getElementById('vcat-frames').value = cat && cat.frames ? String(cat.frames) : '';
  document.getElementById('vcat-mirror').checked = !!(cat && cat.mirror);
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
  const forced = Number(document.getElementById('vcat-frames').value) || 0; // 0 = automatisch, 1 = kein Streifen
  pre.classList.toggle('is-mirror', document.getElementById('vcat-mirror').checked);
  pre.innerHTML = '';
  if (normal) {
    const img = document.createElement('img');
    img.src = normal; img.style.cssText = 'height:43px;max-width:90px;object-fit:contain;margin-right:12px';
    img.onerror = () => { img.style.opacity = '.3'; img.title = 'Bild nicht erreichbar'; };
    img.onload = () => {
      // LstSim-Streifen: Vorschau als Standbild + Blaulicht-Animation
      if (forced === 1 || (!forced && !spriteFramesOf(img.naturalWidth, img.naturalHeight)) || document.getElementById('vcat-icon-normal').value.trim() !== normal) return;
      pre.innerHTML = '';
      const known = (state.vehicleCategories || []).find((c) => c.iconNormal === normal && c.sprite && !c.spriteGuess);
      const est = forced || (known && known.sprite) || spriteFramesOf(img.naturalWidth, img.naturalHeight);
      let exact = !!(forced || known);
      const draw = (n) => {
      if (document.getElementById('vcat-icon-normal').value.trim() !== normal) return;
      pre.innerHTML = '';
      const mk = (on) => {
        const d = document.createElement('span'); d.className = 'vcat-sprite';
        d.style.backgroundImage = `url("${normal.replace(/"/g, '%22')}")`; d.style.backgroundSize = `100% ${n * 100}%`;
        d.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight / n}`;
        if (on) { let i = 1; d._t = setInterval(() => { if (!d.isConnected) { clearInterval(d._t); return; } d.style.backgroundPosition = `0 ${(i / (n - 1)) * 100}%`; i = i + 1 >= n ? 1 : i + 1; }, spriteDelay(n)); d.style.backgroundPosition = `0 ${(1 / (n - 1)) * 100}%`; }
        return d;
      };
      if (sosi) { const si = document.createElement('img'); si.src = sosi; si.style.cssText = 'height:43px;max-width:120px;object-fit:contain'; si.title = 'SoSi (eigene Grafik)'; pre.append(mk(false), si); }
      else pre.append(mk(false), mk(true));
      const note = document.createElement('span'); note.className = 'vcat-sprite-note';
      note.textContent = sosi ? `Streifen mit ${n} Bildern${forced ? ' (fest eingestellt)' : exact ? '' : ' (geschätzt)'} – das Standbild kommt aus Bild 1, das Blaulicht aus der eingetragenen SoSi-Grafik. Ohne SoSi-Grafik entsteht es aus den übrigen Bildern.`
        : forced ? `Streifen mit ${n} Bildern (fest eingestellt) – Bild 1 ohne Licht, die übrigen ergeben das Blaulicht.`
        : exact ? `LstSim-Grafik erkannt (${n} Bilder) – Blaulicht wird automatisch daraus gemacht, das SoSi-Feld bleibt leer.`
        : `LstSim-Grafik, vermutlich ${n} Bilder (geschätzt – genau zählen geht nur mit verbundenem Dienstplan-Worker). Stimmt es nicht, oben bei „Einzelbilder“ festlegen.`;
      pre.appendChild(note);
      };
      draw(est);
      // genau zählen (über den Worker, sonst bleibt die Schätzung)
      if (!forced && !known) fetchSpriteBlob(normal).then(createImageBitmap).then((bmp) => { const n = spriteFrameCount(bmp, est); exact = true; draw(n); }).catch(() => {});
    };
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

async function saveVehicleCat() {
  const name = document.getElementById('vcat-name').value.trim();
  if (!name) { toast('Bitte Name eingeben.', 'error'); return; }
  const iconNormal = document.getElementById('vcat-icon-normal').value.trim();
  const iconSoSi = document.getElementById('vcat-icon-sosi').value.trim();
  const forced = Number(document.getElementById('vcat-frames').value) || 0; // 0 = automatisch, 1 = kein Streifen
  const mirror = document.getElementById('vcat-mirror').checked;
  // LstSim-Streifen erkennen (nur wenn kein eigenes SoSi-Bild angegeben ist) – oder fest eingestellt
  let sprite = 0;
  const prev = _vcatDialogId ? (state.vehicleCategories || []).find((c) => c.id === _vcatDialogId) : null;
  let guess = false;
  if (iconNormal && forced !== 1) {
    if (forced > 1) sprite = forced;
    else if (prev && prev.iconNormal === iconNormal && prev.sprite && !prev.spriteGuess && !prev.frames) sprite = prev.sprite; // schon genau gezählt
    else { const m = await measureImage(iconNormal); sprite = m ? spriteFramesOf(m.w, m.h) : 0; guess = !!sprite; }
  }
  const apply = (c) => {
    if (sprite) c.sprite = sprite; else delete c.sprite;
    if (guess) c.spriteGuess = true; else delete c.spriteGuess;
    if (forced) c.frames = forced; else delete c.frames;
    if (mirror) c.mirror = true; else delete c.mirror;
    delete c.zoom; delete c.ox; delete c.oy;
  };
  if (_vcatDialogId) {
    const cat = (state.vehicleCategories || []).find((c) => c.id === _vcatDialogId);
    if (cat) { cat.name = name; cat.iconNormal = iconNormal; cat.iconSoSi = iconSoSi; apply(cat); }
  } else {
    if (!state.vehicleCategories) state.vehicleCategories = [];
    const c = { id: uid(), name, iconNormal, iconSoSi }; apply(c);
    state.vehicleCategories.push(c);
  }
  saveState(); closeDialog('dialog-vehicle-cat'); renderSettings();
  applyVehicleMirror();
  if (sprite) toast('LstSim-Grafik erkannt – wird aufbereitet …', 'info', 2500);
  syncVehicleIcons({ force: !!sprite }).then(() => {
    if (sprite) { renderServiceList(); if (selectedServiceId) renderServiceDetail(); if (activeTab === 'home') renderHome().catch(() => {}); } if (settingsPageShown('fahrzeuge')) renderIconCacheRow(); }).catch(() => {});
  if (settingsPageShown('fahrzeuge')) renderVehiclesPopupContent();
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
const APP_VERSION = 165;
const APP_VERSION_DATE = '24.11.2026';
const SETTINGS_PAGES = {
  profil: 'Profil',
  darstellung: 'Darstellung',
  dienstplan: 'Dienstplan',
  bedienung: 'Bedienung',
  orte: 'Orte & Ziele',
  fahrzeuge: 'Fahrzeuge & Icons',
  stichwoerter: 'Stichwörter & PZC',
  dienststellen: 'Dienststellen',
  portal: 'Portal-Import',
  benachrichtigungen: 'Benachrichtigungen',
  daten: 'Daten & Backup',
  speicher: 'Speicher',
  konto: 'Konto & Sync',
  ueber: 'Über',
};
let settingsSub = null;

const SET_ICONS = {
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5a7 7 0 0 1 14 0"/></svg>',
  brush: '<svg viewBox="0 0 24 24"><path d="M14.5 4.5 19.5 9.5 11 18l-5-5z"/><path d="M6 13c-2 1-2.5 3-2.5 6.5C7 19.5 9 19 10 17"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8.5 12V5.5a1.5 1.5 0 0 1 3 0V11M11.5 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14.5 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 3.6-2.6 6.5-6 6.5-2.4 0-4-1.2-5.2-3.3L4.6 13.4a1.5 1.5 0 0 1 2.5-1.6l1.4 1.7"/></svg>',
  disk: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18.5h10.5a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7.3 9.2 4.7 4.7 0 0 0 7 18.5z"/><path d="M12 11v5M9.8 13.2 12 11l2.2 2.2"/></svg>',
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
      ${setRow({ icon: 'brush', color: 'indigo', title: 'Darstellung', value: themeLabel(currentTheme()) + (liteOn() ? ' · Leicht' : ''), push: 'darstellung' })}
      ${setRow({ icon: 'hand', color: 'teal', title: 'Bedienung', sub: 'Beim Öffnen, Links, Kurzbefehle', value: ({ '': 'Start', 'neu-einsatz': 'Neuer Einsatz', tagebuch: 'Tagebuch', dienstplan: 'Dienstplan', statistik: 'Statistik' })[lsGet('etb_launch_action') || ''] || 'Start', push: 'bedienung' })}
    </div>

    <div class="set-group-header">Dienstplan</div>
    <div class="set-group">
      ${setRow({ icon: 'calendar', color: 'red', title: 'Dienstplan', sub: 'Verbindung, Dienststellen', value: icsUrl ? 'Verbunden' : 'Aus', push: 'dienstplan' })}
      ${setRow({ icon: 'calendar', color: 'orange', title: 'Portal-Import', sub: 'Tagesdienstplan per Lesezeichen übernehmen', push: 'portal' })}
      ${setRow({ icon: 'bell', color: 'red', title: 'Benachrichtigungen', sub: 'Neuer Einsatz?, Dienstplan-Änderungen', value: quickPushEnabled() ? 'An' : 'Aus', push: 'benachrichtigungen' })}
    </div>

    <div class="set-group-header">Stammdaten</div>
    <div class="set-group">
      ${setRow({ icon: 'car', color: 'orange', title: 'Fahrzeuge &amp; Icons', value: `${cats.length} · ${vehicles.size}`, push: 'fahrzeuge' })}
      ${setRow({ icon: 'siren', color: 'green', title: 'Stichwörter &amp; PZC', value: `${(state.alarmCodes || []).length} · ${(state.pzcCodes || []).length}`, push: 'stichwoerter' })}
      ${setRow({ icon: 'building', color: 'blue', title: 'Dienststellen', value: abtRowValue(), push: 'dienststellen' })}
      ${setRow({ icon: 'pin', color: 'teal', title: 'Orte &amp; Ziele', sub: 'Favoriten, Adressen für die Karte', value: String((state.places || []).length), push: 'orte' })}
    </div>

    <div class="set-group-header">Daten</div>
    <div class="set-group">
      ${setRow({ icon: 'cloud', color: 'teal', title: 'Konto &amp; Sync', sub: 'Verschlüsselt sichern, auch am Computer', value: syncOn() ? (lsGet(SYNC_DIRTY_KEY) === '1' ? 'Ungesichert' : 'An') : 'Aus', push: 'konto' })}
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

  // Computer: Liste links, Seite rechts – es ist immer eine Seite offen
  if (!settingsSub && settingsWide()) settingsSub = 'profil';
  if (settingsSub) renderSettingsPage();
  const tab = document.getElementById('tab-einstellungen');
  if (tab) tab.classList.toggle('sub-open', !!settingsSub);
  markSettingsActive();
}
/** Einstellungen nebeneinander (Liste + Seite) ab 900 px Breite. */
function settingsWide() { return window.matchMedia('(min-width: 900px)').matches; }
function markSettingsActive() {
  document.querySelectorAll('#settings-container [data-push]').forEach((b) => b.classList.toggle('is-active', settingsWide() && b.dataset.push === settingsSub));
}
window.matchMedia('(min-width: 900px)').addEventListener('change', () => { if (activeTab === 'einstellungen') { renderSettings(); updateNavBar(); } });

function openSettingsPage(page) {
  if (!SETTINGS_PAGES[page] || (navAnimating && !settingsWide())) return;
  const root = document.getElementById('settings-root');
  settingsSub = page;
  renderSettingsPage();
  document.getElementById('tab-einstellungen').classList.add('sub-open');
  const sub = document.getElementById('settings-sub');
  if (sub) sub.scrollTop = 0;
  markSettingsActive();
  updateNavBar();
  if (isMobile() && root) pushAnimated(getBackTarget());
}

function closeSettingsPage() {
  settingsSub = null;
  document.getElementById('tab-einstellungen').classList.remove('sub-open');
  renderSettings();
  updateNavBar();
}

// — Fahrzeuge, Stichwörter, Dienststellen: früher Popups, jetzt eigene Seiten. Ihr Inhalt (mit allen
//   Bedienelementen) wird in die Seite verschoben; vor jedem Neuaufbau der Seite kommt er zurück an seinen Platz.
const HOSTED_ROOTS = ['veh-root', 'codes-root', 'abt-root'];
let lastSettingsPageBuilt = null;
function parkHostedRoots() {
  HOSTED_ROOTS.forEach((id) => {
    const node = document.getElementById(id);
    const home = node && document.querySelector(`[data-root-home="${id}"]`);
    if (node && home && node.parentElement !== home) home.appendChild(node);
  });
}
function settingsHostPage(el, title, rootId, render) {
  const node = document.getElementById(rootId);
  if (node && !node.parentElement.hasAttribute('data-root-home')) {
    // Heimatplatz merken (im früheren Popup), damit der Inhalt beim Neuaufbau nicht verloren geht
    const home = node.parentElement; home.setAttribute('data-root-home', rootId);
  }
  el.innerHTML = `${title}<nav class="setpage-jump" aria-label="Springen zu"></nav><div class="setpage-host"></div>`;
  if (node) el.querySelector('.setpage-host').appendChild(node);
  render();
  buildSetpageJump(el);
}
/** Kleine Sprungknöpfe oben (bleiben beim Scrollen sichtbar): zu den Abschnitten bzw. zu „Anlegen“ und „Suchen“. */
function setpageScrollTo(nav, target, center) {
  let sc = target.parentElement;
  while (sc && sc !== document.body && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
  const win = !sc || sc === document.body;
  const box = win ? { top: 0, height: window.innerHeight } : sc.getBoundingClientRect();
  const bar = nav.getBoundingClientRect();
  const top0 = Math.max(box.top, bar.bottom) + 8;
  const t = target.getBoundingClientRect();
  const delta = center ? t.top - (top0 + (box.top + box.height - top0) / 2 - t.height / 2) : t.top - top0;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const opts = { top: delta, behavior: reduce ? 'auto' : 'smooth' };
  if (win) window.scrollBy(opts); else sc.scrollBy(opts);
}
function buildSetpageJump(el) {
  const nav = el.querySelector('.setpage-jump');
  if (!nav) return;
  const host = el.querySelector('.setpage-host');
  const titles = [...host.querySelectorAll('.popup-col-title')];
  const label = (h) => (h.firstChild && h.firstChild.textContent || h.textContent).trim().replace(/^Fahrzeugkategorien$/, 'Kategorien').replace(/^Einsatzstichwörter$/, 'Stichwörter').replace(/^PZC-Codes$/, 'PZC');
  const multi = titles.length > 1;
  const cols = multi ? titles.map((h) => h.closest('.popup-col') || host) : [host];
  const acts = [];
  const groups = cols.map((col, i) => {
    const name = multi ? label(titles[i]) : '';
    const addInp = col.querySelector('.settings-add-row input');
    const addBtn = col.querySelector('#btn-add-vehicle-cat');
    const filter = col.querySelector('.settings-filter-input');
    const btns = [];
    if (multi) { acts.push(() => setpageScrollTo(nav, titles[i])); btns.push(`<button type="button" class="setpage-jump-btn" data-j="${acts.length - 1}">${escHtml(name)}</button>`); }
    if (addInp || addBtn) { acts.push(() => { if (addBtn && !addInp) { addBtn.click(); return; } addInp.focus({ preventScroll: true }); setpageScrollTo(nav, addInp, true); }); btns.push(`<button type="button" class="setpage-jump-btn is-tool" data-j="${acts.length - 1}" aria-label="${escHtml((name || 'Neu') + ' anlegen')}" title="Anlegen">＋${multi ? '' : ' Anlegen'}</button>`); }
    if (filter) { acts.push(() => { filter.focus({ preventScroll: true }); setpageScrollTo(nav, filter, true); }); btns.push(`<button type="button" class="setpage-jump-btn is-tool" data-j="${acts.length - 1}" aria-label="${escHtml((name || 'Liste') + ' durchsuchen')}" title="Suchen">🔍${multi ? '' : ' Suchen'}</button>`); }
    return btns.length ? `<span class="setpage-jump-group">${btns.join('')}</span>` : '';
  });
  nav.innerHTML = groups.join('');
  nav.hidden = !acts.length;
  const items = acts.map((go) => ({ go }));
  nav.querySelectorAll('[data-j]').forEach((b) => b.addEventListener('click', () => items[+b.dataset.j].go()));
}
const settingsPageShown = (page) => activeTab === 'einstellungen' && settingsSub === page;
/** Einstellungsseite öffnen – auch von außerhalb der Einstellungen. */
function openSettingsSection(page) {
  document.querySelectorAll('.dialog-overlay').forEach((o) => { if (o.style.display === 'flex' && o.id) closeDialog(o.id); });
  if (activeTab !== 'einstellungen') switchTab('einstellungen');
  setTimeout(() => openSettingsPage(page), 60);
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
    konto: settingsPageKonto,
    dienstplan: settingsPageDienstplan,
    portal: settingsPagePortal,
    daten: settingsPageDaten,
    ueber: settingsPageUeber,
    fahrzeuge: (e, t) => settingsHostPage(e, t, 'veh-root', renderVehiclesPopupContent),
    stichwoerter: (e, t) => settingsHostPage(e, t, 'codes-root', renderCodesPopupContent),
    dienststellen: (e, t) => { if (lastSettingsPageBuilt !== 'dienststellen') _abtEditIdx = null; settingsHostPage(e, t, 'abt-root', renderAbteilungenPopup); },
  };
  parkHostedRoots();
  builders[settingsSub](el, title);
  lastSettingsPageBuilt = settingsSub;
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
function statsStyle() { return liteOn() || lsGet('etb_stats_style') === 'classic' ? 'classic' : 'dynamic'; }

// Leicht-Modus: schlanke Ansicht für kleine Displays und Tasten-Handys.
// Gilt nur auf diesem Gerät (wird weder exportiert noch synchronisiert) und ersetzt den früheren Kompakt-Modus.
const LITE_KEY = 'etb_lite';
const liteOn = () => lsGet(LITE_KEY) === '1';
const compactOn = liteOn;
function applyLite(on) {
  lsSet(LITE_KEY, on ? '1' : null);
  lsSet('etb_compact', null); // alter Kompakt-Modus ist im Leicht-Modus aufgegangen
  document.documentElement.toggleAttribute('data-lite', on);
  document.documentElement.toggleAttribute('data-compact', on);
  if (on) { document.documentElement.setAttribute('data-lite', '1'); document.documentElement.setAttribute('data-compact', '1'); }
  liteKeyboard();
}
function applyCompact() { applyLite(liteOn()); } // Kompatibilität für ältere Aufrufe

// — Pfeiltasten-Navigation (Leicht-Modus): nächstes bedienbares Element in Pfeilrichtung —
const LITE_FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function liteNavRoot() {
  if (typeof story !== 'undefined' && story && story.el) return story.el;
  const ov = topVisibleOverlay();
  return ov || document.getElementById('app') || document.body;
}
function liteCandidates(root) {
  return [...root.querySelectorAll(LITE_FOCUSABLE)].filter((el) => {
    const panel = el.closest('.tab-panel');
    if (panel && !panel.classList.contains('active')) return false;
    if (el.closest('[hidden], .wheel-scroll') || el.matches('.dialog-overlay, #topbar, .tab-panel, #app, .dialog-box, .dialog-body')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.width * r.height > window.innerWidth * window.innerHeight * 0.6) return false; // große Flächen (Hintergründe) überspringen
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
  });
}
function liteScrollParent(el) {
  for (let p = el && el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
  }
  return null;
}
function liteMove(dir) {
  const root = liteNavRoot();
  const cands = liteCandidates(root);
  if (!cands.length) return false;
  const cur = document.activeElement && root.contains(document.activeElement) && document.activeElement !== root ? document.activeElement : null;
  const vh = window.innerHeight;
  if (!cur) { // erstes sichtbares Element im Inhalt
    const vis = cands.filter((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= vh && !el.closest('#sidebar, #topbar'); });
    const pick = (vis.length ? vis : cands).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    pick.focus({ preventScroll: true }); pick.scrollIntoView({ block: 'nearest' }); return true;
  }
  const c = cur.getBoundingClientRect();
  const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  // erst im eigenen Scrollbereich bleiben (Formular, Liste) – Leisten und feste Knöpfe erst an dessen Ende
  const spCur = (dir === 'up' || dir === 'down') ? liteScrollParent(cur) : null;
  const inSp = spCur ? cands.filter((el) => spCur.contains(el)) : null;
  const pickFrom = (list) => {
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === cur || el.contains(cur) || cur.contains(el)) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
    const gapX = Math.max(0, r.left - c.right, c.left - r.right), gapY = Math.max(0, r.top - c.bottom, c.top - r.bottom);
    let main, cross;
    if (dir === 'down') { if (ey <= cy + 4 || r.top < c.top + 4) continue; main = Math.max(0, r.top - c.bottom); cross = gapX; }
    else if (dir === 'up') { if (ey >= cy - 4 || r.bottom > c.bottom - 4) continue; main = Math.max(0, c.top - r.bottom); cross = gapX; }
    else if (dir === 'right') { if (ex <= cx + 4 || r.left < c.left + 4) continue; main = Math.max(0, r.left - c.right); cross = gapY; }
    else { if (ex >= cx - 4 || r.right > c.right - 4) continue; main = Math.max(0, c.left - r.right); cross = gapY; }
    const score = main + cross * 3 + Math.abs((dir === 'up' || dir === 'down') ? ex - cx : ey - cy) * 0.05;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
  };
  let best = inSp ? pickFrom(inSp) : pickFrom(cands);
  if (spCur && !best) {
    const more = dir === 'down' ? spCur.scrollTop + spCur.clientHeight < spCur.scrollHeight - 2 : spCur.scrollTop > 2;
    if (more) { spCur.scrollBy({ top: (dir === 'down' ? 1 : -1) * spCur.clientHeight * 0.6 }); return true; }
    best = pickFrom(cands);
  }
  // nichts in dieser Richtung, oder das nächste liegt weit weg: erst ein Stück scrollen
  const sp = liteScrollParent(cur) || liteScrollParent(cands[0]);
  if ((dir === 'down' || dir === 'up') && sp) {
    const far = best && (dir === 'down' ? best.getBoundingClientRect().top > vh : best.getBoundingClientRect().bottom < 0);
    const canScroll = dir === 'down' ? sp.scrollTop + sp.clientHeight < sp.scrollHeight - 2 : sp.scrollTop > 2;
    if ((!best || far) && canScroll && !cur.closest('#sidebar, #topbar')) { sp.scrollBy({ top: (dir === 'down' ? 1 : -1) * sp.clientHeight * 0.6 }); return true; }
  }
  if (!best) return false;
  best.focus({ preventScroll: true });
  best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}
document.addEventListener('keydown', (e) => {
  if (!liteOn() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const dir = { ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (!dir) return;
  if (typeof story !== 'undefined' && story && (dir === 'left' || dir === 'right')) return; // Story blättert selbst
  const el = document.activeElement;
  if (el && el.matches('input[type="range"]') && (dir === 'left' || dir === 'right')) return; // Schieberegler stellen selbst
  if (el && el.matches('input, textarea')) {
    const type = (el.type || '').toLowerCase();
    const caretTypes = el.tagName === 'TEXTAREA' || ['text', 'search', 'url', 'email', 'tel', 'password', ''].includes(type);
    if (caretTypes && el.selectionStart !== null) {
      const start = el.selectionStart, end = el.selectionEnd, len = el.value.length;
      if (dir === 'left' && !(start === 0 && end === 0)) return;
      if (dir === 'right' && !(start === len && end === len)) return;
      if (el.tagName === 'TEXTAREA' && dir === 'up' && el.value.slice(0, start).includes('\n')) return;
      if (el.tagName === 'TEXTAREA' && dir === 'down' && el.value.slice(end).includes('\n')) return;
    }
  }
  if (liteMove(dir)) e.preventDefault();
});

// — Zifferntasten 1–5 wechseln im Leicht-Modus die Tabs (Tasten-Handys) —
const LITE_TAB_KEYS = { 1: 'home', 2: 'dienste', 3: 'dienstplan', 4: 'statistik', 5: 'einstellungen' };
document.addEventListener('keydown', (e) => {
  if (!liteOn() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const tab = LITE_TAB_KEYS[e.key];
  if (!tab || (document.activeElement && document.activeElement.matches('input, textarea, select')) || topVisibleOverlay() || (typeof story !== 'undefined' && story)) return;
  e.preventDefault();
  if (activeTab === 'dienste' && tab === 'dienste' && selectedServiceId) { const t = getBackTarget(); if (t && t.pop) t.pop(); }
  if (activeTab === 'einstellungen' && tab === 'einstellungen' && settingsSub) closeSettingsPage();
  switchTab(tab);
  const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`); if (btn) btn.focus({ preventScroll: true });
  updateNavBar();
});

// — Zurück-Taste (Android) im Leicht-Modus: erst Fenster schließen, dann eine Ebene zurück, dann zum Start —
function liteBackAction() {
  if (typeof story !== 'undefined' && story) { closeStory(); return true; }
  const ov = topVisibleOverlay();
  if (ov) { dismissOverlay(ov); return true; }
  const t = getBackTarget();
  if (t && t.pop) { t.pop(); updateNavBar(); return true; }
  if (activeTab !== 'home') { switchTab('home'); return true; }
  return false;
}
let liteHistoryArmed = false;
function liteArmHistory() {
  if (!liteOn() || liteHistoryArmed) return;
  try { history.pushState({ etbLite: 1 }, ''); liteHistoryArmed = true; } catch (_) {}
}
window.addEventListener('popstate', () => {
  if (!liteOn() || !liteHistoryArmed) return;
  liteHistoryArmed = false;
  // bleibt in der App (neuer Eintrag beim nächsten Tastendruck/Klick); erst auf „Start“ ohne Fenster verlässt Zurück die App
  liteBackAction();
});
// Verlaufseintrag nur nach echter Bedienung anlegen – sonst überspringt der Browser ihn beim Zurückgehen
['keydown', 'pointerdown'].forEach((t) => document.addEventListener(t, () => { if (liteOn() && !liteHistoryArmed) setTimeout(liteArmHistory, 0); }, true));
document.addEventListener('keydown', (e) => {
  if (!liteOn() || e.defaultPrevented) return;
  const typing = document.activeElement && document.activeElement.matches('input, textarea, select');
  if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || (e.key === 'Backspace' && !typing)) {
    if (liteBackAction()) e.preventDefault();
  }
});
/** Tasten-Bedienung: alles Antippbare ist im Leicht-Modus auch per Pfeiltasten/Enter erreichbar. */
let liteObserver = null;
function liteKeyboard() {
  const sel = '[role="button"]:not(button):not(a):not([tabindex]), .sx-pod:not([tabindex]), .lp-row:not([tabindex]), [data-vehicle]:not(button):not([tabindex]), [data-colleague]:not(button):not([tabindex]), [data-clickable]:not([tabindex]):not(.dialog-overlay):not(#topbar):not(.tab-panel)';
  const mark = () => document.querySelectorAll(sel).forEach((el) => el.setAttribute('tabindex', '0'));
  if (liteOn()) {
    mark();
    if (!liteObserver) { let t = 0; liteObserver = new MutationObserver(() => { clearTimeout(t); t = setTimeout(mark, 120); }); liteObserver.observe(document.body, { childList: true, subtree: true }); }
  } else if (liteObserver) { liteObserver.disconnect(); liteObserver = null; }
}
document.addEventListener('keydown', (e) => {
  if (!liteOn() || (e.key !== 'Enter' && e.key !== ' ')) return;
  const el = document.activeElement;
  if (!el || el.matches('button, a, input, textarea, select, label') || !el.matches('[tabindex]')) return;
  e.preventDefault(); el.click();
});
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
        <span class="set-row-text"><span class="set-row-title">Leicht-Modus</span><span class="set-row-sub">Schlanke Ansicht für kleine Displays und Tasten-Handys</span></span>
        <input type="checkbox" class="set-switch" id="set-compact" ${liteOn() ? 'checked' : ''}>
      </label>
    </div>
    <p class="set-group-footer">Gilt nur auf diesem Gerät – iPhone und Computer bleiben, wie sie sind.</p>
    <div class="set-group-header lite-hide">Statistik</div>
    <div class="set-group lite-hide" role="radiogroup" aria-label="Statistik">
      ${choice('stats-choice', 'dynamic', 'Dynamisch', statsStyle() === 'dynamic')}
      ${choice('stats-choice', 'classic', 'Klassisch', statsStyle() === 'classic')}
    </div>`;
  el.querySelector('#set-compact').addEventListener('change', (e) => { applyLite(e.target.checked); renderSettings(); renderStats(); renderHome().catch(() => {}); updateNavBar(); });
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

function settingsPagePortal(el, title) {
  const code = portalBookmarkletCode();
  el.innerHTML = `${title}
    <div class="set-group-header">So funktioniert’s</div>
    <div class="set-group"><div class="set-row"><span class="set-row-text set-row-sub pi-steps">
      1. Lesezeichen unten einmal einrichten.<br>2. Im Dienstplan-Portal anmelden und einen <b>Tagesdienstplan</b> öffnen.<br>3. Lesezeichen „→ Einsatztagebuch“ antippen → „Kopieren“.<br>4. Hier in der App: Dienstplan → 📋 <b>Aus Portal einfügen</b>.</span></div></div>
    <p class="set-group-footer">Das Lesezeichen läuft nur in deinem eigenen, angemeldeten Browser und liest die gerade offene Seite. Dein Passwort bleibt bei dir – es geht weder an die App noch an den Worker.</p>
    <div class="set-group-header">Lesezeichen einrichten</div>
    <div class="set-group">
      <div class="set-row"><textarea readonly class="pi-code" rows="3">${escHtml(code)}</textarea></div>
      <div class="set-row"><button type="button" class="btn-primary" id="pi-copy" style="flex:1">Lesezeichen-Code kopieren</button></div>
      <div class="set-row pi-drag-row"><a class="pi-drag" href="${escHtml(code)}" title="Am Computer in die Lesezeichenleiste ziehen">→ Einsatztagebuch</a><span class="set-row-text set-row-sub">Am Computer: diesen Knopf in die Lesezeichenleiste ziehen.</span></div>
    </div>
    <p class="set-group-footer">${isIOSDevice() ? 'iPhone/iPad: In Safari irgendeine Seite als Lesezeichen sichern, dann unter Lesezeichen → Bearbeiten den Namen auf „→ Einsatztagebuch“ und die Adresse auf den kopierten Code ändern.' : 'Handy: Irgendeine Seite als Lesezeichen sichern und die Adresse durch den kopierten Code ersetzen.'}</p>
    <div class="set-group-header">Übernehmen</div>
    <div class="set-group"><div class="set-row"><button type="button" class="btn-secondary" id="pi-paste" style="flex:1">📋 Aus Portal einfügen</button></div></div>
    <p class="set-group-footer">Übernimmt Fahrzeugnummer, Besatzung und auf Wunsch Zeiten in deinen Dienst und kann den ganzen Tagesdienstplan beim Dienst speichern (wird wie deine Dienste gesichert und synchronisiert).</p>
    ${portalDaysHtml()}`;
  el.querySelector('#pi-copy').onclick = async (e) => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(code); b.textContent = 'Kopiert ✓'; } catch (_) { const ta = el.querySelector('.pi-code'); ta.focus(); ta.select(); document.execCommand('copy'); b.textContent = 'Kopiert ✓'; }
    setTimeout(() => { b.textContent = 'Lesezeichen-Code kopieren'; }, 1800);
  };
  el.querySelector('.pi-drag').addEventListener('click', (e) => { e.preventDefault(); toast('Ziehen statt tippen: in die Lesezeichenleiste deines Browsers.', 'info', 3000); });
  el.querySelector('#pi-paste').onclick = () => pastePortalPlan();
  const redo = () => { const sc = el.closest('#settings-sub') || el; const y = sc.scrollTop; renderSettingsPage(); requestAnimationFrame(() => { sc.scrollTop = y; }); };
  el.querySelectorAll('[data-pd-log]').forEach((b) => b.addEventListener('click', () => { deletePortalData(b.dataset.pdLog, { logOnly: true }); toast('Änderungsverlauf gelöscht.', 'success', 1500); redo(); }));
  el.querySelectorAll('[data-pd-del]').forEach((b) => b.addEventListener('click', () => { if (!confirm('Diesen gespeicherten Tagesdienstplan samt Verlauf löschen?')) return; deletePortalData(b.dataset.pdDel); toast('Gelöscht.', 'success', 1500); redo(); }));
  const allLog = el.querySelector('#pd-all-log'), allDel = el.querySelector('#pd-all-del');
  if (allLog) allLog.onclick = () => { if (!confirm('Bei allen Tagen den Änderungsverlauf löschen? Der letzte Stand bleibt.')) return; deletePortalData(null, { logOnly: true }); redo(); };
  if (allDel) allDel.onclick = () => { if (!confirm('Alle gespeicherten Tagesdienstpläne und Verläufe löschen?')) return; deletePortalData(null); redo(); };
}
/** Liste der gespeicherten Portal-Tage für die Einstellungen. */
function portalDaysHtml() {
  const list = Object.entries(state.portalPlans || {}).sort((a, b) => (b[1].date || '').localeCompare(a[1].date || '') || b[1].at - a[1].at);
  if (!list.length) return '<div class="set-group-header">Gespeicherte Tagesdienstpläne</div><div class="set-group"><div class="set-row"><span class="set-row-text set-row-sub">Noch nichts eingefügt.</span></div></div>';
  const nCh = (v) => (v.log || []).reduce((n, e) => n + e.changes.length, 0);
  const total = list.reduce((n, [, v]) => n + nCh(v), 0);
  const size = new Blob([JSON.stringify(state.portalPlans)]).size;
  return `<div class="set-group-header">Gespeicherte Tagesdienstpläne <span class="popup-col-count">${list.length}</span></div>
    <div class="set-group">${list.map(([k, v]) => { const d = parseLocalDt(v.date + 'T12:00'); const me = v.rows.find((r) => r.self); return `<div class="set-row pd-row">
      <div class="pd-info"><b>${escHtml(d ? d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : v.date)} · ${escHtml(v.station || '—')}</b>
        <small>${v.rows.length} Fahrzeuge${me ? ` · du: ${escHtml(tdpLabel(me))}` : ''}${nCh(v) ? ` · ${nCh(v)} Änderung${nCh(v) === 1 ? '' : 'en'}` : ''} · Stand ${escHtml(formatTimeHM(new Date(v.at)))}</small></div>
      <div class="pd-btns">${nCh(v) ? `<button type="button" class="btn-ghost pd-btn" data-pd-log="${escHtml(k)}">Verlauf löschen</button>` : ''}
      <button type="button" class="btn-ghost pd-btn is-del" data-pd-del="${escHtml(k)}" aria-label="Tag löschen">Löschen</button></div></div>`; }).join('')}</div>
    <p class="set-group-footer">Belegt etwa ${size < 1024 ? size + ' Byte' : Math.round(size / 1024) + ' KB'}. Der Änderungsverlauf wird 7 Tage nach dem Dienst automatisch gelöscht, der letzte Stand bleibt. „Löschen“ entfernt auch die Kopie am Dienst und die Portal-Einträge im Dienst-Verlauf dieses Tages.</p>
    <div class="set-group">
      ${total ? '<div class="set-row"><button type="button" class="btn-secondary" id="pd-all-log" style="flex:1">Alle Änderungsverläufe löschen</button></div>' : ''}
      <div class="set-row"><button type="button" class="btn-secondary pd-all-del" id="pd-all-del" style="flex:1">Alle Tagesdienstpläne löschen</button></div>
    </div>`;
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
let _placesFilter = '';
function settingsPageOrte(el, title) {
  const places = state.places || [];
  const favKeys = new Set(places.map(placeKey));
  const mode = lsGet('etb_places_sort') === 'alpha' ? 'alpha' : 'freq';
  // alle in Einsätzen eingegebenen Orte (Start und Ziel) mit Häufigkeit und häufigster Schreibweise
  const used = new Map();
  allIncidentsFlat().forEach((inc) => [inc.from, inc.to].forEach((v) => {
    const k = placeKey(v); if (!k) return;
    const e = used.get(k) || { n: 0, names: new Map() };
    e.n++; const nm = String(v).trim(); e.names.set(nm, (e.names.get(nm) || 0) + 1); used.set(k, e);
  }));
  const count = (p) => (used.get(placeKey(p)) || {}).n || 0;
  const byMode = (a, b) => (mode === 'alpha' ? a.localeCompare(b, 'de') : count(b) - count(a) || a.localeCompare(b, 'de'));
  const favOrder = places.map((p, i) => i).sort((a, b) => byMode(places[a], places[b]));
  const others = [...used.entries()].filter(([k]) => !favKeys.has(k))
    .map(([, e]) => [...e.names.entries()].sort((a, b) => b[1] - a[1] || /^[A-ZÄÖÜ]/.test(b[0]) - /^[A-ZÄÖÜ]/.test(a[0]))[0][0]).sort(byMode);
  const q = _placesFilter.trim().toLowerCase();
  const shownOthers = others.filter((p) => !q || p.toLowerCase().includes(q) || placeAddress(p).toLowerCase().includes(q));
  const LIMIT = 150;
  const addrInput = (p, attr) => `<input type="text" class="place-addr" ${attr} value="${escHtml(placeAddress(p))}" placeholder="📍 Adresse für Karte (optional)" autocomplete="off" enterkeyhint="done" aria-label="Adresse zu ${escHtml(p)}">`;
  el.innerHTML = `${title}
    <div class="place-sort" role="radiogroup" aria-label="Sortierung">
      <button type="button" role="radio" aria-checked="${mode === 'freq'}" data-place-sort="freq">Häufigkeit</button>
      <button type="button" role="radio" aria-checked="${mode === 'alpha'}" data-place-sort="alpha">A–Z</button>
    </div>
    <div class="set-group-header">⭐ Favoriten <span class="popup-col-count">${places.length}</span></div>
    <div class="set-group">
      ${places.length ? favOrder.map((i) => [places[i], i]).map(([p, i]) => `<div class="set-row place-row"><button type="button" class="place-star is-on" data-unfav="${i}" aria-label="${escHtml(p)} aus Favoriten entfernen" title="Aus Favoriten entfernen">★</button><div class="place-fields"><input type="text" class="place-edit" data-i="${i}" value="${escHtml(p)}" autocomplete="off" enterkeyhint="done" aria-label="Favorit bearbeiten">${addrInput(p, `data-addr="${escHtml(p)}"`)}</div>${count(p) ? `<span class="place-n">${count(p)}×</span>` : ''}</div>`).join('') : '<div class="set-row"><span class="set-row-text set-row-sub">Noch keine Favoriten – unten bei „Alle Orte“ den ☆ antippen oder hier ein Kürzel anlegen, z. B. „KH Oberwart ZAE“.</span></div>'}
      <div class="set-row place-add-row"><input type="text" id="place-new" placeholder="Neuer Favorit" autocomplete="off" enterkeyhint="done"><button type="button" class="btn-secondary" id="btn-place-add">Hinzufügen</button></div>
    </div>
    <p class="set-group-footer">Favoriten erscheinen beim Erfassen von Start und Ziel ganz oben. Mit Adresse findet die Karte den Ort sicher – auch ungefähr, z. B. „8230 Hartberg“ für „Whg, Hartberg“.</p>
    <div class="set-group-header">Alle Orte aus Einsätzen <span class="popup-col-count">${others.length}</span></div>
    ${others.length > 8 ? `<input type="search" id="places-filter" class="settings-filter-input" placeholder="Orte filtern…" value="${escHtml(_placesFilter)}">` : ''}
    <div class="set-group" id="places-all">
      ${shownOthers.length ? shownOthers.slice(0, LIMIT).map((p) => `<div class="set-row place-row"><button type="button" class="place-star" data-fav="${escHtml(p)}" aria-label="${escHtml(p)} zu Favoriten" title="Zu Favoriten">☆</button><div class="place-fields"><span class="place-name crew-link" role="button" data-place="${escHtml(p)}">${escHtml(p)}</span>${addrInput(p, `data-addr="${escHtml(p)}"`)}</div><span class="place-n">${count(p)}×</span></div>`).join('')
        : `<div class="set-row"><span class="set-row-text set-row-sub">${others.length ? 'Keine Treffer.' : 'Alle Orte aus deinen Einsätzen sind schon Favoriten.'}</span></div>`}
      ${shownOthers.length > LIMIT ? `<div class="set-row"><span class="set-row-text set-row-sub">… und ${shownOthers.length - LIMIT} weitere – Filter verwenden</span></div>` : ''}
    </div>
    <p class="set-group-footer">Ortsnamen antippen öffnet die Visitenkarte. Die Adresse ändert nur die Karte und die Route, nicht deine Einsätze.</p>`;
  const scroller = el.closest('#settings-sub') || el;
  const keepScroll = (fn) => { const y = scroller.scrollTop; fn(); requestAnimationFrame(() => { scroller.scrollTop = y; }); };
  const save = (list) => keepScroll(() => { state.places = [...new Set(list.map((x) => x.trim()).filter(Boolean))]; saveState(); renderSettingsPage(); });
  const addrs = () => (state.placeAddresses = state.placeAddresses || {});
  el.querySelectorAll('[data-unfav]').forEach((b) => b.addEventListener('click', () => save(places.filter((_, i) => i !== +b.dataset.unfav))));
  el.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', () => save([...places, b.dataset.fav])));
  el.querySelectorAll('[data-place-sort]').forEach((b) => b.addEventListener('click', () => { lsSet('etb_places_sort', b.dataset.placeSort === 'alpha' ? 'alpha' : null); renderSettingsPage(); }));
  el.querySelectorAll('.place-addr').forEach((inp) => {
    const commit = () => {
      const k = placeKey(inp.dataset.addr), v = inp.value.trim();
      if (v === (addrs()[k] || '')) return;
      if (v) addrs()[k] = v; else delete addrs()[k];
      saveState();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  });
  el.querySelectorAll('.place-edit').forEach((inp) => {
    const commit = () => {
      const i = +inp.dataset.i, v = inp.value.trim();
      if (v === places[i]) return;
      if (!v) { inp.value = places[i]; return; } // leer = nichts ändern (Entfernen über den Stern)
      const a = addrs(), ok = placeKey(places[i]);
      if (a[ok] && !a[placeKey(v)]) { a[placeKey(v)] = a[ok]; delete a[ok]; }
      const list = [...places]; list[i] = v; save(list);
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } if (e.key === 'Escape') { inp.value = places[+inp.dataset.i]; inp.blur(); } });
  });
  const flt = el.querySelector('#places-filter');
  if (flt) flt.addEventListener('input', () => {
    _placesFilter = flt.value;
    const v = flt.value.trim().toLowerCase();
    el.querySelectorAll('#places-all .place-row').forEach((r) => { r.hidden = !!v && !r.textContent.toLowerCase().includes(v) && !(r.querySelector('.place-addr').value || '').toLowerCase().includes(v); });
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
function openVehiclesPopup() { openSettingsSection('fahrzeuge'); }

function renderVehiclesPopupContent() {
  const popup = document.getElementById('veh-root');
  if (!popup) return;
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
        <span class="code-item-icon">${catNormal(c) ? `<img src="${escHtml(catNormal(c))}" alt="" loading="lazy">` : '—'}</span>
        <span class="code-item-text">${escHtml(c.name)}</span>
        ${catSoSi(c) ? '<span class="code-item-badge">SoSi</span>' : ''}
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
        <span class="code-item-text"><span class="veh-link" role="button" data-vehicle="${escHtml(v)}" title="Fahrzeug-Profil">${escHtml(v)}</span></span>
        <select class="code-item-select" data-veh="${escHtml(v)}" aria-label="Icon für ${escHtml(v)}">
          <option value="">kein Icon</option>
          ${cats.map((c) => `<option value="${escHtml(c.id)}"${c.id === curId ? ' selected' : ''}>${escHtml(c.name)}</option>`).join('')}
        </select>
        <button class="btn-code-del" data-veh="${escHtml(v)}" title="${used.has(v) ? 'Zuweisung entfernen' : 'Löschen'}" aria-label="${escHtml(v)} entfernen">✕</button>
      </div>`;
    }).join('')
    : `<div class="code-empty">${q ? 'Kein Fahrzeug für diese Suche.' : 'Noch keine Fahrzeuge. Sie erscheinen automatisch aus deinen Diensten oder oben hinzufügen.'}</div>`;
  el.querySelectorAll('.code-item-select').forEach((sel) => sel.addEventListener('change', () => {
    state.vehicleAssignments = state.vehicleAssignments || {};
    state.vehicleAssignments[sel.dataset.veh] = sel.value || null;
    saveState();
    const icon = sel.closest('.code-item').querySelector('.code-item-icon');
    const src = vehicleIconSrc(sel.dataset.veh);
    icon.innerHTML = src ? `<img src="${escHtml(src)}" alt="">` : '—';
    renderServiceList(); if (selectedServiceId) renderServiceDetail();
  }));
  el.querySelectorAll('.btn-code-del').forEach((btn) => btn.addEventListener('click', () => {
    if (state.vehicleAssignments) delete state.vehicleAssignments[btn.dataset.veh];
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

function openAbteilungenPopup() { _abtEditIdx = null; openSettingsSection('dienststellen'); }

function renderAbteilungenPopup() {
  const body = document.getElementById('abt-root');
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
    <p class="settings-hint" style="margin-top:6px">Die ID ist die Zahl am Ende der Tagesdienstplan-Adresse. Mit Standort erscheinen auf Start beim aktuellen bzw. nächsten Dienst Knöpfe für Google Maps und BusBahnBim. Name antippen öffnet das Profil, die übrige Zeile zum Bearbeiten. Mehrere Schreibweisen (z. B. „MINA RKZ“, „MINA West“) dürfen dieselbe ID haben. Import: Liste <code>[{ "name", "deptId" }]</code> oder <code>{ "dienststellen": […] }</code>.</p>`;

  const refreshList = () => {
    const el = body.querySelector('#abt-list');
    const q = _abtFilter.toLowerCase().trim();
    const rows = list.map((a, i) => ({ a, i })).filter(({ a }) => !q || (a.name || '').toLowerCase().includes(q) || String(a.deptId || '').includes(q));
    el.innerHTML = rows.length
      ? rows.map(({ a, i }) => `<div class="code-item code-item-tap${i === _abtEditIdx ? ' is-editing' : ''}" data-idx="${i}">
          <span class="code-item-code">${escHtml(a.deptId || '—')}</span>
          <span class="code-item-text">${a.name ? `<span class="veh-link" role="button" data-station="${escHtml(a.name)}" title="Dienststellen-Profil">${escHtml(a.name)}</span>` : '(ohne Namen)'}${a.address ? `<small class="abt-addr">📍 ${escHtml(a.address.length > 40 ? a.address.slice(0, 39) + '…' : a.address)}</small>` : ''}</span>
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
    const prev = _abtEditIdx !== null ? list[_abtEditIdx] : null;
    const entry = { name, deptId, ...(address ? { address } : {}), ...(prev && prev.mapZoom && (prev.address || '') === address ? { mapZoom: prev.mapZoom } : {}) };
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
function openCodesPopup() { openSettingsSection('stichwoerter'); }

function renderCodesPopupContent() {
  const alarm = state.alarmCodes || [];
  const pzc = state.pzcCodes || [];
  const popup = document.getElementById('codes-root');
  if (!popup) return;

  // Left: Alarmcodes/Stichwörter
  popup.querySelector('.codes-popup-left').innerHTML = `
    <h4 class="popup-col-title">Einsatzstichwörter <span class="popup-col-count">${alarm.length}</span></h4>
    <div class="settings-row codes-popup-import-row">
      <button id="btn-import-alarm" class="btn-secondary">JSON importieren</button>
      ${alarm.length ? `<button id="btn-export-alarm" class="btn-secondary">Exportieren</button>` : ''}
    </div>
    <input type="file" id="file-alarm-json" accept=".json,application/json,text/json,text/plain,.txt" style="display:none">
    <div class="settings-add-row">
      <input type="text" id="new-alarm-code" class="settings-code-input" placeholder="Neues Stichwort, z. B. Atemnot">
      <button id="btn-add-alarm" class="btn-secondary settings-add-btn">+</button>
    </div>
    <input type="text" id="alarm-filter" class="settings-filter-input" placeholder="Stichwörter filtern…" value="${escHtml(_alarmFilter)}" style="margin-top:6px">
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
      ...(svc.vehicleType ? { vehicleType: svc.vehicleType } : {}),
      ...(svc.tdp ? { tdp: svc.tdp } : {}),
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
    ...(shift.vehicleType ? { vehicleType: String(shift.vehicleType) } : {}),
    ...(shift.tdp && typeof shift.tdp === 'object' ? { tdp: shift.tdp } : {}),
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
const SETTINGS_EXPORT_KEYS = ['etb_theme', 'etb_stats_style', 'etb_launch_action', 'etb_dp_link_mode', 'etb_quick_push', 'etb_quick_sound', 'etb_icons_offline'];
function buildExportPayload(sel) {
  const payload = { version: 2, exportedAt: new Date().toISOString() };
  if (sel.profile) payload.profile = { displayName: state.profile.displayName || '' };
  if (sel.profile) payload.dienststellen = state.dienststellen || [];
  if (sel.profile) { payload.places = state.places || []; payload.placeAddresses = state.placeAddresses || {}; }
  if (sel.services && Object.keys(state.portalPlans || {}).length) payload.portalPlans = state.portalPlans;
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
    if (data.placeAddresses && typeof data.placeAddresses === 'object') state.placeAddresses = { ...(state.placeAddresses || {}), ...data.placeAddresses };
    if (data.portalPlans && typeof data.portalPlans === 'object') state.portalPlans = { ...(state.portalPlans || {}), ...data.portalPlans };
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
  (state.vehicleCategories || []).forEach((c) => [catNormal(c), catSoSi(c)].forEach((u) => {
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

// — APNG bauen (für die Blaulicht-Animation aus LstSim-Streifen) —
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pngChunks(u8) {
  const out = []; const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  for (let i = 8; i + 12 <= u8.length;) { const len = dv.getUint32(i); const type = String.fromCharCode(...u8.subarray(i + 4, i + 8)); out.push({ type, data: u8.subarray(i + 8, i + 8 + len) }); i += 12 + len; if (type === 'IEND') break; }
  return out;
}
function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8); dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
const u32be = (...vals) => { const b = new Uint8Array(vals.length * 4); const dv = new DataView(b.buffer); vals.forEach((v, i) => dv.setUint32(i * 4, v)); return b; };
const canvasPng = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
/** Mehrere gleich große Canvas-Bilder zu einem endlos laufenden APNG (delayMs je Bild). */
async function makeApng(canvases, delayMs = 400) {
  const pngs = await Promise.all(canvases.map(async (c) => new Uint8Array(await (await canvasPng(c)).arrayBuffer())));
  const first = pngChunks(pngs[0]);
  const ihdr = first.find((x) => x.type === 'IHDR').data;
  const w = new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(0), h = new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(4);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('acTL', u32be(pngs.length, 0))];
  first.filter((x) => !['IHDR', 'IDAT', 'IEND', 'acTL', 'fcTL', 'fdAT'].includes(x.type)).forEach((x) => parts.push(pngChunk(x.type, x.data)));
  let seq = 0;
  pngs.forEach((png, i) => {
    const fc = new Uint8Array(26); const dv = new DataView(fc.buffer);
    dv.setUint32(0, seq++); dv.setUint32(4, w); dv.setUint32(8, h); dv.setUint32(12, 0); dv.setUint32(16, 0);
    dv.setUint16(20, delayMs); dv.setUint16(22, 1000); fc[24] = 0; fc[25] = 0; // dispose: none, blend: source (ersetzt das ganze Bild)
    parts.push(pngChunk('fcTL', fc));
    pngChunks(png).filter((x) => x.type === 'IDAT').forEach((x) => {
      if (i === 0) parts.push(pngChunk('IDAT', x.data));
      else { const d = new Uint8Array(4 + x.data.length); new DataView(d.buffer).setUint32(0, seq++); d.set(x.data, 4); parts.push(pngChunk('fdAT', d)); }
    });
  });
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  return new Blob(parts, { type: 'image/png' });
}
/** LstSim-Streifen zerlegen: Bild 1 = ohne Licht, Bilder 2… = Blaulicht im Wechsel. Gemeinsam zugeschnitten. */
async function processSprite(blob, hint = 3, forced = 0) {
  const bmp = await createImageBitmap(blob);
  const frames = forced > 1 ? forced : spriteFrameCount(bmp, hint);
  const fh = Math.floor(bmp.height / frames), w = bmp.width;
  const cv = Array.from({ length: frames }, (_, i) => { const c = document.createElement('canvas'); c.width = w; c.height = fh; c.getContext('2d').drawImage(bmp, 0, i * fh, w, fh, 0, 0, w, fh); return c; });
  let box = null;
  cv.forEach((c) => { const b = alphaBox(c); if (b) box = !box ? b : { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) }; });
  const pad = 1;
  const bx = box ? { x0: Math.max(0, box.x0 - pad), y0: Math.max(0, box.y0 - pad), x1: Math.min(w - 1, box.x1 + pad), y1: Math.min(fh - 1, box.y1 + pad) } : { x0: 0, y0: 0, x1: w - 1, y1: fh - 1 };
  const cw = bx.x1 - bx.x0 + 1, ch = bx.y1 - bx.y0 + 1;
  const crop = cv.map((c) => { const o = document.createElement('canvas'); o.width = cw; o.height = ch; o.getContext('2d').drawImage(c, bx.x0, bx.y0, cw, ch, 0, 0, cw, ch); return o; });
  const normal = await canvasPng(crop[0]);
  // Blaulicht: alle Bilder nach dem ersten in ihrer Reihenfolge (LstSim: 2 Phasen links/rechts oder 4 Phasen stark/schwach)
  const sosi = crop.length > 2 ? await makeApng(crop.slice(1), spriteDelay(crop.length)) : await canvasPng(crop[1] || crop[0]);
  const hdr = (b) => ({ 'Content-Type': 'image/png', 'Content-Length': String(b.size), 'X-Etb-Orig-Size': String(blob.size), 'X-Etb-Cropped': '1', 'X-Etb-Sprite': '1', 'X-Etb-Frames': String(frames), 'X-Etb-V': ICON_PROC_VERSION });
  const out = [new Response(normal, { headers: hdr(normal) }), new Response(sosi, { headers: hdr(sosi) })];
  out.frames = frames;
  return out;
}
async function fetchSpriteBlob(url) {
  try { return await fetchIconViaWorker(url); } catch (_) {}
  const res = await fetch(url, { mode: 'cors', cache: 'no-store' }); // ohne Worker nur, wenn der Server es erlaubt
  if (!res.ok) throw new Error('Bild ' + res.status);
  return res.blob();
}
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

/** LstSim-Streifen zerlegen und ablegen – auch wenn „Icons offline“ aus ist (sonst gäbe es kein Blaulicht). */
async function syncSpriteIcons(cache, force) {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (_) { return u; } };
  let failed = 0, changed = false, made = 0;
  for (const c of state.vehicleCategories || []) {
    if (!c.sprite || !c.iconNormal) continue;
    const keysOf = () => (c.iconSoSi ? [abs(catNormal(c))] : [abs(catNormal(c)), abs(catSoSi(c))]);
    if (!force && !c.spriteGuess) { const hits = await Promise.all(keysOf().map((k) => cache.match(k))); if (hits.every((h) => h && h.headers.get('X-Etb-Sprite') === '1' && h.headers.get('X-Etb-Frames') === String(c.sprite))) continue; }
    try {
      const resps = await processSprite(await fetchSpriteBlob(c.iconNormal), c.sprite, c.frames || 0);
      // erkannte Anzahl in der Kategorie merken (wird synchronisiert → alle Geräte kennen sie, auch ohne Worker)
      if (resps.frames !== c.sprite || c.spriteGuess) { c.sprite = resps.frames; delete c.spriteGuess; changed = true; }
      await Promise.all(keysOf().map((k, i) => cache.put(k, resps[i])));
      made++;
    } catch (_) { failed++; }
  }
  if (changed) { saveState(); applyVehicleMirror(); }
  if (changed || made) { // neu zerlegte Bilder anzeigen
    try { renderServiceList(); if (selectedServiceId) renderServiceDetail(); if (activeTab === 'home') renderHome().catch(() => {}); if (settingsPageShown('fahrzeuge')) renderVehiclesPopupContent(); } catch (_) {}
  }
  return failed;
}
const spriteKeysAll = () => (state.vehicleCategories || []).filter((c) => c.sprite && c.iconNormal).flatMap((c) => (c.iconSoSi ? [catNormal(c)] : [catNormal(c), catSoSi(c)])).map((u) => { try { return new URL(u, location.href).href; } catch (_) { return u; } });

function syncVehicleIcons({ force = false } = {}) {
  if (!('caches' in window)) return Promise.resolve({ total: 0, cached: 0, failed: 0 });
  if (!iconsOfflineEnabled()) {
    // nur die zerlegten LstSim-Bilder behalten, alles andere wie bisher entfernen
    return (async () => {
      const cache = await caches.open(ICON_CACHE);
      const keep = new Set(spriteKeysAll());
      await Promise.all((await cache.keys()).filter((r) => !keep.has(r.url)).map((r) => cache.delete(r)));
      const failed = await syncSpriteIcons(cache, force);
      return { total: keep.size, cached: keep.size - failed * 2, failed, off: true };
    })();
  }
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
    // 0) LstSim-Streifen: zerlegen in Standbild + Blaulicht-Animation
    failed += await syncSpriteIcons(cache, force);
    spriteKeysAll().forEach((u) => handled.add(u));
    // 1) je Kategorie Normal + SoSi gemeinsam über den Worker
    if (dpConfigured()) {
      for (const c of state.vehicleCategories || []) {
        if (c.sprite) continue;
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
    prev: { label: prev.label, services: prevList.filter((x) => !x.isSeg).length, incidents: prevInc, has: prevList.length > 0,
      hours: prevList.filter((x) => !x.isSeg).reduce((n, x) => n + +serviceDurationHours(x), 0),
      lights: prevList.reduce((n, x) => n + (x.incidents || []).filter((i) => i.lights).length, 0),
      nights: prevList.filter((x) => { if (x.isSeg) return false; const c = shiftCode(x.startAt); return c && !c.day; }).length },
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

/** Dienst-Zeile für Profile: Datum, Schicht, Fahrzeug bzw. Dienststelle, Uhrzeit, Besatzung, Einsätze. */
function cpSvcRowHtml(x, { vehicle, person, station } = {}) {
  const d = parseLocalDt(x.startAt), e = parseLocalDt(x.endAt);
  const hm = (t) => `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  const date = d ? d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  const incs = x.incidents || [];
  const lights = incs.filter((i) => i.lights).length;
  const crew = (x.colleagues || []).filter((c) => !person || !sameName(c, person));
  const title = x.isSeg ? (incs[0] || {}).alarmCode || 'SEG-Einsatz' : vehicle ? x.location || 'Dienst' : x.vehicle || 'Dienst';
  const sub = [x.isSeg ? `SEG${x.location && !station ? ' · ' + x.location : ''}` : vehicle || station ? '' : x.location || '', d && e ? `${hm(d)}–${hm(e)}` : '', crew.length ? `👥 ${crew.join(', ')}` : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="cp-svc is-rich" data-cp-svc="${escHtml(x.id)}">
    <span class="cp-svc-d">${shiftCodeHtml(x.startAt, 'is-small')}<span>${escHtml(date)}</span></span>
    <span class="cp-svc-m"><span class="cp-svc-t">${escHtml(title)}</span>${sub ? `<small>${escHtml(sub)}</small>` : ''}</span>
    <span class="cp-svc-r"><span class="cp-svc-n">${incs.length}</span>${lights ? `<small>🔵 ${lights}</small>` : ''}</span></button>`;
}

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
  const others = countTop(shared.flatMap((x) => (x.colleagues || []).filter((c) => !sameName(c, name))), 4);
  const vehs = countTop(duty.map((x) => x.vehicle), 5);
  const places = countTop(shared.map((x) => x.location), 3);
  const comps = countTop(incs.flatMap((i) => i.extraVehicles || []), 4);
  const wild = duty.slice().sort((a, b) => (b.incidents || []).length - (a.incidents || []).length)[0];
  const span = shared.length ? `seit ${day(shared[shared.length - 1])} gemeinsam unterwegs${shared.length > 1 ? ` · zuletzt ${day(shared[0])}` : ''}` : 'noch kein gemeinsamer Dienst';
  const vic = veh ? vehicleIconSrc(veh[0]) : '';
  const vibe = !duty.length ? '' : avgWith >= avgAll + 0.5 ? '🌪️ wilder' : avgWith <= avgAll - 0.5 ? '🍀 ruhiger' : '⚖️ wie immer';
  document.getElementById('colleague-title').textContent = 'Kolleg:in';
  box.innerHTML = `<div class="cp-head">
      <span class="cp-av" style="--h:${colleagueHue(name)}">${escHtml(colleagueInitials(name))}</span>
      <div><h3>${escHtml(name)}</h3><span>${escHtml(span)}</span></div>
    </div>
    <div class="cp-tiles">
      <div><strong>${duty.length}</strong><small>Dienste</small></div>
      <div><strong>${Math.round(hours)}</strong><small>Stunden</small></div>
      <div><strong>${incs.length}</strong><small>Einsätze</small></div>
      <div><strong>${incs.length ? Math.round((lights / incs.length) * 100) + '%' : '–'}</strong><small>Blaulicht</small></div>
    </div>
    ${duty.length ? `<p class="cp-line">Ø <strong>${fmt1(avgWith)}</strong> Einsätze/Dienst (sonst ${fmt1(avgAll)}) · ${vibe} · 🌙 ${nights} Nächte</p>` : ''}
    ${veh ? `<div class="cp-veh">${vic ? `<img src="${escHtml(vic)}" alt="">` : '🚑'}<span>Meist zusammen auf <strong class="crew-link" role="button" data-vehicle="${escHtml(veh[0])}">${escHtml(veh[0])}</strong> · ${veh[1]}×</span></div>` : ''}
    ${kws.length ? `<div class="cp-sub">Häufigste Stichwörter</div><div class="cp-chips">${kws.map(([k, n]) => `<span>${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    ${wild && (wild.incidents || []).length > 1 ? `<p class="cp-line">🔥 Wildester gemeinsamer Dienst: <strong>${wild.incidents.length} Einsätze</strong> am ${escHtml(day(wild))}</p>` : ''}
    ${vehs.length > 1 ? `<div class="cp-sub">Gemeinsame Fahrzeuge</div><div class="cp-chips">${vehs.map(([k, n]) => `<span class="crew-link" role="button" data-vehicle="${escHtml(k)}">${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    ${places.length ? `<div class="cp-sub">Dienststellen</div><div class="cp-chips">${places.map(([k, n]) => `<span class="crew-link" role="button" data-station="${escHtml(k)}">${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    ${comps.length ? `<div class="cp-sub">Gemeinsam getroffen</div><div class="cp-chips">${comps.map(([k, n]) => `<span class="crew-link" role="button" data-vehicle="${escHtml(k)}">${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    ${others.length ? `<div class="cp-sub">Oft auch dabei</div><div class="cp-chips">${others.map(([k, n]) => `<span class="crew-link" role="button" data-colleague="${escHtml(k)}">${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    <div class="cp-sub">Gemeinsame Dienste · ${shared.length}</div>
    <div class="cp-list">${shared.slice(0, 40).map((x) => cpSvcRowHtml(x, { person: name })).join('')}
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
// ── Fahrzeug-Profil ─────────────────────────────────────────────────────────
function openVehicleProfile(name) {
  const box = document.getElementById('colleague-body');
  if (!box || !name) return;
  const sorted = state.services.slice().sort((a, b) => (b.startAt || '').localeCompare(a.startAt || ''));
  const own = sorted.filter((x) => sameName(x.vehicle, name));
  const duty = own.filter((x) => !x.isSeg);
  const ownIncs = own.flatMap((x) => x.incidents || []);
  const joint = sorted.flatMap((x) => (x.incidents || []).filter((i) => (i.extraVehicles || []).some((v) => sameName(v, name))).map((inc) => ({ inc, svc: x })));
  const hours = duty.reduce((n, x) => n + +serviceDurationHours(x), 0);
  const lights = ownIncs.filter((i) => i.lights).length;
  const nights = duty.filter((x) => { const c = shiftCode(x.startAt); return c && !c.day; }).length;
  const crew = countTop(own.flatMap((x) => x.colleagues || []), 8);
  const kws = countTop(ownIncs.map((i) => i.alarmCode), 3);
  const comps = countTop(ownIncs.flatMap((i) => i.extraVehicles || []).filter((v) => !sameName(v, name)), 4);
  const jointKws = countTop(joint.map((x) => x.inc.alarmCode), 3);
  const vStations = countTop(duty.map((x) => x.location), 4);
  const jointMine = countTop(joint.map((x) => x.svc.vehicle), 3);
  const fmt1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  const day = (x) => { const d = parseLocalDt(x.startAt); return d ? d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; };
  const firstSeen = [...own, ...joint.map((x) => x.svc)].sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''))[0];
  const ic = vehicleIconSrc(name);
  const vlink = (k, n) => `<span class="crew-link" role="button" data-vehicle="${escHtml(k)}">${escHtml(k)} · ${n}×</span>`;
  const sub = [own.length ? `${duty.length} ${duty.length === 1 ? 'Dienst' : 'Dienste'}` : '', joint.length ? `${joint.length} gemeinsame ${joint.length === 1 ? 'Einsatz' : 'Einsätze'}` : ''].filter(Boolean).join(' · ');
  document.getElementById('colleague-title').textContent = 'Fahrzeug';
  box.innerHTML = `<div class="cp-head">
      <span class="cp-vimg">${ic ? `<img src="${escHtml(ic)}" alt="">` : '🚑'}</span>
      <div><h3>${escHtml(name)}</h3><span>${sub || 'noch keine Einträge'}${firstSeen ? ` · seit ${escHtml(day(firstSeen))}` : ''}</span></div>
    </div>
    ${own.length ? `<div class="cp-tiles">
      <div><strong>${duty.length}</strong><small>Dienste</small></div>
      <div><strong>${Math.round(hours)}</strong><small>Stunden</small></div>
      <div><strong>${ownIncs.length}</strong><small>Einsätze</small></div>
      <div><strong>${ownIncs.length ? Math.round((lights / ownIncs.length) * 100) + '%' : '–'}</strong><small>Blaulicht</small></div>
    </div>
    ${duty.length ? `<p class="cp-line">Ø <strong>${fmt1(ownIncs.length / duty.length)}</strong> Einsätze pro Dienst · 🌙 ${nights} Nachtdienste</p>` : ''}` : ''}
    ${crew.length ? `<div class="cp-sub">Am öftesten mit dir drauf</div><div class="cp-chips">${crew.map(([k, n]) => `<span class="crew-link" role="button" data-colleague="${escHtml(k)}">${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    ${vStations.length ? `<div class="cp-sub">Dienststellen</div><div class="cp-chips">${vStations.map(([k, n]) => `<span class="crew-link" role="button" data-station="${escHtml(k)}">${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    ${kws.length ? `<div class="cp-sub">Häufigste Stichwörter</div><div class="cp-chips">${kws.map(([k, n]) => `<span>${escHtml(k)} · ${n}×</span>`).join('')}</div>` : ''}
    ${comps.length ? `<div class="cp-sub">Oft zusammen mit</div><div class="cp-chips">${comps.map(([k, n]) => vlink(k, n)).join('')}</div>` : ''}
    ${joint.length ? `<div class="cp-sub">Gemeinsame Einsätze · ${joint.length}</div>
      ${jointMine.length ? `<p class="cp-line">Du warst dabei auf ${jointMine.map(([k, n]) => `<span class="crew-link" role="button" data-vehicle="${escHtml(k)}">${escHtml(k)}</span> (${n}×)`).join(', ')}${jointKws.length ? ` · meist ${jointKws.map(([k]) => escHtml(k)).join(', ')}` : ''}</p>` : ''}
      <div class="cp-list">${joint.slice(0, 40).map((x) => `<button type="button" class="cp-svc" data-vp-inc="${escHtml(x.inc.id)}" data-vp-svc="${escHtml(x.svc.id)}">
        <span class="cp-svc-d">${shiftCodeHtml(x.svc.startAt, 'is-small')}<span>${escHtml(day(x.svc))}</span></span>
        <span class="cp-svc-t">${x.inc.lights ? '🔵 ' : ''}${escHtml(x.inc.alarmCode || 'Einsatz')}</span>
        <span class="cp-svc-n">${escHtml(x.svc.vehicle || '')}</span></button>`).join('')}
        ${joint.length > 40 ? `<p class="cp-line">… und ${joint.length - 40} weitere</p>` : ''}</div>` : ''}
    ${own.length ? `<div class="cp-sub">Deine Dienste darauf · ${own.length}</div>
    <div class="cp-list">${own.slice(0, 40).map((x) => cpSvcRowHtml(x, { vehicle: name })).join('')}
      ${own.length > 40 ? `<p class="cp-line">… und ${own.length - 40} weitere</p>` : ''}</div>` : ''}`;
  const leave = (fn) => { closeDialog('dialog-colleague'); document.querySelectorAll('.lp-ov').forEach((x) => x.remove()); if (story) closeStory(); setTimeout(fn, 260); };
  box.querySelectorAll('[data-cp-svc]').forEach((b) => b.addEventListener('click', () => {
    const sv = state.services.find((x) => x.id === b.dataset.cpSvc);
    leave(() => { if (sv && sv.isSeg) openIncidentView(sv.id, (sv.incidents[0] || {}).id); else if (sv) openServiceDetail(sv.id); });
  }));
  box.querySelectorAll('[data-vp-inc]').forEach((b) => b.addEventListener('click', () => leave(() => openIncidentView(b.dataset.vpSvc, b.dataset.vpInc))));
  box.scrollTop = 0;
  openDialog('dialog-colleague');
}
// ── Dienststellen-Profil ────────────────────────────────────────────────────
/** Schlüssel einer Dienststelle: jeder Listeneintrag ist eigenständig (die ID verbindet nur zum
 *  Tagesdienstplan). Dienst-Einträge werden wie beim Dienstplan-Link dem passenden Namen zugeordnet. */
function stationKey(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const abt = findAbteilung({ location: n });
  return 'n:' + (abt ? abt.name : n).toLowerCase();
}

// ── Karte (OpenStreetMap) für die Dienststellen-Visitenkarte ──
const GEO_CACHE_KEY = 'etb_geo_cache';
/** Koordinaten aus einem Google-Maps-Link (falls enthalten). */
function coordsFromMapsLink(url) {
  const m = String(url).match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || String(url).match(/[?&](?:q|query|ll|destination|center)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) || String(url).match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  return m ? { lat: +m[1], lon: +m[2] } : null;
}
let geoQueue = Promise.resolve();
/** Adresse → Koordinaten (Nominatim, höchstens 1 Abfrage/s, Ergebnis wird auf dem Gerät gemerkt). */
function geocodeAddress(addr, near = null) {
  const a = String(addr || '').trim();
  if (!a) return Promise.resolve(null);
  if (/^https?:\/\//i.test(a)) return Promise.resolve(coordsFromMapsLink(a));
  let cache = {};
  try { cache = JSON.parse(lsGet(GEO_CACHE_KEY, '{}')) || {}; } catch (_) {}
  const hit = cache[a.toLowerCase()];
  if (hit && (hit.lat !== undefined || Date.now() - hit.at < 7 * 864e5)) return Promise.resolve(hit.lat !== undefined ? hit : null);
  if (!navigator.onLine) return Promise.resolve(null);
  const vb = near ? `&viewbox=${near.lon - 0.8},${near.lat + 0.6},${near.lon + 0.8},${near.lat - 0.6}` : '';
  const run = () => fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=de${vb}&q=${encodeURIComponent(a)}`, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((list) => {
      const x = Array.isArray(list) && list[0];
      const res = x ? { lat: +x.lat, lon: +x.lon, at: Date.now() } : { at: Date.now() };
      try { const c = JSON.parse(lsGet(GEO_CACHE_KEY, '{}')) || {}; c[a.toLowerCase()] = res; lsSet(GEO_CACHE_KEY, JSON.stringify(c)); } catch (_) {}
      return x ? res : null;
    })
    .catch(() => null);
  const p = geoQueue.then(run);
  geoQueue = p.then(() => new Promise((r) => setTimeout(r, 1100)));
  return p;
}
/** Kartenausschnitt aus OSM-Kacheln, Punkt in der Mitte (ohne Bibliothek). */
const ST_MAP_ZOOM = 15, ST_MAP_ZOOM_MIN = 11, ST_MAP_ZOOM_MAX = 18;
function osmTilesHtml(lat, lon, z = ST_MAP_ZOOM) {
  const n = 2 ** z, rad = (lat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * n, y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const fx = Math.floor(x), fy = Math.floor(y);
  let out = '';
  for (let tx = fx - 2; tx <= fx + 2; tx++) for (let ty = fy - 1; ty <= fy + 1; ty++) {
    if (ty < 0 || ty >= n) continue;
    out += `<img src="https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png" alt="" loading="lazy" decoding="async" referrerpolicy="strict-origin-when-cross-origin" style="left:calc(50% + ${Math.round((tx - x) * 256)}px);top:calc(50% + ${Math.round((ty - y) * 256)}px)">`;
  }
  return `<div class="st-map-tiles">${out}</div><span class="st-pin" aria-hidden="true"></span>`;
}
const ICON_STATION = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V9.5L12 4l8 5.5V21h-5.5v-5h-5v5zM11 8v2H9v2h2v2h2v-2h2v-2h-2V8z" fill="currentColor"/></svg>';
function openStationProfile(name) {
  const box = document.getElementById('colleague-body');
  name = String(name || '').trim();
  if (!box || !name) return;
  const key = stationKey(name);
  const abt = findAbteilung({ location: name });
  const title = abt ? abt.name : name;
  const own = state.services.filter((x) => x.location && stationKey(x.location) === key)
    .sort((a, b) => (b.startAt || '').localeCompare(a.startAt || ''));
  const duty = own.filter((x) => !x.isSeg);
  const incs = own.flatMap((x) => x.incidents || []);
  const hours = duty.reduce((n, x) => n + +serviceDurationHours(x), 0);
  const lights = incs.filter((i) => i.lights).length;
  const nights = duty.filter((x) => { const c = shiftCode(x.startAt); return c && !c.day; }).length;
  const vehs = countTop(duty.map((x) => x.vehicle), 6);
  const crew = countTop(own.flatMap((x) => x.colleagues || []), 8);
  const kws = countTop(incs.map((i) => i.alarmCode), 4);
  const dests = countTop(incs.map((i) => String(i.to || '').trim()), 4);
  const aliases = [...new Set(own.map((x) => x.location.trim()).filter((n) => n && !sameName(n, title)))].slice(0, 6);
  const fmt1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  const day = (x) => { const d = parseLocalDt(x.startAt); return d ? d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; };
  const wild = duty.slice().sort((a, b) => (b.incidents || []).length - (a.incidents || []).length)[0];
  const addr = abt ? String(abt.address || '').trim() : '';
  const isLink = addr && /^https?:\/\//i.test(addr);
  const today = localDateStr(new Date()) + 'T00:00';
  const tdp = abt && abt.deptId ? dienstplanUrl({ location: title, startAt: today }) : null;
  const sub = [abt && abt.deptId ? `ID ${abt.deptId}` : '', own.length ? `seit ${day(own[own.length - 1])}` : 'noch keine Dienste', own.length > 1 ? `zuletzt ${day(own[0])}` : ''].filter(Boolean).join(' · ');
  const chips = (arr, attr) => arr.map(([k, n]) => `<span${attr ? ` class="crew-link" role="button" ${attr}="${escHtml(k)}"` : ''}>${escHtml(k)} · ${n}×</span>`).join('');
  document.getElementById('colleague-title').textContent = 'Dienststelle';
  box.innerHTML = `<div class="st-card" style="--h:${colleagueHue(title)}">
      <div class="st-map" aria-hidden="true"></div>
      <div class="st-card-body">
        <span class="cp-av cp-station">${ICON_STATION}</span>
        <div class="st-card-t"><h3>${escHtml(title)}</h3><span>${escHtml(sub)}</span>${addr && !isLink ? `<span class="st-addr">📍 ${escHtml(addr)}</span>` : ''}</div>
      </div>
      <span class="st-attrib" hidden>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></span>
      <a class="st-open" hidden target="_blank" rel="noopener" aria-label="Standort in Google Maps öffnen"></a>
      <span class="st-zoom" hidden><button type="button" data-z="-1" aria-label="Karte weiter weg">−</button><button type="button" data-z="1" aria-label="Karte näher">＋</button></span>
    </div>
    ${addr || tdp ? `<div class="cp-actions">
      ${addr ? `<a class="cp-act" href="${escHtml(mapsRouteUrl(addr))}" target="_blank" rel="noopener">${ICON_CAR_FRONT}<span>Route</span></a>` : ''}
      ${addr && !isLink ? `<a class="cp-act" ${safariLinkAttrs('https://verkehrsauskunft.verbundlinie.at/?Z=' + encodeURIComponent(addr))}>${ICON_BUS_FRONT}<span>Öffis</span></a>` : ''}
      ${tdp ? `<a class="cp-act" ${dpLinkAttrs(tdp)}>${ICON_CAL}<span>Dienstplan heute</span></a>` : ''}
    </div>` : ''}
    ${own.length ? `<div class="cp-tiles">
      <div><strong>${duty.length}</strong><small>Dienste</small></div>
      <div><strong>${Math.round(hours)}</strong><small>Stunden</small></div>
      <div><strong>${incs.length}</strong><small>Einsätze</small></div>
      <div><strong>${incs.length ? Math.round((lights / incs.length) * 100) + '%' : '–'}</strong><small>Blaulicht</small></div>
    </div>` : ''}
    ${duty.length ? `<p class="cp-line">Ø <strong>${fmt1(incs.length / duty.length)}</strong> Einsätze pro Dienst · 🌙 ${nights} Nachtdienste</p>` : ''}
    ${wild && (wild.incidents || []).length > 1 ? `<p class="cp-line">🔥 Wildester Dienst hier: <strong>${wild.incidents.length} Einsätze</strong> am ${escHtml(day(wild))}</p>` : ''}
    ${vehs.length ? `<div class="cp-sub">Fahrzeuge</div><div class="cp-chips">${chips(vehs, 'data-vehicle')}</div>` : ''}
    ${crew.length ? `<div class="cp-sub">Am öftesten mit dir hier</div><div class="cp-chips">${chips(crew, 'data-colleague')}</div>` : ''}
    ${kws.length ? `<div class="cp-sub">Häufigste Stichwörter</div><div class="cp-chips">${chips(kws)}</div>` : ''}
    ${dests.length ? `<div class="cp-sub">Häufigste Ziele</div><div class="cp-chips">${chips(dests)}</div>` : ''}
    ${aliases.length ? `<div class="cp-sub">Auch eingetragen als</div><div class="cp-chips">${aliases.map((a) => `<span>${escHtml(a)}</span>`).join('')}</div>` : ''}
    ${own.length ? `<div class="cp-sub">Deine Dienste hier · ${own.length}</div>
    <div class="cp-list">${own.slice(0, 40).map((x) => cpSvcRowHtml(x, { station: true })).join('')}
      ${own.length > 40 ? `<p class="cp-line">… und ${own.length - 40} weitere</p>` : ''}</div>` : ''}`;
  box.querySelectorAll('[data-cp-svc]').forEach((b) => b.addEventListener('click', () => {
    const sv = state.services.find((x) => x.id === b.dataset.cpSvc);
    closeDialog('dialog-colleague'); document.querySelectorAll('.lp-ov').forEach((x) => x.remove()); if (story) closeStory();
    setTimeout(() => { if (sv && sv.isSeg) openIncidentView(sv.id, (sv.incidents[0] || {}).id); else if (sv) openServiceDetail(sv.id); }, 260);
  }));
  box.scrollTop = 0;
  openDialog('dialog-colleague');
  if (addr) fillPlaceMap(box.querySelector('.st-card'), addr, abt);
}
// ── Orte-Profil (Ziele und Startorte von Einsätzen) ──────────────────────────
const placeKey = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const ICON_PLACE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z" fill="currentColor"/></svg>';
/** Hinterlegte Adresse eines Orts (Einstellungen → Orte & Ziele), sonst der Name selbst. */
function placeAddress(name) { return ((state.placeAddresses || {})[placeKey(name)] || '').trim(); }
/** Visitenkarte für einen Ort (Ziel oder Startort) mit Karte, Kennzahlen und den Einsätzen dort. */
function openPlaceProfile(name) {
  const box = document.getElementById('colleague-body');
  name = String(name || '').trim();
  if (!box || !name) return;
  const key = placeKey(name);
  const rows = state.services.flatMap((svc) => (svc.incidents || []).map((inc) => ({ inc, svc })))
    .filter(({ inc }) => placeKey(inc.to) === key || placeKey(inc.from) === key)
    .sort((a, b) => `${b.svc.startAt || ''}|${b.inc.createdAt || ''}`.localeCompare(`${a.svc.startAt || ''}|${a.inc.createdAt || ''}`));
  const asTo = rows.filter(({ inc }) => placeKey(inc.to) === key);
  const asFrom = rows.filter(({ inc }) => placeKey(inc.from) === key);
  const incs = rows.map((x) => x.inc);
  const lights = incs.filter((i) => i.lights).length;
  const kws = countTop(incs.map((i) => i.alarmCode), 5);
  const pzcs = countTop(incs.map((i) => (i.pzc && i.pzc.diag ? i.pzc.diag + (pzcDiagnosis(i.pzc.diag) ? ' – ' + pzcDiagnosis(i.pzc.diag) : '') : '')), 4);
  const vehs = countTop(rows.map(({ svc }) => svc.vehicle), 5);
  const fromHere = countTop(asTo.map(({ inc }) => String(inc.from || '').trim()), 4);
  const toThere = countTop(asFrom.map(({ inc }) => String(inc.to || '').trim()), 4);
  const tMin = asTo.map(({ inc }) => hmDiff((inc.times || {}).transport, (inc.times || {}).ziel)).filter((m) => m !== null && m > 0 && m < 240);
  const avgT = tMin.length ? Math.round(tMin.reduce((a, b) => a + b, 0) / tMin.length) : null;
  const ages = asTo.map(({ inc }) => parseInt((inc.pzc || {}).age, 10)).filter((a) => a >= 0 && a < 120);
  const display = (() => { const m = countTop(rows.flatMap(({ inc }) => [inc.to, inc.from].filter((v) => placeKey(v) === key).map((v) => String(v).trim())), 1)[0]; return m ? m[0] : name; })();
  const day = (d) => (d ? d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const dOf = (x) => parseLocalDt(x.svc.startAt);
  const sub = [rows.length ? `seit ${day(dOf(rows[rows.length - 1]))}` : 'noch keine Einsätze', rows.length > 1 ? `zuletzt ${day(dOf(rows[0]))}` : ''].filter(Boolean).join(' · ');
  const chips = (arr, attr) => arr.map(([k, n]) => `<span${attr ? ` class="crew-link" role="button" ${attr}="${escHtml(k)}"` : ''}>${escHtml(k)} · ${n}×</span>`).join('');
  const isLink = /^https?:\/\//i.test(name);
  document.getElementById('colleague-title').textContent = asTo.length >= asFrom.length ? 'Ziel' : 'Startort';
  box.innerHTML = `<div class="st-card is-place" style="--h:${colleagueHue(display)}">
      <div class="st-map" aria-hidden="true"></div>
      <div class="st-card-body">
        <span class="cp-av cp-station">${ICON_PLACE}</span>
        <div class="st-card-t"><h3>${escHtml(display)}</h3><span>${escHtml(sub)}</span>${placeAddress(display) ? `<span class="st-addr">📍 ${escHtml(placeAddress(display))}</span>` : ''}</div>
      </div>
      <span class="st-attrib" hidden>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></span>
      <a class="st-open" hidden target="_blank" rel="noopener" aria-label="In Google Maps öffnen"></a>
      <span class="st-zoom" hidden><button type="button" data-z="-1" aria-label="Karte weiter weg">−</button><button type="button" data-z="1" aria-label="Karte näher">＋</button></span>
    </div>
    ${!isLink ? `<div class="cp-actions">
      <a class="cp-act" href="${escHtml(mapsRouteUrl(placeAddress(display) || display))}" target="_blank" rel="noopener">${ICON_CAR_FRONT}<span>Route</span></a>
      ${/^https?:\/\//i.test(placeAddress(display)) ? '' : `<a class="cp-act" ${safariLinkAttrs('https://verkehrsauskunft.verbundlinie.at/?Z=' + encodeURIComponent(placeAddress(display) || display))}>${ICON_BUS_FRONT}<span>Öffis</span></a>`}
      <button type="button" class="cp-act" id="pl-addr">📍<span>${placeAddress(display) ? 'Adresse ändern' : 'Adresse festlegen'}</span></button>
    </div>` : ''}
    <div class="cp-tiles">
      <div><strong>${asTo.length}</strong><small>als Ziel</small></div>
      <div><strong>${asFrom.length}</strong><small>als Start</small></div>
      <div><strong>${incs.length ? Math.round((lights / incs.length) * 100) + '%' : '–'}</strong><small>Blaulicht</small></div>
      <div><strong>${avgT !== null ? avgT + '′' : '–'}</strong><small>Ø Transport</small></div>
    </div>
    ${ages.length ? `<p class="cp-line">Ø Patientenalter <strong>${Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)}</strong> Jahre (${ages.length} erfasst)</p>` : ''}
    ${kws.length ? `<div class="cp-sub">Häufigste Stichwörter</div><div class="cp-chips">${chips(kws)}</div>` : ''}
    ${pzcs.length ? `<div class="cp-sub">Häufigste PZC</div><div class="cp-chips">${chips(pzcs)}</div>` : ''}
    ${fromHere.length ? `<div class="cp-sub">Gebracht von</div><div class="cp-chips">${chips(fromHere, 'data-place')}</div>` : ''}
    ${toThere.length ? `<div class="cp-sub">Von hier nach</div><div class="cp-chips">${chips(toThere, 'data-place')}</div>` : ''}
    ${vehs.length ? `<div class="cp-sub">Mit Fahrzeug</div><div class="cp-chips">${chips(vehs, 'data-vehicle')}</div>` : ''}
    ${rows.length ? `<div class="cp-sub">Einsätze · ${rows.length}</div>
    <div class="cp-list">${rows.slice(0, 40).map(({ inc, svc }) => `<button type="button" class="cp-svc" data-pl-inc="${escHtml(inc.id)}" data-pl-svc="${escHtml(svc.id)}">
        <span class="cp-svc-d">${shiftCodeHtml(svc.startAt, 'is-small')}<span>${escHtml(day(parseLocalDt(svc.startAt)))}</span></span>
        <span class="cp-svc-m"><span class="cp-svc-t">${inc.lights ? '🔵 ' : ''}${escHtml(inc.alarmCode || 'Einsatz')}</span><small>${escHtml(placeKey(inc.to) === key ? `von ${inc.from || '—'}` : `nach ${inc.to || '—'}`)}</small></span>
        <span class="cp-svc-n">${escHtml(svc.vehicle || '')}</span></button>`).join('')}
      ${rows.length > 40 ? `<p class="cp-line">… und ${rows.length - 40} weitere</p>` : ''}</div>` : ''}`;
  box.querySelectorAll('[data-pl-inc]').forEach((b) => b.addEventListener('click', () => {
    closeDialog('dialog-colleague'); document.querySelectorAll('.lp-ov').forEach((x) => x.remove()); if (story) closeStory();
    setTimeout(() => openIncidentView(b.dataset.plSvc, b.dataset.plInc), 260);
  }));
  box.scrollTop = 0;
  openDialog('dialog-colleague');
  fillPlaceMap(box.querySelector('.st-card'), placeAddress(display) || (isLink ? name : display), null, homeGeoBias());
  const ab = box.querySelector('#pl-addr');
  if (ab) ab.addEventListener('click', () => {
    const cur = placeAddress(display);
    const v = prompt(`Adresse für „${display}“ (für Karte und Route):`, cur);
    if (v === null) return;
    state.placeAddresses = state.placeAddresses || {};
    if (v.trim()) state.placeAddresses[key] = v.trim(); else delete state.placeAddresses[key];
    saveState(); openPlaceProfile(display);
  });
}
/** Bezugspunkt für die Ortssuche: erste Dienststelle mit bekanntem Standort (Treffer in der Nähe bevorzugen). */
function homeGeoBias() {
  let cache = {};
  try { cache = JSON.parse(lsGet(GEO_CACHE_KEY, '{}')) || {}; } catch (_) {}
  for (const a of state.dienststellen || []) {
    const ad = String(a.address || '').trim();
    if (!ad) continue;
    const c = /^https?:\/\//i.test(ad) ? coordsFromMapsLink(ad) : cache[ad.toLowerCase()];
    if (c && c.lat !== undefined) return { lat: c.lat, lon: c.lon };
  }
  return null;
}
/** Karte in eine Visitenkarte laden (Zoom je Dienststelle merken, falls `abt`). */
function fillPlaceMap(card, addr, abt, near = null) {
  if (!card || !addr) return;
  const isLink = /^https?:\/\//i.test(addr);
  geocodeAddress(addr, near).then((c) => {
    if (!c || !card.isConnected) return;
    let z = Math.min(ST_MAP_ZOOM_MAX, Math.max(ST_MAP_ZOOM_MIN, +(abt && abt.mapZoom) || ST_MAP_ZOOM));
    const draw = () => { card.querySelector('.st-map').innerHTML = osmTilesHtml(c.lat, c.lon, z); };
    draw();
    card.classList.add('has-map');
    card.querySelector('.st-attrib').hidden = false;
    const open = card.querySelector('.st-open');
    open.href = isLink ? addr : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
    open.hidden = false;
    const zb = card.querySelector('.st-zoom');
    zb.hidden = false;
    zb.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const nz = Math.min(ST_MAP_ZOOM_MAX, Math.max(ST_MAP_ZOOM_MIN, z + +b.dataset.z));
      if (nz === z) return;
      z = nz; draw();
      if (abt) { if (z === ST_MAP_ZOOM) delete abt.mapZoom; else abt.mapZoom = z; saveState(); }
    }));
  });
}
document.addEventListener('click', (e) => {
  const pl = e.target.closest && e.target.closest('[data-place]');
  if (!pl) return;
  e.stopPropagation(); e.preventDefault();
  openPlaceProfile(pl.dataset.place);
}, true);
document.addEventListener('click', (e) => {
  const st = e.target.closest && e.target.closest('[data-station]');
  if (!st) return;
  e.stopPropagation(); e.preventDefault();
  openStationProfile(st.dataset.station);
}, true);
document.addEventListener('click', (e) => {
  const v = e.target.closest && e.target.closest('[data-vehicle]');
  if (!v) return;
  e.stopPropagation(); e.preventDefault();
  openVehicleProfile(v.dataset.vehicle);
}, true);

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
  // ── neue Abzeichen ──
  const T = (x) => x.inc.times || {};
  const quick = incs.filter((x) => { const m = hmDiff(T(x).erhalten, T(x).anfahrt); return m !== null && m <= 1; });
  const transports = incs.filter((x) => has(x.inc.to) || T(x).transport);
  const distinctBy = (getKey, goal) => { const seen = new Set(); for (const x of incs) { const k = getKey(x); if (k) seen.add(k); if (seen.size >= goal) return { n: seen.size, date: dOf(x) }; } return { n: seen.size, date: '' }; };
  const normPlace = (v) => (has(v) ? String(v).trim().toLowerCase() : '');
  const places25 = distinctBy((x) => normPlace(x.inc.to), 25);
  let regular = { n: 0, date: '' };
  { const m = new Map(); for (const x of incs) { const k = normPlace(x.inc.to); if (!k) continue; const v = (m.get(k) || 0) + 1; m.set(k, v); if (v > regular.n) regular = { n: v, date: v === 20 ? dOf(x) : regular.date }; } }
  const exv = (x) => (x.inc.extraVehicles || []).map((v) => String(v).toLowerCase());
  const RX_AIR = /rth|christophorus|hubschrauber|heli|\bc\s?\d{1,2}\b/, RX_POL = /polizei|\bpol\b|funkstreife|\bstw\b|cobra|\bpi\b/, RX_FW = /\bfw\b|feuerwehr|\bff\b|tlf|hlf|rlf|klf|kdo|lfb/;
  const air = incs.find((x) => exv(x).some((v) => RX_AIR.test(v)));
  const bluefam = incs.find((x) => exv(x).some((v) => RX_POL.test(v)) && exv(x).some((v) => RX_FW.test(v)));
  const ageOf = (x) => { const a = parseInt((x.inc.pzc || {}).age, 10); return a >= 0 && a < 120 ? a : null; };
  const kids = incs.filter((x) => { const a = ageOf(x); return a !== null && a < 18; });
  const old90 = incs.find((x) => ageOf(x) !== null && ageOf(x) > 90), baby = incs.find((x) => ageOf(x) === 0);
  const gens = old90 && baby ? [dOf(old90), dOf(baby)].sort().pop() : '';
  const early = incs.filter((x) => { const c = incAlarmAt(x.inc, x.svc); return c && c.getHours() >= 4 && c.getHours() < 6; });
  const holiday = duty.find((x) => { const a = parseLocalDt(x.startAt), e = parseLocalDt(x.endAt) || a; if (!a) return false; for (let d = new Date(a.getFullYear(), a.getMonth(), a.getDate()); d <= e; d = new Date(d.getTime() + 864e5)) { const md = d.getMonth() * 100 + d.getDate(); if (md === 1124 || md === 1125 || md === 1131) return true; } return false; });
  const isFull = (i) => has(i.naca) && has(i.einsatzart) && has(i.statKz) && has((i.pzc || {}).diag);
  const gapless = duty.find((x) => (x.incidents || []).length >= 3 && x.incidents.every(isFull));
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
    once('seg1', '📟', 'Einspringer:in', 'Erster SEG-Einsatz – aus der Freizeit alarmiert', segs[0], 1),
    once('manv', '🆘', 'Großschadenslage', 'Einsatz mit MANV-Stichwort', incs.find((x) => /manv/i.test(x.inc.alarmCode || '')), 3),
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
    count('quick10', '🚀', 'Blitzstart', '10× in höchstens 1 Minute ausgerückt', quick, 10, 2),
    { id: 'places25', icon: '🧭', title: 'Ortskundig', desc: '25 verschiedene Zielorte', cur: Math.min(places25.n, 25), goal: 25, date: places25.n >= 25 ? places25.date : '', tier: 2 },
    count('trans100', '🛣️', 'Kilometerfresser:in', '100 Transporte', transports, 100, 2),
    once('air', '🚁', 'Luftunterstützung', 'Einsatz gemeinsam mit dem Notarzthubschrauber', air, 2),
    once('bluefam', '👮', 'Blaulicht-Familie', 'Einsatz mit Polizei und Feuerwehr gleichzeitig', bluefam, 2),
    count('kids10', '👶', 'Kleine Held:innen', '10 Kinder und Jugendliche (unter 18)', kids, 10, 2),
    { id: 'gens', icon: '🧓', title: 'Generationen', desc: 'Patient:innen über 90 und unter 1 Jahr', cur: (old90 ? 1 : 0) + (baby ? 1 : 0), goal: 2, date: gens, tier: 3 },
    count('early25', '🌅', 'Frühaufsteher:in', '25 Einsätze zwischen 4 und 6 Uhr', early, 25, 2),
    once('holiday', '🎄', 'Feiertagsdienst', 'Dienst am 24., 25. oder 31. Dezember', holiday, 2),
    count('seg10', '📟', 'Dauer-Einspringer:in', '10 SEG-Einsätze', segs, 10, 3),
    once('gapless', '📝', 'Lückenlos', 'Ein Dienst (ab 3 Einsätzen) mit komplett dokumentierten Einsätzen', gapless, 2),
    { id: 'regular20', icon: '🔁', title: 'Stammgast', desc: '20 Mal dasselbe Ziel', cur: Math.min(regular.n, 20), goal: 20, date: regular.n >= 20 ? regular.date : '', tier: 1 },
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
  const next = all.filter((b) => !b.done).sort((a, b) => b.cur / b.goal - a.cur / a.goal).slice(0, 2);
  return `<section class="bd-card">
    <div class="bd-head"><span class="bd-head-ic">🏅</span><h4>Abzeichen</h4><span class="bd-count">${done.length}/${all.length}</span><button type="button" class="bd-all" data-badges-all>Alle ›</button></div>
    <div class="bd-compact">
      ${done.length ? `<div class="bd-strip">${done.slice(0, 10).map((b, i) => `<button type="button" class="bd-mini bd-t${b.tier}" style="--i:${i}" data-badge="${b.id}" title="${escHtml(b.title)}" aria-label="${escHtml(b.title)}">${b.icon}</button>`).join('')}${done.length > 10 ? `<button type="button" class="bd-mini is-more" data-badges-all>+${done.length - 10}</button>` : ''}</div>` : ''}
      ${next.map((b) => `<button type="button" class="bd-next" data-badge="${b.id}"><span class="bd-next-ic">${b.icon}</span><span class="bd-next-t"><b>${escHtml(b.title)}</b><small>${escHtml(b.desc)}</small></span><span class="bd-next-p"><span class="bd-p"><span style="width:${Math.round((b.cur / b.goal) * 100)}%"></span></span><small>${b.cur}/${b.goal}</small></span></button>`).join('')}
    </div>
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
      <div class="st-duel"><div class="st-duel-a">${vimg(a.name, false)}<b>${escHtml(a.name)}</b></div><div class="st-vs">VS</div><div class="st-duel-b">${vimg(b.name, false, 'is-flip')}<b>${escHtml(b.name)}</b></div></div>
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

  // Deine schnellste Anfahrt
  {
    const rows = r.incs.map((x) => { const t = x.inc.times || {}; return { x, m: hmDiff(t.anfahrt || t.erhalten, t.ort) }; }).filter((o) => o.m !== null && o.m > 0 && o.m < 120);
    if (rows.length >= 3) {
      const best = rows.reduce((a, b) => (b.m < a.m ? b : a));
      const avg = Math.round(rows.reduce((n, o) => n + o.m, 0) / rows.length);
      const { inc, svc } = best.x;
      pool.push({ bg: 'st-bg-4', fx: inc.lights ? 'sosi' : '', html: `<div class="st-kicker">Deine schnellste Anfahrt</div><div class="st-emoji">⚡</div>
        ${big(best.m)}<p class="st-lead">${best.m === 1 ? 'Minute' : 'Minuten'} bis zum Einsatzort</p>
        <p class="st-text"><strong>${escHtml(inc.alarmCode || 'Einsatz')}</strong>${inc.lights ? ' 🔵' : ''}<br>${escHtml(fmtDay(svc))}${svc.vehicle ? ' · ' + escHtml(svc.vehicle) : ''}</p>
        <div class="st-chip">Ø Anfahrt ${zr}: ${avg} min</div>
        <button type="button" class="st-link" data-st-inc="${escHtml(inc.id)}" data-st-svc="${escHtml(svc.id)}">Einsatz ansehen ›</button>` });
    }
  }
  // Dein längster Einsatz
  {
    const rows = r.incs.map((x) => ({ x, m: (incTimeSummary(x.inc.times).find(([l]) => l === 'Gesamt') || [])[1] })).filter((o) => o.m);
    if (rows.length >= 3) {
      const best = rows.reduce((a, b) => (b.m > a.m ? b : a));
      const { inc, svc } = best.x;
      const route = inc.from && inc.to ? `${escHtml(inc.from)} → ${escHtml(inc.to)}` : inc.to ? `nach ${escHtml(inc.to)}` : inc.from ? `ab ${escHtml(inc.from)}` : '';
      pool.push({ bg: 'st-bg-6', rain: '⏳', html: `<div class="st-kicker">Dein längster Einsatz</div><div class="st-emoji">⏳</div>
        <h2 class="st-title">${best.m < 60 ? `${best.m} min` : `${hmShort(best.m)} h`}</h2><p class="st-lead">vom Alarm bis zum Ende</p>
        <p class="st-text"><strong>${escHtml(inc.alarmCode || 'Einsatz')}</strong><br>${escHtml(fmtDay(svc))}${svc.vehicle ? ' · ' + escHtml(svc.vehicle) : ''}</p>${route ? `<p class="st-text">${route}</p>` : ''}
        <button type="button" class="st-link" data-st-inc="${escHtml(inc.id)}" data-st-svc="${escHtml(svc.id)}">Einsatz ansehen ›</button>` });
    }
  }
  // Deine häufigste Strecke
  {
    const m = new Map();
    r.incs.forEach(({ inc }) => { if (!inc.from || !inc.to) return; const k = `${inc.from.trim().toLowerCase()}→${inc.to.trim().toLowerCase()}`; const e = m.get(k) || { from: inc.from.trim(), to: inc.to.trim(), n: 0 }; e.n++; m.set(k, e); });
    const top = [...m.values()].sort((a, b) => b.n - a.n);
    if (top.length && top[0].n >= 2) {
      const t = top[0];
      pool.push({ bg: 'st-bg-7', html: `<div class="st-kicker">Deine häufigste Strecke</div><div class="st-emoji">🛣️</div>
        <div class="st-route"><b>${escHtml(t.from)}</b><span>↓</span><b>${escHtml(t.to)}</b></div>
        ${big(t.n)}<p class="st-lead">Mal ${zr}</p>
        ${top.length > 1 ? `<p class="st-text">Danach: ${top.slice(1, 3).map((x) => `${escHtml(x.from)} → ${escHtml(x.to)} (${x.n}×)`).join('<br>')}</p>` : ''}` });
    }
  }
  // Vergleich mit dem Zeitraum davor
  if (!isAll && r.prev.has && r.duty.length) {
    const cur = { s: r.duty.length, i: r.incs.length, h: Math.round(r.hours), l: r.lights, n: r.nights };
    const pv = { s: r.prev.services, i: r.prev.incidents, h: Math.round(r.prev.hours), l: r.prev.lights, n: r.prev.nights };
    const rowC = (label, a, b, i) => { const d = a - b; return `<li style="--i:${i}"><span class="st-cmp-l">${label}</span><span class="st-cmp-p">${fmtNum(b)}</span><span class="st-cmp-a">→</span><span class="st-cmp-c">${fmtNum(a)}</span><span class="st-cmp-d ${d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''}">${d > 0 ? '▲ ' + fmtNum(d) : d < 0 ? '▼ ' + fmtNum(-d) : '='}</span></li>`; };
    const more = cur.i - pv.i;
    pool.push({ bg: 'st-bg-11', html: `<div class="st-kicker">Im Vergleich zu ${escHtml(r.prev.label)}</div><div class="st-emoji">${more > 0 ? '📈' : more < 0 ? '📉' : '⚖️'}</div>
      <ul class="st-cmp">${rowC('Schichten', cur.s, pv.s, 0)}${rowC('Einsätze', cur.i, pv.i, 1)}${rowC('Stunden', cur.h, pv.h, 2)}${rowC('Blaulicht', cur.l, pv.l, 3)}${rowC('Nachtdienste', cur.n, pv.n, 4)}</ul>
      <p class="st-text">${more > 0 ? 'Mehr los als davor – die Sirene hatte Hochsaison. 🚨' : more < 0 ? 'Etwas ruhiger als davor – gönn dir. ☕' : 'Exakt gleich viele Einsätze – Präzisionsarbeit. 🎯'}</p>` });
  }
  // Dein Wochentag: Raster Wochentag × Tageszeit
  {
    const grid = Array.from({ length: 7 }, () => Array(8).fill(0)); let n = 0;
    r.incs.forEach(({ inc, svc }) => { const c = incAlarmAt(inc, svc) || parseLocalDt(svc.startAt); if (!c) return; grid[(c.getDay() + 6) % 7][Math.floor(c.getHours() / 3)]++; n++; });
    if (n >= 10) {
      const rowSum = grid.map((row) => row.reduce((a, b) => a + b, 0));
      const d = rowSum.indexOf(Math.max(...rowSum));
      const h = grid[d].indexOf(Math.max(...grid[d]));
      const mx = Math.max(1, ...grid.flat());
      const hh = (x) => String(x * 3).padStart(2, '0');
      const DN = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      pool.push({ bg: 'st-bg-9', html: `<div class="st-kicker">Dein Wochentag</div>
        <h2 class="st-title">${WEEKDAY_LONG[(d + 1) % 7]}</h2><p class="st-lead">${rowSum[d]} Einsätze · am meisten ${hh(h)}–${hh(h + 1)} Uhr</p>
        <div class="st-grid">${grid.map((row, di) => `<span class="st-grid-y${di === d ? ' is-best' : ''}">${DN[di]}</span>${row.map((v, hi) => `<span class="st-grid-c${di === d && hi === h ? ' is-best' : ''}" style="--a:${(v / mx).toFixed(2)};--i:${di * 8 + hi}"></span>`).join('')}`).join('')}</div>
        <div class="st-grid-x"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
        <p class="st-text">${d >= 5 ? 'Wochenende? Für dich eher Hauptsaison. 🎉' : d === 0 ? 'Montag – der Klassiker. ☕' : d === 4 ? 'Freitag: alle wollen ins Wochenende, du fährst Einsätze. 🚑' : 'Mitten in der Woche geht’s rund. 🔄'}</p>` });
    }
  }

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
    (state.vehicleCategories || []).forEach((c) => { const src = catSoSi(c) || catNormal(c); if (src && !seen.has(src) && syms.length < 5) { seen.add(src); syms.push({ key: src, html: sym(src) }); } });
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
  // Fokus aus dem geschlossenen Fenster nehmen – sonst bleibt die Tab Bar ausgeblendet
  if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
  if (el.id) el.style.display = 'none';
  else el.remove();
  resetSheetStyles(el);
  syncKbOpen();
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
  ['vcat-frames', 'vcat-mirror'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', updateVcatPreview); });
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
  liteKeyboard();
  applyVehicleMirror();
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
  // aneinander anschließende, noch nicht übernommene Einträge → „Zusammen übernehmen“ am ersten Teil
  const chainStart = new Map();
  dpShiftChains(shifts.filter((x) => !findSavedServiceForShift(x))).forEach((c) => chainStart.set(c[0], c));
  container.innerHTML = '';
  updateDpInboxBadge();
  for (const dayShifts of groups.values()) {
    const group = document.createElement('div');
    group.className = 'dp-day-group';
    group.innerHTML = `<h3 class="dp-day-heading">${escHtml(dpFormatDayHeading(dayShifts[0].start))}</h3>`;
    for (const s of dayShifts) {
      const saved = findSavedServiceForShift(s);
      const savedChange = saved ? pendingPlanChange(saved) : null;
      const savedPlan = saved ? planShiftForService(saved) : null;
      const partOf = savedPlan && savedPlan.parts ? `Teil von ${dpFormatTime(savedPlan.start)}–${dpFormatTime(savedPlan.end)} im Tagebuch` : '';
      const chain = !saved && chainStart.get(s);
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
        ${partOf ? `<div class="dp-shift-meta dp-part-hint">🔗 ${escHtml(partOf)}</div>` : ''}
        ${savedChange ? `<div class="dp-shift-meta dp-pc-hint">⚠︎ Tagebuch weicht ab: ${escHtml(savedChange.diff.map((d) => d.label).join(', '))}</div>` : ''}
        <div class="dp-shift-actions">
          ${historyCountHtml(histKey, hist)}
          ${saved
            ? (savedChange
              ? `<button type="button" class="btn-primary" data-pc-apply="${escHtml(saved.id)}">Übernehmen</button><button type="button" class="btn-secondary btn-dp-open">Öffnen</button>`
              : '<button type="button" class="btn-secondary btn-dp-open">✓ Gespeichert</button>')
            : '<button type="button" class="btn-primary btn-dp-import">Übernehmen</button>'}
          ${chain ? `<button type="button" class="btn-secondary btn-dp-chain">🔗 Zusammenfassen (${chain.length})</button>` : ''}
        </div>
        ${dpLink ? `<a ${dpLinkAttrs(dpLink)} class="dp-icon-link" title="Tagesdienstplan öffnen" aria-label="Tagesdienstplan öffnen">${ICON_CAL}</a>` : ''}`;
      const imp = card.querySelector('.btn-dp-import');
      if (imp) imp.addEventListener('click', () => importShiftToService(s));
      const chb = card.querySelector('.btn-dp-chain');
      if (chb) chb.addEventListener('click', () => importShiftChain(chain));
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

// ── Mehrteilige Dienste: ein Tagebuch-Dienst über mehrere Dienstplan-Einträge ──
const PART_MIN_OVERLAP = 30 * 60000, PART_MAX_GAP = 10 * 60000;
/** Dienstplan-Einträge, die zeitlich im Tagebuch-Dienst liegen (≥ 30 min Überschneidung). */
function planPartsForService(svc, shifts) {
  const st = parseLocalDt(svc && svc.startAt), en = parseLocalDt(svc && svc.endAt);
  if (!st || !en || svc.isSeg || !Array.isArray(shifts)) return [];
  return shifts.filter((x) => x && x.start && x.end && Math.min(+new Date(x.end), +en) - Math.max(+new Date(x.start), +st) >= PART_MIN_OVERLAP)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}
/** Mehrere Einträge zu einem Plan-Stand zusammenfassen: Beginn des ersten, Ende des letzten, alle Personen. */
function combinePlanParts(parts) {
  const vals = parts.map(planValuesFromShift);
  const crew = [];
  vals.forEach((v) => v.colleagues.forEach((c) => { if (!crew.some((x) => sameName(x, c))) crew.push(c); }));
  const end = parts.reduce((m, x) => (new Date(x.end) > new Date(m) ? x.end : m), parts[0].end);
  return { uid: parts[0].uid, start: parts[0].start, end, summary: parts[0].summary || '', location: vals[0].location, colleagues: crew, note: '', parts };
}
/** Direkt aneinander anschließende Einträge (gleiche Dienststelle) zu Ketten gruppieren. */
function dpShiftChains(shifts) {
  const chains = [];
  let cur = [];
  for (const s of shifts) {
    const prev = cur[cur.length - 1];
    const gap = prev ? new Date(s.start) - new Date(prev.end) : Infinity;
    if (prev && gap >= 0 && gap <= PART_MAX_GAP && (s.location || '').trim().toLowerCase() === (prev.location || '').trim().toLowerCase()) cur.push(s);
    else { if (cur.length > 1) chains.push(cur); cur = [s]; }
  }
  if (cur.length > 1) chains.push(cur);
  return chains;
}
/** Auswahl: zwischen welchen Teilen getrennt wird (✂︎) bzw. welche zu einem Dienst verbunden werden (🔗). */
function importShiftChain(parts) {
  const joined = parts.slice(1).map(() => true); // joined[i]: Teil i und i+1 verbunden
  const groups = () => { const g = [[parts[0]]]; parts.slice(1).forEach((p, i) => { if (joined[i]) g[g.length - 1].push(p); else g.push([p]); }); return g; };
  const hm = (iso) => dpFormatTime(iso);
  const crewOfPart = (x) => planValuesFromShift(x).colleagues.join(' · ');
  const ov = document.createElement('div');
  ov.className = 'dialog-overlay lp-ov';
  ov.style.zIndex = '2000';
  const render = () => {
    const g = groups();
    ov.innerHTML = `<div class="dialog-box lp-box ch-box" style="--mc:var(--accent)">
      <div class="lp-head"><span class="lp-ic">🔗</span>
        <div class="lp-head-t"><h3>Dienste zusammenfassen</h3><span>${parts.length} Einträge · Zwischen den Teilen antippen zum Trennen oder Verbinden</span></div>
        <button class="dialog-close lp-x" aria-label="Schließen">✕</button></div>
      <div class="dialog-body lp-body">
        <ol class="ch-list">${parts.map((x, i) => `<li class="ch-part">
            <span class="ch-time">${escHtml(hm(x.start))}–${escHtml(hm(x.end))}</span>
            <span class="ch-info"><b>${escHtml(x.summary || 'Dienst')}</b>${crewOfPart(x) ? `<small>👥 ${escHtml(crewOfPart(x))}</small>` : ''}</span>
            <span class="ch-dur">${escHtml(dpDuration(x.start, x.end))}</span></li>
          ${i < parts.length - 1 ? `<li class="ch-gap"><button type="button" class="ch-toggle${joined[i] ? ' is-on' : ''}" data-i="${i}" aria-pressed="${joined[i]}">${joined[i] ? '🔗 verbunden' : '✂︎ getrennt'}</button></li>` : ''}`).join('')}</ol>
        <div class="ch-result"><div class="cp-sub">Ergebnis · ${g.length} ${g.length === 1 ? 'Dienst' : 'Dienste'}</div>
          ${g.map((x) => `<div class="ch-res-row"><b>${escHtml(hm(x[0].start))}–${escHtml(hm(x[x.length - 1].end))}</b><span>${escHtml(dpDuration(x[0].start, x[x.length - 1].end))}${x.length > 1 ? ` · aus ${x.length} Teilen` : ''}</span></div>`).join('')}</div>
        <button type="button" class="btn-primary ch-go">${g.length === 1 ? 'Übernehmen' : `${g.length} Dienste anlegen`}</button>
      </div></div>`;
    ov.querySelector('.dialog-close').onclick = close;
    ov.querySelectorAll('.ch-toggle').forEach((b) => b.addEventListener('click', () => { joined[+b.dataset.i] = !joined[+b.dataset.i]; const st = ov.querySelector('.lp-body').scrollTop; render(); ov.querySelector('.lp-body').scrollTop = st; }));
    ov.querySelector('.ch-go').onclick = () => {
      const g2 = groups();
      close();
      if (g2.length === 1) {
        // ein Dienst: wie gewohnt im Dialog prüfen und speichern
        const c = combinePlanParts(g2[0]), v = planValuesFromShift(c);
        setTimeout(() => openServiceDialog(null, { start: v.startAt, end: v.endAt, location: v.location, vehicle: v.vehicle, colleagues: v.colleagues, dpUid: c.uid || '' }), 220);
        return;
      }
      // mehrere Dienste: direkt anlegen
      g2.forEach((grp) => {
        const c = grp.length > 1 ? combinePlanParts(grp) : grp[0];
        const v = planValuesFromShift(c);
        state.services.push({ id: uid(), startAt: v.startAt, endAt: v.endAt, vehicle: v.vehicle, location: v.location, colleagues: v.colleagues, note: '', incidents: [], isSeg: false, ...(c.uid ? { dpUid: c.uid } : {}) });
      });
      saveState();
      toast(`${g2.length} Dienste angelegt.`, 'success');
      refreshAfterPlanChange();
    };
  };
  const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 200); };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  render();
  document.body.appendChild(ov);
}

/** Bereits ins Tagebuch übernommener Dienst zu einem Dienstplan-Eintrag (±90 min). */
function findSavedServiceForShift(shift) {
  const svcs = state.services.filter((x) => !x.isSeg);
  if (shift.uid) {
    // 1. gemerkte Termin-ID, 2. Zuordnung über Verlauf/Beginnzeit (auch wenn sich die Zeit verschoben hat)
    const byId = svcs.find((x) => x.dpUid === shift.uid);
    if (byId) return byId;
    // umgeplanter Termin: Tagebuch kennt noch die alte ID
    const h = Object.values(readDpHistory()).find((x) => x.uid === shift.uid && (x.prevUids || []).length);
    const byPrev = h && svcs.find((x) => x.dpUid && h.prevUids.includes(x.dpUid));
    if (byPrev) return byPrev;
    const viaPlan = svcs.find((x) => { const p = planShiftForService(x); return p && p.uid === shift.uid && p.start === shift.start; });
    if (viaPlan) return viaPlan;
  }
  // Tagebuch-Dienst, in dem der Eintrag zeitlich liegt (z. B. 07–19 für die Teile 07–12, 12–17, 17–19)
  const cover = svcs.find((x) => planPartsForService(x, [shift]).length);
  if (cover) return cover;
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
  const parts = planPartsForService(svc, cache.shifts);
  if (parts.length > 1) return combinePlanParts(parts);
  const st = parseLocalDt(svc.startAt);
  const byUid = (uid) => {
    const hits = cache.shifts.filter((x) => x.uid === uid);
    if (hits.length <= 1 || !st) return hits[0] || null;
    return hits.sort((a, b) => Math.abs(new Date(a.start) - st) - Math.abs(new Date(b.start) - st))[0];
  };
  if (svc.dpUid) {
    const hit = byUid(svc.dpUid);
    if (hit) return hit;
    // Termin wurde umgeplant (neue ID im Dienstplan): über den Verlauf weiterverfolgen
    const moved = Object.values(readDpHistory()).find((h) => (h.prevUids || []).includes(svc.dpUid));
    if (moved && moved.uid) { const s2 = byUid(moved.uid); if (s2) return s2; }
  }
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
  // „1823“ bzw. „RTW 1823“ aus dem Portal gilt als gleich wie „RTW“ im Kalender
  const sameVeh = sameName(svc.vehicle, v.vehicle) || (svc.vehicleType && sameName(svc.vehicleType, v.vehicle)) || (v.vehicle && new RegExp(`^${v.vehicle.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'i').test((svc.vehicle || '').trim()));
  if (!sameVeh) out.push({ key: 'vehicle', label: 'Fahrzeug', from: svc.vehicle, to: v.vehicle });
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

// ── Tagesdienstplan aus dem Portal übernehmen ───────────────────────────────
// Ein Lesezeichen liest im angemeldeten Browser die Seite „Tagesdienstplan“ aus und legt das
// Ergebnis in die Zwischenablage; die App liest es von dort. Zugangsdaten verlassen das Gerät nie.
/* Läuft im Portal (nicht in der App) – daher eigenständig, ohne Hilfsfunktionen der App. */
function etbPortalGrab() {
  var main = document.querySelector('#contentmain');
  var h2 = main && main.querySelector('h2');
  if (!main || !h2 || !main.querySelector('table')) { alert('Einsatztagebuch: Bitte zuerst einen Tagesdienstplan öffnen.'); return; }
  var clean = function (x) { return String(x || '').replace(/\s+/g, ' ').trim(); };
  var pad = function (n) { return ('0' + n).slice(-2); };
  var title = clean(h2.textContent);
  var m = title.match(/^\S+\s+(.+?)\s+\S+\s+[^\s,]+,\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  var out = { etb: 'tdp', v: 1, title: title, station: m ? m[1] : '', date: m ? m[4] + '-' + pad(m[3]) + '-' + pad(m[2]) : '', at: Date.now(), rows: [] };
  var group = '';
  Array.prototype.forEach.call(main.children, function (el) {
    if (el.tagName === 'H3') { group = clean(el.textContent); return; }
    if (el.tagName !== 'TABLE') return;
    Array.prototype.forEach.call(el.querySelectorAll('tr'), function (tr) {
      if (/(^|\s)_requirement(\s|$)/.test(tr.className)) {
        var unitTd = tr.querySelector('td._unit'), strong = unitTd && unitTd.querySelector('strong');
        var nr = clean(strong && strong.textContent);
        var unit = clean(unitTd && unitTd.textContent); if (nr) unit = clean(unit.slice(0, unit.lastIndexOf(nr)));
        var time = clean((tr.querySelector('td._time') || {}).textContent).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        var tds = tr.querySelectorAll('td'), crewTd = null;
        for (var i = 0; i < tds.length; i++) if (!tds[i].className) { crewTd = tds[i]; break; }
        var crew = [], open = [], self = false;
        if (crewTd) Array.prototype.forEach.call(crewTd.querySelectorAll('span'), function (sp) {
          var n = clean(sp.textContent); if (!n) return;
          if (/(^|\s)_self(\s|$)/.test(sp.className)) { crew.push(n); self = n; }
          else if (/(^|\s)_photo(\s|$)/.test(sp.className)) crew.push(n);
          else open.push(n);
        });
        var locTd = tr.querySelector('td._location');
        var loc = locTd ? locTd.innerHTML.split(/<br\s*\/?>/i).map(function (x) { var d = document.createElement('div'); d.innerHTML = x; return clean(d.textContent); }).filter(Boolean) : [];
        out.rows.push({ g: group, u: unit, nr: nr, s: time ? time[1] : '', e: time ? time[2] : '', crew: crew, open: open, self: self || undefined, loc: loc, note: '' });
      } else {
        var note = tr.querySelector('td._note');
        if (note && out.rows.length && clean(note.textContent)) out.rows[out.rows.length - 1].note = clean(note.textContent);
      }
    });
  });
  var text = 'ETB-TDP ' + JSON.stringify(out);
  var mine = out.rows.filter(function (r) { return r.self; })[0];
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;font:15px -apple-system,system-ui,sans-serif';
  box.innerHTML = '<div style="background:#fff;color:#111;border-radius:16px;padding:18px;max-width:420px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)"><b style="font-size:17px">Für das Einsatztagebuch</b><p style="margin:8px 0 14px;color:#444;font-size:14px;line-height:1.4"></p><div style="display:flex;gap:8px"><button type="button" data-c style="flex:1;padding:12px;border:0;border-radius:12px;background:#ff3b30;color:#fff;font-weight:700;font-size:15px">Kopieren</button><button type="button" data-x style="padding:12px 16px;border:0;border-radius:12px;background:#eee;font-size:15px">Schließen</button></div></div>';
  box.querySelector('p').textContent = (out.station || 'Tagesdienstplan') + (out.date ? ' · ' + out.date.split('-').reverse().join('.') : '') + ' · ' + out.rows.length + ' Fahrzeuge' + (mine ? ' · du: ' + clean(mine.u + ' ' + mine.nr) + ' ' + mine.s + '–' + mine.e : ' · du bist hier nicht eingeteilt') + '. Danach im Einsatztagebuch beim Dienstplan auf „Aus Portal einfügen“ tippen.';
  document.body.appendChild(box);
  box.querySelector('[data-x]').onclick = function () { box.remove(); };
  box.querySelector('[data-c]').onclick = function () {
    var b = this, ok = function () { b.textContent = 'Kopiert ✓'; setTimeout(function () { box.remove(); }, 900); };
    var fallback = function () { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { b.textContent = 'Kopieren fehlgeschlagen'; } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  };
}
function portalBookmarkletCode() { return 'javascript:' + encodeURIComponent('(' + etbPortalGrab.toString().replace(/\n\s+/g, '\n') + ')()'); }

/** Text aus der Zwischenablage prüfen → Tagesdienstplan-Objekt oder null. */
function parsePortalText(text) {
  const m = String(text || '').trim().match(/^ETB-TDP\s+(\{[\s\S]*\})\s*$/);
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    if (!d || d.etb !== 'tdp' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '') || !Array.isArray(d.rows)) return null;
    const t = (x) => toDisplayName(x).slice(0, 200);
    const hm = (x) => (/^\d{1,2}:\d{2}$/.test(x || '') ? x.padStart(5, '0') : '');
    return { station: t(d.station), date: d.date, title: t(d.title), at: Number(d.at) || Date.now(),
      rows: d.rows.slice(0, 120).map((r) => ({ g: t(r.g), u: t(r.u), nr: t(r.nr), s: hm(r.s), e: hm(r.e), crew: (r.crew || []).map(t).filter(Boolean).slice(0, 20),
        open: (r.open || []).map(t).filter(Boolean).slice(0, 20), self: r.self ? t(r.self) : '', loc: (r.loc || []).map(t).filter(Boolean).slice(0, 5), note: t(r.note) })) };
  } catch (_) { return null; }
}
/** Beginn/Ende einer Zeile als lokale Zeitangaben (Ende vor Beginn → nächster Tag). */
function tdpRowTimes(date, r) {
  if (!r.s || !r.e) return null;
  const a = parseLocalDt(`${date}T${r.s}`), b = parseLocalDt(`${date}T${r.e}`);
  if (!a || !b) return null;
  if (b <= a) b.setDate(b.getDate() + 1);
  return { a, b, startAt: localDtStr(a), endAt: localDtStr(b) };
}
const PORTAL_VEHFMT_KEY = 'etb_portal_vehfmt', PORTAL_KEEP_KEY = 'etb_portal_keep';
function tdpVehicleName(r, fmt = lsGet(PORTAL_VEHFMT_KEY) || 'nr') {
  if (!r.nr) return r.u;
  return fmt === 'full' ? `${r.u} ${r.nr}`.trim() : r.nr;
}
/** Zwischenablage lesen (iOS fragt beim ersten Mal nach) – sonst Einfügefeld anbieten. */
async function pastePortalPlan() {
  let text = '';
  try { if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText(); } catch (_) {}
  const d = parsePortalText(text);
  if (d) { openPortalImport(d); return; }
  showPortalPasteBox(text ? 'In der Zwischenablage ist kein Tagesdienstplan.' : '');
}
function showPortalPasteBox(msg) {
  document.querySelectorAll('.pi-ov').forEach((x) => x.remove());
  const ov = document.createElement('div');
  ov.className = 'dialog-overlay lp-ov pi-ov'; ov.style.zIndex = '2000';
  ov.innerHTML = `<div class="dialog-box lp-box pi-box" style="--mc:#ff3b30">
    <div class="lp-head"><span class="lp-ic">📋</span><div class="lp-head-t"><h3>Aus Portal einfügen</h3><span>Tagesdienstplan übernehmen</span></div><button class="dialog-close lp-x" aria-label="Schließen">✕</button></div>
    <div class="dialog-body lp-body">
      ${msg ? `<p class="pi-msg">${escHtml(msg)}</p>` : ''}
      <p class="cp-line">1. Im Portal den Tagesdienstplan öffnen · 2. Lesezeichen „→ Einsatztagebuch“ antippen · 3. „Kopieren“ · 4. hier einfügen:</p>
      <textarea id="pi-text" rows="4" placeholder="Hier einfügen (lange tippen → Einsetzen)"></textarea>
      <div class="ms-actions"><button type="button" class="btn-secondary" id="pi-help">Lesezeichen einrichten</button><button type="button" class="btn-primary" id="pi-go">Übernehmen</button></div>
    </div></div>`;
  const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 200); };
  ov.querySelector('.dialog-close').onclick = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#pi-help').onclick = () => { close(); openSettingsSection('portal'); };
  ov.querySelector('#pi-go').onclick = () => {
    const d = parsePortalText(ov.querySelector('#pi-text').value);
    if (!d) { toast('Das ist kein Tagesdienstplan aus dem Lesezeichen.', 'error', 3500); return; }
    close(); setTimeout(() => openPortalImport(d), 220);
  };
  document.body.appendChild(ov);
}
/** Tagebuch-Dienst zu einem Portal-Tag: überschneidet die eigene Zeile, sonst gleicher Tag + Dienststelle. */
function serviceForPortal(d, mine) {
  const svcs = state.services.filter((x) => !x.isSeg);
  const t = mine && tdpRowTimes(d.date, mine);
  if (t) {
    let best = null, bestOv = 0;
    svcs.forEach((x) => { const a = parseLocalDt(x.startAt), b = parseLocalDt(x.endAt); if (!a || !b) return; const ov = Math.min(+b, +t.b) - Math.max(+a, +t.a); if (ov > bestOv) { best = x; bestOv = ov; } });
    if (best && bestOv >= 30 * 60000) return best;
  }
  return svcs.find((x) => (x.startAt || '').slice(0, 10) === d.date && d.station && stationKey(x.location) === stationKey(d.station)) || null;
}
// ── Änderungen zwischen zwei eingefügten Ständen ──
const tdpLabel = (r) => `${r.u}${r.nr ? ' ' + r.nr : ''}`.trim() || 'Fahrzeug';
/** Zeilen alter und neuer Stand einander zuordnen (Nummer, Typ, Zeit, Besatzung). */
function tdpMatchRows(oldRows, newRows) {
  const norm = (x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim();
  const score = (a, b) => {
    let sc = 0;
    if (a.nr && b.nr) sc += a.nr === b.nr ? 6 : -3;
    if (norm(a.u) === norm(b.u)) sc += 2; else sc -= 2;
    if (a.s === b.s) sc += 1; if (a.e === b.e) sc += 1;
    if (a.g === b.g) sc += 0.5;
    const ca = new Set(a.crew.map(norm)); sc += b.crew.filter((n) => ca.has(norm(n))).length * 1.5;
    return sc;
  };
  const pairs = [];
  oldRows.forEach((a, i) => newRows.forEach((b, j) => { const sc = score(a, b); if (sc >= 3) pairs.push([sc, i, j]); }));
  pairs.sort((x, y) => y[0] - x[0]);
  const usedO = new Set(), usedN = new Set(), match = [];
  pairs.forEach(([, i, j]) => { if (usedO.has(i) || usedN.has(j)) return; usedO.add(i); usedN.add(j); match.push([oldRows[i], newRows[j]]); });
  return { match, removed: oldRows.filter((_, i) => !usedO.has(i)), added: newRows.filter((_, j) => !usedN.has(j)) };
}
/** Liste der Änderungen als Text; „self“ = betrifft die eigene Zeile. */
function tdpDiff(oldRows, newRows) {
  const norm = (x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim();
  const { match, removed, added } = tdpMatchRows(oldRows, newRows);
  const out = [];
  const crewTxt = (r) => (r.crew.length ? ` (${r.crew.join(', ')})` : '');
  added.forEach((r) => out.push({ self: !!r.self, t: `Neu: ${tdpLabel(r)} ${r.s}–${r.e}${crewTxt(r)}` }));
  removed.forEach((r) => out.push({ self: !!r.self, t: `Entfallen: ${tdpLabel(r)} ${r.s}–${r.e}${crewTxt(r)}` }));
  match.forEach(([a, b]) => {
    const self = !!(a.self || b.self), L = tdpLabel(b), parts = [];
    if (a.nr !== b.nr) parts.push(a.nr && b.nr ? `Nummer ${a.nr} → ${b.nr}` : b.nr ? `Nummer ${b.nr}` : `Nummer ${a.nr} entfernt`);
    if (norm(a.u) !== norm(b.u)) parts.push(`${a.u} → ${b.u}`);
    if (a.s !== b.s || a.e !== b.e) parts.push(`Zeit ${a.s}–${a.e} → ${b.s}–${b.e}`);
    const ca = new Set(a.crew.map(norm)), cb = new Set(b.crew.map(norm));
    const plus = b.crew.filter((n) => !ca.has(norm(n))), minus = a.crew.filter((n) => !cb.has(norm(n)));
    if (plus.length || minus.length) parts.push([...plus.map((n) => '+ ' + n), ...minus.map((n) => '− ' + n)].join(', '));
    const oa = new Set(a.open.map(norm)), ob = new Set(b.open.map(norm));
    const oPlus = b.open.filter((n) => !oa.has(norm(n))), oMinus = a.open.filter((n) => !ob.has(norm(n)));
    if (oPlus.length) parts.push('offen: ' + oPlus.join(', '));
    if (oMinus.length && !plus.length) parts.push('besetzt: ' + oMinus.join(', '));
    else if (oMinus.length) parts.push(`(${oMinus.length} offene ${oMinus.length === 1 ? 'Stelle' : 'Stellen'} besetzt)`);
    if (norm(a.note) !== norm(b.note)) parts.push(b.note ? `Notiz „${b.note}“` : 'Notiz entfernt');
    if (norm(a.loc.join(' · ')) !== norm(b.loc.join(' · '))) parts.push(`Ort ${b.loc.join(' · ') || '—'}`);
    if (parts.length) out.push({ self, t: `${L}: ${parts.join(' · ')}` });
  });
  // eigene Einteilung auf ein anderes Fahrzeug gewechselt
  const meOld = oldRows.find((r) => r.self), meNew = newRows.find((r) => r.self);
  if (meOld && meNew && !match.some(([a, b]) => a === meOld && b === meNew)) out.unshift({ self: true, t: `Du: ${tdpLabel(meOld)} ${meOld.s}–${meOld.e} → ${tdpLabel(meNew)} ${meNew.s}–${meNew.e}` });
  else if (meOld && !meNew) out.unshift({ self: true, t: `Du bist nicht mehr eingeteilt (vorher ${tdpLabel(meOld)} ${meOld.s}–${meOld.e})` });
  else if (!meOld && meNew) out.unshift({ self: true, t: `Du bist neu eingeteilt: ${tdpLabel(meNew)} ${meNew.s}–${meNew.e}` });
  return out.sort((x, y) => (y.self ? 1 : 0) - (x.self ? 1 : 0));
}
const portalPlanKey = (station, date) => `${stationKey(station) || 'n:'}|${date}`;
/** Eingefügten Stand merken und die Änderungen zum vorigen protokollieren. Gibt {prev, changes} zurück. */
function recordPortalPlan(d) {
  state.portalPlans = state.portalPlans || {};
  const key = portalPlanKey(d.station, d.date);
  const prev = state.portalPlans[key] || null;
  if (prev && prev.at === d.at) return { prev: prev.prevAt ? { at: prev.prevAt } : null, changes: prev.lastChanges || [], key, entry: prev };
  const changes = prev ? tdpDiff(prev.rows, d.rows) : null;
  const entry = { station: d.station, date: d.date, at: d.at, rows: d.rows, log: (prev && prev.log) || [], prevAt: prev ? prev.at : 0, lastChanges: changes || [] };
  if (changes && changes.length) entry.log = [...entry.log, { at: d.at, since: prev.at, changes }].slice(-60);
  state.portalPlans[key] = entry;
  saveState();
  return { prev, changes, key, entry };
}

/** Gespeicherte Portal-Daten löschen: nur den Änderungsverlauf oder alles eines Tages (key = null → alle Tage). */
function deletePortalData(key, { logOnly = false } = {}) {
  const pl = state.portalPlans || {};
  const keys = key ? [key] : Object.keys(pl);
  keys.forEach((k) => {
    const v = pl[k]; if (!v) return;
    if (logOnly) { delete v.log; delete v.lastChanges; delete v.prevAt; }
    else delete pl[k];
    // Portal-Einträge im Dienst-Verlauf und die Kopie am Dienst dieses Tages mit entfernen
    state.services.forEach((svc) => {
      if ((svc.startAt || '').slice(0, 10) !== v.date) return;
      if (svc.planLog) { svc.planLog = svc.planLog.filter((x) => !String(x.id).startsWith('portal-')); if (!svc.planLog.length) delete svc.planLog; }
      if (!logOnly && svc.tdp && svc.tdp.date === v.date && stationKey(svc.tdp.station) === stationKey(v.station)) delete svc.tdp;
    });
  });
  saveState();
}

function openPortalImport(d) {
  const rec = recordPortalPlan(d);
  const mine = d.rows.find((r) => r.self) || null;
  const svc = serviceForPortal(d, mine);
  // eigene Änderungen auch beim Dienst vermerken (erscheinen u. a. im Kalender-Export)
  if (svc && rec.changes && rec.changes.length) {
    const have = new Set((svc.planLog || []).map((x) => x.id));
    rec.changes.filter((c) => c.self).forEach((c, i) => { const id = `portal-${d.at}-${i}`; if (have.has(id)) return; (svc.planLog = svc.planLog || []).push({ id, at: d.at, txt: `${new Date(d.at).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })} ${formatTimeHM(new Date(d.at))} · Portal · ${c.t}` }); });
    saveState();
  }
  const sinceStr = rec.prev ? `${new Date(rec.prev.at).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })} ${formatTimeHM(new Date(rec.prev.at))}` : '';
  const changesHtml = !rec.prev ? '<p class="pi-msg">Erster Stand für diesen Tag gespeichert. Beim nächsten Einfügen siehst du hier, was sich geändert hat.</p>'
    : !rec.changes.length ? `<p class="pi-msg">✓ Keine Änderungen seit ${escHtml(sinceStr)}.</p>`
    : `<div class="cp-sub">Änderungen seit ${escHtml(sinceStr)} · ${rec.changes.length}</div><ul class="pi-diff">${rec.changes.map((c) => `<li${c.self ? ' class="is-self"' : ''}>${escHtml(c.t)}</li>`).join('')}</ul>`;
  const t = mine ? tdpRowTimes(d.date, mine) : null;
  const fmt = lsGet(PORTAL_VEHFMT_KEY) || 'nr';
  const keep = lsGet(PORTAL_KEEP_KEY) !== '0';
  const crew = mine ? mine.crew.filter((n) => !sameName(n, mine.self)) : [];
  const dayStr = parseLocalDt(d.date + 'T12:00').toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const p2 = (n) => String(n).padStart(2, '0');
  const tm = (x) => { const z = parseLocalDt(x); return z ? `${p2(z.getHours())}:${p2(z.getMinutes())}` : ''; };
  const norm = (x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim();
  const changes = [];
  if (svc && mine) {
    const veh = tdpVehicleName(mine, fmt);
    if (mine.nr && !sameName(svc.vehicle, veh)) changes.push(['vehicle', 'Fahrzeug', `${svc.vehicle || '—'} → ${veh}`, true]);
    const have = new Set((svc.colleagues || []).map(norm));
    const add = crew.filter((n) => !have.has(norm(n))), del = (svc.colleagues || []).filter((n) => !crew.some((c) => norm(c) === norm(n)));
    if (add.length || del.length) changes.push(['crew', 'Besatzung', [...add.map((n) => '+ ' + n), ...del.map((n) => '− ' + n)].join(', '), true]);
    if (t && (svc.startAt !== t.startAt || svc.endAt !== t.endAt)) changes.push(['time', 'Zeit', `${tm(svc.startAt)}–${tm(svc.endAt)} → ${mine.s}–${mine.e}`, false]);
  }
  const rowHtml = (r) => `<li class="pi-row${r.self ? ' is-self' : ''}">
      <span class="pi-unit"><b>${escHtml(r.u)}</b>${r.nr ? ` <span>${escHtml(r.nr)}</span>` : ''}</span>
      <span class="pi-time">${escHtml(r.s)}–${escHtml(r.e)}</span>
      <span class="pi-crew">${r.crew.map((n) => `<span${sameName(n, r.self) ? ' class="is-me"' : ''}>${escHtml(n)}</span>`).join(', ')}${r.open.length ? `${r.crew.length ? ', ' : ''}<i>${r.open.map(escHtml).join(', ')}</i>` : ''}</span>
      ${r.note || r.loc.length ? `<small>${escHtml([r.loc.join(' · '), r.note].filter(Boolean).join(' · '))}</small>` : ''}</li>`;
  document.querySelectorAll('.pi-ov').forEach((x) => x.remove());
  const ov = document.createElement('div');
  ov.className = 'dialog-overlay lp-ov pi-ov'; ov.style.zIndex = '2000';
  ov.innerHTML = `<div class="dialog-box lp-box pi-box" style="--mc:#ff3b30">
    <div class="lp-head"><span class="lp-ic">📋</span><div class="lp-head-t"><h3>${escHtml(d.station || 'Tagesdienstplan')}</h3><span>${escHtml(dayStr)} · ${d.rows.length} Fahrzeuge</span></div><button class="dialog-close lp-x" aria-label="Schließen">✕</button></div>
    <div class="dialog-body lp-body">
      ${changesHtml}
      ${mine ? `<div class="pi-mine">
        <div class="pi-mine-veh">${escHtml(mine.u)} <b>${escHtml(mine.nr || '')}</b></div>
        <div>${escHtml(mine.s)}–${escHtml(mine.e)}${crew.length ? ` · mit ${escHtml(crew.join(', '))}` : ''}</div>
        ${mine.note || mine.loc.length ? `<small>${escHtml([mine.loc.join(' · '), mine.note].filter(Boolean).join(' · '))}</small>` : ''}
      </div>` : '<p class="pi-msg">Du bist an diesem Tag in diesem Tagesdienstplan nicht eingeteilt.</p>'}
      ${svc ? `<div class="cp-sub">Dein Dienst im Tagebuch · ${escHtml(svc.vehicle || 'Dienst')} ${escHtml(tm(svc.startAt))}–${escHtml(tm(svc.endAt))}</div>
        ${changes.length ? `<div class="pi-changes">${changes.map(([k, l, txt, on]) => `<label class="pi-chg"><input type="checkbox" data-chg="${k}"${on ? ' checked' : ''}><span><b>${l}</b> ${escHtml(txt)}</span></label>`).join('')}</div>` : mine ? '<p class="cp-line">✓ Stimmt mit deinem Dienst überein.</p>' : ''}`
        : mine ? '<p class="cp-line">Im Tagebuch gibt es dazu noch keinen Dienst.</p>' : ''}
      ${mine && mine.nr ? `<div class="pi-fmt"><span>Fahrzeug eintragen als</span><div class="pm-seg"><button type="button" data-fmt="nr"${fmt === 'nr' ? ' class="is-on"' : ''}>${escHtml(mine.nr)}</button><button type="button" data-fmt="full"${fmt === 'full' ? ' class="is-on"' : ''}>${escHtml(mine.u + ' ' + mine.nr)}</button></div></div>` : ''}
      ${svc || mine ? `<label class="pi-chg"><input type="checkbox" id="pi-keep"${keep ? ' checked' : ''}><span><b>Ganzen Tagesdienstplan beim Dienst speichern</b> – alle Fahrzeuge mit Besatzung, Stand ${escHtml(formatTimeHM(new Date(d.at)))}</span></label>` : ''}
      <details class="pi-all"><summary>Tagesdienstplan anzeigen</summary><ul class="pi-list">${d.rows.map(rowHtml).join('')}</ul></details>
      <div class="ms-actions">
        <button type="button" class="btn-secondary" id="pi-cancel">Abbrechen</button>
        ${svc ? '<button type="button" class="btn-primary" id="pi-apply">Übernehmen</button>' : mine && t ? '<button type="button" class="btn-primary" id="pi-create">Dienst anlegen</button>' : ''}
      </div>
    </div></div>`;
  const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 200); };
  ov.querySelector('.dialog-close').onclick = close;
  ov.querySelector('#pi-cancel').onclick = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => { lsSet(PORTAL_VEHFMT_KEY, b.dataset.fmt === 'full' ? 'full' : null); ov.remove(); openPortalImport(d); }));
  const snapshot = () => ({ station: d.station, date: d.date, at: d.at, rows: d.rows });
  const keepOn = () => { const k = ov.querySelector('#pi-keep'); const on = !!(k && k.checked); lsSet(PORTAL_KEEP_KEY, on ? null : '0'); return on; };
  const apply = ov.querySelector('#pi-apply');
  if (apply) apply.onclick = () => {
    const on = (k) => { const c = ov.querySelector(`[data-chg="${k}"]`); return !!(c && c.checked); };
    if (mine) {
      if (on('vehicle')) svc.vehicle = tdpVehicleName(mine);
      if (mine.u) svc.vehicleType = mine.u;
      if (on('crew')) svc.colleagues = crew.slice();
      if (on('time') && t) { svc.startAt = t.startAt; svc.endAt = t.endAt; }
      if (!svc.location && d.station) svc.location = d.station;
    }
    if (keepOn()) svc.tdp = snapshot(); 
    saveState(); close();
    toast('Aus dem Portal übernommen.', 'success');
    refreshAfterPlanChange();
  };
  const create = ov.querySelector('#pi-create');
  if (create) create.onclick = () => {
    const nsv = { id: uid(), startAt: t.startAt, endAt: t.endAt, vehicle: tdpVehicleName(mine), vehicleType: mine.u, location: d.station, colleagues: crew.slice(), note: '', incidents: [], isSeg: false };
    if (keepOn()) nsv.tdp = snapshot();
    state.services.push(nsv); saveState(); close();
    toast('Dienst angelegt.', 'success');
    selectedServiceId = nsv.id;
    setTimeout(() => { switchTab('dienste'); openServiceDetail(nsv.id); }, 220);
  };
  document.body.appendChild(ov);
}
/** Gespeicherter Tagesdienstplan in den Dienst-Details (zugeklappt). */
function svcTdpHtml(svc) {
  // neuester eingefügter Stand des Tages (falls vorhanden), sonst der beim Dienst gespeicherte
  const pp = (() => {
    const pl = state.portalPlans || {};
    const day = (svc.startAt || '').slice(0, 10);
    const cands = Object.values(pl).filter((x) => x.date === day && (!svc.location || stationKey(x.station) === stationKey(svc.location) || x.rows.some((r) => r.self)));
    return cands.sort((a, b) => b.at - a.at)[0] || null;
  })();
  const d = pp && (!svc.tdp || pp.at >= svc.tdp.at) && (svc.tdp || pp.rows.some((r) => r.self)) ? pp : svc.tdp;
  if (!d || !Array.isArray(d.rows) || !d.rows.length) return '';
  const log = pp && Array.isArray(pp.log) ? pp.log : [];
  const logHtml = log.length ? `<div class="cp-sub">Änderungen · ${log.reduce((n, e) => n + e.changes.length, 0)}</div><ul class="pi-diff">${log.slice().reverse().map((e) => e.changes.map((c) => `<li${c.self ? ' class="is-self"' : ''}><small>${escHtml(new Date(e.at).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }))} ${escHtml(formatTimeHM(new Date(e.at)))}</small> ${escHtml(c.t)}</li>`).join('')).join('')}</ul>` : '';
  const at = new Date(d.at);
  const nCh = log.reduce((n, e) => n + e.changes.length, 0);
  return `<details class="dv-group pi-saved"><summary>${ICON_CAL}<span>Tagesdienstplan ${escHtml(d.station || '')}${nCh ? ` <em class="pi-badge">${nCh} Änderung${nCh === 1 ? '' : 'en'}</em>` : ''}</span><small>Stand ${escHtml(at.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }))} ${escHtml(formatTimeHM(at))}</small></summary>
    <ul class="pi-list">${d.rows.map((r) => `<li class="pi-row${r.self ? ' is-self' : ''}">
      <span class="pi-unit"><b>${escHtml(r.u)}</b>${r.nr ? ` <span class="crew-link" role="button" data-vehicle="${escHtml(r.nr)}">${escHtml(r.nr)}</span>` : ''}</span>
      <span class="pi-time">${escHtml(r.s)}–${escHtml(r.e)}</span>
      <span class="pi-crew">${(r.crew || []).map((n) => (sameName(n, r.self) ? `<span class="is-me">${escHtml(n)}</span>` : `<span class="crew-link" role="button" data-colleague="${escHtml(n)}">${escHtml(n)}</span>`)).join(', ')}${(r.open || []).length ? `${(r.crew || []).length ? ', ' : ''}<i>${r.open.map(escHtml).join(', ')}</i>` : ''}</span>
      ${r.note || (r.loc || []).length ? `<small>${escHtml([(r.loc || []).join(' · '), r.note].filter(Boolean).join(' · '))}</small>` : ''}</li>`).join('')}</ul>
    ${logHtml}
    <div class="pi-del-row">
      ${log.length ? `<button type="button" class="btn-ghost pi-del" data-pd-svc-log="${escHtml(portalPlanKey(pp.station, pp.date))}">Änderungsverlauf löschen</button>` : ''}
      <button type="button" class="btn-ghost pi-del" data-tdp-del="${escHtml(svc.id)}" data-pd-key="${pp ? escHtml(portalPlanKey(pp.station, pp.date)) : ''}">Tagesdienstplan löschen</button>
    </div></details>`;
}
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('#btn-portal-paste')) { pastePortalPlan(); return; }
  const lg = e.target.closest && e.target.closest('[data-pd-svc-log]');
  if (lg) { deletePortalData(lg.dataset.pdSvcLog, { logOnly: true }); toast('Änderungsverlauf gelöscht.', 'success', 1500); renderServiceDetail(); return; }
  const del = e.target.closest && e.target.closest('[data-tdp-del]');
  if (del) {
    const sv = state.services.find((x) => x.id === del.dataset.tdpDel);
    if (!sv || !confirm('Gespeicherten Tagesdienstplan dieses Tages samt Änderungen löschen?')) return;
    if (del.dataset.pdKey) deletePortalData(del.dataset.pdKey);
    delete sv.tdp; saveState(); renderServiceDetail();
  }
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
/** Jahre zur Auswahl: 15 Jahre zurück (bzw. ab dem ersten Dienst) bis 3 Jahre voraus. */
function tdpYears(cur) {
  const now = new Date().getFullYear();
  const firsts = state.services.map((s) => parseLocalDt(s.startAt)).filter(Boolean).map((d) => d.getFullYear());
  const from = Math.min(cur, now - 15, ...firsts), to = Math.max(cur, now + 3);
  const out = [];
  for (let v = to; v >= from; v--) out.push(v);
  return out;
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
        <span class="tdp-pick">
          <select id="tdp-month" aria-label="Monat">${Array.from({ length: 12 }, (_, i) => `<option value="${i}"${i === mo ? ' selected' : ''}>${new Date(2000, i, 1).toLocaleDateString('de-AT', { month: 'long' })}</option>`).join('')}</select>
          <select id="tdp-year" aria-label="Jahr">${tdpYears(y).map((v) => `<option value="${v}"${v === y ? ' selected' : ''}>${v}</option>`).join('')}</select>
        </span>
        <button type="button" class="tdp-nav" data-tdp-m="1" aria-label="Nächster Monat">›</button>
      </div>
      <div class="tdp-grid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<span class="tdp-wd">${w}</span>`).join('')}${cells}</div>
    </div>
    <p class="tdp-legend"><span class="tdp-dot"></span> eigener Dienst · Tag antippen öffnet den Tagesdienstplan</p>
    <button type="button" class="btn-ghost tdp-today" id="tdp-today">Heute</button>`;
  box.querySelector('#tdp-dept').onchange = (e) => { lsSet('etb_tdp_dept', e.target.value); renderTdpPopup(); };
  box.querySelectorAll('[data-tdp-m]').forEach((b) => b.addEventListener('click', () => { tdpMonth = new Date(y, mo + +b.dataset.tdpM, 1); renderTdpPopup(); }));
  const jump = () => { tdpMonth = new Date(+box.querySelector('#tdp-year').value, +box.querySelector('#tdp-month').value, 1); renderTdpPopup(); };
  box.querySelector('#tdp-month').onchange = jump;
  box.querySelector('#tdp-year').onchange = jump;
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
  await workerApi('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), label, notify: pushPrefs() } });
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

// — Welche Änderungen eine Mitteilung auslösen (Verlauf/Postfach zeichnen trotzdem alles auf) —
const PUSH_PREFS_KEY = 'etb_push_prefs';
const PUSH_PREF_FIELDS = [
  ['added', 'Neuer Dienst', 'Dienst neu eingetragen'],
  ['removed', 'Ausfall', 'Dienst aus dem Plan entfernt'],
  ['time', 'Zeit', 'Beginn oder Ende verschoben'],
  ['vehicle', 'Fahrzeug', 'anderes Fahrzeug / anderer Dienst'],
  ['location', 'Ort', 'andere Dienststelle'],
  ['crew', 'Besatzung', 'Kolleg:innen kommen dazu oder fallen weg'],
  ['info', 'Info', 'nur der Infotext ändert sich'],
];
const PUSH_PREFS_DEFAULT = { added: true, removed: true, time: true, vehicle: true, location: true, crew: true, info: false };
function pushPrefs() {
  try { return Object.assign({}, PUSH_PREFS_DEFAULT, JSON.parse(lsGet(PUSH_PREFS_KEY, 'null')) || {}); } catch (_) { return { ...PUSH_PREFS_DEFAULT }; }
}
/** Speichert lokal und meldet die Auswahl dem Worker (der filtert vor dem Senden). */
async function savePushPrefs(prefs) {
  lsSet(PUSH_PREFS_KEY, JSON.stringify(prefs));
  const endpoint = lsGet(PUSH_ENDPOINT_KEY);
  if (!endpoint || !dpConfigured()) return { ok: true };
  try { await workerApi('/push/prefs', { method: 'POST', body: { endpoint, notify: prefs } }); return { ok: true }; }
  catch (err) { return { ok: false, err }; }
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
      ? 'Der Worker prüft den Dienstplan im eingestellten Intervall und meldet nach jeder Prüfung neue, geänderte und ausgefallene Dienste – auch wenn die App geschlossen ist.'
      : sup.reason)}</p>
    ${active ? `<div class="set-group-header">Mitteilung bei</div>
    <div class="set-group" id="push-prefs">${PUSH_PREF_FIELDS.map(([k, t, sub2]) => `<label class="set-row set-row-switch">
        <span class="set-row-text"><span class="set-row-title">${t}</span><span class="set-row-sub">${sub2}</span></span>
        <input type="checkbox" class="set-switch" data-push-pref="${k}" ${pushPrefs()[k] ? 'checked' : ''}>
      </label>`).join('')}</div>
    <p class="set-group-footer" id="push-prefs-foot">Ändert sich bei einem Dienst mehreres, kommt die Mitteilung, sobald einer der eingeschalteten Punkte dabei ist. Im Verlauf und im Postfach steht jede Änderung trotzdem.</p>` : ''}
    <div class="set-group-header">Prüfintervall</div>
    <div class="set-group"><div class="iv-box" id="dp-interval"><span class="set-row-sub">Wird geladen…</span></div></div>
    <p class="set-group-footer" id="dp-interval-foot"></p>`;
  host.querySelectorAll('[data-push-pref]').forEach((cb) => cb.addEventListener('change', async () => {
    const prefs = pushPrefs();
    prefs[cb.dataset.pushPref] = cb.checked;
    const r = await savePushPrefs(prefs);
    const foot = host.querySelector('#push-prefs-foot');
    if (r.ok) toast('Gespeichert.', 'success', 1200);
    else if (foot) foot.textContent = 'Auf diesem Gerät gespeichert – der Worker kennt diese Einstellung aber noch nicht und meldet weiterhin alle Änderungen. Bitte den Worker aktualisieren.';
  }));
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
  let s = null;
  try { s = await workerApi('/push/status'); } catch (err) { if (st) st.textContent = err.message; }
  if (st && s) {
    const when = s.lastCheck ? new Date(s.lastCheck) : null;
    st.textContent = (when ? `Zuletzt geprüft ${homeDayLabel(when, new Date())}, ${formatTimeHM(when)}` : 'Noch nicht geprüft')
      + (s.lastError ? ` · Fehler: ${s.lastError}` : '')
      + ` · ${s.devices} ${s.devices === 1 ? 'Gerät' : 'Geräte'}`;
  }
  renderCheckInterval(host, s);
}

/** Prüfintervall des Workers: Drehrad wie am iPhone; feiner als der Cron-Takt geht nicht. */
const ivLabel = (m) => (m < 60 ? `${m} min` : `${m / 60} h`);
const ivLong = (m) => (m < 60 ? `${m} ${m === 1 ? 'Minute' : 'Minuten'}` : `${m / 60} ${m === 60 ? 'Stunde' : 'Stunden'}`);
const ivPhrase = (m) => (m === 1 ? 'jede Minute' : m === 60 ? 'jede Stunde' : `alle ${ivLong(m)}`);
const WHEEL_ROW = 36;
function renderCheckInterval(host, s) {
  const box = host.querySelector('#dp-interval'), foot = host.querySelector('#dp-interval-foot');
  if (!box) return;
  if (!s) { box.innerHTML = '<span class="set-row-sub">Worker nicht erreichbar.</span>'; return; }
  if (!s.intervals) { box.innerHTML = '<span class="set-row-sub">Fest alle 10 Minuten – zum Einstellen bitte den Worker aktualisieren.</span>'; return; }
  const period = s.cronPeriod || null;
  const list = s.intervals;
  let current = s.interval;
  const setFoot = () => {
    const effective = period ? Math.max(current, period) : current;
    if (foot) foot.textContent = [
      `Der Worker prüft den Dienstplan ${ivPhrase(effective)}${current === 10 ? ' (Standard)' : ''} und meldet Änderungen nach jeder Prüfung sofort.`,
      period && period > 1 ? `Feiner als ${ivLong(period)} geht mit dem Zeitplan bei Cloudflare nicht (dort für kürzere Intervalle den Cron auf „* * * * *“ stellen).` : '',
      !period ? 'Der Zeitplan bei Cloudflare hat sich noch nicht gemeldet.' : '',
      !s.statusExact && effective < 10 ? 'Ohne D1-Datenbank wird „Zuletzt geprüft“ nur alle 10 min aktualisiert.' : '',
    ].filter(Boolean).join(' ');
  };
  box.innerHTML = `<div class="wheel" tabindex="0" role="listbox" aria-label="Prüfintervall">
      <div class="wheel-band"></div>
      <div class="wheel-fixed">alle</div>
      <div class="wheel-scroll">
        <div class="wheel-pad"></div>
        ${list.map((m) => `<div class="wheel-item${period && m < period ? ' is-off' : ''}" role="option" data-iv="${m}"><span>${ivLong(m)}</span></div>`).join('')}
        <div class="wheel-pad"></div>
      </div>
    </div>`;
  setFoot();
  const sc = box.querySelector('.wheel-scroll'), items = [...box.querySelectorAll('.wheel-item')];
  const faces = items.map((el) => el.firstElementChild); // nur der Text kippt – die Zeile (Einrastpunkt) bleibt fest
  const allowed = (i) => !items[i].classList.contains('is-off');
  // 3D-Walze: Zeilen kippen und verblassen zur Mitte hin
  const paint = () => {
    const mid = sc.scrollTop / WHEEL_ROW;
    items.forEach((el, i) => {
      const d = Math.max(-3, Math.min(3, i - mid));
      faces[i].style.transform = `rotateX(${-d * 22}deg)`;
      faces[i].style.opacity = String(Math.max(0.15, 1 - Math.abs(d) * 0.3) * (allowed(i) ? 1 : 0.45));
      el.classList.toggle('is-sel', Math.abs(d) < 0.5);
    });
  };
  let quiet = true, timer = 0;
  const go = (i, smooth = true) => sc.scrollTo({ top: i * WHEEL_ROW, behavior: smooth ? 'smooth' : 'auto' });
  const settle = async () => {
    let i = Math.max(0, Math.min(items.length - 1, Math.round(sc.scrollTop / WHEEL_ROW)));
    if (!allowed(i)) { i = items.findIndex((_, k) => allowed(k)); go(i); return; } // zu fein → zurück auf den feinsten möglichen Wert
    const m = Number(items[i].dataset.iv);
    if (quiet || m === current) return;
    const prev = current;
    current = m; setFoot();
    try { await workerApi('/push/interval', { method: 'POST', body: { minutes: m } }); toast(`Prüfintervall: ${ivPhrase(m)}`, 'success', 1600); }
    catch (err) { toast(err.message, 'error'); current = prev; setFoot(); go(list.indexOf(prev)); }
  };
  sc.addEventListener('scroll', () => { requestAnimationFrame(paint); clearTimeout(timer); timer = setTimeout(settle, 160); }, { passive: true });
  items.forEach((el, i) => el.addEventListener('click', () => { quiet = false; go(i); }));
  sc.addEventListener('pointerdown', () => { quiet = false; });
  // Mausrad: eine Raste = eine Zeile (Trackpad scrollt frei und rastet ein)
  let wheelLock = 0;
  sc.addEventListener('wheel', (e) => {
    quiet = false;
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 50) return; // Trackpad
    e.preventDefault();
    if (Date.now() < wheelLock) return;
    wheelLock = Date.now() + 140;
    const i = Math.round(sc.scrollTop / WHEEL_ROW) + Math.sign(e.deltaY);
    go(Math.max(0, Math.min(items.length - 1, i)));
  }, { passive: false });
  sc.addEventListener('touchstart', () => { quiet = false; }, { passive: true });
  const wheel = box.querySelector('.wheel');
  wheel.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault(); quiet = false;
    const i = Math.round(sc.scrollTop / WHEEL_ROW) + (e.key === 'ArrowDown' ? 1 : -1);
    go(Math.max(0, Math.min(items.length - 1, i)));
  });
  requestAnimationFrame(() => { go(Math.max(0, list.indexOf(current)), false); paint(); setTimeout(() => { quiet = false; }, 300); });
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
    const parts = [];
    if (list.some((c) => c.readded)) parts.push('wieder eingetragen');
    if (first && list.some((c) => c.moved) && (first.t !== x.t || first.l !== x.l)) parts.push(`vorher ${[first.t, first.l].filter(Boolean).join(' · ')}`);
    if (moved && first) parts.push(`${parts.some((p) => p.startsWith('vorher')) ? '' : 'vorher '}${localDateStr(new Date(first.s)) === localDateStr(s) ? '' : homeDayLabel(new Date(first.s), now) + ' '}${range(first)}`);
    const old = parts.join(' · ');
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
    openHistorySheet(key, { expand: true });
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
    try { persistPlanLogs(readDpHistory()); } catch (_) {}
    return data.history || {};
  } catch (_) { return readDpHistory(); } // alter Worker oder offline → letzter Stand
}

/** Verlauf im Hintergrund frisch vom Worker holen (z. B. beim Öffnen eines Diensts aus dem Tagebuch).
 *  Ruft onChange auf, wenn sich der Verlauf geändert hat. Höchstens alle 20 s, nie doppelt gleichzeitig. */
let dpHistFresh = null, dpHistFreshAt = 0;
function refreshDpHistory(onChange) {
  if (!dpConfigured()) return Promise.resolve(false);
  const before = lsGet(DP_HISTORY_KEY, '');
  if (!dpHistFresh) {
    if (Date.now() - dpHistFreshAt < 20000) return Promise.resolve(false);
    dpHistFreshAt = Date.now();
    dpHistFresh = loadDpHistory().finally(() => { dpHistFresh = null; });
  }
  return dpHistFresh.then(() => {
    const now = lsGet(DP_HISTORY_KEY, '');
    const strip = (x) => { try { return JSON.stringify((JSON.parse(x) || {}).history || {}); } catch (_) { return x; } };
    const changed = strip(before) !== strip(now);
    if (changed && onChange) onChange();
    return changed;
  }).catch(() => false);
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

/** Alle Verläufe zu einem Tagebuch-Dienst – bei zusammengefassten Diensten die aller Teile. */
function historyKeysForService(svc, history = readDpHistory()) {
  const st = parseLocalDt(svc && svc.startAt), en = parseLocalDt(svc && svc.endAt);
  if (!st || svc.isSeg) return [];
  const keys = en ? Object.keys(history).filter((k) => { const l = history[k].last; return l && Math.min(l.e, +en) - Math.max(l.s, +st) >= PART_MIN_OVERLAP; }) : [];
  const one = historyKeyForService(svc, history);
  if (one && !keys.includes(one)) keys.push(one);
  return keys.sort((a, b) => ((history[a].last || {}).s || 0) - ((history[b].last || {}).s || 0));
}

/** Eine Verlaufszeile als Text, z. B. „11.11. 09:12 · Zeit 07:00–19:00 → 08:00–20:00 · Besatzung + Probe Paul“. */
function planLogText(e) {
  const p2 = (n) => String(n).padStart(2, '0');
  const when = (ms) => { const d = new Date(ms); return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}. ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const range = (x, ref) => { const s = new Date(x.s), e2 = new Date(x.e); const sameDay = ref && new Date(ref.s).toDateString() === s.toDateString(); return `${sameDay ? '' : `${p2(s.getDate())}.${p2(s.getMonth() + 1)}. `}${formatTimeHM(s)}–${formatTimeHM(e2)}`; };
  const parts = [];
  if (e.type === 'added') parts.push(e.readded ? 'Wieder eingetragen' : 'Neu eingetragen');
  else if (e.type === 'removed') parts.push('Ausgefallen');
  else if (e.type === 'updated' && e.before && e.now) {
    const b = e.before, n = e.now;
    if (b.s !== n.s || b.e !== n.e) parts.push(`Zeit ${range(b, n)} → ${range(n, b)}`);
    if (b.t !== n.t) parts.push(`Fahrzeug ${b.t || '—'} → ${n.t || '—'}`);
    if (b.l !== n.l) parts.push(`Ort ${b.l || '—'} → ${n.l || '—'}`);
    const cb = crewOf(b.d).colleagues, cn = crewOf(n.d).colleagues;
    const key = (x) => x.toLowerCase().replace(/\s+/g, ' ').trim();
    const add = cn.filter((x) => !cb.some((y) => key(y) === key(x))), del = cb.filter((x) => !cn.some((y) => key(y) === key(x)));
    if (add.length || del.length) parts.push(`Besatzung ${[...add.map((x) => '+ ' + x), ...del.map((x) => '− ' + x)].join(', ')}`);
    if (crewOf(b.d).note !== crewOf(n.d).note) parts.push('Info geändert');
    if (!parts.length) parts.push('Geändert');
  } else return '';
  return `${when(e.at)} · ${parts.join(' · ')}`;
}
/** Dienstplan-Verlauf in die Tagebuch-Dienste übernehmen – bleibt so dauerhaft (und synchronisiert) erhalten. */
function persistPlanLogs(history = readDpHistory()) {
  if (!history || !Object.keys(history).length) return false;
  let changed = false;
  for (const svc of state.services) {
    if (svc.isSeg) continue;
    const keys = historyKeysForService(svc, history);
    if (!keys.length) continue;
    const have = new Set((svc.planLog || []).map((x) => x.id));
    const haveTxt = new Map((svc.planLog || []).map((x) => [x.id, x.txt]));
    for (const [k, e] of keys.flatMap((k) => (history[k].entries || []).map((e) => [k, e]))) {
      if (isEndOfShiftRemoval(e) || e.type === 'relinked') continue;
      // mehrere Teile können im selben Abruf geändert worden sein → Teil-Schlüssel anhängen
      const base = `${e.at}-${e.type}`, id = keys.length > 1 ? `${base}-${k}` : base;
      const plain = planLogText(e);
      if (!plain || have.has(id) || haveTxt.get(base) === plain) continue;
      const l = history[k].last;
      const txt = keys.length > 1 && l ? `${plain} (Teil ${formatTimeHM(new Date(l.s))}–${formatTimeHM(new Date(l.e))})` : plain;
      (svc.planLog = svc.planLog || []).push({ id, at: e.at, txt });
      have.add(id); changed = true;
    }
    if (svc.planLog) svc.planLog.sort((a, b) => a.at - b.at);
  }
  if (changed) saveState();
  return changed;
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

/** Ganzer Eintrag (Zeit, Fahrzeug, Ort, Besatzung, Info); Felder, die sich gegenüber „other“ unterscheiden, werden markiert. */
function histFullHtml(x, other, cls) {
  const c = crewOf(x.d), co = other ? crewOf(other.d) : null;
  const norm = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const diff = (a, b) => !!other && norm(a) !== norm(b);
  const row = (label, val, changed) => `<div class="hist-full-row${changed ? ' is-changed' : ''}"><span class="hist-full-label">${label}</span><span class="hist-full-val">${val || '<span class="is-empty">—</span>'}</span></div>`;
  const otherCrew = co ? new Set(co.colleagues.map(norm)) : null;
  const crew = c.colleagues.map((n) => `<span class="hist-full-crew${otherCrew && !otherCrew.has(norm(n)) ? ' is-changed' : ''}">${escHtml(n)}</span>`).join('');
  return `<div class="hist-full ${cls}">
    ${row('Zeit', escHtml(histFmtRange(x)), !!other && (x.s !== other.s || x.e !== other.e))}
    ${row('Fahrzeug', escHtml(x.t || ''), diff(x.t, other && other.t))}
    ${row('Ort', escHtml(x.l || ''), diff(x.l, other && other.l))}
    ${row('Besatzung', crew, false)}
    ${row('Info', c.note ? `<span class="hist-full-note">${escHtml(c.note)}</span>` : '', !!co && diff(c.note, co.note))}
  </div>`;
}

/** Aufklappbarer Bereich: ganzer Eintrag vorher / nachher. */
function histCompareHtml(e) {
  const parts = [];
  if (e.before) parts.push(`<div class="hist-full-hd">Vorher</div>${histFullHtml(e.before, e.type === 'updated' ? e.now : null, 'is-before')}`);
  if (e.now && e.type !== 'removed') parts.push(`<div class="hist-full-hd">${e.type === 'added' ? 'Eingetragen' : 'Nachher'}</div>${histFullHtml(e.now, e.type === 'updated' ? e.before : null, 'is-after')}`);
  return parts.length ? `<div class="hist-compare">${parts.join('')}</div>` : '';
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
  const cmp = histCompareHtml(e);
  return `<li class="hist-item is-${e.type}${cmp ? ' is-expandable' : ''}"${cmp ? ' tabindex="0" role="button" aria-expanded="false"' : ''}>
    <span class="hist-dot" aria-hidden="true"></span>
    <div class="hist-head"><span class="dp-chg-badge is-${e.type}">${label}</span><span class="hist-at">am ${escHtml(histFmtAt(e.at))}</span>${cmp ? '<span class="hist-chev" aria-hidden="true">›</span>' : ''}</div>
    ${body}
    ${cmp}
  </li>`;
}

function openHistorySheet(key, { expand = false, svcId = null, fresh = false } = {}) {
  if (!fresh) {
    // gleich mit dem lokalen Stand öffnen, dann den aktuellen vom Worker nachladen
    refreshDpHistory(() => {
      const dlg = document.getElementById('dialog-history');
      if (!dlg || dlg.style.display === 'none') return;
      const sv = svcId && state.services.find((x) => x.id === svcId);
      openHistorySheet((sv && historyKeysForService(sv).join(',')) || key, { expand, svcId, fresh: true });
    });
  }
  const history = readDpHistory();
  const multi = String(key).split(',').filter((k) => history[k]);
  let item = multi.length > 1 ? null : history[key];
  if (multi.length > 1) {
    // zusammengefasster Dienst: Änderungen aller Teile, jeweils mit dem Teil gekennzeichnet
    const lasts = multi.map((k) => history[k].last).filter(Boolean);
    const partOf = (k) => { const l = history[k].last; return l ? `${formatTimeHM(new Date(l.s))}–${formatTimeHM(new Date(l.e))}` : ''; };
    const entries = multi.flatMap((k) => (history[k].entries || []).map((e) => ({ ...e, part: partOf(k) }))).sort((a, b) => a.at - b.at);
    const s0 = Math.min(...lasts.map((l) => l.s)), e0 = Math.max(...lasts.map((l) => l.e));
    item = { uid: multi[0], entries, multi: multi.length, allRemoved: multi.every((k) => { const en = history[k].entries || []; return en.length && en[en.length - 1].type === 'removed'; }),
      last: { ...lasts[0], s: s0, e: e0 } };
  }
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
  const removed = item.multi ? item.allRemoved : item.entries.length && item.entries[item.entries.length - 1].type === 'removed';
  document.getElementById('hist-title').textContent = last.t || 'Dienst';
  box.innerHTML = `
    <div class="hist-summary${removed ? ' is-removed' : ''}">
      ${shiftCodeHtml(new Date(last.s), 'is-small')}
      <span>${escHtml(histFmtRange(last))}${last.l ? ' · ' + escHtml(last.l) : ''}</span>
      ${removed ? '<span class="dp-chg-badge is-removed">Ausgefallen</span>' : ''}
      ${item.multi ? `<span class="hist-multi">🔗 aus ${item.multi} Dienstplan-Einträgen</span>` : ''}
    </div>
    <ol class="hist-list">${item.entries.slice().reverse().map((e) => { const h = historyEntryHtml(e); return e.part ? h.replace('<span class="hist-at">', `<span class="hist-part">${escHtml(e.part)}</span><span class="hist-at">`) : h; }).join('')}</ol>
    <p class="hist-foot">Tippe auf eine Änderung, um den ganzen Eintrag vorher und nachher zu sehen. Aufgezeichnet vom Dienstplan-Worker seit dem Einrichten der Benachrichtigungen. Gespeichert bis 30 Tage nach Dienstende.</p>`;
  const items = box.querySelectorAll('.hist-item.is-expandable');
  // immer höchstens eine Änderung aufgeklappt
  const toggle = (li) => {
    const open = !li.classList.contains('is-open');
    items.forEach((x) => { x.classList.remove('is-open'); x.setAttribute('aria-expanded', 'false'); });
    if (open) { li.classList.add('is-open'); li.setAttribute('aria-expanded', 'true'); }
  };
  items.forEach((li) => {
    li.addEventListener('click', () => toggle(li));
    li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(li); } });
  });
  // aus einer Mitteilung (neueste Änderung) oder nur eine Änderung: gleich aufgeklappt zeigen
  if (items.length && (expand || items.length === 1)) toggle(items[0]);
  openDialog('dialog-history');
}

/** Klicks auf Verlaufs-Knöpfe überall in der App (eine Stelle für alle). */
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-hist]');
  if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  openHistorySheet(btn.dataset.hist, { svcId: btn.dataset.histSvc || null });
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
      loadDpHistory().then(() => openHistorySheet(key, { expand: true })).catch(() => openHistorySheet(key, { expand: true }));
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
  if (activeTab === 'einstellungen' && settingsSub && !settingsWide()) {
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
  if (activeTab === 'einstellungen' && settingsSub && !settingsWide()) return SETTINGS_PAGES[settingsSub];
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
  bar.classList.toggle('show-title', liteOn() || isServiceDetailView() || (activeTab === 'einstellungen' && !!settingsSub && !settingsWide()) || y > 40);
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
  // nur sichtbare, noch vorhandene Felder zählen (geschlossene Dialoge behalten sonst den Fokus)
  return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.isConnected && a.offsetParent !== null);
}
/** Tab Bar wieder einblenden, wenn kein Eingabefeld mehr aktiv ist. */
function syncKbOpen() {
  if (!isTypingSomewhere()) document.body.classList.remove('kb-open');
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
    // Auswahllisten (SELECT) öffnen keine Tastatur → Tab Bar bleibt
    if (!isMobile() || !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
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

// ── Konto & Synchronisation (Ende-zu-Ende verschlüsselt) ─────────────────────
// Das Tagebuch wird auf dem Gerät mit AES-256-GCM verschlüsselt; der Schlüssel
// entsteht aus dem Passwort (PBKDF2, 600 000 Runden) und wird nur hier – nicht
// auslesbar – in IndexedDB abgelegt. Der Worker sieht nur verschlüsselte Daten.
// Nicht synchronisiert: Dienstplan-Zugangsschlüssel und die Sync-Anmeldung selbst.
const SYNC_URL_KEY = 'etb_sync_url';
const SYNC_USER_KEY = 'etb_sync_user';
const SYNC_TOKEN_KEY = 'etb_sync_token';
const SYNC_BASE_KEY = 'etb_sync_base';
const SYNC_DIRTY_KEY = 'etb_sync_dirty';
const SYNC_LAST_KEY = 'etb_sync_last';
const SYNC_DEVICE_KEY = 'etb_sync_device';
// zusätzlich zu den App-Einstellungen mitsynchronisiert (Gerät ↔ Gerät)
const CAL_FEED_KEY = 'etb_cal_feed'; // Kalender-Abo: { id, key, crew } – wird (verschlüsselt) mitsynchronisiert
const SYNC_EXTRA_LS = [CAL_FEED_KEY, DP_WORKER_KEY, 'etb_places_sort', 'etb_abt_sug_hidden', 'etb_tdp_dept', 'etb_badges_seen', BACKUP_KEY];
let syncApplying = false, syncTimer = 0, syncBusy = false;

const syncOn = () => !!(lsGet(SYNC_TOKEN_KEY) && lsGet(SYNC_URL_KEY));
const syncDevice = () => lsGet(SYNC_DEVICE_KEY) || (isIOSDevice() ? 'iPhone' : (navigator.userAgentData && navigator.userAgentData.platform) || 'Computer');
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBytes(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

// — Schlüssel in IndexedDB (nicht exportierbar) —
function syncDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('etb-sync', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function syncKeyStore(key) {
  const db = await syncDb();
  await new Promise((res, rej) => { const t = db.transaction('keys', 'readwrite'); key ? t.objectStore('keys').put(key, 'enc') : t.objectStore('keys').delete('enc'); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
async function syncKeyLoad() {
  try {
    const db = await syncDb();
    return await new Promise((res) => { const t = db.transaction('keys', 'readonly'); const r = t.objectStore('keys').get('enc'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
  } catch (_) { return null; }
}
/** Passwort → { authKey (an den Server), encKey (bleibt hier) } */
async function syncDerive(password, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64u(saltB64), iterations: iter }, base, 512));
  const encKey = await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { authKey: b64u(bits.slice(0, 32)), encKey };
}
async function syncApi(path, body, { token = lsGet(SYNC_TOKEN_KEY), url = lsGet(SYNC_URL_KEY) } = {}) {
  const res = await fetch(url.replace(/\/+$/, '') + path, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) { const e = new Error(syncErrText(data.error, data)); e.code = data.error; e.status = res.status; e.data = data; throw e; }
  return data;
}
function syncErrText(code, d = {}) {
  return ({
    invalid_login: 'Benutzername oder Passwort falsch.', totp_required: 'Bitte den Code aus der Authenticator-App eingeben.',
    invalid_totp: 'Code falsch oder schon verwendet.', locked: `Zu viele Fehlversuche – bitte in ${Math.ceil((d.retryAfter || 900) / 60)} Minuten erneut versuchen.`,
    unauthorized: 'Nicht angemeldet oder Zugangsschlüssel falsch.', account_exists: 'Auf diesem Server gibt es schon ein Konto – bitte anmelden.',
    bad_username: 'Benutzername: 3–40 Zeichen (Buchstaben, Ziffern, . _ -).', conflict: 'Auf einem anderen Gerät wurde inzwischen geändert.',
    not_found: 'Diese Funktion kennt der Worker noch nicht – bitte den Worker aktualisieren.', too_large: 'Daten zu groß.',
  })[code] || 'Server-Fehler' + (code ? ` (${code})` : '');
}

// — Inhalt: ganzer Zustand + Einstellungen (ohne Dienstplan-Schlüssel) —
function syncCollect() {
  const ls = {};
  [...SETTINGS_EXPORT_KEYS, ...SYNC_EXTRA_LS].forEach((k) => { const v = lsGet(k); if (v) ls[k] = v; });
  return { format: 'etb-sync-1', at: Date.now(), app: APP_VERSION, state, ls };
}
async function syncEncrypt(obj) {
  const key = await syncKeyLoad();
  if (!key) throw new Error('Schlüssel fehlt – bitte neu anmelden.');
  let bytes = new TextEncoder().encode(JSON.stringify(obj)), z = false;
  if (typeof CompressionStream !== 'undefined') {
    bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); z = true;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { iv: b64u(iv), ct: bytesToB64(ct), z };
}
async function syncDecrypt(data, key) {
  key = key || await syncKeyLoad();
  let bytes;
  try { bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(data.iv) }, key, b64ToBytes(data.ct))); }
  catch (_) { throw new Error('Entschlüsseln fehlgeschlagen – falsches Passwort?'); }
  if (data.z) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}
function syncApply(obj) {
  if (!obj || obj.format !== 'etb-sync-1' || !obj.state) throw new Error('Unbekanntes Format.');
  syncApplying = true;
  try {
    state = normalizeState(obj.state);
    saveState();
    Object.entries(obj.ls || {}).forEach(([k, v]) => { if ([...SETTINGS_EXPORT_KEYS, ...SYNC_EXTRA_LS].includes(k)) lsSet(k, v); });
    applyTheme(lsGet('etb_theme') || 'system');
    applyCompact(lsGet('etb_compact') === '1');
    applyVehicleMirror();
  } finally { syncApplying = false; }
  renderTab(activeTab);
  if (activeTab !== 'einstellungen') renderSettings();
}

/** Nach jeder lokalen Änderung: als „ungesichert“ markieren, kurz warten, dann hochladen. */
let syncRev = 0; // zählt lokale Änderungen – nur was hochgeladen wurde, gilt als gesichert
function syncNoteChange() {
  if (syncApplying || !syncOn()) return;
  syncRev++;
  lsSet(SYNC_DIRTY_KEY, '1');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow({ quiet: true }).catch(() => {}), 20000);
}
// — Zusammenführen (3-Wege): Basis = zuletzt gemeinsamer Stand, „ours“ = dieses
// Gerät, „theirs“ = Server. Pro Eintrag (Dienst, Einsatz, Kürzel, Einstellung …):
// nur auf einer Seite geändert → übernehmen; auf beiden gleich → egal;
// auf beiden unterschiedlich → Rückfrage (ohne Antwort gilt „dieses Gerät“).
const MERGE_IDS = ['id', 'code', 'name'];
const isPlain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
function stableStr(x) {
  if (Array.isArray(x)) return '[' + x.map(stableStr).join(',') + ']';
  if (isPlain(x)) return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + stableStr(x[k])).join(',') + '}';
  return JSON.stringify(x === undefined ? null : x);
}
const same = (a, b) => stableStr(a) === stableStr(b);
function arrayKey(...arrs) {
  const all = arrs.flatMap((a) => (Array.isArray(a) ? a : []));
  if (!all.length) return null;
  return MERGE_IDS.find((k) => all.every((o) => isPlain(o) && o[k] !== undefined && o[k] !== null && o[k] !== '')) || null;
}
function merge3(base, ours, theirs, path, ctx) {
  if (same(ours, theirs)) return ours;
  if (base !== undefined && same(ours, base)) return theirs;
  if (base !== undefined && same(theirs, base)) return ours;
  if (isPlain(ours) && isPlain(theirs)) {
    const b = isPlain(base) ? base : {};
    const out = {};
    const keys = [...new Set([...Object.keys(theirs), ...Object.keys(ours), ...Object.keys(b)])];
    for (const k of keys) {
      const v = mergeSlot(k in b ? b[k] : undefined, k in ours ? ours[k] : undefined, k in theirs ? theirs[k] : undefined, [...path, k], ctx);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : [];
    const key = arrayKey(b, ours, theirs);
    if (key) {
      const map = (arr) => new Map(arr.map((o) => [String(o[key]), o]));
      const mb = map(b), mo = map(ours), mt = map(theirs);
      const order = [...new Set([...theirs.map((o) => String(o[key])), ...ours.map((o) => String(o[key]))])];
      const out = [];
      for (const id of order) {
        const v = mergeSlot(mb.get(id), mo.get(id), mt.get(id), [...path, `${key}=${id}`], ctx);
        if (v !== undefined) out.push(v);
      }
      return out;
    }
    if ([...b, ...ours, ...theirs].every((x) => !x || typeof x !== 'object')) {
      // Listen von Texten/Zahlen: Hinzufügen und Entfernen beider Seiten übernehmen
      const has = (arr, x) => arr.some((y) => y === x);
      const removedByOurs = b.filter((x) => !has(ours, x));
      const out = theirs.filter((x) => !has(removedByOurs, x));
      ours.forEach((x) => { if (!has(b, x) && !has(out, x)) out.push(x); });
      return out;
    }
  }
  return ctx.resolve(path, base, ours, theirs);
}
/** Ein Feld/Eintrag, der auf einer Seite fehlen kann (gelöscht oder neu). */
function mergeSlot(b, o, t, path, ctx) {
  if (o === undefined && t === undefined) return undefined;
  if (o === undefined) {
    if (b === undefined) return t;            // nur dort neu
    if (same(t, b)) return undefined;          // hier gelöscht, dort unverändert
    return ctx.resolve(path, b, undefined, t); // hier gelöscht, dort geändert
  }
  if (t === undefined) {
    if (b === undefined) return o;
    if (same(o, b)) return undefined;
    return ctx.resolve(path, b, o, undefined);
  }
  return merge3(b, o, t, path, ctx);
}
function syncMerge(baseObj, ours, theirs, choices = {}) {
  const conflicts = [];
  const ctx = {
    resolve(path, b, o, t) {
      const key = path.join('/');
      // Geräte-Einstellungen nicht nachfragen: Zeitstempel → jüngerer, sonst dieses Gerät
      if (path[0] === 'ls') return /^\d{10,}$/.test(String(o)) && /^\d{10,}$/.test(String(t)) ? String(Math.max(+o, +t)) : (o === undefined ? t : o);
      conflicts.push({ key, path, ours: o, theirs: t });
      return choices[key] === 'theirs' ? t : o;
    },
  };
  const pick = (x) => ({ state: x ? x.state : undefined, ls: x ? x.ls || {} : {} });
  const B = baseObj ? pick(baseObj) : { state: undefined, ls: undefined };
  const O = pick(ours), T = pick(theirs);
  const state = merge3(B.state, O.state, T.state, ['state'], ctx);
  const ls = merge3(B.ls, O.ls, T.ls, ['ls'], ctx);
  return { result: { ...ours, at: Date.now(), state, ls }, conflicts };
}
// — Konflikte verständlich benennen —
const MERGE_FIELD = { note: 'Notiz', alarmCode: 'Stichwort', vehicle: 'Fahrzeug', location: 'Dienststelle', startAt: 'Beginn', endAt: 'Ende', colleagues: 'Besatzung', times: 'Zeiten', from: 'Start', to: 'Ziel', pzc: 'PZC', naca: 'NACA', einsatzart: 'Einsatzart', statKz: 'Statistik-KZ', lights: 'Blaulicht', favorite: 'Favorit', links: 'Links', extraVehicles: 'weitere Fahrzeuge', displayName: 'Anzeigename', places: 'Orte & Ziele', dienststellen: 'Dienststellen', alarmCodes: 'Stichwörter', pzcCodes: 'PZC-Liste', vehicleCategories: 'Fahrzeug-Icons', vehicleAssignments: 'Fahrzeug-Zuweisung' };
function mergeLabel(c, ours, theirs) {
  const p = c.path;
  const find = (root, segs) => { let cur = root; for (const s of segs) { if (cur === undefined || cur === null) return undefined; if (Array.isArray(cur) && s.includes('=')) { const [k, v] = s.split('='); cur = cur.find((o) => String(o[k]) === v); } else cur = cur[s]; } return cur; };
  const parts = [];
  if (p[0] === 'ls') return 'Einstellung ' + (p[1] || '');
  if (p[1] === 'services' && p[2]) {
    const svc = find(ours.state, p.slice(1, 3)) || find(theirs.state, p.slice(1, 3)) || {};
    const d = parseLocalDt(svc.startAt);
    parts.push(svc.isSeg ? 'SEG' : `Dienst ${svc.vehicle || ''}`.trim(), d ? d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }) : '');
    if (p[3] === 'incidents' && p[4]) {
      const inc = find(ours.state, p.slice(1, 5)) || find(theirs.state, p.slice(1, 5)) || {};
      parts.push('· Einsatz ' + (inc.alarmCode || ''));
      if (p[5]) parts.push('· ' + (MERGE_FIELD[p[5]] || p[5]));
    } else if (p[3]) parts.push('· ' + (MERGE_FIELD[p[3]] || p[3]));
    return parts.filter(Boolean).join(' ');
  }
  return p.slice(1).map((s) => MERGE_FIELD[s] || s.replace(/^\w+=/, '')).join(' · ');
}
function mergeShow(v) {
  if (v === undefined) return 'gelöscht';
  if (v === null || v === '') return 'leer';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v !== 'object') return String(v).length > 60 ? String(v).slice(0, 59) + '…' : String(v);
  if (v.alarmCode || v.vehicle) return [v.alarmCode || v.vehicle, v.note].filter(Boolean).join(' · ').slice(0, 60);
  const s = Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? (x.name || x.alarmCode || '…') : x)).join(', ') : Object.entries(v).map(([k, x]) => `${MERGE_FIELD[k] || k}: ${typeof x === 'object' ? '…' : x}`).join(', ');
  return s.length > 60 ? s.slice(0, 59) + '…' : s || '—';
}
/** Rückfrage je Konflikt: „Dieses Gerät“ oder „Anderes Gerät“. */
function askMergeChoices(conflicts, ours, theirs, otherDevice) {
  return new Promise((resolve) => {
    const choices = {};
    const ov = document.createElement('div');
    ov.className = 'dialog-overlay';
    ov.style.cssText = 'display:flex;z-index:3000';
    ov.innerHTML = `<div class="dialog-box dialog-box-wide"><div class="dialog-header"><h3>Änderungen zusammenführen</h3></div>
      <div class="dialog-body">
        <p class="mg-intro">Alles andere wurde automatisch zusammengeführt. Diese ${conflicts.length === 1 ? 'Stelle wurde' : `${conflicts.length} Stellen wurden`} auf beiden Geräten unterschiedlich geändert – was soll gelten?</p>
        ${conflicts.map((c, i) => `<div class="mg-item"><div class="mg-label">${escHtml(mergeLabel(c, ours, theirs))}</div>
          <div class="mg-opts" data-i="${i}">
            <button type="button" class="mg-opt is-on" data-v="ours"><small>Dieses Gerät</small><span>${escHtml(mergeShow(c.ours))}</span></button>
            <button type="button" class="mg-opt" data-v="theirs"><small>${escHtml(otherDevice || 'Anderes Gerät')}</small><span>${escHtml(mergeShow(c.theirs))}</span></button>
          </div></div>`).join('')}
        <button type="button" class="btn-primary" id="mg-ok">Zusammenführen</button>
        <p class="mg-intro">Der bisherige Stand dieses Geräts wird zusätzlich am Server aufgehoben.</p>
      </div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('.mg-opts').forEach((row) => row.addEventListener('click', (e) => {
      const b = e.target.closest('.mg-opt'); if (!b) return;
      row.querySelectorAll('.mg-opt').forEach((x) => x.classList.toggle('is-on', x === b));
      choices[conflicts[+row.dataset.i].key] = b.dataset.v;
    }));
    ov.querySelector('#mg-ok').onclick = () => { ov.remove(); resolve(choices); };
  });
}
// — Gemeinsamer Stand („Basis“) für das Zusammenführen, lokal in IndexedDB —
async function syncSnapSave(v, obj) {
  try { const db = await syncDb(); await new Promise((res, rej) => { const t = db.transaction('keys', 'readwrite'); t.objectStore('keys').put({ v, obj }, 'snap'); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (_) {}
}
async function syncSnapLoad() {
  try { const db = await syncDb(); return await new Promise((res) => { const t = db.transaction('keys', 'readonly'); const r = t.objectStore('keys').get('snap'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (_) { return null; }
}

async function syncSetBase(v, obj, rev) {
  lsSet(SYNC_BASE_KEY, String(v)); lsSet(SYNC_LAST_KEY, String(Date.now()));
  if (rev === undefined || rev === syncRev) lsSet(SYNC_DIRTY_KEY, null); // inzwischen weiter geändert → bleibt „ungesichert“
  await syncSnapSave(v, obj);
}
/**
 * Abgleich mit dem Server:
 *  - neuer Server-Stand, hier nichts geändert → übernehmen
 *  - hier geändert, Server unverändert → hochladen
 *  - beides → pro Eintrag zusammenführen (Rückfrage nur bei echten Widersprüchen),
 *    bisherigen Gerätestand am Server aufheben, Ergebnis hochladen
 * Der Server legt eine neue Version nur an, wenn die Basis noch stimmt – sonst
 * wird erneut abgeglichen. So kann kein Gerät ein anderes überschreiben.
 */
async function syncNow({ quiet = false } = {}) {
  if (!syncOn() || syncBusy) return;
  syncBusy = true;
  clearTimeout(syncTimer);
  let failed = false;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const st = await syncApi('/sync/state', { device: syncDevice() }); // meldet nebenbei den Gerätenamen
      if (attempt === 0) await calCheck(st.cal ? st : null);
      const base = Number(lsGet(SYNC_BASE_KEY)) || 0;
      const dirty = lsGet(SYNC_DIRTY_KEY) === '1';
      if (st.latest > base) {
        const p = await syncApi('/sync/pull', { version: st.latest });
        const remote = await syncDecrypt(p.data);
        if (!dirty) {
          syncApply(remote);
          await syncSetBase(p.version, remote);
          if (!quiet) toast('Neuester Stand geladen.', 'success', 1800);
          return;
        }
        const rev = syncRev;
        const local = syncCollect();
        const snap = await syncSnapLoad();
        const baseObj = snap && snap.v === base ? snap.obj : null;
        let { result, conflicts } = syncMerge(baseObj, local, remote);
        if (conflicts.length) ({ result } = syncMerge(baseObj, local, remote, await askMergeChoices(conflicts, local, remote, p.device)));
        await syncApi('/sync/aside', { data: await syncEncrypt(local), device: syncDevice() }).catch(() => {});
        syncApply(result);
        lsSet(SYNC_BASE_KEY, String(p.version));
        await syncSnapSave(p.version, remote);
        try {
          const r = await syncApi('/sync/push', { base: p.version, data: await syncEncrypt(result), device: syncDevice() });
          await syncSetBase(r.version, result, rev);
          toast(conflicts.length ? 'Zusammengeführt.' : 'Änderungen beider Geräte zusammengeführt.', 'success', 2200);
          return;
        } catch (e) { if (e.code !== 'conflict') throw e; lsSet(SYNC_DIRTY_KEY, '1'); continue; }
      }
      if (dirty || st.latest === 0) {
        const rev = syncRev;
        const obj = syncCollect();
        try {
          const r = await syncApi('/sync/push', { base: st.latest, data: await syncEncrypt(obj), device: syncDevice() });
          await syncSetBase(r.version, obj, rev);
          if (!quiet) toast('Gesichert.', 'success', 1500);
          return;
        } catch (e) { if (e.code !== 'conflict') throw e; continue; } // jemand war schneller → neu abgleichen
      }
      lsSet(SYNC_LAST_KEY, String(Date.now()));
      if (!quiet) toast('Alles aktuell.', 'success', 1500);
      return;
    }
  } catch (err) {
    failed = true;
    if (err.status === 401 && err.code === 'unauthorized') { lsSet(SYNC_TOKEN_KEY, null); toast('Sync: Anmeldung abgelaufen – bitte neu anmelden.', 'info', 5000); }
    else if (!quiet) toast('Sync: ' + err.message, 'error', 4000);
  } finally {
    syncBusy = false;
    if (!failed) calPublish().catch(() => {});
    // nicht neu aufbauen, solange auf der Konto-Seite getippt wird (sonst geht die Eingabe verloren)
    const typing = document.activeElement && document.activeElement.matches && document.activeElement.matches('#sy-device, .set-form input');
    if (settingsSub === 'konto' && activeTab === 'einstellungen' && !typing) renderSettingsPage();
  }
}
// offen gelassene App bzw. Browser-Tab: jede Minute nachsehen (nicht während Eingaben/Fenstern)
setInterval(() => {
  if (!syncOn() || syncBusy || document.visibilityState !== 'visible' || isTypingSomewhere() || topVisibleOverlay()) return;
  syncNow({ quiet: true }).catch(() => {});
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!syncOn()) return;
  if (document.visibilityState === 'hidden' && lsGet(SYNC_DIRTY_KEY) === '1') syncNow({ quiet: true }).catch(() => {});
  if (document.visibilityState === 'visible') syncNow({ quiet: true }).catch(() => {});
});

// ── Kalender-Abo ────────────────────────────────────────────────────────────
// Die App erstellt den Kalender (alle Dienste aus dem Tagebuch mit Fahrzeug,
// Dienststelle, Zeiten, Besatzung und Einsatz-Stichwörtern – keine PZC, NACA,
// Notizen, Adressen oder Patientendaten), verschlüsselt ihn mit einem eigenen
// Schlüssel und lädt ihn auf den Worker. Der Schlüssel steht nur im Abo-Link.
// Geplante Dienste ergänzt der Worker live aus dem Dienstplan.
// Die Link-Daten liegen zusätzlich mit dem Sync-Schlüssel verschlüsselt am
// Worker – so zeigt jedes angemeldete Gerät denselben Link.
const CAL_HASH_KEY = 'etb_cal_hash';   // zuletzt hochgeladener Stand (nur lokal)
function calCfg() { try { const c = JSON.parse(lsGet(CAL_FEED_KEY) || 'null'); return c && c.id && c.key ? c : null; } catch (_) { return null; } }
function calLink(cfg = calCfg(), webcal = false) {
  if (!cfg) return '';
  const u = `${String(lsGet(SYNC_URL_KEY) || '').replace(/\/+$/, '')}/cal/${cfg.id}/${cfg.key}.ics`;
  return webcal ? u.replace(/^https?:/, 'webcal:') : u;
}
/** Kalendertext für das Abo – bewusst ohne PZC, NACA, Notizen, Adressen und Patientendaten. */
function buildFeedIcs() {
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const dt = (s) => s.replace(/-/g, '').replace(/:/g, '') + '00';
  const list = state.services.filter((x) => x.startAt).sort((a, b) => a.startAt.localeCompare(b.startAt) || String(a.id).localeCompare(String(b.id)));
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Einsatztagebuch//DE'];
  // Ort → Dienststellen-ID, damit der Worker auch bei geplanten Diensten den Tagesdienstplan verlinken kann
  const locs = new Set([...(state.dienststellen || []).map((d) => d.name), ...state.services.map((x) => x.location), ...((readIcsCache() || {}).shifts || []).flatMap((sh) => [sh.location, sh.abteilung])].filter(Boolean));
  for (const l of locs) { const d = findAbteilung({ location: l }); if (d && d.deptId) out.push(`X-ETB-DEPT:${encodeURIComponent(l.trim().toLowerCase())}=${encodeURIComponent(d.deptId)}`); }
  for (const x of list) {
    const a = parseLocalDt(x.startAt), e = parseLocalDt(x.endAt) || a;
    const incs = incidentsNewestFirst(x.incidents || []).slice().reverse();
    // Reihenfolge: Besatzung · Dienstplan-Änderungen · Tagesdienstplan · Einsätze
    const sec = [];
    if ((x.colleagues || []).length && !x.isSeg) sec.push(x.colleagues.join(', '));
    if ((x.planLog || []).length) sec.push(['Änderungen im Dienstplan:', ...x.planLog.map((l) => '• ' + l.txt)].join('\n'));
    const tdp = x.isSeg ? null : dienstplanUrl(x);
    if (tdp) sec.push('Tagesdienstplan: ' + tdp);
    if (incs.length) sec.push([`${incs.length} ${incs.length === 1 ? 'Einsatz' : 'Einsätze'}`, ...incs.map((i) => `${i.lights ? '🔵' : '⚪'} ${i.alarmCode || 'Einsatz'}`)].join('\n'));
    const desc = sec.length ? [sec.join('\n\n')] : [];
    out.push('BEGIN:VEVENT', `UID:${String(x.id).replace(/[^A-Za-z0-9_-]/g, '')}@einsatztagebuch`, `DTSTAMP:${dt(x.startAt)}`, `DTSTART:${dt(x.startAt)}`);
    if (x.endAt) out.push(`DTEND:${dt(x.endAt)}`);
    out.push(`SUMMARY:${esc(x.isSeg ? `SEG · ${(incs[0] || {}).alarmCode || 'Einsatz'}` : x.vehicle || 'Dienst')}`);
    if (x.location && !x.isSeg) out.push(`LOCATION:${esc(x.location)}`); // SEG: Ort kann eine Einsatzadresse sein
    if (desc.length) out.push(`DESCRIPTION:${esc(desc.join('\n'))}`);
    if (tdp) out.push(`URL:${tdp}`);
    if (x.dpUid) out.push(`X-ETB-PLAN:${String(x.dpUid).replace(/[\r\n]/g, '')}`);
    if (a && e) out.push(`X-ETB-SPAN:${a.getTime()}-${e.getTime()}`);
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}
async function calEncrypt(text, keyB64u) {
  const key = await crypto.subtle.importKey('raw', unb64u(keyB64u), 'AES-GCM', false, ['encrypt']);
  let bytes = new TextEncoder().encode(text), z = false;
  if (typeof CompressionStream !== 'undefined') { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); z = true; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { iv: b64u(iv), ct: bytesToB64(ct), z };
}
const calKeyHash = async (key) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('etb-cal|' + key)))].map((b) => b.toString(16).padStart(2, '0')).join('');
/** Link-Daten vom Server übernehmen (mit dem Sync-Schlüssel verschlüsselt) – gleicher Link auf allen Geräten. */
async function calAdopt(info) {
  try {
    info = info || await syncApi('/sync/cal/info');
    if (!info.on) { if (calCfg()) { lsSet(CAL_FEED_KEY, null); lsSet(CAL_HASH_KEY, null); } return null; }
    const cur = calCfg();
    if (cur && cur.id === info.id) return cur;
    if (!info.wrapped) return cur;
    const cfg = await syncDecrypt(info.wrapped);
    if (cfg && cfg.id === info.id && cfg.key) { lsSet(CAL_FEED_KEY, JSON.stringify({ id: cfg.id, key: cfg.key })); lsSet(CAL_HASH_KEY, null); return cfg; }
  } catch (_) {}
  return calCfg();
}
let calBusy = false;
/** Kalender hochladen, wenn er sich geändert hat (oder erzwungen / mit neuem Link). */
async function calPublish({ force = false, replace = false } = {}) {
  const cfg = calCfg();
  if (!cfg || !syncOn() || calBusy) return false;
  calBusy = true;
  try {
    try { persistPlanLogs(); } catch (_) {}
    const text = buildFeedIcs();
    const hash = cfg.id + ':' + await calKeyHash(text);
    if (!force && !replace && lsGet(CAL_HASH_KEY) === hash) return false;
    try {
      await syncApi('/sync/cal/put', { id: cfg.id, keyHash: await calKeyHash(cfg.key), data: await calEncrypt(text, cfg.key), wrapped: await syncEncrypt({ id: cfg.id, key: cfg.key }), replace });
    } catch (e) {
      // anderes Gerät hat inzwischen einen neuen Link erzeugt → diesen übernehmen
      if (e.code === 'cal_other') { lsSet(CAL_FEED_KEY, null); calBusy = false; if (await calAdopt()) return calPublish({ force: true }); return false; }
      throw e;
    }
    lsSet(CAL_HASH_KEY, hash);
    return true;
  } finally { calBusy = false; }
}
async function calCreate() {
  const cfg = { id: b64u(crypto.getRandomValues(new Uint8Array(18))), key: b64u(crypto.getRandomValues(new Uint8Array(32))) };
  const old = lsGet(CAL_FEED_KEY);
  lsSet(CAL_FEED_KEY, JSON.stringify(cfg));
  try { await calPublish({ replace: true }); }
  catch (e) { lsSet(CAL_FEED_KEY, old); throw e; }
  syncNoteChange();
  return cfg;
}
/** beim Abgleich: Abo-Stand des Servers übernehmen (neuer Link / beendet). */
async function calCheck(st) {
  if (!st || !st.cal) return;
  const cur = calCfg();
  if (st.cal.on ? !cur || cur.id !== st.cal.id : !!cur) await calAdopt();
}

// ── Zugriffsprotokoll des Workers ──────────────────────────────────────────
const LOG_CAT = { sync: 'Sync', kalender: 'Kalender-Abo', dienstplan: 'Dienstplan', push: 'Mitteilungen', img: 'Fahrzeugbilder', unbekannt: 'Unbekannte Adresse' };
const flagOf = (c) => (/^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : '🌐');
function logUaLabel(ua) {
  ua = String(ua || '');
  if (/dataaccessd|CalendarAgent|iCal/i.test(ua)) return /Mac/i.test(ua) ? 'Mac-Kalender' : 'iPhone/iPad-Kalender';
  if (/Google-Calendar|Google/i.test(ua)) return 'Google Kalender';
  if (/Outlook|Microsoft/i.test(ua)) return 'Outlook';
  if (/iPhone|iPad/i.test(ua)) return /CriOS|FxiOS/.test(ua) ? 'iPhone-Browser' : 'iPhone (Safari/App)';
  if (/Android/i.test(ua)) return 'Android';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  if (/curl|wget|python|go-http|bot|crawler|spider/i.test(ua)) return ua.slice(0, 30) + ' (Skript/Bot)';
  return ua ? ua.slice(0, 40) : 'ohne Kennung';
}
const LOG_WHY = (e) => e.c !== 'AT' ? 'außerhalb Österreichs' : e.cat === 'unbekannt' ? 'unbekannte Adresse' : e.status === 401 || e.status === 403 ? 'abgewiesen (keine Berechtigung)' : e.status === 404 ? (e.cat === 'kalender' ? 'falscher Kalender-Link' : 'nicht gefunden') : e.status >= 500 ? 'Fehler' : '';
async function openAccessLog() {
  const body = document.getElementById('accesslog-body');
  if (!body) return;
  body.innerHTML = '<div class="empty-hint"><span class="ios-spinner"></span>Wird geladen …</div>';
  openDialog('dialog-accesslog');
  let d;
  try { d = await syncApi('/sync/log'); } catch (e) { body.innerHTML = `<p class="al-empty">${escHtml(e.status === 404 ? 'Der Worker kennt das Protokoll noch nicht – bitte den Worker aktualisieren.' : e.message)}</p>`; return; }
  const fmt = (t) => new Date(t).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  let view = (d.notable || []).length ? 'bad' : 'all';
  const where = (e) => [e.city, e.org ? e.org + (e.asn ? ` · AS${e.asn}` : '') : ''].filter(Boolean).join(' · ');
  const render = () => {
    const day = d.day ? d.day.reduce((n, x) => n + x.n, 0) : null;
    const rows = view === 'bad'
      ? (d.notable || []).map((e) => `<div class="al-row is-bad"><span class="al-flag">${flagOf(e.c)}</span><span class="al-t"><b>${escHtml(LOG_CAT[e.cat] || e.cat)} – ${escHtml(LOG_WHY(e) || String(e.status))}</b>
          <small>${escHtml([fmt(e.at), e.c + (e.city ? ' ' + e.city : ''), e.org, e.ip].filter(Boolean).join(' · '))}</small>
          <small>${escHtml(logUaLabel(e.ua))} · ${escHtml(e.method)} ${escHtml(e.path)} → ${e.status}</small></span></div>`)
      : (d.clients || []).map((e) => `<div class="al-row"><span class="al-flag">${flagOf(e.c)}</span><span class="al-t"><b>${escHtml(LOG_CAT[e.cat] || e.cat)} · ${escHtml(logUaLabel(e.ua))}</b>
          <small>${escHtml(where(e) || e.c)}${e.ip ? ' · ' + escHtml(e.ip) : ''}</small>
          <small>${e.n ? `${e.n}× · ` : ''}zuletzt ${escHtml(fmt(e.last))} · seit ${escHtml(fmt(e.first))}</small></span></div>`);
    body.innerHTML = `
      ${day !== null ? `<div class="al-stats">${d.day.sort((a, b) => b.n - a.n).map((x) => `<span><b>${x.n}</b> ${escHtml(LOG_CAT[x.cat] || x.cat)}${x.bad ? ` <i>${x.bad} auffällig</i>` : ''}</span>`).join('')}<small>Abrufe der letzten 24 Stunden</small></div>` : ''}
      <div class="seg-ctrl al-seg"><button type="button" data-v="bad" class="${view === 'bad' ? 'is-on' : ''}">Auffällig · ${(d.notable || []).length}</button><button type="button" data-v="all" class="${view === 'all' ? 'is-on' : ''}">Abrufer · ${(d.clients || []).length}</button></div>
      <div class="al-list">${rows.join('') || `<p class="al-empty">${view === 'bad' ? 'Nichts Auffälliges – alles ruhig. ✓' : 'Noch keine Abrufe.'}</p>`}</div>
      <p class="al-note">Auffällig: Abrufe von außerhalb Österreichs, abgewiesene Anmeldungen, falsche Kalender-Links und unbekannte Adressen. Gesperrt wird nichts. ${d.backend === 'd1' ? 'Gespeichert 30 Tage in der D1-Datenbank.' : 'Ohne D1-Datenbank werden nur Auffälligkeiten und Abrufer (stündlich) vermerkt.'} Links, Schlüssel und Inhalte werden nie protokolliert.</p>
      <button type="button" class="btn-secondary al-clear">Protokoll leeren</button>`;
    body.querySelectorAll('.al-seg button').forEach((bt) => bt.addEventListener('click', () => { view = bt.dataset.v; render(); }));
    body.querySelector('.al-clear').onclick = async () => {
      if (!confirm('Zugriffsprotokoll leeren?')) return;
      await syncApi('/sync/log/clear').catch((e) => toast(e.message, 'error'));
      openAccessLog();
    };
  };
  render();
}

async function syncRenderCal(el) {
  const box = el.querySelector('#sy-cal');
  if (!box) return;
  const fmt = (t) => new Date(t).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  let info = { on: false };
  try { info = await syncApi('/sync/cal/info'); } catch (e) { box.innerHTML = `<div class="set-row"><span class="set-row-text set-row-sub">${escHtml(e.message)}</span></div>`; return; }
  const cfg = info.on ? await calAdopt(info) : null;
  if (!info.on || !cfg || cfg.id !== info.id) {
    box.innerHTML = info.on
      ? `<div class="set-row"><span class="set-row-text"><span class="set-row-title">Abo aktiv</span><span class="set-row-sub">Der Link wurde auf einem anderen Gerät erstellt und ist hier noch nicht verfügbar – einmal abgleichen.</span></span></div>`
      : `<button type="button" class="set-row set-action" id="cal-create"><span class="set-row-text set-row-title">Kalender-Abo einrichten</span></button>`;
    const c = box.querySelector('#cal-create');
    if (c) c.onclick = async () => { try { await calCreate(); toast('Kalender-Abo eingerichtet.', 'success'); syncRenderCal(el); } catch (e) { toast(e.message, 'error'); } };
    return;
  }
  const link = calLink(cfg);
  box.innerHTML = `
    <div class="set-row cal-link-row"><span class="set-row-text"><span class="set-row-title">Abo-Link</span><span class="set-row-sub cal-link" title="${escHtml(link)}">${escHtml(link.replace(/\/cal\/([^/]{6})[^/]*\/([^.]{4})[^.]*\.ics$/, '/cal/$1…/$2….ics'))}</span></span></div>
    <a class="set-row set-action" id="cal-sub" href="${escHtml(calLink(cfg, true))}"><span class="set-row-text set-row-title">Im Kalender abonnieren</span></a>
    <button type="button" class="set-row set-action" id="cal-copy"><span class="set-row-text set-row-title">Link kopieren</span></button>
    <div class="set-row"><span class="set-row-text"><span class="set-row-title">Stand</span><span class="set-row-sub">hochgeladen ${info.at ? escHtml(fmt(info.at)) : '—'} · eingerichtet ${escHtml(fmt(info.created))}</span></span></div>`;
  box.querySelector('#cal-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast('Link kopiert – nur in deinen eigenen Kalender einfügen.', 'success', 3000); }
    catch (_) { prompt('Abo-Link:', link); }
  };
  const tools = el.querySelector('#sy-cal-tools');
  if (tools) {
    tools.hidden = false;
    tools.querySelector('#cal-new').onclick = async () => {
      if (!confirm('Neuen Link erzeugen? Der bisherige Link funktioniert sofort nicht mehr – das Abo muss überall neu eingerichtet werden.')) return;
      try { await calCreate(); toast('Neuer Link erzeugt. Bitte im Kalender neu abonnieren.', 'success', 3500); syncRenderCal(el); } catch (e) { toast(e.message, 'error'); }
    };
    tools.querySelector('#cal-off').onclick = async () => {
      if (!confirm('Kalender-Abo beenden? Der Link funktioniert danach nicht mehr.')) return;
      try { await syncApi('/sync/cal/off'); lsSet(CAL_FEED_KEY, null); lsSet(CAL_HASH_KEY, null); syncNoteChange(); toast('Kalender-Abo beendet.', 'success'); tools.hidden = true; syncRenderCal(el); } catch (e) { toast(e.message, 'error'); }
    };
  }
}

// — Einrichten / Anmelden —
async function syncRegister({ url, username, password, setupKey }) {
  const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const iter = 600000;
  const { authKey, encKey } = await syncDerive(password, salt, iter);
  const r = await syncApi('/sync/register', { setupKey, username, authKey, salt, iter, device: syncDevice() }, { token: '', url });
  await syncKeyStore(encKey);
  lsSet(SYNC_URL_KEY, url); lsSet(SYNC_USER_KEY, username.trim().toLowerCase()); lsSet(SYNC_TOKEN_KEY, r.token);
  lsSet(SYNC_BASE_KEY, '0'); lsSet(SYNC_DIRTY_KEY, '1'); await syncSnapSave(-1, null);
  await syncNow({ quiet: true });
}
async function syncLogin({ url, username, password, totp }) {
  const pre = await syncApi('/sync/prelogin', { username }, { token: '', url });
  const { authKey, encKey } = await syncDerive(password, pre.salt, pre.iter);
  const r = await syncApi('/sync/login', { username, authKey, totp, device: syncDevice() }, { token: '', url });
  // Probe: lässt sich der vorhandene Stand entschlüsseln?
  const st = await syncApi('/sync/state', {}, { token: r.token, url });
  let remote = null;
  if (st.latest) remote = await syncDecrypt((await syncApi('/sync/pull', { version: st.latest }, { token: r.token, url })).data, encKey);
  await syncKeyStore(encKey);
  lsSet(SYNC_URL_KEY, url); lsSet(SYNC_USER_KEY, username.trim().toLowerCase()); lsSet(SYNC_TOKEN_KEY, r.token);
  if (!remote) { lsSet(SYNC_BASE_KEY, '0'); lsSet(SYNC_DIRTY_KEY, '1'); await syncNow({ quiet: true }); return; }
  if (!state.services.length) {
    syncApply(remote); await syncSetBase(st.latest, remote); return;
  }
  // Auf diesem Gerät gibt es schon Daten → mit dem Server-Stand zusammenführen
  lsSet(SYNC_BASE_KEY, '0'); lsSet(SYNC_DIRTY_KEY, '1'); await syncSnapSave(-1, null);
  await syncNow({ quiet: true });
}
async function syncLogout(server = true) {
  if (server) await syncApi('/sync/logout').catch(() => {});
  await syncKeyStore(null).catch(() => {});
  [SYNC_TOKEN_KEY, SYNC_BASE_KEY, SYNC_DIRTY_KEY, SYNC_LAST_KEY].forEach((k) => lsSet(k, null));
}
let qrLibPromise = null;
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLibPromise) qrLibPromise = new Promise((res, rej) => { const s = document.createElement('script'); s.src = './vendor/qrcode.js'; s.onload = () => res(window.qrcode); s.onerror = () => { qrLibPromise = null; rej(new Error('QR-Code konnte nicht geladen werden.')); }; document.head.appendChild(s); });
  return qrLibPromise;
}

// — Einstellungen → Konto & Sync —
let syncUi = { mode: 'login', totpPending: null, totpSetup: null, sessions: null, versions: null };
function settingsPageKonto(el, title) {
  const on = syncOn();
  const last = Number(lsGet(SYNC_LAST_KEY)) || 0;
  if (!on) {
    const url = lsGet(SYNC_URL_KEY) || lsGet(DP_WORKER_KEY) || '';
    const reg = syncUi.mode === 'register';
    el.innerHTML = `${title}
      <div class="set-group-header">${reg ? 'Konto anlegen' : 'Anmelden'}</div>
      <div class="set-group">
        <div class="set-form"><label for="sy-url">Server (Worker-Adresse)</label><input type="url" id="sy-url" value="${escHtml(url)}" placeholder="https://….workers.dev" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
        <div class="set-form"><label for="sy-user">Benutzername</label><input type="text" id="sy-user" value="${escHtml(lsGet(SYNC_USER_KEY))}" autocapitalize="off" autocomplete="username" spellcheck="false"></div>
        <div class="set-form"><label for="sy-pw">Passwort</label><input type="password" id="sy-pw" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>
        ${reg ? `<div class="set-form"><label for="sy-pw2">Passwort wiederholen</label><input type="password" id="sy-pw2" autocomplete="new-password"></div>
        <div class="set-form"><label for="sy-setup">Zugangsschlüssel des Workers (nur zum Anlegen)</label><input type="password" id="sy-setup" value="${escHtml(lsGet(DP_TOKEN_KEY))}" autocomplete="off"></div>`
        : `<div class="set-form" id="sy-totp-row" ${syncUi.totpPending ? '' : 'hidden'}><label for="sy-totp">Code (Authenticator)</label><input type="text" id="sy-totp" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code"></div>`}
        <button type="button" class="set-row set-action" id="sy-go"><span class="set-row-text set-row-title" style="font-weight:600">${reg ? 'Konto anlegen & sichern' : 'Anmelden'}</span></button>
      </div>
      <p class="set-group-footer${reg ? ' is-keep' : ''}">${reg
        ? 'Das Passwort verschlüsselt deine Daten auf dem Gerät – der Server kann sie nicht lesen. <b>Ohne Passwort sind die Server-Daten nicht wiederherstellbar.</b> Mind. 10 Zeichen.'
        : 'Synchronisiert das Tagebuch samt Stammdaten und Einstellungen Ende-zu-Ende verschlüsselt – auch für den Zugriff vom Computer.'}</p>
      <div class="set-group"><button type="button" class="set-row set-action" id="sy-mode"><span class="set-row-text set-row-title">${reg ? 'Ich habe schon ein Konto – anmelden' : 'Neues Konto anlegen'}</span></button></div>`;
    el.querySelector('#sy-mode').onclick = () => { syncUi.mode = reg ? 'login' : 'register'; syncUi.totpPending = null; renderSettingsPage(); };
    el.querySelector('#sy-go').onclick = async () => {
      const btn = el.querySelector('#sy-go');
      const RK = window.RKDienstplan;
      const raw = el.querySelector('#sy-url').value.trim();
      const u = raw ? (RK ? RK.normalizeWorkerUrl(raw) : raw.replace(/\/+$/, '')) : '';
      const user = el.querySelector('#sy-user').value.trim(), pw = el.querySelector('#sy-pw').value;
      if (!u) { toast('Bitte die Worker-Adresse eingeben.', 'error'); return; }
      if (!user || !pw) { toast('Bitte Benutzername und Passwort eingeben.', 'error'); return; }
      btn.disabled = true; btn.querySelector('.set-row-title').textContent = 'Bitte warten …';
      try {
        if (reg) {
          if (pw.length < 10) throw new Error('Das Passwort braucht mindestens 10 Zeichen.');
          if (pw !== el.querySelector('#sy-pw2').value) throw new Error('Die Passwörter stimmen nicht überein.');
          await syncRegister({ url: u, username: user, password: pw, setupKey: el.querySelector('#sy-setup').value.trim() });
          toast('Konto angelegt und gesichert. Jetzt noch die Zwei-Faktor-Anmeldung einrichten.', 'success', 4500);
        } else {
          await syncLogin({ url: u, username: user, password: pw, totp: (el.querySelector('#sy-totp') || {}).value });
          toast('Angemeldet.', 'success', 1800);
          syncAskDpToken(u);
        }
        syncUi = { mode: 'login', totpPending: null, totpSetup: null, sessions: null, versions: null };
      } catch (err) {
        btn.disabled = false;
        btn.querySelector('.set-row-title').textContent = reg ? 'Konto anlegen & sichern' : 'Anmelden';
        if (err.code === 'totp_required' || err.code === 'invalid_totp') {
          // Formular nicht neu aufbauen (Eingaben bleiben), nur das Code-Feld zeigen
          syncUi.totpPending = true;
          const row = el.querySelector('#sy-totp-row');
          if (row) { row.hidden = false; const t = row.querySelector('input'); t.value = ''; setTimeout(() => t.focus(), 50); }
        }
        toast(err.message, err.code === 'totp_required' ? 'info' : 'error', 4500);
        return;
      }
      renderSettings();
    };
    return;
  }
  const dirty = lsGet(SYNC_DIRTY_KEY) === '1';
  el.innerHTML = `${title}
    <div class="set-cols">
      <div class="set-col">
        <div class="set-group-header">Konto</div>
        <div class="set-group">
          <div class="set-row"><span class="set-row-text"><span class="set-row-title">${escHtml(lsGet(SYNC_USER_KEY))}</span><span class="set-row-sub">${escHtml(lsGet(SYNC_URL_KEY).replace(/^https:\/\//, ''))}</span></span></div>
          <div class="set-row"><span class="set-row-text"><span class="set-row-title">${dirty ? 'Ungesicherte Änderungen' : 'Synchronisiert'}</span><span class="set-row-sub">${last ? `Zuletzt ${homeDayLabel(new Date(last), new Date())}, ${formatTimeHM(new Date(last))}` : 'Noch nicht abgeglichen'} · Version ${escHtml(lsGet(SYNC_BASE_KEY) || '0')}</span></span></div>
          <button type="button" class="set-row set-action" id="sy-now"><span class="set-row-text set-row-title" style="font-weight:600">Jetzt synchronisieren</span></button>
          <div class="set-form"><label for="sy-device">Name dieses Geräts</label><input type="text" id="sy-device" value="${escHtml(syncDevice())}" maxlength="40" enterkeyhint="done"></div>
        </div>

        <div class="set-group-header">Sicherheit</div>
        <div class="set-group" id="sy-totp-box"><div class="set-row"><span class="set-row-text set-row-sub">Wird geladen …</span></div></div>
        <div class="set-group-header">Angemeldete Geräte</div>
        <div class="set-group" id="sy-sessions"><div class="set-row"><span class="set-row-text set-row-sub">Wird geladen …</span></div></div>
        <div class="set-group set-group-gap">
          <button type="button" class="set-row" id="sy-log"><span class="set-row-text"><span class="set-row-title">Zugriffsprotokoll</span><span class="set-row-sub">Wer den Worker abruft – Sync, Kalender, Dienstplan</span></span><span class="set-row-chev">${SET_ICONS.chev}</span></button>
        </div>
      </div>
      <div class="set-col">
        <div class="set-group-header">Kalender-Abo</div>
        <div class="set-group" id="sy-cal"><div class="set-row"><span class="set-row-text set-row-sub">Wird geladen …</span></div></div>
        <div class="set-group set-group-gap" id="sy-cal-tools" hidden>
          <button type="button" class="set-row set-action" id="cal-new"><span class="set-row-text set-row-title">Neuen Link erzeugen</span></button>
          <button type="button" class="set-row set-destructive" id="cal-off"><span class="set-row-text set-row-title">Abo beenden</span></button>
        </div>
        <p class="set-group-footer is-keep">Alle Dienste aus dem Tagebuch mit Fahrzeug, Dienststelle, Zeiten, Besatzung und Einsatz-Stichwörtern, dazu geplante Dienste aus dem Dienstplan. Keine PZC, NACA, Notizen, Adressen oder Patientendaten. Derselbe Link gilt auf allen angemeldeten Geräten; wer ihn hat, kann den Kalender lesen.</p>

        <div class="set-group-header">Datensicherung</div>
        <div class="set-group" id="sy-versions"><button type="button" class="set-row set-action" id="sy-load-versions"><span class="set-row-text set-row-title">Frühere Stände anzeigen</span></button></div>
        <p class="set-group-footer is-keep" id="sy-storage"></p>

        <div class="set-group set-group-gap">
          <button type="button" class="set-row set-destructive" id="sy-logout"><span class="set-row-text set-row-title">Auf diesem Gerät abmelden</span></button>
        </div>
        <p class="set-group-footer">Ende-zu-Ende verschlüsselt (AES-256). Nicht synchronisiert wird der Dienstplan-Zugangsschlüssel – der bleibt nur auf dem jeweiligen Gerät.</p>
      </div>
    </div>`;
  el.querySelector('#sy-now').onclick = () => syncNow();
  // Gerätename: bei jeder Eingabe lokal sichern (geht so auch beim direkten Zurück nicht verloren),
  // beim Verlassen des Felds an den Server melden → erscheint dort unter „Angemeldete Geräte“
  const devInp = el.querySelector('#sy-device');
  devInp.oninput = () => lsSet(SYNC_DEVICE_KEY, devInp.value.trim() || null);
  devInp.onchange = () => { devInp.oninput(); syncSendDevice(el); };
  devInp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); devInp.blur(); } };
  el.querySelector('#sy-logout').onclick = async () => {
    if (lsGet(SYNC_DIRTY_KEY) === '1' && !confirm('Es gibt noch ungesicherte Änderungen. Trotzdem abmelden?')) return;
    await syncLogout(); toast('Abgemeldet. Die Daten bleiben auf diesem Gerät.', 'success'); renderSettingsPage(); renderSettings();
  };
  el.querySelector('#sy-load-versions').onclick = () => syncShowVersions(el);
  el.querySelector('#sy-log').onclick = () => openAccessLog();
  syncRenderTotp(el);
  syncRenderSessions(el);
  syncRenderCal(el);
}
/** Gerätenamen an den Server melden (benennt die Sitzung um). */
async function syncSendDevice(el) {
  if (!lsGet(SYNC_TOKEN_KEY)) return;
  try {
    const r = await syncApi('/sync/device', { device: syncDevice() });
    lsSet(SYNC_DEVICE_KEY + '_sent', r.device || syncDevice());
    toast(`Gerätename „${r.device || syncDevice()}“ gespeichert.`, 'success');
    if (el) syncRenderSessions(el);
  } catch (e) {
    toast(e.status === 404 ? 'Name auf diesem Gerät gespeichert – für die Geräteliste bitte den Worker aktualisieren.' : 'Name gespeichert, Server nicht erreichbar – wird beim nächsten Abgleich gemeldet.', 'info', 4500);
  }
}
async function syncRenderTotp(el) {
  const box = el.querySelector('#sy-totp-box');
  if (!box) return;
  let st;
  try { st = await syncApi('/sync/state', { device: syncDevice() }); } catch (e) { box.innerHTML = `<div class="set-row"><span class="set-row-text set-row-sub">${escHtml(e.message)}</span></div>`; return; }
  const stor = el.querySelector('#sy-storage');
  if (stor) stor.innerHTML = st.atomic
    ? '✓ Speicher: D1-Datenbank – gleichzeitiges Hochladen ist ausgeschlossen.'
    : '⚠︎ Speicher: KV (Rückfall). Für vollständigen Schutz vor gleichzeitigem Hochladen im Worker die D1-Datenbank <b>SYNC_DB</b> verbinden.';
  if (st.totp) {
    box.innerHTML = `<div class="set-row"><span class="set-row-text"><span class="set-row-title">✓ Aktiv (Authenticator-App)</span><span class="set-row-sub">Beim Anmelden auf einem neuen Gerät wird zusätzlich der 6-stellige Code abgefragt.</span></span></div>
      <button type="button" class="set-row set-destructive" id="sy-totp-off"><span class="set-row-text set-row-title">Ausschalten</span></button>`;
    box.querySelector('#sy-totp-off').onclick = async () => {
      const code = prompt('Zum Ausschalten den aktuellen Code eingeben:');
      if (!code) return;
      try { await syncApi('/sync/totp/disable', { code }); toast('Zwei-Faktor-Anmeldung ausgeschaltet.', 'success'); syncRenderTotp(el); } catch (e) { toast(e.message, 'error'); }
    };
    return;
  }
  if (!syncUi.totpSetup) {
    box.innerHTML = `<button type="button" class="set-row set-action" id="sy-totp-setup"><span class="set-row-text"><span class="set-row-title" style="font-weight:600">Einrichten (empfohlen)</span><span class="set-row-sub">Mit Authenticator-App oder den iOS-Passwörtern – schützt auch, falls das Passwort bekannt wird.</span></span></button>`;
    box.querySelector('#sy-totp-setup').onclick = async () => {
      try { syncUi.totpSetup = await syncApi('/sync/totp/setup'); syncRenderTotp(el); } catch (e) { toast(e.message, 'error'); }
    };
    return;
  }
  const { secret, uri } = syncUi.totpSetup;
  box.innerHTML = `<div class="sy-totp">
      <div class="sy-qr" id="sy-qr"></div>
      <div class="sy-secret">${secret.match(/.{1,4}/g).join(' ')}</div>
      <a class="btn-secondary sy-otp-link" href="${escHtml(uri)}">In Authenticator / Passwörter öffnen</a>
      <p class="sy-hint">QR-Code vom Computer scannen, Link am iPhone antippen oder den Schlüssel abtippen. Danach den angezeigten Code eingeben:</p>
      <div class="sy-code-row"><input type="text" id="sy-totp-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="123456"><button type="button" class="btn-primary" id="sy-totp-ok">Bestätigen</button></div>
    </div>`;
  loadQrLib().then((qr) => { const q = qr(0, 'M'); q.addData(uri); q.make(); const box2 = el.querySelector('#sy-qr'); if (box2) box2.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }).catch(() => {});
  box.querySelector('#sy-totp-ok').onclick = async () => {
    try { await syncApi('/sync/totp/enable', { code: box.querySelector('#sy-totp-code').value.trim() }); syncUi.totpSetup = null; toast('Zwei-Faktor-Anmeldung aktiv.', 'success'); syncRenderTotp(el); }
    catch (e) { toast(e.message, 'error'); }
  };
}
async function syncRenderSessions(el) {
  const box = el.querySelector('#sy-sessions');
  if (!box) return;
  try {
    const { sessions } = await syncApi('/sync/sessions', { device: syncDevice() });
    box.innerHTML = sessions.map((s) => `<div class="set-row"><span class="set-row-text"><span class="set-row-title">${escHtml(s.device)}${s.current ? ' · dieses Gerät' : ''}</span><span class="set-row-sub">angemeldet ${escHtml(new Date(s.created).toLocaleDateString('de-AT'))}</span></span>${s.current ? '' : `<button type="button" class="btn-ghost" data-revoke="${escHtml(s.id)}" style="color:var(--danger)">Abmelden</button>`}</div>`).join('');
    box.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Dieses Gerät abmelden?')) return;
      await syncApi('/sync/revoke', { id: b.dataset.revoke }).catch((e) => toast(e.message, 'error'));
      syncRenderSessions(el);
    }));
  } catch (e) { box.innerHTML = `<div class="set-row"><span class="set-row-text set-row-sub">${escHtml(e.message)}</span></div>`; }
}
async function syncShowVersions(el) {
  const box = el.querySelector('#sy-versions');
  const fmt = (at) => new Date(at).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  try {
    const { versions, latest, aside } = await syncApi('/sync/versions');
    box.innerHTML = (versions.map((v) => `<div class="set-row"><span class="set-row-text"><span class="set-row-title">${escHtml(fmt(v.at))}${v.v === latest ? ' · aktuell' : ''}</span><span class="set-row-sub">Version ${v.v} · ${escHtml(v.device || '')} · ${Math.round(v.size / 1024)} KB</span></span>${v.v === latest ? '' : `<button type="button" class="btn-ghost" data-restore="${v.v}">Wiederherstellen</button>`}</div>`).join('')
      + (aside || []).map((a) => `<div class="set-row"><span class="set-row-text"><span class="set-row-title">${escHtml(fmt(a.at))} · vor Zusammenführung</span><span class="set-row-sub">Stand von ${escHtml(a.device || 'Gerät')} · ${Math.round(a.size / 1024)} KB</span></span><button type="button" class="btn-ghost" data-restore-aside="${a.id}">Wiederherstellen</button></div>`).join(''))
      || '<div class="set-row"><span class="set-row-text set-row-sub">Noch keine Version.</span></div>';
    const restore = async (body) => {
      if (!confirm('Diesen früheren Stand wiederherstellen? Der aktuelle Stand bleibt als Version erhalten.')) return;
      try {
        const p = await syncApi('/sync/pull', body);
        syncApply(await syncDecrypt(p.data));
        lsSet(SYNC_DIRTY_KEY, '1');
        // Basis = aktueller Server-Stand, damit der wiederhergestellte Stand als neue Version gilt
        const st = await syncApi('/sync/state');
        lsSet(SYNC_BASE_KEY, String(st.latest)); await syncSnapSave(-1, null);
        await syncNow({ quiet: true });
        toast('Früherer Stand wiederhergestellt.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
    box.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', () => restore({ version: +b.dataset.restore })));
    box.querySelectorAll('[data-restore-aside]').forEach((b) => b.addEventListener('click', () => restore({ aside: +b.dataset.restoreAside })));
  } catch (e) { toast(e.message, 'error'); }
}
/** Nach dem Anmelden: Dienstplan-Zugangsschlüssel separat abfragen (wird nicht synchronisiert). */
function syncAskDpToken(url) {
  if (lsGet(DP_TOKEN_KEY)) return;
  setTimeout(() => {
    const t = prompt('Dienstplan-Zugangsschlüssel für dieses Gerät (wird nicht synchronisiert, bleibt nur hier gespeichert). Leer lassen, falls nicht gebraucht:');
    if (!t || !t.trim()) return;
    if (!lsGet(DP_WORKER_KEY)) lsSet(DP_WORKER_KEY, url);
    lsSet(DP_TOKEN_KEY, t.trim());
    invalidateIcsCache();
    toast('Dienstplan-Schlüssel gespeichert.', 'success');
    renderSettings();
  }, 400);
}

// Beim Start abgleichen (neuer Stand von einem anderen Gerät?)
setTimeout(() => { if (syncOn()) syncNow({ quiet: true }).catch(() => {}); }, 2000);
