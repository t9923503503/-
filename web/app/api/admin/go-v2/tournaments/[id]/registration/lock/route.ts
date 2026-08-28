import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { commitGoV2Operation, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    return NextResponse.json(await commitGoV2Operation(id, 'registration.lock', body, auth.actor));
  } catch (error) {
    return goV2ErrorResponse(error, 'registration.lock');
  }
}
