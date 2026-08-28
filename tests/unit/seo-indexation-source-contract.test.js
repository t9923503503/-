import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('SEO indexation contract', () => {
  it('keeps private account routes out of sitemap and publishes an absolute sitemap URL', () => {
    const sitemap = read('web/app/sitemap.ts');
    const robots = read('web/app/robots.ts');

    expect(sitemap).not.toContain("path: '/cabinet'");
    expect(sitemap).not.toContain("path: '/profile'");
    expect(sitemap).toContain("path: '/partner/about'");
    expect(robots).toContain("sitemap: 'https://lpvolley.ru/sitemap.xml'");
    expect(robots).not.toContain('disallow:');
  });

  it('marks operational routes noindex at the response-header layer', () => {
    const config = read('web/next.config.ts');

    expect(config).toContain("'/admin/:path*'");
    expect(config).toContain("'/partner/manage'");
    expect(config).toContain("'/calendar/:id/register'");
    expect(config).toContain("key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive'");
  });

  it('gives public detail pages self-referencing canonicals', () => {
    const players = read('web/app/players/[id]/page.tsx');
    const play = read('web/app/play/[id]/page.tsx');

    expect(players).toContain('https://lpvolley.ru/players/${player.id}');
    expect(play).toContain('https://lpvolley.ru/partner/${post.id}');
  });
});
