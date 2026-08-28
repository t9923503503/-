'use client';

import Link from 'next/link';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyNoTakeoversPairPoint, calcKotcNextRaundStandings } from '@/lib/kotc-next/core';
import { resolveKotcNextRotatingPairLabel } from '@/lib/kotc-next/pair-rotation';
import type {
  KotcNextJudgeSnapshot,
  KotcNextPairLiveState,
  KotcNextScoreFeedback,
  KotcNextZoneKey,
} from '@/lib/kotc-next/types';
import { useScreenWakeLock } from '@/components/kotc-live/wake-lock';

type JudgeAction = 'start' | 'king-point' | 'takeover' | 'undo' | 'finish' | 'reset';
type ManualSlot = 'king' | 'challenger';
type ManualDirection = 'prev' | 'next';
type PendingAction =
  | JudgeAction
  | 'manual-king-prev'
  | 'manual-king-next'
  | 'manual-challenger-prev'
  | 'manual-challenger-next'
  | `pair-point-${number}`;
type ToastTone = 'info' | 'success' | 'error';

interface ToastState {
  tone: ToastTone;
  message: string;
}

interface JudgeUiPrefs {
  showStandings: boolean;
  showArrowHelp: boolean;
  showScoreHistory: boolean;
  voiceEnabled: boolean;
  standingsTab: JudgeStandingsTab;
}

const KOTC_JUDGE_APP_VERSION = 'kotcn-judge-v3';

function getOrCreateJudgeDeviceId(pin: string): string {
  const key = `lpvolley:kotcn:device:${pin}`;
  const existing = window.localStorage.getItem(key);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const created = typeof window.crypto.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
        const value = window.crypto.getRandomValues(new Uint8Array(1))[0] % 16;
        return (token === 'x' ? value : (value & 0x3) | 0x8).toString(16);
      });
  window.localStorage.setItem(key, created);
  return created;
}

function createScoreCommandId(): string {
  if (typeof window.crypto.randomUUID === 'function') return `score:${window.crypto.randomUUID()}`;
  return `score:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function createUndoCommandId(): string {
  if (typeof window.crypto.randomUUID === 'function') return `undo:${window.crypto.randomUUID()}`;
  return `undo:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

type JudgeSound = 'score' | 'error' | 'countdown' | 'minute-warning' | 'last-20' | 'stop';
type JudgeStandingsTab = 'pairs' | 'men' | 'women';
type JudgeZoneFilter = 'all' | KotcNextZoneKey;

function scheduleTone(
  context: AudioContext,
  {
    startAt,
    duration,
    frequency,
    endFrequency = frequency,
    gain,
    type,
  }: {
    startAt: number;
    duration: number;
    frequency: number;
    endFrequency?: number;
    gain: number;
    type: OscillatorType;
  },
) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), startAt + duration);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(gain, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function toneClasses(tone: ToastTone): string {
  if (tone === 'success') return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100';
  if (tone === 'error') return 'border-red-400/30 bg-red-500/15 text-red-100';
  return 'border-amber-400/30 bg-amber-500/15 text-amber-100';
}

function connectionClasses(online: boolean): string {
  return online
    ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
    : 'border-red-400/25 bg-red-500/15 text-red-100';
}

function roundTabClasses(active: boolean, available: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!available) return 'border-white/10 bg-white/5 text-white/28';
  return 'border-[#2a2a44] bg-[#161625] text-[#c6cad6] hover:border-[#5a5a8e]';
}

function courtTabClasses(active: boolean, available: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!available) return 'border-white/10 bg-white/5 text-white/28';
  return 'border-[#2a2a44] bg-[#1a1a2d] text-[#c6cad6] hover:border-[#5a5a8e]';
}

function formatVariant(variant: string): string {
  const normalized = String(variant || '').trim().toUpperCase();
  if (normalized === 'MM' || normalized === 'WW' || normalized === 'MN') return normalized;
  return 'MF';
}

function resolvePairDisplayNames(
  snapshot: KotcNextJudgeSnapshot,
  pairIdx: number,
): { primary: string; secondary: string; fallback: string } {
  const pair = snapshot.pairs.find((item) => item.pairIdx === pairIdx) ?? null;
  if (!pair) {
    const fallback = `#${pairIdx + 1}`;
    return { primary: fallback, secondary: '', fallback };
  }

  const fallback = restoreUtf8FromCp1251Mojibake(pair.label || `Pair ${pairIdx + 1}`);
  const primary = restoreUtf8FromCp1251Mojibake(pair.primaryPlayer?.name || '').trim();
  const secondary = restoreUtf8FromCp1251Mojibake(pair.secondaryPlayer?.name || '').trim();
  const rotatingLabel = resolveKotcNextRotatingPairLabel(
    snapshot.pairs,
    pairIdx,
    snapshot.variant,
    snapshot.liveState.currentRaundNo,
  );
  const [rotatingPrimary = primary, rotatingSecondary = ''] = rotatingLabel
    .split('/')
    .map((value) => restoreUtf8FromCp1251Mojibake(value).trim());
  if ((snapshot.roundType === 'r1' || snapshot.roundType === 'r2') && rotatingSecondary) {
    return { primary: rotatingPrimary, secondary: rotatingSecondary, fallback };
  }
  return { primary, secondary, fallback };
}

function draftKey(pin: string): string {
  return `kotcn:judge:${String(pin || '').trim().toUpperCase()}`;
}

function uiPrefsKey(pin: string): string {
  return `kotcn:judge-ui:${String(pin || '').trim().toUpperCase()}`;
}

function vibrate(ms: number): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(ms);
  } catch {
    // ignore unsupported/blocked haptics
  }
}

const CP1251_EXTENDED_CHARS =
  'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕї';
const UTF8_AS_CP1251_PATTERN = /(?:Р[Ѐ-ӿ]|С[Ѐ-ӿ]|вЂ|В·|В«|В»|В№)/;

function cp1251ByteForChar(char: string): number | null {
  const code = char.charCodeAt(0);
  if (code < 0x80) return code;
  if (code >= 0x0410 && code <= 0x044F) return code - 0x0410 + 0xC0;
  const extendedIndex = CP1251_EXTENDED_CHARS.indexOf(char);
  return extendedIndex >= 0 ? 0x80 + extendedIndex : null;
}

function restoreUtf8FromCp1251Mojibake(value: string): string {
  const text = String(value || '');
  if (!UTF8_AS_CP1251_PATTERN.test(text)) return text;
  const bytes: number[] = [];
  for (const char of text) {
    const byte = cp1251ByteForChar(char);
    if (byte == null) return text;
    bytes.push(byte);
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return decoded && decoded !== text ? decoded : text;
  } catch {
    return text;
  }
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTournamentMeta(snapshot: KotcNextJudgeSnapshot): string {
  const tournamentName = restoreUtf8FromCp1251Mojibake(snapshot.tournamentName);
  const rawDate = String(snapshot.tournamentDate || '').trim();
  const rawTime = String(snapshot.tournamentTime || '').trim();
  const dateSource = rawTime ? `${rawDate}T${rawTime}` : rawDate;
  const parsed = new Date(dateSource);
  const hasDate = rawDate.length > 0;
  if (hasDate && Number.isFinite(parsed.getTime())) {
    const dateText = new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(parsed);
    const timeText = rawTime
      ? new Intl.DateTimeFormat('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(parsed)
      : '';
    return [tournamentName, dateText, timeText].filter(Boolean).join(' · ');
  }
  return [tournamentName, rawDate, rawTime.slice(0, 5)].filter(Boolean).join(' · ');
}

function getPairShortLabel(snapshot: KotcNextJudgeSnapshot, pairIdx: number): string {
  const resolved = resolvePairDisplayNames(snapshot, pairIdx);
  const names = [
    resolved.primary,
    resolved.secondary,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => value.split(/\s+/)[0] || value)
    .map((value) => value.slice(0, 10));
  if (!names.length) return resolved.fallback.slice(0, 18);
  return names.join(' / ');
}

function snapshotProgressScore(snapshot: KotcNextJudgeSnapshot): number {
  const aggregateStats = snapshot.liveState.pairs.reduce(
    (total, pair) => total + pair.kingWins + pair.takeovers + pair.gamesPlayed,
    0,
  );
  const statusScore =
    snapshot.liveState.status === 'running' ? 3 : snapshot.liveState.status === 'finished' ? 2 : 1;
  const startedAtScore = snapshot.liveState.timerStartedAt ? 1 : 0;
  return (
    snapshot.liveState.currentRaundNo * 1000 +
    aggregateStats * 10 +
    snapshot.liveState.queueOrder.length +
    statusScore +
    startedAtScore
  );
}

function readStoredDraft(pin: string): KotcNextJudgeSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftKey(pin));
    if (!raw) return null;
    return JSON.parse(raw) as KotcNextJudgeSnapshot;
  } catch {
    return null;
  }
}

function clearStoredDraft(pin: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(draftKey(pin));
  } catch {
    // ignore storage errors
  }
}

function shouldPreferLocalDraft(
  localSnapshot: KotcNextJudgeSnapshot | null,
  serverSnapshot: KotcNextJudgeSnapshot,
): localSnapshot is KotcNextJudgeSnapshot {
  if (!localSnapshot) return false;
  if (localSnapshot.pinCode !== serverSnapshot.pinCode) return false;
  if (localSnapshot.currentRaundInstanceKey !== serverSnapshot.currentRaundInstanceKey) return false;
  if (localSnapshot.liveState.status === 'finished') return false;
  if (localSnapshot.currentRaundRevision !== serverSnapshot.currentRaundRevision) {
    return localSnapshot.currentRaundRevision > serverSnapshot.currentRaundRevision;
  }
  return snapshotProgressScore(localSnapshot) > snapshotProgressScore(serverSnapshot);
}

function readUiPrefs(pin: string): JudgeUiPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(uiPrefsKey(pin));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JudgeUiPrefs> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      showStandings: parsed.showStandings === true,
      showArrowHelp: parsed.showArrowHelp !== false,
      showScoreHistory: parsed.showScoreHistory === true,
      voiceEnabled: parsed.voiceEnabled === true,
      standingsTab:
        parsed.standingsTab === 'men' || parsed.standingsTab === 'women' || parsed.standingsTab === 'pairs'
          ? parsed.standingsTab
          : 'pairs',
    };
  } catch {
    return null;
  }
}

function formatEventClock(playedAt: string): string {
  const parsed = new Date(playedAt);
  if (!Number.isFinite(parsed.getTime())) return '--:--:--';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parsed);
}

function formatKingRunOrder(pair: KotcNextPairLiveState): string {
  const order = pair.firstLongestKingRunOrder ?? null;
  return pair.longestKingRun && order ? `#${order}` : '';
}

function pairLabel(snapshot: KotcNextJudgeSnapshot, pairIdx: number): string {
  const resolved = resolvePairDisplayNames(snapshot, pairIdx);
  const names = [resolved.primary, resolved.secondary]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return names.length ? names.join(' / ') : resolved.fallback;
}

function pairStat(snapshot: KotcNextJudgeSnapshot, pairIdx: number): KotcNextPairLiveState | null {
  return snapshot.liveState.pairs.find((pair) => pair.pairIdx === pairIdx) ?? null;
}

function getAccessibleRaundNos(snapshot: KotcNextJudgeSnapshot): Set<number> {
  if (Array.isArray(snapshot.accessibleRaundNos)) {
    return new Set(snapshot.accessibleRaundNos);
  }
  const alreadyOpened = snapshot.raundHistory
    .filter((entry) => entry.status !== 'pending')
    .map((entry) => entry.raundNo);
  if (alreadyOpened.length) return new Set(alreadyOpened);
  return new Set(snapshot.raundHistory.slice(0, 1).map((entry) => entry.raundNo));
}

function describeEvent(snapshot: KotcNextJudgeSnapshot, event: KotcNextJudgeSnapshot['currentEvents'][number]): string {
  const king = pairLabel(snapshot, event.kingPairIdx);
  const challenger = pairLabel(snapshot, event.challengerPairIdx);
  return event.eventType === 'takeover'
    ? `${challenger} забрал трон у ${king}`
    : `${king} взял очко против ${challenger}`;
}

function formatRoundType(roundType: string): string {
  return String(roundType || '').trim().toUpperCase() === 'R2' ? 'ТУР 2' : 'ТУР 1';
}

function formatRoundStatus(status: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'running') return 'LIVE';
  if (normalized === 'paused') return 'ПАУЗА';
  if (normalized === 'countdown') return 'COUNTDOWN';
  if (normalized === 'finished') return 'FINISH';
  return 'WAIT';
}

function standingsTabLabel(tab: JudgeStandingsTab): string {
  if (tab === 'men') return 'М';
  if (tab === 'women') return 'Ж';
  return 'Пары';
}

function standingsTabDescription(tab: JudgeStandingsTab): string {
  if (tab === 'men') return 'Общее количество очков по всем мужским игрокам выбранного тура.';
  if (tab === 'women') return 'Общее количество очков по всем женским игрокам выбранного тура.';
  return 'Статистика пар за выбранный раунд: очки считаются только в том составе, где игроки вместе.';
}

function standingsTabButtonClasses(active: boolean): string {
  return `rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition sm:px-4 sm:py-2 sm:text-xs ${
    active
      ? 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]'
      : 'border-white/10 bg-white/5 text-white/78 hover:border-white/20 hover:bg-white/10'
  }`;
}

function zoneFilterLabel(zone: JudgeZoneFilter): string {
  if (zone === 'kin') return 'ХАРД';
  if (zone === 'advance') return 'АДАНС';
  if (zone === 'medium') return 'МЕДИУМ';
  if (zone === 'lite') return 'ЛАЙТ';
  return 'ВСЕ';
}

function formatAggregateCourtLabel(label: string, courtNo: number): string {
  const normalizedLabel = restoreUtf8FromCp1251Mojibake(String(label || '')).trim();
  return normalizedLabel || `Корт ${courtNo}`;
}

function formatCourtTabLabel(label: string, courtNo: number): string {
  return restoreUtf8FromCp1251Mojibake(label).trim().toUpperCase() || `K${courtNo}`;
}

function manualActionKey(slot: ManualSlot, direction: ManualDirection): PendingAction {
  return `manual-${slot}-${direction}` as PendingAction;
}

async function requestJudgeAction(
  pin: string,
  raundNo: number,
  action: JudgeAction,
  body?: Record<string, unknown>,
): Promise<KotcNextJudgeSnapshot> {
  const response = await fetch(
    `/api/kotc-next/judge/${encodeURIComponent(pin)}/raund/${raundNo}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: KotcNextJudgeSnapshot;
  };
  if (!response.ok || !payload.snapshot) {
    throw new Error(payload.error || 'KOTC Next judge action failed');
  }
  return payload.snapshot;
}

function withRaundParam(href: string, raundNo: number): string {
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}raund=${encodeURIComponent(String(raundNo))}`;
}

async function requestJudgeSnapshot(pin: string, raundNo?: number): Promise<KotcNextJudgeSnapshot> {
  const query = Number.isInteger(raundNo) ? `?raund=${encodeURIComponent(String(raundNo))}` : '';
  const response = await fetch(`/api/kotc-next/judge/${encodeURIComponent(pin)}${query}`, { cache: 'no-store' });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: KotcNextJudgeSnapshot;
  };
  if (!response.ok || !payload.snapshot) {
    throw new Error(payload.error || 'KOTC Next judge snapshot failed');
  }
  return payload.snapshot;
}

async function requestJudgeHeartbeat(
  pin: string,
  body: { deviceId: string; selectedRaundNo: number; knownRevision: number },
) {
  const response = await fetch(`/api/kotc-next/judge/${encodeURIComponent(pin)}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      appVersion: KOTC_JUDGE_APP_VERSION,
      platform: window.navigator.platform || null,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    serverNow?: number;
    revision?: number;
    requiresSnapshot?: boolean;
  };
  if (!response.ok || !Number.isFinite(payload.serverNow)) {
    throw new Error(payload.error || 'KOTC Next heartbeat failed');
  }
  return payload as { serverNow: number; revision: number; requiresSnapshot: boolean };
}

async function requestManualPairAction(
  pin: string,
  raundNo: number,
  slot: ManualSlot,
  direction: ManualDirection,
): Promise<KotcNextJudgeSnapshot> {
  const response = await fetch(
    `/api/kotc-next/judge/${encodeURIComponent(pin)}/raund/${raundNo}/manual-pair`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, direction }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: KotcNextJudgeSnapshot;
  };
  if (!response.ok || !payload.snapshot) {
    throw new Error(payload.error || 'KOTC Next manual pair update failed');
  }
  return payload.snapshot;
}

async function requestResetRaundAction(
  pin: string,
  raundNo: number,
  password: string,
): Promise<KotcNextJudgeSnapshot> {
  const response = await fetch(
    `/api/kotc-next/judge/${encodeURIComponent(pin)}/raund/${raundNo}/reset`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: KotcNextJudgeSnapshot;
  };
  if (!response.ok || !payload.snapshot) {
    throw new Error(payload.error || 'KOTC Next judge reset failed');
  }
  return payload.snapshot;
}

async function requestNoTakeoversPairPointAction(
  pin: string,
  raundNo: number,
  pairIdx: number,
  input: { deviceId: string; commandId: string; expectedRevision: number },
): Promise<{ snapshot: KotcNextJudgeSnapshot; feedback: KotcNextScoreFeedback }> {
  const response = await fetch(
    `/api/kotc-next/judge/${encodeURIComponent(pin)}/raund/${raundNo}/pair-point`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairIdx, ...input }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: KotcNextJudgeSnapshot;
    feedback?: KotcNextScoreFeedback;
  };
  if (!response.ok || !payload.snapshot || !payload.feedback) {
    throw new Error(payload.error || 'KOTC Next pair point failed');
  }
  return { snapshot: payload.snapshot, feedback: payload.feedback };
}

function ManualArrowButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/20 text-xl font-black text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 sm:h-12 sm:w-12 sm:text-2xl"
    >
      {label.includes('влево') ? '←' : '→'}
    </button>
  );
}

export function KotcNextJudgeScreen({
  initialSnapshot,
}: {
  initialSnapshot: KotcNextJudgeSnapshot;
}) {
  const router = useRouter();
  const audioContextRef = useRef<AudioContext | null>(null);
  const restoredDraftPinRef = useRef<string | null>(null);
  const countdownSecondRef = useRef<number | null>(null);
  const timerAlertKeyRef = useRef<string | null>(null);
  const clockOffsetRef = useRef(initialSnapshot.serverNow - Date.now());
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [submitting, setSubmitting] = useState<PendingAction | null>(null);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now() + clockOffsetRef.current);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [showStandings, setShowStandings] = useState(false);
  const [showArrowHelp, setShowArrowHelp] = useState(true);
  const [showScoreHistory, setShowScoreHistory] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [standingsTab, setStandingsTab] = useState<JudgeStandingsTab>('pairs');
  const [standingsZoneFilter, setStandingsZoneFilter] = useState<JudgeZoneFilter>('all');
  const [pendingConfirm, setPendingConfirm] = useState<'start' | 'finish' | 'reset' | 'undo' | `pair-undo-${number}` | null>(null);

  useScreenWakeLock(true);

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setRestoredDraft(false);
  }, [initialSnapshot]);

  useEffect(() => {
    const prefs = readUiPrefs(initialSnapshot.pinCode);
    if (!prefs) return;
    setShowStandings(prefs.showStandings);
    setShowArrowHelp(prefs.showArrowHelp);
    setShowScoreHistory(prefs.showScoreHistory);
    setVoiceEnabled(prefs.voiceEnabled);
    setStandingsTab(prefs.standingsTab);
  }, [initialSnapshot.pinCode]);

  useEffect(() => {
    if (restoredDraftPinRef.current === initialSnapshot.pinCode) return;
    const localDraft = readStoredDraft(initialSnapshot.pinCode);
    if (!shouldPreferLocalDraft(localDraft, initialSnapshot)) return;

    restoredDraftPinRef.current = initialSnapshot.pinCode;
    setSnapshot(localDraft);
    setRestoredDraft(true);
    setToast({
      tone: 'info',
      message: 'Восстановлен локальный черновик судьи. Обновляем данные сервера…',
    });
    if (typeof window !== 'undefined' && window.navigator.onLine) {
      startTransition(() => router.refresh());
    }
  }, [initialSnapshot, router]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.add('judge-workspace');
    return () => {
      document.body.classList.remove('judge-workspace');
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncOnline = () => setOnline(window.navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setInterval(() => setNowTs(Date.now() + clockOffsetRef.current), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const deviceId = getOrCreateJudgeDeviceId(snapshot.pinCode);
    const syncHeartbeat = async () => {
      if (submitting || document.visibilityState === 'hidden') return;
      const sentAt = Date.now();
      try {
        const heartbeat = await requestJudgeHeartbeat(snapshot.pinCode, {
          deviceId,
          selectedRaundNo: snapshot.selectedRaundNo,
          knownRevision: snapshot.currentRaundRevision,
        });
        if (cancelled) return;
        const receivedAt = Date.now();
        clockOffsetRef.current = heartbeat.serverNow - (sentAt + (receivedAt - sentAt) / 2);
        setNowTs(Date.now() + clockOffsetRef.current);
        setOnline(true);
        if (heartbeat.requiresSnapshot) {
          const next = await requestJudgeSnapshot(snapshot.pinCode, snapshot.selectedRaundNo);
          if (!cancelled) setSnapshot((current) => (shouldPreferLocalDraft(current, next) ? current : next));
        }
      } catch {
        if (!cancelled) setOnline(window.navigator.onLine);
      }
    };
    void syncHeartbeat();
    const timer = window.setInterval(() => {
      void syncHeartbeat();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [snapshot.currentRaundRevision, snapshot.pinCode, snapshot.selectedRaundNo, submitting]);

  useEffect(() => {
    return () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (!context) return;
      void context.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldDropDraft =
      snapshot.liveState.status === 'finished' ||
      (snapshot.liveState.status === 'pending' && snapshot.currentEvents.length === 0);

    if (shouldDropDraft) {
      clearStoredDraft(snapshot.pinCode);
      return;
    }

    window.localStorage.setItem(draftKey(snapshot.pinCode), JSON.stringify(snapshot));
  }, [snapshot]);

  useEffect(() => {
    if (!toast || typeof window === 'undefined') return;
    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!pendingConfirm || typeof window === 'undefined') return;
    const timeoutId = window.setTimeout(() => setPendingConfirm(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingConfirm]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      uiPrefsKey(snapshot.pinCode),
      JSON.stringify({ showStandings, showArrowHelp, showScoreHistory, voiceEnabled, standingsTab } satisfies JudgeUiPrefs),
    );
  }, [showStandings, showArrowHelp, showScoreHistory, voiceEnabled, standingsTab, snapshot.pinCode]);

  const timerDurationMs = snapshot.liveState.timerMinutes * 60 * 1000;
  const timerStartMs = useMemo(() => {
    if (!snapshot.liveState.timerStartedAt) return null;
    const startedAt = new Date(snapshot.liveState.timerStartedAt).getTime();
    return Number.isFinite(startedAt) ? startedAt : null;
  }, [snapshot.liveState.timerStartedAt]);
  const effectiveNowTs = snapshot.liveState.status === 'paused' && snapshot.liveState.timerPausedAt
    ? new Date(snapshot.liveState.timerPausedAt).getTime()
    : nowTs;
  const startCountdownMs = timerStartMs ? Math.max(0, timerStartMs - effectiveNowTs) : 0;
  const remainingMs = timerStartMs ? Math.max(0, timerStartMs + timerDurationMs - effectiveNowTs) : timerDurationMs;

  const standings = useMemo(
    () => calcKotcNextRaundStandings(snapshot.liveState.pairs, snapshot.params.takeoversMode),
    [snapshot.liveState.pairs, snapshot.params.takeoversMode],
  );
  const aggregatePairStandings = snapshot.aggregateStandings.pairs;
  const aggregateMenStandings = snapshot.aggregateStandings.men;
  const aggregateWomenStandings = snapshot.aggregateStandings.women;
  const availableStandingsZones = useMemo(() => {
    const rows = standingsTab === 'pairs' ? aggregatePairStandings : standingsTab === 'men' ? aggregateMenStandings : aggregateWomenStandings;
    const present = new Set(rows.map((row) => row.zone).filter((zone): zone is KotcNextZoneKey => zone != null));
    return (['kin', 'advance', 'medium', 'lite'] as const).filter((zone) => present.has(zone));
  }, [aggregateMenStandings, aggregatePairStandings, aggregateWomenStandings, standingsTab]);
  const aggregatePairStandingsFiltered = useMemo(
    () =>
      standingsZoneFilter === 'all'
        ? aggregatePairStandings
        : aggregatePairStandings.filter((row) => row.zone === standingsZoneFilter),
    [aggregatePairStandings, standingsZoneFilter],
  );
  const aggregatePlayerStandings = useMemo(() => {
    const rows = standingsTab === 'men' ? aggregateMenStandings : aggregateWomenStandings;
    return standingsZoneFilter === 'all' ? rows : rows.filter((row) => row.zone === standingsZoneFilter);
  }, [aggregateMenStandings, aggregateWomenStandings, standingsTab, standingsZoneFilter]);

  useEffect(() => {
    if (standingsZoneFilter !== 'all' && !availableStandingsZones.includes(standingsZoneFilter)) {
      setStandingsZoneFilter('all');
    }
  }, [availableStandingsZones, standingsZoneFilter]);

  const queueCards = useMemo(
    () => [snapshot.liveState.kingPairIdx, snapshot.liveState.challengerPairIdx, ...snapshot.liveState.queueOrder],
    [snapshot.liveState.challengerPairIdx, snapshot.liveState.kingPairIdx, snapshot.liveState.queueOrder],
  );

  const noTakeoversPairCards = useMemo(
    () =>
      queueCards
        .map((pairIdx) => snapshot.liveState.pairs.find((pair) => pair.pairIdx === pairIdx) ?? null)
        .filter((pair): pair is KotcNextPairLiveState => pair != null),
    [queueCards, snapshot.liveState.pairs],
  );

  const selectedRoundNav = useMemo(
    () => snapshot.roundNav.find((round) => round.isSelected) ?? snapshot.roundNav[0] ?? null,
    [snapshot.roundNav],
  );
  const accessibleRaundNos = useMemo(() => getAccessibleRaundNos(snapshot), [snapshot]);

  const canStart = false;
  const canPlay = snapshot.liveState.status === 'running';
  const selfScoringActive =
    snapshot.params.selfScoringEnabled && snapshot.params.takeoversMode === 'no_takeovers';
  const isStartCountdown = snapshot.liveState.displayStatus === 'countdown' || (canPlay && startCountdownMs > 0);
  const canScore = canPlay && !isStartCountdown;
  const canFinish = canPlay && !isStartCountdown && remainingMs === 0;
  const canManualAdjust = snapshot.liveState.status !== 'finished';
  const timerDisplayMs = isStartCountdown ? startCountdownMs : remainingMs;
  const timerDanger = canPlay && !isStartCountdown && remainingMs === 0;
  const timerWarning = canPlay && !isStartCountdown && remainingMs > 0 && remainingMs <= 30_000;
  const currentKing = pairLabel(snapshot, snapshot.liveState.kingPairIdx);
  const currentChallenger = pairLabel(snapshot, snapshot.liveState.challengerPairIdx);
  const kingStat = pairStat(snapshot, snapshot.liveState.kingPairIdx);
  const challengerStat = pairStat(snapshot, snapshot.liveState.challengerPairIdx);
  const scoreHistory = useMemo(
    () => [...snapshot.currentEvents].sort((left, right) => right.seqNo - left.seqNo),
    [snapshot.currentEvents],
  );
  const latestScoreEvent = scoreHistory[0] ?? null;
  const auditScoreHistory = snapshot.scoreHistory ?? [];
  const latestAuditScore = auditScoreHistory[0] ?? null;

  useEffect(() => {
    countdownSecondRef.current = null;
    timerAlertKeyRef.current = null;
  }, [snapshot.currentRaundInstanceKey]);

  useEffect(() => {
    if (!canPlay || !timerStartMs) {
      countdownSecondRef.current = null;
      timerAlertKeyRef.current = null;
      return;
    }

    if (isStartCountdown) {
      const countdownSecond = Math.ceil(startCountdownMs / 1000);
      if (countdownSecond > 0 && countdownSecond <= 10 && countdownSecondRef.current !== countdownSecond) {
        countdownSecondRef.current = countdownSecond;
        playJudgeSound('countdown');
        vibrate(countdownSecond <= 3 ? 40 : 18);
      }
      return;
    }

    countdownSecondRef.current = null;
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const alertKey = `${snapshot.currentRaundInstanceKey}:${remainingSeconds}`;
    if (remainingSeconds === 60 && timerAlertKeyRef.current !== alertKey) {
      timerAlertKeyRef.current = alertKey;
      playJudgeSound('minute-warning');
      vibrate(60);
      setToast({ tone: 'info', message: 'До конца раунда 1 минута.' });
      return;
    }
    if (remainingSeconds > 0 && remainingSeconds <= 20 && timerAlertKeyRef.current !== alertKey) {
      timerAlertKeyRef.current = alertKey;
      playJudgeSound('last-20');
      vibrate(30);
      return;
    }
    if (remainingMs === 0 && timerAlertKeyRef.current !== `${snapshot.currentRaundInstanceKey}:stop`) {
      timerAlertKeyRef.current = `${snapshot.currentRaundInstanceKey}:stop`;
      playJudgeSound('stop');
      vibrate(180);
      setToast({ tone: 'error', message: 'СТОП! Время раунда закончилось.' });
    }
  }, [canPlay, isStartCountdown, remainingMs, snapshot.currentRaundInstanceKey, startCountdownMs, timerStartMs]);

  function ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const existing = audioContextRef.current;
    if (existing) {
      if (existing.state === 'suspended') {
        void existing.resume().catch(() => {});
      }
      return existing;
    }
    const AudioContextCtor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const context = new AudioContextCtor();
    if (context.state === 'suspended') {
      void context.resume().catch(() => {});
    }
    audioContextRef.current = context;
    return context;
  }

  function playJudgeSound(sound: JudgeSound) {
    const context = ensureAudioContext();
    if (!context) return;
    const startAt = context.currentTime + 0.01;
    if (sound === 'countdown') {
      scheduleTone(context, { startAt, duration: 0.08, frequency: 980, endFrequency: 1160, gain: 0.08, type: 'square' });
      return;
    }
    if (sound === 'minute-warning') {
      scheduleTone(context, { startAt, duration: 0.18, frequency: 740, endFrequency: 740, gain: 0.1, type: 'sine' });
      scheduleTone(context, { startAt: startAt + 0.24, duration: 0.18, frequency: 740, endFrequency: 980, gain: 0.1, type: 'sine' });
      return;
    }
    if (sound === 'last-20') {
      scheduleTone(context, { startAt, duration: 0.14, frequency: 1240, endFrequency: 880, gain: 0.1, type: 'triangle' });
      return;
    }
    if (sound === 'stop') {
      scheduleTone(context, { startAt, duration: 0.45, frequency: 180, endFrequency: 90, gain: 0.2, type: 'sawtooth' });
      scheduleTone(context, { startAt: startAt + 0.48, duration: 0.34, frequency: 140, endFrequency: 70, gain: 0.18, type: 'square' });
      return;
    }
    if (sound === 'score') {
      scheduleTone(context, { startAt, duration: 0.09, frequency: 880, endFrequency: 1100, gain: 0.05, type: 'sine' });
      scheduleTone(context, { startAt: startAt + 0.08, duration: 0.12, frequency: 1320, endFrequency: 1560, gain: 0.04, type: 'triangle' });
      return;
    }
    scheduleTone(context, { startAt, duration: 0.18, frequency: 220, endFrequency: 140, gain: 0.16, type: 'square' });
    scheduleTone(context, { startAt: startAt + 0.12, duration: 0.22, frequency: 196, endFrequency: 122, gain: 0.18, type: 'sawtooth' });
  }

  function speakCourtMessage(message: string): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return false;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'ru-RU';
      utterance.rate = 1.08;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  function announceScore(feedback: KotcNextScoreFeedback) {
    if (!snapshot.params.scoreVoiceEnabled || !voiceEnabled) return;
    playJudgeSound('score');
    const spoken = speakCourtMessage(
      `${feedback.actorName}. Пара ${feedback.pairIdx + 1}. Плюс один. Всего ${feedback.scoreAfter}.`,
    );
    if (!spoken) {
      setToast({ tone: 'info', message: 'Голос недоступен на этом устройстве. Звуковой сигнал включён.' });
    }
  }

  function toggleScoreVoice() {
    if (!snapshot.params.scoreVoiceEnabled) return;
    if (voiceEnabled) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      setVoiceEnabled(false);
      setToast({ tone: 'info', message: 'Озвучивание очков выключено на этом устройстве.' });
      return;
    }
    ensureAudioContext();
    playJudgeSound('score');
    const spoken = speakCourtMessage('Звук включён.');
    setVoiceEnabled(true);
    setToast({
      tone: spoken ? 'success' : 'info',
      message: spoken
        ? 'Озвучивание очков включено.'
        : 'Голос недоступен. Останется короткий звуковой сигнал.',
    });
  }

  async function runAction(action: JudgeAction, body?: Record<string, unknown>) {
    if (submitting) return;
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setOnline(false);
      setToast({ tone: 'error', message: 'Нет сети. Дождитесь подключения и повторите действие.' });
      return;
    }

    if (action === 'start') {
      playJudgeSound('countdown');
      vibrate(35);
    }

    if (action === 'king-point' || action === 'takeover') {
      playJudgeSound('score');
      vibrate(35);
    }

    setSubmitting(action);
    try {
      const next = await requestJudgeAction(snapshot.pinCode, snapshot.liveState.currentRaundNo, action, body);
      setSnapshot(next);
      if (action === 'start' || action === 'finish' || action === 'undo') {
        vibrate(action === 'undo' ? 18 : 24);
      }
      setToast({
        tone: 'success',
        message:
          action === 'start'
            ? 'Раунд запущен. До старта 10 секунд.'
            : action === 'reset'
              ? 'Раунд сброшен.'
            : action === 'finish'
              ? 'Раунд завершён.'
              : action === 'undo'
                ? 'Последнее действие отменено.'
                : action === 'king-point'
                  ? 'Очко короля зафиксировано.'
                  : 'Смена короля зафиксирована.',
      });
      if (action === 'finish') {
        startTransition(() => router.refresh());
      }
    } catch (error) {
      setToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'KOTC Next judge action failed',
      });
    } finally {
      setSubmitting(null);
    }
  }

  async function runStartAction() {
    if (submitting || !canStart) return;
    if (pendingConfirm !== 'start') {
      setPendingConfirm('start');
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Запустить общий таймер на всех кортах через 10 секунд?')
    ) {
      setPendingConfirm(null);
      return;
    }
    setPendingConfirm(null);
    await runAction('start');
  }

  async function runUndoAction() {
    if (submitting || !snapshot.canUndo || !canPlay) return;
    if (
      selfScoringActive &&
      (!snapshot.viewer?.canSelfScore || snapshot.viewer.pairIdx !== latestScoreEvent?.kingPairIdx)
    ) {
      setToast({
        tone: 'error',
        message: snapshot.viewer
          ? 'Можно отменить только последнее очко своей пары.'
          : 'Войдите в аккаунт игрока, чтобы отменить своё последнее очко.',
      });
      return;
    }
    if (pendingConfirm !== 'undo') {
      setPendingConfirm('undo');
      return;
    }
    setPendingConfirm(null);
    await runAction('undo', {
      deviceId: getOrCreateJudgeDeviceId(snapshot.pinCode),
      commandId: createUndoCommandId(),
      expectedRevision: snapshot.currentRaundRevision,
    });
  }

  async function runManualPairAction(slot: ManualSlot, direction: ManualDirection) {
    if (submitting) return;
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setOnline(false);
      setToast({ tone: 'error', message: 'Нет сети. Ручная замена пары недоступна офлайн.' });
      return;
    }

    playJudgeSound('error');
    vibrate(18);
    const key = manualActionKey(slot, direction);
    setSubmitting(key);
    try {
      const next = await requestManualPairAction(snapshot.pinCode, snapshot.liveState.currentRaundNo, slot, direction);
      setSnapshot(next);
      setToast({
        tone: 'info',
        message:
          slot === 'king'
            ? 'Пара короля вручную переставлена.'
            : 'Пара претендента вручную переставлена.',
      });
    } catch (error) {
      setToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'KOTC Next manual pair update failed',
      });
    } finally {
      setSubmitting(null);
    }
  }

  async function runResetRaundAction() {
    setPendingConfirm(null);
    setToast({ tone: 'error', message: 'Сброс перенесён в KOTC Next Control Center и доступен только администратору.' });
  }

  async function runFinishAction() {
    if (submitting || !canFinish) return;
    if (pendingConfirm !== 'finish') {
      setPendingConfirm('finish');
      return;
    }
    setPendingConfirm(null);
    const confirmations = [
      `Финиш раунда ${snapshot.liveState.currentRaundNo} на ${snapshot.courtLabel}?`,
      'Результаты будут зафиксированы и попадут в таблицу.',
      'Последнее подтверждение: завершить раунд сейчас?',
    ];
    if (typeof window !== 'undefined') {
      for (const confirmationMessage of confirmations) {
        if (!window.confirm(confirmationMessage)) return;
      }
    }
    await runAction('finish');
  }

  async function runNoTakeoversPairPointAction(pairIdx: number) {
    if (submitting || !canScore) return;
    if (
      selfScoringActive &&
      (!snapshot.viewer?.canSelfScore || snapshot.viewer.pairIdx !== pairIdx)
    ) {
      setToast({
        tone: 'error',
        message: snapshot.viewer
          ? 'В самостоятельном режиме можно добавить очко только своей паре.'
          : 'Войдите в аккаунт игрока, чтобы добавить очко.',
      });
      return;
    }
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setOnline(false);
      setToast({ tone: 'error', message: 'Нет сети. Дождитесь подключения и повторите действие.' });
      return;
    }

    const key = `pair-point-${pairIdx}` as const;
    const previousSnapshot = snapshot;
    const expectedRevision = snapshot.currentRaundRevision;
    const optimisticLiveState = applyNoTakeoversPairPoint(snapshot.liveState, pairIdx);
    setSubmitting(key);
    setSnapshot({
      ...snapshot,
      liveState: {
        ...optimisticLiveState,
        revision: snapshot.liveState.revision + 1,
      },
      currentRaundRevision: expectedRevision + 1,
    });
    try {
      const result = await requestNoTakeoversPairPointAction(
        snapshot.pinCode,
        snapshot.liveState.currentRaundNo,
        pairIdx,
        {
          deviceId: getOrCreateJudgeDeviceId(snapshot.pinCode),
          commandId: createScoreCommandId(),
          expectedRevision,
        },
      );
      setSnapshot(result.snapshot);
      vibrate(35);
      announceScore(result.feedback);
      setToast({
        tone: 'success',
        message: `Пара ${result.feedback.pairIdx + 1}: +1 · ${result.feedback.scoreBefore} → ${result.feedback.scoreAfter}. Записал: ${result.feedback.actorName}.`,
      });
    } catch (error) {
      setSnapshot(previousSnapshot);
      void requestJudgeSnapshot(previousSnapshot.pinCode, previousSnapshot.selectedRaundNo)
        .then((freshSnapshot) => setSnapshot(freshSnapshot))
        .catch(() => {});
      setToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'KOTC Next pair point failed',
      });
    } finally {
      setSubmitting(null);
    }
  }

  async function runNoTakeoversPairUndoAction(pairIdx: number) {
    if (submitting || !snapshot.canUndo || !canScore) return;
    if (latestScoreEvent?.kingPairIdx !== pairIdx) {
      setToast({ tone: 'error', message: 'Отменить можно только последнее очко этой пары.' });
      return;
    }
    if (
      typeof window !== 'undefined' &&
      (!window.confirm(`Снять последнее очко у пары ${pairLabel(snapshot, pairIdx)}?`) ||
        !window.confirm('Последнее подтверждение: отменить это очко сейчас?'))
    ) {
      return;
    }
    await runAction('undo', {
      deviceId: getOrCreateJudgeDeviceId(snapshot.pinCode),
      commandId: createUndoCommandId(),
      expectedRevision: snapshot.currentRaundRevision,
    });
  }

  if (snapshot.params.takeoversMode === 'no_takeovers') {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(255,210,0,0.16),transparent_24%),linear-gradient(180deg,#020304,#070a10_36%,#020304)] px-2.5 pb-6 pt-3 text-white sm:px-4 sm:pb-10">
        <div className="mx-auto flex w-full max-w-[460px] flex-col gap-3 sm:max-w-[820px]">
          <header className="rounded-[24px] border border-[#f6d40f]/25 bg-black/45 px-4 py-4 shadow-[0_22px_80px_rgba(0,0,0,0.55)]">
            <div className="relative flex items-start justify-center gap-3">
              <div className="min-w-0 px-14 text-center">
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#ffd400]">King of the Court</div>
                <h1 className="mt-1 text-3xl font-black uppercase tracking-[0.04em] text-white sm:text-5xl">
                  KOTC
                </h1>
                <p className="mt-1 text-xs text-white/62">{formatTournamentMeta(snapshot)}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/40">
                  {formatRoundType(snapshot.roundType)} · {snapshot.courtLabel} · Раунд {snapshot.liveState.currentRaundNo}
                </p>
              </div>
              <div className="absolute right-0 top-0 flex flex-col items-end gap-2">
                <div className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${connectionClasses(online)}`}>
                  {online ? 'ONLINE' : 'OFFLINE'}
                </div>
                {selfScoringActive && snapshot.params.scoreVoiceEnabled ? (
                  <button
                    type="button"
                    onClick={toggleScoreVoice}
                    className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${
                      voiceEnabled
                        ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100'
                        : 'border-white/15 bg-white/5 text-white/60'
                    }`}
                    aria-pressed={voiceEnabled}
                  >
                    {voiceEnabled ? '🔊 Звук' : '🔇 Звук'}
                  </button>
                ) : null}
              </div>
            </div>

            <section className="mt-4 rounded-[22px] border border-[#ffd400]/35 bg-black/55 px-4 py-3">
              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div>
                  <div className="text-[12px] font-black uppercase tracking-[0.22em] text-white/45">Таймер</div>
                  <div className={`mt-1 text-5xl font-black leading-none sm:text-6xl ${timerDanger ? 'text-red-300' : timerWarning ? 'text-amber-300' : 'text-[#ffd400]'}`}>
                    {isStartCountdown ? `СТАРТ ${formatRemaining(timerDisplayMs)}` : timerDanger ? 'СТОП' : formatRemaining(timerDisplayMs)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!snapshot.canUndo || !canPlay || submitting !== null}
                  onClick={() => void runUndoAction()}
                  className="rounded-2xl border border-[#1683ff]/45 bg-[#1683ff]/12 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#8fc8ff] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35"
                >
                  {submitting === 'undo' ? 'Отмена...' : 'Отменить'}
                </button>
              </div>
            </section>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled
                className="min-h-[54px] rounded-2xl border border-[#33d75c]/40 bg-[#21c448] px-4 py-3 text-base font-black uppercase tracking-[0.06em] text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35"
              >
                Ожидание старта администратора
              </button>
              <button
                type="button"
                disabled={!canFinish || submitting !== null}
                onClick={() => void runFinishAction()}
                className="min-h-[54px] rounded-2xl border border-red-400/35 bg-red-500/12 px-4 py-3 text-base font-black uppercase tracking-[0.06em] text-red-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35"
              >
                {submitting === 'finish' ? 'Финиш...' : 'Финиш'}
              </button>
            </div>
          </header>

          {selfScoringActive ? (
            <section
              className={`rounded-[20px] border px-4 py-3 ${
                snapshot.viewer?.canSelfScore
                  ? 'border-emerald-400/30 bg-emerald-500/12'
                  : 'border-amber-400/30 bg-amber-500/12'
              }`}
            >
              {snapshot.viewer?.canSelfScore ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/65">
                      Самостоятельный счёт
                    </div>
                    <div className="mt-1 text-sm font-bold text-emerald-50">
                      {snapshot.viewer.displayName} · Пара {(snapshot.viewer.pairIdx ?? 0) + 1}
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-300/25 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100">
                    Можно +1
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/65">
                      Самостоятельный счёт · только просмотр
                    </div>
                    <div className="mt-1 text-sm text-amber-50/85">
                      {snapshot.viewer
                        ? 'Ваш профиль не входит в состав этого корта.'
                        : 'Войдите в аккаунт участника, чтобы добавлять очки своей паре.'}
                    </div>
                  </div>
                  {!snapshot.viewer ? (
                    <Link
                      href={`/login?returnTo=${encodeURIComponent(`/kotc-next/judge/${snapshot.pinCode}?raund=${snapshot.selectedRaundNo}`)}`}
                      className="rounded-full border border-amber-300/35 bg-amber-500/15 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-amber-50"
                    >
                      Войти
                    </Link>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          {snapshot.liveState.status === 'paused' ? (
            <section className="rounded-[22px] border-2 border-orange-300/55 bg-orange-500/18 px-4 py-5 text-center">
              <div className="text-3xl font-black uppercase tracking-[0.12em] text-orange-100">Пауза</div>
              <p className="mt-2 text-sm text-orange-100/75">Таймер и ввод очков остановлены оператором. Ожидайте продолжения.</p>
            </section>
          ) : snapshot.liveState.status === 'finished' ? (
            <section className="rounded-[22px] border-2 border-emerald-300/50 bg-emerald-500/15 px-4 py-5 text-center">
              <div className="text-3xl font-black uppercase tracking-[0.1em] text-emerald-100">Раунд завершён</div>
              <p className="mt-2 text-sm text-emerald-100/75">Результат сохранён. Выберите следующий доступный раунд.</p>
            </section>
          ) : isStartCountdown ? (
            <section className="rounded-[22px] border border-[#ffd400]/40 bg-[#ffd400]/10 px-4 py-4 text-center text-sm font-bold uppercase tracking-[0.12em] text-[#ffe980]">
              Синхронный старт всех кортов через {Math.max(1, Math.ceil(startCountdownMs / 1000))} сек.
            </section>
          ) : null}

          <section className="rounded-[22px] border border-white/10 bg-black/35 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap gap-2">
                <div className="w-full text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Туры</div>
                {snapshot.roundNav.map((round) => {
                  const preferredCourt =
                    round.courts.find((court) => court.courtNo === snapshot.courtNo && court.isAvailable) ??
                    round.courts.find((court) => court.isAvailable) ??
                    null;
                  const href = preferredCourt?.judgeUrl
                    ? withRaundParam(preferredCourt.judgeUrl, snapshot.liveState.currentRaundNo)
                    : null;
                  const className = `rounded-full border px-4 py-2 text-[13px] font-bold uppercase tracking-[0.08em] transition ${roundTabClasses(round.isSelected, round.isAvailable)} ${!round.isAvailable || !href ? 'cursor-not-allowed opacity-55' : ''}`;
                  if (!href || !round.isAvailable) {
                    return (
                      <span key={`no-takeovers-round-nav-${round.roundNo}`} aria-disabled="true" className={className}>
                        {round.label}
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={`no-takeovers-round-nav-${round.roundNo}`}
                      href={href}
                      prefetch={false}
                      className={className}
                      aria-current={round.isSelected ? 'page' : undefined}
                    >
                      {round.label}
                    </Link>
                  );
                })}
              </div>

              {selectedRoundNav ? (
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <div className="w-full text-right text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Корты</div>
                  {selectedRoundNav.courts.map((court) => {
                    const href = court.judgeUrl
                      ? withRaundParam(court.judgeUrl, snapshot.liveState.currentRaundNo)
                      : null;
                    const className = `rounded-full border px-4 py-2 text-[13px] font-bold uppercase tracking-[0.08em] transition ${courtTabClasses(court.isSelected, court.isAvailable)} ${!court.isAvailable || !href ? 'cursor-not-allowed opacity-55' : ''}`;
                    if (!court.isAvailable || !href) {
                      return (
                        <span key={`no-takeovers-court-nav-${selectedRoundNav.roundNo}-${court.courtNo}`} aria-disabled="true" className={className}>
                          {formatCourtTabLabel(court.label, court.courtNo)}
                        </span>
                      );
                    }
                    return (
                      <Link
                        key={`no-takeovers-court-nav-${selectedRoundNav.roundNo}-${court.courtNo}`}
                        href={href}
                        prefetch={false}
                        className={className}
                        aria-current={court.isSelected ? 'page' : undefined}
                      >
                        {formatCourtTabLabel(court.label, court.courtNo)}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <div className="w-full text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Раунды</div>
              {snapshot.raundHistory.map((entry) => {
                const active = entry.raundNo === snapshot.liveState.currentRaundNo;
                const available = accessibleRaundNos.has(entry.raundNo);
                return (
                  <Link
                    key={`no-takeovers-raund-nav-${entry.raundNo}`}
                    href={available ? withRaundParam(`/kotc-next/judge/${encodeURIComponent(snapshot.pinCode)}`, entry.raundNo) : '#'}
                    prefetch={false}
                    aria-disabled={!available}
                    aria-current={active ? 'page' : undefined}
                    className={`rounded-full border px-4 py-2 text-[13px] font-bold uppercase tracking-[0.08em] transition ${
                      active
                        ? 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]'
                        : available
                          ? 'border-[#2a2a44] bg-[#161625] text-[#c6cad6] hover:border-[#5a5a8e]'
                          : 'cursor-not-allowed border-white/10 bg-white/5 text-white/28 opacity-55'
                    }`}
                  >
                    Раунд {entry.raundNo}
                  </Link>
                );
              })}
            </div>
          </section>

          {toast ? (
            <div role="status" aria-live="assertive" className={`rounded-[18px] border px-4 py-3 text-sm font-medium shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${toneClasses(toast.tone)}`}>
              {toast.message}
            </div>
          ) : null}

          {pendingConfirm ? (
            <div className="rounded-[18px] border border-orange-400/40 bg-orange-500/12 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-semibold text-orange-100">
                  {pendingConfirm === 'finish'
                    ? `Завершить раунд на ${snapshot.courtLabel}? Результат будет зафиксирован.`
                    : pendingConfirm === 'start'
                      ? 'Запустить общий таймер на всех кортах? После подтверждения будет 10 секунд до старта.'
                    : pendingConfirm === 'reset'
                      ? 'Сбросить раунд? Очки пар будут очищены.'
                      : 'Отменить последнее очко пары?'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingConfirm === 'start') void runStartAction();
                      else if (pendingConfirm === 'finish') void runFinishAction();
                      else if (pendingConfirm === 'reset') void runResetRaundAction();
                      else void runUndoAction();
                    }}
                    className="rounded-full border border-orange-300/40 bg-orange-500/20 px-4 py-1.5 text-sm font-bold text-orange-100"
                  >
                    Да
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingConfirm(null)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-bold text-white/70"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {selfScoringActive && snapshot.params.scoreHistoryVisible && latestAuditScore ? (
            <section className="rounded-[18px] border border-sky-400/25 bg-sky-500/10 px-4 py-3" aria-live="polite">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-100/55">Последнее действие</div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm text-sky-50">
                <strong>
                  Пара {(latestAuditScore.pairIdx ?? 0) + 1} · {latestAuditScore.delta > 0 ? '+' : ''}{latestAuditScore.delta}
                  {latestAuditScore.scoreBefore != null && latestAuditScore.scoreAfter != null
                    ? ` · ${latestAuditScore.scoreBefore} → ${latestAuditScore.scoreAfter}`
                    : ''}
                </strong>
                <span className="text-xs text-sky-100/65">
                  {latestAuditScore.actorName} · {formatEventClock(latestAuditScore.createdAt)}
                </span>
              </div>
            </section>
          ) : null}

          <section className="grid gap-2.5">
            {noTakeoversPairCards.map((pairState, index) => (
              <article
                key={`no-takeovers-pair-${pairState.pairIdx}`}
                className={`grid grid-cols-[46px_minmax(0,1fr)_78px_104px] items-center gap-2 rounded-[20px] border px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.3)] sm:grid-cols-[58px_minmax(0,1fr)_120px_132px] sm:rounded-[26px] sm:px-5 sm:py-4 ${
                  index === 0
                    ? 'border-[#ffd400]/80 bg-[linear-gradient(180deg,rgba(50,39,0,0.82),rgba(10,10,10,0.92))]'
                    : 'border-[#1683ff]/70 bg-[linear-gradient(180deg,rgba(3,20,45,0.76),rgba(4,8,16,0.94))]'
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full border text-xl font-black sm:h-12 sm:w-12 ${
                  index === 0 ? 'border-[#ffd400]/70 text-[#ffd400]' : 'border-[#1683ff]/80 text-[#1683ff]'
                }`}>
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className={`text-[12px] font-black uppercase tracking-[0.08em] ${index === 0 ? 'text-[#ffd400]' : 'text-[#1683ff]'}`}>
                    {index === 0 ? 'Король' : 'Пара'}
                  </div>
                  <div className="mt-1 truncate text-xl font-black text-white sm:text-3xl">
                    {pairLabel(snapshot, pairState.pairIdx)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-white/55">Очки</div>
                  <div className={`text-5xl font-black leading-none sm:text-6xl ${index === 0 ? 'text-[#ffd400]' : 'text-[#1683ff]'}`}>
                    {pairState.kingWins}
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <button
                    type="button"
                    disabled={
                      !canScore ||
                      submitting !== null ||
                      (selfScoringActive && snapshot.viewer?.pairIdx !== pairState.pairIdx)
                    }
                    onClick={() => void runNoTakeoversPairPointAction(pairState.pairIdx)}
                    className="min-h-[68px] rounded-full border-[3px] border-[#d8ff4f] bg-[#19c743] text-4xl font-black text-white shadow-[0_0_28px_rgba(36,220,78,0.42)] transition hover:bg-[#2fe35a] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 sm:min-h-[88px] sm:text-5xl"
                  >
                    {submitting === `pair-point-${pairState.pairIdx}` ? '...' : '+1'}
                  </button>
                  <button
                    type="button"
                    disabled={
                      !canScore ||
                      submitting !== null ||
                      !snapshot.canUndo ||
                      latestScoreEvent?.kingPairIdx !== pairState.pairIdx ||
                      (selfScoringActive && snapshot.viewer?.pairIdx !== pairState.pairIdx)
                    }
                    onClick={() => void runNoTakeoversPairUndoAction(pairState.pairIdx)}
                    className="min-h-[34px] rounded-full border border-red-300/35 bg-red-500/12 text-xl font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:min-h-[44px] sm:text-2xl"
                    aria-label={`Снять последнее очко у пары ${pairLabel(snapshot, pairState.pairIdx)}`}
                  >
                    -1
                  </button>
                </div>
              </article>
            ))}
          </section>

          <section className="hidden">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div>
                <div className="text-[12px] font-black uppercase tracking-[0.22em] text-white/45">Таймер</div>
                <div className={`mt-1 text-5xl font-black leading-none sm:text-6xl ${timerDanger ? 'text-red-300' : timerWarning ? 'text-amber-300' : 'text-[#ffd400]'}`}>
                  {isStartCountdown ? `СТАРТ ${formatRemaining(timerDisplayMs)}` : timerDanger ? 'СТОП' : formatRemaining(timerDisplayMs)}
                </div>
              </div>
              <button
                type="button"
                disabled={!snapshot.canUndo || !canPlay || submitting !== null}
                onClick={() => void runUndoAction()}
                className="rounded-2xl border border-[#1683ff]/45 bg-[#1683ff]/12 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#8fc8ff] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35"
              >
                {submitting === 'undo' ? 'Отмена...' : 'Отменить'}
              </button>
            </div>
          </section>

<section className="rounded-[22px] border border-white/15 bg-black/45 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-black uppercase tracking-[0.18em] text-white/45">Турнирная таблица</div>
                <div className="mt-1 text-[11px] text-white/55">{standingsTabDescription(standingsTab)}</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
                  {(['pairs', 'men', 'women'] as const).map((tab) => (
                    <button
                      key={`no-takeovers-standings-tab-${tab}`}
                      type="button"
                      onClick={() => setStandingsTab(tab)}
                      className={standingsTabButtonClasses(standingsTab === tab)}
                      aria-pressed={standingsTab === tab}
                    >
                      {standingsTabLabel(tab)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
                  {(['all', ...availableStandingsZones] as JudgeZoneFilter[]).map((zone) => (
                    <button
                      key={`no-takeovers-zone-filter-${zone}`}
                      type="button"
                      onClick={() => setStandingsZoneFilter(zone)}
                      className={standingsTabButtonClasses(standingsZoneFilter === zone)}
                      aria-pressed={standingsZoneFilter === zone}
                    >
                      {zoneFilterLabel(zone)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowStandings((value) => !value)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80 transition hover:border-white/20 hover:bg-white/10"
                  aria-expanded={showStandings}
                >
                  {showStandings ? 'Скрыть' : 'Показать'}
                </button>
              </div>
            </div>
            {showStandings ? (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left">
                  <thead className="bg-white/5 text-[10px] uppercase tracking-[0.14em] text-white/42">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">{standingsTab === 'pairs' ? 'Пара' : 'Игрок'}</th>
                      <th className="px-2 py-3 text-center">КР</th>
                      <th className="px-2 py-3 text-center">Серия</th>
                      <th className="px-2 py-3 text-center">Игры</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingsTab === 'pairs'
                      ? aggregatePairStandingsFiltered.map((row, index) => (
                          <tr
                            key={`no-takeovers-standing-${row.courtNo}-${row.pairIdx}`}
                            className={`border-t border-white/8 ${index === 0 ? 'bg-[#3a2d00]/80 text-[#ffd400]' : 'bg-[#071321]/70 text-white/82'}`}
                          >
                            <td className="px-3 py-3 text-lg font-black">{row.position}</td>
                            <td className="px-3 py-3">
                              <div className="text-base font-bold">{restoreUtf8FromCp1251Mojibake(row.pairLabel)}</div>
                              <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/42">
                                {row.zoneLabel || formatAggregateCourtLabel(row.courtLabel, row.courtNo)}
                              </div>
                            </td>
                            <td className="px-2 py-3 text-center text-2xl font-black">{row.kingWins}</td>
                            <td className="px-2 py-3 text-center">
                              <div className="text-2xl font-black">{row.longestKingRun ?? 0}</div>
                              {row.firstLongestKingRunOrder ? (
                                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">
                                  #{row.firstLongestKingRunOrder}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-2 py-3 text-center text-2xl font-black">{row.gamesPlayed}</td>
                          </tr>
                        ))
                      : aggregatePlayerStandings.map((row, index) => (
                          <tr
                            key={`no-takeovers-player-standing-${standingsTab}-${row.courtNo}-${row.playerId ?? row.playerName}-${index}`}
                            className={`border-t border-white/8 ${index === 0 ? 'bg-[#3a2d00]/80 text-[#ffd400]' : 'bg-[#071321]/70 text-white/82'}`}
                          >
                            <td className="px-3 py-3 text-lg font-black">{row.position}</td>
                            <td className="px-3 py-3">
                              <div className="text-base font-bold">{restoreUtf8FromCp1251Mojibake(row.playerName)}</div>
                              <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/42">
                                {row.zoneLabel || formatAggregateCourtLabel(row.courtLabel, row.courtNo)}
                              </div>
                            </td>
                            <td className="px-2 py-3 text-center text-2xl font-black">{row.kingWins}</td>
                            <td className="px-2 py-3 text-center">
                              <div className="text-2xl font-black">{row.longestKingRun ?? 0}</div>
                              {row.firstLongestKingRunOrder ? (
                                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">
                                  #{row.firstLongestKingRunOrder}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-2 py-3 text-center text-2xl font-black">{row.gamesPlayed}</td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="grid gap-2.5">
            <button
              type="button"
              onClick={() => startTransition(() => router.refresh())}
              className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-3 text-sm font-black uppercase tracking-[0.08em] text-white/80"
            >
              Обновить
            </button>
          </section>

          {selfScoringActive && snapshot.params.scoreHistoryVisible ? (
            <section className="rounded-[22px] border border-white/10 bg-black/35 px-3 py-3">
              <div className="text-[12px] font-black uppercase tracking-[0.18em] text-white/45">История очков</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-xs text-white/62">
                  {auditScoreHistory.length ? `${auditScoreHistory.length} событий` : 'История появится после первого очка.'}
                </div>
                <button
                  type="button"
                  onClick={() => setShowScoreHistory((value) => !value)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80 transition hover:border-white/20 hover:bg-white/10"
                  aria-expanded={showScoreHistory}
                >
                  {showScoreHistory ? 'Скрыть' : 'Показать'}
                </button>
              </div>
              {showScoreHistory ? (
                <div className="mt-3 space-y-2">
                  {auditScoreHistory.length ? (
                    auditScoreHistory.map((event) => (
                      <div
                        key={event.id}
                        className={`rounded-2xl border px-3 py-2 ${
                          event.reverted
                            ? 'border-red-300/15 bg-red-500/5 text-white/45 line-through'
                            : 'border-white/8 bg-white/[0.03] text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-white/42">
                          <span>{event.actorName}</span>
                          <span>{formatEventClock(event.createdAt)}</span>
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          Пара {(event.pairIdx ?? 0) + 1} · {event.delta > 0 ? '+' : ''}{event.delta}
                          {event.scoreBefore != null && event.scoreAfter != null
                            ? ` · ${event.scoreBefore} → ${event.scoreAfter}`
                            : ''}
                          {event.reverted ? ' · отменено' : ''}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/62">
                      История пока пустая.
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(255,214,10,0.12),transparent_18%),linear-gradient(180deg,#050507,#080913_28%,#040405)] px-2.5 pb-6 pt-3 text-white sm:px-3 sm:pb-10 sm:pt-4">
      <div className="mx-auto flex w-full max-w-[430px] flex-col gap-3 sm:max-w-[780px] sm:gap-4">
        <header className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,14,18,0.98),rgba(8,8,12,0.98))] px-3 py-4 shadow-[0_28px_80px_rgba(0,0,0,0.4)] sm:rounded-[28px] sm:px-4 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/72 sm:px-3 sm:text-[11px] sm:tracking-[0.24em]">
              PIN {snapshot.pinCode}
            </div>
            <div className="min-w-0 text-center">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/35 sm:text-[11px] sm:tracking-[0.34em]">Панель судьи</div>
              <h1 className="mt-1 text-[28px] font-heading uppercase tracking-[0.06em] text-white sm:text-4xl sm:tracking-[0.08em]">
                Король корта
              </h1>
              <p className="mt-1 text-[11px] text-white/45 sm:text-xs">{formatTournamentMeta(snapshot)}</p>
            </div>
            <div className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] sm:px-3 sm:text-[11px] sm:tracking-[0.24em] ${connectionClasses(online)}`}>
              {online ? 'ONLINE' : 'OFFLINE'}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:mt-5 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/42 sm:text-[12px] sm:tracking-[0.26em]">Осталось</div>
              <div className={`mt-1 text-5xl font-black leading-none tracking-[0.01em] sm:text-6xl sm:tracking-[0.02em] ${timerDanger ? 'text-red-400' : timerWarning ? 'text-orange-300' : 'text-[#ffd400]'}`}>
                {isStartCountdown ? `СТАРТ ${formatRemaining(timerDisplayMs)}` : timerDanger ? 'СТОП' : formatRemaining(timerDisplayMs)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.15em] sm:text-xs sm:tracking-[0.2em]">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/72">
                  {formatRoundStatus(snapshot.liveState.status)}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/72">
                  {snapshot.courtLabel}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/72">
                  {snapshot.params.ppc} пар
                </span>
                {restoredDraft ? (
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-amber-100">
                    LOCAL DRAFT
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled
                className="min-h-[62px] rounded-[20px] border border-[#3ee04d]/30 bg-[#31d848] px-4 py-3 text-base font-black uppercase tracking-[0.05em] text-white shadow-[0_18px_50px_rgba(49,216,72,0.24)] transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none sm:min-h-[72px] sm:rounded-[22px] sm:px-6 sm:py-4 sm:text-lg sm:tracking-[0.06em]"
              >
                Ожидание старта администратора
              </button>
              <button
                type="button"
                disabled={!canFinish || submitting !== null}
                onClick={() => void runFinishAction()}
                className="min-h-[62px] rounded-[20px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-base font-black uppercase tracking-[0.05em] text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 sm:min-h-[72px] sm:rounded-[22px] sm:px-6 sm:py-4 sm:text-lg sm:tracking-[0.06em]"
              >
                {submitting === 'finish' ? 'Финиш...' : 'Финиш'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1.5 sm:mt-5 sm:gap-2">
            <div className="rounded-[14px] border border-[#5b4713] bg-[#ffd400] px-3.5 py-2 text-sm font-black uppercase tracking-[0.04em] text-black sm:rounded-[18px] sm:px-5 sm:py-3 sm:text-lg sm:tracking-[0.05em]">
              {formatRoundType(snapshot.roundType)}
            </div>
            {snapshot.raundHistory.map((entry) => {
              const active = entry.raundNo === snapshot.liveState.currentRaundNo;
              const available = accessibleRaundNos.has(entry.raundNo);
              return (
                <div
                  key={`raund-pill-${entry.raundNo}`}
                  className={`rounded-[14px] border px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-base sm:tracking-[0.05em] ${
                    active
                      ? 'border-[#f6d40f] bg-[#16140a] text-[#ffd400]'
                      : available
                        ? 'border-white/10 bg-[#171724] text-white/45'
                        : 'border-white/10 bg-white/5 text-white/28 opacity-55'
                  }`}
                >
                  РАУНД {entry.raundNo}
                </div>
              );
            })}
            <div className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />
            <div className="rounded-[14px] border border-[#f6d40f] bg-[#16140a] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[#ffd400] sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-base sm:tracking-[0.05em]">
              {snapshot.courtLabel}
            </div>
            <div className="rounded-[14px] border border-white/10 bg-[#171724] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-white/45 sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-base sm:tracking-[0.05em]">
              {formatVariant(snapshot.variant)}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-3 sm:mt-5">
            <div className="flex min-w-0 flex-wrap gap-2">
              <div className="w-full text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Туры</div>
              {snapshot.roundNav.map((round) => {
                const preferredCourt =
                  round.courts.find((court) => court.courtNo === snapshot.courtNo && court.isAvailable) ??
                  round.courts.find((court) => court.isAvailable) ??
                  null;
                const href = preferredCourt?.judgeUrl ?? null;
                const className = `rounded-full border px-4 py-2 text-[13px] font-bold uppercase tracking-[0.08em] transition sm:px-5 sm:py-3 sm:text-[14px] ${roundTabClasses(round.isSelected, round.isAvailable)} ${!round.isAvailable || !href ? 'cursor-not-allowed opacity-55' : ''}`;
                if (!href || !round.isAvailable) {
                  return (
                    <span key={`round-nav-${round.roundNo}`} aria-disabled="true" className={className}>
                      {round.label}
                    </span>
                  );
                }
                return (
                  <Link
                    key={`round-nav-${round.roundNo}`}
                    href={href}
                    prefetch={false}
                    className={className}
                    aria-current={round.isSelected ? 'page' : undefined}
                  >
                    {round.label}
                  </Link>
                );
              })}
            </div>

            {selectedRoundNav ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <div className="w-full text-right text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Корты</div>
                {selectedRoundNav.courts.map((court) => {
                  const className = `rounded-full border px-4 py-2 text-[13px] font-bold uppercase tracking-[0.08em] transition sm:px-5 sm:py-3 sm:text-[14px] ${courtTabClasses(court.isSelected, court.isAvailable)} ${!court.isAvailable || !court.judgeUrl ? 'cursor-not-allowed opacity-55' : ''}`;
                  if (!court.isAvailable || !court.judgeUrl) {
                    return (
                      <span key={`court-nav-${selectedRoundNav.roundNo}-${court.courtNo}`} aria-disabled="true" className={className}>
                        {formatCourtTabLabel(court.label, court.courtNo)}
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={`court-nav-${selectedRoundNav.roundNo}-${court.courtNo}`}
                      href={court.judgeUrl}
                      prefetch={false}
                      className={className}
                      aria-current={court.isSelected ? 'page' : undefined}
                    >
                      {formatCourtTabLabel(court.label, court.courtNo)}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 sm:mt-5 sm:gap-3">
            {queueCards.map((pairIdx, index) => {
              const active = index === 0 || index === 1;
              return (
                <div
                  key={`queue-${pairIdx}-${index}`}
                  className={`min-w-[92px] rounded-[18px] border px-3 py-2 text-left sm:min-w-[132px] sm:px-4 sm:py-3 ${
                    active
                      ? index === 0
                        ? 'border-[#f6d40f] bg-[#16140a] text-[#ffd400]'
                        : 'border-[#2fd35a] bg-[#0a1b12] text-[#8dffab]'
                      : 'border-white/10 bg-white/[0.03] text-white/72'
                  }`}
                  title={pairLabel(snapshot, pairIdx)}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">
                    {index === 0 ? 'KING' : index === 1 ? 'NEXT' : `Q${index - 1}`}
                  </div>
                  <div className="mt-1 text-sm font-black leading-tight sm:text-base">
                    {getPairShortLabel(snapshot, pairIdx)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/42 sm:text-[12px] sm:tracking-[0.26em]">Осталось</div>
              <div className={`mt-1 text-5xl font-black leading-none tracking-[0.01em] sm:text-6xl sm:tracking-[0.02em] ${timerDanger ? 'text-red-400' : timerWarning ? 'text-orange-300' : 'text-[#ffd400]'}`}>
                {isStartCountdown ? `СТАРТ ${formatRemaining(timerDisplayMs)}` : timerDanger ? 'СТОП' : formatRemaining(timerDisplayMs)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.15em] sm:text-xs sm:tracking-[0.2em]">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/72">
                  {formatRoundStatus(snapshot.liveState.status)}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/72">
                  {snapshot.courtLabel}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/72">
                  {snapshot.params.ppc} пар
                </span>
                {restoredDraft ? (
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-amber-100">
                    LOCAL DRAFT
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled
                className="min-h-[62px] rounded-[20px] border border-[#3ee04d]/30 bg-[#31d848] px-4 py-3 text-base font-black uppercase tracking-[0.05em] text-white shadow-[0_18px_50px_rgba(49,216,72,0.24)] transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none sm:min-h-[72px] sm:rounded-[22px] sm:px-6 sm:py-4 sm:text-lg sm:tracking-[0.06em]"
              >
                {submitting === 'start' ? 'Старт…' : 'Старт'}
              </button>
              <button
                type="button"
                disabled={!canPlay || submitting !== null}
                onClick={() => void runFinishAction()}
                className="min-h-[62px] rounded-[20px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-base font-black uppercase tracking-[0.05em] text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 sm:min-h-[72px] sm:rounded-[22px] sm:px-6 sm:py-4 sm:text-lg sm:tracking-[0.06em]"
              >
                {submitting === 'finish' ? 'Финиш…' : 'Финиш'}
              </button>
            </div>
          </div>
        </header>

        {snapshot.liveState.status === 'paused' ? (
          <section className="rounded-[24px] border-2 border-orange-300/55 bg-orange-500/18 px-5 py-6 text-center shadow-[0_20px_60px_rgba(249,115,22,0.14)]">
            <div className="text-4xl font-black uppercase tracking-[0.12em] text-orange-100">Пауза</div>
            <p className="mt-2 text-sm text-orange-100/75">Таймер и судейские действия остановлены оператором.</p>
          </section>
        ) : snapshot.liveState.status === 'finished' ? (
          <section className="rounded-[24px] border-2 border-emerald-300/50 bg-emerald-500/15 px-5 py-6 text-center shadow-[0_20px_60px_rgba(16,185,129,0.12)]">
            <div className="text-4xl font-black uppercase tracking-[0.08em] text-emerald-100">Раунд завершён</div>
            <p className="mt-2 text-sm text-emerald-100/75">Результаты сохранены на сервере. Выберите следующий доступный раунд.</p>
          </section>
        ) : isStartCountdown ? (
          <section className="rounded-[24px] border border-[#ffd400]/40 bg-[#ffd400]/10 px-5 py-4 text-center text-sm font-black uppercase tracking-[0.12em] text-[#ffe980]">
            Синхронный старт всех кортов через {Math.max(1, Math.ceil(startCountdownMs / 1000))} сек.
          </section>
        ) : null}

        {toast ? (
          <div role="status" aria-live="assertive" className={`rounded-[18px] border px-4 py-3 text-sm font-medium shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${toneClasses(toast.tone)}`}>
            {toast.message}
          </div>
        ) : null}

        {pendingConfirm ? (
          <div className="rounded-[18px] border border-orange-400/40 bg-orange-500/12 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-orange-100">
                {pendingConfirm === 'finish'
                  ? `Завершить раунд на ${snapshot.courtLabel}? Результат будет зафиксирован.`
                  : pendingConfirm === 'start'
                    ? 'Запустить общий таймер на всех кортах? После подтверждения будет 10 секунд до старта.'
                  : pendingConfirm === 'reset'
                    ? 'Сбросить раунд? Игровые события будут очищены.'
                    : 'Отменить последнее действие?'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (pendingConfirm === 'start') void runStartAction();
                    else if (pendingConfirm === 'finish') void runFinishAction();
                    else if (pendingConfirm === 'reset') void runResetRaundAction();
                    else void runUndoAction();
                  }}
                  className="rounded-full border border-orange-300/40 bg-orange-500/20 px-4 py-1.5 text-sm font-bold text-orange-100 transition hover:bg-orange-500/35"
                >
                  Да, подтвердить
                </button>
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-bold text-white/70 transition hover:bg-white/10"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-2.5 sm:gap-4">
          <article className="rounded-[22px] border-[3px] border-[#f2d100] bg-[linear-gradient(180deg,rgba(34,26,4,0.96),rgba(18,14,3,0.98))] px-3 py-3 shadow-[0_24px_80px_rgba(242,209,0,0.12)] sm:rounded-[30px] sm:border-4 sm:px-5 sm:py-5">
            <div className="flex items-center justify-between gap-3">
              <ManualArrowButton
                label="Король влево"
                onClick={() => void runManualPairAction('king', 'prev')}
                disabled={!canManualAdjust || submitting !== null}
              />
              <div className="rounded-full border border-[#f2d100]/30 bg-[#161105] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f2d100] sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.22em]">
                Пара короля
              </div>
              <ManualArrowButton
                label="Король вправо"
                onClick={() => void runManualPairAction('king', 'next')}
                disabled={!canManualAdjust || submitting !== null}
              />
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xl font-black leading-tight text-white sm:text-3xl">{currentKing}</h2>
              {showArrowHelp ? (
                <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-white/48 sm:text-xs sm:tracking-[0.18em]">
                  Ручная перестановка пары короля без начисления очка
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-[1fr_124px] gap-3 sm:mt-6 sm:grid-cols-[1fr_168px] sm:gap-4">
              <div>
                <div className="text-[72px] font-black leading-none text-[#ffd400] sm:text-[96px]">
                  {kingStat?.kingWins ?? 0}
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-white/62 sm:mt-3 sm:text-sm">
                  <div>Смен трона: {kingStat?.takeovers ?? 0}</div>
                  <div>Сыграно игр: {kingStat?.gamesPlayed ?? 0}</div>
                </div>
              </div>
              <div className="grid gap-3">
                <button
                  type="button"
                  disabled={!canScore || submitting !== null}
                  onClick={() => void runAction('king-point')}
                  className="min-h-[132px] rounded-[22px] border border-[#2fd35a] bg-[#35d64c] px-3 py-5 text-center text-5xl font-black text-white transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:min-h-[168px] sm:rounded-[26px] sm:px-4 sm:py-6 sm:text-6xl"
                >
                  +1
                  <div className="mt-2 text-[11px] uppercase tracking-[0.12em] sm:mt-3 sm:text-sm sm:tracking-[0.16em]">Очко короля</div>
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-[22px] border-[3px] border-[#2370ff] bg-[linear-gradient(180deg,rgba(7,17,42,0.96),rgba(4,11,29,0.98))] px-3 py-3 shadow-[0_24px_80px_rgba(35,112,255,0.14)] sm:rounded-[30px] sm:border-4 sm:px-5 sm:py-5">
            <div className="flex items-center justify-between gap-3">
              <ManualArrowButton
                label="Претендент влево"
                onClick={() => void runManualPairAction('challenger', 'prev')}
                disabled={!canManualAdjust || submitting !== null}
              />
              <div className="rounded-full border border-[#2370ff]/30 bg-[#091730] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#50bbff] sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.22em]">
                Пара претендент
              </div>
              <ManualArrowButton
                label="Претендент вправо"
                onClick={() => void runManualPairAction('challenger', 'next')}
                disabled={!canManualAdjust || submitting !== null}
              />
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xl font-black leading-tight text-white sm:text-3xl">{currentChallenger}</h2>
              {showArrowHelp ? (
                <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-white/48 sm:text-xs sm:tracking-[0.18em]">
                  Ручная перестановка претендента и очереди за ним
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-[1fr_124px] gap-3 sm:mt-6 sm:grid-cols-[1fr_168px] sm:gap-4">
              <div>
                <div className="text-[72px] font-black leading-none text-white sm:text-[96px]">
                  {challengerStat?.kingWins ?? 0}
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-white/62 sm:mt-3 sm:text-sm">
                  <div>Захватов трона: {challengerStat?.takeovers ?? 0}</div>
                  <div>Сыграно игр: {challengerStat?.gamesPlayed ?? 0}</div>
                </div>
              </div>
              <div className="grid gap-3">
                <button
                  type="button"
                  disabled={!canScore || submitting !== null}
                  onClick={() => void runAction('takeover')}
                  className="min-h-[132px] rounded-[22px] border border-[#2fd35a] bg-[#35d64c] px-3 py-5 text-center text-5xl font-black text-white transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:min-h-[168px] sm:rounded-[26px] sm:px-4 sm:py-6 sm:text-6xl"
                >
                  +1
                  <div className="mt-2 text-[11px] uppercase tracking-[0.12em] sm:mt-3 sm:text-sm sm:tracking-[0.16em]">Смена трона</div>
                </button>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-[22px] border border-white/8 bg-[#171717] px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.32)] sm:rounded-[28px] sm:px-4 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/44 sm:text-[12px] sm:tracking-[0.26em]">Турнирная таблица</div>
              <div className="mt-1 text-[11px] text-white/55 sm:text-sm">{standingsTabDescription(standingsTab)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
                {(['pairs', 'men', 'women'] as const).map((tab) => (
                  <button
                    key={`standings-tab-${tab}`}
                    type="button"
                    onClick={() => setStandingsTab(tab)}
                    className={standingsTabButtonClasses(standingsTab === tab)}
                    aria-pressed={standingsTab === tab}
                  >
                    {standingsTabLabel(tab)}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
                {(['all', ...availableStandingsZones] as JudgeZoneFilter[]).map((zone) => (
                  <button
                    key={`zone-filter-${zone}`}
                    type="button"
                    onClick={() => setStandingsZoneFilter(zone)}
                    className={standingsTabButtonClasses(standingsZoneFilter === zone)}
                    aria-pressed={standingsZoneFilter === zone}
                  >
                    {zoneFilterLabel(zone)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowStandings((value) => !value)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 sm:px-4 sm:text-sm"
              >
                {showStandings ? 'Свернуть таблицу' : 'Развернуть таблицу'}
              </button>
              <button
                type="button"
                onClick={() => setShowArrowHelp((value) => !value)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 sm:px-4 sm:text-sm"
              >
                {showArrowHelp ? 'Скрыть подсказки стрелок' : 'Показать подсказки стрелок'}
              </button>
              <button
                type="button"
                onClick={() => startTransition(() => router.refresh())}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 sm:px-4 sm:text-sm"
              >
                Обновить
              </button>
            </div>
          </div>

          {showStandings ? (
            <div className="mt-3 overflow-hidden rounded-[18px] border border-white/8 sm:mt-4 sm:rounded-[24px]">
            <table className="min-w-full text-left">
              <thead className="bg-[#1f1f1f] text-[10px] uppercase tracking-[0.14em] text-white/38 sm:text-[12px] sm:tracking-[0.2em]">
                <tr>
                  <th className="px-3 py-3 sm:px-5 sm:py-4">{standingsTab === 'pairs' ? 'Пара' : 'Игрок'}</th>
                  <th className="px-2 py-3 text-center sm:px-4 sm:py-4">КО</th>
                  <th className="px-2 py-3 text-center sm:px-4 sm:py-4">СЕР</th>
                  <th className="px-2 py-3 text-center sm:px-4 sm:py-4">ИГР</th>
                </tr>
              </thead>
              <tbody>
                {standingsTab === 'pairs'
                  ? aggregatePairStandingsFiltered.map((row, index) => (
                      <tr
                        key={`standing-${row.courtNo}-${row.pairIdx}`}
                        className={`border-t border-white/8 ${index === 0 ? 'bg-[#2a2100]/95 text-[#ffd400]' : 'bg-[#141414] text-white/84'}`}
                      >
                        <td className="px-3 py-3 sm:px-5 sm:py-4">
                          <div className="flex items-center gap-3">
                            <span className="w-4 text-xs font-black text-white/55 sm:w-5 sm:text-sm">{row.position}</span>
                            <div>
                              <div className="text-sm font-bold leading-tight sm:text-lg">{restoreUtf8FromCp1251Mojibake(row.pairLabel)}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-white/42 sm:text-xs sm:tracking-[0.16em]">
                                {row.zoneLabel || formatAggregateCourtLabel(row.courtLabel, row.courtNo)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center text-xl font-black sm:px-4 sm:py-4 sm:text-3xl">{row.kingWins}</td>
                        <td className="px-2 py-3 text-center sm:px-4 sm:py-4">
                          <div className="text-xl font-black sm:text-3xl">{row.longestKingRun ?? 0}</div>
                          {row.firstLongestKingRunOrder ? (
                            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42 sm:text-xs">
                              #{row.firstLongestKingRunOrder}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-3 text-center text-xl font-black sm:px-4 sm:py-4 sm:text-3xl">{row.gamesPlayed}</td>
                      </tr>
                    ))
                  : aggregatePlayerStandings.map((row, index) => (
                      <tr
                        key={`standing-player-${standingsTab}-${row.courtNo}-${row.playerId ?? row.playerName}-${index}`}
                        className={`border-t border-white/8 ${index === 0 ? 'bg-[#2a2100]/95 text-[#ffd400]' : 'bg-[#141414] text-white/84'}`}
                      >
                        <td className="px-3 py-3 sm:px-5 sm:py-4">
                          <div className="flex items-center gap-3">
                            <span className="w-4 text-xs font-black text-white/55 sm:w-5 sm:text-sm">{row.position}</span>
                            <div>
                              <div className="text-sm font-bold leading-tight sm:text-lg">{restoreUtf8FromCp1251Mojibake(row.playerName)}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-white/42 sm:text-xs sm:tracking-[0.16em]">
                                {row.zoneLabel || formatAggregateCourtLabel(row.courtLabel, row.courtNo)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center text-xl font-black sm:px-4 sm:py-4 sm:text-3xl">{row.kingWins}</td>
                        <td className="px-2 py-3 text-center sm:px-4 sm:py-4">
                          <div className="text-xl font-black sm:text-3xl">{row.longestKingRun ?? 0}</div>
                          {row.firstLongestKingRunOrder ? (
                            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42 sm:text-xs">
                              #{row.firstLongestKingRunOrder}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-3 text-center text-xl font-black sm:px-4 sm:py-4 sm:text-3xl">{row.gamesPlayed}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
            </div>
          ) : null}

          <div className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-white/8 bg-[#101010] px-3 py-3 sm:rounded-[22px] sm:px-4 sm:py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/42 sm:text-[12px] sm:tracking-[0.26em]">Очередь на замену</div>
              <div className="mt-2 text-[11px] text-white/74 sm:text-sm">
                {snapshot.liveState.queueOrder.length > 0
                  ? snapshot.liveState.queueOrder.map((pairIdx) => pairLabel(snapshot, pairIdx)).join(' · ')
                  : 'Очередь пуста'}
              </div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#101010] px-3 py-3 sm:rounded-[22px] sm:px-4 sm:py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/42 sm:text-[12px] sm:tracking-[0.26em]">История раундов</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {snapshot.raundHistory.map((entry) => (
                  <div
                    key={`history-${entry.raundNo}`}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.16em] ${
                      entry.raundNo === snapshot.liveState.currentRaundNo
                        ? 'border-[#f2d100]/40 bg-[#2a2100] text-[#ffd400]'
                        : 'border-white/10 bg-white/5 text-white/60'
                    }`}
                  >
                    РАУНД {entry.raundNo} · {formatRoundStatus(entry.status)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-white/8 bg-[#171717] px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.32)] sm:rounded-[28px] sm:px-4 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/44 sm:text-[12px] sm:tracking-[0.26em]">История начисления очков</div>
              <div className="mt-1 text-[11px] text-white/55 sm:text-sm">Последние очки и смены трона с точным временем.</div>
            </div>
            <button
              type="button"
              onClick={() => setShowScoreHistory((value) => !value)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 sm:px-4 sm:text-sm"
            >
              {showScoreHistory ? 'Свернуть историю' : 'Развернуть историю'}
            </button>
          </div>

          {showScoreHistory ? (
            <div className="mt-3 space-y-2 sm:mt-4">
              {scoreHistory.length ? (
                scoreHistory.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-[18px] border border-white/8 bg-[#101010] px-3 py-3 sm:px-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">
                        #{event.seqNo} · {event.eventType === 'takeover' ? 'Смена трона' : 'Очко'}
                      </div>
                      <div className="text-[11px] font-semibold text-white/58 sm:text-sm">
                        {formatEventClock(event.playedAt)}
                      </div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white sm:text-base">
                      {describeEvent(snapshot, event)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-white/8 bg-[#101010] px-3 py-3 text-sm text-white/62 sm:px-4">
                  История пока пустая.
                </div>
              )}
            </div>
          ) : null}
        </section>

        <section className="grid gap-2.5 sm:grid-cols-2 sm:gap-4">
          <button
            type="button"
            disabled={!snapshot.canUndo || !canPlay || submitting !== null}
            onClick={() => void runUndoAction()}
            className="rounded-[18px] border border-amber-300/25 bg-amber-500/10 px-3 py-3 text-sm font-black uppercase tracking-[0.08em] text-amber-100 transition hover:bg-amber-500/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 sm:rounded-[22px] sm:px-4 sm:py-4 sm:text-base"
          >
            {submitting === 'undo' ? 'Отмена…' : 'Отмена последнего'}
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-3 text-sm font-black uppercase tracking-[0.08em] text-white/80 transition hover:border-white/20 hover:bg-white/10 sm:rounded-[22px] sm:px-4 sm:py-4 sm:text-base"
          >
            Обновить
          </button>
        </section>
      </div>
    </div>
  );
}
