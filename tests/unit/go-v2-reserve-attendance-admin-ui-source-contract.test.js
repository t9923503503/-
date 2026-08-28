import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const workspace = readFileSync(
  path.join(process.cwd(), 'web/components/go-v2/TournamentEngineV2Workspace.tsx'),
  'utf8',
);

describe('GO V2 reserve-promotion admin UI', () => {
  it('uses the dedicated preview/commit flow and preserves a locked slot', () => {
    expect(workspace).toContain('Поднять команду из резерва');
    expect(workspace).toContain('/promote/preview`');
    expect(workspace).toContain('/promote/commit`');
    expect(workspace).toContain("commandMeta('reserve_promoted'");
    expect(workspace).toContain('Освободившийся слот');
    expect(workspace).toContain('Расширить квоту этим действием нельзя');
    expect(workspace).toContain('OperationImpactSummary value={reservePromotionPreview}');
  });

  it('requires a distinct approver for a published successor schedule', () => {
    expect(workspace).toContain("reservePromotionPreview.risk === 'red'");
    expect(workspace).toContain('подтвердивший именно этот scheduleHash');
    expect(workspace).toContain('redApprovalId.trim()');
  });
});

describe('GO V2 attendance-reinstatement admin UI', () => {
  it('forces an explicit decision for prior no-show awards', () => {
    expect(workspace).toContain('Команда появилась после no-show');
    expect(workspace).toContain('keep_awarded_result');
    expect(workspace).toContain('overturn_and_cascade');
    expect(workspace).toContain("'/attendance/reinstate/preview'");
    expect(workspace).toContain("'/attendance/reinstate/commit'");
    expect(workspace).toContain("commandMeta('attendance_reinstated'");
  });

  it('explains append-only correction and mandatory red approval', () => {
    expect(workspace).toContain('Технический результат никогда не удаляется из истории');
    expect(workspace).toContain('Это всегда red-операция');
    expect(workspace).toContain('OperationImpactSummary value={reinstatementPreview}');
    expect(workspace).toContain("reinstatementPreview.risk === 'red'");
  });
});
