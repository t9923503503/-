import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('profile layout source contract', () => {
  it('keeps the public player page wired to the shared compact profile with share support', () => {
    const playerPage = read('web/app/players/[id]/page.tsx');

    expect(playerPage).toContain("import EpicProfile from '@/components/players/EpicProfile';");
    expect(playerPage).toContain('sharePath={`/players/${player.id}`}');
    expect(playerPage).not.toContain('PlayerPhotoUploadForm');
    expect(playerPage).not.toContain('MyAccountCard');
  });

  it('keeps /cabinet private and URL-tabbed while /profile redirects legacy links', () => {
    const redirectPage = read('web/app/profile/page.tsx');
    const cabinet = read('web/components/profile/PlayerCabinetPage.tsx');

    expect(cabinet).toContain("{ key: 'overview', label: 'Обзор' }");
    expect(cabinet).toContain("{ key: 'games', label: 'Игры' }");
    expect(cabinet).toContain("{ key: 'stats', label: 'Статистика' }");
    expect(cabinet).toContain("{ key: 'history', label: 'История' }");
    expect(cabinet).toContain("{ key: 'settings', label: 'Настройки' }");
    expect(redirectPage).toContain('redirectLegacyPublicProfile');
    expect(redirectPage).toContain('redirect(`/players/${encodeURIComponent(rawId)}`)');
    expect(redirectPage).toContain("redirect(tab ? `/cabinet?tab=${encodeURIComponent(tab)}` : '/cabinet')");
    expect(cabinet).toContain("href={item.key === 'overview' ? '/cabinet' : `/cabinet?tab=${item.key}`}");
    expect(cabinet).toContain('aria-current={active ? \'page\' : undefined}');
    expect(cabinet).toContain('<PlayAvailabilityWidget current={availability} />');
    expect(cabinet).toContain('<PlayEntries mode="summary" />');
  });

  it('renders a compact profile hero with share and settings-friendly match history', () => {
    const profileSource = read('web/components/players/EpicProfile.tsx');
    const shareSource = read('web/components/players/PlayerShareCard.tsx');

    expect(profileSource).toContain("import PlayerShareCard from '@/components/players/PlayerShareCard';");
    expect(profileSource).toContain('(0, a.jsx)(PlayerShareCard');
    expect(shareSource).toContain('navigator.share');
    expect(shareSource).toContain('Поделиться карточкой');
    expect(shareSource).toContain('role="dialog"');
    expect(shareSource).toContain('/opengraph-image');
    expect(profileSource).toContain('Главное о форме и результатах');
    expect(profileSource).toContain('История матчей');
    expect(profileSource).toContain('Пока нет сыгранных матчей');
    expect(profileSource).toContain('initialSection: profileInitialSection = "overview"');
    expect(profileSource).toContain('sectionOnly: profileSectionOnly = !1');
  });

  it('keeps the public profile tab-first, mobile-sticky, and focused on the latest season path', () => {
    const profileSource = read('web/components/players/EpicProfile.tsx');
    const shareSource = read('web/components/players/PlayerShareCard.tsx');

    expect(profileSource).toContain('[J, V] = (0, l.useState)("tabs")');
    expect(profileSource).toContain('window.localStorage.getItem(C)');
    expect(profileSource).toContain('("tabs" === e || "list" === e) && V(e)');
    expect(profileSource).toContain('sticky top-16 z-40 grid grid-cols-4');
    expect(profileSource).toContain('sm:static sm:z-auto');
    expect(profileSource).toContain('overflow-clip rounded-[30px]');

    const currentFormStart = profileSource.indexOf('title: "Текущая форма"');
    const currentFormEnd = profileSource.indexOf(
      'accent: "text-[#ff6a00]"',
      currentFormStart,
    );
    const currentForm = profileSource.slice(currentFormStart, currentFormEnd);
    expect(currentForm).toContain('formatLatestResult(latestResult)');
    expect(currentForm).not.toContain('x.bestTournament');

    expect(profileSource).toContain('latestSeasonYear = getTournamentYear(latestResult)');
    expect(profileSource).toContain('getTournamentYear(e) === latestSeasonYear');
    expect(profileSource).toContain('"Путь сезона ".concat(latestSeasonYear)');
    expect(profileSource).toContain('"Серия подиумов x".concat');
    expect(profileSource).toContain('"aria-label": "Путь сезона игрока"');
    expect(profileSource).toContain('entries: recentResults');
    expect(profileSource).toContain('.reverse()');
    expect(shareSource).toContain('inline-flex min-h-11 items-center justify-center');
    expect(profileSource).toContain('[&>button]:min-h-11');
    expect(profileSource).toContain('"min-h-11 rounded-lg px-3 py-1.5');
  });
});
