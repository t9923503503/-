import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('KOTC Next integration source contract', () => {
  it('keeps admin, Sudyam and judge entrypoints aligned on one KOTC Next flow', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');
    const sudyamRoute = read('web/app/api/sudyam/kotcn/route.ts');
    const workspace = read('web/components/kotc-next/KotcNextTournamentWorkspace.tsx');
    const operatorPage = read('web/app/sudyam/kotcn/[id]/page.tsx');
    const judgePage = read('web/app/kotc-next/judge/[pin]/page.tsx');

    expect(adminPage).toContain('/sudyam/kotcn/');
    expect(adminPage).toContain('KOTC Next Control');
    expect(sudyamRoute).toContain('requireLiveReadAccess');
    expect(sudyamRoute).toContain('bootstrap_r1');
    expect(sudyamRoute).toContain('finish_r1');
    expect(sudyamRoute).toContain('preview_r2_seed');
    expect(sudyamRoute).toContain('confirm_r2_seed');
    expect(sudyamRoute).toContain('bootstrap_r2');
    expect(sudyamRoute).toContain('finish_r2');
    expect(workspace).toContain('/api/sudyam/kotcn');
    expect(workspace).toContain("action === 'bootstrap_r1'");
    expect(workspace).toContain("'finish_r1'");
    expect(workspace).toContain("'finish_r2'");
    expect(operatorPage).toContain('KotcNextTournamentWorkspace');
    expect(judgePage).toContain('KotcNextJudgeScreen');
  });

  it('keeps spectator snapshots and final publish wiring attached to the operator flow', () => {
    const service = read('web/lib/kotc-next/service.ts');
    const spectator = read('web/lib/kotc-next/spectator.ts');
    const publicRoute = read('web/app/api/public/kotcn-board/[tournamentId]/route.ts');
    const spectatorPage = read('web/app/live/kotcn/[id]/page.tsx');
    const panel = read('web/components/kotc-next/KotcNextOperatorPanel.tsx');

    expect(service).toContain("canFinishR1: Boolean(r1 && r1.status === 'finished' && !r2)");
    expect(service).toContain("canFinishR2: Boolean(r2 && r2.status === 'finished')");
    expect(service).toContain('persistKotcNextSpectatorSnapshot');
    expect(service).toContain('publishResults');
    expect(service).toContain('syncKotcNextResultsToTournamentResults');
    expect(spectator).toContain('getKotcNextSpectatorPayload');
    expect(spectator).toContain('persistKotcNextSpectatorSnapshot');
    expect(publicRoute).toContain('getKotcNextSpectatorPayload');
    expect(publicRoute).not.toContain('requireApiRole');
    expect(spectatorPage).toContain('KotcNextSpectatorBoard');
    expect(panel).toContain('/live/kotcn/');
  });
});
