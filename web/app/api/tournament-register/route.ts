import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getPlayerTokenFromCookieHeader, verifyPlayerToken } from '@/lib/player-auth';

type Gender = 'M' | 'W';
type RegistrationType = 'with_partner' | 'solo';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tournamentId, name, gender, phone, registrationType, partnerWanted, partnerName } = body ?? {};

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
    const regType: RegistrationType =
      registrationType === 'with_partner' ? 'with_partner' : 'solo';
    const wantsPartner = regType === 'solo' ? Boolean(partnerWanted) : false;
    const pPartnerName =
      regType === 'with_partner' &&
      typeof partnerName === 'string' &&
      partnerName.trim().length > 0
        ? partnerName.trim()
        : '';
    if (regType === 'with_partner' && pPartnerName.length < 2) {
      return NextResponse.json(
        { error: 'partnerName must be at least 2 characters for with_partner registration' },
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

    const tournamentRes = await pool.query(
      `SELECT id, status FROM tournaments WHERE id = $1 LIMIT 1`,
      [tId]
    );
    const tournament = tournamentRes.rows?.[0];
    if (!tournament) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    if (!['open', 'full'].includes(String(tournament.status || ''))) {
      return NextResponse.json(
        { error: 'Registration is closed for this tournament' },
        { status: 400 }
      );
    }

    const { rows } = await pool.query(
      `SELECT submit_player_request($1, $2, $3, $4) AS result`,
      [pName, pGender, pPhone, tId]
    );
    const result = rows?.[0]?.result ?? { ok: false };
    const requestId = result?.request_id ? String(result.request_id) : '';

    // Optional metadata for partner search. Safe fallback if migration not applied yet.
    if (requestId) {
      try {
        const token = getPlayerTokenFromCookieHeader(request.headers.get('cookie') || '');
        const user = token ? verifyPlayerToken(token) : null;
        await pool.query(
          `UPDATE player_requests
             SET registration_type = $2,
                 partner_wanted = $3,
                 partner_name = $4,
                 requester_user_id = COALESCE($5, requester_user_id)
           WHERE id = $1`,
          [requestId, regType, wantsPartner, pPartnerName, user?.id ?? null]
        );
      } catch {
        // Keep registration working even when new columns are not present yet.
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('[API] tournament-register error:', err);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}

