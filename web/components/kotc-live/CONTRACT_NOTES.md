# KOTC Live Client Contract Notes (AI-3)

## HTTP Endpoints expected by client
- `GET /api/kotc/sessions/active`
  - accepts either array or `{ sessions: [...] }`
- `POST /api/kotc/sessions/:id/join`
  - expected to return `seatToken`, `seat`, `snapshot`
- `POST /api/kotc/sessions/:id/release`
- `GET /api/kotc/sessions/:id/snapshot?scope=global|full`
- `GET /api/kotc/sessions/:id/courts/:courtIdx`
- `GET /api/kotc/sessions/:id/presence`
- `POST /api/kotc/sessions/:id/commands`

Client sends both camelCase and snake_case payload keys for compatibility during rollout.

## Command payloads currently sent by UI
- `court.score_set`
  - payload:
    - `court_idx`
    - `side` (`home`|`away`)
    - `delta`
    - `score: { home, away }`
    - `scores` mirror object (`home/away/teamA/teamB`)
- `court.timer_start|court.timer_pause|court.timer_reset`
  - payload: `{ court_idx }`
- `court.timer_adjust`
  - payload: `{ court_idx, delta_ms }`
- `session.pause|session.resume`
  - payload: `{}`
- `global.broadcast_message`
  - payload: `{ message }`

## WS packet assumptions in client
- transport URL: `NEXT_PUBLIC_KOTC_WS_URL` or fallback `ws(s)://<host>/ws/kotc`
- auth packet on connect:
  - `{ type: "auth", session_id, seat_token, channels }`
- heartbeat:
  - `{ type: "presence.heartbeat", ts }` every ~9s
- clock sync:
  - client sends `{ type: "clock.ping", probe_id, t0_client_send }`
  - expects `{ type: "clock.pong"| "pong", probe_id, t1_server_recv, t2_server_send }`
- deltas:
  - `{ type: "delta", session_id, scope, court_idx?, session_version, structure_epoch?, court_version?, delta? }`
- presence updates:
  - `{ type: "presence", presence: [...] }`

## Gap strategy implemented
- If incoming `session_version > local + 1`, client runs scoped refetch:
  - `scope=court` and `court_idx` available: refetch court endpoint
  - otherwise refetch global snapshot

## Legacy fallback behavior
- If live session API returns 404/405/501, `/sudyam` auto-falls back to legacy iframe.
- Manual fallback button also available in UI.

