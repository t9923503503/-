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

    expect(header).toContain('HeaderAccountEntry');
    expect(header).not.toContain('href="/court"');

    expect(mobileNav).toContain('HeaderAccountEntry mobile');
    expect(mobileNav).not.toContain('href="/court"');

    expect(landing).toContain('function PersonalActivity');
    expect(landing).toContain('href="/cabinet"');
    expect(landing).toContain('<PersonalActivity personal={personal} />');
  });

  it('exposes a role-aware cabinet page and summary API', () => {
    const cabinetPage = read('web/app/cabinet/page.tsx');
    const authPanel = read('web/components/profile/PlayerAuthPanel.tsx');
    const logoutButton = read('web/components/profile/LogoutButton.tsx');
    const globalStyles = read('web/app/globals.css');
    const summaryRoute = read('web/app/api/auth/summary/route.ts');
    const summaryLib = read('web/lib/access-summary.ts');

    expect(cabinetPage).toContain("title: 'Личный кабинет | Лютые Пляжники'");
    expect(cabinetPage).toContain('getAccessSummaryFromCookies');
    expect(cabinetPage).toContain("import PlayerCabinetPage from '@/components/profile/PlayerCabinetPage';");
    expect(cabinetPage).toContain('if (summary.player)');
    expect(cabinetPage).toContain('<PlayerCabinetPage searchParams={searchParams} />');
    expect(cabinetPage).toContain('appearance="compact"');
    expect(cabinetPage).toContain('/images/cabinet/login-hero.webp');
    expect(cabinetPage).toContain('Играй.');
    expect(cabinetPage).toContain('Поднимайся в рейтинге.');
    expect(cabinetPage).toContain('Для судей');
    expect(cabinetPage).toContain('Вход для судей по PIN');
    expect(cabinetPage).toContain('{summary.admin ? (');
    expect(cabinetPage).toContain('href="/admin"');
    expect(cabinetPage).toContain('href="/court"');
    expect(cabinetPage).toContain("'/sudyam/login?returnTo=%2Fcabinet'");
    expect(cabinetPage).not.toContain('href="/admin/login"');
    expect(cabinetPage).not.toContain('Account Hub');
    expect(cabinetPage).not.toContain('Actor ID');
    expect(cabinetPage).not.toContain('Admin-сессия');
    expect(cabinetPage).not.toContain('Операторская');

    expect(authPanel).toContain('appearance?: "default" | "compact"');
    expect(authPanel).toContain('Войти в личный кабинет');
    expect(authPanel).toContain('Выберите способ входа');
    expect(authPanel).toContain('Согласие для входа через VK ID');
    expect(authPanel).toContain('cabinet-auth-details--method');
    expect(authPanel).toContain('Показать пароль');
    expect(authPanel).toContain('Скрыть пароль');
    expect(authPanel).toContain('Нет аккаунта по email?');
    expect(authPanel).toContain('{loading ? "Входим..." : "Войти"}');
    expect(globalStyles).toContain('.cabinet-login-shell');
    expect(globalStyles).toContain('@media (max-width: 1023px)');

    expect(logoutButton).toContain('scope?: "player" | "admin"');
    expect(logoutButton).toContain('scope === "admin" ? "DELETE" : "POST"');

    expect(summaryRoute).toContain('getAccessSummaryFromCookies');
    expect(summaryRoute).toContain('judgeApproved');
    expect(summaryRoute).toContain('accessLabels');

    expect(summaryLib).toContain("return 'Администратор';");
    expect(summaryLib).toContain("return 'Оператор';");
    expect(summaryLib).toContain("return 'Судейский доступ';");
    expect(summaryLib).toContain("return 'Вход на сайт';");
  });
});
