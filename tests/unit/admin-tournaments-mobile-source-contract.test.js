import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  calculateTournamentCapacity,
  filterTournamentRows,
  getTournamentFormatLabel,
} from '../../web/lib/admin-tournaments-ui.ts';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('mobile admin tournaments redesign', () => {
  it('uses cards on mobile and keeps destructive actions in a menu', () => {
    const source = read('web/components/admin/tournaments/TournamentListClient.tsx');
    expect(source).toContain('className="grid gap-3 md:hidden"');
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('Поиск и фильтры');
    expect(source).toContain('Создать турнир');
    expect(source).not.toContain('className="md:hidden overflow-x-auto"');
  });

  it('uses a four-step wizard, collapses courts and explains blocked publication', () => {
    const source = read('web/components/admin/tournaments/TournamentWizard.tsx');
    expect(source).toContain("const STEPS = ['Основное', 'Формат', 'Участники', 'Проверка']");
    expect(source).toContain('<details key={court}');
    expect(source).toContain('Нужно добавить ещё {capacity - filled} игроков');
    expect(source).toContain('disabled={saving || !canPublish');
    expect(source).toContain('Сохранение черновика через мастер');
  });

  it('keeps the mobile shell compact and groups desktop navigation by role', () => {
    const shell = read('web/components/admin/AdminShell.tsx');
    const mobileNav = read('web/components/admin/AdminMobileBottomNav.tsx');
    const styles = read('web/app/globals.css');
    expect(shell).toContain('admin-shell');
    expect(shell).toContain('className="hidden gap-3 md:grid lg:grid-cols-4"');
    expect(shell).toContain('data-admin-shell-nav');
    expect(shell).toContain("href: '/coach'");
    expect(shell).toContain("minRole: 'admin'");
    expect(shell).toContain('canAccess(role, item.minRole)');
    expect(mobileNav).toContain('>Ещё</span>');
    expect(mobileNav).toContain("href: '/coach', label: 'LP Coach'");
    expect(mobileNav).toContain("label: 'Переопределения'");
    expect(styles).toContain('body:has(.admin-mobile-bottom-nav) .theme-toggle');
    expect(styles).toContain('display: none;');
  });

  it('keeps roster management discoverable globally and scoped inside a selected tournament', () => {
    const shell = read('web/components/admin/AdminShell.tsx');
    const mobileNav = read('web/components/admin/AdminMobileBottomNav.tsx');
    const list = read('web/components/admin/tournaments/TournamentListClient.tsx');
    const rosterPage = read('web/app/admin/tournaments/[id]/roster/page.tsx');
    const rosterManager = read('web/components/admin/tournaments/TournamentRosterManager.tsx');
    const legacyRosterPage = read('web/app/admin/roster/page.tsx');

    expect(shell).toContain("href: '/admin/roster'");
    expect(mobileNav).not.toContain("href: '/admin/roster'");
    expect(list).toContain("/admin/tournaments/${encodeURIComponent(row.id)}/roster");
    expect(list).toContain('row.waitlistCount');
    expect(rosterPage).toContain('TournamentRosterManager');
    expect(rosterManager).toContain("fetch('/api/admin/roster'");
    expect(rosterManager).toContain('Первый игрок из резерва');
    expect(legacyRosterPage).toContain("redirect('/admin/tournaments')");
  });

  it('localizes format labels and calculates structural capacity', () => {
    expect(getTournamentFormatLabel({ format: 'Round Robin' })).toBe('Круговой');
    expect(getTournamentFormatLabel({ format: 'Thai' })).toBe('Тайский');
    expect(calculateTournamentCapacity({
      format: 'Thai',
      settings: { courts: 4, pairsPerCourt: 4 },
    })).toBe(32);
  });

  it('filters tournament cards without a server round trip', () => {
    const rows = [
      { id: '1', name: 'Тайский микст', date: '2026-08-10', location: 'Малибу', format: 'Thai', division: 'Микст', capacity: 32, status: 'open', participantCount: 8 },
      { id: '2', name: 'Архивный KOTC', date: '2026-08-01', location: 'Малибу', format: 'King of the Court', division: 'Мужской', capacity: 16, status: 'finished', participantCount: 16 },
    ];
    const result = filterTournamentRows(rows, 'upcoming', {
      query: 'тайский',
      format: 'Тайский',
      division: '',
      dateFrom: '',
      dateTo: '',
    }, '2026-08-08');
    expect(result.map((row) => row.id)).toEqual(['1']);
  });
});
