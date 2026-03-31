'use strict';

// IMPORTANT: This standalone relies on ipt-format.js being a classic script
// with declarations only. If eager top-level side effects are added there,
// this page can silently break.

(function initIptStandalone() {
  const params = new URLSearchParams(window.location.search);
  const trnId = params.get('trnId') || 'ipt_quick';

  let activePanel = 'error';
  let activeGroup = 0;
  let activeRound = 0;

  const panelIds = ['error', 'roster', 'overview', 'game', 'finished'];
  const syncPill = () => document.getElementById('ipt-sync-pill');

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function getTournament() {
    return getTournaments().find(item => item.id === trnId) || null;
  }

  function saveTournament(mutator) {
    const arr = getTournaments();
    const idx = arr.findIndex(item => item.id === trnId);
    if (idx === -1) return null;
    mutator(arr[idx]);
    saveTournaments(arr);
    return arr[idx];
  }

  function playerName(id) {
    return getPlayerById(id)?.name || String(id || '?');
  }

  function playerGender(id) {
    return getPlayerById(id)?.gender === 'W' ? 'W' : 'M';
  }

  function showPanel(panel) {
    activePanel = panel;
    panelIds.forEach(id => {
      const node = document.getElementById('ipt-' + id + '-panel');
      if (node) node.classList.toggle('active', id === panel);
    });
    render();
  }

  window.switchTab = function switchTabIpt(tab) {
    if (tab === 'roster' || tab === 'hard') {
      showPanel('finished');
      return;
    }
    if (typeof tab === 'number') return;
    console.warn('[IPT standalone] switchTab unknown:', tab);
  };

  window._iptRerender = function rerenderStandalone() {
    render();
  };

  function getInitialPanel(trn) {
    if (!trn?.ipt) return 'error';
    if (trn.status === 'finished') return 'finished';
    if (!trn.ipt.groups) return 'roster';
    if (trn.ipt.groups.every(group => group.status === 'finished')) return 'finished';
    if (trn.ipt.groups.some(group => (group.currentRound || 0) > 0)) return 'game';
    return 'overview';
  }

  function updateSyncPill(trn) {
    const pill = syncPill();
    if (!pill) return;
    const status = trn?.ipt?.serverSyncStatus || 'none';
    const labels = {
      none: 'Черновик',
      local_only: 'Локально',
      submitting: 'Отправка…',
      ok: 'Синхронизировано',
      error: 'Ошибка sync',
    };
    pill.textContent = labels[status] || labels.none;
    pill.className = 'ipt-sync-pill' + (status === 'ok' ? ' ipt-sync-ok' : status === 'error' ? ' ipt-sync-error' : '');
  }

  function setServerSyncStatus(status) {
    saveTournament(trn => {
      if (!trn.ipt) trn.ipt = {};
      trn.ipt.serverSyncStatus = status;
    });
    updateSyncPill(getTournament());
  }

  function renderLoading(message) {
    const panel = document.getElementById('ipt-error-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="ipt-card">
        <h1 class="ipt-title">Загрузка IPT</h1>
        <div class="ipt-note">${esc(message || 'Подтягиваем турнир из админки...')}</div>
      </div>`;
  }

  function renderError(message) {
    const panel = document.getElementById('ipt-error-panel');
    panel.innerHTML = `
      <div class="ipt-card">
        <h1 class="ipt-title">Турнир не найден</h1>
        <div class="ipt-note">${esc(message || 'Не удалось открыть IPT сессию.')}</div>
        <div class="ipt-row">
          <button type="button" class="ipt-action secondary" onclick="window.location.href='../../index.html'">← На главную</button>
        </div>
      </div>`;
  }

  async function ensureTournamentLoaded() {
    const existing = getTournament();
    if (trnId === 'ipt_quick') return existing;
    if (typeof window.bootstrapAdminIptTournament !== 'function') return existing;

    try {
      renderLoading('Загружаем турнир и ростер...');
      const loaded = await window.bootstrapAdminIptTournament(trnId);
      return loaded || getTournament();
    } catch (error) {
      console.error('[IPT standalone] bootstrap failed:', error);
      renderError((error && error.message) || ('Не удалось загрузить турнир ' + trnId));
      return null;
    }
  }

  function renderRoster(trn) {
    const panel = document.getElementById('ipt-roster-panel');
    if (!trn?.ipt) return;
    const ipt = trn.ipt;
    const participants = Array.isArray(trn.participants) ? trn.participants : [];
    const warnings = [];
    if (ipt.gender === 'mixed') {
      const preview = generateIPTGroups(participants, ipt.gender, ipt.courts || 1);
      const bad = preview
        .map((group, index) => {
          const women = group.players.filter(id => playerGender(id) === 'W').length;
          const men = group.players.length - women;
          return { index: index + 1, men, women };
        })
        .filter(row => row.men !== 4 || row.women !== 4);
      if (bad.length) {
        warnings.push('⚠️ Гендерный баланс нарушен:\n' + bad.map(row => `Группа ${row.index}: ${row.men}м + ${row.women}ж`).join('\n'));
      }
    }

    const rows = participants.map((id, index) => {
      const player = getPlayerById(id);
      const badge = player?.gender === 'W' ? 'Ж' : 'М';
      return `<div class="ipt-player-line">${index + 1}. ${esc(player?.name || id)} <span class="ipt-note">· ${badge}</span></div>`;
    }).join('') || `<div class="ipt-empty">Участники не выбраны</div>`;

    panel.innerHTML = `
      <div class="ipt-card">
        <h1 class="ipt-title">✏️ РОСТЕР</h1>
        <div class="ipt-subtitle">Настройки турнира и состав игроков</div>
        <div class="ipt-row">
          <span class="ipt-label">Кортов</span>
          <div class="ipt-seg">${[1,2,3,4].map(value => `<button type="button" class="ipt-chip${ipt.courts === value ? ' on' : ''}" onclick="window._iptSetCourts(${value})">${value}</button>`).join('')}</div>
        </div>
        <div class="ipt-row">
          <span class="ipt-label">Лимит</span>
          <div class="ipt-seg">${[10,12,15,18,21].map(value => `<button type="button" class="ipt-chip${ipt.pointLimit === value ? ' on' : ''}" onclick="window._iptSetLimit(${value})">${value}</button>`).join('')}</div>
        </div>
        <div class="ipt-row">
          <span class="ipt-label">Финиш</span>
          <div class="ipt-seg">
            <button type="button" class="ipt-chip${ipt.finishType === 'hard' ? ' on' : ''}" onclick="window._iptSetFinish('hard')">Хард</button>
            <button type="button" class="ipt-chip${ipt.finishType === 'balance' ? ' on' : ''}" onclick="window._iptSetFinish('balance')">±2 Баланс</button>
          </div>
        </div>
        <div class="ipt-row">
          <span class="ipt-label">Состав</span>
          <div class="ipt-seg">
            <button type="button" class="ipt-chip${ipt.gender === 'male' ? ' on' : ''}" onclick="window._iptSetGender('male')">М/М</button>
            <button type="button" class="ipt-chip${ipt.gender === 'female' ? ' on' : ''}" onclick="window._iptSetGender('female')">Ж/Ж</button>
            <button type="button" class="ipt-chip${ipt.gender === 'mixed' ? ' on' : ''}" onclick="window._iptSetGender('mixed')">М/Ж</button>
          </div>
        </div>
        ${warnings.length ? `<div class="ipt-warning">${esc(warnings.join('\n'))}</div>` : ''}
        <div class="ipt-card" style="margin:12px 0 0;padding:12px">
          <div class="ipt-subtitle">Игроки (${participants.length})</div>
          ${rows}
        </div>
        <div class="ipt-row">
          <button type="button" class="ipt-action" onclick="window._iptLaunch()">🚀 Запустить IPT</button>
        </div>
      </div>`;
  }

  function renderOverview(trn) {
    const panel = document.getElementById('ipt-overview-panel');
    const groups = trn?.ipt?.groups || [];
    panel.innerHTML = `
      <div class="ipt-card">
        <h1 class="ipt-title">👀 ОБЗОР КОРТОВ</h1>
        <div class="ipt-subtitle">Группы и составы до старта игры</div>
      </div>
      <div class="ipt-overview-grid">
        ${groups.map((group, index) => {
          const men = group.players.filter(id => playerGender(id) !== 'W');
          const women = group.players.filter(id => playerGender(id) === 'W');
          return `<div class="ipt-court-card">
            <div class="ipt-court-head">
              <span>${index === 0 ? '👑' : index === 1 ? '🔵' : index === 2 ? '🟢' : '🟣'} ${esc(group.name)}</span>
              <span class="ipt-court-badge">${men.length}м + ${women.length}ж</span>
            </div>
            <div class="ipt-columns">
              <div>
                <div class="ipt-col-title">Мужчины</div>
                ${men.map((id, row) => `<div class="ipt-player-line">${row + 1}. ${esc(playerName(id))}</div>`).join('') || '<div class="ipt-empty">—</div>'}
              </div>
              <div>
                <div class="ipt-col-title">Женщины</div>
                ${women.map((id, row) => `<div class="ipt-player-line">${row + 1}. ${esc(playerName(id))}</div>`).join('') || '<div class="ipt-empty">—</div>'}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="ipt-row">
        <button type="button" class="ipt-action" onclick="window._iptGoGame()">▶ К игре</button>
      </div>`;
  }

  function standingsRows(group, ipt) {
    const standings = calcIPTGroupStandings(group, ipt.pointLimit, ipt.finishType);
    const roundCount = group.rounds.length;
    const scoreFor = (playerId, roundIdx) => {
      const round = group.rounds[roundIdx];
      for (const court of round.courts) {
        if ((court.team1 || []).includes(playerId)) return (court.score1 || court.score2) ? court.score1 : '—';
        if ((court.team2 || []).includes(playerId)) return (court.score1 || court.score2) ? court.score2 : '—';
      }
      return 'B';
    };
    return `
      <div class="ipt-table-wrap">
        <table class="ipt-table">
          <thead>
            <tr><th>#</th><th>Игрок</th>${Array.from({ length: roundCount }, (_, i) => `<th>P${i + 1}</th>`).join('')}<th>WR</th><th>±</th><th>Оч</th></tr>
          </thead>
          <tbody>
            ${standings.map((row, idx) => `<tr>
              <td>${idx + 1}</td>
              <td>${esc(playerName(row.playerId))}</td>
              ${Array.from({ length: roundCount }, (_, i) => `<td>${scoreFor(row.playerId, i)}</td>`).join('')}
              <td>${Math.round((row.wr || 0) * 100)}%</td>
              <td>${row.diff >= 0 ? '+' : ''}${row.diff}</td>
              <td>${row.pts}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderGame(trn) {
    const panel = document.getElementById('ipt-game-panel');
    const ipt = trn?.ipt;
    if (!ipt?.groups?.length) {
      panel.innerHTML = '<div class="ipt-card"><div class="ipt-empty">Группы ещё не созданы</div></div>';
      return;
    }
    activeGroup = Math.max(0, Math.min(activeGroup, ipt.groups.length - 1));
    const group = ipt.groups[activeGroup];
    activeRound = Math.max(0, Math.min(activeRound, group.rounds.length - 1));
    const round = group.rounds[activeRound];
    const canAdvance = round.courts.every(court => court.status === 'finished');
    const isLastRound = activeRound >= group.rounds.length - 1;

    panel.innerHTML = `
      <div class="ipt-card">
        <div class="ipt-tabs">
          ${ipt.groups.map((item, index) => `<button type="button" class="ipt-tab${index === activeGroup ? ' on' : ''}" onclick="window._iptSetGroup(${index})">К${index + 1} ${esc(item.name)}</button>`).join('')}
        </div>
        <div class="ipt-round-tabs">
          ${group.rounds.map((item, index) => `<button type="button" class="ipt-round-tab${index === activeRound ? ' on' : ''}" onclick="window._iptSetRound(${index})">${index + 1} РАУНД</button>`).join('')}
        </div>
        <h1 class="ipt-title">${esc(group.name)} <span class="ipt-note">⚡ ${ipt.pointLimit} · ${ipt.finishType === 'balance' ? 'баланс' : 'хард'}</span></h1>
      </div>
      <div class="ipt-courts-grid">
        ${round.courts.map((court, courtIndex) => {
          const status = court.status === 'finished' ? 'ЗАВЕРШЕНО' : court.status === 'waiting' ? 'ОЖИДАНИЕ' : 'ИГРА';
          const disabled = court.status === 'waiting' || trn.status === 'finished';
          return `<div class="ipt-match-card">
            <div class="ipt-match-head">
              <strong>КОРТ ${String.fromCharCode(65 + courtIndex)}</strong>
              <span class="ipt-status">${status}</span>
            </div>
            <div class="ipt-team">
              <div class="ipt-team-names">${court.team1.map(playerName).map(esc).join(' + ')}</div>
              <div class="ipt-score-row">
                <button type="button" class="ipt-score-btn" ${disabled || court.score1 <= 0 ? 'disabled' : ''} onclick="window._iptDelta(${activeGroup},${activeRound},${courtIndex},1,-1)">−</button>
                <div class="ipt-score" ondblclick="window._iptEditScore(${activeGroup},${activeRound},${courtIndex},1)">${court.score1}</div>
                <button type="button" class="ipt-score-btn" ${disabled ? 'disabled' : ''} onclick="window._iptDelta(${activeGroup},${activeRound},${courtIndex},1,1)">+</button>
              </div>
            </div>
            <div class="ipt-vs">vs</div>
            <div class="ipt-team">
              <div class="ipt-team-names">${court.team2.map(playerName).map(esc).join(' + ')}</div>
              <div class="ipt-score-row">
                <button type="button" class="ipt-score-btn" ${disabled || court.score2 <= 0 ? 'disabled' : ''} onclick="window._iptDelta(${activeGroup},${activeRound},${courtIndex},2,-1)">−</button>
                <div class="ipt-score" ondblclick="window._iptEditScore(${activeGroup},${activeRound},${courtIndex},2)">${court.score2}</div>
                <button type="button" class="ipt-score-btn" ${disabled ? 'disabled' : ''} onclick="window._iptDelta(${activeGroup},${activeRound},${courtIndex},2,1)">+</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
      ${standingsRows(group, ipt)}
      <div class="ipt-row">
        ${!isLastRound ? `<button type="button" class="ipt-action" ${canAdvance ? '' : 'disabled'} onclick="window._iptNextRound()">▶ Следующий раунд</button>` : ''}
        ${isLastRound ? `<button type="button" class="ipt-action danger" ${canAdvance ? '' : 'disabled'} onclick="window._iptFinish()">🏁 Завершить IPT</button>` : ''}
      </div>`;
  }

  function renderFinished(trn) {
    const panel = document.getElementById('ipt-finished-panel');
    const ipt = trn?.ipt;
    const syncStatus = ipt?.serverSyncStatus || 'none';
    const syncText = {
      none: 'Локальное завершение ещё не подтверждено',
      local_only: 'Результаты сохранены локально',
      submitting: 'Отправляем результаты на сервер…',
      ok: '✅ Результаты отправлены',
      error: '❌ Ошибка отправки',
    }[syncStatus] || 'Локально';

    panel.innerHTML = `
      <div class="ipt-card">
        <h1 class="ipt-title">🏆 IPT завершён</h1>
        <div class="ipt-note">${esc(syncText)}</div>
        <div class="ipt-note">⚠️ Статистика игроков обновится при следующем открытии раздела Игроки.</div>
      </div>
      ${ipt.groups.map(group => {
        const standings = calcIPTGroupStandings(group, ipt.pointLimit, ipt.finishType);
        return `<div class="ipt-card">
          <h2 class="ipt-title">${esc(group.name)}</h2>
          <div class="ipt-podium">
            ${standings.slice(0, 3).map((row, idx) => `<div class="ipt-podium-card">
              <div>${['🥇', '🥈', '🥉'][idx]}</div>
              <div>${esc(playerName(row.playerId))}</div>
              <div class="ipt-note">${row.pts} оч</div>
            </div>`).join('')}
          </div>
          ${standingsRows(group, ipt)}
        </div>`;
      }).join('')}
      <div class="ipt-row">
        <button type="button" class="ipt-action" ${syncStatus === 'submitting' || syncStatus === 'ok' ? 'disabled' : ''} onclick="window._iptSubmitServer()">📤 Отправить на сервер</button>
      </div>`;
  }

  function render() {
    const trn = getTournament();
    updateSyncPill(trn);
    if (!trn?.ipt) {
      renderError(`Турнир ${trnId} не найден в localStorage.`);
      activePanel = 'error';
      document.getElementById('ipt-error-panel').classList.add('active');
      return;
    }
    if (activePanel === 'roster') renderRoster(trn);
    if (activePanel === 'overview') renderOverview(trn);
    if (activePanel === 'game') renderGame(trn);
    if (activePanel === 'finished') renderFinished(trn);
  }

  function buildPayload() {
    const trn = getTournament();
    const ipt = trn.ipt;
    return ipt.groups.flatMap(group =>
      calcIPTGroupStandings(group, ipt.pointLimit, ipt.finishType).map((row, index) => ({
        playerName: playerName(row.playerId),
        gender: playerGender(row.playerId),
        placement: index + 1,
        points: calculateRanking(index + 1),
        format: 'IPT',
        division: group.name,
      }))
    );
  }

  window._iptSetCourts = function setCourts(value) {
    saveTournament(trn => { trn.ipt.courts = value; });
    render();
  };
  window._iptSetLimit = function setLimit(value) {
    saveTournament(trn => { trn.ipt.pointLimit = value; });
    render();
  };
  window._iptSetFinish = function setFinish(value) {
    saveTournament(trn => { trn.ipt.finishType = value; });
    render();
  };
  window._iptSetGender = function setGender(value) {
    saveTournament(trn => { trn.ipt.gender = value; });
    render();
  };
  window._iptLaunch = async function launchIpt() {
    const trn = getTournament();
    if (!trn?.ipt) return;
    const groups = generateIPTGroups(trn.participants || [], trn.ipt.gender, trn.ipt.courts);
    if (trn.ipt.gender === 'mixed') {
      const bad = groups
        .map((group, index) => {
          const women = group.players.filter(id => playerGender(id) === 'W').length;
          const men = group.players.length - women;
          return { index: index + 1, men, women };
        })
        .filter(item => item.men !== 4 || item.women !== 4);
      if (bad.length) {
        const text = bad.map(item => `Группа ${item.index}: ${item.men}м + ${item.women}ж`).join('\n');
        const ok = await showConfirm(`Гендерный баланс нарушен:\n${text}\n\nПары будут без учёта пола. Продолжить?`);
        if (!ok) return;
      }
    }
    saveTournament(trnState => {
      trnState.ipt.groups = groups;
      trnState.ipt.serverSyncStatus = 'none';
    });
    activeGroup = 0;
    activeRound = 0;
    showPanel('overview');
  };
  window._iptGoGame = function goGame() { showPanel('game'); };
  window._iptSetGroup = function setGroup(index) {
    activeGroup = index;
    activeRound = 0;
    render();
  };
  window._iptSetRound = function setRound(index) {
    activeRound = index;
    saveTournament(trn => { trn.ipt.groups[activeGroup].currentRound = index; });
    render();
  };
  window._iptDelta = function delta(groupIdx, roundIdx, courtIdx, team, delta) {
    iptApplyScore(trnId, groupIdx, roundIdx, courtIdx, team, delta);
    const trn = getTournament();
    activeRound = roundIdx;
    if (trn?.ipt?.groups?.[groupIdx]) activeGroup = groupIdx;
    render();
  };
  window._iptEditScore = function editScore(groupIdx, roundIdx, courtIdx, team) {
    const value = window.prompt('Введите счёт', '0');
    if (value == null) return;
    iptSetScore(trnId, groupIdx, roundIdx, courtIdx, team, Number(value));
    activeRound = roundIdx;
    activeGroup = groupIdx;
    render();
  };
  window._iptNextRound = function nextRound() {
    finishIPTRound(trnId, activeGroup);
    const trn = getTournament();
    if (trn?.ipt?.groups?.every(group => group.status === 'finished')) {
      showPanel('finished');
      return;
    }
    activeRound = trn?.ipt?.groups?.[activeGroup]?.currentRound || 0;
    render();
  };
  window._iptFinish = async function finishStandalone() {
    await finishIPT(trnId);
    const trn = getTournament();
    if (!trn || trn.status !== 'finished') return;
    setServerSyncStatus('local_only');
    showPanel('finished');
  };
  window._iptSubmitServer = async function submitServer() {
    setServerSyncStatus('submitting');
    render();
    try {
      await sharedApi.finalizeTournament(trnId, buildPayload());
      setServerSyncStatus('ok');
      showToast('Результаты отправлены', 'success');
    } catch (error) {
      console.error(error);
      setServerSyncStatus('error');
      showToast('Не удалось отправить результаты', 'error');
    }
    render();
  };

  (async function bootstrapStandalone() {
    activePanel = 'error';
    panelIds.forEach(id => {
      const node = document.getElementById('ipt-' + id + '-panel');
      if (node) node.classList.toggle('active', id === 'error');
    });
    renderLoading('Загружаем турнир и ростер...');
    const initialTournament = await ensureTournamentLoaded();
    if (!initialTournament?.ipt) {
      showPanel('error');
      renderError(`Турнир ${trnId} не найден.`);
      return;
    }
    activePanel = getInitialPanel(initialTournament);
    showPanel(activePanel);
  })();
})();
