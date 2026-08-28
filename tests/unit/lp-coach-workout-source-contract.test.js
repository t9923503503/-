import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('LP Coach workout source contract', () => {
  it('keeps planned items and factual executions in separate tables', () => {
    const sql = read('migrations/094_lp_coach_workout_execution.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coach_workout_plans');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coach_workout_plan_items');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coach_workout_plan_item_athletes');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coach_exercise_executions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coach_exercise_execution_athletes');
    expect(sql).toContain("WHERE status IN ('running', 'paused')");
  });

  it('binds plan and execution assignments to participants from the same session', () => {
    const sql = read('migrations/094_lp_coach_workout_execution.sql');
    expect(sql).toContain('FOREIGN KEY (workout_plan_id, training_session_id)');
    expect(sql).toContain('FOREIGN KEY (training_participant_id, training_session_id)');
    expect(sql).toContain('FOREIGN KEY (execution_id, training_session_id)');
  });

  it('stores server timer state with optimistic revision protection', () => {
    const sql = read('migrations/094_lp_coach_workout_execution.sql');
    const service = read('web/lib/coach/workout-service.ts');
    expect(sql).toContain('target_duration_seconds');
    expect(sql).toContain('elapsed_seconds');
    expect(sql).toContain('revision');
    expect(service).toContain('AND revision = $3');
    expect(service).toContain("status = 'paused'");
    expect(service).toContain("status = 'running'");
  });

  it('exposes protected plan and execution APIs with audit entries', () => {
    const planRoute = read('web/app/api/coach/sessions/[id]/workout/route.ts');
    const executionRoute = read('web/app/api/coach/sessions/[id]/workout/execution/route.ts');
    expect(planRoute).toContain('requireCoachApiActor');
    expect(planRoute).toContain('writeAuditLog');
    expect(executionRoute).toContain('requireCoachApiActor');
    expect(executionRoute).toContain('writeAuditLog');
  });

  it('provides the required mobile workout controls without local persistence', () => {
    const ui = read('web/components/coach/WorkoutWorkspace.tsx');
    expect(ui).toContain('Текущее упражнение');
    expect(ui).toContain('Осталось');
    expect(ui).toContain('+2 мин');
    expect(ui).toContain('−2 мин');
    expect(ui).toContain('Следующее →');
    expect(ui).toContain('Фактически проведено');
    expect(ui).not.toContain('localStorage');
  });
});
