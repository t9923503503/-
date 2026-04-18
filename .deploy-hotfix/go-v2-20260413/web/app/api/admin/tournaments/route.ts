import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import {
  createTournament,
  deleteTournament,
  getPlayersByIds,
  getTournamentById,
  listTournaments,
  updateTournament,
} from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { normalizeTournamentInput, validateTournamentInput } from '@/lib/admin-validators';
import { adminErrorResponse } from '@/lib/admin-errors';
import { isGoAdminFormat, normalizeGoAdminSettings } from '@/lib/admin-legacy-sync';
import { validateGoSetup } from '@/lib/go-next-config';
import {
  THAI_JUDGE_MODULE_LEGACY,
  THAI_JUDGE_MODULE_NEXT,
  THAI_NEXT_JUDGE_DEFAULT_COURTS,
  THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT,
  THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
  inferThaiJudgeModuleFromSettings,
  isExactThaiTournamentFormat,
  normalizeThaiJudgeBootstrapSignature,
  normalizeThaiJudgeModule,
  validateThaiNextStructuralLock,
  validateThaiNextTournamentSetup,
} from '@/lib/thai-judge-config';

export const dynamic = 'force-dynamic';

function toFiniteInt(value: unknown): number | null {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeThaiJudgeSettings(
  settings: Record<string, unknown>,
  options: {
    isNew: boolean;
    existingSettings?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const existingSettings = options.existingSettings ?? {};
  if (!options.isNew && !Object.keys(settings).length && Object.keys(existingSettings).length) {
    settings = { ...existingSettings };
  }

  const fallbackModule = options.isNew
    ? THAI_JUDGE_MODULE_NEXT
    : inferThaiJudgeModuleFromSettings(existingSettings, THAI_JUDGE_MODULE_LEGACY);
  const normalizedModule = normalizeThaiJudgeModule(settings.thaiJudgeModule, fallbackModule);
  const courts =
    toFiniteInt(settings.courts) ??
    toFiniteInt(existingSettings.courts) ??
    THAI_NEXT_JUDGE_DEFAULT_COURTS;
  const tourCount =
    toFiniteInt(settings.tourCount ?? settings.tours ?? settings.stageCount) ??
    toFiniteInt(existingSettings.tourCount ?? existingSettings.tours ?? existingSettings.stageCount) ??
    THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT;

  return {
    ...existingSettings,
    ...settings,
    courts,
    tourCount,
    thaiJudgeModule: normalizedModule,
    thaiJudgeBootstrapSignature: normalizeThaiJudgeBootstrapSignature(
      settings.thaiJudgeBootstrapSignature ?? existingSettings.thaiJudgeBootstrapSignature,
    ),
  };
}

function stripThaiJudgeSettings(settings: Record<string, unknown>): Record<string, unknown> {
  if (!settings || typeof settings !== 'object') return {};
  const nextSettings = { ...settings };
  delete nextSettings.thaiJudgeModule;
  delete nextSettings.thaiJudgeBootstrapSignature;
  return nextSettings;
}

async function validateThaiNextSaveInput(
  input: ReturnType<typeof normalizeTournamentInput>,
): Promise<string | null> {
  const orderedParticipants = [...(input.participants ?? [])].sort((left, right) => left.position - right.position);
  const playerIds = orderedParticipants.map((participant) => participant.playerId).filter(Boolean);
  const players = await getPlayersByIds(playerIds);
  const playersById = new Map(players.map((player) => [player.id, player]));

  if (playersById.size !== playerIds.length) {
    return 'Thai Next judge module could not resolve all roster players';
  }

  return validateThaiNextTournamentSetup({
    format: input.format,
    settings: input.settings,
    participants: orderedParticipants.map((participant) => ({
      playerId: participant.playerId,
      position: participant.position,
      isWaitlist: participant.isWaitlist,
      gender: playersById.get(participant.playerId)?.gender ?? 'M',
    })),
  });
}

async function validateGoSaveInput(
  input: ReturnType<typeof normalizeTournamentInput>,
): Promise<string | null> {
  const orderedParticipants = [...(input.participants ?? [])]
    .filter((participant) => !participant.isWaitlist)
    .sort((left, right) => left.position - right.position);
  const playerIds = orderedParticipants.map((participant) => participant.playerId).filter(Boolean);
  const players = await getPlayersByIds(playerIds);
  const playersById = new Map(players.map((player) => [player.id, player]));

  if (playersById.size !== playerIds.length) {
    return 'GO could not resolve all roster players';
  }

  const settings = normalizeGoAdminSettings(input.settings, orderedParticipants.length);
  const structuralError = validateGoSetup(settings, orderedParticipants.length);
  if (structuralError) return structuralError;
  if (orderedParticipants.length % 2 !== 0) return 'GO requires an even number of participants';

  const normalizedDivision = String(input.division || '').trim().toLowerCase();
  for (let index = 0; index < orderedParticipants.length; index += 2) {
    const left = playersById.get(orderedParticipants[index]?.playerId ?? '');
    const right = playersById.get(orderedParticipants[index + 1]?.playerId ?? '');
    if (!left || !right) return 'GO teams must be formed from complete pairs';
    const genders = [String(left.gender ?? 'M').toUpperCase(), String(right.gender ?? 'M').toUpperCase()].sort().join('');
    if ((normalizedDivision.includes('mix') || normalizedDivision.includes('микс')) && genders !== 'MW') {
      return 'Mixed GO requires M/W pairs in roster order';
    }
    if ((normalizedDivision.includes('жен') || normalizedDivision.includes('women')) && genders !== 'WW') {
      return 'Women GO requires W/W pairs in roster order';
    }
    if (!normalizedDivision.includes('mix') && !normalizedDivision.includes('микс') && !normalizedDivision.includes('жен') && genders !== 'MM') {
      return 'Men GO requires M/M pairs in roster order';
    }
  }

  return null;
}

function structuralLockResponse(error: string) {
  return NextResponse.json(
    {
      error,
      code: THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
    },
    { status: 409 },
  );
}

async function prepareTournamentInput(
  body: Record<string, unknown>,
  options: { isNew: boolean },
): Promise<{
  input: ReturnType<typeof normalizeTournamentInput>;
  existingTournament: Awaited<ReturnType<typeof getTournamentById>> | null;
}> {
  const normalized = normalizeTournamentInput(body);
  const existingTournament = !options.isNew && normalized.id ? await getTournamentById(normalized.id) : null;
  const normalizedSettings = isExactThaiTournamentFormat(normalized.format)
    ? normalizeThaiJudgeSettings(normalized.settings, {
        isNew: options.isNew,
        existingSettings: existingTournament?.settings,
      })
    : stripThaiJudgeSettings(normalized.settings);

  return {
    input: {
      ...normalized,
      settings: normalizedSettings,
    },
    existingTournament,
  };
}

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const q = req.nextUrl.searchParams.get('q') ?? '';
    const data = await listTournaments(q);
    return NextResponse.json(data);
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { input } = await prepareTournamentInput(body, { isNew: true });
    const err = validateTournamentInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    if (isGoAdminFormat(input.format)) {
      const goError = await validateGoSaveInput(input);
      if (goError) return NextResponse.json({ error: goError }, { status: 400 });
    }
    if (isExactThaiTournamentFormat(input.format) && input.settings.thaiJudgeModule === THAI_JUDGE_MODULE_NEXT) {
      const thaiNextError = await validateThaiNextSaveInput(input);
      if (thaiNextError) return NextResponse.json({ error: thaiNextError }, { status: 400 });
    }

    const created = await createTournament(input);
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.create',
      entityType: 'tournament',
      entityId: created.id,
      afterState: created,
      reason: input.reason,
    });
    return NextResponse.json(created);
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.post');
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { input, existingTournament } = await prepareTournamentInput(body, { isNew: false });
    const id = input.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const err = validateTournamentInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    if (isGoAdminFormat(input.format)) {
      const goError = await validateGoSaveInput(input);
      if (goError) return NextResponse.json({ error: goError }, { status: 400 });
    }

    const before = existingTournament ?? (await getTournamentById(id));
    const beforeStatus = String(before?.status || '').toLowerCase();
    let thaiNextAutoReset: Awaited<
      ReturnType<typeof import('@/lib/thai-live').resetThaiJudgeState>
    > | null = null;
    const thaiNextLockError = validateThaiNextStructuralLock({
      currentTournament: before,
      nextTournament: {
        format: input.format,
        settings: input.settings,
        participants: input.participants ?? [],
      },
    });
    if (thaiNextLockError) {
      if (beforeStatus === 'open') {
        const { resetThaiJudgeState } = await import('@/lib/thai-live');
        thaiNextAutoReset = await resetThaiJudgeState(id);
      } else {
        return structuralLockResponse(thaiNextLockError.message);
      }
    }
    const nextInput =
      thaiNextAutoReset && isExactThaiTournamentFormat(input.format)
        ? {
            ...input,
            settings: {
              ...input.settings,
              thaiJudgeBootstrapSignature: null,
            },
          }
        : input;

    if (isExactThaiTournamentFormat(nextInput.format) && nextInput.settings.thaiJudgeModule === THAI_JUDGE_MODULE_NEXT) {
      const thaiNextError = await validateThaiNextSaveInput(nextInput);
      if (thaiNextError) return NextResponse.json({ error: thaiNextError }, { status: 400 });
    }

    const wasFinished = String(before?.status || '').toLowerCase() === 'finished';
    const nowFinished = String(nextInput.status || '').toLowerCase() === 'finished';
    if (!wasFinished && nowFinished) {
      const { isThaiNextTournamentForRatingSync, syncThaiStandingsToTournamentResultsOrThrowBadRequest } =
        await import('@/lib/thai-live/sync-tournament-results');
      if (isThaiNextTournamentForRatingSync(nextInput)) {
        await syncThaiStandingsToTournamentResultsOrThrowBadRequest(id);
      }
    }
    const updated = await updateTournament(id, nextInput);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.update',
      entityType: 'tournament',
      entityId: id,
      beforeState: before,
      afterState: thaiNextAutoReset
        ? {
            tournament: updated,
            thaiNextAutoReset,
          }
        : updated,
      reason: nextInput.reason,
    });
    if (!wasFinished && nowFinished) {
      const { persistThaiSpectatorBoardSnapshot } = await import('@/lib/thai-spectator');
      void persistThaiSpectatorBoardSnapshot(id).catch(() => {});
    }
    return NextResponse.json(updated);
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.put');
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeTournamentInput(body);
    const id = input.id;
    const reason = input.reason;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    if (!reason) return NextResponse.json({ error: 'Reason is required' }, { status: 400 });

    const before = await getTournamentById(id);
    const ok = await deleteTournament(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.delete',
      entityType: 'tournament',
      entityId: id,
      beforeState: before,
      reason,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.delete');
  }
}
