import { describe, expect, it } from 'vitest';

import {
  THAI_JUDGE_MODULE_LEGACY,
  THAI_JUDGE_MODULE_NEXT,
  THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
  buildThaiJudgeStructuralSignature,
  normalizeThaiJudgeBootstrapSignature,
  normalizeThaiJudgeModule,
  thaiJudgeBootstrapSignaturesMatch,
  validateThaiNextStructuralLock,
  validateThaiNextTournamentSetup,
} from '../../web/lib/thai-judge-config.ts';

describe('thai judge config helpers', () => {
  const mixedRoster = [
    { playerId: 'm1', gender: 'M', position: 1 },
    { playerId: 'w1', gender: 'W', position: 2 },
    { playerId: 'm2', gender: 'M', position: 3 },
    { playerId: 'w2', gender: 'W', position: 4 },
    { playerId: 'm3', gender: 'M', position: 5 },
    { playerId: 'w3', gender: 'W', position: 6 },
    { playerId: 'm4', gender: 'M', position: 7 },
    { playerId: 'w4', gender: 'W', position: 8 },
  ];

  it('normalizes judge module and bootstrap signature defaults', () => {
    expect(normalizeThaiJudgeModule('next')).toBe(THAI_JUDGE_MODULE_NEXT);
    expect(normalizeThaiJudgeModule('legacy')).toBe(THAI_JUDGE_MODULE_LEGACY);
    expect(normalizeThaiJudgeModule('', THAI_JUDGE_MODULE_NEXT)).toBe(THAI_JUDGE_MODULE_NEXT);
    expect(THAI_STRUCTURAL_DRIFT_LOCKED_CODE).toBe('STRUCTURAL_DRIFT_LOCKED');
    expect(normalizeThaiJudgeBootstrapSignature('  sig:v1  ')).toBe('sig:v1');
    expect(normalizeThaiJudgeBootstrapSignature('')).toBeNull();
  });

  it('builds a stable structural signature from settings and ordered main roster', () => {
    expect(
      buildThaiJudgeStructuralSignature({
        settings: { thaiVariant: 'MF', courts: 1, tourCount: 4 },
        participants: [
          { playerId: 'p2', position: 2, isWaitlist: false },
          { playerId: 'p1', position: 1, isWaitlist: false },
          { playerId: 'wait', position: 99, isWaitlist: true },
        ],
      }),
    ).toBe('variant=MF;courts=1;tours=4;rules=legacy;players=p1,p2');
  });

  it('keeps pre-rules Thai Next bootstrap signatures compatible', () => {
    expect(
      thaiJudgeBootstrapSignaturesMatch(
        'variant=MF;courts=1;tours=4;players=p1,p2',
        'variant=MF;courts=1;tours=4;rules=legacy;players=p1,p2',
      ),
    ).toBe(true);
    expect(
      thaiJudgeBootstrapSignaturesMatch(
        'variant=MF;courts=1;tours=4;players=p1,p2',
        'variant=MF;courts=1;tours=4;rules=legacy;players=p2,p1',
      ),
    ).toBe(false);
  });

  it('locks initialized Thai Next tournaments against format/module/signature drift and unlocks after reset', () => {
    const participants = [
      { playerId: 'p1', position: 1, isWaitlist: false },
      { playerId: 'p2', position: 2, isWaitlist: false },
      { playerId: 'p3', position: 3, isWaitlist: false },
      { playerId: 'p4', position: 4, isWaitlist: false },
      { playerId: 'p5', position: 5, isWaitlist: false },
      { playerId: 'p6', position: 6, isWaitlist: false },
      { playerId: 'p7', position: 7, isWaitlist: false },
      { playerId: 'p8', position: 8, isWaitlist: false },
    ];
    const currentTournament = {
      format: 'Thai',
      settings: {
        thaiVariant: 'MF',
        courts: 1,
        tourCount: 4,
        thaiJudgeModule: 'next',
        thaiJudgeBootstrapSignature:
          'variant=MF;courts=1;tours=4;rules=legacy;players=p1,p2,p3,p4,p5,p6,p7,p8',
      },
    };

    expect(
      validateThaiNextStructuralLock({
        currentTournament,
        nextTournament: {
          format: 'KOTC',
          settings: {},
          participants,
        },
      }),
    ).toEqual({
      code: THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
      message: 'Cannot change tournament format. Structural Thai Next state already initialized.',
    });

    expect(
      validateThaiNextStructuralLock({
        currentTournament,
        nextTournament: {
          format: 'Thai',
          settings: { thaiJudgeModule: 'legacy', thaiVariant: 'MF', courts: 1, tourCount: 4 },
          participants,
        },
      }),
    ).toEqual({
      code: THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
      message: 'Cannot downgrade judge module after Thai Next state initialization.',
    });

    expect(
      validateThaiNextStructuralLock({
        currentTournament,
        nextTournament: {
          format: 'Thai',
          settings: { thaiJudgeModule: 'next', thaiVariant: 'MF', courts: 1, tourCount: 4 },
          participants: [...participants].reverse(),
        },
      }),
    ).toBeNull();

    expect(
      validateThaiNextStructuralLock({
        currentTournament,
        nextTournament: {
          format: 'Thai',
          settings: { thaiJudgeModule: 'next', thaiVariant: 'MF', courts: 2, tourCount: 4 },
          participants,
        },
      }),
    ).toEqual({
      code: THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
      message: 'structural Thai Next state already initialized; reset/recreate flow required',
    });

    expect(
      validateThaiNextStructuralLock({
        currentTournament: {
          ...currentTournament,
          settings: {
            ...currentTournament.settings,
            thaiJudgeBootstrapSignature:
              'variant=MF;courts=1;tours=4;players=p1,p2,p3,p4,p5,p6,p7,p8',
          },
        },
        nextTournament: {
          format: 'Thai',
          settings: { thaiJudgeModule: 'next', thaiVariant: 'MF', courts: 1, tourCount: 4 },
          participants,
        },
      }),
    ).toBeNull();

    expect(
      validateThaiNextStructuralLock({
        currentTournament: {
          format: 'Thai',
          settings: {
            thaiJudgeBootstrapSignature: null,
          },
        },
        nextTournament: {
          format: 'KOTC',
          settings: {},
          participants,
        },
      }),
    ).toBeNull();
  });

  it('validates the next judge rollout constraints', () => {
    expect(
      validateThaiNextTournamentSetup({
        format: 'Thai',
        settings: { thaiVariant: 'MF', courts: 1, tourCount: 4 },
        participants: mixedRoster,
      }),
    ).toBeNull();

    expect(
      validateThaiNextTournamentSetup({
        format: 'Thai',
        settings: { thaiVariant: 'MF', courts: 5, tourCount: 4 },
        participants: mixedRoster,
      }),
    ).toBe('Thai Next judge module supports 1-4 courts');

    expect(
      validateThaiNextTournamentSetup({
        format: 'Thai',
        settings: { thaiVariant: 'MF', courts: 1, tourCount: 4 },
        participants: [...mixedRoster.slice(0, 7), { ...mixedRoster[7], isWaitlist: true }],
      }),
    ).toBe('Thai Next judge module requires a full starting roster without waitlist players');
  });
});
