'use client';

import { startTransition, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  SudyamBootstrapParticipant,
  SudyamBootstrapPayload,
} from "@/lib/sudyam-bootstrap";
import type {
  ThaiDrawPreview,
  ThaiR2SeedDraft,
  ThaiR2SeedZone,
} from '@/lib/thai-live/types';
import {
  buildSudyamLaunchUrl,
  getSudyamFormatLabel,
  type SudyamFormat,
} from "@/lib/sudyam-launch";
import { ThaiOperatorPanel, type ThaiOperatorBootstrapPhase, type ThaiOperatorPanelActionName } from '@/components/thai-live/ThaiOperatorPanel';

type ThaiBootstrapPhase = ThaiOperatorBootstrapPhase;
type ThaiActionName = ThaiOperatorPanelActionName;

interface ThaiBootstrapResponse {
  error?: string;
  code?: string;
}

function formatSchedule(date: string, time: string): string {
  const parts = [String(date || "").trim(), String(time || "").trim()].filter(Boolean);
  return parts.join(" ") || "Schedule not set";
}

function formatSettingValue(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((item) => formatSettingValue(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildSettingRows(settings: Record<string, unknown>): Array<{ key: string; value: string }> {
  return Object.entries(settings)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => ({
      key,
      value: formatSettingValue(value),
    }));
}

function orderIptParticipants(
  participants: SudyamBootstrapParticipant[],
  legacyGameState: Record<string, unknown> | null,
): SudyamBootstrapParticipant[] {
  const participantIds = Array.isArray(legacyGameState?.participants)
    ? legacyGameState.participants.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  if (!participantIds.length) return participants;

  const byId = new Map(participants.map((participant) => [participant.playerId, participant]));
  const ordered = participantIds
    .map((playerId) => byId.get(playerId))
    .filter((participant): participant is SudyamBootstrapParticipant => Boolean(participant));

  return ordered.length ? ordered : participants;
}

function renderParticipantGrid(participants: SudyamBootstrapParticipant[]) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {participants.map((participant, index) => (
        <div
          key={`${participant.playerId || participant.playerName}-${index}`}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
        >
          <div className="text-sm font-semibold text-white">{participant.playerName || participant.playerId}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-text-secondary">
            {participant.gender}
            {participant.isWaitlist ? " вЂў WAITLIST" : ""}
            {participant.playerId ? ` - ${participant.playerId}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderIptOverview(data: SudyamBootstrapPayload) {
  const orderedParticipants = orderIptParticipants(
    data.bootstrapState.participants,
    data.bootstrapState.legacyGameState,
  );
  const iptState =
    data.bootstrapState.legacyGameState &&
    typeof data.bootstrapState.legacyGameState.ipt === "object" &&
    data.bootstrapState.legacyGameState.ipt
      ? (data.bootstrapState.legacyGameState.ipt as Record<string, unknown>)
      : {};
  const courts = Math.max(1, Number(iptState.courts ?? data.bootstrapState.settings.courts ?? 1) || 1);
  const perCourt = Math.max(1, Math.ceil(orderedParticipants.length / courts) || 1);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-5">
        <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/80">IPT Bootstrap</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">Courts</div>
            <div className="mt-2 text-2xl font-semibold text-white">{courts}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">Point Limit</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {formatSettingValue(iptState.pointLimit ?? data.bootstrapState.settings.iptPointLimit)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">Finish Type</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {formatSettingValue(iptState.finishType ?? data.bootstrapState.settings.iptFinishType)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: courts }, (_, index) => {
          const slice = orderedParticipants.slice(index * perCourt, (index + 1) * perCourt);
          return (
            <section
              key={`ipt-court-${index + 1}`}
              className="rounded-3xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Court {index + 1}</h2>
                <span className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">
                  {slice.length} players
                </span>
              </div>
              <div className="mt-4">{renderParticipantGrid(slice)}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function renderThaiSudyamOverview(
  data: SudyamBootstrapPayload,
  bootstrap: {
    phase: ThaiBootstrapPhase;
    message: string | null;
    onRetry: () => void;
    onOpenPreview: () => void;
    drawPreview: ThaiDrawPreview | null;
    drawPreviewLoading: boolean;
    onConfirmPreview: (seed?: number) => void;
  },
  actions: {
    pendingAction: ThaiActionName | null;
    onAction: (action: ThaiActionName) => void;
    r2SeedDraft: ThaiR2SeedDraft | null;
    r2SeedLoading: boolean;
    onOpenR2Seed: () => void;
    onConfirmR2Seed: (zones: ThaiR2SeedZone[]) => void;
  },
) {
  return (
    <ThaiOperatorPanel data={data} bootstrap={bootstrap} actions={actions} />
  );
}
function renderStaticFormatSummary(
  data: SudyamBootstrapPayload,
  format: SudyamFormat,
  kotcBaseUrl: string,
  bootstrap: {
    phase: ThaiBootstrapPhase;
    message: string | null;
    onRetry: () => void;
    onOpenPreview: () => void;
    drawPreview: ThaiDrawPreview | null;
    drawPreviewLoading: boolean;
    onConfirmPreview: (seed?: number) => void;
  },
) {
  if (format === "ipt") {
    return renderIptOverview(data);
  }
  if (format === "thai") {
    void kotcBaseUrl;
    return renderThaiSudyamOverview(data, bootstrap, {
      pendingAction: null,
      onAction: () => {},
      r2SeedDraft: null,
      r2SeedLoading: false,
      onOpenR2Seed: () => {},
      onConfirmR2Seed: () => {},
    });
  }

  const tone =
    format === "rr"
      ? "border-amber-500/20 bg-amber-500/10"
      : "border-emerald-500/20 bg-emerald-500/10";

  return (
    <div className="space-y-4">
      <div className={`rounded-3xl border p-5 ${tone}`}>
        <div className="text-[11px] uppercase tracking-[0.28em] text-text-secondary">
          {getSudyamFormatLabel(format)} Workspace
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-text-primary/85">
          This Sudyam entrypoint is now format-aware. It opens the tournament in its own workspace instead of
          dropping back into the old KOTC shell. The bootstrap below is built from the current tournament data.
        </p>
      </div>
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Participants</h2>
          <span className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">
            {data.bootstrapState.participants.length} total
          </span>
        </div>
        <div className="mt-4">{renderParticipantGrid(data.bootstrapState.participants)}</div>
      </section>
    </div>
  );
}

export function SudyamFormatWorkspace({
  data,
  kotcBaseUrl,
  legacyIframeSrc,
  initialLegacyMode = false,
}: {
  data: SudyamBootstrapPayload;
  kotcBaseUrl: string;
  legacyIframeSrc: string;
  initialLegacyMode?: boolean;
}) {
  const router = useRouter();
  const [activeData, setActiveData] = useState(data);
  const [bootstrapPhase, setBootstrapPhase] = useState<ThaiBootstrapPhase>('idle');
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const [pendingThaiAction, setPendingThaiAction] = useState<ThaiActionName | null>(null);
  const [drawPreview, setDrawPreview] = useState<ThaiDrawPreview | null>(null);
  const [drawPreviewLoading, setDrawPreviewLoading] = useState(false);
  const [r2SeedDraft, setR2SeedDraft] = useState<ThaiR2SeedDraft | null>(null);
  const [r2SeedLoading, setR2SeedLoading] = useState(false);
  const { tournament, settings } = activeData.bootstrapState;
  const canonicalUrl = buildSudyamLaunchUrl({
    tournamentId: activeData.tournamentId,
    format: activeData.format,
  });
  const legacyUrl =
    activeData.thaiJudgeLegacyUrl ||
    activeData.fallbackLegacyUrl ||
    buildSudyamLaunchUrl({
      tournamentId: activeData.tournamentId,
      format: activeData.format,
      legacy: true,
    });
  const settingRows = buildSettingRows(settings);

  useEffect(() => {
    setActiveData(data);
    setBootstrapMessage(null);
    setPendingThaiAction(null);
    setDrawPreview(null);
    setDrawPreviewLoading(false);
    setR2SeedDraft(null);
    setR2SeedLoading(false);
    setBootstrapPhase(data.thaiJudgeBlockedReason ? 'blocked' : 'idle');
  }, [data]);

  async function bootstrapThaiJudge(seed?: number) {
    if (activeData.format !== 'thai' || activeData.thaiJudgeModule !== 'next') {
      return;
    }
    if (activeData.thaiJudgeBlockedReason) {
      setBootstrapPhase('blocked');
      setBootstrapMessage(activeData.thaiJudgeBlockedReason);
      return;
    }

    setBootstrapPhase('bootstrapping');
    setBootstrapMessage('Preparing Thai judge courts...');

    try {
      const response = await fetch(
        '/api/sudyam/bootstrap',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tournamentId: activeData.tournamentId,
            format: activeData.format,
            seed,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as ThaiBootstrapResponse & Partial<SudyamBootstrapPayload>;

      if (response.status === 409) {
        const message = payload.error || 'Launch blocked';
        setBootstrapPhase('blocked');
        setBootstrapMessage(message);
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Bootstrap failed');
      }

      if (payload && typeof payload === 'object') {
        setActiveData((previous) => ({
          ...previous,
          ...payload,
          thaiJudgeNeedsBootstrap: false,
          thaiJudgeBlockedReason: payload.thaiJudgeBlockedReason ?? previous.thaiJudgeBlockedReason,
        }));
      }

      setBootstrapPhase('idle');
      setBootstrapMessage(null);
      setDrawPreview(null);
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      const message =
        typeof window !== 'undefined' && !window.navigator.onLine
          ? 'No network. Waiting for connection...'
          : error instanceof Error && error.message
            ? error.message
            : 'No network. Waiting for connection...';
      setBootstrapPhase('error');
      setBootstrapMessage(message);
    }
  }

  async function requestDrawPreview(seed?: number) {
    if (activeData.format !== 'thai' || activeData.thaiJudgeModule !== 'next') return;
    setDrawPreviewLoading(true);
    setBootstrapMessage(null);
    try {
      const response = await fetch('/api/sudyam/thai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: activeData.tournamentId,
          action: 'preview_draw',
          seed,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        preview?: ThaiDrawPreview;
      };
      if (!response.ok || !payload.preview) {
        throw new Error(payload.error || 'Preview draw failed');
      }
      setDrawPreview(payload.preview);
    } catch (error) {
      setBootstrapPhase('error');
      setBootstrapMessage(error instanceof Error ? error.message : 'Preview draw failed');
    } finally {
      setDrawPreviewLoading(false);
    }
  }

  async function requestR2SeedDraft() {
    if (activeData.format !== 'thai' || activeData.thaiJudgeModule !== 'next') return;
    setR2SeedLoading(true);
    setBootstrapMessage(null);
    try {
      const response = await fetch('/api/sudyam/thai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: activeData.tournamentId,
          action: 'preview_r2_seed',
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        r2SeedDraft?: ThaiR2SeedDraft;
      };
      if (!response.ok || !payload.r2SeedDraft) {
        throw new Error(payload.error || 'R2 seed preview failed');
      }
      setR2SeedDraft(payload.r2SeedDraft);
    } catch (error) {
      setBootstrapPhase('error');
      setBootstrapMessage(error instanceof Error ? error.message : 'R2 seed preview failed');
    } finally {
      setR2SeedLoading(false);
    }
  }

  async function confirmR2Seed(zones: ThaiR2SeedZone[]) {
    if (activeData.format !== 'thai' || activeData.thaiJudgeModule !== 'next') return;
    setR2SeedLoading(true);
    setBootstrapMessage(null);
    try {
      const response = await fetch('/api/sudyam/thai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: activeData.tournamentId,
          action: 'confirm_r2_seed',
          zones,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        state?: unknown;
        judgeState?: unknown;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'R2 seed confirm failed');
      }
      setActiveData((previous) => ({
        ...previous,
        thaiOperatorState: payload.state as typeof previous.thaiOperatorState,
        thaiJudgeState: payload.judgeState as typeof previous.thaiJudgeState,
        thaiJudgeNeedsBootstrap: false,
      }));
      setR2SeedDraft(null);
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setBootstrapPhase('error');
      setBootstrapMessage(error instanceof Error ? error.message : 'R2 seed confirm failed');
    } finally {
      setR2SeedLoading(false);
    }
  }

  async function runThaiAction(action: ThaiActionName) {
    if (activeData.format !== 'thai' || activeData.thaiJudgeModule !== 'next') return;
    setPendingThaiAction(action);
    setBootstrapMessage(null);
    try {
      const response = await fetch('/api/sudyam/thai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: activeData.tournamentId,
          action,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        state?: unknown;
        judgeState?: unknown;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Thai action failed');
      }

      setActiveData((previous) => ({
        ...previous,
        thaiOperatorState:
          payload && typeof payload === 'object' && 'state' in payload
            ? (payload.state as typeof previous.thaiOperatorState)
            : previous.thaiOperatorState,
        thaiJudgeState:
          payload && typeof payload === 'object' && 'judgeState' in payload
            ? (payload.judgeState as typeof previous.thaiJudgeState)
            : previous.thaiJudgeState,
        thaiJudgeNeedsBootstrap: false,
      }));
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setBootstrapMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Thai action failed',
      );
      setBootstrapPhase('error');
    } finally {
      setPendingThaiAction(null);
    }
  }

  if (initialLegacyMode) {
    return (
      <div className="relative h-[100dvh] w-full overflow-hidden bg-[#050914] text-text-primary">
        <iframe
          src={legacyIframeSrc}
          className="h-full w-full border-0 bg-[#050914]"
          title={`${getSudyamFormatLabel(activeData.format)} legacy workspace`}
          allow="clipboard-write"
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end px-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/12 bg-[rgba(4,8,18,0.72)] px-2 py-2 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <a
              href={canonicalUrl}
              className="rounded-full border border-brand/30 bg-brand/15 px-3 py-1.5 text-[11px] font-medium text-brand-light transition hover:border-brand/50 hover:bg-brand/20"
            >
              New Workspace
            </a>
            <a
              href="/"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-text-secondary transition hover:border-white/20 hover:text-white"
            >
              LPVOLLEY
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (activeData.format === 'thai') {
    const thaiVariant = String(
      activeData.thaiJudgeState?.variant ??
      activeData.thaiJudgeParams?.mode ??
      activeData.bootstrapState.settings.thaiVariant ??
      ''
    ).trim().toUpperCase();
    const showLegacyLink = activeData.thaiJudgeModule === 'legacy';

    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_16%),linear-gradient(180deg,#080813,#0b0b16_28%,#090913)] text-text-primary">
        <header className="border-b border-white/8 bg-[rgba(7,7,16,0.92)]">
          <div className="mx-auto flex max-w-[1040px] flex-col gap-4 px-4 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#8f7c4a]">Sudyam / Thai</div>
              <h1 className="mt-2 font-heading text-3xl uppercase tracking-[0.08em] text-[#ffd24a] sm:text-4xl">
                {activeData.title}
              </h1>
              <div className="mt-2 text-sm text-[#99a1b4]">
                {formatSchedule(tournament.date, tournament.time)}
                {tournament.location ? ` - ${tournament.location}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {thaiVariant ? (
                <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
                  {thaiVariant}
                </span>
              ) : null}
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                {tournament.status || "draft"}
              </span>
              {showLegacyLink ? (
                <a
                  href={legacyUrl}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#cbd2e1] transition hover:border-white/20 hover:bg-white/10"
                >
                  Legacy
                </a>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1040px] px-4 py-6 pb-12">
          {renderThaiSudyamOverview(activeData, {
            phase: bootstrapPhase,
            message: bootstrapMessage,
            onRetry: () => void bootstrapThaiJudge(drawPreview?.seed),
            onOpenPreview: () => void requestDrawPreview(drawPreview ? drawPreview.seed + 1 : undefined),
            drawPreview,
            drawPreviewLoading,
            onConfirmPreview: (seed) => void bootstrapThaiJudge(seed),
          }, {
            pendingAction: pendingThaiAction,
            onAction: (action) => {
              void runThaiAction(action);
            },
            r2SeedDraft,
            r2SeedLoading,
            onOpenR2Seed: () => void requestR2SeedDraft(),
            onConfirmR2Seed: (zones) => void confirmR2Seed(zones),
          })}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_26%),linear-gradient(180deg,#050914,#08101d)] text-text-primary">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[rgba(4,8,18,0.86)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.32em] text-text-secondary">
              Sudyam / {getSudyamFormatLabel(activeData.format)}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">{activeData.title}</h1>
            <div className="mt-2 text-sm text-text-secondary">
              {formatSchedule(tournament.date, tournament.time)}
              {tournament.location ? ` - ${tournament.location}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-text-secondary">
              {tournament.status || "draft"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-text-secondary">
              {tournament.division || "division n/a"}
            </span>
            <a
              href={legacyUrl}
              className="rounded-full border border-brand/30 bg-brand/15 px-3 py-1.5 text-xs font-medium text-brand-light transition hover:border-brand/50 hover:bg-brand/20"
            >
              Legacy Fallback
            </a>
            </div>
          </div>
        </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 pb-12">
        <section className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-[11px] uppercase tracking-[0.28em] text-text-secondary">Overview</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">Format</div>
                <div className="mt-2 text-xl font-semibold text-white">{getSudyamFormatLabel(activeData.format)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">Participants</div>
                <div className="mt-2 text-xl font-semibold text-white">{tournament.participantCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">Capacity</div>
                <div className="mt-2 text-xl font-semibold text-white">{tournament.capacity}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">Tournament ID</div>
                <div className="mt-2 break-all text-sm font-medium text-white">{activeData.tournamentId}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-[11px] uppercase tracking-[0.28em] text-text-secondary">Settings</div>
            {settingRows.length ? (
              <div className="mt-4 space-y-3">
                {settingRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                  >
                    <div className="text-xs uppercase tracking-[0.22em] text-text-secondary">{row.key}</div>
                    <div className="max-w-[60%] break-words text-right text-sm text-white">{row.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-text-secondary">No additional settings saved for this tournament.</p>
            )}
          </div>
        </section>

        {renderStaticFormatSummary(activeData, activeData.format, kotcBaseUrl, {
          phase: bootstrapPhase,
          message: bootstrapMessage,
          onRetry: () => void bootstrapThaiJudge(drawPreview?.seed),
          onOpenPreview: () => void requestDrawPreview(drawPreview ? drawPreview.seed + 1 : undefined),
          drawPreview,
          drawPreviewLoading,
          onConfirmPreview: (seed) => void bootstrapThaiJudge(seed),
        })}
      </main>
    </div>
  );
}
