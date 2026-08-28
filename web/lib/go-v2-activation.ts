export type GoEngineVersion = 1 | 2;

export type GoEngineTransitionState = {
  currentVersion: GoEngineVersion;
  nextVersion: GoEngineVersion;
  tournamentStatus: string;
  nextTournamentStatus?: string;
  hasLegacyGoState: boolean;
  hasV2State: boolean;
};

export function parseGoEngineVersion(value: unknown): GoEngineVersion | null {
  if (value === 1 || value === '1') return 1;
  if (value === 2 || value === '2') return 2;
  return null;
}

export function normalizeGoEngineVersion(
  value: unknown,
  fallback: GoEngineVersion = 1,
): GoEngineVersion {
  return parseGoEngineVersion(value) ?? fallback;
}

export function requestedGoEngineVersion(input: {
  goEngineVersion?: unknown;
  settings?: Record<string, unknown> | null;
}): unknown {
  // tournaments.go_engine_version is the only activation source. Historical
  // JSON keys are removed on write but must never silently enable V2.
  return input.goEngineVersion;
}

export function canonicalizeGoV2Settings(
  settingsRaw: Record<string, unknown> | null | undefined,
  engineVersion: GoEngineVersion,
): Record<string, unknown> {
  const settings = { ...(settingsRaw ?? {}) };
  delete settings.goEngineVersion;
  delete settings.go_engine_version;
  settings.goV2PublicEnabled = engineVersion === 2 && settings.goV2PublicEnabled === true;
  return settings;
}

export function isGoV2PublicEnabled(input: {
  goEngineVersion?: unknown;
  settings?: Record<string, unknown> | null;
}): boolean {
  return normalizeGoEngineVersion(input.goEngineVersion) === 2
    && input.settings?.goV2PublicEnabled === true;
}

export function assessGoEngineTransition(state: GoEngineTransitionState): string | null {
  if (state.currentVersion === state.nextVersion) return null;

  const statuses = [state.tournamentStatus, state.nextTournamentStatus ?? state.tournamentStatus]
    .map((value) => String(value || '').trim().toLowerCase());
  if (statuses.some((status) => !['draft', 'open', 'full'].includes(status))) {
    return 'Версию GO-движка можно менять только до начала турнира.';
  }
  if (state.hasLegacyGoState) {
    return 'Legacy GO уже материализован. Создайте отдельный турнир для Tournament Engine V2.';
  }
  if (state.hasV2State) {
    return 'Tournament Engine V2 уже содержит состояние. Откат версии выполняется отдельной директорской операцией.';
  }
  return null;
}
