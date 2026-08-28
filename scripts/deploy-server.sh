#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DEFAULT_ENV_FILE="$SCRIPT_DIR/deploy-server.env"
BUILD_WORK_DIR=""
DEPLOY_SOURCE_ARCHIVE="${DEPLOY_SOURCE_ARCHIVE:-}"
DEPLOY_SOURCE_ARCHIVE_SHA256="${DEPLOY_SOURCE_ARCHIVE_SHA256:-}"
DEPLOY_PERSISTENT_ASSET_MANIFEST="${DEPLOY_PERSISTENT_ASSET_MANIFEST:-}"
readonly INVOKED_SOURCE_ARCHIVE_SHA256="$DEPLOY_SOURCE_ARCHIVE_SHA256"
readonly INVOKED_PERSISTENT_ASSET_MANIFEST="$DEPLOY_PERSISTENT_ASSET_MANIFEST"
readonly INVOKED_AUTH_HEALTHCHECK_URL="${DEPLOY_AUTH_HEALTHCHECK_URL:-}"
readonly INVOKED_AUTH_HEALTHCHECK_BEARER="${DEPLOY_AUTH_HEALTHCHECK_BEARER:-}"
readonly INVOKED_AUTH_HEALTHCHECK_CODES="${DEPLOY_AUTH_HEALTHCHECK_CODES:-}"
ATOMIC_RUNTIME_SWAPPED=0
ATOMIC_ROLLBACK_RUNNING=0
ATOMIC_RUNTIME_TARGET=""
ATOMIC_RUNTIME_PREVIOUS=""
ATOMIC_RUNTIME_FAILED=""
ATOMIC_RUNTIME_STAGE=""

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
  if [[ "${ATOMIC_RUNTIME_SWAPPED:-0}" == "1" && "${ATOMIC_ROLLBACK_RUNNING:-0}" != "1" ]]; then
    rollback_atomic_source_runtime
  fi
  printf '[deploy %s] ERROR: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  local line_no="${1:-unknown}"
  die "Command failed with exit code ${exit_code} on line ${line_no}"
}

trap 'on_error ${LINENO}' ERR

cleanup() {
  local temp_root
  local resolved_target

  [[ -n "${BUILD_WORK_DIR:-}" && -d "$BUILD_WORK_DIR" && ! -L "$BUILD_WORK_DIR" ]] || return 0
  temp_root="$(realpath -e -- "${TMPDIR:-/tmp}")" || return 0
  resolved_target="$(realpath -e -- "$BUILD_WORK_DIR")" || return 0
  if [[ "$(dirname -- "$resolved_target")" == "$temp_root" \
        && "$(basename -- "$resolved_target")" == deploy-server.* \
        && "$resolved_target" != "/" \
        && "$resolved_target" != "$temp_root" ]]; then
    rm -rf --one-file-system -- "$resolved_target"
  else
    warn "Refusing to remove unexpected build workspace: ${BUILD_WORK_DIR}"
  fi
}

trap cleanup EXIT

rollback_atomic_source_runtime() {
  ATOMIC_ROLLBACK_RUNNING=1
  warn "Atomic source runtime failed; restoring ${ATOMIC_RUNTIME_PREVIOUS}"
  sudo -n systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  if [[ -d "$ATOMIC_RUNTIME_TARGET" ]]; then
    if [[ ! -e "$ATOMIC_RUNTIME_FAILED" ]]; then
      sudo -n mv -- "$ATOMIC_RUNTIME_TARGET" "$ATOMIC_RUNTIME_FAILED" || true
    else
      warn "Failed runtime evidence path already exists: ${ATOMIC_RUNTIME_FAILED}"
    fi
  fi
  if [[ -d "$ATOMIC_RUNTIME_PREVIOUS" && ! -e "$ATOMIC_RUNTIME_TARGET" ]]; then
    sudo -n mv -- "$ATOMIC_RUNTIME_PREVIOUS" "$ATOMIC_RUNTIME_TARGET" || true
  fi
  if [[ -d "$ATOMIC_RUNTIME_TARGET" ]]; then
    sudo -n systemctl start "$SERVICE_NAME" >/dev/null 2>&1 || true
  fi
  ATOMIC_RUNTIME_SWAPPED=0
  ATOMIC_ROLLBACK_RUNNING=0
}

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-server.sh [options]

Runs the server-side deployment cycle for this repository as an unprivileged account:
git fetch -> clean export build -> optional npm ci -> repository-root build -> web build -> standalone sync ->
static sync -> optional migrations -> service restart -> healthchecks.

Options:
  --env-file PATH          Load deployment env from PATH.
  --branch NAME            Override git branch.
  --remote NAME            Override git remote.
  --git-ref REF            Export exactly REF (resolved to an immutable commit).
  --source-archive PATH    Build from a verified release tar archive instead of server git.
  --label NAME             Add NAME to the backup folder suffix.
  --sync-mode MODE         Force static sync mode: overlay | mirror.
  --no-pull                Skip git fetch/pull.
  --skip-root-install      Skip npm ci in repository root.
  --skip-root-build        Skip npm run build in repository root.
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

make_clean_build_workspace() {
  local git_ref="$1"

  BUILD_WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/deploy-server.XXXXXX")"
  BUILD_APP_DIR="${BUILD_WORK_DIR}/app"
  BUILD_WEB_DIR="${BUILD_APP_DIR}/web"
  BUILD_STATIC_BUILD_DIR="${BUILD_APP_DIR}/dist"

  ensure_dir "$BUILD_APP_DIR"
  if [[ -n "$DEPLOY_SOURCE_ARCHIVE" ]]; then
    log "Extracting verified source archive into clean build workspace ${BUILD_APP_DIR}"
    tar -xf "$DEPLOY_SOURCE_ARCHIVE" -C "$BUILD_APP_DIR"
  else
    log "Exporting ${git_ref} into clean build workspace ${BUILD_APP_DIR}"
    git -C "$APP_DIR" archive "$git_ref" | tar -x -C "$BUILD_APP_DIR"
  fi
  [[ -d "$BUILD_WEB_DIR" ]] || die "Clean build workspace is missing web/: ${BUILD_WEB_DIR}"
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

probe_bearer_url() {
  local url="$1"
  local bearer="$2"
  local allowed_codes="$3"
  local label="$4"
  local code

  [[ -n "$url" && -n "$bearer" ]] || return 0
  [[ "$bearer" != *$'\n'* && "$bearer" != *$'\r'* && "$bearer" != *'"'* ]] \
    || die "${label} bearer contains unsafe characters"
  code="$(
    printf 'header = "Authorization: Bearer %s"\n' "$bearer" | curl \
      --config - \
      --silent \
      --show-error \
      --output /dev/null \
      --max-time "$HEALTHCHECK_TIMEOUT_SEC" \
      --write-out '%{http_code}' \
      "$url"
  )"
  http_code_allowed "$code" "$allowed_codes" \
    || die "${label} probe failed: ${url} returned ${code}, expected one of ${allowed_codes}"
  log "${label} authenticated probe passed: ${url} -> ${code}"
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

probe_next_route_assets() {
  local page_url="$1"
  local label="$2"
  local page_html
  local origin
  local asset
  local code
  local found_assets=0

  page_html="$(
    curl \
      --silent \
      --show-error \
      --location \
      --max-time "$HEALTHCHECK_TIMEOUT_SEC" \
      "$page_url"
  )" || die "${label}: failed to fetch ${page_url}"

  origin="$(printf '%s' "$page_url" | sed -E 's#^(https?://[^/]+).*#\1#')"
  [[ -n "$origin" ]] || die "${label}: failed to resolve origin for ${page_url}"

  while IFS= read -r asset; do
    [[ -n "$asset" ]] || continue
    found_assets=1
    code="$(
      curl \
        --silent \
        --show-error \
        --output /dev/null \
        --location \
        --max-time "$HEALTHCHECK_TIMEOUT_SEC" \
        --write-out '%{http_code}' \
        "${origin}${asset}"
    )"

    if [[ "$code" != "200" ]]; then
      die "${label}: asset ${asset} returned ${code}"
    fi
  done < <(
    printf '%s' "$page_html" \
      | grep -oE '/_next/static/[^"<>[:space:]]+' \
      | sort -u
  )

  if [[ "$found_assets" != "1" ]]; then
    die "${label}: no Next static assets were found in ${page_url}"
  fi

  log "${label} Next asset probe passed: ${page_url}"
}

probe_body_contains() {
  local url="$1"
  local needle="$2"
  local label="$3"
  local page_html

  [[ -n "$url" && -n "$needle" ]] || return 0

  page_html="$(
    curl \
      --silent \
      --show-error \
      --location \
      --max-time "$HEALTHCHECK_TIMEOUT_SEC" \
      "$url"
  )" || die "${label}: failed to fetch ${url}"

  if printf '%s' "$page_html" | grep -Fq -- "$needle"; then
    log "${label} body contains expected marker: ${needle}"
    return 0
  fi

  die "${label}: ${url} does not contain expected marker '${needle}'"
}

probe_body_not_contains() {
  local url="$1"
  local needle="$2"
  local label="$3"
  local page_html

  [[ -n "$url" && -n "$needle" ]] || return 0

  page_html="$(
    curl \
      --silent \
      --show-error \
      --location \
      --max-time "$HEALTHCHECK_TIMEOUT_SEC" \
      "$url"
  )" || die "${label}: failed to fetch ${url}"

  if printf '%s' "$page_html" | grep -Fq -- "$needle"; then
    die "${label}: ${url} still contains forbidden marker '${needle}'"
  fi

  log "${label} body does not contain forbidden marker: ${needle}"
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

  sudo -n install -d -m 700 -- "$CURRENT_BACKUP_DIR"
  log "Backing up ${source} -> ${CURRENT_BACKUP_DIR}/${label}"
  sudo -n cp -a -- "$source" "$CURRENT_BACKUP_DIR/$label"
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
      sudo -n mkdir -p -- "$target_path"
      if [[ "$BACKUP_ENABLED" == "1" ]]; then
        sudo -n mkdir -p -- "${CURRENT_BACKUP_DIR}/static/${item_name}"
        log "Overlay rsync ${source_path}/ -> ${target_path}/ (with backup)"
        sudo -n rsync -a --backup --backup-dir "${CURRENT_BACKUP_DIR}/static/${item_name}" "${source_path}/" "${target_path}/"
      else
        log "Overlay rsync ${source_path}/ -> ${target_path}/"
        sudo -n rsync -a "${source_path}/" "${target_path}/"
      fi
      continue
    fi

    sudo -n mkdir -p -- "$(dirname "$target_path")"
    if [[ "$BACKUP_ENABLED" == "1" && -e "$target_path" ]]; then
      sudo -n mkdir -p -- "${CURRENT_BACKUP_DIR}/static"
      log "Backing up ${target_path} -> ${CURRENT_BACKUP_DIR}/static/${item_name}"
      sudo -n cp -a -- "$target_path" "${CURRENT_BACKUP_DIR}/static/${item_name}"
    fi

    log "Copy ${source_path} -> ${target_path}"
    sudo -n cp -f -- "$source_path" "$target_path"
  done < <(find "$STATIC_BUILD_DIR" -mindepth 1 -maxdepth 1 -print0 | sort -z)
}

sync_static_mirror() {
  sudo -n mkdir -p -- "$STATIC_TARGET_DIR"

  if [[ "$BACKUP_ENABLED" == "1" ]]; then
    sudo -n mkdir -p -- "${CURRENT_BACKUP_DIR}/static"
    log "Mirror rsync ${STATIC_BUILD_DIR}/ -> ${STATIC_TARGET_DIR}/ (delete + backup)"
    sudo -n rsync -a --delete --backup --backup-dir "${CURRENT_BACKUP_DIR}/static" "${STATIC_BUILD_DIR}/" "${STATIC_TARGET_DIR}/"
    return
  fi

  log "Mirror rsync ${STATIC_BUILD_DIR}/ -> ${STATIC_TARGET_DIR}/ (delete)"
  sudo -n rsync -a --delete "${STATIC_BUILD_DIR}/" "${STATIC_TARGET_DIR}/"
}

sync_standalone_assets() {
  local source_web_dir="${1:-$WEB_DIR}"
  local standalone_web_dir="${source_web_dir}/.next/standalone/web"
  local standalone_static_dir="${standalone_web_dir}/.next/static"
  local standalone_public_dir="${standalone_web_dir}/public"

  [[ -d "${source_web_dir}/.next/static" ]] || die "Missing ${source_web_dir}/.next/static. Run web build first."
  [[ -d "${standalone_web_dir}" ]] || die "Missing ${standalone_web_dir}. Run web build first."

  ensure_dir "$standalone_static_dir"
  ensure_dir "$standalone_public_dir"

  log "Sync standalone static assets"
  rsync -a --delete "${source_web_dir}/.next/static/" "${standalone_static_dir}/"

  if [[ -d "${source_web_dir}/public" ]]; then
    log "Sync standalone public assets"
    rsync -a --delete "${source_web_dir}/public/" "${standalone_public_dir}/"
  fi
}

overlay_persistent_public_assets() {
  local source_web_dir="$1"
  local privileged="${2:-0}"
  local relative_path
  local runtime_path
  local build_path
  local normalized
  local -a persistent_paths

  IFS=',' read -r -a persistent_paths <<<"$PERSISTENT_PUBLIC_PATHS"
  for relative_path in "${persistent_paths[@]}"; do
    normalized="${relative_path#./}"
    normalized="${normalized#/}"
    [[ -n "$normalized" ]] || continue
    case "$normalized" in
      *..*|/*) die "Unsafe PERSISTENT_PUBLIC_PATHS entry: ${relative_path}" ;;
    esac
    runtime_path="${WEB_DIR}/public/${normalized}"
    build_path="${source_web_dir}/public/${normalized}"
    [[ -d "$runtime_path" ]] || continue
    log "Overlaying persistent public assets ${runtime_path}/ -> ${build_path}/"
    if [[ "$privileged" == "1" ]]; then
      sudo -n mkdir -p -- "$build_path"
      sudo -n rsync -a "${runtime_path}/" "${build_path}/"
    else
      ensure_dir "$build_path"
      rsync -a "${runtime_path}/" "${build_path}/"
    fi
  done
}

assert_atomic_runtime_service_binding() {
  local expected_working_dir="${ATOMIC_RUNTIME_TARGET}/web"
  local actual_working_dir
  local actual_exec_start

  actual_working_dir="$(sudo -n systemctl show "$SERVICE_NAME" --property=WorkingDirectory --value)"
  actual_exec_start="$(sudo -n systemctl show "$SERVICE_NAME" --property=ExecStart --value)"
  if [[ "$actual_working_dir" != "$expected_working_dir" \
        && "$actual_exec_start" != *"${expected_working_dir}/server.js"* ]]; then
    die "${SERVICE_NAME} is not bound to ${expected_working_dir}; configure a stable standalone path/indirection before atomic source deploy"
  fi
  log "${SERVICE_NAME} runtime binding verified: ${expected_working_dir}"
}

verify_staged_persistent_assets() {
  local expected_hash
  local relative_file
  local actual_hash

  while IFS=$'\t' read -r expected_hash relative_file; do
    [[ -n "$relative_file" ]] || continue
    case "$relative_file" in
      *..*|/*) die "Unsafe staged persistent asset path: ${relative_file}" ;;
    esac
    [[ -f "${ATOMIC_RUNTIME_STAGE}/web/public/${relative_file}" ]] \
      || die "Staged runtime lost persistent asset: ${relative_file}"
    actual_hash="$(sudo -n sha256sum "${ATOMIC_RUNTIME_STAGE}/web/public/${relative_file}" | awk '{ print $1 }')"
    [[ "$actual_hash" == "$expected_hash" ]] \
      || die "Staged runtime changed persistent asset: ${relative_file}"
  done <"$DEPLOY_PERSISTENT_ASSET_MANIFEST"
}

stage_atomic_source_runtime() {
  local source_web_dir="$1"
  local runtime_parent="${WEB_DIR}/.next"
  local source_runtime="${source_web_dir}/.next/standalone"

  [[ -d "$source_runtime" ]] || die "Built source runtime is missing: ${source_runtime}"
  [[ -d "${source_runtime}/web" ]] || die "Built source runtime has no web tree: ${source_runtime}/web"
  sudo -n mkdir -p -- "$runtime_parent"

  ATOMIC_RUNTIME_TARGET="${runtime_parent}/standalone"
  ATOMIC_RUNTIME_STAGE="${runtime_parent}/standalone.release-${BUILD_GIT_REF:0:12}-${TIMESTAMP}"
  ATOMIC_RUNTIME_PREVIOUS="${runtime_parent}/standalone.previous-${TIMESTAMP}"
  ATOMIC_RUNTIME_FAILED="${runtime_parent}/standalone.failed-${TIMESTAMP}"

  [[ -d "$ATOMIC_RUNTIME_TARGET" ]] \
    || die "Atomic source deploy requires an existing standalone runtime: ${ATOMIC_RUNTIME_TARGET}"
  assert_atomic_runtime_service_binding
  [[ ! -e "$ATOMIC_RUNTIME_STAGE" && ! -e "$ATOMIC_RUNTIME_PREVIOUS" && ! -e "$ATOMIC_RUNTIME_FAILED" ]] \
    || die "Atomic runtime evidence path already exists for ${TIMESTAMP}"

  log "Staging complete standalone/static/public runtime at ${ATOMIC_RUNTIME_STAGE}"
  sudo -n mkdir -p -- "$ATOMIC_RUNTIME_STAGE"
  sudo -n rsync -a --delete "${source_runtime}/" "${ATOMIC_RUNTIME_STAGE}/"
  # The deploy process runs with umask 077, while systemd starts the runtime as
  # www-data. Keep the immutable bytes unchanged, but make directories
  # traversable and files readable before the stage becomes the stable target.
  sudo -n chmod -R a+rX -- "$ATOMIC_RUNTIME_STAGE"
  [[ -f "${ATOMIC_RUNTIME_STAGE}/web/server.js" ]] \
    || die "Staged standalone runtime is missing server.js"
  [[ -d "${ATOMIC_RUNTIME_STAGE}/web/.next/server" ]] \
    || die "Staged standalone runtime is missing .next/server"
  [[ -d "${ATOMIC_RUNTIME_STAGE}/web/.next/static" ]] \
    || die "Staged standalone runtime is missing .next/static"
  [[ -d "${ATOMIC_RUNTIME_STAGE}/web/public" ]] \
    || die "Staged standalone runtime is missing public assets"

  verify_staged_persistent_assets

  if [[ "$BACKUP_ENABLED" == "1" ]]; then
    printf '%s\n' "$ATOMIC_RUNTIME_PREVIOUS" >"${CURRENT_BACKUP_DIR}/atomic-runtime-previous.txt"
    printf '%s\n' "$ATOMIC_RUNTIME_FAILED" >"${CURRENT_BACKUP_DIR}/atomic-runtime-failed.txt"
    printf '%s\n' "$BUILD_GIT_REF" >"${CURRENT_BACKUP_DIR}/atomic-runtime-release-ref.txt"
  fi
}

activate_atomic_source_runtime() {
  [[ -d "$ATOMIC_RUNTIME_STAGE" && -d "$ATOMIC_RUNTIME_TARGET" ]] \
    || die "Atomic runtime staging is incomplete"

  log "Stopping ${SERVICE_NAME} for guarded standalone runtime swap"
  sudo -n systemctl stop "$SERVICE_NAME"
  sudo -n systemctl is-active --quiet "$SERVICE_NAME" \
    && die "${SERVICE_NAME} did not stop before atomic runtime swap"

  # Capture uploads created after the initial preflight/build. The web process
  # is stopped, so this final local overlay has a stable source before rename.
  overlay_persistent_public_assets "${ATOMIC_RUNTIME_STAGE}/web" 1
  verify_staged_persistent_assets

  sudo -n mv -- "$ATOMIC_RUNTIME_TARGET" "$ATOMIC_RUNTIME_PREVIOUS"
  ATOMIC_RUNTIME_SWAPPED=1
  if ! sudo -n mv -- "$ATOMIC_RUNTIME_STAGE" "$ATOMIC_RUNTIME_TARGET"; then
    die "Could not activate staged standalone runtime"
  fi
  log "Activated staged runtime; previous runtime retained at ${ATOMIC_RUNTIME_PREVIOUS}"
  sudo -n systemctl start "$SERVICE_NAME"
}

verify_standalone_runtime_ready() {
  local source_web_dir="${1:-$WEB_DIR}"
  local standalone_web_dir="${source_web_dir}/.next/standalone/web"
  local required_manifest="${source_web_dir}/.next/required-server-files.json"
  local relative_path
  local target_path

  [[ -d "$standalone_web_dir" ]] || die "Standalone runtime is missing: ${standalone_web_dir}"
  [[ -f "${standalone_web_dir}/server.js" ]] || die "Standalone runtime is incomplete: missing ${standalone_web_dir}/server.js"
  [[ -d "${standalone_web_dir}/.next/server" ]] || die "Standalone runtime is incomplete: missing ${standalone_web_dir}/.next/server"

  if [[ ! -f "$required_manifest" ]]; then
    die "Missing ${required_manifest}. Run web build first."
  fi

  while IFS= read -r relative_path; do
    [[ -n "$relative_path" ]] || continue
    [[ "$relative_path" == .next/* ]] || continue
    target_path="${standalone_web_dir}/${relative_path}"
    [[ -e "$target_path" ]] || die "Standalone runtime is incomplete: missing ${target_path}"
  done < <(
    node -e "const fs=require('fs'); const manifest=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); for (const file of (manifest.files || [])) { if (typeof file === 'string') console.log(file); }" "$required_manifest"
  )

  log "Standalone runtime is ready for restart"
}

sync_next_runtime_artifacts() {
  local source_web_dir="$1"
  local target_web_dir="${WEB_DIR}"
  local manifest

  [[ -d "${source_web_dir}/.next" ]] || die "Missing built Next artifacts in ${source_web_dir}/.next"
  sudo -n mkdir -p -- "${target_web_dir}/.next"

  if [[ "$BACKUP_ENABLED" == "1" ]]; then
    backup_tree_if_exists "${target_web_dir}/.next/standalone" "web-standalone"
    backup_tree_if_exists "${target_web_dir}/.next/static" "web-next-static"
    backup_tree_if_exists "${target_web_dir}/.next/server" "web-next-server"
    backup_tree_if_exists "${target_web_dir}/.next/required-server-files.json" "web-required-server-files.json"
  fi

  log "Sync built Next runtime artifacts into ${target_web_dir}/.next"
  sudo -n rsync -a --delete "${source_web_dir}/.next/standalone/" "${target_web_dir}/.next/standalone/"
  sudo -n rsync -a --delete "${source_web_dir}/.next/static/" "${target_web_dir}/.next/static/"
  sudo -n rsync -a --delete "${source_web_dir}/.next/server/" "${target_web_dir}/.next/server/"
  for manifest in \
    required-server-files.json \
    routes-manifest.json \
    build-manifest.json \
    prerender-manifest.json \
    app-build-manifest.json; do
    if [[ -f "${source_web_dir}/.next/${manifest}" ]]; then
      sudo -n rsync -a "${source_web_dir}/.next/${manifest}" "${target_web_dir}/.next/${manifest}"
    fi
  done
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

validate_privileged_deploy_targets() {
  local resolved_app
  local resolved_web
  local resolved_backup
  local resolved_user_home
  local resolved_static

  resolved_app="$(realpath -e -- "$APP_DIR")" || die "Cannot resolve APP_DIR: ${APP_DIR}"
  resolved_web="$(realpath -e -- "$WEB_DIR")" || die "Cannot resolve WEB_DIR: ${WEB_DIR}"
  resolved_user_home="$(realpath -e -- "$DEPLOY_USER_HOME")" \
    || die "Cannot resolve deployment account home"
  resolved_backup="$(realpath -m -- "$BACKUP_DIR")"
  [[ "$resolved_app" == /var/www/* && "$resolved_app" != "/var/www" ]] \
    || die "Privileged runtime target must be a concrete directory below /var/www"
  [[ "$resolved_web" == "${resolved_app}/web" ]] \
    || die "WEB_DIR must resolve exactly to APP_DIR/web for privileged deploy"
  [[ "$resolved_backup" == "$resolved_app"/* || "$resolved_backup" == "$resolved_user_home"/* ]] \
    || die "BACKUP_DIR must stay below APP_DIR or the deployment account home"
  [[ "$SERVICE_NAME" =~ ^[A-Za-z0-9@_.-]+\.service$ ]] \
    || die "Unsafe systemd service name: ${SERVICE_NAME}"
  if [[ "$STATIC_SYNC_ENABLED" == "1" ]]; then
    resolved_static="$(realpath -m -- "$STATIC_TARGET_DIR")"
    [[ "$resolved_static" == "$resolved_app" || "$resolved_static" == "$resolved_app"/* ]] \
      || die "STATIC_TARGET_DIR must stay below APP_DIR"
  fi
}

ENV_FILE="$DEFAULT_ENV_FILE"
ARGS=("$@")

for ((i = 0; i < ${#ARGS[@]}; i += 1)); do
  if [[ "${ARGS[$i]}" == "--env-file" ]]; then
    (( i + 1 < ${#ARGS[@]} )) || die "--env-file requires a value"
    ENV_FILE="${ARGS[$((i + 1))]}"
  fi
done

[[ "${EUID:-$(id -u)}" -ne 0 ]] \
  || die "Never run deploy-server.sh as root; builds and env loading must stay unprivileged"
if [[ -f "$ENV_FILE" ]]; then
  env_owner="$(stat -Lc '%u' -- "$ENV_FILE")"
  env_mode="$(stat -Lc '%a' -- "$ENV_FILE")"
  [[ "$env_owner" == "0" || "$env_owner" == "$(id -u)" ]] \
    || die "Env file must be owned by root or $(id -un): ${ENV_FILE}"
  (( (8#$env_mode & 8#022) == 0 )) \
    || die "Env file must not be group/world writable: ${ENV_FILE}"
  log "Loading env from ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

APP_DIR="${APP_DIR:-$REPO_ROOT}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
APP_BRANCH="${APP_BRANCH:-main}"
DEPLOY_GIT_REF="${DEPLOY_GIT_REF:-}"
DEPLOY_SOURCE_ARCHIVE="${DEPLOY_SOURCE_ARCHIVE:-}"
DEPLOY_SOURCE_ARCHIVE_SHA256="${DEPLOY_SOURCE_ARCHIVE_SHA256:-}"
DEPLOY_PERSISTENT_ASSET_MANIFEST="${DEPLOY_PERSISTENT_ASSET_MANIFEST:-}"
if [[ -n "$INVOKED_SOURCE_ARCHIVE_SHA256" ]]; then
  DEPLOY_SOURCE_ARCHIVE_SHA256="$INVOKED_SOURCE_ARCHIVE_SHA256"
fi
if [[ -n "$INVOKED_PERSISTENT_ASSET_MANIFEST" ]]; then
  DEPLOY_PERSISTENT_ASSET_MANIFEST="$INVOKED_PERSISTENT_ASSET_MANIFEST"
fi
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
NEXT_ASSET_HEALTHCHECK_URLS="${NEXT_ASSET_HEALTHCHECK_URLS:-}"
PUBLIC_BODY_HEALTHCHECK_URL="${PUBLIC_BODY_HEALTHCHECK_URL:-}"
PUBLIC_BODY_HEALTHCHECK_CONTAINS="${PUBLIC_BODY_HEALTHCHECK_CONTAINS:-}"
PUBLIC_BODY_HEALTHCHECK_NOT_CONTAINS="${PUBLIC_BODY_HEALTHCHECK_NOT_CONTAINS:-}"
HEALTHCHECK_TIMEOUT_SEC="${HEALTHCHECK_TIMEOUT_SEC:-15}"
PERSISTENT_PUBLIC_PATHS="${PERSISTENT_PUBLIC_PATHS:-images/users,images/players,images/tournaments,coach}"
DEPLOY_AUTH_HEALTHCHECK_URL="${DEPLOY_AUTH_HEALTHCHECK_URL:-}"
DEPLOY_AUTH_HEALTHCHECK_BEARER="${DEPLOY_AUTH_HEALTHCHECK_BEARER:-}"
DEPLOY_AUTH_HEALTHCHECK_CODES="${DEPLOY_AUTH_HEALTHCHECK_CODES:-200}"
if [[ -n "$INVOKED_AUTH_HEALTHCHECK_URL" ]]; then
  DEPLOY_AUTH_HEALTHCHECK_URL="$INVOKED_AUTH_HEALTHCHECK_URL"
fi
if [[ -n "$INVOKED_AUTH_HEALTHCHECK_BEARER" ]]; then
  DEPLOY_AUTH_HEALTHCHECK_BEARER="$INVOKED_AUTH_HEALTHCHECK_BEARER"
fi
if [[ -n "$INVOKED_AUTH_HEALTHCHECK_CODES" ]]; then
  DEPLOY_AUTH_HEALTHCHECK_CODES="$INVOKED_AUTH_HEALTHCHECK_CODES"
fi

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
    --git-ref)
      DEPLOY_GIT_REF="$2"
      shift 2
      ;;
    --source-archive)
      [[ $# -ge 2 ]] || die "--source-archive requires a value"
      DEPLOY_SOURCE_ARCHIVE="$2"
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

if [[ -n "$DEPLOY_SOURCE_ARCHIVE" ]]; then
  [[ -f "$DEPLOY_SOURCE_ARCHIVE" ]] || die "Source archive not found: ${DEPLOY_SOURCE_ARCHIVE}"
  [[ "$DEPLOY_SOURCE_ARCHIVE_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] \
    || die "DEPLOY_SOURCE_ARCHIVE_SHA256 is required for --source-archive"
  require_cmd sha256sum
  source_archive_hash="$(sha256sum "$DEPLOY_SOURCE_ARCHIVE" | awk '{ print $1 }')"
  [[ "${source_archive_hash,,}" == "${DEPLOY_SOURCE_ARCHIVE_SHA256,,}" ]] \
    || die "Source archive SHA-256 mismatch"
  [[ -d "$APP_DIR" ]] || die "APP_DIR not found: ${APP_DIR}"
  [[ -n "$DEPLOY_PERSISTENT_ASSET_MANIFEST" && -f "$DEPLOY_PERSISTENT_ASSET_MANIFEST" ]] \
    || die "--source-archive requires DEPLOY_PERSISTENT_ASSET_MANIFEST from release preflight"
  [[ "$STANDALONE_SYNC_ENABLED" == "1" ]] \
    || die "--source-archive requires standalone runtime preparation"
  [[ "$WEB_BUILD_ENABLED" == "1" ]] \
    || die "--source-archive requires a fresh web build"
  [[ "$RESTART_SERVICE" == "1" && "$HEALTHCHECK_ENABLED" == "1" ]] \
    || die "--source-archive requires service restart and healthchecks for automatic rollback"
  [[ "$STATIC_SYNC_ENABLED" == "0" ]] \
    || die "--source-archive refuses non-atomic legacy static sync; pass --skip-static-sync"
  [[ "$RUN_MIGRATIONS" == "0" ]] \
    || die "--source-archive requires migrations to be applied by the dedicated release wrapper"
else
  [[ -d "$APP_DIR/.git" ]] || die "APP_DIR must point to a git checkout: ${APP_DIR}"
fi
[[ -d "$WEB_DIR" ]] || die "WEB_DIR not found: ${WEB_DIR}"

require_cmd getent git bash npm realpath rsync stat sudo
require_cmd tar mktemp
require_cmd node
DEPLOY_USER_HOME="$(getent passwd "$(id -un)" | awk -F: 'NR == 1 { print $6 }')"
[[ -n "$DEPLOY_USER_HOME" ]] || die "Cannot resolve deployment account home"
if [[ "$HEALTHCHECK_ENABLED" == "1" ]]; then
  require_cmd curl grep sed sort
fi
if [[ "$RESTART_SERVICE" == "1" || "$HEALTHCHECK_ENABLED" == "1" ]]; then
  require_cmd systemctl
fi

STATIC_SYNC_MODE="$(resolve_sync_mode)"
validate_privileged_deploy_targets
if [[ "$STATIC_SYNC_ENABLED" == "1" && "$STATIC_TARGET_DIR" == "$APP_DIR" && "$ALLOW_SYNC_TO_APP_DIR" != "1" ]]; then
  die "STATIC_TARGET_DIR points to APP_DIR. Set ALLOW_SYNC_TO_APP_DIR=1 in env after you confirm nginx serves from the repo checkout."
fi

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
CURRENT_BACKUP_DIR="${BACKUP_DIR}/${TIMESTAMP}-$(sanitize_label "${DEPLOY_LABEL:-server-deploy}")"
BUILD_GIT_REF="HEAD"

log "APP_DIR=${APP_DIR}"
log "WEB_DIR=${WEB_DIR}"
log "STATIC_BUILD_DIR=${STATIC_BUILD_DIR}"
log "STATIC_TARGET_DIR=${STATIC_TARGET_DIR}"
log "STATIC_SYNC_MODE=${STATIC_SYNC_MODE}"
log "SERVICE_NAME=${SERVICE_NAME}"
if [[ "$BACKUP_ENABLED" == "1" ]]; then
  sudo -n install -d -m 700 -o "$(id -u)" -g "$(id -g)" -- "$CURRENT_BACKUP_DIR"
  log "Backup directory: ${CURRENT_BACKUP_DIR}"
fi

if [[ -n "$DEPLOY_SOURCE_ARCHIVE" ]]; then
  [[ "$PULL_ENABLED" == "0" ]] || die "--source-archive requires --no-pull"
  [[ "$DEPLOY_GIT_REF" =~ ^[0-9a-f]{40}$ ]] \
    || die "--source-archive requires --git-ref with the exact 40-character commit SHA"
  BUILD_GIT_REF="$DEPLOY_GIT_REF"
  log "Using verified release archive for immutable commit ${BUILD_GIT_REF}"
elif [[ "$PULL_ENABLED" == "1" ]]; then
  log "Fetching ${REMOTE_NAME}/${APP_BRANCH}"
  git -C "$APP_DIR" fetch --prune "$REMOTE_NAME"
  BUILD_GIT_REF="${DEPLOY_GIT_REF:-${REMOTE_NAME}/${APP_BRANCH}}"
else
  BUILD_GIT_REF="${DEPLOY_GIT_REF:-HEAD}"
  log "Skipping git fetch; resolving ${BUILD_GIT_REF} in the current checkout"
fi

if [[ -z "$DEPLOY_SOURCE_ARCHIVE" ]]; then
  git -C "$APP_DIR" cat-file -e "${BUILD_GIT_REF}^{commit}" 2>/dev/null \
    || die "DEPLOY_GIT_REF does not resolve to a commit: ${BUILD_GIT_REF}"
  BUILD_GIT_REF="$(git -C "$APP_DIR" rev-parse "${BUILD_GIT_REF}^{commit}")"
fi
log "BUILD_GIT_REF=${BUILD_GIT_REF} (immutable commit)"

make_clean_build_workspace "$BUILD_GIT_REF"

if [[ "$ROOT_INSTALL_ENABLED" == "1" ]]; then
  run_in_dir "$BUILD_APP_DIR" "$ROOT_INSTALL_COMMAND"
fi

if [[ "$ROOT_BUILD_ENABLED" == "1" ]]; then
  run_in_dir "$BUILD_APP_DIR" "$ROOT_BUILD_COMMAND"
fi

if [[ "$WEB_INSTALL_ENABLED" == "1" ]]; then
  run_in_dir "$BUILD_WEB_DIR" "$WEB_INSTALL_COMMAND"
fi

if [[ "$WEB_BUILD_ENABLED" == "1" ]]; then
  run_in_dir "$BUILD_WEB_DIR" "$WEB_BUILD_COMMAND"
fi

if [[ "$STANDALONE_SYNC_ENABLED" == "1" ]]; then
  overlay_persistent_public_assets "$BUILD_WEB_DIR"
  sync_standalone_assets "$BUILD_WEB_DIR"
fi

if [[ "$RESTART_SERVICE" == "1" || "$HEALTHCHECK_ENABLED" == "1" ]]; then
  verify_standalone_runtime_ready "$BUILD_WEB_DIR"
fi

if [[ -n "$DEPLOY_SOURCE_ARCHIVE" ]]; then
  stage_atomic_source_runtime "$BUILD_WEB_DIR"
else
  sync_next_runtime_artifacts "$BUILD_WEB_DIR"
fi

if [[ "$STATIC_SYNC_ENABLED" == "1" ]]; then
  STATIC_BUILD_DIR="${BUILD_STATIC_BUILD_DIR}"
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

if [[ -n "$DEPLOY_SOURCE_ARCHIVE" ]]; then
  activate_atomic_source_runtime
elif [[ "$RESTART_SERVICE" == "1" ]]; then
  log "Restarting ${SERVICE_NAME}"
  sudo -n systemctl restart "$SERVICE_NAME"
fi

if [[ "$HEALTHCHECK_ENABLED" == "1" ]]; then
  if [[ "$RESTART_SERVICE" == "1" ]]; then
    sudo -n systemctl is-active --quiet "$SERVICE_NAME" || die "${SERVICE_NAME} is not active after restart"
    log "${SERVICE_NAME} is active"
    # Next.js binds shortly after exec; immediate curl can race and fail with connection refused.
    sleep "${POST_RESTART_HEALTHCHECK_DELAY_SEC:-2}"
  fi

  probe_url "$NEXT_HEALTHCHECK_URL" "$NEXT_HEALTHCHECK_CODES" "Next"
  if [[ -n "$PUBLIC_HEALTHCHECK_URL" ]]; then
    probe_url "$PUBLIC_HEALTHCHECK_URL" "$PUBLIC_HEALTHCHECK_CODES" "Public"
  fi
  probe_content_type_contains "$KOTC_CSS_HEALTHCHECK_URL" 'text/css' 'Public KOTC CSS'

  if [[ -n "$NEXT_ASSET_HEALTHCHECK_URLS" ]]; then
    IFS=',' read -r -a next_asset_urls <<<"$NEXT_ASSET_HEALTHCHECK_URLS"
    for page_url in "${next_asset_urls[@]}"; do
      page_url="${page_url//[[:space:]]/}"
      [[ -n "$page_url" ]] || continue
      probe_next_route_assets "$page_url" "Next assets"
    done
  fi

  probe_body_contains "$PUBLIC_BODY_HEALTHCHECK_URL" "$PUBLIC_BODY_HEALTHCHECK_CONTAINS" "Public body"
  probe_body_not_contains "$PUBLIC_BODY_HEALTHCHECK_URL" "$PUBLIC_BODY_HEALTHCHECK_NOT_CONTAINS" "Public body"
  probe_bearer_url \
    "$DEPLOY_AUTH_HEALTHCHECK_URL" \
    "$DEPLOY_AUTH_HEALTHCHECK_BEARER" \
    "$DEPLOY_AUTH_HEALTHCHECK_CODES" \
    "Authenticated runtime"
fi

ATOMIC_RUNTIME_SWAPPED=0
log "Deployment completed successfully"
