import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

describe('player claim and merge integrity source contract', () => {
  it('retires obsolete moderator callbacks and never lists a stale claim outbox row', () => {
    const registration = read('web/lib/telegram-registration.ts');
    const profileLink = read('web/lib/profile-link.ts');

    expect(occurrences(registration, 'WITH cancelled_claims AS (')).toBeGreaterThanOrEqual(2);
    expect(occurrences(registration, "outbox.dedup_key = 'player_claim:' || claim.id::text"))
      .toBeGreaterThanOrEqual(3);
    expect(registration).toContain("outbox.kind <> 'player_claim'");
    expect(registration).toContain("WHERE claim.status = 'pending'");

    expect(occurrences(profileLink, 'WITH cancelled_claims AS (')).toBeGreaterThanOrEqual(2);
    expect(occurrences(profileLink, "outbox.dedup_key = 'player_claim:' || claim.id::text"))
      .toBeGreaterThanOrEqual(2);
  });

  it('allows direct binding only to an active player row held with a shared lock', () => {
    const profileLink = read('web/lib/profile-link.ts');

    expect(profileLink).toContain("WHERE id = $1 AND status = 'active'\n        FOR SHARE");
  });

  it('locks merge references deterministically before players and rechecks races', () => {
    const source = read('web/lib/admin-queries-pg.ts');
    const merge = source.slice(source.indexOf('export async function mergeTempPlayer'));
    const accountLock = merge.indexOf('const lockedAccounts = await client.query');
    const claimLock = merge.indexOf('const lockedClaims = await client.query');
    const requestLock = merge.indexOf('const lockedRequests = await client.query');
    const playerLock = merge.indexOf('const bothRes = await client.query');

    expect(accountLock).toBeGreaterThanOrEqual(0);
    expect(claimLock).toBeGreaterThan(accountLock);
    expect(requestLock).toBeGreaterThan(claimLock);
    expect(playerLock).toBeGreaterThan(requestLock);
    expect(merge.slice(accountLock, claimLock)).toContain('ORDER BY id\n        FOR UPDATE');
    expect(merge.slice(claimLock, requestLock)).toContain('ORDER BY id\n        FOR UPDATE');
    expect(merge.slice(requestLock, playerLock)).toContain('ORDER BY id\n        FOR UPDATE');
    expect(merge.slice(playerLock, merge.indexOf('const tempRow'))).toContain(
      'ORDER BY id\n        FOR UPDATE'
    );
    expect(merge).toContain('const referencesChanged =');
    expect(merge).toContain('if (referencesChanged)');
    expect(merge).toContain('retry the merge');
  });
});
