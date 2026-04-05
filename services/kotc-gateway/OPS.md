# KOTC Gateway Ops

## Purpose
Standalone WebSocket gateway for KOTC Live:
- subscribes to Postgres `LISTEN/NOTIFY`
- fetches `delta_json` from `live_kotc_command_log`
- broadcasts scoped events to `global` and `court:{idx}` subscribers
- refreshes seat leases from heartbeat packets
- evicts expired leases with grace period

## Runtime
- Node.js 20+ recommended
- Service folder: `services/kotc-gateway`

## Install
```bash
npm --prefix services/kotc-gateway install
```

## Start
```bash
npm --prefix services/kotc-gateway run start
```

## Env vars
- Required:
  - `DATABASE_URL`
- Optional:
  - `KOTC_GATEWAY_HOST` default `0.0.0.0`
  - `KOTC_GATEWAY_PORT` default `8091`
  - `KOTC_NOTIFY_CHANNEL` default `kotc_events`
  - `KOTC_LEASE_TTL_SEC` default `45`
  - `KOTC_HEARTBEAT_INTERVAL_MS` default `10000`
  - `KOTC_CLEANER_INTERVAL_MS` default `12000`
  - `KOTC_LEASE_GRACE_SEC` default `5`
  - `KOTC_WS_PING_INTERVAL_MS` default `30000`
  - `KOTC_WS_IDLE_TIMEOUT_MS` default `70000`
  - `KOTC_MAX_MESSAGE_BYTES` default `32768`

## Suggested systemd unit (example)
```ini
[Unit]
Description=KOTC Live Gateway
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/ipt
Environment=DATABASE_URL=postgres://...
Environment=KOTC_GATEWAY_PORT=8091
ExecStart=/usr/bin/npm --prefix /var/www/ipt/services/kotc-gateway run start
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

## Integration notes
- AI-1 backend must `pg_notify` channel `KOTC_NOTIFY_CHANNEL` (default `kotc_events`) with:
  - `session_id`
  - `command_log_id`
  - `scope`
  - `court_idx`
  - `command_type`
  - `session_version`
- AI-3 clients should follow packet schema in `services/kotc-gateway/PROTOCOL.md`.
