'use strict';

/**
 * ThaiVolley32 math + schedule helpers (pure, no DOM).
 * Extracted from current UI implementation in `assets/js/screens/core.js`.
 *
 * Contract (from PLATFORM_ROADMAP.md / STATUS.md):
 * - thaiCalcPoints(diff) -> 0|1|2|3
 * - thaiCalcCoef(diffs[]) -> number
 * - thaiZeroSumMatch(diff1, diff2) -> boolean
 * - thaiZeroSumTour(allDiffs[]) -> boolean
 * - thaiTiebreak(a,b) -> comparator
 * - thaiCalcStandings(group) -> Standing[]
 * - thaiGenerateSchedule(...) -> Tour[]
 * - thaiValidateSchedule(schedule, players) -> { valid, errors[] }
 * - thaiSeedR2(r1Groups, gender) -> R2Group[]
 * - thaiCalcNominations(r1Stats, r2Stats) -> Nomination[]
 */

const EPS = 1e-9;
const COEF_K_BASE = 60;
const COEF_K_PROTECT_VALUE = 999.99;

function _num(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

/**
 * Points map for a single match by diff (ownBalls - oppBalls).
 * >=7 -> 3, 3..6 -> 2, 1..2 -> 1, <=0 -> 0
 */
export function thaiCalcPoints(diff) {
  const d = _num(diff);
  if (d === null) return 0;
  if (d >= 7) return 3;
  if (d >= 3) return 2;
  if (d >= 1) return 1;
  return 0;
}

function thaiCalcK(diffSum) {
  const denom = COEF_K_BASE - diffSum;
  if (Math.abs(denom) < EPS) return COEF_K_PROTECT_VALUE;
  return (COEF_K_BASE + diffSum) / denom;
}

export function thaiCalcCoef(diffs) {
  const arr = Array.isArray(diffs) ? diffs : [];
  const diffSum = arr.reduce((s, d) => s + (Number.isFinite(Number(d)) ? Number(d) : 0), 0);
  return thaiCalcK(diffSum);
}

export function thaiZeroSumMatch(diff1, diff2) {
  const d1 = _num(diff1);
  const d2 = _num(diff2);
  if (d1 === null || d2 === null) return false;
  return Math.abs(d1 + d2) < EPS;
}

export function thaiZeroSumTour(allDiffs) {
  const arr = Array.isArray(allDiffs) ? allDiffs : [];
  const sum = arr.reduce((s, d) => s + (Number.isFinite(Number(d)) ? Number(d) : 0), 0);
  return Math.abs(sum) < EPS;
}

function _getPts(stat) {
  if (!stat) return 0;
  const v =
    stat.pts ?? stat.points ?? stat.totalPts ?? stat.total_points ?? stat.total ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _getRank(stat) {
  if (!stat) return 0;
  const v = stat.rank ?? stat.place ?? stat.globalRank ?? stat.global_rank ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Progress from R1 -> R2 for a single entity.
 * @param {object} r1Stat expects { pts|points|place|rank }
 * @param {object} r2Stat expects { pts|points|place|rank }
 * @returns {{ delta_pts:number, delta_rank:number }}
 */
export function thaiCalcProgress(r1Stat, r2Stat) {
  const p1 = _getPts(r1Stat);
  const p2 = _getPts(r2Stat);
  const r1 = _getRank(r1Stat);
  const r2 = _getRank(r2Stat);
  return {
    delta_pts: p2 - p1,
    delta_rank: r2 - r1,
  };
}

/**
 * Comparator for ThaiVolley32 R1 standings.
 * Higher wins/diff/pts/K/balls are better; idx is stable tie-breaker (ascending).
 */
export function thaiTiebreak(a, b) {
  const winsA = a?.wins ?? 0;
  const winsB = b?.wins ?? 0;
  if (winsB !== winsA) return winsB - winsA;

  const diffA = a?.diff ?? 0;
  const diffB = b?.diff ?? 0;
  if (diffB !== diffA) return diffB - diffA;

  const ptsA = a?.pts ?? a?.points ?? 0;
  const ptsB = b?.pts ?? b?.points ?? 0;
  if (ptsB !== ptsA) return ptsB - ptsA;

  const kA = a?.K ?? a?.coef ?? 0;
  const kB = b?.K ?? b?.coef ?? 0;
  if (kB !== kA) return kB - kA;

  const ballsA = a?.balls ?? 0;
  const ballsB = b?.balls ?? 0;
  if (ballsB !== ballsA) return ballsB - ballsA;

  const idxA = a?.idx ?? a?.id ?? 0;
  const idxB = b?.idx ?? b?.id ?? 0;
  if (idxA === idxB) return 0;
  if (typeof idxA === 'number' && typeof idxB === 'number') return idxA - idxB;
  return String(idxA).localeCompare(String(idxB), 'ru');
}

/**
 * Compute ThaiVolley32 standings for a group.
 *
 * Supported group shapes:
 * 1) { players: [{ idx, own: number[], opp: number[] }, ...] }
 * 2) { ownScores: (number|null)[][], oppScores: (number|null)[][] } // [playerIdx][tourIdx]
 * 3) Legacy/aggregates: group.players as array of { wins,diff,pts,K,balls } (no recompute)
 */
export function thaiCalcStandings(group) {
  const g = group || {};
  const players = Array.isArray(g.players) ? g.players : null;
  const ownScores = Array.isArray(g.ownScores) ? g.ownScores : null;
  const oppScores = Array.isArray(g.oppScores) ? g.oppScores : null;

  if (!players && !ownScores) return [];

  // If caller passed aggregated stats, normalize + recompute coef if missing.
  if (players && players.length && (players[0]?.own === undefined && players[0]?.opp === undefined)) {
    const arr = players.map((p, i) => {
      const wins = Number.isFinite(Number(p.wins)) ? Number(p.wins) : 0;
      const diff = Number.isFinite(Number(p.diff)) ? Number(p.diff) : 0;
      const pts = Number.isFinite(Number(p.pts ?? p.points)) ? Number(p.pts ?? p.points) : 0;
      const balls = Number.isFinite(Number(p.balls)) ? Number(p.balls) : 0;
      const K = Number.isFinite(Number(p.K ?? p.coef)) ? Number(p.K ?? p.coef) : thaiCalcK(diff);
      return { idx: p.idx ?? p.id ?? i, wins, diff, pts, K, balls, bestRound: p.bestRound ?? 0, rPlayed: p.rPlayed ?? 0 };
    });
    arr.sort(thaiTiebreak);
    // Assign place/tied with same criteria as UI.
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

  // Own/opp scores per tour.
  const pCount = players ? players.length : (ownScores ? ownScores.length : 0);
  const toursCount = players
    ? (players[0]?.own?.length ?? players[0]?.opp?.length ?? 0)
    : (ownScores?.[0]?.length ?? 0);

  const arr = [];
  for (let i = 0; i < pCount; i++) {
    const p = players ? players[i] : { idx: i, own: ownScores[i], opp: oppScores[i] };
    const own = p.own ?? ownScores?.[i] ?? [];
    const opp = p.opp ?? oppScores?.[i] ?? [];

    let wins = 0;
    let diff = 0;
    let pts = 0;
    let balls = 0;
    let bestRound = 0;
    let rPlayed = 0;

    for (let ri = 0; ri < toursCount; ri++) {
      const ownVal = own?.[ri];
      const oppVal = opp?.[ri];
      const ownNum = ownVal === null || ownVal === undefined ? null : Number(ownVal);
      const oppNum = oppVal === null || oppVal === undefined ? null : Number(oppVal);
      if (ownNum === null || oppNum === null || !Number.isFinite(ownNum) || !Number.isFinite(oppNum)) continue;

      const d = ownNum - oppNum;
      if (ownNum > bestRound) bestRound = ownNum;
      balls += ownNum;
      diff += d;
      pts += thaiCalcPoints(d);
      if (d > 0) wins++;
      rPlayed++;
    }

    const K = thaiCalcK(diff);
    arr.push({ idx: p.idx ?? p.id ?? i, pts, diff, wins, K, balls, bestRound, rPlayed });
  }

  arr.sort(thaiTiebreak);
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

// -------------------- Schedule generator --------------------

function createRng(seed) {
  // Deterministic LCG
  let s = Number(seed);
  if (!Number.isFinite(s)) s = 1;
  s = (s >>> 0) || 1;
  return function rand() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffleDet(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function perfectMatchingOn8(indices, roundNo, opponentCounts) {
  // Deterministic "better than random" matching for 8 players.
  // Try different rotations of the index order and pick the first with 0 repeats;
  // otherwise pick the rotation that minimizes total repeat edge counts.
  const base = [...indices];
  let bestPairs = null;
  let bestScore = Infinity;
  for (let rot = 0; rot < indices.length; rot++) {
    const order = base.slice(rot).concat(base.slice(0, rot));
    const pairs = [];
    for (let i = 0; i < 4; i++) {
      const a = order[i];
      const b = order[7 - i];
      pairs.push([a, b]);
    }

    let repeatScore = 0;
    for (const [a, b] of pairs) {
      repeatScore += opponentCounts[pairKey(a, b)] || 0;
    }

    if (repeatScore === 0) return pairs;
    if (repeatScore < bestScore) {
      bestScore = repeatScore;
      bestPairs = pairs;
    }
  }
  return bestPairs || [];
}

function roundRobinPerfectMatchingPairs(players) {
  // Full perfect matching schedule for even N (standard circle method).
  // Returns array of rounds, each round is array of [a,b].
  const n = players.length;
  if (n % 2 !== 0) throw new Error('roundRobinPerfectMatchingPairs expects even N');
  const arr = [...players];
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([arr[i], arr[n - 1 - i]]);
    }
    rounds.push(pairs);
    // rotate: keep arr[0], rotate the rest
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

export function thaiGenerateSchedule({ men, women, mode, seed } = {}) {
  const m = Number(men);
  const w = Number(women);
  const sd = seed ?? 1;
  const rand = createRng(sd);

  if (!mode) throw new Error('thaiGenerateSchedule: mode is required');

  const normalizedMode = String(mode).toUpperCase();
  if (normalizedMode === 'MM' || normalizedMode === 'WM' || normalizedMode === 'WW') {
    const n = normalizedMode === 'MM' ? m : w;
    if (![8, 10].includes(n)) throw new Error('thaiGenerateSchedule: only 8 or 10 supported for now');

    if (n === 8) {
      const players = Array.from({ length: 8 }, (_, i) => i);
      const rounds = roundRobinPerfectMatchingPairs(players).slice(0, 4);
      const res = rounds.map((pairs, ri) => ({ round: ri, pairs }));
      res.meta = { mode: normalizedMode, n };
      return res;
    }

    // n === 10: we want each player to have exactly 4 matches, rest 1.
    // Implement by selecting active set of 8 players per tour (2 rests per tour),
    // with rest partition deterministic by seed.
    const all = Array.from({ length: 10 }, (_, i) => i);
    const shuffled = shuffleDet(all, rand);
    const restPairs = [];
    for (let i = 0; i < 10; i += 2) restPairs.push([shuffled[i], shuffled[i + 1]]);

    const opponentCounts = {};
    const schedule = [];
    for (let ri = 0; ri < 5; ri++) {
      const rests = new Set(restPairs[ri]);
      const active = all.filter(x => !rests.has(x));
      const pairs = perfectMatchingOn8(active, ri, opponentCounts);
      for (const [a, b] of pairs) {
        const k = pairKey(a, b);
        opponentCounts[k] = (opponentCounts[k] || 0) + 1;
      }
      schedule.push({ round: ri, pairs });
    }
    schedule.meta = { mode: normalizedMode, n };
    return schedule;
  }

  if (normalizedMode === 'MF') {
    if (m !== w) throw new Error('thaiGenerateSchedule: for MF mode men and women must be equal');
    const n = m;
    if (![8, 10].includes(n)) throw new Error('thaiGenerateSchedule: only 8 or 10 supported for now');

    if (n === 8) {
      // Perfect matchings between men and women: (i -> (i+ri) mod 8) for ri=0..3
      const menIdx = Array.from({ length: 8 }, (_, i) => i);
      const womenIdx = Array.from({ length: 8 }, (_, i) => i);
      const rounds = 4;
      const schedule = [];
      for (let ri = 0; ri < rounds; ri++) {
        const pairs = menIdx.map(i => [i, (i + ri) % 8]);
        schedule.push({ round: ri, pairs });
      }
      schedule.meta = { mode: normalizedMode, n };
      return schedule;
    }

    // n === 10: active 8 men + 8 women each tour, rest partition deterministic by seed
    const allMen = Array.from({ length: 10 }, (_, i) => i);
    const allWomen = Array.from({ length: 10 }, (_, i) => i);
    const shuffledMen = shuffleDet(allMen, rand);
    const shuffledWomen = shuffleDet(allWomen, rand);

    const restPairsMen = [];
    for (let i = 0; i < 10; i += 2) restPairsMen.push([shuffledMen[i], shuffledMen[i + 1]]);
    const restPairsWomen = [];
    for (let i = 0; i < 10; i += 2) restPairsWomen.push([shuffledWomen[i], shuffledWomen[i + 1]]);

    const schedule = [];
    for (let ri = 0; ri < 5; ri++) {
      const restMen = new Set(restPairsMen[ri]);
      const restWomen = new Set(restPairsWomen[ri]);
      const activeMen = allMen.filter(x => !restMen.has(x));
      const activeWomen = allWomen.filter(x => !restWomen.has(x));
      // deterministic cyclic shift pairing
      const pairs = activeMen.map((mi, k) => [mi, activeWomen[(k + ri) % 8]]);
      schedule.push({ round: ri, pairs });
    }
    schedule.meta = { mode: normalizedMode, n };
    return schedule;
  }

  throw new Error(`thaiGenerateSchedule: unknown mode=${mode}`);
}

export function thaiValidateSchedule(schedule, allPlayers) {
  const sch = schedule || [];
  if (!Array.isArray(sch)) return { valid: false, errors: ['schedule must be an array'] };

  // Detect mode from shape (pairs size / tuple structure).
  // If each pair is [manIdx, womanIdx] and mode MF is implied by bipartite sizes.
  const firstRound = sch[0];
  const pairs = firstRound?.pairs;
  if (!Array.isArray(pairs)) return { valid: false, errors: ['schedule.round.pairs missing'] };

  // We validate degree/rest invariants from roadmap.
  // Determine expected N by scanning indices.
  const idsA = new Set();
  const idsB = new Set();
  for (const tour of sch) {
    for (const pair of tour.pairs || []) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      idsA.add(pair[0]);
      idsB.add(pair[1]);
    }
  }

  const aCount = idsA.size;
  const bCount = idsB.size;

  const pairsPerRound = Array.isArray(pairs) ? pairs.length : 0;
  // In our generator:
  // - pairwise modes (MM/WW): 4 pairs per round (N=8/10 always yields 8 active players -> 4 matches)
  // - MF mode (bipartite): 8 pairs per round (active 8 men -> 8 bipartite matches)
  const isBipartite = pairsPerRound === 8;

  // Determine target N and expected rounds based on invariant: N=8 -> 4 rounds, N=10 -> 5 rounds.
  const n = isBipartite ? Math.max(aCount, bCount) : new Set([...idsA, ...idsB]).size;
  const expectedRounds = n === 8 ? 4 : n === 10 ? 5 : null;
  const expectedRest = n === 8 ? 0 : n === 10 ? 1 : null;
  const expectedMatchesPerPlayer = 4;

  const errors = [];
  if (expectedRounds == null) errors.push('unsupported participant count (expected 8 or 10)');
  if (sch.length !== expectedRounds) errors.push(`expected ${expectedRounds} rounds, got ${sch.length}`);

  // Count appearances
  if (isBipartite) {
    const menAppear = {};
    const womenAppear = {};
    for (const tour of sch) {
      for (const [mi, wi] of tour.pairs || []) {
        menAppear[mi] = (menAppear[mi] || 0) + 1;
        womenAppear[wi] = (womenAppear[wi] || 0) + 1;
      }
    }
    // Degree checks: each player appears exactly 4 times.
    for (const id of idsA) {
      const cnt = menAppear[id] || 0;
      if (cnt !== expectedMatchesPerPlayer) errors.push(`men player ${id} matches=${cnt}, expected=4`);
    }
    for (const id of idsB) {
      const cnt = womenAppear[id] || 0;
      if (cnt !== expectedMatchesPerPlayer) errors.push(`women player ${id} matches=${cnt}, expected=4`);
    }

    // Rest checks: rest = expectedRounds - matches.
    for (const id of idsA) {
      const rest = expectedRounds - (menAppear[id] || 0);
      if (rest !== expectedRest) errors.push(`men player ${id} rest=${rest}, expected=${expectedRest}`);
    }
    for (const id of idsB) {
      const rest = expectedRounds - (womenAppear[id] || 0);
      if (rest !== expectedRest) errors.push(`women player ${id} rest=${rest}, expected=${expectedRest}`);
    }

    // Validate tour sizes: for N=8 should have 8 pairs per round, for N=10 should have 8 pairs per round
    for (const tour of sch) {
      const len = (tour.pairs || []).length;
      if (len !== 8) errors.push(`round ${tour.round} expected 8 bipartite pairs, got ${len}`);
    }
  } else {
    // Pairwise: players are both sides, edges are between indices in the same pool.
    const appear = {};
    for (const tour of sch) {
      for (const [a, b] of tour.pairs || []) {
        appear[a] = (appear[a] || 0) + 1;
        appear[b] = (appear[b] || 0) + 1;
      }
    }
    const idsAll = new Set([...idsA, ...idsB]);
    for (const id of idsAll) {
      const cnt = appear[id] || 0;
      if (cnt !== expectedMatchesPerPlayer) errors.push(`player ${id} matches=${cnt}, expected=4`);
      const rest = expectedRounds - cnt;
      if (rest !== expectedRest) errors.push(`player ${id} rest=${rest}, expected=${expectedRest}`);
    }

    for (const tour of sch) {
      const len = (tour.pairs || []).length;
      // N=8 or N=10 both use 4 pairs per tour in our generator
      if (len !== 4) errors.push(`round ${tour.round} expected 4 pairwise matches, got ${len}`);
    }
  }

  // Validate "exact 4 matches per player" implies all players must appear.
  if (errors.length) return { valid: false, errors };
  return { valid: true, errors: [] };
}

// -------------------- R2 seeding & nominations (minimal stubs) --------------------

export function thaiSeedR2(r1Groups, gender) {
  const players = Array.isArray(r1Groups) ? r1Groups : (r1Groups?.players || []);
  const ppc = r1Groups?.ppc ?? Math.max(1, Math.floor(players.length / 4));
  const zones = [
    { key: 'hard', from: 0, count: ppc },
    { key: 'advance', from: ppc, count: ppc },
    { key: 'medium', from: ppc * 2, count: ppc },
    { key: 'lite', from: ppc * 3, count: players.length - ppc * 3 },
  ];
  return zones
    .filter(z => z.count > 0)
    .map(z => ({ key: z.key, gender: gender || '', players: players.slice(z.from, z.from + z.count) }));
}

export function thaiCalcNominations(r1Stats, r2Stats) {
  const s1 = Array.isArray(r1Stats) ? r1Stats : (r1Stats?.players || []);
  const s2 = Array.isArray(r2Stats) ? r2Stats : (r2Stats?.players || []);
  const all = [...(s1 || []), ...(s2 || [])];

  const pickBest = (arr, key) => {
    let best = null;
    let bestVal = -Infinity;
    for (const x of (arr || [])) {
      if (!x) continue;
      const v = x[key] != null ? Number(x[key]) : -Infinity;
      if (v > bestVal) { bestVal = v; best = x; }
    }
    return best;
  };

  const pickBestByAvgPts = (arr) => {
    let best = null;
    let bestAvg = -Infinity;
    for (const x of (arr || [])) {
      if (!x) continue;
      const pts = x.pts != null ? Number(x.pts) : 0;
      const denom = x.rPlayed != null ? Number(x.rPlayed)
        : (x.matches != null ? Number(x.matches) : 0);
      const avg = denom > 0 ? (pts / denom) : -Infinity;
      if (avg > bestAvg) { bestAvg = avg; best = x; }
    }
    return best;
  };

  const nominations = [];

  const mvpR1 = pickBest(s1, 'pts');
  if (mvpR1) nominations.push({
    id: 'mvp_r1',
    label: 'MVP R1',
    winner: mvpR1,
    stat: { label: 'pts', value: mvpR1.pts != null ? Number(mvpR1.pts) : 0, fmt: 'int' },
  });

  const mvpR2 = pickBest(s2, 'pts');
  if (mvpR2) nominations.push({
    id: 'mvp_r2',
    label: 'MVP R2',
    winner: mvpR2,
    stat: { label: 'pts', value: mvpR2.pts != null ? Number(mvpR2.pts) : 0, fmt: 'int' },
  });

  const bestDiff = pickBest(all, 'diff');
  if (bestDiff) nominations.push({
    id: 'best_diff',
    label: 'Best Diff',
    winner: bestDiff,
    stat: { label: 'diff', value: bestDiff.diff != null ? Number(bestDiff.diff) : 0, fmt: 'intSigned' },
  });

  const bestWins = pickBest(all, 'wins');
  if (bestWins) nominations.push({
    id: 'best_wins',
    label: 'Most Wins',
    winner: bestWins,
    stat: { label: 'wins', value: bestWins.wins != null ? Number(bestWins.wins) : 0, fmt: 'int' },
  });

  const bestK = pickBest(all, 'K');
  if (bestK) nominations.push({
    id: 'best_k',
    label: 'Best K',
    winner: bestK,
    stat: { label: 'K', value: bestK.K != null ? Number(bestK.K) : 0, fmt: 'fixed2' },
  });

  const bestAvgPts = pickBestByAvgPts(all);
  if (bestAvgPts) {
    const pts = bestAvgPts.pts != null ? Number(bestAvgPts.pts) : 0;
    const denom = bestAvgPts.rPlayed != null ? Number(bestAvgPts.rPlayed)
      : (bestAvgPts.matches != null ? Number(bestAvgPts.matches) : 0);
    const avg = denom > 0 ? (pts / denom) : 0;
    nominations.push({
      id: 'best_avg_pts',
      label: 'Best Avg Pts',
      winner: bestAvgPts,
      stat: { label: 'avg pts', value: avg, fmt: 'fixed2' },
    });
  }

  return nominations;
}

// Helpful for browser debugging (scripts loaded into globalThis).
const api = {
  thaiCalcPoints,
  thaiCalcCoef,
  thaiZeroSumMatch,
  thaiZeroSumTour,
  thaiCalcProgress,
  thaiTiebreak,
  thaiCalcStandings,
  thaiGenerateSchedule,
  thaiValidateSchedule,
  thaiSeedR2,
  thaiCalcNominations,
};

try {
  if (typeof globalThis !== 'undefined') Object.assign(globalThis, api);
} catch (_) {}

export default api;

