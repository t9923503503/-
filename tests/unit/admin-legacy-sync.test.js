import { describe, expect, it } from 'vitest';
import {
  buildLegacyIptTournamentState,
  buildLegacyPlayerDbState,
  buildGoAutoLayoutSuggestion,
  IPT_MIXED_FORMAT,
  IPT_MIXED_POINT_LIMIT_MAX,
  IPT_MIXED_POINT_LIMIT_MIN,
  KOTC_ADMIN_FORMAT,
  THAI_ADMIN_FORMAT,
  getKotcSeatCount,
  getIptMixedSeatCount,
  getThaiDivisionLabel,
  getThaiSeatCount,
  isKotcAdminFormat,
  normalizeKotcAdminSettings,
  normalizeKotcJudgeModule,
  normalizeGoAdminSettings,
  normalizeThaiAdminSettings,
  normalizeThaiRosterMode,
  validateIptMixedRoster,
  validateThaiRoster,
} from '../../web/lib/admin-legacy-sync.ts';

describe('admin legacy IPT sync helpers', () => {
  const orderedRoster = [
    { id: 'm1', name: 'M1', gender: 'M' },
    { id: 'w1', name: 'W1', gender: 'W' },
    { id: 'm2', name: 'M2', gender: 'M' },
    { id: 'w2', name: 'W2', gender: 'W' },
    { id: 'm3', name: 'M3', gender: 'M' },
    { id: 'w3', name: 'W3', gender: 'W' },
    { id: 'm4', name: 'M4', gender: 'M' },
    { id: 'w4', name: 'W4', gender: 'W' },
  ];
  const orderedRoster16 = [
    ...orderedRoster,
    { id: 'm5', name: 'M5', gender: 'M' },
    { id: 'w5', name: 'W5', gender: 'W' },
    { id: 'm6', name: 'M6', gender: 'M' },
    { id: 'w6', name: 'W6', gender: 'W' },
    { id: 'm7', name: 'M7', gender: 'M' },
    { id: 'w7', name: 'W7', gender: 'W' },
    { id: 'm8', name: 'M8', gender: 'M' },
    { id: 'w8', name: 'W8', gender: 'W' },
  ];
  const maleRoster16 = Array.from({ length: 16 }, (_, index) => ({
    id: `m${index + 1}`,
    name: `M${index + 1}`,
    gender: 'M',
  }));

  it('validates IPT roster size, gender split, and slot order', () => {
    expect(validateIptMixedRoster(orderedRoster)).toBeNull();
    expect(validateIptMixedRoster(orderedRoster.slice(0, 7))).toBe('IPT Mixed requires exactly 8 players.');
    expect(
      validateIptMixedRoster([
        { id: 'm1', gender: 'M' },
        { id: 'w1', gender: 'W' },
        { id: 'w2', gender: 'W' },
        { id: 'm2', gender: 'M' },
        ...orderedRoster.slice(4),
      ])
    ).toBe('IPT Mixed court 1 slots must be filled in M/W/M/W/M/W/M/W order.');
    expect(validateIptMixedRoster(orderedRoster16, { courts: 2 })).toBeNull();
    expect(validateIptMixedRoster(orderedRoster16.slice(0, 8), { courts: 2 })).toBe('IPT Mixed requires exactly 16 players.');
  });

  it('builds a legacy-compatible IPT tournament snapshot from admin order', () => {
    const snapshot = buildLegacyIptTournamentState({
      id: 'ipt-admin-1',
      name: 'Admin IPT',
      date: '2026-03-29',
      time: '10:00',
      location: 'Court A',
      format: IPT_MIXED_FORMAT,
      division: 'Mix',
      level: 'medium',
      status: 'open',
      settings: {
        iptPointLimit: 15,
        iptFinishType: 'balance',
      },
      participants: orderedRoster,
    });

    expect(snapshot.participants).toEqual(['m1', 'w1', 'm2', 'w2', 'm3', 'w3', 'm4', 'w4']);
    expect(snapshot.ipt).toEqual({
      pointLimit: 15,
      finishType: 'balance',
      courts: 1,
      gender: 'mixed',
    });
    expect(snapshot.capacity).toBe(8);
    expect(snapshot.format).toBe(IPT_MIXED_FORMAT);
  });

  it('supports multi-court IPT and clamps point limit to 9-21', () => {
    const snapshot = buildLegacyIptTournamentState({
      id: 'ipt-admin-2',
      name: 'Admin IPT 2 Courts',
      date: '2026-03-29',
      format: IPT_MIXED_FORMAT,
      division: 'Mix',
      level: 'medium',
      status: 'open',
      settings: {
        courts: 2,
        iptPointLimit: 99,
      },
      participants: orderedRoster16,
    });

    expect(snapshot.capacity).toBe(getIptMixedSeatCount(2));
    expect(snapshot.ipt?.courts).toBe(2);
    expect(snapshot.ipt?.pointLimit).toBe(IPT_MIXED_POINT_LIMIT_MAX);

    const lowPointLimit = buildLegacyIptTournamentState({
      id: 'ipt-admin-3',
      name: 'Admin IPT Low Points',
      date: '2026-03-29',
      format: IPT_MIXED_FORMAT,
      division: 'Mix',
      level: 'medium',
      status: 'open',
      settings: {
        courts: 1,
        iptPointLimit: 1,
      },
      participants: orderedRoster,
    });

    expect(lowPointLimit.ipt?.pointLimit).toBe(IPT_MIXED_POINT_LIMIT_MIN);
  });

  it('normalizes Thai admin settings and validates mixed and male rosters', () => {
    expect(
      normalizeThaiAdminSettings({
        courts: 2,
        thaiVariant: 'mm',
        tourCount: 1,
      })
    ).toEqual({
      courts: 2,
      playersPerCourt: 8,
      variant: 'MM',
      tourCount: 1,
      rosterMode: 'manual',
      pointLimit: 15,
      thaiRulesPreset: 'legacy',
    });

    expect(normalizeThaiRosterMode(undefined)).toBe('manual');
    expect(normalizeThaiRosterMode('random')).toBe('random');

    expect(getThaiSeatCount(2)).toBe(16);
    expect(getThaiDivisionLabel('MM')).toBe('Мужской');
    expect(getThaiDivisionLabel('MN')).toBe('Мужской');
    expect(validateThaiRoster(orderedRoster, { courts: 1, thaiVariant: 'MF', tourCount: 2 })).toBeNull();
    expect(validateThaiRoster(maleRoster16, { courts: 2, thaiVariant: 'MN', tourCount: 2 })).toBeNull();
    expect(validateThaiRoster(orderedRoster16, { courts: 2, thaiVariant: 'MN', tourCount: 2 })).toBeNull();
    expect(validateThaiRoster(maleRoster16, { courts: 2, thaiVariant: 'MM', tourCount: 2 })).toBeNull();
    expect(validateThaiRoster(orderedRoster16, { courts: 2, thaiVariant: 'MM' })).toBe('Thai Men allows only male players.');
    expect(validateThaiRoster(maleRoster16, { courts: 2, thaiVariant: 'MF' })).toBe(
      'Thai Mixed requires exactly 8 men and 8 women.'
    );
    expect(THAI_ADMIN_FORMAT).toBe('Thai');
  });

  it('keeps expanded Thai courts/tours without clamping', () => {
    const maleRoster48 = Array.from({ length: 48 }, (_, index) => ({
      id: `mx${index + 1}`,
      name: `MX${index + 1}`,
      gender: 'M',
    }));

    expect(
      normalizeThaiAdminSettings({
        courts: 6,
        thaiVariant: 'mm',
        tourCount: 12,
      })
    ).toEqual({
      courts: 6,
      playersPerCourt: 8,
      variant: 'MM',
      tourCount: 12,
      rosterMode: 'manual',
      pointLimit: 15,
      thaiRulesPreset: 'legacy',
    });

    expect(getThaiSeatCount(6)).toBe(48);
    expect(validateThaiRoster(maleRoster48, { courts: 6, thaiVariant: 'MM', tourCount: 12 })).toBeNull();
  });

  it('normalizes KOTC admin settings for Next and infers seat count from ppc', () => {
    expect(
      normalizeKotcAdminSettings({
        courts: 2,
        kotcPpc: 5,
        kotcRaundCount: 4,
        kotcRaundTimerMinutes: 18,
        kotcJudgeModule: 'legacy',
        kotcJudgeBootstrapSignature: ' sig-1 ',
      })
    ).toEqual({
      courts: 2,
      playersPerCourt: 10,
      ppc: 5,
      raundCount: 4,
      raundTimerMinutes: 18,
      kotcJudgeModule: 'legacy',
      kotcJudgeBootstrapSignature: 'sig-1',
    });

    expect(
      normalizeKotcAdminSettings({
        kotcPpc: 3,
      }, 18)
    ).toMatchObject({
      courts: 3,
      playersPerCourt: 6,
      ppc: 3,
      raundCount: 2,
      raundTimerMinutes: 10,
      kotcJudgeModule: 'next',
      kotcJudgeBootstrapSignature: null,
    });

    expect(getKotcSeatCount(3, 5)).toBe(30);
    expect(normalizeKotcJudgeModule('legacy')).toBe('legacy');
    expect(normalizeKotcJudgeModule('next', 'legacy')).toBe('next');
    expect(normalizeKotcJudgeModule(undefined, 'legacy')).toBe('legacy');
    expect(isKotcAdminFormat(KOTC_ADMIN_FORMAT)).toBe(true);
  });

  it('builds a playerdb snapshot for legacy sync', () => {
    const snapshot = buildLegacyPlayerDbState(orderedRoster);

    expect(Array.isArray(snapshot.players)).toBe(true);
    expect(snapshot.players).toHaveLength(8);
    expect(snapshot.players[0]).toMatchObject({
      id: 'm1',
      name: 'M1',
      gender: 'M',
      ratingMix: 0,
    });
    expect(typeof snapshot.synced_at).toBe('string');
  });

  it('normalizes GO seeding mode aliases to fixedPairs', () => {
    expect(normalizeGoAdminSettings({ goSeedingMode: 'fixedPairs' }).seedingMode).toBe('fixedPairs');
    expect(normalizeGoAdminSettings({ goSeedingMode: 'fixed_pairs' }).seedingMode).toBe('fixedPairs');
    expect(normalizeGoAdminSettings({ goSeedingMode: 'fixed-pairs' }).seedingMode).toBe('fixedPairs');
    expect(normalizeGoAdminSettings({ goSeedingMode: 'fixed_pair' }).seedingMode).toBe('fixedPairs');
  });

  it('builds GO auto layout suggestion with minimal empty slots and tie-breakers', () => {
    expect(buildGoAutoLayoutSuggestion(29)).toEqual({
      declaredTeamCount: 29,
      groupCount: 10,
      groupSize: 3,
      emptySlots: 1,
    });
    expect(buildGoAutoLayoutSuggestion(2)).toEqual({
      declaredTeamCount: 2,
      groupCount: 1,
      groupSize: 3,
      emptySlots: 1,
    });
    expect(buildGoAutoLayoutSuggestion(36)).toEqual({
      declaredTeamCount: 36,
      groupCount: 9,
      groupSize: 4,
      emptySlots: 0,
    });
    expect(buildGoAutoLayoutSuggestion(48)).toEqual({
      declaredTeamCount: 48,
      groupCount: 12,
      groupSize: 4,
      emptySlots: 0,
    });
  });

  it('normalizes declared GO team count from explicit setting and from layout fallback', () => {
    expect(normalizeGoAdminSettings({ goDeclaredTeamCount: 29 }).declaredTeamCount).toBe(29);
    expect(
      normalizeGoAdminSettings({
        goGroupCount: 10,
        goGroupFormulaHard: 1,
        goGroupFormulaMedium: 1,
        goGroupFormulaLite: 1,
      }).declaredTeamCount,
    ).toBe(30);
  });
});
