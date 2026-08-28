import { NextRequest, NextResponse } from 'next/server';

import {
  goV2ErrorResponse,
  previewGoV2Operation,
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
    const body = await req.json().catch(() => null);
    const input = body && typeof body === 'object' && !Array.isArray(body)
      ? { ...body, stageId }
      : body;
    return NextResponse.json(
      await previewGoV2Operation(id, 'stage.rules.preview', input, auth.actor),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'stage.rules.preview');
  }
}
