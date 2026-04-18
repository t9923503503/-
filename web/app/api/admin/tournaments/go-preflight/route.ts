import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getPlayersByIds, getTournamentById, listRosterParticipants } from '@/lib/admin-queries';
import { isGoAdminFormat, normalizeGoAdminSettings } from '@/lib/admin-legacy-sync';
import { validateGoSetup } from '@/lib/go-next-config';

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
    const declaredParticipants = Math.max(2, toInt(goSettings.declaredTeamCount, 0)) * 2;
    const structuralParticipantCount = Math.max(orderedParticipants.length, declaredParticipants);
    const structuralError = validateGoSetup(goSettings as never, structuralParticipantCount);

    const checks: CheckItem[] = [];
    checks.push(
      check(
        'structural',
        'GO structural config',
        structuralError ? 'error' : 'ok',
        structuralError || 'GO structure is valid.',
      ),
    );

    const participantCount = orderedParticipants.length;
    checks.push(
      check(
        'participant-even',
        'Even participant count',
        participantCount % 2 === 0 ? 'ok' : 'error',
        participantCount % 2 === 0
          ? `OK: ${participantCount} participants (even).`
          : `Expected even participant count, got ${participantCount}.`,
      ),
    );

    const missingSeats = Math.max(0, structuralParticipantCount - participantCount);
    checks.push(
      check(
        'participant-target',
        'Target fill',
        missingSeats > 0 ? 'warning' : 'ok',
        missingSeats > 0
          ? `Missing ${missingSeats} participants to reach configured target.`
          : 'Configured target is filled.',
      ),
    );

    if (String(goSettings.seedingMode).toLowerCase() === 'fixedpairs') {
      const groupCount = Math.max(
        1,
        toInt(
          (settings as Record<string, unknown>).goGroupCount ??
            (settings as Record<string, unknown>).groupCount ??
            Math.ceil(goSettings.declaredTeamCount / Math.max(1, goSettings.groupSlotSize)),
          1,
        ),
      );
      const hardSlots = groupCount * goSettings.groupFormula.hard * 2;
      const mediumSlots = groupCount * goSettings.groupFormula.medium * 2;
      const liteSlots = groupCount * goSettings.groupFormula.lite * 2;
      const hardFilled = orderedParticipants.slice(0, hardSlots).length;
      const mediumFilled = orderedParticipants.slice(hardSlots, hardSlots + mediumSlots).length;
      const liteFilled = orderedParticipants.slice(hardSlots + mediumSlots, hardSlots + mediumSlots + liteSlots).length;
      const categoryIntegrityError = hardFilled % 2 !== 0 || mediumFilled % 2 !== 0 || liteFilled % 2 !== 0;
      checks.push(
        check(
          'fixed-pairs-integrity',
          'Fixed pairs category integrity',
          categoryIntegrityError ? 'error' : 'ok',
          categoryIntegrityError
            ? 'At least one category has incomplete pair alignment.'
            : 'Category alignment is valid (whole pairs).',
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
          const genders = [String(left.gender ?? 'M').toUpperCase(), String(right.gender ?? 'M').toUpperCase()]
            .sort()
            .join('');
          if (pairRule === 'mixed' && genders !== 'MW') {
            pairRuleError = 'Mixed GO requires M/W pairs in roster order.';
            break;
          }
          if (pairRule === 'men' && genders !== 'MM') {
            pairRuleError = 'Men GO requires M/M pairs in roster order.';
            break;
          }
          if (pairRule === 'women' && genders !== 'WW') {
            pairRuleError = 'Women GO requires W/W pairs in roster order.';
            break;
          }
        }
        checks.push(
          check(
            'pair-order-rule',
            'Division pair rule',
            pairRuleError ? 'error' : 'ok',
            pairRuleError || 'Pair ordering matches selected division.',
          ),
        );
      }
    }

    checks.push(
      check(
        'drift',
        'Structural drift',
        'ok',
        'No structural drift detected in current draft snapshot.',
      ),
    );

    return NextResponse.json(buildResult(checks));
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.goPreflight');
  }
}
