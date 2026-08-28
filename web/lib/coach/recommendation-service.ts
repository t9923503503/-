import { getPool } from '@/lib/db';
import { buildDeterministicRecommendation } from './recommendation-engine';
import type {
  CoachRecommendationCandidate,
  CoachRecommendationContext,
  CoachRecommendationInput,
  CoachRecommendationResult,
} from './recommendation-types';
import { ensureCoachWorkoutPlan, getCoachWorkoutPlan } from './workout-service';
import type { CoachWorkoutPlan } from './workout-types';

const ALGORITHM_VERSION = 'deterministic-v1';

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function inferredLevel(rows: Array<Record<string, unknown>>): 'light' | 'medium' | 'hard' {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const level = String(row.level_code ?? '');
    if (['light', 'medium', 'hard'].includes(level)) counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  return ([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'medium') as 'light' | 'medium' | 'hard';
}

export async function getCoachRecommendationContext(sessionId: string): Promise<CoachRecommendationContext | null> {
  const pool = getPool();
  const [sessionResult, levelsResult, skillsResult] = await Promise.all([
    pool.query(
      `SELECT starts_at, ends_at, court_count
         FROM coach_training_sessions
        WHERE id = $1::uuid`,
      [sessionId],
    ),
    pool.query(
      `SELECT profile.level_code
         FROM coach_training_participants participant
         JOIN coach_athlete_profiles profile ON profile.player_id = participant.player_id
        WHERE participant.training_session_id = $1::uuid
          AND participant.actual_attendance <> 'absent'`,
      [sessionId],
    ),
    pool.query(
      `SELECT skill.id::text, skill.name, parent.name AS parent_name,
              (COUNT(DISTINCT participant.id) FILTER (WHERE athlete_issue.id IS NOT NULL))::int AS active_athlete_count,
              (COUNT(DISTINCT participant.id) FILTER (WHERE athlete_issue.priority >= 4))::int AS high_priority_count
         FROM coach_skills skill
         LEFT JOIN coach_skills parent ON parent.id = skill.parent_id
         LEFT JOIN coach_issues issue ON issue.skill_id = skill.id AND issue.archived_at IS NULL
         LEFT JOIN coach_athlete_issues athlete_issue ON athlete_issue.issue_id = issue.id
              AND athlete_issue.status IN ('suggested', 'active', 'improving', 'monitoring')
         LEFT JOIN coach_training_participants participant ON participant.player_id = athlete_issue.player_id
              AND participant.training_session_id = $1::uuid
              AND participant.actual_attendance <> 'absent'
        WHERE skill.archived_at IS NULL
        GROUP BY skill.id, skill.name, skill.sort_order, parent.name
        ORDER BY COUNT(DISTINCT participant.id) FILTER (WHERE athlete_issue.id IS NOT NULL) DESC,
                 skill.sort_order, skill.name`,
      [sessionId],
    ),
  ]);
  const session = sessionResult.rows[0];
  if (!session) return null;
  const durationMs = new Date(String(session.ends_at)).getTime() - new Date(String(session.starts_at)).getTime();
  const defaultDurationMinutes = Math.min(360, Math.max(15, Math.round(durationMs / 60_000) || 90));
  return {
    defaultDurationMinutes,
    defaultCourtCount: Math.min(20, Math.max(1, Number(session.court_count ?? 1))),
    inferredLevel: inferredLevel(levelsResult.rows),
    skills: skillsResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      parentName: row.parent_name ? String(row.parent_name) : null,
      activeAthleteCount: Number(row.active_athlete_count ?? 0),
      highPriorityCount: Number(row.high_priority_count ?? 0),
    })),
  };
}

async function loadRecommendationCandidates(sessionId: string, input: CoachRecommendationInput): Promise<{
  candidates: CoachRecommendationCandidate[];
  inferredLevel: 'light' | 'medium' | 'hard';
}> {
  const pool = getPool();
  const participantsResult = await pool.query(
    `SELECT participant.id::text, participant.player_id::text, profile.level_code
       FROM coach_training_participants participant
       LEFT JOIN coach_athlete_profiles profile ON profile.player_id = participant.player_id
      WHERE participant.training_session_id = $1::uuid
        AND participant.id = ANY($2::uuid[])
        AND participant.actual_attendance <> 'absent'`,
    [sessionId, input.participantIds],
  );
  if (participantsResult.rowCount !== input.participantIds.length) {
    throw new Error('BadRequest: один из участников не входит в доступный состав этой тренировки');
  }
  if (input.focusSkillId) {
    const focus = await pool.query('SELECT 1 FROM coach_skills WHERE id = $1::uuid AND archived_at IS NULL', [input.focusSkillId]);
    if (!focus.rowCount) throw new Error('BadRequest: выбранный фокус не найден');
  }
  const [candidateResult, recentSessionsResult, lastUsageResult, categoryUsageResult] = await Promise.all([
    pool.query(
      `WITH selected AS (
         SELECT participant.id, participant.player_id
           FROM coach_training_participants participant
          WHERE participant.training_session_id = $1::uuid
            AND participant.id = ANY($2::uuid[])
       )
       SELECT exercise.id::text, exercise.title, exercise.category, exercise.level_code,
              exercise.intensity, exercise.player_min, exercise.player_max, exercise.court_count,
              exercise.duration_minutes, exercise.favorite, exercise.recommended, exercise.coach_rating,
              skill_stats.skill_ids, skill_stats.primary_skill_id, skill_stats.primary_skill_name,
              issue_stats.matched_participant_ids, issue_stats.high_priority_count, issue_stats.priority_weight
         FROM coach_exercises exercise
         LEFT JOIN LATERAL (
           SELECT COALESCE(array_agg(link.skill_id::text ORDER BY link.sort_order, link.skill_id), '{}') AS skill_ids,
                  max(link.skill_id::text) FILTER (WHERE link.is_primary) AS primary_skill_id,
                  max(skill.name) FILTER (WHERE link.is_primary) AS primary_skill_name
             FROM coach_exercise_skills link
             JOIN coach_skills skill ON skill.id = link.skill_id
            WHERE link.exercise_id = exercise.id
         ) skill_stats ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(array_agg(DISTINCT selected.id::text), '{}') AS matched_participant_ids,
                  (COUNT(DISTINCT selected.id) FILTER (WHERE athlete_issue.priority >= 4))::int AS high_priority_count,
                  COALESCE(SUM(athlete_issue.priority), 0)::int AS priority_weight
             FROM selected
             JOIN coach_athlete_issues athlete_issue ON athlete_issue.player_id = selected.player_id
                  AND athlete_issue.status IN ('suggested', 'active', 'improving', 'monitoring')
             JOIN coach_issues issue ON issue.id = athlete_issue.issue_id AND issue.archived_at IS NULL
             LEFT JOIN coach_skills issue_skill ON issue_skill.id = issue.skill_id
            WHERE EXISTS (
                    SELECT 1 FROM coach_exercise_issues exact_link
                     WHERE exact_link.exercise_id = exercise.id AND exact_link.issue_id = issue.id
                  )
               OR EXISTS (
                    SELECT 1
                      FROM coach_exercise_skills exercise_skill_link
                      JOIN coach_skills exercise_skill ON exercise_skill.id = exercise_skill_link.skill_id
                     WHERE exercise_skill_link.exercise_id = exercise.id
                       AND (exercise_skill.id = issue.skill_id
                         OR exercise_skill.parent_id = issue.skill_id
                         OR issue_skill.parent_id = exercise_skill.id)
                  )
         ) issue_stats ON true
        WHERE exercise.archived_at IS NULL
        ORDER BY exercise.title, exercise.id`,
      [sessionId, input.participantIds],
    ),
    pool.query(
      `WITH selected_players AS (
         SELECT DISTINCT player_id
           FROM coach_training_participants
          WHERE training_session_id = $1::uuid
            AND id = ANY($2::uuid[])
            AND player_id IS NOT NULL
       )
       SELECT previous.id::text, previous.starts_at
         FROM coach_training_sessions previous
        WHERE previous.id <> $1::uuid
          AND previous.status = 'completed'
          AND EXISTS (
            SELECT 1
              FROM coach_exercise_executions execution
              JOIN coach_exercise_execution_athletes assignment ON assignment.execution_id = execution.id
             WHERE execution.training_session_id = previous.id
               AND execution.status = 'completed'
               AND assignment.player_id IN (SELECT player_id FROM selected_players)
          )
        ORDER BY previous.starts_at DESC, previous.id DESC
        LIMIT 5`,
      [sessionId, input.participantIds],
    ),
    pool.query(
      `WITH selected_players AS (
         SELECT DISTINCT player_id
           FROM coach_training_participants
          WHERE training_session_id = $1::uuid AND id = ANY($2::uuid[]) AND player_id IS NOT NULL
       )
       SELECT execution.exercise_id::text, max(previous.starts_at) AS last_used_at
         FROM coach_exercise_executions execution
         JOIN coach_training_sessions previous ON previous.id = execution.training_session_id
        WHERE execution.training_session_id <> $1::uuid
          AND execution.status = 'completed'
          AND EXISTS (
            SELECT 1 FROM coach_exercise_execution_athletes assignment
             WHERE assignment.execution_id = execution.id
               AND assignment.player_id IN (SELECT player_id FROM selected_players)
          )
        GROUP BY execution.exercise_id`,
      [sessionId, input.participantIds],
    ),
    pool.query(
      `WITH selected_players AS (
         SELECT DISTINCT player_id
           FROM coach_training_participants
          WHERE training_session_id = $1::uuid AND id = ANY($2::uuid[]) AND player_id IS NOT NULL
       )
       SELECT exercise.category, COALESCE(SUM(execution.duration_seconds), 0)::int AS duration_seconds
         FROM coach_exercise_executions execution
         JOIN coach_exercises exercise ON exercise.id = execution.exercise_id
        WHERE execution.training_session_id <> $1::uuid
          AND execution.status = 'completed'
          AND execution.ended_at >= now() - interval '28 days'
          AND EXISTS (
            SELECT 1 FROM coach_exercise_execution_athletes assignment
             WHERE assignment.execution_id = execution.id
               AND assignment.player_id IN (SELECT player_id FROM selected_players)
          )
        GROUP BY exercise.category`,
      [sessionId, input.participantIds],
    ),
  ]);
  const recentSessionIds = recentSessionsResult.rows.map((row) => String(row.id));
  const exerciseSessions = new Map<string, Set<string>>();
  if (recentSessionIds.length) {
    const result = await pool.query(
      `SELECT DISTINCT training_session_id::text, exercise_id::text
         FROM coach_exercise_executions
        WHERE training_session_id = ANY($1::uuid[]) AND status = 'completed'`,
      [recentSessionIds],
    );
    for (const row of result.rows) {
      const exerciseId = String(row.exercise_id);
      exerciseSessions.set(exerciseId, new Set([...(exerciseSessions.get(exerciseId) ?? []), String(row.training_session_id)]));
    }
  }
  const lastUsage = new Map(lastUsageResult.rows.map((row) => [String(row.exercise_id), row.last_used_at ? new Date(row.last_used_at).toISOString() : null]));
  const categoryUsage = new Map(categoryUsageResult.rows.map((row) => [String(row.category), Number(row.duration_seconds ?? 0)]));
  const candidates: CoachRecommendationCandidate[] = candidateResult.rows.map((row) => {
    const exerciseId = String(row.id);
    const sessions = exerciseSessions.get(exerciseId) ?? new Set<string>();
    return {
      id: exerciseId,
      title: String(row.title),
      category: String(row.category) as CoachRecommendationCandidate['category'],
      levelCode: String(row.level_code) as CoachRecommendationCandidate['levelCode'],
      intensity: String(row.intensity) as CoachRecommendationCandidate['intensity'],
      playerMin: Number(row.player_min),
      playerMax: Number(row.player_max),
      courtCount: Number(row.court_count),
      durationMinutes: Number(row.duration_minutes),
      favorite: Boolean(row.favorite),
      recommended: Boolean(row.recommended),
      coachRating: row.coach_rating == null ? null : Number(row.coach_rating),
      skillIds: textArray(row.skill_ids),
      primarySkillId: row.primary_skill_id ? String(row.primary_skill_id) : null,
      primarySkillName: row.primary_skill_name ? String(row.primary_skill_name) : null,
      matchedParticipantIds: textArray(row.matched_participant_ids),
      matchedHighPriorityCount: Number(row.high_priority_count ?? 0),
      matchedPriorityWeight: Number(row.priority_weight ?? 0),
      lastUsedAt: lastUsage.get(exerciseId) ?? null,
      usedInLastSession: recentSessionIds[0] ? sessions.has(recentSessionIds[0]) : false,
      usedInLast3: recentSessionIds.slice(0, 3).filter((id) => sessions.has(id)).length,
      usedInLast5: recentSessionIds.filter((id) => sessions.has(id)).length,
      recentCategorySeconds: categoryUsage.get(String(row.category)) ?? 0,
    };
  });
  return { candidates, inferredLevel: inferredLevel(participantsResult.rows) };
}

export async function generateCoachWorkoutRecommendation(sessionId: string, input: CoachRecommendationInput & { actorId: string }): Promise<{
  plan: CoachWorkoutPlan;
  recommendation: CoachRecommendationResult;
}> {
  const { candidates, inferredLevel: groupLevel } = await loadRecommendationCandidates(sessionId, input);
  if (!candidates.length) throw new Error('BadRequest: библиотека упражнений пуста — сначала добавьте упражнения');
  const recommendation = buildDeterministicRecommendation({ input, candidates, inferredLevel: groupLevel });
  if (!recommendation.items.length) {
    throw new Error('BadRequest: нет упражнений под выбранные состав, время, уровень и корты — измените параметры или добавьте подходящее упражнение');
  }
  await ensureCoachWorkoutPlan(sessionId, input.actorId);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const planResult = await client.query(
      `SELECT plan.id::text, plan.status,
              (SELECT COUNT(*)::int FROM coach_workout_plan_items item WHERE item.workout_plan_id = plan.id) AS item_count,
              (SELECT COUNT(*)::int FROM coach_exercise_executions execution WHERE execution.training_session_id = plan.training_session_id) AS execution_count
         FROM coach_workout_plans plan
        WHERE plan.training_session_id = $1::uuid
        FOR UPDATE`,
      [sessionId],
    );
    const plan = planResult.rows[0];
    if (!plan) throw new Error('NotFound');
    if (!['draft', 'ready'].includes(String(plan.status)) || Number(plan.execution_count) > 0) {
      throw new Error('BadRequest: тренировку уже начали — генератор не заменяет фактический план');
    }
    if (Number(plan.item_count) > 0 && !input.replaceExisting) {
      throw new Error('BadRequest: в плане уже есть упражнения — подтвердите замену черновика');
    }
    if (Number(plan.item_count) > 0) {
      await client.query('DELETE FROM coach_workout_plan_items WHERE workout_plan_id = $1::uuid', [plan.id]);
    }
    const runResult = await client.query(
      `INSERT INTO coach_workout_recommendation_runs
        (workout_plan_id, training_session_id, algorithm_version, duration_minutes, court_count,
         participant_ids, focus_skill_id, level_code, intensity, selected_count,
         planned_duration_seconds, created_by_actor)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid[], $7::uuid, $8, $9, $10, $11, $12)
       RETURNING id::text`,
      [String(plan.id), sessionId, ALGORITHM_VERSION, input.durationMinutes, input.courtCount,
        input.participantIds, input.focusSkillId, input.levelCode, input.intensity,
        recommendation.items.length, recommendation.plannedDurationMinutes * 60, input.actorId],
    );
    const runId = String(runResult.rows[0].id);
    for (let index = 0; index < recommendation.items.length; index += 1) {
      const item = recommendation.items[index];
      const itemResult = await client.query(
        `INSERT INTO coach_workout_plan_items
          (workout_plan_id, exercise_id, sort_order, planned_duration_seconds, court_label, coach_note,
           created_by_actor, recommendation_run_id, recommendation_source, recommendation_score, recommendation_reasons)
         VALUES ($1::uuid, $2::uuid, $3, $4, '', '', $5, $6::uuid, 'deterministic', $7, $8::text[])
         RETURNING id::text`,
        [String(plan.id), item.exerciseId, index, item.durationMinutes * 60, input.actorId, runId, item.score, item.reasons],
      );
      const assignmentResult = await client.query(
        `INSERT INTO coach_workout_plan_item_athletes
          (workout_plan_item_id, workout_plan_id, training_session_id, training_participant_id, player_id)
         SELECT $1::uuid, $2::uuid, $3::uuid, participant.id, participant.player_id
           FROM coach_training_participants participant
          WHERE participant.training_session_id = $3::uuid
            AND participant.id = ANY($4::uuid[])
         RETURNING training_participant_id`,
        [String(itemResult.rows[0].id), String(plan.id), sessionId, item.participantIds],
      );
      if (assignmentResult.rowCount !== item.participantIds.length) throw new Error('BadRequest: состав тренировки изменился — повторите подбор');
    }
    await client.query(
      `UPDATE coach_workout_plans SET status = 'ready', updated_by_actor = $2 WHERE id = $1::uuid`,
      [String(plan.id), input.actorId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const plan = await getCoachWorkoutPlan(sessionId);
  if (!plan) throw new Error('NotFound');
  return { plan, recommendation };
}
