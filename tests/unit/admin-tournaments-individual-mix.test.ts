import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateTournamentCapacity,
  getTournamentFormatLabel,
  getTournamentLaunchHref,
} from '../../web/lib/admin-tournaments-ui';
import {
  INDIVIDUAL_MIX_SERIES_LABEL,
  INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID,
  validateIndividualMixTournamentSetup,
} from '../../web/lib/individual-mix/admin';

function roster(courts: number, poolSize: number) {
  return Array.from({ length: courts }, (_, court) => [
    ...Array.from({ length: poolSize }, (_, index) => ({
      playerId: `c${court + 1}-m${index + 1}`,
      position: court * poolSize * 2 + index + 1,
      isWaitlist: false,
      gender: 'M',
    })),
    ...Array.from({ length: poolSize }, (_, index) => ({
      playerId: `c${court + 1}-w${index + 1}`,
      position: court * poolSize * 2 + poolSize + index + 1,
      isWaitlist: false,
      gender: 'W',
    })),
  ]).flat();
}

function sameGenderRoster(gender: 'M' | 'W') {
  return Array.from({ length: 12 }, (_, index) => ({
    playerId: `${gender}${index + 1}`,
    position: index + 1,
    isWaitlist: false,
    gender,
  }));
}

describe('individual mix tournament integration', () => {
  it.each([
    [1, 4, 8],
    [2, 5, 20],
    [3, 6, 36],
    [4, 5, 40],
  ])('calculates %i courts, pool size %i, capacity %i', (courts, poolSize, capacity) => {
    expect(calculateTournamentCapacity({
      format: 'Individual Mix',
      settings: { courts, individualMixPoolSize: poolSize },
    })).toBe(capacity);
  });

  it('uses the new label and tournament-specific control route', () => {
    const row = {
      id: 'mix/demo',
      name: 'Demo',
      date: '2026-08-12',
      format: 'Individual Mix',
      division: 'Микст',
      capacity: 20,
      status: 'open',
      participantCount: 20,
      settings: { courts: 2, individualMixPoolSize: 5 },
    };
    expect(getTournamentFormatLabel(row)).toBe('Личный микст');
    expect(getTournamentLaunchHref(row)).toBe('/admin/tournaments/mix%2Fdemo/individual-mix');
    expect(getTournamentFormatLabel({
      ...row,
      settings: { individualMixVariant: INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID },
    })).toBe('Бездельники · 6 пар');
    expect(calculateTournamentCapacity({
      format: 'Individual Mix',
      settings: { individualMixVariant: INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID, courts: 99 },
    })).toBe(12);
  });

  it('makes the familiar series name visible in the creation wizard', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'web/components/admin/tournaments/TournamentWizard.tsx'),
      'utf8',
    );
    expect(INDIVIDUAL_MIX_SERIES_LABEL).toBe('Бездельники');
    expect(source).toContain('badge: INDIVIDUAL_MIX_SERIES_LABEL');
    expect(source).toContain('Формат «{INDIVIDUAL_MIX_SERIES_LABEL}»');
    expect(source).toContain('В стандартном варианте особенности схемы «6 пар» полностью выключены.');
    expect(source).toContain('6 пар · 2 корта');
    expect(source).toContain('Все игры до 11');
    expect(source).toContain("groupMode={sixPairVariant ? 'pairs' : 'courts'}");
    expect(source).toContain('sixPairVariant && player.gender !== sixPairExpectedGender');
    expect(source).toContain('disabled={sixPairVariant}');
    expect(source).toContain('не допускает смешанный состав');
    expect(source).toContain('aria-pressed={formatKey(draft) === option.key}');
  });

  it('accepts the balanced 6-pair women setup and fixes every game at 11', () => {
    expect(validateIndividualMixTournamentSetup({
      format: 'Individual Mix',
      division: 'Женский',
      capacity: 12,
      settings: {
        individualMixVariant: INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID,
        individualMixPairGender: 'W',
        individualMixPointLimit: 11,
        courts: 2,
      },
      participants: sameGenderRoster('W'),
    })).toBeNull();
  });

  it('rejects mixed-gender players and a non-11 limit in the 6-pair setup', () => {
    const participants = sameGenderRoster('W');
    participants[11].gender = 'M';
    expect(validateIndividualMixTournamentSetup({
      format: 'Individual Mix',
      division: 'Женский',
      capacity: 12,
      settings: {
        individualMixVariant: INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID,
        individualMixPairGender: 'W',
        individualMixPointLimit: 11,
        courts: 2,
      },
      participants,
    })).toBe('Все 12 участников должны быть пола W.');
    expect(validateIndividualMixTournamentSetup({
      format: 'Individual Mix',
      division: 'Женский',
      capacity: 12,
      settings: {
        individualMixVariant: INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID,
        individualMixPairGender: 'W',
        individualMixPointLimit: 15,
        courts: 2,
      },
      participants: sameGenderRoster('W'),
    })).toBe('В схеме «6 пар» все игры проводятся до 11 очков.');
  });

  it('accepts a complete gender-balanced roster on every court', () => {
    expect(validateIndividualMixTournamentSetup({
      format: 'Individual Mix',
      division: 'Микст',
      capacity: 20,
      settings: { courts: 2, individualMixPoolSize: 5, individualMixPointLimit: 15 },
      participants: roster(2, 5),
    })).toBeNull();
  });

  it('rejects a roster that is balanced overall but not on each court', () => {
    const participants = roster(2, 4);
    participants[3].gender = 'W';
    participants[12].gender = 'M';
    expect(validateIndividualMixTournamentSetup({
      format: 'Individual Mix',
      division: 'Микст',
      capacity: 16,
      settings: { courts: 2, individualMixPoolSize: 4, individualMixPointLimit: 15 },
      participants,
    })).toBe('На корте 1 должно быть 4 мужчин и 4 женщин.');
  });

  it('keeps server validation wired into both create and update', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'web/app/api/admin/tournaments/route.ts'),
      'utf8',
    );
    expect(source.match(/validateIndividualMixSaveInput\(input\)/g)).toHaveLength(2);
  });

  it('marks an empty draft as an explicit safe demo instead of silently using fake players', () => {
    const page = readFileSync(
      path.join(process.cwd(), 'web/app/admin/tournaments/[id]/individual-mix/page.tsx'),
      'utf8',
    );
    const workspace = readFileSync(
      path.join(process.cwd(), 'web/components/individual-mix/IndividualMixAdminWorkspace.tsx'),
      'utf8',
    );
    expect(page).toContain("String(tournament.status).toLowerCase() === 'draft' && initialPlayers.length === 0");
    expect(workspace).toContain("sixPairVariant ? 'Бездельники · 6 пар' : 'Личный микст'");
    expect(workspace).toContain('Используются вымышленные игроки');
    expect(workspace).toContain("throw new Error('В составе турнира пока нет игроков");
    expect(workspace).toContain('buildSixPairHybridSchedule');
    expect(workspace).toContain('Общий зачёт · +/−');
  });
});
