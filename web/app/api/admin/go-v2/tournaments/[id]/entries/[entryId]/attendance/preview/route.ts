import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { goV2ErrorResponse, previewGoV2Operation } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id, entryId } = await params;
    const body = await req.json().catch(() => null);
    const input = body && typeof body === 'object' && !Array.isArray(body)
      ? { ...body, entryId }
      : body;
    return NextResponse.json(await previewGoV2Operation(id, 'attendance.preview', input, auth.actor));
  } catch (error) {
    return goV2ErrorResponse(error, 'attendance.preview');
  }
}
