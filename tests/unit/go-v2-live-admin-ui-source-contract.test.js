import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const workspace = readFileSync(
  path.join(process.cwd(), 'web/components/go-v2/TournamentEngineV2Workspace.tsx'),
  'utf8',
);

describe('GO V2 live admin safety UI', () => {
  it('uses preview -> commit for paused-match decisions and keeps incomplete in incident flow', () => {
    expect(workspace).toContain('/pause-resolution/preview');
    expect(workspace).toContain('/pause-resolution/commit');
    expect(workspace).toContain("type PauseResolutionDecision = 'defer' | 'resume_same_court' | 'transfer'");
    expect(workspace).toContain("setIncidentKind('incomplete')");
    expect(workspace).toContain("setActiveTab('incidents')");
    expect(workspace).toContain('Incomplete — это спортивный исход');
  });

  it('resolves active disruptions explicitly without automatically resuming matches', () => {
    expect(workspace).toContain('/resolve/preview');
    expect(workspace).toContain('/resolve/commit');
    expect(workspace).toContain('Закрытие не возобновляет матчи автоматически');
    expect(workspace).toContain("commandMeta('disruption_resolved'");
    expect(workspace).not.toContain('<option value="court_reopen">');
    expect(workspace).toContain("disruptionKind === 'medical_delay' ? { matchId: disruptionMatchId }");
  });

  it('imports paper protocols through the director preview flow, never direct result PUT', () => {
    expect(workspace).toContain('/paper-import/preview');
    expect(workspace).toContain('/paper-import/commit');
    expect(workspace).toContain("resultMode: 'paper_import'");
    expect(workspace).toContain("commandMeta('paper_result_import'");
    expect(workspace).not.toContain("}/result`");
    expect(workspace).not.toContain("'/result'");
  });

  it('surfaces schedule identity, diff and conflicts while keeping raw data in debug details', () => {
    expect(workspace).toContain('Итоговый scheduleHash');
    expect(workspace).toContain('candidate.scheduleDiff');
    expect(workspace).toContain('validation.conflicts');
    expect(workspace).toContain('Отладка: raw JSON');
    expect(workspace).toContain('Только director');
  });
});
