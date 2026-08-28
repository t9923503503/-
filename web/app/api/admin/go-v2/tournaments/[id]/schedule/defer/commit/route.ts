import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { commitGoV2Operation, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    return NextResponse.json(
      await commitGoV2Operation(
        id,
        'schedule.defer.commit',
        await req.json().catch(() => null),
        auth.actor,
      ),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'schedule.defer.commit');
  }
}
