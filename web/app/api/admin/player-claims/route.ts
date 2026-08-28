import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { getPool } from '@/lib/db';
import { reviewTelegramClaim } from '@/lib/telegram-registration';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  const { rows } = await getPool().query(
    `SELECT pc.id::text, pc.proposed_name AS name, pc.gender, pc.phone,
            pc.created_at, p.name AS requested_player_name
       FROM player_claims pc
       LEFT JOIN players p ON p.id = pc.requested_player_id
      WHERE pc.status = 'pending'
      ORDER BY pc.created_at ASC LIMIT 200`
  );
  return NextResponse.json(rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    gender: String(row.gender),
    phone: String(row.phone),
    requestedPlayerName: row.requested_player_name ? String(row.requested_player_name) : null,
    createdAt: String(row.created_at),
  })));
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const decision = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : '';
  const result = await reviewTelegramClaim(body.claimId, decision, `web:${auth.actor.id}`);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
