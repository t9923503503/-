import { NextRequest, NextResponse } from 'next/server';

import { applyGoV2JudgeCommand, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const grant = req.headers.get('x-go-v2-court-grant') ?? req.headers.get('authorization');
    return NextResponse.json(
      await applyGoV2JudgeCommand(id, grant, await req.json().catch(() => null)),
    );
  } catch (error) {
    return goV2ErrorResponse(error, 'judge.command');
  }
}
