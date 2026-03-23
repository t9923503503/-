// ── A1.1: Import shared modules ───────────────────────
import { esc, showToast, formatRuDate } from '../../shared/utils.js';
import { loadPlayerDB, searchPlayers, getPlayerById } from '../../shared/players.js';
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
const _params = new URLSearchParams(location.search);
const _mode   = (['MF','MM','WW'].includes(_params.get('mode')) ? _params.get('mode') : 'MF');
const _n      = ([8, 10].includes(Number(_params.get('n'))) ? Number(_params.get('n')) : 8);
const _seed   = parseInt(_params.get('seed') || '1', 10) || 1;
const _trnId  = _params.get('trnId') || ('thai_' + _mode + '_' + _n + '_' + _seed);

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

function _loadSession() {
  try {
    const raw = localStorage.getItem(_STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function _saveSession() {
  try {
    if (_session) localStorage.setItem(_STORE_KEY, JSON.stringify(_session));
  } catch (_) {}
}

// ════════════════════════════════════════════════════════
// A1.1: Generate / restore schedule
// ════════════════════════════════════════════════════════
function _initSession() {
  const saved = _loadSession();
  if (saved && saved.mode === _mode && saved.n === _n && saved.seed === _seed) {
    _session = saved;
    return;
  }
  // Generate new schedule
  const schedule = thaiGenerateSchedule({ mode: _mode, men: _n, women: _n, seed: _seed });
  const validation = thaiValidateSchedule(schedule);
  if (!validation.valid) {
    console.error('[Thai] Schedule validation failed:', validation.errors);
  }
  _session = {
    id: _trnId,
    mode: _mode,
    n: _n,
    seed: _seed,
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
      onclick="window._thaiGoTour(${i})">Тур ${i + 1}</button>`;
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
    : (_mode === 'MF' ? (_session?.playersW || []) : (_session?.playersM || []));
  const id = ids[idx];
  if (!id) return `#${idx}`;
  const p = getPlayerById(id);
  return p?.name || id;
}

/** Get pair names for a match. */
function _pairNames(pair) {
  if (_mode === 'MF') {
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

  if (_mode === 'MF') {
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
      parts.push(`<span class="thai-rest-badge thai-rest-women">😴 Ж: <span class="thai-rest-strong">${s}</span></span>`);
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
          <button class="${btnCls}" onclick="window._thaiScore(${pi},'own',-1)"${disabled}>−</button>
          <span class="thai-sc-val" id="thai-own-${pi}">${own}</span>
          <button class="${btnCls}" onclick="window._thaiScore(${pi},'own',1)"${disabled}>+</button>
          <span class="thai-sc-sep">:</span>
          <button class="${btnCls}" onclick="window._thaiScore(${pi},'opp',-1)"${disabled}>−</button>
          <span class="thai-sc-val" id="thai-opp-${pi}">${opp}</span>
          <button class="${btnCls}" onclick="window._thaiScore(${pi},'opp',1)"${disabled}>+</button>
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
    };
  }

  function resolveNameFromIds(ids, idx) {
    const id = ids ? ids[idx] : null;
    const p = id != null ? getPlayerById(id) : null;
    return p ? p.name : (id != null ? id : ('#' + idx));
  }

  function renderTableForIds(ids, ownScores, oppScores) {
    const standings = thaiCalcStandings({ ownScores, oppScores });
    const rows = standings.map((s, i) => ({
      rank: s.place != null ? s.place : (i + 1),
      name: resolveNameFromIds(ids, s.idx),
      games: s.rPlayed != null ? s.rPlayed : 0,
      wins: s.wins != null ? s.wins : 0,
      diff: s.diff != null ? s.diff : 0,
      pts: s.pts != null ? s.pts : 0,
      K: s.K != null ? s.K : 0,
    }));
    return CrossTable.render({ columns, rows, highlights });
  }

  if (_mode === 'MF') {
    const menIds = _session.playersM || [];
    const womenIds = _session.playersW || [];
    if (!menIds.length && !womenIds.length) return;

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
        }
        if (womenArr.ownScores[wi]) {
          // For women perspective: own=right score (oppVal), opponent=left score (ownVal)
          womenArr.ownScores[wi][t] = oppVal;
          womenArr.oppScores[wi][t] = ownVal;
        }
      }
    }

    const menTable = renderTableForIds(menIds, menArr.ownScores, menArr.oppScores);
    const womenTable = renderTableForIds(womenIds, womenArr.ownScores, womenArr.oppScores);

    content.innerHTML =
      `<div>${menTable}</div><div style="margin-top:12px">${womenTable}</div>`;
  } else {
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
        }
        if (arr.ownScores[b]) {
          // For the right player: own=right score (oppVal), opponent=left score (ownVal)
          arr.ownScores[b][t] = oppVal;
          arr.oppScores[b][t] = ownVal;
        }
      }
    }

    content.innerHTML = renderTableForIds(ids, arr.ownScores, arr.oppScores);
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
    bar.innerHTML = `<button class="btn-primary" onclick="thaiStartSession()">▶ Начать турнир</button>`;
  } else if (_activePanel === 'courts') {
    const canAdvance = _canAdvanceTour();
    const disabledAttr = canAdvance ? '' : ' disabled style="opacity:.45;pointer-events:none;flex:2"';
    const enabledStyle = canAdvance ? ' style="flex:2"' : '';
    bar.style.display = 'flex';
    bar.innerHTML = `
      <button class="btn-secondary" style="flex:1" onclick="_thaiShowStandings()">📊 Таблица</button>
      <button class="btn-primary"${canAdvance ? enabledStyle : disabledAttr} onclick="_thaiNextTour()">▶ Следующий тур</button>`;
  } else if (_activePanel === 'standings') {
    bar.style.display = 'flex';
    bar.innerHTML = `
      <button class="btn-secondary" style="flex:1" onclick="_thaiShowCourts()">← Назад</button>
      <button class="btn-primary" style="flex:2" onclick="_thaiGoR2()">🎯 Посев R2</button>`;
  } else if (_activePanel === 'r2') {
    bar.style.display = 'flex';
    bar.innerHTML = `<button class="btn-primary" onclick="_thaiFinish()">🏆 Завершить</button>`;
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
  // Build ownScores[playerIdx][tourIdx] and oppScores[playerIdx][tourIdx]
  const ownScores = Array.from({ length: n }, () => []);
  const oppScores = Array.from({ length: n }, () => []);

  for (let ti = 0; ti < schedule.length; ti++) {
    const tour = schedule[ti];
    const tourScores = scores[ti] || [];
    // Track which player indices participated this tour
    const participated = new Set();

    for (let pi = 0; pi < (tour.pairs || []).length; pi++) {
      const pair = tour.pairs[pi];
      const sc = tourScores[pi] || { own: 0, opp: 0 };
      const leftIdx = pair[0];
      const rightIdx = pair[1];

      if (_mode === 'MF') {
        // For MF, this function is called separately for men and women
        // leftIdx is in men pool, rightIdx is in women pool
        // We need to know which pool we're building for
        if (n === (_session.playersM || []).length && playerIds === _session.playersM) {
          // Men pool: left side of each pair
          ownScores[leftIdx].push(sc.own != null ? sc.own : 0);
          oppScores[leftIdx].push(sc.opp != null ? sc.opp : 0);
          participated.add(leftIdx);
        } else {
          // Women pool: right side of each pair
          ownScores[rightIdx].push(sc.opp != null ? sc.opp : 0);
          oppScores[rightIdx].push(sc.own != null ? sc.own : 0);
          participated.add(rightIdx);
        }
      } else {
        // MM/WW: both indices in same pool
        ownScores[leftIdx].push(sc.own != null ? sc.own : 0);
        oppScores[leftIdx].push(sc.opp != null ? sc.opp : 0);
        ownScores[rightIdx].push(sc.opp != null ? sc.opp : 0);
        oppScores[rightIdx].push(sc.own != null ? sc.own : 0);
        participated.add(leftIdx);
        participated.add(rightIdx);
      }
    }
  }

  const standings = thaiCalcStandings({ ownScores, oppScores });
  // Attach player names
  standings.forEach(s => {
    const id = playerIds[s.idx];
    const p = id ? getPlayerById(id) : null;
    s.name = (p != null ? p.name : null) || id || ('#' + s.idx);
    s.playerId = id;
  });
  return standings;
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

  for (let ti = 0; ti < schedule.length; ti++) {
    const tour = schedule[ti];
    const tourScores = scores[ti] || [];

    for (let pi = 0; pi < (tour.pairs || []).length; pi++) {
      const pair = tour.pairs[pi];
      const sc = tourScores[pi] || { own: 0, opp: 0 };
      const leftIdx = pair[0];
      const rightIdx = pair[1];

      if (_mode === 'MF') {
        // Men pool: left-side (pair[0]) is "own"
        // Women pool: right-side (pair[1]) is "own"
        if (n === (_session.playersM || []).length && playerIds === _session.playersM) {
          ownScores[leftIdx].push(sc.own != null ? sc.own : 0);
          oppScores[leftIdx].push(sc.opp != null ? sc.opp : 0);
        } else {
          ownScores[rightIdx].push(sc.opp != null ? sc.opp : 0);
          oppScores[rightIdx].push(sc.own != null ? sc.own : 0);
        }
      } else {
        ownScores[leftIdx].push(sc.own != null ? sc.own : 0);
        oppScores[leftIdx].push(sc.opp != null ? sc.opp : 0);
        ownScores[rightIdx].push(sc.opp != null ? sc.opp : 0);
        oppScores[rightIdx].push(sc.own != null ? sc.own : 0);
      }
    }
  }

  const standings = thaiCalcStandings({ ownScores, oppScores });
  standings.forEach(s => {
    const id = playerIds[s.idx];
    const p = id ? getPlayerById(id) : null;
    s.name = (p != null ? p.name : null) || id || ('#' + s.idx);
    s.playerId = id;
  });
  return standings;
}

/** Render R2 seeding zones. F1.7 */
function _renderR2Seed() {
  const container = document.getElementById('thai-r2-content');
  if (!container || !_session) return;

  // Build R1 standings
  const pools = [];
  if (_mode === 'MF' || _mode === 'MM') {
    pools.push({ label: _mode === 'MF' ? '♂ Мужчины' : '♂ Игроки', ids: _session.playersM || [], gender: 'M' });
  }
  if (_mode === 'MF' || _mode === 'WW') {
    pools.push({ label: _mode === 'MF' ? '♀ Женщины' : '♀ Игроки', ids: _session.playersW || [], gender: 'W' });
  }

  const zoneLabels = { hard: '🔴 Hard', advance: '🟠 Advance', medium: '🔵 Medium', lite: '🟢 Lite' };
  let html = '<div class="thai-r2-intro">🎯 Посев R2 — по итогам R1</div>';

  for (const pool of pools) {
    const standings = _buildR1Standings(pool.ids);
    const zones = thaiSeedR2({ players: standings, ppc: Math.max(1, Math.floor(standings.length / 4)) }, pool.gender);

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
    return { gender: pool.gender, zones: thaiSeedR2({ players: standings }, pool.gender) };
  });
  _saveSession();

  html += '<div style="display:flex;justify-content:center;margin-top:12px">' +
          '<button class="btn-primary" onclick="window._thaiStartR2Play()">▶ Играть R2</button>' +
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
function _buildR2ZoneMap(gender) {
  const map = {};
  const pools = _session?.r2Seeding || [];
  for (let pi = 0; pi < pools.length; pi++) {
    const pool = pools[pi];
    if (!pool || pool.gender !== gender) continue;
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

  const menZone = _buildR2ZoneMap('M');
  const womenZone = _buildR2ZoneMap('W');
  const poolZone = (_mode === 'MM') ? menZone : womenZone;

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
    if (_mode === 'MF') {
      const zL = menZone[pair[0]];
      const zR = womenZone[pair[1]];
      zoneKey = zL != null ? zL : (zR != null ? zR : 'hard');
    } else {
      const z = poolZone[pair[0]];
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
          <button class="${r2BtnCls}" onclick="window._thaiR2Score(${pi},'own',-1)"${r2Dis}>−</button>
          <span class="thai-sc-val" id="thai-r2-own-${pi}">${own}</span>
          <button class="${r2BtnCls}" onclick="window._thaiR2Score(${pi},'own',1)"${r2Dis}>+</button>
          <span class="thai-sc-sep">:</span>
          <button class="${r2BtnCls}" onclick="window._thaiR2Score(${pi},'opp',-1)"${r2Dis}>−</button>
          <span class="thai-sc-val" id="thai-r2-opp-${pi}">${opp}</span>
          <button class="${r2BtnCls}" onclick="window._thaiR2Score(${pi},'opp',1)"${r2Dis}>+</button>
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

  const pools = [];
  if (_mode === 'MF' || _mode === 'MM') {
    pools.push({ label: _mode === 'MF' ? '♂ Мужчины' : '♂ Игроки', ids: _session.playersM || [] });
  }
  if (_mode === 'MF' || _mode === 'WW') {
    pools.push({ label: _mode === 'MF' ? '♀ Женщины' : '♀ Игроки', ids: _session.playersW || [] });
  }

  const modeLabel = { MF: 'Микст М/Ж', MM: 'Мужской', WW: 'Женский' }[_mode] || _mode;
  const medals = ['🥇', '🥈', '🥉'];

  const lines = [];
  lines.push('🏆 Турнир завершён!');
  lines.push(modeLabel + ' · ' + _n + ' игр. · seed ' + _seed);
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

  const pools = [];
  if (_mode === 'MF' || _mode === 'MM') {
    pools.push({ label: _mode === 'MF' ? '♂ Мужчины' : '♂ Игроки', ids: _session.playersM || [], gender: 'M' });
  }
  if (_mode === 'MF' || _mode === 'WW') {
    pools.push({ label: _mode === 'MF' ? '♀ Женщины' : '♀ Игроки', ids: _session.playersW || [], gender: 'W' });
  }

  const modeLabel = { MF: 'Микст М/Ж', MM: 'Мужской', WW: 'Женский' }[_mode] || _mode;
  let html = '';

  // Header
  html += '<div class="thai-finished-header">';
  html += '<div class="thai-finished-icon">🏆</div>';
  html += '<div class="thai-finished-title">Турнир завершён!</div>';
  html += '<div class="thai-finished-sub">' + esc(modeLabel) + ' · ' + _n + ' игр. · seed ' + _seed + '</div>';
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
  html += '  <button class="btn-secondary" onclick="window._thaiCopyTelegram()">📋 Скопировать в буфер</button>';
  html += '</div>';
  html += '</div>';

  // F3.1: Export buttons (JSON + CSV)
  html += '<div style="display:flex;gap:8px;justify-content:center;margin:16px 0">';
  html += '  <button class="btn-secondary" onclick="window._thaiExportJSON()">JSON</button>';
  html += '  <button class="btn-secondary" onclick="window._thaiExportCSV()">CSV</button>';
  html += '</div>';

  // S8.8: Finalize — send results to server
  const alreadyFinalized = _session.finalized;
  html += '<div style="display:flex;justify-content:center;margin:12px 0">';
  if (alreadyFinalized) {
    html += '<div style="color:var(--muted);font-size:.85em">✅ Результаты отправлены на сервер</div>';
  } else {
    html += '<button class="btn-primary" onclick="window._thaiFinalizeTournament()">📤 Отправить результаты</button>';
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
  const pools = [];
  if (_mode === 'MF' || _mode === 'MM') pools.push({ label: 'Мужчины', ids: _session.playersM || [], gender: 'M' });
  if (_mode === 'MF' || _mode === 'WW') pools.push({ label: 'Женщины', ids: _session.playersW || [], gender: 'W' });

  const result = {
    format: 'Thai Mixed',
    mode: _mode,
    n: _n,
    seed: _seed,
    date: _session.meta?.date || new Date().toISOString().slice(0, 10),
    trnId: _session.trnId,
    pools: pools.map(p => ({
      label: p.label,
      gender: p.gender,
      standings: _buildR1Standings(p.ids),
    })),
  };
  const dateStr = result.date.replace(/-/g, '');
  exportToJSON(result, 'thai_' + dateStr + '_' + _mode + '.json');
};

// F3.1: Export CSV
window._thaiExportCSV = function() {
  if (!_session) return;
  const pools = [];
  if (_mode === 'MF' || _mode === 'MM') pools.push({ label: 'Мужчины', ids: _session.playersM || [], gender: 'M' });
  if (_mode === 'MF' || _mode === 'WW') pools.push({ label: 'Женщины', ids: _session.playersW || [], gender: 'W' });

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
  const dateStr = (_session.meta?.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  exportToCSV(headers, rows, 'thai_' + dateStr + '_' + _mode + '.csv');
};

// ── S8.8: Finalize — send results to server ─────────────────
window._thaiFinalizeTournament = async function() {
  if (!_session || _session.finalized) return;

  const pools = [];
  if (_mode === 'MF' || _mode === 'MM') pools.push({ ids: _session.playersM || [], gender: 'M' });
  if (_mode === 'MF' || _mode === 'WW') pools.push({ ids: _session.playersW || [], gender: 'W' });

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
    syncTournamentAsync({ id: _trnId, format: 'Thai Mixed', mode: _mode, n: _n,
                          seed: _seed, date: today, status: 'finished',
                          schedule: _session.schedule });
  }
  showToast('🏆 Турнир завершён!', 'success');
}

/** A1.5: Save a record to kotc3_tournaments so it appears on the home screen. */
function _persistTournamentRecord(date) {
  try {
    const arr = JSON.parse(localStorage.getItem('kotc3_tournaments') || '[]');
    const existing = arr.findIndex(t => t.id === _trnId);
    const modeLabel = { MF: 'Микст', MM: 'Мужской', WW: 'Женский' }[_mode] || _mode;
    const record = {
      id: _trnId,
      name: `Thai Mixed (${modeLabel}, ${_n} игр.)`,
      format: 'Thai Mixed',
      division: modeLabel,
      date,
      status: 'finished',
      level: 'medium',
      capacity: _mode === 'MF' ? _n * 2 : _n,
      participants: [],
      waitlist: [],
      winners: [],
      thaiMeta: { mode: _mode, n: _n, seed: _seed },
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
  const required = { needM: _mode === 'MM' ? _n : _mode === 'MF' ? _n : 0, needW: _mode === 'WW' ? _n : _mode === 'MF' ? _n : 0 };
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
(function boot() {
  _initSession();

  // Mount roster selection panel (F0.3).
  initThaiRosterPanel({
    containerId: 'thai-roster-panel',
    mode: _mode,
    n: _n,
    loadPlayerDB,
    showToast,
    schedule: _session?.schedule,
  });

  // Update nav title & info bar
  const modeLabel = { MF: 'Микст М/Ж', MM: 'Мужской', WW: 'Женский' }[_mode] || _mode;
  document.getElementById('thai-nav-title').textContent = `🌴 Тай (${modeLabel}, ${_n})`;
  document.getElementById('thai-mode-badge').textContent = _mode;
  document.getElementById('thai-mode-badge').classList.add(_mode);
  document.getElementById('thai-info-text').textContent =
    `Режим: ${modeLabel} · ${_n} игр. · seed ${_seed}`;

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
