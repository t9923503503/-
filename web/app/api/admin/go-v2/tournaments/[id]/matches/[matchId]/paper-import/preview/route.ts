import { NextRequest, NextResponse } from 'next/server';

import {
  goV2ErrorResponse,
  previewGoV2Operation,
  requireGoV2Director,
} from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  const auth = requireGoV2Director(req);
  if (!auth.ok) return auth.response;
  try {
    const { id, matchId } = await params;
    const body = await req.json().catch(() => null);
    const input = body && typeof body === 'object' && !Array.isArray(body)
      ? { ...body, matchId }
      : body;
    return NextResponse.json(
      await previewGoV2Operation(id, 'match.paper_import.preview', input, auth.actor),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'match.paper_import.preview');
  }
}
