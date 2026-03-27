import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import {
  executeCommand,
  getRequestIp,
  isSudyamApproved,
  liveErrorResponse,
  parseSeatTokenFromRequest,
} from '@/lib/kotc-live';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = requireApiRole(req, 'operator');
  const sudyamApproved = isSudyamApproved(req);
  if (!admin.ok && !sudyamApproved) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const seatToken = parseSeatTokenFromRequest(req);
    const actor =
      seatToken != null
        ? { kind: 'seat' as const, token: seatToken }
        : admin.ok
          ? { kind: 'admin' as const, actorId: admin.actor.id }
          : null;
    if (!actor) {
      return NextResponse.json({ error: 'Seat token is required for judge command' }, { status: 401 });
    }

    const result = await executeCommand(
      id,
      actor,
      {
        commandId: String(body.commandId ?? body.command_id ?? ''),
        commandType: String(body.commandType ?? body.command_type ?? ''),
        expectedCourtVersion:
          body.expectedCourtVersion == null && body.expected_court_version == null
            ? null
            : Number(body.expectedCourtVersion ?? body.expected_court_version),
        expectedStructureEpoch:
          body.expectedStructureEpoch == null && body.expected_structure_epoch == null
            ? null
            : Number(body.expectedStructureEpoch ?? body.expected_structure_epoch),
        payload: (body.payload ?? {}) as Record<string, unknown>,
      },
      {
        ip: getRequestIp(req),
        userAgent: req.headers.get('user-agent'),
      }
    );
    return NextResponse.json(result);
  } catch (error) {
    return liveErrorResponse(error, 'sessions.commands.post');
  }
}
