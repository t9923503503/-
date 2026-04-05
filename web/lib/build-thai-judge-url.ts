import {
  getThaiSeatCount,
  normalizeThaiAdminSettings,
} from './admin-legacy-sync';

export interface ThaiJudgeParams {
  mode: string;
  n: number;
  courts: number;
  tours: number;
  seed: number;
}

function normalizeThaiJudgeSeed(value: unknown, fallbackValue?: unknown): number {
  const seedRaw = parseInt(String(value ?? fallbackValue ?? '1'), 10);
  return Number.isFinite(seedRaw) && seedRaw > 0 ? seedRaw : 1;
}

function normalizeThaiJudgeBaseUrl(baseUrl?: string): string {
  const raw = String(baseUrl || '').trim();
  return raw ? raw.split(/[?#]/, 1)[0].replace(/\/+$/, '') : '';
}

export function resolveThaiJudgeParams(input: {
  settings: Record<string, unknown>;
  participantCount: number;
  seed?: unknown;
}): ThaiJudgeParams {
  const thai = normalizeThaiAdminSettings(input.settings, input.participantCount);
  const seats = getThaiSeatCount(thai.courts);
  const mode = String(thai.variant || 'MF').toUpperCase();
  const isDualPoolMode = mode === 'MF' || mode === 'MN';
  // thai.html: MF/MN use the size of one pool, MM/WW use the full player count.
  const n = Math.floor(isDualPoolMode ? seats / 2 : seats);

  return {
    mode,
    n,
    courts: thai.courts,
    tours: thai.tourCount,
    seed: normalizeThaiJudgeSeed(input.seed, input.settings?.['seed'] ?? input.settings?.['draftSeed']),
  };
}

/**
 * Relative path + query for the static Thai judge page (same origin as Next or Vite root).
 * Align with shared/format-links.js buildThaiFormatUrl semantics.
 */
export function buildThaiJudgeRelativeUrl(input: {
  settings: Record<string, unknown>;
  participantCount: number;
  tournamentId: string;
  seed?: unknown;
  baseUrl?: string;
}): string {
  const judge = resolveThaiJudgeParams(input);

  const params = new URLSearchParams({
    mode: judge.mode,
    n: String(judge.n),
    seed: String(judge.seed),
    courts: String(judge.courts),
    tours: String(judge.tours),
  });
  const trnId = String(input.tournamentId || '').trim();
  if (trnId) params.set('trnId', trnId);

  const baseUrl = normalizeThaiJudgeBaseUrl(input.baseUrl);
  return `${baseUrl ? `${baseUrl}/` : ''}formats/thai/thai.html?${params.toString()}`;
}
