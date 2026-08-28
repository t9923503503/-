import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { commitGoV2Operation, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; batchId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id, batchId } = await params;
    return NextResponse.json(
      await commitGoV2Operation(
        id,
        'mutation.undo.commit',
        await req.json().catch(() => null),
        auth.actor,
        batchId,
      ),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'mutation.undo.commit');
  }
}
