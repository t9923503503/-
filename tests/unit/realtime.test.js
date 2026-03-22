import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRealtimeChannel, createTournamentSync } from '../../shared/realtime.js';

describe('Realtime module (A4.2)', () => {

  // ── Noop channel when no credentials ──────────────────────
  it('returns noop channel when no channelId', () => {
    const ch = createRealtimeChannel({});
    expect(ch.isConnected()).toBe(false);
    expect(ch.broadcast('test', {})).toBe(false);
    ch.destroy(); // should not throw
  });

  it('returns noop channel when no Supabase URL', () => {
    const ch = createRealtimeChannel({ channelId: 'test-123' });
    expect(ch.isConnected()).toBe(false);
    expect(ch.broadcast('test', {})).toBe(false);
    ch.destroy();
  });

  it('noop channel on/off are chainable', () => {
    const ch = createRealtimeChannel({});
    const result = ch.on('event', () => {}).off('event');
    expect(result).toBe(ch);
  });

  // ── createTournamentSync returns expected API ─────────────
  it('createTournamentSync returns expected methods', () => {
    const sync = createTournamentSync('trn_abc');
    expect(typeof sync.broadcastScore).toBe('function');
    expect(typeof sync.broadcastPhase).toBe('function');
    expect(typeof sync.broadcastSnapshot).toBe('function');
    expect(typeof sync.onScoreUpdate).toBe('function');
    expect(typeof sync.onPhaseChange).toBe('function');
    expect(typeof sync.onSnapshot).toBe('function');
    expect(typeof sync.isConnected).toBe('function');
    expect(typeof sync.destroy).toBe('function');
    expect(sync.isConnected()).toBe(false);
    sync.destroy();
  });

  it('createTournamentSync.onScoreUpdate is chainable', () => {
    const sync = createTournamentSync('trn_xyz');
    const result = sync.onScoreUpdate(() => {});
    expect(result).toBe(sync);
    sync.destroy();
  });

  // ── Channel with mock WebSocket ───────────────────────────
  describe('with mock WebSocket', () => {
    let mockWs;
    let OrigWebSocket;

    beforeEach(() => {
      mockWs = {
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1, // OPEN
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      };
      OrigWebSocket = globalThis.WebSocket;
      globalThis.WebSocket = vi.fn(() => mockWs);
      globalThis.WebSocket.OPEN = 1;
    });

    afterEach(() => {
      globalThis.WebSocket = OrigWebSocket;
    });

    it('connects to Supabase realtime WebSocket', () => {
      const onStatus = vi.fn();
      const ch = createRealtimeChannel({
        channelId: 'test-ch',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'test-key-123',
        onStatus,
      });

      expect(globalThis.WebSocket).toHaveBeenCalledOnce();
      const url = globalThis.WebSocket.mock.calls[0][0];
      expect(url).toContain('wss://example.supabase.co/realtime/v1/websocket');
      expect(url).toContain('apikey=test-key-123');
      expect(onStatus).toHaveBeenCalledWith('connecting');

      ch.destroy();
    });

    it('sends phx_join on open and marks connected on reply', () => {
      const onStatus = vi.fn();
      const ch = createRealtimeChannel({
        channelId: 'join-test',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
        onStatus,
      });

      // Simulate open
      mockWs.onopen();
      expect(mockWs.send).toHaveBeenCalled();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(joinMsg.event).toBe('phx_join');
      expect(joinMsg.topic).toContain('broadcast-join-test');

      // Simulate join reply
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply',
        ref: joinMsg.ref,
        payload: { status: 'ok' },
      })});

      expect(ch.isConnected()).toBe(true);
      expect(onStatus).toHaveBeenCalledWith('connected');

      ch.destroy();
    });

    it('emits events to listeners on broadcast message', () => {
      const ch = createRealtimeChannel({
        channelId: 'emit-test',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });

      const handler = vi.fn();
      ch.on('score_update', handler);

      // Simulate open + join
      mockWs.onopen();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply', ref: joinMsg.ref, payload: { status: 'ok' },
      })});

      // Simulate incoming broadcast
      mockWs.onmessage({ data: JSON.stringify({
        event: 'broadcast',
        payload: { event: 'score_update', payload: { score1: 21, score2: 15 } },
      })});

      expect(handler).toHaveBeenCalledWith({ score1: 21, score2: 15 });

      ch.destroy();
    });

    it('broadcast sends message via WebSocket', () => {
      const ch = createRealtimeChannel({
        channelId: 'bcast-test',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });

      // Simulate open + join
      mockWs.onopen();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply', ref: joinMsg.ref, payload: { status: 'ok' },
      })});

      mockWs.send.mockClear();
      const sent = ch.broadcast('score_update', { courtIdx: 0, score1: 21 });
      expect(sent).toBe(true);

      const msg = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(msg.event).toBe('broadcast');
      expect(msg.payload.event).toBe('score_update');
      expect(msg.payload.payload.courtIdx).toBe(0);

      ch.destroy();
    });

    it('off removes specific listener', () => {
      const ch = createRealtimeChannel({
        channelId: 'off-test',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });

      const handler = vi.fn();
      ch.on('test_event', handler);
      ch.off('test_event', handler);

      // Simulate open + join + broadcast
      mockWs.onopen();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply', ref: joinMsg.ref, payload: { status: 'ok' },
      })});
      mockWs.onmessage({ data: JSON.stringify({
        event: 'broadcast',
        payload: { event: 'test_event', payload: {} },
      })});

      expect(handler).not.toHaveBeenCalled();
      ch.destroy();
    });

    it('schedules reconnect on close', () => {
      vi.useFakeTimers();
      const onStatus = vi.fn();
      const ch = createRealtimeChannel({
        channelId: 'recon-test',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
        onStatus,
      });

      // Simulate close
      mockWs.onclose({ code: 1006 });
      expect(onStatus).toHaveBeenCalledWith('disconnected');

      // Should attempt reconnect after delay
      globalThis.WebSocket.mockClear();
      vi.advanceTimersByTime(1500);
      expect(globalThis.WebSocket).toHaveBeenCalledOnce();

      ch.destroy();
      vi.useRealTimers();
    });

    it('destroy prevents reconnect', () => {
      vi.useFakeTimers();
      const ch = createRealtimeChannel({
        channelId: 'destroy-test',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });

      ch.destroy();
      expect(mockWs.close).toHaveBeenCalled();

      // Simulate close after destroy
      globalThis.WebSocket.mockClear();
      vi.advanceTimersByTime(5000);
      expect(globalThis.WebSocket).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // ── Reconnect snapshot request (S5.7) ────────────────────
  describe('reconnect snapshot request', () => {
    let mockWs;
    let OrigWebSocket;

    beforeEach(() => {
      mockWs = {
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      };
      OrigWebSocket = globalThis.WebSocket;
      globalThis.WebSocket = vi.fn(() => mockWs);
      globalThis.WebSocket.OPEN = 1;
    });

    afterEach(() => {
      globalThis.WebSocket = OrigWebSocket;
    });

    function connectChannel(ch) {
      mockWs.onopen();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[mockWs.send.mock.calls.length - 1][0]);
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply', ref: joinMsg.ref, payload: { status: 'ok' },
      })});
      return joinMsg;
    }

    it('does NOT send request_snapshot on first connect', () => {
      const ch = createRealtimeChannel({
        channelId: 'first-connect',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });

      connectChannel(ch);
      // Only phx_join should have been sent, no request_snapshot broadcast
      const messages = mockWs.send.mock.calls.map(c => JSON.parse(c[0]));
      const snapReqs = messages.filter(m => m.event === 'broadcast' && m.payload?.event === 'request_snapshot');
      expect(snapReqs).toHaveLength(0);

      ch.destroy();
    });

    it('sends request_snapshot after reconnect', () => {
      vi.useFakeTimers();
      const onStatus = vi.fn();
      const ch = createRealtimeChannel({
        channelId: 'reconnect-snap',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
        onStatus,
      });

      // First connect
      connectChannel(ch);
      expect(ch.isConnected()).toBe(true);
      mockWs.send.mockClear();

      // Simulate disconnect
      mockWs.onclose({ code: 1006 });
      expect(ch.isConnected()).toBe(false);

      // Advance timer to trigger reconnect
      vi.advanceTimersByTime(1500);

      // New mockWs created by reconnect
      const newMockWs = {
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      };
      // The WebSocket constructor was called again — get the latest instance
      // We need to update mockWs reference to the one created by reconnect
      const latestWs = globalThis.WebSocket.mock.results[globalThis.WebSocket.mock.results.length - 1]?.value;
      // Since our mock always returns the same mockWs, simulate reconnect on it
      mockWs.send.mockClear();
      mockWs.onopen();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply', ref: joinMsg.ref, payload: { status: 'ok' },
      })});

      // Should have sent request_snapshot broadcast after join
      const messages = mockWs.send.mock.calls.map(c => JSON.parse(c[0]));
      const snapReqs = messages.filter(m => m.event === 'broadcast' && m.payload?.event === 'request_snapshot');
      expect(snapReqs).toHaveLength(1);
      expect(snapReqs[0].payload.payload.reason).toBe('reconnect');

      ch.destroy();
      vi.useRealTimers();
    });

    it('emits _reconnected internal event on reconnect', () => {
      vi.useFakeTimers();
      const ch = createRealtimeChannel({
        channelId: 'internal-event',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });

      const reconnectHandler = vi.fn();
      ch.on('_reconnected', reconnectHandler);

      // First connect — should NOT emit _reconnected
      connectChannel(ch);
      expect(reconnectHandler).not.toHaveBeenCalled();

      // Disconnect + reconnect
      mockWs.onclose({ code: 1006 });
      vi.advanceTimersByTime(1500);
      mockWs.send.mockClear();
      mockWs.onopen();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply', ref: joinMsg.ref, payload: { status: 'ok' },
      })});

      expect(reconnectHandler).toHaveBeenCalledOnce();

      ch.destroy();
      vi.useRealTimers();
    });
  });

  // ── Tournament sync helpers ───────────────────────────────
  describe('tournament sync helpers', () => {
    let mockWs;
    let OrigWebSocket;

    beforeEach(() => {
      mockWs = {
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      };
      OrigWebSocket = globalThis.WebSocket;
      globalThis.WebSocket = vi.fn(() => mockWs);
      globalThis.WebSocket.OPEN = 1;
    });

    afterEach(() => {
      globalThis.WebSocket = OrigWebSocket;
    });

    it('broadcastScore sends score_update event', () => {
      const sync = createTournamentSync('trn_test', {
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });

      // Connect
      mockWs.onopen();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply', ref: joinMsg.ref, payload: { status: 'ok' },
      })});

      mockWs.send.mockClear();
      sync.broadcastScore({ courtIdx: 2, matchIdx: 1, roundIdx: 3, score1: 21, score2: 18 });

      const msg = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(msg.payload.event).toBe('score_update');
      expect(msg.payload.payload.courtIdx).toBe(2);
      expect(msg.payload.payload.trnId).toBe('trn_test');
      expect(msg.payload.payload.ts).toBeGreaterThan(0);

      sync.destroy();
    });

    it('onScoreUpdate receives broadcast score events', () => {
      const handler = vi.fn();
      const sync = createTournamentSync('trn_recv', {
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });
      sync.onScoreUpdate(handler);

      // Connect
      mockWs.onopen();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply', ref: joinMsg.ref, payload: { status: 'ok' },
      })});

      // Receive score
      mockWs.onmessage({ data: JSON.stringify({
        event: 'broadcast',
        payload: { event: 'score_update', payload: { courtIdx: 0, score1: 21 } },
      })});

      expect(handler).toHaveBeenCalledWith({ courtIdx: 0, score1: 21 });
      sync.destroy();
    });

    it('onSnapshotRequest receives request_snapshot events', () => {
      const handler = vi.fn();
      const sync = createTournamentSync('trn_org', {
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });
      sync.onSnapshotRequest(handler);

      // Connect
      mockWs.onopen();
      const joinMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      mockWs.onmessage({ data: JSON.stringify({
        event: 'phx_reply', ref: joinMsg.ref, payload: { status: 'ok' },
      })});

      // Simulate incoming request_snapshot from a reconnecting viewer
      mockWs.onmessage({ data: JSON.stringify({
        event: 'broadcast',
        payload: { event: 'request_snapshot', payload: { reason: 'reconnect', ts: 123 } },
      })});

      expect(handler).toHaveBeenCalledWith({ reason: 'reconnect', ts: 123 });
      sync.destroy();
    });

    it('onSnapshotRequest is chainable', () => {
      const sync = createTournamentSync('trn_chain');
      const result = sync.onSnapshotRequest(() => {});
      expect(result).toBe(sync);
      sync.destroy();
    });
  });
});
