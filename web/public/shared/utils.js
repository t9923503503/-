'use strict';

/**
 * shared/utils.js — HTML-escaping, formatting, toast helpers.
 * Works as ES module (import) AND bridges to globalThis for classic scripts.
 * ARCH A0.1
 */

/** HTML-escape a string for safe insertion into text content. */
export function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[m]);
}

/** HTML-escape for attribute values. */
export function escAttr(s) {
  return esc(String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

/** Make a value safe for CSV embedding (wrap in quotes, escape internal quotes). */
export function csvSafe(s) {
  if (s == null) return '""';
  const str = String(s).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Show a brief toast notification.
 * Bridges to globalThis.showToast when available; otherwise renders own minimal toast.
 * @param {string} msg
 * @param {'info'|'success'|'error'|'warn'} [type='info']
 * @param {number} [duration=2800]
 */
export function showToast(msg, type = 'info', duration = 2800) {
  if (typeof globalThis.showToast === 'function') {
    return globalThis.showToast(msg, type, duration);
  }
  // Minimal own impl for standalone pages (thai.html etc.)
  try {
    let el = document.getElementById('shared-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'shared-toast';
      el.style.cssText = [
        'position:fixed', 'bottom:calc(env(safe-area-inset-bottom,0px) + 80px)',
        'left:50%', 'transform:translateX(-50%)', 'z-index:9999',
        'background:#1e1e32', 'color:#e8e8f0', 'padding:12px 20px',
        'border-radius:12px', 'font:600 14px/1.4 Barlow,sans-serif',
        'box-shadow:0 8px 32px rgba(0,0,0,.35)', 'border:1px solid rgba(255,255,255,.12)',
        'max-width:88vw', 'text-align:center', 'pointer-events:none',
        'transition:opacity .25s',
      ].join(';');
      document.body.appendChild(el);
    }
    const colors = { success: '#6ABF69', error: '#e94560', warn: '#FFA500', info: '#e8e8f0' };
    el.style.color = colors[type] || colors.info;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._tid);
    el._tid = setTimeout(() => { el.style.opacity = '0'; }, duration);
  } catch (_) {}
}

/** Format an ISO date string (YYYY-MM-DD) to a human-readable Russian date. */
export function formatRuDate(iso) {
  if (!iso) return '';
  const DAYS   = ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];
  const MONTHS = ['января','февраля','марта','апреля','мая','июня',
                  'июля','августа','сентября','октября','ноября','декабря'];
  const d = new Date(iso + 'T12:00:00');
  const dn = DAYS[d.getDay()];
  return dn.charAt(0) + dn.slice(1).toLowerCase()
       + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

/** Clamp a number between min and max. */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

const _api = { esc, escAttr, csvSafe, showToast, formatRuDate, clamp };

// Bridge to globalThis so classic scripts can use these helpers.
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedUtils = _api;
    // Fill in globals only if not already defined (avoid stomping domain/players.js etc.)
    if (typeof globalThis.esc    !== 'function') globalThis.esc    = esc;
    if (typeof globalThis.escAttr !== 'function') globalThis.escAttr = escAttr;
    if (typeof globalThis.csvSafe !== 'function') globalThis.csvSafe = csvSafe;
  }
} catch (_) {}

export default _api;
