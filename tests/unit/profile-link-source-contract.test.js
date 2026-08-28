import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('profile link source contract', () => {
  it('keeps player-page linking compact instead of rendering the full settings form', () => {
    const profile = read('web/components/players/EpicProfile.tsx');
    const linkForm = read('web/components/profile/ProfileLinkPlayerForm.tsx');

    expect(profile).toContain('compact: !0');
    expect(linkForm).toContain('compact: v = !1');
    expect(linkForm).toContain('children: R ? "Привязываю..." : "Это вы? Привязать"');
  });

  it('shows explicit player binding controls inside the unified personal settings panel', () => {
    const redirectPage = read('web/app/profile/page.tsx');
    const source = read('web/components/profile/PlayerCabinetPage.tsx');

    expect(source).toContain("import ProfileLinkPlayerForm from '@/components/profile/ProfileLinkPlayerForm';");
    expect(source).toContain("import { resolvePlayerIdForAccount } from '@/lib/profile-link';");
    expect(source).toContain('resolvePlayerIdForAccount(me.id)');
    expect(source).toContain("title=\"Настройки профиля\"");
    expect(source).toContain("title: 'Привязка игрока'");
    expect(source).toContain('<ProfileLinkPlayerForm embedded />');
    expect(redirectPage).toContain("redirect(tab ? `/cabinet?tab=${encodeURIComponent(tab)}` : '/cabinet')");
  });

  it('authorizes player access only through an explicit account link', () => {
    const source = read('web/lib/profile-link.ts');

    expect(source).toContain('JOIN players p ON p.id = u.player_id');
    expect(source).toContain('return findExplicitLinkedPlayer(userId);');
    expect(source).not.toContain('SELECT approved_player_id::text AS player_id');
    expect(source).toContain('return explicit?.id || null;');
    expect(source).not.toContain('const fuzzyMatches = await searchPlayersForLink(fullName, 2);');
  });
});
