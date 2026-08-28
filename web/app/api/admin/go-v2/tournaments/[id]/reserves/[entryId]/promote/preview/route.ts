import { NextRequest, NextResponse } from 'next/server';

import { requireGoV2Director } from '@/lib/go-v2/authorization';
import { goV2ErrorResponse, previewGoV2Operation } from '@/lib/go-v2';

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
    const normalized = body && typeof body === 'object'
      ? { ...body, reserveEntryId: entryId }
      : body;
    return NextResponse.json(
      await previewGoV2Operation(id, 'reserve.promotion.preview', normalized, auth.actor),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'reserve.promotion.preview');
  }
}
