import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('play game statistics filters contract', () => {
  it('derives confirmed game stats from roster result keys, not only rating events', () => {
    const service = read('web/lib/play-player-stats.ts');
    expect(service).toContain('JOIN play_post_participants target');
    expect(service).toContain('target.result_key::text AS "viewerResultKey"');
    expect(service).toContain("CASE WHEN pp.rating_mode = 'friendly'");
    expect(service).toContain("result.status = 'confirmed'");
    expect(service).toContain('result.reversed_at IS NULL');
    expect(service).toContain('buildPlayGameScopeInsights');
    expect(service).toContain('games,');
    expect(service).toContain('scopes,');
  });

  it('keeps the rating separate while exposing all, rated and friendly UI filters', () => {
    const card = read('web/components/profile/GameRatingCard.tsx');
    expect(card).toContain("{ id: 'all', label: 'Все' }");
    expect(card).toContain("{ id: 'rated', label: 'Рейтинговые' }");
    expect(card).toContain("{ id: 'friendly', label: 'Обычные' }");
    expect(card).toContain('Отдельно от турнирного рейтинга LPVOLLEY');
    expect(card).toContain('Обычные игры не изменяют рейтинг');
    expect(card).toContain('summary.bestPartner');
    expect(card).toContain('summary.toughestOpponent');
    expect(card).toContain('summary.recentForm');
  });
});
