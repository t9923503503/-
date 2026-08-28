export interface GoSingleEliminationMatchResult {
  bracketRound: number;
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
  status: string;
}

export interface GoBracketPlacement {
  teamId: string;
  place: number;
  eliminatedRound: number | null;
}

/** Produces standard tied places: 1, 2, 3/3, 5..8, 9..16, etc. */
export function classifySingleElimination(
  entrantIds: string[],
  matches: GoSingleEliminationMatchResult[],
): GoBracketPlacement[] {
  const entrants = entrantIds.map((value) => String(value).trim()).filter(Boolean);
  const entrantSet = new Set(entrants);
  if (!entrants.length || entrantSet.size !== entrants.length) {
    throw new Error('Bracket entrants are empty or duplicated');
  }

  const finished = matches
    .filter((match) => String(match.status).toLowerCase() === 'finished')
    .filter((match) => {
      const teamAId = String(match.teamAId ?? '').trim();
      const teamBId = String(match.teamBId ?? '').trim();
      const winnerId = String(match.winnerId ?? '').trim();
      const onlyEntrantId = teamAId && !teamBId ? teamAId : teamBId && !teamAId ? teamBId : '';

      // Older GO Next brackets persisted a BYE as a one-sided 2:0 match.
      // It remains readable, but contributes neither a win nor an elimination.
      return !(onlyEntrantId && winnerId === onlyEntrantId && entrantSet.has(onlyEntrantId));
    });
  if (!finished.length) throw new Error('Bracket has no finished sporting matches');
  const maxRound = Math.max(...finished.map((match) => Math.max(1, Math.floor(match.bracketRound))));
  const finals = finished.filter((match) => Math.max(1, Math.floor(match.bracketRound)) === maxRound);
  if (finals.length !== 1) throw new Error('Bracket must contain exactly one finished final');

  const final = finals[0];
  const championId = String(final.winnerId ?? '').trim();
  if (!championId || !entrantSet.has(championId)) throw new Error('Bracket final winner is missing or unknown');

  const placements = new Map<string, GoBracketPlacement>();
  placements.set(championId, { teamId: championId, place: 1, eliminatedRound: null });

  for (const match of finished) {
    const teamAId = String(match.teamAId ?? '').trim();
    const teamBId = String(match.teamBId ?? '').trim();
    const winnerId = String(match.winnerId ?? '').trim();
    if (!teamAId || !teamBId || !winnerId || (winnerId !== teamAId && winnerId !== teamBId)) {
      throw new Error('Finished bracket match has invalid participants or winner');
    }
    if (!entrantSet.has(teamAId) || !entrantSet.has(teamBId)) {
      throw new Error('Finished bracket match contains an unknown entrant');
    }
    const loserId = winnerId === teamAId ? teamBId : teamAId;
    if (placements.has(loserId)) throw new Error(`Bracket entrant ${loserId} has more than one elimination`);
    const bracketRound = Math.max(1, Math.floor(match.bracketRound));
    placements.set(loserId, {
      teamId: loserId,
      place: 2 ** (maxRound - bracketRound) + 1,
      eliminatedRound: bracketRound,
    });
  }

  const missing = entrants.filter((teamId) => !placements.has(teamId));
  if (missing.length) throw new Error(`Bracket classification is incomplete: ${missing.join(', ')}`);
  if (placements.size !== entrants.length) throw new Error('Bracket classification contains unexpected teams');

  return entrants
    .map((teamId) => placements.get(teamId) as GoBracketPlacement)
    .sort((left, right) => left.place - right.place || left.teamId.localeCompare(right.teamId));
}
