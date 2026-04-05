import { getPool } from './db';
import { sendAppEmail } from './email';
import { sendTelegramMessage } from './telegram';

interface TournamentNotificationTarget {
  fullName: string;
  email: string;
  telegramChatId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  location: string;
}

function formatTournamentMoment(date: string, time: string): string {
  const parts = [String(date || '').trim(), String(time || '').trim()].filter(Boolean);
  return parts.join(' · ');
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml({
  heading,
  intro,
  details,
  ctaLabel,
  ctaUrl,
}: {
  heading: string;
  intro: string;
  details: string[];
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const detailsHtml = details
    .filter(Boolean)
    .map((item) => `<li style="margin:0 0 8px;">${escapeHtml(item)}</li>`)
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;background:#0A0A1F;color:#fff;border-radius:18px;">
      <h2 style="margin:0 0 14px;color:#FF9500;">${escapeHtml(heading)}</h2>
      <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(intro)}</p>
      <ul style="margin:0;padding-left:18px;line-height:1.6;">
        ${detailsHtml}
      </ul>
      ${
        ctaLabel && ctaUrl
          ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;margin-top:24px;padding:14px 24px;background:#FF9500;color:#000;font-weight:700;text-decoration:none;border-radius:12px;">${escapeHtml(ctaLabel)}</a>`
          : ''
      }
    </div>
  `;
}

async function deliverNotification(
  target: TournamentNotificationTarget,
  payload: {
    subject: string;
    heading: string;
    intro: string;
    details: string[];
    telegramText: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }
): Promise<void> {
  await Promise.allSettled([
    sendTelegramMessage(target.telegramChatId, payload.telegramText),
    sendAppEmail({
      to: target.email,
      subject: payload.subject,
      html: buildEmailHtml(payload),
    }),
  ]);
}

async function getRequestNotificationTarget(requestId: string): Promise<{
  requesterUserId: number | null;
  approvedPlayerId: string | null;
  registrationType: string;
  partnerWanted: boolean;
  target: TournamentNotificationTarget | null;
}> {
  if (!process.env.DATABASE_URL) {
    return {
      requesterUserId: null,
      approvedPlayerId: null,
      registrationType: 'solo',
      partnerWanted: false,
      target: null,
    };
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       pr.requester_user_id,
       pr.approved_player_id,
       COALESCE(pr.registration_type, 'solo') AS registration_type,
       COALESCE(pr.partner_wanted, false) AS partner_wanted,
       COALESCE(u.full_name, '') AS full_name,
       COALESCE(u.email, '') AS email,
       COALESCE(u.telegram_chat_id, '') AS telegram_chat_id,
       COALESCE(t.name, 'Турнир LPVolley') AS tournament_name,
       COALESCE(t.date::text, '') AS tournament_date,
       COALESCE(t.time, '') AS tournament_time,
       COALESCE(t.location, '') AS location
     FROM player_requests pr
     LEFT JOIN users u ON u.id = pr.requester_user_id
     LEFT JOIN tournaments t ON t.id = pr.tournament_id
     WHERE pr.id = $1
     LIMIT 1`,
    [requestId]
  );

  const row = rows[0];
  if (!row) {
    return {
      requesterUserId: null,
      approvedPlayerId: null,
      registrationType: 'solo',
      partnerWanted: false,
      target: null,
    };
  }

  return {
    requesterUserId:
      row.requester_user_id != null ? Number(row.requester_user_id) : null,
    approvedPlayerId: row.approved_player_id ? String(row.approved_player_id) : null,
    registrationType: String(row.registration_type || 'solo'),
    partnerWanted: Boolean(row.partner_wanted),
    target: {
      fullName: String(row.full_name || ''),
      email: String(row.email || ''),
      telegramChatId: String(row.telegram_chat_id || ''),
      tournamentName: String(row.tournament_name || 'Турнир LPVolley'),
      tournamentDate: String(row.tournament_date || ''),
      tournamentTime: String(row.tournament_time || ''),
      location: String(row.location || ''),
    },
  };
}

export async function notifyPlayerRequestSubmitted(requestId: string): Promise<void> {
  try {
    const info = await getRequestNotificationTarget(requestId);
    if (!info.requesterUserId || !info.target) return;

    const tournamentMoment = formatTournamentMoment(
      info.target.tournamentDate,
      info.target.tournamentTime
    );
    const details = [
      `Турнир: ${info.target.tournamentName}`,
      tournamentMoment ? `Когда: ${tournamentMoment}` : '',
      info.target.location ? `Где: ${info.target.location}` : '',
      info.partnerWanted
        ? 'Ваш запрос на поиск партнера будет показан в публичном разделе после модерации.'
        : '',
    ];

    await deliverNotification(info.target, {
      subject: `Заявка принята в обработку: ${info.target.tournamentName}`,
      heading: 'Заявка отправлена',
      intro:
        'Мы получили вашу заявку на турнир. После проверки администратором вы получите отдельное уведомление со статусом.',
      details,
      telegramText: [
        `Заявка на турнир «${info.target.tournamentName}» получена.`,
        tournamentMoment,
        info.target.location || '',
        'Статус: на модерации.',
        'Проверить профиль: https://lpvolley.ru/profile',
      ]
        .filter(Boolean)
        .join('\n'),
      ctaLabel: 'Открыть профиль',
      ctaUrl: 'https://lpvolley.ru/profile',
    });
  } catch (err) {
    console.error('[notifications][request-submitted]', err);
  }
}

export async function notifyPlayerRequestReviewed(
  requestId: string,
  outcome: 'approved' | 'rejected'
): Promise<void> {
  try {
    const info = await getRequestNotificationTarget(requestId);
    if (!info.requesterUserId || !info.target) return;

    let onWaitlist = false;
    if (outcome === 'approved' && info.approvedPlayerId && process.env.DATABASE_URL) {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT COALESCE(tp.is_waitlist, false) AS is_waitlist
         FROM player_requests pr
         JOIN tournament_participants tp
           ON tp.tournament_id = pr.tournament_id
          AND tp.player_id = pr.approved_player_id
         WHERE pr.id = $1
         LIMIT 1`,
        [requestId]
      );
      onWaitlist = Boolean(rows[0]?.is_waitlist);
    }

    const tournamentMoment = formatTournamentMoment(
      info.target.tournamentDate,
      info.target.tournamentTime
    );
    const approvedIntro = onWaitlist
      ? 'Заявка одобрена. Сейчас вы в листе ожидания, и мы сообщим отдельно, если освободится место в основном составе.'
      : 'Заявка одобрена. Вы добавлены в турнир.';

    await deliverNotification(info.target, {
      subject:
        outcome === 'approved'
          ? `Заявка одобрена: ${info.target.tournamentName}`
          : `Заявка отклонена: ${info.target.tournamentName}`,
      heading: outcome === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена',
      intro:
        outcome === 'approved'
          ? approvedIntro
          : 'Администратор отклонил заявку. При необходимости подайте новую заявку или уточните детали у организатора.',
      details: [
        `Турнир: ${info.target.tournamentName}`,
        tournamentMoment ? `Когда: ${tournamentMoment}` : '',
        info.target.location ? `Где: ${info.target.location}` : '',
        outcome === 'approved' && onWaitlist ? 'Статус: лист ожидания.' : '',
      ],
      telegramText: [
        outcome === 'approved'
          ? `Ваша заявка на турнир «${info.target.tournamentName}» одобрена.`
          : `Ваша заявка на турнир «${info.target.tournamentName}» отклонена.`,
        tournamentMoment,
        info.target.location || '',
        outcome === 'approved' && onWaitlist
          ? 'Статус: лист ожидания.'
          : outcome === 'approved'
            ? 'Статус: вы в основном составе.'
            : '',
        'Проверить профиль: https://lpvolley.ru/profile',
      ]
        .filter(Boolean)
        .join('\n'),
      ctaLabel: 'Открыть профиль',
      ctaUrl: 'https://lpvolley.ru/profile',
    });
  } catch (err) {
    console.error('[notifications][request-reviewed]', err);
  }
}

export async function notifyPlayerPromotedFromWaitlist(
  tournamentId: string,
  playerId: string
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         COALESCE(u.full_name, '') AS full_name,
         COALESCE(u.email, '') AS email,
         COALESCE(u.telegram_chat_id, '') AS telegram_chat_id,
         COALESCE(t.name, 'Турнир LPVolley') AS tournament_name,
         COALESCE(t.date::text, '') AS tournament_date,
         COALESCE(t.time, '') AS tournament_time,
         COALESCE(t.location, '') AS location
       FROM player_requests pr
       LEFT JOIN users u ON u.id = pr.requester_user_id
       LEFT JOIN tournaments t ON t.id = pr.tournament_id
       WHERE pr.tournament_id = $1
         AND pr.approved_player_id = $2
         AND pr.status = 'approved'
         AND pr.requester_user_id IS NOT NULL
       ORDER BY pr.reviewed_at DESC NULLS LAST, pr.created_at DESC NULLS LAST
       LIMIT 1`,
      [tournamentId, playerId]
    );

    const row = rows[0];
    if (!row) return;

    const target: TournamentNotificationTarget = {
      fullName: String(row.full_name || ''),
      email: String(row.email || ''),
      telegramChatId: String(row.telegram_chat_id || ''),
      tournamentName: String(row.tournament_name || 'Турнир LPVolley'),
      tournamentDate: String(row.tournament_date || ''),
      tournamentTime: String(row.tournament_time || ''),
      location: String(row.location || ''),
    };
    const tournamentMoment = formatTournamentMoment(
      target.tournamentDate,
      target.tournamentTime
    );

    await deliverNotification(target, {
      subject: `Появилось место: ${target.tournamentName}`,
      heading: 'Вы переведены из waitlist',
      intro:
        'В основном составе освободилось место. Мы автоматически перевели вас из листа ожидания в основной список участников.',
      details: [
        `Турнир: ${target.tournamentName}`,
        tournamentMoment ? `Когда: ${tournamentMoment}` : '',
        target.location ? `Где: ${target.location}` : '',
      ],
      telegramText: [
        `Вы переведены из листа ожидания в основной состав турнира «${target.tournamentName}».`,
        tournamentMoment,
        target.location || '',
        'Детали турнира: https://lpvolley.ru/calendar',
      ]
        .filter(Boolean)
        .join('\n'),
      ctaLabel: 'Открыть календарь',
      ctaUrl: 'https://lpvolley.ru/calendar',
    });
  } catch (err) {
    console.error('[notifications][waitlist-promote]', err);
  }
}
