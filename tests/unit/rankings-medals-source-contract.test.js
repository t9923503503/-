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
    expect(queries).toContain("JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'");
    expect(queries).toContain('END AS top_level');
  });

  it('exposes a validated leaderboard medals API route', () => {
    const route = read('web/app/api/leaderboard-medals/route.ts');

    expect(route).toContain('fetchMedalsLeaderboard');
    expect(route).toContain("['M', 'W', 'Mix'].includes(type)");
    expect(route).toContain("NextResponse.json({ error: 'Invalid type' }, { status: 400 })");
    expect(route).toContain('Math.max(1, Math.min(100');
  });

  it('renders a medals tab with lazy loading and profile links', () => {
    const client = read('web/app/rankings/RankingsClient.tsx');

    expect(client).toContain("type SortMode = 'pts' | 'avg' | 'trn' | 'medals'");
    expect(client).toContain("label: 'МЕДАЛИ'");
    expect(client).toContain('/api/leaderboard-medals?type=${type}&limit=100');
    expect(client).toContain('function MedalItem');
    expect(client).toContain('href={`/players/${entry.playerId}`}');
    expect(client).toContain('filteredMedals');
    expect(client).toContain('zoneMeta(entry.topLevel)');
    expect(client).toContain('🥇{entry.gold}');
  });
});
