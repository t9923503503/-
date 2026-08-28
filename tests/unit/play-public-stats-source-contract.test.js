import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('public game statistics contract', () => {
  it('shares the server-side player stats loader with the personal API', () => {
    const route = read('web/app/api/me/game-rating/route.ts');
    const service = read('web/lib/play-player-stats.ts');
    expect(route).toContain('fetchPlayPlayerStatsForUser');
    expect(service).toContain('fetchPublicPlayPlayerStats');
    expect(service).toContain("pp.visibility = 'public'");
    expect(service).toContain("result.status = 'confirmed'");
    expect(service).toContain('result.reversed_at IS NULL');
  });

  it('renders a zero state on public player profiles before the first game', () => {
    const page = read('web/app/players/[id]/page.tsx');
    const card = read('web/components/players/PlayerGameStats.tsx');
    expect(page).toContain('fetchPublicPlayPlayerStats');
    expect(page).toContain('<PlayerGameStats stats={gameStats} />');
    expect(card).toContain('Статистика появится после первого подтверждённого матча');
  });
});
