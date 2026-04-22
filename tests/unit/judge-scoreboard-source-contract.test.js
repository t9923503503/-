import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('judge scoreboard source contract', () => {
  it('wires the judge scoreboard screen to setup, reducer, persistence, restore normalization and match UI', () => {
    const source = read('web/components/judge-scoreboard/JudgeScoreboardScreen.tsx');

    expect(source).toContain("import { useEffect, useMemo, useReducer, useRef, useState }");
    expect(source).toContain("import { MatchScreen } from './MatchScreen';");
    expect(source).toContain("import { SetupScreen } from './SetupScreen';");
    expect(source).toContain("import { clearState, loadState, saveState } from '@/lib/judge-scoreboard/storage';");
    expect(source).toContain("import { createInitialState, reducer } from '@/lib/judge-scoreboard/reducer';");
    expect(source).toContain("import { createJudgeRealtimeChannel } from '@/lib/judge-scoreboard/realtime';");
    expect(source).toContain("normalizeServeTeamState");
    expect(source).toContain("normalizeTeamPlayers");
    expect(source).toContain('/api/judge-scoreboard/');
    expect(source).toContain('expectedVersion: serverVersionRef.current');
    expect(source).toContain("type: 'START_MATCH'");
    expect(source).toContain('teamAPlayers');
    expect(source).toContain("if (state.core.status !== 'setup')");
    expect(source).toContain('saveState(courtId, state);');
    expect(source).toContain('<MatchScreen state={state} dispatch={dispatch}');
    expect(source).toContain('<SetupScreen');
  });

  it('renders structured rosters, serve setup modal and rally feed with server details', () => {
    const setupSource = read('web/components/judge-scoreboard/SetupScreen.tsx');
    const matchSource = read('web/components/judge-scoreboard/MatchScreen.tsx');

    expect(setupSource).toContain('MAX_TEAM_PLAYERS');
    expect(setupSource).toContain('Очередность подачи выбирается отдельно перед каждым сетом');
    expect(setupSource).toContain('teamAPlayers');
    expect(setupSource).toContain('teamBPlayers');
    expect(matchSource).toContain('Ожидание настройки подачи для сета');
    expect(matchSource).toContain('Настройка подачи');
    expect(matchSource).toContain("type: 'APPLY_SET_SERVE_SETUP'");
    expect(matchSource).toContain('Подача:');
    expect(matchSource).toContain('След:');
    expect(matchSource).toContain('Лента очков');
    expect(matchSource).toContain('side-out');
  });

  it('exposes judge scoreboard and viewer entries', () => {
    const courtPageSource = read('web/app/court/page.tsx');
    const judgeIndexSource = read('web/app/judge-scoreboard/page.tsx');
    const viewerWallSource = read('web/components/judge-scoreboard/ViewerWall.tsx');

    expect(courtPageSource).toContain('/judge-scoreboard');
    expect(courtPageSource).toContain('/sudyam/login?returnTo=%2Fcourt');
    expect(judgeIndexSource).toContain('/judge-scoreboard/viewer');
    expect(judgeIndexSource).toContain('Открыть видеостену');
    expect(viewerWallSource).toContain('/judge-scoreboard/viewer/mosaic');
  });
});
