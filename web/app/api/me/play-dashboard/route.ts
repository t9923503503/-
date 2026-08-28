import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';
import { getPool } from '@/lib/db';
import { listMyPlayInvites, listPlayFeed, type PlayPostView } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

type DashboardPrimaryAction =
  | 'accept_invite'
  | 'manage_roster'
  | 'conduct_game'
  | 'enter_result'
  | 'approve_result'
  | 'fix_result'
  | 'view_result'
  | 'open_game';

function postPhase(post: PlayPostView, resultStatus: string | null, liveStatus: string | null) {
  if (post.status === 'cancelled') return 'cancelled';
  if (resultStatus === 'confirmed') return 'result';
  if (resultStatus === 'pending' || resultStatus === 'disputed') return 'result_review';
  if (liveStatus === 'active') return 'live';
  if (new Date(post.endsAt).getTime() <= Date.now() || post.status === 'completed') return 'past';
  return 'upcoming';
}

function actionLabel(kind: DashboardPrimaryAction): string {
  return {
    accept_invite: 'Принять',
    manage_roster: 'Управлять составом',
    conduct_game: 'Провести игру',
    enter_result: 'Внести счёт',
    approve_result: 'Утвердить счёт',
    fix_result: 'Исправить',
    view_result: 'Посмотреть результат',
    open_game: 'Открыть игру',
  }[kind];
}

/**
 * One read model for the player cabinet. It intentionally composes the
 * existing play services so the cabinet and /play never invent different
 * participation or result states.
 */
export async function GET(req: NextRequest) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });

  try {
    const [feed, invites] = await Promise.all([
      listPlayFeed(user.id),
      listMyPlayInvites(user.id),
    ]);
    const posts = [...new Map([...feed.mine, ...feed.myGames].map((post) => [post.id, post])).values()];
    const ids = posts.map((post) => post.id);
    let metaRows: Array<Record<string, unknown>> = [];
    if (ids.length) {
      try {
        const meta = await getPool().query(
          `SELECT post.id::text AS id,
                  organizer.owner_user_id = $1 AS organizer,
                  result.id::text AS result_id, result.status AS result_status,
                  session.id::text AS session_id, session.status AS session_status
             FROM play_posts post
             JOIN play_organizers organizer ON organizer.id = post.organizer_id
             LEFT JOIN play_game_results result ON result.post_id = post.id
             LEFT JOIN play_game_sessions session ON session.post_id = post.id
            WHERE post.id = ANY($2::uuid[])`,
          [user.id, ids],
        );
        metaRows = meta.rows;
      } catch (error) {
        if (!['42P01', '42703'].includes(String((error as { code?: unknown }).code ?? ''))) throw error;
        const fallback = await getPool().query(
          `SELECT post.id::text AS id,
                  organizer.owner_user_id = $1 AS organizer,
                  result.id::text AS result_id, result.status AS result_status,
                  NULL::text AS session_id, NULL::text AS session_status
             FROM play_posts post
             JOIN play_organizers organizer ON organizer.id = post.organizer_id
             LEFT JOIN play_game_results result ON result.post_id = post.id
            WHERE post.id = ANY($2::uuid[])`,
          [user.id, ids],
        );
        metaRows = fallback.rows;
      }
    }
    const metaById = new Map(metaRows.map((row) => [String(row.id), row]));
    const cards = posts.map((post) => {
      const meta = metaById.get(post.id) || {};
      const organizer = Boolean(meta.organizer);
      const participant = ['pending', 'confirmed', 'reserve'].includes(String(post.viewerStatus || ''));
      const resultStatus = meta.result_status ? String(meta.result_status) : null;
      const liveStatus = meta.session_status ? String(meta.session_status) : null;
      const ended = post.status === 'completed' || new Date(post.endsAt).getTime() <= Date.now();
      let primaryAction: DashboardPrimaryAction = 'open_game';
      if (resultStatus === 'pending' && organizer) primaryAction = 'approve_result';
      else if (resultStatus === 'disputed' && organizer) primaryAction = 'fix_result';
      else if (resultStatus === 'confirmed') primaryAction = 'view_result';
      else if (!resultStatus && ended && (organizer || post.viewerStatus === 'confirmed')) primaryAction = 'enter_result';
      else if (liveStatus === 'active' || (organizer && post.status === 'published')) primaryAction = liveStatus === 'active' ? 'conduct_game' : 'manage_roster';
      const href = primaryAction === 'manage_roster'
        ? `/partner/manage?post=${encodeURIComponent(post.id)}`
        : primaryAction === 'enter_result' || primaryAction === 'conduct_game'
          ? `/partner/${post.id}/live`
          : `/partner/${post.id}${['approve_result', 'fix_result', 'view_result'].includes(primaryAction) ? '#result' : ''}`;
      return {
        post,
        relationship: organizer && participant ? 'both' : organizer ? 'organizer' : participant ? 'participant' : 'viewer',
        phase: postPhase(post, resultStatus, liveStatus),
        ratingMode: post.ratingMode,
        result: meta.result_id ? { id: String(meta.result_id), status: resultStatus } : null,
        liveSession: meta.session_id ? { id: String(meta.session_id), status: liveStatus } : null,
        viewerCapabilities: {
          manageRoster: organizer && post.status === 'published',
          conductGame: (organizer || post.viewerStatus === 'confirmed') && !resultStatus,
          enterResult: (organizer || post.viewerStatus === 'confirmed') && ended && !resultStatus,
          approveResult: organizer && resultStatus === 'pending',
          fixResult: organizer && resultStatus === 'disputed',
        },
        primaryAction: { kind: primaryAction, label: actionLabel(primaryAction), href },
      };
    });
    const inviteCards = invites.map((invite) => ({
      postId: invite.postId,
      title: invite.postTitle,
      startsAt: invite.startsAt,
      relationship: 'invited',
      phase: 'attention',
      ratingMode: null,
      viewerCapabilities: { acceptInvite: true },
      primaryAction: { kind: 'accept_invite' as const, label: actionLabel('accept_invite'), href: `/partner/${invite.postId}` },
      invite,
    }));
    return NextResponse.json({
      ...feed,
      invites,
      cards,
      attention: [...inviteCards, ...cards.filter((card) => ['approve_result', 'fix_result', 'enter_result'].includes(card.primaryAction.kind))],
    });
  } catch (error) {
    return playErrorResponse(error, 'me.play-dashboard.get');
  }
}
