import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

type Gender = 'M' | 'W';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tournamentId, name, gender, phone } = body ?? {};

    if (!tournamentId || typeof tournamentId !== 'string') {
      return NextResponse.json(
        { error: 'tournamentId is required' },
        { status: 400 }
      );
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'name must be at least 2 characters' },
        { status: 400 }
      );
    }
    if (!['M', 'W'].includes(gender)) {
      return NextResponse.json(
        { error: 'gender must be M or W' },
        { status: 400 }
      );
    }

    const tId = tournamentId;
    const pName = name.trim();
    const pGender = gender as Gender;
    const pPhone =
      typeof phone === 'string' && phone.trim().length > 0
        ? phone.trim()
        : null;

    const pool = getPool();

    const { rows } = await pool.query(
      `SELECT submit_player_request($1, $2, $3, $4) AS result`,
      [pName, pGender, pPhone, tId]
    );

    return NextResponse.json(rows?.[0]?.result ?? { ok: false }, { status: 200 });
  } catch (err) {
    console.error('[API] tournament-register error:', err);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}

