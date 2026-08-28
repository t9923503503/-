import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}

describe('admin player-link recovery source contract', () => {
  it('lists account owners but limits destructive unlink to admins', () => {
    const route = read('web/app/api/admin/player-links/route.ts');
    expect(route).toContain("requireApiRole(req, 'viewer')");
    expect(route).toContain("requireApiRole(req, 'admin')");
    expect(route).toContain('canUnlink: auth.actor.role === \'admin\'');
    expect(route).toContain('trustedOrigin(req)');
  });

  it('requires a reason, clears only the account-card relationship, and audits it', () => {
    const route = read('web/app/api/admin/player-links/route.ts');
    const page = read('web/app/admin/requests/page.tsx');
    expect(route).toContain('reason.length < 5');
    expect(route).toContain('SET player_id = NULL');
    expect(route).not.toContain('DELETE FROM players');
    expect(route).toContain("action: 'account.player_unlink'");
    expect(route).toContain('writeAuditLog');
    expect(page).toContain('Отвязать карточку');
    expect(page).toContain('window.confirm');
  });
});

