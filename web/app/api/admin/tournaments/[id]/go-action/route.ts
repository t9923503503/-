import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { isGoNextError, runGoOperatorAction } from '@/lib/go-next';
import type { GoOperatorActionName } from '@/lib/go-next/types';

export const dynamic = 'force-dynamic';

const GO_OPERATOR_ACTIONS: ReadonlySet<GoOperatorActionName> = new Set([
  'bootstrap_groups',
  'start_group_stage',
  'mass_walkover_group',
  'finish_group_stage',
  'preview_bracket_seed',
  'confirm_bracket_seed',
  'bootstrap_bracket',
  'rollback_stage',
  'finish_bracket',
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const actionRaw = String(body.action || '').trim().toLowerCase();
    if (!GO_OPERATOR_ACTIONS.has(actionRaw as GoOperatorActionName)) {
      return NextResponse.json({ error: `Unsupported GO operator action: ${actionRaw || '<empty>'}` }, { status: 400 });
    }
    const action = actionRaw as GoOperatorActionName;
    const result = await runGoOperatorAction(id, action, {
      seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : undefined,
      groupId: String(body.groupId || ''),
      seedDraft: body.seedDraft,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isGoNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error && typeof error === 'object') {
      const pgCode = String((error as { code?: unknown }).code ?? '').trim();
      if (pgCode === '42P01' || pgCode === '42703') {
        return NextResponse.json(
          { error: 'GO database schema is not up to date on this server. Apply latest migrations and retry.' },
          { status: 503 },
        );
      }
    }
    return adminErrorResponse(error, 'tournaments.goAction');
  }
}
