import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { individualMixLiveErrorResponse } from '@/lib/individual-mix/live-http';
import {
  getIndividualMixAdminSession,
  prepareIndividualMixLiveSession,
} from '@/lib/individual-mix/live-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const session = await getIndividualMixAdminSession(id);
    if (!session) return NextResponse.json({ error: 'Live-сессия ещё не подготовлена.', code: 'session_not_found' }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    return individualMixLiveErrorResponse(error, 'admin.get');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const session = await prepareIndividualMixLiveSession({ kind: auth.actor.role === 'admin' ? 'admin' : 'operator', id: auth.actor.id }, id);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return individualMixLiveErrorResponse(error, 'admin.prepare');
  }
}
