import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('LP Coach recommendations source contract', () => {
  it('persists explainable deterministic runs without duplicating workout plans', () => {
    const sql = read('migrations/097_lp_coach_recommendations.sql');
    expect(sql).toContain('coach_workout_recommendation_runs');
    expect(sql).toContain('recommendation_reasons');
    expect(sql).toContain("recommendation_source IN ('manual', 'deterministic')");
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS coach_recommended_workout_plans');
  });

  it('protects and audits the generation API', () => {
    const route = read('web/app/api/coach/sessions/[id]/recommendations/route.ts');
    expect(route).toContain('requireCoachApiActor');
    expect(route).toContain('writeAuditLog');
    expect(route).toContain('coach.workout.recommendation_generate');
  });

  it('shows the deterministic promise, builder and explicit reasons', () => {
    const builder = read('web/components/coach/WorkoutRecommendationBuilder.tsx');
    const workspace = read('web/components/coach/WorkoutWorkspace.tsx');
    expect(builder).toContain('Собрать тренировку');
    expect(builder).toContain('По правилам · не AI');
    expect(builder).toContain('Генератор не создаёт вымышленные данные');
    expect(workspace).toContain('Почему?');
    expect(workspace).toContain('Заменить / настроить');
    expect(builder).not.toContain('localStorage');
  });

  it('drops stale recommendation explanations when the coach replaces an exercise', () => {
    const service = read('web/lib/coach/workout-service.ts');
    expect(service).toContain("recommendation_source = CASE WHEN item.exercise_id <> exercise.id THEN 'manual'");
    expect(service).toContain("recommendation_reasons = CASE WHEN item.exercise_id <> exercise.id THEN '{}'::text[]");
  });
});
