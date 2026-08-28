import { NextRequest, NextResponse } from 'next/server';

import { requireApiRole } from '@/lib/admin-auth';
import { goV2ErrorResponse, revokeGoV2CourtGrant } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; courtId: string; grantId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id, courtId, grantId } = await params;
    return NextResponse.json(
      await revokeGoV2CourtGrant(id, courtId, grantId, await req.json().catch(() => null), auth.actor),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'court_grant.revoke');
  }
}
