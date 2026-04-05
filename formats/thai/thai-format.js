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
 *
 * R1 ranking priority for seeding:
 * 1. winPercentage
 * 2. tournament points (2 for win, 1 for non-win)
 * 3. point difference
 * 4. point ratio
 * 5. head-to-head / mini-league inside tied subgroup
 * 6. persisted draw order
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

function _toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function _stableKey(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function _stableCompare(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }
  return _stableKey(a).localeCompare(_stableKey(b), 'ru');
}

function _safeRatio(forPoints, againstPoints) {
  const against = _toFiniteNumber(againstPoints, 0);
  if (against === 0) return Infinity;
  return _toFiniteNumber(forPoints, 0) / against;
}

function _numbersEqual(a, b) {
  if (a === b) return true;
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) < EPS;
  return false;
}

function _compareMetricDesc(a, b) {
  if (_numbersEqual(a, b)) return 0;
  if (a === Infinity) return -1;
  if (b === Infinity) return 1;
  return a > b ? -1 : 1;
}

function _playerStableIdx(stat, fallback = 0) {
  const raw = stat?.stableIdx ?? stat?.idx ?? stat?.id ?? fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

function _playerKey(stat, fallback = '') {
  return _stableKey(
    stat?.playerKey ?? stat?.playerId ?? stat?.id ?? stat?.idx ?? fallback
  );
}

function _groupSignature(playerKeys) {
  return [...(playerKeys || [])].map(_stableKey).sort((a, b) => a.localeCompare(b, 'ru')).join('||');
}

function _hashString(value) {
  let hash = 2166136261;
  const text = _stableKey(value);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function _generateDrawOrders(playerKeys, seed) {
  const ordered = [...(playerKeys || [])]
    .map((key) => ({
      key: _stableKey(key),
      hash: _hashString(`${seed}:${_stableKey(key)}`),
    }))
    .sort((a, b) => {
      if (a.hash !== b.hash) return a.hash - b.hash;
      return a.key.localeCompare(b.key, 'ru');
    });

  const orders = {};
  ordered.forEach((entry, index) => {
    orders[entry.key] = index + 1;
  });
  return orders;
}

function _normalizedDrawOrders(existingOrders, playerKeys, seed) {
  const requiredKeys = [...(playerKeys || [])].map(_stableKey);
  if (
    existingOrders &&
    typeof existingOrders === 'object' &&
    requiredKeys.every((key) => Number.isFinite(Number(existingOrders[key])))
  ) {
    return existingOrders;
  }
  return _generateDrawOrders(requiredKeys, seed);
}

function _getWins(stat) {
  return _toFiniteNumber(stat?.wins, 0);
}

function _getMatches(stat) {
  const direct = stat?.matches ?? stat?.rPlayed;
  if (Number.isFinite(Number(direct))) return Number(direct);
  const wins = _getWins(stat);
  const losses = _toFiniteNumber(stat?.losses, 0);
  return wins + losses;
}

function _getTournamentPoints(stat) {
  if (!stat) return 0;
  if (Number.isFinite(Number(stat.points))) return Number(stat.points);
  if (Number.isFinite(Number(stat.tournamentPoints))) return Number(stat.tournamentPoints);
  if (Number.isFinite(Number(stat.pts))) return Number(stat.pts);
  const matches = _getMatches(stat);
  if (matches > 0) {
    const wins = _getWins(stat);
    const nonWins = Math.max(matches - wins, 0);
    return (wins * 2) + nonWins;
  }
  return 0;
}

function _getWinPercentage(stat) {
  if (!stat) return 0;
  if (Number.isFinite(Number(stat.winPercentage))) return Number(stat.winPercentage);
  const matches = _getMatches(stat);
  return matches > 0 ? (_getWins(stat) / matches) : 0;
}

function _getPointDiff(stat) {
  return _toFiniteNumber(stat?.diff, 0);
}

function _getBallsFor(stat) {
  return _toFiniteNumber(stat?.balls ?? stat?.pointsFor, 0);
}

function _getBallsAgainst(stat) {
  if (!stat) return 0;
  if (Number.isFinite(Number(stat.ballsAgainst))) return Number(stat.ballsAgainst);
  if (Number.isFinite(Number(stat.pointsAgainst))) return Number(stat.pointsAgainst);
  if (Number.isFinite(Number(stat.oppBalls))) return Number(stat.oppBalls);
  if (Number.isFinite(Number(stat.against))) return Number(stat.against);
  return _getBallsFor(stat) - _getPointDiff(stat);
}

function _getPointRatio(stat) {
  if (!stat) return 0;
  if (Number.isFinite(Number(stat.pointRatio)) || stat?.pointRatio === Infinity) {
    return stat.pointRatio;
  }
  return _safeRatio(_getBallsFor(stat), _getBallsAgainst(stat));
}

function _comparePrimaryRanking(a, b) {
  const winPctCmp = _compareMetricDesc(_getWinPercentage(a), _getWinPercentage(b));
  if (winPctCmp) return winPctCmp;

  const pointsCmp = _compareMetricDesc(_getTournamentPoints(a), _getTournamentPoints(b));
  if (pointsCmp) return pointsCmp;

  const diffCmp = _compareMetricDesc(_getPointDiff(a), _getPointDiff(b));
  if (diffCmp) return diffCmp;

  const ratioCmp = _compareMetricDesc(_getPointRatio(a), _getPointRatio(b));
  if (ratioCmp) return ratioCmp;

  return 0;
}

function _samePrimaryRanking(a, b) {
  return _comparePrimaryRanking(a, b) === 0;
}

function _compareMiniRanking(a, b) {
  const winPctCmp = _compareMetricDesc(a?.miniWinPercentage ?? 0, b?.miniWinPercentage ?? 0);
  if (winPctCmp) return winPctCmp;

  const diffCmp = _compareMetricDesc(a?.miniPointDiff ?? 0, b?.miniPointDiff ?? 0);
  if (diffCmp) return diffCmp;

  const ratioCmp = _compareMetricDesc(a?.miniPointRatio ?? 0, b?.miniPointRatio ?? 0);
  if (ratioCmp) return ratioCmp;

  return 0;
}

function _sameMiniRanking(a, b) {
  return _compareMiniRanking(a, b) === 0;
}

function _compareStablePlayers(a, b) {
  const stableCmp = _playerStableIdx(a) - _playerStableIdx(b);
  if (stableCmp) return stableCmp;
  return _stableCompare(_playerKey(a), _playerKey(b));
}

function _buildMatchRows(player, ownArr, oppArr, opponentArr, toursCount) {
  const rows = [];
  for (let roundIdx = 0; roundIdx < toursCount; roundIdx++) {
    const ownVal = ownArr?.[roundIdx];
    const oppVal = oppArr?.[roundIdx];
    const ownNum = ownVal === null || ownVal === undefined ? null : Number(ownVal);
    const oppNum = oppVal === null || oppVal === undefined ? null : Number(oppVal);
    if (ownNum === null || oppNum === null || !Number.isFinite(ownNum) || !Number.isFinite(oppNum)) continue;

    const opponentKey = _stableKey(opponentArr?.[roundIdx]);
    rows.push({
      roundIdx,
      opponentKey,
      own: ownNum,
      opp: oppNum,
      diff: ownNum - oppNum,
    });
  }
  return rows;
}

function _normalizeScorePlayer(player, index, group) {
  const players = Array.isArray(group?.players) ? group.players : null;
  const ownScores = Array.isArray(group?.ownScores) ? group.ownScores : null;
  const oppScores = Array.isArray(group?.oppScores) ? group.oppScores : null;
  const opponents = Array.isArray(group?.opponents) ? group.opponents : null;
  const playerKeys = Array.isArray(group?.playerKeys) ? group.playerKeys : null;

  const source = player ?? { idx: index, own: ownScores?.[index], opp: oppScores?.[index] };
  const ownArr = source.own ?? ownScores?.[index] ?? [];
  const oppArr = source.opp ?? oppScores?.[index] ?? [];
  const opponentArr = source.opponents ?? opponents?.[index] ?? [];
  const toursCount = Math.max(ownArr?.length ?? 0, oppArr?.length ?? 0, opponentArr?.length ?? 0);

  let wins = 0;
  let losses = 0;
  let thaiPts = 0;
  let balls = 0;
  let ballsAgainst = 0;
  let bestRound = 0;
  let rPlayed = 0;

  const matchRows = _buildMatchRows(source, ownArr, oppArr, opponentArr, toursCount);
  for (const row of matchRows) {
    if (row.own > bestRound) bestRound = row.own;
    balls += row.own;
    ballsAgainst += row.opp;
    thaiPts += thaiCalcPoints(row.diff);
    if (row.diff > 0) wins++;
    else losses++;
    rPlayed++;
  }

  const diff = balls - ballsAgainst;
  const points = (wins * 2) + losses;
  return {
    idx: source.idx ?? source.id ?? index,
    stableIdx: _playerStableIdx(source, index),
    playerKey: _stableKey(playerKeys?.[index] ?? source.playerKey ?? source.playerId ?? source.id ?? source.idx ?? index),
    points,
    pts: points,
    thaiPts,
    diff,
    wins,
    losses,
    balls,
    ballsAgainst,
    bestRound,
    rPlayed,
    matches: rPlayed,
    winPercentage: rPlayed > 0 ? (wins / rPlayed) : 0,
    pointRatio: _safeRatio(balls, ballsAgainst),
    K: thaiCalcK(diff),
    _matches: matchRows,
  };
}

function _normalizeAggregatePlayer(player, index) {
  const wins = _getWins(player);
  const matches = _getMatches(player);
  const losses = Number.isFinite(Number(player?.losses)) ? Number(player.losses) : Math.max(matches - wins, 0);
  const balls = _getBallsFor(player);
  const diff = _getPointDiff(player);
  const ballsAgainst = _getBallsAgainst(player);
  const points = _getTournamentPoints(player);

  return {
    ...player,
    idx: player?.idx ?? player?.id ?? index,
    stableIdx: _playerStableIdx(player, index),
    playerKey: _stableKey(player?.playerKey ?? player?.playerId ?? player?.id ?? player?.idx ?? index),
    points,
    pts: points,
    thaiPts: Number.isFinite(Number(player?.thaiPts ?? player?.matchPts)) ? Number(player?.thaiPts ?? player?.matchPts) : points,
    diff,
    wins,
    losses,
    balls,
    ballsAgainst,
    bestRound: _toFiniteNumber(player?.bestRound, 0),
    rPlayed: matches,
    matches,
    winPercentage: _getWinPercentage(player),
    pointRatio: _getPointRatio(player),
    K: Number.isFinite(Number(player?.K ?? player?.coef)) ? Number(player?.K ?? player?.coef) : thaiCalcK(diff),
    _matches: Array.isArray(player?._matches) ? player._matches : [],
  };
}

function _buildMiniStats(player, groupKeySet) {
  const rows = Array.isArray(player?._matches) ? player._matches : [];
  let wins = 0;
  let matches = 0;
  let ballsFor = 0;
  let ballsAgainst = 0;

  for (const row of rows) {
    if (!groupKeySet.has(_stableKey(row.opponentKey))) continue;
    ballsFor += _toFiniteNumber(row.own, 0);
    ballsAgainst += _toFiniteNumber(row.opp, 0);
    if (_toFiniteNumber(row.diff, 0) > 0) wins++;
    matches++;
  }

  return {
    miniMatches: matches,
    miniWins: wins,
    miniBallsFor: ballsFor,
    miniBallsAgainst: ballsAgainst,
    miniPointDiff: ballsFor - ballsAgainst,
    miniPointRatio: _safeRatio(ballsFor, ballsAgainst),
    miniWinPercentage: matches > 0 ? (wins / matches) : 0,
  };
}

function _resolveDraw(players, group, stage, logs, generatedDrawGroups) {
  const keys = players.map((player) => _playerKey(player));
  const signature = _groupSignature(keys);
  const drawGroupKey = `${stage}:${signature}`;
  const drawGroups = group?.drawGroups && typeof group.drawGroups === 'object' ? group.drawGroups : {};
  const drawSeed = _stableKey(group?.drawSeed || 'thai-r1-draw');
  const drawOrders = _normalizedDrawOrders(drawGroups[drawGroupKey], keys, `${drawSeed}:${drawGroupKey}`);

  generatedDrawGroups[drawGroupKey] = drawOrders;
  logs.push({
    type: 'draw',
    groupKey: drawGroupKey,
    players: [...keys],
  });

  return [...players]
    .map((player) => ({
      ...player,
      tiebreakerOrder: _toFiniteNumber(drawOrders[_playerKey(player)], Number.MAX_SAFE_INTEGER),
      tieResolvedBy: 'draw',
    }))
    .sort((a, b) => {
      const orderCmp = _toFiniteNumber(a.tiebreakerOrder, Number.MAX_SAFE_INTEGER) - _toFiniteNumber(b.tiebreakerOrder, Number.MAX_SAFE_INTEGER);
      if (orderCmp) return orderCmp;
      return _compareStablePlayers(a, b);
    });
}

function _resolvePrimaryTieGroup(players, group, logs, generatedDrawGroups) {
  if (players.length <= 1) return players;

  const tiedKeys = new Set(players.map((player) => _playerKey(player)));
  const withMini = players.map((player) => ({
    ...player,
    ..._buildMiniStats(player, tiedKeys),
  }));

  if (withMini.length >= 3) {
    logs.push({
      type: 'mini_league',
      groupKey: `mini:${_groupSignature([...tiedKeys])}`,
      players: [...tiedKeys],
    });

    const miniSorted = [...withMini].sort((a, b) => {
      const miniCmp = _compareMiniRanking(a, b);
      if (miniCmp) return miniCmp;
      return _compareStablePlayers(a, b);
    });

    const resolved = [];
    for (let start = 0; start < miniSorted.length; ) {
      let end = start + 1;
      while (end < miniSorted.length && _sameMiniRanking(miniSorted[start], miniSorted[end])) end++;
      const slice = miniSorted.slice(start, end);
      if (slice.length === 1) {
        resolved.push(slice[0]);
      } else {
        resolved.push(..._resolveDraw(slice, group, 'mini-draw', logs, generatedDrawGroups));
      }
      start = end;
    }
    return resolved;
  }

  const directCmp = _compareMiniRanking(withMini[0], withMini[1]);
  if (directCmp) {
    logs.push({
      type: 'head_to_head',
      groupKey: `h2h:${_groupSignature([...tiedKeys])}`,
      players: [...tiedKeys],
    });
    return [...withMini].sort((a, b) => {
      const cmp = _compareMiniRanking(a, b);
      if (cmp) return cmp;
      return _compareStablePlayers(a, b);
    });
  }

  return _resolveDraw(withMini, group, 'head-to-head-draw', logs, generatedDrawGroups);
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
 * Comparator for precomputed Thai R1 standings.
 * Uses primary ranking criteria only; subgroup H2H requires full standings context.
 */
export function thaiTiebreak(a, b) {
  const primaryCmp = _comparePrimaryRanking(a, b);
  if (primaryCmp) return primaryCmp;

  const drawA = Number(a?.tiebreakerOrder);
  const drawB = Number(b?.tiebreakerOrder);
  if (Number.isFinite(drawA) && Number.isFinite(drawB) && drawA !== drawB) {
    return drawA - drawB;
  }

  return _compareStablePlayers(a, b);
}

/**
 * Compute ThaiVolley32 standings for a group.
 *
 * Supported group shapes:
 * 1) { players: [{ idx, own:number[], opp:number[], opponents?:string[] }, ...] }
 * 2) {
 *      ownScores:(number|null)[][],
 *      oppScores:(number|null)[][],
 *      opponents?: (string|number|null)[][],
 *      playerKeys?: (string|number)[],
 *      drawGroups?: Record<string, Record<string, number>>,
 *      drawSeed?: string
 *    }
 * 3) Legacy/aggregates: group.players as array of ranking rows (best effort normalize)
 */
export function thaiCalcStandings(group) {
  const g = group || {};
  const players = Array.isArray(g.players) ? g.players : null;
  const ownScores = Array.isArray(g.ownScores) ? g.ownScores : null;
  const oppScores = Array.isArray(g.oppScores) ? g.oppScores : null;

  if (!players && !ownScores) return [];

  const isAggregatePlayers =
    !!players?.length &&
    players[0]?.own === undefined &&
    players[0]?.opp === undefined;

  const basePlayers = isAggregatePlayers
    ? players.map((player, index) => _normalizeAggregatePlayer(player, index))
    : (() => {
        const pCount = players ? players.length : (ownScores ? ownScores.length : 0);
        const normalized = [];
        for (let index = 0; index < pCount; index++) {
          normalized.push(_normalizeScorePlayer(players ? players[index] : null, index, g));
        }
        return normalized;
      })();

  const primarySorted = [...basePlayers].sort((a, b) => {
    const primaryCmp = _comparePrimaryRanking(a, b);
    if (primaryCmp) return primaryCmp;
    return _compareStablePlayers(a, b);
  });

  const logs = [];
  const generatedDrawGroups = {};
  const resolved = [];

  for (let start = 0; start < primarySorted.length; ) {
    let end = start + 1;
    while (end < primarySorted.length && _samePrimaryRanking(primarySorted[start], primarySorted[end])) end++;

    const tieGroup = primarySorted.slice(start, end);
    if (tieGroup.length === 1) {
      resolved.push(tieGroup[0]);
    } else {
      resolved.push(..._resolvePrimaryTieGroup(tieGroup, g, logs, generatedDrawGroups));
    }
    start = end;
  }

  resolved.forEach((player, index) => {
    player.place = index + 1;
    player.tied = false;
    delete player._matches;
  });

  resolved.meta = {
    logs,
    drawGroups: generatedDrawGroups,
  };
  return resolved;
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

function perfectMatchingOnK(indices, roundNo, opponentCounts, pairsCount) {
  // Deterministic "better than random" matching for an even-length set of players.
  // Try different rotations of the index order and pick the first with 0 repeats;
  // otherwise pick the rotation that minimizes total repeat edge counts.
  const base = [...indices];
  const len = base.length;
  const halfLen = Math.floor(len / 2);
  const maxPairs = pairsCount != null ? pairsCount : halfLen;
  let bestPairs = null;
  let bestScore = Infinity;
  for (let rot = 0; rot < len; rot++) {
    const order = base.slice(rot).concat(base.slice(0, rot));
    const allPairs = [];
    for (let i = 0; i < halfLen; i++) {
      allPairs.push([order[i], order[len - 1 - i]]);
    }

    let pairs;
    if (maxPairs < halfLen) {
      // Score each pair individually and pick the best maxPairs
      const scored = allPairs.map(([a, b]) => ({
        pair: [a, b],
        score: opponentCounts[pairKey(a, b)] || 0,
      }));
      scored.sort((x, y) => x.score - y.score);
      pairs = scored.slice(0, maxPairs).map(s => s.pair);
    } else {
      pairs = allPairs;
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

function perfectMatchingOn8(indices, roundNo, opponentCounts) {
  return perfectMatchingOnK(indices, roundNo, opponentCounts, 4);
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

export function thaiGenerateSchedule({ men, women, mode, seed, courts, tours } = {}) {
  const m = Number(men);
  const w = Number(women);
  const sd = seed ?? 1;
  const rand = createRng(sd);

  if (!mode) throw new Error('thaiGenerateSchedule: mode is required');

  const normalizedMode = String(mode).toUpperCase();
  const isDualPoolMode = normalizedMode === 'MF' || normalizedMode === 'MN';

  // Determine whether custom courts/tours were explicitly provided
  const customCT = courts != null && tours != null;

  if (normalizedMode === 'MM' || normalizedMode === 'WM' || normalizedMode === 'WW') {
    const n = normalizedMode === 'MM' ? m : w;

    // --- Legacy code path (exact output preservation) ---
    if (!customCT) {
      if (![8, 10].includes(n)) throw new Error('thaiGenerateSchedule: only 8 or 10 supported for now');

      if (n === 8) {
        const players = Array.from({ length: 8 }, (_, i) => i);
        const rounds = roundRobinPerfectMatchingPairs(players).slice(0, 4);
        const res = rounds.map((pairs, ri) => ({ round: ri, pairs }));
        res.meta = { mode: normalizedMode, n, courts: 4, tours: 4 };
        return res;
      }

      // n === 10: we want each player to have exactly 4 matches, rest 1.
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
      schedule.meta = { mode: normalizedMode, n, courts: 4, tours: 5 };
      return schedule;
    }

    // --- Generalized code path (custom courts/tours) ---
    const ct = Number(courts);
    const tr = Number(tours);
    if (n < ct * 2) throw new Error(`thaiGenerateSchedule: n=${n} must be >= courts*2=${ct * 2}`);
    if (n < 2 || n % 2 !== 0) throw new Error(`thaiGenerateSchedule: n=${n} must be even and >= 2`);

    const active = ct * 2; // players active per tour
    const all = Array.from({ length: n }, (_, i) => i);

    if (active === n) {
      // No rest needed — everyone plays every tour
      const opponentCounts = {};
      const schedule = [];
      if (ct === n / 2) {
        // Full perfect matching (all players paired)
        const rrRounds = roundRobinPerfectMatchingPairs(all).slice(0, tr);
        for (let ri = 0; ri < tr; ri++) {
          const pairs = rrRounds[ri] || [];
          schedule.push({ round: ri, pairs });
          for (const [a, b] of pairs) {
            const k = pairKey(a, b);
            opponentCounts[k] = (opponentCounts[k] || 0) + 1;
          }
        }
      } else {
        // active === n but courts < n/2: pick subset of pairs from full matching
        for (let ri = 0; ri < tr; ri++) {
          const pairs = perfectMatchingOnK(all, ri, opponentCounts, ct);
          for (const [a, b] of pairs) {
            const k = pairKey(a, b);
            opponentCounts[k] = (opponentCounts[k] || 0) + 1;
          }
          schedule.push({ round: ri, pairs });
        }
      }
      schedule.meta = { mode: normalizedMode, n, courts: ct, tours: tr };
      return schedule;
    }

    // Rest partition: distribute rests balanced across tours
    const restPerTour = n - active;
    const restSchedule = _buildRestPartition(n, tr, restPerTour, rand);

    const opponentCounts = {};
    const schedule = [];
    for (let ri = 0; ri < tr; ri++) {
      const rests = new Set(restSchedule[ri]);
      const activePlayers = all.filter(x => !rests.has(x));
      const pairs = perfectMatchingOnK(activePlayers, ri, opponentCounts, ct);
      for (const [a, b] of pairs) {
        const k = pairKey(a, b);
        opponentCounts[k] = (opponentCounts[k] || 0) + 1;
      }
      schedule.push({ round: ri, pairs });
    }
    schedule.meta = { mode: normalizedMode, n, courts: ct, tours: tr };
    return schedule;
  }

  if (isDualPoolMode) {
    if (m !== w) throw new Error(`thaiGenerateSchedule: for ${normalizedMode} mode both pools must be equal`);
    const n = m;

    // --- Legacy code path (exact output preservation) ---
    if (!customCT) {
      if (![8, 10].includes(n)) throw new Error('thaiGenerateSchedule: only 8 or 10 supported for now');

      if (n === 8) {
        const menIdx = Array.from({ length: 8 }, (_, i) => i);
        const rounds = 4;
        const schedule = [];
        for (let ri = 0; ri < rounds; ri++) {
          const pairs = menIdx.map(i => [i, (i + ri) % 8]);
          schedule.push({ round: ri, pairs });
        }
        schedule.meta = { mode: normalizedMode, n, courts: 8, tours: 4 };
        return schedule;
      }

      // n === 10
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
        const pairs = activeMen.map((mi, k) => [mi, activeWomen[(k + ri) % 8]]);
        schedule.push({ round: ri, pairs });
      }
      schedule.meta = { mode: normalizedMode, n, courts: 8, tours: 5 };
      return schedule;
    }

    // --- Generalized code path (custom courts/tours) ---
    const ct = Number(courts);
    const tr = Number(tours);
    if (n < ct) throw new Error(`thaiGenerateSchedule: n=${n} must be >= courts=${ct} for ${normalizedMode}`);

    const allMen = Array.from({ length: n }, (_, i) => i);
    const allWomen = Array.from({ length: n }, (_, i) => i);

    if (ct === n) {
      // No rest — all play every tour
      const schedule = [];
      for (let ri = 0; ri < tr; ri++) {
        const pairs = allMen.map(i => [i, (i + ri) % n]);
        schedule.push({ round: ri, pairs });
      }
      schedule.meta = { mode: normalizedMode, n, courts: ct, tours: tr };
      return schedule;
    }

    // Rest partition for men and women separately
    const restPerTour = n - ct;
    const restScheduleMen = _buildRestPartition(n, tr, restPerTour, rand);
    const restScheduleWomen = _buildRestPartition(n, tr, restPerTour, rand);

    const schedule = [];
    for (let ri = 0; ri < tr; ri++) {
      const restMen = new Set(restScheduleMen[ri]);
      const restWomen = new Set(restScheduleWomen[ri]);
      const activeMen = allMen.filter(x => !restMen.has(x));
      const activeWomen = allWomen.filter(x => !restWomen.has(x));
      const pairs = activeMen.map((mi, k) => [mi, activeWomen[(k + ri) % ct]]);
      schedule.push({ round: ri, pairs });
    }
    schedule.meta = { mode: normalizedMode, n, courts: ct, tours: tr };
    return schedule;
  }

  throw new Error(`thaiGenerateSchedule: unknown mode=${mode}`);
}

/**
 * Build a balanced rest partition: for each of `tours` rounds, select `restPerTour` players
 * to rest, ensuring each player rests roughly the same number of times (balanced ±1).
 * Returns array of arrays, each inner array has the indices resting that tour.
 */
function _buildRestPartition(n, tours, restPerTour, rand) {
  const all = Array.from({ length: n }, (_, i) => i);
  const shuffled = shuffleDet(all, rand);

  // Total rest slots = tours * restPerTour; each player should rest floor or ceil of that / n
  const restCounts = new Array(n).fill(0);
  const result = [];

  for (let ri = 0; ri < tours; ri++) {
    // Pick restPerTour players with lowest rest count, breaking ties by shuffled order
    const candidates = all.slice().sort((a, b) => {
      const cntDiff = restCounts[a] - restCounts[b];
      if (cntDiff !== 0) return cntDiff;
      return shuffled.indexOf(a) - shuffled.indexOf(b);
    });
    const resting = candidates.slice(0, restPerTour);
    for (const idx of resting) restCounts[idx]++;
    result.push(resting);
  }
  return result;
}

export function thaiValidateSchedule(schedule, allPlayers) {
  const sch = schedule || [];
  if (!Array.isArray(sch)) return { valid: false, errors: ['schedule must be an array'] };

  const firstRound = sch[0];
  const pairs = firstRound?.pairs;
  if (!Array.isArray(pairs)) return { valid: false, errors: ['schedule.round.pairs missing'] };

  // Scan all indices
  const idsA = new Set();
  const idsB = new Set();
  for (const tour of sch) {
    for (const pair of tour.pairs || []) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      idsA.add(pair[0]);
      idsB.add(pair[1]);
    }
  }

  const meta = sch.meta;
  const hasMeta = meta && meta.courts != null && meta.tours != null;

  // --- New meta-based validation path ---
  if (hasMeta) {
    const errors = [];
    const metaCourts = Number(meta.courts);
    const metaTours = Number(meta.tours);
    const metaN = Number(meta.n);
    const metaMode = String(meta.mode || '').toUpperCase();
    const isBipartite = metaMode === 'MF' || metaMode === 'MN';
    const expectedIds = Number.isInteger(metaN) && metaN > 0
      ? Array.from({ length: metaN }, (_, i) => i)
      : [];
    const isValidPlayerId = (id) => Number.isInteger(id) && id >= 0 && id < metaN;

    if (sch.length !== metaTours) {
      errors.push(`expected ${metaTours} rounds, got ${sch.length}`);
    }

    // Validate each tour has exactly meta.courts pairs and no player appears twice
    for (const tour of sch) {
      const tourPairs = tour.pairs || [];
      if (tourPairs.length !== metaCourts) {
        errors.push(`round ${tour.round} expected ${metaCourts} pairs, got ${tourPairs.length}`);
      }
      // No duplicate players within a tour
      if (isBipartite) {
        const seenMen = new Set();
        const seenWomen = new Set();
        for (const [mi, wi] of tourPairs) {
          if (!isValidPlayerId(mi)) errors.push(`round ${tour.round}: man ${mi} out of range 0..${metaN - 1}`);
          if (!isValidPlayerId(wi)) errors.push(`round ${tour.round}: woman ${wi} out of range 0..${metaN - 1}`);
          if (seenMen.has(mi)) errors.push(`round ${tour.round}: man ${mi} appears in 2+ pairs`);
          if (seenWomen.has(wi)) errors.push(`round ${tour.round}: woman ${wi} appears in 2+ pairs`);
          seenMen.add(mi);
          seenWomen.add(wi);
        }
      } else {
        const seen = new Set();
        for (const [a, b] of tourPairs) {
          if (!isValidPlayerId(a)) errors.push(`round ${tour.round}: player ${a} out of range 0..${metaN - 1}`);
          if (!isValidPlayerId(b)) errors.push(`round ${tour.round}: player ${b} out of range 0..${metaN - 1}`);
          if (seen.has(a)) errors.push(`round ${tour.round}: player ${a} appears in 2+ pairs`);
          if (seen.has(b)) errors.push(`round ${tour.round}: player ${b} appears in 2+ pairs`);
          seen.add(a);
          seen.add(b);
        }
      }
    }

    // Validate rest balance
    if (isBipartite) {
      const menAppear = {};
      const womenAppear = {};
      for (const tour of sch) {
        for (const [mi, wi] of tour.pairs || []) {
          menAppear[mi] = (menAppear[mi] || 0) + 1;
          womenAppear[wi] = (womenAppear[wi] || 0) + 1;
        }
      }
      const totalRestSlots = metaTours * (metaN - metaCourts);
      const maxRest = Math.ceil(totalRestSlots / metaN);
      for (const id of expectedIds) {
        const rest = metaTours - (menAppear[id] || 0);
        if (rest > maxRest) errors.push(`men player ${id} rest=${rest}, max allowed=${maxRest}`);
      }
      for (const id of expectedIds) {
        const rest = metaTours - (womenAppear[id] || 0);
        if (rest > maxRest) errors.push(`women player ${id} rest=${rest}, max allowed=${maxRest}`);
      }
    } else {
      const appear = {};
      for (const tour of sch) {
        for (const [a, b] of tour.pairs || []) {
          appear[a] = (appear[a] || 0) + 1;
          appear[b] = (appear[b] || 0) + 1;
        }
      }
      const active = metaCourts * 2;
      const totalRestSlots = metaTours * (metaN - active);
      const maxRest = metaN > 0 ? Math.ceil(totalRestSlots / metaN) : 0;
      for (const id of expectedIds) {
        const rest = metaTours - (appear[id] || 0);
        if (rest > maxRest) errors.push(`player ${id} rest=${rest}, max allowed=${maxRest}`);
      }
    }

    if (errors.length) return { valid: false, errors };
    return { valid: true, errors: [] };
  }

  // --- Backward compat: legacy validation (no meta.courts/tours) ---
  const aCount = idsA.size;
  const bCount = idsB.size;
  const pairsPerRound = Array.isArray(pairs) ? pairs.length : 0;
  const isBipartite = pairsPerRound === 8;

  const n = isBipartite ? Math.max(aCount, bCount) : new Set([...idsA, ...idsB]).size;
  const expectedRounds = n === 8 ? 4 : n === 10 ? 5 : null;
  const expectedRest = n === 8 ? 0 : n === 10 ? 1 : null;
  const expectedMatchesPerPlayer = 4;

  const errors = [];
  if (expectedRounds == null) errors.push('unsupported participant count (expected 8 or 10)');
  if (sch.length !== expectedRounds) errors.push(`expected ${expectedRounds} rounds, got ${sch.length}`);

  if (isBipartite) {
    const menAppear = {};
    const womenAppear = {};
    for (const tour of sch) {
      for (const [mi, wi] of tour.pairs || []) {
        menAppear[mi] = (menAppear[mi] || 0) + 1;
        womenAppear[wi] = (womenAppear[wi] || 0) + 1;
      }
    }
    for (const id of idsA) {
      const cnt = menAppear[id] || 0;
      if (cnt !== expectedMatchesPerPlayer) errors.push(`men player ${id} matches=${cnt}, expected=4`);
    }
    for (const id of idsB) {
      const cnt = womenAppear[id] || 0;
      if (cnt !== expectedMatchesPerPlayer) errors.push(`women player ${id} matches=${cnt}, expected=4`);
    }
    for (const id of idsA) {
      const rest = expectedRounds - (menAppear[id] || 0);
      if (rest !== expectedRest) errors.push(`men player ${id} rest=${rest}, expected=${expectedRest}`);
    }
    for (const id of idsB) {
      const rest = expectedRounds - (womenAppear[id] || 0);
      if (rest !== expectedRest) errors.push(`women player ${id} rest=${rest}, expected=${expectedRest}`);
    }
    for (const tour of sch) {
      const len = (tour.pairs || []).length;
      if (len !== 8) errors.push(`round ${tour.round} expected 8 bipartite pairs, got ${len}`);
    }
  } else {
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
      if (len !== 4) errors.push(`round ${tour.round} expected 4 pairwise matches, got ${len}`);
    }
  }

  if (errors.length) return { valid: false, errors };
  return { valid: true, errors: [] };
}

// -------------------- R2 seeding & nominations (minimal stubs) --------------------

export function thaiSeedR2(r1Groups, gender) {
  const players = Array.isArray(r1Groups) ? r1Groups : (r1Groups?.players || []);
  const zoneCount = Math.min(4, Math.max(1, Math.floor(players.length / 2)));
  const ZONE_KEYS_BY_COUNT = {
    4: ['hard', 'advance', 'medium', 'lite'],
    3: ['hard', 'medium', 'lite'],
    2: ['top', 'bottom'],
    1: ['all'],
  };
  const zoneKeys = ZONE_KEYS_BY_COUNT[zoneCount] || ['all'];
  const ppc = r1Groups?.ppc ?? Math.max(1, Math.ceil(players.length / zoneCount));
  const zones = zoneKeys.map((key, i) => {
    const from = i * ppc;
    const count = i === zoneKeys.length - 1 ? players.length - from : ppc;
    return { key, from, count };
  });
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
