import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { getGoV2Structure, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    return NextResponse.json(await getGoV2Structure(id));
  } catch (error) {
    return goV2ErrorResponse(error, 'structure.get');
  }
}
