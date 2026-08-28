import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  alignKotcRoundsToPairs,
  buildGoAutoConfigPatchFromDeclared,
  buildAutoGoMixedTeamCounts,
  findFirstMatchingThaiSlot,
} from '../../web/components/admin/tournaments/tournament-wizard-logic';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

const wizardPath = 'web/components/admin/tournaments/TournamentWizard.tsx';
const wizardLogicPath = 'web/components/admin/tournaments/tournament-wizard-logic.ts';

describe('Admin tournament wizard source contract', () => {
  it('shows the KOTC creation timers inside the KOTC-only branch', () => {
    const wizard = read(wizardPath);

    expect(wizard).toMatch(/\{kotc \? \([\s\S]*Таймеры KOTC[\s\S]*settings\.timerCourts[\s\S]*settings\.timerFinals/);
    expect(wizard).toContain('value={Number(settings.timerCourts ?? 10)}');
    expect(wizard).toContain('value={Number(settings.timerFinals ?? 10)}');
  });

  it('keeps declared GO teams separate from explicit group controls', () => {
    const wizard = read(wizardPath);

    expect(wizard).toContain('goDeclaredTeamCount');
    expect(wizard).toContain('buildGoAutoConfigPatchFromDeclared(value, settings)');
    expect(wizard).toContain('const structural = { ...settings, goGroupCount: value }');
    expect(wizard).toContain('min={GO_ADMIN_MIN_GROUPS}');
    expect(wizard).toContain('max={GO_ADMIN_MAX_GROUPS}');
    expect(wizard).toContain('Ручное изменение групп не меняет заявленное число команд.');
  });

  it('auto-syncs GO playoff counts from group layout instead of fixed defaults', () => {
    const logic = read(wizardLogicPath);

    expect(logic).toContain('export function buildAutoGoMixedTeamCounts(');
    expect(logic).toContain('lyutye: groupCount * hardPerGroup');
    expect(logic).toContain('hard: groupCount * hardPerGroup');
    expect(logic).toContain('medium: groupCount * mediumPerGroup');
    expect(logic).toContain('lite: groupCount * litePerGroup');
    expect(buildAutoGoMixedTeamCounts({
      goGroupCount: 6,
      goGroupFormulaHard: 2,
      goGroupFormulaMedium: 1,
      goGroupFormulaLite: 1,
      goEnabledPlayoffLeagues: ['hard', 'medium', 'lite'],
    })).toEqual({ hard: 12, medium: 6, lite: 6 });
    expect(buildGoAutoConfigPatchFromDeclared(23, {
      goEnabledPlayoffLeagues: ['hard', 'medium', 'lite'],
    })).toMatchObject({
      goDeclaredTeamCount: 23,
      goGroupCount: 6,
      goTeamsPerGroup: 4,
      goMixedTeamCounts: { hard: 12, medium: 6, lite: 6 },
      goBracketSizes: { hard: 16, medium: 8, lite: 8 },
    });
  });

  it('contains GO server autosave and legacy preflight integration points', () => {
    const wizard = read(wizardPath);
    const preflightRoute = read('web/app/api/admin/tournaments/go-preflight/route.ts');

    expect(wizard).toContain('goAutosaveState');
    expect(wizard).toContain("fetch('/api/admin/tournaments/go-preflight'");
    expect(wizard).toContain('Автосохранение черновика GO через мастер');
    expect(wizard).toContain('Готовность к LIVE');
    expect(wizard).toContain("draft.goEngineVersion !== 1");
    expect(preflightRoute).toContain('canGoLive');
    expect(preflightRoute).toContain('pair-order-rule');
  });

  it('routes Thai mixed additions into the first empty slot of the matching gender', () => {
    const wizard = read(wizardPath);
    const logic = read(wizardLogicPath);
    const roster = Array.from({ length: 16 }, () => null);

    expect(logic).toContain('export function findFirstMatchingThaiSlot(');
    expect(wizard).toContain('const preferredThaiSlot = findFirstMatchingThaiSlot(');
    expect(wizard).toContain('player.gender');
    expect(findFirstMatchingThaiSlot(roster, 16, 'MF', 'M', 8)).toBe(0);
    expect(findFirstMatchingThaiSlot(roster, 16, 'MF', 'W', 8)).toBe(4);
    roster[0] = { gender: 'M' };
    roster[1] = { gender: 'M' };
    roster[2] = { gender: 'M' };
    roster[3] = { gender: 'M' };
    expect(findFirstMatchingThaiSlot(roster, 16, 'MF', 'M', 8)).toBe(8);
    expect(findFirstMatchingThaiSlot(roster, 16, 'WW', 'M', 8)).toBe(-1);
  });

  it('exposes a dedicated KOTC Next no-takeovers toggle', () => {
    const wizard = read(wizardPath);

    expect(wizard).toContain('Без заходов');
    expect(wizard).toContain('type="checkbox"');
    expect(wizard).toContain("event.target.checked ? 'no_takeovers' : 'standard'");
    expect(wizard).toContain('Таблица считается без учета заходов.');
    expect(wizard).toContain('Заходы учитываются как дополнительный критерий.');
    expect(wizard).toContain('kotcTakeoversMode');
  });

  it('keeps KOTC Next rounds locked to pairs per court in UI and payloads', () => {
    const wizard = read(wizardPath);
    const legacySync = read('web/lib/admin-legacy-sync.ts');
    const nextConfig = read('web/lib/kotc-next-config.ts');

    expect(wizard).toContain('kotcPpc: value, kotcRaundCount: value');
    expect(wizard).toContain('автоматически = пар на корт');
    expect(alignKotcRoundsToPairs({ kotcPpc: 3, kotcRaundCount: 5 }, { kotcPpc: 4 })).toMatchObject({
      kotcPpc: 4,
      kotcRaundCount: 4,
      pairsPerCourt: 4,
      playersPerCourt: 8,
    });
    expect(alignKotcRoundsToPairs({ kotcPpc: 4 }, { kotcRaundCount: 2 })).toMatchObject({
      kotcPpc: 4,
      kotcRaundCount: 4,
    });
    expect(legacySync).toContain('raundCount: ppc');
    expect(nextConfig).toContain('const raundCount = ppc');
    expect(nextConfig).toContain('raundCount !== ppc');
  });
});
