import { describe, expect, it } from 'vitest';
import {
  buildPlayResultStandings,
  generateKingRounds,
  generatePlayMatches,
  getCompetitiveMatches,
  normalizeStructuredPlayResult,
  validateStructuredPlayResult,
} from '../../web/lib/play-result-core';

describe('play result formats', () => {
  it('builds a minimal 2x2 match', () => {
    const matches = generatePlayMatches([1, 2, 3, 4], 'classic_2x2', 'fixed', 1);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ teamA: [1, 2], teamB: [3, 4] });
  });

  it('accepts an extended full score for a classic 2x2 set', () => {
    const matches = generatePlayMatches([1, 2, 3, 4], 'classic_2x2', 'fixed', 1)
      .map((match) => ({ ...match, scoreA: 22, scoreB: 20 }));
    expect(validateStructuredPlayResult({
      version: 2,
      format: 'classic_2x2',
      pairingMode: 'fixed',
      pointLimit: 21,
      matches,
    }, [1, 2, 3, 4])).toBeNull();
  });

  it('accepts a recruited roster rotated through several 2x2 parties', () => {
    const payload = {
      version: 2,
      format: 'classic_2x2',
      pairingMode: 'fixed',
      pointLimit: 21,
      matches: [
        { id: 'party-1', teamA: [1, 2], teamB: [3, 4], scoreA: 21, scoreB: 17 },
        { id: 'party-2', teamA: [1, 5], teamB: [4, 6], scoreA: 18, scoreB: 21 },
      ],
    };
    expect(validateStructuredPlayResult(payload, [1, 2, 3, 4, 5, 6])).toBeNull();
    expect(validateStructuredPlayResult(payload, [1, 2, 3, 4, 5, 6, 7])).toContain('каждый участник');
  });

  it('preserves a 15-point deciding set after two 21-point sets', () => {
    const [base] = generatePlayMatches([1, 2, 3, 4], 'classic_2x2', 'fixed', 1);
    const payload = {
      version: 2,
      format: 'classic_2x2',
      pairingMode: 'fixed',
      pointLimit: 21,
      matches: [
        { ...base, id: 'set-1', scoreA: 21, scoreB: 17 },
        { ...base, id: 'set-2', scoreA: 19, scoreB: 21 },
        { ...base, id: 'set-3', scoreA: 15, scoreB: 12, pointLimit: 15 },
      ],
    };
    const normalized = normalizeStructuredPlayResult(payload);
    expect(normalized?.matches.map((match) => match.pointLimit ?? normalized.pointLimit)).toEqual([21, 21, 15]);
    expect(validateStructuredPlayResult(payload, [1, 2, 3, 4])).toBeNull();
    expect(normalizeStructuredPlayResult({
      ...payload,
      matches: [...payload.matches.slice(0, 2), { ...payload.matches[2], pointLimit: 9 }],
    })).toBeNull();
  });

  it('uses the tournament Thai schedule: four tours and two matches per tour', () => {
    const matches = generatePlayMatches([1, 2, 3, 4, 5, 6, 7, 8], 'thai_8', 'fixed', 1);
    expect(matches).toHaveLength(8);
    expect(new Set(matches.map((match) => match.tourNumber))).toEqual(new Set([1, 2, 3, 4]));
    const appearances = new Map<number, number>();
    for (const match of matches) for (const id of [...match.teamA, ...match.teamB]) appearances.set(id, (appearances.get(id) || 0) + 1);
    expect([...appearances.values()]).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    const teammates = new Set(matches.filter((match) => match.teamA.includes(1) || match.teamB.includes(1)).map((match) => {
      const team = match.teamA.includes(1) ? match.teamA : match.teamB;
      return team.find((id) => id !== 1);
    }));
    expect(teammates.size).toBeGreaterThan(1);
  });

  it('uses tournament KING round count and fixed pairs', () => {
    const rounds = generateKingRounds([1, 2, 3, 4, 5, 6, 7, 8], 'fixed', 7);
    expect(rounds).toHaveLength(4);
    expect(rounds.every((round) => round.pairs.length === 4)).toBe(true);
    expect(rounds.every((round) => round.pairs[0].team.join(',') === '1,2')).toBe(true);
  });

  it('uses the KOTC tournament rotation for changing pairs', () => {
    const rounds = generateKingRounds([1, 2, 3, 4, 5, 6, 7, 8], 'random', 7);
    const teammates = new Set(rounds.map((round) => {
      const pair = round.pairs.find((item) => item.team.includes(rounds[0].pairs[0].team[0]));
      return pair?.team.find((id) => id !== rounds[0].pairs[0].team[0]);
    }));
    expect(teammates.size).toBe(4);
  });

  it('validates KING timer, rounds and 15-point maximum', () => {
    const rounds = generateKingRounds([1, 2, 3, 4, 5, 6, 7, 8], 'fixed', 1).map((round) => ({
      ...round,
      pairs: round.pairs.map((pair, index) => ({ ...pair, points: 15 - index })),
    }));
    const payload = { version: 2, format: 'king_sideout', pairingMode: 'fixed', pointLimit: 15, roundDurationMinutes: 12, matches: [], rounds };
    expect(validateStructuredPlayResult(payload, [1, 2, 3, 4, 5, 6, 7, 8])).toBeNull();
    expect(validateStructuredPlayResult({ ...payload, roundDurationMinutes: 26 }, [1, 2, 3, 4, 5, 6, 7, 8])).toBeTruthy();
    const overLimit = rounds.map((round, index) => index ? round : { ...round, pairs: round.pairs.map((pair, pairIndex) => pairIndex ? pair : { ...pair, points: 16 }) });
    expect(validateStructuredPlayResult({ ...payload, rounds: overLimit }, [1, 2, 3, 4, 5, 6, 7, 8])).toBeTruthy();
  });

  it('validates Thai tournament scores against the selected limit', () => {
    const matches = generatePlayMatches([1, 2, 3, 4, 5, 6, 7, 8], 'thai_8', 'fixed', 1)
      .map((match) => ({ ...match, scoreA: 15, scoreB: 10 }));
    const payload = { version: 2, format: 'thai_8', pairingMode: 'fixed', pointLimit: 15, matches };
    expect(validateStructuredPlayResult(payload, [1, 2, 3, 4, 5, 6, 7, 8])).toBeNull();
    expect(validateStructuredPlayResult({ ...payload, matches: [{ ...matches[0], scoreA: 14 }, ...matches.slice(1)] }, [1, 2, 3, 4, 5, 6, 7, 8])).toBeTruthy();
  });

  it('turns KING placements into one competitive result per paired rank', () => {
    const rounds = generateKingRounds([1, 2, 3, 4, 5, 6, 7, 8], 'fixed', 1).map((round) => ({
      ...round,
      pairs: round.pairs.map((pair, index) => ({ ...pair, points: 15 - index * 2 })),
    }));
    const matches = getCompetitiveMatches({ version: 2, format: 'king_sideout', pairingMode: 'fixed', pointLimit: 15, matches: [], roundDurationMinutes: 10, rounds });
    expect(matches).toHaveLength(8);
  });

  it('calculates personal standings from team scores', () => {
    const rows = buildPlayResultStandings({ version: 2, format: 'classic_2x2', pairingMode: 'fixed', pointLimit: 15, matches: [{ id: '1', teamA: [1, 2], teamB: [3, 4], scoreA: 15, scoreB: 12 }, { id: '2', teamA: [1, 2], teamB: [3, 4], scoreA: 10, scoreB: 15 }] });
    expect(rows.find((row) => row.userId === 3)).toMatchObject({ wins: 1, losses: 1, diff: 2 });
  });
});
