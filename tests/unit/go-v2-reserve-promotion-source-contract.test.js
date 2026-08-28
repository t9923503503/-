import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

describe('GO V2 reserve promotion source contract', () => {
  it('exposes director-only preview/commit routes and binds the reserve route id', () => {
    const preview = read('web/app/api/admin/go-v2/tournaments/[id]/reserves/[entryId]/promote/preview/route.ts');
    const commit = read('web/app/api/admin/go-v2/tournaments/[id]/reserves/[entryId]/promote/commit/route.ts');
    const client = read('web/lib/go-v2/client-admin-command.ts');
    expect(preview).toContain('requireGoV2Director');
    expect(preview).toContain("'reserve.promotion.preview'");
    expect(preview).toContain('reserveEntryId: entryId');
    expect(commit).toContain('requireGoV2Director');
    expect(commit).toContain("'reserve.promotion.commit'");
    expect(client).toContain('reservePromotion');
    expect(client).toContain('`reserve.promotion.${reservePromotion[2]}`');
  });

  it('freezes an exact shared successor schedule and never re-solves during commit', () => {
    const service = read('web/lib/go-v2/service.ts');
    expect(service).toContain('RESERVE_PROMOTION_SCHEDULE_INFEASIBLE');
    expect(service).toContain("kind: 'reserve_promotion'");
    expect(service).toContain('RESERVE_PROMOTION_SCHEDULE_PREVIEW_STALE');
    expect(service).toContain('previewAssignments as never[]');
    expect(service).toContain("risk: 'red'");
    expect(service).toContain("risk = 'red'");
    expect(service).toContain("publicationKind: 'reserve_promotion'");
    const commitValidation = service.slice(
      service.indexOf("if (operation === 'reserve.promotion.commit')", service.indexOf('async function commitGoV2Operation')),
      service.indexOf("if (\n      operation === 'schedule.generate.commit'", service.indexOf("if (operation === 'reserve.promotion.commit')", service.indexOf('async function commitGoV2Operation'))),
    );
    expect(commitValidation).not.toContain('solveSchedule(');
  });

  it('uses a repeat-safe immutable ledger with database-enforced cross-entity lineage', () => {
    const migration = read('migrations/109_go_v2_reserve_promotion.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_reserve_promotion_revisions');
    expect(migration).toContain('go_v2_validate_reserve_promotion_revision');
    expect(migration).toContain('reserve/tournament mismatch');
    expect(migration).toContain('target/tournament mismatch');
    expect(migration).toContain('roster/reserve mismatch');
    expect(migration).toContain('rating snapshot/tournament mismatch');
    expect(migration).toContain("preview.operation_kind = 'reserve.promotion.preview'");
    expect(migration).toContain('go_v2_schedule_session_tournaments');
    expect(migration).toContain('successor_based_on_id IS DISTINCT FROM NEW.prior_schedule_version_id');
    expect(migration).toContain('second approval lineage mismatch');
    expect(migration).toContain('approval.approved_by <> NEW.actor_id');
    expect(migration).toContain('approval.reviewed_input_hash = NEW.input_hash');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON go_v2_reserve_promotion_revisions');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON go_v2_roster_revisions');
    expect(migration).toContain('GRANT SELECT, INSERT ON go_v2_reserve_promotion_revisions TO lpbvolley');
  });

  it('projects promotion lineage for a UI without exposing mutable metadata as authority', () => {
    const contracts = read('web/lib/go-v2/contracts.ts');
    const repository = read('web/lib/go-v2/repository.ts');
    expect(contracts).toContain('reservePromotions: Array<Record<string, unknown>>');
    expect(repository).toContain("'promotionMode', promotion.promotion_mode");
    expect(repository).toContain("'slotDiff', promotion.slot_diff");
    expect(repository).toContain("'scheduleDiff', promotion.schedule_diff");
    expect(repository).toContain('reservePromotions,');
  });
});
