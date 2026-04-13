import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('profile layout source contract', () => {
  it('keeps the public player page wired to the shared compact profile with share support', () => {
    const playerPage = read('web/app/players/[id]/page.tsx');

    expect(playerPage).toContain("import EpicProfile from '@/components/players/EpicProfile';");
    expect(playerPage).toContain('sharePath={`/players/${player.id}`}');
  });

  it('renders a compact profile hero with share and settings-friendly match history', () => {
    const profileSource = read('web/components/players/EpicProfile.tsx');

    expect(profileSource).toContain('navigator.share');
    expect(profileSource).toContain('Поделиться профилем');
    expect(profileSource).toContain('Ключевые метрики');
    expect(profileSource).toContain('История матчей');
    expect(profileSource).toContain('Пока нет сыгранных матчей');
  });
});
