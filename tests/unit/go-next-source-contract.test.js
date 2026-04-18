import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('GO Next backend source contract', () => {
  it('wires admin GO actions and reset flow through dedicated routes', () => {
    const actionRoute = read('web/app/api/admin/tournaments/[id]/go-action/route.ts');
    const standingsRoute = read('web/app/api/admin/tournaments/[id]/go-standings/route.ts');
    const bracketRoute = read('web/app/api/admin/tournaments/[id]/go-bracket/route.ts');
    const matchPatchRoute = read('web/app/api/admin/tournaments/[id]/go-matches/[matchId]/route.ts');
    const resetRoute = read('web/app/api/admin/tournaments/[id]/reset-go/route.ts');

    expect(actionRoute).toContain("requireApiRole(req, 'operator')");
    expect(actionRoute).toContain('runGoOperatorAction');
    expect(standingsRoute).toContain('getGoAdminBundle');
    expect(bracketRoute).toContain('seedDraft');
    expect(matchPatchRoute).toContain("requireApiRole(req, 'operator')");
    expect(matchPatchRoute).toContain('patchGoMatchByOperator');
    expect(matchPatchRoute).toContain("action: 'go.match.patch'");
    expect(resetRoute).toContain('resetGoState');
    expect(resetRoute).toContain("action: 'tournament.resetGo'");
  });

  it('exposes judge, judge-action and public spectator APIs for GO', () => {
    const judgeRoute = read('web/app/api/go/judge/[pin]/route.ts');
    const scoreRoute = read('web/app/api/go/judge/[pin]/score/route.ts');
    const judgeActionRoute = read('web/app/api/go/judge/[pin]/action/route.ts');
    const publicRoute = read('web/app/api/public/go-board/[tournamentId]/route.ts');
    const service = read('web/lib/go-next/service.ts');

    expect(judgeRoute).toContain('getGoJudgeSnapshotByPin');
    expect(scoreRoute).toContain('submitGoMatchScore');
    expect(scoreRoute).toContain('walkoverMatch');
    expect(judgeActionRoute).toContain('runGoJudgeAction');
    expect(judgeActionRoute).toContain('version_conflict');
    expect(publicRoute).toContain('getGoSpectatorPayload');
    expect(publicRoute).not.toContain('requireApiRole');
    expect(service).toContain('runGoOperatorAction');
    expect(service).toContain('patchGoMatchByOperator');
    expect(service).toContain('runGoJudgeAction');
    expect(service).toContain('resetGoState');
  });

  it('keeps GO judge UI reachable from shared court pins and resyncs manual seed drafts', () => {
    const courtPage = read('web/app/court/[pin]/page.tsx');
    const manifest = read('web/app/court/[pin]/manifest.ts');
    const manifestRoute = read('web/app/court/[pin]/manifest.webmanifest/route.ts');
    const rootManifestRoute = read('web/app/manifest.webmanifest/route.ts');
    const judgeScreen = read('web/components/go-next/GoJudgeScreen.tsx');
    const seedEditor = read('web/components/go-next/GoSeedEditor.tsx');

    expect(courtPage).toContain('getGoJudgeSnapshotByPin');
    expect(courtPage).toContain('GoJudgeScreen');
    expect(manifest).toContain('LPVOLLEY Judge');
    expect(manifestRoute).toContain("Content-Type': 'application/manifest+json");
    expect(rootManifestRoute).toContain("Content-Type': 'application/manifest+json");
    expect(judgeScreen).toContain('/api/go/judge/');
    expect(judgeScreen).toContain('/score');
    expect(judgeScreen).toContain('/action');
    expect(judgeScreen).toContain('canScoreMatch');
    expect(judgeScreen).toContain('пары TBD');
    expect(judgeScreen).toContain('Подача:');
    expect(judgeScreen).toContain('Выбрать подающего');
    expect(judgeScreen).toContain('Начать матч');
    expect(judgeScreen).toContain('Завершить матч');
    expect(judgeScreen).toContain('Далее на этом корте');
    expect(judgeScreen).toContain('mark_live');
    expect(judgeScreen).toContain('Матч ещё не сформирован');
    expect(seedEditor).toContain('useEffect');
    expect(seedEditor).toContain('setDraft(initialDraft);');
  });

  it('keeps GO operator schedule interactive: click-to-edit, drag handle and inline score', () => {
    const scheduleGrid = read('web/components/go-next/schedule/GoScheduleGrid.tsx');

    expect(scheduleGrid).toContain('go-matches');
    expect(scheduleGrid).toContain('allowLiveReschedule');
    expect(scheduleGrid).toContain('allowFinishedReschedule');
    expect(scheduleGrid).toContain('draggable');
    expect(scheduleGrid).toContain('⠿');
    expect(scheduleGrid).toContain('inlineScoreEdit');
    expect(scheduleGrid).toContain('datetime-local');
    expect(scheduleGrid).toContain("value=\"cancelled\"");
  });
});
