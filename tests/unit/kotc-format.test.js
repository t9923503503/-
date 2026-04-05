import { describe, test, expect } from 'vitest';

import {
  kotcPartnerW,
  kotcPartnerM,
  kotcDivPartnerW,
  kotcDivPartnerM,
  kotcMatchupsR1,
  kotcOppIdxR1,
  kotcManRounds,
  kotcWomanRounds,
  kotcRankCourt,
  kotcRankAll,
  kotcRankDivision,
  kotcSeedDivisions,
  kotcActiveDivKeys,
  kotcMakeBlankScores,
  kotcMakeBlankDivScores,
  kotcMakeBlankDivRoster,
  kotcCalculateRanking,
  kotcGetPlayerZone,
  kotcDivisionToType,
  thaiCalcPoints,
  thaiCalcCoef,
  COURT_META,
  DIV_KEYS,
  POINTS_TABLE,
} from '../../formats/kotc/kotc-format.js';

// ── Partner rotation ───────────────────────────────────────

describe('kotcPartnerW / kotcPartnerM', () => {
  test('rotating mode: woman = (mi + ri) % ppc', () => {
    expect(kotcPartnerW(0, 0, 4, false)).toBe(0);
    expect(kotcPartnerW(0, 1, 4, false)).toBe(1);
    expect(kotcPartnerW(2, 3, 4, false)).toBe(1); // (2+3)%4=1
    expect(kotcPartnerW(3, 3, 4, false)).toBe(2); // (3+3)%4=2
  });

  test('fixed mode: woman = mi', () => {
    expect(kotcPartnerW(2, 3, 4, true)).toBe(2);
    expect(kotcPartnerW(0, 1, 4, true)).toBe(0);
  });

  test('partnerM is inverse of partnerW', () => {
    for (let mi = 0; mi < 4; mi++) {
      for (let ri = 0; ri < 4; ri++) {
        const wi = kotcPartnerW(mi, ri, 4, false);
        expect(kotcPartnerM(wi, ri, 4, false)).toBe(mi);
      }
    }
  });

  test('partnerM inverse holds for fixed pairs', () => {
    for (let mi = 0; mi < 4; mi++) {
      for (let ri = 0; ri < 4; ri++) {
        const wi = kotcPartnerW(mi, ri, 4, true);
        expect(kotcPartnerM(wi, ri, 4, true)).toBe(mi);
      }
    }
  });
});

describe('kotcDivPartnerW / kotcDivPartnerM', () => {
  test('division rotation is invertible', () => {
    const Nd = 5;
    for (let mi = 0; mi < Nd; mi++) {
      for (let ri = 0; ri < Nd; ri++) {
        const wi = kotcDivPartnerW(mi, ri, Nd);
        expect(kotcDivPartnerM(wi, ri, Nd)).toBe(mi);
      }
    }
  });
});

// ── Matchups ───────────────────────────────────────────────

describe('kotcMatchupsR1', () => {
  test('returns 2 pairs per round for ppc=4', () => {
    for (let ri = 0; ri < 4; ri++) {
      const pairs = kotcMatchupsR1(ri, 4);
      expect(pairs).toHaveLength(2);
      // Each pair has 2 indices
      pairs.forEach(([a, b]) => {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(a).not.toBe(b);
      });
    }
  });

  test('all 4 players appear exactly once per round', () => {
    for (let ri = 0; ri < 4; ri++) {
      const pairs = kotcMatchupsR1(ri, 4);
      const all = pairs.flat();
      expect(all.sort()).toEqual([0, 1, 2, 3]);
    }
  });

  test('returns empty for non-standard ppc', () => {
    expect(kotcMatchupsR1(0, 3)).toEqual([]);
    expect(kotcMatchupsR1(0, 6)).toEqual([]);
  });

  test('round 0: [0,1] vs [2,3]', () => {
    expect(kotcMatchupsR1(0, 4)).toEqual([[0, 1], [2, 3]]);
  });

  test('round 1: [0,2] vs [1,3]', () => {
    expect(kotcMatchupsR1(1, 4)).toEqual([[0, 2], [1, 3]]);
  });
});

describe('kotcOppIdxR1', () => {
  test('finds opponent correctly', () => {
    // Round 0: 0 vs 1, 2 vs 3
    expect(kotcOppIdxR1(0, 0, 4)).toBe(1);
    expect(kotcOppIdxR1(1, 0, 4)).toBe(0);
    expect(kotcOppIdxR1(2, 0, 4)).toBe(3);
    expect(kotcOppIdxR1(3, 0, 4)).toBe(2);
  });

  test('opponent lookup is symmetric', () => {
    for (let ri = 0; ri < 4; ri++) {
      for (let mi = 0; mi < 4; mi++) {
        const opp = kotcOppIdxR1(mi, ri, 4);
        expect(kotcOppIdxR1(opp, ri, 4)).toBe(mi);
      }
    }
  });
});

// ── Score round helpers ────────────────────────────────────

describe('kotcManRounds / kotcWomanRounds', () => {
  const scores = kotcMakeBlankScores(4, 4);
  scores[0][0][0] = 21; // court 0, man 0, round 0
  scores[0][1][0] = 15; // court 0, man 1, round 0
  scores[0][2][1] = 18; // court 0, man 2, round 1

  test('manRounds returns correct values', () => {
    const rounds = kotcManRounds(scores, 0, 0, 4);
    expect(rounds).toEqual([21, null, null, null]);
  });

  test('womanRounds uses partnerM to lookup', () => {
    // Woman 0 at round 0: partnerM(0,0)=0, so score = scores[0][0][0] = 21
    const rounds = kotcWomanRounds(scores, 0, 0, 4, false);
    expect(rounds[0]).toBe(21);
  });
});

// ── Ranking ────────────────────────────────────────────────

describe('kotcRankCourt', () => {
  test('ranks by wins → diff → pts → K → balls', () => {
    // Set up scores where player 0 clearly wins
    const scores = kotcMakeBlankScores(4, 4);
    // Round 0: 0 vs 1 → 0 wins 21-10, 2 vs 3 → 2 wins 15-12
    scores[0][0][0] = 21; scores[0][1][0] = 10;
    scores[0][2][0] = 15; scores[0][3][0] = 12;
    // Round 1: 0 vs 2 → 0 wins 18-14, 1 vs 3 → 1 wins 16-11
    scores[0][0][1] = 18; scores[0][2][1] = 14;
    scores[0][1][1] = 16; scores[0][3][1] = 11;

    const ranked = kotcRankCourt({ scores, ci: 0, ppc: 4, gender: 'M' });
    expect(ranked).toHaveLength(4);
    // Player 0 should be first (2 wins)
    expect(ranked[0].idx).toBe(0);
    expect(ranked[0].wins).toBe(2);
    expect(ranked[0].place).toBe(1);
  });

  test('handles all null scores gracefully', () => {
    const scores = kotcMakeBlankScores(4, 4);
    const ranked = kotcRankCourt({ scores, ci: 0, ppc: 4, gender: 'M' });
    expect(ranked).toHaveLength(4);
    ranked.forEach(r => {
      expect(r.wins).toBe(0);
      expect(r.diff).toBe(0);
      expect(r.rPlayed).toBe(0);
    });
  });

  test('detects ties correctly', () => {
    const scores = kotcMakeBlankScores(4, 4);
    // All scores identical → all tied
    for (let mi = 0; mi < 4; mi++) {
      for (let ri = 0; ri < 4; ri++) {
        scores[0][mi][ri] = 15;
      }
    }
    const ranked = kotcRankCourt({ scores, ci: 0, ppc: 4, gender: 'M' });
    // All should have place=1
    expect(ranked[0].place).toBe(1);
    expect(ranked[1].tied).toBe(true);
    expect(ranked[1].place).toBe(1);
  });
});

describe('kotcRankAll', () => {
  test('returns M and W rankings', () => {
    const scores = kotcMakeBlankScores(4, 4);
    const courts = [
      { men: ['A', 'B', 'C', 'D'], women: ['E', 'F', 'G', 'H'] },
      { men: ['I', 'J', 'K', 'L'], women: ['M', 'N', 'O', 'P'] },
      { men: ['Q', 'R', 'S', 'T'], women: ['U', 'V', 'W', 'X'] },
      { men: ['Y', 'Z', 'AA', 'BB'], women: ['CC', 'DD', 'EE', 'FF'] },
    ];
    const result = kotcRankAll({ scores, nc: 4, ppc: 4, courts });
    expect(result.M).toHaveLength(16);
    expect(result.W).toHaveLength(16);
  });

  test('assigns global ranks', () => {
    const scores = kotcMakeBlankScores(4, 2);
    // Give court 0, player 0 a clear lead
    scores[0][0][0] = 21; scores[0][1][0] = 5;
    const courts = [
      { men: ['Winner', 'Loser', 'C', 'D'], women: ['a', 'b', 'c', 'd'] },
      { men: ['E', 'F', 'G', 'H'], women: ['e', 'f', 'g', 'h'] },
    ];
    const result = kotcRankAll({ scores, nc: 2, ppc: 4, courts });
    expect(result.M[0].name).toBe('Winner');
    expect(result.M[0].globalRank).toBe(1);
  });
});

describe('kotcRankDivision', () => {
  test('ranks players within a division', () => {
    const divScores = { hard: Array.from({ length: 5 }, () => Array(5).fill(null)) };
    divScores.hard[0][0] = 21;
    divScores.hard[1][0] = 10;
    const divRoster = { hard: { men: ['A', 'B', 'C', 'D'], women: ['E', 'F', 'G', 'H'] } };
    const ranked = kotcRankDivision({ divScores, divRoster, key: 'hard', gender: 'M' });
    expect(ranked).toHaveLength(4);
    expect(ranked[0].name).toBe('A'); // A scored 21 vs B's 10
  });

  test('returns empty for missing division', () => {
    const divScores = {};
    const divRoster = {};
    const ranked = kotcRankDivision({ divScores, divRoster, key: 'hard', gender: 'M' });
    expect(ranked).toEqual([]);
  });
});

// ── Division seeding ───────────────────────────────────────

describe('kotcActiveDivKeys', () => {
  test('nc=1 → [hard]', () => {
    expect(kotcActiveDivKeys(1)).toEqual(['hard']);
  });
  test('nc=2 → [hard, lite]', () => {
    expect(kotcActiveDivKeys(2)).toEqual(['hard', 'lite']);
  });
  test('nc=3 → [hard, medium, lite]', () => {
    expect(kotcActiveDivKeys(3)).toEqual(['hard', 'medium', 'lite']);
  });
  test('nc=4 → all four', () => {
    expect(kotcActiveDivKeys(4)).toEqual(['hard', 'advance', 'medium', 'lite']);
  });
});

describe('kotcSeedDivisions', () => {
  function makeFullScores() {
    // Create scores where court ranking is deterministic
    const scores = kotcMakeBlankScores(4, 4);
    // Court 0: player 0 wins all rounds heavily
    for (let ri = 0; ri < 4; ri++) {
      // Round ri matchups
      const pairs = kotcMatchupsR1(ri, 4);
      for (const [a, b] of pairs) {
        // Higher-indexed player loses
        scores[0][a][ri] = a < b ? 21 : 5;
        scores[0][b][ri] = a < b ? 5 : 21;
      }
    }
    // Courts 1-3: same pattern
    for (let ci = 1; ci < 4; ci++) {
      for (let ri = 0; ri < 4; ri++) {
        const pairs = kotcMatchupsR1(ri, 4);
        for (const [a, b] of pairs) {
          scores[ci][a][ri] = a < b ? 21 : 5;
          scores[ci][b][ri] = a < b ? 5 : 21;
        }
      }
    }
    return scores;
  }

  const courts = [
    { men: ['C0M0', 'C0M1', 'C0M2', 'C0M3'], women: ['C0W0', 'C0W1', 'C0W2', 'C0W3'] },
    { men: ['C1M0', 'C1M1', 'C1M2', 'C1M3'], women: ['C1W0', 'C1W1', 'C1W2', 'C1W3'] },
    { men: ['C2M0', 'C2M1', 'C2M2', 'C2M3'], women: ['C2W0', 'C2W1', 'C2W2', 'C2W3'] },
    { men: ['C3M0', 'C3M1', 'C3M2', 'C3M3'], women: ['C3W0', 'C3W1', 'C3W2', 'C3W3'] },
  ];

  test('produces 4 divisions for nc=4, ppc=4', () => {
    const scores = makeFullScores();
    const seeded = kotcSeedDivisions({ scores, nc: 4, ppc: 4, courts, gender: 'M' });
    expect(Object.keys(seeded)).toEqual(expect.arrayContaining(['hard', 'advance', 'medium', 'lite']));
    expect(seeded.hard).toHaveLength(4);
    expect(seeded.advance).toHaveLength(4);
    expect(seeded.medium).toHaveLength(4);
    expect(seeded.lite).toHaveLength(4);
  });

  test('HARD contains winners from courts 0..2 + best second', () => {
    const scores = makeFullScores();
    const seeded = kotcSeedDivisions({ scores, nc: 4, ppc: 4, courts, gender: 'M' });
    const hardNames = seeded.hard.map(p => p.name);
    // Winners from courts 0,1,2 are idx=0 players
    expect(hardNames).toContain('C0M0');
    expect(hardNames).toContain('C1M0');
    expect(hardNames).toContain('C2M0');
  });

  test('ADVANCE is all from court 4', () => {
    const scores = makeFullScores();
    const seeded = kotcSeedDivisions({ scores, nc: 4, ppc: 4, courts, gender: 'M' });
    const advNames = seeded.advance.map(p => p.name);
    expect(advNames).toContain('C3M0');
    expect(advNames).toContain('C3M1');
    expect(advNames).toContain('C3M2');
    expect(advNames).toContain('C3M3');
  });

  test('fallback slicing for nc≠4', () => {
    const scores = kotcMakeBlankScores(4, 2);
    const smallCourts = courts.slice(0, 2);
    const seeded = kotcSeedDivisions({ scores, nc: 2, ppc: 4, courts: smallCourts, gender: 'M' });
    // nc=2 → [hard, lite], fallback slicing
    expect(seeded.hard.length + seeded.lite.length).toBe(8);
  });
});

// ── Blank state factories ──────────────────────────────────

describe('kotcMakeBlankScores', () => {
  test('creates correct shape', () => {
    const s = kotcMakeBlankScores(4, 4);
    expect(s).toHaveLength(4);
    expect(s[0]).toHaveLength(4);
    expect(s[0][0]).toHaveLength(4);
    expect(s[0][0][0]).toBeNull();
  });
});

describe('kotcMakeBlankDivScores', () => {
  test('creates all 4 division keys', () => {
    const ds = kotcMakeBlankDivScores();
    expect(Object.keys(ds)).toEqual(['hard', 'advance', 'medium', 'lite']);
    expect(ds.hard).toHaveLength(5);
    expect(ds.hard[0]).toHaveLength(5);
    expect(ds.hard[0][0]).toBeNull();
  });
});

describe('kotcMakeBlankDivRoster', () => {
  test('creates all 4 divisions with empty arrays', () => {
    const dr = kotcMakeBlankDivRoster();
    expect(dr.hard.men).toEqual([]);
    expect(dr.hard.women).toEqual([]);
    expect(dr.advance.men).toEqual([]);
  });
});

// ── Rating system ──────────────────────────────────────────

describe('kotcCalculateRanking', () => {
  test('1st place → 100 points', () => {
    expect(kotcCalculateRanking(1)).toBe(100);
  });
  test('10th place → 48 points', () => {
    expect(kotcCalculateRanking(10)).toBe(48);
  });
  test('out of range → 1 point', () => {
    expect(kotcCalculateRanking(0)).toBe(1);
    expect(kotcCalculateRanking(50)).toBe(1);
  });
});

describe('kotcGetPlayerZone', () => {
  test('rank ≤10 → hard', () => {
    expect(kotcGetPlayerZone(1)).toBe('hard');
    expect(kotcGetPlayerZone(10)).toBe('hard');
  });
  test('rank 11-20 → medium', () => {
    expect(kotcGetPlayerZone(11)).toBe('medium');
    expect(kotcGetPlayerZone(20)).toBe('medium');
  });
  test('rank >20 → lite', () => {
    expect(kotcGetPlayerZone(21)).toBe('lite');
    expect(kotcGetPlayerZone(100)).toBe('lite');
  });
});

describe('kotcDivisionToType', () => {
  test('default → M', () => {
    expect(kotcDivisionToType(null)).toBe('M');
    expect(kotcDivisionToType('')).toBe('M');
  });
  test('женский → W', () => {
    expect(kotcDivisionToType('Женский')).toBe('W');
  });
  test('микст → Mix', () => {
    expect(kotcDivisionToType('Микст')).toBe('Mix');
    expect(kotcDivisionToType('Смешанный')).toBe('Mix');
  });
});

// ── Constants ──────────────────────────────────────────────

describe('constants', () => {
  test('COURT_META has 4 entries', () => {
    expect(COURT_META).toHaveLength(4);
  });
  test('DIV_KEYS has 4 entries', () => {
    expect(DIV_KEYS).toEqual(['hard', 'advance', 'medium', 'lite']);
  });
  test('POINTS_TABLE has 40 entries', () => {
    expect(POINTS_TABLE).toHaveLength(40);
    expect(POINTS_TABLE[0]).toBe(100);
    expect(POINTS_TABLE[39]).toBe(1);
  });
});

// ── Re-exported scoring ────────────────────────────────────

describe('re-exported thaiCalcPoints / thaiCalcCoef', () => {
  test('thaiCalcPoints works', () => {
    expect(thaiCalcPoints(7)).toBe(3);
    expect(thaiCalcPoints(0)).toBe(0);
  });
  test('thaiCalcCoef works', () => {
    expect(thaiCalcCoef([0])).toBe(1);
  });
});
