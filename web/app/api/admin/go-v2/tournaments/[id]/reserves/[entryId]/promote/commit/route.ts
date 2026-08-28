import { NextRequest, NextResponse } from 'next/server';

import { requireGoV2Director } from '@/lib/go-v2/authorization';
import { commitGoV2Operation, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const auth = requireGoV2Director(req);
  if (!auth.ok) return auth.response;
  try {
    const { id, entryId } = await params;
    return NextResponse.json(
      await commitGoV2Operation(
        id,
        'reserve.promotion.commit',
        await req.json().catch(() => null),
        auth.actor,
        entryId,
      ),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'reserve.promotion.commit');
  }
}
