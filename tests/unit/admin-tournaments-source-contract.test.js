import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Admin tournaments page source contract', () => {
  it('shows the legacy creation timer block only for non-Next KOTC tournaments', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toMatch(
      /\{isKotcFormat \? \(\s*<div className="rounded-xl border border-white\/15 bg-white\/5 p-4 flex flex-col gap-3">\s*<h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">/,
    );
    expect(adminPage).toContain("(kotcSettings?.kotcJudgeModule ?? settings.kotcJudgeModule) !== 'next'");
    expect(adminPage).toContain('value={settings.timerCourts}');
    expect(adminPage).toContain('value={settings.timerFinals}');
  });

  it('keeps a single KOTC Next timer control inside the dedicated Next block', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain('Таймер раундов 1–2');
    expect(adminPage).toContain('value={kotcSettings?.kotcRaundTimerMinutes ?? settings.kotcRaundTimerMinutes}');
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

  it('normalizes restored draft metadata through shared admin validators before save', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain("import { normalizeTournamentInput } from '@/lib/admin-validators';");
    expect(adminPage).toContain('const normalizedMeta = normalizeTournamentInput({');
    expect(adminPage).toContain("division: normalizedMeta.division || 'Мужской'");
    expect(adminPage).toContain("status: normalizedMeta.status || 'draft'");
  });
  it('sends trimmed tournament name in shared save payload', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain("name: String(form.name ?? '').trim()");
    expect(adminPage).toContain("location: String(form.location ?? '').trim()");
  });

  it('keeps GO playoff counts editable even in fixed-pairs mode', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain('количество команд предзаполняется по слотам категорий, но оператор может скорректировать его вручную');
    expect(adminPage).toContain('goSettings?.goMixedTeamCounts?.[league] ?? autoCounts[league] ?? minCount');
    expect(adminPage).not.toContain('disabled={isFixedPairsSeeding}');
    expect(adminPage).not.toContain('updateSettings({ goMixedTeamCounts: fixedPairsPlayoffCounts, goBracketSizes: nextSizes })');
  });

  it('rebuilds playoff counts and bracket sizes when GO bracket levels change', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain('const leagues = getGoLeaguesByBracketLevels(value);');
    expect(adminPage).toContain("goEnabledPlayoffLeagues: leagues,");
    expect(adminPage).toContain("goMixedTeamCounts: nextCounts,");
    expect(adminPage).toContain("goBracketSizes: nextSizes,");
    expect(adminPage).toContain("goBracketLevels: value,");
  });

  it('clips stale fixed-pairs playoff counts to the real available pair slots', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toContain('if (!isGoFormat || !isFixedPairsSeeding || !goSettings || !fixedPairsPlayoffCounts) return;');
    expect(adminPage).toContain('const maxAvailable = clampGoMixedLeagueTeamCount(league, Number(fixedPairsPlayoffCounts[league] ?? 0));');
    expect(adminPage).toContain('!Number.isFinite(currentValue) || currentValue > maxAvailable');
    expect(adminPage).toContain('updateSettings({ goMixedTeamCounts: nextCounts, goBracketSizes: nextSizes });');
  });
});
