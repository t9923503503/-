import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 strict tier-court exception admin UI', () => {
  it('requires a bounded director preview before publishing a fallback schedule', () => {
    const workspace = read('web/components/go-v2/TournamentEngineV2Workspace.tsx');
    expect(workspace).toContain('Временное исключение из закрепления кортов');
    expect(workspace).toContain("'/schedule/policy/preview'");
    expect(workspace).toContain("'/schedule/policy/commit'");
    expect(workspace).toContain("commandMeta('court_policy_exception'");
    expect(workspace).toContain('courtPolicyEffectiveFrom');
    expect(workspace).toContain('courtPolicyEffectiveUntil');
    expect(workspace).toContain('courtPolicyAllowedCourtIds');
    expect(workspace).toContain('OperationImpactSummary value={courtPolicyPreview}');
  });

  it('keeps the requested hard/medium/light court rules visible to the director', () => {
    const workspace = read('web/components/go-v2/TournamentEngineV2Workspace.tsx');
    expect(workspace).toContain('Light остаётся только на корте 2');
    expect(workspace).toContain('Hard — на кортах 3–4');
    expect(workspace).toContain('Журнал исключений');
  });
});
