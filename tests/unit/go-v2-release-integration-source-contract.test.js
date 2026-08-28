import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('GO V2 pilot release integration source contract', () => {
  it('stores one canonical engine version through both database adapters', () => {
    const pg = read('web/lib/admin-queries-pg.ts');
    const postgrest = read('web/lib/admin-postgrest.ts');
    const api = read('web/app/api/admin/tournaments/route.ts');

    for (const source of [pg, postgrest]) {
      expect(source).toContain('go_engine_version');
      expect(source).toContain('payload.go_engine_version');
      expect(source).toContain('requires migration 105');
    }
    expect(api).toContain('requestedGoEngineVersion');
    expect(api).toContain('canonicalizeGoV2Settings');
    expect(api).toContain('validateGoEngineTransition');
    expect(read('web/lib/queries.ts')).not.toContain('settings.goEngineVersion ?? settings.go_engine_version');
  });

  it('keeps public reads closed until canonical engine and director flag agree', () => {
    const helper = read('web/lib/go-v2-publication.ts');
    const publication = read('web/lib/go-v2/publication.ts');
    const previewRoute = read('web/app/api/admin/go-v2/tournaments/[id]/publication/preview/route.ts');
    const commitRoute = read('web/app/api/admin/go-v2/tournaments/[id]/publication/commit/route.ts');
    const route = read('web/app/api/go-v2/tournaments/[id]/structure/route.ts');
    expect(helper).toContain('state.publication_state');
    expect(helper).toContain("row.publication_state === 'published'");
    expect(helper).toContain('isGoV2PublicEnabled');
    expect(route).not.toContain('isGoV2TournamentPublic');
    expect(read('web/lib/go-v2/service.ts')).toContain(
      'readGoV2Structure(tournamentId, { requirePublic: true })',
    );
    expect(read('web/lib/go-v2/repository.ts')).toContain("'GO_V2_NOT_PUBLISHED'");
    expect(read('web/lib/go-v2/repository.ts')).toContain('options.requirePublic === true');
    expect(publication).toContain('go_v2_publication_state_revisions');
    expect(publication).toContain('PUBLICATION_PREVIEW_STALE');
    const publicationPreview = publication.slice(
      publication.indexOf('export async function previewGoV2Publication'),
      publication.indexOf('export async function commitGoV2Publication'),
    );
    expect(publicationPreview).toContain('findCommandReceipt');
    expect(publicationPreview).toContain("assertReceiptMatches(receipt, 'publication.preview', requestHash)");
    expect(publicationPreview).toContain("operationKind: 'publication.preview'");
    expect(publicationPreview).toContain('saveCommandReceipt');
    expect(previewRoute).toContain('requireGoV2Director');
    expect(commitRoute).toContain('requireGoV2Director');
  });

  it('deploys one immutable source with backup and the explicit migration order', () => {
    const pilot = read('scripts/deploy-go-v2-pilot.sh');
    const generic = read('scripts/deploy-server.sh');
    const packager = read('scripts/package-go-v2-pilot.sh');
    const expectedMigrations = [
      '105_go_tournament_engine_v2.sql',
      '106_go_v2_live_schedule.sql',
      '107_go_v2_classification_rounds.sql',
      '108_go_v2_pilot_live_safety.sql',
      '109_go_v2_reserve_promotion.sql',
    ];
    const sequence = expectedMigrations.map((name) => pilot.indexOf(name));

    const packagedSequence = expectedMigrations.map((name) => packager.indexOf(name));
    const migrationNames = (source) => {
      const block = source.slice(source.indexOf('MIGRATIONS=('), source.indexOf('\n)\n', source.indexOf('MIGRATIONS=(')) + 3);
      return [...block.matchAll(/"migrations\/([^"\n]+\.sql)"/g)].map((match) => match[1]);
    };

    expect(sequence.every((position) => position >= 0)).toBe(true);
    expect(sequence).toEqual([...sequence].sort((left, right) => left - right));
    expect(packagedSequence.every((position) => position >= 0)).toBe(true);
    expect(packagedSequence).toEqual([...packagedSequence].sort((left, right) => left - right));
    expect(migrationNames(pilot)).toEqual(expectedMigrations);
    expect(migrationNames(packager)).toEqual(expectedMigrations);
    expect(pilot).toContain('Migration manifest must contain exactly five files');
    expect(pilot).toContain(
      'sudo -n -u postgres psql -d "$GO_V2_DATABASE_NAME" -X -v ON_ERROR_STOP=1 -f -',
    );
    expect(migrationNames(pilot)).not.toContain('104_individual_mix_postseason.sql');
    expect(pilot).toContain('sudo -n -u postgres pg_dump -d "$GO_V2_DATABASE_NAME"');
    expect(pilot).toContain('sudo -n -u postgres pg_restore --list');
    expect(pilot).toContain('GO_V2_REHEARSAL_CONFIRMED');
    expect(pilot).toContain('GO_V2_DEPLOY_CONFIRM=APPLY_GO_V2_PILOT');
    expect(pilot).toContain('actual_archive_hash');
    expect(pilot).toContain('sha256sum --check --strict');
    expect(pilot).toContain('"$TRUSTED_SSH_KEYGEN_BIN" -Y verify');
    expect(pilot).toContain('lpvolley-release-archive');
    expect(pilot).toContain('lpvolley-release-manifest');
    expect(pilot).toContain('validate_release_trust_store');
    expect(pilot).toContain('Release trust store must be root-owned');
    expect(pilot).toContain('verify-commit "$reconstructed_commit"');
    expect(pilot).toContain('verify-tag "$reconstructed_tag"');
    expect(pilot).toContain('validate_root_owned_executable');
    expect(pilot).toContain('GIT_CONFIG_NOSYSTEM=1');
    expect(pilot).toContain('GIT_CONFIG_GLOBAL=/dev/null');
    expect(pilot).toContain('-c gpg.ssh.program="$TRUSTED_SSH_KEYGEN_BIN"');
    expect(pilot).toContain('Raw commit object does not match the signed manifest');
    expect(pilot).toContain('Archive manifest differs from the independently signed manifest');
    expect(pilot).toContain('Freeze every uploaded trust artifact');
    expect(pilot).toContain('RELEASE_ARCHIVE="${INPUT_DIR}/release.tar.gz"');
    expect(pilot).not.toContain('manifest_value SIGNATURE_VERIFIED');
    expect(pilot).toContain('102_play_malibu_courts.sql');
    expect(pilot).toContain('20260828_fix_womens_tournament_division.sql');
    expect(pilot).toContain('calendar-data-fix-verification.txt');
    expect(pilot).toContain('collect_referenced_public_assets');
    expect(pilot).toContain('coach_exercise_photos');
    expect(pilot).toContain('verify_persistent_asset_manifest');
    expect(pilot).toContain('--skip-migrations');
    expect(pilot).toContain('--skip-static-sync');
    expect(pilot).toContain('--source-archive "$RELEASE_ARCHIVE"');
    expect(pilot).toContain('DEPLOY_PERSISTENT_ASSET_MANIFEST');
    expect(pilot).not.toContain('git -C "$APP_DIR" fetch');
    expect(packager).toContain('verify-tag');
    expect(packager).toContain('verify-commit');
    expect(packager).toContain('signed annotated tag');
    expect(packager).toContain('ssh-keygen -Y sign');
    expect(packager).toContain('lpvolley-release-archive');
    expect(packager).toContain('lpvolley-release-manifest');
    expect(packager).toContain('cat-file commit');
    expect(packager).toContain('cat-file tag');
    expect(packager).toContain('migrations.sha256');
    expect(packager).toContain('publication/preview/route.ts');
    expect(packager).toContain('publication/commit/route.ts');
    expect(packager).toContain('attendance/reinstate/preview/route.ts');
    expect(packager).toContain('attendance/reinstate/commit/route.ts');
    expect(packager).toContain('reserves/[entryId]/promote/preview/route.ts');
    expect(packager).toContain('reserves/[entryId]/promote/commit/route.ts');
    expect(packager).toContain('TournamentEngineV2Workspace.tsx');
    expect(packager).toContain('20260828_fix_womens_tournament_division.sql');
    expect(packager).toContain('scripts/benchmark-go-v2-scheduler.ts');
    expect(packager).toContain('tests/db/go-v2-preview-approval-immutability.sql');
    expect(packager).toContain('tests/db/go-v2-telegram-at-most-once.sql');
    expect(packager).toContain('web/lib/go-v2/court-policy.ts');
    expect(packager).toContain('web/lib/play-cron.ts');
    expect(packager).toContain('web/app/api/telegram/agent/route.ts');
    expect(packager).toContain('tests/db/go-v2-cross-tournament-scope.sql');
    expect(pilot).toContain('publication/preview/route.ts');
    expect(pilot).toContain('publication/commit/route.ts');
    expect(pilot).toContain('attendance/reinstate/preview/route.ts');
    expect(pilot).toContain('attendance/reinstate/commit/route.ts');
    expect(pilot).toContain('reserves/[entryId]/promote/preview/route.ts');
    expect(pilot).toContain('reserves/[entryId]/promote/commit/route.ts');
    expect(pilot).toContain('TournamentEngineV2Workspace.tsx');
    expect(pilot).toContain('web/lib/go-v2/court-policy.ts');
    expect(pilot).toContain('web/lib/play-cron.ts');
    expect(pilot).toContain('web/app/api/telegram/agent/route.ts');
    expect(pilot).toContain('tests/db/go-v2-cross-tournament-scope.sql');
    expect(pilot).toContain('tests/db/go-v2-preview-approval-immutability.sql');
    expect(pilot).toContain('tests/db/go-v2-telegram-at-most-once.sql');
    expect(generic).toContain('--source-archive PATH');
    expect(generic).toContain('tar -xf "$DEPLOY_SOURCE_ARCHIVE"');
    expect(generic).toContain('DEPLOY_SOURCE_ARCHIVE_SHA256 is required');
    expect(generic).toContain('overlay_persistent_public_assets');
    expect(generic).toContain('verify_staged_persistent_assets');
    expect(generic).toMatch(
      /systemctl is-active --quiet "\$SERVICE_NAME"[\s\S]*?overlay_persistent_public_assets "\$\{ATOMIC_RUNTIME_STAGE\}\/web"[\s\S]*?mv -- "\$ATOMIC_RUNTIME_TARGET"/,
    );
    expect(generic).toContain('stage_atomic_source_runtime');
    expect(generic).toContain('assert_atomic_runtime_service_binding');
    expect(generic).toContain('systemctl show "$SERVICE_NAME" --property=WorkingDirectory --value');
    expect(generic).toContain('configure a stable standalone path/indirection');
    expect(generic).toContain('activate_atomic_source_runtime');
    expect(generic).toContain('rollback_atomic_source_runtime');
    expect(generic).toContain('systemctl stop "$SERVICE_NAME"');
    expect(generic).toContain('atomic-runtime-previous.txt');
    expect(generic).toContain('images/users,images/players,images/tournaments,coach');
    expect(generic).toContain('rev-parse "${BUILD_GIT_REF}^{commit}"');
    expect(generic).toContain('BUILD_GIT_REF="$(git -C "$APP_DIR" rev-parse');
    expect(pilot).toContain('Never run this release wrapper as root');
    expect(generic).toContain('Never run deploy-server.sh as root');
    expect(pilot.indexOf('Never run this release wrapper as root')).toBeLessThan(pilot.indexOf('source "$ENV_FILE"'));
    expect(generic.indexOf('Never run deploy-server.sh as root')).toBeLessThan(generic.indexOf('source "$ENV_FILE"'));
    expect(pilot).not.toContain('sudo -n env APP_DIR=');
    expect(generic).not.toMatch(/sudo\s+-n\s+(?:env\s+)?(?:npm|node|bash\s+-lc)\b/);
    expect(generic).toContain('sudo -n systemctl stop "$SERVICE_NAME"');
    expect(generic).toContain('sudo -n rsync -a --delete "${source_runtime}/"');
    expect(generic).toContain('sudo -n chmod -R a+rX -- "$ATOMIC_RUNTIME_STAGE"');
    expect(generic).toContain('validate_privileged_deploy_targets');
    expect(generic).toContain('Privileged runtime target must be a concrete directory below /var/www');
    expect(pilot).toContain('safe_remove_release_workspace');
    expect(generic).toContain('rm -rf --one-file-system -- "$resolved_target"');
    expect(packager).toContain('safe_remove_package_workspace');
    expect(pilot).toContain('GO_V2_TELEGRAM_BRIDGE_ENABLED=false');
    expect(pilot).toContain('NO_RELAY_RUNNING_BRIDGE_DISABLED');
  });

  it('repairs the reviewed women tournament category only after a verified backup', () => {
    const pilot = read('scripts/deploy-go-v2-pilot.sh');
    const repair = read('scripts/data-fixes/20260828_fix_womens_tournament_division.sql');
    const backupPosition = pilot.indexOf('pg_dump -d "$GO_V2_DATABASE_NAME"');
    const repairPosition = pilot.indexOf('Applying reviewed idempotent calendar data correction');

    expect(backupPosition).toBeGreaterThanOrEqual(0);
    expect(repairPosition).toBeGreaterThan(backupPosition);
    expect(repair).toContain("695d6e20-5d3f-4f51-86d1-f0999e74a090");
    expect(repair).toContain("tournament_name IS DISTINCT FROM 'Лютый женский рандом тай'");
    expect(repair).toContain("tournament_status IS DISTINCT FROM 'finished'");
    expect(repair).toContain("tournament_division IS DISTINCT FROM 'Мужской'");
    expect(repair).toContain("SET division = 'Женский'");
    expect(repair).toContain('FOR UPDATE');
    expect(repair).not.toContain('DELETE FROM');
  });

  it('documents single-owner Telegram cutover and additive rollback', () => {
    const runbook = read('docs/GO_V2_PILOT_RELEASE.md');
    expect(runbook).toContain('105 → 106 → 107 → 108 → 109');
    expect(runbook).toContain('npm audit --audit-level=high');
    expect(runbook).toContain('109_go_v2_reserve_promotion.sql');
    expect(runbook).toContain('goV2PublicEnabled');
    expect(runbook).toContain('единственным отправителем **V2-уведомлений**');
    expect(runbook).toContain('TELEGRAM_OUTBOX_OWNER=relay');
    expect(runbook).toContain('GO_V2_TELEGRAM_BRIDGE_ENABLED=false');
    expect(runbook).toContain('NO_RELAY_RUNNING_BRIDGE_DISABLED');
    expect(runbook).toContain('provider-attempt fence');
    expect(runbook).toContain('строгий ноль автоматических дублей');
    expect(runbook).toContain('legacy Telegram runtime/token не менять');
    expect(runbook).toContain('SSH-вход под `root` запрещён');
    expect(runbook).toContain('sudo -n -u postgres pg_dump');
    expect(runbook).toContain('грязный runtime checkout');
    expect(runbook).toContain('Абсолютный exactly-once provider delivery');
    expect(runbook).toContain('Telegram API без idempotency key не обещается');
    expect(runbook).toContain('оставить additive таблицы/колонки');
    expect(runbook).toContain('DB restore');
  });
});
