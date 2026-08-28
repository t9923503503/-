import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { isCoachUuid } from './validators';
import type { normalizeCoachExerciseInput, normalizeCoachExercisePhotoInput, normalizeCoachExerciseVideoInput } from './exercise-validators';
import {
  COACH_EXERCISE_CATEGORIES,
  COACH_EXERCISE_INTENSITIES,
  COACH_EXERCISE_LEVELS,
  type CoachExerciseDetail,
  type CoachExerciseFilters,
  type CoachExerciseIssueLink,
  type CoachExercisePhoto,
  type CoachExerciseSkillLink,
  type CoachExerciseSummary,
  type CoachExerciseVideo,
  type CoachIssueOption,
} from './exercise-types';

type ExerciseInput = ReturnType<typeof normalizeCoachExerciseInput>;
type PhotoInput = ReturnType<typeof normalizeCoachExercisePhotoInput>;
type VideoInput = ReturnType<typeof normalizeCoachExerciseVideoInput>;

function asIso(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function mapSkill(row: Record<string, unknown>): CoachExerciseSkillLink {
  return {
    id: String(row.id ?? row.skill_id ?? ''),
    name: String(row.name ?? row.skill_name ?? ''),
    parentName: row.parent_name ? String(row.parent_name) : null,
    isPrimary: Boolean(row.is_primary),
  };
}

function mapIssue(row: Record<string, unknown>): CoachExerciseIssueLink {
  return {
    id: String(row.id ?? row.issue_id ?? ''),
    title: String(row.title ?? ''),
    skillName: row.skill_name ? String(row.skill_name) : null,
    activeAthleteCount: Number(row.active_athlete_count ?? 0),
  };
}

function mapPhoto(row: Record<string, unknown>): CoachExercisePhoto {
  return {
    id: String(row.id ?? ''),
    type: String(row.type ?? 'phase') as CoachExercisePhoto['type'],
    phaseIndex: row.phase_index == null ? null : Number(row.phase_index),
    title: String(row.title ?? ''),
    caption: String(row.caption ?? ''),
    relatedIssueId: row.related_issue_id ? String(row.related_issue_id) : null,
    relatedIssueTitle: row.related_issue_title ? String(row.related_issue_title) : null,
    storageUrl: String(row.storage_url ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: asIso(row.created_at),
  };
}

function mapVideo(row: Record<string, unknown>): CoachExerciseVideo {
  return {
    id: String(row.id ?? ''),
    platform: String(row.platform ?? 'other') as CoachExerciseVideo['platform'],
    url: String(row.url ?? ''),
    title: String(row.title ?? ''),
    author: String(row.author ?? ''),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    language: String(row.language ?? ''),
    timestampStartSec: Number(row.timestamp_start_sec ?? 0),
    coachNote: String(row.coach_note ?? ''),
    rating: row.rating == null ? null : Number(row.rating),
    tags: textArray(row.tags),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: asIso(row.created_at),
  };
}

function mapSummary(row: Record<string, unknown>): CoachExerciseSummary {
  const primarySkill = row.primary_skill_id ? mapSkill({
    id: row.primary_skill_id,
    name: row.primary_skill_name,
    parent_name: row.primary_skill_parent_name,
    is_primary: true,
  }) : null;
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    shortDescription: String(row.short_description ?? ''),
    goal: String(row.goal ?? ''),
    category: String(row.category ?? 'combined') as CoachExerciseSummary['category'],
    levelCode: String(row.level_code ?? 'all') as CoachExerciseSummary['levelCode'],
    playerMin: Number(row.player_min ?? 1),
    playerMax: Number(row.player_max ?? 1),
    courtCount: Number(row.court_count ?? 0),
    ballCount: Number(row.ball_count ?? 0),
    durationMinutes: Number(row.duration_minutes ?? 0),
    intensity: String(row.intensity ?? 'medium') as CoachExerciseSummary['intensity'],
    coachRequired: Boolean(row.coach_required),
    equipment: textArray(row.equipment),
    tags: textArray(row.tags),
    favorite: Boolean(row.favorite),
    recommended: Boolean(row.recommended),
    coachRating: row.coach_rating == null ? null : Number(row.coach_rating),
    archived: Boolean(row.archived_at),
    updatedAt: asIso(row.updated_at),
    primarySkill,
    skillCount: Number(row.skill_count ?? (primarySkill ? 1 : 0)),
    issueCount: Number(row.issue_count ?? 0),
    photoCount: Number(row.photo_count ?? 0),
    videoCount: Number(row.video_count ?? 0),
    coverPhotoUrl: String(row.cover_photo_url ?? ''),
  };
}

const EXERCISE_SELECT = `
  SELECT exercise.*,
         primary_skill.id::text AS primary_skill_id,
         primary_skill.name AS primary_skill_name,
         primary_parent.name AS primary_skill_parent_name,
         COALESCE(counts.skill_count, 0)::int AS skill_count,
         COALESCE(counts.issue_count, 0)::int AS issue_count,
         COALESCE(counts.photo_count, 0)::int AS photo_count,
         COALESCE(counts.video_count, 0)::int AS video_count,
         COALESCE(counts.cover_photo_url, '') AS cover_photo_url
    FROM coach_exercises exercise
    LEFT JOIN coach_exercise_skills primary_link
      ON primary_link.exercise_id = exercise.id AND primary_link.is_primary
    LEFT JOIN coach_skills primary_skill ON primary_skill.id = primary_link.skill_id
    LEFT JOIN coach_skills primary_parent ON primary_parent.id = primary_skill.parent_id
    LEFT JOIN LATERAL (
      SELECT (SELECT COUNT(*) FROM coach_exercise_skills link WHERE link.exercise_id = exercise.id) AS skill_count,
             (SELECT COUNT(*) FROM coach_exercise_issues link WHERE link.exercise_id = exercise.id) AS issue_count,
             (SELECT COUNT(*) FROM coach_exercise_photos photo WHERE photo.exercise_id = exercise.id) AS photo_count,
             (SELECT COUNT(*) FROM coach_exercise_videos video WHERE video.exercise_id = exercise.id) AS video_count,
             (SELECT photo.storage_url FROM coach_exercise_photos photo WHERE photo.exercise_id = exercise.id ORDER BY photo.sort_order, photo.created_at LIMIT 1) AS cover_photo_url
    ) counts ON true`;

export async function listCoachExercises(filters: CoachExerciseFilters = {}): Promise<CoachExerciseSummary[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (condition: string, value: unknown) => {
    values.push(value);
    conditions.push(condition.replaceAll('?', `$${values.length}`));
  };
  const query = String(filters.query ?? '').trim();
  if (query) add(`(exercise.title ILIKE ? OR exercise.short_description ILIKE ? OR exercise.goal ILIKE ? OR array_to_string(exercise.tags, ' ') ILIKE ?)`, `%${query}%`);
  if (COACH_EXERCISE_CATEGORIES.includes(String(filters.category) as (typeof COACH_EXERCISE_CATEGORIES)[number])) add('exercise.category = ?', filters.category);
  if (COACH_EXERCISE_LEVELS.includes(String(filters.level) as (typeof COACH_EXERCISE_LEVELS)[number])) add('exercise.level_code = ?', filters.level);
  if (COACH_EXERCISE_INTENSITIES.includes(String(filters.intensity) as (typeof COACH_EXERCISE_INTENSITIES)[number])) add('exercise.intensity = ?', filters.intensity);
  if (isCoachUuid(filters.skillId)) add('EXISTS (SELECT 1 FROM coach_exercise_skills filter_skill WHERE filter_skill.exercise_id = exercise.id AND filter_skill.skill_id = ?::uuid)', filters.skillId);
  if (isCoachUuid(filters.issueId)) add('EXISTS (SELECT 1 FROM coach_exercise_issues filter_issue WHERE filter_issue.exercise_id = exercise.id AND filter_issue.issue_id = ?::uuid)', filters.issueId);
  if (filters.players != null) add('exercise.player_min <= ? AND exercise.player_max >= ?', filters.players);
  if (filters.courtCount != null) add('exercise.court_count <= ?', filters.courtCount);
  if (filters.durationMax != null) add('exercise.duration_minutes <= ?', filters.durationMax);
  if (filters.coachRequired != null) add('exercise.coach_required = ?', filters.coachRequired);
  if (filters.noEquipment) conditions.push(`cardinality(exercise.equipment) = 0`);
  if (filters.favorite) conditions.push('exercise.favorite');
  if (!filters.includeArchived) conditions.push('exercise.archived_at IS NULL');

  const { rows } = await getPool().query(
    `${EXERCISE_SELECT}
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY exercise.favorite DESC, exercise.archived_at NULLS FIRST, exercise.updated_at DESC, exercise.title
     LIMIT 1000`,
    values,
  );
  return rows.map(mapSummary);
}

export async function listCoachIssueOptions(): Promise<CoachIssueOption[]> {
  const { rows } = await getPool().query(
    `SELECT issue.id::text, issue.title, issue.description, skill.name AS skill_name,
            COUNT(DISTINCT athlete_issue.player_id) FILTER (
              WHERE athlete_issue.status NOT IN ('resolved', 'archived')
            )::int AS active_athlete_count
       FROM coach_issues issue
       LEFT JOIN coach_skills skill ON skill.id = issue.skill_id
       LEFT JOIN coach_athlete_issues athlete_issue ON athlete_issue.issue_id = issue.id
      WHERE issue.archived_at IS NULL
      GROUP BY issue.id, issue.title, issue.description, skill.name
      ORDER BY active_athlete_count DESC, issue.title
      LIMIT 1000`,
  );
  return rows.map((row) => ({ ...mapIssue(row), description: String(row.description ?? '') }));
}

export async function getCoachExercise(exerciseId: string): Promise<CoachExerciseDetail | null> {
  const { rows } = await getPool().query(`${EXERCISE_SELECT} WHERE exercise.id = $1::uuid LIMIT 1`, [exerciseId]);
  if (!rows[0]) return null;
  const pool = getPool();
  const [skills, issues, photos, videos] = await Promise.all([
    pool.query(
      `SELECT skill.id::text, skill.name, parent.name AS parent_name, link.is_primary
         FROM coach_exercise_skills link
         JOIN coach_skills skill ON skill.id = link.skill_id
         LEFT JOIN coach_skills parent ON parent.id = skill.parent_id
        WHERE link.exercise_id = $1::uuid
        ORDER BY link.is_primary DESC, link.sort_order, skill.name`,
      [exerciseId],
    ),
    pool.query(
      `SELECT issue.id::text, issue.title, skill.name AS skill_name,
              COUNT(DISTINCT athlete_issue.player_id) FILTER (
                WHERE athlete_issue.status NOT IN ('resolved', 'archived')
              )::int AS active_athlete_count
         FROM coach_exercise_issues link
         JOIN coach_issues issue ON issue.id = link.issue_id
         LEFT JOIN coach_skills skill ON skill.id = issue.skill_id
         LEFT JOIN coach_athlete_issues athlete_issue ON athlete_issue.issue_id = issue.id
        WHERE link.exercise_id = $1::uuid
        GROUP BY issue.id, issue.title, skill.name
        ORDER BY active_athlete_count DESC, issue.title`,
      [exerciseId],
    ),
    pool.query(
      `SELECT photo.*, issue.title AS related_issue_title
         FROM coach_exercise_photos photo
         LEFT JOIN coach_issues issue ON issue.id = photo.related_issue_id
        WHERE photo.exercise_id = $1::uuid
        ORDER BY photo.sort_order, photo.phase_index NULLS LAST, photo.created_at`,
      [exerciseId],
    ),
    pool.query(
      `SELECT * FROM coach_exercise_videos
        WHERE exercise_id = $1::uuid
        ORDER BY sort_order, created_at`,
      [exerciseId],
    ),
  ]);
  const summary = mapSummary(rows[0]);
  return {
    ...summary,
    organization: String(rows[0].organization ?? ''),
    steps: textArray(rows[0].steps),
    coachCues: textArray(rows[0].coach_cues),
    typicalErrors: textArray(rows[0].typical_errors),
    progression: String(rows[0].progression ?? ''),
    simplification: String(rows[0].simplification ?? ''),
    complication: String(rows[0].complication ?? ''),
    variants: textArray(rows[0].variants),
    coachComment: String(rows[0].coach_comment ?? ''),
    skills: skills.rows.map(mapSkill),
    issues: issues.rows.map(mapIssue),
    photos: photos.rows.map(mapPhoto),
    videos: videos.rows.map(mapVideo),
  };
}

async function replaceExerciseLinks(client: PoolClient, exerciseId: string, input: ExerciseInput): Promise<void> {
  await client.query('DELETE FROM coach_exercise_skills WHERE exercise_id = $1::uuid', [exerciseId]);
  const primary = await client.query(
    `INSERT INTO coach_exercise_skills (exercise_id, skill_id, is_primary, sort_order)
     SELECT $1::uuid, skill.id, true, 0
       FROM coach_skills skill
      WHERE skill.id = $2::uuid AND skill.archived_at IS NULL
     RETURNING skill_id`,
    [exerciseId, input.primarySkillId],
  );
  if (!primary.rowCount) throw new Error('BadRequest: основной навык не найден');
  if (input.additionalSkillIds.length) {
    const additional = await client.query(
      `INSERT INTO coach_exercise_skills (exercise_id, skill_id, is_primary, sort_order)
       SELECT $1::uuid, skill.id, false, row_number() OVER (ORDER BY skill.name)::smallint
         FROM coach_skills skill
        WHERE skill.id = ANY($2::uuid[]) AND skill.archived_at IS NULL
       RETURNING skill_id`,
      [exerciseId, input.additionalSkillIds],
    );
    if (additional.rowCount !== input.additionalSkillIds.length) throw new Error('BadRequest: один из дополнительных навыков не найден');
  }

  await client.query('DELETE FROM coach_exercise_issues WHERE exercise_id = $1::uuid', [exerciseId]);
  if (input.issueIds.length) {
    const issues = await client.query(
      `INSERT INTO coach_exercise_issues (exercise_id, issue_id)
       SELECT $1::uuid, issue.id
         FROM coach_issues issue
        WHERE issue.id = ANY($2::uuid[]) AND issue.archived_at IS NULL
       RETURNING issue_id`,
      [exerciseId, input.issueIds],
    );
    if (issues.rowCount !== input.issueIds.length) throw new Error('BadRequest: одна из проблем не найдена');
  }
}

const EXERCISE_COLUMNS = `
  title, short_description, goal, category, level_code, player_min, player_max,
  court_count, ball_count, equipment, duration_minutes, intensity, coach_required,
  organization, steps, coach_cues, typical_errors, progression, simplification,
  complication, variants, tags, favorite, recommended, coach_rating, coach_comment`;

function exerciseValues(input: ExerciseInput): unknown[] {
  return [
    input.title, input.shortDescription, input.goal, input.category, input.levelCode,
    input.playerMin, input.playerMax, input.courtCount, input.ballCount, input.equipment,
    input.durationMinutes, input.intensity, input.coachRequired, input.organization,
    input.steps, input.coachCues, input.typicalErrors, input.progression, input.simplification,
    input.complication, input.variants, input.tags, input.favorite, input.recommended,
    input.coachRating, input.coachComment,
  ];
}

export async function createCoachExercise(input: ExerciseInput & { actorId: string }): Promise<CoachExerciseDetail> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const values = exerciseValues(input);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    const { rows } = await client.query(
      `INSERT INTO coach_exercises (${EXERCISE_COLUMNS}, archived_at, created_by_actor, updated_by_actor)
       VALUES (${placeholders}, CASE WHEN $27 THEN now() ELSE NULL END, $28, $28)
       RETURNING id::text`,
      [...values, input.archived, input.actorId],
    );
    const exerciseId = String(rows[0].id);
    await replaceExerciseLinks(client, exerciseId, input);
    await client.query('COMMIT');
    const exercise = await getCoachExercise(exerciseId);
    if (!exercise) throw new Error('NotFound');
    return exercise;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCoachExercise(exerciseId: string, input: ExerciseInput & { actorId: string }): Promise<CoachExerciseDetail> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT 1 FROM coach_exercises WHERE id = $1::uuid FOR UPDATE', [exerciseId]);
    if (!locked.rowCount) throw new Error('NotFound');
    const values = exerciseValues(input);
    const assignments = EXERCISE_COLUMNS.trim().split(/,\s*/).map((column, index) => `${column} = $${index + 2}`).join(', ');
    await client.query(
      `UPDATE coach_exercises
          SET ${assignments},
              archived_at = CASE WHEN $28 THEN COALESCE(archived_at, now()) ELSE NULL END,
              updated_by_actor = $29
        WHERE id = $1::uuid`,
      [exerciseId, ...values, input.archived, input.actorId],
    );
    await replaceExerciseLinks(client, exerciseId, input);
    await client.query('COMMIT');
    const exercise = await getCoachExercise(exerciseId);
    if (!exercise) throw new Error('NotFound');
    return exercise;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addCoachExercisePhoto(exerciseId: string, input: PhotoInput & { actorId: string }): Promise<CoachExercisePhoto> {
  const { rows } = await getPool().query(
    `INSERT INTO coach_exercise_photos
      (exercise_id, type, phase_index, title, caption, related_issue_id, storage_url, sort_order, created_by_actor)
     SELECT exercise.id, $2, $3, $4, $5, $6::uuid, $7, $8, $9
       FROM coach_exercises exercise
      WHERE exercise.id = $1::uuid
        AND ($6::text IS NULL OR EXISTS (
          SELECT 1 FROM coach_exercise_issues link
           WHERE link.exercise_id = exercise.id AND link.issue_id = $6::uuid
        ))
     RETURNING *`,
    [exerciseId, input.type, input.phaseIndex, input.title, input.caption, input.relatedIssueId, input.storageUrl, input.sortOrder, input.actorId],
  );
  if (!rows[0]) throw new Error('BadRequest: упражнение или связанная проблема не найдены');
  const issue = input.relatedIssueId
    ? await getPool().query('SELECT title FROM coach_issues WHERE id = $1::uuid', [input.relatedIssueId])
    : { rows: [] };
  return mapPhoto({ ...rows[0], related_issue_title: issue.rows[0]?.title });
}

export async function removeCoachExercisePhoto(exerciseId: string, photoId: string): Promise<boolean> {
  const result = await getPool().query(
    'DELETE FROM coach_exercise_photos WHERE id = $1::uuid AND exercise_id = $2::uuid',
    [photoId, exerciseId],
  );
  return Boolean(result.rowCount);
}

export async function addCoachExerciseVideo(exerciseId: string, input: VideoInput & { actorId: string }): Promise<CoachExerciseVideo> {
  const { rows } = await getPool().query(
    `INSERT INTO coach_exercise_videos
      (exercise_id, platform, url, title, author, duration_seconds, language,
       timestamp_start_sec, coach_note, rating, tags, sort_order, created_by_actor)
     SELECT exercise.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
       FROM coach_exercises exercise
      WHERE exercise.id = $1::uuid
     RETURNING *`,
    [exerciseId, input.platform, input.url, input.title, input.author, input.durationSeconds, input.language, input.timestampStartSec, input.coachNote, input.rating, input.tags, input.sortOrder, input.actorId],
  );
  if (!rows[0]) throw new Error('NotFound');
  return mapVideo(rows[0]);
}

export async function removeCoachExerciseVideo(exerciseId: string, videoId: string): Promise<boolean> {
  const result = await getPool().query(
    'DELETE FROM coach_exercise_videos WHERE id = $1::uuid AND exercise_id = $2::uuid',
    [videoId, exerciseId],
  );
  return Boolean(result.rowCount);
}
