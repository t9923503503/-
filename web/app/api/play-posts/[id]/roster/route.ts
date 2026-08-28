import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import {
  bulkManagePlayRoster,
  PlayRosterBulkError,
} from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = getPlayActor(req);
  if (!actor) {
    return NextResponse.json(
      { error: 'Войдите в аккаунт, чтобы управлять составом' },
      { status: 401 },
    );
  }
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    return NextResponse.json(
      await bulkManagePlayRoster(actor, id, body.items),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PlayRosterBulkError) {
      return NextResponse.json({
        error: error.message,
        atomic: true,
        committed: false,
        results: error.results,
      }, { status: error.status });
    }
    return playErrorResponse(error, 'roster.bulk');
  }
}
