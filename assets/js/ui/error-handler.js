'use strict';

/**
 * error-handler.js — глобальный обработчик ошибок (A1.1)
 * Перехватывает window.onerror + onunhandledrejection.
 * Показывает toast вместо белого экрана.
 * Хранит лог последних 50 ошибок в localStorage (kotc3_error_log).
 */

const ERROR_LOG_KEY  = 'kotc3_error_log';
const ERROR_LOG_MAX  = 50;

function _saveError(entry) {
  try {
    let log = [];
    try { log = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]'); } catch (_) {}
    if (!Array.isArray(log)) log = [];
    log.push(entry);
    if (log.length > ERROR_LOG_MAX) log = log.slice(-ERROR_LOG_MAX);
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log));
  } catch (_) { /* QuotaExceeded — не критично */ }
}

function _showErrorToast(msg) {
  // Используем globalThis.showToast если уже доступен, иначе минимальная реализация
  if (typeof globalThis.showToast === 'function') {
    globalThis.showToast('⚠️ ' + msg, 'error', 4000);
    return;
  }
  try {
    let el = document.getElementById('err-handler-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'err-handler-toast';
      el.style.cssText = [
        'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:99999', 'background:#7c1022', 'color:#fff',
        'padding:12px 20px', 'border-radius:12px',
        'font:600 13px/1.4 Barlow,sans-serif', 'max-width:90vw',
        'box-shadow:0 8px 24px rgba(0,0,0,.4)', 'pointer-events:none',
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = '⚠️ ' + msg;
    el.style.display = 'block';
    clearTimeout(el._tid);
    el._tid = setTimeout(() => { el.style.display = 'none'; }, 4000);
  } catch (_) {}
}

function _handleError(message, source, lineno, colno) {
  const entry = {
    t: Date.now(),
    msg: String(message).slice(0, 200),
    src: source ? String(source).replace(location.origin, '') : '',
    line: lineno || 0,
    col: colno || 0,
  };
  _saveError(entry);
  // Не показываем toast на ошибки сторонних скриптов (supabase, google)
  const isSelf = !entry.src || entry.src.startsWith('/') || entry.src.startsWith('assets/') || entry.src.startsWith('shared/');
  if (isSelf) {
    _showErrorToast(entry.msg || 'Ошибка приложения');
  }
  console.error('[error-handler]', entry);
}

window.onerror = function(message, source, lineno, colno, _error) {
  _handleError(message, source, lineno, colno);
  return false; // не подавляем — пусть console тоже пишет
};

window.onunhandledrejection = function(event) {
  const reason = event?.reason;
  const msg = reason instanceof Error
    ? reason.message
    : (typeof reason === 'string' ? reason : 'Unhandled promise rejection');
  _handleError(msg, '', 0, 0);
};

// Публичный API для доступа к логу
function getErrorLog() {
  try { return JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]'); } catch (_) { return []; }
}
function clearErrorLog() {
  try { localStorage.removeItem(ERROR_LOG_KEY); } catch (_) {}
}

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.appErrorHandler = { getErrorLog, clearErrorLog };
  }
} catch (_) {}
