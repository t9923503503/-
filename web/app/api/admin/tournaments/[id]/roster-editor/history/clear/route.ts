import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import {
  clearRosterEditorHistory,
  getRosterEditorHistoryState,
  isRosterEditorConflictError,
} from '@/lib/roster-editor/history';
import type { RosterEditorMutationOptions } from '@/lib/roster-editor/types';

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
      | { expectedRevision?: number; sessionId?: string; requestId?: string }
      | null;
    const options: RosterEditorMutationOptions = {
      expectedRevision: body && Number.isFinite(body.expectedRevision) ? Number(body.expectedRevision) : undefined,
      sessionId: body && typeof body.sessionId === 'string' ? body.sessionId : undefined,
      requestId: body && typeof body.requestId === 'string' ? body.requestId : undefined,
    };
    const history = await clearRosterEditorHistory(String(id || ''), auth.actor.id, options);
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

