import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Thai judge v2 source contract', () => {
  it('exposes tournament-level judge pages plus the existing confirm API', () => {
    const courtPage = read('web/app/court/[pin]/page.tsx');
    const tournamentPage = read('web/app/court/tournament/[tournamentId]/page.tsx');
    const manifestPage = read('web/app/court/[pin]/manifest.ts');
    const manifestRoute = read('web/app/court/[pin]/manifest.webmanifest/route.ts');
    const tournamentRoute = read('web/app/api/thai/judge/tournament/[tournamentId]/route.ts');
    const confirmRoute = read('web/app/api/thai/judge/[pin]/tour/[tourNumber]/confirm/route.ts');

    expect(courtPage).toContain('getThaiJudgeTournamentSnapshotByPin');
    expect(courtPage).toContain('getGoJudgeSnapshotByPin');
    expect(courtPage).toContain('ThaiTournamentJudgeWorkspace');
    expect(courtPage).toContain('GoJudgeScreen');
    expect(courtPage).toContain("manifest: `/court/${normalizedPin}/manifest.webmanifest`");
    expect(courtPage).toContain('Судья');
    expect(tournamentPage).toContain('getThaiJudgeTournamentSnapshot');
    expect(tournamentPage).toContain('ThaiTournamentJudgeWorkspace');
    expect(tournamentPage).toContain('Судейский турнир');
    expect(manifestPage).toContain('LPVOLLEY Судья');
    expect(manifestRoute).toContain('LPVOLLEY Судья');
    expect(tournamentRoute).toContain('getThaiJudgeTournamentSnapshot');
    expect(tournamentRoute).toContain("selectedRoundType: normalizeRoundType(searchParams.get('round'))");
    expect(tournamentRoute).toContain("selectedCourtNo: normalizeCourtNo(searchParams.get('court'))");
    expect(confirmRoute).toContain('confirmThaiTourByPin');
    expect(confirmRoute).toContain("status: error.status");
  });

  it('keeps court confirm semantics while wrapping them in a tournament shell with round and court tabs', () => {
    const workspace = read('web/components/thai-live/ThaiJudgeWorkspace.tsx');
    const tournamentWorkspace = read('web/components/thai-live/ThaiTournamentJudgeWorkspace.tsx');
    const service = read('web/lib/thai-live/service.ts');
    const types = read('web/lib/thai-live/types.ts');

    expect(workspace).toContain('getRegistrations');
    expect(workspace).toContain('unregister');
    expect(workspace).toContain('buildThaiJudgeDraftKey');
    expect(workspace).toContain('resolveThaiJudgeDraftState');
    expect(workspace).toContain('localStorage.setItem');
    expect(workspace).toContain("navigationMode = 'standalone'");
    expect(workspace).toContain('onSnapshotChange?.(payload.snapshot)');
    expect(workspace).toContain('snapshot.courtNav.length > 1');
    expect(workspace).toContain('snapshot.roundNav.map');
    expect(workspace).toContain('clampThaiJudgeScore');
    expect(workspace).toContain('scoreErrorsByMatch');
    expect(workspace).toContain('confirmBlockedReason');
    expect(workspace).toContain('undoLastScoreAction');
    expect(workspace).toContain('Обновлено {freshnessLabel}');
    expect(workspace).toContain('Черновик сохранён');
    expect(workspace).toContain('Ввести');
    expect(workspace).toContain('handleScoreTap');
    expect(workspace).toContain('resolveJudgeHeadline(snapshot)');
    expect(workspace).toContain('resolveJudgeSlotPair(snapshot)');
    expect(workspace).toContain('canAutoRefreshToNextStage');
    expect(workspace).toContain('formatStandingDelta');

    expect(tournamentWorkspace).toContain('/api/thai/judge/tournament/');
    expect(tournamentWorkspace).toContain('ThaiJudgeWorkspace');
    expect(tournamentWorkspace).toContain("navigationMode=\"embedded\"");
    expect(tournamentWorkspace).toContain('usePathname');
    expect(tournamentWorkspace).toContain('useRouter');
    expect(tournamentWorkspace).toContain('buildThaiTournamentSelectionUrl');
    expect(tournamentWorkspace).toContain('resolveCourtSelectionHref');
    expect(tournamentWorkspace).toContain('resolveAutoAdvanceHref');
    expect(tournamentWorkspace).toContain('router.replace');
    expect(tournamentWorkspace).toContain('canAutoRefreshToNextStage');
    expect(tournamentWorkspace).toContain('unavailableReason');
    expect(tournamentWorkspace).toContain('snapshot.rounds.map');
    expect(tournamentWorkspace).toContain('selectedRound.courts.map');
    expect(tournamentWorkspace).toContain('switchSelection');
    expect(tournamentWorkspace).toContain('court.judgeUrl');
    expect(tournamentWorkspace).toContain('/court/tournament/${encodeURIComponent(tournamentId)}?');

    expect(types).toContain('export interface ThaiJudgeCourtNavItem');
    expect(types).toContain('export interface ThaiJudgeRoundNavItem');
    expect(types).toContain('export interface ThaiJudgeTournamentCourtTabItem');
    expect(types).toContain('export interface ThaiJudgeTournamentRoundItem');
    expect(types).toContain('export interface ThaiJudgeTournamentSnapshot');
    expect(types).toContain('roundNav: ThaiJudgeRoundNavItem[];');
    expect(types).toContain('courtNav: ThaiJudgeCourtNavItem[];');
    expect(types).toContain('activeSnapshot: ThaiJudgeSnapshot;');
    expect(types).toContain('lastUpdatedAt: string;');
    expect(types).toContain('canAutoRefreshToNextStage: boolean;');
    expect(types).toContain('unavailableReason: string | null;');

    expect(service).toContain('async function loadJudgeCourtNavTx');
    expect(service).toContain('async function loadJudgeRoundNavTx');
    expect(service).toContain('async function loadJudgeTournamentSnapshotTx');
    expect(service).toContain('judgeSnapshotTimestamp');
    expect(service).toContain('getThaiJudgeTournamentSnapshot(');
    expect(service).toContain('getThaiJudgeTournamentSnapshotByPin');
    expect(service).toContain('const roundNav = await loadJudgeRoundNavTx');
    expect(service).toContain('courtNav = await loadJudgeCourtNavTx');
    expect(service).toContain('lastUpdatedAt: snapshotTimestamp');
    expect(service).toContain('canAutoRefreshToNextStage');
    expect(service).toContain('resolveCourtProgress');
    expect(service).toContain("if (rosterMode === 'manual')");
    expect(service).not.toContain("kind: 'waiting'");
  });

  it('keeps operator CTA on tournament entry and still exposes direct court links as fallback', () => {
    const bootstrap = read('web/lib/sudyam-bootstrap.ts');
    const workspace = read('web/components/sudyam/SudyamFormatWorkspace.tsx');
    const operatorPanel = read('web/components/thai-live/ThaiOperatorPanel.tsx');
    const adminPage = read('web/app/admin/tournaments/page.tsx');
    const cabinetPage = read('web/app/cabinet/page.tsx');
    const courtEntry = read('web/app/court/page.tsx');

    expect(bootstrap).toContain('buildThaiJudgeRelativeUrl');
    expect(bootstrap).toContain('thaiJudgeNeedsBootstrap');
    expect(bootstrap).toContain('thaiJudgeBlockedReason');
    expect(workspace).toContain('ThaiOperatorPanel');
    expect(operatorPanel).toContain('buildThaiTournamentJudgeUrl');
    expect(operatorPanel).toContain('This tournament has no materialized Thai Next state yet.');
    expect(operatorPanel).toContain("const isManualRosterMode = rosterMode === 'manual';");
    expect(operatorPanel).toContain("onClick={() => bootstrap.onConfirmPreview()}");
    expect(operatorPanel).toContain('Запустить R1');
    expect(adminPage).toContain('thaiRosterMode');
    expect(adminPage).toContain('Состав R1:');
    expect(adminPage).toContain('Вручную');
    expect(cabinetPage).toContain('summary.judgeApproved');
    expect(cabinetPage).toContain('href="/court"');
    expect(courtEntry).toContain('fetchActiveThaiJudgeTournaments');
    expect(courtEntry).toContain('/court/tournament/');
  });
});
