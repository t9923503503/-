import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('GO Next P0 safety contracts', () => {
  it('routes structural BYEs without creating synthetic finished matches', () => {
    const service = read('web/lib/go-next/service.ts');
    expect(service).toContain('routeStructuralByesTx');
    expect(service).toContain('planStructuralByeUpdates');
    expect(service).not.toContain('autoAdvanceMatchIds');
    expect(service).not.toContain('const winnerId = left.teamId ?? right.teamId');
  });

  it('requires a fresh impact hash and locks downstream matches before correction', () => {
    const service = read('web/lib/go-next/service.ts');
    const route = read('web/app/api/admin/tournaments/[id]/go-matches/[matchId]/route.ts');
    expect(service).toContain("code: 'go_impact_preview_required'");
    expect(service).toContain("code: 'go_downstream_started'");
    expect(service).toContain('FOR UPDATE OF m');
    expect(service).toContain('reconcileAffectedBracketMatchesTx');
    expect(service).toContain('recalcGroupStandingsTx(client, current.groupId, settings)');
    expect(route).toContain('impactHash: body.impactHash');
    expect(route).toContain('...(error.details ?? {})');
  });

  it('publishes classification for every bracket entrant', () => {
    const sync = read('web/lib/go-next/sync-tournament-results.ts');
    expect(sync).toContain('classifySingleElimination');
    expect(sync).toContain('placementOffset += entrantIds.length');
    expect(sync).toContain('leaguePlace: row.place');
  });
});
