import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { sanitizeServerImageUrl } from '@/lib/server-image-url';
import type { normalizeCoachChallengeAttemptInput, normalizeCoachChallengeInput } from './challenge-validators';
import type {
  CoachAthleteChallengeSummary,
  CoachChallengeAttempt,
  CoachChallengeDetail,
  CoachChallengeIssueLink,
  CoachChallengeReminder,
  CoachChallengeSummary,
} from './challenge-types';
import type { CoachSkill } from './types';

type ChallengeInput = ReturnType<typeof normalizeCoachChallengeInput>;
type AttemptInput = ReturnType<typeof normalizeCoachChallengeAttemptInput>;

function asIso(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
  }
  return {};
}

function textArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

function mapSkill(row: Record<string, unknown>): CoachSkill {
  return {
    id: String(row.skill_id ?? row.id ?? ''),
    code: String(row.skill_code ?? row.code ?? ''),
    name: String(row.skill_name ?? row.name ?? ''),
    parentId: row.parent_id ? String(row.parent_id) : null,
    parentName: row.parent_name ? String(row.parent_name) : null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapSummary(row: Record<string, unknown>): CoachChallengeSummary {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    type: String(row.type ?? 'control') as CoachChallengeSummary['type'],
    scoringType: String(row.scoring_type ?? 'score') as CoachChallengeSummary['scoringType'],
    attemptCount: Number(row.attempt_count ?? 1),
    maxScore: nullableNumber(row.max_score),
    unitLabel: String(row.unit_label ?? 'балл'),
    higherIsBetter: Boolean(row.higher_is_better),
    repeatIntervalDays: row.repeat_interval_days == null ? null : Number(row.repeat_interval_days),
    archived: Boolean(row.archived_at),
    primarySkill: row.primary_skill_id ? mapSkill(row) : null,
    skillCount: Number(row.skill_count ?? 0),
    issueCount: Number(row.issue_count ?? 0),
    attemptTotal: Number(row.attempt_total ?? 0),
    athleteTotal: Number(row.athlete_total ?? 0),
    updatedAt: asIso(row.updated_at),
  };
}

const CHALLENGE_SELECT = `
  SELECT challenge.*,
         primary_skill.id::text AS primary_skill_id,
         primary_skill.code AS skill_code,
         primary_skill.name AS skill_name,
         primary_skill.parent_id::text,
         primary_parent.name AS parent_name,
         COALESCE(counts.skill_count, 0)::int AS skill_count,
         COALESCE(counts.issue_count, 0)::int AS issue_count,
         COALESCE(counts.attempt_total, 0)::int AS attempt_total,
         COALESCE(counts.athlete_total, 0)::int AS athlete_total
    FROM coach_challenges challenge
    LEFT JOIN coach_challenge_skills primary_link ON primary_link.challenge_id = challenge.id AND primary_link.is_primary
    LEFT JOIN coach_skills primary_skill ON primary_skill.id = primary_link.skill_id
    LEFT JOIN coach_skills primary_parent ON primary_parent.id = primary_skill.parent_id
    LEFT JOIN LATERAL (
      SELECT (SELECT COUNT(*) FROM coach_challenge_skills link WHERE link.challenge_id = challenge.id) AS skill_count,
             (SELECT COUNT(*) FROM coach_challenge_issues link WHERE link.challenge_id = challenge.id) AS issue_count,
             (SELECT COUNT(*) FROM coach_challenge_attempts attempt WHERE attempt.challenge_id = challenge.id) AS attempt_total,
             (SELECT COUNT(DISTINCT attempt.player_id) FROM coach_challenge_attempts attempt WHERE attempt.challenge_id = challenge.id) AS athlete_total
    ) counts ON true`;

export async function listCoachChallenges(includeArchived = false): Promise<CoachChallengeSummary[]> {
  const { rows } = await getPool().query(
    `${CHALLENGE_SELECT}
      ${includeArchived ? '' : 'WHERE challenge.archived_at IS NULL'}
      ORDER BY challenge.archived_at NULLS FIRST, challenge.updated_at DESC, challenge.title`,
  );
  return rows.map(mapSummary);
}

function attemptMetadata(rows: Record<string, unknown>[]): Map<string, { isPersonalRecord: boolean; deltaFromPrevious: number | null }> {
  const result = new Map<string, { isPersonalRecord: boolean; deltaFromPrevious: number | null }>();
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = `${row.challenge_id}:${row.player_id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const attempts of groups.values()) {
    attempts.sort((a, b) => new Date(String(a.completed_at)).getTime() - new Date(String(b.completed_at)).getTime());
    let best: number | null = null;
    let previous: number | null = null;
    for (const row of attempts) {
      const score = Number(row.score);
      const higher = Boolean(row.higher_is_better);
      const isPersonalRecord = best == null || (higher ? score > best : score < best);
      const deltaFromPrevious = previous == null ? null : higher ? score - previous : previous - score;
      result.set(String(row.id), { isPersonalRecord, deltaFromPrevious });
      if (isPersonalRecord) best = score;
      previous = score;
    }
  }
  return result;
}

function mapAttempts(rows: Record<string, unknown>[]): CoachChallengeAttempt[] {
  const metadata = attemptMetadata(rows);
  return rows.map((row) => ({
    id: String(row.id),
    challengeId: String(row.challenge_id),
    playerId: String(row.player_id),
    athleteName: String(row.athlete_name ?? 'Ученик'),
    athletePhotoUrl: sanitizeServerImageUrl(row.photo_url),
    trainingSessionId: row.training_session_id ? String(row.training_session_id) : null,
    trainingSessionTitle: row.session_title ? String(row.session_title) : null,
    startedAt: asIso(row.started_at),
    completedAt: asIso(row.completed_at),
    score: Number(row.score),
    maxScore: nullableNumber(row.max_score),
    details: jsonObject(row.details),
    coachComment: String(row.coach_comment ?? ''),
    isPersonalRecord: metadata.get(String(row.id))?.isPersonalRecord ?? false,
    deltaFromPrevious: metadata.get(String(row.id))?.deltaFromPrevious ?? null,
  }));
}

const ATTEMPT_SELECT = `
  SELECT attempt.*, player.name AS athlete_name, player.photo_url,
         session.title AS session_title, challenge.higher_is_better,
         challenge.title AS challenge_title, challenge.unit_label
    FROM coach_challenge_attempts attempt
    JOIN coach_challenges challenge ON challenge.id = attempt.challenge_id
    JOIN players player ON player.id = attempt.player_id
    LEFT JOIN coach_training_sessions session ON session.id = attempt.training_session_id`;

export async function getCoachChallenge(challengeId: string): Promise<CoachChallengeDetail | null> {
  const pool = getPool();
  const [summaryResult, skillsResult, issuesResult, attemptsResult] = await Promise.all([
    pool.query(`${CHALLENGE_SELECT} WHERE challenge.id = $1::uuid LIMIT 1`, [challengeId]),
    pool.query(
      `SELECT skill.id::text AS skill_id, skill.code AS skill_code, skill.name AS skill_name,
              skill.parent_id::text, parent.name AS parent_name, skill.sort_order, link.is_primary
         FROM coach_challenge_skills link
         JOIN coach_skills skill ON skill.id = link.skill_id
         LEFT JOIN coach_skills parent ON parent.id = skill.parent_id
        WHERE link.challenge_id = $1::uuid
        ORDER BY link.is_primary DESC, link.sort_order, skill.name`,
      [challengeId],
    ),
    pool.query(
      `SELECT issue.id::text, issue.title, skill.name AS skill_name
         FROM coach_challenge_issues link
         JOIN coach_issues issue ON issue.id = link.issue_id
         LEFT JOIN coach_skills skill ON skill.id = issue.skill_id
        WHERE link.challenge_id = $1::uuid ORDER BY issue.title`,
      [challengeId],
    ),
    pool.query(`${ATTEMPT_SELECT} WHERE attempt.challenge_id = $1::uuid ORDER BY attempt.completed_at DESC, attempt.id DESC LIMIT 500`, [challengeId]),
  ]);
  if (!summaryResult.rows[0]) return null;
  return {
    ...mapSummary(summaryResult.rows[0]),
    metrics: textArray(summaryResult.rows[0].metrics),
    rules: textArray(summaryResult.rows[0].rules),
    skills: skillsResult.rows.map(mapSkill),
    issues: issuesResult.rows.map((row): CoachChallengeIssueLink => ({ id: String(row.id), title: String(row.title), skillName: row.skill_name ? String(row.skill_name) : null })),
    attempts: mapAttempts(attemptsResult.rows),
  };
}

async function replaceChallengeLinks(client: PoolClient, challengeId: string, input: ChallengeInput): Promise<void> {
  await client.query('DELETE FROM coach_challenge_skills WHERE challenge_id = $1::uuid', [challengeId]);
  const primary = await client.query(
    `INSERT INTO coach_challenge_skills (challenge_id, skill_id, is_primary, sort_order)
     SELECT $1::uuid, skill.id, true, 0 FROM coach_skills skill
      WHERE skill.id = $2::uuid AND skill.archived_at IS NULL RETURNING skill_id`,
    [challengeId, input.primarySkillId],
  );
  if (!primary.rowCount) throw new Error('BadRequest: основной навык не найден');
  if (input.additionalSkillIds.length) {
    const additional = await client.query(
      `INSERT INTO coach_challenge_skills (challenge_id, skill_id, is_primary, sort_order)
       SELECT $1::uuid, skill.id, false, row_number() OVER (ORDER BY skill.name)::smallint
         FROM coach_skills skill WHERE skill.id = ANY($2::uuid[]) AND skill.archived_at IS NULL RETURNING skill_id`,
      [challengeId, input.additionalSkillIds],
    );
    if (additional.rowCount !== input.additionalSkillIds.length) throw new Error('BadRequest: дополнительный навык не найден');
  }
  await client.query('DELETE FROM coach_challenge_issues WHERE challenge_id = $1::uuid', [challengeId]);
  if (input.issueIds.length) {
    const issues = await client.query(
      `INSERT INTO coach_challenge_issues (challenge_id, issue_id)
       SELECT $1::uuid, issue.id FROM coach_issues issue
        WHERE issue.id = ANY($2::uuid[]) AND issue.archived_at IS NULL RETURNING issue_id`,
      [challengeId, input.issueIds],
    );
    if (issues.rowCount !== input.issueIds.length) throw new Error('BadRequest: связанная проблема не найдена');
  }
}

export async function createCoachChallenge(input: ChallengeInput & { actorId: string }): Promise<CoachChallengeDetail> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO coach_challenges
        (title, description, type, scoring_type, attempt_count, max_score, unit_label,
         higher_is_better, metrics, rules, repeat_interval_days, archived_at, created_by_actor, updated_by_actor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::text[], $11,
               CASE WHEN $12 THEN now() ELSE NULL END, $13, $13)
       RETURNING id::text`,
      [input.title, input.description, input.type, input.scoringType, input.attemptCount, input.maxScore, input.unitLabel,
        input.higherIsBetter, JSON.stringify(input.metrics), input.rules, input.repeatIntervalDays, input.archived, input.actorId],
    );
    const challengeId = String(rows[0].id);
    await replaceChallengeLinks(client, challengeId, input);
    await client.query('COMMIT');
    const result = await getCoachChallenge(challengeId);
    if (!result) throw new Error('NotFound');
    return result;
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}

export async function updateCoachChallenge(challengeId: string, input: ChallengeInput & { actorId: string }): Promise<CoachChallengeDetail> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE coach_challenges SET title=$2, description=$3, type=$4, scoring_type=$5,
              attempt_count=$6, max_score=$7, unit_label=$8, higher_is_better=$9,
              metrics=$10::jsonb, rules=$11::text[], repeat_interval_days=$12,
              archived_at=CASE WHEN $13 THEN COALESCE(archived_at, now()) ELSE NULL END,
              updated_by_actor=$14
        WHERE id=$1::uuid RETURNING id`,
      [challengeId, input.title, input.description, input.type, input.scoringType, input.attemptCount, input.maxScore,
        input.unitLabel, input.higherIsBetter, JSON.stringify(input.metrics), input.rules, input.repeatIntervalDays, input.archived, input.actorId],
    );
    if (!updated.rowCount) throw new Error('NotFound');
    await replaceChallengeLinks(client, challengeId, input);
    await client.query('COMMIT');
    const result = await getCoachChallenge(challengeId);
    if (!result) throw new Error('NotFound');
    return result;
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}

export async function addCoachChallengeAttempt(challengeId: string, input: AttemptInput & { actorId: string }): Promise<CoachChallengeAttempt> {
  let parsedDetails: Record<string, unknown> = {};
  if (input.details) {
    try { const candidate = JSON.parse(input.details); parsedDetails = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : { note: input.details }; }
    catch { parsedDetails = { note: input.details }; }
  }
  const { rows } = await getPool().query(
    `INSERT INTO coach_challenge_attempts
      (challenge_id, player_id, training_session_id, started_at, completed_at, score, max_score, details, coach_comment, recorded_by_actor)
     SELECT challenge.id, profile.player_id, $4::uuid, $5::timestamptz, $5::timestamptz,
            $3, COALESCE($6, challenge.max_score), $7::jsonb, $8, $9
       FROM coach_challenges challenge
       JOIN coach_athlete_profiles profile ON profile.player_id = $2::uuid AND profile.status <> 'archived'
      WHERE challenge.id = $1::uuid AND challenge.archived_at IS NULL
        AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM coach_training_sessions session WHERE session.id = $4::uuid))
     RETURNING id::text`,
    [challengeId, input.playerId, input.score, input.trainingSessionId, input.completedAt, input.maxScore, JSON.stringify(parsedDetails), input.coachComment, input.actorId],
  );
  if (!rows[0]) throw new Error('BadRequest: Challenge, ученик или тренировка не найдены');
  const attemptRows = await getPool().query(
    `${ATTEMPT_SELECT} WHERE attempt.challenge_id = $1::uuid AND attempt.player_id = $2::uuid
      ORDER BY attempt.completed_at DESC, attempt.id DESC`,
    [challengeId, input.playerId],
  );
  const attempts = mapAttempts(attemptRows.rows);
  const created = attempts.find((attempt) => attempt.id === String(rows[0].id));
  if (!created) throw new Error('NotFound');
  return created;
}

function mapReminder(row: Record<string, unknown>): CoachChallengeReminder {
  return {
    challengeId: String(row.challenge_id), challengeTitle: String(row.challenge_title),
    playerId: String(row.player_id), athleteName: String(row.athlete_name), athletePhotoUrl: sanitizeServerImageUrl(row.photo_url),
    issueTitle: String(row.issue_title), dueAt: asIso(row.due_at), daysOverdue: Number(row.days_overdue ?? 0), hasAttempt: Boolean(row.has_attempt),
  };
}

export async function listCoachChallengeReminders(playerId?: string): Promise<CoachChallengeReminder[]> {
  const values: unknown[] = [];
  const playerFilter = playerId ? (values.push(playerId), `AND athlete_issue.player_id = $${values.length}::uuid`) : '';
  const { rows } = await getPool().query(
    `SELECT challenge.id::text AS challenge_id, challenge.title AS challenge_title,
            athlete_issue.player_id::text, player.name AS athlete_name, player.photo_url,
            issue.title AS issue_title,
            (COALESCE(last_attempt.completed_at, athlete_issue.detected_at) + make_interval(days => challenge.repeat_interval_days)) AS due_at,
            GREATEST(0, floor(EXTRACT(epoch FROM (now() - (COALESCE(last_attempt.completed_at, athlete_issue.detected_at) + make_interval(days => challenge.repeat_interval_days)))) / 86400))::int AS days_overdue,
            (last_attempt.completed_at IS NOT NULL) AS has_attempt
       FROM coach_challenges challenge
       JOIN coach_challenge_issues link ON link.challenge_id = challenge.id
       JOIN coach_issues issue ON issue.id = link.issue_id
       JOIN coach_athlete_issues athlete_issue ON athlete_issue.issue_id = issue.id
       JOIN coach_athlete_profiles profile ON profile.player_id = athlete_issue.player_id AND profile.status = 'active'
       JOIN players player ON player.id = athlete_issue.player_id
       LEFT JOIN LATERAL (
         SELECT attempt.completed_at FROM coach_challenge_attempts attempt
          WHERE attempt.challenge_id = challenge.id AND attempt.player_id = athlete_issue.player_id
          ORDER BY attempt.completed_at DESC LIMIT 1
       ) last_attempt ON true
      WHERE challenge.archived_at IS NULL AND challenge.repeat_interval_days IS NOT NULL
        AND athlete_issue.status NOT IN ('resolved', 'archived')
        ${playerFilter}
        AND COALESCE(last_attempt.completed_at, athlete_issue.detected_at) + make_interval(days => challenge.repeat_interval_days) <= now()
      ORDER BY due_at, player.name, challenge.title LIMIT 100`,
    values,
  );
  return rows.map(mapReminder);
}

export async function getCoachAthleteChallenges(playerId: string): Promise<CoachAthleteChallengeSummary> {
  const [attemptsResult, reminders] = await Promise.all([
    getPool().query(`${ATTEMPT_SELECT} WHERE attempt.player_id = $1::uuid ORDER BY attempt.completed_at DESC, attempt.id DESC LIMIT 200`, [playerId]),
    listCoachChallengeReminders(playerId),
  ]);
  const attempts = mapAttempts(attemptsResult.rows);
  const best = new Map<string, Record<string, unknown>>();
  for (const row of attemptsResult.rows) {
    const key = String(row.challenge_id);
    const previous = best.get(key);
    if (!previous || (Boolean(row.higher_is_better) ? Number(row.score) > Number(previous.score) : Number(row.score) < Number(previous.score))) best.set(key, row);
  }
  return {
    attempts,
    reminders,
    personalRecords: [...best.values()].map((row) => ({ challengeId: String(row.challenge_id), title: String(row.challenge_title), score: Number(row.score), maxScore: nullableNumber(row.max_score), unitLabel: String(row.unit_label) })),
  };
}
