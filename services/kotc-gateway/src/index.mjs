import process from 'node:process';
import crypto from 'node:crypto';
import { Pool, Client } from 'pg';
import { WebSocketServer } from 'ws';

const cfg = {
  databaseUrl: String(process.env.DATABASE_URL || '').trim(),
  host: String(process.env.KOTC_GATEWAY_HOST || '0.0.0.0').trim(),
  port: Number(process.env.KOTC_GATEWAY_PORT || 8091),
  notifyChannel: String(process.env.KOTC_NOTIFY_CHANNEL || 'kotc_events').trim(),
  heartbeatLeaseSec: Number(process.env.KOTC_LEASE_TTL_SEC || 45),
  heartbeatIntervalMs: Number(process.env.KOTC_HEARTBEAT_INTERVAL_MS || 10000),
  cleanerIntervalMs: Number(process.env.KOTC_CLEANER_INTERVAL_MS || 12000),
  leaseGraceSec: Number(process.env.KOTC_LEASE_GRACE_SEC || 5),
  wsPingIntervalMs: Number(process.env.KOTC_WS_PING_INTERVAL_MS || 30000),
  wsClientIdleTimeoutMs: Number(process.env.KOTC_WS_IDLE_TIMEOUT_MS || 70000),
  maxMessageBytes: Number(process.env.KOTC_MAX_MESSAGE_BYTES || 32768),
};
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

if (!cfg.databaseUrl) {
  throw new Error('Missing DATABASE_URL for kotc-gateway');
}
if (!Number.isFinite(cfg.port) || cfg.port <= 0) {
  throw new Error('Invalid KOTC_GATEWAY_PORT');
}

function resolvePgSsl(connectionString) {
  const explicit = String(process.env.DATABASE_SSL || process.env.PGSSLMODE || '').trim().toLowerCase();
  if (['0', 'false', 'off', 'disable', 'disabled'].includes(explicit)) {
    return false;
  }
  if (explicit) {
    return { rejectUnauthorized: false };
  }

  try {
    const parsed = new URL(connectionString);
    const sslMode = parsed.searchParams.get('sslmode')?.trim().toLowerCase();
    if (sslMode && ['disable', 'allow', 'prefer'].includes(sslMode)) {
      return false;
    }
    return LOCAL_DB_HOSTS.has(parsed.hostname) ? false : { rejectUnauthorized: false };
  } catch {
    return { rejectUnauthorized: false };
  }
}

const pgSsl = resolvePgSsl(cfg.databaseUrl);

const pool = new Pool({
  connectionString: cfg.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: pgSsl,
});

const listenClient = new Client({
  connectionString: cfg.databaseUrl,
  ssl: pgSsl,
});

const wss = new WebSocketServer({
  host: cfg.host,
  port: cfg.port,
  maxPayload: cfg.maxMessageBytes,
});

const clients = new Map();
const channels = new Map();

function nowMs() {
  return Date.now();
}

function makeId() {
  return crypto.randomUUID();
}

function keyGlobal(sessionId) {
  return `global:${sessionId}`;
}

function keyCourt(sessionId, courtIdx) {
  return `court:${sessionId}:${courtIdx}`;
}

function ensureSet(map, key) {
  let found = map.get(key);
  if (!found) {
    found = new Set();
    map.set(key, found);
  }
  return found;
}

function log(message, extra) {
  const ts = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[kotc-gateway] ${ts} ${message}`);
    return;
  }
  console.log(`[kotc-gateway] ${ts} ${message}`, extra);
}

function safeSend(ws, payload) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    log('send error', { err: String(err) });
  }
}

function subscribe(ws, sessionId, scope, courtIdx) {
  const state = clients.get(ws);
  if (!state) return;
  const sid = String(sessionId || '').trim();
  if (!sid) return;

  let key = '';
  if (scope === 'global') key = keyGlobal(sid);
  if (scope === 'court') key = keyCourt(sid, Number(courtIdx));
  if (!key) return;

  state.subscriptions.add(key);
  ensureSet(channels, key).add(ws);
}

function unsubscribe(ws, sessionId, scope, courtIdx) {
  const state = clients.get(ws);
  if (!state) return;
  const sid = String(sessionId || '').trim();
  if (!sid) return;

  let key = '';
  if (scope === 'global') key = keyGlobal(sid);
  if (scope === 'court') key = keyCourt(sid, Number(courtIdx));
  if (!key) return;

  state.subscriptions.delete(key);
  const set = channels.get(key);
  if (set) {
    set.delete(ws);
    if (set.size === 0) channels.delete(key);
  }
}

function cleanupSocket(ws) {
  const state = clients.get(ws);
  if (!state) return;
  for (const key of state.subscriptions) {
    const set = channels.get(key);
    if (!set) continue;
    set.delete(ws);
    if (set.size === 0) channels.delete(key);
  }
  clients.delete(ws);
}

function parseJson(input) {
  try {
    return JSON.parse(String(input || ''));
  } catch {
    return null;
  }
}

async function refreshSeatLease(message) {
  const sessionId = String(message.sessionId || '').trim();
  const seatId = String(message.seatId || '').trim();
  const deviceIdRaw = message.deviceId == null ? null : String(message.deviceId).trim();
  const deviceId = deviceIdRaw && deviceIdRaw.length > 0 ? deviceIdRaw : null;
  if (!sessionId || !seatId) {
    return { ok: false, error: 'sessionId and seatId are required' };
  }

  const q = `
    UPDATE live_kotc_seat
       SET last_seen_at = NOW(),
           lease_until = NOW() + ($4 || ' seconds')::interval
     WHERE session_id = $1
       AND seat_id::text = $2
       AND ($3::text IS NULL OR device_id = $3)
     RETURNING seat_id::text AS seat_id,
               session_id,
               role,
               court_idx,
               device_id,
               lease_until;
  `;
  const values = [sessionId, seatId, deviceId, cfg.heartbeatLeaseSec];
  const result = await pool.query(q, values);
  if (!result.rowCount) {
    return { ok: false, error: 'seat_not_found_or_device_mismatch' };
  }
  return { ok: true, seat: result.rows[0] };
}

async function evictExpiredLeases() {
  const q = `
    UPDATE live_kotc_seat
       SET lease_until = NULL
     WHERE lease_until IS NOT NULL
       AND lease_until < NOW() - ($1 || ' seconds')::interval
     RETURNING seat_id::text AS seat_id,
               session_id,
               role,
               court_idx,
               device_id;
  `;
  const result = await pool.query(q, [cfg.leaseGraceSec]);
  if (!result.rowCount) return;

  for (const row of result.rows) {
    const payload = {
      type: 'presence.evicted',
      sessionId: row.session_id,
      seatId: row.seat_id,
      role: row.role,
      courtIdx: row.court_idx,
      deviceId: row.device_id,
      serverNow: nowMs(),
    };
    broadcastSessionScoped(row.session_id, row.court_idx, payload);
  }
}

async function fetchCommandLog(commandLogId) {
  const q = `
    SELECT command_log_id,
           session_id,
           scope,
           court_idx,
           command_type,
           after_version,
           delta_json,
           created_at
      FROM live_kotc_command_log
     WHERE command_log_id = $1
     LIMIT 1;
  `;
  const result = await pool.query(q, [commandLogId]);
  return result.rowCount ? result.rows[0] : null;
}

function broadcastSessionScoped(sessionId, courtIdx, payload) {
  const receiverSet = new Set();
  const globalListeners = channels.get(keyGlobal(sessionId));
  if (globalListeners) {
    for (const ws of globalListeners) receiverSet.add(ws);
  }
  if (courtIdx != null) {
    const courtListeners = channels.get(keyCourt(sessionId, Number(courtIdx)));
    if (courtListeners) {
      for (const ws of courtListeners) receiverSet.add(ws);
    }
  }

  for (const ws of receiverSet) {
    safeSend(ws, payload);
  }
}

async function handleNotify(msg) {
  const payload = parseJson(msg.payload);
  if (!payload || typeof payload !== 'object') {
    log('ignoring notify with invalid json payload');
    return;
  }
  const sessionId = String(payload.session_id || '').trim();
  const commandLogId = Number(payload.command_log_id);
  if (!sessionId || !Number.isFinite(commandLogId)) {
    log('ignoring notify without session_id or command_log_id', payload);
    return;
  }

  const logRow = await fetchCommandLog(commandLogId);
  if (!logRow) {
    log('notify command_log_id not found', { commandLogId, sessionId });
    return;
  }

  const packet = {
    type: 'delta',
    sessionId: String(logRow.session_id),
    scope: String(logRow.scope || payload.scope || 'global'),
    courtIdx: logRow.court_idx == null ? null : Number(logRow.court_idx),
    commandType: String(logRow.command_type || payload.command_type || 'unknown'),
    commandLogId: Number(logRow.command_log_id),
    sessionVersion: Number(payload.session_version ?? 0) || null,
    afterVersion: Number(logRow.after_version ?? 0) || null,
    delta: logRow.delta_json ?? null,
    emittedAt: logRow.created_at,
    serverNow: nowMs(),
  };
  broadcastSessionScoped(packet.sessionId, packet.courtIdx, packet);
}

function scheduleWsPing() {
  return setInterval(() => {
    const now = nowMs();
    for (const [ws, state] of clients) {
      if (now - state.lastClientActivityAt > cfg.wsClientIdleTimeoutMs) {
        safeSend(ws, {
          type: 'disconnect',
          reason: 'idle_timeout',
          serverNow: now,
        });
        try {
          ws.terminate();
        } catch {
          // ignore
        }
        continue;
      }
      if (ws.readyState === ws.OPEN) {
        try {
          ws.ping();
        } catch {
          // ignore ping errors; close will clean up
        }
      }
    }
  }, cfg.wsPingIntervalMs);
}

function setupWs() {
  wss.on('connection', (ws, req) => {
    const clientId = makeId();
    clients.set(ws, {
      clientId,
      subscriptions: new Set(),
      connectedAt: nowMs(),
      lastClientActivityAt: nowMs(),
      lastHeartbeatAt: 0,
      seatSessionId: null,
      seatId: null,
      deviceId: null,
    });

    safeSend(ws, {
      type: 'welcome',
      clientId,
      protocol: 'kotc-live-gateway.v1',
      serverNow: nowMs(),
      heartbeatIntervalMs: cfg.heartbeatIntervalMs,
      leaseTtlSec: cfg.heartbeatLeaseSec,
      cleanerIntervalMs: cfg.cleanerIntervalMs,
      leaseGraceSec: cfg.leaseGraceSec,
      reconnectAdvice: {
        baseDelayMs: 500,
        maxDelayMs: 15000,
        jitterFormula: 'delay * (1 + Math.random())',
      },
      remoteAddress: req.socket.remoteAddress || null,
    });

    ws.on('pong', () => {
      const state = clients.get(ws);
      if (!state) return;
      state.lastClientActivityAt = nowMs();
    });

    ws.on('message', async (raw) => {
      const state = clients.get(ws);
      if (!state) return;
      state.lastClientActivityAt = nowMs();

      const message = parseJson(raw);
      if (!message || typeof message !== 'object') {
        safeSend(ws, { type: 'error', error: 'invalid_json', serverNow: nowMs() });
        return;
      }

      const type = String(message.type || '');
      if (!type) {
        safeSend(ws, { type: 'error', error: 'missing_type', serverNow: nowMs() });
        return;
      }

      try {
        if (type === 'subscribe') {
          const scope = String(message.scope || '');
          const sessionId = String(message.sessionId || '');
          const courtIdx = message.courtIdx == null ? null : Number(message.courtIdx);
          if (!(scope === 'global' || scope === 'court')) {
            safeSend(ws, { type: 'error', error: 'invalid_scope', serverNow: nowMs() });
            return;
          }
          if (scope === 'court' && !Number.isFinite(courtIdx)) {
            safeSend(ws, { type: 'error', error: 'courtIdx_required', serverNow: nowMs() });
            return;
          }
          subscribe(ws, sessionId, scope, courtIdx);
          safeSend(ws, { type: 'subscribed', scope, sessionId, courtIdx, serverNow: nowMs() });
          return;
        }

        if (type === 'unsubscribe') {
          const scope = String(message.scope || '');
          const sessionId = String(message.sessionId || '');
          const courtIdx = message.courtIdx == null ? null : Number(message.courtIdx);
          unsubscribe(ws, sessionId, scope, courtIdx);
          safeSend(ws, { type: 'unsubscribed', scope, sessionId, courtIdx, serverNow: nowMs() });
          return;
        }

        if (type === 'presence.heartbeat') {
          const refreshed = await refreshSeatLease(message);
          if (!refreshed.ok) {
            safeSend(ws, {
              type: 'presence.nack',
              error: refreshed.error || 'presence_refresh_failed',
              requestId: message.requestId ?? null,
              serverNow: nowMs(),
            });
            return;
          }

          state.lastHeartbeatAt = nowMs();
          state.seatSessionId = refreshed.seat.session_id;
          state.seatId = refreshed.seat.seat_id;
          state.deviceId = refreshed.seat.device_id || null;

          safeSend(ws, {
            type: 'presence.ack',
            requestId: message.requestId ?? null,
            sessionId: refreshed.seat.session_id,
            seatId: refreshed.seat.seat_id,
            role: refreshed.seat.role,
            courtIdx: refreshed.seat.court_idx,
            leaseUntil: refreshed.seat.lease_until,
            leaseTtlSec: cfg.heartbeatLeaseSec,
            serverNow: nowMs(),
          });
          return;
        }

        if (type === 'timesync.ping') {
          const t1 = nowMs();
          const response = {
            type: 'timesync.pong',
            seq: message.seq ?? null,
            t0ClientSend: message.t0ClientSend ?? null,
            t1ServerRecv: t1,
            t2ServerSend: nowMs(),
            serverNow: nowMs(),
          };
          safeSend(ws, response);
          return;
        }

        if (type === 'ping') {
          safeSend(ws, {
            type: 'pong',
            requestId: message.requestId ?? null,
            serverNow: nowMs(),
          });
          return;
        }

        safeSend(ws, {
          type: 'error',
          error: 'unsupported_type',
          requestType: type,
          serverNow: nowMs(),
        });
      } catch (err) {
        safeSend(ws, {
          type: 'error',
          error: 'internal_error',
          requestType: type,
          serverNow: nowMs(),
        });
        log('message handling error', { err: String(err), type });
      }
    });

    ws.on('close', () => {
      cleanupSocket(ws);
    });

    ws.on('error', (err) => {
      log('socket error', { err: String(err) });
      cleanupSocket(ws);
    });
  });
}

async function startPgNotify() {
  await listenClient.connect();
  listenClient.on('notification', (msg) => {
    if (msg.channel !== cfg.notifyChannel) return;
    handleNotify(msg).catch((err) => {
      log('notify handling failed', { err: String(err) });
    });
  });
  await listenClient.query(`LISTEN ${cfg.notifyChannel}`);
  log(`listening channel ${cfg.notifyChannel}`);
}

async function shutdown(signal) {
  log(`received ${signal}, shutting down`);
  try {
    for (const ws of clients.keys()) {
      safeSend(ws, { type: 'shutdown', reason: signal, serverNow: nowMs() });
      ws.close();
    }
  } catch {
    // ignore
  }

  try {
    await listenClient.query(`UNLISTEN ${cfg.notifyChannel}`);
  } catch {
    // ignore
  }
  try {
    await listenClient.end();
  } catch {
    // ignore
  }
  try {
    await pool.end();
  } catch {
    // ignore
  }
  try {
    wss.close();
  } catch {
    // ignore
  }
  process.exit(0);
}

async function main() {
  setupWs();
  await startPgNotify();
  const cleanerTimer = setInterval(() => {
    evictExpiredLeases().catch((err) => {
      log('lease cleaner error', { err: String(err) });
    });
  }, cfg.cleanerIntervalMs);
  const pingTimer = scheduleWsPing();

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    log('uncaughtException', { err: String(err) });
  });
  process.on('unhandledRejection', (err) => {
    log('unhandledRejection', { err: String(err) });
  });

  log(`websocket server started on ws://${cfg.host}:${cfg.port}`);
  log(`heartbeat interval=${cfg.heartbeatIntervalMs}ms ttl=${cfg.heartbeatLeaseSec}s`);
  log(`cleaner interval=${cfg.cleanerIntervalMs}ms grace=${cfg.leaseGraceSec}s`);

  // Keep references to avoid accidental gc in some runtimes.
  globalThis.__kotcGateway = { cleanerTimer, pingTimer, wss, pool, listenClient };
}

main().catch((err) => {
  log('fatal startup error', { err: String(err) });
  process.exit(1);
});
