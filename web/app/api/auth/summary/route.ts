import { NextResponse } from 'next/server';
import { getAccessSummaryFromCookies, getAccessLabels, getAccessSubtitle } from '@/lib/access-summary';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await getAccessSummaryFromCookies();
    return NextResponse.json({
      player: summary.player,
      admin: summary.admin,
      judgeApproved: summary.judgeApproved,
      accessLabels: getAccessLabels(summary),
      subtitle: getAccessSubtitle(summary),
    });
  } catch (error) {
    console.error('[api/auth/summary]', error);
    return NextResponse.json(
      {
        player: null,
        admin: null,
        judgeApproved: false,
        accessLabels: [],
        subtitle: 'Регистрация',
      },
      { status: 200 }
    );
  }
}

