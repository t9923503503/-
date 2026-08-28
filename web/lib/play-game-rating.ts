import type { PoolClient } from 'pg';
import {
  getCompetitiveMatches,
  getStructuredResultUserIds,
  normalizeStructuredPlayResult,
  type StructuredPlayResult,
} from '@/lib/play-result-core';

const INITIAL_RATING = 1000;

export interface PlayRatingChange {
  delta: number;
  expected: number;
  confidence: number;
  repeatFactor: number;
  balanceFactor: number;
}

export function calculateTeamRatingChange(input: {
  teamRating: number;
  opponentRating: number;
  won: boolean;
  previousMeetings?: number;
  matchCount?: number;
  accountMatches?: number;
}): PlayRatingChange {
  const expected = 1 / (1 + Math.pow(10, (input.opponentRating - input.teamRating) / 400));
  const repeatFactor = Math.max(0.25, 1 / (1 + Math.max(0, input.previousMeetings || 0) * 0.25));
  const sessionFactor = 1 / Math.sqrt(Math.max(1, input.matchCount || 1));
  const confidence = input.accountMatches == null ? 1 : Math.min(1, Math.max(0, input.accountMatches) / 12);
  const kFactor = 32 - 10 * confidence;
  const balanceFactor = Math.max(0.45, 1 - Math.abs(input.teamRating - input.opponentRating) / 700);
  const value = Math.round(kFactor * sessionFactor * repeatFactor * balanceFactor * ((input.won ? 1 : 0) - expected));
  return {
    delta: input.won ? Math.max(1, value) : Math.min(-1, value),
    expected,
    confidence,
    repeatFactor,
    balanceFactor,
  };
}

export function calculateTeamRatingDelta(input: {
  teamRating: number;
  opponentRating: number;
  won: boolean;
  previousMeetings?: number;
  matchCount?: number;
  accountMatches?: number;
}): number {
  return calculateTeamRatingChange(input).delta;
}

export async function previewPlayResultRating(client: PoolClient, resultId: string) {
  const loaded = await client.query(
    `SELECT result.payload,post.rating_mode FROM play_game_results result JOIN play_posts post ON post.id=result.post_id WHERE result.id=$1::uuid`,
    [resultId],
  );
  if (!loaded.rows[0] || String(loaded.rows[0].rating_mode) !== 'rated') return [];
  const result = normalizeStructuredPlayResult(loaded.rows[0].payload);
  if (!result) return [];
  const keys = getStructuredResultUserIds(result);
  const identities = await client.query(
    `SELECT result_key,user_id FROM play_post_participants WHERE post_id=(SELECT post_id FROM play_game_results WHERE id=$1::uuid) AND result_key=ANY($2::bigint[])`,
    [resultId, keys],
  );
  const keyToUser = new Map<number, number>();
  for (const row of identities.rows) if (row.user_id != null) keyToUser.set(Number(row.result_key), Number(row.user_id));
  if (keys.some((key) => !keyToUser.has(key))) return [];
  const userIds = [...new Set([...keyToUser.values()])];
  const accounts = await client.query(`SELECT user_id,rating,matches FROM play_game_rating_accounts WHERE user_id=ANY($1::int[])`, [userIds]);
  const rating = new Map(userIds.map((id) => [id, INITIAL_RATING]));
  const matchesPlayed = new Map(userIds.map((id) => [id, 0]));
  for (const row of accounts.rows) { rating.set(Number(row.user_id), Number(row.rating)); matchesPlayed.set(Number(row.user_id), Number(row.matches)); }
  const initial = new Map(rating);
  const competitive = getCompetitiveMatches(result);
  for (const match of competitive) {
    const teamA = match.teamA.map((key) => keyToUser.get(key)!);
    const teamB = match.teamB.map((key) => keyToUser.get(key)!);
    const ratingA = teamA.reduce((sum, id) => sum + (rating.get(id) ?? INITIAL_RATING), 0) / 2;
    const ratingB = teamB.reduce((sum, id) => sum + (rating.get(id) ?? INITIAL_RATING), 0) / 2;
    const previous = await client.query(
      `SELECT COUNT(DISTINCT result_id)::int AS count FROM play_game_rating_opponents WHERE created_at>now()-interval '90 days' AND user_id=ANY($1::int[]) AND opponent_user_id=ANY($2::int[])`,
      [teamA, teamB],
    );
    const experience = Math.min(...[...teamA, ...teamB].map((id) => matchesPlayed.get(id) ?? 0));
    const change = calculateTeamRatingChange({ teamRating: ratingA, opponentRating: ratingB, won: match.scoreA > match.scoreB, previousMeetings: Number(previous.rows[0]?.count || 0), matchCount: competitive.length, accountMatches: experience });
    for (const id of teamA) rating.set(id, (rating.get(id) ?? INITIAL_RATING) + change.delta);
    for (const id of teamB) rating.set(id, (rating.get(id) ?? INITIAL_RATING) - change.delta);
  }
  return userIds.map((userId) => ({
    userId,
    ratingBefore: initial.get(userId) ?? INITIAL_RATING,
    delta: (rating.get(userId) ?? INITIAL_RATING) - (initial.get(userId) ?? INITIAL_RATING),
    ratingAfter: rating.get(userId) ?? INITIAL_RATING,
    confidence: Math.min(1, (matchesPlayed.get(userId) ?? 0) / 12),
  }));
}

export async function applyConfirmedPlayResultRating(client: PoolClient, resultId: string): Promise<boolean> {
  let savepoint = false;
  try {
    const loaded = await client.query(
      `SELECT result.payload, result.status, result.revision, post.rating_mode
         FROM play_game_results result
         JOIN play_posts post ON post.id = result.post_id
        WHERE result.id = $1::uuid FOR UPDATE OF result`,
      [resultId],
    );
    if (String(loaded.rows[0]?.status) !== 'confirmed') return false;
    if (String(loaded.rows[0]?.rating_mode) === 'friendly') return false;
    const revision = Number(loaded.rows[0]?.revision ?? 1);
    const result = normalizeStructuredPlayResult(loaded.rows[0]?.payload);
    if (!result) return false; // legacy places-only result does not affect the game rating
    const resultKeys = getStructuredResultUserIds(result);
    const identities = await client.query(
      `SELECT result_key,user_id FROM play_post_participants
        WHERE post_id=(SELECT post_id FROM play_game_results WHERE id=$1::uuid)
          AND result_key = ANY($2::bigint[])`,
      [resultId, resultKeys]
    );
    const keyToUser = new Map<number, number>();
    for (const row of identities.rows) {
      if (row.user_id != null) keyToUser.set(Number(row.result_key), Number(row.user_id));
    }
    // Турнирные профили без кабинета участвуют в сохранённом счёте, но не
    // получают игровой рейтинг до привязки аккаунта.
    if (resultKeys.some((key) => !keyToUser.has(key))) return false;
    const remap = (key: number) => keyToUser.get(key)!;
    const ratingResult: StructuredPlayResult = {
      ...result,
      matches: result.matches.map((match) => ({
        ...match,
        teamA: match.teamA.map(remap),
        teamB: match.teamB.map(remap),
      })),
      ...(result.rounds ? {
        rounds: result.rounds.map((round) => ({
          ...round,
          pairs: round.pairs.map((pair) => ({ ...pair, team: pair.team.map(remap) })),
        })),
      } : {}),
    };
    await client.query('SAVEPOINT play_game_rating_apply');
    savepoint = true;
    const already = await client.query(
      `SELECT 1 FROM play_game_rating_events
        WHERE result_id = $1::uuid AND revision = $2 AND reversed_at IS NULL LIMIT 1`,
      [resultId, revision],
    );
    if (already.rows[0]) return false;

    const ratingMatches = getCompetitiveMatches(ratingResult);
    const userIds = getStructuredResultUserIds(ratingResult);
    const accountRows = await client.query(`SELECT user_id, rating, matches FROM play_game_rating_accounts WHERE user_id = ANY($1::int[]) FOR UPDATE`, [userIds]);
    const initial = new Map<number, number>(userIds.map((id) => [id, INITIAL_RATING]));
    const accountMatches = new Map<number, number>(userIds.map((id) => [id, 0]));
    for (const row of accountRows.rows) initial.set(Number(row.user_id), Number(row.rating));
    for (const row of accountRows.rows) accountMatches.set(Number(row.user_id), Number(row.matches));
    const current = new Map(initial);
    const stats = new Map<number, { wins: number; losses: number; pointsFor: number; pointsAgainst: number }>();
    const stat = (id: number) => {
      if (!stats.has(id)) stats.set(id, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
      return stats.get(id)!;
    };

    for (const match of ratingMatches) {
      const ratingA = match.teamA.reduce((sum, id) => sum + (current.get(id) || INITIAL_RATING), 0) / 2;
      const ratingB = match.teamB.reduce((sum, id) => sum + (current.get(id) || INITIAL_RATING), 0) / 2;
      const pairRows = await client.query(
        `SELECT COUNT(DISTINCT result_id)::int AS count FROM play_game_rating_opponents
          WHERE created_at > now() - interval '90 days' AND result_id <> $3::uuid
            AND user_id = ANY($1::int[]) AND opponent_user_id = ANY($2::int[])`,
        [match.teamA, match.teamB, resultId]
      );
      const previousMeetings = Number(pairRows.rows[0]?.count || 0);
      const aWon = match.scoreA > match.scoreB;
      const experience = Math.min(...[...match.teamA, ...match.teamB].map((id) => accountMatches.get(id) ?? 0));
      const deltaA = calculateTeamRatingDelta({ teamRating: ratingA, opponentRating: ratingB, won: aWon, previousMeetings, matchCount: ratingMatches.length, accountMatches: experience });
      const deltaB = -deltaA;
      for (const id of match.teamA) {
        current.set(id, (current.get(id) || INITIAL_RATING) + deltaA);
        const item = stat(id); item.wins += aWon ? 1 : 0; item.losses += aWon ? 0 : 1; item.pointsFor += match.scoreA; item.pointsAgainst += match.scoreB;
      }
      for (const id of match.teamB) {
        current.set(id, (current.get(id) || INITIAL_RATING) + deltaB);
        const item = stat(id); item.wins += aWon ? 0 : 1; item.losses += aWon ? 1 : 0; item.pointsFor += match.scoreB; item.pointsAgainst += match.scoreA;
      }
      for (const userId of match.teamA) for (const opponentId of match.teamB) {
        await client.query(`INSERT INTO play_game_rating_opponents (result_id, user_id, opponent_user_id) VALUES ($1::uuid,$2,$3) ON CONFLICT DO NOTHING`, [resultId, userId, opponentId]);
        await client.query(`INSERT INTO play_game_rating_opponents (result_id, user_id, opponent_user_id) VALUES ($1::uuid,$2,$3) ON CONFLICT DO NOTHING`, [resultId, opponentId, userId]);
      }
    }

    for (const userId of userIds) {
      const before = initial.get(userId) || INITIAL_RATING;
      const after = current.get(userId) || before;
      const item = stat(userId);
      await client.query(
        `INSERT INTO play_game_rating_accounts (user_id, rating, matches, wins, losses, points_for, points_against)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id) DO UPDATE SET rating=$2, matches=play_game_rating_accounts.matches+$3,
           wins=play_game_rating_accounts.wins+$4, losses=play_game_rating_accounts.losses+$5,
           points_for=play_game_rating_accounts.points_for+$6, points_against=play_game_rating_accounts.points_against+$7, updated_at=now()`,
        [userId, after, item.wins + item.losses, item.wins, item.losses, item.pointsFor, item.pointsAgainst]
      );
      await client.query(
        `INSERT INTO play_game_rating_events
          (result_id,revision,user_id,rating_before,delta,rating_after,wins,losses,points_for,points_against)
         VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [resultId, revision, userId, before, after - before, after, item.wins, item.losses, item.pointsFor, item.pointsAgainst]
      );
    }
    await client.query('RELEASE SAVEPOINT play_game_rating_apply');
    return true;
  } catch (error) {
    // Позволяет применить код до наката миграции 078 без поломки подтверждений.
    if (['42P01', '42703'].includes(String((error as { code?: unknown })?.code || ''))) {
      if (savepoint) await client.query('ROLLBACK TO SAVEPOINT play_game_rating_apply');
      return false;
    }
    throw error;
  }
}

export async function reverseActivePlayResultRating(
  client: PoolClient,
  resultId: string,
  reason: string,
): Promise<number> {
  const normalizedReason = String(reason || '').trim().slice(0, 500);
  const events = await client.query(
    `SELECT user_id,delta,wins,losses,points_for,points_against
       FROM play_game_rating_events
      WHERE result_id=$1::uuid AND reversed_at IS NULL FOR UPDATE`,
    [resultId],
  );
  for (const event of events.rows) {
    await client.query(
      `UPDATE play_game_rating_accounts SET rating=rating-$2,
         matches=GREATEST(0,matches-$3),wins=GREATEST(0,wins-$4),losses=GREATEST(0,losses-$5),
         points_for=GREATEST(0,points_for-$6),points_against=GREATEST(0,points_against-$7),updated_at=now()
       WHERE user_id=$1`,
      [Number(event.user_id), Number(event.delta), Number(event.wins) + Number(event.losses), Number(event.wins), Number(event.losses), Number(event.points_for), Number(event.points_against)],
    );
  }
  await client.query(
    `UPDATE play_game_rating_events
        SET reversed_at=now(),reversal_reason=$2
      WHERE result_id=$1::uuid AND reversed_at IS NULL`,
    [resultId, normalizedReason],
  );
  await client.query(`DELETE FROM play_game_rating_opponents WHERE result_id=$1::uuid`, [resultId]);
  return events.rowCount || 0;
}

export async function reverseConfirmedPlayResultRating(
  client: PoolClient,
  resultId: string,
  actorId: string,
  reason: string
): Promise<{ resultId: string; reversedPlayers: number }> {
  const normalizedReason = String(reason || '').trim().slice(0, 500);
  if (normalizedReason.length < 5) throw new Error('Укажите причину отмены результата');
  const result = await client.query(`SELECT id::text,status FROM play_game_results WHERE id=$1::uuid FOR UPDATE`, [resultId]);
  if (!result.rows[0]) throw new Error('Результат не найден');
  if (String(result.rows[0].status) !== 'confirmed') throw new Error('Отменить можно только подтверждённый результат');
  const reversedPlayers = await reverseActivePlayResultRating(client, resultId, normalizedReason);
  await client.query(
    `UPDATE play_game_results SET status='cancelled',reversed_at=now(),reversed_by=$2,reversal_reason=$3 WHERE id=$1::uuid`,
    [resultId, actorId, normalizedReason]
  );
  return { resultId, reversedPlayers };
}
