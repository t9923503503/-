'use strict';

/**
 * Export utilities — JSON and CSV download helpers.
 * Used by Thai and KOTC finished screens.
 */

import { csvSafe, showToast } from './utils.js';

/**
 * Trigger a file download in the browser.
 * @param {Blob} blob
 * @param {string} filename
 */
function _download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export data as a JSON file.
 * @param {object} data - serializable object
 * @param {string} filename - e.g. 'thai_results_2026-03-22.json'
 */
export function exportToJSON(data, filename) {
  try {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    _download(blob, filename);
    showToast('JSON сохранён', 'ok');
  } catch (e) {
    showToast('Ошибка экспорта JSON', 'bad');
  }
}

/**
 * Export rows as a CSV file with BOM for Excel compatibility.
 * @param {string[]} headers - column headers
 * @param {Array<Array<string|number>>} rows - data rows
 * @param {string} filename - e.g. 'kotc_results_2026-03-22.csv'
 */
export function exportToCSV(headers, rows, filename) {
  try {
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel Cyrillic support
    let csv = BOM;
    csv += headers.map(h => csvSafe(h)).join(',') + '\n';
    for (const row of rows) {
      csv += row.map(cell => csvSafe(String(cell ?? ''))).join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    _download(blob, filename);
    showToast('CSV сохранён', 'ok');
  } catch (e) {
    showToast('Ошибка экспорта CSV', 'bad');
  }
}

/**
 * Build CSV rows from a standings array (shared format between Thai and KOTC).
 * @param {Array<{place:number, name:string, pts:number, diff:number, wins:number, K:number, balls:number, bestRound:number, rPlayed:number}>} standings
 * @param {string} [prefix] - optional prefix columns (e.g. division name, gender)
 * @returns {{ headers: string[], rows: Array<Array<string|number>> }}
 */
export function standingsToCSVData(standings, prefix) {
  const prefixHeaders = prefix ? prefix.split(',') : [];
  const headers = [
    ...prefixHeaders,
    'Место', 'Имя', 'Очки', 'Разница', 'Победы', 'Коэф', 'Мячи', 'Лучший раунд', 'Сыграно',
  ];
  const rows = standings.map(s => [
    ...(prefix ? prefix.split(',').map(() => '') : []),
    s.place ?? '',
    s.name ?? '',
    s.pts ?? 0,
    s.diff ?? 0,
    s.wins ?? 0,
    typeof s.K === 'number' ? s.K.toFixed(2) : '',
    s.balls ?? 0,
    s.bestRound ?? 0,
    s.rPlayed ?? 0,
  ]);
  return { headers, rows };
}

// Expose to globalThis for classic scripts
const api = { exportToJSON, exportToCSV, standingsToCSVData };
globalThis.sharedExport = api;
export default api;
