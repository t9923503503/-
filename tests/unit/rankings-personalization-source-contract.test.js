import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('rankings personalization source contract', () => {
  it('calculates position movement against the table before the latest tournament date', () => {
    const types = read('web/lib/types.ts');
    const queries = read('web/lib/queries.ts');

    expect(types).toContain('previousRank: number | null;');
    expect(types).toContain('rankDelta: number | null;');
    expect(queries).toContain('latest_date AS (');
    expect(queries).toContain('AND t.date < latest_date.value');
    expect(queries).toContain('previousRankByPlayerId');
    expect(queries).toContain('rankDeltaM: number | null;');
    expect(queries).toContain('previous_ranked AS (');
    expect(queries).toContain('previousRank - rank');
  });

  it('shows movement only for the points order and highlights the linked player', () => {
    const client = read('web/app/rankings/RankingsClient.tsx');
    const badge = read('web/components/rankings/RankMovementBadge.tsx');
    const myPlace = read('web/components/rankings/RankingsMyPlace.tsx');

    expect(client).toContain("import RankMovementBadge from '@/components/rankings/RankMovementBadge';");
    expect(client).toContain('"pts" === s');
    expect(client).toContain('isMe: e.playerId === myPlayerId');
    expect(client).toContain('scrollIntoView({ behavior: "smooth", block: "center" })');
    expect(badge).toContain('▲{delta}');
    expect(badge).toContain('▼{Math.abs(delta)}');
    expect(badge).toContain('NEW');
    expect(myPlace).toContain("fetch('/api/auth/player-link'");
    expect(myPlace).toContain('payload.linked_player || payload.resolved_player');
    expect(myPlace).toContain('Моё место');
    expect(myPlace).toContain('Войти и найти себя');
    expect(myPlace).toContain('/profile?tab=settings');
  });

  it('publishes a dynamic social card and previews it before sharing', () => {
    const playerPage = read('web/app/players/[id]/page.tsx');
    const imageRoute = read('web/app/players/[id]/opengraph-image.tsx');
    const shareCard = read('web/components/players/PlayerShareCard.tsx');

    expect(playerPage).toContain('/opengraph-image`');
    expect(playerPage).toContain("card: 'summary_large_image'");
    expect(imageRoute).toContain("import { ImageResponse } from 'next/og';");
    expect(imageRoute).toContain('stats.rankDeltaMix');
    expect(imageRoute).toContain('LPVOLLEY.RU');
    expect(shareCard).toContain('Готово для сторис и чатов');
    expect(shareCard).toContain('Карточка игрока');
    expect(shareCard).toContain('shareType: \'player_card\'');
  });
});
