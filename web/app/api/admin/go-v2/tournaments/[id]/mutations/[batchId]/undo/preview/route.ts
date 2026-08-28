import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { goV2ErrorResponse, previewGoV2Operation } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; batchId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id, batchId } = await params;
    const body = await req.json().catch(() => null);
    const normalized = body && typeof body === 'object'
      ? { ...body, batchId }
      : body;
    return NextResponse.json(await previewGoV2Operation(id, 'mutation.undo.preview', normalized, auth.actor));
  } catch (error) {
    return goV2ErrorResponse(error, 'mutation.undo.preview');
  }
}
