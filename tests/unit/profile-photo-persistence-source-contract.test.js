import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('profile photo persistence source contract', () => {
  it('mirrors uploaded photos into persistent web/public during standalone runtime', () => {
    const source = read('web/app/api/auth/photo/route.ts');

    expect(source).toContain('function getPhotoStorageDirs()');
    expect(source).toContain("import { existsSync } from 'fs';");
    expect(source).toContain('const addPublicRoot = (candidate: string) => {');
    expect(source).toContain("addPublicRoot(path.join(process.cwd(), 'public'));");
    expect(source).toContain("addPublicRoot(path.join(process.cwd(), 'web', 'public'));");
    expect(source).toContain("addPublicRoot(path.join(process.cwd(), '.next', 'standalone', 'web', 'public'));");
    expect(source).toContain("addPublicRoot(path.join(process.cwd(), 'web', '.next', 'standalone', 'web', 'public'));");
    expect(source).toContain("for (let depth = 1; depth <= 3; depth += 1) {");
    expect(source).toContain('async function persistPhotoToStorageDirs(filename: string, buffer: Buffer): Promise<void> {');
    expect(source).toContain('const storageDirs = getPhotoStorageDirs();');
    expect(source).toContain('const writeResults = await Promise.allSettled(');
    expect(source).toContain("if (successfulWrites > 0) {");
    expect(source).toContain("console.warn('[api/auth/photo][storage]', storageDirs[index], result.reason);");
    expect(source).toContain("throw new Error('PHOTO_STORAGE_WRITE_FAILED');");
    expect(source).toContain('await persistPhotoToStorageDirs(filename, buffer);');
  });

  it('syncs a linked player card photo from the account avatar when binding', () => {
    const source = read('web/lib/profile-link.ts');

    expect(source).toContain('JOIN players p ON p.id = pr.approved_player_id');
    expect(source).toContain('export async function findBoundPlayer(userId: number)');
    expect(source).toContain("AND status = 'approved'");
    expect(source).toContain("SELECT avatar_url FROM users WHERE id = $1 LIMIT 1");
    expect(source).toContain("const avatarUrl = sanitizeServerImageUrl(avatarRes.rows[0]?.avatar_url);");
    expect(source).toContain("UPDATE players SET photo_url = $1 WHERE id = $2");
    expect(source).toContain('player.photoUrl = avatarUrl;');
  });
});
