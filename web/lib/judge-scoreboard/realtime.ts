import sharedRealtimeApi from '../../public/shared/realtime.js';

export interface JudgeRealtimeEnvelope<T = unknown> {
  courtId: string;
  senderId: string;
  type: string;
  payload: T;
  ts: number;
}

interface SharedRealtimeChannel {
  on: (event: string, callback: (payload: unknown) => void) => SharedRealtimeChannel;
  off: (event: string, callback?: (payload: unknown) => void) => SharedRealtimeChannel;
  broadcast: (event: string, payload: unknown) => boolean;
  isConnected: () => boolean;
  destroy: () => void;
}

interface SharedRealtimeApi {
  createRealtimeChannel: (opts: {
    channelId: string;
    onStatus?: (status: string) => void;
  }) => SharedRealtimeChannel;
}

type StatusHandler = (connected: boolean) => void;

function getSharedRealtime(): SharedRealtimeApi | null {
  const imported = sharedRealtimeApi as unknown as SharedRealtimeApi | undefined;
  if (imported && typeof imported.createRealtimeChannel === 'function') {
    return imported;
  }
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { sharedRealtime?: SharedRealtimeApi }).sharedRealtime;
  return api ?? null;
}

export function createJudgeRealtimeChannel(
  courtId: string,
  senderId: string,
  onMessage: (message: JudgeRealtimeEnvelope) => void,
  onStatus?: StatusHandler,
): { send: (type: string, payload: unknown) => void; destroy: () => void } {
  if (typeof window === 'undefined') {
    return { send: () => undefined, destroy: () => undefined };
  }

  const room = `judge_scoreboard_${courtId}`;
  const bcName = `lp:judge-scoreboard:bc:${courtId}`;
  const bc = 'BroadcastChannel' in window ? new window.BroadcastChannel(bcName) : null;
  let realtime: SharedRealtimeChannel | null = null;

  const deliver = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as Partial<JudgeRealtimeEnvelope>;
    if (msg.courtId !== courtId || msg.senderId === senderId || typeof msg.type !== 'string') return;
    onMessage({
      courtId,
      senderId: String(msg.senderId || ''),
      type: msg.type,
      payload: msg.payload,
      ts: Number(msg.ts || Date.now()),
    });
  };

  if (bc) {
    bc.onmessage = (event) => deliver(event.data);
  }

  const sharedRealtime = getSharedRealtime();
  if (sharedRealtime) {
    realtime = sharedRealtime.createRealtimeChannel({
      channelId: room,
      onStatus: (status) => onStatus?.(status === 'connected'),
    });
    realtime.on('judge_event', (payload) => deliver(payload));
  } else {
    onStatus?.(false);
  }

  const send = (type: string, payload: unknown) => {
    const envelope: JudgeRealtimeEnvelope = {
      courtId,
      senderId,
      type,
      payload,
      ts: Date.now(),
    };
    if (bc) {
      try {
        bc.postMessage(envelope);
      } catch {
        // ignore
      }
    }
    realtime?.broadcast('judge_event', envelope);
  };

  const destroy = () => {
    if (bc) {
      try {
        bc.close();
      } catch {
        // ignore
      }
    }
    realtime?.destroy();
  };

  return { send, destroy };
}
