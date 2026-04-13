import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('cabinet access source contract', () => {
  it('wires a unified access summary into the public account entry points', () => {
    const header = read('web/components/layout/Header.tsx');
    const mobileNav = read('web/components/layout/MobileNav.tsx');
    const landing = read('web/components/landing/LandingDesktop.tsx');
    const heroPanel = read('web/components/landing/LandingHeroAccessPanel.tsx');

    expect(header).toContain('HeaderAccountEntry');
    expect(header).not.toContain('href="/court"');

    expect(mobileNav).toContain('HeaderAccountEntry mobile');
    expect(mobileNav).not.toContain('href="/court"');

    expect(landing).toContain("import LandingHeroAccessPanel from '@/components/landing/LandingHeroAccessPanel';");
    expect(landing).toContain('<LandingHeroAccessPanel />');

    expect(heroPanel).toContain('getAccessSummaryFromCookies');
    expect(heroPanel).toContain('href="/cabinet"');
    expect(heroPanel).toContain("title = active ? getAccessDisplayName(summary) : 'Вход на сайт';");
  });

  it('exposes a role-aware cabinet page and summary API', () => {
    const cabinetPage = read('web/app/cabinet/page.tsx');
    const summaryRoute = read('web/app/api/auth/summary/route.ts');
    const summaryLib = read('web/lib/access-summary.ts');

    expect(cabinetPage).toContain("title: 'Личный кабинет | Лютые Пляжники'");
    expect(cabinetPage).toContain('getAccessSummaryFromCookies');
    expect(cabinetPage).toContain('PlayerAuthPanel redirectTo="/cabinet"');
    expect(cabinetPage).toContain('href="/admin"');
    expect(cabinetPage).toContain('href="/court"');
    expect(cabinetPage).toContain('href="/sudyam/login?returnTo=%2Fcabinet"');

    expect(summaryRoute).toContain('getAccessSummaryFromCookies');
    expect(summaryRoute).toContain('judgeApproved');
    expect(summaryRoute).toContain('accessLabels');

    expect(summaryLib).toContain("return 'Администратор';");
    expect(summaryLib).toContain("return 'Оператор';");
    expect(summaryLib).toContain("return 'Судейский доступ';");
    expect(summaryLib).toContain("return 'Вход на сайт';");
  });
});
