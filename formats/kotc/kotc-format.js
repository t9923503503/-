'use strict';

/**
 * KOTC (King of the Court) math + ranking helpers (pure, no DOM).
 * Extracted from legacy `web/public/kotc/assets/js/screens/core.js`
 * and `web/public/kotc/assets/js/state/app-state.js`.
 *
 * Reuses scoring formula from Thai format (thaiCalcPoints / thaiCalcCoef)
 * since the algorithms are identical.
 *
 * All functions are pure — no DOM, no localStorage, no globals.
 */

import { thaiCalcPoints, thaiCalcCoef } from '../thai/thai-format.js';

// ════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════

const EPS = 1e-9;

export const COURT_META = [
  { name: '👑 КОРТ 1', color: '#FFD700' },
  { name: '🔵 КОРТ 2', color: '#4DA8DA' },
  { name: '🟢 КОРТ 3', color: '#6ABF69' },
  { name: '🟣 КОРТ 4', color: '#C77DFF' },
];

export const DIV_KEYS = ['hard', 'advance', 'medium', 'lite'];

export const DIV_TIMER_IDX = { hard: 4, advance: 5, medium: 6, lite: 7 };

/** Tournament placing → ranking points (1st=100 ... 40th=1) */
export const POINTS_TABLE = [
  100, 90, 82, 76, 70, 65, 60, 56, 52, 48,  // 1-10  (HARD)
   44, 42, 40, 38, 36, 34, 32, 30, 28, 26,  // 11-20 (MEDIUM)
   24, 22, 20, 18, 16, 14, 12, 10,  8,  7,  // 21-30
    6,  5,  4,  3,  2,  2,  1,  1,  1,  1,  // 31-40 (LITE)
];

// ════════════════════════════════════════════════════════════
// Partner rotation
// ════════════════════════════════════════════════════════════

/**
 * Woman partner index for man `mi` at round `ri`.
 * In rotating mode: woman = (mi + ri) % ppc.
 * In fixed mode: woman = mi.
 */
export function kotcPartnerW(mi, ri, ppc = 4, fixedPairs = false) {
  return fixedPairs ? mi : (mi + ri) % ppc;
}

/**
 * Man partner index for woman `wi` at round `ri`.
 * Inverse of kotcPartnerW.
 */
export function kotcPartnerM(wi, ri, ppc = 4, fixedPairs = false) {
  return fixedPairs ? wi : ((wi - ri) % ppc + ppc) % ppc;
}

/** Division partner rotation (always rotating, Nd players). */
export function kotcDivPartnerW(mi, ri, Nd) {
  return (mi + ri) % Nd;
}

/** Inverse division partner rotation. */
export function kotcDivPartnerM(wi, ri, Nd) {
  return ((wi - ri) % Nd + Nd) % Nd;
}

// ════════════════════════════════════════════════════════════
// Deterministic matchups
// ════════════════════════════════════════════════════════════

/**
 * Perfect matching within a tour for ppc=4 (ThaiVolley32 table).
 * Returns pairs [[miA, miB], ...] playing each other at round `ri`.
 */
export function kotcMatchupsR1(ri, ppc = 4) {
  if (ppc !== 4) return [];
  if (ri === 0) return [[0, 1], [2, 3]];
  if (ri === 1) return [[0, 2], [1, 3]];
  if (ri === 2) return [[0, 3], [1, 2]];
  // ri === 3
  return [[0, 3], [1, 2]];
}

/**
 * Find opponent team index for `mi` at round `ri`.
 */
export function kotcOppIdxR1(mi, ri, ppc = 4) {
  const pairs = kotcMatchupsR1(ri, ppc);
  for (const [a, b] of pairs) {
    if (a === mi) return b;
    if (b === mi) return a;
  }
  return null;
}

// ════════════════════════════════════════════════════════════
// Round score helpers
// ════════════════════════════════════════════════════════════

/**
 * All round scores for man `mi` on court `ci`.
 * scores shape: scores[ci][mi][ri]
 */
export function kotcManRounds(scores, ci, mi, ppc = 4) {
  return Array.from({ length: ppc }, (_, ri) => scores[ci]?.[mi]?.[ri] ?? null);
}

/**
 * All round scores for woman `wi` on court `ci`.
 * Looks up via partnerM to find the team's score.
 */
export function kotcWomanRounds(scores, ci, wi, ppc = 4, fixedPairs = false) {
  return Array.from({ length: ppc }, (_, ri) => {
    const mi = kotcPartnerM(wi, ri, ppc, fixedPairs);
    return scores[ci]?.[mi]?.[ri] ?? null;
  });
}

/** Division man rounds: divScores[key][mi][ri]. */
export function kotcDivManRounds(divScores, key, mi, Nd) {
  return Array.from({ length: Nd }, (_, ri) => (divScores[key]?.[mi] ?? [])[ri] ?? null);
}

/** Division woman rounds: via divPartnerM. */
export function kotcDivWomanRounds(divScores, key, wi, Nd) {
  return Array.from({ length: Nd }, (_, ri) => {
    const mi = kotcDivPartnerM(wi, ri, Nd);
    return (divScores[key]?.[mi] ?? [])[ri] ?? null;
  });
}

// ════════════════════════════════════════════════════════════
// Ranking
// ════════════════════════════════════════════════════════════

/** Standard tiebreak sort comparator: wins → diff → pts → K → balls → stable idx */
function _rankSort(a, b) {
  if (b.wins  !== a.wins)  return b.wins  - a.wins;
  if (b.diff  !== a.diff)  return b.diff  - a.diff;
  if (b.pts   !== a.pts)   return b.pts   - a.pts;
  if (b.K     !== a.K)     return b.K     - a.K;
  if (b.balls !== a.balls) return b.balls - a.balls;
  return (a.stableIdx ?? a.idx ?? 0) - (b.stableIdx ?? b.idx ?? 0);
}

/** Assign place with tie detection. Mutates array. */
function _assignPlaces(arr) {
  arr.forEach((x, i, s) => {
    const prev = s[i - 1];
    const tied = !!prev &&
      prev.wins === x.wins &&
      prev.diff === x.diff &&
      prev.pts === x.pts &&
      Math.abs(prev.K - x.K) < EPS &&
      prev.balls === x.balls;
    x.place = tied ? prev.place : i + 1;
    x.tied = tied;
  });
  return arr;
}

/**
 * Rank players on a single court for one gender.
 *
 * @param {object} opts
 * @param {Array}  opts.scores     - scores[ci][mi][ri] (full 3D array)
 * @param {number} opts.ci         - court index
 * @param {number} opts.ppc        - players per court (default 4)
 * @param {string} opts.gender     - 'M' or 'W'
 * @param {boolean} opts.fixedPairs - partner rotation mode
 * @returns {Array<{idx, pts, diff, wins, K, balls, bestRound, rPlayed, place, tied}>}
 */
export function kotcRankCourt({ scores, ci, ppc = 4, gender = 'M', fixedPairs = false }) {
  const arr = [];
  for (let i = 0; i < ppc; i++) {
    let wins = 0, diff = 0, pts = 0, balls = 0, bestRound = 0, rPlayed = 0;

    for (let ri = 0; ri < ppc; ri++) {
      let own = null, opp = null;

      if (gender === 'M') {
        own = scores[ci]?.[i]?.[ri] ?? null;
        const oppMi = kotcOppIdxR1(i, ri, ppc);
        opp = oppMi == null ? null : (scores[ci]?.[oppMi]?.[ri] ?? null);
      } else {
        const manIdx = kotcPartnerM(i, ri, ppc, fixedPairs);
        own = scores[ci]?.[manIdx]?.[ri] ?? null;
        const oppMan = kotcOppIdxR1(manIdx, ri, ppc);
        opp = oppMan == null ? null : (scores[ci]?.[oppMan]?.[ri] ?? null);
      }

      if (own === null || opp === null) continue;
      const d = own - opp;
      if (own > bestRound) bestRound = own;
      balls += own;
      diff += d;
      pts += thaiCalcPoints(d);
      if (d > 0) wins++;
      rPlayed++;
    }

    const K = thaiCalcCoef([diff]);
    arr.push({ idx: i, pts, diff, wins, K, balls, bestRound, rPlayed });
  }

  arr.sort(_rankSort);
  _assignPlaces(arr);
  return arr;
}

/**
 * Global ranking across all active courts.
 *
 * @param {object} opts
 * @param {Array}  opts.scores  - scores[ci][mi][ri]
 * @param {number} opts.nc      - number of courts
 * @param {number} opts.ppc     - players per court
 * @param {Array}  opts.courts  - ALL_COURTS[ci] = { men:[], women:[] }
 * @param {boolean} opts.fixedPairs
 * @returns {{ M: Array, W: Array }}
 */
export function kotcRankAll({ scores, nc = 4, ppc = 4, courts, fixedPairs = false }) {
  const out = { M: [], W: [] };

  for (const gender of ['M', 'W']) {
    const all = [];
    for (let ci = 0; ci < nc; ci++) {
      const ct = courts[ci];
      const meta = COURT_META[ci];
      const ranked = kotcRankCourt({ scores, ci, ppc, gender, fixedPairs });

      ranked.forEach(r => {
        all.push({
          pts: r.pts, diff: r.diff, wins: r.wins,
          K: r.K, balls: r.balls, bestRound: r.bestRound,
          rPlayed: r.rPlayed, courtPlace: r.place, tied: r.tied,
          name:      gender === 'M' ? ct.men[r.idx] : ct.women[r.idx],
          courtName: meta.name, courtColor: meta.color,
          gender, genderIcon: gender === 'M' ? '🏋️' : '👩',
          originalCourtIndex: ci * ppc + r.idx,
          stableIdx: ci * ppc + r.idx,
        });
      });
    }

    all.sort(_rankSort);

    // Assign global ranks
    all.forEach((p, i, a) => {
      const prev = a[i - 1];
      const tied = !!prev &&
        prev.wins === p.wins && prev.diff === p.diff &&
        prev.pts === p.pts && Math.abs(prev.K - p.K) < EPS &&
        prev.balls === p.balls;
      p.globalRank = tied ? prev.globalRank : i + 1;
      p.globalTied = tied;
    });

    out[gender] = all;
  }
  return out;
}

/**
 * Rank players within a division.
 *
 * @param {object} opts
 * @param {object} opts.divScores  - { hard: [][], advance: [][], ... }
 * @param {object} opts.divRoster  - { hard: {men:[], women:[]}, ... }
 * @param {string} opts.key        - division key
 * @param {string} opts.gender     - 'M' or 'W'
 * @returns {Array}
 */
export function kotcRankDivision({ divScores, divRoster, key, gender = 'M' }) {
  const names = gender === 'M' ? divRoster[key]?.men : divRoster[key]?.women;
  const Nd = names?.length ?? 0;
  if (!Nd) return [];

  const arr = [];
  for (let i = 0; i < Nd; i++) {
    let wins = 0, diff = 0, pts = 0, balls = 0, bestRound = 0, rPlayed = 0;

    for (let ri = 0; ri < Nd; ri++) {
      let own = null, opp = null;

      if (gender === 'M') {
        own = (divScores[key]?.[i] ?? [])[ri] ?? null;
        const oppMi = kotcOppIdxR1(i, ri, 4);
        opp = oppMi == null ? null : ((divScores[key]?.[oppMi] ?? [])[ri] ?? null);
      } else {
        const manIdx = kotcDivPartnerM(i, ri, Nd);
        own = (divScores[key]?.[manIdx] ?? [])[ri] ?? null;
        const oppMan = kotcOppIdxR1(manIdx, ri, 4);
        opp = oppMan == null ? null : ((divScores[key]?.[oppMan] ?? [])[ri] ?? null);
      }

      if (own === null || opp === null) continue;
      const d = own - opp;
      if (own > bestRound) bestRound = own;
      balls += own;
      diff += d;
      pts += thaiCalcPoints(d);
      if (d > 0) wins++;
      rPlayed++;
    }

    const K = thaiCalcCoef([diff]);
    arr.push({ idx: i, name: names[i], pts, diff, wins, K, balls, bestRound, rPlayed });
  }

  arr.sort(_rankSort);
  _assignPlaces(arr);
  return arr;
}

// ════════════════════════════════════════════════════════════
// Division seeding
// ════════════════════════════════════════════════════════════

/**
 * Active division keys based on court count.
 * nc=1 → [hard], nc=2 → [hard,lite], nc=3 → [hard,medium,lite], nc=4 → all four.
 */
export function kotcActiveDivKeys(nc = 4) {
  if (nc <= 1) return ['hard'];
  if (nc === 2) return ['hard', 'lite'];
  if (nc === 3) return ['hard', 'medium', 'lite'];
  return ['hard', 'advance', 'medium', 'lite'];
}

/**
 * Seed divisions from R1 rankings (1903.md rules for ppc=4, nc=4).
 *
 * HARD: winners from courts 1..3 + best 2nd among courts 1..3
 * ADVANCE: all players from court 4
 * MEDIUM: remaining 2nds from courts 1..3 + best two 3rds from courts 1..3
 * LITE: remaining 3rd + all 4ths from courts 1..3
 *
 * Fallback: even slicing when ppc≠4 or nc≠4.
 *
 * @param {object} opts
 * @param {Array}  opts.scores  - scores[ci][mi][ri]
 * @param {number} opts.nc
 * @param {number} opts.ppc
 * @param {Array}  opts.courts  - ALL_COURTS
 * @param {boolean} opts.fixedPairs
 * @param {string} opts.gender  - 'M' or 'W'
 * @returns {object} { hard: Player[], advance: Player[], medium: Player[], lite: Player[] }
 */
export function kotcSeedDivisions({ scores, nc = 4, ppc = 4, courts, fixedPairs = false, gender = 'M' }) {
  // Build ranked-by-court first
  const rankedByCourt = [];
  for (let ci = 0; ci < nc; ci++) {
    rankedByCourt.push(kotcRankCourt({ scores, ci, ppc, gender, fixedPairs }));
  }

  const toPlayer = (ci, r) => {
    const ct = courts[ci];
    const meta = COURT_META[ci];
    return {
      idx: r.idx,
      name: gender === 'M' ? ct.men[r.idx] : ct.women[r.idx],
      pts: r.pts, diff: r.diff, wins: r.wins,
      K: r.K, balls: r.balls, bestRound: r.bestRound,
      rPlayed: r.rPlayed, courtPlace: r.place, tied: r.tied,
      gender, genderIcon: gender === 'M' ? '🏋️' : '👩',
      courtName: meta.name, courtColor: meta.color,
      originalCourtIndex: ci * ppc + r.idx,
      stableIdx: ci * ppc + r.idx,
    };
  };

  // Fallback for non-standard config
  if (ppc !== 4 || nc !== 4) {
    const allRanked = kotcRankAll({ scores, nc, ppc, courts, fixedPairs });
    const keys = kotcActiveDivKeys(nc);
    const result = {};
    keys.forEach((key, i) => {
      const start = i * ppc;
      const end = start + ppc;
      result[key] = allRanked[gender].slice(start, end);
    });
    // Fill missing keys with empty arrays
    DIV_KEYS.forEach(k => { if (!result[k]) result[k] = []; });
    return result;
  }

  // Standard 4×4 seeding (1903.md rules)
  const keySort = (a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const kA = Math.round(a.K * 1e6);
    const kB = Math.round(b.K * 1e6);
    if (kB !== kA) return kB - kA;
    if (b.balls !== a.balls) return b.balls - a.balls;
    return a.originalCourtIndex - b.originalCourtIndex;
  };

  const secondCandidates = [0, 1, 2].map(ci => toPlayer(ci, rankedByCourt[ci][1]));
  const thirdCandidates  = [0, 1, 2].map(ci => toPlayer(ci, rankedByCourt[ci][2]));
  const fourthCandidates = [0, 1, 2].map(ci => toPlayer(ci, rankedByCourt[ci][3]));

  const bestSecond = [...secondCandidates].sort(keySort)[0];
  const remainingSeconds = secondCandidates
    .filter(p => p.originalCourtIndex !== bestSecond.originalCourtIndex);

  const sortedThird = [...thirdCandidates].sort(keySort);
  const bestTwoThird = sortedThird.slice(0, 2);
  const remainingThird = sortedThird[2];

  const hard = [
    toPlayer(0, rankedByCourt[0][0]),
    toPlayer(1, rankedByCourt[1][0]),
    toPlayer(2, rankedByCourt[2][0]),
    bestSecond,
  ];

  const advance = rankedByCourt[3].slice(0, 4).map(r => toPlayer(3, r));

  const medium = [
    ...remainingSeconds.sort((a, b) => a.originalCourtIndex - b.originalCourtIndex),
    ...bestTwoThird,
  ];

  const lite = [
    remainingThird,
    ...fourthCandidates.sort((a, b) => a.originalCourtIndex - b.originalCourtIndex),
  ];

  return { hard, advance, medium, lite };
}

/**
 * Full division seeding for both genders.
 */
export function kotcSeedAll({ scores, nc = 4, ppc = 4, courts, fixedPairs = false }) {
  const result = {};
  for (const key of DIV_KEYS) {
    result[key] = { M: [], W: [] };
  }
  const seededM = kotcSeedDivisions({ scores, nc, ppc, courts, fixedPairs, gender: 'M' });
  const seededW = kotcSeedDivisions({ scores, nc, ppc, courts, fixedPairs, gender: 'W' });
  const active = kotcActiveDivKeys(nc);
  for (const key of active) {
    result[key].M = seededM[key] || [];
    result[key].W = seededW[key] || [];
  }
  return result;
}

// ════════════════════════════════════════════════════════════
// Blank state factories
// ════════════════════════════════════════════════════════════

/** Create blank scores array: scores[ci][mi][ri] = null */
export function kotcMakeBlankScores(ppc = 4, nc = 4) {
  return Array.from({ length: nc }, () =>
    Array.from({ length: ppc }, () => Array(ppc).fill(null))
  );
}

/** Create blank division scores: { hard: [][], ... } */
export function kotcMakeBlankDivScores(size = 5) {
  const o = {};
  DIV_KEYS.forEach(k => {
    o[k] = Array.from({ length: size }, () => Array(size).fill(null));
  });
  return o;
}

/** Create blank division rosters: { hard: {men:[], women:[]}, ... } */
export function kotcMakeBlankDivRoster() {
  const o = {};
  DIV_KEYS.forEach(k => { o[k] = { men: [], women: [] }; });
  return o;
}

// ════════════════════════════════════════════════════════════
// Rating system
// ════════════════════════════════════════════════════════════

/** Tournament placing → ranking points. */
export function kotcCalculateRanking(place) {
  if (place < 1 || place > POINTS_TABLE.length) return 1;
  return POINTS_TABLE[place - 1];
}

/** Rank → player zone (hard/medium/lite). */
export function kotcGetPlayerZone(rank) {
  if (rank <= 10) return 'hard';
  if (rank <= 20) return 'medium';
  return 'lite';
}

/** Division string → gender type. */
export function kotcDivisionToType(division) {
  if (!division) return 'M';
  const d = division.toLowerCase();
  if (d.includes('женск')) return 'W';
  if (d.includes('микст') || d.includes('смешан')) return 'Mix';
  return 'M';
}

// Re-export scoring functions for convenience
export { thaiCalcPoints, thaiCalcCoef };
