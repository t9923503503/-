import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 explicit publication admin UI', () => {
  it('separates the kill switch from an audited preview/commit publication', () => {
    const wizard = read('web/components/admin/tournaments/TournamentWizard.tsx');
    const workspace = read('web/components/go-v2/TournamentEngineV2Workspace.tsx');
    expect(wizard).toContain('Разрешить публичную публикацию V2');
    expect(wizard).toContain('защитный переключатель, а не публикация');
    expect(workspace).toContain("'/publication/preview'");
    expect(workspace).toContain("'/publication/commit'");
    expect(workspace).toContain('publicKillSwitchEnabled');
    expect(workspace).toContain('approval ID второго администратора');
    expect(workspace).toContain('OperationImpactSummary value={publicationPreview}');
  });

  it('projects immutable publication state into the admin structure response', () => {
    const contracts = read('web/lib/go-v2/contracts.ts');
    const repository = read('web/lib/go-v2/repository.ts');
    expect(contracts).toContain("publicationState: 'shadow' | 'published' | 'unpublished'");
    expect(repository).toContain("COALESCE(s.publication_state, 'shadow') AS publication_state");
    expect(repository).toContain('publicationRevisionNo');
    expect(repository).toContain('publicKillSwitchEnabled');
  });
});
