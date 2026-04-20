import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Thai admin live source contract', () => {
  it('links admin tournaments to a dedicated Thai live control page that hosts the shared operator panel', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');
    const thaiLivePage = read('web/app/admin/tournaments/[id]/thai-live/page.tsx');
    const controlClient = read('web/components/thai-live/ThaiTournamentControlClient.tsx');

    expect(adminPage).toContain('/thai-live');
    expect(adminPage).not.toContain('<ThaiOperatorPanel');
    expect(thaiLivePage).toContain('ThaiTournamentControlClient');
    expect(controlClient).toContain('<ThaiOperatorPanel');
    expect(controlClient).toContain('/thai-live');
    expect(controlClient).toContain('/thai-action');
  });

  it('provides an admin read route backed by resolveSudyamBootstrap', () => {
    const route = read('web/app/api/admin/tournaments/[id]/thai-live/route.ts');

    expect(route).toContain("requireApiRole(req, 'viewer')");
    expect(route).toContain('resolveSudyamBootstrap');
    expect(route).toContain("resolveSudyamBootstrap(id, 'thai')");
  });

  it('provides an admin write route for Thai live actions', () => {
    const route = read('web/app/api/admin/tournaments/[id]/thai-action/route.ts');

    expect(route).toContain('bootstrap_r1');
    expect(route).toContain('preview_draw');
    expect(route).toContain('preview_r2_seed');
    expect(route).toContain('confirm_r2_seed');
    expect(route).toContain('finish_r1');
    expect(route).toContain('finish_r2');
    expect(route).toContain('runThaiOperatorAction');
    expect(route).toContain('confirmThaiR2Seed');
  });

  it('auto-syncs Thai Next results into tournament_results when the tournament is finished', () => {
    const tournamentsRoute = read('web/app/api/admin/tournaments/route.ts');
    const overridesRoute = read('web/app/api/admin/overrides/route.ts');
    const syncLib = read('web/lib/thai-live/sync-tournament-results.ts');
    const adminQueries = read('web/lib/admin-queries.ts');
    const control = read('web/components/thai-live/ThaiTournamentControlClient.tsx');

    expect(syncLib).toContain('isThaiNextTournamentForRatingSync');
    expect(syncLib).toContain('syncThaiStandingsToTournamentResultsOrThrowBadRequest');
    expect(tournamentsRoute).toContain('syncThaiStandingsToTournamentResultsOrThrowBadRequest');
    expect(overridesRoute).toContain('syncThaiStandingsToTournamentResultsOrThrowBadRequest');
    expect(adminQueries).toContain('if (process.env.DATABASE_URL)');
    expect(adminQueries).toContain('return pgQueries.upsertTournamentResults(tournamentId, results);');
    expect(control).toContain('автоматически попадут в общий рейтинг и архив');
    expect(control).toContain('Пересчитать Thai в рейтинг / архив');
  });

  it('keeps Sudyam Thai workspace as a thin wrapper around the shared operator panel', () => {
    const workspace = read('web/components/sudyam/SudyamFormatWorkspace.tsx');

    expect(workspace).toContain('ThaiOperatorPanel');
    expect(workspace).toContain('return (');
    expect(workspace).toContain('<ThaiOperatorPanel data={data} bootstrap={bootstrap} actions={actions} />');
  });

  it('exposes a public spectator board route and API without admin auth', () => {
    const page = read('web/app/live/thai/[tournamentId]/page.tsx');
    const api = read('web/app/api/public/thai-board/[tournamentId]/route.ts');
    const lib = read('web/lib/thai-spectator.ts');
    const board = read('web/components/thai-live/ThaiSpectatorBoard.tsx');
    const panel = read('web/components/thai-live/ThaiOperatorPanel.tsx');
    const control = read('web/components/thai-live/ThaiTournamentControlClient.tsx');

    expect(page).toContain('getThaiSpectatorBoardPayload');
    expect(page).toContain('ThaiSpectatorBoard');
    expect(api).toContain('getThaiSpectatorBoardPayload');
    expect(api).not.toContain('requireApiRole');
    expect(lib).toContain('sanitizeThaiOperatorStateForSpectators');
    expect(lib).toContain("Omit<ThaiOperatorCourtRoundView, 'pin' | 'judgeUrl'>");
    expect(lib).toContain('funStats');
    expect(lib).toContain('getThaiTournamentFunStats');
    expect(board).toContain('ThaiSpectatorFunStats');
    expect(board).toContain('data.funStats');
    expect(board).toContain('История очков');
    expect(board).toContain('pointHistory.length');
    expect(board).toContain('side-out');
    expect(panel).toContain('/live/thai/');
    expect(control).toContain('/live/thai/');
  });
});
