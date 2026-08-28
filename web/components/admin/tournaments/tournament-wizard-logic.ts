import {
  buildGoAutoLayoutSuggestion,
  GO_ADMIN_DEFAULT_GROUPS,
  GO_ADMIN_DEFAULT_GROUP_FORMULA,
  GO_ADMIN_MAX_GROUPS,
  GO_ADMIN_MIN_GROUPS,
  KOTC_ADMIN_DEFAULT_PPC,
  KOTC_ADMIN_MAX_PPC,
  KOTC_ADMIN_MIN_PPC,
} from '@/lib/admin-legacy-sync';

export type TournamentWizardThaiVariant = 'MF' | 'MN' | 'MM' | 'WW';
export type TournamentWizardGender = 'M' | 'W';
export type TournamentWizardGoLeague = 'lyutye' | 'hard' | 'medium' | 'lite';

type ThaiRosterSlot = {
  gender?: TournamentWizardGender;
} | null | undefined;

export type TournamentWizardGoSettings = {
  goGroupCount?: number;
  goTeamsPerGroup?: number;
  goGroupFormulaHard?: number;
  goGroupFormulaMedium?: number;
  goGroupFormulaLite?: number;
  goEnabledPlayoffLeagues?: string[];
  goMixedTeamCounts?: Record<string, number>;
  goBracketSizes?: Record<string, number>;
};

type KotcWizardSettings = Record<string, unknown> & {
  kotcPpc?: number;
  kotcRaundCount?: number;
  pairsPerCourt?: number;
  playersPerCourt?: number;
  kotcJudgeModule?: 'next' | 'legacy';
};

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

export function normalizeTournamentWizardThaiVariant(value: unknown): TournamentWizardThaiVariant {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'M' || normalized === 'MM') return 'MM';
  if (normalized === 'W' || normalized === 'WW') return 'WW';
  if (normalized === 'MN') return 'MN';
  return 'MF';
}

export function getTournamentWizardThaiSlotGender(
  variant: TournamentWizardThaiVariant,
  slotIndex: number,
  playersPerCourt: number,
): TournamentWizardGender | null {
  if (variant === 'MM' || variant === 'MN') return 'M';
  if (variant === 'WW') return 'W';
  const normalizedPlayersPerCourt = Math.max(2, Math.floor(Number(playersPerCourt) || 8));
  const localSlotIndex = (
    (slotIndex % normalizedPlayersPerCourt) + normalizedPlayersPerCourt
  ) % normalizedPlayersPerCourt;
  return localSlotIndex < normalizedPlayersPerCourt / 2 ? 'M' : 'W';
}

export function findFirstMatchingThaiSlot(
  roster: ThaiRosterSlot[],
  participantLimit: number,
  variantValue: unknown,
  gender: TournamentWizardGender,
  playersPerCourt = 8,
): number {
  const variant = normalizeTournamentWizardThaiVariant(variantValue);
  const limit = Math.max(0, Math.floor(Number(participantLimit) || 0));
  for (let index = 0; index < limit; index += 1) {
    if (roster[index]) continue;
    if (getTournamentWizardThaiSlotGender(variant, index, playersPerCourt) === gender) return index;
  }
  return -1;
}

function enabledGoLeagues(settings: TournamentWizardGoSettings): TournamentWizardGoLeague[] {
  const supported = new Set<TournamentWizardGoLeague>(['lyutye', 'hard', 'medium', 'lite']);
  const configured = Array.isArray(settings.goEnabledPlayoffLeagues)
    ? settings.goEnabledPlayoffLeagues.filter((league): league is TournamentWizardGoLeague => supported.has(league as TournamentWizardGoLeague))
    : [];
  return configured.length ? configured : ['hard', 'medium', 'lite'];
}

function clampGoLeagueTeamCount(league: TournamentWizardGoLeague, value: unknown): number {
  const minimum = league === 'lyutye' || league === 'hard' ? 4 : 2;
  return clampInteger(value, minimum, 16, minimum);
}

function getGoBracketSize(league: TournamentWizardGoLeague, teamCount: number): number {
  const minimum = league === 'lyutye' || league === 'hard' ? 4 : 2;
  let size = minimum;
  while (size < teamCount && size < 16) size *= 2;
  return Math.min(16, size);
}

export function getGoGroupFormulaPatch(groupSizeValue: unknown): Pick<
  TournamentWizardGoSettings,
  'goTeamsPerGroup' | 'goGroupFormulaHard' | 'goGroupFormulaMedium' | 'goGroupFormulaLite'
> {
  const groupSize = Number(groupSizeValue) <= 3 ? 3 : 4;
  return groupSize === 3
    ? {
        goTeamsPerGroup: 3,
        goGroupFormulaHard: 1,
        goGroupFormulaMedium: 1,
        goGroupFormulaLite: 1,
      }
    : {
        goTeamsPerGroup: 4,
        goGroupFormulaHard: 2,
        goGroupFormulaMedium: 1,
        goGroupFormulaLite: 1,
      };
}

export function buildAutoGoMixedTeamCounts(
  settings: TournamentWizardGoSettings,
): Record<string, number> {
  const groupCount = clampInteger(
    settings.goGroupCount,
    GO_ADMIN_MIN_GROUPS,
    GO_ADMIN_MAX_GROUPS,
    GO_ADMIN_DEFAULT_GROUPS,
  );
  const hardPerGroup = clampInteger(
    settings.goGroupFormulaHard,
    0,
    4,
    GO_ADMIN_DEFAULT_GROUP_FORMULA.hard,
  );
  const mediumPerGroup = clampInteger(
    settings.goGroupFormulaMedium,
    0,
    4,
    GO_ADMIN_DEFAULT_GROUP_FORMULA.medium,
  );
  const litePerGroup = clampInteger(
    settings.goGroupFormulaLite,
    0,
    4,
    GO_ADMIN_DEFAULT_GROUP_FORMULA.lite,
  );
  const baseByLeague: Record<TournamentWizardGoLeague, number> = {
    lyutye: groupCount * hardPerGroup,
    hard: groupCount * hardPerGroup,
    medium: groupCount * mediumPerGroup,
    lite: groupCount * litePerGroup,
  };
  return Object.fromEntries(
    enabledGoLeagues(settings).map((league) => [
      league,
      clampGoLeagueTeamCount(league, baseByLeague[league]),
    ]),
  );
}

export function buildGoPlayoffSyncPatch(
  settings: TournamentWizardGoSettings,
): Pick<TournamentWizardGoSettings, 'goMixedTeamCounts' | 'goBracketSizes'> {
  const counts = buildAutoGoMixedTeamCounts(settings);
  const sizes = Object.fromEntries(
    enabledGoLeagues(settings).map((league) => [
      league,
      getGoBracketSize(league, counts[league] ?? 0),
    ]),
  );
  return {
    goMixedTeamCounts: counts,
    goBracketSizes: sizes,
  };
}

export function buildGoAutoConfigPatchFromDeclared(
  declaredTeams: number,
  currentSettings: TournamentWizardGoSettings = {},
): TournamentWizardGoSettings & { goDeclaredTeamCount: number } {
  const suggestion = buildGoAutoLayoutSuggestion(declaredTeams);
  const formula = getGoGroupFormulaPatch(suggestion.groupSize);
  const structural = {
    ...currentSettings,
    ...formula,
    goGroupCount: suggestion.groupCount,
  };
  return {
    goDeclaredTeamCount: suggestion.declaredTeamCount,
    goGroupCount: suggestion.groupCount,
    ...formula,
    ...buildGoPlayoffSyncPatch(structural),
  };
}

export function alignKotcRoundsToPairs(
  currentSettings: KotcWizardSettings,
  patch: Partial<KotcWizardSettings> = {},
): KotcWizardSettings {
  const merged = { ...currentSettings, ...patch };
  const ppc = clampInteger(
    patch.kotcPpc ?? merged.kotcPpc,
    KOTC_ADMIN_MIN_PPC,
    KOTC_ADMIN_MAX_PPC,
    KOTC_ADMIN_DEFAULT_PPC,
  );
  return {
    ...merged,
    kotcPpc: ppc,
    kotcRaundCount: ppc,
    pairsPerCourt: ppc,
    playersPerCourt: ppc * 2,
    kotcJudgeModule: 'next',
  };
}
