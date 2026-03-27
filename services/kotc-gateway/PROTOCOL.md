# KOTC Live Gateway Protocol (v1)

## Transport
- WebSocket endpoint: `ws://<host>:<port>`
- Server sends JSON packets only.
- Client sends JSON packets only.

## Server -> Client packets
- `welcome`
  - Sent immediately after connect.
  - Fields:
    - `protocol`: `kotc-live-gateway.v1`
    - `serverNow`: epoch ms
    - `heartbeatIntervalMs`
    - `leaseTtlSec`
    - `cleanerIntervalMs`
    - `leaseGraceSec`
    - `reconnectAdvice` (`baseDelayMs`, `maxDelayMs`, `jitterFormula`)
- `subscribed` / `unsubscribed`
  - Ack for subscription changes.
- `delta`
  - Live event from DB `live_kotc_command_log`.
  - Fields:
    - `sessionId`
    - `scope` (`global|court|division|...`)
    - `courtIdx` nullable
    - `commandType`
    - `commandLogId`
    - `sessionVersion`
    - `afterVersion`
    - `delta` (from `delta_json`)
    - `emittedAt`
    - `serverNow`
- `presence.ack` / `presence.nack`
  - Heartbeat lease refresh result.
- `presence.evicted`
  - Seat lease was evicted by cleaner.
- `timesync.pong`
  - Fields: `seq`, `t0ClientSend`, `t1ServerRecv`, `t2ServerSend`, `serverNow`
- `pong`
  - Generic ping response.
- `error`
  - Validation or internal error.

## Client -> Server packets
- `subscribe`
```json
{
  "type": "subscribe",
  "sessionId": "session-id",
  "scope": "global"
}
```
- `subscribe` (court channel)
```json
{
  "type": "subscribe",
  "sessionId": "session-id",
  "scope": "court",
  "courtIdx": 2
}
```
- `unsubscribe`
```json
{
  "type": "unsubscribe",
  "sessionId": "session-id",
  "scope": "global"
}
```
- `presence.heartbeat`
```json
{
  "type": "presence.heartbeat",
  "requestId": "optional-idempotency-token",
  "sessionId": "session-id",
  "seatId": "123",
  "deviceId": "dev_abc"
}
```
- `timesync.ping`
```json
{
  "type": "timesync.ping",
  "seq": 1,
  "t0ClientSend": 1775000000000
}
```

## Reconnect rules for AI-3
- Use exponential backoff with jitter:
  - `delay = min(maxDelayMs, baseDelayMs * 2^attempt)`
  - `actualDelay = delay * (1 + Math.random())`
- On reconnect:
  - Re-open socket.
  - Wait for `welcome`.
  - Re-subscribe to `global` + owned `court:{idx}`.
  - Immediately send `presence.heartbeat`.
  - Run 3-5 `timesync.ping` probes and use median of lowest RTT samples.
- Gap handling:
  - If gap only on owned court version -> fetch `GET /api/kotc/sessions/:id/courts/:courtIdx`.
  - If gap on `sessionVersion`/structure -> fetch `GET /api/kotc/sessions/:id/snapshot?scope=global`.
