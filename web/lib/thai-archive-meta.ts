import {
  isExactThaiTournamentFormat,
  normalizeThaiJudgeModule,
  THAI_JUDGE_MODULE_NEXT,
} from '@/lib/thai-judge-config';
import { THAI_SPECTATOR_SNAPSHOT_KEY } from '@/lib/thai-spectator';
import { buildThaiSpectatorBoardUrl } from '@/lib/tournament-links';

/** Публичное табло Thai Next — одна и та же страница для live и архивного снимка. */
export function resolveThaiSpectatorBoardUrlForArchive(
  tournamentId: string,
  format: string,
  settings: Record<string, unknown> | null | undefined,
): string | null {
  const id = String(tournamentId || '').trim();
  if (!id) return null;
  if (!isExactThaiTournamentFormat(format)) return null;
  if (normalizeThaiJudgeModule(settings?.thaiJudgeModule) !== THAI_JUDGE_MODULE_NEXT) return null;
  return buildThaiSpectatorBoardUrl(id);
}

export function hasThaiSpectatorBoardSnapshot(settings: Record<string, unknown> | null | undefined): boolean {
  const snap = settings?.[THAI_SPECTATOR_SNAPSHOT_KEY];
  return Boolean(snap && typeof snap === 'object' && !Array.isArray(snap));
}

/** Дополняет запись архива ссылкой на табло и флагом снимка (без циклических импортов admin-queries). */
export function augmentArchiveTournamentWithThaiBoard<
  T extends { id: string; format: string; settings: Record<string, unknown> },
>(t: T): T & { thaiSpectatorBoardUrl: string | null; thaiSpectatorBoardHasSnapshot: boolean } {
  const thaiSpectatorBoardUrl = resolveThaiSpectatorBoardUrlForArchive(t.id, t.format, t.settings);
  const thaiSpectatorBoardHasSnapshot =
    Boolean(thaiSpectatorBoardUrl) && hasThaiSpectatorBoardSnapshot(t.settings);
  return { ...t, thaiSpectatorBoardUrl, thaiSpectatorBoardHasSnapshot };
}
