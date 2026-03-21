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
      status: 'weird',
      capacity: -7,
    });
    expect(normalized.name).toBe('Friday Cup');
    expect(normalized.status).toBe('open');
    expect(normalized.capacity).toBe(0);
    expect(validateTournamentInput(normalized)).toBeNull();
    expect(validateTournamentInput(normalizeTournamentInput({}))).toBe('Tournament name is required');
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
