import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('mobile admin dashboard redesign', () => {
  it('keeps the first screen dense and gives the primary action priority', () => {
    const page = read('web/app/admin/page.tsx');
    expect(page).toContain('href="/admin/tournaments/new"');
    expect(page).toContain('grid grid-cols-2 gap-2.5');
    expect(page).toContain("icon=\"players\"");
    expect(page).toContain('DashboardIconName');
    expect(page).not.toMatch(/[🏐👥📅🧾]/u);
  });

  it('uses compact scan-friendly sections instead of stacked nested cards', () => {
    const page = read('web/app/admin/page.tsx');
    expect(page).toContain('formatTournamentStatus');
    expect(page).toContain('Все турниры');
    expect(page).toContain('Все игроки');
    expect(page).toContain('mt-4 space-y-3');
    expect(page).not.toContain('players.created_at');
    expect(page).not.toContain('sm:grid-cols-3');
  });

  it('renders recent audit rows as a mobile list and keeps the desktop table', () => {
    const page = read('web/app/admin/page.tsx');
    expect(page).toContain('mt-3 space-y-2 md:hidden');
    expect(page).toContain('mt-3 hidden overflow-x-auto md:block');
    expect(page).toContain('Весь журнал');
  });

  it('keeps the shared mobile admin header compact', () => {
    const shell = read('web/components/admin/AdminShell.tsx');
    expect(shell).toContain('gap-4 overflow-x-clip px-4 py-3');
    expect(shell).toContain('bg-white/[0.04] px-3 py-2.5');
    expect(shell).toContain('font-heading text-xl');
    expect(shell).toContain('md:min-h-11');
  });
});
