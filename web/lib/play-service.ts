import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { resolvePlayerIdForAccount } from '@/lib/profile-link';
import { sanitizeServerImageUrl } from '@/lib/server-image-url';
import { sendTelegramMessage } from '@/lib/telegram';
import {
  calculatePlayFit,
  deriveGatherState,
  estimatePricePerPerson,
  expandWeeklyOccurrences,
  normalizePlayLevel,
  normalizePlayPostInput,
  PLAY_LEVELS,
  scoreForYou,
  validatePlayResultApproval,
  type PlayFit,
  type PlayGatherState,
  type PlayInviteStatus,
  type PlayKind,
  type PlayLevel,
  type PlayParticipantStatus,
  type PlayPostInput,
  type PlayPriceMode,
  type PlayPostResultFormat,
  type PlayRatingMode,
  type PlayResultEntryMode,
  type PlayResultStatus,
} from '@/lib/play-core';
import type { PlayActor } from '@/lib/play-auth';
import { getCompetitiveMatches, normalizeStructuredPlayResult, validateStructuredPlayResult } from '@/lib/play-result-core';
import { applyConfirmedPlayResultRating, previewPlayResultRating, reverseActivePlayResultRating } from '@/lib/play-game-rating';
import { suggest2x2Pairing, type PlayPairingSuggestionMode } from '@/lib/play-pairing';
import {
  normalizePlayRosterBulkItems,
  type NormalizedPlayRosterBulkItem,
} from '@/lib/play-roster-core';
import { adminUnfilledPlayDeleteBlocker } from '@/lib/play-admin-cleanup';

export class PlayServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface PlayOrganizer {
  id: string;
  displayName: string;
  bio: string;
  contactUrl: string;
  status: 'active' | 'suspended';
  ownerUserId?: number | null;
}

export interface PlayVenue {
  id: string;
  name: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
}

export interface PlayCoach {
  id: string;
  name: string;
  bio: string;
  photoUrl: string;
  active: boolean;
}

export interface PlayPostView {
  id: string;
  seriesId: string | null;
  kind: PlayKind;
  title: string;
  description: string;
  formatLabel: string;
  focus: string;
  startsAt: string;
  endsAt: string;
  registrationClosesAt: string | null;
  gatherDeadline: string | null;
  levelMin: PlayLevel | null;
  levelMax: PlayLevel | null;
  genderPolicy: 'any' | 'M' | 'W' | 'mixed';
  capacity: number;
  minPlayers: number | null;
  priceMode: PlayPriceMode;
  priceRub: number;
  courtCostRub: number | null;
  courtBooked: boolean;
  priceEstimate: { amount: number; approximate: boolean };
  gatherState: PlayGatherState | null;
  visibility: 'public' | 'unlisted' | 'link';
  joinPolicy: 'request' | 'open' | 'closed';
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  ratingMode: PlayRatingMode;
  resultFormat: PlayPostResultFormat;
  resultConfig: Record<string, unknown>;
  resultEntryMode: PlayResultEntryMode;
  archivedAt?: string | null;
  confirmedCount: number;
  reserveCount: number;
  viewerParticipantId: string | null;
  viewerStatus: PlayParticipantStatus | null;
  viewerWaitlistPosition: number | null;
  viewerAttendanceStatus: 'unknown' | 'going' | 'not_going' | 'attended' | 'no_show' | null;
  viewerAttendanceRespondedAt: string | null;
  fit: PlayFit;
  organizer: PlayOrganizer;
  venue: PlayVenue;
  coach: PlayCoach | null;
}

export interface PlayResultConfirmationView {
  userId: number;
  name: string;
  verdict: 'confirmed' | 'disputed';
  comment: string;
  createdAt: string;
}

export interface PlayGameResultView {
  id: string;
  postId: string;
  status: PlayResultStatus;
  payload: unknown;
  revision: number;
  enteredByUserId: number | null;
  enteredByAdminActor: string | null;
  autoConfirmAt: string | null;
  approvedAt: string | null;
  approvedByUserId: number | null;
  approvedByAdminActor: string | null;
  approvalBlocker: string | null;
  createdAt: string;
  confirmations: PlayResultConfirmationView[];
  viewerVerdict: 'confirmed' | 'disputed' | null;
  correctionRequests: Array<{
    id: string;
    revision: number;
    requestedByUserId: number;
    comment: string;
    status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
    resolutionComment: string;
    createdAt: string;
    resolvedAt: string | null;
  }>;
}

export interface PlayPostDetail extends PlayPostView {
  participants: Array<{ id: string; resultKey: number; userId: number | null; playerId: string | null; name: string; avatarUrl: string }>;
  result: PlayGameResultView | null;
  pastTeammatesCount: number;
  viewerInvite: { id: string; status: PlayInviteStatus } | null;
}

export interface PlayResources {
  organizers: PlayOrganizer[];
  venues: PlayVenue[];
  coaches: PlayCoach[];
}

export interface PlayManagedPost extends PlayPostView {
  participants: Array<{
    id: string;
    userId: number | null;
    playerId: string | null;
    registered: boolean;
    name: string;
    status: PlayParticipantStatus;
    attendanceStatus: 'unknown' | 'going' | 'not_going' | 'attended' | 'no_show';
    attendanceRespondedAt: string | null;
    createdAt: string;
    playerLevel: PlayLevel | null;
  }>;
}

export interface PlayParticipantCandidate {
  userId: number | null;
  playerId: string | null;
  name: string;
  playerLevel: PlayLevel | null;
  registered: boolean;
}

export interface PlayReliabilityView {
  score: number | null;
  trackedGames: number;
  attended: number;
  noShows: number;
  lateCancellations: number;
  label: 'new' | 'reliable' | 'stable' | 'attention';
}

type ViewerProfile = { level: PlayLevel | null; gender: 'M' | 'W' | null };

function isSchemaUnavailable(err: unknown): boolean {
  const code = String((err as { code?: unknown })?.code ?? '');
  return code === '42P01' || code === '42703';
}

function asIso(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function nullableLevel(value: unknown): PlayLevel | null {
  return normalizePlayLevel(value);
}

function mapOrganizer(row: Record<string, unknown>, includeOwner = false): PlayOrganizer {
  return {
    id: String(row.organizerId ?? row.id ?? ''),
    displayName: String(row.organizerName ?? row.display_name ?? ''),
    bio: String(row.organizerBio ?? row.bio ?? ''),
    contactUrl: safeContactUrl(row.organizerContactUrl ?? row.contact_url),
    status: String(row.organizerStatus ?? row.status) === 'suspended' ? 'suspended' : 'active',
    ...(includeOwner ? { ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id) } : {}),
  };
}

function safeContactUrl(value: unknown): string {
  const url = String(value ?? '').trim();
  return /^https:\/\/[a-z0-9.-]+(?:[/:?#]|$)/i.test(url) ? url : '';
}

function mapVenue(row: Record<string, unknown>): PlayVenue {
  return {
    id: String(row.venueId ?? row.id ?? ''),
    name: String(row.venueName ?? row.name ?? ''),
    city: String(row.venueCity ?? row.city ?? 'Сургут'),
    address: String(row.venueAddress ?? row.address ?? ''),
    latitude: row.venueLatitude == null && row.latitude == null
      ? null
      : Number(row.venueLatitude ?? row.latitude),
    longitude: row.venueLongitude == null && row.longitude == null
      ? null
      : Number(row.venueLongitude ?? row.longitude),
    active: row.venueActive == null && row.active == null
      ? true
      : Boolean(row.venueActive ?? row.active),
  };
}

function mapCoach(row: Record<string, unknown>): PlayCoach | null {
  const id = String(row.coachId ?? row.id ?? '');
  if (!id) return null;
  return {
    id,
    name: String(row.coachName ?? row.name ?? ''),
    bio: String(row.coachBio ?? row.bio ?? ''),
    photoUrl: sanitizeServerImageUrl(row.coachPhotoUrl ?? row.photo_url),
    active: row.coachActive == null && row.active == null
      ? true
      : Boolean(row.coachActive ?? row.active),
  };
}

function mapPost(row: Record<string, unknown>, viewer: ViewerProfile): PlayPostView {
  const levelMin = nullableLevel(row.levelMin);
  const levelMax = nullableLevel(row.levelMax);
  const genderPolicy = ['M', 'W', 'mixed'].includes(String(row.genderPolicy))
    ? (String(row.genderPolicy) as 'M' | 'W' | 'mixed')
    : 'any';
  const status = ['draft', 'cancelled', 'completed'].includes(String(row.status))
    ? (String(row.status) as 'draft' | 'cancelled' | 'completed')
    : 'published';
  const capacity = Number(row.capacity ?? 0);
  const confirmedCount = Number(row.confirmedCount ?? 0);
  const minPlayers = row.minPlayers == null ? null : Number(row.minPlayers);
  const priceMode: PlayPriceMode = String(row.priceMode) === 'split' ? 'split' : 'fixed';
  const priceRub = Number(row.priceRub ?? 0);
  const courtCostRub = row.courtCostRub == null ? null : Number(row.courtCostRub);
  const registrationClosesAt = row.registrationClosesAt ? asIso(row.registrationClosesAt) : null;
  const gatherDeadline = row.gatherDeadline ? asIso(row.gatherDeadline) : null;
  return {
    id: String(row.id ?? ''),
    seriesId: row.seriesId ? String(row.seriesId) : null,
    kind: String(row.kind) === 'training' ? 'training' : 'game',
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    formatLabel: String(row.formatLabel ?? ''),
    focus: String(row.focus ?? ''),
    startsAt: asIso(row.startsAt),
    endsAt: asIso(row.endsAt),
    registrationClosesAt,
    gatherDeadline,
    levelMin,
    levelMax,
    genderPolicy,
    capacity,
    minPlayers,
    priceMode,
    priceRub,
    courtCostRub,
    courtBooked: Boolean(row.courtBooked),
    priceEstimate: estimatePricePerPerson({
      priceMode,
      priceRub,
      courtCostRub,
      confirmedCount,
      minPlayers,
      capacity,
    }),
    gatherState: deriveGatherState({
      status,
      confirmedCount,
      capacity,
      minPlayers,
      registrationClosesAt,
      gatherDeadline,
    }),
    visibility: ['unlisted', 'link'].includes(String(row.visibility))
      ? (String(row.visibility) as 'unlisted' | 'link')
      : 'public',
    joinPolicy: ['open', 'closed'].includes(String(row.joinPolicy))
      ? (String(row.joinPolicy) as 'open' | 'closed')
      : 'request',
    status,
    ratingMode: String(row.ratingMode) === 'friendly' ? 'friendly' : 'rated',
    resultFormat: ['classic_2x2', 'thai_8', 'king_sideout'].includes(String(row.resultFormat))
      ? String(row.resultFormat) as PlayPostResultFormat
      : 'legacy_custom',
    resultConfig: row.resultConfig && typeof row.resultConfig === 'object' && !Array.isArray(row.resultConfig)
      ? row.resultConfig as Record<string, unknown>
      : {},
    resultEntryMode: String(row.resultEntryMode) === 'live_lite' ? 'live_lite' : 'after_game',
    archivedAt: row.archivedAt ? asIso(row.archivedAt) : null,
    confirmedCount,
    reserveCount: Number(row.reserveCount ?? 0),
    viewerParticipantId: row.viewerParticipantId ? String(row.viewerParticipantId) : null,
    viewerStatus: row.viewerStatus ? (String(row.viewerStatus) as PlayParticipantStatus) : null,
    viewerWaitlistPosition: String(row.viewerStatus ?? '') === 'reserve' && row.viewerWaitlistPosition != null
      ? Number(row.viewerWaitlistPosition)
      : null,
    viewerAttendanceStatus: ['unknown', 'going', 'not_going', 'attended', 'no_show'].includes(String(row.viewerAttendanceStatus))
      ? String(row.viewerAttendanceStatus) as PlayPostView['viewerAttendanceStatus']
      : null,
    viewerAttendanceRespondedAt: row.viewerAttendanceRespondedAt ? asIso(row.viewerAttendanceRespondedAt) : null,
    fit: calculatePlayFit({
      playerLevel: viewer.level,
      playerGender: viewer.gender,
      levelMin,
      levelMax,
      genderPolicy,
    }),
    organizer: mapOrganizer(row),
    venue: mapVenue(row),
    coach: mapCoach(row),
  };
}

const POST_SELECT = `
  pp.id::text AS id,
  pp.series_id::text AS "seriesId",
  pp.kind,
  pp.title,
  pp.description,
  pp.format_label AS "formatLabel",
  pp.focus,
  pp.starts_at AS "startsAt",
  pp.ends_at AS "endsAt",
  pp.registration_closes_at AS "registrationClosesAt",
  pp.level_min AS "levelMin",
  pp.level_max AS "levelMax",
  pp.gender_policy AS "genderPolicy",
  pp.capacity,
  pp.price_rub AS "priceRub",
  pp.min_players AS "minPlayers",
  pp.gather_deadline AS "gatherDeadline",
  pp.price_mode AS "priceMode",
  pp.court_cost_rub AS "courtCostRub",
  pp.court_booked AS "courtBooked",
  pp.visibility,
  pp.join_policy AS "joinPolicy",
  pp.status,
  pp.rating_mode AS "ratingMode",
  pp.result_format AS "resultFormat",
  pp.result_config AS "resultConfig",
  pp.result_entry_mode AS "resultEntryMode",
  pp.archived_at AS "archivedAt",
  po.id::text AS "organizerId",
  po.display_name AS "organizerName",
  po.bio AS "organizerBio",
  po.contact_url AS "organizerContactUrl",
  po.status AS "organizerStatus",
  pv.id::text AS "venueId",
  pv.name AS "venueName",
  pv.city AS "venueCity",
  pv.address AS "venueAddress",
  pv.latitude AS "venueLatitude",
  pv.longitude AS "venueLongitude",
  pv.active AS "venueActive",
  pc.id::text AS "coachId",
  pc.name AS "coachName",
  pc.bio AS "coachBio",
  pc.photo_url AS "coachPhotoUrl",
  pc.active AS "coachActive",
  (SELECT COUNT(*)::int FROM play_post_participants ppc
    WHERE ppc.post_id = pp.id AND ppc.status = 'confirmed') AS "confirmedCount",
  (SELECT COUNT(*)::int FROM play_post_participants ppr
    WHERE ppr.post_id = pp.id AND ppr.status = 'reserve') AS "reserveCount",
  (SELECT ppv.status FROM play_post_participants ppv
    WHERE ppv.post_id = pp.id AND ppv.user_id = $1 LIMIT 1) AS "viewerStatus",
  (SELECT ppv.id::text FROM play_post_participants ppv
    WHERE ppv.post_id = pp.id AND ppv.user_id = $1 LIMIT 1) AS "viewerParticipantId",
  (SELECT ppv.attendance_status FROM play_post_participants ppv
    WHERE ppv.post_id = pp.id AND ppv.user_id = $1 LIMIT 1) AS "viewerAttendanceStatus",
  (SELECT ppv.attendance_responded_at FROM play_post_participants ppv
    WHERE ppv.post_id = pp.id AND ppv.user_id = $1 LIMIT 1) AS "viewerAttendanceRespondedAt",
  (SELECT COUNT(*)::int + 1 FROM play_post_participants w
    WHERE w.post_id = pp.id AND w.status = 'reserve'
      AND w.created_at < (SELECT v.created_at FROM play_post_participants v
        WHERE v.post_id = pp.id AND v.user_id = $1 AND v.status = 'reserve' LIMIT 1)
  ) AS "viewerWaitlistPosition"`;

async function loadViewerProfile(userId?: number | null): Promise<ViewerProfile> {
  if (!userId || !process.env.DATABASE_URL) return { level: null, gender: null };
  const pool = getPool();
  try {
    const direct = await pool.query(
      `SELECT p.skill_level, p.gender
         FROM users u
         LEFT JOIN players p ON p.id = u.player_id
        WHERE u.id = $1 LIMIT 1`,
      [userId]
    );
    const row = direct.rows[0];
    if (row?.gender) {
      return {
        level: nullableLevel(row.skill_level),
        gender: String(row.gender) === 'W' ? 'W' : 'M',
      };
    }
  } catch (err) {
    if (!isSchemaUnavailable(err)) throw err;
  }

  const playerId = await resolvePlayerIdForAccount(userId);
  if (!playerId) return { level: null, gender: null };
  try {
    const fallback = await pool.query(
      'SELECT skill_level, gender FROM players WHERE id = $1 LIMIT 1',
      [playerId]
    );
    const row = fallback.rows[0];
    return row
      ? { level: nullableLevel(row.skill_level), gender: String(row.gender) === 'W' ? 'W' : 'M' }
      : { level: null, gender: null };
  } catch {
    return { level: null, gender: null };
  }
}

export async function listPlayPosts(filters: {
  kind?: PlayKind;
  dateFrom?: string;
  dateTo?: string;
  venueId?: string;
  level?: PlayLevel;
  gender?: 'M' | 'W';
  availableOnly?: boolean;
  viewerUserId?: number | null;
} = {}): Promise<PlayPostView[]> {
  if (!process.env.DATABASE_URL) return [];
  const params: unknown[] = [filters.viewerUserId ?? null];
  const where = [`pp.status = 'published'`, `pp.visibility = 'public'`, `pp.archived_at IS NULL`];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  where.push(`po.status = 'active'`, `pv.active = true`);
  if (filters.kind) add('pp.kind = ?', filters.kind);
  if (filters.dateFrom) add('pp.starts_at >= ?::timestamptz', filters.dateFrom);
  if (filters.dateTo) add('pp.starts_at < ?::timestamptz', filters.dateTo);
  if (filters.venueId) add('pp.venue_id = ?::uuid', filters.venueId);
  if (filters.gender) add(`pp.gender_policy IN ('any', 'mixed', ?)`, filters.gender);
  if (filters.availableOnly) {
    where.push(`(SELECT COUNT(*) FROM play_post_participants pax
      WHERE pax.post_id = pp.id AND pax.status = 'confirmed') < pp.capacity`);
  }
  try {
    const { rows } = await getPool().query(
      `SELECT ${POST_SELECT}
         FROM play_posts pp
         JOIN play_organizers po ON po.id = pp.organizer_id
         JOIN play_venues pv ON pv.id = pp.venue_id
         LEFT JOIN play_coaches pc ON pc.id = pp.coach_id
        WHERE ${where.join(' AND ')}
        ORDER BY pp.starts_at ASC
        LIMIT 200`,
      params
    );
    const viewer = await loadViewerProfile(filters.viewerUserId);
    return rows
      .map((row) => mapPost(row, viewer))
      .filter((post) => {
        if (!filters.level) return true;
        const wanted = PLAY_LEVELS.indexOf(filters.level);
        const min = post.levelMin ? PLAY_LEVELS.indexOf(post.levelMin) : 0;
        const max = post.levelMax ? PLAY_LEVELS.indexOf(post.levelMax) : PLAY_LEVELS.length - 1;
        return wanted >= min && wanted <= max;
      });
  } catch (err) {
    if (isSchemaUnavailable(err)) return [];
    throw err;
  }
}

export async function getPlayPostDetail(
  id: string,
  viewerUserId?: number | null,
  includeNonPublished = false
): Promise<PlayPostDetail | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { rows } = await getPool().query(
      `SELECT ${POST_SELECT}
         FROM play_posts pp
         JOIN play_organizers po ON po.id = pp.organizer_id
         JOIN play_venues pv ON pv.id = pp.venue_id
         LEFT JOIN play_coaches pc ON pc.id = pp.coach_id
        WHERE pp.id = $2::uuid
          AND ($3::boolean OR pp.status IN ('published', 'cancelled', 'completed'))
        LIMIT 1`,
      [viewerUserId ?? null, id, includeNonPublished]
    );
    if (!rows[0]) return null;
    const viewer = await loadViewerProfile(viewerUserId);
    const post = mapPost(rows[0], viewer);
    const roster = await getPool().query(
      `SELECT ppp.id::text AS id, ppp.result_key, ppp.user_id, pl.id::text AS player_id,
              COALESCE(NULLIF(ppp.name_snapshot, ''), NULLIF(pl.name, ''), NULLIF(u.full_name, ''), NULLIF(ppp.guest_name, ''), 'Игрок') AS name,
              COALESCE(NULLIF(pl.photo_url, ''), NULLIF(u.avatar_url, ''), '') AS avatar_url
         FROM play_post_participants ppp
         LEFT JOIN users u ON u.id = ppp.user_id
         LEFT JOIN players pl ON pl.id = ppp.player_id
        WHERE ppp.post_id = $1::uuid AND ppp.status = 'confirmed'
        ORDER BY ppp.created_at ASC`,
      [id]
    );
    const [result, pastTeammatesCount, viewerInvite] = await Promise.all([
      loadResultView(id, viewerUserId ?? null),
      viewerUserId ? countPastTeammates(id, viewerUserId) : Promise.resolve(0),
      viewerUserId ? loadViewerInvite(id, viewerUserId) : Promise.resolve(null),
    ]);
    return {
      ...post,
      participants: roster.rows.map((row) => ({
        id: String(row.id),
        resultKey: Number(row.result_key),
        userId: row.user_id == null ? null : Number(row.user_id),
        playerId: row.player_id ? String(row.player_id) : null,
        name: String(row.name),
        avatarUrl: sanitizeServerImageUrl(row.avatar_url),
      })),
      result,
      pastTeammatesCount,
      viewerInvite,
    };
  } catch (err) {
    if (isSchemaUnavailable(err)) return null;
    throw err;
  }
}

export async function listPlayResources(
  includeInactive = false,
  includeOwners = false
): Promise<PlayResources> {
  if (!process.env.DATABASE_URL) return { organizers: [], venues: [], coaches: [] };
  const suffix = includeInactive ? '' : " WHERE status = 'active'";
  try {
    const pool = getPool();
    const [organizers, venues, coaches] = await Promise.all([
      pool.query(`SELECT id::text, owner_user_id, display_name, bio, contact_url, status FROM play_organizers${suffix} ORDER BY display_name`),
      pool.query(`SELECT id::text, name, city, address, latitude, longitude, active FROM play_venues${includeInactive ? '' : ' WHERE active = true'} ORDER BY name`),
      pool.query(`SELECT id::text, name, bio, photo_url, active FROM play_coaches${includeInactive ? '' : ' WHERE active = true'} ORDER BY name`),
    ]);
    return {
      organizers: organizers.rows.map((row) => mapOrganizer(row, includeOwners)),
      venues: venues.rows.map(mapVenue),
      coaches: coaches.rows.map((row) => mapCoach(row)).filter((row): row is PlayCoach => Boolean(row)),
    };
  } catch (err) {
    if (isSchemaUnavailable(err)) return { organizers: [], venues: [], coaches: [] };
    throw err;
  }
}

async function requireOrganizer(client: PoolClient, actor: PlayActor, requestedId: string) {
  if (actor.kind === 'admin') {
    const result = await client.query(
      `SELECT id::text, owner_user_id, display_name, status
         FROM play_organizers WHERE id = $1::uuid AND status = 'active' LIMIT 1`,
      [requestedId]
    );
    if (!result.rows[0]) throw new PlayServiceError(400, 'Активный организатор не найден');
    return result.rows[0];
  }
  let result = await client.query(
    `SELECT id::text, owner_user_id, display_name, status
       FROM play_organizers
      WHERE owner_user_id = $1 AND status = 'active' LIMIT 1`,
    [actor.userId]
  );
  if (!result.rows[0]) {
    result = await client.query(
      `INSERT INTO play_organizers (owner_user_id, display_name, status)
       SELECT u.id, COALESCE(NULLIF(u.nickname, ''), NULLIF(u.full_name, ''), split_part(u.email, '@', 1)), 'active'
         FROM users u WHERE u.id = $1
       ON CONFLICT (owner_user_id) DO UPDATE SET status = 'active', updated_at = now()
       RETURNING id::text, owner_user_id, display_name, status`,
      [actor.userId]
    );
  }
  const organizer = result.rows[0];
  if (!organizer) throw new PlayServiceError(403, 'Не удалось создать профиль организатора');
  if (requestedId && String(organizer.id) !== requestedId) {
    throw new PlayServiceError(403, 'Нельзя публиковать от имени другого организатора');
  }
  return organizer;
}

export async function ensurePlayOrganizer(actor: PlayActor): Promise<PlayOrganizer> {
  if (actor.kind !== 'user') throw new PlayServiceError(400, 'Профиль игрока не требуется');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const row = await requireOrganizer(client, actor, '');
    await client.query('COMMIT');
    return {
      id: String(row.id),
      ownerUserId: Number(row.owner_user_id),
      displayName: String(row.display_name),
      bio: '',
      contactUrl: '',
      status: 'active',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function assertResources(client: PoolClient, input: PlayPostInput) {
  const venue = await client.query('SELECT id FROM play_venues WHERE id = $1::uuid AND active = true', [input.venueId]);
  if (!venue.rows[0]) throw new PlayServiceError(400, 'Активная площадка не найдена');
  if (input.coachId) {
    const coach = await client.query('SELECT id FROM play_coaches WHERE id = $1::uuid AND active = true', [input.coachId]);
    if (!coach.rows[0]) throw new PlayServiceError(400, 'Активный тренер не найден');
  }
}

async function insertPost(
  client: PoolClient,
  input: PlayPostInput,
  seriesId: string | null,
  occurrence: { startsAt: string; endsAt: string },
  registrationClosesAt: string | null,
  gatherDeadline: string | null,
  adminActor: string | null
): Promise<string> {
  const result = await client.query(
    `INSERT INTO play_posts (
       series_id, organizer_id, venue_id, coach_id, kind, title, description,
       format_label, focus, starts_at, ends_at, registration_closes_at, gather_deadline,
       level_min, level_max, gender_policy, capacity, min_players,
       price_mode, price_rub, court_cost_rub, court_booked, visibility,
       join_policy, status, rating_mode, result_format, result_config, result_entry_mode,
       created_by_admin_actor, published_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7,
       $8, $9, $10::timestamptz, $11::timestamptz, $12::timestamptz, $13::timestamptz,
       $14, $15, $16, $17, $18,
       $19, $20, $21, $22, $23, $24, $25, $26, $27, $28::jsonb, $29, $30,
       CASE WHEN $25 = 'published' THEN now() ELSE NULL END
     ) RETURNING id::text`,
    [
      seriesId, input.organizerId, input.venueId, input.coachId, input.kind, input.title,
      input.description, input.formatLabel, input.focus, occurrence.startsAt, occurrence.endsAt,
      registrationClosesAt, gatherDeadline, input.levelMin, input.levelMax, input.genderPolicy,
       input.capacity, input.minPlayers, input.priceMode, input.priceRub, input.courtCostRub,
       input.courtBooked, input.visibility, input.joinPolicy, input.status, input.ratingMode,
       input.resultFormat, JSON.stringify(input.resultConfig), input.resultEntryMode, adminActor,
    ]
  );
  return String(result.rows[0].id);
}

export async function createPlayPosts(actor: PlayActor, input: PlayPostInput): Promise<PlayPostDetail[]> {
  if (!process.env.DATABASE_URL) throw new PlayServiceError(503, 'База данных не настроена');
  if (!['draft', 'published'].includes(input.status)) {
    throw new PlayServiceError(400, 'Новое событие может быть черновиком или опубликованным');
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const organizer = await requireOrganizer(client, actor, input.organizerId);
    input.organizerId = String(organizer.id);
    if (actor.kind === 'user') {
      const limits = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE pp.status = 'draft' AND pp.archived_at IS NULL)::int AS drafts,
           COUNT(*) FILTER (WHERE pp.status = 'published' AND pp.starts_at > now() AND pp.archived_at IS NULL)::int AS future
         FROM play_posts pp WHERE pp.organizer_id = $1::uuid`,
        [input.organizerId]
      );
      if (input.status === 'draft' && Number(limits.rows[0].drafts) >= 5) {
        throw new PlayServiceError(409, 'Можно хранить не более 5 черновиков');
      }
      if (input.status === 'published' && Number(limits.rows[0].future) > 0) {
        throw new PlayServiceError(409, 'Сначала завершите или отмените уже опубликованную будущую игру');
      }
    }
    await assertResources(client, input);
    let seriesId: string | null = null;
    if (input.repeatWeeks > 1) {
      const series = await client.query(
        `INSERT INTO play_series (organizer_id, kind, occurrences)
         VALUES ($1::uuid, $2, $3) RETURNING id::text`,
        [input.organizerId, input.kind, input.repeatWeeks]
      );
      seriesId = String(series.rows[0].id);
    }
    const ids: string[] = [];
    const registrationLeadMs = input.registrationClosesAt
      ? new Date(input.startsAt).getTime() - new Date(input.registrationClosesAt).getTime()
      : null;
    const gatherLeadMs = input.gatherDeadline
      ? new Date(input.startsAt).getTime() - new Date(input.gatherDeadline).getTime()
      : null;
    for (const occurrence of expandWeeklyOccurrences(input.startsAt, input.endsAt, input.repeatWeeks)) {
      const occurrenceClosesAt = registrationLeadMs == null
        ? null
        : new Date(new Date(occurrence.startsAt).getTime() - registrationLeadMs).toISOString();
      const occurrenceGatherAt = gatherLeadMs == null
        ? null
        : new Date(new Date(occurrence.startsAt).getTime() - gatherLeadMs).toISOString();
      const postId = await insertPost(
        client,
        input,
        seriesId,
        occurrence,
        occurrenceClosesAt,
        occurrenceGatherAt,
        actor.kind === 'admin' ? actor.admin.id : null
      );
      ids.push(postId);
      if (actor.kind === 'user' && input.joinAuthor) {
        await client.query(
          `INSERT INTO play_post_participants (post_id, user_id, player_id, status, reviewed_at)
           SELECT $1::uuid, u.id, u.player_id, 'confirmed', now() FROM users u WHERE u.id = $2
           ON CONFLICT (post_id, user_id) DO NOTHING`,
          [postId, actor.userId]
        );
      }
    }
    await client.query('COMMIT');
    return (await Promise.all(ids.map((id) => getPlayPostDetail(id, null, true))))
      .filter((post): post is PlayPostDetail => Boolean(post));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createPlayRematch(
  actor: PlayActor,
  sourcePostId: string,
): Promise<{ post: PlayPostDetail; invited: number; skippedGuests: number }> {
  const client = await getPool().connect();
  let source: Record<string, unknown>;
  let userIds: number[] = [];
  let skippedGuests = 0;
  try {
    source = await assertPostManager(client, actor, sourcePostId);
    if (String(source.kind) !== 'game') throw new PlayServiceError(400, 'Реванш можно собрать только для игры');
    const roster = await client.query(
      `SELECT user_id FROM play_post_participants
        WHERE post_id=$1::uuid AND status='confirmed' ORDER BY created_at`,
      [sourcePostId],
    );
    userIds = roster.rows.filter((row) => row.user_id != null).map((row) => Number(row.user_id));
    skippedGuests = roster.rows.length - userIds.length;
  } finally {
    client.release();
  }

  const sourceStart = new Date(String(source.starts_at));
  const sourceEnd = new Date(String(source.ends_at));
  const duration = Math.max(30 * 60_000, sourceEnd.getTime() - sourceStart.getTime());
  let nextStart = new Date(sourceStart.getTime() + 7 * 24 * 60 * 60_000);
  while (nextStart.getTime() < Date.now() + 2 * 60 * 60_000) nextStart = new Date(nextStart.getTime() + 7 * 24 * 60 * 60_000);
  const shiftDate = (value: unknown): string | null => {
    if (!value) return null;
    const original = new Date(String(value));
    if (!Number.isFinite(original.getTime())) return null;
    return new Date(nextStart.getTime() - (sourceStart.getTime() - original.getTime())).toISOString();
  };
  const input = currentPostInput(source, {
    startsAt: nextStart.toISOString(),
    endsAt: new Date(nextStart.getTime() + duration).toISOString(),
    registrationClosesAt: shiftDate(source.registration_closes_at),
    gatherDeadline: shiftDate(source.gather_deadline),
    status: 'published',
  });
  input.repeatWeeks = 1;
  input.joinAuthor = false;
  const [post] = await createPlayPosts(actor, input);
  let invited = 0;
  for (const userId of userIds) {
    if (actor.kind === 'user' && userId === actor.userId) {
      await addManagedPlayParticipant(actor, post.id, { userId });
      continue;
    }
    try {
      await createPlayInvite(actor, post.id, userId);
      invited++;
    } catch (error) {
      if (!(error instanceof PlayServiceError) || error.status >= 500) throw error;
    }
  }
  const detail = await getPlayPostDetail(post.id, actor.kind === 'user' ? actor.userId : null, true);
  if (!detail) throw new PlayServiceError(500, 'Реванш создан, но не удалось загрузить карточку');
  return { post: detail, invited, skippedGuests };
}

async function assertPostManager(client: PoolClient, actor: PlayActor, postId: string) {
  const result = await client.query(
    `SELECT pp.*, po.owner_user_id
       FROM play_posts pp
       JOIN play_organizers po ON po.id = pp.organizer_id
      WHERE pp.id = $1::uuid FOR UPDATE`,
    [postId]
  );
  const post = result.rows[0];
  if (!post) throw new PlayServiceError(404, 'Событие не найдено');
  if (actor.kind === 'user' && Number(post.owner_user_id) !== actor.userId) {
    throw new PlayServiceError(403, 'Нет прав на управление событием');
  }
  return post;
}

function currentPostInput(row: Record<string, unknown>, patch: Record<string, unknown>): PlayPostInput {
  const pick = (camel: string, snake: string, fallback: unknown) => {
    if (Object.prototype.hasOwnProperty.call(patch, camel)) return patch[camel];
    if (Object.prototype.hasOwnProperty.call(patch, snake)) return patch[snake];
    return fallback;
  };
  return normalizePlayPostInput({
    kind: pick('kind', 'kind', row.kind),
    organizerId: pick('organizerId', 'organizer_id', row.organizer_id),
    venueId: pick('venueId', 'venue_id', row.venue_id),
    coachId: pick('coachId', 'coach_id', row.coach_id),
    title: pick('title', 'title', row.title),
    description: pick('description', 'description', row.description),
    formatLabel: pick('formatLabel', 'format_label', row.format_label),
    focus: pick('focus', 'focus', row.focus),
    startsAt: pick('startsAt', 'starts_at', row.starts_at),
    endsAt: pick('endsAt', 'ends_at', row.ends_at),
    registrationClosesAt: pick('registrationClosesAt', 'registration_closes_at', row.registration_closes_at),
    gatherDeadline: pick('gatherDeadline', 'gather_deadline', row.gather_deadline),
    levelMin: pick('levelMin', 'level_min', row.level_min),
    levelMax: pick('levelMax', 'level_max', row.level_max),
    genderPolicy: pick('genderPolicy', 'gender_policy', row.gender_policy),
    capacity: pick('capacity', 'capacity', row.capacity),
    minPlayers: pick('minPlayers', 'min_players', row.min_players),
    priceMode: pick('priceMode', 'price_mode', row.price_mode),
    priceRub: pick('priceRub', 'price_rub', row.price_rub),
    courtCostRub: pick('courtCostRub', 'court_cost_rub', row.court_cost_rub),
    courtBooked: pick('courtBooked', 'court_booked', row.court_booked),
    visibility: pick('visibility', 'visibility', row.visibility),
    joinPolicy: pick('joinPolicy', 'join_policy', row.join_policy),
    status: pick('status', 'status', row.status),
    ratingMode: pick('ratingMode', 'rating_mode', row.rating_mode),
    resultFormat: pick('resultFormat', 'result_format', row.result_format),
    resultConfig: pick('resultConfig', 'result_config', row.result_config),
    resultEntryMode: pick('resultEntryMode', 'result_entry_mode', row.result_entry_mode),
    repeatWeeks: 1,
    joinAuthor: false,
  });
}

export async function updatePlayPost(
  actor: PlayActor,
  id: string,
  patch: Record<string, unknown>
): Promise<PlayPostDetail> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const current = await assertPostManager(client, actor, id);
    const input = currentPostInput(current, patch);
    const { validatePlayPostInput } = await import('@/lib/play-core');
    const error = validatePlayPostInput(input);
    if (error) throw new PlayServiceError(400, error);
    await requireOrganizer(client, actor, input.organizerId);
    await assertResources(client, input);
    const count = await client.query(
      `SELECT COUNT(*)::int AS count FROM play_post_participants
        WHERE post_id = $1::uuid AND status = 'confirmed'`,
      [id]
    );
    if (Number(count.rows[0].count) > input.capacity) {
      throw new PlayServiceError(400, 'Нельзя уменьшить вместимость ниже числа подтверждённых игроков');
    }
    // D5: при набранном составе разрешена только фиксация split → fixed, обратно — нет
    if (
      Number(count.rows[0].count) > 0 &&
      String(current.price_mode ?? 'fixed') === 'fixed' &&
      input.priceMode === 'split'
    ) {
      throw new PlayServiceError(400, 'Нельзя перейти на делёжку корта, когда состав уже набирается');
    }
    if (String(current.rating_mode ?? 'rated') !== input.ratingMode) {
      const resultState = await client.query(
        `SELECT status FROM play_game_results WHERE post_id = $1::uuid LIMIT 1`,
        [id],
      );
      if (['confirmed', 'cancelled'].includes(String(resultState.rows[0]?.status ?? ''))) {
        throw new PlayServiceError(409, 'Режим рейтинга нельзя менять после утверждения счёта');
      }
      if (
        String(current.rating_mode ?? 'rated') === 'friendly'
        && input.ratingMode === 'rated'
        && (resultState.rows[0] || new Date(String(current.starts_at)).getTime() <= Date.now())
      ) {
        throw new PlayServiceError(409, 'После начала обычную игру нельзя сделать рейтинговой');
      }
    }
    const capacityIncreased = input.capacity > Number(current.capacity);
    const cancelled = String(current.status) !== 'cancelled' && input.status === 'cancelled';
    await client.query(
      `UPDATE play_posts SET
         organizer_id=$2::uuid, venue_id=$3::uuid, coach_id=$4::uuid, kind=$5,
         title=$6, description=$7, format_label=$8, focus=$9,
         starts_at=$10::timestamptz, ends_at=$11::timestamptz,
         registration_closes_at=$12::timestamptz, gather_deadline=$13::timestamptz,
         level_min=$14, level_max=$15,
         gender_policy=$16, capacity=$17, min_players=$18,
         price_mode=$19, price_rub=$20, court_cost_rub=$21, court_booked=$22,
         visibility=$23, join_policy=$24, status=$25, rating_mode=$26,
         result_format=$27, result_config=$28::jsonb, result_entry_mode=$29,
         published_at=CASE WHEN $25='published' THEN COALESCE(published_at, now()) ELSE published_at END
       WHERE id=$1::uuid`,
      [id, input.organizerId, input.venueId, input.coachId, input.kind, input.title,
        input.description, input.formatLabel, input.focus, input.startsAt, input.endsAt,
        input.registrationClosesAt, input.gatherDeadline, input.levelMin, input.levelMax,
        input.genderPolicy, input.capacity, input.minPlayers, input.priceMode, input.priceRub,
        input.courtCostRub, input.courtBooked, input.visibility, input.joinPolicy, input.status,
        input.ratingMode, input.resultFormat, JSON.stringify(input.resultConfig), input.resultEntryMode]
    );
    if (cancelled) {
      const result = await client.query(
        `SELECT id::text, status FROM play_game_results
          WHERE post_id = $1::uuid LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (result.rows[0]) {
        const resultId = String(result.rows[0].id);
        const reason = 'Игра отменена организатором';
        if (String(result.rows[0].status) === 'confirmed') {
          await reverseActivePlayResultRating(client, resultId, reason);
        }
        await client.query(
          `UPDATE play_game_results
              SET status = 'cancelled', auto_confirm_at = NULL,
                  approved_at = NULL, approved_by_user_id = NULL, approved_by_admin_actor = NULL,
                  reversed_at = COALESCE(reversed_at, now()), reversed_by = $2,
                  reversal_reason = $3
            WHERE id = $1::uuid AND status <> 'cancelled'`,
          [
            resultId,
            actor.kind === 'user' ? String(actor.userId) : actor.admin.id,
            reason,
          ],
        );
        await client.query(
          `UPDATE play_result_correction_requests
              SET status = 'cancelled', resolved_at = now(), resolution_comment = $2
            WHERE result_id = $1::uuid AND status = 'pending'`,
          [resultId, reason],
        );
      }
      await cancelActivePlaySessions(client, id);
    }
    // Увеличение вместимости → автопопадание из waitlist на освободившиеся слоты
    if (capacityIncreased && input.status === 'published') {
      const promoted = await promoteReserves(
        client,
        id,
        input.capacity - Number(count.rows[0].count)
      );
      for (const chat of promoted) {
        await enqueueTelegram(
          client,
          chat,
          'waitlist_promoted',
          `Освободилось место: вы подтверждены на «${input.title}». Детали: https://lpvolley.ru/partner/${id}`
        );
      }
    }
    const moved = asIso(current.starts_at) !== input.startsAt || asIso(current.ends_at) !== input.endsAt;
    if (moved || cancelled) {
      const chats = await client.query(
        `SELECT DISTINCT u.telegram_chat_id
           FROM play_post_participants ppp
           JOIN users u ON u.id = ppp.user_id
          WHERE ppp.post_id=$1::uuid
            AND ppp.status IN ('pending','confirmed','reserve')
            AND COALESCE(u.telegram_chat_id, '') <> ''`,
        [id]
      );
      // Outbox, а не прямой send: на сервере без доступа к TG доставит релей.
      for (const row of chats.rows) {
        const chat = String(row.telegram_chat_id);
        await enqueueTelegram(
          client,
          chat,
          cancelled ? 'post_cancelled' : 'post_moved',
          cancelled
            ? `Событие «${input.title}» отменено. Откройте расписание: https://lpvolley.ru/partner`
            : `Изменились дата или время события «${input.title}». Проверьте детали: https://lpvolley.ru/partner/${id}`,
          `${cancelled ? 'post_cancelled' : 'post_moved'}:${id}:${chat}${cancelled ? '' : ':' + String(input.startsAt)}`
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const post = await getPlayPostDetail(id, actor.kind === 'user' ? actor.userId : null, true);
  if (!post) throw new PlayServiceError(404, 'Событие не найдено');
  return post;
}

export async function setPlayPostArchived(
  actor: PlayActor,
  id: string,
  archived: boolean
): Promise<PlayPostDetail> {
  if (actor.kind !== 'admin') {
    throw new PlayServiceError(403, 'Архив доступен только администратору');
  }
  const result = await getPool().query(
    `UPDATE play_posts
        SET archived_at = CASE WHEN $2::boolean THEN now() ELSE NULL END
      WHERE id = $1::uuid
      RETURNING id`,
    [id, archived]
  );
  if (!result.rowCount) throw new PlayServiceError(404, 'Событие не найдено');
  const post = await getPlayPostDetail(id, null, true);
  if (!post) throw new PlayServiceError(404, 'Событие не найдено');
  return post;
}

// --- Play V3 helpers (TZ-production-play-v3) ---

// Outbox-отправка с идемпотентностью; если миграция 071 ещё не применена — прямой send.
async function enqueueTelegram(
  client: PoolClient,
  chatId: string,
  kind: string,
  text: string,
  dedupKey?: string
) {
  const chat = String(chatId ?? '').trim();
  if (!chat) return;
  try {
    await client.query(
      `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [chat, kind, text, dedupKey ?? null]
    );
  } catch (err) {
    if (!isSchemaUnavailable(err)) throw err;
    await sendTelegramMessage(chat, text);
  }
}

// Outbox вне транзакции (уведомления после COMMIT): отдельное соединение.
// Важно для серверов без доступа к Telegram API — сообщение заберёт
// локальный бот-релей через /api/telegram/agent, а не прямой send.
async function enqueueTelegramStandalone(
  chatId: string,
  kind: string,
  text: string,
  dedupKey?: string
) {
  const chat = String(chatId ?? '').trim();
  if (!chat) return;
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [chat, kind, text, dedupKey ?? null]
    );
  } catch (err) {
    if (!isSchemaUnavailable(err)) throw err;
    await sendTelegramMessage(chat, text);
  } finally {
    client.release();
  }
}

// Автопопадание из waitlist: FIFO повышение reserve → confirmed на свободные слоты.
async function promoteReserves(
  client: PoolClient,
  postId: string,
  maxCount: number
): Promise<string[]> {
  if (maxCount <= 0) return [];
  const reserves = await client.query(
    `SELECT ppp.id, u.telegram_chat_id
       FROM play_post_participants ppp
       JOIN users u ON u.id = ppp.user_id
      WHERE ppp.post_id = $1::uuid AND ppp.status = 'reserve'
      ORDER BY ppp.created_at ASC
      FOR UPDATE OF ppp SKIP LOCKED
      LIMIT $2`,
    [postId, maxCount]
  );
  for (const row of reserves.rows) {
    await client.query(
      `UPDATE play_post_participants SET status = 'confirmed', reviewed_at = now()
        WHERE id = $1::uuid`,
      [row.id]
    );
  }
  return reserves.rows.map((row) => String(row.telegram_chat_id ?? ''));
}

async function freeSlots(client: PoolClient, postId: string, capacity: number): Promise<number> {
  const count = await client.query(
    `SELECT COUNT(*)::int AS count FROM play_post_participants
      WHERE post_id = $1::uuid AND status = 'confirmed'`,
    [postId]
  );
  return Math.max(0, capacity - Number(count.rows[0].count));
}

// Переход filling → minimum_reached: разовое событие (dedup_key на игру+чат).
async function maybeNotifyMinimumReached(
  client: PoolClient,
  postId: string,
  post: { min_players?: number | null; capacity: number; status: string },
  title: string
) {
  if (post.status !== 'published') return;
  const minimum = Number(post.min_players ?? post.capacity);
  const count = await client.query(
    `SELECT COUNT(*)::int AS count FROM play_post_participants
      WHERE post_id = $1::uuid AND status = 'confirmed'`,
    [postId]
  );
  if (Number(count.rows[0].count) < minimum) return;
  const chats = await client.query(
    `SELECT DISTINCT u.telegram_chat_id
       FROM play_post_participants ppp
       JOIN users u ON u.id = ppp.user_id
      WHERE ppp.post_id = $1::uuid AND ppp.status = 'confirmed'
        AND COALESCE(u.telegram_chat_id, '') <> ''`,
    [postId]
  );
  for (const row of chats.rows) {
    const chat = String(row.telegram_chat_id);
    await enqueueTelegram(
      client,
      chat,
      'minimum_reached',
      `«${title}» состоится ✅ Минимальный состав набран. Детали: https://lpvolley.ru/partner/${postId}`,
      `minimum_reached:${postId}:${chat}`
    );
  }
}

export async function joinPlayPost(userId: number, postId: string) {
  const client = await getPool().connect();
  let organizerChat = '';
  let title = '';
  let participantName = '';
  try {
    await client.query('BEGIN');
    const postResult = await client.query(
      `SELECT pp.*, po.owner_user_id
         FROM play_posts pp
         JOIN play_organizers po ON po.id = pp.organizer_id
        WHERE pp.id = $1::uuid FOR UPDATE`,
      [postId]
    );
    const post = postResult.rows[0];
    if (!post) throw new PlayServiceError(404, 'Событие не найдено');
    if (post.status !== 'published') throw new PlayServiceError(409, 'Запись на событие недоступна');
    if (!['request', 'open'].includes(String(post.join_policy))) {
      throw new PlayServiceError(409, 'Запись доступна только через организатора');
    }
    if (new Date(post.starts_at).getTime() <= Date.now()) throw new PlayServiceError(409, 'Событие уже началось');
    if (post.registration_closes_at && new Date(post.registration_closes_at).getTime() <= Date.now()) {
      throw new PlayServiceError(409, 'Запись на событие закрыта');
    }
    const isOpen = String(post.join_policy) === 'open';
    const userResult = await client.query(
      `SELECT u.full_name, u.player_id, u.telegram_chat_id AS user_chat,
              owner.telegram_chat_id AS organizer_chat
         FROM users u
         LEFT JOIN users owner ON owner.id = $2
        WHERE u.id = $1 LIMIT 1`,
      [userId, post.owner_user_id]
    );
    if (!userResult.rows[0]) throw new PlayServiceError(401, 'Пользователь не найден');
    // open: сразу confirmed, если есть слот, иначе — waitlist с автопопаданием (D4)
    let targetStatus: 'pending' | 'confirmed' | 'reserve' = 'pending';
    if (isOpen) {
      targetStatus = (await freeSlots(client, postId, Number(post.capacity))) > 0
        ? 'confirmed'
        : 'reserve';
    }
    const inserted = await client.query(
      `INSERT INTO play_post_participants (post_id, user_id, player_id, status)
       VALUES ($1::uuid, $2, $3::uuid, $4)
       ON CONFLICT (post_id, user_id) DO UPDATE SET
         player_id = EXCLUDED.player_id, status = EXCLUDED.status, reviewed_at = NULL
       WHERE play_post_participants.status IN ('cancelled', 'rejected')
       RETURNING id::text, status`,
      [postId, userId, userResult.rows[0].player_id, targetStatus]
    );
    if (!inserted.rows[0]) throw new PlayServiceError(409, 'Заявка уже существует');
    organizerChat = String(userResult.rows[0].organizer_chat ?? '');
    participantName = String(userResult.rows[0].full_name ?? 'Игрок');
    title = String(post.title);
    if (isOpen && targetStatus === 'confirmed') {
      await enqueueTelegram(
        client,
        String(userResult.rows[0].user_chat ?? ''),
        'join_confirmed',
        `Вы подтверждены на «${title}». Детали: https://lpvolley.ru/partner/${postId}`
      );
      await enqueueTelegram(
        client,
        organizerChat,
        'join_request',
        `${participantName} вписался на «${title}». Управление: https://lpvolley.ru/partner/${postId}`
      );
      await maybeNotifyMinimumReached(client, postId, post, title);
    }
    if (isOpen && targetStatus === 'reserve') {
      const position = await client.query(
        `SELECT COUNT(*)::int AS count FROM play_post_participants
          WHERE post_id = $1::uuid AND status = 'reserve'`,
        [postId]
      );
      await enqueueTelegram(
        client,
        String(userResult.rows[0].user_chat ?? ''),
        'waitlist_joined',
        `Мест пока нет: вы №${Number(position.rows[0].count)} в листе ожидания «${title}». Попадёте в состав автоматически, как освободится слот.`
      );
    }
    await client.query('COMMIT');
    if (!isOpen) {
      await enqueueTelegramStandalone(
        organizerChat,
        'join_request',
        `Новая заявка от ${participantName} на «${title}». Управление: https://lpvolley.ru/partner/manage`,
        `join_request:${String(inserted.rows[0].id)}`
      );
    }
    return { id: String(inserted.rows[0].id), status: targetStatus };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export type PlayParticipantRecommendationTag = 'last_roster' | 'frequent_coplayer' | 'available' | 'fit_level' | 'long_time_no_play';

export interface RecommendedPlayParticipantCandidate extends PlayParticipantCandidate {
  recommendationTags: PlayParticipantRecommendationTag[];
  sharedGamesCount: number;
  reliability: PlayReliabilityView;
}

export async function searchManagedPlayParticipantCandidates(
  actor: PlayActor,
  postId: string,
  rawSearch: unknown
): Promise<RecommendedPlayParticipantCandidate[]> {
  const search = String(rawSearch ?? '').trim().slice(0, 80);
  if (search.length === 1) return [];
  const client = await getPool().connect();
  try {
    await assertPostManager(client, actor, postId);
    const { rows } = await client.query(
      `WITH target AS (
         SELECT post.id, post.organizer_id, post.starts_at, post.ends_at, post.level_min, post.level_max, organizer.owner_user_id
           FROM play_posts post
           JOIN play_organizers organizer ON organizer.id = post.organizer_id
          WHERE post.id = $1::uuid
       ), last_post AS (
         SELECT previous.id
           FROM play_posts previous
           CROSS JOIN target
          WHERE previous.organizer_id = target.organizer_id
            AND previous.id <> target.id
            AND previous.starts_at < target.starts_at
            AND previous.status IN ('published', 'completed')
            AND EXISTS (
              SELECT 1 FROM play_post_participants previous_participant
               WHERE previous_participant.post_id = previous.id
                 AND previous_participant.status = 'confirmed'
            )
          ORDER BY previous.starts_at DESC
          LIMIT 1
       )
       SELECT u.id AS user_id, pl.id AS player_id,
              COALESCE(NULLIF(pl.name,''), NULLIF(u.full_name,''), NULLIF(u.nickname,''), split_part(u.email, '@', 1)) AS name,
              pl.skill_level, true AS registered,
              target.level_min AS target_level_min, target.level_max AS target_level_max,
              EXISTS (
                SELECT 1 FROM play_post_participants previous_participant
                 WHERE previous_participant.post_id = (SELECT id FROM last_post)
                   AND previous_participant.user_id = u.id
                   AND previous_participant.status = 'confirmed'
              ) AS in_last_roster,
              (
                SELECT COUNT(DISTINCT candidate_participant.post_id)::int
                  FROM play_post_participants candidate_participant
                  JOIN play_post_participants organizer_participant
                    ON organizer_participant.post_id = candidate_participant.post_id
                   AND organizer_participant.user_id = target.owner_user_id
                   AND organizer_participant.status = 'confirmed'
                  JOIN play_posts played_post ON played_post.id = candidate_participant.post_id
                 WHERE candidate_participant.user_id = u.id
                   AND candidate_participant.status = 'confirmed'
                   AND candidate_participant.user_id <> organizer_participant.user_id
                   AND played_post.status = 'completed'
              ) AS shared_games_count,
              (
                SELECT MAX(played_post.starts_at)
                  FROM play_post_participants candidate_participant
                  JOIN play_post_participants organizer_participant ON organizer_participant.post_id=candidate_participant.post_id
                  JOIN play_posts played_post ON played_post.id=candidate_participant.post_id
                 WHERE candidate_participant.user_id=u.id AND organizer_participant.user_id=target.owner_user_id
                   AND candidate_participant.status='confirmed' AND organizer_participant.status='confirmed'
                   AND played_post.status='completed'
              ) AS last_shared_at,
              (SELECT COUNT(*)::int FROM play_post_participants rp JOIN play_posts rpost ON rpost.id=rp.post_id
                WHERE rp.user_id=u.id AND rp.status='confirmed' AND rpost.starts_at<now()) AS reliability_games,
              (SELECT COUNT(*)::int FROM play_post_participants rp JOIN play_posts rpost ON rpost.id=rp.post_id
                WHERE rp.user_id=u.id AND rp.attendance_status='attended' AND rpost.starts_at<now()) AS attended_count,
              (SELECT COUNT(*)::int FROM play_post_participants rp JOIN play_posts rpost ON rpost.id=rp.post_id
                WHERE rp.user_id=u.id AND rp.attendance_status='no_show' AND rpost.starts_at<now()) AS no_show_count,
              (SELECT COUNT(*)::int FROM play_post_participants rp JOIN play_posts rpost ON rpost.id=rp.post_id
                WHERE rp.user_id=u.id AND rp.attendance_status='not_going'
                  AND rp.attendance_responded_at > rpost.starts_at - interval '12 hours') AS late_cancel_count,
              EXISTS (
                SELECT 1 FROM play_availability availability
                 WHERE availability.user_id = u.id
                   AND availability.active
                   AND availability.date_from < target.ends_at
                   AND availability.date_to > target.starts_at
              ) AS availability_overlap
         FROM users u
         LEFT JOIN players pl ON pl.id = u.player_id
         CROSS JOIN target
        WHERE ($2 = '' OR COALESCE(pl.name, u.full_name, u.nickname, u.email, '') ILIKE '%' || $2 || '%')
          AND NOT EXISTS (
          SELECT 1 FROM play_post_participants ppp
           WHERE ppp.post_id = $1::uuid
             AND ppp.user_id = u.id
             AND ppp.status IN ('pending','confirmed','reserve')
          )
          AND NOT EXISTS (
            SELECT 1 FROM play_invites pi
             WHERE pi.post_id = $1::uuid AND pi.to_user_id = u.id AND pi.status = 'sent'
          )
        ORDER BY CASE
          WHEN lower(COALESCE(pl.name, u.full_name, u.nickname, u.email, '')) = lower($2) THEN 0
          ELSE 1
        END,
        in_last_roster DESC,
        availability_overlap DESC,
        shared_games_count DESC,
        name
        LIMIT 20`,
      [postId, search]
    );
    return rows.map((row) => {
      const sharedGamesCount = Number(row.shared_games_count ?? 0);
      const recommendationTags: PlayParticipantRecommendationTag[] = [];
      if (Boolean(row.in_last_roster)) recommendationTags.push('last_roster');
      if (sharedGamesCount >= 2) recommendationTags.push('frequent_coplayer');
      if (Boolean(row.availability_overlap)) recommendationTags.push('available');
      const candidateLevel = nullableLevel(row.skill_level);
      const targetMin = nullableLevel(row.target_level_min ?? row.level_min);
      const targetMax = nullableLevel(row.target_level_max ?? row.level_max);
      const candidateIndex = candidateLevel ? PLAY_LEVELS.indexOf(candidateLevel) : -1;
      if (candidateIndex >= 0 && candidateIndex >= (targetMin ? PLAY_LEVELS.indexOf(targetMin) : 0) && candidateIndex <= (targetMax ? PLAY_LEVELS.indexOf(targetMax) : PLAY_LEVELS.length - 1)) recommendationTags.push('fit_level');
      if (!row.last_shared_at || new Date(String(row.last_shared_at)).getTime() < Date.now() - 90 * 24 * 60 * 60_000) recommendationTags.push('long_time_no_play');
      const trackedGames = Number(row.reliability_games ?? 0);
      const attended = Number(row.attended_count ?? 0);
      const noShows = Number(row.no_show_count ?? 0);
      const lateCancellations = Number(row.late_cancel_count ?? 0);
      const scored = attended + noShows + lateCancellations;
      const score = scored ? Math.max(0, Math.round((attended + lateCancellations * 0.35) / scored * 100)) : null;
      return {
        userId: row.user_id == null ? null : Number(row.user_id),
        playerId: row.player_id ? String(row.player_id) : null,
        name: String(row.name),
        playerLevel: nullableLevel(row.skill_level),
        registered: Boolean(row.registered),
        recommendationTags,
        sharedGamesCount,
        reliability: {
          score,
          trackedGames,
          attended,
          noShows,
          lateCancellations,
          label: score == null || trackedGames < 3 ? 'new' : score >= 90 ? 'reliable' : score >= 70 ? 'stable' : 'attention',
        },
      };
    });
  } finally {
    client.release();
  }
}

export async function addManagedPlayParticipant(
  actor: PlayActor,
  postId: string,
  identity: { userId?: number | null; playerId?: string | null; guestName?: string | null }
): Promise<{ id: string; status: 'confirmed' | 'reserve'; name: string }> {
  const userId = Number(identity.userId);
  const playerId = String(identity.playerId ?? '').trim();
  const guestName = String(identity.guestName ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const hasUser = Number.isInteger(userId) && userId > 0;
  const hasPlayer = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(playerId);
  const hasGuest = !hasUser && !hasPlayer && guestName.length >= 2;
  if (!hasUser && !hasPlayer && !hasGuest) throw new PlayServiceError(400, 'Выберите игрока или укажите имя гостя');
  const client = await getPool().connect();
  let userChat = '';
  let title = '';
  let addedName = '';
  try {
    await client.query('BEGIN');
    await assertPostManager(client, actor, postId);
    const postResult = await client.query(
      `SELECT pp.*,
              EXISTS (SELECT 1 FROM play_game_results result WHERE result.post_id = pp.id) AS has_result
         FROM play_posts pp
        WHERE pp.id = $1::uuid
        FOR UPDATE`,
      [postId]
    );
    const post = postResult.rows[0];
    if (!post) throw new PlayServiceError(404, 'Игра не найдена');
    if (String(post.status) === 'cancelled') throw new PlayServiceError(409, 'Нельзя менять состав отменённой игры');
    if (Boolean(post.has_result)) throw new PlayServiceError(409, 'Результат уже внесён — состав игры зафиксирован');
    const userResult = hasGuest ? { rows: [{ id: null, player_id: null, telegram_chat_id: null, name: guestName }] } : await client.query(
      `SELECT u.id, pl.id AS player_id, u.telegram_chat_id,
              COALESCE(NULLIF(pl.name,''), NULLIF(u.full_name,''), 'Игрок') AS name
         FROM players pl
         LEFT JOIN users u ON u.player_id = pl.id
        WHERE ($1::int IS NOT NULL AND u.id = $1)
           OR ($2::uuid IS NOT NULL AND pl.id = $2)
        UNION ALL
       SELECT u.id, NULL::uuid AS player_id, u.telegram_chat_id,
              COALESCE(NULLIF(u.full_name,''), 'Игрок #' || u.id::text) AS name
         FROM users u
        WHERE $1::int IS NOT NULL AND u.id = $1 AND u.player_id IS NULL
        LIMIT 1`,
      [hasUser ? userId : null, hasPlayer ? playerId : null]
    );
    const user = userResult.rows[0];
    if (!user) throw new PlayServiceError(404, 'Игрок не найден');
    const hasFreeSlot = (await freeSlots(client, postId, Number(post.capacity))) > 0;
    if (!hasFreeSlot && !user.id) {
      throw new PlayServiceError(409, 'В составе уже нет свободных мест');
    }
    const targetStatus: 'confirmed' | 'reserve' = hasFreeSlot ? 'confirmed' : 'reserve';
    const inserted = user.id
      ? await client.query(
        `INSERT INTO play_post_participants (post_id, user_id, player_id, status, reviewed_at)
         VALUES ($1::uuid, $2, $3::uuid, $4, now())
         ON CONFLICT (post_id, user_id) DO UPDATE SET
           player_id=EXCLUDED.player_id,status=EXCLUDED.status,reviewed_at=now()
         WHERE play_post_participants.status IN ('cancelled','rejected','pending','reserve')
         RETURNING id::text`,
        [postId, Number(user.id), user.player_id, targetStatus]
      )
      : user.player_id ? await client.query(
        `INSERT INTO play_post_participants (post_id, user_id, player_id, status, reviewed_at)
         VALUES ($1::uuid, NULL, $2::uuid, $3, now())
         ON CONFLICT (post_id, player_id) WHERE player_id IS NOT NULL DO UPDATE SET
           status=EXCLUDED.status,reviewed_at=now()
         WHERE play_post_participants.status IN ('cancelled','rejected','pending','reserve')
         RETURNING id::text`,
        [postId, user.player_id, targetStatus]
      ) : await client.query(
        `INSERT INTO play_post_participants (post_id, user_id, player_id, guest_name, status, reviewed_at)
         SELECT $1::uuid, NULL, NULL, $2, $3, now()
          WHERE NOT EXISTS (
            SELECT 1 FROM play_post_participants
             WHERE post_id = $1::uuid AND lower(guest_name) = lower($2)
               AND status IN ('pending','confirmed','reserve')
          )
         RETURNING id::text`,
        [postId, guestName, targetStatus]
      );
    if (!inserted.rows[0]) throw new PlayServiceError(409, 'Игрок уже находится в составе');
    title = String(post.title);
    addedName = String(user.name);
    userChat = String(user.telegram_chat_id ?? '');
    if (targetStatus === 'confirmed' && String(post.status) === 'published') {
      await maybeNotifyMinimumReached(client, postId, post, title);
    }
    await client.query('COMMIT');
    await enqueueTelegramStandalone(
      userChat,
      'organizer_added_player',
      targetStatus === 'reserve'
        ? `Организатор добавил вас в резерв «${title}». Мы сообщим, когда освободится место.`
        : `Организатор добавил вас в состав «${title}». Детали: https://lpvolley.ru/partner/${postId}`,
      `organizer_added_player:${postId}:${user.id ?? user.player_id}`
    ).catch(() => undefined);
    return { id: String(inserted.rows[0].id), status: targetStatus, name: addedName };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export type PlayKotyaraPollOption = {
  id: string;
  title: string;
  startsAt: string;
  goingCount: number;
  maybeCount: number;
};

export async function listManagedPlayKotyaraPolls(
  actor: PlayActor,
  postId: string,
): Promise<PlayKotyaraPollOption[]> {
  const client = await getPool().connect();
  try {
    await assertPostManager(client, actor, postId);
    const { rows } = await client.query(
      `SELECT session.id::text, session.title, session.starts_at,
              COUNT(participant.id) FILTER (WHERE participant.telegram_status = 'going')::int AS going_count,
              COUNT(participant.id) FILTER (WHERE participant.telegram_status = 'maybe')::int AS maybe_count
         FROM coach_training_sessions session
         LEFT JOIN coach_training_participants participant ON participant.training_session_id = session.id
        WHERE session.source = 'kotyara'
          AND session.starts_at >= now() - interval '14 days'
        GROUP BY session.id
       HAVING COUNT(participant.id) FILTER (WHERE participant.telegram_status IN ('going', 'maybe')) > 0
        ORDER BY ABS(EXTRACT(EPOCH FROM (session.starts_at - now()))) ASC
        LIMIT 20`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title || 'Опрос Котяры'),
      startsAt: asIso(row.starts_at),
      goingCount: Number(row.going_count ?? 0),
      maybeCount: Number(row.maybe_count ?? 0),
    }));
  } finally {
    client.release();
  }
}

export async function importManagedPlayKotyaraPoll(
  actor: PlayActor,
  postId: string,
  sessionId: string,
  includeMaybe = false,
): Promise<{ added: number; reserved: number; skipped: number; names: string[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new PlayServiceError(400, 'Выберите опрос Котяры');
  const client = await getPool().connect();
  let candidates: Array<{ userId: number | null; playerId: string | null; guestName: string | null; name: string }> = [];
  try {
    await assertPostManager(client, actor, postId);
    const { rows } = await client.query(
      `SELECT linked_user.id::int AS user_id,
              participant.player_id::text,
              NULLIF(BTRIM(COALESCE(player.name, participant.display_name)), '') AS display_name
         FROM coach_training_sessions session
         JOIN coach_training_participants participant ON participant.training_session_id = session.id
         LEFT JOIN players player ON player.id = participant.player_id
         LEFT JOIN LATERAL (
           SELECT users.id FROM users WHERE users.player_id = participant.player_id ORDER BY users.id LIMIT 1
         ) linked_user ON true
        WHERE session.id = $1::uuid
          AND session.source = 'kotyara'
          AND participant.telegram_status = ANY($2::text[])
        ORDER BY COALESCE(player.name, participant.display_name), participant.id`,
      [sessionId, includeMaybe ? ['going', 'maybe'] : ['going']],
    );
    candidates = rows
      .filter((row) => String(row.display_name ?? '').trim().length >= 2)
      .map((row) => ({
        userId: row.user_id == null ? null : Number(row.user_id),
        playerId: row.player_id ? String(row.player_id) : null,
        guestName: row.player_id ? null : String(row.display_name),
        name: String(row.display_name),
      }));
  } finally {
    client.release();
  }
  if (!candidates.length) throw new PlayServiceError(409, 'В этом опросе пока никто не ответил «иду»');

  let added = 0;
  let reserved = 0;
  let skipped = 0;
  const names: string[] = [];
  for (const candidate of candidates) {
    try {
      const result = await addManagedPlayParticipant(actor, postId, candidate);
      if (result.status === 'reserve') reserved += 1;
      else added += 1;
      names.push(result.name);
    } catch (error) {
      if (error instanceof PlayServiceError && [409, 404].includes(error.status)) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  return { added, reserved, skipped, names };
}

export type PlayRosterBulkOutcome = 'invited' | 'added' | 'guest_added' | 'reserved' | 'failed' | 'not_applied';

export interface PlayRosterBulkItemResult {
  index: number;
  action: string;
  outcome: PlayRosterBulkOutcome;
  userId: number | null;
  playerId: string | null;
  guestName: string | null;
  name: string;
  participantId: string | null;
  participantStatus: 'confirmed' | 'reserve' | null;
  inviteId: string | null;
  error: string | null;
}

export interface PlayRosterBulkResponse {
  atomic: true;
  committed: true;
  invited: number;
  added: number;
  guests: number;
  reserved: number;
  results: PlayRosterBulkItemResult[];
}

export class PlayRosterBulkError extends PlayServiceError {
  constructor(status: number, message: string, public results: PlayRosterBulkItemResult[]) {
    super(status, message);
  }
}

interface PreparedPlayRosterBulkItem extends NormalizedPlayRosterBulkItem {
  resolvedUserId: number | null;
  resolvedPlayerId: string | null;
  name: string;
  telegramChatId: string;
  identityKey: string;
  targetStatus: 'confirmed' | 'reserve' | null;
}

function failedBulkRosterResults(
  inputCount: number,
  items: NormalizedPlayRosterBulkItem[],
  errors: Map<number, string>,
): PlayRosterBulkItemResult[] {
  const byIndex = new Map(items.map((item) => [item.index, item]));
  return Array.from({ length: inputCount }, (_, index) => {
    const item = byIndex.get(index);
    const error = errors.get(index);
    return {
      index,
      action: item?.action ?? '',
      outcome: error ? 'failed' : 'not_applied',
      userId: item?.userId ?? null,
      playerId: item?.playerId ?? null,
      guestName: item?.guestName ?? null,
      name: item?.guestName ?? '',
      participantId: null,
      participantStatus: null,
      inviteId: null,
      error: error ?? 'Пакет не применён, потому что в другой позиции есть ошибка',
    };
  });
}

async function resolveBulkRosterItem(
  client: PoolClient,
  item: NormalizedPlayRosterBulkItem,
): Promise<PreparedPlayRosterBulkItem | null> {
  if (item.action === 'guest') {
    return {
      ...item,
      resolvedUserId: null,
      resolvedPlayerId: null,
      name: String(item.guestName),
      telegramChatId: '',
      identityKey: `guest:${String(item.guestName).toLocaleLowerCase('ru')}`,
      targetStatus: null,
    };
  }

  const loaded = item.userId
    ? await client.query(
      `SELECT users.id, users.player_id::text,
              users.telegram_chat_id,
              COALESCE(NULLIF(players.name, ''), NULLIF(users.full_name, ''),
                       NULLIF(users.nickname, ''), split_part(users.email, '@', 1)) AS name
         FROM users
         LEFT JOIN players ON players.id = users.player_id
        WHERE users.id = $1 LIMIT 1`,
      [item.userId],
    )
    : await client.query(
      `SELECT users.id, players.id::text AS player_id,
              users.telegram_chat_id,
              COALESCE(NULLIF(players.name, ''), NULLIF(users.full_name, ''), 'Игрок') AS name
         FROM players
         LEFT JOIN users ON users.player_id = players.id
        WHERE players.id = $1::uuid LIMIT 1`,
      [item.playerId],
    );
  const row = loaded.rows[0];
  if (!row) return null;
  const resolvedUserId = row.id == null ? null : Number(row.id);
  const resolvedPlayerId = row.player_id ? String(row.player_id) : null;
  return {
    ...item,
    resolvedUserId,
    resolvedPlayerId,
    name: String(row.name),
    telegramChatId: String(row.telegram_chat_id ?? ''),
    identityKey: resolvedUserId ? `user:${resolvedUserId}` : `player:${resolvedPlayerId}`,
    targetStatus: null,
  };
}

export async function bulkManagePlayRoster(
  actor: PlayActor,
  postId: string,
  rawItems: unknown,
): Promise<PlayRosterBulkResponse> {
  const normalized = normalizePlayRosterBulkItems(rawItems);
  if (normalized.issues.length) {
    const message = normalized.issues[0]?.error ?? 'Неверный пакет состава';
    const globalIssue = normalized.issues.find((issue) => issue.index < 0);
    const errors = globalIssue
      ? new Map(Array.from({ length: normalized.inputCount }, (_, index) => [index, globalIssue.error]))
      : new Map(normalized.issues.map((issue) => [issue.index, issue.error]));
    const results = normalized.inputCount
      ? failedBulkRosterResults(normalized.inputCount, normalized.items, errors)
      : [];
    for (const issue of normalized.issues) {
      if (issue.index >= 0 && results[issue.index]) results[issue.index].action = issue.action;
    }
    throw new PlayRosterBulkError(
      400,
      message,
      results,
    );
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const post = await assertPostManager(client, actor, postId);
    const hasResult = await client.query(
      `SELECT 1 FROM play_game_results WHERE post_id = $1::uuid LIMIT 1`,
      [postId],
    );
    const globalError = String(post.status) === 'cancelled'
      ? 'Нельзя менять состав отменённой игры'
      : hasResult.rows[0]
        ? 'Результат уже внесён — состав игры зафиксирован'
        : '';
    if (globalError) {
      const errors = new Map(normalized.items.map((item) => [item.index, globalError]));
      throw new PlayRosterBulkError(409, globalError, failedBulkRosterResults(normalized.inputCount, normalized.items, errors));
    }

    const errors = new Map<number, string>();
    const prepared: PreparedPlayRosterBulkItem[] = [];
    const resolvedIdentityIndexes = new Map<string, number>();
    const fromUserId = actor.kind === 'user' ? actor.userId : Number(post.owner_user_id || 0);

    for (const item of normalized.items) {
      const resolved = await resolveBulkRosterItem(client, item);
      if (!resolved) {
        errors.set(item.index, item.action === 'invite' ? 'Аккаунт игрока не найден' : 'Игрок не найден');
        continue;
      }
      const duplicateIndex = resolvedIdentityIndexes.get(resolved.identityKey);
      if (duplicateIndex != null) {
        errors.set(item.index, `Этот игрок уже указан в позиции ${duplicateIndex + 1}`);
        continue;
      }
      resolvedIdentityIndexes.set(resolved.identityKey, item.index);

      if (item.action === 'invite') {
        if (String(post.status) !== 'published' || new Date(post.starts_at).getTime() <= Date.now()) {
          errors.set(item.index, 'Приглашать можно только на будущую опубликованную игру');
          continue;
        }
        if (!fromUserId) {
          errors.set(item.index, 'Для приглашения нужен аккаунт организатора');
          continue;
        }
        if (resolved.resolvedUserId === fromUserId) {
          errors.set(item.index, 'Нельзя пригласить самого себя');
          continue;
        }
      }

      const participant = item.action === 'guest'
        ? await client.query(
          `SELECT id::text, status FROM play_post_participants
            WHERE post_id = $1::uuid AND lower(guest_name) = lower($2)
            ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [postId, item.guestName],
        )
        : await client.query(
          `SELECT id::text, status FROM play_post_participants
            WHERE post_id = $1::uuid
              AND (($2::int IS NOT NULL AND user_id = $2)
                OR ($3::uuid IS NOT NULL AND player_id = $3))
            ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [postId, resolved.resolvedUserId, resolved.resolvedPlayerId],
        );
      const participantStatus = String(participant.rows[0]?.status ?? '');
      if (item.action === 'invite' && ['pending', 'confirmed', 'reserve'].includes(participantStatus)) {
        errors.set(item.index, 'Игрок уже есть в заявках, составе или резерве');
        continue;
      }
      if (item.action !== 'invite' && participantStatus === 'confirmed') {
        errors.set(item.index, 'Игрок уже находится в составе');
        continue;
      }

      if (item.action === 'invite') {
        const invite = await client.query(
          `SELECT status FROM play_invites
            WHERE post_id = $1::uuid AND to_user_id = $2 LIMIT 1 FOR UPDATE`,
          [postId, resolved.resolvedUserId],
        );
        const inviteStatus = String(invite.rows[0]?.status ?? '');
        if (inviteStatus === 'sent') {
          errors.set(item.index, 'Приглашение уже отправлено');
          continue;
        }
        if (inviteStatus === 'accepted') {
          errors.set(item.index, 'Игрок уже принимал это приглашение; добавьте его в состав');
          continue;
        }
      }
      prepared.push(resolved);
    }

    let slotsLeft = await freeSlots(client, postId, Number(post.capacity));
    for (const item of prepared) {
      if (item.action === 'invite' || errors.has(item.index)) continue;
      if (slotsLeft > 0) {
        item.targetStatus = 'confirmed';
        slotsLeft -= 1;
      } else if (item.resolvedUserId) {
        item.targetStatus = 'reserve';
      } else {
        errors.set(item.index, 'В составе не хватает свободных мест для всего пакета');
      }
    }
    if (errors.size) {
      throw new PlayRosterBulkError(
        409,
        'Пакет состава не применён: исправьте отмеченные позиции',
        failedBulkRosterResults(normalized.inputCount, normalized.items, errors),
      );
    }

    const results: PlayRosterBulkItemResult[] = [];
    let invited = 0;
    let added = 0;
    let guests = 0;
    let reserved = 0;
    let confirmedAdded = 0;
    for (const item of prepared) {
      if (item.action === 'invite') {
        const inserted = await client.query(
          `INSERT INTO play_invites (post_id, from_user_id, to_user_id, is_mass, status)
           VALUES ($1::uuid, $2, $3, false, 'sent')
           ON CONFLICT (post_id, to_user_id) DO UPDATE SET
             from_user_id = EXCLUDED.from_user_id, status = 'sent', is_mass = false,
             responded_at = NULL, created_at = now()
           WHERE play_invites.status IN ('declined', 'expired')
           RETURNING id::text`,
          [postId, fromUserId, item.resolvedUserId],
        );
        const inviteId = String(inserted.rows[0]?.id ?? '');
        if (!inviteId) throw new PlayServiceError(409, 'Приглашение изменилось; повторите пакет');
        await enqueueTelegram(
          client,
          item.telegramChatId,
          'invite_received',
          `Вас зовут на «${String(post.title)}». Принять или отклонить: https://lpvolley.ru/partner/${postId}`,
          `invite_received:${inviteId}`,
        );
        invited += 1;
        results.push({
          index: item.index, action: item.action, outcome: 'invited',
          userId: item.resolvedUserId, playerId: item.resolvedPlayerId, guestName: null,
          name: item.name, participantId: null, participantStatus: null, inviteId, error: null,
        });
        continue;
      }

      const inserted = item.action === 'guest'
        ? await client.query(
          `INSERT INTO play_post_participants (post_id, user_id, player_id, guest_name, status, reviewed_at)
           VALUES ($1::uuid, NULL, NULL, $2, $3, now())
           ON CONFLICT DO NOTHING
           RETURNING id::text`,
          [postId, item.guestName, item.targetStatus],
        )
        : item.resolvedUserId
          ? await client.query(
            `INSERT INTO play_post_participants (post_id, user_id, player_id, status, reviewed_at)
             VALUES ($1::uuid, $2, $3::uuid, $4, now())
             ON CONFLICT (post_id, user_id) DO UPDATE SET
               player_id = EXCLUDED.player_id, status = EXCLUDED.status, reviewed_at = now()
             WHERE play_post_participants.status IN ('cancelled', 'rejected', 'pending', 'reserve')
             RETURNING id::text`,
            [postId, item.resolvedUserId, item.resolvedPlayerId, item.targetStatus],
          )
          : await client.query(
            `INSERT INTO play_post_participants (post_id, user_id, player_id, status, reviewed_at)
             VALUES ($1::uuid, NULL, $2::uuid, $3, now())
             ON CONFLICT (post_id, player_id) WHERE player_id IS NOT NULL DO UPDATE SET
               status = EXCLUDED.status, reviewed_at = now()
             WHERE play_post_participants.status IN ('cancelled', 'rejected', 'pending', 'reserve')
             RETURNING id::text`,
            [postId, item.resolvedPlayerId, item.targetStatus],
          );
      const participantId = String(inserted.rows[0]?.id ?? '');
      if (!participantId) throw new PlayServiceError(409, 'Состав изменился; повторите пакет');
      if (item.resolvedUserId) {
        await client.query(
          `UPDATE play_invites SET status = 'accepted', responded_at = now()
            WHERE post_id = $1::uuid AND to_user_id = $2 AND status = 'sent'`,
          [postId, item.resolvedUserId],
        );
        await enqueueTelegram(
          client,
          item.telegramChatId,
          'organizer_added_player',
          item.targetStatus === 'reserve'
            ? `Организатор добавил вас в резерв «${String(post.title)}». Мы сообщим, когда освободится место.`
            : `Организатор добавил вас в состав «${String(post.title)}». Детали: https://lpvolley.ru/partner/${postId}`,
          `organizer_added_player:${postId}:${item.resolvedUserId}`,
        );
      }
      const isGuest = item.action === 'guest';
      const isReserve = item.targetStatus === 'reserve';
      reserved += isReserve ? 1 : 0;
      added += !isGuest && !isReserve ? 1 : 0;
      guests += isGuest ? 1 : 0;
      confirmedAdded += isReserve ? 0 : 1;
      results.push({
        index: item.index,
        action: item.action,
        outcome: isReserve ? 'reserved' : isGuest ? 'guest_added' : 'added',
        userId: item.resolvedUserId, playerId: item.resolvedPlayerId, guestName: item.guestName,
        name: item.name, participantId, participantStatus: item.targetStatus, inviteId: null, error: null,
      });
    }

    if (confirmedAdded && String(post.status) === 'published') {
      await maybeNotifyMinimumReached(client, postId, post, String(post.title));
    }
    await client.query('COMMIT');
    results.sort((left, right) => left.index - right.index);
    return { atomic: true, committed: true, invited, added, guests, reserved, results };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function removeManagedPlayParticipant(
  actor: PlayActor,
  postId: string,
  participantId: string
): Promise<{ ok: true }> {
  const client = await getPool().connect();
  let userChat = '';
  let promotedChat = '';
  let title = '';
  try {
    await client.query('BEGIN');
    await assertPostManager(client, actor, postId);
    const postResult = await client.query(
      `SELECT pp.*,
              EXISTS (SELECT 1 FROM play_game_results result WHERE result.post_id = pp.id) AS has_result
         FROM play_posts pp
        WHERE pp.id = $1::uuid
        FOR UPDATE`,
      [postId]
    );
    const post = postResult.rows[0];
    if (!post) throw new PlayServiceError(404, 'Игра не найдена');
    if (Boolean(post.has_result)) throw new PlayServiceError(409, 'Результат уже внесён — состав игры зафиксирован');
    const participantResult = await client.query(
      `SELECT ppp.id, ppp.status, u.telegram_chat_id
         FROM play_post_participants ppp
         LEFT JOIN users u ON u.id = ppp.user_id
        WHERE ppp.id = $1::uuid AND ppp.post_id = $2::uuid
        FOR UPDATE OF ppp`,
      [participantId, postId]
    );
    const participant = participantResult.rows[0];
    if (!participant || ['cancelled','rejected'].includes(String(participant.status))) {
      throw new PlayServiceError(404, 'Игрок не найден в активном составе');
    }
    await client.query(
      `UPDATE play_post_participants SET status = 'cancelled', reviewed_at = now() WHERE id = $1::uuid`,
      [participantId]
    );
    if (String(participant.status) === 'confirmed' && String(post.status) === 'published') {
      const promoted = await promoteReserves(client, postId, 1);
      promotedChat = promoted[0] ?? '';
    }
    userChat = String(participant.telegram_chat_id ?? '');
    title = String(post.title);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await enqueueTelegramStandalone(userChat, 'organizer_removed_player', `Организатор убрал вас из состава «${title}».`);
  await enqueueTelegramStandalone(
    promotedChat,
    'waitlist_promoted',
    `Освободилось место: вы подтверждены на «${title}». Детали: https://lpvolley.ru/partner/${postId}`,
    `waitlist_promoted:${postId}:${promotedChat}`
  );
  return { ok: true };
}

export async function reviewPlayParticipant(
  actor: PlayActor,
  postId: string,
  participantId: string,
  action: 'accept' | 'reject'
) {
  const client = await getPool().connect();
  let chat = '';
  let title = '';
  let status: PlayParticipantStatus = 'rejected';
  try {
    await client.query('BEGIN');
    const post = await assertPostManager(client, actor, postId);
    const participantResult = await client.query(
      `SELECT ppp.*, u.telegram_chat_id
         FROM play_post_participants ppp
         JOIN users u ON u.id = ppp.user_id
        WHERE ppp.id = $1::uuid AND ppp.post_id = $2::uuid FOR UPDATE`,
      [participantId, postId]
    );
    const participant = participantResult.rows[0];
    if (!participant) throw new PlayServiceError(404, 'Заявка не найдена');
    if (!['pending', 'reserve'].includes(String(participant.status))) {
      throw new PlayServiceError(409, 'Заявка уже обработана');
    }
    if (action === 'accept') {
      const count = await client.query(
        `SELECT COUNT(*)::int AS count FROM play_post_participants
          WHERE post_id=$1::uuid AND status='confirmed'`,
        [postId]
      );
      status = Number(count.rows[0].count) < Number(post.capacity) ? 'confirmed' : 'reserve';
    }
    await client.query(
      `UPDATE play_post_participants
          SET status=$2, reviewed_at=now()
        WHERE id=$1::uuid`,
      [participantId, action === 'reject' ? 'rejected' : status]
    );
    if (action === 'accept' && status === 'confirmed') {
      await maybeNotifyMinimumReached(client, postId, post, String(post.title));
    }
    chat = String(participant.telegram_chat_id ?? '');
    title = String(post.title);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const message = action === 'reject'
    ? `Заявка на «${title}» отклонена.`
    : status === 'reserve'
      ? `Вы добавлены в резерв на «${title}». Мы сообщим, если освободится место.`
      : `Вы подтверждены на «${title}». Детали: https://lpvolley.ru/partner/${postId}`;
  await enqueueTelegramStandalone(chat, 'join_reviewed', message);
  return { status: action === 'reject' ? 'rejected' : status };
}

export async function cancelPlayJoin(userId: number, postId: string) {
  const client = await getPool().connect();
  let promotedChat = '';
  let title = '';
  try {
    await client.query('BEGIN');
    const postResult = await client.query('SELECT * FROM play_posts WHERE id=$1::uuid FOR UPDATE', [postId]);
    const post = postResult.rows[0];
    if (!post) throw new PlayServiceError(404, 'Событие не найдено');
    const participantResult = await client.query(
      `SELECT * FROM play_post_participants
        WHERE post_id=$1::uuid AND user_id=$2 FOR UPDATE`,
      [postId, userId]
    );
    const participant = participantResult.rows[0];
    if (!participant || String(participant.status) === 'rejected') {
      throw new PlayServiceError(404, 'Активная запись не найдена');
    }
    if (String(participant.status) === 'cancelled') {
      await client.query('COMMIT');
      return { ok: true };
    }
    const wasConfirmed = participant.status === 'confirmed';
    await client.query(
      `UPDATE play_post_participants
          SET status='cancelled', attendance_status='not_going', attendance_responded_at=now()
        WHERE id=$1::uuid`,
      [participant.id]
    );
    if (wasConfirmed && post.status === 'published' && new Date(post.starts_at).getTime() > Date.now()) {
      const promoted = await promoteReserves(client, postId, 1);
      promotedChat = promoted[0] ?? '';
    }
    title = String(post.title);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await enqueueTelegramStandalone(
    promotedChat,
    'waitlist_promoted',
    `Освободилось место: вы подтверждены на «${title}». Детали: https://lpvolley.ru/partner/${postId}`,
    `waitlist_promoted:${postId}:${promotedChat}`
  );
  return { ok: true };
}

export async function respondPlayAttendance(
  userId: number,
  postId: string,
  response: 'going' | 'not_going',
): Promise<{ status: PlayParticipantStatus; attendanceStatus: 'going' | 'not_going' }> {
  const client = await getPool().connect();
  let promotedChat = '';
  let title = '';
  try {
    await client.query('BEGIN');
    const postResult = await client.query(
      `SELECT id, title, status, starts_at FROM play_posts WHERE id = $1::uuid FOR UPDATE`,
      [postId],
    );
    const post = postResult.rows[0];
    if (!post) throw new PlayServiceError(404, 'Игра не найдена');
    if (String(post.status) !== 'published' || new Date(post.starts_at).getTime() <= Date.now()) {
      throw new PlayServiceError(409, 'Подтвердить присутствие можно только до начала опубликованной игры');
    }
    const participantResult = await client.query(
      `SELECT id::text, status, attendance_status
         FROM play_post_participants
        WHERE post_id = $1::uuid AND user_id = $2
        FOR UPDATE`,
      [postId, userId],
    );
    const participant = participantResult.rows[0];
    if (!participant) throw new PlayServiceError(404, 'Вы не записаны на эту игру');
    if (response === 'going') {
      if (String(participant.status) !== 'confirmed') {
        throw new PlayServiceError(409, String(participant.status) === 'reserve' ? 'Вы пока в резерве' : 'Место в составе не подтверждено');
      }
      await client.query(
        `UPDATE play_post_participants
            SET attendance_status = 'going', attendance_responded_at = now()
          WHERE id = $1::uuid`,
        [String(participant.id)],
      );
      await client.query('COMMIT');
      return { status: 'confirmed', attendanceStatus: 'going' };
    }
    if (String(participant.status) === 'cancelled' && String(participant.attendance_status) === 'not_going') {
      await client.query('COMMIT');
      return { status: 'cancelled', attendanceStatus: 'not_going' };
    }
    const wasConfirmed = String(participant.status) === 'confirmed';
    await client.query(
      `UPDATE play_post_participants
          SET status = 'cancelled', attendance_status = 'not_going',
              attendance_responded_at = now(), reviewed_at = now()
        WHERE id = $1::uuid`,
      [String(participant.id)],
    );
    if (wasConfirmed) {
      const promoted = await promoteReserves(client, postId, 1);
      promotedChat = promoted[0] ?? '';
    }
    title = String(post.title);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await enqueueTelegramStandalone(
    promotedChat,
    'waitlist_promoted',
    `Освободилось место: вы подтверждены на «${title}». Детали: https://lpvolley.ru/partner/${postId}`,
    `waitlist_promoted:${postId}:${promotedChat}`,
  );
  return { status: 'cancelled', attendanceStatus: 'not_going' };
}

export async function settleManagedPlayAttendance(
  actor: PlayActor,
  postId: string,
  participantId: string,
  attendanceStatus: 'attended' | 'no_show',
) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const post = await assertPostManager(client, actor, postId);
    if (new Date(String(post.starts_at)).getTime() > Date.now()) throw new PlayServiceError(409, 'Отметить факт посещения можно после начала игры');
    const result = await client.query(
      `UPDATE play_post_participants
          SET attendance_status=$3, attendance_responded_at=now()
        WHERE id=$1::uuid AND post_id=$2::uuid AND status='confirmed'
        RETURNING id::text,attendance_status`,
      [participantId, postId, attendanceStatus],
    );
    if (!result.rows[0]) throw new PlayServiceError(404, 'Участник в подтверждённом составе не найден');
    await client.query('COMMIT');
    return { id: String(result.rows[0].id), attendanceStatus };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPlayReliability(userId: number): Promise<PlayReliabilityView> {
  const { rows } = await getPool().query(
    `SELECT
       COUNT(*) FILTER (WHERE post.starts_at<now())::int AS tracked_games,
       COUNT(*) FILTER (WHERE participant.attendance_status='attended')::int AS attended,
       COUNT(*) FILTER (WHERE participant.attendance_status='no_show')::int AS no_shows,
       COUNT(*) FILTER (WHERE participant.attendance_status='not_going'
         AND participant.attendance_responded_at>post.starts_at-interval '12 hours')::int AS late_cancellations
     FROM play_post_participants participant
     JOIN play_posts post ON post.id=participant.post_id
    WHERE participant.user_id=$1 AND post.starts_at<now()`,
    [userId],
  );
  const trackedGames = Number(rows[0]?.tracked_games ?? 0);
  const attended = Number(rows[0]?.attended ?? 0);
  const noShows = Number(rows[0]?.no_shows ?? 0);
  const lateCancellations = Number(rows[0]?.late_cancellations ?? 0);
  const scored = attended + noShows + lateCancellations;
  const score = scored ? Math.max(0, Math.round((attended + lateCancellations * 0.35) / scored * 100)) : null;
  return {
    score,
    trackedGames,
    attended,
    noShows,
    lateCancellations,
    label: score == null || trackedGames < 3 ? 'new' : score >= 90 ? 'reliable' : score >= 70 ? 'stable' : 'attention',
  };
}

export async function listManagedPlayPosts(actor: PlayActor): Promise<PlayManagedPost[]> {
  if (!process.env.DATABASE_URL) return [];
  const params: unknown[] = [actor.kind === 'user' ? actor.userId : null];
  const ownerWhere = actor.kind === 'user' ? 'AND po.owner_user_id = $2' : '';
  const archiveWhere = actor.kind === 'user' ? 'AND pp.archived_at IS NULL' : '';
  if (actor.kind === 'user') params.push(actor.userId);
  const { rows } = await getPool().query(
    `SELECT ${POST_SELECT}
       FROM play_posts pp
       JOIN play_organizers po ON po.id = pp.organizer_id
       JOIN play_venues pv ON pv.id = pp.venue_id
       LEFT JOIN play_coaches pc ON pc.id = pp.coach_id
      WHERE true ${ownerWhere} ${archiveWhere}
      ORDER BY pp.starts_at DESC LIMIT 300`,
    params
  );
  const viewer = await loadViewerProfile(actor.kind === 'user' ? actor.userId : null);
  const posts = rows.map((row) => mapPost(row, viewer));
  return Promise.all(posts.map(async (post) => {
    const participants = await getPool().query(
      `SELECT ppp.id::text, ppp.user_id, ppp.player_id::text, ppp.status, ppp.created_at,
              ppp.attendance_status, ppp.attendance_responded_at,
              COALESCE(NULLIF(ppp.name_snapshot,''), NULLIF(pl.name,''), NULLIF(u.full_name,''), NULLIF(ppp.guest_name,''), 'Игрок') AS name,
              pl.skill_level
         FROM play_post_participants ppp
         LEFT JOIN users u ON u.id=ppp.user_id
         LEFT JOIN players pl ON pl.id=ppp.player_id
        WHERE ppp.post_id=$1::uuid
        ORDER BY CASE ppp.status WHEN 'pending' THEN 0 WHEN 'reserve' THEN 1 ELSE 2 END,
                 ppp.created_at ASC`,
      [post.id]
    );
    return {
      ...post,
      participants: participants.rows.map((row) => ({
        id: String(row.id),
        userId: row.user_id == null ? null : Number(row.user_id),
        playerId: row.player_id ? String(row.player_id) : null,
        registered: row.user_id != null,
        name: String(row.name),
        status: String(row.status) as PlayParticipantStatus,
        attendanceStatus: ['going', 'not_going', 'attended', 'no_show'].includes(String(row.attendance_status))
          ? String(row.attendance_status) as PlayManagedPost['participants'][number]['attendanceStatus']
          : 'unknown',
        attendanceRespondedAt: row.attendance_responded_at ? asIso(row.attendance_responded_at) : null,
        createdAt: asIso(row.created_at),
        playerLevel: nullableLevel(row.skill_level),
      })),
    };
  }));
}

export async function listUserPlayEntries(userId: number): Promise<PlayPostView[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const { rows } = await getPool().query(
      `SELECT ${POST_SELECT}
         FROM play_post_participants mine
         JOIN play_posts pp ON pp.id=mine.post_id
         JOIN play_organizers po ON po.id=pp.organizer_id
         JOIN play_venues pv ON pv.id=pp.venue_id
        LEFT JOIN play_coaches pc ON pc.id=pp.coach_id
        WHERE mine.user_id=$1
          AND pp.archived_at IS NULL
        ORDER BY pp.starts_at DESC LIMIT 100`,
      [userId]
    );
    const viewer = await loadViewerProfile(userId);
    return rows.map((row) => mapPost(row, viewer));
  } catch (err) {
    if (isSchemaUnavailable(err)) return [];
    throw err;
  }
}

async function creatorOrganizerId(client: PoolClient, actor: PlayActor): Promise<string | null> {
  if (actor.kind === 'admin') return null;
  const organizer = await requireOrganizer(client, actor, '');
  return String(organizer.id);
}

export async function createPlayVenue(actor: PlayActor, raw: Record<string, unknown>): Promise<PlayVenue> {
  const name = String(raw.name ?? '').trim().slice(0, 160);
  const address = String(raw.address ?? '').trim().slice(0, 300);
  const city = String(raw.city ?? 'Сургут').trim().slice(0, 120) || 'Сургут';
  if (name.length < 2 || address.length < 4) throw new PlayServiceError(400, 'Укажите название и адрес площадки');
  const client = await getPool().connect();
  try {
    const organizerId = await creatorOrganizerId(client, actor);
    const result = await client.query(
      `INSERT INTO play_venues (name, city, address, latitude, longitude, created_by_organizer_id)
       VALUES ($1,$2,$3,$4,$5,$6::uuid) RETURNING id::text,name,city,address,latitude,longitude,active`,
      [name, city, address, raw.latitude || null, raw.longitude || null, organizerId]
    );
    return mapVenue(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function createPlayCoach(actor: PlayActor, raw: Record<string, unknown>): Promise<PlayCoach> {
  const name = String(raw.name ?? '').trim().slice(0, 160);
  if (name.length < 2) throw new PlayServiceError(400, 'Укажите имя тренера');
  const client = await getPool().connect();
  try {
    const organizerId = await creatorOrganizerId(client, actor);
    const result = await client.query(
      `INSERT INTO play_coaches (name,bio,photo_url,created_by_organizer_id)
       VALUES ($1,$2,$3,$4::uuid) RETURNING id::text,name,bio,photo_url,active`,
      [name, String(raw.bio ?? '').trim().slice(0, 2000), String(raw.photoUrl ?? '').trim().slice(0, 1000), organizerId]
    );
    const coach = mapCoach(result.rows[0]);
    if (!coach) throw new PlayServiceError(500, 'Не удалось создать тренера');
    return coach;
  } finally {
    client.release();
  }
}

export async function savePlayOrganizer(raw: Record<string, unknown>): Promise<PlayOrganizer> {
  const id = String(raw.id ?? '').trim();
  const displayName = String(raw.displayName ?? '').trim().slice(0, 160);
  const ownerUserId = raw.ownerUserId ? Number(raw.ownerUserId) : null;
  const status = raw.status === 'suspended' ? 'suspended' : 'active';
  if (displayName.length < 2) throw new PlayServiceError(400, 'Укажите название организатора');
  const params = [ownerUserId, displayName, String(raw.bio ?? '').trim().slice(0, 2000),
    safeContactUrl(raw.contactUrl), status];
  const result = id
    ? await getPool().query(
      `UPDATE play_organizers SET owner_user_id=$2,display_name=$3,bio=$4,contact_url=$5,status=$6
        WHERE id=$1::uuid RETURNING id::text,owner_user_id,display_name,bio,contact_url,status`,
      [id, ...params]
    )
    : await getPool().query(
      `INSERT INTO play_organizers (owner_user_id,display_name,bio,contact_url,status)
       VALUES ($1,$2,$3,$4,$5) RETURNING id::text,owner_user_id,display_name,bio,contact_url,status`,
      params
    );
  if (!result.rows[0]) throw new PlayServiceError(404, 'Организатор не найден');
  return mapOrganizer(result.rows[0], true);
}

export async function isPlayPostManager(userId: number, postId: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { rows } = await getPool().query(
      `SELECT 1 FROM play_posts pp
         JOIN play_organizers po ON po.id = pp.organizer_id
        WHERE pp.id = $1::uuid AND po.owner_user_id = $2
        LIMIT 1`,
      [postId, userId]
    );
    return Boolean(rows[0]);
  } catch (err) {
    if (isSchemaUnavailable(err)) return false;
    throw err;
  }
}

export async function suggestManagedPlayPairing(
  actor: PlayActor,
  postId: string,
  mode: PlayPairingSuggestionMode,
  selectedResultKeys?: number[],
) {
  if (!['random', 'balanced', 'fresh', 'rematch'].includes(mode)) throw new PlayServiceError(400, 'Неизвестный режим жеребьёвки');
  const client = await getPool().connect();
  try {
    await assertPostManager(client, actor, postId);
    const roster = await client.query(
      `SELECT p.result_key,p.user_id,COALESCE(a.rating,1000)::int AS rating
         FROM play_post_participants p
         LEFT JOIN play_game_rating_accounts a ON a.user_id=p.user_id
        WHERE p.post_id=$1::uuid AND p.status='confirmed' ORDER BY p.created_at`,
      [postId],
    );
    const rosterPlayers = roster.rows.map((row) => ({ resultKey: Number(row.result_key), userId: row.user_id == null ? null : Number(row.user_id), rating: Number(row.rating) }));
    const selected = selectedResultKeys?.map(Number) ?? rosterPlayers.map((player) => player.resultKey);
    if (selected.length !== 4 || new Set(selected).size !== 4) {
      throw new PlayServiceError(409, 'Для жеребьёвки выберите четырёх разных игроков');
    }
    const selectedSet = new Set(selected);
    const players = rosterPlayers.filter((player) => selectedSet.has(player.resultKey));
    if (players.length !== 4) throw new PlayServiceError(409, 'Выбранный игрок не входит в подтверждённый состав');
    const currentUserIds = players.map((player) => player.userId).filter((id): id is number => id != null);
    const partnershipCounts = new Map<string, number>();
    let previousTeams: [number[], number[]] | null = null;
    if (currentUserIds.length === 4) {
      const history = await client.query(
        `SELECT r.payload,
                jsonb_object_agg(p.result_key::text,p.user_id) FILTER (WHERE p.user_id IS NOT NULL) AS identities
           FROM play_game_results r
           JOIN play_posts post ON post.id=r.post_id
           JOIN play_post_participants p ON p.post_id=post.id
          WHERE r.status='confirmed' AND post.id<>$1::uuid
            AND EXISTS (SELECT 1 FROM play_post_participants involved WHERE involved.post_id=post.id AND involved.user_id=ANY($2::int[]))
          GROUP BY r.id,post.starts_at
          ORDER BY post.starts_at DESC LIMIT 100`,
        [postId, currentUserIds],
      );
      const userToResultKey = new Map(players.filter((player) => player.userId != null).map((player) => [player.userId!, player.resultKey]));
      for (const row of history.rows) {
        const result = normalizeStructuredPlayResult(row.payload);
        const identities = row.identities && typeof row.identities === 'object' ? row.identities as Record<string, unknown> : {};
        if (!result) continue;
        for (const match of getCompetitiveMatches(result)) {
          const mapTeam = (team: number[]) => team.map((key) => Number(identities[String(key)])).filter((id) => currentUserIds.includes(id));
          const teams = [mapTeam(match.teamA), mapTeam(match.teamB)];
          for (const team of teams) {
            if (team.length !== 2) continue;
            const key = [...team].sort((a, b) => a - b).join(':');
            partnershipCounts.set(key, (partnershipCounts.get(key) ?? 0) + 1);
          }
          if (!previousTeams && teams.every((team) => team.length === 2) && new Set(teams.flat()).size === 4) {
            previousTeams = teams.map((team) => team.map((userId) => userToResultKey.get(userId)!)) as [number[], number[]];
          }
        }
      }
      const resultKeyCounts = new Map<string, number>();
      for (const [userPair, count] of partnershipCounts) {
        const resultPair = userPair.split(':').map(Number).map((userId) => userToResultKey.get(userId));
        if (resultPair.every((key) => key != null)) resultKeyCounts.set(resultPair.sort((a, b) => a! - b!).join(':'), count);
      }
      partnershipCounts.clear();
      for (const [key, count] of resultKeyCounts) partnershipCounts.set(key, count);
    }
    const suggestion = suggest2x2Pairing(players, mode, { partnershipCounts, previousTeams });
    if (!suggestion) throw new PlayServiceError(409, 'Не удалось собрать пары');
    return suggestion;
  } finally {
    client.release();
  }
}

export async function getPlayRatingPreview(actor: PlayActor, postId: string) {
  const client = await getPool().connect();
  try {
    const access = await client.query(
      `SELECT result.id::text AS result_id, organizer.owner_user_id,
              EXISTS(SELECT 1 FROM play_post_participants participant WHERE participant.post_id=post.id AND participant.user_id=$2 AND participant.status='confirmed') AS participates
         FROM play_posts post JOIN play_organizers organizer ON organizer.id=post.organizer_id
         JOIN play_game_results result ON result.post_id=post.id
        WHERE post.id=$1::uuid`,
      [postId, actor.kind === 'user' ? actor.userId : null],
    );
    const row = access.rows[0];
    if (!row) throw new PlayServiceError(404, 'Результат не найден');
    if (actor.kind === 'user' && Number(row.owner_user_id) !== actor.userId && !Boolean(row.participates)) throw new PlayServiceError(403, 'Нет доступа к прогнозу рейтинга');
    return previewPlayResultRating(client, String(row.result_id));
  } finally {
    client.release();
  }
}

export async function listOrganizerCandidateUsers(): Promise<Array<{ id: number; name: string; email: string }>> {
  if (!process.env.DATABASE_URL) return [];
  const { rows } = await getPool().query(
    `SELECT id, full_name, email FROM users ORDER BY full_name LIMIT 500`
  );
  return rows.map((row) => ({ id: Number(row.id), name: String(row.full_name), email: String(row.email) }));
}


// ============================================================
// Play V3: результаты, приглашения, availability, зоны ленты
// (TZ-production-play-v3 §4–§6)
// ============================================================

function extractPayloadUserIds(payload: unknown): number[] {
  const ids = new Set<number>();
  const add = (value: unknown) => {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) ids.add(parsed);
  };
  if (payload && typeof payload === 'object') {
    const source = payload as Record<string, unknown>;
    for (const key of ['teamA', 'teamB', 'places']) {
      if (Array.isArray(source[key])) (source[key] as unknown[]).forEach(add);
    }
    if (source.points && typeof source.points === 'object') {
      Object.keys(source.points as Record<string, unknown>).forEach(add);
    }
    if (Array.isArray(source.matches)) {
      for (const rawMatch of source.matches) {
        if (!rawMatch || typeof rawMatch !== 'object') continue;
        const match = rawMatch as Record<string, unknown>;
        if (Array.isArray(match.teamA)) match.teamA.forEach(add);
        if (Array.isArray(match.teamB)) match.teamB.forEach(add);
      }
    }
    if (Array.isArray(source.rounds)) {
      for (const rawRound of source.rounds) {
        if (!rawRound || typeof rawRound !== 'object') continue;
        const round = rawRound as Record<string, unknown>;
        if (!Array.isArray(round.pairs)) continue;
        for (const rawPair of round.pairs) {
          if (!rawPair || typeof rawPair !== 'object') continue;
          const pair = rawPair as Record<string, unknown>;
          if (Array.isArray(pair.team)) pair.team.forEach(add);
        }
      }
    }
  }
  return [...ids];
}

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return item;
  };
  return JSON.stringify(normalize(value ?? {}));
}

async function loadResultView(
  postId: string,
  viewerUserId: number | null
): Promise<PlayGameResultView | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT result.id::text, result.post_id::text, result.status, result.payload,
              result.revision, result.entered_by, result.entered_by_admin_actor,
              result.auto_confirm_at, result.approved_at,
              result.approved_by_user_id, result.approved_by_admin_actor, result.created_at,
              post.rating_mode,
              (SELECT COUNT(*)::int FROM play_post_participants participant
                WHERE participant.post_id = result.post_id AND participant.status = 'confirmed') AS confirmed_count,
              (SELECT COUNT(*)::int FROM play_post_participants participant
                WHERE participant.post_id = result.post_id AND participant.status = 'confirmed'
                  AND participant.user_id IS NOT NULL) AS registered_count
         FROM play_game_results result
         JOIN play_posts post ON post.id = result.post_id
        WHERE result.post_id = $1::uuid LIMIT 1`,
      [postId]
    );
    const row = rows[0];
    if (!row) return null;
    const confirmations = await getPool().query(
      `SELECT prc.user_id, prc.verdict, prc.comment, prc.created_at,
              COALESCE(NULLIF(u.full_name, ''), 'Игрок') AS name
         FROM play_result_confirmations prc
         JOIN users u ON u.id = prc.user_id
        WHERE prc.result_id = $1::uuid
        ORDER BY prc.created_at ASC`,
      [row.id]
    );
    const viewerRow = viewerUserId
      ? confirmations.rows.find((item) => Number(item.user_id) === viewerUserId)
      : null;
    const correctionRequests = viewerUserId
      ? await getPool().query(
        `SELECT id::text, result_revision, requested_by_user_id, comment, status,
                resolution_comment, created_at, resolved_at
           FROM play_result_correction_requests
          WHERE result_id = $1::uuid
            AND (
              EXISTS (
                SELECT 1 FROM play_post_participants participant
                 WHERE participant.post_id = $2::uuid AND participant.user_id = $3
                   AND participant.status = 'confirmed'
              )
              OR EXISTS (
                SELECT 1 FROM play_posts post
                JOIN play_organizers organizer ON organizer.id = post.organizer_id
                 WHERE post.id = $2::uuid AND organizer.owner_user_id = $3
              )
            )
          ORDER BY created_at DESC`,
        [row.id, postId, viewerUserId]
      )
      : { rows: [] as Array<Record<string, unknown>> };
    return {
      id: String(row.id),
      postId: String(row.post_id),
      status: String(row.status) as PlayResultStatus,
      payload: row.payload,
      revision: Number(row.revision ?? 1),
      enteredByUserId: row.entered_by == null ? null : Number(row.entered_by),
      enteredByAdminActor: row.entered_by_admin_actor ? String(row.entered_by_admin_actor) : null,
      autoConfirmAt: row.auto_confirm_at ? asIso(row.auto_confirm_at) : null,
      approvedAt: row.approved_at ? asIso(row.approved_at) : null,
      approvedByUserId: row.approved_by_user_id == null ? null : Number(row.approved_by_user_id),
      approvedByAdminActor: row.approved_by_admin_actor ? String(row.approved_by_admin_actor) : null,
      approvalBlocker: validatePlayResultApproval({
        ratingMode: String(row.rating_mode) === 'friendly' ? 'friendly' : 'rated',
        confirmedCount: Number(row.confirmed_count ?? 0),
        registeredCount: Number(row.registered_count ?? 0),
        hasStructuredPayload: Boolean(normalizeStructuredPlayResult(row.payload)),
      }),
      createdAt: asIso(row.created_at),
      confirmations: confirmations.rows.map((item) => ({
        userId: Number(item.user_id),
        name: String(item.name),
        verdict: String(item.verdict) as 'confirmed' | 'disputed',
        comment: String(item.comment ?? ''),
        createdAt: asIso(item.created_at),
      })),
      viewerVerdict: viewerRow ? (String(viewerRow.verdict) as 'confirmed' | 'disputed') : null,
      correctionRequests: correctionRequests.rows.map((item) => ({
        id: String(item.id),
        revision: Number(item.result_revision),
        requestedByUserId: Number(item.requested_by_user_id),
        comment: String(item.comment),
        status: String(item.status) as 'pending' | 'accepted' | 'rejected' | 'cancelled',
        resolutionComment: String(item.resolution_comment ?? ''),
        createdAt: asIso(item.created_at),
        resolvedAt: item.resolved_at ? asIso(item.resolved_at) : null,
      })),
    };
  } catch (err) {
    if (isSchemaUnavailable(err)) return null;
    throw err;
  }
}

// «N из твоих прошлых игр играют»: участники этой игры, с которыми зритель
// уже играл completed-игры (вычисляемое, не соцграф).
async function countPastTeammates(postId: string, viewerUserId: number): Promise<number> {
  try {
    const { rows } = await getPool().query(
      `SELECT COUNT(DISTINCT other.user_id)::int AS count
         FROM play_post_participants other
        WHERE other.post_id = $1::uuid
          AND other.status = 'confirmed'
          AND other.user_id <> $2
          AND other.user_id IN (
            SELECT ppp.user_id
              FROM play_post_participants ppp
              JOIN play_posts mp ON mp.id = ppp.post_id AND mp.status = 'completed'
             WHERE ppp.status = 'confirmed' AND ppp.user_id = $2
          )`,
      [postId, viewerUserId]
    );
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    if (isSchemaUnavailable(err)) return 0;
    throw err;
  }
}

async function loadViewerInvite(
  postId: string,
  viewerUserId: number
): Promise<{ id: string; status: PlayInviteStatus } | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT id::text, status FROM play_invites
        WHERE post_id = $1::uuid AND to_user_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [postId, viewerUserId]
    );
    return rows[0]
      ? { id: String(rows[0].id), status: String(rows[0].status) as PlayInviteStatus }
      : null;
  } catch (err) {
    if (isSchemaUnavailable(err)) return null;
    throw err;
  }
}

// --- Результат игры (§4) ---

/** @deprecated Use submitPlayResult; kept for rollback compatibility only. */
export async function submitPlayResultLegacy(
  actor: PlayActor,
  postId: string,
  payload: unknown
): Promise<PlayGameResultView> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const post = await assertPostManager(client, actor, postId);
    if (String(post.status) !== 'completed') {
      throw new PlayServiceError(409, 'Результат вносится после завершения игры');
    }
    const payloadIds = extractPayloadUserIds(payload);
    if (!payloadIds.length) {
      throw new PlayServiceError(400, 'В результате не указаны игроки');
    }
    const confirmed = await client.query(
      `SELECT result_key, user_id FROM play_post_participants
        WHERE post_id = $1::uuid AND status = 'confirmed'`,
      [postId]
    );
    const confirmedIds = new Set(confirmed.rows.map((row) => Number(row.result_key)));
    const confirmedUserIds = new Set(confirmed.rows.filter((row) => row.user_id != null).map((row) => Number(row.user_id)));
    if (normalizeStructuredPlayResult(payload)) {
      const validationError = validateStructuredPlayResult(payload, [...confirmedIds]);
      if (validationError) throw new PlayServiceError(400, validationError);
    }
    if (payloadIds.length !== confirmedIds.size || new Set(payloadIds).size !== payloadIds.length) {
      throw new PlayServiceError(400, 'Укажите каждого участника ровно один раз');
    }
    const stranger = payloadIds.find((id) => !confirmedIds.has(id));
    if (stranger) {
      throw new PlayServiceError(400, 'В результате есть игрок вне подтверждённого состава');
    }
    const enteredBy = actor.kind === 'user' ? actor.userId : Number(post.owner_user_id || 0) || null;
    if (!enteredBy) throw new PlayServiceError(400, 'Не удалось определить автора результата');
    try {
      await client.query(
        `INSERT INTO play_game_results (post_id, entered_by, payload, status, auto_confirm_at)
         VALUES ($1::uuid, $2, $3::jsonb, 'pending', now() + interval '24 hours')
         ON CONFLICT (post_id) DO UPDATE SET
           entered_by = EXCLUDED.entered_by,
           payload = EXCLUDED.payload,
           auto_confirm_at = EXCLUDED.auto_confirm_at
         WHERE play_game_results.status = 'pending'`,
        [postId, enteredBy, JSON.stringify(payload ?? {})]
      );
    } catch (err) {
      if (String((err as { code?: unknown })?.code ?? '') === '42P01') {
        throw new PlayServiceError(503, 'Миграция результатов игр не применена');
      }
      throw err;
    }
    const applied = await client.query(
      `SELECT id::text, status FROM play_game_results WHERE post_id = $1::uuid LIMIT 1`,
      [postId]
    );
    if (!applied.rows[0] || String(applied.rows[0].status) !== 'pending') {
      throw new PlayServiceError(409, 'Результат уже подтверждён или оспорен — изменить нельзя');
    }
    // При повторном редактировании pending-результата старые подтверждения
    // больше недействительны: участники должны увидеть актуальный счёт.
    await client.query(`DELETE FROM play_result_confirmations WHERE result_id = $1::uuid`, [String(applied.rows[0].id)]);
    // Автор результата уже выразил согласие самим вводом. Если он входит в
    // состав, фиксируем его голос автоматически — подтверждать остаётся другим игрокам.
    if (confirmedUserIds.has(enteredBy)) {
      await client.query(
        `INSERT INTO play_result_confirmations (result_id, user_id, verdict, comment)
         VALUES ($1::uuid, $2, 'confirmed', '')
         ON CONFLICT (result_id, user_id) DO UPDATE SET verdict='confirmed', comment=''`,
        [String(applied.rows[0].id), enteredBy]
      );
    }
    if (confirmedUserIds.size === 0) {
      await client.query(
        `UPDATE play_game_results SET status='confirmed' WHERE id=$1::uuid`,
        [String(applied.rows[0].id)]
      );
      await applyConfirmedPlayResultRating(client, String(applied.rows[0].id));
    }
    await client.query(
      `UPDATE play_posts SET result_entered_at = now() WHERE id = $1::uuid`,
      [postId]
    );
    // Compatibility implementation only; the exported lifecycle below owns approval semantics.
    const approveImmediately = false;
    const revision = 1;
    const owner = await client.query(
      `SELECT users.telegram_chat_id
         FROM play_posts post
         JOIN play_organizers organizer ON organizer.id = post.organizer_id
         JOIN users ON users.id = organizer.owner_user_id
        WHERE post.id = $1::uuid LIMIT 1`,
      [postId],
    );
    const ownerChat = String(owner.rows[0]?.telegram_chat_id ?? '');
    const chats = await client.query(
      `SELECT DISTINCT u.telegram_chat_id
         FROM play_post_participants ppp
         JOIN users u ON u.id = ppp.user_id
        WHERE ppp.post_id = $1::uuid AND ppp.status = 'confirmed'
          AND COALESCE(u.telegram_chat_id, '') <> ''`,
      [postId]
    );
    for (const row of chats.rows) {
      const chat = String(row.telegram_chat_id);
      if (!approveImmediately && chat === ownerChat) continue;
      await enqueueTelegram(
        client,
        chat,
        'result_entered',
        `Результат «${String(post.title)}» внесён. Подтвердите или оспорьте: https://lpvolley.ru/partner/${postId}`,
        `result_entered:${postId}:${chat}`
      );
    }
    if (!approveImmediately && ownerChat) {
      await enqueueTelegram(
        client,
        ownerChat,
        'result_awaiting_approval',
        `Участник предложил счёт «${String(post.title)}». Проверьте и утвердите: https://lpvolley.ru/partner/${postId}#result`,
        `result_awaiting_approval:${postId}:${revision}:${ownerChat}`,
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const view = await loadResultView(postId, actor.kind === 'user' ? actor.userId : null);
  if (!view) throw new PlayServiceError(500, 'Не удалось загрузить результат');
  return view;
}

interface PlayResultActorAccess {
  post: Record<string, unknown>;
  isManager: boolean;
  isConfirmedParticipant: boolean;
}

async function requirePlayResultActor(
  client: PoolClient,
  actor: PlayActor,
  postId: string,
): Promise<PlayResultActorAccess> {
  const loaded = await client.query(
    `SELECT post.*, organizer.owner_user_id
       FROM play_posts post
       JOIN play_organizers organizer ON organizer.id = post.organizer_id
      WHERE post.id = $1::uuid
      FOR UPDATE OF post`,
    [postId],
  );
  const post = loaded.rows[0] as Record<string, unknown> | undefined;
  if (!post) throw new PlayServiceError(404, 'Игра не найдена');
  if (actor.kind === 'admin') return { post, isManager: true, isConfirmedParticipant: false };
  const isManager = Number(post.owner_user_id) === actor.userId;
  const membership = await client.query(
    `SELECT 1 FROM play_post_participants
      WHERE post_id = $1::uuid AND user_id = $2 AND status = 'confirmed' LIMIT 1`,
    [postId, actor.userId],
  );
  const isConfirmedParticipant = Boolean(membership.rows[0]);
  if (!isManager && !isConfirmedParticipant) {
    throw new PlayServiceError(403, 'Внести счёт может только организатор или подтверждённый участник');
  }
  return { post, isManager, isConfirmedParticipant };
}

function assertResultRevision(expectedRevision: number | undefined, currentRevision: number): void {
  if (expectedRevision == null) return;
  if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
    throw new PlayServiceError(
      409,
      `Счёт уже изменён: ожидалась версия ${expectedRevision}, текущая ${currentRevision}`,
    );
  }
}

async function completeActivePlaySessions(client: PoolClient, postId: string): Promise<void> {
  await client.query('SAVEPOINT complete_play_sessions');
  try {
    await client.query(
      `UPDATE play_game_sessions
          SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
        WHERE post_id = $1::uuid AND status = 'active'`,
      [postId],
    );
    await client.query('RELEASE SAVEPOINT complete_play_sessions');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT complete_play_sessions');
    await client.query('RELEASE SAVEPOINT complete_play_sessions');
    if (!isSchemaUnavailable(error)) throw error;
  }
}

async function cancelActivePlaySessions(client: PoolClient, postId: string): Promise<void> {
  await client.query('SAVEPOINT cancel_play_sessions');
  try {
    await client.query(
      `UPDATE play_game_sessions
          SET status = 'cancelled', completed_at = COALESCE(completed_at, now()), updated_at = now()
        WHERE post_id = $1::uuid AND status = 'active'`,
      [postId],
    );
    await client.query('RELEASE SAVEPOINT cancel_play_sessions');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT cancel_play_sessions');
    await client.query('RELEASE SAVEPOINT cancel_play_sessions');
    if (!isSchemaUnavailable(error)) throw error;
  }
}

async function loadConfirmedResultRoster(client: PoolClient, postId: string) {
  const confirmed = await client.query(
    `SELECT result_key, user_id FROM play_post_participants
      WHERE post_id = $1::uuid AND status = 'confirmed'
      ORDER BY created_at, id`,
    [postId],
  );
  return {
    rows: confirmed.rows,
    resultKeys: new Set(confirmed.rows.map((row) => Number(row.result_key))),
    userIds: new Set(
      confirmed.rows.filter((row) => row.user_id != null).map((row) => Number(row.user_id)),
    ),
  };
}

function validateResultPayloadAgainstRoster(payload: unknown, resultKeys: Set<number>): void {
  const payloadIds = extractPayloadUserIds(payload);
  if (!payloadIds.length) throw new PlayServiceError(400, 'В результате не указаны игроки');
  if (normalizeStructuredPlayResult(payload)) {
    const validationError = validateStructuredPlayResult(payload, [...resultKeys]);
    if (validationError) throw new PlayServiceError(400, validationError);
  }
  if (payloadIds.length !== resultKeys.size || new Set(payloadIds).size !== payloadIds.length) {
    throw new PlayServiceError(400, 'Укажите каждого участника ровно один раз');
  }
  if (payloadIds.some((id) => !resultKeys.has(id))) {
    throw new PlayServiceError(400, 'В результате есть игрок вне подтверждённого состава');
  }
}

function resultApprovalBlocker(
  post: Record<string, unknown>,
  payload: unknown,
  roster: Awaited<ReturnType<typeof loadConfirmedResultRoster>>,
): string | null {
  return validatePlayResultApproval({
    ratingMode: String(post.rating_mode) === 'friendly' ? 'friendly' : 'rated',
    confirmedCount: roster.rows.length,
    registeredCount: roster.userIds.size,
    hasStructuredPayload: Boolean(normalizeStructuredPlayResult(payload)),
  });
}

async function approveResultRow(
  client: PoolClient,
  actor: PlayActor,
  resultId: string,
  revision: number,
): Promise<void> {
  await client.query(
    `UPDATE play_game_results
        SET status = 'confirmed', approved_at = now(),
            approved_by_user_id = $2, approved_by_admin_actor = $3
      WHERE id = $1::uuid`,
    [
      resultId,
      actor.kind === 'user' ? actor.userId : null,
      actor.kind === 'admin' ? actor.admin.id : null,
    ],
  );
  void revision;
  await applyConfirmedPlayResultRating(client, resultId);
}

export async function submitPlayResult(
  actor: PlayActor,
  postId: string,
  payload: unknown,
  options: { expectedRevision?: number } = {},
): Promise<PlayGameResultView> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const access = await requirePlayResultActor(client, actor, postId);
    const post = access.post;
    if (String(post.status) === 'published' && new Date(String(post.ends_at)).getTime() <= Date.now()) {
      await client.query(`UPDATE play_posts SET status = 'completed' WHERE id = $1::uuid`, [postId]);
      post.status = 'completed';
    }
    if (String(post.status) !== 'completed') {
      throw new PlayServiceError(409, 'Результат вносится после завершения игры');
    }
    const roster = await loadConfirmedResultRoster(client, postId);
    validateResultPayloadAgainstRoster(payload, roster.resultKeys);
    const structuredPayload = normalizeStructuredPlayResult(payload);
    const expectedFormat = String(post.result_format ?? 'legacy_custom');
    if (
      expectedFormat !== 'legacy_custom'
      && structuredPayload
      && structuredPayload.format !== expectedFormat
    ) {
      throw new PlayServiceError(400, 'Формат счёта не совпадает с форматом игры');
    }
    const configuredPointLimit = Number(
      post.result_config && typeof post.result_config === 'object'
        ? (post.result_config as Record<string, unknown>).pointLimit
        : 0,
    );
    if (
      structuredPayload
      && Number.isInteger(configuredPointLimit)
      && configuredPointLimit > 0
      && structuredPayload.pointLimit !== configuredPointLimit
    ) {
      throw new PlayServiceError(400, `Эта игра идёт до ${configuredPointLimit} очков`);
    }

    const enteredBy = actor.kind === 'user' ? actor.userId : null;
    const enteredByAdminActor = actor.kind === 'admin' ? actor.admin.id : null;
    const existingQuery = await client.query(
      `SELECT id::text, entered_by, entered_by_admin_actor, payload, status, revision
         FROM play_game_results WHERE post_id = $1::uuid FOR UPDATE`,
      [postId],
    );
    const existing = existingQuery.rows[0];
    const currentRevision = existing ? Number(existing.revision ?? 1) : 0;
    const sameEntryActor = existing && (
      actor.kind === 'user'
        ? Number(existing.entered_by) === actor.userId
        : String(existing.entered_by_admin_actor ?? '') === actor.admin.id
    );
    if (
      existing
      && options.expectedRevision == null
      && String(existing.status) !== 'cancelled'
      && sameEntryActor
      && canonicalJson(existing.payload) === canonicalJson(payload)
    ) {
      await client.query('COMMIT');
      const idempotentView = await loadResultView(postId, actor.kind === 'user' ? actor.userId : null);
      if (!idempotentView) throw new PlayServiceError(500, 'Не удалось загрузить результат');
      return idempotentView;
    }
    if (existing && options.expectedRevision == null) {
      throw new PlayServiceError(409, 'Счёт уже создан: передайте expectedRevision для безопасного изменения');
    }
    assertResultRevision(options.expectedRevision, currentRevision);
    if (existing && ['confirmed', 'cancelled'].includes(String(existing.status))) {
      throw new PlayServiceError(409, 'Утверждённый или отменённый результат нельзя перезаписать');
    }
    if (existing && String(existing.status) === 'disputed' && !access.isManager) {
      throw new PlayServiceError(403, 'Оспоренный счёт исправляет организатор');
    }
    if (
      existing && !access.isManager && !sameEntryActor
    ) {
      throw new PlayServiceError(403, 'Изменить предложенный счёт может его автор или организатор');
    }

    const revision = currentRevision + 1;
    const approveImmediately = access.isManager
      && !resultApprovalBlocker(post, payload, roster)
      && (!existing || (String(existing.status) === 'pending' && Boolean(sameEntryActor)));
    const nextStatus = approveImmediately ? 'confirmed' : 'pending';
    const applied = existing
      ? await client.query(
        `UPDATE play_game_results
            SET entered_by = $2, entered_by_admin_actor = $3,
                payload = $4::jsonb, status = $5, revision = $6,
                auto_confirm_at = NULL, approved_at = NULL,
                approved_by_user_id = NULL, approved_by_admin_actor = NULL,
                reversed_at = NULL, reversed_by = NULL, reversal_reason = ''
          WHERE id = $1::uuid
          RETURNING id::text`,
        [existing.id, enteredBy, enteredByAdminActor, JSON.stringify(payload ?? {}), nextStatus, revision],
      )
      : await client.query(
        `INSERT INTO play_game_results
          (post_id, entered_by, entered_by_admin_actor, payload, status, auto_confirm_at, revision)
         VALUES ($1::uuid, $2, $3, $4::jsonb, $5, NULL, $6)
         RETURNING id::text`,
        [postId, enteredBy, enteredByAdminActor, JSON.stringify(payload ?? {}), nextStatus, revision],
      );
    const resultId = String(applied.rows[0]?.id ?? '');
    if (!resultId) throw new PlayServiceError(500, 'Не удалось сохранить результат');

    await client.query(
      `INSERT INTO play_result_revisions
        (result_id, revision, payload, entered_by_user_id, entered_by_admin_actor, lifecycle_status)
       VALUES ($1::uuid, $2, $3::jsonb, $4, $5, $6)`,
      [resultId, revision, JSON.stringify(payload ?? {}), enteredBy, enteredByAdminActor, nextStatus],
    );
    await client.query(`DELETE FROM play_result_confirmations WHERE result_id = $1::uuid`, [resultId]);
    if (actor.kind === 'user' && roster.userIds.has(actor.userId)) {
      await client.query(
        `INSERT INTO play_result_confirmations (result_id, user_id, verdict, comment)
         VALUES ($1::uuid, $2, 'confirmed', '')
         ON CONFLICT (result_id, user_id) DO UPDATE SET verdict = 'confirmed', comment = ''`,
        [resultId, actor.userId],
      );
    }
    if (approveImmediately) await approveResultRow(client, actor, resultId, revision);
    await client.query(`UPDATE play_posts SET result_entered_at = now() WHERE id = $1::uuid`, [postId]);
    await completeActivePlaySessions(client, postId);

    const owner = await client.query(
      `SELECT users.telegram_chat_id
         FROM play_posts post
         JOIN play_organizers organizer ON organizer.id = post.organizer_id
         JOIN users ON users.id = organizer.owner_user_id
        WHERE post.id = $1::uuid LIMIT 1`,
      [postId],
    );
    const ownerChat = String(owner.rows[0]?.telegram_chat_id ?? '');
    const chats = await client.query(
      `SELECT DISTINCT users.telegram_chat_id
         FROM play_post_participants participant
         JOIN users ON users.id = participant.user_id
        WHERE participant.post_id = $1::uuid AND participant.status = 'confirmed'
          AND COALESCE(users.telegram_chat_id, '') <> ''`,
      [postId],
    );
    for (const row of chats.rows) {
      const chat = String(row.telegram_chat_id);
      if (!approveImmediately && chat === ownerChat) continue;
      await enqueueTelegram(
        client,
        chat,
        approveImmediately ? 'result_confirmed' : 'result_entered',
        approveImmediately
          ? `Результат «${String(post.title)}» утверждён организатором: https://lpvolley.ru/partner/${postId}`
          : `Результат «${String(post.title)}» предложен и ждёт организатора: https://lpvolley.ru/partner/${postId}`,
        `${approveImmediately ? 'result_confirmed' : 'result_entered'}:${postId}:${revision}:${chat}`,
      );
    }
    if (!approveImmediately && ownerChat) {
      await enqueueTelegram(
        client,
        ownerChat,
        'result_awaiting_approval',
        `Участник предложил счёт «${String(post.title)}». Проверьте и утвердите: https://lpvolley.ru/partner/${postId}#result`,
        `result_awaiting_approval:${postId}:${revision}:${ownerChat}`,
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (isSchemaUnavailable(err)) {
      throw new PlayServiceError(503, 'Миграция жизненного цикла игр не применена');
    }
    throw err;
  } finally {
    client.release();
  }
  const view = await loadResultView(postId, actor.kind === 'user' ? actor.userId : null);
  if (!view) throw new PlayServiceError(500, 'Не удалось загрузить результат');
  return view;
}

export async function updatePlayResult(
  actor: PlayActor,
  resultId: string,
  payload: unknown,
  expectedRevision: number,
): Promise<PlayGameResultView> {
  const { rows } = await getPool().query(
    `SELECT post_id::text FROM play_game_results WHERE id = $1::uuid LIMIT 1`,
    [resultId],
  );
  if (!rows[0]) throw new PlayServiceError(404, 'Результат не найден');
  return submitPlayResult(actor, String(rows[0].post_id), payload, { expectedRevision });
}

export async function approvePlayResult(
  actor: PlayActor,
  resultId: string,
  expectedRevision?: number,
): Promise<PlayGameResultView> {
  const client = await getPool().connect();
  let postId = '';
  try {
    await client.query('BEGIN');
    const located = await client.query(
      `SELECT post_id::text FROM play_game_results WHERE id = $1::uuid LIMIT 1`,
      [resultId],
    );
    postId = String(located.rows[0]?.post_id ?? '');
    if (!postId) throw new PlayServiceError(404, 'Результат не найден');
    const access = await requirePlayResultActor(client, actor, postId);
    if (!access.isManager) {
      throw new PlayServiceError(403, 'Утвердить счёт может только организатор или администратор');
    }
    if (String(access.post.status) === 'cancelled') {
      throw new PlayServiceError(409, 'Нельзя утвердить результат отменённой игры');
    }
    const loaded = await client.query(
      `SELECT id::text, status, payload, revision
         FROM play_game_results WHERE id = $1::uuid FOR UPDATE`,
      [resultId],
    );
    const result = loaded.rows[0];
    if (!result) throw new PlayServiceError(404, 'Результат не найден');
    if (String(result.status) !== 'pending') {
      throw new PlayServiceError(409, 'Утвердить можно только ожидающий результат');
    }
    const revision = Number(result.revision ?? 1);
    assertResultRevision(expectedRevision, revision);
    const roster = await loadConfirmedResultRoster(client, postId);
    const blocker = resultApprovalBlocker(access.post, result.payload, roster);
    if (blocker) throw new PlayServiceError(409, blocker);
    await approveResultRow(client, actor, resultId, revision);
    await completeActivePlaySessions(client, postId);
    const chats = await client.query(
      `SELECT DISTINCT users.telegram_chat_id
         FROM play_post_participants participant
         JOIN users ON users.id = participant.user_id
        WHERE participant.post_id = $1::uuid AND participant.status = 'confirmed'
          AND COALESCE(users.telegram_chat_id, '') <> ''`,
      [postId],
    );
    for (const row of chats.rows) {
      const chat = String(row.telegram_chat_id);
      await enqueueTelegram(
        client,
        chat,
        'result_confirmed',
        `Результат «${String(access.post.title)}» утверждён организатором: https://lpvolley.ru/partner/${postId}#result`,
        `result_confirmed:${postId}:${revision}:${chat}`,
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const view = await loadResultView(postId, actor.kind === 'user' ? actor.userId : null);
  if (!view) throw new PlayServiceError(500, 'Не удалось загрузить результат');
  return view;
}

export interface PlayResultCorrectionRequestView {
  id: string;
  resultId: string;
  revision: number;
  requestedByUserId: number;
  comment: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  resolutionComment: string;
  createdAt: string;
  resolvedAt: string | null;
}

function mapCorrectionRequest(row: Record<string, unknown>): PlayResultCorrectionRequestView {
  return {
    id: String(row.id),
    resultId: String(row.result_id ?? row.resultId),
    revision: Number(row.result_revision ?? row.revision),
    requestedByUserId: Number(row.requested_by_user_id ?? row.requestedByUserId),
    comment: String(row.comment ?? ''),
    status: String(row.status) as PlayResultCorrectionRequestView['status'],
    resolutionComment: String(row.resolution_comment ?? row.resolutionComment ?? ''),
    createdAt: asIso(row.created_at ?? row.createdAt),
    resolvedAt: row.resolved_at || row.resolvedAt ? asIso(row.resolved_at ?? row.resolvedAt) : null,
  };
}

export async function createPlayResultCorrectionRequest(
  userId: number,
  resultId: string,
  comment: string,
  expectedRevision?: number,
): Promise<PlayResultCorrectionRequestView> {
  const normalizedComment = String(comment ?? '').trim().slice(0, 500);
  if (normalizedComment.length < 3) throw new PlayServiceError(400, 'Опишите ошибку минимум тремя символами');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const loaded = await client.query(
      `SELECT result.id::text, result.post_id::text, result.status, result.revision
         FROM play_game_results result
        WHERE result.id = $1::uuid FOR UPDATE`,
      [resultId],
    );
    const result = loaded.rows[0];
    if (!result) throw new PlayServiceError(404, 'Результат не найден');
    if (String(result.status) !== 'confirmed') {
      throw new PlayServiceError(409, 'Сообщить об ошибке можно после утверждения результата');
    }
    const revision = Number(result.revision ?? 1);
    assertResultRevision(expectedRevision, revision);
    const membership = await client.query(
      `SELECT 1 FROM play_post_participants
        WHERE post_id = $1::uuid AND user_id = $2 AND status = 'confirmed' LIMIT 1`,
      [String(result.post_id), userId],
    );
    if (!membership.rows[0]) {
      throw new PlayServiceError(403, 'Сообщить об ошибке может только участник игры');
    }
    let inserted;
    try {
      inserted = await client.query(
        `INSERT INTO play_result_correction_requests
          (result_id, result_revision, requested_by_user_id, comment)
         VALUES ($1::uuid, $2, $3, $4)
         RETURNING *`,
        [resultId, revision, userId, normalizedComment],
      );
    } catch (error) {
      if (String((error as { code?: unknown })?.code ?? '') === '23505') {
        throw new PlayServiceError(409, 'Вы уже отправили запрос на исправление');
      }
      throw error;
    }
    const owner = await client.query(
      `SELECT users.telegram_chat_id, post.title
         FROM play_posts post
         JOIN play_organizers organizer ON organizer.id = post.organizer_id
         JOIN users ON users.id = organizer.owner_user_id
        WHERE post.id = $1::uuid LIMIT 1`,
      [String(result.post_id)],
    );
    const ownerChat = String(owner.rows[0]?.telegram_chat_id ?? '');
    if (ownerChat) {
      await enqueueTelegram(
        client,
        ownerChat,
        'result_correction_requested',
        `Участник сообщил об ошибке в результате «${String(owner.rows[0]?.title ?? '')}»: https://lpvolley.ru/partner/${String(result.post_id)}#result`,
        `result_correction_requested:${resultId}:${revision}:${ownerChat}`,
      );
    }
    await client.query('COMMIT');
    return mapCorrectionRequest(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function resolvePlayResultCorrectionRequest(
  actor: PlayActor,
  resultId: string,
  requestId: string,
  input: { decision: 'accepted' | 'rejected'; comment?: string; expectedRevision?: number },
): Promise<PlayGameResultView> {
  const client = await getPool().connect();
  let postId = '';
  try {
    await client.query('BEGIN');
    const located = await client.query(
      `SELECT post_id::text FROM play_game_results WHERE id = $1::uuid LIMIT 1`,
      [resultId],
    );
    postId = String(located.rows[0]?.post_id ?? '');
    if (!postId) throw new PlayServiceError(404, 'Результат не найден');
    const access = await requirePlayResultActor(client, actor, postId);
    if (!access.isManager) throw new PlayServiceError(403, 'Запрос разбирает организатор или администратор');
    const loaded = await client.query(
      `SELECT result.status AS result_status, result.revision, result.approved_at,
              request.id::text, request.status, request.created_at
         FROM play_game_results result
         JOIN play_result_correction_requests request ON request.result_id = result.id
        WHERE result.id = $1::uuid AND request.id = $2::uuid
        FOR UPDATE OF result, request`,
      [resultId, requestId],
    );
    const row = loaded.rows[0];
    if (!row) throw new PlayServiceError(404, 'Запрос на исправление не найден');
    if (String(row.status) !== 'pending') throw new PlayServiceError(409, 'Запрос уже обработан');
    const revision = Number(row.revision ?? 1);
    assertResultRevision(input.expectedRevision, revision);
    if (
      actor.kind === 'user'
      && (!row.approved_at || Date.now() - new Date(row.approved_at).getTime() > 48 * 60 * 60 * 1000)
    ) {
      throw new PlayServiceError(409, 'Срок решения запроса организатором истёк; обратитесь к администратору');
    }
    if (input.decision === 'accepted') {
      if (String(row.result_status) !== 'confirmed') {
        throw new PlayServiceError(409, 'Исправить можно только утверждённый результат');
      }
      await reverseActivePlayResultRating(client, resultId, 'Принят запрос на исправление');
      await client.query(
        `UPDATE play_game_results SET status = 'disputed', approved_at = NULL,
                approved_by_user_id = NULL, approved_by_admin_actor = NULL
          WHERE id = $1::uuid`,
        [resultId],
      );
    }
    await client.query(
      `UPDATE play_result_correction_requests
          SET status = $3, resolution_comment = $4, resolved_at = now(),
              resolved_by_user_id = $5, resolved_by_admin_actor = $6
        WHERE id = $1::uuid AND result_id = $2::uuid`,
      [
        requestId,
        resultId,
        input.decision,
        String(input.comment ?? '').trim().slice(0, 500),
        actor.kind === 'user' ? actor.userId : null,
        actor.kind === 'admin' ? actor.admin.id : null,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const view = await loadResultView(postId, actor.kind === 'user' ? actor.userId : null);
  if (!view) throw new PlayServiceError(500, 'Не удалось загрузить результат');
  return view;
}

export async function votePlayResult(
  userId: number,
  resultId: string,
  verdict: 'confirmed' | 'disputed',
  comment = ''
): Promise<PlayGameResultView> {
  const client = await getPool().connect();
  let postId = '';
  let notifyKind: 'result_confirmed' | 'result_disputed' | null = null;
  let organizerChat = '';
  let title = '';
  try {
    await client.query('BEGIN');
    const resultRow = await client.query(
      `SELECT pgr.id::text, pgr.post_id::text, pgr.status, pp.title
         FROM play_game_results pgr
         JOIN play_posts pp ON pp.id = pgr.post_id
        WHERE pgr.id = $1::uuid FOR UPDATE OF pgr`,
      [resultId]
    );
    const result = resultRow.rows[0];
    if (!result) throw new PlayServiceError(404, 'Результат не найден');
    postId = String(result.post_id);
    title = String(result.title);
    if (String(result.status) !== 'pending') {
      throw new PlayServiceError(409, 'Результат уже обработан');
    }
    const membership = await client.query(
      `SELECT id FROM play_post_participants
        WHERE post_id = $1::uuid AND user_id = $2 AND status = 'confirmed' LIMIT 1`,
      [postId, userId]
    );
    if (!membership.rows[0]) {
      throw new PlayServiceError(403, 'Голосовать могут только подтверждённые участники');
    }
    await client.query(
      `INSERT INTO play_result_confirmations (result_id, user_id, verdict, comment)
       VALUES ($1::uuid, $2, $3, $4)
       ON CONFLICT (result_id, user_id) DO UPDATE SET
         verdict = EXCLUDED.verdict, comment = EXCLUDED.comment`,
      [resultId, userId, verdict, String(comment ?? '').trim().slice(0, 500)]
    );
    if (verdict === 'disputed') {
      await client.query(
        `UPDATE play_game_results SET status = 'disputed' WHERE id = $1::uuid`,
        [resultId]
      );
      notifyKind = 'result_disputed';
    }
    if (notifyKind) {
      const owner = await client.query(
        `SELECT u.telegram_chat_id
           FROM play_posts pp
           JOIN play_organizers po ON po.id = pp.organizer_id
           JOIN users u ON u.id = po.owner_user_id
          WHERE pp.id = $1::uuid LIMIT 1`,
        [postId]
      );
      organizerChat = String(owner.rows[0]?.telegram_chat_id ?? '');
      await enqueueTelegram(
        client,
        organizerChat,
        notifyKind,
        notifyKind === 'result_disputed'
          ? `Результат «${title}» оспорен участником. Проверьте детали: https://lpvolley.ru/partner/${postId}`
          : `Результат «${title}» подтверждён участниками: https://lpvolley.ru/partner/${postId}`,
        `${notifyKind}:${postId}:${organizerChat}`
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const view = await loadResultView(postId, userId);
  if (!view) throw new PlayServiceError(500, 'Не удалось загрузить результат');
  return view;
}

// --- Приглашения (§4) ---

export interface PlayInviteView {
  id: string;
  postId: string;
  postTitle: string;
  startsAt: string;
  fromUserName: string;
  status: PlayInviteStatus;
  isMass: boolean;
  createdAt: string;
}

function mapInvite(row: Record<string, unknown>): PlayInviteView {
  return {
    id: String(row.id),
    postId: String(row.postId ?? row.post_id),
    postTitle: String(row.postTitle ?? ''),
    startsAt: asIso(row.startsAt ?? row.starts_at),
    fromUserName: String(row.fromUserName ?? ''),
    status: String(row.status) as PlayInviteStatus,
    isMass: Boolean(row.isMass ?? row.is_mass),
    createdAt: asIso(row.createdAt ?? row.created_at),
  };
}

const INVITE_SELECT = `
  pi.id::text, pi.post_id::text AS "postId", pi.status, pi.is_mass AS "isMass",
  pi.created_at AS "createdAt", pp.title AS "postTitle", pp.starts_at AS "startsAt",
  COALESCE(NULLIF(u.full_name, ''), 'Организатор') AS "fromUserName"
  FROM play_invites pi
  JOIN play_posts pp ON pp.id = pi.post_id
  JOIN users u ON u.id = pi.from_user_id`;

async function assertInvitablePost(client: PoolClient, actor: PlayActor, postId: string) {
  const post = await assertPostManager(client, actor, postId);
  if (String(post.status) !== 'published') {
    throw new PlayServiceError(409, 'Приглашать можно только на опубликованную игру');
  }
  if (new Date(post.starts_at).getTime() <= Date.now()) {
    throw new PlayServiceError(409, 'Игра уже началась');
  }
  return post;
}

async function insertInvite(
  client: PoolClient,
  post: { id?: string; title: string },
  postId: string,
  fromUserId: number,
  toUserId: number,
  isMass: boolean
): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO play_invites (post_id, from_user_id, to_user_id, is_mass)
     VALUES ($1::uuid, $2, $3, $4)
     ON CONFLICT (post_id, to_user_id) DO UPDATE SET
       from_user_id = EXCLUDED.from_user_id,
       status = 'sent', is_mass = EXCLUDED.is_mass,
       responded_at = NULL, created_at = now()
     WHERE play_invites.status IN ('declined', 'expired')
     RETURNING id::text`,
    [postId, fromUserId, toUserId, isMass]
  );
  if (!inserted.rows[0]) return false;
  const chat = await client.query(
    `SELECT telegram_chat_id FROM users WHERE id = $1 LIMIT 1`,
    [toUserId]
  );
  await enqueueTelegram(
    client,
    String(chat.rows[0]?.telegram_chat_id ?? ''),
    'invite_received',
    `Вас зовут на «${post.title}». Принять или отклонить: https://lpvolley.ru/partner/${postId}`
  );
  return true;
}

export async function createPlayInvite(
  actor: PlayActor,
  postId: string,
  toUserId: number
): Promise<{ invited: boolean }> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const post = await assertInvitablePost(client, actor, postId);
    if (!Number.isInteger(toUserId) || toUserId <= 0) {
      throw new PlayServiceError(400, 'Укажите игрока');
    }
    const target = await client.query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [toUserId]);
    if (!target.rows[0]) throw new PlayServiceError(404, 'Игрок не найден');
    const fromUserId = actor.kind === 'user' ? actor.userId : Number(post.owner_user_id);
    if (fromUserId === toUserId) throw new PlayServiceError(400, 'Нельзя пригласить самого себя');
    const already = await client.query(
      `SELECT id FROM play_post_participants
        WHERE post_id = $1::uuid AND user_id = $2 AND status IN ('pending','confirmed','reserve')
        LIMIT 1`,
      [postId, toUserId]
    );
    if (already.rows[0]) throw new PlayServiceError(409, 'Игрок уже записан на игру');
    const invited = await insertInvite(client, { title: String(post.title) }, postId, fromUserId, toUserId, false);
    await client.query('COMMIT');
    return { invited };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export const MASS_INVITE_LIMIT = 20;

export async function massPlayInvites(
  actor: PlayActor,
  postId: string
): Promise<{ invited: number; candidates: number }> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const post = await assertInvitablePost(client, actor, postId);
    const fromUserId = actor.kind === 'user' ? actor.userId : Number(post.owner_user_id);
    const wave = await client.query(
      `SELECT id FROM play_invites WHERE post_id = $1::uuid AND is_mass LIMIT 1`,
      [postId]
    );
    if (wave.rows[0]) {
      throw new PlayServiceError(409, 'Массовое приглашение уже отправляли для этой игры');
    }
    // Кандидаты: активная availability, пересекающаяся со временем игры,
    // ИЛИ ≥1 совместная completed-игра с организатором за 90 дней (§4)
    const candidates = await client.query(
      `SELECT u.id, p.skill_level, p.gender
         FROM users u
         LEFT JOIN players p ON p.id = u.player_id
        WHERE u.id <> $2
          AND (
            EXISTS (
              SELECT 1 FROM play_availability pa
               WHERE pa.user_id = u.id AND pa.active
                 AND pa.date_from < $3::timestamptz AND pa.date_to > $4::timestamptz
            )
            OR EXISTS (
              SELECT 1 FROM play_post_participants mine
               JOIN play_posts mp ON mp.id = mine.post_id AND mp.status = 'completed'
               JOIN play_post_participants org
                 ON org.post_id = mp.id AND org.user_id = $2 AND org.status = 'confirmed'
              WHERE mine.user_id = u.id AND mine.status = 'confirmed'
                AND mp.ends_at > now() - interval '90 days'
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM play_post_participants ppp
             WHERE ppp.post_id = $1::uuid AND ppp.user_id = u.id
               AND ppp.status IN ('pending','confirmed','reserve')
          )
          AND NOT EXISTS (
            SELECT 1 FROM play_invites pi
             WHERE pi.post_id = $1::uuid AND pi.to_user_id = u.id
               AND pi.status IN ('sent','accepted')
          )
        LIMIT 100`,
      [postId, fromUserId, post.ends_at, post.starts_at]
    );
    const levelMin = nullableLevel(post.level_min);
    const levelMax = nullableLevel(post.level_max);
    const genderPolicy = String(post.gender_policy ?? 'any') as 'any' | 'M' | 'W' | 'mixed';
    const fitting = candidates.rows
      .filter((row) =>
        calculatePlayFit({
          playerLevel: nullableLevel(row.skill_level),
          playerGender: String(row.gender ?? '') === 'W' ? 'W' : String(row.gender ?? '') === 'M' ? 'M' : null,
          levelMin,
          levelMax,
          genderPolicy,
        }) === 'match'
      )
      .slice(0, MASS_INVITE_LIMIT);
    let invited = 0;
    for (const row of fitting) {
      if (await insertInvite(client, { title: String(post.title) }, postId, fromUserId, Number(row.id), true)) {
        invited += 1;
      }
    }
    if (!invited) {
      // пометить волну, чтобы повторный клик не крутил поиск (unique index на is_mass)
      await client.query(
        `INSERT INTO play_invites (post_id, from_user_id, to_user_id, is_mass, status)
         VALUES ($1::uuid, $2, $2, true, 'expired')
         ON CONFLICT (post_id, to_user_id) DO NOTHING`,
        [postId, fromUserId]
      );
    }
    await client.query('COMMIT');
    return { invited, candidates: fitting.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function respondPlayInvite(
  userId: number,
  inviteId: string,
  action: 'accept' | 'decline'
): Promise<{ status: PlayInviteStatus; participantStatus?: PlayParticipantStatus }> {
  const client = await getPool().connect();
  let participantStatus: PlayParticipantStatus | undefined;
  let organizerChat = '';
  let title = '';
  let postId = '';
  try {
    await client.query('BEGIN');
    const inviteRow = await client.query(
      `SELECT pi.*, pp.title, pp.starts_at, pp.status AS post_status, pp.capacity,
              pp.min_players, po.owner_user_id
         FROM play_invites pi
         JOIN play_posts pp ON pp.id = pi.post_id
         JOIN play_organizers po ON po.id = pp.organizer_id
        WHERE pi.id = $1::uuid AND pi.to_user_id = $2
        FOR UPDATE OF pi, pp`,
      [inviteId, userId]
    );
    const invite = inviteRow.rows[0];
    if (!invite) throw new PlayServiceError(404, 'Приглашение не найдено');
    if (String(invite.status) !== 'sent') throw new PlayServiceError(409, 'Приглашение уже обработано');
    postId = String(invite.post_id);
    title = String(invite.title);
    if (String(invite.post_status) !== 'published' || new Date(invite.starts_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE play_invites SET status = 'expired', responded_at = now() WHERE id = $1::uuid`,
        [inviteId]
      );
      await client.query('COMMIT');
      return { status: 'expired' };
    }
    const organizer = await client.query(
      `SELECT telegram_chat_id FROM users WHERE id = $1 LIMIT 1`,
      [invite.owner_user_id]
    );
    organizerChat = String(organizer.rows[0]?.telegram_chat_id ?? '');
    if (action === 'decline') {
      await client.query(
        `UPDATE play_invites SET status = 'declined', responded_at = now() WHERE id = $1::uuid`,
        [inviteId]
      );
      await client.query('COMMIT');
      return { status: 'declined' };
    }
    // accept: приглашение от организатора — вход напрямую (confirmed/reserve), без заявки
    participantStatus = (await freeSlots(client, postId, Number(invite.capacity))) > 0
      ? 'confirmed'
      : 'reserve';
    const userResult = await client.query(
      `SELECT player_id, telegram_chat_id, full_name FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const inserted = await client.query(
      `INSERT INTO play_post_participants (post_id, user_id, player_id, status)
       VALUES ($1::uuid, $2, $3::uuid, $4)
       ON CONFLICT (post_id, user_id) DO UPDATE SET
         player_id = EXCLUDED.player_id, status = EXCLUDED.status, reviewed_at = now()
       WHERE play_post_participants.status IN ('cancelled', 'rejected')
       RETURNING id::text`,
      [postId, userId, userResult.rows[0]?.player_id ?? null, participantStatus]
    );
    if (!inserted.rows[0]) throw new PlayServiceError(409, 'Вы уже записаны на эту игру');
    await client.query(
      `UPDATE play_invites SET status = 'accepted', responded_at = now() WHERE id = $1::uuid`,
      [inviteId]
    );
    await enqueueTelegram(
      client,
      organizerChat,
      'invite_received',
      `${String(userResult.rows[0]?.full_name ?? 'Игрок')} принял приглашение на «${title}».`
    );
    if (participantStatus === 'confirmed') {
      await maybeNotifyMinimumReached(
        client,
        postId,
        { min_players: invite.min_players, capacity: Number(invite.capacity), status: 'published' },
        title
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { status: 'accepted', participantStatus };
}

export async function listMyPlayInvites(userId: number): Promise<PlayInviteView[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const { rows } = await getPool().query(
      `SELECT ${INVITE_SELECT}
        WHERE pi.to_user_id = $1 AND pi.status = 'sent'
        ORDER BY pi.created_at DESC LIMIT 50`,
      [userId]
    );
    return rows.map(mapInvite);
  } catch (err) {
    if (isSchemaUnavailable(err)) return [];
    throw err;
  }
}

// --- Availability «Я свободен» (§1.6) ---

export interface PlayAvailabilityView {
  id: string;
  dateFrom: string;
  dateTo: string;
  levels: string[];
  formats: string[];
  note: string;
}

export async function getMyPlayAvailability(userId: number): Promise<PlayAvailabilityView | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { rows } = await getPool().query(
      `SELECT id::text, date_from, date_to, levels, formats, note
         FROM play_availability
        WHERE user_id = $1 AND active AND date_to > now()
        ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const row = rows[0];
    return row
      ? {
          id: String(row.id),
          dateFrom: asIso(row.date_from),
          dateTo: asIso(row.date_to),
          levels: (row.levels as string[]) ?? [],
          formats: (row.formats as string[]) ?? [],
          note: String(row.note ?? ''),
        }
      : null;
  } catch (err) {
    if (isSchemaUnavailable(err)) return null;
    throw err;
  }
}

export async function upsertPlayAvailability(
  userId: number,
  raw: Record<string, unknown>
): Promise<PlayAvailabilityView> {
  const dateFrom = new Date(String(raw.dateFrom ?? ''));
  const dateTo = new Date(String(raw.dateTo ?? ''));
  if (!Number.isFinite(dateFrom.getTime()) || !Number.isFinite(dateTo.getTime())) {
    throw new PlayServiceError(400, 'Укажите корректный период');
  }
  if (dateTo.getTime() <= dateFrom.getTime()) {
    throw new PlayServiceError(400, 'Конец периода должен быть позже начала');
  }
  if (dateTo.getTime() <= Date.now()) {
    throw new PlayServiceError(400, 'Период уже прошёл');
  }
  const note = String(raw.note ?? '').trim().slice(0, 140);
  const levels = (Array.isArray(raw.levels) ? raw.levels : [])
    .map((value) => normalizePlayLevel(value))
    .filter((value): value is PlayLevel => Boolean(value));
  const formats = (Array.isArray(raw.formats) ? raw.formats : [])
    .map((value) => String(value ?? '').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 10);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE play_availability SET active = false WHERE user_id = $1 AND active`,
      [userId]
    );
    const inserted = await client.query(
      `INSERT INTO play_availability (user_id, date_from, date_to, levels, formats, note)
       VALUES ($1, $2::timestamptz, $3::timestamptz, $4::text[], $5::text[], $6)
       RETURNING id::text, date_from, date_to, levels, formats, note`,
      [userId, dateFrom.toISOString(), dateTo.toISOString(), levels, formats, note]
    );
    await client.query('COMMIT');
    const row = inserted.rows[0];
    return {
      id: String(row.id),
      dateFrom: asIso(row.date_from),
      dateTo: asIso(row.date_to),
      levels: (row.levels as string[]) ?? [],
      formats: (row.formats as string[]) ?? [],
      note: String(row.note ?? ''),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (isSchemaUnavailable(err)) {
      throw new PlayServiceError(503, 'Миграция availability не применена');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function deletePlayAvailability(userId: number): Promise<{ ok: true }> {
  await getPool().query(
    `UPDATE play_availability SET active = false WHERE user_id = $1 AND active`,
    [userId]
  );
  return { ok: true };
}

// --- Зоны ленты /play (§5) ---

export interface PlayActionCard {
  kind: 'confirm_attendance' | 'enter_result' | 'approve_result' | 'fix_result' | 'pending_requests';
  postId: string;
  title: string;
  count: number;
}

export interface PlayFeed {
  mine: PlayPostView[];
  actionCards: PlayActionCard[];
  forYou: PlayPostView[];
  myGames: PlayPostView[];
}

export async function listPlayFeed(userId: number | null): Promise<PlayFeed> {
  const empty: PlayFeed = { mine: [], actionCards: [], forYou: [], myGames: [] };
  if (!process.env.DATABASE_URL) return empty;
  const now = new Date().toISOString();
  const upcoming = await listPlayPosts({ dateFrom: now, viewerUserId: userId });
  if (!userId) {
    // Q6: гостю — read-only лента без персонализации
    return { ...empty, forYou: upcoming.slice(0, 12) };
  }
  const viewer = await loadViewerProfile(userId);
  const personalized = Boolean(viewer.level && viewer.gender);

  const mine = upcoming.filter((post) =>
    ['pending', 'confirmed', 'reserve'].includes(String(post.viewerStatus ?? ''))
  );

  const availability = await getMyPlayAvailability(userId);
  const availabilityWindow = availability
    ? { from: new Date(availability.dateFrom).getTime(), to: new Date(availability.dateTo).getTime() }
    : null;

  const candidates = upcoming.filter((post) => {
    if (['pending', 'confirmed', 'reserve'].includes(String(post.viewerStatus ?? ''))) return false;
    if (post.gatherState === 'closed' || post.gatherState === 'at_risk') return false;
    if (personalized) return post.fit === 'match';
    return true;
  });

  const scored = await Promise.all(
    candidates.map(async (post) => {
      const start = new Date(post.startsAt).getTime();
      const end = new Date(post.endsAt).getTime();
      const overlap = Boolean(
        availabilityWindow && availabilityWindow.from < end && availabilityWindow.to > start
      );
      const pastTeammatesCount = await countPastTeammates(post.id, userId);
      const score = scoreForYou({
        fit: post.fit,
        availabilityOverlap: overlap,
        pastTeammatesCount,
        gatherState: post.gatherState,
        startsAt: post.startsAt,
      });
      return { post, score };
    })
  );
  const forYou = scored
    .sort((a, b) => b.score - a.score || a.post.startsAt.localeCompare(b.post.startsAt))
    .slice(0, 12)
    .map((item) => item.post);

  // Action cards (§5.1)
  const actionCards: PlayActionCard[] = [];
  try {
    const toEnter = await getPool().query(
      `SELECT pp.id::text, pp.title
         FROM play_posts pp
         JOIN play_organizers po ON po.id = pp.organizer_id
        WHERE (pp.status = 'completed' OR (pp.status = 'published' AND pp.ends_at <= now()))
          AND NOT EXISTS (SELECT 1 FROM play_game_results pgr WHERE pgr.post_id = pp.id)
          AND (
            po.owner_user_id = $1
            OR EXISTS (
              SELECT 1 FROM play_post_participants participant
               WHERE participant.post_id = pp.id
                 AND participant.user_id = $1
                 AND participant.status = 'confirmed'
            )
          )
        ORDER BY pp.ends_at DESC LIMIT 10`,
      [userId]
    );
    for (const row of toEnter.rows) {
      actionCards.push({ kind: 'enter_result', postId: String(row.id), title: String(row.title), count: 1 });
    }
    const toApprove = await getPool().query(
      `SELECT pp.id::text, pp.title
         FROM play_game_results pgr
         JOIN play_posts pp ON pp.id = pgr.post_id
         JOIN play_organizers po ON po.id = pp.organizer_id
        WHERE pgr.status = 'pending'
          AND po.owner_user_id = $1
        ORDER BY pgr.created_at DESC LIMIT 10`,
      [userId]
    );
    for (const row of toApprove.rows) {
      actionCards.push({ kind: 'approve_result', postId: String(row.id), title: String(row.title), count: 1 });
    }
    const toFix = await getPool().query(
      `SELECT pp.id::text, pp.title,
              GREATEST(1, COUNT(correction.id))::int AS count
         FROM play_game_results result
         JOIN play_posts pp ON pp.id = result.post_id
         JOIN play_organizers po ON po.id = pp.organizer_id
         LEFT JOIN play_result_correction_requests correction
           ON correction.result_id = result.id AND correction.status = 'pending'
        WHERE po.owner_user_id = $1
          AND (result.status = 'disputed' OR correction.id IS NOT NULL)
        GROUP BY pp.id, pp.title, result.updated_at
        ORDER BY result.updated_at DESC LIMIT 10`,
      [userId]
    );
    for (const row of toFix.rows) {
      actionCards.push({ kind: 'fix_result', postId: String(row.id), title: String(row.title), count: Number(row.count) });
    }
    const attendanceDue = await getPool().query(
      `SELECT post.id::text, post.title
         FROM play_posts post
         JOIN play_post_participants participant
           ON participant.post_id = post.id
          AND participant.user_id = $1
          AND participant.status = 'confirmed'
        WHERE post.status = 'published'
          AND post.starts_at > now()
          AND post.starts_at <= now() + interval '24 hours'
          AND participant.attendance_status = 'unknown'
        ORDER BY post.starts_at LIMIT 10`,
      [userId],
    );
    for (const row of attendanceDue.rows) {
      actionCards.push({ kind: 'confirm_attendance', postId: String(row.id), title: String(row.title), count: 1 });
    }
  } catch (err) {
    if (!isSchemaUnavailable(err)) throw err;
  }
  const pendingRequests = await getPool().query(
    `SELECT pp.id::text, pp.title, COUNT(ppp.id)::int AS count
       FROM play_posts pp
       JOIN play_organizers po ON po.id = pp.organizer_id
       JOIN play_post_participants ppp ON ppp.post_id = pp.id AND ppp.status = 'pending'
      WHERE po.owner_user_id = $1 AND pp.status = 'published'
      GROUP BY pp.id, pp.title
      ORDER BY count DESC LIMIT 10`,
    [userId]
  );
  for (const row of pendingRequests.rows) {
    actionCards.push({
      kind: 'pending_requests',
      postId: String(row.id),
      title: String(row.title),
      count: Number(row.count),
    });
  }

  // «Твои игры»: созданные мной + архив участий
  const me = await getPool().query(`SELECT email FROM users WHERE id = $1 LIMIT 1`, [userId]);
  const created = me.rows[0]
    ? await listManagedPlayPosts({ kind: 'user', userId, email: String(me.rows[0].email ?? '') })
    : [];
  const pastEntries = (await listUserPlayEntries(userId)).filter(
    (post) => !mine.some((item) => item.id === post.id)
  );
  const myGamesMap = new Map<string, PlayPostView>();
  for (const post of [...created, ...pastEntries]) myGamesMap.set(post.id, post);
  const myGames = [...myGamesMap.values()]
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, 30);

  return { mine, actionCards, forYou, myGames };
}

export interface AdminUnfilledPlayPost {
  id: string;
  title: string;
  status: PlayPostView['status'];
  startsAt: string;
  endsAt: string;
  organizerName: string;
  capacity: number;
  confirmedCount: number;
  participantCount: number;
  inviteCount: number;
  liveCommandCount: number;
}

function mapAdminUnfilledPlayPost(row: Record<string, unknown>): AdminUnfilledPlayPost {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    status: String(row.status ?? 'draft') as PlayPostView['status'],
    startsAt: asIso(row.starts_at),
    endsAt: asIso(row.ends_at),
    organizerName: String(row.organizer_name ?? ''),
    capacity: Number(row.capacity ?? 0),
    confirmedCount: Number(row.confirmed_count ?? 0),
    participantCount: Number(row.participant_count ?? 0),
    inviteCount: Number(row.invite_count ?? 0),
    liveCommandCount: Number(row.live_command_count ?? 0),
  };
}

/**
 * Admin cleanup intentionally excludes future published games, games with a
 * result and games that are still open in the live cockpit.
 */
export async function listAdminUnfilledPlayPosts(): Promise<AdminUnfilledPlayPost[]> {
  if (!process.env.DATABASE_URL) return [];
  const { rows } = await getPool().query(
    `SELECT post.id::text, post.title, post.status, post.starts_at, post.ends_at,
            post.capacity, organizer.display_name AS organizer_name,
            (SELECT COUNT(*)::int
               FROM play_post_participants participant
              WHERE participant.post_id = post.id AND participant.status = 'confirmed') AS confirmed_count,
            (SELECT COUNT(*)::int
               FROM play_post_participants participant
              WHERE participant.post_id = post.id
                AND participant.status IN ('pending','confirmed','reserve')) AS participant_count,
            (SELECT COUNT(*)::int FROM play_invites invite WHERE invite.post_id = post.id) AS invite_count,
            (SELECT COUNT(*)::int
               FROM play_game_session_commands command
               JOIN play_game_sessions session ON session.id = command.session_id
              WHERE session.post_id = post.id) AS live_command_count
       FROM play_posts post
       JOIN play_organizers organizer ON organizer.id = post.organizer_id
      WHERE post.kind = 'game'
        AND NOT EXISTS (SELECT 1 FROM play_game_results result WHERE result.post_id = post.id)
        AND (post.status IN ('draft','cancelled','completed') OR post.ends_at <= now())
        AND NOT EXISTS (
          SELECT 1 FROM play_game_sessions session
           WHERE session.post_id = post.id AND session.status = 'active'
        )
      ORDER BY CASE
        WHEN post.ends_at <= now() OR post.status = 'completed' THEN 0
        WHEN post.status = 'draft' THEN 1
        ELSE 2
      END,
      post.ends_at DESC
      LIMIT 100`
  );
  return rows.map(mapAdminUnfilledPlayPost);
}

export async function deleteAdminUnfilledPlayPost(postId: string): Promise<AdminUnfilledPlayPost> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId)) {
    throw new PlayServiceError(400, 'Некорректный идентификатор игры');
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT post.id::text, post.title, post.status, post.starts_at, post.ends_at,
              post.capacity, organizer.display_name AS organizer_name
         FROM play_posts post
         JOIN play_organizers organizer ON organizer.id = post.organizer_id
        WHERE post.id = $1::uuid AND post.kind = 'game'
        FOR UPDATE OF post`,
      [postId]
    );
    const post = locked.rows[0];
    if (!post) throw new PlayServiceError(404, 'Игра не найдена');

    const result = await client.query(
      `SELECT id::text FROM play_game_results WHERE post_id = $1::uuid LIMIT 1`,
      [postId]
    );
    const live = await client.query(
      `SELECT session.status,
              (SELECT COUNT(*)::int FROM play_game_session_commands command WHERE command.session_id = session.id) AS command_count
         FROM play_game_sessions session
        WHERE session.post_id = $1::uuid
        LIMIT 1`,
      [postId]
    );
    const blocker = adminUnfilledPlayDeleteBlocker({
      kind: 'game',
      status: String(post.status),
      endsAt: post.ends_at,
      hasResult: Boolean(result.rows[0]),
      liveStatus: live.rows[0]?.status ? String(live.rows[0].status) : null,
    });
    if (blocker) throw new PlayServiceError(409, blocker);

    const counts = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM play_post_participants participant
           WHERE participant.post_id = $1::uuid AND participant.status = 'confirmed') AS confirmed_count,
         (SELECT COUNT(*)::int FROM play_post_participants participant
           WHERE participant.post_id = $1::uuid
             AND participant.status IN ('pending','confirmed','reserve')) AS participant_count,
         (SELECT COUNT(*)::int FROM play_invites invite WHERE invite.post_id = $1::uuid) AS invite_count`,
      [postId]
    );
    const snapshot = mapAdminUnfilledPlayPost({
      ...post,
      ...counts.rows[0],
      live_command_count: live.rows[0]?.command_count ?? 0,
    });

    await client.query(`DELETE FROM play_posts WHERE id = $1::uuid`, [postId]);
    await client.query('COMMIT');
    return snapshot;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
