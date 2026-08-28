import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { isRrError, runRrOperatorAction } from '@/lib/round-robin';
import type { RrOperatorActionName } from '@/lib/round-robin';

export const dynamic = 'force-dynamic';

const ACTIONS = new Set<RrOperatorActionName>([
  'initialize', 'start_groups', 'finish_groups', 'preview_playoff', 'confirm_playoff',
  'start_playoff', 'finish_tournament', 'rollback_stage', 'judge_action',
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? '') as RrOperatorActionName;
    if (!ACTIONS.has(action)) return NextResponse.json({ error: 'unsupported_action' }, { status: 400 });
    const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? body.payload as Record<string, unknown>
      : body;
    return NextResponse.json(await runRrOperatorAction(id, action, payload, {
      kind: auth.actor.role === 'admin' ? 'admin' : 'operator',
      id: auth.actor.id,
    }));
  } catch (error) {
    if (isRrError(error)) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code ?? '') : '';
    if (code === '42P01' || code === '42703') return NextResponse.json({ error: 'schema_missing', message: 'Примените миграцию 083_round_robin_next.sql.' }, { status: 503 });
    return NextResponse.json({ error: 'internal_error', message: 'Не удалось выполнить операторское действие.' }, { status: 500 });
  }
}
