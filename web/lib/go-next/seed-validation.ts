export interface GoSeedDraftTeamRef {
  teamId: string;
}

export type GoSeedDraftShape = Record<string, GoSeedDraftTeamRef[]>;

export type GoSeedDraftValidationResult =
  | { ok: true; value: Record<string, string[]> }
  | { ok: false; error: string };

function readTeamId(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return String((value as { teamId?: unknown }).teamId ?? '').trim();
}

/**
 * Validates a manual edit against the server-built preview. The preview is the
 * authority for both eligibility and the exact per-league quota.
 */
export function validateGoSeedDraft(
  requestedDraft: unknown,
  baseDraft: GoSeedDraftShape,
  enabledLevels: string[],
): GoSeedDraftValidationResult {
  if (!requestedDraft || typeof requestedDraft !== 'object' || Array.isArray(requestedDraft)) {
    return { ok: false, error: 'Seed draft must be an object keyed by playoff league.' };
  }

  const source = requestedDraft as Record<string, unknown>;
  const enabled = [...new Set(enabledLevels.map((level) => String(level).trim()).filter(Boolean))];
  const enabledSet = new Set(enabled);
  const unsupported = Object.keys(source).filter((level) => !enabledSet.has(level));
  if (unsupported.length) {
    return { ok: false, error: `Seed draft contains unsupported league: ${unsupported.join(', ')}.` };
  }

  const eligibleIds = enabled.flatMap((level) => (baseDraft[level] ?? []).map((team) => String(team.teamId).trim()));
  const eligibleSet = new Set(eligibleIds);
  const expectedLevelByTeam = new Map(
    enabled.flatMap((level) => (baseDraft[level] ?? []).map((team) => [String(team.teamId).trim(), level] as const)),
  );
  if (!eligibleIds.length || eligibleSet.size !== eligibleIds.length) {
    return { ok: false, error: 'Server seed preview is empty or contains duplicate teams.' };
  }

  const normalized: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const level of enabled) {
    const expectedCount = (baseDraft[level] ?? []).length;
    const rawTeams = source[level];
    if (!Array.isArray(rawTeams)) {
      if (expectedCount === 0 && rawTeams === undefined) {
        normalized[level] = [];
        continue;
      }
      return { ok: false, error: `Seed draft for ${level} must contain exactly ${expectedCount} teams.` };
    }
    if (rawTeams.length !== expectedCount) {
      return {
        ok: false,
        error: `Seed draft quota mismatch for ${level}: expected ${expectedCount}, received ${rawTeams.length}.`,
      };
    }

    const ids: string[] = [];
    for (const rawTeam of rawTeams) {
      const teamId = readTeamId(rawTeam);
      if (!teamId || !eligibleSet.has(teamId)) {
        return { ok: false, error: `Seed draft contains unknown or ineligible team: ${teamId || '<empty>'}.` };
      }
      if (expectedLevelByTeam.get(teamId) !== level) {
        return {
          ok: false,
          error: `Seed draft places team ${teamId} in ${level}; expected ${expectedLevelByTeam.get(teamId)}.`,
        };
      }
      if (seen.has(teamId)) {
        return { ok: false, error: `Seed draft contains duplicate team: ${teamId}.` };
      }
      seen.add(teamId);
      ids.push(teamId);
    }
    normalized[level] = ids;
  }

  const missing = eligibleIds.filter((teamId) => !seen.has(teamId));
  if (missing.length) {
    return { ok: false, error: `Seed draft is incomplete; missing teams: ${missing.join(', ')}.` };
  }
  return { ok: true, value: normalized };
}
