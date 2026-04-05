"use client";

import type { KotcConnectionStatus, KotcDeltaPacket, KotcPresenceItem } from "./types";

interface ConnectInput {
  sessionId: string;
  seatToken?: string | null;
  seatId?: string | number | null;
  deviceId?: string | null;
  channels: Array<{ scope: "global" | "court"; courtIdx?: number }>;
}

interface ClockProbe {
  t0: number;
  sentAt: number;
}

interface KotcSocketHandlers {
  onStatus: (status: KotcConnectionStatus) => void;
  onDelta: (packet: KotcDeltaPacket) => void;
  onPresence: (presence: KotcPresenceItem[]) => void;
  onClockOffset: (offsetMs: number, rttMs: number) => void;
  onError: (message: string) => void;
}

type WsMessage = Record<string, unknown>;

function resolveWsUrl(): string {
  if (typeof window === "undefined") return "";
  const envUrl = String(process.env.NEXT_PUBLIC_KOTC_WS_URL || "").trim();
  if (envUrl) return envUrl;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/kotc`;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function withJitter(delayMs: number): number {
  return Math.round(delayMs * (1 + Math.random()));
}

export class KotcLiveSocket {
  private ws: WebSocket | null = null;
  private handlers: KotcSocketHandlers;
  private connectInput: ConnectInput | null = null;
  private reconnectDelayMs = 700;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private status: KotcConnectionStatus = "idle";
  private probes = new Map<string, ClockProbe>();
  private offsetSamples: Array<{ offsetMs: number; rttMs: number }> = [];
  private probeRoundsSent = 0;
  private welcomeSeen = false;

  constructor(handlers: KotcSocketHandlers) {
    this.handlers = handlers;
  }

  connect(input: ConnectInput): void {
    this.connectInput = input;
    this.destroyed = false;
    this.clearReconnectTimer();
    this.openSocket();
  }

  disconnect(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    this.clearProbes();
    if (this.ws) {
      try {
        this.ws.close(1000, "manual_disconnect");
      } catch {
        // ignore close race
      }
      this.ws = null;
    }
    this.welcomeSeen = false;
    this.setStatus("offline");
  }

  send(payload: WsMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch {
      this.handlers.onError("WS send failed");
    }
  }

  private openSocket(): void {
    if (!this.connectInput || this.destroyed) return;
    const wsUrl = resolveWsUrl();
    if (!wsUrl) {
      this.handlers.onError("WS URL is not configured");
      this.setStatus("offline");
      return;
    }

    this.setStatus(this.status === "idle" ? "connecting" : "reconnecting");

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener("open", () => {
      this.welcomeSeen = false;
      this.reconnectDelayMs = 700;
      this.setStatus("connected");
    });

    this.ws.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    this.ws.addEventListener("close", () => {
      this.clearHeartbeat();
      this.clearProbes();
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    });

    this.ws.addEventListener("error", () => {
      this.handlers.onError("WS transport error");
    });
  }

  private handleMessage(raw: unknown): void {
    let parsed: WsMessage | null = null;
    try {
      parsed = JSON.parse(String(raw)) as WsMessage;
    } catch {
      return;
    }
    if (!parsed) return;
    const type = asString(parsed.type);

    if (type === "welcome") {
      if (!this.welcomeSeen) {
        this.welcomeSeen = true;
        this.sendSubscriptions();
        this.startHeartbeat();
        this.startClockProbes();
      }
      return;
    }

    if (type === "delta") {
      this.handlers.onDelta({
        type: "delta",
        session_id: asString(parsed.session_id ?? parsed.sessionId),
        scope: asString(parsed.scope) as KotcDeltaPacket["scope"],
        court_idx:
          parsed.court_idx == null && parsed.courtIdx == null
            ? undefined
            : asNumber(parsed.court_idx ?? parsed.courtIdx),
        command_type: asString(parsed.command_type ?? parsed.commandType),
        session_version: asNumber(parsed.session_version ?? parsed.sessionVersion),
        structure_epoch:
          parsed.structure_epoch == null && parsed.structureEpoch == null
            ? undefined
            : asNumber(parsed.structure_epoch ?? parsed.structureEpoch),
        court_version:
          parsed.court_version == null && parsed.afterVersion == null
            ? undefined
            : asNumber(parsed.court_version ?? parsed.afterVersion),
        division_version:
          parsed.division_version == null && parsed.divisionVersion == null
            ? undefined
            : asNumber(parsed.division_version ?? parsed.divisionVersion),
        delta:
          parsed.delta && typeof parsed.delta === "object"
            ? (parsed.delta as Record<string, unknown>)
            : null,
        serverNow: asNumber(parsed.serverNow),
      });
      return;
    }

    if (type === "presence") {
      const presenceRaw = Array.isArray(parsed.presence) ? parsed.presence : [];
      const presence = presenceRaw
        .map((item) => {
          const obj = asObject(item);
          const roleRaw = asString(obj.role);
          const role = roleRaw === "hub" || roleRaw === "judge" ? roleRaw : "viewer";
          return {
            seatId: asString(obj.seatId ?? obj.seat_id),
            role,
            courtIdx:
              obj.courtIdx === null || obj.court_idx === null
                ? null
                : asNumber(obj.courtIdx ?? obj.court_idx, 0),
            displayName: asString(obj.displayName ?? obj.display_name),
            isOnline: Boolean(obj.isOnline ?? obj.is_online),
            leaseUntil: asString(obj.leaseUntil ?? obj.lease_until) || null,
            lastSeenAt: asString(obj.lastSeenAt ?? obj.last_seen_at) || null,
          } satisfies KotcPresenceItem;
        })
        .filter(Boolean);
      this.handlers.onPresence(presence);
      return;
    }

    if (type === "presence.evicted") {
      this.handlers.onError("Seat lease expired");
      return;
    }

    if (type === "timesync.pong" || type === "clock.pong" || type === "pong") {
      const probeId = asString(parsed.probe_id ?? parsed.seq);
      const probe = this.probes.get(probeId);
      if (!probe) return;
      this.probes.delete(probeId);
      const t3 = Date.now();
      const t0 = probe.t0;
      const t1 = asNumber(parsed.t1_server_recv ?? parsed.server_received_at, t0);
      const t2 = asNumber(parsed.t2_server_send ?? parsed.server_sent_at, t1);
      const rtt = Math.max(0, t3 - t0);
      const offset = Math.round((t1 + t2 - t0 - t3) / 2);
      this.offsetSamples.push({ offsetMs: offset, rttMs: rtt });
      this.maybeEmitClockOffset();
      return;
    }
  }

  private setStatus(next: KotcConnectionStatus): void {
    this.status = next;
    this.handlers.onStatus(next);
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.setStatus("reconnecting");
    const delay = Math.min(this.reconnectDelayMs, 15_000);
    const jittered = withJitter(delay);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelayMs = Math.min(Math.round(this.reconnectDelayMs * 1.8), 15_000);
      this.openSocket();
    }, jittered);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    if (!this.connectInput?.seatId) return;
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: "presence.heartbeat",
        sessionId: this.connectInput?.sessionId,
        seatId: String(this.connectInput?.seatId ?? ""),
        deviceId: this.connectInput?.deviceId ?? undefined,
        ts: Date.now(),
      });
    }, 9_000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startClockProbes(): void {
    this.clearProbes();
    this.offsetSamples = [];
    this.probeRoundsSent = 0;
    this.sendClockProbe();
    this.probeTimer = setInterval(() => {
      if (this.probeRoundsSent >= 5) {
        this.clearProbes();
        return;
      }
      this.sendClockProbe();
    }, 260);
  }

  private sendClockProbe(): void {
    const probeId = String(this.probeRoundsSent + 1);
    const t0 = Date.now();
    this.probeRoundsSent += 1;
    this.probes.set(probeId, { t0, sentAt: t0 });
    this.send({ type: "timesync.ping", seq: Number(probeId), t0ClientSend: t0 });
  }

  private maybeEmitClockOffset(): void {
    if (this.offsetSamples.length < 3) return;
    const sortedByRtt = [...this.offsetSamples].sort((a, b) => a.rttMs - b.rttMs);
    const best = sortedByRtt.slice(0, Math.min(3, sortedByRtt.length));
    const offsets = best.map((x) => x.offsetMs).sort((a, b) => a - b);
    const median = offsets[Math.floor(offsets.length / 2)] ?? 0;
    const avgRtt = Math.round(best.reduce((sum, item) => sum + item.rttMs, 0) / best.length);
    this.handlers.onClockOffset(median, avgRtt);
  }

  private clearProbes(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    this.probes.clear();
  }

  private sendSubscriptions(): void {
    if (!this.connectInput) return;
    for (const channel of this.connectInput.channels) {
      this.send({
        type: "subscribe",
        sessionId: this.connectInput.sessionId,
        scope: channel.scope,
        courtIdx: channel.scope === "court" ? channel.courtIdx : undefined,
      });
    }
  }
}
