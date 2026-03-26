'use strict';

/**
 * shared/players.js — Player DB access helpers.
 * Bridges to globalThis.loadPlayerDB/savePlayerDB when running in main-app context;
 * falls back to own localStorage implementation for standalone pages (thai.html etc.).
 *
 * Contract (PLATFORM_ROADMAP.md):
 *   loadPlayerDB()                         → Player[]
 *   savePlayerDB(players)
 *   searchPlayers(query, { gender, limit }) → Player[]
 *   getPlayerById(id)                      → Player | null
 *
 * ARCH A0.1
 */

const _STORAGE_KEY    = 'kotc3_playerdb';
const _STORAGE_TS_KEY = 'kotc3_playerdb_ts';

function _ownLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}

function _ownSave(players) {
  try {
    localStorage.setItem(_STORAGE_KEY, JSON.stringify(players || []));
    localStorage.setItem(_STORAGE_TS_KEY, String(Date.now()));
  } catch (_) {}
}

/** Load the full player database. */
export function loadPlayerDB() {
  if (typeof globalThis.loadPlayerDB === 'function') return globalThis.loadPlayerDB();
  return _ownLoad();
}

/** Persist the player database. */
export function savePlayerDB(players) {
  if (typeof globalThis.savePlayerDB === 'function') return globalThis.savePlayerDB(players);
  _ownSave(players);
}

/**
 * Search players by name substring and optionally by gender.
 * @param {string} query
 * @param {{ gender?: 'M'|'W', limit?: number }} [opts]
 * @returns {Player[]}
 */
export function searchPlayers(query, { gender, limit = 100 } = {}) {
  const db = loadPlayerDB();
  const q  = (query || '').toLowerCase().trim();
  return db
    .filter(p => !gender || p.gender === gender)
    .filter(p => !q || (p.name || '').toLowerCase().includes(q))
    .slice(0, limit);
}

/**
 * Find a single player by ID.
 * @param {string|number} id
 * @returns {Player|null}
 */
export function getPlayerById(id) {
  if (id == null) return null;
  return loadPlayerDB().find(p => String(p.id) === String(id)) ?? null;
}

/**
 * Upsert a player by name+gender (merge if exists, create if not).
 * Returns the saved player record.
 */
export function upsertPlayer({ id, name, gender, ...rest } = {}) {
  if (typeof globalThis.upsertPlayerInDB === 'function') {
    return globalThis.upsertPlayerInDB({ id, name, gender, ...rest });
  }
  const db = loadPlayerDB();
  const normName = (name || '').trim();
  if (!normName) return null;
  let p = id != null ? db.find(x => String(x.id) === String(id)) : null;
  if (!p) p = db.find(x => x.name.toLowerCase() === normName.toLowerCase() && x.gender === gender);
  if (p) {
    Object.assign(p, rest);
    if (name) p.name = normName;
    if (gender) p.gender = gender;
  } else {
    p = { id: id ?? ('p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6)),
          name: normName, gender: gender || 'M', status: 'active',
          addedAt: new Date().toISOString().split('T')[0],
          tournaments: 0, totalPts: 0, wins: 0,
          ratingM: 0, ratingW: 0, ratingMix: 0,
          tournamentsM: 0, tournamentsW: 0, tournamentsMix: 0,
          lastSeen: '', ...rest };
    db.push(p);
  }
  savePlayerDB(db);
  return p;
}

const _api = { loadPlayerDB, savePlayerDB, searchPlayers, getPlayerById, upsertPlayer };

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedPlayers = _api;
    if (typeof globalThis.searchPlayers  === 'undefined') globalThis.searchPlayers  = searchPlayers;
    if (typeof globalThis.getPlayerById  === 'undefined') globalThis.getPlayerById  = getPlayerById;
  }
} catch (_) {}

export default _api;
