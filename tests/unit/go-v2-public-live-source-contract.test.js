import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const view = readFileSync(
  path.join(process.cwd(), 'web/components/go-v2/TournamentV2PublicView.tsx'),
  'utf8',
);

describe('GO V2 public live board', () => {
  it('shows authoritative disruptions and distinguishes planned, predicted and actual time', () => {
    expect(view).toContain('activeDisruptions');
    expect(view).toContain('Важное изменение');
    expect(view).toContain("court_close: 'Корт закрыт'");
    expect(view).toContain('row.predictedStart');
    expect(view).toContain('row.actualStart');
    expect(view).toContain("? 'Факт'");
    expect(view).toContain("? 'Прогноз'");
    expect(view).toContain('План:');
  });

  it('surfaces live, paused and ready play states without exposing grant secrets', () => {
    expect(view).toContain("live: 'LIVE'");
    expect(view).toContain("paused: 'Пауза'");
    expect(view).toContain("ready: 'Скоро'");
    expect(view).not.toContain('activeCourtGrants');
    expect(view).not.toContain('tokenPrefix');
  });
});
