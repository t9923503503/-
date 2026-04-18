import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { confirmThaiR2Seed, isThaiJudgeError } from '@/lib/thai-live';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const VALID_ZONES = ['hard', 'advance', 'medium', 'light'];
    if (
      !Array.isArray(body.zones) ||
      body.zones.length === 0 ||
      body.zones.some(
        (z: unknown) =>
          typeof z !== 'object' ||
          z === null ||
          !VALID_ZONES.includes(String((z as Record<string, unknown>).zone || '')),
      )
    ) {
      return NextResponse.json({ error: 'Invalid zones payload' }, { status: 400 });
    }

    const result = await confirmThaiR2Seed(id, body.zones);
    return NextResponse.json(result);
  } catch (error) {
    if (isThaiJudgeError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.confirmThaiR2Seed');
  }
}
