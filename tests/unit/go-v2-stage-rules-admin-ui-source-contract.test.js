import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const workspace = readFileSync(
  path.join(process.cwd(), 'web/components/go-v2/TournamentEngineV2Workspace.tsx'),
  'utf8',
);

describe('GO V2 stage-rule change admin UI', () => {
  it('explains and enforces the next-full-round workflow', () => {
    expect(workspace).toContain('Изменить формат следующего полного раунда');
    expect(workspace).toContain('Групповые правила неизменяемы после первой игры');
    expect(workspace).toContain('stageRuleSuggestedRound');
    expect(workspace).toContain("commandMeta('stage_rule_changed'");
  });

  it('requires preview/commit and a second approver for frozen matches', () => {
    expect(workspace).toContain('/rules/preview`');
    expect(workspace).toContain('/rules/commit`');
    expect(workspace).toContain('OperationImpactSummary value={stageRulePreview}');
    expect(workspace).toContain('frozen/locked матч');
    expect(workspace).toContain('redApprovalId.trim()');
  });
});
