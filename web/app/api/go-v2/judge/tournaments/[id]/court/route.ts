import { NextRequest, NextResponse } from 'next/server';

import { getGoV2JudgeCourtState, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const grant = req.headers.get('x-go-v2-court-grant') ?? req.headers.get('authorization');
    return NextResponse.json(
      await getGoV2JudgeCourtState(id, grant, req.headers.get('x-go-v2-device-id')),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'judge.court.get');
  }
}
