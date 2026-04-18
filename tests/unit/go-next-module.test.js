import { describe, expect, it } from 'vitest';

describe('go-next module smoke', () => {
  it('loads the GO service and sync modules', async () => {
    const service = await import('../../web/lib/go-next/service.ts');
    const sync = await import('../../web/lib/go-next/sync-tournament-results.ts');
    const index = await import('../../web/lib/go-next/index.ts');

    expect(typeof service.getGoOperatorState).toBe('function');
    expect(typeof service.runGoOperatorAction).toBe('function');
    expect(typeof service.getGoJudgeSnapshotByPin).toBe('function');
    expect(typeof service.runGoJudgeAction).toBe('function');
    expect(typeof sync.syncGoResultsToTournamentResults).toBe('function');
    expect(typeof index.getGoSpectatorPayload).toBe('function');
  });
});
