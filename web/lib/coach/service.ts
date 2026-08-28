import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { sanitizeServerImageUrl } from '@/lib/server-image-url';
import type {
  CoachAthleteDetail,
  CoachAthleteIssue,
  CoachAthleteSummary,
  CoachCandidate,
  CoachDashboard,
  CoachSkill,
  CoachSkillEvaluation,
} from './types';

function asIso(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function asDate(value: unknown): string {
  const iso = asIso(value);
  return iso ? iso.slice(0, 10) : '';
}

function jsonArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapAthleteSummary(row: Record<string, unknown>): CoachAthleteSummary {
  return {
    playerId: String(row.player_id ?? ''),
    name: String(row.name ?? ''),
    gender: String(row.gender ?? 'M') === 'W' ? 'W' : 'M',
    photoUrl: sanitizeServerImageUrl(row.photo_url),
    playerStatus: String(row.player_status ?? 'active'),
    publicSkillLevel: row.public_skill_level ? String(row.public_skill_level) : null,
    tournamentsPlayed: Number(row.tournaments_played ?? 0),
    rating: Number(row.rating ?? 0),
    levelCode: String(row.level_code ?? 'medium') as CoachAthleteSummary['levelCode'],
    status: String(row.coach_status ?? 'active') as CoachAthleteSummary['status'],
    joinedAt: asDate(row.joined_at),
    goals: String(row.goals ?? ''),
    limitations: String(row.limitations ?? ''),
    evaluationCount: Number(row.evaluation_count ?? 0),
    activeIssueCount: Number(row.active_issue_count ?? 0),
    criticalIssueCount: Number(row.critical_issue_count ?? 0),
    lastEvaluatedAt: row.last_evaluated_at ? asIso(row.last_evaluated_at) : null,
    topIssues: jsonArray(row.top_issues).map((issue) => ({
      id: String(issue.id ?? ''),
      title: String(issue.title ?? ''),
      priority: Number(issue.priority ?? 0),
    })),
  };
}

function mapEvaluation(row: Record<string, unknown>): CoachSkillEvaluation {
  return {
    id: String(row.id ?? ''),
    skillId: String(row.skill_id ?? ''),
    skillName: String(row.skill_name ?? ''),
    parentName: row.parent_name ? String(row.parent_name) : null,
    score: Number(row.score ?? 0),
    confidence: Number(row.confidence ?? 0),
    source: String(row.source ?? 'coach') as CoachSkillEvaluation['source'],
    coachComment: String(row.coach_comment ?? ''),
    evaluatedAt: asIso(row.evaluated_at),
    evaluatedByActor: String(row.evaluated_by_actor ?? ''),
  };
}

function mapIssue(row: Record<string, unknown>): CoachAthleteIssue {
  return {
    id: String(row.id ?? ''),
    issueId: String(row.issue_id ?? ''),
    skillId: row.skill_id ? String(row.skill_id) : null,
    skillName: row.skill_name ? String(row.skill_name) : null,
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    priority: Number(row.priority ?? 0),
    status: String(row.status ?? 'active') as CoachAthleteIssue['status'],
    source: String(row.source ?? 'coach') as CoachAthleteIssue['source'],
    confidence: Number(row.confidence ?? 0),
    coachComment: String(row.coach_comment ?? ''),
    detectedAt: asIso(row.detected_at),
    resolvedAt: row.resolved_at ? asIso(row.resolved_at) : null,
    lastWorkedAt: row.last_worked_at ? asIso(row.last_worked_at) : null,
  };
}

const ATHLETE_SELECT = `
  SELECT profile.player_id::text,
         profile.level_code,
         profile.status AS coach_status,
         profile.joined_at,
         profile.goals,
         profile.limitations,
         player.name,
         player.gender,
         player.status AS player_status,
         COALESCE(player.photo_url, '') AS photo_url,
         player.skill_level AS public_skill_level,
         COALESCE(player.tournaments_played, 0)::int AS tournaments_played,
         CASE WHEN player.gender = 'W' THEN COALESCE(player.rating_w, 0)
              ELSE COALESCE(player.rating_m, 0) END AS rating,
         COALESCE(evaluations.evaluation_count, 0)::int AS evaluation_count,
         evaluations.last_evaluated_at,
         COALESCE(issues.active_issue_count, 0)::int AS active_issue_count,
         COALESCE(issues.critical_issue_count, 0)::int AS critical_issue_count,
         COALESCE(issues.top_issues, '[]'::jsonb) AS top_issues
    FROM coach_athlete_profiles profile
    JOIN players player ON player.id = profile.player_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS evaluation_count, MAX(evaluated_at) AS last_evaluated_at
        FROM coach_skill_evaluations evaluation
       WHERE evaluation.player_id = profile.player_id
    ) evaluations ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE athlete_issue.status NOT IN ('resolved', 'archived'))::int AS active_issue_count,
             COUNT(*) FILTER (WHERE athlete_issue.status NOT IN ('resolved', 'archived') AND athlete_issue.priority = 5)::int AS critical_issue_count,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object('id', ranked.id, 'title', ranked.title, 'priority', ranked.priority)
                                ORDER BY ranked.priority DESC, ranked.detected_at DESC)
                 FROM (
                   SELECT open_issue.id, issue.title, open_issue.priority, open_issue.detected_at
                     FROM coach_athlete_issues open_issue
                     JOIN coach_issues issue ON issue.id = open_issue.issue_id
                    WHERE open_issue.player_id = profile.player_id
                      AND open_issue.status NOT IN ('resolved', 'archived')
                    ORDER BY open_issue.priority DESC, open_issue.detected_at DESC
                    LIMIT 3
                 ) ranked
             ), '[]'::jsonb) AS top_issues
        FROM coach_athlete_issues athlete_issue
       WHERE athlete_issue.player_id = profile.player_id
    ) issues ON true`;

export async function listCoachAthletes(input: {
  query?: string;
  level?: string;
  status?: string;
} = {}): Promise<CoachAthleteSummary[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (condition: string, value: unknown) => {
    values.push(value);
    conditions.push(condition.replace('?', `$${values.length}`));
  };
  const query = String(input.query ?? '').trim();
  if (query) add(`player.name ILIKE ?`, `%${query}%`);
  if (['light', 'medium', 'hard'].includes(String(input.level))) add(`profile.level_code = ?`, input.level);
  if (['active', 'paused', 'injured', 'archived'].includes(String(input.status))) add(`profile.status = ?`, input.status);
  const { rows } = await getPool().query(
    `${ATHLETE_SELECT}
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY CASE profile.status WHEN 'active' THEN 0 WHEN 'injured' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
               player.name ASC
      LIMIT 500`,
    values,
  );
  return rows.map(mapAthleteSummary);
}

async function getCoachAthleteSummary(playerId: string): Promise<CoachAthleteSummary | null> {
  const { rows } = await getPool().query(`${ATHLETE_SELECT} WHERE profile.player_id = $1::uuid LIMIT 1`, [playerId]);
  return rows[0] ? mapAthleteSummary(rows[0]) : null;
}

export async function listCoachCandidates(query = ''): Promise<CoachCandidate[]> {
  const term = String(query || '').trim();
  const { rows } = await getPool().query(
    `SELECT player.id::text AS player_id, player.name, player.gender,
            COALESCE(player.photo_url, '') AS photo_url,
            player.skill_level, COALESCE(player.tournaments_played, 0)::int AS tournaments_played
       FROM players player
      WHERE player.status <> 'temporary'
        AND NOT EXISTS (SELECT 1 FROM coach_athlete_profiles profile WHERE profile.player_id = player.id)
        AND ($1 = '' OR player.name ILIKE '%' || $1 || '%')
      ORDER BY player.name ASC
      LIMIT 300`,
    [term],
  );
  return rows.map((row) => ({
    playerId: String(row.player_id),
    name: String(row.name),
    gender: String(row.gender) === 'W' ? 'W' : 'M',
    photoUrl: sanitizeServerImageUrl(row.photo_url),
    skillLevel: row.skill_level ? String(row.skill_level) : null,
    tournamentsPlayed: Number(row.tournaments_played ?? 0),
  }));
}

export async function addCoachAthlete(input: {
  playerId: string;
  levelCode: string;
  status: string;
  joinedAt: string;
  goals: string;
  limitations: string;
  actorId: string;
}): Promise<CoachAthleteSummary> {
  const { rows } = await getPool().query(
    `INSERT INTO coach_athlete_profiles
      (player_id, level_code, status, joined_at, goals, limitations, created_by_actor, archived_at)
     SELECT player.id, $2, $3, COALESCE(NULLIF($4, '')::date, CURRENT_DATE), $5, $6, $7,
            CASE WHEN $3 = 'archived' THEN now() ELSE NULL END
       FROM players player
      WHERE player.id = $1::uuid
     ON CONFLICT (player_id) DO UPDATE
       SET level_code = EXCLUDED.level_code,
           status = EXCLUDED.status,
           joined_at = EXCLUDED.joined_at,
           goals = EXCLUDED.goals,
           limitations = EXCLUDED.limitations,
           archived_at = CASE WHEN EXCLUDED.status = 'archived' THEN COALESCE(coach_athlete_profiles.archived_at, now()) ELSE NULL END
     RETURNING player_id`,
    [input.playerId, input.levelCode, input.status, input.joinedAt, input.goals, input.limitations, input.actorId],
  );
  if (!rows[0]) throw new Error('BadRequest: игрок не найден');
  const athlete = await getCoachAthleteSummary(input.playerId);
  if (!athlete) throw new Error('NotFound');
  return athlete;
}

export async function updateCoachAthlete(input: {
  playerId: string;
  levelCode: string;
  status: string;
  joinedAt: string;
  goals: string;
  limitations: string;
}): Promise<CoachAthleteSummary> {
  const { rowCount } = await getPool().query(
    `UPDATE coach_athlete_profiles
        SET level_code = $2,
            status = $3,
            joined_at = COALESCE(NULLIF($4, '')::date, joined_at),
            goals = $5,
            limitations = $6,
            archived_at = CASE WHEN $3 = 'archived' THEN COALESCE(archived_at, now()) ELSE NULL END
      WHERE player_id = $1::uuid`,
    [input.playerId, input.levelCode, input.status, input.joinedAt, input.goals, input.limitations],
  );
  if (!rowCount) throw new Error('NotFound');
  const athlete = await getCoachAthleteSummary(input.playerId);
  if (!athlete) throw new Error('NotFound');
  return athlete;
}

export async function listCoachSkills(): Promise<CoachSkill[]> {
  const { rows } = await getPool().query(
    `SELECT skill.id::text, skill.code, skill.name, skill.parent_id::text,
            parent.name AS parent_name, skill.sort_order
       FROM coach_skills skill
       LEFT JOIN coach_skills parent ON parent.id = skill.parent_id
      WHERE skill.archived_at IS NULL
      ORDER BY COALESCE(parent.sort_order, skill.sort_order), skill.parent_id NULLS FIRST, skill.sort_order, skill.name`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    parentId: row.parent_id ? String(row.parent_id) : null,
    parentName: row.parent_name ? String(row.parent_name) : null,
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

export async function getCoachAthleteDetail(playerId: string): Promise<CoachAthleteDetail | null> {
  const athlete = await getCoachAthleteSummary(playerId);
  if (!athlete) return null;
  const pool = getPool();
  const [evaluations, issues] = await Promise.all([
    pool.query(
      `SELECT evaluation.id::text, evaluation.skill_id::text, skill.name AS skill_name,
              parent.name AS parent_name, evaluation.score, evaluation.confidence,
              evaluation.source, evaluation.coach_comment, evaluation.evaluated_at,
              evaluation.evaluated_by_actor
         FROM coach_skill_evaluations evaluation
         JOIN coach_skills skill ON skill.id = evaluation.skill_id
         LEFT JOIN coach_skills parent ON parent.id = skill.parent_id
        WHERE evaluation.player_id = $1::uuid
        ORDER BY evaluation.evaluated_at DESC, evaluation.id DESC
        LIMIT 500`,
      [playerId],
    ),
    pool.query(
      `SELECT athlete_issue.id::text, athlete_issue.issue_id::text,
              issue.skill_id::text, skill.name AS skill_name, issue.title, issue.description,
              athlete_issue.priority, athlete_issue.status, athlete_issue.source,
              athlete_issue.confidence, athlete_issue.coach_comment,
              athlete_issue.detected_at, athlete_issue.resolved_at, athlete_issue.last_worked_at
         FROM coach_athlete_issues athlete_issue
         JOIN coach_issues issue ON issue.id = athlete_issue.issue_id
         LEFT JOIN coach_skills skill ON skill.id = issue.skill_id
        WHERE athlete_issue.player_id = $1::uuid
        ORDER BY CASE WHEN athlete_issue.status IN ('resolved', 'archived') THEN 1 ELSE 0 END,
                 athlete_issue.priority DESC, athlete_issue.detected_at DESC
        LIMIT 300`,
      [playerId],
    ),
  ]);
  return {
    ...athlete,
    evaluations: evaluations.rows.map(mapEvaluation),
    issues: issues.rows.map(mapIssue),
  };
}

export async function addSkillEvaluation(input: {
  playerId: string;
  skillId: string;
  score: number;
  confidence: number;
  source: string;
  coachComment: string;
  evaluatedAt: string;
  actorId: string;
}): Promise<CoachSkillEvaluation> {
  const { rows } = await getPool().query(
    `INSERT INTO coach_skill_evaluations
      (player_id, skill_id, score, confidence, source, coach_comment, evaluated_at, evaluated_by_actor)
     SELECT profile.player_id, skill.id, $3, $4, $5, $6,
            COALESCE(NULLIF($7, '')::timestamptz, now()), $8
       FROM coach_athlete_profiles profile
       JOIN coach_skills skill ON skill.id = $2::uuid AND skill.archived_at IS NULL
      WHERE profile.player_id = $1::uuid AND profile.status <> 'archived'
     RETURNING id::text, skill_id::text, score, confidence, source, coach_comment, evaluated_at, evaluated_by_actor`,
    [input.playerId, input.skillId, input.score, input.confidence, input.source, input.coachComment, input.evaluatedAt, input.actorId],
  );
  if (!rows[0]) throw new Error('BadRequest: ученик или навык не найден');
  const skill = await getPool().query(
    `SELECT skill.name AS skill_name, parent.name AS parent_name
       FROM coach_skills skill LEFT JOIN coach_skills parent ON parent.id = skill.parent_id
      WHERE skill.id = $1`,
    [input.skillId],
  );
  return mapEvaluation({ ...rows[0], ...skill.rows[0] });
}

async function findOrCreateIssue(client: PoolClient, input: {
  skillId: string | null;
  title: string;
  description: string;
  actorId: string;
}): Promise<string> {
  const inserted = await client.query(
    `INSERT INTO coach_issues (skill_id, title, description, created_by_actor)
     SELECT $1::uuid, $2, $3, $4
      WHERE $1::text IS NULL OR EXISTS (SELECT 1 FROM coach_skills WHERE id = $1::uuid AND archived_at IS NULL)
     ON CONFLICT DO NOTHING
     RETURNING id::text`,
    [input.skillId, input.title, input.description, input.actorId],
  );
  if (inserted.rows[0]) return String(inserted.rows[0].id);
  const existing = await client.query(
    `SELECT id::text
       FROM coach_issues
      WHERE skill_id IS NOT DISTINCT FROM $1::uuid
        AND lower(btrim(title)) = lower(btrim($2))
        AND archived_at IS NULL
      LIMIT 1`,
    [input.skillId, input.title],
  );
  if (!existing.rows[0]) throw new Error('BadRequest: навык не найден');
  return String(existing.rows[0].id);
}

export async function addAthleteIssue(input: {
  playerId: string;
  skillId: string | null;
  title: string;
  description: string;
  priority: number;
  status: string;
  source: string;
  confidence: number;
  coachComment: string;
  actorId: string;
}): Promise<CoachAthleteIssue> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const athlete = await client.query(
      `SELECT 1 FROM coach_athlete_profiles WHERE player_id = $1::uuid AND status <> 'archived' FOR UPDATE`,
      [input.playerId],
    );
    if (!athlete.rows[0]) throw new Error('BadRequest: ученик не найден');
    const issueId = await findOrCreateIssue(client, input);
    const result = await client.query(
      `INSERT INTO coach_athlete_issues
        (player_id, issue_id, priority, status, source, confidence, coach_comment,
         resolved_at, created_by_actor, updated_by_actor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $4 = 'resolved' THEN now() ELSE NULL END,$8,$8)
       ON CONFLICT (player_id, issue_id) WHERE status NOT IN ('resolved', 'archived')
       DO UPDATE SET priority = EXCLUDED.priority,
                     status = EXCLUDED.status,
                     source = EXCLUDED.source,
                     confidence = EXCLUDED.confidence,
                     coach_comment = EXCLUDED.coach_comment,
                     resolved_at = CASE WHEN EXCLUDED.status = 'resolved' THEN now() ELSE NULL END,
                     updated_by_actor = EXCLUDED.updated_by_actor
       RETURNING *`,
      [input.playerId, issueId, input.priority, input.status, input.source, input.confidence, input.coachComment, input.actorId],
    );
    const row = result.rows[0];
    await client.query(
      `INSERT INTO coach_athlete_issue_history (athlete_issue_id, action, after_state, actor_id)
       VALUES ($1, 'created', $2::jsonb, $3)`,
      [row.id, JSON.stringify(row), input.actorId],
    );
    await client.query('COMMIT');
    const detail = await getCoachAthleteDetail(input.playerId);
    const created = detail?.issues.find((issue) => issue.id === String(row.id));
    if (!created) throw new Error('NotFound');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAthleteIssue(input: {
  playerId: string;
  athleteIssueId: string;
  status: string;
  priority: number;
  coachComment: string;
  markWorked: boolean;
  actorId: string;
}): Promise<CoachAthleteIssue> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      `SELECT * FROM coach_athlete_issues WHERE id = $1::uuid AND player_id = $2::uuid FOR UPDATE`,
      [input.athleteIssueId, input.playerId],
    );
    if (!before.rows[0]) throw new Error('NotFound');
    const updated = await client.query(
      `UPDATE coach_athlete_issues
          SET status = $3,
              priority = $4,
              coach_comment = $5,
              last_worked_at = CASE WHEN $6 THEN now() ELSE last_worked_at END,
              resolved_at = CASE WHEN $3 = 'resolved' THEN COALESCE(resolved_at, now()) ELSE NULL END,
              updated_by_actor = $7
        WHERE id = $1::uuid AND player_id = $2::uuid
        RETURNING *`,
      [input.athleteIssueId, input.playerId, input.status, input.priority, input.coachComment, input.markWorked, input.actorId],
    );
    const action = input.markWorked ? 'worked' : before.rows[0].status !== input.status ? 'status_changed' : before.rows[0].priority !== input.priority ? 'priority_changed' : 'comment_changed';
    await client.query(
      `INSERT INTO coach_athlete_issue_history (athlete_issue_id, action, before_state, after_state, actor_id)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)`,
      [input.athleteIssueId, action, JSON.stringify(before.rows[0]), JSON.stringify(updated.rows[0]), input.actorId],
    );
    await client.query('COMMIT');
    const detail = await getCoachAthleteDetail(input.playerId);
    const issue = detail?.issues.find((item) => item.id === input.athleteIssueId);
    if (!issue) throw new Error('NotFound');
    return issue;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getCoachDashboard(): Promise<CoachDashboard> {
  const pool = getPool();
  const [totals, frequent, attention] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE profile.status <> 'archived')::int AS athlete_count,
              COUNT(*) FILTER (WHERE profile.status <> 'archived' AND NOT EXISTS (
                SELECT 1 FROM coach_skill_evaluations evaluation WHERE evaluation.player_id = profile.player_id
              ))::int AS unevaluated_count,
              (SELECT COUNT(*)::int
                 FROM coach_athlete_issues athlete_issue
                 JOIN coach_athlete_profiles issue_profile ON issue_profile.player_id = athlete_issue.player_id
                WHERE athlete_issue.status NOT IN ('resolved', 'archived') AND issue_profile.status <> 'archived') AS active_issue_count,
              (SELECT COUNT(*)::int
                 FROM coach_athlete_issues athlete_issue
                 JOIN coach_athlete_profiles issue_profile ON issue_profile.player_id = athlete_issue.player_id
                WHERE athlete_issue.status NOT IN ('resolved', 'archived') AND athlete_issue.priority = 5 AND issue_profile.status <> 'archived') AS critical_issue_count
         FROM coach_athlete_profiles profile`,
    ),
    pool.query(
      `SELECT issue.title, COUNT(DISTINCT athlete_issue.player_id)::int AS athlete_count,
              MAX(athlete_issue.priority)::int AS max_priority
         FROM coach_athlete_issues athlete_issue
         JOIN coach_issues issue ON issue.id = athlete_issue.issue_id
         JOIN coach_athlete_profiles profile ON profile.player_id = athlete_issue.player_id
        WHERE athlete_issue.status NOT IN ('resolved', 'archived')
          AND profile.status <> 'archived'
        GROUP BY issue.id, issue.title
        ORDER BY max_priority DESC, athlete_count DESC, issue.title ASC
        LIMIT 6`,
    ),
    pool.query(
      `SELECT profile.player_id::text, player.name, COALESCE(player.photo_url, '') AS photo_url,
              critical.title AS critical_title, critical.priority,
              last_eval.last_evaluated_at
         FROM coach_athlete_profiles profile
         JOIN players player ON player.id = profile.player_id
         LEFT JOIN LATERAL (
           SELECT issue.title, athlete_issue.priority
             FROM coach_athlete_issues athlete_issue
             JOIN coach_issues issue ON issue.id = athlete_issue.issue_id
            WHERE athlete_issue.player_id = profile.player_id
              AND athlete_issue.status NOT IN ('resolved', 'archived')
            ORDER BY athlete_issue.priority DESC, athlete_issue.detected_at DESC
            LIMIT 1
         ) critical ON true
         LEFT JOIN LATERAL (
           SELECT MAX(evaluated_at) AS last_evaluated_at
             FROM coach_skill_evaluations evaluation
            WHERE evaluation.player_id = profile.player_id
         ) last_eval ON true
        WHERE profile.status <> 'archived'
          AND (critical.priority >= 4 OR last_eval.last_evaluated_at IS NULL OR last_eval.last_evaluated_at < now() - interval '21 days')
        ORDER BY COALESCE(critical.priority, 0) DESC, last_eval.last_evaluated_at ASC NULLS FIRST, player.name
        LIMIT 8`,
    ),
  ]);
  const total = totals.rows[0] ?? {};
  return {
    athleteCount: Number(total.athlete_count ?? 0),
    activeIssueCount: Number(total.active_issue_count ?? 0),
    criticalIssueCount: Number(total.critical_issue_count ?? 0),
    unevaluatedCount: Number(total.unevaluated_count ?? 0),
    frequentIssues: frequent.rows.map((row) => ({
      title: String(row.title),
      athleteCount: Number(row.athlete_count ?? 0),
      maxPriority: Number(row.max_priority ?? 0),
    })),
    attention: attention.rows.map((row) => {
      const critical = Number(row.priority ?? 0) >= 4;
      const evaluatedAt = row.last_evaluated_at ? new Date(row.last_evaluated_at) : null;
      const days = evaluatedAt ? Math.max(0, Math.floor((Date.now() - evaluatedAt.getTime()) / 86_400_000)) : null;
      return {
        playerId: String(row.player_id),
        name: String(row.name),
        photoUrl: sanitizeServerImageUrl(row.photo_url),
        reason: critical
          ? `${String(row.critical_title || 'Проблема')} · приоритет ${Number(row.priority)}/5`
          : days == null ? 'Навыки ещё не оценивались' : `Нет оценки навыков ${days} дн.`,
        severity: critical ? 'critical' as const : 'important' as const,
      };
    }),
  };
}
