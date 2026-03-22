'use strict';

/**
 * shared/realtime.js — Real-time sync via Supabase Realtime (WebSocket).
 *
 * Provides live broadcasting of tournament state changes:
 * - Organizer inputs score → all viewers see it within 1-2 seconds
 * - Reconnects automatically on disconnect
 * - Falls back gracefully when realtime is unavailable
 *
 * Uses Supabase Realtime Broadcast channels (no RLS needed).
 *
 * ARCH A4.2
 */

// ── State ─────────────────────────────────────────────────────
let _ws = null;
let _channelTopic = null;
let _listeners = new Map(); // event → Set<callback>
let _config = null;
let _reconnectTimer = null;
let _reconnectDelay = 1000;
let _heartbeatTimer = null;
let _ref = 0;
let _joinRef = null;
let _connected = false;
let _destroyed = false;

const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_INTERVAL = 30000;

// ── Public API ────────────────────────────────────────────────

/**
 * Initialize realtime connection to a tournament channel.
 *
 * @param {object} opts
 * @param {string} opts.channelId - Unique channel identifier (e.g. tournament ID)
 * @param {string} [opts.supabaseUrl] - Supabase project URL
 * @param {string} [opts.supabaseAnonKey] - Supabase anon key
 * @param {function} [opts.onStatus] - Called with status string: 'connecting'|'connected'|'disconnected'|'error'
 * @returns {{ on, off, broadcast, destroy, isConnected }}
 */
function createRealtimeChannel(opts = {}) {
  const {
    channelId,
    supabaseUrl,
    supabaseAnonKey,
    onStatus,
  } = opts;

  if (!channelId) {
    console.warn('[realtime] No channelId provided');
    return _createNoopChannel();
  }

  // Resolve config from params or globals
  const url = supabaseUrl
    || (typeof globalThis.APP_CONFIG !== 'undefined' && globalThis.APP_CONFIG?.supabaseUrl)
    || (typeof globalThis.DEFAULT_SB_CONFIG !== 'undefined' && globalThis.DEFAULT_SB_CONFIG?.url)
    || '';
  const key = supabaseAnonKey
    || (typeof globalThis.APP_CONFIG !== 'undefined' && globalThis.APP_CONFIG?.supabaseAnonKey)
    || (typeof globalThis.DEFAULT_SB_CONFIG !== 'undefined' && globalThis.DEFAULT_SB_CONFIG?.anonKey)
    || '';

  if (!url || !key) {
    console.warn('[realtime] No Supabase credentials — realtime disabled');
    return _createNoopChannel();
  }

  // Build WebSocket URL: https://xxx.supabase.co → wss://xxx.supabase.co/realtime/v1/websocket
  const wsUrl = url
    .replace(/^http/, 'ws')
    .replace(/\/$/, '')
    + '/realtime/v1/websocket?apikey=' + encodeURIComponent(key) + '&vsn=1.0.0';

  const channel = {
    _ws: null,
    _topic: 'realtime:broadcast-' + channelId,
    _listeners: new Map(),
    _connected: false,
    _destroyed: false,
    _reconnectTimer: null,
    _reconnectDelay: 1000,
    _heartbeatTimer: null,
    _ref: 0,
    _joinRef: null,
    _hasConnectedOnce: false,
    _onStatus: onStatus || (() => {}),

    /** Subscribe to a broadcast event */
    on(event, callback) {
      if (!channel._listeners.has(event)) {
        channel._listeners.set(event, new Set());
      }
      channel._listeners.get(event).add(callback);
      return channel;
    },

    /** Unsubscribe from a broadcast event */
    off(event, callback) {
      const set = channel._listeners.get(event);
      if (set) {
        if (callback) set.delete(callback);
        else set.clear();
      }
      return channel;
    },

    /**
     * Broadcast an event to all channel subscribers.
     * @param {string} event - Event name (e.g. 'score_update', 'phase_change')
     * @param {object} payload - Arbitrary JSON payload
     */
    broadcast(event, payload) {
      if (!channel._connected || !channel._ws) return false;
      const msg = JSON.stringify({
        topic: channel._topic,
        event: 'broadcast',
        payload: { type: 'broadcast', event, payload },
        ref: String(++channel._ref),
      });
      try {
        channel._ws.send(msg);
        return true;
      } catch (e) {
        console.warn('[realtime] broadcast error:', e.message);
        return false;
      }
    },

    /** Check if currently connected */
    isConnected() {
      return channel._connected;
    },

    /** Destroy channel and close WebSocket */
    destroy() {
      channel._destroyed = true;
      channel._connected = false;
      clearTimeout(channel._reconnectTimer);
      clearInterval(channel._heartbeatTimer);
      if (channel._ws) {
        try { channel._ws.close(1000, 'destroy'); } catch (_) {}
        channel._ws = null;
      }
      channel._listeners.clear();
      channel._onStatus('disconnected');
    },
  };

  // Start connection
  _connect(channel, wsUrl, key);

  return channel;
}

// ── Internal: WebSocket connection ────────────────────────────

function _connect(ch, wsUrl, key) {
  if (ch._destroyed) return;
  ch._onStatus('connecting');

  try {
    ch._ws = new WebSocket(wsUrl);
  } catch (e) {
    console.warn('[realtime] WebSocket create error:', e.message);
    ch._onStatus('error');
    _scheduleReconnect(ch, wsUrl, key);
    return;
  }

  ch._ws.onopen = () => {
    ch._reconnectDelay = 1000; // reset backoff
    // Join the channel
    ch._joinRef = String(++ch._ref);
    ch._ws.send(JSON.stringify({
      topic: ch._topic,
      event: 'phx_join',
      payload: { config: { broadcast: { self: false } } },
      ref: ch._joinRef,
    }));
    // Start heartbeat
    clearInterval(ch._heartbeatTimer);
    ch._heartbeatTimer = setInterval(() => {
      if (ch._ws && ch._ws.readyState === WebSocket.OPEN) {
        ch._ws.send(JSON.stringify({
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: String(++ch._ref),
        }));
      }
    }, HEARTBEAT_INTERVAL);
  };

  ch._ws.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch (_) { return; }

    // Join reply
    if (msg.event === 'phx_reply' && msg.ref === ch._joinRef) {
      if (msg.payload?.status === 'ok') {
        const isReconnect = ch._hasConnectedOnce;
        ch._connected = true;
        ch._hasConnectedOnce = true;
        ch._onStatus('connected');
        console.log('[realtime] joined channel:', ch._topic, isReconnect ? '(reconnect)' : '(first)');
        // After reconnect, request a snapshot from the organizer
        if (isReconnect) {
          ch.broadcast('request_snapshot', { reason: 'reconnect', ts: Date.now() });
          _emit(ch, '_reconnected', {});
        }
      } else {
        console.warn('[realtime] join failed:', msg.payload);
        ch._onStatus('error');
      }
      return;
    }

    // Broadcast message
    if (msg.event === 'broadcast' && msg.payload) {
      const { event, payload } = msg.payload;
      if (event) {
        _emit(ch, event, payload);
      }
    }
  };

  ch._ws.onclose = (evt) => {
    ch._connected = false;
    clearInterval(ch._heartbeatTimer);
    if (!ch._destroyed) {
      ch._onStatus('disconnected');
      _scheduleReconnect(ch, wsUrl, key);
    }
  };

  ch._ws.onerror = (evt) => {
    console.warn('[realtime] WebSocket error');
    ch._onStatus('error');
  };
}

function _scheduleReconnect(ch, wsUrl, key) {
  if (ch._destroyed) return;
  clearTimeout(ch._reconnectTimer);
  ch._reconnectTimer = setTimeout(() => {
    ch._reconnectDelay = Math.min(ch._reconnectDelay * 2, MAX_RECONNECT_DELAY);
    _connect(ch, wsUrl, key);
  }, ch._reconnectDelay);
}

function _emit(ch, event, payload) {
  const set = ch._listeners.get(event);
  if (!set) return;
  for (const cb of set) {
    try { cb(payload); } catch (e) { console.warn('[realtime] listener error:', e); }
  }
  // Also emit to wildcard listeners
  const all = ch._listeners.get('*');
  if (all) {
    for (const cb of all) {
      try { cb({ event, ...payload }); } catch (e) {}
    }
  }
}

// ── Noop channel (when credentials unavailable) ───────────────

function _createNoopChannel() {
  return {
    on() { return this; },
    off() { return this; },
    broadcast() { return false; },
    isConnected() { return false; },
    destroy() {},
  };
}

// ── Convenience: tournament sync helpers ──────────────────────

/**
 * Create a tournament realtime sync helper.
 * Wraps createRealtimeChannel with tournament-specific events.
 *
 * @param {string} trnId - Tournament ID
 * @param {object} [opts] - Options passed to createRealtimeChannel
 * @returns {object} { channel, broadcastScore, broadcastPhase, onScoreUpdate, onPhaseChange, destroy }
 */
function createTournamentSync(trnId, opts = {}) {
  const channel = createRealtimeChannel({
    channelId: 'trn_' + trnId,
    ...opts,
  });

  return {
    channel,

    /**
     * Broadcast a score update.
     * @param {{ courtIdx: number, matchIdx: number, roundIdx: number, score1: number, score2: number }} data
     */
    broadcastScore(data) {
      return channel.broadcast('score_update', {
        trnId,
        ...data,
        ts: Date.now(),
      });
    },

    /**
     * Broadcast a phase change (e.g. stage1 → divisions).
     * @param {{ phase: string, data?: object }} info
     */
    broadcastPhase(info) {
      return channel.broadcast('phase_change', {
        trnId,
        ...info,
        ts: Date.now(),
      });
    },

    /**
     * Broadcast full state snapshot (for late joiners / reconnect).
     * @param {object} state - Full tournament state
     */
    broadcastSnapshot(state) {
      return channel.broadcast('snapshot', {
        trnId,
        state,
        ts: Date.now(),
      });
    },

    /** Subscribe to score updates */
    onScoreUpdate(cb) {
      channel.on('score_update', cb);
      return this;
    },

    /** Subscribe to phase changes */
    onPhaseChange(cb) {
      channel.on('phase_change', cb);
      return this;
    },

    /** Subscribe to full state snapshots */
    onSnapshot(cb) {
      channel.on('snapshot', cb);
      return this;
    },

    /**
     * Subscribe to snapshot requests (organizer-side).
     * Called when a viewer reconnects and needs the current state.
     * The callback should respond by calling broadcastSnapshot(currentState).
     * @param {function} cb
     */
    onSnapshotRequest(cb) {
      channel.on('request_snapshot', cb);
      return this;
    },

    /** Check connection status */
    isConnected() {
      return channel.isConnected();
    },

    /** Clean up */
    destroy() {
      channel.destroy();
    },
  };
}

// ── GlobalThis bridge ─────────────────────────────────────────

const _api = { createRealtimeChannel, createTournamentSync };

if (typeof globalThis !== 'undefined') {
  globalThis.sharedRealtime = _api;
}

export { createRealtimeChannel, createTournamentSync };
export default _api;
