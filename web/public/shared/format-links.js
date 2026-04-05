'use strict';

function _safeMode(mode) {
  const m = String(mode || '').toUpperCase();
  return (m === 'MF' || m === 'MN' || m === 'MM' || m === 'WW') ? m : 'MF';
}

function _safeN(n) {
  const v = Number(n);
  return (Number.isInteger(v) && v >= 4 && v % 2 === 0) ? v : 8;
}

function _safeCourts(courts) {
  const v = Number(courts);
  return (Number.isInteger(v) && v >= 1) ? v : null;
}

function _safeTours(tours) {
  const v = Number(tours);
  return (Number.isInteger(v) && v >= 1) ? v : null;
}

function _safeSeed(seed) {
  const v = parseInt(String(seed || '1'), 10);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/**
 * Build Thai format URL with normalized params.
 * @param {{ mode?: string, n?: number|string, seed?: number|string, courts?: number|string, tours?: number|string, trnId?: string }} opts
 * @returns {string}
 */
export function buildThaiFormatUrl(opts = {}) {
  const mode = _safeMode(opts.mode);
  const n = _safeN(opts.n);
  const seed = _safeSeed(opts.seed);
  const courts = _safeCourts(opts.courts);
  const tours = _safeTours(opts.tours);
  const trnId = opts.trnId != null ? String(opts.trnId) : '';

  const params = new URLSearchParams({
    mode,
    n: String(n),
    seed: String(seed),
  });
  if (courts != null) params.set('courts', String(courts));
  if (tours != null) params.set('tours', String(tours));
  if (trnId) params.set('trnId', trnId);

  return 'formats/thai/thai.html?' + params.toString();
}

/**
 * Build KOTC format URL with normalized params.
 * @param {{ nc?: number, ppc?: number, trnId?: string }} opts
 * @returns {string}
 */
export function buildKotcFormatUrl(opts = {}) {
  const nc = [1, 2, 3, 4].includes(Number(opts.nc)) ? Number(opts.nc) : 4;
  const ppc = 4; // always 4 for KOTC
  const trnId = opts.trnId != null ? String(opts.trnId) : '';

  const params = new URLSearchParams({
    nc: String(nc),
    ppc: String(ppc),
  });
  if (trnId) params.set('trnId', trnId);

  return 'formats/kotc/kotc.html?' + params.toString();
}

const api = { buildThaiFormatUrl, buildKotcFormatUrl };

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedFormatLinks = api;
  }
} catch (_) {}

export default api;
