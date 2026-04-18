import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import {
  applyRosterEditorAction,
  getRosterEditorHistoryState,
  isRosterEditorConflictError,
} from '@/lib/roster-editor/history';
import type {
  RosterEditorAction,
  RosterEditorMutationOptions,
  RosterEditorSnapshot,
} from '@/lib/roster-editor/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as
      | {
          action?: RosterEditorAction;
          snapshot?: RosterEditorSnapshot;
          expectedRevision?: number;
          sessionId?: string;
          requestId?: string;
        }
      | null;
    if (!body?.action || !body?.snapshot) {
      return NextResponse.json({ error: 'action and snapshot are required' }, { status: 400 });
    }
    const options: RosterEditorMutationOptions = {
      expectedRevision: Number.isFinite(body.expectedRevision) ? Number(body.expectedRevision) : undefined,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
    };
    const history = await applyRosterEditorAction(
      String(id || ''),
      auth.actor.id,
      body.action,
      body.snapshot,
      options,
    );
    return NextResponse.json(history);
  } catch (error) {
    if (isRosterEditorConflictError(error)) {
      const { id } = await params;
      const current = await getRosterEditorHistoryState(String(id || ''), auth.actor.id);
      return NextResponse.json(
        { error: 'history revision conflict', code: 'history_revision_conflict', current },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

