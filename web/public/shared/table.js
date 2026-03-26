'use strict';

/**
 * shared/table.js — CrossTable and StandingsTable HTML renderers.
 *
 * Contract (PLATFORM_ROADMAP.md):
 *   CrossTable.render({
 *     columns: [{ key, label, width? }],
 *     rows:    [{ rank, name, ...values }],
 *     highlights: { gold: [0], silver: [1], bronze: [2] }  // row indices
 *   }) → HTML string
 *
 *   StandingsTable.render({ rows, columns }) → HTML string
 *
 * ARCH A0.1
 */

function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[m]);
}

// ── CrossTable ─────────────────────────────────────────────────

const RANK_ICONS = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * Render a generic cross-table (standings grid).
 *
 * @param {object} opts
 * @param {Array<{key:string, label:string, width?:string, align?:string}>} opts.columns
 * @param {Array<object>} opts.rows  — each row must have all column keys as fields; plus `rank` and `name`
 * @param {{ gold?: number[], silver?: number[], bronze?: number[] }} [opts.highlights]
 * @param {string} [opts.caption]
 * @returns {string} HTML
 */
function crossTableRender({ columns = [], rows = [], highlights = {}, caption = '' } = {}) {
  const goldSet   = new Set(highlights.gold   || []);
  const silverSet = new Set(highlights.silver || []);
  const bronzeSet = new Set(highlights.bronze || []);

  const colDefs = columns.map(c => {
    const w = c.width ? ` style="width:${c.width}"` : '';
    const a = c.align || 'center';
    return { ...c, w, a };
  });

  const thead = `<thead><tr>${
    colDefs.map(c =>
      `<th${c.w} style="text-align:${c.a}">${_esc(c.label)}</th>`
    ).join('')
  }</tr></thead>`;

  const tbody = `<tbody>${
    rows.map((row, ri) => {
      const isGold   = goldSet.has(ri);
      const isSilver = silverSet.has(ri);
      const isBronze = bronzeSet.has(ri);
      const rowCls   = isGold ? ' class="tbl-gold"' : isSilver ? ' class="tbl-silver"' : isBronze ? ' class="tbl-bronze"' : '';
      const rankIcon = isGold ? '🥇' : isSilver ? '🥈' : isBronze ? '🥉' : '';
      return `<tr${rowCls}>${
        colDefs.map(c => {
          const val = c.key === 'rank'
            ? (rankIcon || _esc(row.rank ?? ri + 1))
            : _esc(row[c.key] ?? '—');
          return `<td style="text-align:${c.a}">${val}</td>`;
        }).join('')
      }</tr>`;
    }).join('')
  }</tbody>`;

  const cap = caption ? `<caption class="tbl-caption">${_esc(caption)}</caption>` : '';

  return `<div class="shared-table-wrap">
  <table class="shared-table">${cap}${thead}${tbody}</table>
</div>`;
}

export const CrossTable = { render: crossTableRender };

// ── StandingsTable ─────────────────────────────────────────────

/**
 * Render a vertical standings table (name + numeric stats).
 *
 * @param {object} opts
 * @param {Array<object>} opts.rows — player stat objects
 * @param {Array<{key, label, width?, align?}>} [opts.columns] — columns to show (default: rank,name,wins,pts,diff,K)
 * @param {string} [opts.caption]
 * @returns {string} HTML
 */
function standingsTableRender({
  rows = [],
  columns = [
    { key: 'place', label: '#',     width: '36px', align: 'center' },
    { key: 'name',  label: 'Игрок', align: 'left' },
    { key: 'wins',  label: 'W',     width: '40px', align: 'center' },
    { key: 'pts',   label: 'Pts',   width: '44px', align: 'center' },
    { key: 'diff',  label: 'Diff',  width: '48px', align: 'center' },
    { key: 'K',     label: 'K',     width: '52px', align: 'center' },
  ],
  caption = '',
} = {}) {
  const highlights = {
    gold:   rows.map((r, i) => r.place === 1 ? i : -1).filter(i => i >= 0),
    silver: rows.map((r, i) => r.place === 2 ? i : -1).filter(i => i >= 0),
    bronze: rows.map((r, i) => r.place === 3 ? i : -1).filter(i => i >= 0),
  };
  return crossTableRender({ columns, rows, highlights, caption });
}

export const StandingsTable = { render: standingsTableRender };

// ── CSS (inject once) ──────────────────────────────────────────

let _cssInjected = false;
export function injectTableCSS() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.shared-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:10px}
.shared-table{width:100%;border-collapse:collapse;font:14px/1.3 Barlow,sans-serif}
.shared-table caption.tbl-caption{caption-side:top;padding:6px 0;font-weight:700;font-size:.85em;color:var(--muted,#6b6b8a);text-align:left}
.shared-table th{padding:8px 6px;font-size:.75em;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#6b6b8a);border-bottom:1px solid rgba(255,255,255,.08)}
.shared-table td{padding:9px 6px;border-bottom:1px solid rgba(255,255,255,.05);color:var(--text,#e8e8f0)}
.shared-table tr:last-child td{border-bottom:none}
.shared-table tr.tbl-gold td{color:#FFD700;font-weight:700}
.shared-table tr.tbl-silver td{color:#C0C0C0;font-weight:600}
.shared-table tr.tbl-bronze td{color:#CD7F32;font-weight:600}
.shared-table tr:hover td{background:rgba(255,255,255,.03)}
`;
  document.head.appendChild(style);
}

const _api = { CrossTable, StandingsTable, injectTableCSS };

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.sharedTable = _api;
  }
} catch (_) {}

export default _api;
