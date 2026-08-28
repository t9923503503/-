import crypto from 'crypto';

import { getPool } from './db';
import { buildTournamentContentCopy } from './tournament-content';

const APP_URL = 'https://lpvolley.ru';
const DEFAULT_LAT = 61.2540;
const DEFAULT_LON = 73.3962;

export type AssistantNotification = {
  dedupKey: string;
  tournamentId: string;
  kind: 'waitlist_offer' | 'weather_warning' | 'media_call';
  vkUserId: string;
  telegramChatId: string;
  text: string;
  actionUrl?: string;
};

export type WaitlistOffer = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  playerId: string;
  expiresAt: string;
  notification: AssistantNotification;
};

function assistantSecret(): string {
  const value = String(
    process.env.TOURNAMENT_ASSISTANT_SECRET
      || process.env.VK_BOT_LOGIN_SECRET
      || process.env.PLAYER_SESSION_SECRET
      || '',
  ).trim();
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error('TOURNAMENT_ASSISTANT_SECRET is required in production');
  }
  return value || 'lpvolley-tournament-assistant-development-only';
}

function tokenHash(token: string): string {
  return crypto.createHmac('sha256', assistantSecret()).update(`waitlist:${token}`).digest('hex');
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function waitlistOfferMinutes(): number {
  const parsed = Number(process.env.WAITLIST_OFFER_MINUTES || 30);
  return Number.isFinite(parsed) ? Math.max(5, Math.min(180, Math.trunc(parsed))) : 30;
}

export async function createNextWaitlistOffer(tournamentId: string): Promise<WaitlistOffer | null> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tournamentResult = await client.query(
      `SELECT id::text, name, date::text, COALESCE(time::text, '') AS time,
              COALESCE(location, '') AS location, COALESCE(capacity, 0)::int AS capacity
         FROM tournaments WHERE id = $1 FOR UPDATE`,
      [tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament || Number(tournament.capacity) <= 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE tournament_waitlist_offers
          SET status = 'expired', responded_at = now()
        WHERE tournament_id = $1 AND status = 'pending' AND expires_at <= now()`,
      [tournamentId],
    );
    const active = await client.query(
      `SELECT 1 FROM tournament_waitlist_offers
        WHERE tournament_id = $1 AND status = 'pending' AND expires_at > now() LIMIT 1`,
      [tournamentId],
    );
    if (active.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }

    const mainCountResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM tournament_participants
        WHERE tournament_id = $1 AND COALESCE(is_waitlist, false) = false`,
      [tournamentId],
    );
    if (Number(mainCountResult.rows[0]?.count || 0) >= Number(tournament.capacity)) {
      await client.query('ROLLBACK');
      return null;
    }

    const candidateResult = await client.query(
      `SELECT tp.player_id::text AS player_id,
              COALESCE(u.vk_user_id, '') AS vk_user_id,
              COALESCE(u.telegram_chat_id, '') AS telegram_chat_id
         FROM tournament_participants tp
         LEFT JOIN users u ON u.player_id = tp.player_id
        WHERE tp.tournament_id = $1
          AND COALESCE(tp.is_waitlist, false) = true
          AND (COALESCE(u.vk_user_id, '') <> '' OR COALESCE(u.telegram_chat_id, '') <> '')
          AND NOT EXISTS (
            SELECT 1 FROM tournament_waitlist_offers old
             WHERE old.tournament_id = tp.tournament_id
               AND old.player_id = tp.player_id
               AND old.status IN ('declined', 'accepted', 'expired')
          )
        ORDER BY tp.registered_at ASC, tp.position ASC NULLS LAST
        LIMIT 1`,
      [tournamentId],
    );
    const candidate = candidateResult.rows[0];
    if (!candidate) {
      await client.query('ROLLBACK');
      return null;
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const minutes = waitlistOfferMinutes();
    const inserted = await client.query(
      `INSERT INTO tournament_waitlist_offers
         (tournament_id, player_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 * interval '1 minute'))
       RETURNING id::text, expires_at`,
      [tournamentId, candidate.player_id, tokenHash(token), minutes],
    );
    await client.query('COMMIT');

    const offerId = String(inserted.rows[0].id);
    const actionUrl = `${APP_URL}/waitlist/${encodeURIComponent(token)}`;
    return {
      id: offerId,
      tournamentId,
      tournamentName: String(tournament.name),
      playerId: String(candidate.player_id),
      expiresAt: new Date(inserted.rows[0].expires_at).toISOString(),
      notification: {
        dedupKey: `waitlist-offer:${offerId}`,
        tournamentId,
        kind: 'waitlist_offer',
        vkUserId: String(candidate.vk_user_id || ''),
        telegramChatId: String(candidate.telegram_chat_id || ''),
        text: [
          `🔥 Освободилось место на турнире «${tournament.name}»!`,
          `${displayDate(String(tournament.date))}${tournament.time ? ` в ${tournament.time}` : ''}`,
          tournament.location ? `📍 ${tournament.location}` : '',
          '',
          `Подтвердите участие в течение ${minutes} минут. Если не ответить, место перейдёт следующему пляжнику.`,
          actionUrl,
        ].filter(Boolean).join('\n'),
        actionUrl,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string })?.code === '23505') return null;
    throw error;
  } finally {
    client.release();
  }
}

export async function getWaitlistOffer(token: string): Promise<{
  status: string;
  tournamentId: string;
  tournamentName: string;
  expiresAt: string;
} | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const { rows } = await getPool().query(
    `SELECT o.status, o.expires_at, o.tournament_id::text, t.name
       FROM tournament_waitlist_offers o
       JOIN tournaments t ON t.id = o.tournament_id
      WHERE o.token_hash = $1 LIMIT 1`,
    [tokenHash(token)],
  );
  if (!rows[0]) return null;
  const status = rows[0].status === 'pending' && new Date(rows[0].expires_at).getTime() <= Date.now()
    ? 'expired'
    : String(rows[0].status);
  return {
    status,
    tournamentId: String(rows[0].tournament_id),
    tournamentName: String(rows[0].name),
    expiresAt: new Date(rows[0].expires_at).toISOString(),
  };
}

export async function respondToWaitlistOffer(
  token: string,
  decision: 'accept' | 'decline',
): Promise<{ ok: boolean; status: string; tournamentId?: string; message: string }> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) {
    return { ok: false, status: 'invalid', message: 'Приглашение не найдено.' };
  }
  const client = await getPool().connect();
  let tournamentId = '';
  try {
    await client.query('BEGIN');
    const offerResult = await client.query(
      `SELECT o.id, o.tournament_id::text, o.player_id, o.status, o.expires_at,
              COALESCE(t.capacity, 0)::int AS capacity
         FROM tournament_waitlist_offers o
         JOIN tournaments t ON t.id = o.tournament_id
        WHERE o.token_hash = $1
        FOR UPDATE OF o, t`,
      [tokenHash(token)],
    );
    const offer = offerResult.rows[0];
    if (!offer) {
      await client.query('ROLLBACK');
      return { ok: false, status: 'invalid', message: 'Приглашение не найдено.' };
    }
    tournamentId = String(offer.tournament_id);
    if (offer.status !== 'pending') {
      await client.query('ROLLBACK');
      return { ok: offer.status === 'accepted', status: String(offer.status), tournamentId, message: 'На это приглашение уже ответили.' };
    }
    if (new Date(offer.expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE tournament_waitlist_offers SET status = 'expired', responded_at = now() WHERE id = $1`, [offer.id]);
      await client.query('COMMIT');
      return { ok: false, status: 'expired', tournamentId, message: 'Время подтверждения истекло. Место уже предлагается следующему участнику.' };
    }
    if (decision === 'decline') {
      await client.query(`UPDATE tournament_waitlist_offers SET status = 'declined', responded_at = now() WHERE id = $1`, [offer.id]);
      await client.query('COMMIT');
      return { ok: true, status: 'declined', tournamentId, message: 'Отказ принят. Спасибо, что ответили вовремя.' };
    }

    const count = await client.query(
      `SELECT COUNT(*)::int AS count FROM tournament_participants
        WHERE tournament_id = $1 AND COALESCE(is_waitlist, false) = false`,
      [tournamentId],
    );
    if (Number(count.rows[0]?.count || 0) >= Number(offer.capacity)) {
      await client.query(`UPDATE tournament_waitlist_offers SET status = 'cancelled', responded_at = now() WHERE id = $1`, [offer.id]);
      await client.query('COMMIT');
      return { ok: false, status: 'cancelled', tournamentId, message: 'Свободное место уже занято. Вы остаётесь в листе ожидания.' };
    }
    const promoted = await client.query(
      `UPDATE tournament_participants SET is_waitlist = false
        WHERE tournament_id = $1 AND player_id = $2 AND is_waitlist = true
        RETURNING id`,
      [tournamentId, offer.player_id],
    );
    if (!promoted.rowCount) {
      await client.query(`UPDATE tournament_waitlist_offers SET status = 'cancelled', responded_at = now() WHERE id = $1`, [offer.id]);
      await client.query('COMMIT');
      return { ok: false, status: 'cancelled', tournamentId, message: 'Запись в листе ожидания больше не найдена.' };
    }
    await client.query(`UPDATE tournament_waitlist_offers SET status = 'accepted', responded_at = now() WHERE id = $1`, [offer.id]);
    await client.query('COMMIT');
    return { ok: true, status: 'accepted', tournamentId, message: 'Готово! Вы подтверждены в основном составе 🔥' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

type WeatherPoint = {
  temperature: number;
  precipitation: number;
  wind: number;
  severity: 'ok' | 'watch' | 'warning';
  raw: Record<string, unknown>;
};

async function fetchWeatherPoint(startsAt: Date): Promise<WeatherPoint | null> {
  const latitude = Number(process.env.LPVOLLEY_WEATHER_LAT || DEFAULT_LAT);
  const longitude = Number(process.env.LPVOLLEY_WEATHER_LON || DEFAULT_LON);
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,wind_speed_10m');
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('timezone', 'Asia/Yekaterinburg');
  url.searchParams.set('forecast_days', '3');
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return null;
  const payload = await response.json() as {
    hourly?: { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[]; wind_speed_10m?: number[] };
  };
  const times = payload.hourly?.time || [];
  if (!times.length) return null;
  let best = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let index = 0; index < times.length; index += 1) {
    const delta = Math.abs(new Date(`${times[index]}:00+05:00`).getTime() - startsAt.getTime());
    if (delta < bestDelta) { best = index; bestDelta = delta; }
  }
  const temperature = Number(payload.hourly?.temperature_2m?.[best] || 0);
  const precipitation = Number(payload.hourly?.precipitation_probability?.[best] || 0);
  const wind = Number(payload.hourly?.wind_speed_10m?.[best] || 0);
  const warningWind = Number(process.env.LPVOLLEY_WEATHER_WARNING_WIND_MPS || 10);
  const warningRain = Number(process.env.LPVOLLEY_WEATHER_WARNING_RAIN_PCT || 65);
  const severity = wind >= warningWind || precipitation >= warningRain
    ? 'warning'
    : wind >= warningWind * 0.75 || precipitation >= warningRain * 0.7 ? 'watch' : 'ok';
  return { temperature, precipitation, wind, severity, raw: { time: times[best], latitude, longitude } };
}

async function weatherNotifications(now: Date): Promise<AssistantNotification[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id::text, name, date::text, COALESCE(time::text, '') AS time, COALESCE(location, '') AS location
       FROM tournaments
      WHERE date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2
        AND COALESCE(status, '') NOT IN ('cancelled', 'finished')
      ORDER BY date, time`,
  );
  const notifications: AssistantNotification[] = [];
  for (const row of rows) {
    const startsAt = new Date(`${String(row.date).slice(0, 10)}T${String(row.time || '00:00').slice(0, 5)}:00+05:00`);
    const hours = (startsAt.getTime() - now.getTime()) / 3_600_000;
    if (hours < 0 || hours > 30) continue;
    const forecast = await fetchWeatherPoint(startsAt).catch(() => null);
    if (!forecast) continue;
    const version = crypto.createHash('sha1').update(`${forecast.severity}|${Math.round(forecast.wind)}|${Math.round(forecast.precipitation / 10)}`).digest('hex').slice(0, 12);
    await pool.query(
      `INSERT INTO tournament_weather_snapshots
         (tournament_id, forecast_for, temperature_c, precipitation_pct, wind_mps, severity, forecast_payload, warning_version, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
       ON CONFLICT (tournament_id) DO UPDATE SET
         forecast_for = EXCLUDED.forecast_for, temperature_c = EXCLUDED.temperature_c,
         precipitation_pct = EXCLUDED.precipitation_pct, wind_mps = EXCLUDED.wind_mps,
         severity = EXCLUDED.severity, forecast_payload = EXCLUDED.forecast_payload,
         warning_version = EXCLUDED.warning_version, checked_at = now()`,
      [row.id, startsAt.toISOString(), forecast.temperature, forecast.precipitation, forecast.wind, forecast.severity, JSON.stringify(forecast.raw), version],
    );
    if (forecast.severity !== 'warning') continue;
    const recipients = await pool.query(
      `SELECT DISTINCT COALESCE(u.vk_user_id, '') AS vk_user_id,
              COALESCE(u.telegram_chat_id, '') AS telegram_chat_id
         FROM tournament_participants tp JOIN users u ON u.player_id = tp.player_id
        WHERE tp.tournament_id = $1 AND COALESCE(tp.is_waitlist, false) = false`,
      [row.id],
    );
    for (const recipient of recipients.rows) {
      const recipientKey = String(recipient.vk_user_id || recipient.telegram_chat_id || 'unknown');
      notifications.push({
        dedupKey: `weather:${row.id}:${version}:${recipientKey}`,
        tournamentId: String(row.id),
        kind: 'weather_warning',
        vkUserId: String(recipient.vk_user_id || ''),
        telegramChatId: String(recipient.telegram_chat_id || ''),
        text: [
          `⚠️ Погода перед турниром «${row.name}» требует внимания.`,
          `🌡 ${Math.round(forecast.temperature)} °C · 💨 ${forecast.wind.toFixed(1)} м/с · 🌧 вероятность осадков ${Math.round(forecast.precipitation)}%`,
          row.location ? `📍 ${row.location}` : '',
          '',
          'Организатор проверяет условия. Решение о переносе придёт отдельным сообщением.',
          `${APP_URL}/calendar/${encodeURIComponent(String(row.id))}`,
        ].filter(Boolean).join('\n'),
      });
    }
  }
  return notifications;
}

export async function generateTournamentContentDraft(tournamentId: string): Promise<string | null> {
  const pool = getPool();
  const tournamentResult = await pool.query(
    `SELECT id::text, name, date::text, COALESCE(format, '') AS format,
            COALESCE(location, '') AS location, COALESCE(division, '') AS division,
            COALESCE(level, '') AS level
       FROM tournaments WHERE id = $1 LIMIT 1`,
    [tournamentId],
  );
  const tournament = tournamentResult.rows[0];
  if (!tournament) return null;
  const results = await pool.query(
    `SELECT p.name, tr.place, COALESCE(tr.wins, 0)::int AS wins,
            COALESCE(tr.diff, 0)::int AS diff, COALESCE(tr.rating_pts, 0)::int AS rating_pts,
            COALESCE(tr.gender, p.gender, '') AS gender,
            COALESCE(NULLIF(tr.rating_level, ''), thai_final.zone, NULLIF(t.level, '')) AS result_level,
            COALESCE(thai_final.position, tr.place)::int AS level_place
       FROM tournament_results tr
       JOIN players p ON p.id = tr.player_id
       JOIN tournaments t ON t.id = tr.tournament_id
       LEFT JOIN LATERAL (
         SELECT stat.zone, stat.position
           FROM thai_player_round_stat stat
           JOIN thai_round round_state ON round_state.id = stat.round_id
          WHERE stat.tournament_id = tr.tournament_id
            AND stat.player_id = tr.player_id
            AND round_state.round_type = 'r2'
            AND round_state.status = 'finished'
          ORDER BY round_state.round_no DESC
          LIMIT 1
       ) thai_final ON true
      WHERE tr.tournament_id = $1
      ORDER BY tr.place, p.name`,
    [tournamentId],
  );
  if (!results.rowCount) return null;
  const podium = results.rows.filter((row) => Number(row.place) <= 3);
  const bestRating = [...results.rows].sort((a, b) => Number(b.rating_pts) - Number(a.rating_pts))[0];
  const [mediaResult, matchStatsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(array_agg(NULLIF(caption, '')) FILTER (WHERE NULLIF(caption, '') IS NOT NULL), ARRAY[]::text[]) AS quotes
         FROM tournament_media
        WHERE tournament_id = $1 AND status = 'approved'`,
      [tournamentId],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS matches,
              COALESCE(SUM(match.team1_score + match.team2_score), 0)::int AS total_points,
              COUNT(*) FILTER (WHERE ABS(match.team1_score - match.team2_score) BETWEEN 1 AND 2)::int AS close_matches
         FROM thai_match match
         JOIN thai_tour tour ON tour.id = match.tour_id
         JOIN thai_court court ON court.id = tour.court_id
        WHERE court.tournament_id = $1 AND match.status = 'confirmed'`,
      [tournamentId],
    ),
  ]);
  const quotes = (mediaResult.rows[0]?.quotes || []).map(String).slice(0, 2);
  const matchStats = matchStatsResult.rows[0] || {};
  const resultsUrl = `${APP_URL}/calendar/${encodeURIComponent(tournamentId)}`;
  const content = buildTournamentContentCopy({
    tournamentName: String(tournament.name),
    date: displayDate(String(tournament.date)),
    location: String(tournament.location || ''),
    division: String(tournament.division || ''),
    resultsUrl,
    mediaUrl: Number(mediaResult.rows[0]?.count || 0) > 0 ? `${resultsUrl}/media` : undefined,
    quotes,
    matchStats: {
      matches: Number(matchStats.matches || 0),
      totalPoints: Number(matchStats.total_points || 0),
      closeMatches: Number(matchStats.close_matches || 0),
    },
    results: results.rows.map((row) => ({
      name: String(row.name || ''),
      place: Number(row.place || 0),
      levelPlace: Number(row.level_place || 0),
      level: String(row.result_level || ''),
      wins: Number(row.wins || 0),
      diff: Number(row.diff || 0),
      ratingPts: Number(row.rating_pts || 0),
      gender: String(row.gender || ''),
    })),
  });
  const vkText = content.text;
  const telegramText = content.text;
  const facts = {
    podium,
    levelPodiums: content.podiums,
    bestRating,
    stats: content.stats,
    quotes,
    mediaCount: Number(mediaResult.rows[0]?.count || 0),
  };
  const inserted = await pool.query(
    `INSERT INTO tournament_content_drafts (tournament_id, version, vk_text, telegram_text, facts)
     SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3, $4::jsonb
       FROM tournament_content_drafts WHERE tournament_id = $1
     RETURNING id::text`,
    [tournamentId, vkText, telegramText, JSON.stringify(facts)],
  );
  return String(inserted.rows[0]?.id || '') || null;
}

async function generateMissingContentDrafts(): Promise<number> {
  const { rows } = await getPool().query(
    `SELECT t.id::text
       FROM tournaments t
      WHERE t.status = 'finished'
        AND EXISTS (SELECT 1 FROM tournament_results tr WHERE tr.tournament_id = t.id)
        AND NOT EXISTS (SELECT 1 FROM tournament_content_drafts d WHERE d.tournament_id = t.id)
      ORDER BY t.date DESC LIMIT 10`,
  );
  let created = 0;
  for (const row of rows) if (await generateTournamentContentDraft(String(row.id))) created += 1;
  return created;
}

async function mediaCallNotifications(now: Date): Promise<AssistantNotification[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id::text, name, date::text, COALESCE(time::text, '') AS time
       FROM tournaments
      WHERE date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE
        AND COALESCE(status, '') <> 'cancelled'`,
  );
  const notifications: AssistantNotification[] = [];
  for (const row of rows) {
    const startsAt = new Date(`${String(row.date).slice(0, 10)}T${String(row.time || '00:00').slice(0, 5)}:00+05:00`);
    const hoursAfterStart = (now.getTime() - startsAt.getTime()) / 3_600_000;
    if (hoursAfterStart < 2 || hoursAfterStart > 14) continue;
    const recipients = await pool.query(
      `SELECT DISTINCT COALESCE(u.vk_user_id, '') AS vk_user_id,
              COALESCE(u.telegram_chat_id, '') AS telegram_chat_id
         FROM tournament_participants tp JOIN users u ON u.player_id = tp.player_id
        WHERE tp.tournament_id = $1`,
      [row.id],
    );
    const actionUrl = `${APP_URL}/calendar/${encodeURIComponent(String(row.id))}/media`;
    for (const recipient of recipients.rows) {
      const key = String(recipient.vk_user_id || recipient.telegram_chat_id || 'unknown');
      notifications.push({
        dedupKey: `media-call:${row.id}:${key}`,
        tournamentId: String(row.id),
        kind: 'media_call',
        vkUserId: String(recipient.vk_user_id || ''),
        telegramChatId: String(recipient.telegram_chat_id || ''),
        actionUrl,
        text: [
          `📸 Турнир «${row.name}» закончился, а лютые моменты должны остаться!`,
          'Загрузите фото, видео или добавьте короткую цитату — после модерации всё попадёт в общий альбом и итоговый пост.',
          actionUrl,
        ].join('\n\n'),
      });
    }
  }
  return notifications;
}

export async function claimAssistantDelivery(
  dedupKey: string,
  tournamentId: string,
  channel: 'vk' | 'telegram',
  recipient: string,
  kind: string,
): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `INSERT INTO tournament_assistant_deliveries (dedup_key, tournament_id, channel, recipient, kind)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (dedup_key) DO NOTHING`,
    [`${dedupKey}:${channel}`, tournamentId, channel, recipient, kind],
  );
  return Boolean(rowCount);
}

export async function releaseAssistantDelivery(dedupKey: string, channel: 'vk' | 'telegram'): Promise<void> {
  await getPool().query('DELETE FROM tournament_assistant_deliveries WHERE dedup_key = $1', [`${dedupKey}:${channel}`]);
}

export async function runTournamentAssistantCycle(now = new Date()): Promise<{
  notifications: AssistantNotification[];
  draftsCreated: number;
}> {
  const pool = getPool();
  await pool.query(
    `UPDATE tournament_waitlist_offers SET status = 'expired', responded_at = now()
      WHERE status = 'pending' AND expires_at <= now()`,
  );
  const { rows: waitlistTournaments } = await pool.query(
    `SELECT DISTINCT tp.tournament_id::text AS id
       FROM tournament_participants tp JOIN tournaments t ON t.id = tp.tournament_id
      WHERE tp.is_waitlist = true AND t.date >= CURRENT_DATE
      ORDER BY id LIMIT 25`,
  );
  const notifications: AssistantNotification[] = [];
  for (const row of waitlistTournaments) {
    const offer = await createNextWaitlistOffer(String(row.id));
    if (offer) notifications.push(offer.notification);
  }
  notifications.push(...await weatherNotifications(now));
  notifications.push(...await mediaCallNotifications(now));
  return { notifications, draftsCreated: await generateMissingContentDrafts() };
}
