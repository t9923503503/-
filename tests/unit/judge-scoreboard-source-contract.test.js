import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('judge scoreboard source contract', () => {
  it('wires the judge scoreboard screen to setup, reducer, persistence and match UI', () => {
    const source = read('web/components/judge-scoreboard/JudgeScoreboardScreen.tsx');

    expect(source).toContain("import { useEffect, useReducer, useRef }");
    expect(source).toContain("import { MatchScreen } from './MatchScreen';");
    expect(source).toContain("import { SetupScreen } from './SetupScreen';");
    expect(source).toContain("import { clearState, loadState, saveState } from '@/lib/judge-scoreboard/storage';");
    expect(source).toContain("import { createInitialState, reducer } from '@/lib/judge-scoreboard/reducer';");
    expect(source).toContain("dispatch({");
    expect(source).toContain("type: 'START_MATCH'");
    expect(source).toContain('saveState(courtId, state);');
    expect(source).toContain('return <MatchScreen state={state} dispatch={dispatch} />;');
    expect(source).toContain('return (');
    expect(source).toContain('<SetupScreen');
  });

  it('exposes the simple scoreboard entry from the main judge page', () => {
    const source = read('web/app/court/page.tsx');

    expect(source).toContain('/judge-scoreboard');
    expect(source).toContain('/sudyam/login?returnTo=%2Fcourt');
    expect(source).toContain('Простое табло');
    expect(source).toContain('Вход по PIN');
    expect(source).toContain('корты 1–4');
  });
});
