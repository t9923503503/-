import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('admin dashboard source contract', () => {
  it('builds the admin homepage as an action-first hub with deep links', () => {
    const page = read('web/app/admin/page.tsx');

    expect(page).toContain('data-admin-dashboard');
    expect(page).toContain('data-admin-action-hub');
    expect(page).toContain('Что делать сейчас');
    expect(page).toContain("href: '/admin/tournaments'");
    expect(page).toContain("href: '/admin/requests'");
    expect(page).toContain("href: '/admin/archive'");
    expect(page).toContain("href: '/admin/roster'");
    expect(page).toContain("href: '/admin/reports'");
    expect(page).toContain('Live-форматы:');
    expect(page).toContain('Ближайшие 3:');
  });

  it('renders attention queues, upcoming tournaments and human-readable audit labels', () => {
    const page = read('web/app/admin/page.tsx');

    expect(page).toContain('data-admin-attention-queues');
    expect(page).toContain('data-admin-upcoming-tournaments');
    expect(page).toContain('data-admin-recent-actions');
    expect(page).toContain('function getAuditActionLabel(');
    expect(page).toContain('function formatAuditEntity(');
    expect(page).not.toContain('{row.action}');
    expect(page).not.toContain('{row.entityType}:{row.entityId}');
    expect(page).toContain('actionLabel: launchTarget ? `Открыть · ${launchTarget.label}` : \'Открыть реестр\'');
  });

  it('keeps role-aware homepage behavior and grouped admin shell navigation', () => {
    const page = read('web/app/admin/page.tsx');
    const shell = read('web/components/admin/AdminShell.tsx');

    expect(page).toContain('const operatorView = isOperatorRole(role);');
    expect(page).toContain('data-admin-viewer-overview');
    expect(page).toContain('Роль `viewer` получает обзор');
    expect(shell).toContain("title: 'Операции'");
    expect(shell).toContain("title: 'Игроки'");
    expect(shell).toContain("title: 'Турниры'");
    expect(shell).toContain("title: 'Контроль / аудит'");
    expect(shell).toContain("tone: 'primary'");
    expect(shell).toContain("tone: 'muted'");
    expect(shell).toContain("minRole: 'operator'");
    expect(shell).toContain('data-admin-shell-nav');
  });
});
