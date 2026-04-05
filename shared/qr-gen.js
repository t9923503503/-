'use strict';
/**
 * shared/qr-gen.js — Minimal QR Code SVG generator
 * Byte mode, EC Level L, versions 1-7 (up to 154 bytes)
 * Public API: makeQrSvg(text, opts) → SVG string
 *             makeQrDataUrl(text, opts) → data:image/svg+xml;... string
 */

// ── GF(256) tables (primitive poly: x^8+x^4+x^3+x^2+1 = 0x11D) ──
const _EXP = new Uint8Array(512);
const _LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    _EXP[i] = x; _LOG[x] = i;
    x = ((x << 1) ^ (x & 128 ? 0x1d : 0)) & 0xff;
  }
  for (let i = 255; i < 512; i++) _EXP[i] = _EXP[i - 255];
})();
const _mul = (a, b) => (a && b) ? _EXP[_LOG[a] + _LOG[b]] : 0;

// ── RS generator polynomial (ascending coeff, g[n]=1) ────────────
const _genCache = {};
function _rsGen(n) {
  if (_genCache[n]) return _genCache[n];
  let p = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const q = new Uint8Array(p.length + 1);
    for (let j = 0; j < p.length; j++) {
      q[j]     ^= _mul(p[j], _EXP[i]);
      q[j + 1] ^= p[j];
    }
    p = q;
  }
  return (_genCache[n] = p);
}

// ── RS encode: returns EC codewords ──────────────────────────────
function _rsEnc(data, n) {
  const g = _rsGen(n);
  const buf = new Uint8Array(data.length + n);
  data.forEach((b, i) => { buf[i] = b; });
  for (let i = 0; i < data.length; i++) {
    const f = buf[i];
    if (f) for (let j = 1; j <= n; j++) buf[i + j] ^= _mul(f, g[n - j]);
  }
  return buf.slice(data.length);
}

// ── Version table for EC Level L ─────────────────────────────────
// [size, totalData, g1blocks, dataPerBlock, ecPerBlock]
const _VER = [null,
  [21, 19, 1, 19, 7],
  [25, 34, 1, 34, 10],
  [29, 55, 1, 55, 15],
  [33, 80, 1, 80, 20],
  [37, 108, 1, 108, 26],
  [41, 136, 2, 68, 18],
  [45, 156, 4, 39, 10],
];
// Byte capacity in byte mode (mode 4bits + length 8bits = 12 bits overhead)
function _cap(v) { return Math.floor((_VER[v][1] * 8 - 12) / 8); }

// ── Alignment pattern centers for v1-7 ───────────────────────────
const _ALIGN_POS = [null, [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38]];

// ── Format info BCH (EC Level L = 01, XOR mask 0x5412) ───────────
function _fmtInfo(mask) {
  const d5 = (0b01 << 3) | mask; // EC L indicator in bits [4:3], mask in [2:0]
  let d = d5 << 10;
  for (let i = 14; i >= 10; i--) if (d & (1 << i)) d ^= 0x537 << (i - 10);
  return ((d5 << 10) | (d & 0x3ff)) ^ 0x5412;
}

// ── Version info BCH (for v7-40, generator 0x1F25) ───────────────
function _verInfo(ver) {
  let d = ver << 12;
  for (let i = 17; i >= 12; i--) if (d & (1 << i)) d ^= 0x1f25 << (i - 12);
  return (ver << 12) | (d & 0xfff);
}

// ── Build QR matrix ───────────────────────────────────────────────
function _buildMatrix(ver, dataBits) {
  const [size] = _VER[ver];
  // mat[r][c] = { v: 0|1, fn: bool }
  const mat = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ v: 0, fn: false }))
  );
  const set = (r, c, v, fn = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      mat[r][c].v = v ? 1 : 0;
      if (fn) mat[r][c].fn = true;
    }
  };

  // Finder pattern (7×7 with border)
  function finder(tr, tc) {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const border = r === -1 || r === 7 || c === -1 || c === 7;
        const inner = r >= 1 && r <= 5 && c >= 1 && c <= 5;
        const core  = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        let v = 0;
        if (inFinder) {
          if (border) v = 0;
          else if (inner && !core) v = 0;
          else v = 1;
          // Actually: finder is: outer ring=1, separator ring=0, inner 3x3=1
          // row/col 0,6 = 1; row/col 1,5 = 0 (only outer); 2-4=1 for center
          const onOuter = r === 0 || r === 6 || c === 0 || c === 6;
          const onRing  = !onOuter && (r === 1 || r === 5 || c === 1 || c === 5);
          v = onOuter ? 1 : onRing ? 0 : 1;
        } else {
          v = 0; // separator
        }
        set(tr + r, tc + c, v);
      }
  }
  finder(0, 0);               // top-left
  finder(0, size - 7);        // top-right
  finder(size - 7, 0);        // bottom-left

  // Timing patterns (row 6, col 6)
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0 ? 1 : 0);
    set(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Dark module
  set(size - 8, 8, 1);

  // Alignment patterns (5×5, center at each position)
  const ap = _ALIGN_POS[ver];
  for (const r of ap) for (const c of ap) {
    if (mat[r][c].fn) continue; // overlap with finder
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const onBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
      set(r + dr, c + dc, onBorder ? 1 : (dr === 0 && dc === 0 ? 1 : 0));
    }
  }

  // Reserve format info areas (mark as function, value set later)
  const fmtPositions1 = [
    [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],
    [8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  ];
  const fmtPositions2 = [
    [8,size-1],[8,size-2],[8,size-3],[8,size-4],[8,size-5],[8,size-6],[8,size-7],
    [size-8,8],
    [size-7,8],[size-6,8],[size-5,8],[size-4,8],[size-3,8],[size-2,8],[size-1,8],
  ];
  for (const [r,c] of [...fmtPositions1, ...fmtPositions2]) set(r, c, 0);

  // Version info (v7+)
  if (ver >= 7) {
    const vi = _verInfo(ver);
    for (let i = 0; i < 18; i++) {
      const bit = (vi >> i) & 1;
      const r = Math.floor(i / 3), c = i % 3;
      set(r, size - 11 + c, bit); // top-right
      set(size - 11 + c, r, bit); // bottom-left
    }
  }

  // Place data bits (zigzag)
  let bitIdx = 0;
  let up = true;
  let col = size - 1;
  while (col >= 0) {
    if (col === 6) col--; // skip timing column
    for (let rOff = 0; rOff < size; rOff++) {
      const r = up ? (size - 1 - rOff) : rOff;
      for (let dc = 0; dc <= 1; dc++) {
        const c = col - dc;
        if (!mat[r][c].fn) {
          mat[r][c].v = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
        }
      }
    }
    col -= 2;
    up = !up;
  }

  return mat;
}

// ── Apply mask pattern ─────────────────────────────────────────────
const _MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r)    => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

function _applyMask(mat, maskPat, fmtBits) {
  const size = mat.length;
  const fn = _MASKS[maskPat];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!mat[r][c].fn && fn(r, c)) mat[r][c].v ^= 1;

  // Place format info
  const fmtPos1 = [
    [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],
    [8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  ];
  const fmtPos2 = [
    [8,size-1],[8,size-2],[8,size-3],[8,size-4],[8,size-5],[8,size-6],[8,size-7],
    [size-8,8],
    [size-7,8],[size-6,8],[size-5,8],[size-4,8],[size-3,8],[size-2,8],[size-1,8],
  ];
  for (let i = 0; i < 15; i++) {
    const bit = (fmtBits >> (14 - i)) & 1;
    const [r1,c1] = fmtPos1[i]; mat[r1][c1].v = bit;
    const [r2,c2] = fmtPos2[i]; mat[r2][c2].v = bit;
  }
}

// ── Penalty scoring ───────────────────────────────────────────────
function _penalty(mat) {
  const n = mat.length;
  let score = 0;
  // Rule 1: runs of 5+ same-colour in row/col
  for (let r = 0; r < n; r++) {
    for (let isCol = 0; isCol <= 1; isCol++) {
      let run = 1, prev = isCol ? mat[0][r].v : mat[r][0].v;
      for (let i = 1; i < n; i++) {
        const v = isCol ? mat[i][r].v : mat[r][i].v;
        if (v === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else { run = 1; prev = v; }
      }
    }
  }
  // Rule 2: 2×2 blocks
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++)
      if (mat[r][c].v === mat[r+1][c].v && mat[r][c].v === mat[r][c+1].v && mat[r][c].v === mat[r+1][c+1].v)
        score += 3;
  // Rule 3: specific patterns
  const p1 = [1,0,1,1,1,0,1,0,0,0,0], p2 = [0,0,0,0,1,0,1,1,1,0,1];
  for (let r = 0; r < n; r++)
    for (let c = 0; c <= n - 11; c++)
      for (const pat of [p1, p2]) {
        if (pat.every((b,i) => mat[r][c+i].v === b)) score += 40;
        if (pat.every((b,i) => mat[c+i][r].v === b)) score += 40;
      }
  // Rule 4: dark/light ratio
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (mat[r][c].v) dark++;
  score += Math.abs(Math.ceil(dark / (n * n) * 100 / 5) * 5 - 50) / 5 * 10;
  return score;
}

// ── Encode text → bit array ───────────────────────────────────────
function _encode(text, ver) {
  const bytes = new TextEncoder().encode(text);
  const [, totalData, g1blocks, dpb, ecpb] = _VER[ver];
  const bits = [];
  const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };

  pushBits(0b0100, 4);           // byte mode indicator
  pushBits(bytes.length, 8);     // character count (8 bits for v1-9)
  for (const b of bytes) pushBits(b, 8);
  // Terminator + padding
  pushBits(0, Math.min(4, totalData * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const padBytes = [0xEC, 0x11];
  let pi = 0;
  while (bits.length < totalData * 8) pushBits(padBytes[pi++ % 2], 8);

  // Convert to codeword bytes
  const codewords = [];
  for (let i = 0; i < totalData * 8; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    codewords.push(b);
  }

  // Split into blocks, add EC, interleave
  const blocks = [];
  let ci = 0;
  for (let b = 0; b < g1blocks; b++) {
    blocks.push({ data: codewords.slice(ci, ci + dpb), ec: null });
    ci += dpb;
  }
  for (const blk of blocks) blk.ec = Array.from(_rsEnc(blk.data, ecpb));

  const finalBits = [];
  const maxData = Math.max(...blocks.map(b => b.data.length));
  for (let i = 0; i < maxData; i++)
    for (const blk of blocks) if (i < blk.data.length) pushFinalByte(blk.data[i]);
  const maxEc = blocks[0].ec.length;
  for (let i = 0; i < maxEc; i++)
    for (const blk of blocks) if (i < blk.ec.length) pushFinalByte(blk.ec[i]);

  function pushFinalByte(byte) { for (let i = 7; i >= 0; i--) finalBits.push((byte >> i) & 1); }
  return finalBits;
}

// ── Main: generate QR matrix ──────────────────────────────────────
function _qrMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  while (ver <= 7 && bytes.length > _cap(ver)) ver++;
  if (ver > 7) throw new Error('QR: text too long (max 154 bytes for v7 EC-L)');

  const dataBits = _encode(text, ver);
  const [size] = _VER[ver];

  // Try all 8 mask patterns, pick lowest penalty
  let bestMat = null, bestScore = Infinity, bestMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    // Deep-copy base matrix
    const baseMat = _buildMatrix(ver, dataBits);
    const fmt = _fmtInfo(mask);
    _applyMask(baseMat, mask, fmt);
    const score = _penalty(baseMat);
    if (score < bestScore) { bestScore = score; bestMat = baseMat; bestMask = mask; }
  }
  return bestMat;
}

// ── SVG output ────────────────────────────────────────────────────
export function makeQrSvg(text, opts = {}) {
  const { size = 180, padding = 10, dark = '#ffffff', light = 'transparent' } = opts;
  const mat = _qrMatrix(text);
  const n = mat.length;
  const cell = (size - padding * 2) / n;
  const rects = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (mat[r][c].v)
        rects.push(`<rect x="${(padding + c * cell).toFixed(1)}" y="${(padding + r * cell).toFixed(1)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="${dark}"/>`);
  const bg = light === 'transparent' ? '' : `<rect width="${size}" height="${size}" fill="${light}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${rects.join('')}</svg>`;
}

export function makeQrDataUrl(text, opts = {}) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(makeQrSvg(text, opts));
}

// Classic-script export
if (typeof globalThis !== 'undefined') {
  globalThis.makeQrSvg     = makeQrSvg;
  globalThis.makeQrDataUrl = makeQrDataUrl;
}
