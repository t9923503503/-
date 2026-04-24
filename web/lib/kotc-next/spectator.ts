import { getPool } from '@/lib/db';
import { getTournamentById } from '@/lib/admin-queries';
import { normalizeKotcJudgeModule } from '@/lib/admin-legacy-sync';
import { isKotcNextFormat } from '@/lib/kotc-next-config';
import {
  getKotcNextOperatorStateSummary,
  type KotcNextError,
} from './service';
import type {
  KotcNextFunStats,
  KotcNextOperatorState,
  KotcNextSpectatorCourtView,
  KotcNextSpectatorPayload,
  KotcNextSpectatorRoundView,
} from './types';

export const KOTC_SPECTATOR_SNAPSHOT_COLUMN = 'kotc_spectator_snapshot';

function sanitizeKotcNextOperatorStateForSpectators(
  state: KotcNextOperatorState,
): Omit<
  KotcNextSpectatorPayload,
  'funStats' | 'viewSource' | 'snapshotCapturedAt'
> {
  const {
    canBootstrapR1: _b1,
    canFinishR1: _f1,
    canPreviewR2Seed: _p2,
    canConfirmR2Seed: _c2,
    canBootstrapR2: _b2,
    canFinishR2: _f2,
    r2SeedDraft: _draft,
    ...rest
  } = state;
  const rounds: KotcNextSpectatorRoundView[] = state.rounds.map((round) => ({
    roundId: round.roundId,
    roundNo: round.roundNo,
    roundType: round.roundType,
    status: round.status,
    courts: round.courts.map(
      ({ pinCode: _pin, judgeUrl: _judge, ...court }): KotcNextSpectatorCourtView => court,
    ),
  }));

  return {
    ...rest,
    rounds,
    finalResults: state.finalResults,
  };
}

function pickFunStats(state: KotcNextOperatorState): KotcNextFunStats | null {
  const pairMap = new Map<string, { pairLabel: string; kingWins: number; bestKingStreak: number; takeovers: number }>();

  for (const round of state.rounds) {
    for (const court of round.courts) {
      const sourceRows =
        court.liveState?.pairs ??
        court.raunds.flatMap((raund) => raund.standings ?? []);

      for (const row of sourceRows) {
        const pair = court.pairs.find((item) => item.pairIdx === row.pairIdx);
        if (!pair) continue;
        const key = pair.label;
        const current = pairMap.get(key) ?? {
          pairLabel: pair.label,
          kingWins: 0,
          bestKingStreak: 0,
          takeovers: 0,
        };
        current.kingWins += row.kingWins;
        current.bestKingStreak = Math.max(current.bestKingStreak, row.bestKingStreak ?? 0);
        current.takeovers += row.takeovers;
        pairMap.set(key, current);
      }
    }
  }

  const rows = [...pairMap.values()];
  if (!rows.length) return null;

  const kingslayer = [...rows].sort((a, b) => b.takeovers - a.takeovers || b.kingWins - a.kingWins)[0] ?? null;
  const stoneWall = [...rows].sort((a, b) => {
    const ratioA = a.kingWins / Math.max(1, a.takeovers);
    const ratioB = b.kingWins / Math.max(1, b.takeovers);
    return ratioB - ratioA || b.kingWins - a.kingWins;
  })[0] ?? null;
  const kingSideStreak = [...rows].sort((a, b) => b.bestKingStreak - a.bestKingStreak || b.kingWins - a.kingWins)[0] ?? null;

  return {
    kingslayer: kingslayer ? { pairLabel: kingslayer.pairLabel, takeovers: kingslayer.takeovers } : null,
    stoneWall: stoneWall
      ? {
          pairLabel: stoneWall.pairLabel,
          ratio: Number((stoneWall.kingWins / Math.max(1, stoneWall.takeovers)).toFixed(2)),
        }
      : null,
    kingSideStreak: kingSideStreak
      ? { pairLabel: kingSideStreak.pairLabel, consecutiveWins: kingSideStreak.bestKingStreak }
      : null,
    longestReign: kingSideStreak
      ? { pairLabel: kingSideStreak.pairLabel, consecutiveWins: kingSideStreak.bestKingStreak }
      : null,
  };
}

function isSnapshotPayload(value: unknown): value is KotcNextSpectatorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Array.isArray((value as { rounds?: unknown }).rounds);
}

function buildLivePayload(state: KotcNextOperatorState): KotcNextSpectatorPayload {
  return {
    ...sanitizeKotcNextOperatorStateForSpectators(state),
    funStats: pickFunStats(state),
    viewSource: 'live',
    snapshotCapturedAt: null,
  };
}

async function loadSnapshotPayload(tournamentId: string): Promise<KotcNextSpectatorPayload | null> {
  const { rows } = await getPool().query<{ kotc_spectator_snapshot: unknown }>(
    `SELECT kotc_spectator_snapshot FROM tournaments WHERE id = $1 LIMIT 1`,
    [tournamentId],
  );
  const raw = rows[0]?.kotc_spectator_snapshot ?? null;
  return isSnapshotPayload(raw) ? raw : null;
}

export async function persistKotcNextSpectatorSnapshot(tournamentId: string): Promise<boolean> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) return false;

  const state = await getKotcNextOperatorStateSummary(normalizedId);
  if (!state?.rounds?.length) return false;

  const payload: KotcNextSpectatorPayload = {
    ...buildLivePayload(state),
    viewSource: 'snapshot',
    snapshotCapturedAt: new Date().toISOString(),
  };

  await getPool().query(
    `UPDATE tournaments
     SET kotc_spectator_snapshot = $2::jsonb
     WHERE id = $1`,
    [normalizedId, JSON.stringify(payload)],
  );
  return true;
}

export async function getKotcNextSpectatorPayload(
  tournamentId: string,
): Promise<KotcNextSpectatorPayload | null> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) return null;

  const tournament = await getTournamentById(normalizedId);
  if (!tournament) return null;
  if (!isKotcNextFormat(tournament.format)) return null;
  if (normalizeKotcJudgeModule(tournament.kotcJudgeModule ?? tournament.settings?.kotcJudgeModule, 'legacy') !== 'next') {
    return null;
  }

  try {
    const state = await getKotcNextOperatorStateSummary(normalizedId);
    if (state?.rounds?.length) {
      return buildLivePayload(state);
    }
  } catch (error) {
    const maybeKotcError = error as KotcNextError | null;
    if (!maybeKotcError || typeof maybeKotcError !== 'object') {
      throw error;
    }
  }

  return loadSnapshotPayload(normalizedId);
}
