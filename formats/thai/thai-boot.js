// ── A1.1: Import shared modules ───────────────────────
import { esc, showToast, formatRuDate } from '../../shared/utils.js';
import { loadPlayerDB, savePlayerDB, searchPlayers, getPlayerById } from '../../shared/players.js';
import { createTimer, formatTime } from '../../shared/timer.js';
import { CrossTable, StandingsTable, injectTableCSS } from '../../shared/table.js';
import { injectUiKitCSS } from '../../shared/ui-kit.js';
import { syncTournamentAsync } from '../../shared/api.js';
import { isOrgUnlocked, requestOrgAuth } from '../../shared/auth.js';
import { exportToJSON, exportToCSV, standingsToCSVData } from '../../shared/export-utils.js';

// ── Thai format math ──────────────────────────────────
import {
  thaiGenerateSchedule,
  thaiValidateSchedule,
  thaiCalcStandings,
  thaiCalcPoints,
  thaiZeroSumTour,
  thaiSeedR2,
  thaiCalcNominations,
} from './thai-format.js';

// F0.3: Thai roster panel UI
import { initThaiRosterPanel } from './thai-roster.js';

// Inject shared CSS helpers
injectTableCSS();
injectUiKitCSS();

// ── Restore theme ─────────────────────────────────────
(function restoreTheme() {
  const solar = localStorage.getItem('kotc3_solar') === '1';
  document.body.classList.toggle('solar', solar);
})();

// ════════════════════════════════════════════════════════
// A1.1: Parse URL params → session config
// ════════════════════════════════════════════════════════
// Courts / tours задаются только через query (?courts=&tours=) или лаунчер
// (shared/format-links.js, home / roster). Внутри thai.html отдельных слайдеров
// для смены сетки нет — другие значения = новый URL (другой trnId при конфликте сессии).
const _params = new URLSearchParams(location.search);
let _mode   = (['MF','MN','MM','WW'].includes(_params.get('mode')) ? _params.get('mode') : 'MF');
const _rawN   = Number(_params.get('n'));
let _n      = (_rawN >= 4 && _rawN % 2 === 0) ? _rawN : 8;
const _seed   = parseInt(_params.get('seed') || '1', 10) || 1;
const _rawCourts = Number(_params.get('courts'));
let _courts = (Number.isInteger(_rawCourts) && _rawCourts >= 1) ? _rawCourts : null;
const _rawTours = Number(_params.get('tours'));
let _tours  = (Number.isInteger(_rawTours) && _rawTours >= 1) ? _rawTours : null;
const _trnIdSuffix = [
  _courts != null ? ('c' + _courts) : '',
  _tours != null ? ('t' + _tours) : '',
].filter(Boolean).join('_');
const _trnId  = _params.get('trnId') || ('thai_' + _mode + '_' + _n + '_' + _seed + (_trnIdSuffix ? '_' + _trnIdSuffix : ''));

// ── Session storage key ───────────────────────────────
const _STORE_KEY = 'kotc3_thai_session_' + _trnId;

// ════════════════════════════════════════════════════════
// A1.1+A1.2: Session state
// ════════════════════════════════════════════════════════
let _session = null;  // { schedule, currentTour, phase, scores, ... }
let _activeTour = 0;
let _activeGroup = 0;
let _activePanel = 'roster'; // 'roster'|'courts'|'standings'|'r2'|'finished'
let _scoreView = 'score'; // 'score'|'diff'
let _bootstrapParticipants = null; // roster prefill from /api/sudyam/bootstrap

function _isDualPoolMode(mode = _mode) {
  return mode === 'MF' || mode === 'MN';
}

function _getModeLabel(mode = _mode) {
  return {
    MF: 'Микст М/Ж',
    MN: 'Мужчины / Новички',
    MM: 'Мужской',
    WW: 'Женский',
  }[mode] || mode;
}

function _getPoolConfigs() {
  if (_isDualPoolMode()) {
    return [
      { key: 'left', label: '♂ Мужчины', shortLabel: 'Мужчины', ids: _session?.playersM || [], playerGender: 'M', restShort: 'М' },
      { key: 'right', label: _mode === 'MN' ? '🆕 Новички' : '♀ Женщины', shortLabel: _mode === 'MN' ? 'Новички' : 'Женщины', ids: _session?.playersW || [], playerGender: _mode === 'MN' ? 'M' : 'W', restShort: _mode === 'MN' ? 'Н' : 'Ж' },
    ];
  }
  if (_mode === 'WW') {
    return [{ key: 'solo', label: '♀ Игроки', shortLabel: 'Игроки', ids: _session?.playersW || [], playerGender: 'W', restShort: 'Ж' }];
  }
  return [{ key: 'solo', label: '♂ Игроки', shortLabel: 'Игроки', ids: _session?.playersM || [], playerGender: 'M', restShort: 'М' }];
}

function _getRequiredRosterCounts(mode = _mode) {
  if (_isDualPoolMode(mode)) return { needM: _n, needW: _n };
  if (mode === 'MM') return { needM: _n, needW: 0 };
  if (mode === 'WW') return { needM: 0, needW: _n };
  return { needM: _n, needW: _n };
}

function _getActivePoolConfigs() {
  return _getPoolConfigs().filter(pool => Array.isArray(pool.ids) && pool.ids.length > 0);
}

function _buildRosterSelectionFromParticipants(participants) {
  const rows = Array.isArray(participants) ? participants.filter(row => !row?.isWaitlist) : [];
  const required = _getRequiredRosterCounts();

  if (_mode === 'MN') {
    const menIds = [];
    const womenIds = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (!row?.playerId || String(row.gender || '').toUpperCase() !== 'M') continue;
      if ((index % 8) < 4) menIds.push(String(row.playerId));
      else womenIds.push(String(row.playerId));
    }
    if (menIds.length === required.needM && womenIds.length === required.needW) {
      return { menIds, womenIds };
    }
    return null;
  }

  if (_mode === 'MF') {
    const menIds = rows
      .filter(row => String(row?.gender || '').toUpperCase() === 'M' && row?.playerId)
      .map(row => String(row.playerId));
    const womenIds = rows
      .filter(row => String(row?.gender || '').toUpperCase() === 'W' && row?.playerId)
      .map(row => String(row.playerId));
    if (menIds.length === required.needM && womenIds.length === required.needW) {
      return { menIds, womenIds };
    }
    return null;
  }

  if (_mode === 'MM') {
    const menIds = rows
      .filter(row => String(row?.gender || '').toUpperCase() === 'M' && row?.playerId)
      .map(row => String(row.playerId));
    if (menIds.length === required.needM) return { menIds, womenIds: [] };
    return null;
  }

  if (_mode === 'WW') {
    const womenIds = rows
      .filter(row => String(row?.gender || '').toUpperCase() === 'W' && row?.playerId)
      .map(row => String(row.playerId));
    if (womenIds.length === required.needW) return { menIds: [], womenIds };
    return null;
  }

  return null;
}

function _mergeParticipantsIntoLocalPlayerDb(participants) {
  const rows = Array.isArray(participants) ? participants : [];
  if (!rows.length) return;

  const db = Array.isArray(loadPlayerDB()) ? loadPlayerDB().slice() : [];
  const byId = new Map(db.map(player => [String(player?.id || ''), player]));
  let changed = false;

  for (const row of rows) {
    const playerId = String(row?.playerId || '').trim();
    if (!playerId) continue;
    const playerName = String(row?.playerName || playerId).trim();
    const gender = String(row?.gender || '').trim().toUpperCase() === 'W' ? 'W' : 'M';
    const existing = byId.get(playerId);
    if (existing) {
      if (playerName && existing.name !== playerName) {
        existing.name = playerName;
        changed = true;
      }
      if ((existing.gender || 'M') !== gender) {
        existing.gender = gender;
        changed = true;
      }
      continue;
    }
    const created = {
      id: playerId,
      name: playerName,
      gender,
      status: 'active',
      addedAt: new Date().toISOString().split('T')[0],
      tournaments: 0,
      totalPts: 0,
      wins: 0,
      ratingM: 0,
      ratingW: 0,
      ratingMix: 0,
      tournamentsM: 0,
      tournamentsW: 0,
      tournamentsMix: 0,
      lastSeen: '',
    };
    db.push(created);
    byId.set(playerId, created);
    changed = true;
  }

  if (changed) savePlayerDB(db);
}

function _resolveInitialRosterFromLocalTournament() {
  try {
    const raw = JSON.parse(localStorage.getItem('kotc3_tournaments') || '[]');
    const tournaments = Array.isArray(raw) ? raw : [];
    const record = tournaments.find(item => String(item?.id || '') === _trnId);
    if (!record || typeof record !== 'object') return null;

    const meta = record.thaiMeta && typeof record.thaiMeta === 'object' ? record.thaiMeta : {};
    const required = _getRequiredRosterCounts();
    const prefillMenIds = Array.isArray(meta.prefillMenIds) ? meta.prefillMenIds.map(id => String(id)) : [];
    const prefillWomenIds = Array.isArray(meta.prefillWomenIds) ? meta.prefillWomenIds.map(id => String(id)) : [];
    if (prefillMenIds.length === required.needM && prefillWomenIds.length === required.needW) {
      return { menIds: prefillMenIds, womenIds: prefillWomenIds, source: 'local' };
    }

    const participantIds = Array.isArray(record.participants) ? record.participants.map(id => String(id)) : [];
    if (!participantIds.length) return null;

    const db = Array.isArray(loadPlayerDB()) ? loadPlayerDB() : [];
    const participantRows = participantIds.map((playerId, index) => {
      const player = db.find(entry => String(entry?.id || '') === playerId);
      return {
        playerId,
        playerName: player?.name || playerId,
        gender: player?.gender || (_mode === 'WW' ? 'W' : 'M'),
        position: index + 1,
      };
    });

    if (_mode === 'MN') {
      const menIds = participantIds.slice(0, required.needM);
      const womenIds = participantIds.slice(required.needM, required.needM + required.needW);
      if (menIds.length === required.needM && womenIds.length === required.needW) {
        return { menIds, womenIds, source: 'local' };
      }
      return null;
    }

    const selection = _buildRosterSelectionFromParticipants(participantRows);
    return selection ? { ...selection, source: 'local' } : null;
  } catch (_) {
    return null;
  }
}

async function _resolveInitialRosterSelection() {
  const required = _getRequiredRosterCounts();
  const currentMen = Array.isArray(_session?.playersM) ? _session.playersM : [];
  const currentWomen = Array.isArray(_session?.playersW) ? _session.playersW : [];
  if (currentMen.length === required.needM && currentWomen.length === required.needW) {
    return { menIds: currentMen.slice(), womenIds: currentWomen.slice(), source: 'session' };
  }

  const localSelection = _resolveInitialRosterFromLocalTournament();
  if (localSelection) return localSelection;

  if (_bootstrapParticipants && _bootstrapParticipants.length > 0) {
    _mergeParticipantsIntoLocalPlayerDb(_bootstrapParticipants);
    const selection = _buildRosterSelectionFromParticipants(_bootstrapParticipants);
    if (selection) return { ...selection, source: 'admin' };
  }

  if (!_trnId || /^thai_/i.test(_trnId)) return null;

  try {
    const res = await fetch(`/api/admin/roster?tournamentId=${encodeURIComponent(_trnId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => []);
    const rows = Array.isArray(data) ? data : [];
    _mergeParticipantsIntoLocalPlayerDb(rows);
    const selection = _buildRosterSelectionFromParticipants(rows);
    if (!selection) return null;
    return { ...selection, source: 'admin' };
  } catch (_) {
    return null;
  }
}

function _splitInlineArgs(source) {
  const args = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (const ch of source) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      current += ch;
      quote = ch;
      continue;
    }
    if (ch === ',') {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

function _decodeInlineArg(token, element) {
  if (token === 'this.value') return element?.value ?? '';
  if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
    return token.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  const num = Number(token);
  return Number.isFinite(num) ? num : token;
}

function _invokeInlineSource(source, element, event) {
  if (!source) return false;
  const statements = String(source)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);

  let handled = false;
  for (const statement of statements) {
    if (statement === 'event.stopPropagation()') {
      event?.stopPropagation();
      handled = true;
      continue;
    }

    const match = statement.match(/^(?:window\.)?([A-Za-z0-9_$.]+)\((.*)\)$/);
    if (!match) continue;

    const fnPath = match[1];
    const fn = fnPath.split('.').reduce((acc, key) => acc?.[key], globalThis);
    if (typeof fn !== 'function') continue;

    const args = match[2].trim()
      ? _splitInlineArgs(match[2]).map(arg => _decodeInlineArg(arg, element))
      : [];
    fn(...args);
    handled = true;
  }

  return handled;
}

function _installInlineEventBridge() {
  document.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[data-click],[onclick]') : null;
    if (!el) return;
    const source = el.getAttribute('data-click') || el.getAttribute('onclick');
    if (_invokeInlineSource(source, el, event)) {
      event.preventDefault();
    }
  });

  document.addEventListener('input', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[data-input],[oninput]') : null;
    if (!el) return;
    _invokeInlineSource(el.getAttribute('data-input') || el.getAttribute('oninput'), el, event);
  });

  document.addEventListener('change', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[data-change],[onchange]') : null;
    if (!el) return;
    _invokeInlineSource(el.getAttribute('data-change') || el.getAttribute('onchange'), el, event);
  });
}

function _loadSession() {
  try {
    const raw = localStorage.getItem(_STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function _buildSessionSyncPayload() {
  if (!_session) return null;
  const meta = _currentTournamentMeta();
  return {
    id: _trnId,
    format: 'Thai Mixed',
    mode: meta.mode,
    n: meta.n,
    courts: meta.courts,
    tours: meta.tours,
    seed: _seed,
    status: _session.finalized ? 'finished' : (_session.phase || 'active'),
    updatedAt: new Date().toISOString(),
    meta,
    session: _session,
  };
}

function _saveSession() {
  try {
    if (_session) localStorage.setItem(_STORE_KEY, JSON.stringify(_session));
  } catch (_) {}
  try {
    const payload = _buildSessionSyncPayload();
    if (payload && typeof syncTournamentAsync === 'function') syncTournamentAsync(payload);
  } catch (_) {}
}

function _resolveTournamentMeta(source) {
  const session = source && typeof source === 'object' ? source : null;
  const schedule = Array.isArray(session?.schedule) ? session.schedule : null;
  const scheduleMeta = schedule?.meta && typeof schedule.meta === 'object' ? schedule.meta : null;
  const sessionMeta = session?.meta && typeof session.meta === 'object' ? session.meta : null;
  const courts = Number(scheduleMeta?.courts ?? sessionMeta?.courts ?? session?.courts);
  const tours = Number(scheduleMeta?.tours ?? sessionMeta?.tours ?? session?.tours);
  const n = Number(scheduleMeta?.n ?? sessionMeta?.n ?? session?.n ?? _n);
  return {
    mode: String(scheduleMeta?.mode ?? sessionMeta?.mode ?? session?.mode ?? _mode).toUpperCase(),
    n: Number.isFinite(n) ? n : _n,
    courts: Number.isFinite(courts) && courts > 0
      ? courts
      : (Array.isArray(schedule?.[0]?.pairs) ? schedule[0].pairs.length : 4),
    tours: Number.isFinite(tours) && tours > 0
      ? tours
      : (Array.isArray(schedule) ? schedule.length : 4),
  };
}

function _currentTournamentMeta() {
  return _resolveTournamentMeta(_session);
}

function _currentTournamentLine() {
  const meta = _currentTournamentMeta();
  const modeLabel = _getModeLabel();
  return `${modeLabel} · ${meta.n} игр. · courts ${meta.courts} · tours ${meta.tours} · seed ${_seed}`;
}

function _sessionDate() {
  return (_session?.createdAt || new Date().toISOString()).slice(0, 10);
}

// ════════════════════════════════════════════════════════
// A1.1: Generate / restore schedule
// ════════════════════════════════════════════════════════
function _initSession() {
  const saved = _loadSession();
  const savedMeta = _resolveTournamentMeta(saved);
  const courtsMatch = _courts == null || savedMeta.courts === _courts;
  const toursMatch = _tours == null || savedMeta.tours === _tours;
  if (saved && saved.mode === _mode && saved.n === _n && saved.seed === _seed && courtsMatch && toursMatch) {
    // Migrate old sessions that lack courts/tours fields
    saved.courts = savedMeta.courts;
    saved.tours = savedMeta.tours;
    saved.meta = { mode: savedMeta.mode, n: savedMeta.n, courts: savedMeta.courts, tours: savedMeta.tours };
    if (saved.schedule && (!saved.schedule.meta || saved.schedule.meta.courts == null || saved.schedule.meta.tours == null)) {
      saved.schedule.meta = { ...saved.meta };
    }
    _session = saved;
    return;
  }
  // Generate new schedule
  const schedule = thaiGenerateSchedule({ mode: _mode, men: _n, women: _n, seed: _seed, courts: _courts, tours: _tours });
  const validation = thaiValidateSchedule(schedule);
  if (!validation.valid) {
    console.error('[Thai] Schedule validation failed:', validation.errors);
  }
  const meta = _resolveTournamentMeta({ mode: _mode, n: _n, courts: schedule.meta?.courts, tours: schedule.meta?.tours, schedule });
  _session = {
    id: _trnId,
    mode: _mode,
    n: _n,
    seed: _seed,
    courts: meta.courts,
    tours: meta.tours,
    meta: { mode: meta.mode, n: meta.n, courts: meta.courts, tours: meta.tours },
    schedule,
    phase: 'roster',   // 'roster' | 'r1' | 'r2' | 'finished'
    currentTour: 0,
    // R2 state
    r2Mode: 'seed',         // 'seed' | 'play'
    r2CurrentTour: 0,
    r2Scores: null,        // r2Scores[tourIdx][pairIdx] = { own:number|null, opp:number|null }
    // scores[tourIdx][pairIdx] = { own: number|null, opp: number|null }
    scores: schedule.map(tour => tour.pairs.map(() => ({ own: null, opp: null }))),
    createdAt: new Date().toISOString(),
  };
  _saveSession();
}

// ════════════════════════════════════════════════════════
// A1.2: Navigation helpers
// ════════════════════════════════════════════════════════
function _showPanel(panel) {
  _activePanel = panel;
  ['roster','courts','standings','r2','finished'].forEach(p => {
    const el = document.getElementById('thai-' + p + '-panel');
    if (el) el.classList.toggle('active', p === panel);
  });
  if (panel === 'courts') _renderCourts();
  else if (panel === 'standings') { _renderStandings(); _renderActionBar(); }
  else if (panel === 'r2') { _renderR2(); _renderActionBar(); }
  else if (panel === 'finished') { _renderFinished(); _renderActionBar(); }
  else _renderActionBar();
}

/** Render pill-tab navigation for tours (R1 rounds). A1.2 */
function _renderTourTabs() {
  const container = document.getElementById('thai-tour-tabs');
  if (!container || !_session?.schedule) return;
  const tours = _session.schedule;
  container.innerHTML = tours.map((tour, i) => {
    const done = _activePanel === 'r2' ? false : i < _session.currentTour;
    const active = i === _activeTour;
    return `<button class="pill-tab${active ? ' active' : ''}${done ? ' done' : ''}"
      role="tab" aria-selected="${active}"
      data-click="window._thaiGoTour(${i})">Тур ${i + 1}</button>`;
  }).join('');
}

/** Switch active tour tab. A1.2 */
window._thaiGoTour = function(i) {
  _activeTour = i;
  _renderTourTabs();
  if (_activePanel === 'courts') _renderCourts();
  else if (_activePanel === 'r2' && _session && _session.r2Mode === 'play') {
    _session.r2CurrentTour = i;
    _renderR2Play();
  }
};

// ════════════════════════════════════════════════════════
// F1.2: Court card rendering — score +/−, diff/pts badges
// ════════════════════════════════════════════════════════

/** Resolve player name from session roster + DB. */
function _playerName(side, idx) {
  // side: 0 = left (men / playerA), 1 = right (women / playerB)
  const ids = (side === 0)
    ? (_session?.playersM || [])
    : (_isDualPoolMode() ? (_session?.playersW || []) : (_mode === 'WW' ? (_session?.playersW || []) : (_session?.playersM || [])));
  const id = ids[idx];
  if (!id) return `#${idx}`;
  const p = getPlayerById(id);
  return p?.name || id;
}

/** Get pair names for a match. */
function _pairNames(pair) {
  if (_isDualPoolMode()) {
    return { left: _playerName(0, pair[0]), right: _playerName(1, pair[1]) };
  }
  // MM or WW — both from same pool
  const pool = _mode === 'MM' ? (_session?.playersM || []) : (_session?.playersW || []);
  const nameA = pool[pair[0]] ? (getPlayerById(pool[pair[0]])?.name || pool[pair[0]]) : `#${pair[0]}`;
  const nameB = pool[pair[1]] ? (getPlayerById(pool[pair[1]])?.name || pool[pair[1]]) : `#${pair[1]}`;
  return { left: nameA, right: nameB };
}

/** F1.5: Who rests in current tour (badges for UI). */
function _renderRestBadges() {
  const el = document.getElementById('thai-rest-badge-row');
  if (!el || !_session || !_session.schedule) return;

  const tour = _session.schedule[_activeTour];
  if (!tour) {
    el.innerHTML = '';
    return;
  }
  const pairs = tour.pairs || [];

  if (_isDualPoolMode()) {
    const menIds = _session.playersM || [];
    const womenIds = _session.playersW || [];

    const usedMen = new Set(pairs.map(p => p && p[0] != null ? p[0] : null).filter(x => x != null));
    const usedWomen = new Set(pairs.map(p => p && p[1] != null ? p[1] : null).filter(x => x != null));

    const restMenIdx = [];
    for (let i = 0; i < menIds.length; i++) {
      if (!usedMen.has(i)) restMenIdx.push(i);
    }
    const restWomenIdx = [];
    for (let i = 0; i < womenIds.length; i++) {
      if (!usedWomen.has(i)) restWomenIdx.push(i);
    }

    const menNames = restMenIdx.map(idx => {
      const id = menIds[idx];
      const p = id != null ? getPlayerById(id) : null;
      return p ? p.name : ('#' + idx);
    });
    const womenNames = restWomenIdx.map(idx => {
      const id = womenIds[idx];
      const p = id != null ? getPlayerById(id) : null;
      return p ? p.name : ('#' + idx);
    });

    const parts = [];
    if (menNames.length) {
      const s = menNames.map(x => esc(x)).join(', ');
      parts.push(`<span class="thai-rest-badge thai-rest-men">😴 М: <span class="thai-rest-strong">${s}</span></span>`);
    }
    if (womenNames.length) {
      const s = womenNames.map(x => esc(x)).join(', ');
      parts.push(`<span class="thai-rest-badge thai-rest-women">😴 ${_mode === 'MN' ? 'Н' : 'Ж'}: <span class="thai-rest-strong">${s}</span></span>`);
    }

    el.innerHTML = parts.length ? parts.join('') : '';
  } else {
    const pool = _mode === 'MM' ? (_session.playersM || []) : (_session.playersW || []);
    const used = new Set();
    (pairs || []).forEach(p => {
      if (!p || p.length < 2) return;
      if (p[0] != null) used.add(p[0]);
      if (p[1] != null) used.add(p[1]);
    });
    const restIdx = [];
    for (let i = 0; i < pool.length; i++) {
      if (!used.has(i)) restIdx.push(i);
    }

    const restNames = restIdx.map(idx => {
      const id = pool[idx];
      const p = id != null ? getPlayerById(id) : null;
      return p ? p.name : ('#' + idx);
    });
    el.innerHTML = restNames.length
      ? `<span class="thai-rest-badge">😴 Отдых: <span class="thai-rest-strong">${restNames.map(x => esc(x)).join(', ')}</span></span>`
      : '';
  }
}

/** Render all court cards for the active tour. F1.2 */
function _renderCourts() {
  const grid = document.getElementById('thai-courts-grid');
  if (!grid || !_session?.schedule) return;
  const tour = _session.schedule[_activeTour];
  if (!tour) { grid.innerHTML = ''; _renderRestBadges(); return; }
  const pairs = tour.pairs || [];
  const scores = _session.scores?.[_activeTour] || [];
  const isCurrent = _activeTour === _session.currentTour;
  const isFinished = _activeTour < _session.currentTour;

  // S7.5: Court-lock — judge can only edit their assigned court
  const jm = globalThis.judgeMode;

  grid.innerHTML = pairs.map((pair, pi) => {
    const sc = scores[pi] || { own: null, opp: null };
    const own = sc.own != null ? sc.own : 0;
    const opp = sc.opp != null ? sc.opp : 0;
    const diff = own - opp;
    const pts = thaiCalcPoints(diff);
    const { left, right } = _pairNames(pair);
    const courtLocked = jm?.active && jm.court !== pi;
    const disabled = (isFinished || courtLocked) ? ' disabled' : '';
    const btnCls = (isFinished || courtLocked) ? 'thai-sc-btn disabled' : 'thai-sc-btn';
    const diffCls = diff > 0 ? ' pos' : diff < 0 ? ' neg' : '';
    const diffBigCls = diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'neu';
    const diffBigVal = (diff > 0 ? '+' : '') + diff;
    const courtLabel = `Корт ${pi + 1}`;
    const statusLabel = courtLocked ? '🔒' : isFinished ? '✅' : isCurrent ? '🏐' : '⏳';

    const scoreBlock = _scoreView === 'diff'
      ? `<div class="thai-score-col">
          <span class="thai-diff-big ${diffBigCls}">${diffBigVal}</span>
        </div>`
      : `<div class="thai-score-col">
          <button class="${btnCls}" data-click="window._thaiScore(${pi},'own',-1)"${disabled}>−</button>
          <span class="thai-sc-val" id="thai-own-${pi}">${own}</span>
          <button class="${btnCls}" data-click="window._thaiScore(${pi},'own',1)"${disabled}>+</button>
          <span class="thai-sc-sep">:</span>
          <button class="${btnCls}" data-click="window._thaiScore(${pi},'opp',-1)"${disabled}>−</button>
          <span class="thai-sc-val" id="thai-opp-${pi}">${opp}</span>
          <button class="${btnCls}" data-click="window._thaiScore(${pi},'opp',1)"${disabled}>+</button>
        </div>`;

    const badgesBlock = _scoreView === 'diff'
      ? ''
      : `<div class="thai-badges-row">
          <span class="thai-badge thai-badge-diff${diffCls}">diff ${diff > 0 ? '+' : ''}${diff}</span>
          <span class="thai-badge thai-badge-pts">${pts} pts</span>
        </div>`;

    return `<div class="thai-pair-card">
      <div class="thai-pair-hdr">
        <span>${courtLabel}</span>
        <span>${statusLabel}</span>
      </div>
      <div class="thai-pair-body">
        <div class="thai-pl-name left">${esc(left)}</div>
        ${scoreBlock}
        <div class="thai-pl-name right">${esc(right)}</div>
      </div>
      ${badgesBlock}
    </div>`;
  }).join('');

  // F1.5: refresh "who rests" badges for this tour
  _renderRestBadges();
  _renderZeroSumBar();
  _renderActionBar();
}

function _rankingPoolKey(stage, playerIds) {
  if (_isDualPoolMode()) return `${stage}:${playerIds === _session?.playersM ? 'left' : 'right'}`;
  return `${stage}:${_mode === 'MM' ? 'men' : 'women'}`;
}

function _ensureRankingState() {
  if (!_session.r1RankingState || typeof _session.r1RankingState !== 'object') {
    _session.r1RankingState = { drawGroups: {}, logs: {}, manualActions: [] };
  }
  if (!_session.r1RankingState.drawGroups || typeof _session.r1RankingState.drawGroups !== 'object') {
    _session.r1RankingState.drawGroups = {};
  }
  if (!_session.r1RankingState.logs || typeof _session.r1RankingState.logs !== 'object') {
    _session.r1RankingState.logs = {};
  }
  if (!Array.isArray(_session.r1RankingState.manualActions)) {
    _session.r1RankingState.manualActions = [];
  }
  return _session.r1RankingState;
}

function _persistRankingMeta(poolKey, meta) {
  if (!_session) return;
  const rankingState = _ensureRankingState();
  const nextDrawGroups = {
    ...(rankingState.drawGroups?.[poolKey] || {}),
    ...(meta?.drawGroups || {}),
  };
  const nextLogs = Array.isArray(meta?.logs) ? meta.logs : [];
  const prevDrawJson = JSON.stringify(rankingState.drawGroups?.[poolKey] || {});
  const nextDrawJson = JSON.stringify(nextDrawGroups);
  const prevLogsJson = JSON.stringify(rankingState.logs?.[poolKey] || []);
  const nextLogsJson = JSON.stringify(nextLogs);
  if (prevDrawJson === nextDrawJson && prevLogsJson === nextLogsJson) return;

  rankingState.drawGroups[poolKey] = nextDrawGroups;
  rankingState.logs[poolKey] = nextLogs;
  if (nextLogs.length) console.info('[Thai ranking]', poolKey, nextLogs);
  _saveSession();
}

function _finalizePoolStandings(stage, playerIds, ownScores, oppScores, opponents) {
  if (!_session || !playerIds || !playerIds.length) return [];
  const poolKey = _rankingPoolKey(stage, playerIds);
  const rankingState = _ensureRankingState();
  const standings = thaiCalcStandings({
    ownScores,
    oppScores,
    opponents,
    playerKeys: playerIds,
    drawGroups: rankingState.drawGroups?.[poolKey] || {},
    drawSeed: `${_trnId}:${poolKey}`,
  });

  _persistRankingMeta(poolKey, standings.meta);
  standings.forEach((standing) => {
    const id = playerIds[standing.idx];
    const player = id != null ? getPlayerById(id) : null;
    standing.name = player ? player.name : (id != null ? id : ('#' + standing.idx));
    standing.playerId = id || '';
  });
  return standings;
}

function _randomWeight() {
  try {
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return values[0];
    }
  } catch (_) {}
  return Math.floor(Math.random() * 4294967296);
}

function _buildManualDrawOrders(playerKeys) {
  const ordered = [...(playerKeys || [])]
    .map((key) => ({ key: String(key), weight: _randomWeight() }))
    .sort((a, b) => {
      if (a.weight !== b.weight) return a.weight - b.weight;
      return a.key.localeCompare(b.key, 'ru');
    });

  const orders = {};
  ordered.forEach((entry, index) => {
    orders[entry.key] = index + 1;
  });
  return orders;
}

function _formatDrawPlayers(players, orders) {
  return [...(players || [])]
    .map((playerId) => ({
      id: String(playerId),
      order: Number(orders?.[String(playerId)] || Number.MAX_SAFE_INTEGER),
    }))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.id.localeCompare(b.id, 'ru');
    })
    .map((entry) => _playerNameById(entry.id))
    .join(' • ');
}

function _playerNameById(playerId) {
  if (playerId === null || playerId === undefined || playerId === '') return '';
  const player = getPlayerById(String(playerId));
  return player?.name || String(playerId);
}

function _renderManualDrawControls(pools) {
  if (!_session) return '';
  const rankingState = _ensureRankingState();
  const sections = [];

  for (const pool of pools) {
    const poolKey = _rankingPoolKey('r1', pool.ids);
    const drawLogs = (rankingState.logs?.[poolKey] || []).filter((entry) => entry?.type === 'draw' && Array.isArray(entry.players) && entry.players.length > 1);
    if (!drawLogs.length) continue;

    const cards = drawLogs.map((entry, index) => {
      const players = entry.players.map((playerId) => String(playerId));
      const currentOrders = rankingState.drawGroups?.[poolKey]?.[entry.groupKey] || {};
      const currentOrder = _formatDrawPlayers(players, currentOrders);
      return `<div style="border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px;background:rgba(255,255,255,.04);display:grid;gap:8px">
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.72">Tie group ${index + 1}</div>
        <div style="font-size:14px;line-height:1.45">${players.map((playerId) => esc(_playerNameById(playerId))).join(', ')}</div>
        <div style="font-size:12px;opacity:.78">Current draw: ${esc(currentOrder || players.join(' • '))}</div>
        <button type="button" data-click="window._thaiManualDraw('${poolKey}','${entry.groupKey}')" class="btn-secondary" style="justify-self:start">🎲 Жеребьёвка заново</button>
      </div>`;
    }).join('');

    sections.push(`<div style="display:grid;gap:10px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7">${esc(pool.label)}</div>
      ${cards}
    </div>`);
  }

  if (!sections.length) return '';

  return `<div style="margin-top:16px;display:grid;gap:12px;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:14px;background:rgba(255,255,255,.04)">
    <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.75">Ручная жеребьёвка равных групп</div>
    <div style="font-size:13px;line-height:1.45;opacity:.82">Показываются только группы, где после всех критериев осталась полная ничья и порядок зафиксирован жеребьёвкой.</div>
    ${sections.join('')}
  </div>`;
}

window._thaiManualDraw = function(poolKey, groupKey) {
  if (!_session) return;
  const rankingState = _ensureRankingState();
  const drawLog = (rankingState.logs?.[poolKey] || []).find(
    (entry) => entry?.type === 'draw' && String(entry.groupKey || '') === String(groupKey || '')
  );
  if (!drawLog || !Array.isArray(drawLog.players) || drawLog.players.length < 2) {
    showToast('Группа для жеребьёвки не найдена', 'warn');
    return;
  }

  if (!rankingState.drawGroups[poolKey] || typeof rankingState.drawGroups[poolKey] !== 'object') {
    rankingState.drawGroups[poolKey] = {};
  }

  rankingState.drawGroups[poolKey][groupKey] = _buildManualDrawOrders(drawLog.players);
  rankingState.manualActions.push({
    type: 'manual_draw',
    poolKey: String(poolKey),
    groupKey: String(groupKey),
    players: drawLog.players.map((playerId) => String(playerId)),
    orders: rankingState.drawGroups[poolKey][groupKey],
    at: new Date().toISOString(),
  });

  _saveSession();
  if (_activePanel === 'standings') _renderStandings();
  if (_activePanel === 'r2') _renderR2();
  if (_activePanel === 'finished') _renderFinished();
  showToast('🎲 Жеребьёвка обновлена', 'success');
};

/** F1.4: Render standings cross-table for the active tour. */
function _renderStandings() {
  const content = document.getElementById('thai-standings-content');
  if (!content || !_session?.schedule) return;

  const maxTour = _session.schedule.length - 1;
  const activeTour = _activeTour != null ? _activeTour : 0;
  const tourEnd = activeTour < 0 ? 0 : (activeTour > maxTour ? maxTour : activeTour);
  const tourCount = tourEnd + 1;

  const highlights = { gold: [0], silver: [1], bronze: [2] };
  const columns = [
    { key: 'rank', label: '#', width: '36px', align: 'center' },
    { key: 'name', label: 'Имя', width: '220px', align: 'left' },
    { key: 'games', label: 'И', width: '44px', align: 'center' },
    { key: 'wins', label: 'В', width: '56px', align: 'center' },
    { key: 'diff', label: 'Diff', width: '66px', align: 'center' },
    { key: 'pts', label: 'Pts', width: '66px', align: 'center' },
    { key: 'K', label: 'K', width: '66px', align: 'center' },
  ];

  function initScoreArrays(pCount) {
    return {
      ownScores: Array.from({ length: pCount }, () => Array.from({ length: tourCount }, () => null)),
      oppScores: Array.from({ length: pCount }, () => Array.from({ length: tourCount }, () => null)),
      opponents: Array.from({ length: pCount }, () => Array.from({ length: tourCount }, () => null)),
    };
  }

  function renderTableForIds(ids, ownScores, oppScores, opponents) {
    const standings = _finalizePoolStandings('r1', ids, ownScores, oppScores, opponents);
    const rows = standings.map((s, i) => ({
      rank: s.place != null ? s.place : (i + 1),
      name: s.name || ('#' + s.idx),
      games: s.rPlayed != null ? s.rPlayed : 0,
      wins: s.wins != null ? s.wins : 0,
      diff: s.diff != null ? s.diff : 0,
      pts: s.points != null ? s.points : (s.pts != null ? s.pts : 0),
      K: s.K != null ? s.K : 0,
    }));
    return CrossTable.render({ columns, rows, highlights });
  }

  if (_isDualPoolMode()) {
    const menIds = _session.playersM || [];
    const womenIds = _session.playersW || [];
    if (!menIds.length && !womenIds.length) return;
    const [leftPool, rightPool] = _getPoolConfigs();

    const menArr = initScoreArrays(menIds.length);
    const womenArr = initScoreArrays(womenIds.length);

    for (let t = 0; t < tourCount; t++) {
      const tour = _session.schedule[t];
      const pairs = tour ? (tour.pairs || []) : [];
      const tourScores = _session.scores && _session.scores[t] ? _session.scores[t] : [];

      for (let pi = 0; pi < pairs.length; pi++) {
        const pair = pairs[pi];
        const sc = tourScores[pi] || { own: null, opp: null };
        const ownVal = sc.own != null ? sc.own : null;
        const oppVal = sc.opp != null ? sc.opp : null;

        const mi = pair[0];
        const wi = pair[1];

        if (menArr.ownScores[mi]) {
          menArr.ownScores[mi][t] = ownVal;
          menArr.oppScores[mi][t] = oppVal;
          menArr.opponents[mi][t] = womenIds[wi] || wi;
        }
        if (womenArr.ownScores[wi]) {
          // For women perspective: own=right score (oppVal), opponent=left score (ownVal)
          womenArr.ownScores[wi][t] = oppVal;
          womenArr.oppScores[wi][t] = ownVal;
          womenArr.opponents[wi][t] = menIds[mi] || mi;
        }
      }
    }

    const menTable = renderTableForIds(menIds, menArr.ownScores, menArr.oppScores, menArr.opponents);
    const womenTable = renderTableForIds(womenIds, womenArr.ownScores, womenArr.oppScores, womenArr.opponents);
    const drawTools = _renderManualDrawControls([
      { label: leftPool?.shortLabel || 'Мужчины', ids: menIds },
      { label: rightPool?.shortLabel || 'Женщины', ids: womenIds },
    ]);

    content.innerHTML =
      `<div>${menTable}</div><div style="margin-top:12px">${womenTable}</div>${drawTools}`;
  } else {
    const soloPool = _getPoolConfigs()[0];
    const ids = _mode === 'WW' ? (_session.playersW || []) : (_session.playersM || []);
    if (!ids.length) return;

    const arr = initScoreArrays(ids.length);

    for (let t = 0; t < tourCount; t++) {
      const tour = _session.schedule[t];
      const pairs = tour ? (tour.pairs || []) : [];
      const tourScores = _session.scores && _session.scores[t] ? _session.scores[t] : [];

      for (let pi = 0; pi < pairs.length; pi++) {
        const pair = pairs[pi];
        const sc = tourScores[pi] || { own: null, opp: null };
        const ownVal = sc.own != null ? sc.own : null;
        const oppVal = sc.opp != null ? sc.opp : null;

        const a = pair[0];
        const b = pair[1];

        if (arr.ownScores[a]) {
          arr.ownScores[a][t] = ownVal;
          arr.oppScores[a][t] = oppVal;
          arr.opponents[a][t] = ids[b] || b;
        }
        if (arr.ownScores[b]) {
          // For the right player: own=right score (oppVal), opponent=left score (ownVal)
          arr.ownScores[b][t] = oppVal;
          arr.oppScores[b][t] = ownVal;
          arr.opponents[b][t] = ids[a] || a;
        }
      }
    }

    const drawTools = _renderManualDrawControls([
      { label: soloPool?.shortLabel || (_mode === 'WW' ? 'Игроки Ж' : 'Игроки М'), ids },
    ]);
    content.innerHTML = renderTableForIds(ids, arr.ownScores, arr.oppScores, arr.opponents) + drawTools;
  }
}

/** F1.2: Handle score +/− button press. */
window._thaiScore = function(pairIdx, side, delta) {
  if (!_session?.scores?.[_activeTour]) return;
  if (_activeTour !== _session.currentTour) return; // can't edit past tours
  // S7.5: Court-lock guard
  const jm = globalThis.judgeMode;
  if (jm?.active && jm.court !== pairIdx) return;
  const sc = _session.scores[_activeTour][pairIdx];
  if (!sc) return;
  const cur = sc[side] != null ? sc[side] : 0;
  const newVal = Math.max(0, cur + delta);
  sc[side] = newVal;
  _saveSession();
  _renderCourts();
};

// ════════════════════════════════════════════════════════
// F1.3: Zero-Sum bar + blocking
// ════════════════════════════════════════════════════════

/** Check if current tour is zero-sum balanced. */
function _tourZeroSum(tourIdx) {
  const scores = _session?.scores?.[tourIdx] || [];
  const diffs = scores.map(sc => {
    const own = sc.own != null ? sc.own : 0;
    const opp = sc.opp != null ? sc.opp : 0;
    return own - opp;
  });
  return { balanced: thaiZeroSumTour(diffs), sum: diffs.reduce((a, b) => a + b, 0), diffs };
}

/** Check if all scores in the tour have been entered (non-null). */
function _tourComplete(tourIdx) {
  const scores = _session?.scores?.[tourIdx] || [];
  return scores.length > 0 && scores.every(sc => sc.own !== null && sc.opp !== null && (sc.own > 0 || sc.opp > 0));
}

/** Render the zero-sum validation bar. F1.3 */
function _renderZeroSumBar() {
  const bar = document.getElementById('thai-zs-bar');
  if (!bar || !_session) { if (bar) bar.style.display = 'none'; return; }
  if (_activePanel !== 'courts') { bar.style.display = 'none'; return; }

  const { balanced, sum } = _tourZeroSum(_activeTour);
  const complete = _tourComplete(_activeTour);

  bar.style.display = 'flex';
  bar.className = 'thai-zs-bar';

  if (balanced && complete) {
    bar.classList.add('zs-ok');
    bar.innerHTML = `<span class="thai-zs-icon">✅</span>
      <span class="thai-zs-label">Zero-Sum OK — тур сбалансирован</span>
      <span class="thai-zs-val">Σ = 0</span>`;
  } else if (!complete) {
    bar.classList.add('zs-warn');
    bar.innerHTML = `<span class="thai-zs-icon">⏳</span>
      <span class="thai-zs-label">Введите все счета</span>
      <span class="thai-zs-val">Σ = ${sum > 0 ? '+' : ''}${sum}</span>`;
  } else {
    bar.classList.add('zs-bad');
    bar.innerHTML = `<span class="thai-zs-icon">⚠️</span>
      <span class="thai-zs-label">Zero-Sum ошибка — проверьте счета</span>
      <span class="thai-zs-val">Σ = ${sum > 0 ? '+' : ''}${sum}</span>`;
  }
}

/** Can advance to next tour? F1.3 */
function _canAdvanceTour() {
  const { balanced } = _tourZeroSum(_session.currentTour);
  const complete = _tourComplete(_session.currentTour);
  return balanced && complete;
}

/** Bottom action bar content changes by phase. A1.2 + F1.3 */
function _renderActionBar() {
  const bar = document.getElementById('thai-action-bar');
  if (!bar) return;
  if (_activePanel === 'roster') {
    bar.style.display = 'flex';
    bar.innerHTML = `<button class="btn-primary" data-click="thaiStartSession()">▶ Начать турнир</button>`;
  } else if (_activePanel === 'courts') {
    const canAdvance = _canAdvanceTour();
    const disabledAttr = canAdvance ? '' : ' disabled style="opacity:.45;pointer-events:none;flex:2"';
    const enabledStyle = canAdvance ? ' style="flex:2"' : '';
    bar.style.display = 'flex';
    bar.innerHTML = `
      <button class="btn-secondary" style="flex:1" data-click="_thaiShowStandings()">📊 Таблица</button>
      <button class="btn-primary"${canAdvance ? enabledStyle : disabledAttr} data-click="_thaiNextTour()">▶ Следующий тур</button>`;
  } else if (_activePanel === 'standings') {
    bar.style.display = 'flex';
    bar.innerHTML = `
      <button class="btn-secondary" style="flex:1" data-click="_thaiShowCourts()">← Назад</button>
      <button class="btn-primary" style="flex:2" data-click="_thaiGoR2()">🎯 Посев R2</button>`;
  } else if (_activePanel === 'r2') {
    bar.style.display = 'flex';
    bar.innerHTML = `<button class="btn-primary" data-click="_thaiFinish()">🏆 Завершить</button>`;
  } else {
    bar.style.display = 'none';
  }
}

// ════════════════════════════════════════════════════════
// F1.7: R2 Seeding screen
// ════════════════════════════════════════════════════════

/** Build standings from all R1 scores for one gender pool. */
function _buildR1Standings(playerIds) {
  if (!_session || !playerIds || !playerIds.length) return [];
  const schedule = _session.schedule || [];
  const scores = _session.scores || [];
  const n = playerIds.length;
  const ownScores = Array.from({ length: n }, () => []);
  const oppScores = Array.from({ length: n }, () => []);
  const opponents = Array.from({ length: n }, () => []);

  for (let ti = 0; ti < schedule.length; ti++) {
    const tour = schedule[ti];
    const tourScores = scores[ti] || [];

    for (let pi = 0; pi < (tour.pairs || []).length; pi++) {
      const pair = tour.pairs[pi];
      const sc = tourScores[pi] || { own: 0, opp: 0 };
      const leftIdx = pair[0];
      const rightIdx = pair[1];

      if (_isDualPoolMode()) {
        // For MF, this function is called separately for men and women
        // leftIdx is in men pool, rightIdx is in women pool
        // We need to know which pool we're building for
        if (n === (_session.playersM || []).length && playerIds === _session.playersM) {
          // Men pool: left side of each pair
          ownScores[leftIdx].push(sc.own != null ? sc.own : 0);
          oppScores[leftIdx].push(sc.opp != null ? sc.opp : 0);
          opponents[leftIdx].push((_session.playersW || [])[rightIdx] || rightIdx);
        } else {
          // Women pool: right side of each pair
          ownScores[rightIdx].push(sc.opp != null ? sc.opp : 0);
          oppScores[rightIdx].push(sc.own != null ? sc.own : 0);
          opponents[rightIdx].push((_session.playersM || [])[leftIdx] || leftIdx);
        }
      } else {
        // MM/WW: both indices in same pool
        ownScores[leftIdx].push(sc.own != null ? sc.own : 0);
        oppScores[leftIdx].push(sc.opp != null ? sc.opp : 0);
        opponents[leftIdx].push(playerIds[rightIdx] || rightIdx);
        ownScores[rightIdx].push(sc.opp != null ? sc.opp : 0);
        oppScores[rightIdx].push(sc.own != null ? sc.own : 0);
        opponents[rightIdx].push(playerIds[leftIdx] || leftIdx);
      }
    }
  }

  return _finalizePoolStandings('r1', playerIds, ownScores, oppScores, opponents);
}

/** F1.10: Build standings from R2 scores (for nominations). */
function _buildR2Standings(playerIds) {
  if (!_session || !_session.r2Scores || !_session.r2Scores.length) return [];
  if (!playerIds || !playerIds.length) return [];

  const schedule = _session.schedule || [];
  const scores = _session.r2Scores || [];
  const n = playerIds.length;

  const ownScores = Array.from({ length: n }, () => []);
  const oppScores = Array.from({ length: n }, () => []);
  const opponents = Array.from({ length: n }, () => []);

  for (let ti = 0; ti < schedule.length; ti++) {
    const tour = schedule[ti];
    const tourScores = scores[ti] || [];

    for (let pi = 0; pi < (tour.pairs || []).length; pi++) {
      const pair = tour.pairs[pi];
      const sc = tourScores[pi] || { own: 0, opp: 0 };
      const leftIdx = pair[0];
      const rightIdx = pair[1];

      if (_isDualPoolMode()) {
        // Men pool: left-side (pair[0]) is "own"
        // Women pool: right-side (pair[1]) is "own"
        if (n === (_session.playersM || []).length && playerIds === _session.playersM) {
          ownScores[leftIdx].push(sc.own != null ? sc.own : 0);
          oppScores[leftIdx].push(sc.opp != null ? sc.opp : 0);
          opponents[leftIdx].push((_session.playersW || [])[rightIdx] || rightIdx);
        } else {
          ownScores[rightIdx].push(sc.opp != null ? sc.opp : 0);
          oppScores[rightIdx].push(sc.own != null ? sc.own : 0);
          opponents[rightIdx].push((_session.playersM || [])[leftIdx] || leftIdx);
        }
      } else {
        ownScores[leftIdx].push(sc.own != null ? sc.own : 0);
        oppScores[leftIdx].push(sc.opp != null ? sc.opp : 0);
        opponents[leftIdx].push(playerIds[rightIdx] || rightIdx);
        ownScores[rightIdx].push(sc.opp != null ? sc.opp : 0);
        oppScores[rightIdx].push(sc.own != null ? sc.own : 0);
        opponents[rightIdx].push(playerIds[leftIdx] || leftIdx);
      }
    }
  }

  return _finalizePoolStandings('r2', playerIds, ownScores, oppScores, opponents);
}

/** Render R2 seeding zones. F1.7 */
function _renderR2Seed() {
  const container = document.getElementById('thai-r2-content');
  if (!container || !_session) return;

  // Build R1 standings
  const pools = _getActivePoolConfigs();

  const zoneLabels = { hard: '🔴 Hard', advance: '🟠 Advance', medium: '🔵 Medium', lite: '🟢 Lite' };
  let html = '<div class="thai-r2-intro">🎯 Посев R2 — по итогам R1</div>';

  for (const pool of pools) {
    const standings = _buildR1Standings(pool.ids);
    const numZones = _currentTournamentMeta().courts || Math.floor(standings.length / 2);
    const zones = thaiSeedR2(
      { players: standings, ppc: Math.max(1, Math.floor(standings.length / numZones)) },
      pool.playerGender
    );

    if (pools.length > 1) {
      html += '<div class="thai-section-title">' + esc(pool.label) + '</div>';
    }

    for (const zone of zones) {
      html += '<div class="thai-zone-card">';
      html += '<div class="thai-zone-hdr ' + zone.key + '">';
      html += '<span>' + (zoneLabels[zone.key] || zone.key) + '</span>';
      html += '<span>' + zone.players.length + ' игр.</span>';
      html += '</div>';
      html += '<div class="thai-zone-players">';

      for (const p of zone.players) {
        const diff = p.diff || 0;
        const diffSign = diff > 0 ? '+' : '';
        html += '<div class="thai-zone-row">';
        html += '<span class="thai-zone-rank">' + (p.place || '-') + '</span>';
        html += '<span class="thai-zone-name">' + esc(p.name || '#' + p.idx) + '</span>';
        html += '<span class="thai-zone-stats">';
        html += '<span>' + (p.pts || 0) + ' pts</span>';
        html += '<span>' + diffSign + diff + ' diff</span>';
        html += '<span>' + (p.wins || 0) + 'W</span>';
        html += '</span></div>';
      }

      html += '</div></div>';
    }
  }

  // Store seeding in session for later use
  _session.r2Seeding = pools.map(pool => {
    const standings = _buildR1Standings(pool.ids);
    const numZones = _currentTournamentMeta().courts || Math.floor(standings.length / 2);
    const ppc = Math.max(1, Math.floor(standings.length / numZones));
    return { poolKey: pool.key, playerGender: pool.playerGender, zones: thaiSeedR2({ players: standings, ppc }, pool.playerGender) };
  });
  _saveSession();

  html += '<div style="display:flex;justify-content:center;margin-top:12px">' +
          '<button class="btn-primary" data-click="window._thaiStartR2Play()">▶ Играть R2</button>' +
          '</div>';
  container.innerHTML = html;
}

// ════════════════════════════════════════════════════════
// F1.8: R2 Play screen (reuse R1 layout + zone colors)
// ════════════════════════════════════════════════════════

/** Dispatcher for R2 panel. */
function _renderR2() {
  if (!_session) return;
  const mode = _session.r2Mode === 'play' ? 'play' : 'seed';
  if (mode === 'play') {
    if (!_session.r2Seeding) _renderR2Seed();
    _renderR2Play();
  } else {
    _renderR2Seed();
  }
}

/** Build map: player pool idx -> zoneKey */
function _buildR2ZoneMap(poolKey) {
  const map = {};
  const pools = _session?.r2Seeding || [];
  for (let pi = 0; pi < pools.length; pi++) {
    const pool = pools[pi];
    if (!pool || pool.poolKey !== poolKey) continue;
    const zones = pool.zones || [];
    for (let zi = 0; zi < zones.length; zi++) {
      const z = zones[zi];
      if (!z) continue;
      const key = z.key;
      const players = z.players || [];
      for (let pj = 0; pj < players.length; pj++) {
        const p = players[pj];
        if (!p) continue;
        if (p.idx == null) continue;
        map[p.idx] = key;
      }
    }
  }
  return map;
}

/** Render R2 courts for the active tour. F1.8 */
function _renderR2Play() {
  const container = document.getElementById('thai-r2-content');
  if (!container || !_session || !_session.schedule) return;

  if (!_session.r2Scores || !_session.r2Scores.length) {
    _session.r2Scores = _session.schedule.map(tour => tour.pairs.map(() => ({ own: null, opp: null })));
  }

  const tour = _session.schedule[_activeTour];
  if (!tour) {
    container.innerHTML = '';
    return;
  }

  const pairs = tour.pairs || [];
  const scoresTour = (_session.r2Scores && _session.r2Scores[_activeTour]) ? _session.r2Scores[_activeTour] : [];

  const isCurrent = (_session.r2CurrentTour != null ? _session.r2CurrentTour : 0) === _activeTour;
  // S7.5: Court-lock
  const jm = globalThis.judgeMode;

  const leftZone = _buildR2ZoneMap('left');
  const rightZone = _buildR2ZoneMap('right');
  const soloZone = _buildR2ZoneMap('solo');

  let html = '';
  html += '<div class="thai-r2-intro">🎮 Игры R2 · тур ' + (_activeTour + 1) + '</div>';
  html += '<div class="thai-court-grid">';

  html += pairs.map((pair, pi) => {
    const sc = scoresTour[pi] ? scoresTour[pi] : { own: null, opp: null };
    const own = sc.own != null ? sc.own : 0;
    const opp = sc.opp != null ? sc.opp : 0;
    const diff = own - opp;
    const pts = thaiCalcPoints(diff);
    const diffCls = diff > 0 ? ' pos' : diff < 0 ? ' neg' : '';
    const { left, right } = _pairNames(pair);

    let zoneKey = null;
    if (_isDualPoolMode()) {
      const zL = leftZone[pair[0]];
      const zR = rightZone[pair[1]];
      zoneKey = zL != null ? zL : (zR != null ? zR : 'hard');
    } else {
      const z = soloZone[pair[0]];
      zoneKey = z != null ? z : 'hard';
    }

    const r2Locked = jm?.active && jm.court !== pi;
    const r2BtnCls = r2Locked ? 'thai-sc-btn disabled' : 'thai-sc-btn';
    const r2Dis = r2Locked ? ' disabled' : '';
    const statusLabel = r2Locked ? '🔒' : isCurrent ? '🏐' : '⏳';

    return `<div class="thai-pair-card thai-r2-zone-${zoneKey}">
      <div class="thai-pair-hdr">
        <span>Корт ${pi + 1}</span>
        <span>${statusLabel}</span>
      </div>
      <div class="thai-pair-body">
        <div class="thai-pl-name left">${esc(left)}</div>
        <div class="thai-score-col">
          <button class="${r2BtnCls}" data-click="window._thaiR2Score(${pi},'own',-1)"${r2Dis}>−</button>
          <span class="thai-sc-val" id="thai-r2-own-${pi}">${own}</span>
          <button class="${r2BtnCls}" data-click="window._thaiR2Score(${pi},'own',1)"${r2Dis}>+</button>
          <span class="thai-sc-sep">:</span>
          <button class="${r2BtnCls}" data-click="window._thaiR2Score(${pi},'opp',-1)"${r2Dis}>−</button>
          <span class="thai-sc-val" id="thai-r2-opp-${pi}">${opp}</span>
          <button class="${r2BtnCls}" data-click="window._thaiR2Score(${pi},'opp',1)"${r2Dis}>+</button>
        </div>
        <div class="thai-pl-name right">${esc(right)}</div>
      </div>
      <div class="thai-badges-row">
        <span class="thai-badge thai-badge-diff${diffCls}">diff ${diff > 0 ? '+' : ''}${diff}</span>
        <span class="thai-badge thai-badge-pts">${pts} pts</span>
      </div>
    </div>`;
  }).join('');

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Build a plain-text Telegram report (template) from FINISHED screen data.
 * F1.11: Telegram-отчёт (шаблон + копирование в буфер)
 */
function _buildTelegramReport() {
  if (!_session) return '';

  const pools = _getActivePoolConfigs();
  const medals = ['🥇', '🥈', '🥉'];

  const lines = [];
  lines.push('🏆 Турнир завершён!');
  lines.push(_currentTournamentLine());
  lines.push('');

  for (const pool of pools) {
    const standings = _buildR1Standings(pool.ids);
    if (!standings.length) continue;

    lines.push(pool.label + ':');
    lines.push('');

    const podium = standings.slice(0, 3);
    for (let i = 0; i < podium.length; i++) {
      const p = podium[i];
      const diff = p.diff || 0;
      const diffSign = diff > 0 ? '+' : '';
      const kVal = p.K != null ? p.K.toFixed(2) : '-';
      lines.push(
        medals[i] + ' ' + p.name +
        ' — ' + (p.pts || 0) + ' pts' +
        ', diff ' + diffSign + diff +
        ', wins ' + (p.wins || 0) +
        ', K ' + kVal
      );
    }

    lines.push('');
    lines.push('Таблица:');
    for (let i = 0; i < standings.length; i++) {
      const s = standings[i];
      const diff = s.diff || 0;
      const diffSign = diff > 0 ? '+' : '';
      const kVal = s.K != null ? s.K.toFixed(2) : '-';
      const place = s.place || (i + 1);
      lines.push(
        place + '. ' + s.name +
        ' — ' + (s.pts || 0) + ' pts' +
        ', diff ' + diffSign + diff +
        ', wins ' + (s.wins || 0) +
        ', K ' + kVal
      );
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

// ════════════════════════════════════════════════════════
// F1.9: FINISHED screen
// ════════════════════════════════════════════════════════

/** Render the finished screen with final standings and podium. F1.9 */
function _renderFinished() {
  const container = document.getElementById('thai-finished-content');
  if (!container || !_session) return;

  const pools = _getActivePoolConfigs();
  let html = '';

  // Header
  html += '<div class="thai-finished-header">';
  html += '<div class="thai-finished-icon">🏆</div>';
  html += '<div class="thai-finished-title">Турнир завершён!</div>';
  html += '<div class="thai-finished-sub">' + esc(_currentTournamentLine()) + '</div>';
  html += '</div>';

  for (const pool of pools) {
    const standings = _buildR1Standings(pool.ids);
    if (!standings.length) continue;

    if (pools.length > 1) {
      html += '<div class="thai-section-title">' + esc(pool.label) + '</div>';
    }

    // Podium (top 3)
    const podium = standings.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const podiumCls = ['gold', 'silver', 'bronze'];

    html += '<div class="thai-podium">';
    for (let i = 0; i < podium.length; i++) {
      const p = podium[i];
      html += '<div class="thai-podium-card ' + podiumCls[i] + '">';
      html += '<div class="thai-podium-place">' + medals[i] + '</div>';
      html += '<div class="thai-podium-name">' + esc(p.name) + '</div>';
      html += '<div class="thai-podium-pts">' + (p.pts || 0) + ' pts · diff ' + (p.diff > 0 ? '+' : '') + (p.diff || 0) + '</div>';
      html += '</div>';
    }
    html += '</div>';

    // Full table
    html += '<div class="thai-final-table">';
    for (let i = 0; i < standings.length; i++) {
      const s = standings[i];
      const top3 = i < 3 ? ' top3' : '';
      const diff = s.diff || 0;
      html += '<div class="thai-final-row' + top3 + '">';
      html += '<span class="thai-final-rank">' + (s.place || (i + 1)) + '</span>';
      html += '<span class="thai-final-name">' + esc(s.name) + '</span>';
      html += '<span class="thai-final-stats">';
      html += '<span class="thai-final-stat"><span class="thai-final-stat-val">' + (s.pts || 0) + '</span><span class="thai-final-stat-lbl">pts</span></span>';
      html += '<span class="thai-final-stat"><span class="thai-final-stat-val">' + (diff > 0 ? '+' : '') + diff + '</span><span class="thai-final-stat-lbl">diff</span></span>';
      html += '<span class="thai-final-stat"><span class="thai-final-stat-val">' + (s.wins || 0) + '</span><span class="thai-final-stat-lbl">wins</span></span>';
      html += '<span class="thai-final-stat"><span class="thai-final-stat-val">' + (s.K != null ? s.K.toFixed(2) : '-') + '</span><span class="thai-final-stat-lbl">K</span></span>';
      html += '</span></div>';
    }
    html += '</div>';

    // F1.10: Nominations (based on R1 + R2)
    const r2Stats = _buildR2Standings(pool.ids);
    const nominations = thaiCalcNominations(standings, r2Stats);
    if (nominations && nominations.length) {
      html += '<div class="thai-nom-wrap">';
      html += '<div class="thai-nom-title">🏅 Номинации</div>';
      html += '<div class="thai-nom-grid">';

      for (let ni = 0; ni < nominations.length; ni++) {
        const nom = nominations[ni];
        const winner = nom && nom.winner ? nom.winner : null;
        const stat = nom && nom.stat ? nom.stat : null;

        const statLabel = stat && stat.label ? stat.label : '';
        let statValText = '-';
        if (stat && stat.value != null) {
          const v = Number(stat.value);
          if (stat.fmt === 'fixed2') statValText = v.toFixed(2);
          else if (stat.fmt === 'intSigned') statValText = (v > 0 ? '+' : '') + v;
          else statValText = String(v);
        }

        html += '<div class="thai-nom-card">';
        html += '  <div class="thai-nom-label">' + esc(nom.label || '') + '</div>';
        html += '  <div class="thai-nom-winner">' + esc(winner ? winner.name : '-') + '</div>';
        html += '  <div class="thai-nom-metric">' +
          (statLabel ? esc(statLabel) + ': ' : '') + esc(statValText) +
          '</div>';
        html += '</div>';
      }

      html += '</div>';
      html += '</div>';
    }
  }

  // F1.11: Telegram report template + copy button
  html += '<div class="thai-telegram-wrap">';
  html += '<div class="thai-section-title thai-telegram-title">Telegram-отчёт</div>';
  html += '<textarea id="thai-telegram-text" class="thai-telegram-textarea" readonly></textarea>';
  html += '<div class="thai-telegram-actions">';
  html += '  <button class="btn-secondary" data-click="window._thaiCopyTelegram()">📋 Скопировать в буфер</button>';
  html += '</div>';
  html += '</div>';

  // F3.1: Export buttons (JSON + CSV)
  html += '<div style="display:flex;gap:8px;justify-content:center;margin:16px 0">';
  html += '  <button class="btn-secondary" data-click="window._thaiExportJSON()">JSON</button>';
  html += '  <button class="btn-secondary" data-click="window._thaiExportCSV()">CSV</button>';
  html += '</div>';

  // S8.8: Finalize — send results to server
  const alreadyFinalized = _session.finalized;
  html += '<div style="display:flex;justify-content:center;margin:12px 0">';
  if (alreadyFinalized) {
    html += '<div style="color:var(--muted);font-size:.85em">✅ Результаты отправлены на сервер</div>';
  } else {
    html += '<button class="btn-primary" data-click="window._thaiFinalizeTournament()">📤 Отправить результаты</button>';
  }
  html += '</div>';

  container.innerHTML = html;

  const ta = document.getElementById('thai-telegram-text');
  if (ta) ta.value = _buildTelegramReport();
}

// Navigation actions
window._thaiShowCourts    = () => _showPanel('courts');
window._thaiShowStandings = () => _showPanel('standings');
window._thaiGoR2          = () => { _session.phase = 'r2'; _session.r2Mode = 'seed'; _session.r2CurrentTour = 0; _saveSession(); _showPanel('r2'); };
window._thaiFinish        = () => { _session.phase = 'finished'; _saveSession(); _thaiFinishTournament(); _showPanel('finished'); };

// F1.6: Score/Diff toggle on courts
window._thaiToggleScoreView = function() {
  _scoreView = _scoreView === 'score' ? 'diff' : 'score';
  const btn = document.getElementById('thai-scoreview-toggle');
  if (btn) btn.textContent = _scoreView === 'score' ? 'Счёт' : 'Diff';
  _renderCourts();
};

// F1.11: Copy Telegram report template
window._thaiCopyTelegram = async function() {
  const el = document.getElementById('thai-telegram-text');
  const text = el ? el.value : '';
  if (!text) {
    showToast('Telegram-отчёт пуст', 'warn');
    return;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('✅ Telegram-отчёт скопирован', 'success');
      return;
    }
  } catch (_) {}

  // Fallback: execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) showToast('✅ Telegram-отчёт скопирован', 'success');
    else showToast('⚠️ Не удалось скопировать. Скопируйте вручную.', 'warn');
  } catch (_) {
    showToast('❌ Не удалось скопировать Telegram-отчёт', 'error');
  }
};

// F3.1: Export JSON
window._thaiExportJSON = function() {
  if (!_session) return;
  const pools = _getActivePoolConfigs();

  const result = {
    format: 'Thai Mixed',
    mode: _mode,
    n: _n,
    courts: _currentTournamentMeta().courts,
    tours: _currentTournamentMeta().tours,
    seed: _seed,
    date: _sessionDate(),
    trnId: _session.id || _trnId,
    meta: _currentTournamentMeta(),
    pools: pools.map(p => ({
      label: p.shortLabel || p.label,
      gender: p.playerGender,
      standings: _buildR1Standings(p.ids),
    })),
  };
  const dateStr = result.date.replace(/-/g, '');
  exportToJSON(result, 'thai_' + dateStr + '_' + _mode + '.json');
};

// F3.1: Export CSV
window._thaiExportCSV = function() {
  if (!_session) return;
  const pools = _getActivePoolConfigs();

  const headers = ['Пул', 'Место', 'Имя', 'Очки', 'Разница', 'Победы', 'Коэф', 'Мячи', 'Лучший раунд', 'Сыграно'];
  const rows = [];
  for (const p of pools) {
    const standings = _buildR1Standings(p.ids);
    for (const s of standings) {
      rows.push([
        p.label, s.place ?? '', s.name ?? '', s.pts ?? 0, s.diff ?? 0,
        s.wins ?? 0, typeof s.K === 'number' ? s.K.toFixed(2) : '', s.balls ?? 0, s.bestRound ?? 0, s.rPlayed ?? 0,
      ]);
    }
  }
  const dateStr = _sessionDate().replace(/-/g, '');
  exportToCSV(headers, rows, 'thai_' + dateStr + '_' + _mode + '.csv');
};

// ── S8.8: Finalize — send results to server ─────────────────
window._thaiFinalizeTournament = async function() {
  if (!_session || _session.finalized) return;

  const pools = _getActivePoolConfigs();

  const results = [];
  for (const pool of pools) {
    const standings = _buildR1Standings(pool.ids);
    for (const s of standings) {
      if (!s.playerId && !s.name) continue;
      results.push({
        player_id: s.playerId || s.name,
        placement: s.place || 0,
        points: s.pts || 0,
        format: 'Thai Mixed',
        division: _mode,
      });
    }
  }

  if (!results.length) {
    showToast('Нет результатов для отправки', 'warn');
    return;
  }

  try {
    const api = globalThis.sharedApi;
    if (!api?.finalizeTournament) {
      showToast('API недоступен — результаты сохранены локально', 'warn');
      return;
    }
    const res = await api.finalizeTournament(_trnId, results);
    if (res?.ok) {
      _session.finalized = true;
      _saveSession();
      showToast('✅ Результаты отправлены на сервер', 'success');
      _renderFinished();
    } else {
      showToast('❌ ' + (res?.error || 'Ошибка отправки'), 'error');
    }
  } catch (err) {
    showToast('❌ Ошибка: ' + err.message, 'error');
  }
};

// F1.8: Start R2 play (after seeding)
window._thaiStartR2Play = function() {
  if (!_session) return;
  _session.r2Mode = 'play';
  _session.r2CurrentTour = 0;
  _activeTour = 0;
  _session.r2Scores = _session.schedule.map(tour => tour.pairs.map(() => ({ own: null, opp: null })));
  _saveSession();
  _renderTourTabs();
  _renderR2Play();
};

// F1.8: Handle R2 score +/−
window._thaiR2Score = function(pairIdx, side, delta) {
  if (!_session || !_session.r2Scores || !_session.r2Scores[_activeTour]) return;
  // S7.5: Court-lock guard
  const jm = globalThis.judgeMode;
  if (jm?.active && jm.court !== pairIdx) return;
  const sc = _session.r2Scores[_activeTour][pairIdx];
  if (!sc) return;
  const cur = sc[side] != null ? sc[side] : 0;
  sc[side] = Math.max(0, cur + delta);
  _saveSession();
  _renderR2Play();
};

function _thaiNextTour() {
  if (_session.currentTour + 1 < _session.schedule.length) {
    _session.currentTour++;
    _activeTour = _session.currentTour;
    _saveSession();
    _renderTourTabs();
    showToast(`▶ Тур ${_session.currentTour + 1} начат`, 'success');
  } else {
    _showPanel('standings');
  }
}

// ════════════════════════════════════════════════════════
// A1.4: Rating integration — update player stats on finish
// ════════════════════════════════════════════════════════
function _thaiFinishTournament() {
  if (!_session) return;
  // Build standings from session scores (delegated to thai-format.js)
  // FORMAT will fill in full standings computation; this is the rating hook.
  const db = loadPlayerDB();
  // A1.4: Update player tournament count (minimal — full rating via thaiCalcStandings later)
  // This is the hook: FORMAT writes the actual score data, we read it here.
  const today = new Date().toISOString().split('T')[0];
  // Persist tournament to localStorage tournament list for home screen (A1.5)
  _persistTournamentRecord(today);
  // Async server sync (A1.3)
  if (typeof syncTournamentAsync === 'function') {
    const meta = _currentTournamentMeta();
    syncTournamentAsync({ id: _trnId, format: 'Thai Mixed', mode: meta.mode, n: meta.n,
                          courts: meta.courts, tours: meta.tours, seed: _seed, date: today, status: 'finished',
                          meta,
                          schedule: _session.schedule });
  }
  showToast('🏆 Турнир завершён!', 'success');
}

/** A1.5: Save a record to kotc3_tournaments so it appears on the home screen. */
function _persistTournamentRecord(date) {
  try {
    const arr = JSON.parse(localStorage.getItem('kotc3_tournaments') || '[]');
    const existing = arr.findIndex(t => t.id === _trnId);
    const modeLabel = _getModeLabel();
    const record = {
      id: _trnId,
      name: `Thai Mixed (${modeLabel}, ${_n} игр.)`,
      format: 'Thai Mixed',
      division: modeLabel,
      date,
      status: 'finished',
      level: 'medium',
      capacity: _isDualPoolMode() ? _n * 2 : _n,
      participants: [],
      waitlist: [],
      winners: [],
      thaiMeta: { mode: _currentTournamentMeta().mode, n: _currentTournamentMeta().n, courts: _currentTournamentMeta().courts, tours: _currentTournamentMeta().tours, seed: _seed },
    };
    if (existing >= 0) arr[existing] = record;
    else arr.push(record);
    localStorage.setItem('kotc3_tournaments', JSON.stringify(arr));
  } catch (_) {}
}

// ════════════════════════════════════════════════════════
// Entry point: start session from roster panel
// ════════════════════════════════════════════════════════
window.thaiStartSession = function() {
  // Require roster selection before switching to R1.
  const sel = globalThis._thaiRosterGetSelection?.();
  const required = _getRequiredRosterCounts();
  if (!sel || sel.menIds.length !== required.needM || sel.womenIds.length !== required.needW) {
    showToast('❌ Выберите полный ростер игроков перед стартом', 'error');
    return;
  }
  // Persist chosen player ids into session for later courts/table rendering.
  _session.playersM = sel.menIds;
  _session.playersW = sel.womenIds;
  // Initialize null scores to 0 for fresh start
  _session.scores = _session.schedule.map(tour =>
    tour.pairs.map(() => ({ own: 0, opp: 0 }))
  );
  _session.phase = 'r1';
  _activeTour = 0;
  _saveSession();
  _renderTourTabs();
  _showPanel('courts');
  showToast('▶ R1 начат!', 'success');
};

// ════════════════════════════════════════════════════════
// A1.1: Bootstrap
// ════════════════════════════════════════════════════════
(async function boot() {
  _installInlineEventBridge();

  const hasExplicitThaiGridParams =
    _params.has('mode') &&
    _params.has('n') &&
    _params.has('courts') &&
    _params.has('tours');
  if (_trnId && !/^thai_/i.test(_trnId) && !hasExplicitThaiGridParams) {
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(5000)
          : undefined;
      const res = await fetch(
        `/api/sudyam/bootstrap?tournamentId=${encodeURIComponent(_trnId)}&format=thai`,
        { cache: 'no-store', credentials: 'include', signal }
      );
      if (!res.ok) {
        showToast('Не удалось загрузить настройки турнира', 'error');
        return;
      }
      const data = await res.json().catch(() => null);
      const judgeParams = data?.thaiJudgeParams;
      if (!judgeParams || typeof judgeParams !== 'object') {
        showToast('Не удалось загрузить настройки турнира', 'error');
        return;
      }
      const nextMode = String(judgeParams.mode || '').trim().toUpperCase();
      if (['MF', 'MN', 'MM', 'WW'].includes(nextMode)) _mode = nextMode;

      const nextN = Number(judgeParams.n);
      if (Number.isInteger(nextN) && nextN >= 4 && nextN % 2 === 0) _n = nextN;

      const nextCourts = Number(judgeParams.courts);
      if (Number.isInteger(nextCourts) && nextCourts >= 1) _courts = nextCourts;

      const nextTours = Number(judgeParams.tours);
      if (Number.isInteger(nextTours) && nextTours >= 1) _tours = nextTours;

      console.warn('[Thai Boot] Auto-corrected params from API:', judgeParams);
      if (Array.isArray(data?.bootstrapState?.participants)) {
        _bootstrapParticipants = data.bootstrapState.participants;
      }
    } catch (err) {
      console.error('[Thai Boot] Settings fetch failed:', err);
      showToast('Ошибка загрузки настроек турнира', 'error');
      return;
    }
  }

  _initSession();
  const initialSelection = await _resolveInitialRosterSelection();

  // Mount roster selection panel (F0.3).
  initThaiRosterPanel({
    containerId: 'thai-roster-panel',
    mode: _mode,
    n: _n,
    loadPlayerDB,
    showToast,
    schedule: _session?.schedule,
    initialMenIds: initialSelection?.menIds,
    initialWomenIds: initialSelection?.womenIds,
  });
  if (initialSelection?.source === 'admin' || initialSelection?.source === 'local') {
    showToast('📋 Ростер предзаполнен из сохранённой расстановки', 'success');
  }

  // Update nav title & info bar
  const modeLabel = _getModeLabel();
  document.getElementById('thai-nav-title').textContent = `🌴 Тай (${modeLabel}, ${_n})`;
  document.getElementById('thai-mode-badge').textContent = _mode;
  document.getElementById('thai-mode-badge').classList.add(_mode);
  document.getElementById('thai-info-text').textContent =
    `Режим: ${_currentTournamentLine()}`;

  // S6.3: replace static onclick= handlers with CSP-safe addEventListener.
  document.getElementById('fmt-nav-back')?.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = '../../index.html';
  });

  document.getElementById('thai-start-session')?.addEventListener('click', () => {
    window.thaiStartSession?.();
  });

  document.getElementById('thai-scoreview-toggle')?.addEventListener('click', () => {
    window._thaiToggleScoreView?.();
  });

  // Restore phase
  const phase = _session?.phase || 'roster';
  if (phase === 'roster')   { _showPanel('roster'); _renderActionBar(); }
  else if (phase === 'r1')  { _showPanel('courts'); _renderTourTabs(); }
  else if (phase === 'r2')  { _showPanel('r2'); }
  else                      { _showPanel('finished'); }

  // Log schedule to console for FORMAT agent inspection
  console.info('[Thai] Schedule generated:', _session.schedule);
  console.info('[Thai] Validation:', thaiValidateSchedule(_session.schedule));
})();
