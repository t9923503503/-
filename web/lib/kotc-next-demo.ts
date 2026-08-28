import { getPool } from '@/lib/db';
import { getTournamentById } from '@/lib/admin-queries';
import { normalizeKotcJudgeModule } from '@/lib/admin-legacy-sync';
import { bootstrapKotcNextR1, getKotcNextOperatorStateSummary, resetKotcNextState } from '@/lib/kotc-next';
import {
  getKotcNextDemoSlug,
  isKotcNextDemoTournament,
  normalizeKotcNextDemoSlug,
} from '@/lib/kotc-next-demo-config';

type JsonObject = Record<string, unknown>;

export interface KotcNextDemoLink {
  courtId: string;
  courtNo: number;
  label: string;
  judgeUrl: string;
  pinCode: string;
}

export interface KotcNextDemoLandingData {
  tournamentId: string;
  slug: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  stage: string;
  courtCount: number;
  judgeLinks: KotcNextDemoLink[];
  spectatorUrl: string;
}

function normalizeSettings(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '');
}

async function findKotcNextDemoTournamentIdBySlug(slug: string): Promise<string | null> {
  const normalizedSlug = normalizeKotcNextDemoSlug(slug);
  if (!normalizedSlug || !process.env.DATABASE_URL) return null;

  const { rows } = await getPool().query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM tournaments
      WHERE COALESCE(settings->>'kotcNextDemoEnabled', 'false') = 'true'
        AND COALESCE(settings->>'kotcNextDemoSlug', '') = $1
      LIMIT 1
    `,
    [normalizedSlug],
  );

  return rows[0]?.id ? String(rows[0].id) : null;
}

function resolveDemoSeed(settings: unknown): number {
  const normalized = normalizeSettings(settings);
  const parsed = Math.trunc(Number(normalized.draftSeed) || 0);
  return parsed >= 1 ? parsed : 1;
}

export async function getKotcNextDemoLandingData(
  slug: string,
): Promise<KotcNextDemoLandingData | null> {
  const tournamentId = await findKotcNextDemoTournamentIdBySlug(slug);
  if (!tournamentId) return null;

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) return null;
  if (!isKotcNextDemoTournament({ format: tournament.format, settings: tournament.settings })) return null;
  if (normalizeKotcJudgeModule(tournament.kotcJudgeModule ?? tournament.settings?.kotcJudgeModule, 'legacy') !== 'next') {
    return null;
  }

  const state = await getKotcNextOperatorStateSummary(tournamentId).catch(() => null);
  const courts = state?.rounds.find((round) => round.roundNo === 1)?.courts ?? state?.rounds[0]?.courts ?? [];

  return {
    tournamentId,
    slug: getKotcNextDemoSlug(tournament.settings) ?? normalizeKotcNextDemoSlug(slug),
    tournamentName: tournament.name,
    tournamentDate: tournament.date,
    tournamentTime: tournament.time,
    tournamentLocation: tournament.location,
    stage: state?.stage ?? 'setup',
    courtCount: state?.params.courts ?? 0,
    judgeLinks: courts.map((court) => ({
      courtId: court.courtId,
      courtNo: court.courtNo,
      label: court.label,
      judgeUrl: court.judgeUrl,
      pinCode: court.pinCode,
    })),
    spectatorUrl: `/live/kotcn/${encodeURIComponent(tournamentId)}`,
  };
}

export async function resetKotcNextDemoTournament(
  slug: string,
): Promise<KotcNextDemoLandingData | null> {
  const tournamentId = await findKotcNextDemoTournamentIdBySlug(slug);
  if (!tournamentId) return null;

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) return null;
  if (!isKotcNextDemoTournament({ format: tournament.format, settings: tournament.settings })) return null;
  if (normalizeKotcJudgeModule(tournament.kotcJudgeModule ?? tournament.settings?.kotcJudgeModule, 'legacy') !== 'next') {
    return null;
  }

  await resetKotcNextState(tournamentId);
  await bootstrapKotcNextR1(tournamentId, { seed: resolveDemoSeed(tournament.settings) });

  return getKotcNextDemoLandingData(getKotcNextDemoSlug(tournament.settings) ?? slug);
}

export async function listKotcNextDemoTournaments(): Promise<Array<{ id: string; slug: string; name: string; date: string }>> {
  if (!process.env.DATABASE_URL) return [];
  const { rows } = await getPool().query<{
    id: string;
    name: string;
    date: unknown;
    settings: unknown;
  }>(
    `
      SELECT id::text AS id, name, date, settings
      FROM tournaments
      WHERE COALESCE(settings->>'kotcNextDemoEnabled', 'false') = 'true'
      ORDER BY date DESC NULLS LAST, name ASC
    `,
  );

  return rows
    .map((row) => ({
      id: String(row.id),
      slug: getKotcNextDemoSlug(row.settings) ?? '',
      name: String(row.name || ''),
      date: toIsoDate(row.date),
    }))
    .filter((row) => Boolean(row.slug));
}
