import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const service = fs.readFileSync(path.join(root, 'web/lib/play-service.ts'), 'utf8');
const route = fs.readFileSync(path.join(root, 'web/app/api/play-posts/[id]/roster/route.ts'), 'utf8');

describe('organizer roster backend contract', () => {
  it('returns the three recommendation signals and prioritizes them', () => {
    expect(service).toContain("'last_roster' | 'frequent_coplayer' | 'available'");
    expect(service).toContain('AS in_last_roster');
    expect(service).toContain('AS shared_games_count');
    expect(service).toContain('AS availability_overlap');
    expect(service).toContain("recommendationTags.push('last_roster')");
    expect(service).toContain("recommendationTags.push('frequent_coplayer')");
    expect(service).toContain("recommendationTags.push('available')");
  });

  it('preflights the whole batch inside one transaction before writes', () => {
    const bulkStart = service.indexOf('export async function bulkManagePlayRoster');
    const bulkEnd = service.indexOf('export async function removeManagedPlayParticipant', bulkStart);
    const bulk = service.slice(bulkStart, bulkEnd);
    expect(bulk).toContain("await client.query('BEGIN')");
    expect(bulk).toContain('if (errors.size)');
    expect(bulk.indexOf('if (errors.size)')).toBeLessThan(bulk.indexOf('INSERT INTO play_invites'));
    expect(bulk).toContain("await client.query('COMMIT')");
    expect(bulk).toContain("await client.query('ROLLBACK')");
    expect(bulk).toContain("item.targetStatus = 'reserve'");
    expect(bulk).toContain("outcome: isReserve ? 'reserved'");
  });

  it('exposes a manager-authenticated atomic endpoint with per-item failure results', () => {
    expect(route).toContain('getPlayActor(req)');
    expect(route).toContain('bulkManagePlayRoster(actor, id, body.items)');
    expect(route).toContain('committed: false');
    expect(route).toContain('results: error.results');
  });
});
