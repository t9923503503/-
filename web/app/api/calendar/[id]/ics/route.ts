import { NextResponse } from 'next/server';
import { fetchTournamentById } from '@/lib/queries';
import {
  buildTournamentCalendarContentDisposition,
  buildTournamentIcsContent,
} from '@/lib/tournament-links';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const tournament = await fetchTournamentById(id);

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
  }

  if (!tournament.date) {
    return NextResponse.json(
      { error: 'Tournament date is missing' },
      { status: 400 }
    );
  }

  const body = buildTournamentIcsContent({
    id: tournament.id,
    name: tournament.name,
    date: tournament.date,
    time: tournament.time,
    location: tournament.location,
    description: tournament.description,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': buildTournamentCalendarContentDisposition(tournament),
      'Cache-Control': 'no-store',
    },
  });
}
