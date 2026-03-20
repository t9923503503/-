'use strict';

/**
 * shared/api.js — Server REST API client for tournament state sync.
 * Reads server base URL from config.js (window.APP_CONFIG.apiBase).
 * Falls back gracefully to localStorage-only mode when server is unavailable.
 *
 * ARCH A0.1 / A1.3
 */

function _getBase() {
  try {
    return (
      (typeof globalThis.APP_CONFIG !== 'undefined' && globalThis.APP_CONFIG?.apiBase)
      || (typeof globalThis.sbConfig !== 'undefined' && globalThis.sbConfig?.apiBase)
      || ''
    );
  } catch (_) { return ''; }
}

function _getAuthHeader() {
  try {
    const secret = typeof globalThis.sharedAuth !== 'undefined'
      ? globalThis.sharedAuth.getOrgSecret?.()
      : localStorage.getItem('kotc3_org_secret');
    return secret ? { 'X-Org-Secret': secret } : {};
  } catch (_) { return {}; }
}

/**
 * Perform a GET request to the app API.
 * @param {string} path  e.g. '/api/tournaments'
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<any>}
 */
export async function apiGet(path, { timeout = 8000 } = {}) {
  const base = _getBase();
  if (!base) throw new Error('api: no server configured');
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(base + path, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ..._getAuthHeader() },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`api GET ${path}: ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Perform a POST request to the app API.
 * @param {string} path
 * @param {any}    data
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<any>}
 */
export async function apiPost(path, data, { timeout = 8000 } = {}) {
  const base = _getBase();
  if (!base) throw new Error('api: no server configured');
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ..._getAuthHeader() },
      body: JSON.stringify(data),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`api POST ${path}: ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Save a Thai (or any) tournament to the server.
 * Returns true on success, false on network failure (caller can retry or work offline).
 * @param {object} tournament  — full tournament object
 * @returns {Promise<boolean>}
 */
export async function saveTournamentToServer(tournament) {
  try {
    await apiPost('/api/tournaments/' + encodeURIComponent(tournament.id), tournament);
    return true;
  } catch (err) {
    console.warn('[api] saveTournamentToServer failed (offline?):', err.message);
    return false;
  }
}

/**
 * Load a tournament from the server by ID.
 * Returns null on failure.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function loadTournamentFromServer(id) {
  try {
    return await apiGet('/api/tournaments/' + encodeURIComponent(id));
  } catch (err) {
    console.warn('[api] loadTournamentFromServer failed (offline?):', err.message);
    return null;
  }
}

/**
 * Push updated player ratings to the server after tournament completion.
 * @param {Array<{ id:string, ratingM?:number, ratingW?:number, ratingMix?:number, tournaments?:number }>} updates
 * @returns {Promise<boolean>}
 */
export async function updatePlayerRatings(updates) {
  try {
    await apiPost('/api/players/ratings', { players: updates });
    return true;
  } catch (err) {
    console.warn('[api] updatePlayerRatings failed (offline?):', err.message);
    return false;
  }
}

/**
 * Sync the current tournament state (localStorage) to server, silently.
 * Intended to be called after every score update in Thai format.
 * @param {object} tournament
 */
export function syncTournamentAsync(tournament) {
  saveTournamentToServer(tournament).catch(() => {});
}

const _api = { apiGet, apiPost, saveTournamentToServer, loadTournamentFromServer,
               updatePlayerRatings, syncTournamentAsync };

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedApi = _api;
  }
} catch (_) {}

export default _api;
