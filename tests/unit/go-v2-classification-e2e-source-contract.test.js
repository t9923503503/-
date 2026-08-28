import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 classification/consolation end-to-end source contract', () => {
  it('locks a ready preset through preview and dedicated materialization', () => {
    const templates = read('web/lib/go-v2/core/format-templates.ts');
    const service = read('web/lib/go-v2/service.ts');
    const persistence = read('web/lib/go-v2/classification-persistence.ts');

    expect(templates).toContain("'lpv_classification_v1'");
    expect(templates).toContain("availability: 'ready'");
    expect(service).toContain('generateClassificationTopology(participants, { idPrefix })');
    expect(service).toContain('persistClassificationStage(client');
    expect(persistence).toContain("materializationKind: 'classification_rounds'");
    expect(persistence).toContain("sourceKind: 'classification_v1'");
    expect(persistence).not.toContain("source_type, source_entry_id, source_match_id");
  });

  it('persists immutable non-routing dependencies and exposes them to scheduler/read APIs', () => {
    const migration = read('migrations/107_go_v2_classification_rounds.sql');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_match_dependencies');
    expect(migration).toContain('depends_on_match_id UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE RESTRICT');
    expect(migration).toContain('CHECK (match_id <> depends_on_match_id)');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON go_v2_match_dependencies');
    expect(migration).toContain('GRANT SELECT, INSERT ON TABLE go_v2_match_dependencies TO lpbvolley');
    expect(repository).toContain('explicitDependenciesByMatch');
    expect(repository).toContain("'dependencyMatchIds'");
  });

  it('resolves a complete explainable classification ledger and never fabricates BYE results', () => {
    const migration = read('migrations/107_go_v2_classification_rounds.sql');
    const persistence = read('web/lib/go-v2/classification-persistence.ts');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(migration).toContain("'classification_standings'");
    expect(persistence).toContain('resolveCompleteClassificationPlacements(topology, outcomes)');
    expect(persistence).toContain("sourceKind: 'classification_v1'");
    expect(persistence).toContain('basis: placement.basis');
    expect(repository).toContain('persistClassificationFinalPlacementSnapshot(client, input)');
    expect(persistence).not.toContain('byeAutoAdvance');
  });
});
