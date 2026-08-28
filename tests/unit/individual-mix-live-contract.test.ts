import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { effectiveRatingPtsFromStored, sqlEffectiveRatingPointsExpr } from '@/lib/rating-points';

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

describe('individual-mix live persistence contract', () => {
  it('creates canonical sessions, idempotent commands, court PINs and restorable snapshots', () => {
    const migration = read('migrations/101_individual_mix_live_sessions.sql');
    const postseasonMigration = read('migrations/104_individual_mix_postseason.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS individual_mix_sessions');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS individual_mix_commands');
    expect(migration).toContain('UNIQUE (session_id, command_id)');
    expect(migration).toContain('expected_schedule_revision UUID NOT NULL');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS individual_mix_court_access');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS individual_mix_snapshots');
    expect(migration).toContain('rating_excluded BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('rating_excluded = COALESCE(src.rating_excluded, FALSE)');
    expect(postseasonMigration).toContain("'start_postseason'");
    expect(postseasonMigration).toContain('current_round BETWEEN 1 AND 9');
  });

  it('locks the session, checks duplicates before revisions and returns an actual conflict snapshot', () => {
    const service = read('web/lib/individual-mix/live-service.ts');
    expect(service).toContain('FOR UPDATE OF session');
    expect(service.indexOf('SELECT 1 FROM individual_mix_commands')).toBeLessThan(service.indexOf("Number(envelope.expectedRevision) !== Number(row.revision)"));
    expect(service).toContain("'revision_conflict'");
    expect(service).toContain('current: {');
    expect(service).toContain("'roster_fingerprint_conflict'");
    expect(service).toContain('publishFinalStandingsTx');
    expect(service).toContain('unpublishFinalStandingsTx');
  });

  it('keeps correction and emergency operations admin-only and judge commands court-scoped', () => {
    const adminRoute = read('web/app/api/admin/tournaments/[id]/individual-mix/commands/route.ts');
    const judgeRoute = read('web/app/api/individual-mix/judge/[pin]/commands/route.ts');
    expect(adminRoute).toContain("const ADMIN_ONLY = new Set(['correct_score', 'rebuild_schedule', 'restore_snapshot'])");
    expect(adminRoute).toContain("requireApiRole(req, 'admin')");
    expect(judgeRoute).toContain("['record_score', 'undo_last']");
    expect(judgeRoute).toContain('judge_command_forbidden');
  });

  it('shows truthful sync states, the round gate and explicit conflict resolution', () => {
    const operator = read('web/components/individual-mix/SixPairLiveWorkspace.tsx');
    const judge = read('web/components/individual-mix/IndividualMixJudgeWorkspace.tsx');
    expect(operator).toContain('Синхронизировано');
    expect(operator).toContain('ожидают отправки');
    expect(operator).toContain('Конфликт — нужен разбор');
    expect(operator).toContain('Ждём корт 1');
    expect(operator).toContain('Офлайн-мастер');
    expect(operator).toContain('Скачать обе версии');
    expect(operator).toContain('Полуфиналы → финал');
    expect(operator).toContain("startPostseason('direct_medals')");
    expect(judge).toContain('Ждём выбор финального этапа');
    expect(judge).toContain('Следующая стадия откроется после всех игр текущей стадии.');
  });

  it('makes replacement-slot rating exclusion explicit in both JS and SQL rating paths', () => {
    expect(effectiveRatingPtsFromStored(1, 'pro', undefined, undefined, true)).toBe(0);
    expect(effectiveRatingPtsFromStored(1, 'pro', undefined)).toBeGreaterThan(0);
    expect(sqlEffectiveRatingPointsExpr('result')).toContain('result.rating_excluded');
    expect(read('web/app/api/admin/tournaments/[id]/results/route.ts')).toContain('ratingExcluded: Boolean(');
    expect(read('web/lib/admin-queries-pg.ts')).toContain('rating_pool, rating_excluded');
    expect(read('web/lib/admin-postgrest.ts')).toContain('rating_excluded: Boolean(item.ratingExcluded)');
    expect(read('web/app/admin/archive/page.tsx')).toContain('без авто-бонуса');
  });

  it('ships a network-safe PWA shell without caching API writes', () => {
    const worker = read('web/public/individual-mix-sw.js');
    const page = read('web/app/individual-mix/judge/[pin]/page.tsx');
    expect(worker).toContain("url.pathname.startsWith('/api/')");
    expect(worker).toContain("request.method !== 'GET'");
    expect(page).toContain('manifest.webmanifest');
  });
});
