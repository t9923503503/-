import { NextResponse } from 'next/server';
import { getPlayPostDetail } from '@/lib/play-service';

function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function utcStamp(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPlayPostDetail(id);
  if (!post) return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 });
  const location = [post.venue.name, post.venue.address].filter(Boolean).join(', ');
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LPVolley//Play Hub//RU',
    'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:play-${post.id}@lpvolley.ru`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`, `DTSTART:${utcStamp(post.startsAt)}`,
    `DTEND:${utcStamp(post.endsAt)}`, `SUMMARY:${escapeIcs(post.title)}`,
    `LOCATION:${escapeIcs(location)}`, `DESCRIPTION:${escapeIcs(post.description)}`,
    `URL:https://lpvolley.ru/partner/${post.id}`, 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="lpvolley-${post.kind}-${post.id}.ics"`,
    },
  });
}

