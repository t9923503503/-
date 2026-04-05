/**
 * IPT Double Trouble — standalone boot module
 *
 * ВАЖНО: хрупкий контракт загрузки.
 * ipt-format.js загружен как classic script и содержит только объявления функций (нет
 * eager init на top-level). Если туда добавят код вне функций, standalone тихо сломается.
 * Проверять при каждом обновлении ipt-format.js.
 *
 * Порядок загрузки:
 * 1. inline adapter globals (classic) — заглушки getTournaments/saveTournaments/showToast/...
 * 2. ipt-format.js (classic) — объявления функций, читает глобалы при вызове
 * 3. shared/players.js (ESM) — выставляет globalThis.sharedPlayers
 * 4. shared/api.js (ESM) — выставляет globalThis.sharedApi
 * 5. ipt-boot.js (ESM, этот файл) — перегружает глобалы, инициализирует UI
 */

// ── URL params ──────────────────────────────────────────────────────────────
const _params  = new URLSearchParams(location.search);
const _trnId   = _params.get('trnId') || 'ipt_quick';
let   _activeGroup = 0;
let   _activeRound = 0;

// ── switchTab adapter (whitelist) ───────────────────────────────────────────
// finishIPT()      вызывает switchTab('roster')  → показываем финиш
// finishIPTRound() вызывает switchTab('hard')    → финалы out of scope → финиш
// Числовые args  (корт N) → уже на game panel, игнорировать
window.switchTab = (tab) => {
  if (tab === 'roster') { _showPanel('finished'); return; }
  if (tab === 'hard')   { _showPanel('finished'); return; }
  if (typeof tab === 'number') { return; }
  console.warn('[IPT standalone] switchTab unknown arg:', tab);
};

// ── showToast ────────────────────────────────────────────────────────────────
let _toastTimer = null;
window.showToast = (msg, type = '') => {
  const el = document.getElementById('ipt-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 2800);
};

// ── loadPlayerDB bridge ──────────────────────────────────────────────────────
// Читает НАПРЯМУЮ из localStorage, не через sharedPlayers.loadPlayerDB().
// sharedPlayers.loadPlayerDB() → globalThis.loadPlayerDB() → здесь — нет цикла.
window.loadPlayerDB = () => {
  try {
    const raw = JSON.parse(localStorage.getItem('kotc3_playerdb') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
};

// ── helpers ──────────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _getTrn() {
  return getTournaments().find(t => t.id === _trnId) || null;
}

function _saveField(field, value) {
  const arr = getTournaments();
  const trn = arr.find(t => t.id === _trnId);
  if (!trn?.ipt) return;
  trn.ipt[field] = value;
  saveTournaments(arr);
}

// ── Initial panel router ────────────────────────────────────────────────────
function _getInitialPanel(trn) {
  if (!trn?.ipt)                                           return 'error';
  if (trn.status === 'finished')                           return 'finished';
  if (!trn.ipt.groups)                                     return 'roster';
  if (trn.ipt.groups.every(g => g.status === 'finished'))  return 'finished';
  if (trn.ipt.groups.some(g => g.currentRound > 0))        return 'game';
  return 'overview';
}

// ── Panel switching ──────────────────────────────────────────────────────────
function _showPanel(name) {
  ['roster','overview','game','finished'].forEach(p => {
    const el = document.getElementById(`ipt-${p}-panel`);
    if (el) el.classList.toggle('active', p === name);
  });
  _renderActionBar(name);
  _renderGroupNav(name);
  if (name === 'roster')   _renderRoster();
  if (name === 'overview') _renderOverview();
  if (name === 'game')     _renderGame();
  if (name === 'finished') _renderFinished();
}

// ── Group nav (top pill tabs, visible only in game) ─────────────────────────
function _renderGroupNav(panel) {
  const nav = document.getElementById('ipt-group-nav');
  if (!nav) return;
  if (panel !== 'game') { nav.innerHTML = ''; return; }
  const trn = _getTrn();
  if (!trn?.ipt?.groups) return;
  nav.innerHTML = trn.ipt.groups.map((g, i) => `
    <button class="ipt-group-tab${i === _activeGroup ? ' active' : ''}"
      onclick="window._iptSwitchGroup(${i})">К${i+1} ${_esc(g.name)}</button>
  `).join('');
}

window._iptSwitchGroup = (gi) => {
  _activeGroup = gi;
  _activeRound = 0;
  const trn = _getTrn();
  if (trn?.ipt?.groups?.[gi]) _activeRound = trn.ipt.groups[gi].currentRound || 0;
  _renderGame();
  _renderGroupNav('game');
};

// ── Action bar ───────────────────────────────────────────────────────────────
function _renderActionBar(panel) {
  const bar = document.getElementById('ipt-action-bar');
  if (!bar) return;
  if (panel === 'roster') {
    bar.innerHTML = `<button class="btn-primary" id="ipt-launch-btn" onclick="window._iptLaunch()">🚀 Запустить IPT</button>`;
  } else if (panel === 'overview') {
    bar.innerHTML = `<button class="btn-primary" onclick="window._iptToGame()">▶ К игре</button>`;
  } else if (panel === 'game') {
    const trn = _getTrn();
    const group = trn?.ipt?.groups?.[_activeGroup];
    const round = group?.rounds?.[_activeRound];
    const allDone = round?.courts?.every(c => c.status === 'finished') ?? false;
    const isLastRound = group ? _activeRound >= group.rounds.length - 1 : false;
    const groupDone = group?.status === 'finished';
    if (groupDone) {
      const allGroupsDone = trn?.ipt?.groups?.every(g => g.status === 'finished') ?? false;
      bar.innerHTML = allGroupsDone
        ? `<button class="btn-primary" onclick="window._iptFinish()">🏆 Завершить турнир</button>`
        : `<div style="text-align:center;color:var(--plus);font:700 13px Barlow,sans-serif;padding:8px">✅ Группа завершена</div>`;
    } else {
      bar.innerHTML = `<button class="btn-primary"${allDone ? '' : ' disabled'}
        onclick="window._iptNextRound()">▶ Следующий раунд</button>`;
    }
  } else {
    bar.innerHTML = '';
  }
}

// ── ROSTER panel ─────────────────────────────────────────────────────────────
function _renderRoster() {
  const trn = _getTrn();
  if (!trn?.ipt) return;
  const ipt = trn.ipt;
  const db = window.loadPlayerDB();

  const courtsOpts = [1,2,3,4].map(n =>
    `<button class="ipt-seg-btn${ipt.courts===n?' active':''}" onclick="window._iptSetCourts(${n})">${n}</button>`
  ).join('');

  const limitOpts = [10,12,15,18,21].map(n =>
    `<button class="ipt-seg-btn${ipt.pointLimit===n?' active':''}" onclick="window._iptSetLimit(${n})">${n}</button>`
  ).join('');

  const finishOpts = [
    {v:'hard',   l:'Хард'},
    {v:'balance',l:'±2 Баланс'},
  ].map(f =>
    `<button class="ipt-seg-btn${ipt.finishType===f.v?' active':''}" onclick="window._iptSetFinish('${f.v}')">${f.l}</button>`
  ).join('');

  const genderOpts = [
    {v:'male',   l:'♂ М/М'},
    {v:'female', l:'♀ Ж/Ж'},
    {v:'mixed',  l:'⚡ М/Ж'},
  ].map(g =>
    `<button class="ipt-seg-btn${ipt.gender===g.v?' active':''}" onclick="window._iptSetGender('${g.v}')">${g.l}</button>`
  ).join('');

  const numGroups = ipt.courts;
  const groupNames = typeof getIPTGroupNames === 'function' ? getIPTGroupNames(numGroups) : [];
  const groupLabel = numGroups > 1
    ? groupNames.map((n,i) => `<span style="background:rgba(255,255,255,.07);padding:2px 6px;border-radius:6px;font-size:.85em">К${i+1}</span>`).join(' ')
    : '';
  const neededTotal = numGroups * 8;

  // Players from participants
  const players = (trn.participants || []).map(id => db.find(p => p.id === id)).filter(Boolean);
  const playerRows = players.map((p, i) => {
    const gRaw = String(p.gender || '').toLowerCase();
    const isW = gRaw === 'w' || gRaw === 'f' || gRaw === 'female';
    return `<div class="ipt-player-row">
      <span class="ipt-player-idx">${i+1}</span>
      <span class="ipt-player-name">${_esc(p.name || p.id)}</span>
      <span class="ipt-player-gender ${isW?'w':'m'}">${isW?'Ж':'М'}</span>
    </div>`;
  }).join('');

  const selCount = players.length;
  const counter = `<div class="ipt-sel-counter">Игроков: <span>${selCount}</span> / нужно <span>${neededTotal}</span></div>`;

  document.getElementById('ipt-roster-content').innerHTML = `
    <div class="ipt-settings-card">
      <div class="ipt-settings-title">⚙ Формат турнира</div>
      <span class="ipt-seg-lbl">Кортов (групп):</span>
      <div class="ipt-seg-row">${courtsOpts}</div>
      <div class="ipt-courts-info">
        ${groupLabel ? groupLabel + ' &nbsp;|&nbsp; ' : ''}
        <span>${numGroups} группа(ы) × 8 = <strong>${neededTotal} чел.</strong></span>
      </div>
      <span class="ipt-seg-lbl">Лимит очков:</span>
      <div class="ipt-seg-row">${limitOpts}</div>
      <span class="ipt-seg-lbl">Финиш:</span>
      <div class="ipt-seg-row">${finishOpts}</div>
      <span class="ipt-seg-lbl">Состав:</span>
      <div class="ipt-seg-row">${genderOpts}</div>
    </div>
    <div class="ipt-settings-card">
      <div class="ipt-settings-title">👥 Участники (${selCount} чел.)</div>
      <div class="ipt-player-list">${playerRows || '<div style="color:var(--muted);text-align:center;padding:12px">Нет участников</div>'}</div>
      ${counter}
    </div>
  `;
}

// Roster setting handlers
window._iptSetCourts  = (n) => { _saveField('courts', n);      _renderRoster(); _renderActionBar('roster'); };
window._iptSetLimit   = (n) => { _saveField('pointLimit', n);  _renderRoster(); };
window._iptSetFinish  = (v) => { _saveField('finishType', v);  _renderRoster(); };
window._iptSetGender  = (v) => { _saveField('gender', v);      _renderRoster(); };

// Launch IPT — генерируем группы с валидацией, потом сохраняем
window._iptLaunch = async () => {
  const arr = getTournaments();
  const trn = arr.find(t => t.id === _trnId);
  if (!trn?.ipt) return;
  const ipt = trn.ipt;

  const db = window.loadPlayerDB();
  const participants = (trn.participants || []);
  if (participants.length < 8) {
    window.showToast('❌ Нужно минимум 8 игроков', 'error'); return;
  }

  // "Preview generation": генерируем ДО confirm, при Cancel — отбрасываем
  const groups = generateIPTGroups(participants, ipt.gender, ipt.courts);

  // Валидация mixed на реальных группах
  if (ipt.gender === 'mixed') {
    const isFemale = id => {
      const p = db.find(d => d.id === id);
      const g = String(p?.gender || '').toLowerCase();
      return g === 'w' || g === 'f' || g === 'female';
    };
    const badGroups = groups
      .map((g, i) => { const w = g.players.filter(isFemale).length; const m = g.players.length - w; return {i: i+1, m, w}; })
      .filter(({m, w}) => m !== 4 || w !== 4);
    if (badGroups.length) {
      const lines = badGroups.map(({i,m,w}) => `Группа ${i}: ${m}м + ${w}ж`).join('\n');
      const ok = await window.showConfirm(
        `Гендерный баланс нарушен:\n${lines}\n\nПары будут без учёта пола. Продолжить?`
      );
      if (!ok) return;
    }
  }

  ipt.groups = groups;
  saveTournaments(arr);
  window._iptActiveTrnId = _trnId;
  _activeGroup = 0;
  _activeRound = 0;
  _showPanel('overview');
};

// ── OVERVIEW panel ───────────────────────────────────────────────────────────
function _renderOverview() {
  const trn = _getTrn();
  if (!trn?.ipt?.groups) return;
  const db = window.loadPlayerDB();
  const ipt = trn.ipt;
  const ICONS = ['👑','🔵','🟢','🟣'];

  const cards = ipt.groups.map((g, gi) => {
    const genderMode = ipt.gender;
    const players = g.players.map(id => db.find(p => p.id === id));
    let menPlayers, womenPlayers;
    if (genderMode === 'mixed') {
      const isFemale = id => { const p = db.find(d => d.id === id); const gd = String(p?.gender||'').toLowerCase(); return gd==='w'||gd==='f'||gd==='female'; };
      menPlayers   = g.players.filter(id => !isFemale(id)).map(id => db.find(p=>p.id===id));
      womenPlayers = g.players.filter(id => isFemale(id)).map(id => db.find(p=>p.id===id));
    } else {
      menPlayers   = players;
      womenPlayers = [];
    }

    const renderCol = (list, emoji, label) => {
      if (!list.length) return '';
      const rows = list.map((p, i) => `
        <div class="ipt-court-player">
          <span class="ipt-court-player-num">${i+1}</span>
          <span>${_esc(p?.name || p?.id || '—')}</span>
        </div>`).join('');
      return `<div>
        <div class="ipt-court-col-title">${emoji} ${label}</div>
        ${rows}
      </div>`;
    };

    const badgeText = genderMode === 'mixed'
      ? `${menPlayers.length}м + ${womenPlayers.length}ж`
      : `${players.length} игр.`;

    return `
      <div class="ipt-court-card">
        <div class="ipt-court-hdr c${gi}">
          <span>${ICONS[gi] || '⚪'} КОРТ${gi+1} — ${_esc(g.name)}</span>
          <span class="ipt-court-hdr-badge">${badgeText}</span>
        </div>
        <div class="ipt-court-body">
          ${genderMode === 'mixed'
            ? renderCol(menPlayers, '♂', 'МУЖЧИНЫ') + renderCol(womenPlayers, '♀', 'ЖЕНЩИНЫ')
            : renderCol(players, '👤', 'ИГРОКИ')}
        </div>
      </div>`;
  }).join('');

  document.getElementById('ipt-overview-content').innerHTML =
    `<div class="ipt-overview-grid">${cards}</div>`;
}

window._iptToGame = () => {
  const trn = _getTrn();
  if (!trn?.ipt?.groups) return;
  _activeGroup = 0;
  _activeRound = trn.ipt.groups[0]?.currentRound || 0;
  window._iptActiveTrnId = _trnId;
  _showPanel('game');
};

// ── GAME panel ───────────────────────────────────────────────────────────────
function _renderGame() {
  const trn = _getTrn();
  if (!trn?.ipt?.groups) return;
  const ipt = trn.ipt;
  const group = ipt.groups[_activeGroup];
  if (!group) return;
  const round = group.rounds[_activeRound];

  // Round tabs
  const roundTabs = group.rounds.map((r, ri) => {
    const isDone = r.status === 'finished';
    const isActive = ri === _activeRound;
    return `<button class="ipt-round-tab${isActive?' active':''}${isDone&&!isActive?' done':''}"
      onclick="window._iptSetRound(${ri})">${ri+1} РАУНД</button>`;
  }).join('');

  // Match cards
  const db = window.loadPlayerDB();
  const matchCards = (round?.courts || []).map((court, cn) => {
    const isDone = court.status === 'finished';
    const label = String.fromCharCode(65 + cn); // A, B, C...
    const t1Names = (court.team1 || []).map(id => db.find(p=>p.id===id)?.name || id).join(' · ');
    const t2Names = (court.team2 || []).map(id => db.find(p=>p.id===id)?.name || id).join(' · ');
    const s1 = court.score1 || 0;
    const s2 = court.score2 || 0;
    const win1 = isDone && s1 > s2, win2 = isDone && s2 > s1;
    const cls1 = win1 ? ' winning' : (isDone && !win1 ? ' losing' : '');
    const cls2 = win2 ? ' winning' : (isDone && !win2 ? ' losing' : '');

    return `
      <div class="ipt-match-card">
        <div class="ipt-match-hdr">
          <span class="ipt-court-label">КОРТ ${label}</span>
          ${isDone ? '<span class="ipt-match-done-badge">✅ ЗАВЕРШЕНО</span>' : '<span style="color:var(--blue)">● ИДЁТ</span>'}
        </div>
        <div class="ipt-match-row">
          <div class="ipt-match-team">
            ${(court.team1||[]).map(id=>`<div class="ipt-team-name">${_esc(db.find(p=>p.id===id)?.name||id)}</div>`).join('')}
          </div>
          <div class="ipt-score-block">
            <button class="ipt-sc-btn" ${isDone?'disabled':''} onclick="window._iptScore(${_activeGroup},${_activeRound},${cn},1,-1)">−</button>
            <span class="ipt-sc-val${cls1}" id="ipt-sc-${_activeGroup}-${_activeRound}-${cn}-1"
              ondblclick="window._iptEditScore(this,${_activeGroup},${_activeRound},${cn},1)">${s1}</span>
            <button class="ipt-sc-btn" ${isDone?'disabled':''} onclick="window._iptScore(${_activeGroup},${_activeRound},${cn},1,1)">+</button>
          </div>
        </div>
        <div class="ipt-match-vs">VS</div>
        <div class="ipt-match-sep"></div>
        <div class="ipt-match-row ipt-match-row2">
          <div class="ipt-match-team">
            ${(court.team2||[]).map(id=>`<div class="ipt-team-name">${_esc(db.find(p=>p.id===id)?.name||id)}</div>`).join('')}
          </div>
          <div class="ipt-score-block">
            <button class="ipt-sc-btn" ${isDone?'disabled':''} onclick="window._iptScore(${_activeGroup},${_activeRound},${cn},2,-1)">−</button>
            <span class="ipt-sc-val${cls2}" id="ipt-sc-${_activeGroup}-${_activeRound}-${cn}-2"
              ondblclick="window._iptEditScore(this,${_activeGroup},${_activeRound},${cn},2)">${s2}</span>
            <button class="ipt-sc-btn" ${isDone?'disabled':''} onclick="window._iptScore(${_activeGroup},${_activeRound},${cn},2,1)">+</button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Standings table
  const standings = (typeof calcIPTGroupStandings === 'function')
    ? calcIPTGroupStandings(group, ipt.pointLimit, ipt.finishType)
    : [];

  const pRounds = group.rounds.length;
  const thRounds = Array.from({length: pRounds}, (_, i) => `<th>P${i+1}</th>`).join('');
  const standingRows = standings.map((s, rank) => {
    const p = db.find(pl => pl.id === s.playerId);
    const name = p?.name || s.playerId;
    const diffCls = s.diff > 0 ? ' ipt-diff-pos' : (s.diff < 0 ? ' ipt-diff-neg' : '');
    const wrStr = s.matches > 0 ? Math.round(s.wr * 100) + '%' : '—';
    // Per-round scores
    const roundScores = Array.from({length: pRounds}, (_, ri) => {
      const rnd = group.rounds[ri];
      let scored = null;
      rnd?.courts?.forEach(c => {
        if ((c.team1||[]).includes(s.playerId)) scored = c.score1;
        if ((c.team2||[]).includes(s.playerId)) scored = c.score2;
      });
      return `<td>${scored !== null ? scored : '—'}</td>`;
    }).join('');
    return `<tr${rank<3?' class="top-row"':''}>
      <td class="ipt-rank-cell">${rank+1}</td>
      <td class="name-col">${_esc(name)}</td>
      ${roundScores}
      <td>${s.wins}</td>
      <td class="ipt-wr-val">${wrStr}</td>
      <td class="${diffCls}">${s.diff > 0 ? '+' : ''}${s.diff}</td>
      <td class="ipt-pts-val">${s.pts}</td>
    </tr>`;
  }).join('');

  const groupBadge = `${ipt.pointLimit} · ${ipt.finishType === 'hard' ? 'хард' : 'баланс'}`;

  document.getElementById('ipt-game-content').innerHTML = `
    <div class="ipt-group-header">
      <span class="ipt-group-name">${_esc(group.name)}</span>
      <span class="ipt-group-badge">⚡ ${groupBadge}</span>
    </div>
    <div class="ipt-round-tabs">${roundTabs}</div>
    <div class="ipt-match-list">${matchCards}</div>
    <div class="ipt-standings-wrap">
      <div class="ipt-standings-title">📊 Таблица — ${_esc(group.name)}</div>
      <div class="ipt-standings-scroll">
        <table class="ipt-standings-table">
          <thead><tr><th>#</th><th class="name-col">Игрок</th>${thRounds}<th>B</th><th>WR</th><th>±</th><th>Оч</th></tr></thead>
          <tbody>${standingRows}</tbody>
        </table>
      </div>
    </div>
  `;

  _renderActionBar('game');
  _renderGroupNav('game');
}

window._iptSetRound = (ri) => {
  _activeRound = ri;
  _renderGame();
};

// Score button handler
window._iptScore = (gi, rn, cn, team, delta) => {
  window.activeTabId = gi;
  window._iptActiveTrnId = _trnId;
  iptApplyScore(_trnId, gi, rn, cn, team, delta);
  const trn = _getTrn();
  if (trn?.ipt?.groups?.[gi]) _activeRound = trn.ipt.groups[gi].currentRound || rn;
  _renderGame();
};

// Inline score edit (double-tap)
window._iptEditScore = (el, gi, rn, cn, team) => {
  if (el.querySelector('input')) return;
  const cur = el.textContent.trim();
  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = 0; inp.max = 99;
  inp.value = cur; inp.className = 'ipt-score-input';
  el.textContent = '';
  el.appendChild(inp);
  inp.focus(); inp.select();
  const confirm = () => {
    const v = parseInt(inp.value, 10);
    window._iptActiveTrnId = _trnId;
    window.activeTabId = gi;
    iptSetScore(_trnId, gi, rn, cn, team, isNaN(v) ? 0 : v);
    const trn = _getTrn();
    if (trn?.ipt?.groups?.[gi]) _activeRound = trn.ipt.groups[gi].currentRound || rn;
    _renderGame();
  };
  inp.addEventListener('blur', confirm);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
};

// Next round
window._iptNextRound = () => {
  window._iptActiveTrnId = _trnId;
  finishIPTRound(_trnId, _activeGroup);
  const trn = _getTrn();
  const group = trn?.ipt?.groups?.[_activeGroup];
  if (group) _activeRound = group.currentRound || 0;
  _renderGame();
};

// Finish tournament (calls finishIPT which shows own confirm)
window._iptFinish = async () => {
  window._iptActiveTrnId = _trnId;
  await finishIPT(_trnId);
  // Check if user actually confirmed (finishIPT returns early on cancel)
  const trn = _getTrn();
  if (!trn || trn.status !== 'finished') return;
  _setServerSyncStatus('local_only');
  _showPanel('finished');
};

// ── serverSyncStatus helpers ─────────────────────────────────────────────────
function _setServerSyncStatus(status) {
  const arr = getTournaments();
  const trn = arr.find(t => t.id === _trnId);
  if (!trn?.ipt) return;
  trn.ipt.serverSyncStatus = status;
  saveTournaments(arr);
}

function _buildServerPayload() {
  const trn = _getTrn();
  if (!trn?.ipt?.groups) return [];
  const ipt = trn.ipt;
  return ipt.groups.flatMap(g =>
    (typeof calcIPTGroupStandings === 'function'
      ? calcIPTGroupStandings(g, ipt.pointLimit, ipt.finishType)
      : []
    ).map((s, i) => ({
      player_id:  s.playerId,
      placement:  i + 1,
      points:     window.calculateRanking(i + 1),
      format:     'IPT',
      division:   g.name,
    }))
  );
}

// ── FINISHED panel ───────────────────────────────────────────────────────────
function _renderFinished() {
  const trn = _getTrn();
  if (!trn?.ipt) return;
  const ipt = trn.ipt;
  const db = window.loadPlayerDB();
  const MEDALS = ['🥇','🥈','🥉'];
  const MEDAL_CLS = ['gold','silver','bronze'];

  const groupResults = (ipt.groups || []).map(g => {
    const standings = (typeof calcIPTGroupStandings === 'function')
      ? calcIPTGroupStandings(g, ipt.pointLimit, ipt.finishType)
      : [];
    const podium = standings.slice(0, 3).map((s, i) => {
      const p = db.find(pl => pl.id === s.playerId);
      return `<div class="ipt-podium-card ${MEDAL_CLS[i]||''}">
        <div class="ipt-podium-place">${MEDALS[i]||i+1}</div>
        <div class="ipt-podium-name">${_esc(p?.name || s.playerId)}</div>
        <div class="ipt-podium-stat">${s.wins}В · ${s.diff>0?'+':''}${s.diff}</div>
      </div>`;
    }).join('');

    const tableRows = standings.map((s, rank) => {
      const p = db.find(pl => pl.id === s.playerId);
      const diffCls = s.diff > 0 ? ' ipt-diff-pos' : (s.diff < 0 ? ' ipt-diff-neg' : '');
      return `<tr${rank<3?' class="top-row"':''}>
        <td class="ipt-rank-cell">${rank+1}</td>
        <td class="name-col">${_esc(p?.name || s.playerId)}</td>
        <td>${s.wins}</td>
        <td class="${diffCls}">${s.diff>0?'+':''}${s.diff}</td>
        <td class="ipt-pts-val">${s.pts}</td>
      </tr>`;
    }).join('');

    return `<div class="ipt-group-result">
      <div class="ipt-group-result-title">${_esc(g.name)}</div>
      <div class="ipt-podium">${podium}</div>
      <div class="ipt-standings-wrap">
        <div class="ipt-standings-scroll">
          <table class="ipt-standings-table">
            <thead><tr><th>#</th><th class="name-col">Игрок</th><th>В</th><th>±</th><th>Оч</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }).join('');

  // Server sync UI
  const syncStatus = ipt.serverSyncStatus || 'local_only';
  let syncHtml = '';
  if (syncStatus === 'local_only') {
    syncHtml = `<div class="ipt-sync-status local_only">💾 Результаты сохранены локально</div>
      <button class="btn-secondary" onclick="window._iptSubmitServer()">📤 Отправить на сервер</button>`;
  } else if (syncStatus === 'submitting') {
    syncHtml = `<div class="ipt-sync-status submitting">⏳ Отправка на сервер…</div>
      <button class="btn-secondary" disabled>📤 Отправка…</button>`;
  } else if (syncStatus === 'ok') {
    syncHtml = `<div class="ipt-sync-status ok">✅ Результаты отправлены на сервер</div>`;
  } else if (syncStatus === 'error') {
    syncHtml = `<div class="ipt-sync-status error">❌ Ошибка отправки</div>
      <button class="btn-secondary btn-danger" onclick="window._iptSubmitServer()">🔄 Повторить</button>`;
  }

  document.getElementById('ipt-finished-content').innerHTML = `
    <div class="ipt-finished-header">
      <div class="ipt-finished-icon">🏆</div>
      <div class="ipt-finished-title">IPT ЗАВЕРШЁН</div>
      <div class="ipt-finished-sub">${_esc(trn.name || 'Double Trouble')}</div>
    </div>
    ${groupResults}
    <div class="ipt-sync-block">
      ${syncHtml}
      <div class="ipt-sync-warn">⚠️ Статистика игроков обновится при следующем открытии раздела «Игроки» в приложении</div>
    </div>
  `;
}

// Server submit
window._iptSubmitServer = async () => {
  _setServerSyncStatus('submitting');
  _renderFinished();
  try {
    const api = globalThis.sharedApi;
    if (!api?.finalizeTournament) throw new Error('API недоступен');
    const payload = _buildServerPayload();
    await api.finalizeTournament(_trnId, payload);
    _setServerSyncStatus('ok');
  } catch (e) {
    console.error('[IPT] server submit failed:', e);
    _setServerSyncStatus('error');
  }
  _renderFinished();
};

// ── Back button ──────────────────────────────────────────────────────────────
document.getElementById('ipt-back-btn')?.addEventListener('click', () => {
  history.length > 1 ? history.back() : (location.href = '../../index.html');
});

// ── Boot ─────────────────────────────────────────────────────────────────────
(function boot() {
  const trn = _getTrn();
  const panel = _getInitialPanel(trn);

  if (panel === 'error') {
    document.querySelector('.fmt-content').innerHTML = `
      <div style="text-align:center;padding:40px 20px">
        <div style="font-size:3rem">😕</div>
        <div style="font:700 1.1rem Barlow,sans-serif;color:var(--gold);margin-top:8px">Турнир не найден</div>
        <div style="font:.85em Barlow,sans-serif;color:var(--muted);margin-top:6px">ID: ${_esc(_trnId)}</div>
        <button class="btn-secondary" style="margin-top:20px;max-width:200px"
          onclick="location.href='../../index.html'">← На главную</button>
      </div>`;
    return;
  }

  window._iptActiveTrnId = _trnId;
  if (trn?.ipt?.groups) {
    _activeGroup = trn.ipt.currentGroup || 0;
    _activeRound = trn.ipt.groups[_activeGroup]?.currentRound || 0;
  }
  _showPanel(panel);
})();
