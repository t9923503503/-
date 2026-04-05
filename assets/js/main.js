'use strict';

// Core HTML-escaping helpers must exist before any legacy scripts run.
// In some environments (e.g. CI + dynamic script loading), relying on runtime.js
// to define these first can be brittle.
if (typeof globalThis.esc !== 'function') {
  globalThis.esc = function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[m]);
  };
}
if (typeof globalThis.escAttr !== 'function') {
  globalThis.escAttr = function escAttr(s) {
    return globalThis.esc(String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  };
}

if (typeof globalThis.switchTab !== 'function') {
  globalThis.switchTab = function queueBootstrapTab(id) {
    globalThis.__pendingBootstrapTab = id;
    return Promise.resolve(id);
  };
}

// loadHistory / saveHistory defined as classic <script> in index.html
// (ES module scope is isolated; classic scripts + dynamic loads need global access).

const APP_SCRIPT_ORDER = [
  'assets/js/ui/error-handler.js',
  'assets/js/state/app-state.js',
  'assets/js/domain/players.js',
  'assets/js/domain/tournaments.js',
  'assets/js/integrations/config.js',
  'assets/js/ui/stats-recalc.js',
  'assets/js/ui/ipt-format.js',
  'assets/js/screens/ipt.js',
  'assets/js/screens/core-render.js',
  'assets/js/screens/core-lifecycle.js',
  'assets/js/screens/core-navigation.js',
  'assets/js/screens/courts.js',
  'assets/js/domain/timers.js',
  'assets/js/runtime.js',
];
const DEFERRED_APP_SCRIPT_ORDER = [
  'assets/js/ui/players-controls.js',
  'assets/js/ui/roster-db-ui.js',
  'assets/js/ui/results-form.js',
  'assets/js/ui/tournament-form.js',
  'assets/js/ui/participants-modal.js',
  'assets/js/ui/tournament-details.js',
  'assets/js/registration.js',
  'assets/js/screens/roster-format-launcher.js',
  'assets/js/screens/roster-edit.js',
  'assets/js/screens/roster-list.js',
  'assets/js/ui/kotc-sync.js',
  'assets/js/ui/roster-auth.js',
  'assets/js/screens/components.js',
  'assets/js/screens/svod.js',
  'assets/js/screens/players.js',
  'assets/js/screens/home.js',
  'assets/js/screens/stats.js',
  'assets/js/integrations.js',
];

const INLINE_EVENT_BRIDGE = {
  onclick: 'click',
  oninput: 'input',
  onchange: 'change',
  onblur: 'focusout',
  ondblclick: 'dblclick',
  onkeydown: 'keydown',
  onmousedown: 'mousedown',
};
const INLINE_HANDLER_ATTRS = Object.keys(INLINE_EVENT_BRIDGE);
const INLINE_HANDLER_SELECTOR = INLINE_HANDLER_ATTRS.map(attr => `[${attr}]`).join(',');

function getInlineBridgeAttr(attr) {
  return `data-inline-${attr}`;
}

function sanitizeInlineHandlers(root) {
  if (!root || typeof root !== 'object') return;
  const elements = [];

  if (root instanceof Element && root.matches(INLINE_HANDLER_SELECTOR)) {
    elements.push(root);
  }

  if (typeof root.querySelectorAll === 'function') {
    elements.push(...root.querySelectorAll(INLINE_HANDLER_SELECTOR));
  }

  for (const element of elements) {
    for (const attr of INLINE_HANDLER_ATTRS) {
      const value = element.getAttribute(attr);
      if (value == null) continue;
      element.setAttribute(getInlineBridgeAttr(attr), value);
      element.removeAttribute(attr);
    }
  }
}

function runInlineHandler(source, element, event) {
  if (!source) return false;
  try {
    const fn = new Function('event', source);
    fn.call(element, event);
    return true;
  } catch (error) {
    console.warn('[inline-bridge] Handler failed:', error);
    return false;
  }
}

function installInlineEventBridge() {
  sanitizeInlineHandlers(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        sanitizeInlineHandlers(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          sanitizeInlineHandlers(node);
        }
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: INLINE_HANDLER_ATTRS,
  });

  Object.entries(INLINE_EVENT_BRIDGE).forEach(([attr, eventType]) => {
    document.addEventListener(eventType, (event) => {
      const selector = `[${getInlineBridgeAttr(attr)}]`;
      const element = event.target instanceof Element ? event.target.closest(selector) : null;
      if (!element) return;
      const handled = runInlineHandler(element.getAttribute(getInlineBridgeAttr(attr)), element, event);
      if (handled && attr === 'onclick') {
        event.preventDefault();
      }
    });
  });
}

function waitForDomReady() {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise(resolve => {
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  });
}

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const selector = `script[data-volley-script="${src}"]`;
    const existing = document.querySelector(selector);
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.volleyScript = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = '1';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.body.appendChild(script);
  });
}

async function loadAppScripts() {
  // A0.2 — Pre-load shared/ ES modules so their globalThis bridges are available
  // to all subsequently loaded classic scripts (ipt-format.js, roster.js, etc.).
  try {
    await Promise.all([
      import('/shared/utils.js'),
      import('/shared/players.js'),
      import('/shared/timer.js'),
      import('/shared/table.js'),
      import('/shared/ui-kit.js'),
      import('/shared/format-links.js'),
      import('/shared/api.js'),
      import('/shared/auth.js'),
      import('/shared/i18n.js'),
    ]);
    // Initialize i18n (loads locale JSON)
    if (globalThis.i18n?.initI18n) await globalThis.i18n.initI18n();
  } catch (e) {
    console.warn('[shared] Module preload failed (non-fatal):', e.message);
  }

  for (const src of APP_SCRIPT_ORDER) {
    await loadClassicScript(src);
  }
}

async function loadDeferredAppScripts() {
  for (const src of DEFERRED_APP_SCRIPT_ORDER) {
    try {
      await loadClassicScript(src);
    } catch (error) {
      console.warn('[legacy-deferred] Failed to load deferred script:', src, error?.message || error);
    }
  }
}

function restoreTheme() {
  const solar = localStorage.getItem('kotc3_solar') === '1';
  document.body.classList.toggle('solar', solar);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', solar ? '#000000' : '#0d0d1a');
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  } catch (error) {
    console.warn('Service worker registration failed:', error);
  }
}

// ── S7.4: Judge mode from URL parameters ─────────────────────
// URL: index.html?trnId=X&court=0&token=AAA
(function initJudgeMode() {
  const p = new URLSearchParams(location.search);
  const court = p.get('court');
  globalThis.judgeMode = Object.freeze({
    active:    !!(p.get('trnId') && court !== null),
    trnId:     p.get('trnId') || '',
    court:     court !== null ? parseInt(court, 10) : -1,
    token:     p.get('token') || '',
    judgeName: p.get('judge') || '',
  });
})();

function getRequestedLegacyLaunch() {
  try {
    const params = new URLSearchParams(window.location.search);
    const tournamentId = String(params.get('tournamentId') || params.get('legacyTournamentId') || '').trim();
    const format = String(params.get('format') || params.get('legacyFormat') || '').trim().toLowerCase();
    return {
      tournamentId,
      format,
    };
  } catch (_) {
    return { tournamentId: '', format: '' };
  }
}

function buildCanonicalSudyamHref(requested) {
  const tournamentId = String(requested?.tournamentId || '').trim();
  const format = String(requested?.format || '').trim().toLowerCase();
  if (!tournamentId || !format) return '';

  const base = (typeof SITE_URL !== 'undefined' && SITE_URL) ? SITE_URL.replace(/\/$/, '') : '';
  const params = new URLSearchParams();
  params.set('tournamentId', tournamentId);
  params.set('format', format);
  return base + '/sudyam?' + params.toString();
}

function setLegacyBootstrapVisibility(visible) {
  const nav = document.getElementById('nav');
  const screens = document.getElementById('screens');
  [nav, screens].forEach((node) => {
    if (!node) return;
    node.style.visibility = visible ? '' : 'hidden';
  });
}

function getLegacyApiBase() {
  try {
    const cfg = window.APP_CONFIG || {};
    let base = String(cfg.supabaseUrl || '').trim();
    if (!base) return '';
    base = base.replace(/\/$/, '');
    return base.endsWith('/rest/v1') ? base : (base + '/rest/v1');
  } catch (_) {
    return '';
  }
}

function getRequestedLegacyParticipantIds(tournament) {
  if (!Array.isArray(tournament?.participants)) return [];
  return [...new Set(
    tournament.participants
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return entry.playerId || entry.player_id || entry.id || '';
        }
        return entry;
      })
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];
}

function mergeRequestedLegacyTournament(tournament) {
  if (!tournament?.id || typeof getTournaments !== 'function' || typeof saveTournaments !== 'function') {
    return false;
  }

  const tournaments = Array.isArray(getTournaments()) ? getTournaments().slice() : [];
  const index = tournaments.findIndex((entry) => String(entry?.id || '') === String(tournament.id));
  if (index >= 0) {
    tournaments[index] = tournament;
  } else {
    tournaments.push(tournament);
  }
  saveTournaments(tournaments);
  return true;
}

function mergeRequestedLegacyPlayers(players) {
  if (!Array.isArray(players) || !players.length) return false;
  if (typeof loadPlayerDB !== 'function' || typeof savePlayerDB !== 'function') return false;

  const local = Array.isArray(loadPlayerDB()) ? loadPlayerDB().slice() : [];
  const localMap = new Map(local.map((player, index) => [String(player?.id || ''), index]));
  let changed = false;

  players.forEach((raw) => {
    const normalized = typeof fromLocalPlayer === 'function' ? fromLocalPlayer(raw) : raw;
    if (!normalized?.id || !normalized?.name) return;
    const key = String(normalized.id);
    if (localMap.has(key)) {
      local[localMap.get(key)] = normalized;
    } else {
      localMap.set(key, local.length);
      local.push(normalized);
    }
    changed = true;
  });

  if (changed) {
    savePlayerDB(local);
  }
  return changed;
}

async function hydrateRequestedLegacyTournamentFromServer() {
  const requested = getRequestedLegacyLaunch();
  if (!requested.tournamentId) return false;

  if (typeof getTournaments === 'function') {
    const existing = getTournaments();
    if (Array.isArray(existing) && existing.some((entry) => String(entry?.id || '') === requested.tournamentId)) {
      return true;
    }
  }

  const apiBase = getLegacyApiBase();
  if (!apiBase) return false;

  try {
    const tournamentResp = await fetch(
      `${apiBase}/tournaments?select=external_id,game_state&external_id=eq.${encodeURIComponent(requested.tournamentId)}&limit=1`
    );
    if (!tournamentResp.ok) {
      console.warn('[legacy-launch] Tournament fetch failed:', tournamentResp.status);
      return false;
    }

    const tournamentRows = await tournamentResp.json();
    const tournament = tournamentRows?.[0]?.game_state;
    if (!tournament?.id) return false;

    mergeRequestedLegacyTournament(tournament);

    const participantIds = getRequestedLegacyParticipantIds(tournament);
    if (participantIds.length) {
      const playersResp = await fetch(
        `${apiBase}/players?select=id,name,gender&id=in.(${participantIds.map(encodeURIComponent).join(',')})`
      );
      if (playersResp.ok) {
        const players = await playersResp.json();
        mergeRequestedLegacyPlayers(players);
      }
    }

    if (typeof buildAll === 'function') {
      try { buildAll(); } catch (_) {}
    }
    return true;
  } catch (error) {
    console.warn('[legacy-launch] Failed to hydrate requested tournament:', error);
    return false;
  }
}

async function tryAutoLaunchLegacyTournament() {
  const requested = getRequestedLegacyLaunch();
  if (!requested.tournamentId) return false;
  if (globalThis.__legacyTournamentAutoLaunchDone === requested.tournamentId) return true;
  if (typeof getTournaments !== 'function') return false;

  const tournaments = getTournaments();
  const target = Array.isArray(tournaments)
    ? tournaments.find(t => String(t?.id || '') === requested.tournamentId)
    : null;

  if (!target) return false;

  try {
    if (requested.format === 'ipt' && typeof openIPT === 'function') {
      globalThis.__legacyTournamentAutoLaunchDone = requested.tournamentId;
      await Promise.resolve(openIPT(requested.tournamentId));
      return true;
    }

    // RR / Thai should bounce back into the canonical Sudyam router
    if (requested.format === 'kotc') {
      globalThis.__legacyTournamentAutoLaunchDone = requested.tournamentId;
      const base = (typeof SITE_URL !== 'undefined' && SITE_URL) ? SITE_URL.replace(/\/$/, '') : '';
      const href = base + '/formats/kotc/kotc.html?trnId=' + encodeURIComponent(requested.tournamentId);
      try { if (window.top !== window.self) { window.top.location.href = href; return true; } } catch (_) {}
      window.location.href = href;
      return true;
    }

    if (requested.format === 'rr' || requested.format === 'thai') {
      globalThis.__legacyTournamentAutoLaunchDone = requested.tournamentId;
      const href = buildCanonicalSudyamHref(requested);
      if (!href) return false;
      try { if (window.top !== window.self) { window.top.location.href = href; return true; } } catch (_) {}
      window.location.href = href;
      return true;
    }
  } catch (error) {
    console.warn('[legacy-launch] Failed to auto-open tournament:', error);
  }

  return false;
}

globalThis.tryAutoLaunchLegacyTournament = tryAutoLaunchLegacyTournament;

async function bootstrapApp() {
  const requestedLegacy = getRequestedLegacyLaunch();
  const hasRequestedLegacy = !!requestedLegacy.tournamentId;
  if (hasRequestedLegacy) setLegacyBootstrapVisibility(false);

  // Some deployments may serve an outdated/missing classic bundle.
  // Guard to avoid hard crash on boot; state will be defaulted.
  if (typeof loadState === 'function') loadState();
  loadTimerState();
  if (typeof sbLoadConfig === 'function') sbLoadConfig();
  if (typeof gshLoadConfig === 'function') gshLoadConfig();
  restoreTheme();

  if (!tournamentMeta.date) {
    tournamentMeta.date = new Date().toISOString().split('T')[0];
  }

  if (hasRequestedLegacy) {
    await hydrateRequestedLegacyTournamentFromServer();
  }

  buildAll();

  let autoLaunched = false;
  if (hasRequestedLegacy) {
    autoLaunched = await tryAutoLaunchLegacyTournament();
    if (!autoLaunched) {
      await new Promise(resolve => setTimeout(resolve, 250));
      await hydrateRequestedLegacyTournamentFromServer();
      autoLaunched = await tryAutoLaunchLegacyTournament();
    }
  }

  if (!autoLaunched) {
    // Preserve an early tab switch issued during bootstrap (e.g. tests/users opening roster
    // immediately after DOMContentLoaded) instead of forcing the app back to home.
    const pendingBootstrapTab = globalThis.__pendingBootstrapTab;
    const startTab = pendingBootstrapTab != null
      ? pendingBootstrapTab
      : (activeTabId != null ? activeTabId : 'home');
    globalThis.__pendingBootstrapTab = null;
    await switchTab(startTab);

    if (!hasRequestedLegacy) {
      await hydrateRequestedLegacyTournamentFromServer();
      await tryAutoLaunchLegacyTournament();
    }
  } else {
    globalThis.__pendingBootstrapTab = null;
  }

  if (hasRequestedLegacy) {
    setLegacyBootstrapVisibility(true);
  }

  const roomCode = String(globalThis.sbConfig?.roomCode || '').trim();
  const roomSecret = String(globalThis.sbConfig?.roomSecret || '').trim();
  if (roomCode && roomSecret && typeof globalThis.sbConnect === 'function') {
    try {
      await globalThis.sbConnect();
    } catch (error) {
      console.warn('Cloud auto-connect failed:', error);
    }
  }

  timerTick();
}

function showBootstrapError(error) {
  console.error('Volley bootstrap failed:', error);
  const message = error?.message || 'Unknown bootstrap error';
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:16px 16px auto;z-index:9999;background:#301226;color:#fff;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.16);font:600 14px/1.4 Barlow,sans-serif;box-shadow:0 16px 48px rgba(0,0,0,.35)';
  div.textContent = 'Ошибка запуска приложения: ' + message;
  document.body.appendChild(div);
}

(async function startApp() {
  try {
    await waitForDomReady();
    installInlineEventBridge();
    await loadAppScripts();
    // `bootstrapApp()` immediately renders the requested start tab, so
    // screen renderers from deferred classic scripts must exist first.
    await loadDeferredAppScripts();
    await registerServiceWorker();
    await bootstrapApp();
  } catch (error) {
    showBootstrapError(error);
  }
})();
