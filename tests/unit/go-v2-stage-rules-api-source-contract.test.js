import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const routeBase = 'web/app/api/admin/go-v2/tournaments/[id]/stages/[stageId]/rules';

describe('GO V2 stage-rules preview/commit source contract', () => {
  it('keeps route scope server-bound and director-only', () => {
    const preview = read(`${routeBase}/preview/route.ts`);
    const commit = read(`${routeBase}/commit/route.ts`);
    expect(preview).toContain('requireGoV2Director(req)');
    expect(preview).toContain("'stage.rules.preview'");
    expect(preview).toContain('{ ...body, stageId }');
    expect(commit).toContain('requireGoV2Director(req)');
    expect(commit).toContain("'stage.rules.commit'");
    expect(commit).toContain('stageId,');
  });

  it('validates an exact immutable successor and persists schedule before ledgers', () => {
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');
    expect(service).toContain("reasonCode !== 'stage_rule_changed'");
    expect(service).toContain('prepareGoV2StageRuleChange(client, tournamentId, previewChange, { lock: true })');
    expect(service).toContain("'STAGE_RULE_PREVIEW_RISK_ESCALATED'");
    expect(service).toContain("publicationKind: 'stage_rule_change'");
    expect(service).toContain('stageRuleChange: prepared.change');
    expect(service).toContain("operation === 'stage.rules.commit'");
    expect(service).toContain("String(previewSolverResult.scheduleHash ?? '') !== commitValidation.scheduleHash");
    expect(service.indexOf('const persistedSchedule = await persistScheduleVersion(client, {', service.indexOf("case 'stage.rules.commit'")))
      .toBeLessThan(service.indexOf('const revision = await persistGoV2StageRuleChange', service.indexOf("case 'stage.rules.commit'")));
    expect(repository).toContain('go_v2_stage_rule_revisions');
    expect(repository).toContain('go_v2_match_rule_revisions');
    expect(repository).toContain('current_rule_revision_id IS NOT DISTINCT FROM');
    expect(repository).toContain("'future_round'");
    expect(repository).toContain("'stage_projection'");
  });

  it('uses the per-match rule projection in scheduling, results and judge commands', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const liveOperations = read('web/lib/go-v2/live-operations.ts');
    const effectiveRuleSql = "COALESCE(NULLIF(m.match_rule, '{}'::jsonb), s.match_rule) AS match_rule";
    expect(repository).toContain(effectiveRuleSql);
    expect(liveOperations.match(/COALESCE\(NULLIF\(match\.match_rule, '\{\}'::jsonb\), stage\.match_rule\) AS match_rule/g))
      .toHaveLength(3);
  });
});
