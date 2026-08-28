import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('LP Coach foundation source contract', () => {
  it('extends canonical players instead of duplicating athlete identity', () => {
    const migration = read('migrations/088_lp_coach_foundation.sql');
    expect(migration).toContain('player_id          UUID PRIMARY KEY REFERENCES players(id)');
    expect(migration).toContain('coach_skill_evaluations');
    expect(migration).toContain('coach_athlete_issue_history');
    expect(migration).toContain('coach_current_skill_evaluations');
    expect(migration).toContain("CHECK (score BETWEEN 1 AND 5)");
    expect(migration).not.toContain('CREATE TABLE IF NOT EXISTS athletes');
  });

  it('keeps skill assessments append-only in the service and API', () => {
    const service = read('web/lib/coach/service.ts');
    const route = read('web/app/api/coach/athletes/[id]/evaluations/route.ts');
    expect(service).toContain('INSERT INTO coach_skill_evaluations');
    expect(service).not.toContain('UPDATE coach_skill_evaluations');
    expect(service).not.toContain('DELETE FROM coach_skill_evaluations');
    expect(route).toContain('export async function POST');
    expect(route).not.toContain('export async function PATCH');
    expect(route).not.toContain('export async function DELETE');
  });

  it('protects Coach pages and mutation APIs with the existing admin session', () => {
    const middleware = read('web/middleware.ts');
    const auth = read('web/lib/coach/auth.ts');
    const athleteApi = read('web/app/api/coach/athletes/route.ts');
    expect(middleware).toContain("'/coach/:path*'");
    expect(middleware).toContain("buildRedirectUrl(request, '/coach/login')");
    expect(middleware).toContain("request.headers.get('host')");
    expect(middleware).toContain('`${forwardedProto}://${forwardedHost}`');
    expect(auth).toContain("requireApiRole(req, 'operator')");
    expect(auth).toContain("if (actor.role === 'viewer') redirect('/admin')");
    expect(athleteApi).toContain('writeAuditLog');
  });

  it('ships the stage-one happy path in the Coach workspace', () => {
    const athletes = read('web/app/coach/(workspace)/athletes/page.tsx');
    const panel = read('web/components/coach/AthleteFoundationPanel.tsx');
    expect(athletes).toContain('<AddAthleteForm');
    expect(panel).toContain('Сохранить карточку');
    expect(panel).toContain('Добавить оценку');
    expect(panel).toContain('Добавить проблему');
    expect(panel).toContain('История оценок');
    expect(panel).toContain('Отметить работу');
  });
  it('keeps Coach gradient cards dark when the public site uses the light theme', () => {
    const globals = read('web/app/globals.css');
    expect(globals).toContain('html[data-theme="light"] body:not(.judge-workspace) .coach-dark-surface [class*="bg-\\[radial-gradient"]');
    expect(globals).toContain('background-color: rgb(255 255 255 / 0.035);');
  });
});
