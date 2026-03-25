'use strict';

// ════════════════════════════════════════════════════════════
// ROSTER-FORMAT-LAUNCHER: Format tabs, IPT/Thai/KOTC launchers
// Split from roster.js (A3.2)
// ════════════════════════════════════════════════════════════

function tr(key, params) {
  return typeof globalThis.i18n?.t === 'function' ? globalThis.i18n.t(key, params) : key;
}

// ── IPT Quick-Start state ─────────────────────────────────────
let _rosterFmt    = localStorage.getItem('kotc3_roster_fmt')    || 'standard';

// ── Thai Format Launcher state (A0.3) ─────────────────────────
let _thaiMode = localStorage.getItem('kotc3_thai_mode') || 'MF';  // 'MF'|'MM'|'WW'
let _thaiN    = parseInt(localStorage.getItem('kotc3_thai_n') || '8', 10); // 8|10
let _thaiSeed = parseInt(localStorage.getItem('kotc3_thai_seed') || '1', 10);
let _thaiLimit  = parseInt(localStorage.getItem('kotc3_thai_lim') || '21', 10);
let _thaiFinish = localStorage.getItem('kotc3_thai_finish') || 'hard';
function _loadSelectedIds(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (_) {
    return new Set();
  }
}
let _thaiSelectedIds = _loadSelectedIds('kotc3_thai_sel');
let _iptCourts    = parseInt(localStorage.getItem('kotc3_ipt_courts') || '2', 10);
let _iptLimit     = parseInt(localStorage.getItem('kotc3_ipt_lim')    || '21', 10);
let _iptFinish    = localStorage.getItem('kotc3_ipt_finish') || 'hard';
let _iptGender    = localStorage.getItem('kotc3_ipt_gender') || 'mixed'; // 'male'|'female'|'mixed'
let _iptSelectedIds = _loadSelectedIds('kotc3_ipt_sel');

// ── IPT finals nav keys — зависят от кол-ва групп/кортов ────
function getIPTFinalsNavKeys(n) {
  if (n <= 1) return ['hard'];
  if (n === 2) return ['hard', 'lite'];
  if (n === 3) return ['hard', 'medium', 'lite'];
  return ['hard', 'advance', 'medium', 'lite'];
}

function switchRosterFmt(fmt) {
  _rosterFmt = fmt;
  localStorage.setItem('kotc3_roster_fmt', fmt);
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
  else switchTab('roster');
}

function setIPTCourts(n) {
  _iptCourts = n;
  localStorage.setItem('kotc3_ipt_courts', n);
  // Full re-render card (player count changes)
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

function setIPTQuickLimit(lim) {
  _iptLimit = lim;
  localStorage.setItem('kotc3_ipt_lim', lim);
  document.querySelectorAll('#seg-ipt-lim .seg-btn').forEach((b,i) => {
    b.classList.toggle('on', [10,12,15,18,21][i] === lim);
  });
}

function setIPTQuickFinish(f) {
  _iptFinish = f;
  localStorage.setItem('kotc3_ipt_finish', f);
  document.querySelectorAll('#seg-ipt-finish .seg-btn').forEach((b,i) => {
    b.classList.toggle('on', ['hard','balance'][i] === f);
  });
}

function setIPTGender(g) {
  _iptGender = g;
  localStorage.setItem('kotc3_ipt_gender', g);
  // Сбросить выбор — игроки другого пола должны уйти из списка
  _iptSelectedIds.clear();
  localStorage.setItem('kotc3_ipt_sel', '[]');
  // Перерисовать карточку чтобы обновился список и кнопки
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
  else switchTab('roster');
}

function iptTogglePlayer(pid) {
  if (_iptSelectedIds.has(pid)) {
    _iptSelectedIds.delete(pid);
  } else {
    _iptSelectedIds.add(pid);
  }
  localStorage.setItem('kotc3_ipt_sel', JSON.stringify([..._iptSelectedIds]));
  // Update counter
  const needed = _iptCourts * 8;
  const cnt = document.getElementById('ipt-ps-count');
  if (cnt) {
    const sel = _iptSelectedIds.size;
    cnt.textContent = tr('format.selectedCount', {sel, needed});
    cnt.style.color = sel === needed ? '#6ABF69' : sel > needed ? '#e94560' : 'var(--muted)';
  }
}

function iptPlayerSearch(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.ipt-pl-item').forEach(el => {
    const name = (el.dataset.name || '').toLowerCase();
    el.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

// Нормализация гендера: M/m/male → 'm', W/w/f/female → 'w'
function _normG(p) {
  var r = String(p && p.gender || '').toLowerCase();
  return (r === 'm' || r === 'male') ? 'm' : (r === 'w' || r === 'f' || r === 'female') ? 'w' : '';
}

function _renderIPTPlayerList() {
  // Фильтр по гендеру (нормализованный)
  const gfMap = { male: 'm', female: 'w', mixed: null };
  const gf = gfMap[_iptGender] || null;

  const db = loadPlayerDB()
    .filter(p => !p.id.startsWith('ipt_quick_'))
    .filter(p => !gf || _normG(p) === gf);

  const needed = _iptCourts * 8;

  // Удаляем из выбора тех кого нет в текущем отфильтрованном списке
  const validIds = new Set(db.map(p => p.id));
  let changed = false;
  for (const id of [..._iptSelectedIds]) {
    if (!validIds.has(id)) { _iptSelectedIds.delete(id); changed = true; }
  }
  if (changed) localStorage.setItem('kotc3_ipt_sel', JSON.stringify([..._iptSelectedIds]));

  // Sort: previously selected first, then by name
  const sorted = [...db].sort((a, b) => {
    const aS = _iptSelectedIds.has(a.id) ? 0 : 1;
    const bS = _iptSelectedIds.has(b.id) ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return (a.name || '').localeCompare(b.name || '', 'ru');
  });

  // Auto-select if nothing selected
  if (_iptSelectedIds.size === 0 && sorted.length > 0) {
    if (_iptGender === 'mixed') {
      // М/Ж: поровну — половина мужчин, половина женщин
      const half  = Math.floor(needed / 2);
      const men   = sorted.filter(p => _normG(p) === 'm').slice(0, half);
      const women = sorted.filter(p => _normG(p) === 'w').slice(0, half);
      // Если одного пола меньше — добираем из другого
      const picked = new Set([...men, ...women].map(p => p.id));
      const extra  = needed - picked.size;
      const rest   = sorted.filter(p => !picked.has(p.id));
      [...men, ...women, ...rest.slice(0, extra)]
        .forEach(p => _iptSelectedIds.add(p.id));
    } else {
      sorted.slice(0, needed).forEach(p => _iptSelectedIds.add(p.id));
    }
    localStorage.setItem('kotc3_ipt_sel', JSON.stringify([..._iptSelectedIds]));
  }

  const lvlBadge = l => {
    const map = { hard: tr('format.lvlHard'), medium: tr('format.lvlMed'), lite: tr('format.lvlLite'), advance: tr('format.lvlAdv') };
    return '<span class="ipt-pl-lv ' + (l||'medium') + '">' + (map[l]||tr('format.lvlMed')) + '</span>';
  };

  // Генерация одного item с нумерацией + кнопка смены пола
  // div вместо label — чтобы кнопка ♂/♀ кликалась отдельно от checkbox
  function _item(p, idx) {
    var chk    = _iptSelectedIds.has(p.id) ? 'checked' : '';
    var gd     = _normG(p);
    var gdAttr = gd ? ' data-gender="' + gd + '"' : '';
    var num    = '<span class="ipt-pl-num">' + (idx + 1) + '</span>';
    var swapBtn = '<button class="ipt-swap-g ' + (gd === 'w' ? 'w' : 'm')
      + '" onclick="iptSwapGender(\'' + p.id + '\')">'
      + (gd === 'w' ? '♀' : '♂') + '</button>';
    return '<div class="ipt-pl-item"' + gdAttr
      + ' data-name="' + (p.name||'').replace(/"/g,'')
      + '" data-pid="' + p.id + '">'
      + '<input type="checkbox" ' + chk + ' onchange="iptTogglePlayer(\'' + p.id + '\')">'
      + num + swapBtn
      + '<span class="ipt-pl-name" onclick="iptTogglePlayer(\'' + p.id + '\');this.parentElement.querySelector(\'input\').checked=!this.parentElement.querySelector(\'input\').checked">'
      + (p.name || '—') + '</span>'
      + lvlBadge(p.level)
      + '</div>';
  }

  var listHtml = '';
  var sel  = _iptSelectedIds.size;
  var selM = 0, selW = 0;

  if (_iptGender === 'mixed') {
    // Два отдельных блока: ♂ Мужчины и ♀ Женщины
    var men   = sorted.filter(function(p) { return _normG(p) === 'm'; });
    var women = sorted.filter(function(p) { return _normG(p) === 'w'; });
    selM = [..._iptSelectedIds].filter(function(id) { return _normG(db.find(function(p){return p.id===id;})) === 'm'; }).length;
    selW = [..._iptSelectedIds].filter(function(id) { return _normG(db.find(function(p){return p.id===id;})) === 'w'; }).length;
    var halfN   = Math.floor(needed / 2);
    var mColor  = selM === halfN ? '#6ABF69' : selM > halfN ? '#e94560' : 'var(--muted)';
    var wColor  = selW === halfN ? '#6ABF69' : selW > halfN ? '#e94560' : 'var(--muted)';
    var menHtml   = men.map(_item).join('') || '<div class="sc-info" style="padding:6px 0;opacity:.5">' + tr('format.noMenInDb') + '</div>';
    var womenHtml = women.map(_item).join('') || '<div class="sc-info" style="padding:6px 0;opacity:.5">' + tr('format.noWomenInDb') + '</div>';

    var mBtns = '<span class="ipt-pl-section-btns">'
      + '<button class="ipt-sec-btn" onclick="iptSelectGroup(\'m\')">' + tr('format.selectAll') + '</button>'
      + '<button class="ipt-sec-btn off" onclick="iptDeselectGroup(\'m\')">' + tr('format.deselectAll') + '</button>'
      + '</span>';
    var wBtns = '<span class="ipt-pl-section-btns">'
      + '<button class="ipt-sec-btn" onclick="iptSelectGroup(\'w\')">' + tr('format.selectAll') + '</button>'
      + '<button class="ipt-sec-btn off" onclick="iptDeselectGroup(\'w\')">' + tr('format.deselectAll') + '</button>'
      + '</span>';

    listHtml = '<div class="ipt-pl-section">'
      + '<div class="ipt-pl-section-hdr"><span class="ipt-pl-section-icon m">♂</span> ' + tr('roster.men') + ' ' + mBtns + '<span class="ipt-pl-section-cnt" style="color:' + mColor + '"><b>' + selM + '</b> / ' + halfN + '</span></div>'
      + '<div class="ipt-pl-list" data-group="m">' + menHtml + '</div>'
      + '</div>'
      + '<div class="ipt-pl-section">'
      + '<div class="ipt-pl-section-hdr"><span class="ipt-pl-section-icon w">♀</span> ' + tr('roster.women') + ' ' + wBtns + '<span class="ipt-pl-section-cnt" style="color:' + wColor + '"><b>' + selW + '</b> / ' + halfN + '</span></div>'
      + '<div class="ipt-pl-list" data-group="w">' + womenHtml + '</div>'
      + '</div>';
  } else {
    var items = sorted.map(_item).join('') || '<div class="sc-info" style="padding:12px 0">' + tr('format.dbEmpty') + '</div>';
    listHtml = '<div class="ipt-pl-list">' + items + '</div>';
  }

  var countColor = sel === needed ? '#6ABF69' : sel > needed ? '#e94560' : 'var(--muted)';
  var mixInfo    = _iptGender === 'mixed' ? ' <span style="opacity:.6;font-size:.85em">(♂<b>' + selM + '</b> ♀<b>' + selW + '</b>)</span>' : '';

  var searchPh = { male: tr('format.searchMen'), female: tr('format.searchWomen'), mixed: tr('format.searchPlayer') }[_iptGender] || tr('format.searchPlayer');
  var countText = _iptGender === 'mixed'
    ? tr('format.selectedCountMix', {sel, needed, m: selM, w: selW})
    : tr('format.selectedCount', {sel, needed});

  return '<div class="ipt-ps-wrap">'
    + '<input class="ipt-ps-inp" type="text" placeholder="' + searchPh + '" oninput="iptPlayerSearch(this.value)">'
    + listHtml
    + '<div class="ipt-ps-footer">'
    + '<span id="ipt-ps-count" style="color:' + countColor + '">' + countText + '</span>'
    + '<button class="ipt-ps-clear-btn" onclick="iptClearSelection()">' + tr('format.clearSelection') + '</button>'
    + '</div></div>';
}

// Переключить пол игрока М↔Ж в базе
function iptSwapGender(pid) {
  var db = loadPlayerDB();
  var p = db.find(function(d) { return d.id === pid; });
  if (!p) return;
  var cur = _normG(p);
  p.gender = cur === 'w' ? 'M' : 'W';
  savePlayerDB(db);
  // Перерисовать карточку
  var card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

// Выбрать всех в группе (m или w)
function iptSelectGroup(g) {
  var db = loadPlayerDB().filter(function(p) { return !p.id.startsWith('ipt_quick_'); });
  db.forEach(function(p) {
    if (_normG(p) === g) _iptSelectedIds.add(p.id);
  });
  localStorage.setItem('kotc3_ipt_sel', JSON.stringify([..._iptSelectedIds]));
  var card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

// Убрать всех из группы (m или w)
function iptDeselectGroup(g) {
  var db = loadPlayerDB().filter(function(p) { return !p.id.startsWith('ipt_quick_'); });
  db.forEach(function(p) {
    if (_normG(p) === g) _iptSelectedIds.delete(p.id);
  });
  localStorage.setItem('kotc3_ipt_sel', JSON.stringify([..._iptSelectedIds]));
  var card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

function iptClearSelection() {
  _iptSelectedIds.clear();
  localStorage.setItem('kotc3_ipt_sel', '[]');
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

function _renderFmtCard() {
  if (_rosterFmt === 'thai') return _renderThaiCard(); // A0.3
  if (_rosterFmt === 'kotc') return _renderKotcCard(); // A2.3

  if (_rosterFmt === 'ipt') {
    const needed  = _iptCourts * 8;
    // Nav preview string
    // К1..К[n] — по кол-ву кортов; финалы — по getIPTFinalsNavKeys
    const kLabels = [1, 2, 3, 4].slice(0, _iptCourts).map(n => tr('nav.courtBadge', { n })).join(' ');
    const fLbl    = { hard:'HD', advance:'AV', medium:'MD', lite:'LT' };
    const fLabels = getIPTFinalsNavKeys(_iptCourts).map(k => fLbl[k]).join(' ');

    return `<div class="settings-card" id="fmt-settings-card">
      <div class="sc-title">⚙️ ${tr('roster.format')}</div>
      <div class="fmt-mode-tabs">
        <button class="fmt-tab" onclick="switchRosterFmt('standard')">🏐 ${tr('format.standard')}</button>
        <button class="fmt-tab on" onclick="switchRosterFmt('ipt')">👑 ${tr('format.ipt')}</button>
        <button class="fmt-tab" onclick="switchRosterFmt('thai')">🌴 ${tr('format.thai')}</button>
        <button class="fmt-tab" onclick="switchRosterFmt('kotc')">👑 ${tr('format.kotc')}</button>
      </div>

      <div class="sc-row" style="margin-top:10px">
        <span class="sc-lbl">${tr('format.courtsLabel')}</span>
        <div class="seg">
          ${[1,2,3,4].map(v=>`<button class="seg-btn${_iptCourts===v?' on':''}" onclick="setIPTCourts(${v})">${v}</button>`).join('')}
        </div>
      </div>
      <div class="ipt-nav-preview">
        <span class="ipt-nav-k">${kLabels}</span>
        <span class="ipt-nav-sep">|</span>
        <span class="ipt-nav-f">${fLabels}</span>
      </div>
      <div class="sc-info" style="margin-top:0">${tr('format.groupInfo', {n: _iptCourts, total: needed})}</div>

      <div class="sc-row">
        <span class="sc-lbl">${tr('format.pointLimit')}</span>
        <div class="seg" id="seg-ipt-lim">
          ${[10,12,15,18,21].map(v=>`<button class="seg-btn${_iptLimit===v?' on':''}" onclick="setIPTQuickLimit(${v})">${v}</button>`).join('')}
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-lbl">${tr('format.finishLabel')}</span>
        <div class="seg" id="seg-ipt-finish">
          <button class="seg-btn${_iptFinish==='hard'?' on':''}" onclick="setIPTQuickFinish('hard')">${tr('format.hard')}</button>
          <button class="seg-btn${_iptFinish==='balance'?' on':''}" onclick="setIPTQuickFinish('balance')">${tr('format.balance')}</button>
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-lbl">${tr('format.rosterLabel')}</span>
        <div class="seg" id="seg-ipt-gender">
          <button class="seg-btn${_iptGender==='male'?' on':''}" data-val="male"   onclick="setIPTGender('male')">${tr('format.maleMode')}</button>
          <button class="seg-btn${_iptGender==='female'?' on':''}" data-val="female" onclick="setIPTGender('female')">${tr('format.femaleMode')}</button>
          <button class="seg-btn${_iptGender==='mixed'?' on':''}" data-val="mixed"  onclick="setIPTGender('mixed')">${tr('format.mixedMode')}</button>
        </div>
      </div>

      <div class="sc-lbl" style="margin:10px 0 4px">${tr('format.participantsLabel', {n: needed})}</div>
      ${_renderIPTPlayerList()}

      <div class="sc-btns" style="margin-top:12px">
        <button class="btn-apply ipt-launch-btn" onclick="launchQuickIPT()">🏐 ${tr('format.launchIpt')}</button>
      </div>
    </div>`;
  }

  // Standard
  return `<div class="settings-card" id="fmt-settings-card">
    <div class="sc-title">⚙️ ${tr('roster.format')}</div>
    <div class="fmt-mode-tabs">
      <button class="fmt-tab on" onclick="switchRosterFmt('standard')">🏐 ${tr('format.standard')}</button>
      <button class="fmt-tab" onclick="switchRosterFmt('ipt')">👑 ${tr('format.ipt')}</button>
      <button class="fmt-tab" onclick="switchRosterFmt('thai')">🌴 ${tr('format.thai')}</button>
      <button class="fmt-tab" onclick="switchRosterFmt('kotc')">👑 ${tr('format.kotc')}</button>
    </div>
    <div class="sc-row" style="margin-top:10px">
      <span class="sc-lbl">${tr('format.courtsLabel')}</span>
      <div class="seg" id="seg-c">
        ${[1,2,3,4].map(v=>`<button class="seg-btn${_nc===v?' on':''}" onclick="setPending(${v},_ppc)">${v}</button>`).join('')}
      </div>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">${tr('format.playersLabel')}</span>
      <div class="seg" id="seg-n">
        ${[4].map(v=>`<button class="seg-btn${_ppc===v?' on':''}" onclick="setPending(_nc,${v})">${v}</button>`).join('')}
      </div>
    </div>
    <div class="sc-info" id="sc-info">
      ${tr('roster.courtInfo', {nc: _nc, ppc: _ppc, total: _nc*_ppc})}
    </div>
    <div class="sc-row" style="margin-top:10px">
      <span class="sc-lbl">${tr('format.draftSeedLabel')}</span>
      <input class="trn-form-inp" id="thai32-draft-seed" type="number" step="1" min="0"
        style="flex:1;min-width:120px"
        value="${escAttr(localStorage.getItem('kotc3_thai32_draft_seed') || '')}"
        placeholder="${escAttr(tr('format.seedPlaceholder'))}"/>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">${tr('roster.pairs')}:</span>
      <button class="seg-btn fixed-pairs-toggle on" disabled onclick="toggleFixedPairs()">🔄 ${tr('roster.rotation')}</button>
    </div>
    <div class="sc-btns">
      <button class="btn-apply" onclick="applySettings()">✅ ${tr('roster.apply')}</button>
      <button class="btn-dist"  onclick="autoDistribute()">📋 ${tr('roster.distribute')}</button>
    </div>
    <div class="sc-warn">⚠️ ${tr('roster.settingsWarn')}</div>
  </div>`;
}

async function launchQuickIPT() {
  const needed = _iptCourts * 8;
  const selectedIds = [..._iptSelectedIds];
  if (selectedIds.length < 8) {
    showToast('❌ ' + tr('format.minPlayers', { n: selectedIds.length }), 'error');
    return;
  }
  if (selectedIds.length !== needed) {
    const ok = await showConfirm(tr('format.selectedMismatch', { sel: selectedIds.length, needed }));
    if (!ok) return;
  }

  // Use selected real players from DB
  const db = loadPlayerDB();
  const participants = selectedIds
    .map(id => db.find(p => p.id === id))
    .filter(Boolean);

  if (participants.length < 8) {
    showToast('❌ ' + tr('format.playersNotFound'), 'error');
    return;
  }

  // Create / overwrite quick tournament
  let arr = getTournaments();
  arr = arr.filter(t => t.id !== 'ipt_quick');
  const trn = {
    id:           'ipt_quick',
    name:         tr('format.iptQuickName'),
    format:       'IPT Mixed',
    status:       'open',
    level:        'medium',
    gender:       _iptGender,
    date:         new Date().toISOString().split('T')[0],
    venue:        '',
    capacity:     needed,
    participants: participants.map(p => p.id),
    ipt: {
      pointLimit:   _iptLimit,
      finishType:   _iptFinish,
      courts:       _iptCourts,
      gender:       _iptGender,
      currentGroup: 0,
      groups:       null
    }
  };
  arr.push(trn);
  saveTournaments(arr);

  showToast('👑 ' + tr('format.iptLaunchToast', { courts: _iptCourts, players: participants.length }));
  setTimeout(() => openIPT('ipt_quick'), 300);
}

// ── Thai Format Launcher helpers (A0.3) ────────────────────────────────────

function setThaiMode(mode) {
  _thaiMode = mode;
  localStorage.setItem('kotc3_thai_mode', mode);
  _thaiSelectedIds.clear();
  localStorage.setItem('kotc3_thai_sel', '[]');
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

function setThaiN(n) {
  _thaiN = n;
  localStorage.setItem('kotc3_thai_n', n);
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

function setThaiSeed(seed) {
  _thaiSeed = parseInt(seed, 10) || 1;
  localStorage.setItem('kotc3_thai_seed', _thaiSeed);
}

function setThaiLimit(lim) {
  _thaiLimit = lim;
  localStorage.setItem('kotc3_thai_lim', lim);
  document.querySelectorAll('#seg-thai-lim .seg-btn').forEach((b,i) => {
    b.classList.toggle('on', [10,12,15,18,21][i] === lim);
  });
}

function setThaiFinish(f) {
  _thaiFinish = f;
  localStorage.setItem('kotc3_thai_finish', f);
  document.querySelectorAll('#seg-thai-finish .seg-btn').forEach((b,i) => {
    b.classList.toggle('on', ['hard','balance'][i] === f);
  });
}

function thaiTogglePlayer(pid) {
  if (_thaiSelectedIds.has(pid)) {
    _thaiSelectedIds.delete(pid);
  } else {
    _thaiSelectedIds.add(pid);
  }
  localStorage.setItem('kotc3_thai_sel', JSON.stringify([..._thaiSelectedIds]));
  const needed = _thaiMode === 'MF' ? _thaiN * 2 : _thaiN;
  const cnt = document.getElementById('thai-ps-count');
  if (cnt) {
    const sel = _thaiSelectedIds.size;
    const mSel = _thaiMode === 'MF' ? [..._thaiSelectedIds].filter(id => { const p = loadPlayerDB().find(x=>x.id===id); return p && _normG(p)==='m'; }).length : sel;
    const wSel = _thaiMode === 'MF' ? sel - mSel : 0;
    cnt.textContent = _thaiMode === 'MF'
      ? tr('format.selectedCountMix', { sel, needed, m: mSel, w: wSel })
      : tr('format.selectedCount', { sel, needed });
    cnt.style.color = sel === needed ? '#6ABF69' : sel > needed ? '#e94560' : 'var(--muted)';
  }
}

function thaiPlayerSearch(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.thai-pl-item').forEach(el => {
    const name = (el.dataset.name || '').toLowerCase();
    el.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

function thaiSelectAll(gender) {
  const db = loadPlayerDB().filter(p => !p.id.startsWith('thai_quick_'));
  const list = gender ? db.filter(p => _normG(p) === gender) : db;
  list.forEach(p => _thaiSelectedIds.add(p.id));
  localStorage.setItem('kotc3_thai_sel', JSON.stringify([..._thaiSelectedIds]));
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

function thaiDeselectAll(gender) {
  if (gender) {
    const db = loadPlayerDB();
    for (const id of [..._thaiSelectedIds]) {
      const p = db.find(x => x.id === id);
      if (p && _normG(p) === gender) _thaiSelectedIds.delete(id);
    }
  } else {
    _thaiSelectedIds.clear();
  }
  localStorage.setItem('kotc3_thai_sel', JSON.stringify([..._thaiSelectedIds]));
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

function _renderThaiPlayerList() {
  const db = loadPlayerDB().filter(p => !p.id.startsWith('thai_quick_'));
  const needed = _thaiMode === 'MF' ? _thaiN * 2 : _thaiN;

  // Удаляем невалидные id
  const validIds = new Set(db.map(p => p.id));
  let changed = false;
  for (const id of [..._thaiSelectedIds]) {
    if (!validIds.has(id)) { _thaiSelectedIds.delete(id); changed = true; }
  }
  if (changed) localStorage.setItem('kotc3_thai_sel', JSON.stringify([..._thaiSelectedIds]));

  // Auto-select if empty
  if (_thaiSelectedIds.size === 0 && db.length > 0) {
    if (_thaiMode === 'MF') {
      const half = _thaiN;
      const men = db.filter(p => _normG(p)==='m').slice(0, half);
      const women = db.filter(p => _normG(p)==='w').slice(0, half);
      [...men, ...women].forEach(p => _thaiSelectedIds.add(p.id));
    } else {
      const gf = _thaiMode === 'MM' ? 'm' : 'w';
      db.filter(p => _normG(p)===gf).slice(0, _thaiN).forEach(p => _thaiSelectedIds.add(p.id));
    }
    localStorage.setItem('kotc3_thai_sel', JSON.stringify([..._thaiSelectedIds]));
  }

  const selCount = _thaiSelectedIds.size;
  const mSel = _thaiMode === 'MF' ? [..._thaiSelectedIds].filter(id => { const p = db.find(x=>x.id===id); return p && _normG(p)==='m'; }).length : selCount;
  const wSel = _thaiMode === 'MF' ? selCount - mSel : 0;

  function renderGroup(title, players, genderKey) {
    const icon = genderKey === 'm' ? '♂' : '♀';
    const gIcon = genderKey === 'm' ? '🏐' : '🏐';
    const badge = genderKey === 'm' ? tr('format.menLabel') : tr('format.womenLabel');
    const sorted = [...players].sort((a,b) => {
      const aS = _thaiSelectedIds.has(a.id) ? 0 : 1;
      const bS = _thaiSelectedIds.has(b.id) ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return (a.name||'').localeCompare(b.name||'', 'ru');
    });
    const half = _thaiMode === 'MF' ? _thaiN : (_thaiMode === 'MM' && genderKey === 'm' ? _thaiN : _thaiMode === 'WW' && genderKey === 'w' ? _thaiN : 0);
    const count = sorted.filter(p => _thaiSelectedIds.has(p.id)).length;
    let html = `<div class="ipt-ps-gender-hdr">${icon} ${title}
      <span style="cursor:pointer;font-size:11px;background:#333;padding:2px 8px;border-radius:6px;margin-left:6px" onclick="thaiSelectAll('${genderKey}')">${tr('format.selectAll')}</span>
      <span style="cursor:pointer;font-size:11px;background:#333;padding:2px 8px;border-radius:6px;margin-left:4px" onclick="thaiDeselectAll('${genderKey}')">${tr('format.deselectAll')}</span>
      <span style="margin-left:auto;font-size:12px;color:${count===half?'#6ABF69':'var(--muted)'}">${count} / ${half}</span>
    </div>`;
    sorted.forEach((p, idx) => {
      const checked = _thaiSelectedIds.has(p.id) ? 'checked' : '';
      const num = idx + 1;
      html += `<label class="ipt-pl-item thai-pl-item" data-name="${escAttr(p.name)}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer">
        <span style="color:var(--muted);font-size:11px;min-width:16px">${icon}</span>
        <span style="min-width:24px;text-align:right;color:var(--muted);font-size:12px">${num}</span>
        <input type="checkbox" ${checked} onchange="thaiTogglePlayer('${escAttr(p.id)}')" style="accent-color:#f5a623"/>
        <span style="font-size:13px">${gIcon}</span>
        <span style="flex:1;font-size:14px">${esc(p.name)}</span>
        <span style="font-size:10px;background:rgba(245,166,35,.15);color:#f5a623;padding:1px 6px;border-radius:4px">${badge}</span>
      </label>`;
    });
    return html;
  }

  let listHtml = `<div style="margin:8px 0 4px">
    <input class="trn-form-inp" type="text" placeholder="${escAttr(tr('format.searchPlayer'))}"
      oninput="thaiPlayerSearch(this.value)" style="width:100%;box-sizing:border-box"/>
  </div>
  <div style="max-height:340px;overflow-y:auto;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:4px">`;

  if (_thaiMode === 'MF') {
    const men = db.filter(p => _normG(p)==='m');
    const women = db.filter(p => _normG(p)==='w');
    listHtml += renderGroup(tr('roster.men'), men, 'm');
    listHtml += renderGroup(tr('roster.women'), women, 'w');
  } else if (_thaiMode === 'MM') {
    listHtml += renderGroup(tr('roster.men'), db.filter(p => _normG(p)==='m'), 'm');
  } else {
    listHtml += renderGroup(tr('roster.women'), db.filter(p => _normG(p)==='w'), 'w');
  }

  listHtml += `</div>
  <div id="thai-ps-count" style="text-align:center;font-size:13px;font-weight:600;margin-top:6px;color:${selCount===needed?'#6ABF69':'var(--muted)'}">
    ${_thaiMode === 'MF'
      ? tr('format.selectedCountMix', { sel: selCount, needed, m: mSel, w: wSel })
      : tr('format.selectedCount', { sel: selCount, needed })}
  </div>`;

  return listHtml;
}

function _renderThaiCard() {
  const needed = _thaiMode === 'MF' ? _thaiN * 2 : _thaiN;
  const infoLine = _thaiMode === 'MF'
    ? tr('format.kotcTotalInfo', { m: _thaiN, w: _thaiN, total: needed })
    : `${tr(_thaiMode === 'MM' ? 'format.thaiMenCount' : 'format.thaiWomenCount', { n: _thaiN })} = <strong>${tr('format.thaiPersons', { n: needed })}</strong>`;
  return `<div class="settings-card" id="fmt-settings-card">
    <div class="sc-title">⚙️ ${tr('format.thaiTitle')}</div>
    <div class="fmt-mode-tabs">
      <button class="fmt-tab" onclick="switchRosterFmt('standard')">🏐 ${tr('format.standard')}</button>
      <button class="fmt-tab" onclick="switchRosterFmt('ipt')">👑 ${tr('format.ipt')}</button>
      <button class="fmt-tab on" onclick="switchRosterFmt('thai')">🌴 ${tr('format.thaiMixed')}</button>
        <button class="fmt-tab" onclick="switchRosterFmt('kotc')">👑 ${tr('format.kotc')}</button>
    </div>

    <div class="sc-row" style="margin-top:10px">
      <span class="sc-lbl">${tr('format.playersLabel')}</span>
      <div class="seg">
        <button class="seg-btn${_thaiN===8?' on':''}" onclick="setThaiN(8)">8</button>
        <button class="seg-btn${_thaiN===10?' on':''}" onclick="setThaiN(10)">10</button>
      </div>
    </div>
    <div class="sc-info" style="margin-top:0">
      ${infoLine}
    </div>

    <div class="sc-row">
      <span class="sc-lbl">${tr('format.pointLimit')}</span>
      <div class="seg" id="seg-thai-lim">
        ${[10,12,15,18,21].map(v=>`<button class="seg-btn${_thaiLimit===v?' on':''}" onclick="setThaiLimit(${v})">${v}</button>`).join('')}
      </div>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">${tr('format.finishLabel')}</span>
      <div class="seg" id="seg-thai-finish">
        <button class="seg-btn${_thaiFinish==='hard'?' on':''}" onclick="setThaiFinish('hard')">${tr('format.hard')}</button>
        <button class="seg-btn${_thaiFinish==='balance'?' on':''}" onclick="setThaiFinish('balance')">${tr('format.balance')}</button>
      </div>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">${tr('format.rosterLabel')}</span>
      <div class="seg">
        <button class="seg-btn${_thaiMode==='MM'?' on':''}" onclick="setThaiMode('MM')">${tr('format.maleMode')}</button>
        <button class="seg-btn${_thaiMode==='WW'?' on':''}" onclick="setThaiMode('WW')">${tr('format.femaleMode')}</button>
        <button class="seg-btn${_thaiMode==='MF'?' on':''}" onclick="setThaiMode('MF')">${tr('format.mixedMode')}</button>
      </div>
    </div>

    <div class="sc-row">
      <span class="sc-lbl">${tr('format.seedLabel')}</span>
      <input class="trn-form-inp" type="number" step="1" min="1"
        style="flex:1;min-width:100px"
        value="${_thaiSeed}"
        oninput="setThaiSeed(this.value)" placeholder="1"/>
    </div>

    <div class="sc-lbl" style="margin:10px 0 4px">${tr('format.participantsLabel', { n: needed })}</div>
    ${_renderThaiPlayerList()}

    <div class="sc-btns" style="margin-top:12px">
      <button class="btn-apply ipt-launch-btn" onclick="launchThaiFormat()">🌴 ${tr('format.launchThai')}</button>
    </div>
  </div>`;
}

/** Navigate to Thai format page with current settings. A0.3 */
function launchThaiFormat() {
  const mode = (String(_thaiMode || '').toUpperCase());
  const n = Number(_thaiN);
  const seed = parseInt(String(_thaiSeed || '1'), 10);
  const needed = mode === 'MF' ? n * 2 : n;
  const selectedIds = [..._thaiSelectedIds];

  if (selectedIds.length < needed) {
    showToast('❌ ' + tr('format.thaiSelectNeeded', { n: needed, sel: selectedIds.length }), 'error');
    return;
  }

  // Save tournament to localStorage like IPT does
  const db = loadPlayerDB();
  const participants = selectedIds.map(id => db.find(p => p.id === id)).filter(Boolean);

  let arr = getTournaments();
  arr = arr.filter(t => t.id !== 'thai_quick');
  const trn = {
    id:           'thai_quick',
    name:         tr('format.thaiQuickName'),
    format:       'Thai Mixed',
    status:       'open',
    level:        'medium',
    gender:       mode === 'MF' ? 'mixed' : mode === 'MM' ? 'male' : 'female',
    date:         new Date().toISOString().split('T')[0],
    venue:        '',
    capacity:     needed,
    participants: participants.map(p => p.id),
    thaiMeta: {
      mode:       mode,
      n:          n,
      seed:       seed,
      pointLimit: _thaiLimit,
      finishType: _thaiFinish
    }
  };
  arr.push(trn);
  saveTournaments(arr);

  showToast('🌴 ' + tr('format.thaiLaunchToast', { n: participants.length }));

  const href = `formats/thai/thai.html?mode=${encodeURIComponent(mode)}&n=${encodeURIComponent(String(n))}&seed=${encodeURIComponent(String(seed))}&trnId=thai_quick`;
  setTimeout(() => {
    window.open(href, '_blank');
  }, 300);
}

// ══════════════════════════════════════════════════════════════
// A2.3: KOTC Format Launcher
// ══════════════════════════════════════════════════════════════
let _kotcNc = parseInt(localStorage.getItem('kotc3_kotc_nc') || '4', 10);

function _renderKotcCard() {
  return `<div class="settings-card" id="fmt-settings-card">
    <div class="sc-title">⚙️ ${tr('format.kotcTitle')}</div>
    <div class="fmt-mode-tabs">
      <button class="fmt-tab" onclick="switchRosterFmt('standard')">🏐 ${tr('format.standard')}</button>
      <button class="fmt-tab" onclick="switchRosterFmt('ipt')">👑 ${tr('format.ipt')}</button>
      <button class="fmt-tab" onclick="switchRosterFmt('thai')">🌴 ${tr('format.thai')}</button>
      <button class="fmt-tab on" onclick="switchRosterFmt('kotc')">👑 ${tr('format.kotc')}</button>
    </div>

    <div class="sc-row" style="margin-top:10px">
      <span class="sc-lbl">${tr('format.courtsLabel')}</span>
      <div class="seg">
        ${[1,2,3,4].map(v=>`<button class="seg-btn${_kotcNc===v?' on':''}" onclick="setKotcNc(${v})">${v}</button>`).join('')}
      </div>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">${tr('format.kotcPlayersPerCourt')}</span>
      <span style="font-weight:700">${tr('format.kotcMwLine')}</span>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">${tr('format.kotcTotalNeeded')}</span>
      <span style="font-weight:700;color:var(--gold)">${tr('format.kotcTotalInfo', { m: _kotcNc * 4, w: _kotcNc * 4, total: _kotcNc * 8 })}</span>
    </div>
    <div class="sc-btns" style="margin-top:12px">
      <button class="btn-apply ipt-launch-btn" onclick="launchKotcFormat()">👑 ${tr('format.launchKotc')}</button>
    </div>
  </div>`;
}

function setKotcNc(nc) {
  _kotcNc = nc;
  localStorage.setItem('kotc3_kotc_nc', String(nc));
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderKotcCard();
}

function launchKotcFormat() {
  const trnId = 'kotc_quick_' + Date.now();
  showToast('👑 ' + tr('format.kotcLaunchToast', { nc: _kotcNc }));
  const href = `formats/kotc/kotc.html?nc=${_kotcNc}&ppc=4&trnId=${encodeURIComponent(trnId)}`;
  setTimeout(() => {
    window.open(href, '_blank');
  }, 300);
}
