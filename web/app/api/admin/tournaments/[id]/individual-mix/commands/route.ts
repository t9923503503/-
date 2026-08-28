import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { individualMixLiveErrorResponse } from '@/lib/individual-mix/live-http';
import {
  applyIndividualMixAdminCommand,
  type IndividualMixLiveCommandEnvelope,
} from '@/lib/individual-mix/live-service';

export const dynamic = 'force-dynamic';

const ADMIN_ONLY = new Set(['correct_score', 'rebuild_schedule', 'restore_snapshot']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const envelope = body as IndividualMixLiveCommandEnvelope;
    const commandType = String(envelope.command?.type || '');
    if (ADMIN_ONLY.has(commandType)) {
      const admin = requireApiRole(req, 'admin');
      if (!admin.ok) return admin.response;
    }
    const { id } = await params;
    const session = await applyIndividualMixAdminCommand(
      { kind: auth.actor.role === 'admin' ? 'admin' : 'operator', id: auth.actor.id },
      id,
      envelope,
    );
    return NextResponse.json({ session });
  } catch (error) {
    return individualMixLiveErrorResponse(error, 'admin.command');
  }
}
