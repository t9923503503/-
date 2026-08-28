import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('LP Coach Stage 2 exercise source contract', () => {
  it('stores structured exercises, relations, photos and videos without duplicating skills or issues', () => {
    const migration = read('migrations/092_lp_coach_exercises.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS coach_exercises');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS coach_exercise_skills');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS coach_exercise_issues');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS coach_exercise_photos');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS coach_exercise_videos');
    expect(migration).toContain("CHECK (platform IN ('youtube', 'instagram', 'telegram', 'own_video', 'other'))");
    expect(migration).toContain('coach_exercise_one_primary_skill_unique');
    expect(migration).not.toContain('CREATE TABLE IF NOT EXISTS coach_exercise_issue_catalog');
  });

  it('replaces skill and issue links transactionally and keeps plan-independent media records', () => {
    const service = read('web/lib/coach/exercise-service.ts');
    expect(service).toContain("await client.query('BEGIN')");
    expect(service).toContain('replaceExerciseLinks');
    expect(service).toContain("await client.query('ROLLBACK')");
    expect(service).toContain('INSERT INTO coach_exercise_photos');
    expect(service).toContain('INSERT INTO coach_exercise_videos');
    expect(service).toContain("athlete_issue.status NOT IN ('resolved', 'archived')");
  });

  it('protects every exercise API mutation and writes it to the existing admin audit', () => {
    const files = [
      'web/app/api/coach/exercises/route.ts',
      'web/app/api/coach/exercises/[id]/route.ts',
      'web/app/api/coach/exercises/[id]/photos/route.ts',
      'web/app/api/coach/exercises/[id]/photos/[photoId]/route.ts',
      'web/app/api/coach/exercises/[id]/videos/route.ts',
      'web/app/api/coach/exercises/[id]/videos/[videoId]/route.ts',
    ];
    for (const file of files) expect(read(file)).toContain('requireCoachApiActor');
    for (const file of files) expect(read(file)).toContain('writeAuditLog');
  });

  it('exposes a filterable library, a full card and five-photo progress', () => {
    const library = read('web/app/coach/(workspace)/exercises/page.tsx');
    const workspace = read('web/components/coach/ExerciseWorkspace.tsx');
    const shell = read('web/components/coach/CoachShell.tsx');
    expect(library).toContain('Проблема ученика');
    expect(library).toContain('Без оборудования');
    expect(workspace).toContain('exercise.photos.length}/5');
    expect(workspace).toContain('YouTube');
    expect(workspace).toContain('Telegram');
    expect(workspace).toContain('Instagram');
    expect(shell).toContain("href: '/coach/exercises'");
  });
});
