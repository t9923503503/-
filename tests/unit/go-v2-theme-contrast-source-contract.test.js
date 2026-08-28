import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Tournament Engine V2 theme contrast contract', () => {
  it('scopes a complete readable light palette to the admin workspace', () => {
    const workspace = read('web/components/go-v2/TournamentEngineV2Workspace.tsx');
    const css = read('web/app/globals.css');

    expect(workspace).toContain('go-v2-admin-workspace');
    expect(css).toContain('html[data-theme="light"] .go-v2-admin-workspace');
    expect(css).toContain('[class~="bg-[#0f131d]/95"]');
    expect(css).toContain('[class~="bg-[#10131d]/95"]');
    expect(css).toContain('[class~="bg-[#131824]"]');
    expect(css).toContain('[class~="bg-white/[0.035]"]');
    expect(css).toContain('[class~="bg-black/25"]');
    expect(css).toContain('[class~="text-white/45"]');
    expect(css).toContain('color: #64748b;');
    expect(css).toContain('.go-v2-admin-workspace option');
  });

  it('leaves the existing dark-theme utility palette in the component', () => {
    const workspace = read('web/components/go-v2/TournamentEngineV2Workspace.tsx');
    const css = read('web/app/globals.css');

    expect(workspace).toContain('bg-[#0f131d]/95');
    expect(workspace).toContain('bg-[#10131d]/95');
    expect(workspace).toContain('bg-[#131824]');
    expect(workspace).toContain('text-white/60');
    expect(css).not.toContain('html[data-theme="dark"] .go-v2-admin-workspace');
  });
});
