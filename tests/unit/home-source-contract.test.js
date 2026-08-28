import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('home redesign source contract', () => {
  it('uses live home data and keeps mobile account access in the header', () => {
    const page = read('web/app/page.tsx');
    const landing = read('web/components/landing/LandingDesktop.tsx');
    const header = read('web/components/layout/Header.tsx');
    const account = read('web/components/layout/HeaderAccountEntry.tsx');
    expect(page).toContain('fetchHomeOverview');
    expect(page).toContain('fetchHomePersonalSnapshot');
    expect(landing).not.toContain('LandingHeroAccessPanel');
    expect(header).toContain('<HeaderAccountEntry compact />');
    expect(account).toContain("aria-label={active ? `Открыть личный кабинет: ${title}` : 'Войти на сайт'}");
    expect(landing).toContain('Играй.<br />Сохраняй результаты.<br />');
    expect(landing).not.toContain('Найди пару');
  });

  it('filters public confirmed game results and excludes drafts, disputes and reversed rows', () => {
    const home = read('web/lib/home.ts');
    expect(home).toContain("result.status = 'confirmed'");
    expect(home).toContain("result.reversed_at IS NULL");
    expect(home).toContain("post.visibility = 'public'");
    expect(home).toContain("post.status = 'completed'");
    expect(home).toContain("organizer.status = 'active'");
  });

  it('keeps game rating separate from the tournament home rating', () => {
    const landing = read('web/components/landing/LandingDesktop.tsx');
    const ranking = read('web/components/landing/HomeRankingTabs.tsx');
    expect(ranking).toContain('Рейтинг игроков');
    expect(ranking).toContain("const TABS: Array<{ key: RatingType; label: string }>");
    expect(landing).not.toContain('Игровой рейтинг');
  });

  it('updates primary navigation to games, tournaments, results and rating', () => {
    const header = read('web/components/layout/Header.tsx');
    const mobile = read('web/components/layout/MobileBottomNav.tsx');
    const chrome = read('web/components/layout/SiteChrome.tsx');
    expect(header).toContain('href: "/archive"');
    expect(header).toContain('\\u0420\\u0435\\u0437\\u0443\\u043b\\u044c\\u0442\\u0430\\u0442\\u044b');
    expect(mobile).toContain("label: 'Турниры'");
    expect(chrome).toContain("import MobileBottomNav from '@/components/layout/MobileBottomNav';");
    expect(chrome).toContain("{hideBottomNav ? null : <MobileBottomNav />}");
    expect(chrome).toContain("'site-mobile-nav-space'");
  });
});
