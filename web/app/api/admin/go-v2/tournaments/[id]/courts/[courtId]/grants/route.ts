import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { goV2ErrorResponse, issueGoV2CourtGrant } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; courtId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id, courtId } = await params;
    return NextResponse.json(
      await issueGoV2CourtGrant(id, courtId, await req.json().catch(() => null), auth.actor),
      { status: 201 },
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'court_grant.issue');
  }
}
