'use strict';

function _safeMode(mode) {
  const m = String(mode || '').toUpperCase();
  return (m === 'MF' || m === 'MM' || m === 'WW') ? m : 'MF';
}

function _safeN(n) {
  const v = Number(n);
  return (v === 8 || v === 10) ? v : 8;
}

function _safeSeed(seed) {
  const v = parseInt(String(seed || '1'), 10);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/**
 * Build Thai format URL with normalized params.
 * @param {{ mode?: string, n?: number|string, seed?: number|string, trnId?: string }} opts
 * @returns {string}
 */
export function buildThaiFormatUrl(opts = {}) {
  const mode = _safeMode(opts.mode);
  const n = _safeN(opts.n);
  const seed = _safeSeed(opts.seed);
  const trnId = opts.trnId != null ? String(opts.trnId) : '';

  const params = new URLSearchParams({
    mode,
    n: String(n),
    seed: String(seed),
  });
  if (trnId) params.set('trnId', trnId);

  return 'formats/thai/thai.html?' + params.toString();
}

const api = { buildThaiFormatUrl };

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedFormatLinks = api;
  }
} catch (_) {}

export default api;

