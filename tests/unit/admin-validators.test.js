import { describe, expect, it } from 'vitest';
import {
  normalizeOverrideInput,
  normalizePlayerInput,
  normalizeTournamentInput,
  validateOverrideInput,
  validatePlayerInput,
  validateTournamentInput,
} from '../../web/lib/admin-validators.ts';

describe('admin validators', () => {
  it('normalizes tournament and validates required fields', () => {
    const normalized = normalizeTournamentInput({
      name: ' Friday Cup ',
      date: '2026-03-22',
      format: 'Round Robin',
      status: 'weird',
      capacity: -7,
      division: 'муж',
      participants: [
        { playerId: 'p2', position: 2 },
        { playerId: 'p1', position: 1 },
      ],
    });
    expect(normalized.name).toBe('Friday Cup');
    expect(normalized.status).toBe('open');
    expect(normalized.capacity).toBe(0);
    expect(normalized.division).toBe('Мужской');
    expect(normalized.level).toBe('medium');
    expect(normalized.participants).toEqual([
      { playerId: 'p2', position: 2, isWaitlist: false },
      { playerId: 'p1', position: 1, isWaitlist: false },
    ]);
    expect(validateTournamentInput(normalized)).toBe('Capacity must be at least 4');
    expect(validateTournamentInput(normalizeTournamentInput({}))).toBe('Tournament name is required');
  });

  it('rejects invalid tournament metadata before the database layer', () => {
    expect(
      validateTournamentInput(
        normalizeTournamentInput({
          name: 'No Division',
          date: '2026-03-22',
          capacity: 24,
        })
      )
    ).toBe('Division is required');

    expect(
      validateTournamentInput(
        normalizeTournamentInput({
          name: 'Broken Level',
          date: '2026-03-22',
          division: 'Микст',
          level: 'open',
          capacity: 24,
        })
      )
    ).toBe('Level must be hard, medium, or easy');

    expect(
      validateTournamentInput(
        normalizeTournamentInput({
          name: 'Broken Capacity',
          date: '2026-03-22',
          division: 'Женский',
          capacity: 3,
        })
      )
    ).toBe('Capacity must be at least 4');
  });

  it('rejects duplicate tournament participants', () => {
    const normalized = normalizeTournamentInput({
      name: 'Draft',
      date: '2026-03-22',
      division: 'Мужской',
      capacity: 24,
      participants: [
        { playerId: 'p1', position: 1 },
        { playerId: 'p1', position: 2 },
      ],
    });
    expect(validateTournamentInput(normalized)).toBe('Participant list contains duplicates');
  });

  it('validates dynamic Thai roster size from courts setting', () => {
    const players16 = Array.from({ length: 16 }, (_, index) => ({
      playerId: `p${index + 1}`,
      position: index + 1,
    }));

    const ok = normalizeTournamentInput({
      name: 'Thai 2 Courts',
      date: '2026-03-22',
      format: 'Thai',
      division: 'Мужской',
      capacity: 16,
      settings: { courts: 2, thaiVariant: 'MM', tourCount: 2 },
      participants: players16,
    });
    expect(validateTournamentInput(ok)).toBeNull();

    const menNovice = normalizeTournamentInput({
      name: 'Thai Men Novice',
      date: '2026-03-22',
      format: 'Thai',
      division: 'Мужской',
      capacity: 16,
      settings: { courts: 2, thaiVariant: 'MN', tourCount: 2 },
      participants: players16,
    });
    expect(validateTournamentInput(menNovice)).toBeNull();

    const bad = normalizeTournamentInput({
      name: 'Thai Broken',
      date: '2026-03-22',
      format: 'Thai',
      division: 'Мужской',
      capacity: 16,
      settings: { courts: 2, thaiVariant: 'MM', tourCount: 2 },
      participants: players16.slice(0, 8),
    });
    expect(validateTournamentInput(bad)).toBe('Thai requires exactly 16 players');

    const legacyAlias = normalizeTournamentInput({
      name: 'Legacy IPT Alias',
      date: '2026-03-22',
      format: 'IPT Mixed',
      division: 'Микст',
      capacity: 16,
      settings: { courts: 2 },
      participants: players16.slice(0, 8),
    });
    expect(validateTournamentInput(legacyAlias)).toBe('IPT Mixed requires exactly 16 players');
  });

  it('does not clamp Thai courts/tours back to the legacy 4/10 ceiling', () => {
    const players48 = Array.from({ length: 48 }, (_, index) => ({
      playerId: `p${index + 1}`,
      position: index + 1,
    }));

    const ok = normalizeTournamentInput({
      name: 'Thai 6 Courts',
      date: '2026-03-22',
      format: 'Thai',
      division: 'Мужской',
      capacity: 48,
      settings: { courts: 6, thaiVariant: 'MM', tourCount: 12 },
      participants: players48,
    });
    expect(validateTournamentInput(ok)).toBeNull();

    const bad = normalizeTournamentInput({
      name: 'Thai 6 Courts Broken',
      date: '2026-03-22',
      format: 'Thai',
      division: 'Мужской',
      capacity: 48,
      settings: { courts: 6, thaiVariant: 'MM', tourCount: 12 },
      participants: players48.slice(0, 40),
    });
    expect(validateTournamentInput(bad)).toBe('Thai requires exactly 48 players');
  });

  it('normalizes player and validates required fields', () => {
    const normalized = normalizePlayerInput({
      name: ' Alex ',
      gender: 'x',
      status: 'zzz',
      wins: -2,
    });
    expect(normalized.name).toBe('Alex');
    expect(normalized.gender).toBe('M');
    expect(normalized.status).toBe('active');
    expect(normalized.wins).toBe(0);
    expect(validatePlayerInput(normalized)).toBeNull();
    expect(validatePlayerInput(normalizePlayerInput({}))).toBe('Player name is required');
  });

  it('validates override type-specific constraints', () => {
    const badStatus = normalizeOverrideInput({
      type: 'tournament_status',
      tournamentId: 't1',
      status: 'broken',
      reason: 'ops',
    });
    expect(validateOverrideInput(badStatus)).toBe('Invalid tournament status');

    const badRating = normalizeOverrideInput({
      type: 'player_rating',
      playerId: 'p1',
      reason: 'manual fix',
    });
    expect(validateOverrideInput(badRating)).toBe('At least one rating value is required');

    const okRecalc = normalizeOverrideInput({
      type: 'player_recalc',
      playerId: 'p2',
      reason: 'sync',
    });
    expect(validateOverrideInput(okRecalc)).toBeNull();
  });
});
