import { NextResponse } from 'next/server';
import { resetKotcNextDemoTournament } from '@/lib/kotc-next-demo';
import { isKotcNextError } from '@/lib/kotc-next';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const demo = await resetKotcNextDemoTournament(slug);
    if (!demo) {
      return NextResponse.json({ error: 'Demo tournament not found' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      tournamentId: demo.tournamentId,
      slug: demo.slug,
    });
  } catch (error) {
    if (isKotcNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
