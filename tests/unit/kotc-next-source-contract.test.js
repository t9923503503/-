import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('KOTC Next backend source contract', () => {
  it('wires admin KOTC Next actions through a dedicated route and bootstrap payload refresh', () => {
    const route = read('web/app/api/admin/tournaments/[id]/kotcn-action/route.ts');

    expect(route).toContain("requireApiRole(req, 'operator')");
    expect(route).toContain('runKotcNextOperatorAction');
    expect(route).toContain('resolveSudyamBootstrap');
    expect(route).toContain("resolveSudyamBootstrap(id, 'kotc')");
    expect(route).toContain('bootstrap_r1');
    expect(route).toContain('preview_r2_seed');
    expect(route).toContain('bootstrap_r2');
  });

  it('exposes judge snapshot and judge action routes for KOTC Next', () => {
    const snapshotRoute = read('web/app/api/kotc-next/judge/[pin]/route.ts');
    const startRoute = read('web/app/api/kotc-next/judge/[pin]/raund/[no]/start/route.ts');
    const pointRoute = read('web/app/api/kotc-next/judge/[pin]/raund/[no]/king-point/route.ts');
    const takeoverRoute = read('web/app/api/kotc-next/judge/[pin]/raund/[no]/takeover/route.ts');
    const undoRoute = read('web/app/api/kotc-next/judge/[pin]/raund/[no]/undo/route.ts');
    const finishRoute = read('web/app/api/kotc-next/judge/[pin]/raund/[no]/finish/route.ts');

    expect(snapshotRoute).toContain('getKotcNextJudgeSnapshotByPin');
    expect(startRoute).toContain('startKotcNextRaund');
    expect(pointRoute).toContain('recordKotcNextKingPoint');
    expect(takeoverRoute).toContain('recordKotcNextTakeover');
    expect(undoRoute).toContain('undoKotcNextLastEvent');
    expect(finishRoute).toContain('finishKotcNextRaund');
  });

  it('extends Sudyam bootstrap and public spectator API for KOTC Next', () => {
    const bootstrapRoute = read('web/app/api/sudyam/bootstrap/route.ts');
    const bootstrapLib = read('web/lib/sudyam-bootstrap.ts');
    const spectatorLib = read('web/lib/kotc-next/spectator.ts');
    const publicRoute = read('web/app/api/public/kotcn-board/[tournamentId]/route.ts');
    const index = read('web/lib/kotc-next/index.ts');

    expect(bootstrapRoute).toContain('format !== "thai" && format !== "kotc"');
    expect(bootstrapRoute).toContain('bootstrapKotcNextR1');
    expect(bootstrapLib).toContain('kotcJudgeNeedsBootstrap');
    expect(bootstrapLib).toContain('kotcOperatorState');
    expect(spectatorLib).toContain('sanitizeKotcNextOperatorStateForSpectators');
    expect(spectatorLib).toContain('persistKotcNextSpectatorSnapshot');
    expect(publicRoute).toContain('getKotcNextSpectatorPayload');
    expect(publicRoute).not.toContain('requireApiRole');
    expect(index).toContain("export * from './spectator';");
  });
});
