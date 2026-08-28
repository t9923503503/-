#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
RELEASE_REF="HEAD"
OUTPUT_DIR="${REPO_ROOT}/../lpvolley-releases"
ALLOW_UNSIGNED=0
WORK_DIR=""
SIGNING_KEY="${GO_V2_RELEASE_SIGNING_KEY:-}"
SIGNER_PRINCIPAL="${GO_V2_RELEASE_SIGNER_PRINCIPAL:-}"

die() {
  printf '[package-go-v2] ERROR: %s\n' "$*" >&2
  exit 1
}

safe_remove_package_workspace() {
  local target="${1:-}"
  local temp_root
  local resolved_target

  [[ -n "$target" && -d "$target" && ! -L "$target" ]] || return 0
  temp_root="$(realpath -e -- "${TMPDIR:-/tmp}")" || return 1
  resolved_target="$(realpath -e -- "$target")" || return 1
  [[ "$(dirname -- "$resolved_target")" == "$temp_root" ]] || return 1
  [[ "$(basename -- "$resolved_target")" == go-v2-package.* ]] || return 1
  [[ "$resolved_target" != "/" && "$resolved_target" != "$temp_root" ]] || return 1
  rm -rf --one-file-system -- "$resolved_target"
}

cleanup() {
  if [[ -n "${WORK_DIR:-}" && -d "$WORK_DIR" ]]; then
    safe_remove_package_workspace "$WORK_DIR" \
      || printf '[package-go-v2] Refusing to remove unexpected path: %s\n' "$WORK_DIR" >&2
  fi
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: ./scripts/package-go-v2-pilot.sh [options]

Packages one clean, signed git commit into an immutable source archive for the
server-side GO V2 pilot deploy wrapper.

Options:
  --release-ref REF   Signed annotated tag whose commit is also signed.
  --output-dir PATH   Directory for .tar.gz and .sha256 files.
  --signing-key PATH  SSH private key used for detached release signatures.
  --signer-principal PRINCIPAL
                      Principal expected in the server trusted-signers file.
  --allow-unsigned    Local rehearsal only; production wrapper rejects it.
  --help              Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release-ref)
      [[ $# -ge 2 ]] || die "--release-ref requires a value"
      RELEASE_REF="$2"
      shift 2
      ;;
    --output-dir)
      [[ $# -ge 2 ]] || die "--output-dir requires a value"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --signing-key)
      [[ $# -ge 2 ]] || die "--signing-key requires a value"
      SIGNING_KEY="$2"
      shift 2
      ;;
    --signer-principal)
      [[ $# -ge 2 ]] || die "--signer-principal requires a value"
      SIGNER_PRINCIPAL="$2"
      shift 2
      ;;
    --allow-unsigned)
      ALLOW_UNSIGNED=1
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

for command_name in git tar sha256sum mktemp date realpath ssh-keygen; do
  command -v "$command_name" >/dev/null 2>&1 || die "Required command not found: ${command_name}"
done

[[ -z "$(git -C "$REPO_ROOT" status --porcelain=v1 --untracked-files=all)" ]] \
  || die "Release checkout is not clean. Commit only the reviewed pilot files first."

git -C "$REPO_ROOT" cat-file -e "${RELEASE_REF}^{commit}" 2>/dev/null \
  || die "Release ref does not resolve to a commit: ${RELEASE_REF}"
RELEASE_COMMIT="$(git -C "$REPO_ROOT" rev-parse "${RELEASE_REF}^{commit}")"
[[ "$RELEASE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || die "Could not resolve a full release commit SHA"

RELEASE_TAG_NAME=""
RELEASE_TAG_OBJECT=""
COMMIT_SIGNATURE_VERIFIED=0
TAG_SIGNATURE_VERIFIED=0
if git -C "$REPO_ROOT" verify-commit "$RELEASE_COMMIT"; then
  COMMIT_SIGNATURE_VERIFIED=1
fi
if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/tags/${RELEASE_REF}" \
  && [[ "$(git -C "$REPO_ROOT" cat-file -t "${RELEASE_REF}^{tag}" 2>/dev/null || true)" == "tag" ]]; then
  RELEASE_TAG_NAME="$RELEASE_REF"
  RELEASE_TAG_OBJECT="$(git -C "$REPO_ROOT" rev-parse "${RELEASE_REF}^{tag}")"
  if git -C "$REPO_ROOT" verify-tag "$RELEASE_REF"; then
    TAG_SIGNATURE_VERIFIED=1
  fi
fi
if [[ "$ALLOW_UNSIGNED" != "1" ]]; then
  [[ "$COMMIT_SIGNATURE_VERIFIED" == "1" ]] \
    || die "Production release commit has no valid SSH signature"
  [[ "$TAG_SIGNATURE_VERIFIED" == "1" && -n "$RELEASE_TAG_OBJECT" ]] \
    || die "Production release must use a signed annotated tag"
fi

if [[ -z "$SIGNING_KEY" ]]; then
  SIGNING_KEY="$(git -C "$REPO_ROOT" config --get user.signingkey || true)"
fi
if [[ "$SIGNING_KEY" == *.pub && -f "${SIGNING_KEY%.pub}" ]]; then
  SIGNING_KEY="${SIGNING_KEY%.pub}"
fi
if [[ -z "$SIGNER_PRINCIPAL" ]]; then
  SIGNER_PRINCIPAL="$(git -C "$REPO_ROOT" config --get user.email || true)"
fi
[[ "$SIGNER_PRINCIPAL" =~ ^[A-Za-z0-9@._+-]+$ ]] \
  || die "--signer-principal must be a simple SSH allowed-signers principal"
if [[ "$ALLOW_UNSIGNED" != "1" ]]; then
  [[ -n "$SIGNING_KEY" && -f "$SIGNING_KEY" ]] \
    || die "SSH signing key not found; pass --signing-key"
fi

MIGRATIONS=(
  "migrations/105_go_tournament_engine_v2.sql"
  "migrations/106_go_v2_live_schedule.sql"
  "migrations/107_go_v2_classification_rounds.sql"
  "migrations/108_go_v2_pilot_live_safety.sql"
  "migrations/109_go_v2_reserve_promotion.sql"
)
REQUIRED_FILES=(
  "${MIGRATIONS[@]}"
  "scripts/deploy-server.sh"
  "scripts/deploy-go-v2-pilot.sh"
  "scripts/benchmark-go-v2-scheduler.ts"
  "scripts/data-fixes/20260828_fix_womens_tournament_division.sql"
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
for path in "${REQUIRED_FILES[@]}"; do
  git -C "$REPO_ROOT" cat-file -e "${RELEASE_COMMIT}:${path}" 2>/dev/null \
    || die "Release commit is missing required file: ${path}"
done

mkdir -p -- "$OUTPUT_DIR"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/go-v2-package.XXXXXX")"
SOURCE_DIR="${WORK_DIR}/source"
mkdir -p -- "$SOURCE_DIR/.lpvolley-release"
git -C "$REPO_ROOT" archive "$RELEASE_COMMIT" | tar -x -C "$SOURCE_DIR"

{
  printf 'SCHEMA_VERSION=1\n'
  printf 'RELEASE_COMMIT=%s\n' "$RELEASE_COMMIT"
  printf 'RELEASE_TAG_NAME=%s\n' "$RELEASE_TAG_NAME"
  printf 'RELEASE_TAG_OBJECT=%s\n' "$RELEASE_TAG_OBJECT"
  printf 'SIGNER_PRINCIPAL=%s\n' "$SIGNER_PRINCIPAL"
  printf 'LOCAL_COMMIT_SIGNATURE_VERIFIED=%s\n' "$COMMIT_SIGNATURE_VERIFIED"
  printf 'LOCAL_TAG_SIGNATURE_VERIFIED=%s\n' "$TAG_SIGNATURE_VERIFIED"
  printf 'RELEASE_SIGNATURE_MODE=%s\n' "$([[ "$ALLOW_UNSIGNED" == "1" ]] && printf unsigned_rehearsal || printf ssh_verified)"
  printf 'CREATED_UTC=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
} >"${SOURCE_DIR}/.lpvolley-release/manifest.env"
(
  cd "$SOURCE_DIR"
  sha256sum "${MIGRATIONS[@]}" >.lpvolley-release/migrations.sha256
)

ARCHIVE_BASENAME="lpvolley-go-v2-${RELEASE_COMMIT}.tar.gz"
ARCHIVE_PATH="${OUTPUT_DIR}/${ARCHIVE_BASENAME}"
for output_path in \
  "$ARCHIVE_PATH" \
  "${ARCHIVE_PATH}.sha256" \
  "${ARCHIVE_PATH}.sig" \
  "${ARCHIVE_PATH}.manifest.env" \
  "${ARCHIVE_PATH}.manifest.env.sig" \
  "${ARCHIVE_PATH}.commit" \
  "${ARCHIVE_PATH}.tag"; do
  [[ ! -e "$output_path" ]] || die "Refusing to overwrite existing release artifact: ${output_path}"
done
tar -czf "$ARCHIVE_PATH" -C "$SOURCE_DIR" .
(
  cd "$OUTPUT_DIR"
  sha256sum "$ARCHIVE_BASENAME" >"${ARCHIVE_BASENAME}.sha256"
)

MANIFEST_SIDECAR="${ARCHIVE_PATH}.manifest.env"
COMMIT_OBJECT_SIDECAR="${ARCHIVE_PATH}.commit"
TAG_OBJECT_SIDECAR="${ARCHIVE_PATH}.tag"
cp -- "${SOURCE_DIR}/.lpvolley-release/manifest.env" "$MANIFEST_SIDECAR"
git -C "$REPO_ROOT" cat-file commit "$RELEASE_COMMIT" >"$COMMIT_OBJECT_SIDECAR"
if [[ -n "$RELEASE_TAG_OBJECT" ]]; then
  git -C "$REPO_ROOT" cat-file tag "$RELEASE_TAG_OBJECT" >"$TAG_OBJECT_SIDECAR"
else
  : >"$TAG_OBJECT_SIDECAR"
fi
if [[ "$ALLOW_UNSIGNED" != "1" ]]; then
  ssh-keygen -Y sign -f "$SIGNING_KEY" -n lpvolley-release-archive "$ARCHIVE_PATH"
  ssh-keygen -Y sign -f "$SIGNING_KEY" -n lpvolley-release-manifest "$MANIFEST_SIDECAR"
fi

printf 'Release commit: %s\n' "$RELEASE_COMMIT"
printf 'Local commit signature verified: %s\n' "$COMMIT_SIGNATURE_VERIFIED"
printf 'Local tag signature verified: %s\n' "$TAG_SIGNATURE_VERIFIED"
printf 'Archive: %s\n' "$ARCHIVE_PATH"
printf 'Checksum: %s.sha256\n' "$ARCHIVE_PATH"
printf 'Detached archive signature: %s.sig\n' "$ARCHIVE_PATH"
printf 'Signed manifest: %s (+ .sig)\n' "$MANIFEST_SIDECAR"
printf 'Git evidence: %s, %s\n' "$COMMIT_OBJECT_SIDECAR" "$TAG_OBJECT_SIDECAR"
