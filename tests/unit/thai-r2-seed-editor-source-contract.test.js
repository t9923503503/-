import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Thai R2 seed editor source contract', () => {
  it('supports drag and drop across any zones while keeping button controls as fallback', () => {
    const editor = read('web/components/thai-live/ThaiR2SeedEditor.tsx');

    expect(editor).toContain('movePlayerByDrop');
    expect(editor).toContain('handlePlayerDragStart');
    expect(editor).toContain('handlePlayerDragOver');
    expect(editor).toContain('handlePlayerDrop');
    expect(editor).toContain('handleZoneDrop');
    expect(editor).toContain('draggable={!loading}');
    expect(editor).toContain('data-thai-r2-player-card="true"');
    expect(editor).toContain('Перетаскивайте карточки мышью между любыми зонами');
    expect(editor).toContain('moveWithinZone');
    expect(editor).toContain('moveAcrossZones');
  });
});
