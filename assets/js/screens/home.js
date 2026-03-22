'use strict';

function tr(key, params) {
  return typeof globalThis.i18n?.t === 'function' ? globalThis.i18n.t(key, params) : key;
}

function setHomeTab(tab) {
  homeActiveTab = tab;
  if (tab !== 'archive') homeArchiveFormOpen = false;
  const s = document.getElementById('screen-home');
  if (s) s.innerHTML = renderHome();
}

// ── Manual past tournaments CRUD ───────────────────────────
// loadManualTournaments / saveManualTournaments defined above as shims over kotc3_tournaments
function submitManualTournament() {
  const v = id => document.getElementById(id)?.value;
  const name     = (v('arch-inp-name') || '').trim();
  const date     =  v('arch-inp-date') || '';
  const format   =  v('arch-inp-fmt')  || 'King of the Court';
  const division =  v('arch-inp-div')  || tr('home.divMen');
  if (!name || !date) { showToast('⚠️ ' + tr('home.enterNameDate')); return; }

  const playerResults = [...homeArchiveFormPlayers].sort((a,b) => b.pts - a.pts);
  const playersCount  = playerResults.length || (parseInt(v('arch-inp-players')||'0')||0);
  const winner        = playerResults[0]?.name || (v('arch-inp-winner')||'').trim();

  // Save to archive
  const arr = loadManualTournaments();
  arr.unshift({ id: Date.now(), name, date, format, division,
    playersCount, winner, playerResults, source: 'manual' });
  saveManualTournaments(arr);

  // Sync players → playerDB (each player gets +1 tournament, +pts)
  if (playerResults.length) {
    syncPlayersFromTournament(
      playerResults.map(p => ({ name: p.name, gender: p.gender, totalPts: p.pts })),
      date
    );
    showToast(tr('home.tournamentSavedPlayers', { n: playerResults.length }));
  } else {
    showToast(tr('home.tournamentSavedArchive'));
  }

  homeArchiveFormOpen = false;
  homeArchiveFormPlayers = [];
  setHomeTab('archive');
}
function deleteManualTournament(id) {
  saveManualTournaments(loadManualTournaments().filter(t => t.id !== id));
  setHomeTab('archive');
}
function toggleArchiveForm() {
  homeArchiveFormOpen = !homeArchiveFormOpen;
  if (homeArchiveFormOpen) homeArchiveFormPlayers = [];
  const s = document.getElementById('screen-home');
  if (s) s.innerHTML = renderHome();
}

function setArchFormGender(g) {
  homeArchiveFormGender = g;
  // just update the buttons visually without full re-render
  ['M','W'].forEach(x => {
    const b = document.getElementById('arch-g-btn-'+x);
    if (b) b.className = 'arch-plr-g-btn' + (x===g?' sel-'+g:'');
  });
}

function addArchFormPlayer() {
  const nameEl = document.getElementById('arch-plr-inp');
  const ptsEl  = document.getElementById('arch-plr-pts-inp');
  const name   = (nameEl?.value || '').trim();
  const pts    = parseInt(ptsEl?.value || '0') || 0;
  if (!name) { showToast('⚠️ ' + tr('home.enterSurname')); return; }
  homeArchiveFormPlayers.push({ name, pts, gender: homeArchiveFormGender });
  homeArchiveFormPlayers.sort((a,b) => b.pts - a.pts);
  nameEl.value = ''; ptsEl.value = '';
  _refreshArchPlrList();
  nameEl.focus();
}

function removeArchFormPlayer(idx) {
  homeArchiveFormPlayers.splice(idx, 1);
  _refreshArchPlrList();
}

function _refreshArchPlrList() {
  const el = document.getElementById('arch-plr-list-wrap');
  if (el) el.innerHTML = _archPlrListHtml();
}

function _archPlrListHtml() {
  if (!homeArchiveFormPlayers.length)
    return `<div class="arch-plr-empty">${tr('home.noPlayersAdded')}</div>`;
  return `<div class="arch-plr-count">${tr('home.playersCount', { n: homeArchiveFormPlayers.length })}</div>
<div class="arch-plr-list">` +
    homeArchiveFormPlayers.map((p,i) => `
  <div class="arch-plr-row">
    <span class="arch-plr-row-rank">${MEDALS_3[i]||i+1}</span>
    <span class="arch-plr-row-name">${esc(p.name)}</span>
    <span class="arch-plr-row-g ${p.gender}">${p.gender==='M'?tr('home.genderM'):tr('home.genderW')}</span>
    <span class="arch-plr-row-pts">${p.pts}</span>
    <button class="arch-plr-row-del" onclick="removeArchFormPlayer(${i})">✕</button>
  </div>`).join('') + '</div>';
}

function renderHome() {
  const T = loadUpcomingTournaments();
  const totalReg  = T.reduce((s,t) => s + (t.participants || []).length, 0);
  const openCount = T.filter(t => t.status === 'open').length;

  // helpers
  const pct  = (r,c) => c ? Math.min(r/c*100, 100) : 0;
  const pcls = (r,c) => { if (!c) return 'g'; const p=r/c; return p>=1?'r':p>=.8?'y':'g'; };

  function cardHtml(trn) {
    const pp  = trn.participants || [];
    const c   = pcls(pp.length, trn.capacity);
    const isIPT  = trn.format === 'IPT Mixed';
    // A1.5: Thai Mixed tournament detection
    const isThai = trn.format === 'Thai Mixed';
    // A2.3: KOTC tournament detection
    const isKotc = trn.format === 'KOTC' || (trn.id && trn.id.startsWith('kotc_'));
    const isActive = trn.status === 'active';
    const isOpen   = trn.status === 'open';
    const ac  = isOpen ? 'var(--gold)'
      : isThai  ? '#3d1a5e'
      : isKotc  ? '#4a3a00'
      : isIPT && isActive ? '#1a4a8e' : '#2a2a44';
    const stLabel = isOpen ? tr('home.statusOpen')
      : (isThai || isKotc) && isActive ? tr('home.statusPlaying')
      : isIPT && isActive ? tr('home.statusPlaying')
      : trn.status === 'finished' ? tr('home.statusFinished')
      : tr('home.statusFull');

    // A1.5: Thai button opens thai.html with stored meta
    const thaiMeta = trn.thaiMeta || {};
    const thaiHref = (globalThis.sharedFormatLinks && typeof globalThis.sharedFormatLinks.buildThaiFormatUrl === 'function')
      ? globalThis.sharedFormatLinks.buildThaiFormatUrl({
          mode: thaiMeta.mode || 'MF',
          n: thaiMeta.n || 8,
          seed: thaiMeta.seed || 1,
          trnId: trn.id,
        })
      : `formats/thai/thai.html?mode=${thaiMeta.mode||'MF'}&n=${thaiMeta.n||8}&seed=${thaiMeta.seed||1}&trnId=${encodeURIComponent(trn.id)}`;
    // A2.3: KOTC URL building
    const kotcMeta = trn.kotcMeta || {};
    const kotcHref = (globalThis.sharedFormatLinks && typeof globalThis.sharedFormatLinks.buildKotcFormatUrl === 'function')
      ? globalThis.sharedFormatLinks.buildKotcFormatUrl({ nc: kotcMeta.nc || 4, trnId: trn.id })
      : `formats/kotc/kotc.html?nc=${kotcMeta.nc||4}&ppc=4&trnId=${encodeURIComponent(trn.id)}`;

    const btnLabel = isKotc
      ? (isActive ? '👑 ' + tr('home.continueKotc') : '👑 ' + tr('home.openKotc'))
      : isThai
      ? (isActive ? '🌴 ' + tr('home.continueThai') : '🌴 ' + tr('home.openThai'))
      : isIPT
        ? (isActive ? '🏐 ' + tr('home.continueMatch') : pp.length >= 8 ? '🏐 ' + tr('home.startIpt') : '👥 ' + tr('home.addPlayers'))
        : (isOpen ? '⚡ ' + tr('home.register') : '📋 ' + tr('home.waitList'));

    const fmtIcon = isKotc ? '👑' : isThai ? '🌴' : '👑';
    const cardClick = isKotc ? `window.open('${kotcHref}','_blank')`
      : isThai ? `window.open('${thaiHref}','_blank')`
      : `openTrnDetails('${escAttr(trn.id)}')`;
    return `
<div class="trn-card${isThai?' trn-card-thai':''}${isKotc?' trn-card-kotc':''}" onclick="${cardClick}" style="cursor:pointer">
  <div class="trn-card-accent" style="background:${ac}"></div>
  <div class="trn-card-body">
    <div class="trn-card-head">
      <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
        <span class="trn-lv ${trn.level||''}">${(trn.level||'').toUpperCase()}</span>
        <span style="font-size:10px;color:var(--muted);background:rgba(255,255,255,.06);
          padding:2px 7px;border-radius:6px">${esc(trn.division)}</span>
        ${isThai ? `<span style="font-size:10px;background:rgba(199,125,255,.15);color:#C77DFF;padding:2px 7px;border-radius:6px">ThaiVolley32</span>` : ''}
        ${isKotc ? `<span style="font-size:10px;background:rgba(255,215,0,.15);color:#FFD700;padding:2px 7px;border-radius:6px">KOTC</span>` : ''}
      </div>
      <span class="trn-st ${trn.status}">
        <span class="trn-st-dot"></span>
        ${stLabel}
      </span>
    </div>
    <div class="trn-fmt">${fmtIcon} ${esc(trn.format)}</div>
    <div class="trn-name">${esc(trn.name)}</div>
    <div class="trn-meta">🕐 <span>${esc(trn.date)}${trn.time?', '+esc(trn.time):''}</span></div>
    ${trn.location ? `<div class="trn-meta">📍 <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${esc(trn.location)}</span></div>` : ''}
    ${trn.prize ? `<div class="trn-prize">${tr('home.prizePool')} ${esc(trn.prize)}</div>` : ''}
    ${isThai ? `
    <div class="trn-prog" style="margin-top:6px">
      <div class="trn-prog-hdr">
        <span class="trn-prog-lbl">${tr('home.modeLabel', { mode: thaiMeta.mode||'MF', n: thaiMeta.n||8 })}</span>
        <span style="font-size:11px;color:var(--purple)">${tr('home.seedLabel')} ${esc(thaiMeta.seed||1)}</span>
      </div>
    </div>` : `
    <div class="trn-prog">
      <div class="trn-prog-hdr">
        <span class="trn-prog-lbl">${isIPT ? tr('home.participantsLbl') : tr('home.registrationLbl')}</span>
        <span class="trn-prog-val ${c}">${pp.length}/${trn.capacity}</span>
      </div>
      <div class="trn-prog-bar">
        <div class="trn-prog-fill ${c}" style="width:${pct(pp.length,trn.capacity)}%"></div>
      </div>
    </div>`}
    <button class="trn-btn ${isKotc?'ipt':isThai?'ipt':isIPT?'ipt':trn.status}"
      onclick="event.stopPropagation();${isKotc?`window.open('${kotcHref}','_blank')`:isThai?`window.open('${thaiHref}','_blank')`:`openTrnDetails('${escAttr(trn.id)}')`}">
      ${btnLabel}
    </button>
  </div>
</div>`;
  }

  function calRow(trn) {
    const c = trn.status==='open' ? 'g' : 'r';
    return `
<div class="cal-row" onclick="showTournament('${escAttr(trn.id)}')" style="cursor:pointer">
  <div class="cal-date-box">
    <div class="cal-dn">${trn.dayNum}</div>
    <div class="cal-ds">${trn.dayStr}</div>
  </div>
  <div class="cal-info">
    <div class="cal-info-name">${esc(trn.name)}</div>
    <div class="cal-info-meta">
      <span>🕐 ${esc(trn.time)}</span>
      <span class="trn-lv ${trn.level||''}" style="font-size:9px;padding:1px 5px">${(trn.level||'').toUpperCase()}</span>
      <span>${esc(trn.division)}</span>
    </div>
  </div>
  <div class="cal-right">
    <span class="trn-st ${trn.status}" style="font-size:9px;padding:2px 6px">
      <span class="trn-st-dot"></span>${trn.status==='open'?tr('home.statusOpen'):tr('home.statusFull')}
    </span>
    <span class="cal-slots ${c}">${(trn.participants||[]).length}/${trn.capacity}</span>
  </div>
</div>`;
  }

  // group by month for calendar
  const byMonth = {};
  T.forEach(t => { (byMonth[t.month] = byMonth[t.month]||[]).push(t); });
  const calHtml = Object.entries(byMonth).map(([m, ts]) => `
<div class="cal-month">
  <div class="cal-month-hdr">
    <span class="cal-month-title">${m}</span>
    <div class="cal-month-line"></div>
    <span class="cal-month-count">${tr('home.tournCount', { n: ts.length })}</span>
  </div>
  ${ts.map(calRow).join('')}
</div>`).join('');

  const isS = homeActiveTab === 'schedule';
  const isC = homeActiveTab === 'calendar';
  const isA = homeActiveTab === 'archive';

  // ── Archive content builder ─────────────────────────────
  function archCardHtml(trn) {
    const isApp = trn.source === 'app';
    let dateStr = '—';
    dateStr = fmtDateLong(trn.date);
    const winner = trn.winner || (trn.players && trn.players[0] ? trn.players[0].name : '');
    const cnt    = trn.playersCount || (trn.players ? trn.players.length : 0);
    const rds    = trn.rPlayed ? '🏐 ' + tr('home.roundsCount', { n: trn.rPlayed }) : '';
    return `
<div class="arch-card" onclick="showTournamentDetails(${trn.id})" style="cursor:pointer">
  <div class="arch-card-accent"></div>
  <div class="arch-card-body">
    <div class="arch-card-top">
      <div>
        <div class="arch-name">${esc(trn.name)}</div>
        <div class="arch-date">📅 ${dateStr}</div>
      </div>
      <div class="arch-badges">
        <span class="arch-src ${isApp?'app':'manual'}">${isApp?tr('home.appBadge'):tr('home.manualBadge')}</span>
        ${!isApp?`<button class="arch-del-btn" onclick="event.stopPropagation();deleteManualTournament(${trn.id})" title="${escAttr(tr('home.deleteTitle'))}">✕</button>`:''}
      </div>
    </div>
    <div class="arch-meta">
      <span class="arch-chip">${esc(trn.format||'King of the Court')}</span>
      <span class="arch-chip">${esc(trn.division||'—')}</span>
      ${cnt?`<span class="arch-chip blue">👥 ${tr('home.playersCount', { n: cnt })}</span>`:''}
      ${rds?`<span class="arch-chip blue">${rds}</span>`:''}
      ${winner?`<span class="arch-chip gold">🥇 ${esc(winner)}</span>`:''}
    </div>
    ${trn.playerResults?.length>1 ? `
    <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:3px">
      ${trn.playerResults.slice(0,5).map((p,i)=>{
        return `<span style="font-size:10px;padding:2px 7px;border-radius:5px;
          background:rgba(255,255,255,.05);border:1px solid #2a2a40;color:var(--muted)">
          ${MEDALS_3[i]||'·'} ${esc(p.name)} ${p.pts?`<b style="color:var(--gold)">${p.pts}</b>`:''}
        </span>`;
      }).join('')}
      ${trn.playerResults.length>5?`<span style="font-size:10px;color:var(--muted)">+${trn.playerResults.length-5}</span>`:''}
    </div>` : ''}
  </div>
</div>`;
  }

  const archiveHtml = (() => {
    const appT = (() => {
      try {
        return loadHistory()
          .map(row => ({...row, source:'app', playersCount:row.players?.length||0,
            winner: row.players?.[0]?.name||'',
            format: row.format||'King of the Court', division: row.division||tr('home.divMixed')}));
      } catch(e){ return []; }
    })();
    const manT = loadManualTournaments();
    let all  = [...appT, ...manT];

    // Apply search filter
    const q = archiveSearch.toLowerCase().trim();
    if (q) {
      all = all.filter(t => {
        if ((t.name||'').toLowerCase().includes(q)) return true;
        if ((t.winner||'').toLowerCase().includes(q)) return true;
        const plrs = t.players || t.playerResults || [];
        return plrs.some(p => (p.name||'').toLowerCase().includes(q));
      });
    }

    // Apply sort
    if (archiveSort === 'date_desc')  all.sort((a,b) => (b.date||'') > (a.date||'') ? 1 : -1);
    else if (archiveSort === 'date_asc') all.sort((a,b) => (a.date||'') > (b.date||'') ? 1 : -1);
    else if (archiveSort === 'players') all.sort((a,b) => (b.playersCount||0) - (a.playersCount||0));
    else if (archiveSort === 'pts') all.sort((a,b) => (b.totalScore||0) - (a.totalScore||0));

    // Search bar HTML
    const searchHtml = `
    <div class="arch-search-row">
      <input class="arch-search-inp" type="text" placeholder="${escAttr(tr('home.searchPlaceholder'))}"
        value="${esc(archiveSearch)}"
        oninput="archiveSearch=this.value;setHomeTab('archive')">
      <select class="arch-sort-sel" onchange="archiveSort=this.value;setHomeTab('archive')">
        <option value="date_desc"${archiveSort==='date_desc'?' selected':''}>${tr('home.sortNewest')}</option>
        <option value="date_asc"${archiveSort==='date_asc'?' selected':''}>${tr('home.sortOldest')}</option>
        <option value="players"${archiveSort==='players'?' selected':''}>${tr('home.sortPlayers')}</option>
        <option value="pts"${archiveSort==='pts'?' selected':''}>${tr('home.sortPoints')}</option>
      </select>
    </div>`;

    const formHtml = homeArchiveFormOpen ? `
<div class="arch-add-form">
  <div class="arch-form-title">${tr('home.formTitle')}</div>
  <div class="arch-form-grid">
    <input class="arch-form-inp arch-form-full" id="arch-inp-name"
      type="text" placeholder="${escAttr(tr('home.tournamentNamePh'))}">
    <input class="arch-form-inp" id="arch-inp-date"
      type="date" value="${new Date().toISOString().split('T')[0]}">
    <select class="arch-form-sel" id="arch-inp-fmt">
      <option>King of the Court</option>
      <option>Round Robin</option>
      <option>${tr('home.formatOlympic')}</option>
      <option>${tr('home.formatOther')}</option>
    </select>
    <select class="arch-form-sel" id="arch-inp-div">
      <option>${tr('home.divMen')}</option>
      <option>${tr('home.divWomen')}</option>
      <option>${tr('home.divMixed')}</option>
    </select>
  </div>

  <!-- Player results section -->
  <div class="arch-plr-section">
    <div class="arch-plr-section-title">${tr('home.playerResultsTitle')}</div>
    <div class="arch-plr-add-row">
      <input class="arch-form-inp arch-plr-name" id="arch-plr-inp"
        type="text" placeholder="${escAttr(tr('home.placeholderSurnameShort'))}"
        onkeydown="if(event.key==='Enter')addArchFormPlayer()">
      <input class="arch-form-inp arch-plr-pts" id="arch-plr-pts-inp"
        type="number" min="0" max="999" placeholder="${escAttr(tr('home.placeholderPts'))}"
        onkeydown="if(event.key==='Enter')addArchFormPlayer()">
      <div class="arch-plr-gender-wrap">
        <button id="arch-g-btn-M" class="arch-plr-g-btn sel-M" onclick="setArchFormGender('M')">${tr('home.genderM')}</button>
        <button id="arch-g-btn-W" class="arch-plr-g-btn" onclick="setArchFormGender('W')">${tr('home.genderW')}</button>
      </div>
      <button class="arch-plr-add-btn" onclick="addArchFormPlayer()">+</button>
    </div>
    <div id="arch-plr-list-wrap">${_archPlrListHtml()}</div>
  </div>

  <button class="arch-save-btn" onclick="submitManualTournament()">
    ${homeArchiveFormPlayers.length ? tr('home.saveBtnPlayers', { n: homeArchiveFormPlayers.length }) : tr('home.saveBtnArchive')}
  </button>
</div>` : '';

    const listHtml = all.length === 0 ? `
<div class="arch-empty">
  <div class="arch-empty-icon">🏆</div>
  ${tr('home.archiveEmpty')}
</div>` : (() => {
      const appOnes = all.filter(t=>t.source==='app');
      const manOnes = all.filter(t=>t.source==='manual');
      let html = '';
      if (appOnes.length) {
        html += `<div class="arch-divider"><div class="arch-divider-line"></div><span class="arch-divider-txt">📱 ${tr('home.fromApp')} (${appOnes.length})</span><div class="arch-divider-line"></div></div>`;
        html += appOnes.map(archCardHtml).join('');
      }
      if (manOnes.length) {
        html += `<div class="arch-divider"><div class="arch-divider-line"></div><span class="arch-divider-txt">✏️ ${tr('home.addedManually')} (${manOnes.length})</span><div class="arch-divider-line"></div></div>`;
        html += manOnes.map(archCardHtml).join('');
      }
      return html;
    })();

    return searchHtml + formHtml + listHtml;
  })();

  return `
<div class="home-wrap">
  <!-- Hero -->
  <div class="home-hero">
    <div class="home-badge">${tr('home.season')}</div>
    <div class="home-title">${tr('home.dominate')}<br><span>${tr('home.court')}</span></div>
    <div class="home-subtitle">${tr('home.subtitle')}</div>
    <div class="home-stats">
      <div class="home-stat"><div class="home-stat-val">${T.length}</div><div class="home-stat-lbl">${tr('home.tournamentsLabel')}</div></div>
      <div class="home-stat"><div class="home-stat-val">${totalReg}+</div><div class="home-stat-lbl">${tr('home.participantsLabel')}</div></div>
      <div class="home-stat"><div class="home-stat-val">${openCount}</div><div class="home-stat-lbl">${tr('home.openLabel')}</div></div>
    </div>
  </div>

  <!-- Player DB banner -->
  ${(() => {
    const db = loadPlayerDB();
    const total = db.length;
    const men   = db.filter(p=>p.gender==='M').length;
    const women = db.filter(p=>p.gender==='W').length;
    // pick up to 2 real names for avatars
    const topM = db.filter(p=>p.gender==='M').sort((a,b)=>(b.totalPts||0)-(a.totalPts||0))[0];
    const topW = db.filter(p=>p.gender==='W').sort((a,b)=>(b.totalPts||0)-(a.totalPts||0))[0];
    const av1  = topM ? (topM.name||'').slice(0,2).toUpperCase() : '🏋️';
    const av2  = topW ? (topW.name||'').slice(0,2).toUpperCase() : '👩';
    const av3  = total > 2 ? `+${total-2}` : '👤';
    return `
  <button class="plr-banner" onclick="switchTab('players')">
    <div class="plr-banner-avatars">
      <div class="plr-av" title="${topM?escAttr(topM.name):tr('home.menAvatar')}">${av1}</div>
      <div class="plr-av" title="${topW?escAttr(topW.name):tr('home.womenAvatar')}">${av2}</div>
      <div class="plr-av">${av3}</div>
    </div>
    <div class="plr-banner-body">
      <div class="plr-banner-title">👤 ${tr('home.ratingTitle')} <span>${tr('home.ratingHighlight')}</span></div>
      <div class="plr-banner-sub">${tr('home.ratingSub')}</div>
      <div class="plr-banner-pill">
        🏋️ ${men} ${tr('home.menShort')} &nbsp;·&nbsp; 👩 ${women} ${tr('home.womenShort')} &nbsp;·&nbsp; ${tr('home.totalLabel')} ${total}
      </div>
    </div>
    <div class="plr-banner-arrow">→</div>
  </button>`;
  })()}

  <!-- Epic Player Card -->
  <div class="player-showcase">
    <div class="epic-player-card">
      <div class="card-top-row">
        <div class="hex-border hex-avatar">
          <div class="hex-inner">
            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect fill='%23ff5e00' width='150' height='150'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-family='sans-serif' font-size='28' font-weight='700'%3EPLAYER%3C/text%3E%3C/svg%3E" alt="Mamedov" class="avatar-img" loading="lazy">
          </div>
        </div>
        <div class="hex-border hex-logo">
          <div class="hex-inner">
            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23111' width='100' height='100'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%23ff5e00' font-family='sans-serif' font-size='18' font-weight='700'%3ELOGO%3C/text%3E%3C/svg%3E" alt="Lyutye Logo" class="logo-img" loading="lazy">
          </div>
        </div>
      </div>
      <div class="player-identity">
        <h2 class="player-name">MAMEDOV</h2>
        <div class="player-level-hex">
          <div class="hex-inner">7</div>
        </div>
      </div>
      <div class="player-rank">${tr('home.rankDemo')}</div>
      <div class="badges-grid">
        <div class="badge badge-gold">🏆 KING OF COURT 2026</div>
        <div class="badge badge-fire">🔥 5 WIN STREAK</div>
        <div class="badge badge-ice">❄️ SNOW MASTER</div>
        <div class="badge badge-silver">🥈 2 SIDE OUT TOURNEY</div>
      </div>
      <div class="battle-history">
        <div class="history-header">
          <span>${tr('home.lastBattles')}</span>
          <span>${tr('home.dateCol')}</span>
          <span>${tr('home.resultCol')}</span>
          <span>${tr('home.placeCol')}</span>
        </div>
        <div class="history-row row-win">
          <span class="tourney-name">DOUBLE TROUBLE</span>
          <span class="tourney-date">04.01.2026</span>
          <span class="tourney-tier">🥉 HARD</span>
          <span class="tourney-place">1</span>
        </div>
        <div class="history-row">
          <span class="tourney-name">KOTC</span>
          <span class="tourney-date">10.01.2026</span>
          <span class="tourney-tier">-</span>
          <span class="tourney-place">1</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="home-tabs">
    <button class="home-tab-btn ${isS?'active':''}" onclick="setHomeTab('schedule')" style="font-size:11px">
      ⚔️ ${tr('home.tabSchedule')}
    </button>
    <button class="home-tab-btn ${isC?'active':''}" onclick="setHomeTab('calendar')" style="font-size:11px">
      📅 ${tr('home.tabCalendar')}
    </button>
    <button class="home-tab-btn ${isA?'active':''}" onclick="setHomeTab('archive')" style="font-size:11px">
      🏆 ${tr('home.tabArchive')}
    </button>
  </div>

  <!-- Schedule -->
  <div style="display:${isS?'block':'none'}">
    <div class="home-sec-hdr">
      <span class="home-sec-title">${tr('home.upcoming')} <span>${tr('home.championships')}</span></span>
      <span class="home-sec-count">${tr('home.eventsCount', { n: T.length })}</span>
    </div>
    <div class="home-grid">${T.map(cardHtml).join('')}</div>
  </div>

  <!-- Calendar -->
  <div style="display:${isC?'block':'none'}">
    <div class="home-sec-hdr">
      <span class="home-sec-title">${tr('home.calTitle')} <span>${tr('home.calSub')}</span></span>
      <span class="home-sec-count">${tr('home.calRange')}</span>
    </div>
    ${calHtml}
  </div>

  <!-- Archive -->
  <div style="display:${isA?'block':'none'}">
    <div class="home-sec-hdr">
      <span class="home-sec-title">${tr('home.archTitle')} <span>${tr('home.archSub')}</span></span>
    </div>
    ${_buildProgressionChart()}
    <button class="arch-add-toggle" onclick="toggleArchiveForm()">
      ${homeArchiveFormOpen ? tr('home.collapseForm') : tr('home.addPast')}
    </button>
    ${archiveHtml}
  </div>
</div>`;
}

function renderHistory() {
  const history = loadHistory();

  let html = `<div class="hist-section-title">${tr('home.archiveHistoryTitle')}</div>`;

  if (!history.length) {
    html += `<div class="hist-empty">${tr('home.noFinished')}</div>`;
    return html;
  }

  html += history.map(t => {
    const dateStr = fmtDateLong(t.date);
    const top = t.players.slice(0,5);
    return `<div class="hist-card" style="cursor:pointer" onclick="showTournamentDetails(${t.id})">
      <div class="hist-hdr">
        <div>
          <div class="hist-name">${esc(t.name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">📅 ${dateStr}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;align-items:flex-start">
          <button class="btn-gsh-hist" id="gsh-btn-${t.id}" onclick="event.stopPropagation();exportToSheetsFromHistory(${t.id})" title="${escAttr(tr('home.exportSheetsTitle'))}">📊 Sheets</button>
          <button class="btn-pdf-hist" onclick="event.stopPropagation();exportTournamentPDF(${t.id})">📄 PDF</button>
          <button class="btn-del-hist" onclick="event.stopPropagation();deleteHistory(${t.id})">✕</button>
        </div>
      </div>
      <div class="hist-meta-row">
        <span class="hist-chip">👥 ${tr('home.playersCount', { n: t.players.length })}</span>
        <span class="hist-chip">🏐 ${tr('home.roundsCount', { n: t.rPlayed })}</span>
        <span class="hist-chip">⚡ ${t.totalScore} ${tr('home.pts')}</span>
        <span class="hist-chip">🏟 ${t.nc} ${tr('home.courtCount')} × ${t.ppc}</span>
      </div>
      <div class="hist-podium">
        ${top.map((p,i) => `<div class="hist-row">
          <span class="hist-place-num">${MEDALS_5[i]||i+1}</span>
          <span class="hist-p-name">${p.gender==='M'?'🏋️':'👩'} ${esc(p.name)}</span>
          <span style="font-size:10px;color:var(--muted)">${p.courtName||''}</span>
          <span class="hist-p-pts">${p.totalPts} ${tr('home.pts')}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  return html;
}

// ════════════════════════════════════════════════════════════
// PROGRESSION CHART (last 10 tournaments)
// ════════════════════════════════════════════════════════════
function _buildProgressionChart() {
  const history = loadHistory();
  if (history.length < 2) return '';

  const last10 = history.slice(0, 10).reverse(); // oldest → newest
  const maxScore = Math.max(...last10.map(t => t.totalScore || 0), 1);

  const bars = last10.map(t => {
    const sc    = t.totalScore || 0;
    const pct   = Math.round(sc / maxScore * 100);
    const cnt   = t.players?.length || 0;
    let dateLabel = '';
    try {
      dateLabel = new Date(t.date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
    } catch(e) { dateLabel = t.date || ''; }
    return `<div class="prog-bar-col" onclick="showTournamentDetails(${t.id})" title="${esc(t.name)}: ${sc} ${tr('home.pts')}, ${cnt} pl.">
      <div class="prog-bar-val">${sc}</div>
      <div class="prog-bar" style="height:${Math.max(pct, 8)}%"></div>
      <div class="prog-bar-lbl">${dateLabel}</div>
    </div>`;
  }).join('');

  return `
  <div class="prog-chart-wrap">
    <div class="prog-chart-title">${tr('home.progression')}</div>
    <div class="prog-chart">${bars}</div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
// TOURNAMENT DETAILS MODAL (from kotc3_history)
// ════════════════════════════════════════════════════════════
function showTournamentDetails(trnId) {
  // Try kotc3_history first, then manual tournaments
  let trn = loadHistory().find(h => h.id === trnId) || null;
  if (!trn) {
    const manual = loadManualTournaments();
    trn = manual.find(m => m.id === trnId);
  }
  if (!trn) { showToast(tr('home.tournamentNotFound')); return; }

  document.getElementById('trn-detail-modal')?.remove();

  const players   = trn.players || trn.playerResults || [];
  const dateStr   = fmtDateLong(trn.date);
  const cnt       = players.length || trn.playersCount || 0;
  const rPlayed   = trn.rPlayed || 0;
  const totalScore= trn.totalScore || players.reduce((s,p) => s + (p.totalPts||p.pts||0), 0);
  const avgGlobal = cnt && rPlayed ? (totalScore / (cnt * rPlayed)).toFixed(1) : '—';

  // Enrich players with avg and rating points
  const enriched = players.map((p, i) => {
    const pts   = p.totalPts ?? p.pts ?? 0;
    const avg   = rPlayed ? (pts / rPlayed).toFixed(1) : '—';
    const place = i + 1;
    const rPts  = place <= POINTS_TABLE.length ? POINTS_TABLE[place - 1] : 0;
    return { ...p, pts, avg, place, rPts };
  });

  const mvp     = enriched[0];
  const top3    = enriched.slice(0, 3);

  // Highlights
  const highlightsHtml = _buildHighlights(trn, enriched, avgGlobal);

  // Podium
  const podiumHtml = top3.length ? `
    <div class="trd-section">${tr('home.podiumTitle')}</div>
    <div class="trd-podium">
      ${top3.map((p, i) => `
        <div class="trd-pod-row">
          <span class="trd-pod-medal">${MEDALS_3[i]}</span>
          <span class="trd-pod-name">${p.gender==='M'?'🏋️':'👩'} ${esc(p.name)}</span>
          <span class="trd-pod-pts">${p.pts} ${tr('home.pts')}</span>
          <span class="trd-pod-avg">${p.avg}${tr('home.perRound')}</span>
        </div>`).join('')}
    </div>` : '';

  // Full ranking table
  const rankingHtml = enriched.length > 3 ? `
    <div class="trd-section">${tr('home.fullRanking')}</div>
    <div class="trd-table-wrap">
      <table class="trd-table">
        <thead><tr>
          <th>#</th><th>${tr('home.colPlayer')}</th><th>${tr('home.colPoints')}</th><th>${tr('home.colAvg')}</th><th>${tr('home.colRating')}</th>
        </tr></thead>
        <tbody>
          ${enriched.map(p => `<tr>
            <td><span class="trd-rank-num">${p.place <= 3 ? MEDALS_3[p.place-1] : p.place}</span></td>
            <td class="trd-rank-name">${p.gender==='M'?'🏋️':'👩'} ${esc(p.name)}${p.courtName ? ` <span class="trd-court-tag">${esc(p.courtName)}</span>` : ''}</td>
            <td class="trd-rank-pts">${p.pts}</td>
            <td class="trd-rank-avg">${p.avg}</td>
            <td class="trd-rank-rpts">+${p.rPts}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  // Meta chips
  const metaHtml = `
    <div class="trd-meta-row">
      ${trn.format ? `<span class="trd-chip">👑 ${esc(trn.format)}</span>` : ''}
      ${trn.division ? `<span class="trd-chip">${esc(trn.division)}</span>` : ''}
      ${trn.nc ? `<span class="trd-chip">🏟 ${trn.nc} ${tr('home.courtCount')}</span>` : ''}
      ${trn.ppc ? `<span class="trd-chip">👥 ${trn.ppc} ${tr('home.perCourt')}</span>` : ''}
    </div>`;

  const overlay = document.createElement('div');
  overlay.id = 'trn-detail-modal';
  overlay.className = 'td-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.innerHTML = `
  <div class="td-modal">
    <div class="td-accent" style="background:var(--gold)"></div>
    <div class="td-body" style="overflow-y:auto;padding:16px 16px 24px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div class="td-name" style="margin:0">${esc(trn.name)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">
            📅 ${dateStr}${rPlayed ? ` · 🏐 ${tr('home.roundsCount', { n: rPlayed })}` : ''}
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">
            👥 ${tr('home.playersCount', { n: cnt })} · ⚡ ${totalScore} ${tr('home.pts')} · avg ${avgGlobal}${tr('home.perRound')}
          </div>
        </div>
        <button onclick="this.closest('.td-overlay').remove()" style="background:transparent;border:1px solid #2a2a44;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:16px">✕</button>
      </div>

      ${metaHtml}
      ${podiumHtml}
      ${highlightsHtml}
      ${rankingHtml}

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="trd-share-btn" onclick="event.stopPropagation();_shareTournamentResult(${trnId})">📤 ${tr('home.share')}</button>
        <button onclick="this.closest('.td-overlay').remove()" style="flex:1;padding:10px;background:#2a2a44;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">${tr('home.close')}</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
}

function _buildHighlights(t, enriched, avgGlobal) {
  const items = [];
  const mvp = enriched[0];
  if (mvp) items.push(tr('home.mvp', { name: esc(mvp.name), pts: mvp.pts, avg: mvp.avg }));

  // Best round (from saved data if available)
  if (t.bestRound) {
    items.push(tr('home.bestRound', { name: esc(t.bestRound.name), score: t.bestRound.score, round: t.bestRound.round+1 }));
  }

  // Best pair (from saved data if available)
  if (t.bestPair) {
    items.push(tr('home.bestPair', { man: esc(t.bestPair.man), woman: esc(t.bestPair.woman), pts: t.bestPair.totalPts }));
  }

  // Average score per round
  if (avgGlobal !== '—') {
    items.push(tr('home.avgPerRound', { avg: avgGlobal }));
  }

  // Court stats if available
  if (t.courtStats?.length) {
    const best = t.courtStats.reduce((a,b) => (+a.avgPts > +b.avgPts ? a : b));
    items.push(tr('home.bestCourt', { name: esc(best.name), avg: best.avgPts }));
  }

  if (!items.length) return '';

  return `
    <div class="trd-section">${tr('home.highlightsTitle')}</div>
    <div class="trd-highlights">
      ${items.map(i => `<div class="trd-hl-item">${i}</div>`).join('')}
    </div>`;
}

function _shareTournamentResult(trnId) {
  let t = loadHistory().find(h => h.id === trnId) || null;
  if (!t) {
    const manual = loadManualTournaments();
    t = manual.find(m => m.id === trnId);
  }
  if (!t) return;

  const players = t.players || t.playerResults || [];
  const top3    = players.slice(0, 3);
  const cnt     = players.length || t.playersCount || 0;
  const dateStr = t.date ? new Date(t.date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}) : '';

  let text = `👑 ${t.name}\n📅 ${dateStr} · 👥 ${tr('home.playersCount', { n: cnt })}\n\n${tr('home.podiumTitle')}\n`;
  top3.forEach((p,i) => {
    const pts = p.totalPts ?? p.pts ?? 0;
    text += `${MEDALS_3[i]} ${p.name} — ${pts} ${tr('home.pts')}\n`;
  });
  if (t.totalScore) text += `\n⚡ ${t.totalScore} ${tr('home.pts')}`;
  if (t.rPlayed) text += ` / ${tr('home.roundsCount', { n: t.rPlayed })}`;
  text += '\n#KingBeach #Volley';

  shareText(text);
}
