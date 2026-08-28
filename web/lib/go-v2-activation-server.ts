import { getPool } from '@/lib/db';
import {
  assessGoEngineTransition,
  type GoEngineVersion,
} from '@/lib/go-v2-activation';

async function relationExists(name: string): Promise<boolean> {
  const result = await getPool().query<{ relation_name: string | null }>(
    'SELECT to_regclass($1)::text AS relation_name',
    [`public.${name}`],
  );
  return Boolean(result.rows[0]?.relation_name);
}

async function tournamentStateExists(table: string, tournamentId: string): Promise<boolean> {
  if (!(await relationExists(table))) return false;
  // Table names are selected only from fixed constants below, never from request data.
  const result = await getPool().query(
    `SELECT 1 FROM ${table} WHERE tournament_id = $1::uuid LIMIT 1`,
    [tournamentId],
  );
  return Boolean(result.rowCount);
}

export async function validateGoEngineTransition(input: {
  tournamentId: string;
  currentVersion: GoEngineVersion;
  nextVersion: GoEngineVersion;
  tournamentStatus: string;
  nextTournamentStatus?: string;
}): Promise<string | null> {
  if (input.currentVersion === input.nextVersion) return null;
  const [hasLegacyGoState, hasV2State] = await Promise.all([
    tournamentStateExists('go_round', input.tournamentId),
    tournamentStateExists('go_v2_tournament_state', input.tournamentId),
  ]);
  return assessGoEngineTransition({
    ...input,
    hasLegacyGoState,
    hasV2State,
  });
}
