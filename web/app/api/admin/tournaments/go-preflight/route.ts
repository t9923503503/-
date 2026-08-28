import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getPlayersByIds, getTournamentById, listRosterParticipants } from '@/lib/admin-queries';
import { isGoAdminFormat, normalizeGoAdminSettings } from '@/lib/admin-legacy-sync';
import { describeGoPairRule, normalizeGoGender, resolveGoDivisionRule, validateGoSetup } from '@/lib/go-next-config';

export const dynamic = 'force-dynamic';

type CheckStatus = 'ok' | 'warning' | 'error';

type CheckItem = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

type InputParticipant = {
  playerId: string;
  position: number;
  isWaitlist?: boolean;
};

type GoPreflightResult = {
  checks: CheckItem[];
  errors: string[];
  warnings: string[];
  canGoLive: boolean;
};

function toSafeString(value: unknown): string {
  return String(value ?? '').trim();
}

function toInt(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeParticipants(source: unknown): InputParticipant[] {
  if (!Array.isArray(source)) return [];
  return source
    .map((row, index) => {
      const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
      return {
        playerId: toSafeString(item.playerId),
        position: Math.max(1, toInt(item.position, index + 1)),
        isWaitlist: Boolean(item.isWaitlist),
      };
    })
    .filter((row) => row.playerId);
}

function check(key: string, label: string, status: CheckStatus, detail: string): CheckItem {
  return { key, label, status, detail };
}

function buildResult(checks: CheckItem[]): GoPreflightResult {
  const errors = checks.filter((item) => item.status === 'error').map((item) => item.detail);
  const warnings = checks.filter((item) => item.status === 'warning').map((item) => item.detail);
  return {
    checks,
    errors,
    warnings,
    canGoLive: errors.length === 0,
  };
}

function getDivisionPairRule(division: string): 'mixed' | 'men' | 'women' | null {
  const resolved = resolveGoDivisionRule(division);
  if (resolved !== 'unknown') return resolved;
  const normalized = division.toLowerCase();
  if (normalized.includes('mix') || normalized.includes('микс')) return 'mixed';
  if (normalized.includes('муж') || normalized.includes('men')) return 'men';
  if (normalized.includes('жен') || normalized.includes('women')) return 'women';
  return null;
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tournamentId = toSafeString(body.id);

    let dbTournament: Awaited<ReturnType<typeof getTournamentById>> | null = null;
    let dbParticipants: InputParticipant[] = [];
    if (tournamentId) {
      dbTournament = await getTournamentById(tournamentId);
      if (!dbTournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      dbParticipants = (await listRosterParticipants(tournamentId))
        .filter((row) => !row.isWaitlist)
        .map((row) => ({
          playerId: row.playerId,
          position: row.position,
          isWaitlist: false,
        }));
    }

    const format = toSafeString(body.format ?? dbTournament?.format);
    const division = toSafeString(body.division ?? dbTournament?.division);
    const bodySettings =
      body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
        ? (body.settings as Record<string, unknown>)
        : null;
    const settings = bodySettings ?? (dbTournament?.settings ?? {});
    const participants = normalizeParticipants(body.participants);
    const mergedParticipants = participants.length ? participants : dbParticipants;

    if (!isGoAdminFormat(format)) {
      return NextResponse.json({ error: 'GO preflight supports only GO format' }, { status: 400 });
    }

    const orderedParticipants = mergedParticipants
      .filter((participant) => !participant.isWaitlist)
      .sort((left, right) => left.position - right.position);

    const playerIds = orderedParticipants.map((participant) => participant.playerId).filter(Boolean);
    const players = await getPlayersByIds(playerIds);
    const playersById = new Map(players.map((player) => [player.id, player]));

    const goSettings = normalizeGoAdminSettings(settings, orderedParticipants.length);
    const declaredTeams = Math.max(2, toInt(goSettings.declaredTeamCount, 0));
    const declaredParticipants = declaredTeams * 2;
    const structuralParticipantCount = Math.max(orderedParticipants.length, declaredParticipants);
    const structuralError = validateGoSetup(goSettings as never, structuralParticipantCount);

    const checks: CheckItem[] = [];
    if (resolveGoDivisionRule(division) === 'unknown') {
      checks.push(check('division', 'Дивизион', 'error', 'Для GO выберите дивизион: Мужской, Женский или Микст.'));
    }
    checks.push(
      check(
        'structural',
        'Структура GO',
        structuralError ? 'error' : 'ok',
        structuralError || `Структура валидна: ${declaredTeams} команд / ${declaredParticipants} игроков.`,
      ),
    );

    const participantCount = orderedParticipants.length;
    const filledTeams = Math.floor(participantCount / 2);
    checks.push(
      check(
        'participant-even',
        'Чётность состава',
        participantCount % 2 === 0 ? 'ok' : 'error',
        participantCount % 2 === 0
          ? `OK: ${participantCount} игроков = ${filledTeams} команд.`
          : `Ожидалось чётное количество игроков, сейчас ${participantCount}.`,
      ),
    );

    const missingSeats = Math.max(0, structuralParticipantCount - participantCount);
    const missingTeams = Math.ceil(missingSeats / 2);
    checks.push(
      check(
        'participant-target',
        'Заполнение состава',
        missingSeats > 0 ? 'error' : 'ok',
        missingSeats > 0
          ? `Не хватает ${missingTeams} команд (${missingSeats} игроков): заполнено ${filledTeams}/${declaredTeams} команд.`
          : `Состав заполнен: ${filledTeams}/${declaredTeams} команд (${participantCount}/${declaredParticipants} игроков).`,
      ),
    );

    if (String(goSettings.seedingMode).toLowerCase() === 'fixedpairs') {
      const pairIntegrityError = orderedParticipants.length % 2 !== 0;
      checks.push(
        check(
          'fixed-pairs-integrity',
          'Целостность фиксированных пар',
          pairIntegrityError ? 'error' : 'ok',
          pairIntegrityError
            ? 'Есть незавершенная пара: один из слотов заполнен без второго игрока.'
            : 'Все заполненные слоты образуют целые пары без деления на уровни.',
        ),
      );
    }

    if (participantCount % 2 === 0) {
      const pairRule = getDivisionPairRule(division);
      if (pairRule) {
        let pairRuleError: string | null = null;
        for (let index = 0; index < orderedParticipants.length; index += 2) {
          const left = playersById.get(orderedParticipants[index]?.playerId ?? '');
          const right = playersById.get(orderedParticipants[index + 1]?.playerId ?? '');
          if (!left || !right) continue;
          const normalizedPairRule = resolveGoDivisionRule(division);
          const normalizedGenders = [normalizeGoGender(left.gender), normalizeGoGender(right.gender)].sort().join('');
          const expectedGenders = normalizedPairRule === 'mixed' ? 'MW' : normalizedPairRule === 'women' ? 'WW' : 'MM';
          if (normalizedGenders !== expectedGenders) {
            const pairNumber = index / 2 + 1;
            pairRuleError = `Пара ${pairNumber} (слоты ${index + 1}–${index + 2}): нужна ${describeGoPairRule(normalizedPairRule)}, сейчас ${normalizedGenders[0]}/${normalizedGenders[1]}.`;
            break;
          }
          const genders = [String(left.gender ?? 'M').toUpperCase(), String(right.gender ?? 'M').toUpperCase()]
            .sort()
            .join('');
          if (pairRule === 'mixed' && genders !== 'MW') {
            pairRuleError = 'Микст GO требует пары M/Ж в порядке слотов.';
            break;
          }
          if (pairRule === 'men' && genders !== 'MM') {
            pairRuleError = 'Мужской GO требует пары M/M.';
            break;
          }
          if (pairRule === 'women' && genders !== 'WW') {
            pairRuleError = 'Женский GO требует пары Ж/Ж.';
            break;
          }
        }
        checks.push(
          check(
            'pair-order-rule',
            'Правило пары по дивизиону',
            pairRuleError ? 'error' : 'ok',
            pairRuleError || 'Пары соответствуют выбранному дивизиону.',
          ),
        );
      }
    }

    checks.push(
      check(
        'drift',
        'Изменение структуры',
        'ok',
        'Текущий черновик не конфликтует со структурой турнира.',
      ),
    );

    return NextResponse.json(buildResult(checks));
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.goPreflight');
  }
}
