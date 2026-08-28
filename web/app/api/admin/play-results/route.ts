import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  const { rows } = await getPool().query(
    `SELECT r.id::text,r.status,r.created_at AS "createdAt",r.reversal_reason AS "reversalReason",
            pp.id::text AS "postId",pp.title,COALESCE(NULLIF(u.full_name,''),'Игрок') AS "enteredBy",
            COUNT(e.user_id)::int AS "ratedPlayers",COALESCE(SUM(ABS(e.delta)),0)::int AS "ratingMovement"
       FROM play_game_results r JOIN play_posts pp ON pp.id=r.post_id JOIN users u ON u.id=r.entered_by
       LEFT JOIN play_game_rating_events e ON e.result_id=r.id AND e.reversed_at IS NULL
      GROUP BY r.id,pp.id,pp.title,u.full_name ORDER BY r.created_at DESC LIMIT 100`
  );
  return NextResponse.json(rows);
}
