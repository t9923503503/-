import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { commitGoV2Operation, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id, entryId } = await params;
    return NextResponse.json(
      await commitGoV2Operation(id, 'attendance.commit', await req.json().catch(() => null), auth.actor, entryId),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'attendance.commit');
  }
}
