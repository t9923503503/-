'use strict';

function tr(key, params) {
  return typeof globalThis.i18n?.t === 'function' ? globalThis.i18n.t(key, params) : key;
}

function setHomeTab(tab) {
  if (tab === 'archive') tab = 'schedule';
  homeActiveTab = tab;
  homeArchiveFormOpen = false;
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
  const photoUrl      = (v('arch-inp-photo') || '').trim();

  // Save to archive
  const arr = loadManualTournaments();
  arr.unshift({ id: Date.now(), name, date, format, division,
    playersCount, winner, playerResults, source: 'manual', photoUrl });
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
  setHomeTab('schedule');
}
function deleteManualTournament(id) {
  saveManualTournaments(loadManualTournaments().filter(t => t.id !== id));
  setHomeTab('schedule');
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
    const thaiHrefOpts = {
      mode: thaiMeta.mode || 'MF',
      n: thaiMeta.n || 8,
      seed: thaiMeta.seed || 1,
      trnId: trn.id,
      courts: thaiMeta.courts,
      tours: thaiMeta.tours,
    };
    const thaiHref = (globalThis.sharedFormatLinks && typeof globalThis.sharedFormatLinks.buildThaiFormatUrl === 'function')
      ? globalThis.sharedFormatLinks.buildThaiFormatUrl(thaiHrefOpts)
      : (() => {
          const q = new URLSearchParams({
            mode: String(thaiHrefOpts.mode),
            n: String(thaiHrefOpts.n),
            seed: String(thaiHrefOpts.seed),
            trnId: String(trn.id),
          });
          const c = Number(thaiMeta.courts), t = Number(thaiMeta.tours);
          if (Number.isInteger(c) && c >= 1) q.set('courts', String(c));
          if (Number.isInteger(t) && t >= 1) q.set('tours', String(t));
          return `formats/thai/thai.html?${q.toString()}`;
        })();
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

  return `
<div class="home-wrap">
  <!-- Tabs -->
  <div class="home-tabs">
    <button class="home-tab-btn ${isS?'active':''}" onclick="setHomeTab('schedule')" style="font-size:11px">
      ⚔️ ${tr('home.tabSchedule')}
    </button>
    <button class="home-tab-btn ${isC?'active':''}" onclick="setHomeTab('calendar')" style="font-size:11px">
      📅 ${tr('home.tabCalendar')}
    </button>
    <a class="home-tab-btn" href="/archive" style="font-size:11px;text-decoration:none">
      🏆 ${tr('home.tabArchive')}
    </a>
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

      ${trn.photoUrl ? `
      <a class="trd-photo-link" href="${escAttr(trn.photoUrl)}" target="_blank" rel="noopener">
        ${tr('home.viewPhotos')}
      </a>` : ''}

      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="trd-share-btn" onclick="event.stopPropagation();_shareTournamentResult(${trnId})">📤 ${tr('home.share')}</button>
        <button class="trd-share-btn" style="background:#1a3a5e;border-color:#2a5a8e"
          onclick="event.stopPropagation();_setTournamentPhoto(${trnId})">
          ${trn.photoUrl ? tr('home.editPhoto') : tr('home.addPhoto')}
        </button>
        ${enriched.length && !trn.serverFinalized
          ? `<button id="td-finalize-btn" class="trd-share-btn" style="background:#1a6a3a;border-color:#2a8a4a"
              onclick="event.stopPropagation();_hubFinalizeTournament(${trnId},'history')">📤 На сервер</button>`
          : trn.serverFinalized
          ? `<button class="trd-share-btn" disabled style="opacity:.5">✅ Отправлено</button>`
          : ''}
        <button onclick="this.closest('.td-overlay').remove()" style="flex:1;padding:10px;background:#2a2a44;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">${tr('home.close')}</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
}

function _setTournamentPhoto(trnId) {
  const current = (() => {
    const h = loadHistory().find(x => x.id === trnId);
    if (h) return h.photoUrl || '';
    const m = loadManualTournaments().find(x => x.id === trnId);
    return m?.photoUrl || '';
  })();

  const url = window.prompt(tr('home.photoPrompt'), current);
  if (url === null) return; // cancelled
  const trimmed = url.trim();

  // Try history (kotc3_history)
  const hist = loadHistory();
  const hi = hist.findIndex(x => x.id === trnId);
  if (hi !== -1) {
    hist[hi] = { ...hist[hi], photoUrl: trimmed };
    saveHistory(hist);
    showToast(tr('home.photoSaved'));
    showTournamentDetails(trnId);
    return;
  }

  // Try tournaments store (kotc3_tournaments — manual/finished)
  const trns = getTournaments();
  const ti = trns.findIndex(x => String(x.id) === String(trnId));
  if (ti !== -1) {
    trns[ti] = { ...trns[ti], photoUrl: trimmed };
    saveTournaments(trns);
    showToast(tr('home.photoSaved'));
    showTournamentDetails(trnId);
    return;
  }

  showToast(tr('home.tournamentNotFound'));
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
