'use strict';

/**
 * shared/ui-kit.js — Reusable UI components for format pages.
 *
 * Contract (PLATFORM_ROADMAP.md):
 *   ScoreCard.render({ team1, team2, score1, score2, onScore }) → HTML string
 *   CourtCard.render({ courtName, color, matches, onScore })    → HTML string
 *   DoubleClickInput.attach(element, { onConfirm, min, max })
 *   HoldBtn.render({ label, action, holdMs })                   → HTML string
 *
 * ARCH A0.1
 */

function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);
}

// ── ScoreCard ──────────────────────────────────────────────────

/**
 * Render a minimal score card for a single match between two players/teams.
 *
 * @param {object} opts
 * @param {string|string[]} opts.team1   — player name or [name, name]
 * @param {string|string[]} opts.team2
 * @param {number}          opts.score1
 * @param {number}          opts.score2
 * @param {string}          [opts.onScore]  — JS expression called with (team 1|2, delta +1|-1)
 *                                            e.g. "applyScore('c0', 1, %t, %d)"
 *                                            %t → team (1|2), %d → delta (+1|-1)
 * @param {string}          [opts.id]       — optional card element id
 * @param {boolean}         [opts.finished] — if true, mute +/- buttons
 * @returns {string} HTML
 */
function scoreCardRender({
  team1, team2, score1 = 0, score2 = 0,
  onScore = '', id = '', finished = false,
} = {}) {
  const idAttr = id ? ` id="${_esc(id)}"` : '';
  const t1 = Array.isArray(team1) ? team1.join(' / ') : String(team1 != null ? team1 : '');
  const t2 = Array.isArray(team2) ? team2.join(' / ') : String(team2 != null ? team2 : '');
  const btnCls = finished ? 'sc-score-btn disabled' : 'sc-score-btn';

  const mkBtn = (team, delta, label) => {
    if (!onScore) return '';
    const cb = onScore.replace(/%t/g, team).replace(/%d/g, delta);
    const teamName = team === 1 ? t1 : t2;
    const actionLabel = `${delta > 0 ? 'Увеличить' : 'Уменьшить'} счет команды ${teamName || `#${team}`}`;
    return `<button type="button" class="${btnCls}" onclick="${cb}" aria-label="${_esc(actionLabel)}" title="${_esc(actionLabel)}" ${finished ? 'disabled' : ''}>${label}</button>`;
  };

  return `<div class="sc-card${finished ? ' sc-finished' : ''}"${idAttr}>
  <div class="sc-team sc-team1">${_esc(t1)}</div>
  <div class="sc-score-wrap">
    ${mkBtn(1, -1, '−')}
    <span class="sc-score sc-s1">${score1}</span>
    <span class="sc-score-sep">:</span>
    <span class="sc-score sc-s2">${score2}</span>
    ${mkBtn(2, 1, '+')}
  </div>
  <div class="sc-score-wrap sc-score-wrap-r">
    ${mkBtn(1, 1, '+')}
    <span class="sc-score sc-s2r">${score2}</span>
    <span class="sc-score-sep">:</span>
    <span class="sc-score sc-s1r">${score1}</span>
    ${mkBtn(2, -1, '−')}
  </div>
  <div class="sc-team sc-team2">${_esc(t2)}</div>
</div>`;
}

export const ScoreCard = { render: scoreCardRender };

// ── CourtCard ──────────────────────────────────────────────────

/**
 * Render a court card containing multiple matches.
 *
 * @param {object} opts
 * @param {string}  opts.courtName
 * @param {string}  [opts.color]    — CSS color for the court header accent
 * @param {Array}   opts.matches    — array of objects passed to ScoreCard.render()
 * @param {string}  [opts.onScore]  — forwarded to each ScoreCard
 * @param {string}  [opts.headerExtra] — extra HTML after court name (e.g., timer block)
 * @returns {string} HTML
 */
function courtCardRender({ courtName = '', color = '#FFD700', matches = [], onScore = '', headerExtra = '' } = {}) {
  const accentStyle = `border-top:3px solid ${_esc(color)}`;
  const matchesHtml = matches.map((m, i) =>
    ScoreCard.render({ ...m, onScore, id: m.id || '' })
  ).join('');

  return `<div class="court-card" style="${accentStyle}">
  <div class="court-card-hdr">
    <span class="court-card-name">${_esc(courtName)}</span>
    ${headerExtra}
  </div>
  <div class="court-card-matches">${matchesHtml || '<div class="court-empty">Нет матчей</div>'}</div>
</div>`;
}

export const CourtCard = { render: courtCardRender };

// ── DoubleClickInput ───────────────────────────────────────────

/**
 * Attach a double-tap/click inline number editor to an element.
 * First click shows an input; confirmation calls onConfirm(value).
 *
 * @param {HTMLElement} element
 * @param {{ onConfirm: (v:number)=>void, min?: number, max?: number, current?: number }} opts
 */
function doubleClickInputAttach(element, { onConfirm, min = 0, max = 99, current } = {}) {
  if (!element) return;
  element.addEventListener('dblclick', function handler(e) {
    e.stopPropagation();
    if (element.querySelector('input')) return;
    const cur = current != null ? current : (parseInt(element.textContent, 10) || 0);
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.inputMode = 'numeric';
    inp.min = String(min);
    inp.max = String(max);
    inp.value = String(cur);
    inp.className = 'sc-inline-input';
    inp.style.cssText = 'width:60px;font-size:inherit;font-weight:inherit;text-align:center;padding:2px 4px;border-radius:6px;border:1px solid var(--gold,#FFD700);background:var(--dark2,#13131f);color:var(--text,#e8e8f0)';

    const confirm = () => {
      const v = Math.max(min, Math.min(max, parseInt(inp.value, 10) || 0));
      element.removeChild(inp);
      onConfirm && onConfirm(v);
    };
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') confirm();
      if (ev.key === 'Escape') element.removeChild(inp);
    });
    inp.addEventListener('blur', confirm);

    element.appendChild(inp);
    inp.select();
    inp.focus();
  });
}

export const DoubleClickInput = { attach: doubleClickInputAttach };

// ── HoldBtn ────────────────────────────────────────────────────

/**
 * Render an HTML hold-button (requires HoldBtn.initAll() call after injection).
 *
 * @param {{ label: string, action: string, holdMs?: number, cls?: string }} opts
 * @returns {string} HTML
 */
function holdBtnRender({ label = '', action = '', holdMs = 600, cls = '' } = {}) {
  return `<button class="hold-btn${cls ? ' ' + _esc(cls) : ''}"
  data-action="${_esc(action)}"
  data-hold-ms="${holdMs}"
  ontouchstart="HoldBtn._start(this,event)"
  ontouchend="HoldBtn._end(this,event)"
  ontouchcancel="HoldBtn._end(this,event)"
  onmousedown="HoldBtn._start(this,event)"
  onmouseup="HoldBtn._end(this,event)"
  onmouseleave="HoldBtn._end(this,event)"
  >${_esc(label)}</button>`;
}

/**
 * Initialise hold-button behaviour for all .hold-btn elements in a container.
 * @param {HTMLElement} [container]
 */
function holdBtnInitAll(container = document) {
  // No-op: event handlers are inlined in the HTML above.
  // This function exists for API completeness / future batch init.
}

let _holdTimer = null;
function _holdStart(el, e) {
  e.preventDefault();
  const ms = parseInt(el.dataset.holdMs || '600', 10);
  el.classList.add('hold-btn-active');
  _holdTimer = setTimeout(() => {
    el.classList.remove('hold-btn-active');
    const cb = el.dataset.action;
    try { if (cb) (new Function(cb))(); } catch(ex) { console.warn('[HoldBtn]', ex); }
  }, ms);
}
function _holdEnd(el, e) {
  el.classList.remove('hold-btn-active');
  clearTimeout(_holdTimer);
  _holdTimer = null;
}

export const HoldBtn = { render: holdBtnRender, initAll: holdBtnInitAll, _start: _holdStart, _end: _holdEnd };

// ── CSS injection ──────────────────────────────────────────────

let _cssInjected = false;
export function injectUiKitCSS() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
/* ScoreCard */
.sc-card{background:var(--card,#1e1e32);border-radius:12px;padding:12px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.sc-card.sc-finished{opacity:.75}
.sc-team{font-size:.85em;font-weight:600;color:var(--text,#e8e8f0);text-align:center;word-break:break-word}
.sc-score-wrap{display:flex;align-items:center;gap:6px;justify-content:center}
.sc-score-wrap-r{display:none}
.sc-score{font-size:1.5em;font-weight:700;min-width:28px;text-align:center;cursor:pointer}
.sc-score-sep{color:var(--muted,#6b6b8a);font-weight:300}
.sc-score-btn{background:rgba(255,255,255,.07);border:none;border-radius:8px;padding:6px 10px;font-size:1.1em;font-weight:700;cursor:pointer;color:var(--text,#e8e8f0);line-height:1;touch-action:manipulation}
.sc-score-btn:active{background:rgba(255,255,255,.15)}
.sc-score-btn:focus-visible{outline:2px solid var(--gold,#FFD700);outline-offset:2px}
.sc-score-btn.disabled{opacity:.35;cursor:default}
.sc-inline-input::-webkit-inner-spin-button,.sc-inline-input::-webkit-outer-spin-button{-webkit-appearance:none}
/* CourtCard */
.court-card{background:var(--card,#1e1e32);border-radius:14px;overflow:hidden;margin-bottom:12px}
.court-card-hdr{padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(0,0,0,.15)}
.court-card-name{font-weight:700;font-size:.9em;letter-spacing:.02em;color:var(--text,#e8e8f0)}
.court-card-matches{padding:10px 12px 12px}
.court-empty{color:var(--muted,#6b6b8a);font-size:.85em;padding:8px 0;text-align:center}
/* HoldBtn */
.hold-btn{touch-action:manipulation;user-select:none;-webkit-user-select:none;transition:transform .1s,opacity .1s}
.hold-btn.hold-btn-active{transform:scale(.94);opacity:.75}
`;
  document.head.appendChild(style);
}

// ── FocusTrap (F4.1 a11y) ─────────────────────────────────────

/**
 * Trap Tab focus within a container (modal, dialog).
 * Returns a cleanup function to remove the trap.
 *
 * @param {HTMLElement} container
 * @returns {() => void} cleanup
 */
function focusTrap(container) {
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function getFocusable() {
    return [...container.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  }

  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  container.addEventListener('keydown', onKeyDown);

  // Auto-focus first focusable element
  requestAnimationFrame(() => {
    const focusable = getFocusable();
    if (focusable.length) focusable[0].focus();
  });

  return function cleanup() {
    container.removeEventListener('keydown', onKeyDown);
  };
}

/**
 * Initialize ARIA tablist keyboard navigation on a container.
 * Adds role="tablist" to container, role="tab" to buttons,
 * and Arrow Left/Right + Home/End keyboard navigation.
 *
 * @param {HTMLElement} container - element containing tab buttons
 * @param {object} [opts]
 * @param {string} [opts.selector='button'] - selector for tab buttons
 * @param {function} [opts.onActivate] - called with (button, index) when tab activates
 * @returns {() => void} cleanup
 */
function ariaTabList(container, opts = {}) {
  const selector = opts.selector || 'button';
  container.setAttribute('role', 'tablist');

  function getTabs() { return [...container.querySelectorAll(selector)]; }

  const tabs = getTabs();
  tabs.forEach((tab, i) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
    tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
  });

  function activateTab(tab, index) {
    const allTabs = getTabs();
    allTabs.forEach(t => {
      t.setAttribute('tabindex', '-1');
      t.setAttribute('aria-selected', 'false');
    });
    tab.setAttribute('tabindex', '0');
    tab.setAttribute('aria-selected', 'true');
    tab.focus();
    if (opts.onActivate) opts.onActivate(tab, index);
  }

  function onKeyDown(e) {
    const allTabs = getTabs();
    const idx = allTabs.indexOf(document.activeElement);
    if (idx === -1) return;

    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % allTabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + allTabs.length) % allTabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = allTabs.length - 1;
    else return;

    e.preventDefault();
    activateTab(allTabs[next], next);
  }

  container.addEventListener('keydown', onKeyDown);

  return function cleanup() {
    container.removeEventListener('keydown', onKeyDown);
  };
}

export const FocusTrap = { attach: focusTrap };
export const AriaTabList = { attach: ariaTabList };

const _api = { ScoreCard, CourtCard, DoubleClickInput, HoldBtn, FocusTrap, AriaTabList, injectUiKitCSS };

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedUiKit = _api;
    globalThis.ScoreCard = ScoreCard;
    globalThis.CourtCard = CourtCard;
    globalThis.DoubleClickInput = DoubleClickInput;
    globalThis.HoldBtn = HoldBtn;
    globalThis.FocusTrap = FocusTrap;
    globalThis.AriaTabList = AriaTabList;
  }
} catch (_) {}

export default _api;
