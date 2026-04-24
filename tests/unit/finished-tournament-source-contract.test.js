import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('finished tournament page source contract', () => {
  it('links editorial and result player names to public player cards', () => {
    const source = read('web/components/calendar/FinishedTournamentPage.tsx');

    expect(source).toContain('function buildEditorialPlayerIdMap');
    expect(source).toContain('function PlayerProfileLink');
    expect(source).toContain('href={`/players/${playerId}`}');
    expect(source).toContain('playerId={editorialPlayerIds.get(editorialPlayerNameKey(row.left))}');
    expect(source).toContain('playerId={editorialPlayerIds.get(editorialPlayerNameKey(row.right))}');
    expect(source).toContain('playerId={row.playerId}');
  });

  it('embeds archived Thai spectator board on finished Thai tournaments', () => {
    const source = read('web/components/calendar/FinishedTournamentPage.tsx');

    expect(source).toContain("import { ThaiSpectatorBoard } from '@/components/thai-live/ThaiSpectatorBoard';");
    expect(source).toContain('thaiBoard = null');
    expect(source).toContain('<ThaiSpectatorBoard data={thaiBoard} />');
    expect(source).toContain('href={`/live/thai/${id}`}');
    expect(source).toContain('Thai board');
  });
});
