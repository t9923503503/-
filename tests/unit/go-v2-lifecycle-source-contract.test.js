import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 automatic lifecycle source contract', () => {
  it('reconciles progress after every operation that can change match completion', () => {
    const service = read('web/lib/go-v2/service.ts');

    expect(service).toContain('PROGRESS_RECONCILIATION_OPERATIONS');
    for (const operation of [
      'match.result.revise',
      'match.paper_import.commit',
      'entry.withdrawal.commit',
      'incident.commit',
      'mutation.undo.commit',
    ]) {
      expect(service).toContain(`'${operation}'`);
    }
    expect(service).toContain('await reconcileGoV2TournamentProgress(client, tournamentId)');
    expect(service).toContain('{ ...appliedDomainResult, progress, finalPlacements }');
  });

  it('allows corrections and undo from finished but keeps roster and withdrawal fail-closed', () => {
    const service = read('web/lib/go-v2/service.ts');
    const lifecycleLines = service
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("'"));
    const line = (operation) => lifecycleLines.find((entry) => entry.includes(`'${operation}':`)) ?? '';

    // Direct result entry is the unfinished-match paper import boundary.
    // Corrections after final/finished always use incident preview/commit.
    expect(line('match.result.revise')).not.toContain("'finished'");
    expect(line('incident.preview')).toContain("'finished'");
    expect(line('incident.commit')).toContain("'finished'");
    expect(line('mutation.undo.preview')).toContain("'finished'");
    expect(line('mutation.undo.commit')).toContain("'finished'");
    expect(line('roster.replacement.preview')).not.toContain("'finished'");
    expect(line('roster.replacement.commit')).not.toContain("'finished'");
    expect(line('entry.withdrawal.preview')).not.toContain("'finished'");
    expect(line('entry.withdrawal.commit')).not.toContain("'finished'");
  });

  it('requires playoff completion and treats finished as a reversible lifecycle', () => {
    const repository = read('web/lib/go-v2/repository.ts');

    expect(repository).toContain("stage.stageType === 'single_elimination'");
    expect(repository).toContain("stage.stageType === 'double_elimination'");
    expect(repository).toContain("stage.stageType === 'placement_match'");
    expect(repository).toContain("previousLifecycleState === 'finished' && !allMatchBearingStagesComplete");
    expect(repository).toContain("match.isConditional && match.conditionState === 'false'");
    expect(repository).toContain("hasOwnMetadataKey(match.metadata, 'byeAutoAdvance')");
  });

  it('never enables V2 as a side effect of a V2 API call', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const ensureState = repository.slice(
      repository.indexOf('export async function ensureGoV2StateForUpdate'),
      repository.indexOf('export function assertExpectedVersion'),
    );

    expect(ensureState).toContain('GO_V2_NOT_ENABLED');
    expect(ensureState).toContain('Number(enabled.rows[0].go_engine_version) !== 2');
    expect(ensureState).not.toContain('UPDATE tournaments');
    expect(ensureState).not.toContain('SET go_engine_version = 2');
  });
});
