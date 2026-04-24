import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('rankings medals source contract', () => {
  it('extends leaderboard types with medal fields and MedalEntry', () => {
    const types = read('web/lib/types.ts');

    expect(types).toContain('export interface LeaderboardEntry');
    expect(types).toContain('gold: number;');
    expect(types).toContain('silver: number;');
    expect(types).toContain('bronze: number;');
    expect(types).toContain('topLevel: string;');
    expect(types).toContain('export interface MedalEntry');
    expect(types).toContain('hardWins: number;');
    expect(types).toContain('advancedWins: number;');
    expect(types).toContain('mediumWins: number;');
    expect(types).toContain('lightWins: number;');
    expect(types).toContain('kotcWins: number;');
    expect(types).toContain('thaiWins: number;');
    expect(types).toContain('iptWins: number;');
    expect(types).toContain("export type TournamentFormatFilter = 'all' | 'kotc' | 'dt' | 'thai';");
  });

  it('fetches medal aggregates in SQL without N+1 queries', () => {
    const queries = read('web/lib/queries.ts');

    expect(queries).toContain('export async function fetchMedalsLeaderboard');
    expect(queries).toContain('COUNT(CASE WHEN tr.place = 1 THEN 1 END)::int AS gold');
    expect(queries).toContain('hard_wins');
    expect(queries).toContain('advanced_wins');
    expect(queries).toContain('medium_wins');
    expect(queries).toContain('light_wins');
    expect(queries).toContain('kotc_wins');
    expect(queries).toContain('thai_wins');
    expect(queries).toContain('ipt_wins');
    expect(queries).toContain("format === 'thai'");
    expect(queries).toContain("LOWER(COALESCE(t.format, '')) = 'thai'");
    expect(queries).toContain("JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'");
    expect(queries).toContain('END AS top_level');
    expect(queries).toContain('effectiveRatingPtsFromStored(');
  });

  it('exposes a validated leaderboard medals API route', () => {
    const route = read('web/app/api/leaderboard-medals/route.ts');
    const leaderboardRoute = read('web/app/api/leaderboard/route.ts');

    expect(route).toContain('fetchMedalsLeaderboard');
    expect(route).toContain("['M', 'W', 'Mix'].includes(type)");
    expect(route).toContain("['all', 'kotc', 'dt', 'thai'].includes(formatParam)");
    expect(route).toContain("NextResponse.json({ error: 'Invalid type' }, { status: 400 })");
    expect(route).toContain('Math.max(1, Math.min(100');
    expect(leaderboardRoute).toContain("['all', 'kotc', 'dt', 'thai'].includes(formatParam)");
  });

  it('keeps leaderboard and admin results publishing aligned on stored rating points', () => {
    const ratingPoints = read('web/lib/rating-points.ts');
    const adminResultsRoute = read('web/app/api/admin/tournaments/[id]/results/route.ts');
    const adminPg = read('web/lib/admin-queries-pg.ts');
    const adminPostgrest = read('web/lib/admin-postgrest.ts');
    const archivePage = read('web/app/admin/archive/page.tsx');

    expect(ratingPoints).toContain('COALESCE(${trAlias}.rating_pts, 0) > 0');
    expect(adminPg).toContain('r.ratingPts != null ? Number(r.ratingPts) : undefined');
    expect(adminPg).toContain('rating_level');
    expect(adminPostgrest).toContain('item.ratingPts != null ? Number(item.ratingPts) : undefined');
    expect(adminPostgrest).toContain('rating_level');
    expect(archivePage).toContain('updateManualRating');
    expect(archivePage).toContain('clearManualRating');
    expect(archivePage).toContain('clearAllManualRatings');
    expect(archivePage).toContain('parseArchiveResultsTsv');
    expect(archivePage).toContain('value={r.ratingLevel}');
    expect(adminResultsRoute).toContain('sanitizeArchiveRows');
    expect(adminResultsRoute).toContain('validateArchiveRows');
    expect(adminResultsRoute).toContain("return NextResponse.json({ ok: true, inserted, validation });");
  });

  it('renders a medals tab with lazy loading and profile links', () => {
    const client = read('web/app/rankings/RankingsClient.tsx');

    expect(client).toContain("type SortMode = 'pts' | 'avg' | 'trn' | 'medals'");
    expect(client).toContain("label: 'МЕДАЛИ'");
    expect(client).toContain('/api/leaderboard-medals?type=${type}&limit=100');
    expect(client).toContain("value: 'thai'");
    expect(client).toContain("label: 'THAI'");
    expect(client).toContain('function MedalItem');
    expect(client).toContain('href={`/players/${entry.playerId}`}');
    expect(client).toContain('filteredMedals');
    expect(client).toContain('zoneMeta(entry.topLevel)');
    expect(client).toContain('🥇{entry.gold}');
  });
});
