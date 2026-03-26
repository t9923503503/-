'use strict';

// ════════════════════════════════════════════════════════════
// ROSTER-LIST: renderRoster() main function
// Split from roster.js (A3.2)
// ════════════════════════════════════════════════════════════

function tr(key, params) {
  return typeof globalThis.i18n?.t === 'function' ? globalThis.i18n.t(key, params) : key;
}

function renderRoster() {
  const today = new Date().toISOString().split('T')[0];

  let html = `<div class="page-h">✏️ ${tr('roster.title')}</div>
  <div class="page-sub">${tr('roster.subtitle')}</div>

  ${_renderFmtCard()}

  <!-- 3. Таймер -->
  <div class="settings-card">
    <div class="sc-title">⏱ ${tr('timer.title')}</div>
    <div class="sc-row">
      <span class="sc-lbl">${tr('timer.courts', {n: nc})}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="timer-custom-btn" onclick="timerCustomStep(0,-1)">−</button>
        <div class="timer-custom-val active" id="roster-tmr-courts">${timerState[0].preset} ${tr('timer.min')}</div>
        <button class="timer-custom-btn" onclick="timerCustomStep(0,1)">+</button>
      </div>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">${tr('timer.finals')}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="timer-custom-btn" onclick="timerCustomStep(4,-1)">−</button>
        <div class="timer-custom-val active" id="roster-tmr-divs">${timerState[4].preset} ${tr('timer.min')}</div>
        <button class="timer-custom-btn" onclick="timerCustomStep(4,1)">+</button>
      </div>
    </div>
    <div class="sc-info">${tr('timer.range')}</div>
    <div class="sc-row" style="margin-top:8px">
      <span class="sc-lbl">${tr('theme.title')}:</span>
      <button class="solar-toggle-roster seg-btn on" onclick="toggleSolar()">
        ${document.body.classList.contains('solar') ? '🌙 ' + tr('theme.night') : '☀️ ' + tr('theme.beach')}
      </button>
    </div>
  </div>

  <!-- 4. Защита ростера -->
  <div class="settings-card">
    <div class="sc-title">🔐 ${tr('auth.title')}</div>
    <div class="sc-info">
      ${hasRosterPassword()
        ? (rosterUnlocked
            ? tr('auth.hasPassword') + ' ' + tr('auth.unlocked')
            : tr('auth.hasPassword') + ' ' + tr('auth.needPassword'))
        : tr('auth.noPassword')}
    </div>
    <div class="sc-row">
      <span class="sc-lbl">${tr('auth.status')}:</span>
      <span class="sc-info" style="margin:0;padding:0;border:none;background:none">
        ${hasRosterPassword()
          ? (rosterUnlocked ? '🔓 ' + tr('auth.open') : '🔒 ' + tr('auth.locked'))
          : '⚪ ' + tr('auth.disabled')}
      </span>
    </div>
    <div class="sc-btns">
      <button class="btn-apply" onclick="rosterConfigurePassword()">
        ${hasRosterPassword() ? '🔁 ' + tr('auth.changePassword') : '🔐 ' + tr('auth.setPassword')}
      </button>
      ${hasRosterPassword() ? `
        <button class="btn-dist" onclick="${rosterUnlocked ? 'rosterLockNow()' : 'rosterUnlockNow()'}">
          ${rosterUnlocked ? '🔒 ' + tr('auth.lock') : '🔓 ' + tr('auth.unlock')}
        </button>
        <button class="btn-dist" style="background:#3a2230;border-color:#7a3550;color:#ffd7e4"
          onclick="rosterRemovePassword()">🗑 ${tr('auth.removePassword')}</button>
      ` : ''}
    </div>
    <div class="sc-warn">${tr('auth.localOnly')}</div>
  </div>`;

  // ── 5. Ростер составы ────────────────────────────────────────
  for (let ci = 0; ci < nc; ci++) {
    const ct   = ALL_COURTS[ci];
    const meta = COURT_META[ci];
    const men   = ct.men.slice(0,ppc);
    const women = ct.women.slice(0,ppc);
    const incomplete = men.some(n=>!n.trim()) || men.length < ppc;
    html += `<div class="rc-block">
      <div class="rc-hdr" style="background:linear-gradient(90deg,${meta.color}20,transparent);border-bottom:2px solid ${meta.color}35">
        <span style="color:${meta.color}">${meta.name}</span>
        <span style="font-size:11px;color:var(--muted)">${tr('roster.mwCount', {n: ppc})}</span>
      </div>
      <div class="rc-grid">
        <div class="rc-col-hdr m">🏋️ ${tr('roster.men')}</div>
        <div class="rc-col-hdr w">👩 ${tr('roster.women')}</div>`;
    for (let pi = 0; pi < ppc; pi++) {
      html += `
        <div class="rc-entry"><span class="rc-num">${pi+1}</span>
          <input class="rc-inp men-input" type="text" id="rc-${ci}-men-${pi}" value="${esc(men[pi]||'')}"
            data-ci="${ci}" data-g="men" data-pi="${pi}" placeholder="${tr('roster.surname')}"
            oninput="rosterAcShow(this)" onblur="setTimeout(rosterAcHide,200)"></div>
        <div class="rc-entry"><span class="rc-num">${pi+1}</span>
          <input class="rc-inp women-input" type="text" id="rc-${ci}-women-${pi}" value="${esc(women[pi]||'')}"
            data-ci="${ci}" data-g="women" data-pi="${pi}" placeholder="${tr('roster.surname')}"
            oninput="rosterAcShow(this)" onblur="setTimeout(rosterAcHide,200)"></div>`;
    }
    html += `</div>`;
    if (incomplete) html += `<div class="rc-warn">⚠️ ${tr('roster.incomplete')}</div>`;
    html += `</div>`;
  }

  // Tournament Manager + Player DB
  html += `<div class="trn-mgr-wrap" id="roster-trn-section">${_rosterTrnHtml()}</div>`;
  html += `<div class="rdb-wrap" id="roster-db-section">${_rdbBodyHtml()}</div>`;

  // ── 5. Сохранить / Сброс / Новый состав ─────────────────────
  html += `<div class="roster-save-bar">
    <button class="btn-rsr primary"   onclick="applyRoster()">✅ ${tr('roster.save')}</button>
    <button class="btn-rsr sec"       onclick="resetRosterNames()">↺ ${tr('roster.resetNames')}</button>
    <button class="btn-rsr danger"    onclick="clearRoster()">🧹 ${tr('roster.newRoster')}</button>
  </div>`;

// ── Низ: Завершить / Сброс / Cloud / GSheets / Backup / History ──
  html += `<button class="btn-finish" onclick="finishTournament()">
    🏁 ${tr('tournament.finish')}
  </button>
  <div style="margin-top:12px;padding:14px;background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(233,69,96,.2);border-radius:12px">
    <div style="color:var(--muted);font-size:12px;margin-bottom:10px;text-align:center">⚠️ ${tr('tournament.resetWarn')}</div>
    <button class="btn-reset-tournament" onclick="resetTournament()">🗑 ${tr('tournament.reset')}</button>
  </div>

${renderCloudSyncCard()}

  ${typeof renderAdminPanel === 'function' ? renderAdminPanel() : ''}

  ${renderGSheetsCard()}

  <div class="backup-card" id="backup-card">
    <div class="backup-title">💾 ${tr('backup.title')}</div>
    <div class="backup-sub">${tr('backup.subtitle')}<br>${tr('backup.useForTransfer')}</div>
    <div class="backup-btns">
      <button class="backup-btn export" onclick="exportData()">
        📥 ${tr('backup.export')}
      </button>
      <label class="backup-btn import" style="cursor:pointer">
        📤 ${tr('backup.import')}
        <input type="file" accept=".json" style="display:none"
          onchange="importData(this.files[0]);this.value=''"
          capture="">
      </label>
    </div>
    <div class="backup-info-row">
      ℹ️ ${tr('backup.fileInfo')}
    </div>
  </div>

  <div class="history-card">
    <div class="history-hdr">
      <span class="history-hdr-title">📋 ${tr('history.titleCount')}</span>
      <button class="btn-clear-log" onclick="clearHistory()">${tr('history.clear')}</button>
    </div>
    <div class="history-filter-bar">
      ${[
        {f:'all',   label:tr('history.all')},
        {f:'k0',    label: tr('nav.courtBadge', { n: 1 })},
        {f:'k1',    label: tr('nav.courtBadge', { n: 2 })},
        {f:'k2',    label: tr('nav.courtBadge', { n: 3 })},
        {f:'k3',    label: tr('nav.courtBadge', { n: 4 })},
        {f:'hard',    label:'🔥'},
        {f:'advance', label:'⚡'},
        {f:'medium',  label:'⚙️'},
        {f:'lite',    label:'🍀'},
      ].map(({f,label})=>`<button class="hf-btn${historyFilter===f?' on':''}" data-f="${f}" onclick="setHistoryFilter('${f}')">${label}</button>`).join('')}
    </div>
    <div class="history-list" id="admin-history-log">${renderHistoryLog()}</div>
  </div>`;
  return html;
}
