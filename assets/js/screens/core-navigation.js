'use strict';

// ════════════════════════════════════════════════════════════
// CORE-NAVIGATION: Dropdowns, nav build, tab switching
// Split from core.js (A3.2)
// ════════════════════════════════════════════════════════════

function tr(key, params) {
  return typeof globalThis.i18n?.t === 'function' ? globalThis.i18n.t(key, params) : key;
}

function _iptNavGroupLabel(courtCount, ci) {
  const m = {
    1: [tr('div.hard')],
    2: [tr('div.hard'), tr('div.lite')],
    3: [tr('div.hard'), tr('div.medium'), tr('div.lite')],
    4: [tr('div.hard'), tr('div.advance'), tr('div.medium'), tr('div.lite')],
  };
  return m[courtCount]?.[ci] || tr('nav.court');
}

function _navDivDefs() {
  return {
    hard:    { icon:'🔥', main:'HD', sub: tr('div.top'),         color:'#e94560' },
    advance: { icon:'⚡', main:'AV', sub: tr('div.navSubAdvance'), color:'#f5a623' },
    medium:  { icon:'⚙️', main:'MD', sub: tr('div.navSubMedium'),  color:'#4DA8DA' },
    lite:    { icon:'🍀', main:'LT', sub: tr('div.navSubLite'),    color:'#6ABF69' },
  };
}

// ── Dropdown engine ───────────────────────────────────────
let openDropdownId = null;

function openDropdown(id, anchorEl) {
  closeDropdown();
  const menu = document.getElementById(id);
  if (!menu) return;
  const rect = anchorEl.getBoundingClientRect();
  menu.style.left = Math.min(rect.left, window.innerWidth - 170) + 'px';
  menu.style.top  = rect.bottom + 'px';
  menu.classList.add('open');
  anchorEl.classList.add('dd-open');
  document.getElementById('dd-backdrop').classList.add('open');
  openDropdownId = id;
}

function closeDropdown() {
  if (openDropdownId) {
    const m = document.getElementById(openDropdownId);
    if (m) m.classList.remove('open');
  }
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('dd-open'));
  document.getElementById('dd-backdrop').classList.remove('open');
  openDropdownId = null;
}

document.getElementById('dd-backdrop').addEventListener('click', closeDropdown);

function toggleDropdown(id, btn) {
  if (openDropdownId === id) { closeDropdown(); return; }
  openDropdown(id, btn);
}

// ── Navigation build ──────────────────────────────────────
function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  const tabLabels = {
    svod: tr('nav.svod'),
    stats: tr('nav.stats'),
    rating: tr('nav.rating'),
    roster: tr('nav.roster'),
  };

  const top = document.createElement('div');
  top.className = 'nav-top';

  const leftGroup = document.createElement('div');
  leftGroup.className = 'nav-top-actions';

  const homeBtn = document.createElement('button');
  homeBtn.id = 'nav-logo';
  homeBtn.type = 'button';
  homeBtn.className = 'nb nb-icon';
  homeBtn.dataset.tab = 'home';
  homeBtn.textContent = '🏠';
  homeBtn.setAttribute('aria-label', tr('nav.home'));
  homeBtn.title = tr('nav.home');
  homeBtn.addEventListener('click', () => switchTab('home'));
  leftGroup.appendChild(homeBtn);

  [
    { label: tr('nav.shortSvod'), tab:'svod' },
    { label: tr('nav.shortStats'), tab:'stats' },
    { label:'👥', tab:'rating' },
    { label:'⚙️', tab:'roster' },
  ].forEach(({ label, tab }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nb';
    b.dataset.tab = tab;
    b.textContent = label;
    b.setAttribute('aria-label', tabLabels[tab] || label);
    b.addEventListener('click', () => switchTab(tab));
    leftGroup.appendChild(b);
  });

  top.appendChild(leftGroup);

  // F4.1: tablist только на кнопках экранов (без «Выход», чтобы стрелки не уводили на закрытие)
  if (typeof AriaTabList !== 'undefined') {
    AriaTabList.attach(leftGroup, {
      selector: '.nb[data-tab]',
      onActivate: (btn) => { const tab = btn.dataset.tab; if (tab) switchTab(tab); },
    });
  }

  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.className = 'nb nb-exit';
  exitBtn.textContent = '✕';
  exitBtn.setAttribute('aria-label', tr('nav.exit'));
  exitBtn.title = tr('nav.exit');
  exitBtn.addEventListener('click', () => {
    if (!confirm(tr('nav.exitConfirm'))) return;
    let siteUrl = '';
    try {
      const params = new URLSearchParams(window.location.search || '');
      const queryUrl = params.get('siteUrl');
      if (queryUrl) siteUrl = queryUrl;
    } catch (_) {}
    if (!siteUrl) siteUrl = (typeof SITE_URL !== 'undefined' && SITE_URL) || '';
    if (!siteUrl) { try { if (document.referrer) siteUrl = new URL('/', document.referrer).href; } catch (_) {} }
    if (!siteUrl) { try { siteUrl = new URL('/', window.location.href).href; } catch (_) { siteUrl = '/'; } }
    try {
      if (window.top !== window.self) window.top.location.href = siteUrl;
      else window.location.href = siteUrl;
    } catch(e) { window.location.href = siteUrl; }
  });
  top.appendChild(exitBtn);
  nav.appendChild(top);

  // ── Pill row: courts + separator + divisions ─────────
  const row = document.createElement('div');
  row.className = 'nav-pills-row';
  row.setAttribute('aria-label', tr('nav.pillsNavAria'));

  const _iptNavTrnId  = typeof _iptActiveTrnId !== 'undefined' ? _iptActiveTrnId : null;
  const _iptNavTrn    = _iptNavTrnId ? getTournaments().find(t => t.id === _iptNavTrnId) : null;
  const _iptNavGroups = _iptNavTrn?.ipt?.groups || null;
  const _rosterIsIPT  = typeof _rosterFmt !== 'undefined' && _rosterFmt === 'ipt';
  const _iptCourtsCnt = typeof _iptCourts  !== 'undefined' ? _iptCourts : 1;
  const _isIPT = !!(_iptNavGroups || _rosterIsIPT);
  const courtCount = _iptNavGroups
    ? _iptNavGroups.length
    : (_rosterIsIPT ? _iptCourtsCnt : nc);
  const ALL_DIV_DEFS = _navDivDefs();

  for (let ci = 0; ci < courtCount; ci++) {
    const meta = COURT_META[ci] || COURT_META[0];
    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'nav-pill'; p.dataset.tab = ci;
    p.style.setProperty('--pill-c', meta.color);
    const subLabel = _iptNavGroups?.[ci]?.name
      || (_isIPT ? _iptNavGroupLabel(courtCount, ci) : tr('nav.court'));
    p.setAttribute('aria-label', tr('nav.courtPillAria', { n: ci + 1, label: subLabel }));
    p.innerHTML = `<span class="pill-dot"></span><span class="pill-main">${tr('nav.courtBadge', { n: ci + 1 })}</span><span class="pill-sub">${subLabel}</span>`;
    p.addEventListener('click', ()=>switchTab(ci));
    row.appendChild(p);
  }

  const sep = document.createElement('div');
  sep.className = 'nav-pill-sep';
  row.appendChild(sep);

  const divKeys = _isIPT
    ? (typeof getIPTFinalsNavKeys === 'function' ? getIPTFinalsNavKeys(courtCount) : ['hard'])
    : activeDivKeys();

  divKeys.map(id => ({id, ...ALL_DIV_DEFS[id]})).forEach(({id,icon,main,sub,color}) => {
    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'nav-pill pill-div-btn'; p.dataset.tab = id;
    p.style.setProperty('--pill-c', color);
    p.setAttribute('aria-label', `${main} ${sub}`);
    p.innerHTML = `<span class="pill-dot"></span><span class="pill-main">${icon} ${main}</span><span class="pill-sub">${sub}</span>`;
    p.addEventListener('click', ()=>switchTab(id));
    row.appendChild(p);
  });

  nav.appendChild(row);
  // F4.1: ARIA tablist keyboard navigation for pill row
  if (typeof AriaTabList !== 'undefined') {
    AriaTabList.attach(row, {
      selector: '.nav-pill',
      onActivate: (btn) => { const tab = btn.dataset.tab; switchTab(isNaN(tab) ? tab : Number(tab)); }
    });
  }
  syncNavActive();
  syncDivLock();
}

// ── Sync active state ─────────────────────────────────────
function syncNavActive() {
  document.querySelectorAll('.nb[data-tab]').forEach(b => {
    const isActive = b.dataset.tab === String(activeTabId);
    b.classList.toggle('active', isActive);
    if (isActive) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.nav-pill[data-tab]').forEach(p => {
    const isActive = p.dataset.tab === String(activeTabId);
    p.classList.toggle('active', isActive);
    if (isActive) p.setAttribute('aria-current', 'page');
    else p.removeAttribute('aria-current');
  });
  syncIPTNav();
}

function syncIPTNav() {
  const trnId = typeof _iptActiveTrnId !== 'undefined' ? _iptActiveTrnId : null;
  const trn   = trnId ? getTournaments().find(t => t.id === trnId) : null;
  const groups = trn?.ipt?.groups;
  if (!groups) return;
  document.querySelectorAll('.nav-pill:not(.pill-div-btn)[data-tab]').forEach(pill => {
    const tab = parseInt(pill.dataset.tab);
    if (isNaN(tab)) return;
    const subEl = pill.querySelector('.pill-sub');
    if (subEl) subEl.textContent = groups[tab] ? groups[tab].name : tr('nav.court');
  });
}

// ── Tab switching ─────────────────────────────────────────
let _switchTabQueue = Promise.resolve();
function switchTab(id) {
  const run = async () => {
    await _switchTabInner(id);
  };
  _switchTabQueue = _switchTabQueue.then(run, run);
  return _switchTabQueue;
}

async function _switchTabInner(id) {
  closeDropdown();
  if (typeof id === 'string' && DIV_KEYS.includes(id) && !activeDivKeys().includes(id)) {
    id = activeDivKeys()[0] || 0;
  }
  const prevTabId = activeTabId;
  if (id === 'players') id = 'home';
  activeTabId = id;

  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const screen = document.getElementById(`screen-${id}`);
  if (!screen) return;

  // IPT mode override
  const _iptTrnId = typeof _iptActiveTrnId !== 'undefined' ? _iptActiveTrnId : null;
  const _iptTrn   = _iptTrnId ? getTournaments().find(t => t.id === _iptTrnId) : null;
  if (_iptTrn?.ipt?.groups) {
    if (typeof id === 'number' && _iptTrn.ipt.groups[id]) {
      screen.innerHTML = renderIPTGroup(id);
      screen.classList.add('active');
      syncNavActive();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const _activeFinals = typeof getIPTFinalsNavKeys === 'function'
      ? getIPTFinalsNavKeys(_iptTrn.ipt.groups.length) : ['hard'];
    const _finalsIdxMap = { hard:0, advance:1, medium:2, lite:3 };
    if (_activeFinals.includes(id)) {
      const fi = _finalsIdxMap[id];
      const groups = _iptTrn.ipt.groups;
      const allDone = groups.every(g => g.status === 'finished');
      if (allDone && fi < groups.length) {
        screen.innerHTML = renderIPTFinals(_iptTrn, fi);
        screen.classList.add('active');
        syncNavActive();
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }
      screen.innerHTML = `<div class="ipt-wrap"><div class="ipt-finals-stub">
        <div style="font-size:2rem">🏆</div>
        <div style="font-size:1.1rem;font-weight:700;margin:.5rem 0">${tr('div.' + id)}</div>
        <div style="color:var(--muted);font-size:.85rem">${tr('div.finalsLocked')}</div>
      </div></div>`;
      screen.classList.add('active');
      syncNavActive();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
  }

  if (id === 'home')    screen.innerHTML = renderHome();
  if (id === 'svod')    screen.innerHTML = renderSvod();
  if (id === 'roster') {
    if (hasRosterPassword() && !rosterUnlocked) {
      screen.classList.add('active');
      syncNavActive();
      const ok = await rosterRequestUnlock({ successMessage: '' });
      if (!ok) {
        activeTabId = prevTabId;
        switchTab(prevTabId != null ? prevTabId : 'svod');
        return;
      }
    }
    historyFilter = 'all';
    screen.innerHTML = renderRoster();
  }
  if (id === 'stats')  screen.innerHTML = renderStats();
  if (id === 'ipt')    screen.innerHTML = renderIPT();
  if (id === 'rating') screen.innerHTML = renderRating();
  if (id === 'hard' || id === 'advance' || id === 'medium' || id === 'lite') {
    if (!hasRound5Score()) {
      showToast(`🔒 ${tr('div.locked', { n: ppc, nc })}`);
      activeTabId = prevTabId;
      syncNavActive();
      return;
    }
    updateDivisions();
  }

  screen.classList.add('active');
  syncNavActive();
  window.scrollTo({top:0, behavior:'auto'});
}
