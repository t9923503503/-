import { NextRequest, NextResponse } from 'next/server';

import {
  commitGoV2Operation,
  goV2ErrorResponse,
  requireGoV2Director,
} from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const auth = requireGoV2Director(req);
  if (!auth.ok) return auth.response;
  try {
    const { id, stageId } = await params;
    return NextResponse.json(await commitGoV2Operation(
      id,
      'stage.rules.commit',
      await req.json().catch(() => null),
      auth.actor,
      stageId,
    ));
  } catch (error) {
    return goV2ErrorResponse(error, 'stage.rules.commit');
  }
}
