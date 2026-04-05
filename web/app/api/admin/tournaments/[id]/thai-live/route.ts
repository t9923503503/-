import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { resolveSudyamBootstrap } from '@/lib/sudyam-bootstrap';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const payload = await resolveSudyamBootstrap(id, 'thai');
    return NextResponse.json(payload);
  } catch (error) {
    return adminErrorResponse(error, 'tournaments.thaiLive');
  }
}
