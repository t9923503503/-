import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('KOTC Next UI source contract', () => {
  it('routes canonical Sudyam KOTC Next launches into the dedicated operator page', () => {
    const sudyamPage = read('web/app/sudyam/page.tsx');
    const operatorPage = read('web/app/sudyam/kotcn/[id]/page.tsx');
    const workspace = read('web/components/kotc-next/KotcNextTournamentWorkspace.tsx');
    const panel = read('web/components/kotc-next/KotcNextOperatorPanel.tsx');

    expect(sudyamPage).toContain("payload.kotcJudgeModule === \"next\"");
    expect(sudyamPage).toContain('/sudyam/kotcn/');
    expect(operatorPage).toContain('resolveSudyamBootstrap');
    expect(operatorPage).toContain('KotcNextTournamentWorkspace');
    expect(workspace).toContain('/api/sudyam/kotcn');
    expect(workspace).toContain('KotcNextOperatorPanel');
    expect(workspace).toContain("onAction: (action) => void runKotcAction(action)");
    expect(panel).toContain('KotcNextR2SeedEditor');
    expect(panel).toContain('operatorState?.canBootstrapR1');
    expect(panel).toContain("actions.onAction('finish_r1')");
    expect(panel).toContain("actions.onAction('finish_r2')");
    expect(panel).toContain('/live/kotcn/');
    expect(panel).toContain('pickKingSideStreak');
    expect(panel).toContain('Серия короля');
  });

  it('exposes Sudyam operator actions and a public spectator page/api', () => {
    const sudyamRoute = read('web/app/api/sudyam/kotcn/route.ts');
    const publicRoute = read('web/app/api/public/kotcn-board/[tournamentId]/route.ts');
    const spectatorPage = read('web/app/live/kotcn/[id]/page.tsx');
    const spectatorBoard = read('web/components/kotc-next/KotcNextSpectatorBoard.tsx');
    const spectatorLib = read('web/lib/kotc-next/spectator.ts');

    expect(sudyamRoute).toContain('requireLiveReadAccess');
    expect(sudyamRoute).toContain('bootstrap_r1');
    expect(sudyamRoute).toContain('preview_r2_seed');
    expect(sudyamRoute).toContain('confirm_r2_seed');
    expect(sudyamRoute).toContain('bootstrap_r2');
    expect(publicRoute).toContain('getKotcNextSpectatorPayload');
    expect(publicRoute).not.toContain('requireApiRole');
    expect(spectatorPage).toContain('KotcNextSpectatorBoard');
    expect(spectatorBoard).not.toContain('router.refresh');
    expect(spectatorBoard).toContain('/api/public/kotcn-board/');
    expect(spectatorBoard).toContain('setLiveData');
    expect(spectatorBoard).toContain('kingSideStreak');
    expect(spectatorBoard).toContain('Серия короля');
    expect(spectatorLib).toContain('sanitizeKotcNextOperatorStateForSpectators');
    expect(spectatorLib).toContain('kingSideStreak');
  });

  it('maps bootstrap refresh errors to their own status instead of generic 500s', () => {
    const sudyamRoute = read('web/app/api/sudyam/kotcn/route.ts');

    expect(sudyamRoute).toContain('SudyamBootstrapError');
    expect(sudyamRoute).toContain('error instanceof SudyamBootstrapError');
    expect(sudyamRoute).toContain('status: error.status');
  });
});
