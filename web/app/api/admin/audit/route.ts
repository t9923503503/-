import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { fetchAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100);
    const data = await fetchAuditLog(limit);
    return NextResponse.json(data);
  } catch (err) {
    return adminErrorResponse(err, 'audit.get');
  }
}
