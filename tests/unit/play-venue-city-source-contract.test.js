import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Play venue city source contract', () => {
  it('uses Surgut as the service fallback', () => {
    const service = read('web/lib/play-service.ts');
    expect(service).toContain("row.venueCity ?? row.city ?? 'Сургут'");
    expect(service).not.toContain("row.venueCity ?? row.city ?? 'Екатеринбург'");
  });

  it('repairs venue rows created with the legacy city default', () => {
    const migration = read('migrations/073_play_surgut_venue_city.sql');
    expect(migration).toContain("SET city = 'Сургут'");
    expect(migration).toContain("WHERE city IS DISTINCT FROM 'Сургут'");
    expect(migration).not.toContain('ALTER TABLE');
  });
});
