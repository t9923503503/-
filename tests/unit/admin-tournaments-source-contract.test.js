import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Admin tournaments page source contract', () => {
  it('shows the creation timer block only for KOTC tournaments', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toMatch(
      /\{isKotcFormat \? \(\s*<div className="rounded-xl border border-white\/15 bg-white\/5 p-4 flex flex-col gap-3">\s*<h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">/,
    );
    expect(adminPage).toContain('value={settings.timerCourts}');
    expect(adminPage).toContain('value={settings.timerFinals}');
  });

  it('keeps GO layout configurable with explicit groups controls', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain('goDeclaredTeamCount');
    expect(adminPage).toContain('goGroupCount: value');
    expect(adminPage).toContain('min={GO_ADMIN_MIN_GROUPS}');
    expect(adminPage).toContain('max={GO_ADMIN_MAX_GROUPS}');
  });

  it('auto-syncs GO mixed playoff team counts from group layout instead of fixed defaults', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain('function buildAutoGoMixedTeamCounts(');
    expect(adminPage).toContain('lyutye: groupCount * hardPerGroup');
    expect(adminPage).toContain('hard: groupCount * hardPerGroup');
    expect(adminPage).toContain('medium: groupCount * mediumPerGroup');
    expect(adminPage).toContain('lite: groupCount * litePerGroup');
  });

  it('contains GO draft autosave and preflight integration points', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');
    const preflightRoute = read('web/app/api/admin/tournaments/go-preflight/route.ts');

    expect(adminPage).toContain('goAutosaveState');
    expect(adminPage).toContain("fetch('/api/admin/tournaments/go-preflight'");
    expect(adminPage).toContain('Готовность к LIVE');
    expect(preflightRoute).toContain('canGoLive');
    expect(preflightRoute).toContain('pair-order-rule');
  });

  it('routes Thai mixed auto-add into the first empty slot of the matching gender', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain('function findFirstMatchingThaiSlot(');
    expect(adminPage).toContain('const preferredThaiSlot =');
    expect(adminPage).toContain("player.gender === 'W'");
    expect(adminPage).toContain(
      "findFirstMatchingThaiSlot(\n              current,\n              participantLimit,\n              thaiSettings.thaiVariant,\n              player.gender,",
    );
    expect(adminPage).toContain(
      "draftPlayers.filter(\n          (draftPlayer) => draftPlayer && draftPlayer.gender === player.gender,",
    );
  });

  it('exposes a dedicated KOTC Next no-takeovers toggle', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain('Без заходов');
    expect(adminPage).toContain('type="checkbox"');
    expect(adminPage).toContain("event.target.checked ? 'no_takeovers' : 'standard'");
    expect(adminPage).toContain('Таблица считается без учета заходов.');
    expect(adminPage).toContain('Заходы учитываются как дополнительный критерий.');
    expect(adminPage).toContain('kotcTakeoversMode');
  });
});
