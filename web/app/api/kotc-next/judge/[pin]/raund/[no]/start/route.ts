import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ pin: string; no: string }> },
) {
  await params;
  return NextResponse.json(
    { error: 'The global timer can only be started from the KOTC Next control center', code: 'OPERATOR_CONTROL_REQUIRED' },
    { status: 403 },
  );
}
