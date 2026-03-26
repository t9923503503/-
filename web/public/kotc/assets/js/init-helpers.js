'use strict';

// init-helpers.js — глобальные хелперы, необходимые до загрузки основных скриптов.
// Вынесено из inline <script> в index.html для соответствия CSP без unsafe-inline (A1.3).

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('kotc3_history') || '[]'); } catch (e) { return []; }
}
function saveHistory(arr) {
  try {
    localStorage.setItem('kotc3_history', JSON.stringify(arr));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      console.warn('[init-helpers] localStorage quota exceeded saving history');
    }
  }
}
