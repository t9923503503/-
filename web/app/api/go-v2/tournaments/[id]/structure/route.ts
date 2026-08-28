import { NextResponse } from 'next/server';

import { getPublicGoV2Structure, goV2ErrorResponse } from '@/lib/go-v2';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await getPublicGoV2Structure(id));
  } catch (error) {
    return goV2ErrorResponse(error, 'public.structure.get');
  }
}
