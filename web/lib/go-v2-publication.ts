import { getPool } from '@/lib/db';
import { isGoV2PublicEnabled } from '@/lib/go-v2-activation';

type PublicationRow = {
  go_engine_version: number | string | null;
  settings: Record<string, unknown> | null;
  publication_state: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function isGoV2TournamentPublic(tournamentId: string): Promise<boolean> {
  if (!UUID_PATTERN.test(tournamentId)) return false;
  const result = await getPool().query<PublicationRow>(
    `SELECT tournament.go_engine_version,
            tournament.settings,
            state.publication_state
       FROM tournaments tournament
       LEFT JOIN go_v2_tournament_state state
         ON state.tournament_id = tournament.id
      WHERE tournament.id = $1::uuid
      LIMIT 1`,
    [tournamentId],
  );
  const row = result.rows[0];
  if (!row) return false;
  return row.publication_state === 'published' && isGoV2PublicEnabled({
    goEngineVersion: row.go_engine_version,
    settings: row.settings,
  });
}
