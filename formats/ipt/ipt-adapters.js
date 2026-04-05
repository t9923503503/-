/**
 * IPT standalone adapter globals.
 * Загружается как classic script ДО ipt-format.js.
 * Выставляет все глобальные функции, которые ipt-format.js ожидает найти в window.
 *
 * ВАЖНО: этот файл должен оставаться classic script (НЕ type="module"),
 * чтобы выполниться синхронно до ipt-format.js.
 */

window.getTournaments = function() {
  try { return JSON.parse(localStorage.getItem('kotc3_tournaments') || '[]'); } catch(e) { return []; }
};

window.saveTournaments = function(arr) {
  try { localStorage.setItem('kotc3_tournaments', JSON.stringify(arr)); } catch(e) {}
};

// Заглушки — будут перегружены ipt-boot.js после загрузки ESM-модулей
window.showToast = function(msg) { console.log('[IPT toast]', msg); };
window.showConfirm = function(msg) { return Promise.resolve(confirm(msg)); };
window.calculateRanking = function(p) { return ([0,10,7,5,3,2,1][p] !== undefined ? [0,10,7,5,3,2,1][p] : 1); };

// no-op: SPA пересчитает при открытии экрана «Игроки»
window.recalcAllPlayerStats = function() {};

window.syncDivLock = function() {};
window.playScoreSound = function() {};

// switchTab: перегружается в ipt-boot.js с полным whitelist
window.switchTab = function() {};
window.activeTabId = null;
window._iptActiveTrnId = null;

// loadPlayerDB bridge: перегружается в ipt-boot.js после загрузки sharedPlayers ESM
window.loadPlayerDB = function() { return []; };
