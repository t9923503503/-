import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('profile link source contract', () => {
  it('shows explicit player binding controls inside the unified personal settings panel', () => {
    const source = read('web/app/profile/page.tsx');

    expect(source).toContain("import ProfileLinkPlayerForm from '@/components/profile/ProfileLinkPlayerForm';");
    expect(source).toContain("import { resolvePlayerIdForAccount } from '@/lib/profile-link';");
    expect(source).toContain('resolvePlayerIdForAccount(me.id)');
    expect(source).toContain("title=\"Настройки профиля\"");
    expect(source).toContain("title: 'Привязка игрока'");
    expect(source).toContain('<ProfileLinkPlayerForm embedded />');
  });

  it('falls back to a unique fuzzy search when exact account-name binding is unavailable', () => {
    const source = read('web/lib/profile-link.ts');

    expect(source).toContain('const fuzzyMatches = await searchPlayersForLink(fullName, 2);');
    expect(source).toContain('return fuzzyMatches.length === 1 ? fuzzyMatches[0].id : null;');
  });
});
