import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('player play dashboard source contract', () => {
  it('combines organized games, participations, actions and invitations in one endpoint', () => {
    const route = read('web/app/api/me/play-dashboard/route.ts');
    expect(route).toContain('listPlayFeed(user.id)');
    expect(route).toContain('listMyPlayInvites(user.id)');
    expect(route).toContain('relationship: organizer && participant');
    expect(route).toContain('viewerCapabilities:');
    expect(route).toContain('primaryAction: { kind: primaryAction');
    expect(route).toContain('liveSession:');
    expect(route).toContain('attention:');
  });

  it('keeps urgent actions and organizer-owned games visible in the cabinet', () => {
    const entries = read('web/components/profile/PlayEntries.tsx');
    expect(entries).toContain("fetch('/api/me/play-dashboard'");
    expect(entries).toContain('dedupePosts([...dashboard.mine, ...dashboard.myGames])');
    expect(entries).toContain('Требует внимания');
    expect(entries).toContain('Принять');
    expect(entries).toContain('Управлять составом');
    expect(entries).toContain('Внести счёт');
    expect(entries).toContain('window.setInterval(refreshWhenVisible, 30_000)');
  });

  it('offers direct Telegram, VK and copy actions for every game link', () => {
    const share = read('web/components/partner/PlayShareButton.tsx');
    expect(share).toContain('https://t.me/share/url');
    expect(share).toContain('https://vk.com/share.php');
    expect(share).toContain('Скопировать ссылку');
    expect(share).toContain('navigator.share');
  });
});
