import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { listManagedPlayPosts, listPlayResources } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

function previewDate(dayOffset: number, hour: number): string {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
}

function developmentPreview() {
  const organizer = { id: '11111111-1111-4111-8111-111111111111', ownerUserId: 25, displayName: 'LPVOLLEY', bio: '', contactUrl: '', status: 'active' };
  const venue = { id: '22222222-2222-4222-8222-222222222222', name: 'Малибу внутри', city: 'Сургут', address: 'Югорский тракт, 38', latitude: null, longitude: null, active: true };
  const post = (id: string, title: string, formatLabel: string, capacity: number, dayOffset: number, status: string, archivedAt: string | null = null) => ({
    id, seriesId: null, kind: 'game', title, description: '', formatLabel, focus: '',
    startsAt: previewDate(dayOffset, 20), endsAt: previewDate(dayOffset, 22), registrationClosesAt: null, gatherDeadline: null,
    levelMin: 'light', levelMax: 'hard', genderPolicy: 'any', capacity, minPlayers: Math.ceil(capacity / 2),
    priceMode: 'split', priceRub: 0, courtCostRub: 3500, courtBooked: false,
    priceEstimate: { amount: Math.ceil(3500 / capacity), approximate: true }, gatherState: status === 'published' ? 'filling' : null,
    visibility: 'public', joinPolicy: 'open', status, archivedAt, confirmedCount: dayOffset > 0 ? Math.max(1, Math.floor(capacity / 2)) : capacity, reserveCount: 0,
    viewerStatus: null, viewerWaitlistPosition: null, fit: 'unknown', organizer, venue, coach: null, participants: [],
  });
  return {
    actorKind: 'admin',
    organizer: null,
    resources: { organizers: [organizer], venues: [venue], coaches: [] },
    posts: [
      post('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Игра 2×2', '2×2', 4, 1, 'published'),
      post('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ДЕМО · Тайский 8 игроков', 'Тайский', 8, -2, 'completed'),
      post('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Архивная тестовая игра', '2×2', 4, -5, 'completed', new Date().toISOString()),
    ],
  };
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production' && req.nextUrl.searchParams.get('preview') === '1') {
    return NextResponse.json(developmentPreview());
  }
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите или зарегистрируйтесь, чтобы создать игру' }, { status: 401 });
  try {
    const [posts, resources] = await Promise.all([
      listManagedPlayPosts(actor),
      listPlayResources(actor.kind === 'admin', true),
    ]);
    let organizer = actor.kind === 'user'
      ? resources.organizers.find((item) => item.ownerUserId === actor.userId) ?? null
      : null;
    if (actor.kind === 'user' && !organizer) {
      const { ensurePlayOrganizer } = await import('@/lib/play-service');
      organizer = await ensurePlayOrganizer(actor);
      resources.organizers.push(organizer);
    }
    return NextResponse.json({ posts, resources, organizer, actorKind: actor.kind });
  } catch (error) {
    return playErrorResponse(error, 'management.get');
  }
}
