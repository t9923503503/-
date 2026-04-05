'use strict';

(function () {
  const API      = 'https://sv-ugra.ru/api/rest/v1';
  const TOKEN_KEY = 'admin_jwt';

  // ── Auth helpers ──────────────────────────────────────────
  function getToken()          { return sessionStorage.getItem(TOKEN_KEY); }
  function setToken(t)         { sessionStorage.setItem(TOKEN_KEY, t); }
  function clearToken()        { sessionStorage.removeItem(TOKEN_KEY); }
  function authHeaders() {
    return {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Authorization': 'Bearer ' + getToken()
    };
  }

  // ── API ───────────────────────────────────────────────────
  async function apiFetch(path, opts = {}) {
    const res = await fetch(API + path, {
      headers: authHeaders(),
      ...opts
    });
    if (res.status === 401) { logout(); return null; }
    const data = res.headers.get('content-type')?.includes('json')
      ? await res.json() : await res.text();
    if (!res.ok) throw new Error(data?.message || data?.hint || JSON.stringify(data) || res.statusText);
    return data;
  }

  // ── Login ─────────────────────────────────────────────────
  const loginPage = document.getElementById('login-page');
  const adminPage = document.getElementById('admin-page');

  async function doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pwd   = document.getElementById('login-pwd').value;
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('btn-login');

    errEl.className = 'msg';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Вход...';

    try {
      const res = await fetch(`${API}/rpc/admin_login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({ p_email: email, p_password: pwd })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.token) {
        setToken(data.token);
        showAdminPanel();
      } else {
        errEl.textContent = data.message || 'Неверный email или пароль';
        errEl.className = 'msg error';
        btn.disabled = false;
        btn.textContent = 'Войти';
      }
    } catch (e) {
      errEl.textContent = 'Ошибка соединения';
      errEl.className = 'msg error';
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  }

  function logout() {
    clearToken();
    adminPage.style.display = 'none';
    loginPage.style.display = 'flex';
    document.getElementById('login-pwd').value = '';
    document.getElementById('login-email').value = '';
    document.getElementById('btn-login').textContent = 'Войти';
    document.getElementById('btn-login').disabled = false;
  }

  function showAdminPanel() {
    loginPage.style.display = 'none';
    adminPage.style.display = 'block';
    loadRequests();
    loadPlayers();
    loadTournaments();
  }

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('login-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btn-logout').addEventListener('click', logout);

  // ── Tab switching ─────────────────────────────────────────
  const tabMap = {
    requests:    'sec-requests',
    players:     'sec-players',
    tournaments: 'sec-tournaments',
    judges:      'sec-judges',
    history:     'sec-history',
    rating:      'sec-rating'
  };
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabMap[btn.dataset.tab]).classList.add('active');
      if (btn.dataset.tab === 'history') loadHistory();
      if (btn.dataset.tab === 'judges') loadJudgeTournaments();
      if (btn.dataset.tab === 'rating') loadRating();
    });
  });

  // ── esc helper ────────────────────────────────────────────
  function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ════════════════════════════════════════════════════════════
  //  REQUESTS TAB
  // ════════════════════════════════════════════════════════════
  async function loadRequests() {
    const status = document.getElementById('req-filter').value;
    const el = document.getElementById('requests-list');
    el.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

    try {
      const data = await apiFetch(`/player_requests?status=eq.${status}&order=created_at.asc`);
      if (!data) return;

      // Update badge
      const pendingCount = status === 'pending' ? data.length : 0;
      const badge = document.getElementById('requests-badge');
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }

      if (!data.length) {
        el.innerHTML = '<div class="empty-state">Нет заявок со статусом «' + esc(status) + '»</div>';
        return;
      }

      el.innerHTML = data.map(req => `
        <div class="card-row" id="req-row-${esc(req.id)}">
          <div style="flex:1; min-width:130px;">
            <div class="card-name">${esc(req.name)}</div>
            <div class="card-meta">${esc(req.email || '—')}</div>
          </div>
          <span class="badge badge-${req.gender === 'M' ? 'm' : 'w'}">${req.gender === 'M' ? '♂ М' : '♀ Ж'}</span>
          <span class="badge badge-${esc(req.status)}">${esc(req.status)}</span>
          <div class="card-meta">${req.created_at ? new Date(req.created_at).toLocaleDateString('ru') : '—'}</div>
          ${status === 'pending' ? `
            <button class="btn btn-success" onclick="approveReq('${esc(req.id)}')">✓ Одобрить</button>
            <button class="btn btn-danger"  onclick="rejectReq('${esc(req.id)}')">✕ Отклонить</button>
          ` : ''}
        </div>
      `).join('');
    } catch (e) {
      el.innerHTML = '<div class="empty-state" style="color:var(--danger)">Ошибка: ' + esc(e.message) + '</div>';
    }
  }

  window.approveReq = async function(id) {
    const row = document.getElementById('req-row-' + id);
    if (row) row.style.opacity = '0.5';
    try {
      await apiFetch('/rpc/approve_player_request', {
        method: 'POST',
        body: JSON.stringify({ p_request_id: id })
      });
      loadRequests();
    } catch (e) {
      alert('Ошибка: ' + e.message);
      if (row) row.style.opacity = '1';
    }
  };

  window.rejectReq = async function(id) {
    if (!confirm('Отклонить заявку?')) return;
    const row = document.getElementById('req-row-' + id);
    if (row) row.style.opacity = '0.5';
    try {
      await apiFetch('/rpc/reject_player_request', {
        method: 'POST',
        body: JSON.stringify({ p_request_id: id, p_reason: 'Отклонено администратором' })
      });
      loadRequests();
    } catch (e) {
      alert('Ошибка: ' + e.message);
      if (row) row.style.opacity = '1';
    }
  };

  document.getElementById('req-filter').addEventListener('change', loadRequests);
  document.getElementById('btn-refresh-req').addEventListener('click', loadRequests);

  // ════════════════════════════════════════════════════════════
  //  PLAYERS TAB
  // ════════════════════════════════════════════════════════════
  let allPlayers = [];

  async function loadPlayers() {
    const el = document.getElementById('players-list');
    el.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';
    try {
      const status = document.getElementById('players-status').value;
      allPlayers = await apiFetch(`/players?status=eq.${status}&order=name.asc&select=id,name,email,gender,status,total_pts,tournaments`) || [];
      renderPlayers();
    } catch (e) {
      el.innerHTML = '<div class="empty-state" style="color:var(--danger)">Ошибка: ' + esc(e.message) + '</div>';
    }
  }

  function renderPlayers() {
    const el     = document.getElementById('players-list');
    const search = document.getElementById('players-search').value.toLowerCase();
    const gender = document.getElementById('players-gender').value;

    const list = allPlayers.filter(p => {
      const nameMatch  = !search || (p.name || '').toLowerCase().includes(search) || (p.email || '').toLowerCase().includes(search);
      const genderMatch = !gender || p.gender === gender;
      return nameMatch && genderMatch;
    });

    if (!list.length) {
      el.innerHTML = '<div class="empty-state">Игроки не найдены</div>';
      return;
    }

    el.innerHTML = '<div class="card">' + list.map(p => `
      <div class="card-row">
        <div style="flex:1; min-width:130px;">
          <div class="card-name">${esc(p.name)}</div>
          <div class="card-meta">${esc(p.email || '—')}</div>
        </div>
        <span class="badge badge-${p.gender === 'M' ? 'm' : 'w'}">${p.gender === 'M' ? '♂' : '♀'}</span>
        <div class="card-meta">${p.total_pts || 0} очков · ${p.tournaments || 0} турниров</div>
        <button class="btn btn-muted"  onclick="editPlayer('${esc(p.id)}', '${esc(p.name)}', '${esc(p.gender)}')">✎</button>
        <button class="btn btn-danger" onclick="banPlayer('${esc(p.id)}', '${esc(p.name)}', '${esc(p.status)}')">
          ${p.status === 'banned' ? '✓ Разбан' : '⊘ Бан'}
        </button>
      </div>
    `).join('') + '</div>';
  }

  window.editPlayer = async function(id, name, gender) {
    const newName = prompt('Изменить имя:', name);
    if (!newName || newName.trim() === name) return;
    try {
      await apiFetch(`/players?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName.trim() })
      });
      loadPlayers();
    } catch (e) { alert('Ошибка: ' + e.message); }
  };

  window.banPlayer = async function(id, name, status) {
    const newStatus = status === 'banned' ? 'active' : 'banned';
    const msg = newStatus === 'banned'
      ? `Заблокировать игрока "${name}"?`
      : `Разблокировать игрока "${name}"?`;
    if (!confirm(msg)) return;
    try {
      await apiFetch(`/players?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      loadPlayers();
    } catch (e) { alert('Ошибка: ' + e.message); }
  };

  document.getElementById('players-search').addEventListener('input', renderPlayers);
  document.getElementById('players-gender').addEventListener('change', renderPlayers);
  document.getElementById('players-status').addEventListener('change', loadPlayers);

  // ════════════════════════════════════════════════════════════
  //  TOURNAMENTS TAB
  // ════════════════════════════════════════════════════════════
  let trnView = 'active'; // 'active' | 'finished'

  function quickLaunch(fmt) {
    const urls = {
      thai: 'formats/thai/thai.html?mode=MF&n=8&seed=1',
      ipt:  'index.html',
      kotc: 'formats/kotc/kotc.html?nc=4&ppc=4'
    };
    window.open(urls[fmt] || 'index.html', '_blank');
  }

  function switchTrnView(view) {
    trnView = view;
    document.querySelectorAll('.trn-view-btn').forEach(b => {
      const isActive = b.dataset.view === view;
      b.className = 'btn ' + (isActive ? 'btn-accent' : 'btn-muted') + ' trn-view-btn' + (isActive ? ' active' : '');
    });
    renderTournamentList();
  }

  // Bind quick-launch and view-switch buttons (replacing inline onclick)
  document.querySelectorAll('[data-launch]').forEach(btn => {
    btn.addEventListener('click', () => quickLaunch(btn.dataset.launch));
  });
  document.getElementById('btn-launch-standard')?.addEventListener('click', () => {
    window.open('index.html', '_blank');
  });
  document.querySelectorAll('.trn-view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTrnView(btn.dataset.view));
  });

  let allTournaments = [];

  const FORMAT_NAMES = {
    kotc: 'King of the Court',
    ipt_mixed: 'IPT Mixed',
    classic: 'Классика',
    swiss: 'Швейцарская',
    double_elim: 'Double Elimination'
  };
  const STATUS_LABELS = {
    open: '🟢 Открыт', full: '🟡 Заполнен',
    in_progress: '🔵 Идёт', finished: '✅ Завершён', cancelled: '🔴 Отменён'
  };

  async function loadTournaments() {
    const el = document.getElementById('tournaments-list');
    el.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';
    try {
      allTournaments = await apiFetch('/tournaments?order=date.desc&select=id,name,date,format,format_code,status,max_players,capacity') || [];
      renderTournamentList();
    } catch (e) {
      el.innerHTML = '<div class="empty-state" style="color:var(--danger)">Ошибка: ' + esc(e.message) + '</div>';
    }
  }

  function renderTournamentList() {
    const el = document.getElementById('tournaments-list');
    const finishedStatuses = ['finished', 'cancelled'];
    const data = allTournaments.filter(t =>
      trnView === 'finished' ? finishedStatuses.includes(t.status) : !finishedStatuses.includes(t.status)
    );

    if (!data.length) {
      el.innerHTML = '<div class="empty-state">' + (trnView === 'finished' ? 'Нет завершённых турниров' : 'Нет активных турниров') + '</div>';
      return;
    }
    el.innerHTML = data.map(t => {
      const fmt  = FORMAT_NAMES[t.format_code] || t.format || '—';
      const stat = STATUS_LABELS[t.status] || t.status || '—';
      const date = t.date ? new Date(t.date).toLocaleDateString('ru') : '—';
      const fmtCode = t.format_code || '';
      const launchBtn = (fmtCode === 'kotc' || fmtCode === 'ipt_mixed')
        ? `<button class="btn btn-accent" style="font-size:0.75rem;padding:5px 10px" onclick="quickLaunch('${fmtCode === 'kotc' ? 'kotc' : 'ipt'}')">▶ Открыть</button>`
        : '';
      return `
        <div class="trn-card">
          <div class="trn-info">
            <div class="trn-name">${esc(t.name)}</div>
            <div class="trn-meta">${esc(fmt)} · ${date} · ${stat}</div>
            ${t.max_players ? `<div class="trn-meta">Лимит: ${t.max_players} игроков</div>` : ''}
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:flex-start;">
            ${launchBtn}
            <select class="filter-select" onchange="changeTrnStatus('${esc(t.id)}', this.value)">
              <option ${t.status==='open'?'selected':''} value="open">Открыт</option>
              <option ${t.status==='full'?'selected':''} value="full">Заполнен</option>
              <option ${t.status==='in_progress'?'selected':''} value="in_progress">Идёт</option>
              <option ${t.status==='finished'?'selected':''} value="finished">Завершён</option>
              <option ${t.status==='cancelled'?'selected':''} value="cancelled">Отменён</option>
            </select>
          </div>
        </div>
      `;
    }).join('');
  }

  window.changeTrnStatus = async function(id, status) {
    try {
      await apiFetch(`/tournaments?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    } catch (e) { alert('Ошибка: ' + e.message); loadTournaments(); }
  };

  // Expose for dynamically generated onclick in templates
  window.quickLaunch = quickLaunch;
  window.switchTrnView = switchTrnView;

  document.getElementById('btn-create-trn').addEventListener('click', async () => {
    const name    = document.getElementById('trn-name').value.trim();
    const date    = document.getElementById('trn-date').value;
    const format  = document.getElementById('trn-format').value;
    const maxP    = parseInt(document.getElementById('trn-max').value) || null;
    const msgEl   = document.getElementById('trn-msg');

    if (!name) { msgEl.textContent = 'Введите название турнира'; msgEl.className = 'msg error'; return; }

    const btn = document.getElementById('btn-create-trn');
    btn.disabled = true;
    msgEl.className = 'msg';

    try {
      await apiFetch('/tournaments', {
        method: 'POST',
        headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          name,
          date: date || null,
          format: FORMAT_NAMES[format] || format,
          format_code: format,
          status: 'open',
          max_players: maxP,
          capacity: maxP
        })
      });
      msgEl.textContent = '✓ Турнир создан';
      msgEl.className = 'msg success';
      document.getElementById('trn-name').value = '';
      document.getElementById('trn-date').value = '';
      loadTournaments();
    } catch (e) {
      msgEl.textContent = 'Ошибка: ' + e.message;
      msgEl.className = 'msg error';
    }
    btn.disabled = false;
  });

  // ════════════════════════════════════════════════════════════
  //  JUDGES TAB (S7.2)
  // ════════════════════════════════════════════════════════════
  let judgeTrnId = '';
  let judgeLinks = [];

  async function loadJudgeTournaments() {
    const sel = document.getElementById('judge-trn-select');
    // Reuse allTournaments or fetch fresh
    if (!allTournaments.length) {
      try {
        allTournaments = await apiFetch('/tournaments?order=date.desc&select=id,name,date,format_code,status') || [];
      } catch (e) { /* ignore */ }
    }
    const active = allTournaments.filter(t => !['finished', 'cancelled'].includes(t.status));
    sel.innerHTML = '<option value="">— Выберите активный турнир —</option>' +
      active.map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${t.date ? new Date(t.date).toLocaleDateString('ru') : '—'})</option>`).join('');
  }

  document.getElementById('judge-trn-select')?.addEventListener('change', async function() {
    judgeTrnId = this.value;
    const assignCard = document.getElementById('judge-assign-card');
    const linksCard = document.getElementById('judge-links-card');
    if (!judgeTrnId) {
      assignCard.style.display = 'none';
      linksCard.style.display = 'none';
      return;
    }
    assignCard.style.display = '';

    // Load existing sessions for this tournament
    try {
      const result = await apiFetch('/rpc/list_judge_sessions', {
        method: 'POST',
        body: JSON.stringify({ p_trn_id: judgeTrnId })
      });
      if (result && Array.isArray(result) && result.length > 0) {
        showJudgeLinks(result);
        // Pre-fill names
        for (const s of result) {
          const inp = document.getElementById('judge-name-' + s.court);
          if (inp && s.judge_name) inp.value = s.judge_name;
        }
      } else {
        linksCard.style.display = 'none';
      }
    } catch (e) {
      // No existing sessions — that's fine
      linksCard.style.display = 'none';
    }
  });

  document.getElementById('btn-assign-judges')?.addEventListener('click', async () => {
    if (!judgeTrnId) return;
    const msgEl = document.getElementById('judge-msg');
    const btn = document.getElementById('btn-assign-judges');
    btn.disabled = true;
    msgEl.className = 'msg';
    msgEl.textContent = '';

    const results = [];
    try {
      for (let i = 0; i < 4; i++) {
        const name = (document.getElementById('judge-name-' + i)?.value || '').trim();
        const res = await apiFetch('/rpc/create_judge_session', {
          method: 'POST',
          body: JSON.stringify({ p_trn_id: judgeTrnId, p_court: i, p_name: name })
        });
        if (res?.ok) {
          results.push(res);
        } else {
          throw new Error(res?.error || 'Failed for court ' + (i + 1));
        }
      }
      msgEl.textContent = '✓ Судьи назначены, ссылки сгенерированы';
      msgEl.className = 'msg success';
      showJudgeLinks(results);
    } catch (e) {
      msgEl.textContent = 'Ошибка: ' + e.message;
      msgEl.className = 'msg error';
    }
    btn.disabled = false;
  });

  function showJudgeLinks(sessions) {
    const linksCard = document.getElementById('judge-links-card');
    const listEl = document.getElementById('judge-links-list');
    linksCard.style.display = '';

    const baseUrl = location.origin + location.pathname.replace('admin.html', 'index.html');
    judgeLinks = [];

    listEl.innerHTML = sessions.map(s => {
      const url = `${baseUrl}?trnId=${encodeURIComponent(judgeTrnId)}&court=${s.court}&token=${encodeURIComponent(s.token)}${s.judge_name ? '&judge=' + encodeURIComponent(s.judge_name) : ''}`;
      judgeLinks.push({ court: s.court, url, name: s.judge_name || '' });

      // S7.3: QR code (rendered async after makeQrSvg is available)
      const qrId = `qr-court-${s.court}`;
      setTimeout(() => {
        const el = document.getElementById(qrId);
        if (!el) return;
        try {
          if (typeof globalThis.makeQrSvg === 'function') {
            el.innerHTML = globalThis.makeQrSvg(url, { size: 120, dark: '#fff', light: '#1a1a2e', padding: 6 });
          } else {
            el.textContent = '—';
          }
        } catch (e) { el.textContent = '!'; }
      }, 200);

      return `
        <div class="card-row" style="flex-wrap:wrap;gap:8px;align-items:flex-start">
          <div id="${esc(qrId)}" style="flex-shrink:0;width:120px;height:120px;background:#1a1a2e;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:0.7rem">QR...</div>
          <div style="flex:1;min-width:120px">
            <div class="card-name">Корт ${s.court + 1}${s.judge_name ? ' — ' + esc(s.judge_name) : ''}</div>
            <div class="card-meta" style="word-break:break-all;font-size:0.7rem;opacity:0.7">${esc(url)}</div>
          </div>
          <button class="btn btn-accent" style="font-size:0.75rem;padding:5px 10px;align-self:flex-start"
            onclick="copyToClipboard('${esc(url.replace(/'/g, "\\'"))}')">Копировать</button>
        </div>
      `;
    }).join('');

    // S7.7: Show live courts card
    _renderLiveCourts(sessions);
  }

  // S7.7: Live court overview
  let _liveRefreshTimer = null;
  function _renderLiveCourts(sessions) {
    const card = document.getElementById('live-courts-card');
    const grid = document.getElementById('live-courts-grid');
    if (!card || !grid) return;
    card.style.display = '';

    // Build 4-court grid
    const byCourt = {};
    for (const s of sessions) byCourt[s.court] = s;
    grid.innerHTML = [0, 1, 2, 3].map(ci => {
      const s = byCourt[ci];
      return `
        <div class="card card-padded" style="padding:10px;min-width:0">
          <div style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Корт ${ci + 1}</div>
          <div class="card-name" style="font-size:0.9rem;margin:4px 0">${s ? esc(s.judge_name || '—') : '<span style="color:var(--muted)">не назначен</span>'}</div>
          <div style="font-size:0.75rem;color:var(--muted)" id="live-court-info-${ci}">${s ? '✓ ссылка выдана' : ''}</div>
        </div>
      `;
    }).join('');

    // Poll judge sessions every 30s to check for activity
    clearInterval(_liveRefreshTimer);
    if (judgeTrnId) {
      _liveRefreshTimer = setInterval(() => _pollLiveCourts(), 30000);
    }
  }

  async function _pollLiveCourts() {
    const statusEl = document.getElementById('live-courts-status');
    if (statusEl) statusEl.textContent = '• обновление...';
    try {
      const result = await apiFetch('/rpc/list_judge_sessions', {
        method: 'POST',
        body: JSON.stringify({ p_trn_id: judgeTrnId })
      });
      if (statusEl) statusEl.textContent = '• ' + new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      // Update court cards with refreshed data
      if (result && Array.isArray(result)) {
        const byCourt = {};
        for (const s of result) byCourt[s.court] = s;
        for (let ci = 0; ci < 4; ci++) {
          const el = document.getElementById(`live-court-info-${ci}`);
          if (el && byCourt[ci]) el.textContent = '✓ ссылка выдана';
        }
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '• ошибка';
    }
  }

  document.getElementById('btn-live-refresh')?.addEventListener('click', () => {
    if (judgeTrnId) _pollLiveCourts();
  });

  window.copyToClipboard = async function(text) {
    try {
      await navigator.clipboard.writeText(text);
      // Brief visual feedback
      const btns = document.querySelectorAll('#judge-links-list .btn-accent');
      btns.forEach(b => { if (b.textContent === 'Копировать') return; });
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  };

  document.getElementById('btn-copy-all-links')?.addEventListener('click', async () => {
    const allText = judgeLinks.map(l =>
      `Корт ${l.court + 1}${l.name ? ' (' + l.name + ')' : ''}: ${l.url}`
    ).join('\n');
    try {
      await navigator.clipboard.writeText(allText);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = allText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  });

  // ════════════════════════════════════════════════════════════
  //  HISTORY TAB
  // ════════════════════════════════════════════════════════════
  let allHistory = [];

  async function loadHistory() {
    const el = document.getElementById('history-list');
    el.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';
    try {
      allHistory = await apiFetch(
        '/rating_history?order=created_at.desc&limit=200&select=id,points_changed,new_total_rating,place,created_at,format_code,player_id,players(name),tournaments(name)'
      ) || [];
      renderHistory();
    } catch (e) {
      el.innerHTML = '<div class="empty-state" style="color:var(--danger)">Ошибка: ' + esc(e.message) + '</div>';
    }
  }

  function renderHistory() {
    const el     = document.getElementById('history-list');
    const search = document.getElementById('history-search').value.toLowerCase();

    const list = allHistory.filter(h => {
      const pname = h.players?.name || '';
      return !search || pname.toLowerCase().includes(search);
    });

    if (!list.length) {
      el.innerHTML = '<div class="empty-state">История пуста</div>';
      return;
    }

    el.innerHTML = '<div class="card">' + list.map(h => {
      const date  = h.created_at ? new Date(h.created_at).toLocaleDateString('ru') : '—';
      const pname = h.players?.name || '—';
      const tname = h.tournaments?.name || '—';
      const delta = h.points_changed >= 0 ? '+' + h.points_changed : h.points_changed;
      const dColor = h.points_changed >= 0 ? 'var(--success)' : 'var(--danger)';
      return `
        <div class="card-row">
          <div style="flex:1; min-width:120px;">
            <div class="card-name">${esc(pname)}</div>
            <div class="card-meta">${esc(tname)}</div>
          </div>
          <div style="font-weight:700; color:${dColor}">${delta} очков</div>
          ${h.new_total_rating != null ? `<div class="card-meta">Итого: ${h.new_total_rating}</div>` : ''}
          ${h.place ? `<div class="card-meta">#${h.place} место</div>` : ''}
          <div class="card-meta">${date}</div>
        </div>
      `;
    }).join('') + '</div>';
  }

  document.getElementById('history-search').addEventListener('input', renderHistory);
  document.getElementById('btn-refresh-history').addEventListener('click', loadHistory);

  // ════════════════════════════════════════════════════════════
  //  RATING TAB (S8.9)
  // ════════════════════════════════════════════════════════════
  let allRatingPlayers = [];

  async function loadRating() {
    const el = document.getElementById('rating-list');
    el.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';
    try {
      const data = await apiFetch('/rpc/get_rating_leaderboard', {
        method: 'POST',
        body: JSON.stringify({})
      });
      allRatingPlayers = Array.isArray(data) ? data : [];
      renderRating();
    } catch (e) {
      el.innerHTML = '<div class="empty-state" style="color:var(--danger)">Ошибка: ' + esc(e.message) + '</div>';
    }
  }

  function renderRating() {
    const el     = document.getElementById('rating-list');
    const gender = document.getElementById('rating-gender-filter').value;
    const search = document.getElementById('rating-search').value.toLowerCase();

    let list = allRatingPlayers.filter(p => {
      if (gender !== 'all' && p.gender !== gender) return false;
      if (search && !(p.name || '').toLowerCase().includes(search)) return false;
      return true;
    });

    // Sort by total_pts descending
    list.sort((a, b) => (b.total_pts || 0) - (a.total_pts || 0));

    if (!list.length) {
      el.innerHTML = '<div class="empty-state">Нет игроков' + (search ? ' по запросу' : '') + '</div>';
      return;
    }

    const MEDALS = ['🥇', '🥈', '🥉'];
    el.innerHTML = '<div class="card"><table class="rating-table" style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<thead><tr style="text-align:left;border-bottom:1px solid #2a2a44">' +
      '<th style="padding:8px 6px;width:40px">#</th>' +
      '<th style="padding:8px 6px">Игрок</th>' +
      '<th style="padding:8px 6px;width:50px">Пол</th>' +
      '<th style="padding:8px 6px;width:70px;text-align:right">Очки</th>' +
      '<th style="padding:8px 6px;width:70px;text-align:right">Турниры</th>' +
      '<th style="padding:8px 6px;width:90px"></th>' +
      '</tr></thead><tbody>' +
      list.map((p, i) => {
        const rank = i + 1;
        const medal = MEDALS[i] || rank;
        const gLabel = p.gender === 'M' ? '🏋️ М' : p.gender === 'W' ? '👩 Ж' : '—';
        return `<tr style="border-bottom:1px solid #1a1a30">
          <td style="padding:6px">${medal}</td>
          <td style="padding:6px;font-weight:600">${esc(p.name || '—')}</td>
          <td style="padding:6px;color:var(--muted)">${gLabel}</td>
          <td style="padding:6px;text-align:right;font-weight:700;color:var(--gold)">${p.total_pts || 0}</td>
          <td style="padding:6px;text-align:right;color:var(--muted)">${p.tournaments || 0}</td>
          <td style="padding:6px;text-align:right">
            <button class="btn btn-muted btn-sm" style="font-size:11px;padding:3px 8px"
              onclick="event.stopPropagation();_adminResetRating('${esc(p.player_id || p.id)}')">Сброс</button>
          </td>
        </tr>`;
      }).join('') +
      '</tbody></table></div>';
  }

  // S8.9: Admin reset rating for a single player
  window._adminResetRating = async function(playerId) {
    if (!confirm('Сбросить рейтинг игрока ' + playerId + '?')) return;
    try {
      await apiFetch('/players?id=eq.' + encodeURIComponent(playerId), {
        method: 'PATCH',
        body: JSON.stringify({ total_pts: 0, tournaments: 0 })
      });
      await loadRating();
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  };

  document.getElementById('rating-gender-filter').addEventListener('change', renderRating);
  document.getElementById('rating-search').addEventListener('input', renderRating);
  document.getElementById('btn-refresh-rating').addEventListener('click', loadRating);

  // ── Init ──────────────────────────────────────────────────
  if (getToken()) {
    showAdminPanel();
  }
})();
