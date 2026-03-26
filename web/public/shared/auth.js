'use strict';

/**
 * shared/auth.js — Organizer authentication helpers.
 * Bridges to main-app roster-auth when available; own minimal impl for standalone pages.
 *
 * ARCH A0.1
 */

const _SECRET_KEY = 'kotc3_org_secret';
const _HASH_KEY   = 'kotc3_roster_pwd_hash';
const _SALT_KEY   = 'kotc3_roster_pwd_salt';

/** Returns true if an organizer password is set in localStorage. */
export function hasOrgAuth() {
  try {
    return !!localStorage.getItem(_HASH_KEY) && !!localStorage.getItem(_SALT_KEY);
  } catch (_) { return false; }
}

/** Return the stored org secret token (for API auth header). */
export function getOrgSecret() {
  try {
    // S6.5: secrets in sessionStorage (cleared on tab close)
    return sessionStorage.getItem(_SECRET_KEY)
      || localStorage.getItem(_SECRET_KEY)  // migration fallback
      || '';
  }
  catch (_) { return ''; }
}

/** Persist an org secret token. */
export function setOrgSecret(secret) {
  try {
    // S6.5: secrets in sessionStorage (cleared on tab close)
    sessionStorage.setItem(_SECRET_KEY, secret);
    // Remove from localStorage if migrated
    localStorage.removeItem(_SECRET_KEY);
  }
  catch (_) {}
}

/**
 * Request organizer authentication.
 * Bridges to globalThis.rosterRequestUnlock when running in main-app context.
 * Own minimal prompt for standalone pages.
 *
 * @param {{ title?: string, subtitle?: string, successMessage?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export async function requestOrgAuth({ title = '🔒 Организатор', subtitle = 'Введите пароль', successMessage = '🔓 Доступ открыт' } = {}) {
  // Bridge to main-app auth
  if (typeof globalThis.rosterRequestUnlock === 'function') {
    return globalThis.rosterRequestUnlock({ title, subtitle, successMessage });
  }
  // Own minimal impl: prompt() for standalone pages
  if (!hasOrgAuth()) return true; // no password set — open access
  const pwd = window.prompt(`${title}\n${subtitle}`);
  if (!pwd) return false;
  return _verifyPassword(pwd);
}

async function _verifyPassword(password) {
  try {
    const salt = localStorage.getItem(_SALT_KEY) || '';
    const hash = localStorage.getItem(_HASH_KEY) || '';
    if (!salt || !hash) return true;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
    const computed = Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
    return computed === hash;
  } catch (_) {
    // If crypto unavailable, allow access (graceful degradation)
    return true;
  }
}

/**
 * Check if the current session is unlocked (main-app sessionStorage flag).
 * Returns true if no password is set.
 */
export function isOrgUnlocked() {
  if (!hasOrgAuth()) return true;
  try {
    // In main app, roster-auth sets this flag
    return sessionStorage.getItem('rosterUnlocked') === '1';
  } catch (_) { return false; }
}

const _api = { hasOrgAuth, getOrgSecret, setOrgSecret, requestOrgAuth, isOrgUnlocked };

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedAuth = _api;
  }
} catch (_) {}

export default _api;
