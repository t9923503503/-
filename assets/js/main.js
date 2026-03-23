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

// loadHistory / saveHistory defined as classic <script> in index.html
// (ES module scope is isolated; classic scripts + dynamic loads need global access).

const APP_SCRIPT_ORDER = [
  'assets/js/ui/error-handler.js',
  'assets/js/state/app-state.js',
  'assets/js/domain/players.js',
  'assets/js/domain/tournaments.js',
  'assets/js/integrations/config.js',
  'assets/js/ui/stats-recalc.js',
  'assets/js/ui/players-controls.js',
  'assets/js/ui/roster-db-ui.js',
  'assets/js/ui/results-form.js',
  'assets/js/ui/tournament-form.js',
  'assets/js/ui/participants-modal.js',
  'assets/js/ui/tournament-details.js',
  'assets/js/ui/ipt-format.js',
  'assets/js/screens/ipt.js',
  'assets/js/registration.js',
  'assets/js/screens/core-render.js',
  'assets/js/screens/core-lifecycle.js',
  'assets/js/screens/core-navigation.js',
  'assets/js/screens/roster-format-launcher.js',
  'assets/js/screens/roster-edit.js',
  'assets/js/screens/roster-list.js',
  'assets/js/screens/courts.js',
  'assets/js/screens/components.js',
  'assets/js/screens/svod.js',
  'assets/js/screens/players.js',
  'assets/js/screens/home.js',
  'assets/js/screens/stats.js',
  'assets/js/integrations.js',
  'assets/js/ui/kotc-sync.js',
  'assets/js/domain/timers.js',
  'assets/js/ui/roster-auth.js',
  'assets/js/runtime.js',
];

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

function restoreTheme() {
  const solar = localStorage.getItem('kotc3_solar') === '1';
  document.body.classList.toggle('solar', solar);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', solar ? '#000000' : '#0d0d1a');
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
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

async function bootstrapApp() {
  // Some deployments may serve an outdated/missing classic bundle.
  // Guard to avoid hard crash on boot; state will be defaulted.
  if (typeof loadState === 'function') loadState();
  loadTimerState();
  sbLoadConfig();
  gshLoadConfig();
  restoreTheme();

  if (!tournamentMeta.date) {
    tournamentMeta.date = new Date().toISOString().split('T')[0];
  }

  buildAll();
  const startTab = (activeTabId != null && activeTabId !== 'roster') ? activeTabId : 'home';
  await switchTab(startTab);

  if (sbConfig.roomCode && sbConfig.roomSecret) {
    try {
      await sbConnect();
    } catch (error) {
      console.warn('Supabase auto-connect failed:', error);
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
    await loadAppScripts();
    await registerServiceWorker();
    await bootstrapApp();
  } catch (error) {
    showBootstrapError(error);
  }
})();
