'use strict';

// ════════════════════════════════════════════════════════════
// ROSTER-EDIT: Settings, draft engine, distribution, history
// Split from roster.js (A3.2)
// ════════════════════════════════════════════════════════════

function tr(key, params) {
  return typeof globalThis.i18n?.t === 'function' ? globalThis.i18n.t(key, params) : key;
}

function toggleFixedPairs() {
  // ThaiVolley32 requires rotating partners each round,
  // so we force fixedPairs=false (no-op if already correct).
  if (fixedPairs === false) {
    showToast('🔄 ' + tr('roster.rotationRequired'), 'error');
    return;
  }
  fixedPairs = false;
  saveState();
  // Re-render courts to update pair display
  for (let ci = 0; ci < nc; ci++) {
    const s = document.getElementById(`screen-${ci}`);
    if (s) s.innerHTML = renderCourt(ci);
  }
  updateDivisions();
  // Update toggle button label without full rebuild
  document.querySelectorAll('.fixed-pairs-toggle').forEach(el => {
    el.textContent = '🔄 ' + tr('roster.rotation');
    el.classList.toggle('on', false);
  });
  saveState();
  showToast('🔄 ' + tr('roster.rotationEnabled'));
}

function toggleSolar() {
  const on = document.body.classList.toggle('solar');
  localStorage.setItem('kotc3_solar', on ? '1' : '0');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on ? '#000000' : '#0d0d1a');
  // Re-render just the theme button label without full roster rebuild
  document.querySelectorAll('.solar-toggle-roster').forEach(el => {
    el.textContent = on ? '🌙 ' + tr('theme.night') : '☀️ ' + tr('theme.beach');
  });
}

function setPending(newNc, newPpc) {
  _nc = newNc;
  _ppc = newPpc;
  // Update seg buttons
  document.querySelectorAll('#seg-c .seg-btn').forEach((b)=>b.classList.toggle('on', parseInt(b.textContent.trim()) === _nc));
  document.querySelectorAll('#seg-n .seg-btn').forEach((b)=>b.classList.toggle('on', parseInt(b.textContent.trim()) === _ppc));
  // Update info text
  const info = document.getElementById('sc-info');
  if (info) info.innerHTML = tr('roster.courtInfo', {nc: _nc, ppc: _ppc, total: _nc*_ppc});
}

// ── ThaiVolley32 Draft Engine (1903.md) ───────────────────────
function thai32IsRealName(n) {
  const t = String(n ?? '').trim();
  if (!t) return false;
  // Auto-placeholders produced by old distribute logic
  if (/^М\d+$/.test(t) || /^Ж\d+$/.test(t)) return false;
  return true;
}

function thai32HashRandKey(seed, gender, name) {
  // Simple deterministic integer hash → [0..2^32-1]
  const s = `${seed}|${gender}|${name}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getThai32DraftSeed() {
  const el = document.getElementById('thai32-draft-seed');
  let seed = NaN;
  if (el) {
    const raw = String(el.value ?? '').trim();
    const parsed = raw === '' ? NaN : parseInt(raw, 10);
    seed = Number.isFinite(parsed) ? parsed : NaN;
  }
  if (!Number.isFinite(seed)) {
    seed = parseInt(localStorage.getItem('kotc3_thai32_draft_seed') || '', 10);
    if (!Number.isFinite(seed)) seed = Date.now() % 1000000000;
    if (el) el.value = String(seed);
  }
  localStorage.setItem('kotc3_thai32_draft_seed', String(seed));
  return seed;
}

function readRosterInputsIntoAllCourts() {
  document.querySelectorAll('.rc-inp').forEach(inp => {
    const ci = +inp.dataset.ci;
    const g = inp.dataset.g;
    const pi = +inp.dataset.pi;
    if (!isNaN(ci) && ci < 4) {
      ALL_COURTS[ci][g][pi] = inp.value.trim();
    }
  });
}

/**
 * Mutates ALL_COURTS by drafting 16M + 16W into 4 courts (groups of 8).
 * Returns used seed, or null if roster is incomplete.
 */
function runThai32DraftEngine() {
  const expected = nc * ppc; // 16
  const men = [];
  const women = [];

  for (let ci = 0; ci < nc; ci++) {
    for (let pi = 0; pi < ppc; pi++) {
      const m = ALL_COURTS[ci].men[pi];
      const w = ALL_COURTS[ci].women[pi];
      if (thai32IsRealName(m)) men.push({ name: m, src: ci * ppc + pi });
      if (thai32IsRealName(w)) women.push({ name: w, src: ci * ppc + pi });
    }
  }

  if (men.length !== expected || women.length !== expected) {
    showToast(
      '❌ ' + tr('roster.draftNeed32', {expected, men: men.length, women: women.length}),
      'error'
    );
    return null;
  }

  const seed = getThai32DraftSeed();

  const sortByRand = (arr, gender) =>
    [...arr].sort((a, b) => {
      const ka = thai32HashRandKey(seed, gender, a.name);
      const kb = thai32HashRandKey(seed, gender, b.name);
      if (ka !== kb) return ka - kb;
      const ln = (a.name || '').localeCompare(b.name || '', 'ru');
      if (ln !== 0) return ln;
      return a.src - b.src;
    });

  const menSorted = sortByRand(men, 'M');
  const womenSorted = sortByRand(women, 'W');

  for (let gi = 0; gi < nc; gi++) {
    ALL_COURTS[gi].men = menSorted.slice(gi * ppc, (gi + 1) * ppc).map(x => x.name);
    ALL_COURTS[gi].women = womenSorted.slice(gi * ppc, (gi + 1) * ppc).map(x => x.name);
  }

  return seed;
}

async function applySettings() {
  // ThaiVolley32 enforcement: ppc=4, nc=4
  _ppc = 4;
  // Keep nc from pending settings so court-count buttons work.
  fixedPairs = false;
  if (_ppc === ppc && _nc === nc) { showToast(tr('roster.settingsUnchanged')); return; }
  if (!await showConfirm(tr('roster.applyConfirm', {nc: _nc, ppc: _ppc}))) return;

  // Draft engine uses current roster inputs (admin can edit names before applying)
  readRosterInputsIntoAllCourts();
  const usedSeed = runThai32DraftEngine();
  if (usedSeed == null) return;

  ppc = _ppc;
  nc = _nc;
  scores    = makeBlankScores();
  divScores = makeBlankDivScores();
  divRoster = makeBlankDivRoster();
  // Reset round selectors
  for (let ci = 0; ci < nc; ci++) courtRound[ci] = 0;
  DIV_KEYS.forEach(k => { divRoundState[k] = 0; });
  saveState();
  buildAll();
  switchTab('roster');
  showToast('⚙️ ' + tr('roster.applyDone', {nc, ppc, seed: usedSeed}));
}

function autoDistribute() {
  // Draft engine preview/commit uses current input values
  readRosterInputsIntoAllCourts();
  const usedSeed = runThai32DraftEngine();
  if (usedSeed == null) return;

  // Reset scores so results match the drafted roster
  scores    = makeBlankScores();
  divScores = makeBlankDivScores();
  divRoster = makeBlankDivRoster();
  for (let ci = 0; ci < nc; ci++) courtRound[ci] = 0;
  DIV_KEYS.forEach(k => { divRoundState[k] = 0; });

  // Re-render court screens with updated roster
  for (let ci = 0; ci < nc; ci++) {
    const s = document.getElementById(`screen-${ci}`);
    if (s) s.innerHTML = renderCourt(ci);
  }
  saveState();
  switchTab('roster');
  showToast('📋 ' + tr('roster.draftDone', {seed: usedSeed}));
}

// ════════════════════════════════════════════════════════════
// 9. ROSTER ACTIONS
// ════════════════════════════════════════════════════════════
// saveTournamentMeta() удалена — теперь tournamentMeta
// устанавливается автоматически при добавлении турнира
// через «ТУРНИРЫ РАСПИСАНИЕ» (submitTournamentForm)

function applyRoster() {
  document.querySelectorAll('.rc-inp').forEach(inp => {
    const ci = +inp.dataset.ci, g = inp.dataset.g, pi = +inp.dataset.pi;
    if (!isNaN(ci) && ci < 4) {
      ALL_COURTS[ci][g][pi] = inp.value.trim() || (g==='men' ? `М${pi+1}` : `Ж${pi+1}`);
    }
  });
  // Refresh court screens
  for (let ci = 0; ci < nc; ci++) {
    const s = document.getElementById(`screen-${ci}`);
    if (s) s.innerHTML = renderCourt(ci);
  }
  updateDivisions();
  saveState();
  showToast('✅ ' + tr('roster.saved'));
}

async function clearRoster() {
  if (!await showConfirm(tr('roster.clearConfirm'))) return;
  // 1. Убрать кэш из localStorage
  localStorage.removeItem('kotc3_roster');
  // 2. Обнулить глобальные массивы ALL_COURTS
  for (let ci = 0; ci < 4; ci++) {
    ALL_COURTS[ci].men   = Array(ppc).fill('');
    ALL_COURTS[ci].women = Array(ppc).fill('');
  }
  // 3. Очистить DOM-поля (если ростер уже отрисован)
  document.querySelectorAll('.rc-inp').forEach(inp => { inp.value = ''; });
  saveState();
  showToast('🧹 ' + tr('roster.cleared'));
}

async function resetRosterNames() {
  if (!await showConfirm(tr('roster.resetNamesConfirm'))) return;
  const defaults = [
    { men:['Яковлев','Жидков','Алик','Куанбеков','Юшманов'],           women:['Лебедева','Чемерис В','Настя НМ','Сайдуллина','Маргарита'] },
    { men:['Обухов','Соболев','Иванов','Грузин','Шперлинг'],            women:['Шперлинг','Шерметова','Сабанцева','Микишева','Базутова'] },
    { men:['Сайдуллин','Лебедев','Камалов','Привет','Анашкин'],         women:['Носкова','Арефьева','Кузьмина','Яковлева','Маша Привет'] },
    { men:['Игрок М1','Игрок М2','Игрок М3','Игрок М4','Игрок М5'],    women:['Игрок Ж1','Игрок Ж2','Игрок Ж3','Игрок Ж4','Игрок Ж5'] },
  ];
  defaults.forEach((d,i)=>{ ALL_COURTS[i].men=[...d.men]; ALL_COURTS[i].women=[...d.women]; });
  saveState();
  switchTab('roster');
  showToast('↺ ' + tr('roster.namesReset'));
}

// ════════════════════════════════════════════════════════════
// 10. HISTORY LOG
// ════════════════════════════════════════════════════════════
const DIV_COURT_LABELS = { hard:'🔥 HARD', advance:'⚡ ADV', medium:'⚙️ MED', lite:'🍀 LITE' };

function addHistoryEntry(courtName, playerName, delta, newScore, courtKey) {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  tournamentHistory.unshift({
    time:   `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    court:  courtName,
    player: playerName,
    delta,
    score:  newScore,
    key:    courtKey || 'all'
  });
  if (tournamentHistory.length > 450) tournamentHistory.length = 450;
  // Живое обновление если вкладка РОСТЕР открыта
  const el = document.getElementById('admin-history-log');
  if (el) el.innerHTML = renderHistoryLog();
}

function setHistoryFilter(f) {
  historyFilter = f;
  const el = document.getElementById('admin-history-log');
  if (el) el.innerHTML = renderHistoryLog();
  // Update filter bar buttons
  document.querySelectorAll('.hf-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.f === f);
  });
}

function renderHistoryLog() {
  const filtered = historyFilter === 'all'
    ? tournamentHistory
    : tournamentHistory.filter(e => e.key === historyFilter);
  if (!filtered.length)
    return `<div class="history-empty">${tournamentHistory.length ? tr('history.filtered') : tr('history.empty')}</div>`;
  return filtered.map(e => {
    const pos  = e.delta > 0;
    const sign = pos ? '+1' : '−1';
    const dcls = pos ? 'pos' : 'neg';
    return `<div class="history-row${pos ? '' : ' neg'}">
      <span class="history-time">[${e.time}]</span>
      <span class="history-court">${esc(e.court)}</span>
      <span class="history-player">| ${esc(e.player)}</span>
      <span class="history-delta ${dcls}">${sign}</span>
      <span class="history-total">(${e.score})</span>
    </div>`;
  }).join('');
}

function clearHistory() {
  tournamentHistory = [];
  saveState();
  const el = document.getElementById('admin-history-log');
  if (el) el.innerHTML = renderHistoryLog();
}

