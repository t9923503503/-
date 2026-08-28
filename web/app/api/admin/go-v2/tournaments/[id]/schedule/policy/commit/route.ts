import { NextRequest, NextResponse } from 'next/server';

import { requireGoV2Director } from '@/lib/go-v2/authorization';
import { commitGoV2Operation, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireGoV2Director(req);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    return NextResponse.json(
      await commitGoV2Operation(id, 'schedule.policy.commit', await req.json().catch(() => null), auth.actor),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'schedule.policy.commit');
  }
}
