import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('player head-to-head source contract', () => {
  it('serves candidate search and pair details from a JSON route', () => {
    const route = read('web/app/api/players/[id]/head-to-head/route.ts');
    expect(route).toContain('fetchHeadToHeadCandidates');
    expect(route).toContain('fetchHeadToHeadDetails');
    expect(route).toContain("request.nextUrl.searchParams.get('otherId')");
    expect(route).toContain('NextResponse.json');
  });

  it('uses only confirmed THAI matches with stored scores and team compositions', () => {
    const service = read('web/lib/player-head-to-head.ts');
    expect(service).toContain("m.status = 'confirmed'");
    expect(service).toContain('m.team1_score IS NOT NULL');
    expect(service).toContain('JOIN thai_match_player self');
    expect(service).toContain('JOIN thai_match_player other');
    expect(service).toContain("format: 'THAI'");
    expect(service).toContain('summary: {');
    expect(service).toContain('recentForm: recentForm(meetings)');
    expect(service).toContain('currentStreak: currentStreak(meetings)');
    expect(service).toContain('const teams = meetingTeams(matchRows');
    expect(service).toContain('team1: team(1)');
    expect(service).toContain('tournaments,');
  });

  it('does not expose an HTML response parsing error in the profile UI', () => {
    const profile = read('web/components/players/EpicProfile.tsx');
    const headToHead = read('web/components/players/PlayerHeadToHead.tsx');
    expect(profile).toContain("import PlayerHeadToHead from '@/components/players/PlayerHeadToHead';");
    expect(profile).toContain('(0, a.jsx)(PlayerHeadToHead');
    expect(headToHead).toContain('parseApiJson');
    expect(headToHead).toContain('Сервис личных встреч временно недоступен');
    expect(headToHead).toContain('data-head-to-head-version="2"');
    expect(headToHead).toContain('sm:truncate sm:text-4xl');
    expect(headToHead).toContain('grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2');
    expect(headToHead).toContain('shrink-0 font-heading text-2xl text-emerald-300');
    expect(headToHead).toContain("url.searchParams.set('vs', otherId)");
    expect(headToHead).toContain('<TeamNames players={meeting.team1}');
    expect(headToHead).toContain('Повторить');
  });

  it('keeps the personal-meetings guide connected to all four supplied slides', () => {
    const rankings = read('web/app/rankings/RankingsClient.tsx');
    const guide = read('web/app/rankings/RankingsGuide.tsx');
    expect(rankings).toContain("import RankingsGuide from './RankingsGuide';");
    expect(rankings).toContain('(0, a.jsx)(RankingsGuide, {})');
    expect(guide).toContain('Новый гайд: личные встречи игроков');
    expect(guide.match(/\/images\/rankings\/guide\//g)).toHaveLength(4);
    expect(guide).toContain('aria-modal="true"');
  });
});
