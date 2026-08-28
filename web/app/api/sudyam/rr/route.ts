import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/admin-auth';
import { isSudyamApproved } from '@/lib/kotc-live/auth';
import { getRrJudgeSnapshot, isRrError, runRrJudgeAction } from '@/lib/round-robin';
import type { RrJudgeActionName } from '@/lib/round-robin';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  return isSudyamApproved(req) || Boolean(getAdminSessionFromRequest(req));
}

function errorResponse(error: unknown): NextResponse {
  if (isRrError(error)) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code ?? '') : '';
  if (code === '42P01' || code === '42703') {
    return NextResponse.json({ error: 'schema_missing', message: 'Примените миграцию Round Robin Next.' }, { status: 503 });
  }
  return NextResponse.json({ error: 'internal_error', message: 'Не удалось выполнить действие.' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const tournamentId = String(req.nextUrl.searchParams.get('tournamentId') ?? '').trim();
    return NextResponse.json(await getRrJudgeSnapshot(tournamentId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const tournamentId = String(body.tournamentId ?? '').trim();
    const matchId = String(body.matchId ?? '').trim();
    const action = String(body.action ?? '').trim() as RrJudgeActionName;
    const clientEventId = String(body.clientEventId ?? '').trim();
    if (!tournamentId || !matchId || !action || !clientEventId) {
      return NextResponse.json({ error: 'bad_request', message: 'Не заполнены обязательные поля события.' }, { status: 400 });
    }
    return NextResponse.json(await runRrJudgeAction({
      tournamentId,
      matchId,
      action,
      clientEventId,
      expectedVersion: Number(body.expectedVersion ?? 0),
      payload: body.payload && typeof body.payload === 'object' ? body.payload as Record<string, unknown> : {},
    }, { kind: 'judge' }));
  } catch (error) {
    if (isRrError(error) && error.status === 409) {
      const snapshot = await getRrJudgeSnapshot(String(body.tournamentId ?? '')).catch(() => null);
      return NextResponse.json({ error: error.code, message: error.message, snapshot }, { status: 409 });
    }
    return errorResponse(error);
  }
}
