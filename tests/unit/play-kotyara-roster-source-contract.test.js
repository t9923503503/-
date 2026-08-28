import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('Kotyara poll roster import contract', () => {
  it('keeps manager authorization, going filter and guest fallback on the server', () => {
    const source = read('web/lib/play-service.ts');
    expect(source).toContain('listManagedPlayKotyaraPolls');
    expect(source).toContain('importManagedPlayKotyaraPoll');
    expect(source).toContain("session.source = 'kotyara'");
    expect(source).toContain("['going', 'maybe']");
    expect(source).toContain('guestName: row.player_id ? null : String(row.display_name)');
    expect(source).toContain('await assertPostManager(client, actor, postId)');
  });

  it('provides a dedicated authenticated endpoint and one-tap live start', () => {
    const route = read('web/app/api/play-posts/[id]/kotyara-poll/route.ts');
    const live = read('web/components/play/PlayLiveSessionPanel.tsx');
    expect(route).toContain('getPlayActor(req)');
    expect(route).toContain('listManagedPlayKotyaraPolls(actor, id)');
    expect(route).toContain('importManagedPlayKotyaraPoll');
    expect(live).toContain('Состав из Котяры → начать');
    expect(live).toContain("/session/start");
  });
});
