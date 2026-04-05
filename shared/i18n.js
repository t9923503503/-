/**
 * shared/i18n.js — Lightweight i18n module
 *
 * Usage:
 *   import { t, setLocale, getLocale } from './i18n.js';
 *   t('toast.saved')          // → "Сохранено" (ru) / "Saved" (en)
 *   t('court.title', { n: 1 }) // → "КОРТ 1" (ru) / "COURT 1" (en)
 *
 * Falls back: key lookup → fallback locale (ru) → raw key.
 * Locale files loaded lazily on first use or setLocale() call.
 */

const SUPPORTED = ['ru', 'en'];
const FALLBACK  = 'ru';

let _locale  = null;   // resolved locale code
let _strings = {};     // { ru: {...}, en: {...} }
let _ready   = false;

// ── Detect locale ────────────────────────────────────────────
function detectLocale() {
  // 1. Explicit override in localStorage
  const stored = typeof localStorage !== 'undefined'
    ? localStorage.getItem('kotc3_locale') : null;
  if (stored && SUPPORTED.includes(stored)) return stored;

  // 2. Browser language
  if (typeof navigator !== 'undefined') {
    const lang = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(lang)) return lang;
  }

  return FALLBACK;
}

// ── Load locale JSON ─────────────────────────────────────────
async function loadLocale(code) {
  if (_strings[code]) return _strings[code];
  try {
    // Always load from site root (/locales/…). Subpaths like formats/kotc/kotc.html
    // must not resolve locales relative to the page URL (would 404 under formats/kotc/locales/).
    const url =
      typeof window !== 'undefined' && window.location?.origin
        ? new URL(`/locales/${code}.json`, window.location.origin).href
        : `/locales/${code}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _strings[code] = await res.json();
  } catch (e) {
    console.warn(`[i18n] Failed to load locale "${code}":`, e.message);
    _strings[code] = {};
  }
  return _strings[code];
}

// ── Init (call once at app start) ────────────────────────────
async function initI18n() {
  _locale = detectLocale();
  await Promise.all([
    loadLocale(_locale),
    _locale !== FALLBACK ? loadLocale(FALLBACK) : Promise.resolve(),
  ]);
  _ready = true;
}

// ── Translate ────────────────────────────────────────────────
function t(key, params) {
  // Dot-path lookup: "nav.court" → strings.nav.court
  const resolve = (obj) => {
    if (!obj) return undefined;
    const parts = key.split('.');
    let val = obj;
    for (const p of parts) {
      val = val?.[p];
      if (val === undefined) return undefined;
    }
    return val;
  };

  let str = resolve(_strings[_locale]) ?? resolve(_strings[FALLBACK]) ?? key;

  // Simple interpolation: {{n}}, {{name}}
  if (params && typeof str === 'string') {
    str = str.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{{${k}}}`
    );
  }

  return str;
}

// ── Getters / Setters ────────────────────────────────────────
function getLocale() { return _locale || detectLocale(); }

async function setLocale(code) {
  if (!SUPPORTED.includes(code)) return;
  _locale = code;
  localStorage.setItem('kotc3_locale', code);
  await loadLocale(code);
}

function isReady() { return _ready; }
function getSupportedLocales() { return [...SUPPORTED]; }

// ── GlobalThis bridge for classic scripts ────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.i18n = { t, getLocale, setLocale, initI18n, isReady, getSupportedLocales };
}

export { t, getLocale, setLocale, initI18n, isReady, getSupportedLocales };
