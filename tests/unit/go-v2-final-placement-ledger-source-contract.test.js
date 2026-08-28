import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 authoritative final-placement persistence contract', () => {
  it('stores append-only snapshot/rows with distinct result and standings hashes', () => {
    const migration = read('migrations/106_go_v2_live_schedule.sql');

    expect(migration).toContain('go_v2_final_placement_snapshots');
    expect(migration).toContain('go_v2_final_placement_rows');
    expect(migration).toContain('source_results_hash');
    expect(migration).toContain('source_result_revision_ids');
    expect(migration).toContain('source_revision_lineage');
    expect(migration).toContain('rating_policy_snapshot');
    expect(migration).toContain('UNIQUE (tournament_id, source_results_hash)');
    expect(migration).not.toContain('UNIQUE (tournament_id, standings_hash)\n);');
    expect(migration).toContain("'go_v2_final_placement_snapshots'");
    expect(migration).toContain("'go_v2_final_placement_rows'");
    expect(migration).toContain('GRANT SELECT, INSERT ON TABLE go_v2_final_placement_snapshots');
  });

  it('reconstructs bracket topology in dependency order and runs the existing resolver', () => {
    const repository = read('web/lib/go-v2/repository.ts');

    expect(repository).toContain('persistGoV2FinalPlacementSnapshot');
    expect(repository).toContain('orderFinalPlacementMatchesTopologically');
    expect(repository).toContain('FINAL_PLACEMENT_ROUTE_DEPENDENCY_MISSING');
    expect(repository).toContain('FINAL_PLACEMENT_ROUTE_CYCLE');
    expect(repository).toContain('resolveCompleteBracketPlacements(topology, outcomes)');
    expect(repository).toContain('ON CONFLICT (tournament_id, source_results_hash) DO NOTHING');
    expect(repository).toContain('sourceRevisionLineage');
    expect(repository).toContain('creditedLineup');
    expect(repository).toContain('ratingPolicy: GO_V2_DEFAULT_RATING_POLICY');
  });

  it('materializes a fresh current ledger after every finishing result transaction', () => {
    const service = read('web/lib/go-v2/service.ts');

    expect(service).toContain("progress?.lifecycleState === 'finished'");
    expect(service).toContain('persistGoV2FinalPlacementSnapshot(client');
    expect(service).toContain('{ ...appliedDomainResult, progress, finalPlacements }');
  });

  it('builds shadow rows server-side and forbids client-provided deltas', () => {
    const live = read('web/lib/go-v2/live-operations.ts');
    const migration = read('migrations/106_go_v2_live_schedule.sql');

    expect(live).toContain('CLIENT_RATING_DELTAS_FORBIDDEN');
    expect(live).toContain('buildGoV2RatingShadowProjection');
    expect(live).toContain('finalPlacements.ratingPolicySnapshot');
    expect(live).toContain('source_final_placement_snapshot_id');
    expect(live).toContain('A sports-level duplicate is still a successfully handled command');
    expect(live).toContain("operationKind: 'rating.shadow.commit'");
    expect(live).not.toMatch(/UPDATE\s+players\s+SET/i);
    expect(migration).toContain('UNIQUE (tournament_id, standings_hash)');
  });

  it('returns the current finalPlacements ledger through admin and public structure reads', () => {
    const contracts = read('web/lib/go-v2/contracts.ts');
    const repository = read('web/lib/go-v2/repository.ts');
    const service = read('web/lib/go-v2/service.ts');

    expect(contracts).toContain('finalPlacements: GoV2FinalPlacementSnapshotDto | null');
    expect(repository).toContain('go_v2_final_placement_snapshots');
    expect(repository).toContain('finalPlacements,');
    expect(service).toContain('finalPlacements: structure.finalPlacements');
  });
});
