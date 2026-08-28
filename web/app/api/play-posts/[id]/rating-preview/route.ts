import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { playErrorResponse } from '@/lib/play-http';
import { getPlayRatingPreview } from '@/lib/play-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите, чтобы увидеть прогноз рейтинга' }, { status: 401 });
  const { id } = await params;
  try { return NextResponse.json(await getPlayRatingPreview(actor, id)); }
  catch (error) { return playErrorResponse(error, 'rating.preview'); }
}

