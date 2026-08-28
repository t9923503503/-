import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';
import { playErrorResponse } from '@/lib/play-http';
import { respondPlayAttendance } from '@/lib/play-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const response = body.response === 'going' ? 'going' : body.response === 'not_going' ? 'not_going' : null;
    if (!response) return NextResponse.json({ error: 'Выберите «Буду» или «Не смогу»' }, { status: 400 });
    return NextResponse.json(await respondPlayAttendance(user.id, id, response));
  } catch (error) {
    return playErrorResponse(error, 'post.attendance');
  }
}
