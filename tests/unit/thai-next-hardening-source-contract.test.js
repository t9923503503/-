import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Thai Next hardening source contract', () => {
  it('moves Thai bootstrap writes behind a locked transactional service flow', () => {
    const service = read('web/lib/thai-live/service.ts');

    expect(service).toContain('SELECT id, name, date, time, location, format, status, settings');
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain('bootstrapThaiJudgeState');
    expect(service).toContain('persistThaiJudgeBootstrapSignatureTx');
    expect(service).toContain('thaiJudgeBootstrapSignature');
    expect(service).toContain('THAI_STRUCTURAL_DRIFT_LOCKED_CODE');
    expect(service).toContain('resetThaiJudgeState');
  });

  it('exposes POST bootstrap and reset endpoints with structural lock signaling', () => {
    const sudyamBootstrapRoute = read('web/app/api/sudyam/bootstrap/route.ts');
    const resetRoute = read('web/app/api/admin/tournaments/[id]/reset-thai-next/route.ts');

    expect(sudyamBootstrapRoute).toContain('export async function POST');
    expect(sudyamBootstrapRoute).toContain('bootstrapThaiJudgeState');
    expect(sudyamBootstrapRoute).toContain('THAI_STRUCTURAL_DRIFT_LOCKED_CODE');
    expect(resetRoute).toContain('resetThaiJudgeState');
    expect(resetRoute).toContain("action: 'tournament.resetThaiNext'");
    expect(resetRoute).toContain("Reason is required");
  });

  it('blocks Thai Next structural bypass in admin tournament updates', () => {
    const adminRoute = read('web/app/api/admin/tournaments/route.ts');
    const config = read('web/lib/thai-judge-config.ts');

    expect(adminRoute).toContain('THAI_STRUCTURAL_DRIFT_LOCKED_CODE');
    expect(adminRoute).toContain('validateThaiNextStructuralLock');
    expect(adminRoute).toContain("beforeStatus === 'open'");
    expect(adminRoute).toContain('resetThaiJudgeState');
    expect(config).toContain('Cannot change tournament format. Structural Thai Next state already initialized.');
    expect(config).toContain('Cannot downgrade judge module after Thai Next state initialization.');
    expect(config).toContain('structural Thai Next state already initialized; reset/recreate flow required');
  });
});
