import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { listPendingRequests, approveRequest, rejectRequest } from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { normalizeRequestInput, validateRequestInput } from '@/lib/admin-validators';
import { adminErrorResponse } from '@/lib/admin-errors';
import { notifyPlayerRequestReviewed } from '@/lib/tournament-notifications';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;

  try {
    const tournamentId = req.nextUrl.searchParams.get('tournamentId') || undefined;
    const data = await listPendingRequests(tournamentId);
    return NextResponse.json(data);
  } catch (err) {
    return adminErrorResponse(err, 'requests.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeRequestInput(body);
    const err = validateRequestInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    if (input.action === 'approve') {
      const result = await approveRequest(input.requestId);
      if (!result.request) {
        const errorText =
          typeof result === 'object' && result && 'error' in result
            ? String(result.error ?? '')
            : '';
        return NextResponse.json(
          { error: errorText || 'Request not found or already processed' },
          { status: errorText ? 400 : 404 }
        );
      }
      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'request.approve',
        entityType: 'player_request',
        entityId: input.requestId,
        reason: input.reason || 'Approved',
        afterState: { request: result.request, newPlayerId: result.newPlayerId },
      });
      await notifyPlayerRequestReviewed(input.requestId, 'approved');
      return NextResponse.json(result);
    }

    if (input.action === 'reject') {
      const result = await rejectRequest(input.requestId);
      if (!result) return NextResponse.json({ error: 'Request not found or already processed' }, { status: 404 });
      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'request.reject',
        entityType: 'player_request',
        entityId: input.requestId,
        reason: input.reason || 'Rejected',
        afterState: result,
      });
      await notifyPlayerRequestReviewed(input.requestId, 'rejected');
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return adminErrorResponse(err, 'requests.post');
  }
}
