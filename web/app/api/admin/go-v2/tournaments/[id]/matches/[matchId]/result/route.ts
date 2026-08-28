import { NextRequest, NextResponse } from 'next/server';

import { commitGoV2Operation, goV2ErrorResponse, requireGoV2Director } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  const auth = requireGoV2Director(req);
  if (!auth.ok) return auth.response;
  try {
    const { id, matchId } = await params;
    return NextResponse.json(
      await commitGoV2Operation(
        id,
        'match.result.revise',
        await req.json().catch(() => null),
        auth.actor,
        matchId,
      ),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'match.result.revise');
  }
}
