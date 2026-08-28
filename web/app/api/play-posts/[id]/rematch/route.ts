import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { playErrorResponse } from '@/lib/play-http';
import { createPlayRematch } from '@/lib/play-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите, чтобы собрать реванш' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await createPlayRematch(actor, id), { status: 201 });
  } catch (error) {
    return playErrorResponse(error, 'rematch.create');
  }
}

