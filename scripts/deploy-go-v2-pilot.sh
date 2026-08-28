#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ENV_FILE="${SCRIPT_DIR}/deploy-server.env"
ENV_FILE="$DEFAULT_ENV_FILE"
RELEASE_ARCHIVE="${GO_V2_RELEASE_ARCHIVE:-}"
CHECKSUM_FILE="${GO_V2_RELEASE_CHECKSUM_FILE:-}"
RELEASE_REF="${GO_V2_RELEASE_REF:-}"
ARCHIVE_SIGNATURE="${GO_V2_RELEASE_ARCHIVE_SIGNATURE:-}"
RELEASE_MANIFEST_SIDECAR="${GO_V2_RELEASE_MANIFEST:-}"
MANIFEST_SIGNATURE="${GO_V2_RELEASE_MANIFEST_SIGNATURE:-}"
COMMIT_OBJECT_FILE="${GO_V2_RELEASE_COMMIT_OBJECT:-}"
TAG_OBJECT_FILE="${GO_V2_RELEASE_TAG_OBJECT:-}"
ALLOWED_SIGNERS_FILE="${GO_V2_RELEASE_ALLOWED_SIGNERS_FILE:-/etc/lpvolley/release-allowed-signers}"
RELEASE_SIGNER_PRINCIPAL="${GO_V2_RELEASE_SIGNER_PRINCIPAL:-}"
DEPLOY_LABEL="go-v2-pilot"
PREFLIGHT_ONLY=0
RELEASE_WORK_DIR=""

log() {
  printf '[go-v2-pilot %s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf '[go-v2-pilot %s] ERROR: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
  exit 1
}

safe_remove_release_workspace() {
  local target="${1:-}"
  local temp_root
  local resolved_target

  [[ -n "$target" && -d "$target" && ! -L "$target" ]] || return 0
  temp_root="$(realpath -e -- "${TMPDIR:-/tmp}")" || return 1
  resolved_target="$(realpath -e -- "$target")" || return 1
  [[ "$(dirname -- "$resolved_target")" == "$temp_root" ]] || return 1
  [[ "$(basename -- "$resolved_target")" == go-v2-release.* ]] || return 1
  [[ "$resolved_target" != "/" && "$resolved_target" != "$temp_root" ]] || return 1
  rm -rf --one-file-system -- "$resolved_target"
}

cleanup() {
  if [[ -n "${RELEASE_WORK_DIR:-}" && -d "$RELEASE_WORK_DIR" ]]; then
    safe_remove_release_workspace "$RELEASE_WORK_DIR" \
      || log "Refusing to remove unexpected temporary path: ${RELEASE_WORK_DIR}"
  fi
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-go-v2-pilot.sh [options]

Verifies a clean, locally packaged GO V2 source archive, performs fail-closed
database preflight and backup, applies exactly migrations 105-109, then deploys
the same immutable archive. The server's dirty git checkout is never read as a
release source and is never reset.

Options:
  --env-file PATH         Load deploy/server secrets from PATH.
  --release-archive PATH  Archive made by package-go-v2-pilot.sh.
  --checksum-file PATH    SHA-256 sidecar for the archive.
  --release-ref SHA       Exact 40-character commit embedded in the archive.
  --archive-signature PATH
                           Detached SSH signature for the archive.
  --release-manifest PATH Signed manifest copied verbatim into the archive.
  --manifest-signature PATH
                           Detached SSH signature for the release manifest.
  --commit-object PATH    Raw signed Git commit object.
  --tag-object PATH       Raw signed annotated Git tag object.
  --allowed-signers PATH  Root-owned SSH allowed-signers trust store.
  --signer-principal ID   Required trusted release signer principal.
  --label NAME            Deployment/backup label (default: go-v2-pilot).
  --preflight-only        Verify account, archive, sudo and DB prerequisites only.
  --help                  Show this help.
EOF
}

require_cmd() {
  local command_name
  for command_name in "$@"; do
    command -v "$command_name" >/dev/null 2>&1 || die "Required command not found: ${command_name}"
  done
}

manifest_value() {
  local key="$1"
  local manifest="$2"
  awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$manifest"
}

validate_env_file() {
  local env_path="$1"
  local owner_uid
  local mode

  [[ -f "$env_path" ]] || return 0
  owner_uid="$(stat -Lc '%u' -- "$env_path")"
  mode="$(stat -Lc '%a' -- "$env_path")"
  [[ "$owner_uid" == "0" || "$owner_uid" == "$(id -u)" ]] \
    || die "Env file must be owned by root or $(id -un): ${env_path}"
  (( (8#$mode & 8#022) == 0 )) \
    || die "Env file must not be group/world writable: ${env_path}"
}

validate_release_trust_store() {
  local trust_path="$1"
  local owner_uid
  local mode

  [[ -f "$trust_path" && ! -L "$trust_path" ]] \
    || die "Release trust store must be a regular non-symlink file: ${trust_path}"
  owner_uid="$(stat -Lc '%u' -- "$trust_path")"
  mode="$(stat -Lc '%a' -- "$trust_path")"
  [[ "$owner_uid" == "0" ]] || die "Release trust store must be root-owned: ${trust_path}"
  (( (8#$mode & 8#022) == 0 )) \
    || die "Release trust store must not be group/world writable: ${trust_path}"
}

validate_root_owned_executable() {
  local label="$1"
  local executable_path="$2"
  local owner_uid
  local mode

  [[ -x "$executable_path" && ! -L "$executable_path" ]] \
    || die "${label} verifier must resolve to a regular executable: ${executable_path}"
  owner_uid="$(stat -Lc '%u' -- "$executable_path")"
  mode="$(stat -Lc '%a' -- "$executable_path")"
  [[ "$owner_uid" == "0" ]] || die "${label} verifier must be root-owned: ${executable_path}"
  (( (8#$mode & 8#022) == 0 )) \
    || die "${label} verifier must not be group/world writable: ${executable_path}"
}

trusted_git() {
  env -i \
    PATH=/usr/bin:/bin \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_CONFIG_GLOBAL=/dev/null \
    "$TRUSTED_GIT_BIN" "$@"
}

verify_detached_ssh_signature() {
  local payload="$1"
  local signature="$2"
  local namespace="$3"

  "$TRUSTED_SSH_KEYGEN_BIN" -Y verify \
    -f "$ALLOWED_SIGNERS_FILE" \
    -I "$RELEASE_SIGNER_PRINCIPAL" \
    -n "$namespace" \
    -s "$signature" \
    <"$payload" >/dev/null \
    || die "Detached SSH signature verification failed for ${payload}"
}

validate_pilot_targets() {
  local resolved_app
  local resolved_web
  local resolved_migration
  local resolved_backup
  local resolved_deploy_home

  resolved_app="$(realpath -e -- "$APP_DIR")" || die "Cannot resolve APP_DIR: ${APP_DIR}"
  resolved_web="$(realpath -e -- "$WEB_DIR")" || die "Cannot resolve WEB_DIR: ${WEB_DIR}"
  resolved_migration="$(realpath -e -- "$SERVER_MIGRATION_102_PATH")" \
    || die "Cannot resolve production migration 102"
  resolved_backup="$(realpath -m -- "$GO_V2_DB_BACKUP_DIR")"
  resolved_deploy_home="$(realpath -e -- "$DEPLOY_ACCOUNT_HOME")" \
    || die "Cannot resolve deployment account home"
  [[ "$resolved_app" == /var/www/* && "$resolved_app" != "/var/www" ]] \
    || die "Pilot APP_DIR must be a concrete directory below /var/www"
  [[ "$resolved_web" == "${resolved_app}/web" ]] \
    || die "Pilot WEB_DIR must resolve exactly to APP_DIR/web"
  [[ "$resolved_migration" == "${resolved_app}/migrations/102_play_malibu_courts.sql" ]] \
    || die "Production migration 102 path escaped the reviewed APP_DIR target"
  [[ "$resolved_backup" == "$resolved_deploy_home"/* ]] \
    || die "GO_V2_DB_BACKUP_DIR must stay below the deployment account home"
  [[ "$SERVICE_NAME" =~ ^[A-Za-z0-9@_.-]+\.service$ ]] \
    || die "Unsafe systemd service name: ${SERVICE_NAME}"
}

postgres_query() {
  sudo -n -u postgres psql -d "$GO_V2_DATABASE_NAME" -X -A -t -q -v ON_ERROR_STOP=1
}

collect_referenced_public_assets() {
  cat <<'SQL' | postgres_query
BEGIN;
CREATE TEMP TABLE go_v2_release_asset_refs(url TEXT PRIMARY KEY) ON COMMIT DROP;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'photo_url'
  ) THEN
    EXECUTE $q$INSERT INTO go_v2_release_asset_refs
      SELECT DISTINCT photo_url FROM players
       WHERE photo_url LIKE '/images/%' ON CONFLICT DO NOTHING$q$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_url'
  ) THEN
    EXECUTE $q$INSERT INTO go_v2_release_asset_refs
      SELECT DISTINCT avatar_url FROM users
       WHERE avatar_url LIKE '/images/%' ON CONFLICT DO NOTHING$q$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'photo_url'
  ) THEN
    EXECUTE $q$INSERT INTO go_v2_release_asset_refs
      SELECT DISTINCT photo_url FROM tournaments
       WHERE photo_url LIKE '/images/%' ON CONFLICT DO NOTHING$q$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'cover_photo_url'
  ) THEN
    EXECUTE $q$INSERT INTO go_v2_release_asset_refs
      SELECT DISTINCT cover_photo_url FROM tournaments
       WHERE cover_photo_url LIKE '/images/%' ON CONFLICT DO NOTHING$q$;
  END IF;
  IF to_regclass('public.tournament_gallery_images') IS NOT NULL THEN
    EXECUTE $q$INSERT INTO go_v2_release_asset_refs
      SELECT DISTINCT image_url FROM tournament_gallery_images
       WHERE image_url LIKE '/images/%' ON CONFLICT DO NOTHING$q$;
    EXECUTE $q$INSERT INTO go_v2_release_asset_refs
      SELECT DISTINCT thumbnail_url FROM tournament_gallery_images
       WHERE thumbnail_url LIKE '/images/%' ON CONFLICT DO NOTHING$q$;
  END IF;
  IF to_regclass('public.coach_exercise_photos') IS NOT NULL THEN
    EXECUTE $q$INSERT INTO go_v2_release_asset_refs
      SELECT DISTINCT storage_url FROM coach_exercise_photos
       WHERE storage_url LIKE '/coach/%' ON CONFLICT DO NOTHING$q$;
  END IF;
  IF to_regclass('public.play_coaches') IS NOT NULL THEN
    EXECUTE $q$INSERT INTO go_v2_release_asset_refs
      SELECT DISTINCT photo_url FROM play_coaches
       WHERE photo_url LIKE '/coach/%' ON CONFLICT DO NOTHING$q$;
  END IF;
END $$;
SELECT url FROM go_v2_release_asset_refs ORDER BY url;
COMMIT;
SQL
}

verify_referenced_public_assets() {
  local public_root="$1"
  local refs_file="$2"
  local label="$3"
  local url
  local relative_path
  local missing=0

  while IFS= read -r url; do
    [[ -n "$url" ]] || continue
    case "$url" in
      /images/*|/coach/*) ;;
      *) die "Unsafe DB-referenced public asset path: ${url}" ;;
    esac
    relative_path="${url#/}"
    case "$relative_path" in
      *..*) die "Unsafe DB-referenced public asset path: ${url}" ;;
    esac
    if [[ ! -f "${public_root}/${relative_path}" ]]; then
      printf '[go-v2-pilot] Missing %s asset: %s\n' "$label" "$url" >&2
      missing=$((missing + 1))
    fi
  done <"$refs_file"
  [[ "$missing" -eq 0 ]] || die "${missing} DB-referenced ${label} assets are missing"
}

create_persistent_asset_manifest() {
  local public_root="$1"
  local output_file="$2"
  local relative_dir
  local normalized
  local absolute_dir
  local absolute_file
  local relative_file
  local file_hash
  local -a persistent_paths

  : >"$output_file"
  IFS=',' read -r -a persistent_paths <<<"$PERSISTENT_PUBLIC_PATHS"
  for relative_dir in "${persistent_paths[@]}"; do
    normalized="${relative_dir#./}"
    normalized="${normalized#/}"
    [[ -n "$normalized" ]] || continue
    case "$normalized" in
      *..*|/*) die "Unsafe PERSISTENT_PUBLIC_PATHS entry: ${relative_dir}" ;;
    esac
    absolute_dir="${public_root}/${normalized}"
    [[ -d "$absolute_dir" ]] || continue
    while IFS= read -r -d '' absolute_file; do
      relative_file="${absolute_file#${public_root}/}"
      file_hash="$(sudo -n sha256sum "$absolute_file" | awk '{ print $1 }')"
      printf '%s\t%s\n' "$file_hash" "$relative_file" >>"$output_file"
    done < <(sudo -n find "$absolute_dir" -type f -print0 | sort -z)
  done
}

verify_persistent_asset_manifest() {
  local public_root="$1"
  local manifest_file="$2"
  local label="$3"
  local expected_hash
  local relative_file
  local actual_hash
  local failed=0

  while IFS=$'\t' read -r expected_hash relative_file; do
    [[ -n "$relative_file" ]] || continue
    case "$relative_file" in
      *..*|/*) die "Unsafe persistent asset manifest path: ${relative_file}" ;;
    esac
    if [[ ! -f "${public_root}/${relative_file}" ]]; then
      printf '[go-v2-pilot] Missing %s persistent asset: %s\n' "$label" "$relative_file" >&2
      failed=$((failed + 1))
      continue
    fi
    actual_hash="$(sudo -n sha256sum "${public_root}/${relative_file}" | awk '{ print $1 }')"
    if [[ "$actual_hash" != "$expected_hash" ]]; then
      printf '[go-v2-pilot] Changed %s persistent asset: %s\n' "$label" "$relative_file" >&2
      failed=$((failed + 1))
    fi
  done <"$manifest_file"
  [[ "$failed" -eq 0 ]] || die "${failed} ${label} persistent assets were lost or changed"
}

ARGS=("$@")
for ((i = 0; i < ${#ARGS[@]}; i += 1)); do
  if [[ "${ARGS[$i]}" == "--env-file" ]]; then
    (( i + 1 < ${#ARGS[@]} )) || die "--env-file requires a value"
    ENV_FILE="${ARGS[$((i + 1))]}"
  fi
done

[[ "${EUID:-$(id -u)}" -ne 0 ]] \
  || die "Never run this release wrapper as root; use the dedicated deployment account"
if [[ -f "$ENV_FILE" ]]; then
  validate_env_file "$ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

RELEASE_ARCHIVE="${GO_V2_RELEASE_ARCHIVE:-$RELEASE_ARCHIVE}"
CHECKSUM_FILE="${GO_V2_RELEASE_CHECKSUM_FILE:-$CHECKSUM_FILE}"
RELEASE_REF="${GO_V2_RELEASE_REF:-$RELEASE_REF}"
ARCHIVE_SIGNATURE="${GO_V2_RELEASE_ARCHIVE_SIGNATURE:-$ARCHIVE_SIGNATURE}"
RELEASE_MANIFEST_SIDECAR="${GO_V2_RELEASE_MANIFEST:-$RELEASE_MANIFEST_SIDECAR}"
MANIFEST_SIGNATURE="${GO_V2_RELEASE_MANIFEST_SIGNATURE:-$MANIFEST_SIGNATURE}"
COMMIT_OBJECT_FILE="${GO_V2_RELEASE_COMMIT_OBJECT:-$COMMIT_OBJECT_FILE}"
TAG_OBJECT_FILE="${GO_V2_RELEASE_TAG_OBJECT:-$TAG_OBJECT_FILE}"
ALLOWED_SIGNERS_FILE="${GO_V2_RELEASE_ALLOWED_SIGNERS_FILE:-$ALLOWED_SIGNERS_FILE}"
RELEASE_SIGNER_PRINCIPAL="${GO_V2_RELEASE_SIGNER_PRINCIPAL:-$RELEASE_SIGNER_PRINCIPAL}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      shift 2
      ;;
    --release-archive)
      [[ $# -ge 2 ]] || die "--release-archive requires a value"
      RELEASE_ARCHIVE="$2"
      shift 2
      ;;
    --checksum-file)
      [[ $# -ge 2 ]] || die "--checksum-file requires a value"
      CHECKSUM_FILE="$2"
      shift 2
      ;;
    --release-ref)
      [[ $# -ge 2 ]] || die "--release-ref requires a value"
      RELEASE_REF="$2"
      shift 2
      ;;
    --archive-signature)
      [[ $# -ge 2 ]] || die "--archive-signature requires a value"
      ARCHIVE_SIGNATURE="$2"
      shift 2
      ;;
    --release-manifest)
      [[ $# -ge 2 ]] || die "--release-manifest requires a value"
      RELEASE_MANIFEST_SIDECAR="$2"
      shift 2
      ;;
    --manifest-signature)
      [[ $# -ge 2 ]] || die "--manifest-signature requires a value"
      MANIFEST_SIGNATURE="$2"
      shift 2
      ;;
    --commit-object)
      [[ $# -ge 2 ]] || die "--commit-object requires a value"
      COMMIT_OBJECT_FILE="$2"
      shift 2
      ;;
    --tag-object)
      [[ $# -ge 2 ]] || die "--tag-object requires a value"
      TAG_OBJECT_FILE="$2"
      shift 2
      ;;
    --allowed-signers)
      [[ $# -ge 2 ]] || die "--allowed-signers requires a value"
      ALLOWED_SIGNERS_FILE="$2"
      shift 2
      ;;
    --signer-principal)
      [[ $# -ge 2 ]] || die "--signer-principal requires a value"
      RELEASE_SIGNER_PRINCIPAL="$2"
      shift 2
      ;;
    --label)
      [[ $# -ge 2 ]] || die "--label requires a value"
      DEPLOY_LABEL="$2"
      shift 2
      ;;
    --preflight-only)
      PREFLIGHT_ONLY=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

APP_DIR="${APP_DIR:-/var/www/ipt}"
WEB_DIR="${WEB_DIR:-${APP_DIR}/web}"
SERVICE_NAME="${SERVICE_NAME:-kotc-web.service}"
DEPLOY_ACCOUNT="${GO_V2_DEPLOY_ACCOUNT:-lpdeploy}"
GO_V2_DATABASE_NAME="${GO_V2_DATABASE_NAME:-lpbvolley}"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/lpvolley-backups}"
GO_V2_DB_BACKUP_DIR="${GO_V2_DB_BACKUP_DIR:-${BACKUP_DIR}/go-v2}"
SERVER_MIGRATION_102_PATH="${GO_V2_SERVER_MIGRATION_102_PATH:-${APP_DIR}/migrations/102_play_malibu_courts.sql}"
PERSISTENT_PUBLIC_PATHS="${PERSISTENT_PUBLIC_PATHS:-images/users,images/players,images/tournaments,coach}"
GO_V2_CRON_HEALTHCHECK_URL="${GO_V2_CRON_HEALTHCHECK_URL:-http://127.0.0.1:3101/api/cron/telegram-flush}"
GO_V2_COURT_TOKEN_SECRET="${GO_V2_COURT_TOKEN_SECRET:-}"
CRON_SECRET="${CRON_SECRET:-}"
TELEGRAM_OUTBOX_OWNER="${TELEGRAM_OUTBOX_OWNER:-}"
GO_V2_TELEGRAM_BRIDGE_ENABLED="${GO_V2_TELEGRAM_BRIDGE_ENABLED:-}"

ARCHIVE_SIGNATURE="${ARCHIVE_SIGNATURE:-${RELEASE_ARCHIVE}.sig}"
RELEASE_MANIFEST_SIDECAR="${RELEASE_MANIFEST_SIDECAR:-${RELEASE_ARCHIVE}.manifest.env}"
MANIFEST_SIGNATURE="${MANIFEST_SIGNATURE:-${RELEASE_MANIFEST_SIDECAR}.sig}"
COMMIT_OBJECT_FILE="${COMMIT_OBJECT_FILE:-${RELEASE_ARCHIVE}.commit}"
TAG_OBJECT_FILE="${TAG_OBJECT_FILE:-${RELEASE_ARCHIVE}.tag}"

require_cmd awk cmp date env find getent git id mktemp realpath sha256sum sort ssh-keygen stat sudo tar tr
[[ "$(id -un)" == "$DEPLOY_ACCOUNT" ]] \
  || die "Run this wrapper from the ${DEPLOY_ACCOUNT} deployment account, never an SSH root session"
DEPLOY_ACCOUNT_HOME="$(getent passwd "$DEPLOY_ACCOUNT" | awk -F: 'NR == 1 { print $6 }')"
[[ -n "$DEPLOY_ACCOUNT_HOME" ]] || die "Cannot resolve home for deployment account ${DEPLOY_ACCOUNT}"
TRUSTED_GIT_BIN="$(realpath -e -- "$(command -v git)")"
TRUSTED_SSH_KEYGEN_BIN="$(realpath -e -- "$(command -v ssh-keygen)")"
validate_root_owned_executable git "$TRUSTED_GIT_BIN"
validate_root_owned_executable ssh-keygen "$TRUSTED_SSH_KEYGEN_BIN"
[[ -n "$RELEASE_ARCHIVE" && -f "$RELEASE_ARCHIVE" && ! -L "$RELEASE_ARCHIVE" ]] \
  || die "--release-archive must be a regular non-symlink file"
[[ -n "$CHECKSUM_FILE" && -f "$CHECKSUM_FILE" && ! -L "$CHECKSUM_FILE" ]] \
  || die "--checksum-file must be a regular non-symlink file"
[[ "$RELEASE_REF" =~ ^[0-9a-f]{40}$ ]] || die "--release-ref must be the exact 40-character commit SHA"
[[ "$RELEASE_SIGNER_PRINCIPAL" =~ ^[A-Za-z0-9@._+-]+$ ]] \
  || die "A simple --signer-principal is required"
[[ -d "$APP_DIR" && -d "$WEB_DIR" ]] || die "Runtime target is missing: ${APP_DIR} / ${WEB_DIR}"
[[ -f "$SERVER_MIGRATION_102_PATH" ]] \
  || die "Production migration history file is missing: ${SERVER_MIGRATION_102_PATH}"
validate_pilot_targets
[[ "${#GO_V2_COURT_TOKEN_SECRET}" -ge 32 ]] \
  || die "GO_V2_COURT_TOKEN_SECRET must contain at least 32 characters"
[[ "${CRON_SECRET:-}" =~ ^[A-Za-z0-9._~-]{32,}$ ]] \
  || die "CRON_SECRET must be at least 32 URL-safe characters"
[[ "${TELEGRAM_OUTBOX_OWNER:-}" == "relay" ]] \
  || die "TELEGRAM_OUTBOX_OWNER must be relay; the existing external relay remains the sole sender"
[[ "$GO_V2_TELEGRAM_BRIDGE_ENABLED" == "false" ]] \
  || die "Initial runtime deploy requires GO_V2_TELEGRAM_BRIDGE_ENABLED=false; enable it separately only after a verified relay heartbeat"

sudo -n -u postgres psql --version >/dev/null 2>&1 \
  || die "${DEPLOY_ACCOUNT} needs narrow sudo permission for postgres psql"
sudo -n -u postgres pg_dump --version >/dev/null 2>&1 \
  || die "${DEPLOY_ACCOUNT} needs narrow sudo permission for postgres pg_dump"
sudo -n -u postgres pg_restore --version >/dev/null 2>&1 \
  || die "${DEPLOY_ACCOUNT} needs narrow sudo permission for postgres pg_restore"
sudo -n systemctl show "$SERVICE_NAME" --property=Id --value >/dev/null 2>&1 \
  || die "${DEPLOY_ACCOUNT} needs narrow sudo permission for ${SERVICE_NAME} lifecycle checks"
server_migration_102_hash="$(sudo -n sha256sum "$SERVER_MIGRATION_102_PATH" | awk '{ print $1 }')"

expected_archive_hash="$(awk 'NR == 1 { print $1 }' "$CHECKSUM_FILE")"
expected_archive_name="$(awk 'NR == 1 { name=$2; sub(/^\*/, "", name); print name }' "$CHECKSUM_FILE")"
[[ "$expected_archive_hash" =~ ^[0-9a-fA-F]{64}$ ]] || die "Checksum sidecar has no valid SHA-256"
[[ "$expected_archive_name" == "$(basename -- "$RELEASE_ARCHIVE")" ]] \
  || die "Checksum sidecar names a different archive: ${expected_archive_name}"

RELEASE_WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/go-v2-release.XXXXXX")"
INPUT_DIR="${RELEASE_WORK_DIR}/input"
SOURCE_DIR="${RELEASE_WORK_DIR}/source"
mkdir -p -- "$INPUT_DIR" "$SOURCE_DIR"
VERIFY_REPO="${RELEASE_WORK_DIR}/verify.git"
TRUSTED_SIGNERS_FILE="${RELEASE_WORK_DIR}/trusted-release-signers"

# Freeze every uploaded trust artifact in the private workspace. All subsequent
# verification, extraction and deployment use these copies, closing rename/write
# races in the upload directory between verification and use.
cp -- "$RELEASE_ARCHIVE" "${INPUT_DIR}/release.tar.gz"
cp -- "$CHECKSUM_FILE" "${INPUT_DIR}/release.tar.gz.sha256"
[[ -f "$ARCHIVE_SIGNATURE" && ! -L "$ARCHIVE_SIGNATURE" ]] \
  && cp -- "$ARCHIVE_SIGNATURE" "${INPUT_DIR}/release.tar.gz.sig"
[[ -f "$RELEASE_MANIFEST_SIDECAR" && ! -L "$RELEASE_MANIFEST_SIDECAR" ]] \
  && cp -- "$RELEASE_MANIFEST_SIDECAR" "${INPUT_DIR}/release.manifest.env"
[[ -f "$MANIFEST_SIGNATURE" && ! -L "$MANIFEST_SIGNATURE" ]] \
  && cp -- "$MANIFEST_SIGNATURE" "${INPUT_DIR}/release.manifest.env.sig"
[[ -f "$COMMIT_OBJECT_FILE" && ! -L "$COMMIT_OBJECT_FILE" ]] \
  && cp -- "$COMMIT_OBJECT_FILE" "${INPUT_DIR}/release.commit"
[[ -f "$TAG_OBJECT_FILE" && ! -L "$TAG_OBJECT_FILE" ]] \
  && cp -- "$TAG_OBJECT_FILE" "${INPUT_DIR}/release.tag"
RELEASE_ARCHIVE="${INPUT_DIR}/release.tar.gz"
CHECKSUM_FILE="${INPUT_DIR}/release.tar.gz.sha256"
ARCHIVE_SIGNATURE="${INPUT_DIR}/release.tar.gz.sig"
RELEASE_MANIFEST_SIDECAR="${INPUT_DIR}/release.manifest.env"
MANIFEST_SIGNATURE="${INPUT_DIR}/release.manifest.env.sig"
COMMIT_OBJECT_FILE="${INPUT_DIR}/release.commit"
TAG_OBJECT_FILE="${INPUT_DIR}/release.tag"

frozen_checksum_hash="$(awk 'NR == 1 { print $1 }' "$CHECKSUM_FILE")"
frozen_checksum_name="$(awk 'NR == 1 { name=$2; sub(/^\*/, "", name); print name }' "$CHECKSUM_FILE")"
[[ "${frozen_checksum_hash,,}" == "${expected_archive_hash,,}" \
    && "$frozen_checksum_name" == "$expected_archive_name" ]] \
  || die "Checksum sidecar changed while release inputs were frozen"
actual_archive_hash="$(sha256sum "$RELEASE_ARCHIVE" | awk '{ print $1 }')"
[[ "${actual_archive_hash,,}" == "${expected_archive_hash,,}" ]] \
  || die "Frozen release archive SHA-256 mismatch"

signed_release=1
for evidence_file in \
  "$ARCHIVE_SIGNATURE" \
  "$RELEASE_MANIFEST_SIDECAR" \
  "$MANIFEST_SIGNATURE" \
  "$COMMIT_OBJECT_FILE" \
  "$TAG_OBJECT_FILE"; do
  if [[ ! -f "$evidence_file" || -L "$evidence_file" ]]; then
    signed_release=0
  fi
done
if [[ "$signed_release" != "1" ]]; then
  if [[ "$PREFLIGHT_ONLY" != "1" || "${GO_V2_ALLOW_UNSIGNED_REHEARSAL:-0}" != "1" ]]; then
    die "Production release requires detached archive/manifest signatures and raw signed commit/tag objects"
  fi
  log "Unsigned evidence accepted for disposable preflight only"
else
  validate_release_trust_store "$ALLOWED_SIGNERS_FILE"
  verify_detached_ssh_signature "$RELEASE_ARCHIVE" "$ARCHIVE_SIGNATURE" lpvolley-release-archive
  verify_detached_ssh_signature "$RELEASE_MANIFEST_SIDECAR" "$MANIFEST_SIGNATURE" lpvolley-release-manifest

  manifest_schema="$(manifest_value SCHEMA_VERSION "$RELEASE_MANIFEST_SIDECAR")"
  manifest_commit="$(manifest_value RELEASE_COMMIT "$RELEASE_MANIFEST_SIDECAR")"
  manifest_tag_name="$(manifest_value RELEASE_TAG_NAME "$RELEASE_MANIFEST_SIDECAR")"
  manifest_tag_object="$(manifest_value RELEASE_TAG_OBJECT "$RELEASE_MANIFEST_SIDECAR")"
  manifest_signer="$(manifest_value SIGNER_PRINCIPAL "$RELEASE_MANIFEST_SIDECAR")"
  manifest_signature_mode="$(manifest_value RELEASE_SIGNATURE_MODE "$RELEASE_MANIFEST_SIDECAR")"
  [[ "$manifest_schema" == "1" ]] || die "Unsupported signed release manifest schema: ${manifest_schema}"
  [[ "$manifest_commit" == "$RELEASE_REF" ]] || die "Signed manifest commit does not match --release-ref"
  [[ "$manifest_tag_name" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ \
      && "$manifest_tag_name" != *..* \
      && "$manifest_tag_name" != */.* \
      && "$manifest_tag_name" != *//* ]] \
    || die "Signed manifest contains an unsafe tag name"
  [[ "$manifest_tag_object" =~ ^[0-9a-f]{40}$ ]] || die "Signed manifest has no annotated tag object"
  [[ "$manifest_signer" == "$RELEASE_SIGNER_PRINCIPAL" ]] \
    || die "Signed manifest signer does not match the pinned server principal"
  [[ "$manifest_signature_mode" == "ssh_verified" ]] \
    || die "Production manifest is not marked for independent SSH verification"

  awk -v principal="$RELEASE_SIGNER_PRINCIPAL" '
    /^[[:space:]]*#/ || NF < 2 { next }
    {
      count = split($1, principals, ",")
      for (i = 1; i <= count; i += 1) {
        if (principals[i] == principal) { print; next }
      }
    }
  ' "$ALLOWED_SIGNERS_FILE" >"$TRUSTED_SIGNERS_FILE"
  [[ -s "$TRUSTED_SIGNERS_FILE" ]] \
    || die "Pinned signer principal is absent from the release trust store"

  trusted_git init --bare -q "$VERIFY_REPO"
  reconstructed_commit="$(trusted_git --git-dir="$VERIFY_REPO" hash-object -t commit -w --stdin <"$COMMIT_OBJECT_FILE")"
  [[ "$reconstructed_commit" == "$RELEASE_REF" ]] \
    || die "Raw commit object does not match the signed manifest"
  trusted_git \
    -c gpg.format=ssh \
    -c gpg.ssh.allowedSignersFile="$TRUSTED_SIGNERS_FILE" \
    -c gpg.ssh.program="$TRUSTED_SSH_KEYGEN_BIN" \
    --git-dir="$VERIFY_REPO" verify-commit "$reconstructed_commit" >/dev/null \
    || die "Server-side signed commit verification failed"

  reconstructed_tag="$(trusted_git --git-dir="$VERIFY_REPO" hash-object -t tag -w --stdin <"$TAG_OBJECT_FILE")"
  [[ "$reconstructed_tag" == "$manifest_tag_object" ]] \
    || die "Raw tag object does not match the signed manifest"
  trusted_git \
    -c gpg.format=ssh \
    -c gpg.ssh.allowedSignersFile="$TRUSTED_SIGNERS_FILE" \
    -c gpg.ssh.program="$TRUSTED_SSH_KEYGEN_BIN" \
    --git-dir="$VERIFY_REPO" verify-tag "$reconstructed_tag" >/dev/null \
    || die "Server-side signed annotated tag verification failed"
  [[ "$(trusted_git --git-dir="$VERIFY_REPO" rev-parse "${reconstructed_tag}^{}")" == "$RELEASE_REF" ]] \
    || die "Signed tag does not resolve to the requested release commit"
  verified_tag_name="$(trusted_git --git-dir="$VERIFY_REPO" cat-file tag "$reconstructed_tag" \
    | awk '$1 == "tag" { print $2; exit }')"
  [[ "$verified_tag_name" == "$manifest_tag_name" ]] \
    || die "Signed tag object name does not match the signed manifest"
fi

if tar -tzf "$RELEASE_ARCHIVE" | awk '/(^\/|(^|\/)\.\.($|\/))/{ bad=1 } END { exit bad ? 0 : 1 }'; then
  die "Release archive contains an unsafe absolute or parent path"
fi
tar --no-same-owner --no-same-permissions -xzf "$RELEASE_ARCHIVE" -C "$SOURCE_DIR"

MANIFEST_FILE="${SOURCE_DIR}/.lpvolley-release/manifest.env"
MIGRATION_MANIFEST="${SOURCE_DIR}/.lpvolley-release/migrations.sha256"
[[ -f "$MANIFEST_FILE" && -f "$MIGRATION_MANIFEST" ]] \
  || die "Release archive is missing its immutable manifest"
if [[ "$signed_release" == "1" ]]; then
  cmp -s -- "$RELEASE_MANIFEST_SIDECAR" "$MANIFEST_FILE" \
    || die "Archive manifest differs from the independently signed manifest"
else
  manifest_schema="$(manifest_value SCHEMA_VERSION "$MANIFEST_FILE")"
  manifest_commit="$(manifest_value RELEASE_COMMIT "$MANIFEST_FILE")"
  [[ "$manifest_schema" == "1" && "$manifest_commit" == "$RELEASE_REF" ]] \
    || die "Unsigned rehearsal manifest does not match the requested commit"
fi

MIGRATIONS=(
  "migrations/105_go_tournament_engine_v2.sql"
  "migrations/106_go_v2_live_schedule.sql"
  "migrations/107_go_v2_classification_rounds.sql"
  "migrations/108_go_v2_pilot_live_safety.sql"
  "migrations/109_go_v2_reserve_promotion.sql"
)
CALENDAR_DATA_FIX="scripts/data-fixes/20260828_fix_womens_tournament_division.sql"
mapfile -t manifest_paths < <(awk '{ $1=""; sub(/^ +[*]?/, ""); print }' "$MIGRATION_MANIFEST")
[[ "${#manifest_paths[@]}" -eq "${#MIGRATIONS[@]}" ]] \
  || die "Migration manifest must contain exactly five files"
for ((i = 0; i < ${#MIGRATIONS[@]}; i += 1)); do
  [[ "${manifest_paths[$i]}" == "${MIGRATIONS[$i]}" ]] \
    || die "Unexpected migration order in manifest: ${manifest_paths[$i]}"
done
(
  cd "$SOURCE_DIR"
  sha256sum --check --strict .lpvolley-release/migrations.sha256
) || die "Migration SHA-256 verification failed"

REQUIRED_RELEASE_FILES=(
  "${MIGRATIONS[@]}"
  "$CALENDAR_DATA_FIX"
  "scripts/deploy-server.sh"
  "web/lib/go-v2-activation.ts"
  "web/lib/admin-queries-pg.ts"
  "web/lib/admin-postgrest.ts"
  "web/lib/queries.ts"
  "web/lib/go-v2/index.ts"
  "web/lib/go-v2/publication.ts"
  "web/lib/go-v2-publication.ts"
  "web/lib/go-v2/service.ts"
  "web/lib/go-v2/repository.ts"
  "web/lib/go-v2/court-policy.ts"
  "web/lib/go-v2/scheduler/index.ts"
  "web/lib/go-v2/notification-delivery.ts"
  "web/lib/play-cron.ts"
  "web/components/go-v2/TournamentEngineV2Workspace.tsx"
  "web/app/admin/tournaments/[id]/engine-v2/page.tsx"
  "web/app/api/admin/go-v2/tournaments/[id]/attendance/reinstate/preview/route.ts"
  "web/app/api/admin/go-v2/tournaments/[id]/attendance/reinstate/commit/route.ts"
  "web/app/api/admin/go-v2/tournaments/[id]/reserves/[entryId]/promote/preview/route.ts"
  "web/app/api/admin/go-v2/tournaments/[id]/reserves/[entryId]/promote/commit/route.ts"
  "web/app/api/admin/go-v2/tournaments/[id]/publication/preview/route.ts"
  "web/app/api/admin/go-v2/tournaments/[id]/publication/commit/route.ts"
  "web/app/api/admin/tournaments/route.ts"
  "web/app/api/go-v2/tournaments/[id]/structure/route.ts"
  "web/app/api/cron/telegram-flush/route.ts"
  "web/app/api/telegram/agent/route.ts"
  "telegram-bot/bot.mjs"
  "tests/db/go-v2-preview-approval-immutability.sql"
  "tests/db/go-v2-cross-tournament-scope.sql"
  "tests/db/go-v2-telegram-at-most-once.sql"
)
for path in "${REQUIRED_RELEASE_FILES[@]}"; do
  [[ -f "${SOURCE_DIR}/${path}" ]] || die "Release archive is missing required file: ${path}"
done
[[ ! -e "${SOURCE_DIR}/migrations/102_go_tournament_engine_v2.sql" ]] \
  || die "Release archive contains obsolete conflicting V2 migration 102"

missing_prerequisites="$({
  cat <<'SQL' | postgres_query
WITH required_relations(name) AS (
  VALUES ('tournaments'), ('players'), ('users'), ('play_venues'), ('telegram_outbox')
), required_columns(table_name, column_name) AS (
  VALUES
    ('tournaments', 'settings'),
    ('users', 'player_id'),
    ('users', 'telegram_chat_id'),
    ('users', 'telegram_private_chat_id'),
    ('telegram_outbox', 'attempts'),
    ('telegram_outbox', 'sent_at'),
    ('telegram_outbox', 'dedup_key')
), missing AS (
  SELECT 'relation:' || name AS item
    FROM required_relations
   WHERE to_regclass('public.' || name) IS NULL
  UNION ALL
  SELECT 'column:' || table_name || '.' || column_name
    FROM required_columns requirement
   WHERE NOT EXISTS (
     SELECT 1
       FROM information_schema.columns actual
      WHERE actual.table_schema = 'public'
        AND actual.table_name = requirement.table_name
        AND actual.column_name = requirement.column_name
   )
  UNION ALL
  SELECT 'role:lpbvolley'
   WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley')
)
SELECT COALESCE(string_agg(item, ',' ORDER BY item), '') FROM missing;
SQL
} | tr -d '\r')"
[[ -z "$missing_prerequisites" ]] \
  || die "Database prerequisites are missing: ${missing_prerequisites}. Apply legacy prerequisites first."

existing_v2_schema="$({
  cat <<'SQL' | postgres_query
SELECT concat_ws(',',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tournaments'
       AND column_name = 'go_engine_version'
  ) THEN 'column:tournaments.go_engine_version' END,
  CASE WHEN to_regclass('public.go_v2_tournament_state') IS NOT NULL THEN 'table:go_v2_tournament_state' END,
  CASE WHEN to_regclass('public.go_v2_schedule_versions') IS NOT NULL THEN 'table:go_v2_schedule_versions' END
);
SQL
} | tr -d '\r')"
[[ -z "$existing_v2_schema" ]] \
  || die "V2 schema already or partially exists (${existing_v2_schema}); stop for an explicit migration-state audit instead of rerunning"

REFERENCED_ASSETS_FILE="${RELEASE_WORK_DIR}/db-referenced-public-assets.txt"
collect_referenced_public_assets | tr -d '\r' >"$REFERENCED_ASSETS_FILE"
verify_referenced_public_assets "${WEB_DIR}/public" "$REFERENCED_ASSETS_FILE" "runtime public"
PERSISTENT_ASSET_MANIFEST="${RELEASE_WORK_DIR}/persistent-public-assets.sha256"
create_persistent_asset_manifest "${WEB_DIR}/public" "$PERSISTENT_ASSET_MANIFEST"
verify_persistent_asset_manifest "${WEB_DIR}/public" "$PERSISTENT_ASSET_MANIFEST" "runtime public"

log "Preflight passed for immutable release ${RELEASE_REF} (${actual_archive_hash})"
log "Preserved production migration 102 SHA-256: ${server_migration_102_hash}"
if [[ "$PREFLIGHT_ONLY" == "1" ]]; then
  log "Preflight-only mode completed; database and runtime were not changed"
  exit 0
fi

[[ "${GO_V2_DEPLOY_CONFIRM:-}" == "APPLY_GO_V2_PILOT" ]] \
  || die "Set GO_V2_DEPLOY_CONFIRM=APPLY_GO_V2_PILOT for an intentional production pilot release"
[[ "${GO_V2_REHEARSAL_CONFIRMED:-}" == "RESTORE_AND_TESTS_PASSED" ]] \
  || die "Set GO_V2_REHEARSAL_CONFIRMED=RESTORE_AND_TESTS_PASSED only after disposable restore/build/E2E rehearsal"
case "${GO_V2_TELEGRAM_RELAY_STOP_CONFIRMED:-}" in
  RELAY_STOPPED_FOR_CUTOVER)
    log "Telegram relay cutover was explicitly confirmed"
    ;;
  NO_RELAY_RUNNING_BRIDGE_DISABLED)
    log "No relay is running; V2 remains unpublished and its Telegram bridge must stay disabled until one relay is verified"
    ;;
  *)
    die "Set GO_V2_TELEGRAM_RELAY_STOP_CONFIRMED to RELAY_STOPPED_FOR_CUTOVER or the truthful disabled-pilot state NO_RELAY_RUNNING_BRIDGE_DISABLED"
    ;;
esac

mkdir -p -- "$GO_V2_DB_BACKUP_DIR"
chmod 700 -- "$GO_V2_DB_BACKUP_DIR"
EVIDENCE_DIR="${GO_V2_DB_BACKUP_DIR}/evidence-${RELEASE_REF:0:12}-$(date '+%Y%m%d-%H%M%S')"
mkdir -p -- "$EVIDENCE_DIR"
chmod 700 -- "$EVIDENCE_DIR"
BACKUP_FILE="${EVIDENCE_DIR}/pre-go-v2.dump"
BACKUP_LIST="${EVIDENCE_DIR}/pre-go-v2.restore-list.txt"

log "Creating PostgreSQL custom-format backup as local postgres: ${BACKUP_FILE}"
sudo -n -u postgres pg_dump -d "$GO_V2_DATABASE_NAME" --format=custom --no-owner >"$BACKUP_FILE"
chmod 600 -- "$BACKUP_FILE"
[[ -s "$BACKUP_FILE" ]] || die "Database backup is empty"
sudo -n -u postgres pg_restore --list <"$BACKUP_FILE" >"$BACKUP_LIST"
[[ -s "$BACKUP_LIST" ]] || die "pg_restore could not list the database backup"

cp -- "$CHECKSUM_FILE" "${EVIDENCE_DIR}/release-archive.sha256"
cp -- "$MIGRATION_MANIFEST" "${EVIDENCE_DIR}/migrations.sha256"
if [[ "$signed_release" == "1" ]]; then
  cp -- "$ARCHIVE_SIGNATURE" "${EVIDENCE_DIR}/release-archive.sig"
  cp -- "$RELEASE_MANIFEST_SIDECAR" "${EVIDENCE_DIR}/release-manifest.env"
  cp -- "$MANIFEST_SIGNATURE" "${EVIDENCE_DIR}/release-manifest.env.sig"
  cp -- "$COMMIT_OBJECT_FILE" "${EVIDENCE_DIR}/release.commit"
  cp -- "$TAG_OBJECT_FILE" "${EVIDENCE_DIR}/release.tag"
  printf '%s\n' "$RELEASE_SIGNER_PRINCIPAL" >"${EVIDENCE_DIR}/release-signer-principal.txt"
fi
sudo -n cp -- "$SERVER_MIGRATION_102_PATH" "${EVIDENCE_DIR}/102_play_malibu_courts.sql"
sudo -n sha256sum "$SERVER_MIGRATION_102_PATH" >"${EVIDENCE_DIR}/102_play_malibu_courts.sha256"
cp -- "$REFERENCED_ASSETS_FILE" "${EVIDENCE_DIR}/db-referenced-public-assets.txt"
cp -- "$PERSISTENT_ASSET_MANIFEST" "${EVIDENCE_DIR}/persistent-public-assets.sha256"
printf '%s\n' "$RELEASE_REF" >"${EVIDENCE_DIR}/release-commit.txt"
printf '%s\n' "$actual_archive_hash" >"${EVIDENCE_DIR}/release-archive-hash.txt"
sudo -n systemctl show "$SERVICE_NAME" \
  --property=FragmentPath,DropInPaths,User,Group,WorkingDirectory,ExecStart \
  >"${EVIDENCE_DIR}/systemd-unit-metadata.txt"
sudo -n systemctl is-active "$SERVICE_NAME" >"${EVIDENCE_DIR}/service-state-before.txt"
if git -c safe.directory="$APP_DIR" -C "$APP_DIR" rev-parse HEAD >"${EVIDENCE_DIR}/runtime-head-before.txt" 2>/dev/null; then
  :
else
  printf 'unavailable\n' >"${EVIDENCE_DIR}/runtime-head-before.txt"
fi
cat <<'SQL' | postgres_query >"${EVIDENCE_DIR}/legacy-counts-before.txt"
SELECT 'tournaments=' || count(*) FROM tournaments
UNION ALL SELECT 'players=' || count(*) FROM players
UNION ALL SELECT 'telegram_outbox_pending=' || count(*) FROM telegram_outbox WHERE sent_at IS NULL;
SQL
if [[ -s "$REFERENCED_ASSETS_FILE" ]]; then
  while IFS= read -r asset_url; do
    [[ -n "$asset_url" ]] || continue
    sudo -n sha256sum "${WEB_DIR}/public/${asset_url#/}"
  done <"$REFERENCED_ASSETS_FILE" >"${EVIDENCE_DIR}/public-assets-before.sha256"
else
  : >"${EVIDENCE_DIR}/public-assets-before.sha256"
fi

log "Applying reviewed idempotent calendar data correction after the verified backup"
sudo -n -u postgres psql -d "$GO_V2_DATABASE_NAME" -X -v ON_ERROR_STOP=1 -f - \
  <"${SOURCE_DIR}/${CALENDAR_DATA_FIX}" \
  >"${EVIDENCE_DIR}/calendar-data-fix-result.txt"

calendar_fix_verification="$({
  cat <<'SQL' | postgres_query
SELECT CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM tournaments
     WHERE id = '695d6e20-5d3f-4f51-86d1-f0999e74a090'::UUID
  ) THEN 'absent'
  WHEN EXISTS (
    SELECT 1 FROM tournaments
     WHERE id = '695d6e20-5d3f-4f51-86d1-f0999e74a090'::UUID
       AND name = 'Лютый женский рандом тай'
       AND status = 'finished'
       AND division = 'Женский'
  ) THEN 'correct'
  ELSE 'unexpected'
END;
SQL
} | tr -d '\r')"
printf '%s\n' "$calendar_fix_verification" \
  >"${EVIDENCE_DIR}/calendar-data-fix-verification.txt"
[[ "$calendar_fix_verification" == "correct" || "$calendar_fix_verification" == "absent" ]] \
  || die "Known calendar tournament data correction failed verification"

for migration in "${MIGRATIONS[@]}"; do
  log "Applying ${migration}"
  sudo -n -u postgres psql -d "$GO_V2_DATABASE_NAME" -X -v ON_ERROR_STOP=1 -f - \
    <"${SOURCE_DIR}/${migration}"
done

verification="$({
  cat <<'SQL' | postgres_query
SELECT json_build_object(
  'engine_column', EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tournaments'
       AND column_name = 'go_engine_version'
  ),
  'state_table', to_regclass('public.go_v2_tournament_state') IS NOT NULL,
  'schedule_table', to_regclass('public.go_v2_schedule_versions') IS NOT NULL,
  'classification_dag', to_regclass('public.go_v2_match_dependencies') IS NOT NULL,
  'pilot_pause_ledger', to_regclass('public.go_v2_match_pause_resolutions') IS NOT NULL,
  'reserve_promotion_ledger', to_regclass('public.go_v2_reserve_promotion_revisions') IS NOT NULL,
  'runtime_read', has_table_privilege('lpbvolley', 'go_v2_tournament_state', 'SELECT'),
  'runtime_write', has_table_privilege('lpbvolley', 'go_v2_tournament_state', 'INSERT,UPDATE')
)::text;
SQL
} | tr -d '\r')"
log "Schema verification: ${verification}"
printf '%s\n' "$verification" >"${EVIDENCE_DIR}/schema-verification.txt"
[[ "$verification" != *":false"* && "$verification" != *": false"* ]] \
  || die "GO V2 schema or runtime grants failed verification"

log "Deploying the exact verified source archive; generic migrations stay disabled"
env APP_DIR="$APP_DIR" WEB_DIR="$WEB_DIR" \
  DEPLOY_SOURCE_ARCHIVE_SHA256="$actual_archive_hash" \
  DEPLOY_PERSISTENT_ASSET_MANIFEST="$PERSISTENT_ASSET_MANIFEST" \
  DEPLOY_AUTH_HEALTHCHECK_URL="$GO_V2_CRON_HEALTHCHECK_URL" \
  DEPLOY_AUTH_HEALTHCHECK_BEARER="$CRON_SECRET" \
  DEPLOY_AUTH_HEALTHCHECK_CODES="200,409" \
  bash "${SOURCE_DIR}/scripts/deploy-server.sh" \
    --env-file "$ENV_FILE" \
    --git-ref "$RELEASE_REF" \
    --source-archive "$RELEASE_ARCHIVE" \
    --no-pull \
    --skip-root-install \
    --skip-root-build \
    --skip-static-sync \
    --skip-migrations \
    --label "$DEPLOY_LABEL"

verify_referenced_public_assets "${WEB_DIR}/public" "$REFERENCED_ASSETS_FILE" "runtime public"
verify_referenced_public_assets "${WEB_DIR}/.next/standalone/web/public" "$REFERENCED_ASSETS_FILE" "standalone public"
verify_persistent_asset_manifest "${WEB_DIR}/public" "$PERSISTENT_ASSET_MANIFEST" "runtime public"
verify_persistent_asset_manifest "${WEB_DIR}/.next/standalone/web/public" "$PERSISTENT_ASSET_MANIFEST" "standalone public"
if [[ -s "${EVIDENCE_DIR}/public-assets-before.sha256" ]]; then
  sudo -n sha256sum --check "${EVIDENCE_DIR}/public-assets-before.sha256" \
    >"${EVIDENCE_DIR}/public-assets-after-check.txt"
else
  printf 'no-local-db-referenced-assets\n' >"${EVIDENCE_DIR}/public-assets-after-check.txt"
fi

log "GO V2 pilot release completed: ${RELEASE_REF}"
log "Verified release SHA-256: ${actual_archive_hash}"
log "Backup and release evidence retained at: ${EVIDENCE_DIR}"
