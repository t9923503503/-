import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function tournamentSyncAuthorized(req: NextRequest): boolean {
  const secret = String(process.env.TOURNAMENT_SYNC_SECRET || '').trim();
  if (!secret) return true;
  return String(req.headers.get('x-org-secret') || '').trim() === secret;
}

function toIsoDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!tournamentSyncAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  const id = decodeURIComponent(rawId || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `
        SELECT
          id::text AS id,
          external_id,
          game_state,
          name,
          date,
          time,
          location,
          format,
          division,
          level,
          capacity,
          status
        FROM tournaments
        WHERE id::text = $1 OR external_id = $1
        LIMIT 1
      `,
      [id]
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const gs = row.game_state;
    if (gs && typeof gs === 'object' && !Array.isArray(gs)) {
      return NextResponse.json(gs);
    }

    return NextResponse.json({
      id: String(row.external_id || row.id || id),
      name: String(row.name ?? ''),
      date: toIsoDate(row.date),
      time: String(row.time ?? ''),
      location: String(row.location ?? ''),
      format: String(row.format ?? ''),
      division: String(row.division ?? ''),
      level: String(row.level ?? ''),
      capacity: Number(row.capacity ?? 0),
      status: String(row.status ?? 'open'),
    });
  } catch (err) {
    console.error('[API] GET /api/tournaments/[id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!tournamentSyncAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  const id = decodeURIComponent(rawId || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected JSON object' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  try {
    const pool = getPool();
    const { rowCount } = await pool.query(
      `
        UPDATE tournaments
        SET game_state = $2::jsonb,
            synced_at = now()
        WHERE id::text = $1 OR external_id = $1
      `,
      [id, JSON.stringify(body)]
    );

    if (!rowCount) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (code === '42703') {
      console.error('[API] POST /api/tournaments/[id] missing column', err);
      return NextResponse.json(
        {
          error:
            'Tournaments table missing game_state/synced_at; apply migrations/020_tournaments_game_state_sync.sql',
        },
        { status: 503 }
      );
    }
    console.error('[API] POST /api/tournaments/[id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
