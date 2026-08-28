import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { goV2ErrorResponse, previewGoV2Operation } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    return NextResponse.json(
      await previewGoV2Operation(id, 'bracket.preview', await req.json().catch(() => null), auth.actor),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'bracket.preview');
  }
}
