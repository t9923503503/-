import { NextRequest, NextResponse } from 'next/server';

import { commitGoV2Operation, goV2ErrorResponse, requireGoV2Director } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const auth = requireGoV2Director(req);
  if (!auth.ok) return auth.response;
  try {
    const { id, entryId } = await params;
    const body = await req.json().catch(() => null);
    return NextResponse.json(
      await commitGoV2Operation(id, 'entry.withdrawal.commit', body, auth.actor, entryId),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'entry.withdrawal.commit');
  }
}
