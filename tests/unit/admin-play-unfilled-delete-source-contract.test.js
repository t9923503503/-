import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('admin cleanup for games without a result', () => {
  it('lists only disposable games and protects live or scored games on the server', () => {
    const service = read('web/lib/play-service.ts');
    const policy = read('web/lib/play-admin-cleanup.ts');
    expect(service).toContain('export async function listAdminUnfilledPlayPosts');
    expect(service).toContain("post.kind = 'game'");
    expect(service).toContain('NOT EXISTS (SELECT 1 FROM play_game_results result');
    expect(service).toContain("session.status = 'active'");
    expect(policy).toContain("['draft', 'cancelled', 'completed']");
    expect(service).toContain('FOR UPDATE OF post');
    expect(service).toContain('adminUnfilledPlayDeleteBlocker');
    expect(policy).toContain('У игры уже есть результат — удаление заблокировано');
    expect(service).toContain('DELETE FROM play_posts WHERE id = $1::uuid');
  });

  it('requires the admin role, a reason and an audit record', () => {
    const listRoute = read('web/app/api/admin/play-posts/route.ts');
    const deleteRoute = read('web/app/api/admin/play-posts/[id]/route.ts');
    expect(listRoute).toContain("requireApiRole(req, 'viewer')");
    expect(deleteRoute).toContain("requireApiRole(req, 'admin')");
    expect(deleteRoute).toContain('reason.length < 5');
    expect(deleteRoute).toContain("action: 'play_post.delete_unfilled'");
    expect(deleteRoute).toContain('beforeState: deleted');
  });

  it('uses an inline irreversible-action confirmation in the admin UI', () => {
    const component = read('web/components/admin/AdminUnfilledPlayPosts.tsx');
    const page = read('web/app/admin/play/page.tsx');
    expect(component).toContain('Игры без результата');
    expect(component).toContain('без возможности восстановления');
    expect(component).toContain("method: 'DELETE'");
    expect(component).toContain('Причина удаления');
    expect(component).toContain("reason.trim().length < 5");
    expect(page).toContain("<AdminUnfilledPlayPosts canDelete={actor.role === 'admin'} />");
  });
});
