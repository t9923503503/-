import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('profile photo persistence source contract', () => {
  it('normalizes and mirrors uploaded photos before committing their URL', () => {
    const source = read('web/app/api/auth/photo/route.ts');
    const normalizer = read('web/lib/profile-photo.ts');

    expect(source).toContain('function getPhotoStorageDirs()');
    expect(source).toContain("import { existsSync } from 'fs';");
    expect(source).toContain('const addPublicRoot = (candidate: string) => {');
    expect(source).toContain("addPublicRoot(path.join(process.cwd(), 'public'));");
    expect(source).toContain("addPublicRoot(path.join(process.cwd(), 'web', 'public'));");
    expect(source).toContain("addPublicRoot(path.join(process.cwd(), '.next', 'standalone', 'web', 'public'));");
    expect(source).toContain("addPublicRoot(path.join(process.cwd(), 'web', '.next', 'standalone', 'web', 'public'));");
    expect(source).toContain("for (let depth = 1; depth <= 3; depth += 1) {");
    expect(source).toContain('async function persistPhoto(filename: string, buffer: Buffer): Promise<string[]> {');
    expect(source).toContain('const storageDirs = getPhotoStorageDirs();');
    expect(source).toContain('const results = await Promise.allSettled(');
    expect(source).toContain("console.warn('[api/auth/photo][storage]', storageDirs[index], result.reason);");
    expect(source).toContain('normalized = await normalizeProfilePhoto');
    expect(source).toContain("await client.query('BEGIN')");
    expect(source).toContain('SELECT player_id::text AS player_id');
    expect(source).toContain('FOR UPDATE');
    expect(source).toContain('currentPlayerId !== targetPlayerIds[0]');
    expect(source).toContain("await client.query('COMMIT')");
    expect(source).toContain('await cleanupNewPhoto(filename, persistedDirs);');
    expect(source).not.toContain('data:${file.type};base64');
    expect(normalizer).toContain("limitInputPixels: 40_000_000");
    expect(normalizer).toContain('.resize(PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE');
    expect(normalizer).toContain(".jpeg({ quality: 86, mozjpeg: true })");
  });

  it('syncs a linked player card photo from the account avatar when binding', () => {
    const source = read('web/lib/profile-link.ts');

    expect(source).toContain('JOIN players p ON p.id = u.player_id');
    expect(source).toContain('export async function findBoundPlayer(userId: number)');
    expect(source).toContain('return findExplicitLinkedPlayer(userId);');
    expect(source).toContain("SELECT avatar_url FROM users WHERE id = $1 LIMIT 1");
    expect(source).toContain("const avatarUrl = sanitizeServerImageUrl(avatarRes.rows[0]?.avatar_url);");
    expect(source).toContain("UPDATE players SET photo_url = $1 WHERE id = $2");
    expect(source).toContain('player.photoUrl = avatarUrl;');
  });
});
