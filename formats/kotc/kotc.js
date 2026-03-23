'use strict';

/**
 * KOTC (King of the Court) — standalone format module.
 * Follows Thai format architecture: module imports + session lifecycle + panel rendering.
 */

// ── Shared module imports ──────────────────────────────────
import { esc, showToast, formatRuDate } from '../../shared/utils.js';
import { loadPlayerDB, searchPlayers, getPlayerById } from '../../shared/players.js';
import { createTimer, formatTime, timerSnapshot, startTimer, pauseTimer, resetTimer } from '../../shared/timer.js';
import { StandingsTable, injectTableCSS } from '../../shared/table.js';
import { injectUiKitCSS } from '../../shared/ui-kit.js';
import { syncTournamentAsync } from '../../shared/api.js';
import { exportToJSON, exportToCSV } from '../../shared/export-utils.js';
import { initI18n, t } from '../../shared/i18n.js';

function tr(key, params) {
  return typeof t === 'function' ? t(key, params) : key;
}

// ── KOTC format math ───────────────────────────────────────
import {
  COURT_META, DIV_KEYS, POINTS_TABLE,
  kotcPartnerW, kotcPartnerM,
  kotcDivPartnerW, kotcDivPartnerM,
  kotcMatchupsR1, kotcOppIdxR1,
  kotcManRounds, kotcWomanRounds,
  kotcRankCourt, kotcRankAll,
  kotcRankDivision, kotcSeedDivisions, kotcSeedAll,
  kotcActiveDivKeys,
  kotcMakeBlankScores, kotcMakeBlankDivScores, kotcMakeBlankDivRoster,
  thaiCalcPoints,
} from './kotc-format.js';

// Inject shared CSS
injectTableCSS();
injectUiKitCSS();

// Restore theme
(function restoreTheme() {
  const solar = localStorage.getItem('kotc3_solar') === '1';
  document.body.classList.toggle('solar', solar);
})();

// ── S6.3: Back button (replaced inline onclick) ─────────────
document.getElementById('kotc-back-btn')?.addEventListener('click', () => {
  history.length > 1 ? history.back() : (location.href = '../../index.html');
});

// ════════════════════════════════════════════════════════════
// URL params → session config
// ════════════════════════════════════════════════════════════
const _params = new URLSearchParams(location.search);
const _nc     = [1, 2, 3, 4].includes(Number(_params.get('nc'))) ? Number(_params.get('nc')) : 4;
const _ppc    = 4; // always 4 for KOTC
const _trnId  = _params.get('trnId') || ('kotc_' + _nc + '_' + Date.now());

const _STORE_KEY = 'kotc3_kotc_session_' + _trnId;

// ════════════════════════════════════════════════════════════
// Session state
// ════════════════════════════════════════════════════════════
let _session = null;
let _activePanel = 'roster';
let _activeCourt = 0;    // Stage 1: which court is displayed
let _activeDiv   = 'hard'; // Stage 2: which division

function _loadSession() {
  try {
    const raw = localStorage.getItem(_STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function _saveSession() {
  try {
    if (_session) {
      _session.savedAt = Date.now();
      localStorage.setItem(_STORE_KEY, JSON.stringify(_session));
      syncTournamentAsync(_session);
    }
  } catch (_) {}
}

function _createSession(courts) {
  return {
    version: '2.0',
    trnId: _trnId,
    nc: _nc,
    ppc: _ppc,
    fixedPairs: false,
    phase: 'roster',
    courts: courts || Array.from({ length: _nc }, () => ({ men: [], women: [] })),
    scores: kotcMakeBlankScores(_ppc, _nc),
    courtRound: Array(_nc).fill(0),
    divRoster: kotcMakeBlankDivRoster(),
    divScores: kotcMakeBlankDivScores(),
    divRoundState: { hard: 0, advance: 0, medium: 0, lite: 0 },
    meta: { name: 'KOTC', date: new Date().toISOString().slice(0, 10) },
    savedAt: Date.now(),
  };
}

// ════════════════════════════════════════════════════════════
// Audio timer (Web Audio synthesis)
// ════════════════════════════════════════════════════════════
let _audioCtx = null;
function _ensureAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

function _playBeep(freq = 880, duration = 0.3) {
  try {
    const ctx = _ensureAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function _playWarning() { _playBeep(660, 0.2); setTimeout(() => _playBeep(660, 0.2), 300); }
function _playEnd() { _playBeep(880, 0.15); setTimeout(() => _playBeep(1100, 0.15), 200); setTimeout(() => _playBeep(880, 0.3), 400); }

// ════════════════════════════════════════════════════════════
// Panel switching
// ════════════════════════════════════════════════════════════
function _showPanel(name) {
  _activePanel = name;
  document.querySelectorAll('.kotc-panel').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('kotc-' + name + '-panel');
  if (el) el.classList.add('active');

  // Show/hide sub-tabs
  const courtTabsWrap = document.getElementById('kotc-court-tabs-wrap');
  const divTabsWrap = document.getElementById('kotc-div-tabs-wrap');
  if (courtTabsWrap) courtTabsWrap.style.display = name === 'courts' ? '' : 'none';
  if (divTabsWrap) divTabsWrap.style.display = name === 'divisions' ? '' : 'none';

  _updateInfoBar();
  _updateActionBar();
}

function _updateInfoBar() {
  const infoText = document.getElementById('kotc-info-text');
  const badge = document.getElementById('kotc-phase-badge');
  if (!infoText || !badge) return;

  const phase = _session?.phase || 'roster';
  const nc = _session?.nc || _nc;
  infoText.textContent = tr('kotcFmt.infoLine', { nc, ppc: _ppc });

  badge.className = 'session-info-badge';
  if (phase === 'stage1') { badge.textContent = tr('kotcFmt.badgeStage1'); badge.classList.add('stage1'); }
  else if (phase === 'divisions') { badge.textContent = tr('kotcFmt.badgeDivisions'); badge.classList.add('divs'); }
  else if (phase === 'finished') { badge.textContent = tr('kotcFmt.badgeDone'); badge.classList.add('done'); }
  else { badge.textContent = tr('kotcFmt.badgeRoster'); }
}

function _updateActionBar() {
  const bar = document.getElementById('kotc-action-bar');
  if (!bar) return;

  const phase = _session?.phase || 'roster';
  let html = '';

  if (phase === 'roster') {
    html = `<button class="btn-primary" onclick="window._kotcStartStage1()">${tr('kotcFmt.startStage1')}</button>`;
  } else if (phase === 'stage1') {
    html = `
      <button class="btn-secondary" onclick="window._kotcShowStandings()">${tr('kotcFmt.standings')}</button>
      <button class="btn-primary" onclick="window._kotcStartDivisions()">${tr('kotcFmt.toDivisions')}</button>`;
  } else if (phase === 'divisions') {
    html = `
      <button class="btn-secondary" onclick="window._kotcShowStandings()">${tr('kotcFmt.standings')}</button>
      <button class="btn-primary" onclick="window._kotcFinish()">${tr('kotcFmt.finish')}</button>`;
  }

  bar.innerHTML = html;
  bar.style.display = html ? '' : 'none';
}

// ════════════════════════════════════════════════════════════
// ROSTER PANEL
// ════════════════════════════════════════════════════════════
let _rosterSearch = '';
let _rosterSelectedCourt = 0;
let _rosterGender = 'M';

function _renderRoster() {
  const content = document.getElementById('kotc-roster-content');
  if (!content || !_session) return;

  const courts = _session.courts;
  let html = '';

  // Court cards showing assigned players
  html += '<div class="kotc-roster-grid">';
  for (let ci = 0; ci < _session.nc; ci++) {
    const meta = COURT_META[ci];
    html += `<div class="kotc-roster-court" data-ci="${ci}" onclick="window._kotcSelectCourt(${ci})">`;
    html += `<div class="kotc-roster-court-hdr${_rosterSelectedCourt === ci ? ' style="background:rgba(255,215,0,.12)"' : ''}">`;
    html += `<span class="dot" style="background:${meta.color}"></span>${esc(meta.name)}`;
    html += `<span style="font-size:.78em;opacity:.6">${tr('kotcFmt.courtMwCounts', { m: courts[ci].men.length, w: courts[ci].women.length })}</span>`;
    html += '</div>';
    html += '<div class="kotc-roster-slots">';
    // Men
    for (let i = 0; i < _ppc; i++) {
      const name = courts[ci].men[i];
      html += `<div class="kotc-roster-slot">`;
      html += `<span class="gender-icon">🏋️</span>`;
      if (name) {
        html += `<span>${esc(name)}</span>`;
        html += `<button style="margin-left:auto;font-size:.7em;opacity:.5;cursor:pointer;border:none;background:none;color:inherit" onclick="event.stopPropagation();window._kotcRemovePlayer(${ci},'M',${i})">✕</button>`;
      } else {
        html += `<span class="empty">—</span>`;
      }
      html += '</div>';
    }
    // Women
    for (let i = 0; i < _ppc; i++) {
      const name = courts[ci].women[i];
      html += `<div class="kotc-roster-slot">`;
      html += `<span class="gender-icon">👩</span>`;
      if (name) {
        html += `<span>${esc(name)}</span>`;
        html += `<button style="margin-left:auto;font-size:.7em;opacity:.5;cursor:pointer;border:none;background:none;color:inherit" onclick="event.stopPropagation();window._kotcRemovePlayer(${ci},'W',${i})">✕</button>`;
      } else {
        html += `<span class="empty">—</span>`;
      }
      html += '</div>';
    }
    html += '</div></div>';
  }
  html += '</div>';

  // Player search & add
  html += '<div class="kotc-player-search-wrap">';
  html += `<div style="display:flex;gap:6px;margin-bottom:8px">`;
  html += `<button class="pill-tab${_rosterGender === 'M' ? ' active' : ''}" onclick="window._kotcSetGender('M')">${tr('kotcFmt.genderMen')}</button>`;
  html += `<button class="pill-tab${_rosterGender === 'W' ? ' active' : ''}" onclick="window._kotcSetGender('W')">${tr('kotcFmt.genderWomen')}</button>`;
  html += `</div>`;
  html += `<input class="kotc-player-search" placeholder="${esc(tr('kotcFmt.searchPlaceholder'))}" value="${esc(_rosterSearch)}" oninput="window._kotcSearchPlayer(this.value)">`;
  html += '<div class="kotc-player-list">';

  const db = loadPlayerDB();
  const filtered = db.filter(p => {
    if (_rosterGender && p.gender !== _rosterGender) return false;
    if (_rosterSearch && !p.name.toLowerCase().includes(_rosterSearch.toLowerCase())) return false;
    return true;
  }).slice(0, 30);

  for (const p of filtered) {
    const already = courts.some(c => c.men.includes(p.name) || c.women.includes(p.name));
    html += `<div class="kotc-player-item${already ? ' style="opacity:.4"' : ''}" onclick="window._kotcAddPlayer('${esc(p.name)}','${p.gender}')">`;
    html += `<span class="name">${esc(p.name)}</span>`;
    html += `<span class="gender">${p.gender === 'W' ? '♀' : '♂'}</span>`;
    html += '</div>';
  }
  if (!filtered.length) html += '<div style="padding:8px;color:var(--muted);font-size:.84em">' + tr('kotcFmt.noPlayers') + '</div>';
  html += '</div></div>';

  content.innerHTML = html;
}

window._kotcSelectCourt = function(ci) {
  _rosterSelectedCourt = ci;
  _renderRoster();
};

window._kotcSetGender = function(g) {
  _rosterGender = g;
  _renderRoster();
};

window._kotcSearchPlayer = function(q) {
  _rosterSearch = q;
  _renderRoster();
};

window._kotcAddPlayer = function(name, gender) {
  if (!_session) return;
  const ci = _rosterSelectedCourt;
  const list = gender === 'M' ? _session.courts[ci].men : _session.courts[ci].women;
  if (list.length >= _ppc) { showToast(tr('kotcFmt.courtFullGender'), 'warn'); return; }
  if (_session.courts.some(c => c.men.includes(name) || c.women.includes(name))) {
    showToast(tr('kotcFmt.playerOnCourt'), 'warn'); return;
  }
  list.push(name);
  _saveSession();
  _renderRoster();
};

window._kotcRemovePlayer = function(ci, gender, idx) {
  if (!_session) return;
  const list = gender === 'M' ? _session.courts[ci].men : _session.courts[ci].women;
  list.splice(idx, 1);
  _saveSession();
  _renderRoster();
};

// ════════════════════════════════════════════════════════════
// COURTS PANEL (Stage 1)
// ════════════════════════════════════════════════════════════
function _renderCourtTabs() {
  const wrap = document.getElementById('kotc-court-tabs');
  if (!wrap || !_session) return;
  let html = '';
  for (let ci = 0; ci < _session.nc; ci++) {
    const meta = COURT_META[ci];
    html += `<button class="pill-tab${_activeCourt === ci ? ' active' : ''}" onclick="window._kotcSelectCourtTab(${ci})">${esc(meta.name)}</button>`;
  }
  wrap.innerHTML = html;
}

function _renderCourts() {
  const content = document.getElementById('kotc-courts-content');
  if (!content || !_session) return;

  const ci = _activeCourt;
  const ri = _session.courtRound[ci];
  const meta = COURT_META[ci];
  const ct = _session.courts[ci];

  // S7.5: Court-lock — judge can only edit their assigned court
  const jm = globalThis.judgeMode;
  const locked = jm?.active && jm.court !== ci;

  let html = '';

  // S7.5: Lock banner for non-assigned courts
  if (locked) {
    html += `<div style="background:rgba(255,200,0,.1);border:1px solid rgba(255,200,0,.25);border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:.85em;color:var(--gold);text-align:center">🔒 Просмотр — редактирование доступно только на вашем корте (${esc(COURT_META[jm.court]?.name || '')})</div>`;
  }

  // Round tabs
  html += '<div style="display:flex;gap:4px;margin-bottom:10px">';
  for (let r = 0; r < _ppc; r++) {
    html += `<button class="pill-tab${ri === r ? ' active' : ''}" onclick="window._kotcGoRound(${ci},${r})">${tr('kotcFmt.roundN', { n: r + 1 })}</button>`;
  }
  html += '</div>';

  // Matches for current round
  const matchups = kotcMatchupsR1(ri, _ppc);
  html += '<div class="kotc-courts-grid">';

  for (const [miA, miB] of matchups) {
    const wA = kotcPartnerW(miA, ri, _ppc, _session.fixedPairs);
    const wB = kotcPartnerW(miB, ri, _ppc, _session.fixedPairs);
    const teamAName = (ct.men[miA] || tr('kotcFmt.placeholderMan', { n: miA + 1 })) + ' + ' + (ct.women[wA] || tr('kotcFmt.placeholderWoman', { n: wA + 1 }));
    const teamBName = (ct.men[miB] || tr('kotcFmt.placeholderMan', { n: miB + 1 })) + ' + ' + (ct.women[wB] || tr('kotcFmt.placeholderWoman', { n: wB + 1 }));
    const scoreA = _session.scores[ci]?.[miA]?.[ri] ?? '';
    const scoreB = _session.scores[ci]?.[miB]?.[ri] ?? '';

    html += `<div class="kotc-court-card">`;
    html += `<div class="kotc-court-hdr"><span class="court-dot" style="background:${meta.color}"></span>${esc(meta.name)} · ${tr('kotcFmt.roundN', { n: ri + 1 })}</div>`;
    html += `<div class="kotc-match-row">`;
    html += `<div class="kotc-team-name left">${esc(teamAName)}</div>`;
    html += `<div class="kotc-score-col">`;
    const lockAttr = locked ? ' disabled style="opacity:.35;pointer-events:none"' : '';
    html += `<button class="kotc-sc-btn"${lockAttr} onclick="window._kotcScore(${ci},${miA},${ri},-1)">−</button>`;
    html += `<span class="kotc-sc-val">${scoreA === '' ? '–' : scoreA}</span>`;
    html += `<button class="kotc-sc-btn"${lockAttr} onclick="window._kotcScore(${ci},${miA},${ri},+1)">+</button>`;
    html += `</div>`;
    html += `<div class="kotc-team-name right">${esc(teamBName)}</div>`;
    html += `</div>`;
    // Team B score
    html += `<div class="kotc-match-row" style="border-top:none;padding-top:0">`;
    html += `<div></div>`;
    html += `<div class="kotc-score-col">`;
    html += `<button class="kotc-sc-btn"${lockAttr} onclick="window._kotcScore(${ci},${miB},${ri},-1)">−</button>`;
    html += `<span class="kotc-sc-val">${scoreB === '' ? '–' : scoreB}</span>`;
    html += `<button class="kotc-sc-btn"${lockAttr} onclick="window._kotcScore(${ci},${miB},${ri},+1)">+</button>`;
    html += `</div>`;
    html += `<div></div>`;
    html += `</div>`;
    html += `</div>`;
  }
  html += '</div>';

  // Per-court standings mini
  const rankedM = kotcRankCourt({ scores: _session.scores, ci, ppc: _ppc, gender: 'M', fixedPairs: _session.fixedPairs });
  const rankedW = kotcRankCourt({ scores: _session.scores, ci, ppc: _ppc, gender: 'W', fixedPairs: _session.fixedPairs });

  html += '<div class="kotc-standings-section">';
  html += `<div class="kotc-standings-title">${esc(meta.name)} — ${tr('kotcFmt.currentResults')}</div>`;
  html += '<table style="width:100%;font-size:.82em;border-collapse:collapse">';
  html += '<tr style="color:var(--muted);text-align:left"><th>' + tr('kotcFmt.thHash') + '</th><th>' + tr('kotcFmt.thPlayer') + '</th><th>' + tr('kotcFmt.thW') + '</th><th>' + tr('kotcFmt.thD') + '</th><th>' + tr('kotcFmt.thP') + '</th><th>' + tr('kotcFmt.thK') + '</th></tr>';
  for (const r of rankedM) {
    const name = ct.men[r.idx] || tr('kotcFmt.placeholderMan', { n: r.idx + 1 });
    html += `<tr><td>${r.place}</td><td>🏋️ ${esc(name)}</td><td>${r.wins}</td><td>${r.diff}</td><td>${r.pts}</td><td>${r.K.toFixed(2)}</td></tr>`;
  }
  for (const r of rankedW) {
    const name = ct.women[r.idx] || tr('kotcFmt.placeholderWoman', { n: r.idx + 1 });
    html += `<tr><td>${r.place}</td><td>👩 ${esc(name)}</td><td>${r.wins}</td><td>${r.diff}</td><td>${r.pts}</td><td>${r.K.toFixed(2)}</td></tr>`;
  }
  html += '</table></div>';

  content.innerHTML = html;
}

window._kotcSelectCourtTab = function(ci) {
  _activeCourt = ci;
  _renderCourtTabs();
  _renderCourts();
};

window._kotcGoRound = function(ci, ri) {
  if (!_session) return;
  _session.courtRound[ci] = ri;
  _saveSession();
  _renderCourts();
};

window._kotcScore = function(ci, mi, ri, delta) {
  if (!_session) return;
  // S7.5: Court-lock — judge can only edit their assigned court
  const jm = globalThis.judgeMode;
  if (jm?.active && jm.court !== ci) return;
  const cur = _session.scores[ci]?.[mi]?.[ri];
  const next = Math.max(0, (cur ?? 0) + delta);
  _session.scores[ci][mi][ri] = next;
  _saveSession();
  _renderCourts();
};

// ════════════════════════════════════════════════════════════
// STANDINGS PANEL
// ════════════════════════════════════════════════════════════
function _renderStandings() {
  const content = document.getElementById('kotc-standings-content');
  if (!content || !_session) return;

  const allRanked = kotcRankAll({
    scores: _session.scores,
    nc: _session.nc,
    ppc: _ppc,
    courts: _session.courts,
    fixedPairs: _session.fixedPairs,
  });

  let html = '';

  for (const gender of ['M', 'W']) {
    const label = gender === 'M' ? tr('kotcFmt.labelMen') : tr('kotcFmt.labelWomen');
    html += `<div class="kotc-standings-section">`;
    html += `<div class="kotc-standings-title">${label}</div>`;
    html += '<table style="width:100%;font-size:.82em;border-collapse:collapse">';
    html += '<tr style="color:var(--muted);text-align:left"><th>' + tr('kotcFmt.thHash') + '</th><th>' + tr('kotcFmt.thPlayer') + '</th><th>' + tr('kotcFmt.thCourt') + '</th><th>' + tr('kotcFmt.thW') + '</th><th>' + tr('kotcFmt.thD') + '</th><th>' + tr('kotcFmt.thP') + '</th><th>' + tr('kotcFmt.thK') + '</th></tr>';

    for (const p of allRanked[gender]) {
      const zone = _getZoneForRank(p.globalRank, allRanked[gender].length);
      html += `<tr>`;
      html += `<td>${p.globalRank}${p.globalTied ? '*' : ''}</td>`;
      html += `<td>${esc(p.name)}</td>`;
      html += `<td><span style="color:${p.courtColor}">${esc(p.courtName)}</span></td>`;
      html += `<td>${p.wins}</td><td>${p.diff}</td><td>${p.pts}</td><td>${p.K.toFixed(2)}</td>`;
      html += `</tr>`;
    }
    html += '</table></div>';
  }

  // Division preview
  if (_session.phase === 'stage1') {
    const divKeys = kotcActiveDivKeys(_session.nc);
    html += '<div class="kotc-standings-section">';
    html += '<div class="kotc-standings-title">' + tr('kotcFmt.prelimDivisions') + '</div>';
    const seeded = kotcSeedAll({
      scores: _session.scores,
      nc: _session.nc,
      ppc: _ppc,
      courts: _session.courts,
      fixedPairs: _session.fixedPairs,
    });
    for (const key of divKeys) {
      html += `<div style="margin-bottom:8px"><span class="kotc-zone-badge ${key}">${key.toUpperCase()}</span> `;
      const names = [...(seeded[key]?.M || []), ...(seeded[key]?.W || [])].map(p => esc(p.name));
      html += names.join(', ') || '<span style="color:var(--muted)">—</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  content.innerHTML = html;
}

function _getZoneForRank(rank, total) {
  const q = total / 4;
  if (rank <= q) return 'hard';
  if (rank <= q * 2) return 'advance';
  if (rank <= q * 3) return 'medium';
  return 'lite';
}

// ════════════════════════════════════════════════════════════
// DIVISIONS PANEL (Stage 2)
// ════════════════════════════════════════════════════════════
function _renderDivTabs() {
  const wrap = document.getElementById('kotc-div-tabs');
  if (!wrap || !_session) return;
  const keys = kotcActiveDivKeys(_session.nc);
  let html = '';
  for (const key of keys) {
    html += `<button class="pill-tab${_activeDiv === key ? ' active' : ''}" onclick="window._kotcSelectDiv('${key}')">${key.toUpperCase()}</button>`;
  }
  wrap.innerHTML = html;
}

function _renderDivisions() {
  const content = document.getElementById('kotc-divisions-content');
  if (!content || !_session) return;

  const key = _activeDiv;
  const dr = _session.divRoster[key];
  const ds = _session.divScores[key];
  const ri = _session.divRoundState[key] || 0;
  const Nd = dr?.men?.length || 0;

  let html = '';

  if (!Nd) {
    html = '<div style="padding:20px;text-align:center;color:var(--muted)">' + tr('kotcFmt.noPlayersInDiv', { key: key.toUpperCase() }) + '</div>';
    content.innerHTML = html;
    return;
  }

  // Round tabs
  html += '<div style="display:flex;gap:4px;margin-bottom:10px">';
  for (let r = 0; r < Nd; r++) {
    html += `<button class="pill-tab${ri === r ? ' active' : ''}" onclick="window._kotcDivGoRound('${key}',${r})">${tr('kotcFmt.roundN', { n: r + 1 })}</button>`;
  }
  html += '</div>';

  // Matches for current div round (reuse iptMatchupsR1 since ppc=4 in divs)
  const matchups = kotcMatchupsR1(ri, 4);
  html += '<div class="kotc-courts-grid">';
  for (const [miA, miB] of matchups) {
    if (miA >= Nd || miB >= Nd) continue;
    const wA = kotcDivPartnerW(miA, ri, Nd);
    const wB = kotcDivPartnerW(miB, ri, Nd);
    const teamAName = (dr.men[miA] || tr('kotcFmt.placeholderMan', { n: miA + 1 })) + ' + ' + (dr.women[wA < dr.women.length ? wA : 0] || tr('kotcFmt.placeholderWoman', { n: wA + 1 }));
    const teamBName = (dr.men[miB] || tr('kotcFmt.placeholderMan', { n: miB + 1 })) + ' + ' + (dr.women[wB < dr.women.length ? wB : 0] || tr('kotcFmt.placeholderWoman', { n: wB + 1 }));
    const scoreA = ds?.[miA]?.[ri] ?? '';
    const scoreB = ds?.[miB]?.[ri] ?? '';

    html += `<div class="kotc-div-card">`;
    html += `<div class="kotc-div-hdr"><span class="kotc-zone-badge ${key}">${key.toUpperCase()}</span> ${tr('kotcFmt.roundN', { n: ri + 1 })}</div>`;
    html += `<div class="kotc-match-row">`;
    html += `<div class="kotc-team-name left">${esc(teamAName)}</div>`;
    html += `<div class="kotc-score-col">`;
    html += `<button class="kotc-sc-btn" onclick="window._kotcDivScore('${key}',${miA},${ri},-1)">−</button>`;
    html += `<span class="kotc-sc-val">${scoreA === '' ? '–' : scoreA}</span>`;
    html += `<button class="kotc-sc-btn" onclick="window._kotcDivScore('${key}',${miA},${ri},+1)">+</button>`;
    html += `</div>`;
    html += `<div class="kotc-team-name right">${esc(teamBName)}</div>`;
    html += `</div>`;
    html += `<div class="kotc-match-row" style="border-top:none;padding-top:0">`;
    html += `<div></div>`;
    html += `<div class="kotc-score-col">`;
    html += `<button class="kotc-sc-btn" onclick="window._kotcDivScore('${key}',${miB},${ri},-1)">−</button>`;
    html += `<span class="kotc-sc-val">${scoreB === '' ? '–' : scoreB}</span>`;
    html += `<button class="kotc-sc-btn" onclick="window._kotcDivScore('${key}',${miB},${ri},+1)">+</button>`;
    html += `</div>`;
    html += `<div></div>`;
    html += `</div></div>`;
  }
  html += '</div>';

  // Division standings
  const rankedM = kotcRankDivision({ divScores: _session.divScores, divRoster: _session.divRoster, key, gender: 'M' });
  const rankedW = kotcRankDivision({ divScores: _session.divScores, divRoster: _session.divRoster, key, gender: 'W' });

  html += '<div class="kotc-standings-section">';
  html += `<div class="kotc-standings-title"><span class="kotc-zone-badge ${key}">${key.toUpperCase()}</span> ${tr('kotcFmt.divisionResults')}</div>`;
  html += '<table style="width:100%;font-size:.82em;border-collapse:collapse">';
  html += '<tr style="color:var(--muted);text-align:left"><th>' + tr('kotcFmt.thHash') + '</th><th>' + tr('kotcFmt.thPlayer') + '</th><th>' + tr('kotcFmt.thW') + '</th><th>' + tr('kotcFmt.thD') + '</th><th>' + tr('kotcFmt.thP') + '</th><th>' + tr('kotcFmt.thK') + '</th></tr>';
  for (const r of rankedM) {
    html += `<tr><td>${r.place}</td><td>🏋️ ${esc(r.name)}</td><td>${r.wins}</td><td>${r.diff}</td><td>${r.pts}</td><td>${r.K.toFixed(2)}</td></tr>`;
  }
  for (const r of rankedW) {
    html += `<tr><td>${r.place}</td><td>👩 ${esc(r.name)}</td><td>${r.wins}</td><td>${r.diff}</td><td>${r.pts}</td><td>${r.K.toFixed(2)}</td></tr>`;
  }
  html += '</table></div>';

  content.innerHTML = html;
}

window._kotcSelectDiv = function(key) {
  _activeDiv = key;
  _renderDivTabs();
  _renderDivisions();
};

window._kotcDivGoRound = function(key, ri) {
  if (!_session) return;
  _session.divRoundState[key] = ri;
  _saveSession();
  _renderDivisions();
};

window._kotcDivScore = function(key, mi, ri, delta) {
  if (!_session) return;
  if (!_session.divScores[key]) return;
  if (!_session.divScores[key][mi]) _session.divScores[key][mi] = [];
  const cur = _session.divScores[key][mi][ri];
  _session.divScores[key][mi][ri] = Math.max(0, (cur ?? 0) + delta);
  _saveSession();
  _renderDivisions();
};

// ════════════════════════════════════════════════════════════
// FINISHED PANEL
// ════════════════════════════════════════════════════════════
function _renderFinished() {
  const content = document.getElementById('kotc-finished-content');
  if (!content || !_session) return;

  let html = '';
  const divKeys = kotcActiveDivKeys(_session.nc);

  for (const key of divKeys) {
    const rankedM = kotcRankDivision({ divScores: _session.divScores, divRoster: _session.divRoster, key, gender: 'M' });
    const rankedW = kotcRankDivision({ divScores: _session.divScores, divRoster: _session.divRoster, key, gender: 'W' });

    html += '<div class="kotc-finished-section">';
    html += `<div class="kotc-standings-title"><span class="kotc-zone-badge ${key}">${key.toUpperCase()}</span> ${tr('kotcFmt.finalsTitleSuffix')}</div>`;

    // Podium
    if (rankedM.length >= 3) {
      html += '<div class="kotc-podium">';
      const medals = ['🥇', '🥈', '🥉'];
      for (let i = 0; i < 3; i++) {
        html += `<div class="kotc-podium-item"><div class="medal">${medals[i]}</div>`;
        html += `<div class="name">🏋️ ${esc(rankedM[i]?.name || '—')}</div>`;
        html += `<div class="name">👩 ${esc(rankedW[i]?.name || '—')}</div></div>`;
      }
      html += '</div>';
    }

    // Full table
    html += '<table style="width:100%;font-size:.82em;border-collapse:collapse">';
    html += '<tr style="color:var(--muted);text-align:left"><th>' + tr('kotcFmt.thHash') + '</th><th>' + tr('kotcFmt.thPlayer') + '</th><th>' + tr('kotcFmt.thW') + '</th><th>' + tr('kotcFmt.thD') + '</th><th>' + tr('kotcFmt.thP') + '</th><th>' + tr('kotcFmt.thK') + '</th></tr>';
    for (const r of rankedM) {
      html += `<tr><td>${r.place}</td><td>🏋️ ${esc(r.name)}</td><td>${r.wins}</td><td>${r.diff}</td><td>${r.pts}</td><td>${r.K.toFixed(2)}</td></tr>`;
    }
    for (const r of rankedW) {
      html += `<tr><td>${r.place}</td><td>👩 ${esc(r.name)}</td><td>${r.wins}</td><td>${r.diff}</td><td>${r.pts}</td><td>${r.K.toFixed(2)}</td></tr>`;
    }
    html += '</table></div>';
  }

  // Telegram export
  html += '<div class="kotc-finished-section">';
  html += '<div class="kotc-standings-title">' + tr('kotcFmt.exportTitle') + '</div>';
  let tg = `🏐 KOTC ${_session.meta.date}\n\n`;
  for (const key of divKeys) {
    tg += `🏆 ${key.toUpperCase()}\n`;
    const rankedM = kotcRankDivision({ divScores: _session.divScores, divRoster: _session.divRoster, key, gender: 'M' });
    const rankedW = kotcRankDivision({ divScores: _session.divScores, divRoster: _session.divRoster, key, gender: 'W' });
    rankedM.forEach((r, i) => { tg += `${i + 1}. 🏋️ ${r.name} (${r.wins}W ${r.diff}D)\n`; });
    rankedW.forEach((r, i) => { tg += `${i + 1}. 👩 ${r.name} (${r.wins}W ${r.diff}D)\n`; });
    tg += '\n';
  }
  html += `<div class="kotc-export-box" id="kotc-export-text">${esc(tg)}</div>`;
  html += `<button class="pill-tab" style="margin-top:8px" onclick="window._kotcCopyExport()">${tr('kotcFmt.copy')}</button>`;
  html += '</div>';

  // F3.1: Export buttons (JSON + CSV)
  html += '<div style="display:flex;gap:8px;justify-content:center;margin:16px 0">';
  html += '  <button class="pill-tab" onclick="window._kotcExportJSON()">JSON</button>';
  html += '  <button class="pill-tab" onclick="window._kotcExportCSV()">CSV</button>';
  html += '</div>';

  // S8.7: Finalize — send results to server
  const alreadyFinalized = _session.finalized;
  html += '<div style="display:flex;justify-content:center;margin:12px 0">';
  if (alreadyFinalized) {
    html += '<div style="color:var(--muted);font-size:.85em">✅ Результаты отправлены на сервер</div>';
  } else {
    html += '<button class="pill-tab" style="background:var(--gold);color:#000;font-weight:700" onclick="window._kotcFinalize()">📤 Отправить результаты</button>';
  }
  html += '</div>';

  content.innerHTML = html;
}

window._kotcCopyExport = function() {
  const el = document.getElementById('kotc-export-text');
  if (el) {
    navigator.clipboard.writeText(el.textContent).then(() => showToast(tr('kotcFmt.copied'), 'ok'));
  }
};

// F3.1: Export JSON
window._kotcExportJSON = function() {
  if (!_session) return;
  const divKeys = kotcActiveDivKeys(_session.nc);
  const divisions = {};
  for (const key of divKeys) {
    divisions[key] = {
      men: kotcRankDivision({ divScores: _session.divScores, divRoster: _session.divRoster, key, gender: 'M' }),
      women: kotcRankDivision({ divScores: _session.divScores, divRoster: _session.divRoster, key, gender: 'W' }),
    };
  }
  const data = {
    format: 'KOTC',
    date: _session.meta?.date || new Date().toISOString().slice(0, 10),
    nc: _session.nc,
    trnId: _session.trnId,
    divisions,
  };
  const dateStr = data.date.replace(/-/g, '');
  exportToJSON(data, 'kotc_' + dateStr + '.json');
};

// F3.1: Export CSV
window._kotcExportCSV = function() {
  if (!_session) return;
  const divKeys = kotcActiveDivKeys(_session.nc);
  const headers = [
    tr('kotcFmt.csvDivision'), tr('kotcFmt.csvGender'), tr('kotcFmt.csvPlace'), tr('kotcFmt.csvName'),
    tr('kotcFmt.csvPoints'), tr('kotcFmt.csvDiff'), tr('kotcFmt.csvWins'), tr('kotcFmt.csvK'),
    tr('kotcFmt.csvBalls'), tr('kotcFmt.csvBestRound'), tr('kotcFmt.csvPlayed'),
  ];
  const rows = [];
  for (const key of divKeys) {
    for (const gender of ['M', 'W']) {
      const ranked = kotcRankDivision({ divScores: _session.divScores, divRoster: _session.divRoster, key, gender });
      for (const r of ranked) {
        rows.push([
          key.toUpperCase(), gender === 'M' ? tr('kotcFmt.genderMShort') : tr('kotcFmt.genderWShort'), r.place, r.name,
          r.pts ?? 0, r.diff ?? 0, r.wins ?? 0,
          typeof r.K === 'number' ? r.K.toFixed(2) : '', r.balls ?? 0, r.bestRound ?? 0, r.rPlayed ?? 0,
        ]);
      }
    }
  }
  const dateStr = (_session.meta?.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  exportToCSV(headers, rows, 'kotc_' + dateStr + '.csv');
};

// ── S8.7: Finalize — send results to server ─────────────────
window._kotcFinalize = async function() {
  if (!_session || _session.finalized) return;
  const divKeys = kotcActiveDivKeys(_session.nc);
  const results = [];

  for (const key of divKeys) {
    for (const gender of ['M', 'W']) {
      const ranked = kotcRankDivision({
        divScores: _session.divScores, divRoster: _session.divRoster, key, gender,
      });
      for (const r of ranked) {
        if (!r.playerId && !r.name) continue;
        results.push({
          player_id: r.playerId || r.name,
          placement: r.place || 0,
          points: r.pts || 0,
          format: 'KOTC',
          division: key.toUpperCase(),
        });
      }
    }
  }

  if (!results.length) {
    showToast('Нет результатов для отправки', 'warn');
    return;
  }

  const trnId = _session.trnId || _trnId;
  try {
    const api = globalThis.sharedApi;
    if (!api?.finalizeTournament) {
      showToast('API недоступен — результаты сохранены локально', 'warn');
      return;
    }
    const res = await api.finalizeTournament(trnId, results);
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

// ════════════════════════════════════════════════════════════
// Phase transitions
// ════════════════════════════════════════════════════════════
window._kotcStartStage1 = function() {
  if (!_session) return;
  // Validate: each court should have ppc men + ppc women
  for (let ci = 0; ci < _session.nc; ci++) {
    if (_session.courts[ci].men.length < _ppc || _session.courts[ci].women.length < _ppc) {
      showToast(tr('kotcFmt.courtNeedMw', { n: ci + 1, ppc: _ppc }), 'warn');
      return;
    }
  }
  _session.phase = 'stage1';
  _saveSession();
  _activeCourt = 0;
  _showPanel('courts');
  _renderCourtTabs();
  _renderCourts();
};

window._kotcShowStandings = function() {
  _showPanel('standings');
  _renderStandings();
};

window._kotcStartDivisions = function() {
  if (!_session) return;
  // Seed divisions from R1 results
  const seeded = kotcSeedAll({
    scores: _session.scores,
    nc: _session.nc,
    ppc: _ppc,
    courts: _session.courts,
    fixedPairs: _session.fixedPairs,
  });

  const active = kotcActiveDivKeys(_session.nc);
  for (const key of active) {
    _session.divRoster[key] = {
      men:   (seeded[key]?.M || []).map(p => p.name),
      women: (seeded[key]?.W || []).map(p => p.name),
    };
  }
  _session.divScores = kotcMakeBlankDivScores();
  _session.divRoundState = { hard: 0, advance: 0, medium: 0, lite: 0 };
  _session.phase = 'divisions';
  _saveSession();
  _activeDiv = active[0] || 'hard';
  _showPanel('divisions');
  _renderDivTabs();
  _renderDivisions();
};

window._kotcFinish = function() {
  if (!_session) return;
  if (!confirm(tr('kotcFmt.finishConfirm'))) return;
  _session.phase = 'finished';
  _saveSession();
  _showPanel('finished');
  _renderFinished();
};

// ════════════════════════════════════════════════════════════
// Initialize
// ════════════════════════════════════════════════════════════
function _init() {
  const saved = _loadSession();
  if (saved && saved.trnId === _trnId) {
    _session = saved;
  } else {
    _session = _createSession();
  }

  _updateInfoBar();

  // Restore to correct panel based on phase
  const phase = _session.phase;
  if (phase === 'stage1') {
    _showPanel('courts');
    _renderCourtTabs();
    _renderCourts();
  } else if (phase === 'divisions') {
    _activeDiv = kotcActiveDivKeys(_session.nc)[0] || 'hard';
    _showPanel('divisions');
    _renderDivTabs();
    _renderDivisions();
  } else if (phase === 'finished') {
    _showPanel('finished');
    _renderFinished();
  } else {
    _showPanel('roster');
    _renderRoster();
  }
}

async function _boot() {
  await initI18n();
  const back = document.querySelector('.fmt-nav-back');
  if (back) back.textContent = tr('kotcFmt.hubBack');
  const navTitle = document.getElementById('kotc-nav-title');
  if (navTitle) navTitle.textContent = tr('kotcFmt.navTitle');
  const info = document.getElementById('kotc-info-text');
  if (info) info.textContent = tr('kotcFmt.loading');
  const rt = document.getElementById('kotc-round-tabs');
  if (rt) rt.setAttribute('aria-label', tr('kotcFmt.ariaRounds'));
  const ct = document.getElementById('kotc-court-tabs');
  if (ct) ct.setAttribute('aria-label', tr('kotcFmt.ariaCourts'));
  const dt = document.getElementById('kotc-div-tabs');
  if (dt) dt.setAttribute('aria-label', tr('kotcFmt.ariaDivisions'));
  document.title = 'KOTC — ' + tr('app.name');
  _init();
}

_boot();
