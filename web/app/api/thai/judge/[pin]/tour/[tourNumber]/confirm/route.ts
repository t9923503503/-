import { NextRequest, NextResponse } from 'next/server';
import { confirmThaiTourByPin, isThaiJudgeError, type ThaiJudgeConfirmPayload } from '@/lib/thai-live';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown): NextResponse {
  if (isThaiJudgeError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('[THAI JUDGE] confirmTour:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pin: string; tourNumber: string }> },
) {
  try {
    const body = (await req.json().catch(() => null)) as ThaiJudgeConfirmPayload | null;
    if (!body || typeof body !== 'object' || !Array.isArray(body.matches)) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { pin, tourNumber } = await params;
    const result = await confirmThaiTourByPin(pin, Number(tourNumber), body);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
