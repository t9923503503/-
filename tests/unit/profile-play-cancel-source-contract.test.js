import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('profile play cancellation source contract', () => {
  it('requires inline confirmation before issuing DELETE', () => {
    const source = read('web/components/profile/PlayEntries.tsx');
    expect(source).toContain('aria-expanded={confirming}');
    expect(source).toContain('Отменить участие в «{post.title}»?');
    expect(source).toContain("method: 'DELETE'");
    expect(source).toContain("submittingId === post.id ? 'Отменяем…' : 'Да, отменить'");
  });

  it('keeps cancellation idempotent and reserve promotion transactional', () => {
    const source = read('web/lib/play-service.ts');
    expect(source).toContain("if (String(participant.status) === 'cancelled') {");
    expect(source).toContain("await client.query('COMMIT');\n      return { ok: true };");
    expect(source).toContain('const postResult = await client.query(\'SELECT * FROM play_posts WHERE id=$1::uuid FOR UPDATE\'');
    expect(source).toContain('const promoted = await promoteReserves(client, postId, 1);');
  });
});

