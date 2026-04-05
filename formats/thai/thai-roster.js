'use strict';

// Thai roster selection UI for `formats/thai/thai.html` (F0.3).
// This module is mounted by `thai.html` after A1.1/A1.2 template is ready.

function _esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function _sortedByPtsThenName(players) {
  return [...players].sort((a, b) => {
    const ap = a.totalPts ?? a.pts ?? 0;
    const bp = b.totalPts ?? b.pts ?? 0;
    if (bp !== ap) return bp - ap;
    return (a.name || '').localeCompare(b.name || '', 'ru');
  });
}

function _getRequired({ mode, n }) {
  if (mode === 'MF') return { needM: n, needW: n };
  if (mode === 'MN') return { needM: n, needW: n };
  if (mode === 'MM') return { needM: n, needW: 0 };
  if (mode === 'WW') return { needM: 0, needW: n };
  return { needM: n, needW: n };
}

function _renderSection({ groupKey, title, genderIcon, players, selectedIds, required, filterQuery }) {
  const show = !filterQuery
    ? players
    : players.filter(p => (p.name || '').toLowerCase().includes(filterQuery));

  const ok = selectedIds.size === required;
  const countColor = ok ? '#6ABF69' : selectedIds.size > required ? '#e94560' : 'var(--muted)';

  return `
    <div class="sc-row" style="margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
        <span style="color:var(--muted);font-size:.88em">${genderIcon} ${title}</span>
        <span style="color:${countColor};font-weight:700;font-size:.85em">Выбрано: ${selectedIds.size} / ${required}</span>
      </div>
    </div>
    <div class="thai-pl-list" style="margin-top:6px;display:flex;flex-direction:column;gap:6px;max-height:42vh;overflow:auto;padding-right:2px">
      ${show.map(p => {
        const id = p.id;
        const checked = selectedIds.has(id) ? 'checked' : '';
        const label = _esc(p.name || '—');
        return `
          <label class="thai-pl-row" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)">
            <input type="checkbox" ${checked} data-change="window._thaiRosterToggle('${_esc(groupKey)}','${_esc(id)}')">
            <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span>
            <span style="font-size:.78em;color:var(--muted)">${p.level ? _esc(p.level) : ''}</span>
          </label>`;
      }).join('')}
      ${show.length === 0 ? `<div class="sc-info" style="opacity:.7">Ничего не найдено</div>` : ''}
    </div>
  `;
}

export function initThaiRosterPanel({
  containerId = 'thai-roster-panel',
  mode = 'MF',
  n = 8,
  loadPlayerDB,
  showToast,
  schedule = null,
  initialMenIds = [],
  initialWomenIds = [],
} = {}) {
  const container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
  if (!container) return;

  const db = typeof loadPlayerDB === 'function' ? loadPlayerDB() : [];
  const { needM, needW } = _getRequired({ mode, n });
  const isDualPoolMode = mode === 'MF' || mode === 'MN';
  const overlappingPools = mode === 'MN';
  const menPool = mode === 'MM' || mode === 'MF' || mode === 'MN' ? db.filter(p => p?.gender === 'M') : [];
  const womenPool = mode === 'WW'
    ? db.filter(p => p?.gender === 'W')
    : isDualPoolMode
      ? db.filter(p => p?.gender === (mode === 'MN' ? 'M' : 'W'))
      : [];
  const menSorted = _sortedByPtsThenName(menPool);
  const womenSorted = _sortedByPtsThenName(womenPool);
  const preferredMenOrder = Array.isArray(initialMenIds) ? initialMenIds.map(id => String(id)) : [];
  const preferredWomenOrder = Array.isArray(initialWomenIds) ? initialWomenIds.map(id => String(id)) : [];

  const selectedMen = new Set();
  const selectedWomen = new Set();

  let filterQuery = '';

  function setSelectedFromAutoBalance() {
    // Keep existing selections as much as possible; fill remaining slots from best players.
    const keepM = [...selectedMen];
    const keepW = [...selectedWomen];
    selectedMen.clear();
    selectedWomen.clear();

    menSorted.forEach(p => {
      if (keepM.includes(p.id) && selectedMen.size < needM) selectedMen.add(p.id);
    });
    womenSorted.forEach(p => {
      if (keepW.includes(p.id) && selectedWomen.size < needW && (!overlappingPools || !selectedMen.has(p.id))) {
        selectedWomen.add(p.id);
      }
    });

    for (const p of menSorted) {
      if (selectedMen.size >= needM) break;
      selectedMen.add(p.id);
    }
    for (const p of womenSorted) {
      if (selectedWomen.size >= needW) break;
      if (overlappingPools && selectedMen.has(p.id)) continue;
      selectedWomen.add(p.id);
    }
  }

  function seedInitialSelection(selectedIds, preferredIds, sortedPlayers, limit, forbiddenIds = null) {
    const poolIds = new Set(sortedPlayers.map(player => player.id));
    for (const id of preferredIds) {
      if (selectedIds.size >= limit) break;
      if (!poolIds.has(id)) continue;
      if (forbiddenIds && forbiddenIds.has(id)) continue;
      selectedIds.add(id);
    }
  }

  seedInitialSelection(selectedMen, preferredMenOrder, menSorted, needM);
  seedInitialSelection(selectedWomen, preferredWomenOrder, womenSorted, needW, overlappingPools ? selectedMen : null);

  function buildOrderedSelection(selectedIds, preferredIds, sortedPlayers) {
    const ordered = [];
    const seen = new Set();
    for (const id of preferredIds) {
      if (selectedIds.has(id) && !seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
    for (const player of sortedPlayers) {
      if (selectedIds.has(player.id) && !seen.has(player.id)) {
        ordered.push(player.id);
        seen.add(player.id);
      }
    }
    return ordered;
  }

  function toggleId(groupKey, id) {
    const player = db.find(p => p?.id === id);
    if (!player) return;
    if (groupKey === 'men') {
      if (selectedMen.has(id)) selectedMen.delete(id);
      else if (player.gender === 'M' && selectedMen.size < needM) {
        if (overlappingPools) selectedWomen.delete(id);
        selectedMen.add(id);
      }
    } else if (groupKey === 'women') {
      if (selectedWomen.has(id)) selectedWomen.delete(id);
      else {
        const allowedGender = mode === 'MN' ? 'M' : 'W';
        if (player.gender === allowedGender && selectedWomen.size < needW) {
          if (overlappingPools) selectedMen.delete(id);
          selectedWomen.add(id);
        }
      }
    }
    render();
  }

  globalThis._thaiRosterToggle = toggleId;

  function getSelectedMenIdsOrdered() {
    return buildOrderedSelection(selectedMen, preferredMenOrder, menSorted);
  }
  function getSelectedWomenIdsOrdered() {
    return buildOrderedSelection(selectedWomen, preferredWomenOrder, womenSorted);
  }

  globalThis._thaiRosterGetSelection = () => ({
    // Important: schedule indices are mapped to these ordered arrays.
    // We must keep a stable order independent from checkbox toggle order.
    menIds: getSelectedMenIdsOrdered(),
    womenIds: getSelectedWomenIdsOrdered(),
  });

  globalThis._thaiRosterAutoBalance = () => {
    setSelectedFromAutoBalance();
    render();
    if (typeof showToast === 'function') showToast('📋 Автобаланс выполнен', 'success');
  };

  function render() {
    const menIdsOrdered = getSelectedMenIdsOrdered();
    const womenIdsOrdered = getSelectedWomenIdsOrdered();
    const complete = menIdsOrdered.length === needM && womenIdsOrdered.length === needW;
    const rosterTitle =
      mode === 'MN' ? '🧍 Тай М/Н — ростер' :
      mode === 'MF' ? '🧍 Тай-микст — ростер' :
      mode === 'MM' ? '🧍 Тай мужской — ростер' :
      '🧍 Тай женский — ростер';

    function _nameByIdx(list, idx) {
      if (!list || list.length <= idx) return null;
      return list[idx];
    }

    function _playerNameFromId(id) {
      // Prefer DB objects for nicer names, fallback to id.
      const p = db.find(x => x && x.id === id);
      return p?.name ?? id;
    }

    // Roster preview: show pair indices (and names when possible).
    const preview = Array.isArray(schedule) ? `
      <div class="sc-row" style="margin-top:14px">
        <span class="sc-lbl">Превью расписания:</span>
        <div class="sc-info" style="opacity:.9;font-size:.86em">Туры и пары (индексы → имена)</div>
      </div>
      <div class="thai-schedule-preview" style="margin-top:8px;max-height:30vh;overflow:auto;padding-right:2px">
        ${schedule.map((tour, ti) => {
          const pairs = Array.isArray(tour.pairs) ? tour.pairs : [];
          return `
            <div style="margin-bottom:10px;padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.03)">
              <div style="font-weight:800;color:var(--muted);font-size:.9em;margin-bottom:6px">Тур ${ti + 1}</div>
              ${pairs.length ? `
                <div style="display:grid;grid-template-columns:1fr;gap:6px">
                  ${pairs.map((pair) => {
                    const a = pair?.[0];
                    const b = pair?.[1];
                    let left = null;
                    let right = null;
                    if (mode === 'MF' || mode === 'MN') {
                      left = _nameByIdx(menIdsOrdered, a);
                      right = _nameByIdx(womenIdsOrdered, b);
                    } else if (mode === 'MM') {
                      left = _nameByIdx(menIdsOrdered, a);
                      right = _nameByIdx(menIdsOrdered, b);
                    } else if (mode === 'WW') {
                      left = _nameByIdx(womenIdsOrdered, a);
                      right = _nameByIdx(womenIdsOrdered, b);
                    }
                    const leftName = left ? _playerNameFromId(left) : `#${a}`;
                    const rightName = right ? _playerNameFromId(right) : `#${b}`;
                    return `
                      <div style="display:flex;justify-content:space-between;gap:10px">
                        <span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${leftName}</span>
                        <span style="color:var(--muted)">${rightName}</span>
                      </div>`;
                  }).join('')}
                </div>
              ` : `<div style="opacity:.7">Пары не найдены</div>`}
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    const header = `
      <div class="session-info-bar" style="margin-top:0">
        <span class="session-info-badge ${mode}">${mode}</span>
        <span>${mode === 'MN' ? `Требуется: ${needM} мужчин / ${needW} новичков` : `Требуется: ${needM}♂ / ${needW}♀`}</span>
      </div>`;

    const search = `
      <div class="sc-row" style="margin-top:10px">
        <span class="sc-lbl">Поиск:</span>
        <input
          class="trn-form-inp"
          type="text"
          placeholder="Фамилия…"
          style="flex:1;min-width:120px"
          data-input="window._thaiRosterSetFilter(this.value)"
        />
      </div>
    `;

    const menSel = selectedMen;
    const womenSel = selectedWomen;

    const menBlock = (mode === 'MF' || mode === 'MN' || mode === 'MM')
      ? _renderSection({
          groupKey: 'men',
          title: 'Мужчины',
          genderIcon: '🏋️',
          players: menSorted,
          selectedIds: menSel,
          required: needM,
          filterQuery,
        })
      : '';

    const womenBlock = (mode === 'MF' || mode === 'MN' || mode === 'WW')
      ? _renderSection({
          groupKey: 'women',
          title: mode === 'MN' ? 'Новички' : 'Женщины',
          genderIcon: mode === 'MN' ? '🆕' : '👩',
          players: womenSorted,
          selectedIds: womenSel,
          required: needW,
          filterQuery,
        })
      : '';

    const actions = `
      <div class="sc-btns" style="margin-top:12px">
        <button class="btn-dist" data-click="window._thaiRosterAutoBalance()">📋 Автобаланс</button>
        <button class="btn-apply ipt-launch-btn" ${complete ? '' : 'disabled'} data-click="thaiStartSession()">✅ Запустить сессию</button>
      </div>
      <div class="sc-warn">Счёт/таблицы появятся после старта.</div>
    `;

    container.innerHTML = `
      <div class="settings-card" style="margin:0">
        <div class="sc-title">${rosterTitle}</div>
        ${header}
        ${search}
        ${menBlock}
        ${womenBlock}
        ${preview}
        ${actions}
      </div>
    `;
  }

  globalThis._thaiRosterSetFilter = (q) => {
    filterQuery = String(q || '').toLowerCase().trim();
    render();
  };

  render();
}

// Legacy exports kept minimal; main usage is `initThaiRosterPanel` from thai.html.
export default { initThaiRosterPanel };
