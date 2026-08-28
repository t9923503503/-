import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { goV2ErrorResponse, recordGoV2RatingShadowProjection } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    return NextResponse.json(
      await recordGoV2RatingShadowProjection(id, await req.json().catch(() => null), auth.actor),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'rating.shadow.commit');
  }
}
