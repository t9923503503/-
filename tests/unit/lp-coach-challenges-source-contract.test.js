import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('LP Coach challenges source contract', () => {
  it('stores flexible templates, links and append-only attempts', () => {
    const sql = read('migrations/096_lp_coach_challenges.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coach_challenges');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coach_challenge_skills');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coach_challenge_issues');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coach_challenge_attempts');
    expect(sql).toContain("'count', 'time', 'distance', 'score', 'percent', 'custom'");
    expect(sql).not.toContain('ON DELETE CASCADE\n  player_id');
  });

  it('protects and audits template and attempt mutations', () => {
    const collection = read('web/app/api/coach/challenges/route.ts');
    const detail = read('web/app/api/coach/challenges/[id]/route.ts');
    const attempts = read('web/app/api/coach/challenges/[id]/attempts/route.ts');
    for (const source of [collection, detail, attempts]) expect(source).toContain('requireCoachApiActor');
    expect(collection).toContain('coach.challenge.create');
    expect(detail).toContain('coach.challenge.update');
    expect(attempts).toContain('coach.challenge.attempt.add');
  });

  it('exposes constructor, quick attempt, graph, PR and reminders', () => {
    const form = read('web/components/coach/ChallengeForm.tsx');
    const workspace = read('web/components/coach/ChallengeWorkspace.tsx');
    const dashboard = read('web/app/coach/(workspace)/page.tsx');
    expect(form).toContain('Какие проблемы контролирует');
    expect(form).toContain("setUnitLabel('сек')");
    expect(form).toContain('setHigherIsBetter(false)');
    expect(workspace).toContain('Записать попытку');
    expect(workspace).toContain('График прогресса');
    expect(workspace).toContain('Лидеры');
    expect(workspace).toContain('PR');
    expect(dashboard).toContain('Пора повторить Challenge');
  });

  it('keeps the athlete view and navigation connected', () => {
    const athletePage = read('web/app/coach/(workspace)/athletes/[id]/page.tsx');
    const shell = read('web/components/coach/CoachShell.tsx');
    expect(athletePage).toContain('getCoachAthleteChallenges');
    expect(shell).toContain('/coach/challenges');
    expect(shell).toContain('grid-cols-7');
  });
});
