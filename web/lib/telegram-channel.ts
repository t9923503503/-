// Анонсы новых игр (/partner?tab=games) и турниров (/calendar) в TG-канал.
// Источник данных — та же PostgreSQL, что и сайт; дедупликация через
// таблицу telegram_channel_posts (одна сущность = один пост).
import { getPool } from '@/lib/db';
import { sendTelegramChannelPost } from '@/lib/telegram';
import { fetchTournaments } from '@/lib/queries';
import type { Tournament } from '@/lib/types';
import { formatPlayDate, formatPlayTime, formatLevelRange } from '@/lib/play-ui';
import type { PlayLevel } from '@/lib/play-core';

const TZ = 'Asia/Yekaterinburg';
const BATCH = 10;

export interface ChannelAnnounceReport {
  games: number;
  tournaments: number;
  failed: number;
}

function channelId(): string {
  return String(process.env.TELEGRAM_CHANNEL_ID || '').trim();
}

async function alreadyAnnounced(entityType: string, entityId: string): Promise<boolean> {
  const res = await getPool().query(
    'SELECT 1 FROM telegram_channel_posts WHERE entity_type = $1 AND entity_id = $2 LIMIT 1',
    [entityType, entityId]
  );
  return (res.rowCount ?? 0) > 0;
}

// Подтверждение анонса: вызывается после успешной отправки поста
// (серверным воркером или локальным ботом-релеем через /api/telegram/agent).
export async function ackChannelPost(
  entityType: string,
  entityId: string,
  messageId: number | null
): Promise<void> {
  // Конфликт = пост уже анонсирован параллельным проходом — игнорируем.
  await getPool().query(
    `INSERT INTO telegram_channel_posts (entity_type, entity_id, message_id, posted_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (entity_type, entity_id) DO NOTHING`,
    [entityType, entityId, messageId]
  );
}

// Ручное удаление сообщения в Telegram считается окончательным: запись
// анонса сохраняется для дедупликации, но бот больше не пытается её править.
export async function detachChannelPost(
  entityType: string,
  entityId: string,
  messageId: number
): Promise<void> {
  await getPool().query(
    `UPDATE telegram_channel_posts
        SET message_id = NULL
      WHERE entity_type = $1 AND entity_id = $2 AND message_id = $3`,
    [entityType, entityId, messageId]
  );
}

function normalizeLevel(value: string | null): PlayLevel | null {
  if (value === 'light' || value === 'medium' || value === 'hard') return value;
  return null;
}

// ---------- Игры (/partner?tab=games) ----------

interface GameRow {
  id: string;
  kind: string;
  title: string;
  rating_mode: string;
  starts_at: string;
  venue: string;
  level_min: string | null;
  level_max: string | null;
  capacity: number;
  price_mode: string;
  price_rub: number;
  court_cost_rub: number | null;
  confirmed: number;
  status?: string;
  join_policy?: string;
  archived_at?: string | null;
}

function formatGameText(row: GameRow): string {
  const emoji = row.kind === 'training' ? '🏋️' : '🏐';
  const what = row.kind === 'training' ? 'Новая тренировка' : 'Новая игра';
  const free = Math.max(0, Number(row.capacity) - Number(row.confirmed));
  const level = formatLevelRange(normalizeLevel(row.level_min), normalizeLevel(row.level_max));
  const courtCost = Number(row.court_cost_rub || 0);
  const splitPerPlayer = row.price_mode === 'split' && courtCost > 0 && Number(row.capacity) > 0
    ? Math.round(courtCost / Number(row.capacity))
    : 0;
  const price = splitPerPlayer > 0
    ? `${courtCost} ₽ за корт · ≈${splitPerPlayer} ₽/чел.`
    : Number(row.price_rub) > 0
      ? `${row.price_rub} ₽/чел.`
      : 'Бесплатно';
  const lines = [
    `${emoji} ${what}: «${row.title}»`,
    `📅 ${formatPlayDate(row.starts_at, { weekday: 'short' })}`,
    `⏰ ${formatPlayTime(row.starts_at)}`,
    `📍 ${row.venue}`,
    `🎚 ${level}`,
    `👥 Свободно мест: ${free} из ${row.capacity}`,
    `💰 ${price}`,
  ];
  if (row.kind === 'game') {
    lines.splice(1, 0, row.rating_mode === 'friendly' ? '🎈 Обычная игра' : '🏆 Игра на рейтинг');
  }
  if (row.status === 'cancelled') lines.unshift('❌ СОБЫТИЕ ОТМЕНЕНО');
  else if (free <= 0) lines.push('⏳ Основной состав набран — доступен резерв');
  return lines.join('\n');
}

export interface ChannelQueueItem {
  entityType: 'play_post' | 'tournament';
  entityId: string;
  chatId: string;
  text: string;
  buttonText: string;
  buttonUrl: string;
  buttonAction?: string;
}

// Очередь анонсов игр без отправки — для локального бота-релея.
async function listGames(
  channel: string,
  limit: number,
  onlyUnannounced: boolean
): Promise<ChannelQueueItem[]> {
  const unannouncedFilter = onlyUnannounced
    ? `AND NOT EXISTS (SELECT 1 FROM telegram_channel_posts tcp
                        WHERE tcp.entity_type = 'play_post' AND tcp.entity_id = pp.id::text)`
    : '';
  const { rows } = await getPool().query(
    `SELECT pp.id::text, pp.kind, pp.title, pp.rating_mode, pp.starts_at, pp.price_mode, pp.price_rub,
            pp.court_cost_rub, pp.capacity,
            pp.level_min, pp.level_max, pv.name AS venue,
            (SELECT COUNT(*)::int FROM play_post_participants ppp
              WHERE ppp.post_id = pp.id AND ppp.status = 'confirmed') AS confirmed
       FROM play_posts pp
       JOIN play_venues pv ON pv.id = pp.venue_id
      WHERE pp.status = 'published'
        AND pp.archived_at IS NULL
        AND pp.visibility = 'public'
        AND pp.join_policy <> 'closed'
        AND pp.starts_at > now()
        ${unannouncedFilter}
      ORDER BY pp.starts_at ASC
      LIMIT ${Math.max(1, Math.min(limit, 25))}`
  );
  return (rows as GameRow[]).map((row) => ({
    entityType: 'play_post' as const,
    entityId: row.id,
    chatId: channel,
    text: formatGameText(row),
    buttonText: Number(row.confirmed) >= Number(row.capacity) ? '⏳ В резерв' : '⚡ Записаться',
    buttonUrl: `https://lpvolley.ru/partner/${row.id}`,
    buttonAction: `join:${row.id}`,
  }));
}

async function listGameQueue(channel: string, limit: number): Promise<ChannelQueueItem[]> {
  return listGames(channel, limit, true);
}

async function announceGames(channel: string, limit: number): Promise<{ posted: number; failed: number }> {
  const queue = await listGameQueue(channel, limit);
  let posted = 0;
  let failed = 0;
  for (const item of queue) {
    const messageId = await sendTelegramChannelPost(
      channel,
      item.text,
      item.buttonText,
      item.buttonUrl
    );
    if (messageId !== null) {
      await ackChannelPost('play_post', item.entityId, messageId);
      posted += 1;
    } else {
      failed += 1;
    }
  }
  return { posted, failed };
}

// ---------- Турниры (/calendar) ----------

function formatTournamentDate(date: string): string {
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return date;
}

function tournamentIsUpcoming(tournament: Tournament): boolean {
  const iso = tournament.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return true; // дата в нестандартном виде — не фильтруем
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  return `${iso[1]}-${iso[2]}-${iso[3]}` >= today;
}

function formatTournamentText(tournament: Tournament): string {
  const lines = [
    `🏆 Новый турнир: ${tournament.name}`,
    `📅 Дата: ${formatTournamentDate(tournament.date)}`,
  ];
  if (tournament.time) lines.push(`⏰ Время: ${tournament.time}`);
  if (tournament.level) lines.push(`🎚 Уровень: ${tournament.level.toUpperCase()}`);
  if (tournament.location) lines.push(`📍 ${tournament.location}`);
  if (tournament.capacity > 0) {
    const free = tournament.spotsLeft ?? Math.max(0, tournament.capacity - tournament.participantCount);
    lines.push(`👥 Свободно мест: ${free} из ${tournament.capacity}`);
  }
  lines.push('📝 Регистрация открыта');
  return lines.join('\n');
}

// Очередь анонсов турниров без отправки — для локального бота-релея.
async function listTournaments(
  channel: string,
  limit: number,
  onlyUnannounced: boolean
): Promise<ChannelQueueItem[]> {
  // Тот же источник, что и /calendar: fetchTournaments + фильтры видимости.
  const tournaments = await fetchTournaments(200);
  const queue: ChannelQueueItem[] = [];
  for (const tournament of tournaments) {
    if (queue.length >= limit) break;
    if (tournament.status !== 'open' || tournament.registrationClosed) continue;
    if (!tournamentIsUpcoming(tournament)) continue;
    if (onlyUnannounced && await alreadyAnnounced('tournament', tournament.id)) continue;
    queue.push({
      entityType: 'tournament',
      entityId: tournament.id,
      chatId: channel,
      text: formatTournamentText(tournament),
      buttonText: '⚡ Записаться',
      buttonUrl: `https://lpvolley.ru/calendar/${tournament.id}`,
      buttonAction: `tjoin:${tournament.id}`,
    });
  }
  return queue;
}

async function listTournamentQueue(channel: string, limit: number): Promise<ChannelQueueItem[]> {
  return listTournaments(channel, limit, true);
}

// Интерактивный каталог для личных команд /games и /tournaments.
// В отличие от очереди канала он показывает события и после их анонса.
export async function buildGameCatalog(limit = 5): Promise<ChannelQueueItem[]> {
  return listGames('', Math.max(1, Math.min(limit, 10)), false);
}

export async function buildTournamentCatalog(limit = 5): Promise<ChannelQueueItem[]> {
  return listTournaments('', Math.max(1, Math.min(limit, 10)), false);
}

export interface ChannelUpdateItem extends ChannelQueueItem {
  messageId: number;
}

// Актуальные карточки уже опубликованных игр. Локальный бот сравнивает текст
// с последней версией и редактирует сообщение при изменении состава/статуса.
export async function buildChannelUpdates(limit = 25): Promise<ChannelUpdateItem[]> {
  const channel = channelId();
  if (!channel) return [];
  const capped = Math.max(1, Math.min(limit, 50));
  const { rows } = await getPool().query(
    `SELECT pp.id::text, pp.kind, pp.title, pp.rating_mode, pp.starts_at, pp.price_mode, pp.price_rub,
            pp.court_cost_rub, pp.capacity,
            pp.level_min, pp.level_max, pp.status, pp.join_policy, pp.archived_at, pv.name AS venue,
            tcp.message_id,
            (SELECT COUNT(*)::int FROM play_post_participants ppp
              WHERE ppp.post_id = pp.id AND ppp.status = 'confirmed') AS confirmed
       FROM telegram_channel_posts tcp
       JOIN play_posts pp ON tcp.entity_type = 'play_post' AND tcp.entity_id = pp.id::text
       JOIN play_venues pv ON pv.id = pp.venue_id
      WHERE tcp.message_id IS NOT NULL
        AND pp.starts_at > now() - interval '1 day'
      ORDER BY pp.starts_at ASC
      LIMIT $1`,
    [capped]
  );
  return (rows as Array<GameRow & { message_id: number }>).map((row) => {
    const canJoin = row.status === 'published' && row.join_policy !== 'closed' && !row.archived_at;
    const full = Number(row.confirmed) >= Number(row.capacity);
    return {
      entityType: 'play_post' as const,
      entityId: row.id,
      chatId: channel,
      messageId: Number(row.message_id),
      text: formatGameText(row),
      buttonText: canJoin ? (full ? '⏳ В резерв' : '⚡ Записаться') : 'Открыть карточку',
      buttonUrl: `https://lpvolley.ru/partner/${row.id}`,
      buttonAction: canJoin ? `join:${row.id}` : undefined,
    };
  });
}

async function announceTournaments(channel: string, limit: number): Promise<{ posted: number; failed: number }> {
  const queue = await listTournamentQueue(channel, limit);
  let posted = 0;
  let failed = 0;
  for (const item of queue) {
    const messageId = await sendTelegramChannelPost(
      channel,
      item.text,
      item.buttonText,
      item.buttonUrl
    );
    if (messageId !== null) {
      await ackChannelPost('tournament', item.entityId, messageId);
      posted += 1;
    } else {
      failed += 1;
    }
  }
  return { posted, failed };
}

// Очередь анонсов для локального бота-релея (/api/telegram/agent, action=channelQueue).
export async function buildChannelQueue(limit = BATCH): Promise<ChannelQueueItem[]> {
  const channel = channelId();
  if (!channel) return [];
  const capped = Math.max(1, Math.min(limit, 25));
  const games = await listGameQueue(channel, capped);
  const tournaments = await listTournamentQueue(channel, capped);
  return [...games, ...tournaments];
}

// /api/cron/channel-announce: раз в 5 минут — анонсы новых игр и турниров.
// Работает только если СЕРВЕР сам может ходить в Telegram API;
// иначе используется локальный бот-релей через /api/telegram/agent.
export async function runChannelAnnounce(): Promise<ChannelAnnounceReport> {
  const channel = channelId();
  if (!process.env.TELEGRAM_BOT_TOKEN || !channel) {
    return { games: 0, tournaments: 0, failed: 0 };
  }

  const games = await announceGames(channel, BATCH);
  const tournaments = await announceTournaments(channel, BATCH);
  return {
    games: games.posted,
    tournaments: tournaments.posted,
    failed: games.failed + tournaments.failed,
  };
}
