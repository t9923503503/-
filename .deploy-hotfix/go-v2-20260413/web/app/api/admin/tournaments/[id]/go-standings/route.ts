import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getGoAdminBundle, isGoNextError } from '@/lib/go-next';

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
    const bundle = await getGoAdminBundle(id);
    return NextResponse.json({
      state: bundle.state,
      groups: bundle.groups,
      matches: bundle.matches,
    });
  } catch (error) {
    if (isGoNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.goStandings');
  }
}
