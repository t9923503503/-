import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { playErrorResponse } from '@/lib/play-http';
import { settleManagedPlayAttendance } from '@/lib/play-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; participantId: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите, чтобы отметить посещение' }, { status: 401 });
  const { id, participantId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const attendanceStatus = body.attendanceStatus === 'no_show' ? 'no_show' : body.attendanceStatus === 'attended' ? 'attended' : null;
    if (!attendanceStatus) return NextResponse.json({ error: 'Выберите «был» или «не пришёл»' }, { status: 400 });
    return NextResponse.json(await settleManagedPlayAttendance(actor, id, participantId, attendanceStatus));
  } catch (error) {
    return playErrorResponse(error, 'attendance.settle');
  }
}

