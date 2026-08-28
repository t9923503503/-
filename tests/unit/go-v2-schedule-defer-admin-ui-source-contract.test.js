import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const workspace = readFileSync(
  path.join(process.cwd(), 'web/components/go-v2/TournamentEngineV2Workspace.tsx'),
  'utf8',
);

describe('GO V2 schedule defer admin UI', () => {
  it('keeps defer distinct from a sporting result and previews the full successor schedule', () => {
    expect(workspace).toContain('Отложить игру без технического результата');
    expect(workspace).toContain("'/schedule/defer/preview'");
    expect(workspace).toContain("'/schedule/defer/commit'");
    expect(workspace).toContain("commandMeta('schedule_deferred'");
    expect(workspace).toContain('OperationImpactSummary value={scheduleDeferPreview}');
  });

  it('releases defer only through a compensating preview and commit', () => {
    expect(workspace).toContain("'/schedule/defer/release/preview'");
    expect(workspace).toContain("'/schedule/defer/release/commit'");
    expect(workspace).toContain("commandMeta('schedule_defer_released'");
    expect(workspace).toContain('activeGenericDefers');
    expect(workspace).toContain('Снять defer и опубликовать schedule');
  });
});
