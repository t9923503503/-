#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DEFAULT_ENV_FILE="$SCRIPT_DIR/deploy-server.env"

PULL_ENABLED=1
ROOT_INSTALL_ENABLED=1
ROOT_BUILD_ENABLED=1
WEB_INSTALL_ENABLED=1
WEB_BUILD_ENABLED=1
STATIC_SYNC_ENABLED=1
STANDALONE_SYNC_ENABLED=1
RUN_MIGRATIONS=0
RESTART_SERVICE=1
HEALTHCHECK_ENABLED=1
BACKUP_ENABLED=1
DEPLOY_LABEL=""

log() {
  printf '[deploy %s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

warn() {
  printf '[deploy %s] WARN: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
}

die() {
  printf '[deploy %s] ERROR: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  local line_no="${1:-unknown}"
  die "Command failed with exit code ${exit_code} on line ${line_no}"
}

trap 'on_error ${LINENO}' ERR

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-server.sh [options]

Runs the server-side deployment cycle for this repository:
git pull -> optional npm ci -> root build -> web build -> standalone sync ->
static sync -> optional migrations -> service restart -> healthchecks.

Options:
  --env-file PATH          Load deployment env from PATH.
  --branch NAME            Override git branch.
  --remote NAME            Override git remote.
  --label NAME             Add NAME to the backup folder suffix.
  --sync-mode MODE         Force static sync mode: overlay | mirror.
  --no-pull                Skip git fetch/pull.
  --skip-root-install      Skip npm ci in repo root.
  --skip-root-build        Skip npm run build in repo root.
  --skip-web-install       Skip npm ci in web/.
  --skip-web-build         Skip npm run build in web/.
  --skip-static-sync       Do not copy dist/ into STATIC_TARGET_DIR.
  --skip-standalone-sync   Do not sync web/.next/static + web/public into standalone.
  --run-migrations         Run MIGRATE_COMMAND from env.
  --skip-migrations        Skip MIGRATE_COMMAND even if env enables it.
  --skip-restart           Skip systemctl restart SERVICE_NAME.
  --skip-healthcheck       Skip curl/systemctl probes.
  --skip-backup            Disable backups into BACKUP_DIR.
  --help                   Show this help.
EOF
}

require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: ${cmd}"
  done
}

normalize_bool() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) printf '1' ;;
    0|false|FALSE|no|NO|off|OFF) printf '0' ;;
    *) die "Invalid boolean value: ${1}" ;;
  esac
}

sanitize_label() {
  local raw="${1:-manual}"
  printf '%s' "$raw" | tr -cs 'A-Za-z0-9._-' '-'
}

run_in_dir() {
  local dir="$1"
  local cmd="$2"
  log "(${dir}) ${cmd}"
  (
    cd "$dir"
    bash -lc "$cmd"
  )
}

http_code_allowed() {
  local code="$1"
  local allowed="${2:-}"
  local item

  IFS=',' read -r -a allowed_codes <<<"$allowed"
  for item in "${allowed_codes[@]}"; do
    item="${item//[[:space:]]/}"
    if [[ "$item" == "$code" ]]; then
      return 0
    fi
  done

  return 1
}

probe_url() {
  local url="$1"
  local allowed_codes="$2"
  local label="$3"
  local code

  code="$(
    curl \
      --silent \
      --show-error \
      --output /dev/null \
      --location \
      --max-time "$HEALTHCHECK_TIMEOUT_SEC" \
      --write-out '%{http_code}' \
      "$url"
  )"

  if ! http_code_allowed "$code" "$allowed_codes"; then
    die "${label} probe failed: ${url} returned ${code}, expected one of ${allowed_codes}"
  fi

  log "${label} probe passed: ${url} -> ${code}"
}

# Проверка Content-Type (ловит отдачу index.html вместо CSS из-за try_files)
probe_content_type_contains() {
  local url="$1"
  local needle="$2"
  local label="$3"
  local ct
  local ct_lc

  [[ -n "$url" ]] || return 0

  ct="$(
    curl \
      --silent \
      --show-error \
      --location \
      --max-time "$HEALTHCHECK_TIMEOUT_SEC" \
      --output /dev/null \
      --write-out '%{content_type}' \
      "$url"
  )" || die "${label}: failed to fetch ${url}"

  ct_lc="$(printf '%s' "$ct" | tr '[:upper:]' '[:lower:]')"
  if [[ "$ct_lc" == *"$needle"* ]]; then
    log "${label} Content-Type OK: ${ct}"
    return 0
  fi

  die "${label}: ${url} Content-Type is '${ct}' (expected '${needle}'). nginx may be serving HTML for CSS — see docs/nginx-lpvolley.example.conf"
}

ensure_dir() {
  mkdir -p "$1"
}

backup_tree_if_exists() {
  local source="$1"
  local label="$2"

  if [[ "$BACKUP_ENABLED" != "1" || ! -e "$source" ]]; then
    return 0
  fi

  ensure_dir "$CURRENT_BACKUP_DIR"
  log "Backing up ${source} -> ${CURRENT_BACKUP_DIR}/${label}"
  cp -a "$source" "$CURRENT_BACKUP_DIR/$label"
}

sync_static_overlay() {
  local item
  local item_name
  local source_path
  local target_path

  while IFS= read -r -d '' item; do
    item_name="$(basename "$item")"
    source_path="$item"
    target_path="${STATIC_TARGET_DIR}/${item_name}"

    if [[ -d "$source_path" ]]; then
      ensure_dir "$target_path"
      if [[ "$BACKUP_ENABLED" == "1" ]]; then
        ensure_dir "${CURRENT_BACKUP_DIR}/static/${item_name}"
        log "Overlay rsync ${source_path}/ -> ${target_path}/ (with backup)"
        rsync -a --backup --backup-dir "${CURRENT_BACKUP_DIR}/static/${item_name}" "${source_path}/" "${target_path}/"
      else
        log "Overlay rsync ${source_path}/ -> ${target_path}/"
        rsync -a "${source_path}/" "${target_path}/"
      fi
      continue
    fi

    ensure_dir "$(dirname "$target_path")"
    if [[ "$BACKUP_ENABLED" == "1" && -e "$target_path" ]]; then
      ensure_dir "${CURRENT_BACKUP_DIR}/static"
      log "Backing up ${target_path} -> ${CURRENT_BACKUP_DIR}/static/${item_name}"
      cp -a "$target_path" "${CURRENT_BACKUP_DIR}/static/${item_name}"
    fi

    log "Copy ${source_path} -> ${target_path}"
    cp -f "$source_path" "$target_path"
  done < <(find "$STATIC_BUILD_DIR" -mindepth 1 -maxdepth 1 -print0 | sort -z)
}

sync_static_mirror() {
  ensure_dir "$STATIC_TARGET_DIR"

  if [[ "$BACKUP_ENABLED" == "1" ]]; then
    ensure_dir "${CURRENT_BACKUP_DIR}/static"
    log "Mirror rsync ${STATIC_BUILD_DIR}/ -> ${STATIC_TARGET_DIR}/ (delete + backup)"
    rsync -a --delete --backup --backup-dir "${CURRENT_BACKUP_DIR}/static" "${STATIC_BUILD_DIR}/" "${STATIC_TARGET_DIR}/"
    return
  fi

  log "Mirror rsync ${STATIC_BUILD_DIR}/ -> ${STATIC_TARGET_DIR}/ (delete)"
  rsync -a --delete "${STATIC_BUILD_DIR}/" "${STATIC_TARGET_DIR}/"
}

sync_standalone_assets() {
  local standalone_web_dir="${WEB_DIR}/.next/standalone/web"
  local standalone_static_dir="${standalone_web_dir}/.next/static"
  local standalone_public_dir="${standalone_web_dir}/public"

  [[ -d "${WEB_DIR}/.next/static" ]] || die "Missing ${WEB_DIR}/.next/static. Run web build first."
  [[ -d "${standalone_web_dir}" ]] || die "Missing ${standalone_web_dir}. Run web build first."

  ensure_dir "$standalone_static_dir"
  ensure_dir "$standalone_public_dir"

  log "Sync standalone static assets"
  rsync -a --delete "${WEB_DIR}/.next/static/" "${standalone_static_dir}/"

  if [[ -d "${WEB_DIR}/public" ]]; then
    log "Sync standalone public assets"
    rsync -a --delete "${WEB_DIR}/public/" "${standalone_public_dir}/"
  fi
}

resolve_sync_mode() {
  case "$STATIC_SYNC_MODE" in
    overlay|mirror)
      printf '%s' "$STATIC_SYNC_MODE"
      ;;
    auto)
      if [[ "$STATIC_TARGET_DIR" == "$APP_DIR" || -d "${STATIC_TARGET_DIR}/.git" ]]; then
        printf 'overlay'
      else
        printf 'mirror'
      fi
      ;;
    *)
      die "Unsupported STATIC_SYNC_MODE: ${STATIC_SYNC_MODE}. Use overlay, mirror, or auto."
      ;;
  esac
}

ENV_FILE="$DEFAULT_ENV_FILE"
ARGS=("$@")

for ((i = 0; i < ${#ARGS[@]}; i += 1)); do
  if [[ "${ARGS[$i]}" == "--env-file" ]]; then
    (( i + 1 < ${#ARGS[@]} )) || die "--env-file requires a value"
    ENV_FILE="${ARGS[$((i + 1))]}"
  fi
done

if [[ -f "$ENV_FILE" ]]; then
  log "Loading env from ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

APP_DIR="${APP_DIR:-$REPO_ROOT}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
APP_BRANCH="${APP_BRANCH:-main}"
WEB_DIR="${WEB_DIR:-${APP_DIR}/web}"
STATIC_BUILD_DIR="${STATIC_BUILD_DIR:-${APP_DIR}/dist}"
STATIC_TARGET_DIR="${STATIC_TARGET_DIR:-${APP_DIR}}"
STATIC_SYNC_MODE="${STATIC_SYNC_MODE:-auto}"
ALLOW_SYNC_TO_APP_DIR="${ALLOW_SYNC_TO_APP_DIR:-0}"
PRE_PULL_RESET="${PRE_PULL_RESET:-auto}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/.deploy-backup}"
ROOT_INSTALL_COMMAND="${ROOT_INSTALL_COMMAND:-npm ci}"
ROOT_BUILD_COMMAND="${ROOT_BUILD_COMMAND:-npm run build}"
WEB_INSTALL_COMMAND="${WEB_INSTALL_COMMAND:-npm ci}"
WEB_BUILD_COMMAND="${WEB_BUILD_COMMAND:-npm run build}"
MIGRATE_COMMAND="${MIGRATE_COMMAND:-}"
SERVICE_NAME="${SERVICE_NAME:-kotc-web.service}"
NEXT_HEALTHCHECK_URL="${NEXT_HEALTHCHECK_URL:-http://127.0.0.1:3101/}"
NEXT_HEALTHCHECK_CODES="${NEXT_HEALTHCHECK_CODES:-200,302,401}"
PUBLIC_HEALTHCHECK_URL="${PUBLIC_HEALTHCHECK_URL:-}"
PUBLIC_HEALTHCHECK_CODES="${PUBLIC_HEALTHCHECK_CODES:-200}"
KOTC_CSS_HEALTHCHECK_URL="${KOTC_CSS_HEALTHCHECK_URL:-}"
HEALTHCHECK_TIMEOUT_SEC="${HEALTHCHECK_TIMEOUT_SEC:-15}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      shift 2
      ;;
    --branch)
      APP_BRANCH="$2"
      shift 2
      ;;
    --remote)
      REMOTE_NAME="$2"
      shift 2
      ;;
    --label)
      DEPLOY_LABEL="$2"
      shift 2
      ;;
    --sync-mode)
      STATIC_SYNC_MODE="$2"
      shift 2
      ;;
    --no-pull)
      PULL_ENABLED=0
      shift
      ;;
    --skip-root-install)
      ROOT_INSTALL_ENABLED=0
      shift
      ;;
    --skip-root-build)
      ROOT_BUILD_ENABLED=0
      shift
      ;;
    --skip-web-install)
      WEB_INSTALL_ENABLED=0
      shift
      ;;
    --skip-web-build)
      WEB_BUILD_ENABLED=0
      shift
      ;;
    --skip-static-sync)
      STATIC_SYNC_ENABLED=0
      shift
      ;;
    --skip-standalone-sync)
      STANDALONE_SYNC_ENABLED=0
      shift
      ;;
    --run-migrations)
      RUN_MIGRATIONS=1
      shift
      ;;
    --skip-migrations)
      RUN_MIGRATIONS=0
      shift
      ;;
    --skip-restart)
      RESTART_SERVICE=0
      shift
      ;;
    --skip-healthcheck)
      HEALTHCHECK_ENABLED=0
      shift
      ;;
    --skip-backup)
      BACKUP_ENABLED=0
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

PULL_ENABLED="$(normalize_bool "$PULL_ENABLED")"
ROOT_INSTALL_ENABLED="$(normalize_bool "${ROOT_INSTALL_ENABLED:-1}")"
ROOT_BUILD_ENABLED="$(normalize_bool "${ROOT_BUILD_ENABLED:-1}")"
WEB_INSTALL_ENABLED="$(normalize_bool "${WEB_INSTALL_ENABLED:-1}")"
WEB_BUILD_ENABLED="$(normalize_bool "${WEB_BUILD_ENABLED:-1}")"
STATIC_SYNC_ENABLED="$(normalize_bool "${STATIC_SYNC_ENABLED:-1}")"
STANDALONE_SYNC_ENABLED="$(normalize_bool "${STANDALONE_SYNC_ENABLED:-1}")"
RUN_MIGRATIONS="$(normalize_bool "${RUN_MIGRATIONS:-0}")"
RESTART_SERVICE="$(normalize_bool "${RESTART_SERVICE:-1}")"
HEALTHCHECK_ENABLED="$(normalize_bool "${HEALTHCHECK_ENABLED:-1}")"
BACKUP_ENABLED="$(normalize_bool "${BACKUP_ENABLED:-1}")"
ALLOW_SYNC_TO_APP_DIR="$(normalize_bool "${ALLOW_SYNC_TO_APP_DIR:-0}")"

case "$PRE_PULL_RESET" in
  auto)
    ;;
  1|true|TRUE|yes|YES|on|ON)
    PRE_PULL_RESET="1"
    ;;
  0|false|FALSE|no|NO|off|OFF)
    PRE_PULL_RESET="0"
    ;;
  *)
    die "Invalid PRE_PULL_RESET value: ${PRE_PULL_RESET}"
    ;;
esac

[[ -d "$APP_DIR/.git" ]] || die "APP_DIR must point to a git checkout: ${APP_DIR}"
[[ -d "$WEB_DIR" ]] || die "WEB_DIR not found: ${WEB_DIR}"

require_cmd git bash npm rsync
if [[ "$HEALTHCHECK_ENABLED" == "1" ]]; then
  require_cmd curl
fi
if [[ "$RESTART_SERVICE" == "1" || "$HEALTHCHECK_ENABLED" == "1" ]]; then
  require_cmd systemctl
fi

STATIC_SYNC_MODE="$(resolve_sync_mode)"
if [[ "$STATIC_TARGET_DIR" == "$APP_DIR" && "$ALLOW_SYNC_TO_APP_DIR" != "1" ]]; then
  die "STATIC_TARGET_DIR points to APP_DIR. Set ALLOW_SYNC_TO_APP_DIR=1 in env after you confirm nginx serves from the repo checkout."
fi

if [[ "$PRE_PULL_RESET" == "auto" ]]; then
  if [[ "$STATIC_SYNC_MODE" == "overlay" && "$STATIC_TARGET_DIR" == "$APP_DIR" ]]; then
    PRE_PULL_RESET="1"
  else
    PRE_PULL_RESET="0"
  fi
fi

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
CURRENT_BACKUP_DIR="${BACKUP_DIR}/${TIMESTAMP}-$(sanitize_label "${DEPLOY_LABEL:-server-deploy}")"

log "APP_DIR=${APP_DIR}"
log "WEB_DIR=${WEB_DIR}"
log "STATIC_BUILD_DIR=${STATIC_BUILD_DIR}"
log "STATIC_TARGET_DIR=${STATIC_TARGET_DIR}"
log "STATIC_SYNC_MODE=${STATIC_SYNC_MODE}"
log "SERVICE_NAME=${SERVICE_NAME}"

if [[ "$BACKUP_ENABLED" == "1" ]]; then
  ensure_dir "$CURRENT_BACKUP_DIR"
  log "Backup directory: ${CURRENT_BACKUP_DIR}"
fi

if [[ "$PULL_ENABLED" == "1" ]]; then
  if [[ "$PRE_PULL_RESET" == "1" ]]; then
    warn "Resetting tracked files in ${APP_DIR} before git pull because static deploy overlays the git checkout."
    git -C "$APP_DIR" reset --hard HEAD
  fi

  log "Fetching ${REMOTE_NAME}/${APP_BRANCH}"
  git -C "$APP_DIR" fetch --prune "$REMOTE_NAME"
  git -C "$APP_DIR" checkout "$APP_BRANCH"
  git -C "$APP_DIR" pull --ff-only "$REMOTE_NAME" "$APP_BRANCH"
fi

if [[ "$ROOT_INSTALL_ENABLED" == "1" ]]; then
  run_in_dir "$APP_DIR" "$ROOT_INSTALL_COMMAND"
fi

if [[ "$ROOT_BUILD_ENABLED" == "1" ]]; then
  run_in_dir "$APP_DIR" "$ROOT_BUILD_COMMAND"
fi

if [[ "$WEB_INSTALL_ENABLED" == "1" ]]; then
  run_in_dir "$WEB_DIR" "$WEB_INSTALL_COMMAND"
fi

if [[ "$WEB_BUILD_ENABLED" == "1" ]]; then
  backup_tree_if_exists "${WEB_DIR}/.next/standalone" "web-standalone"
  backup_tree_if_exists "${WEB_DIR}/.next/static" "web-next-static"
  run_in_dir "$WEB_DIR" "$WEB_BUILD_COMMAND"
fi

if [[ "$STANDALONE_SYNC_ENABLED" == "1" ]]; then
  sync_standalone_assets
fi

if [[ "$STATIC_SYNC_ENABLED" == "1" ]]; then
  [[ -d "$STATIC_BUILD_DIR" ]] || die "STATIC_BUILD_DIR not found: ${STATIC_BUILD_DIR}"

  case "$STATIC_SYNC_MODE" in
    overlay)
      sync_static_overlay
      ;;
    mirror)
      sync_static_mirror
      ;;
  esac
fi

if [[ "$RUN_MIGRATIONS" == "1" ]]; then
  [[ -n "$MIGRATE_COMMAND" ]] || die "RUN_MIGRATIONS=1 but MIGRATE_COMMAND is empty"
  run_in_dir "$APP_DIR" "$MIGRATE_COMMAND"
fi

if [[ "$RESTART_SERVICE" == "1" ]]; then
  log "Restarting ${SERVICE_NAME}"
  systemctl restart "$SERVICE_NAME"
fi

if [[ "$HEALTHCHECK_ENABLED" == "1" ]]; then
  if [[ "$RESTART_SERVICE" == "1" ]]; then
    systemctl is-active --quiet "$SERVICE_NAME" || die "${SERVICE_NAME} is not active after restart"
    log "${SERVICE_NAME} is active"
    # Next.js binds shortly after exec; immediate curl can race and fail with connection refused.
    sleep "${POST_RESTART_HEALTHCHECK_DELAY_SEC:-2}"
  fi

  probe_url "$NEXT_HEALTHCHECK_URL" "$NEXT_HEALTHCHECK_CODES" "Next"
  if [[ -n "$PUBLIC_HEALTHCHECK_URL" ]]; then
    probe_url "$PUBLIC_HEALTHCHECK_URL" "$PUBLIC_HEALTHCHECK_CODES" "Public"
  fi
  probe_content_type_contains "$KOTC_CSS_HEALTHCHECK_URL" 'text/css' 'Public KOTC CSS'
fi

log "Deployment completed successfully"
