import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { playErrorResponse } from '@/lib/play-http';
import { suggestManagedPlayPairing } from '@/lib/play-service';
import type { PlayPairingSuggestionMode } from '@/lib/play-pairing';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите, чтобы провести жеребьёвку' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const selectedResultKeys = Array.isArray(body.selectedResultKeys)
      ? body.selectedResultKeys.map(Number)
      : undefined;
    return NextResponse.json(await suggestManagedPlayPairing(
      actor,
      id,
      String(body.mode || 'balanced') as PlayPairingSuggestionMode,
      selectedResultKeys,
    ));
  } catch (error) {
    return playErrorResponse(error, 'pairing.suggest');
  }
}
