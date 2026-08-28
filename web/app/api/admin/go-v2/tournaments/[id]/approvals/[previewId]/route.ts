import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import {
  approveGoV2RedOperation,
  getGoV2RedOperationPreview,
  goV2ErrorResponse,
} from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; previewId: string }> },
) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const { id, previewId } = await params;
    return NextResponse.json(await getGoV2RedOperationPreview(id, previewId));
  } catch (error) {
    return goV2ErrorResponse(error, 'red_operation.preview.get');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; previewId: string }> },
) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const { id, previewId } = await params;
    return NextResponse.json(
      await approveGoV2RedOperation(id, previewId, await req.json().catch(() => null), auth.actor),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'red_operation.approve');
  }
}
