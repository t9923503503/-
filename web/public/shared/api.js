'use strict';

/**
 * shared/api.js — Server REST API client for tournament state sync.
 * Reads server base URL from config.js (window.APP_CONFIG.apiBase).
 * Falls back gracefully to localStorage-only mode when server is unavailable.
 *
 * ARCH A0.1 / A1.3 / A1.4
 */

// ── OFFLINE BANNER (A1.4) ──────────────────────────────────
(function _initOfflineBanner() {
  function _showBanner() {
    let el = document.getElementById('offline-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'offline-banner';
      el.textContent = '📴 Нет соединения — работает офлайн';
      document.body.prepend(el);
    }
    el.classList.add('is-visible');
  }
  function _hideBanner() {
    const el = document.getElementById('offline-banner');
    if (el) el.classList.remove('is-visible');
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online',  _hideBanner);
    window.addEventListener('offline', _showBanner);
    if (!navigator.onLine) _showBanner();
  }
})();

// ── SAFE localStorage.setItem (A1.4) ──────────────────────
function _safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      if (typeof globalThis.showToast === 'function') {
        globalThis.showToast('⚠️ Память устройства переполнена. Удалите старые данные.', 'warn', 5000);
      }
      console.warn('[api] localStorage quota exceeded for key:', key);
    }
    return false;
  }
}

// ── EXPONENTIAL RETRY (A1.4) ───────────────────────────────
async function _withRetry(fn, retries = 3, baseDelayMs = 400) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Не ретраить если абортировали или нет сети
      if (err.name === 'AbortError') throw err;
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

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
      : (sessionStorage.getItem('kotc3_org_secret') || localStorage.getItem('kotc3_org_secret'));
    return secret ? { 'X-Org-Secret': secret } : {};
  } catch (_) { return {}; }
}

/**
 * Perform a GET request to the app API.
 * @param {string} path  e.g. '/api/tournaments'
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<any>}
 */
export async function apiGet(path, { timeout = 8000, retries = 3 } = {}) {
  const base = _getBase();
  if (!base) throw new Error('api: no server configured');
  return _withRetry(() => {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeout);
    return fetch(base + path, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ..._getAuthHeader() },
      signal: ctrl.signal,
    }).then(res => {
      clearTimeout(tid);
      if (!res.ok) throw new Error(`api GET ${path}: ${res.status} ${res.statusText}`);
      return res.json();
    }).catch(err => { clearTimeout(tid); throw err; });
  }, retries);
}

/**
 * Perform a POST request to the app API.
 * @param {string} path
 * @param {any}    data
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<any>}
 */
export async function apiPost(path, data, { timeout = 8000, retries = 3 } = {}) {
  const base = _getBase();
  if (!base) throw new Error('api: no server configured');
  return _withRetry(() => {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeout);
    return fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ..._getAuthHeader() },
      body: JSON.stringify(data),
      signal: ctrl.signal,
    }).then(res => {
      clearTimeout(tid);
      if (!res.ok) throw new Error(`api POST ${path}: ${res.status} ${res.statusText}`);
      return res.json();
    }).catch(err => { clearTimeout(tid); throw err; });
  }, retries);
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

// ── S8.3: Finalize tournament via app RPC ──────────────────
/**
 * Call finalize_tournament RPC.
 * @param {string} tournamentId
 * @param {Array<{player_id:string, placement:number, points:number, format?:string, division?:string}>} results
 * @returns {Promise<{ok:boolean, results_count?:number, error?:string}>}
 */
export async function finalizeTournament(tournamentId, results) {
  try {
    const res = await apiPost('/rpc/finalize_tournament', {
      p_tournament_id: tournamentId,
      p_results: results,
    });
    return res || { ok: false, error: 'EMPTY_RESPONSE' };
  } catch (err) {
    console.warn('[api] finalizeTournament failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// ── S8.4: Sync player DB with server ────────────────────────
/**
 * Pull players from server, merge with local DB, push local-only players.
 * Server is authoritative on conflicts (same player ID → server wins).
 * @returns {Promise<{synced:boolean, count:number}>}
 */
export async function syncPlayersWithServer() {
  try {
    const remote = await apiGet('/rpc/get_rating_leaderboard');
    if (!Array.isArray(remote)) return { synced: false, count: 0 };

    const local = globalThis.sharedPlayers?.loadPlayerDB?.() || [];
    const remoteMap = new Map(remote.map(p => [String(p.player_id || p.id), p]));
    const localMap = new Map(local.map(p => [String(p.id), p]));

    const merged = [];
    const localOnlyPlayers = [];

    // Server players: authoritative
    for (const [rid, rp] of remoteMap) {
      const lp = localMap.get(rid);
      merged.push({
        ...(lp || {}),
        id: rid,
        name: rp.name || lp?.name || '',
        gender: rp.gender || lp?.gender || 'M',
        status: 'active',
        totalPts: rp.total_pts ?? lp?.totalPts ?? 0,
        tournaments: rp.tournaments ?? lp?.tournaments ?? 0,
      });
      localMap.delete(rid);
    }

    // Local-only players: keep + mark for push
    for (const [lid, lp] of localMap) {
      merged.push(lp);
      localOnlyPlayers.push(lp);
    }

    // Save merged locally
    if (globalThis.sharedPlayers?.savePlayerDB) {
      globalThis.sharedPlayers.savePlayerDB(merged);
    }

    // Push local-only to server (best effort)
    if (localOnlyPlayers.length > 0) {
      try {
        await apiPost('/api/players/bulk', localOnlyPlayers.map(p => ({
          id: p.id,
          name: p.name,
          gender: p.gender,
          status: p.status || 'active',
        })));
      } catch (_) {
        // Push failed — will retry on next sync
      }
    }

    return { synced: true, count: merged.length };
  } catch (err) {
    console.warn('[api] syncPlayersWithServer failed (offline?):', err.message);
    return { synced: false, count: 0 };
  }
}

// ── S8.9: Get rating history for a player ───────────────────
/**
 * @param {string} playerId
 * @returns {Promise<Array<{tournament_id:string, delta:number, new_total:number, recorded_at:string}>>}
 */
export async function getPlayerRatingHistory(playerId) {
  try {
    const res = await apiPost('/rpc/get_rating_history', { p_player_id: playerId });
    return Array.isArray(res) ? res : [];
  } catch (err) {
    console.warn('[api] getPlayerRatingHistory failed:', err.message);
    return [];
  }
}

export { _safeSetItem as safeSetItem };

const _api = { apiGet, apiPost, saveTournamentToServer, loadTournamentFromServer,
               updatePlayerRatings, syncTournamentAsync, safeSetItem: _safeSetItem,
               finalizeTournament, syncPlayersWithServer, getPlayerRatingHistory };

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedApi = _api;
  }
} catch (_) {}

export default _api;
