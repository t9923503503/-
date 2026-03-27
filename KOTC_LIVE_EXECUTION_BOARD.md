# KOTC Live Execution Board

## Coordination Rules
- Status markers:
  - `[ ]` not started
  - `[~]` in progress
  - `[x]` completed
  - `[!]` blocked
- Each task must keep:
  - `Owner`
  - `Status`
  - `Scope`
  - `Exit criteria`
  - `Evidence`
  - `Handoff`
- A task moves to `[x]` only when:
  - code in the assigned write-zone is complete
  - local checks for that scope passed
  - `Evidence` contains changed files, checks, or commands
  - `Handoff` names the next owner or integration target
- No owner edits files outside its write-zone.
- Shared contracts must be recorded here before integration starts.

## Shared Contracts
- KOTC Live v1 scope: `1..4` courts, `1 hub + up to 4 judges`, `ppc=4`.
- Hub auth: existing `admin_session`.
- Judge auth: `sudyam_session` gate + short-lived signed `seat token`.
- Backend runtime: Next.js API + PostgreSQL via `pg`.
- Gateway runtime: separate `Node.js + ws + pg LISTEN/NOTIFY` service, not a custom Next server.
- Versioning:
  - `session_version` for total ordering
  - `structure_epoch` for structural hub commands
  - `court_version` / `division_version` for scoped concurrency
- Core tables:
  - `live_kotc_session`
  - `live_kotc_court_state`
  - `live_kotc_division_state`
  - `live_kotc_seat`
  - `live_kotc_command_log`
- Idempotency: `UNIQUE(session_id, command_id)` in `live_kotc_command_log`.
- `pg_notify` payload contract:
```json
{
  "session_id": "session-id",
  "command_log_id": 123,
  "scope": "court",
  "court_idx": 2,
  "command_type": "court.score_set",
  "session_version": 45
}
```
- HTTP response families that AI-3 integrates against:
  - `join`: seat info + seat token + scoped snapshot
  - `snapshot`: global or full session snapshot with versions
  - `commands`: `success`, `appliedCommand`, `sessionVersion`, `structureEpoch`, scoped version, `delta`, `serverNow`

## AI-1
- [x] DB schema + constraints
  - Owner: AI-1
  - Status: completed
  - Scope: `migrations/**`, `web/lib/kotc-live/**`
  - Exit criteria: live tables exist, unique/idempotency constraints exist, migration applies cleanly
  - Evidence: `migrations/018_kotc_live.sql`, `web/lib/kotc-live/types.ts`, `web/lib/kotc-live/service.ts`, `npm run build` in `web`
  - Handoff: AI-2 after `pg_notify` payload and event table shape are stable

- [x] Commands API + auth
  - Owner: AI-1
  - Status: completed
  - Scope: `web/app/api/kotc/**`, `web/lib/kotc-live/**`
  - Exit criteria: `join/release/snapshot/court/presence/commands/finalize` implemented, token format frozen, duplicate `command_id` returns prior result
  - Evidence: `web/app/api/kotc/sessions/**`, `web/lib/kotc-live/token.ts`, `web/lib/kotc-live/auth.ts`, `npm run build` in `web`
  - Handoff: AI-3 consumed JSON response shapes; AI-2 consumed `pg_notify` contract

## AI-2
- [x] WS gateway
  - Owner: AI-2
  - Status: completed
  - Scope: `services/kotc-gateway/**`, `scripts/kotc-gateway/**`, ops doc
  - Exit criteria: standalone gateway starts, subscribes to LISTEN/NOTIFY, emits scoped packets
  - Evidence: `services/kotc-gateway/src/index.mjs`, `services/kotc-gateway/PROTOCOL.md`, `scripts/kotc-gateway/check.ps1`, `npm --prefix services/kotc-gateway run check`
  - Handoff: AI-3 consumed WS event schema and reconnect behavior

- [x] Presence + time sync
  - Owner: AI-2
  - Status: completed
  - Scope: heartbeat, lease refresh, cleaner, SNTP-like ping/pong, reconnect jitter
  - Exit criteria: seat lease behaves correctly, server time available over WS, reconnect strategy documented
  - Evidence: `services/kotc-gateway/src/index.mjs`, `services/kotc-gateway/OPS.md`, `services/kotc-gateway/PROTOCOL.md`
  - Handoff: AI-1 has runtime env vars and gateway dependencies

## AI-3
- [x] Live store + judge flow
  - Owner: AI-3
  - Status: completed
  - Scope: `formats/kotc/**`, `web/app/sudyam/**`, `web/components/kotc-live/**`
  - Exit criteria: session list, claim/reclaim, judge screen, viewer mode, scoped snapshot fetches work
  - Evidence: `web/app/sudyam/page.tsx`, `web/components/kotc-live/use-kotc-live-store.ts`, `web/components/kotc-live/socket.ts`, `web/components/kotc-live/judge/**`, `npm run build` in `web`
  - Handoff: AI-1 mismatches folded into integration patch; AI-2 protocol consumed by socket client

- [~] Hub dashboard + live UX
  - Owner: AI-3
  - Status: in progress
  - Scope: presence dashboard, force release, broadcast/pause-resume, wake lock, timer rendering, WS delta handling
  - Exit criteria: hub sees judge status, judge edits only own court, reconnect/gap handling works without full reload
  - Evidence: `web/components/kotc-live/judge/KotcLiveLayout.tsx`, `web/components/kotc-live/judge/KotcLiveJudgeFlow.tsx`, `web/components/kotc-live/wake-lock.ts`
  - Handoff: needs integrated runtime pass against live DB + gateway

## Sequence
- Stage 1:
  - AI-1 fixes schema, HTTP contracts, token format.
  - AI-2 and AI-3 may scaffold locally but do not finalize integration until AI-1 contracts are marked `[x]`.
- Stage 2:
  - AI-2 builds gateway against the fixed `pg_notify` contract.
  - AI-3 builds store and UI against the board contracts and mock packets.
- Stage 3:
  - AI-3 integrates real HTTP and WS contracts.
  - AI-1 closes API edge cases.
  - AI-2 closes delivery, presence, and reconnect issues.
- Stage 4:
  - Integration pass with no cross-zone rewrites.
  - Release gate completed below.

## Release Gate
- [ ] claim одного корта двумя судьями обрабатывается корректно
- [ ] параллельные score updates на разных кортах не конфликтуют
- [ ] duplicate retry с тем же `command_id` не удваивает очки
- [ ] finalize блокирует дальнейшие judge mutations
- [ ] reconnect после рестарта gateway не ломает seat ownership
- [ ] таймер синхронен на hub/judge/viewer
- [ ] lease не сбрасывается агрессивно при краткой потере сети

## Assumptions
- Recommended configuration: 3 parallel AI workers.
- If only 2 workers are available, merge AI-2 and AI-3, keep AI-1 separate.
- `admin_session` remains the hub auth model.
- Judges in v1 work without `user_id`; identity is `device_id + seat token + display_name`.
