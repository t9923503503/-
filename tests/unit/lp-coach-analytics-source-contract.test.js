import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('LP Coach analytics source contract', () => {
  it('counts only completed factual exercise executions', () => {
    const service = read('web/lib/coach/analytics-service.ts');
    expect(service).toContain("execution.status = 'completed'");
    expect(service).not.toContain('coach_workout_plan_items item');
    expect(service).not.toContain('planned_duration_seconds');
  });

  it('ships indexes for factual period and athlete queries', () => {
    const sql = read('migrations/095_lp_coach_analytics.sql');
    expect(sql).toContain('coach_exercise_executions_completed_period_idx');
    expect(sql).toContain("WHERE status = 'completed'");
    expect(sql).toContain('coach_exercise_execution_athletes_player_idx');
  });

  it('protects the analytics API and exposes all required sections', () => {
    const route = read('web/app/api/coach/analytics/route.ts');
    const page = read('web/app/coach/(workspace)/analytics/page.tsx');
    expect(route).toContain('requireCoachApiActor');
    expect(page).toContain('Нагрузка за период');
    expect(page).toContain('Использование упражнений');
    expect(page).toContain('Основные навыки');
    expect(page).toContain('Что требует внимания');
    const service = read('web/lib/coach/analytics-service.ts');
    expect(service).toContain('План сам по себе');
  });
});
