import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { sanitizeServerImageUrl } from '@/lib/server-image-url';
import { listCoachExercises } from './exercise-service';
import { getCoachTrainingSession } from './session-service';
import type {
  CoachExerciseExecution,
  CoachWorkoutAssignee,
  CoachWorkoutPlan,
  CoachWorkoutPlanItem,
  CoachWorkoutWorkspaceData,
} from './workout-types';

type WorkoutItemInput = {
  exerciseId: string;
  durationMinutes: number;
  courtLabel: string;
  coachNote: string;
  participantIds: string[];
};

function asIso(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function liveElapsed(row: Record<string, unknown>): number {
  const stored = Number(row.elapsed_seconds ?? 0);
  if (String(row.status) !== 'running' || !row.resumed_at) return stored;
  const resumed = new Date(String(row.resumed_at)).getTime();
  return Math.min(86400, stored + Math.max(0, Math.floor((Date.now() - resumed) / 1000)));
}

function mapAssignee(row: Record<string, unknown>): CoachWorkoutAssignee {
  return {
    participantId: String(row.training_participant_id ?? ''),
    playerId: row.player_id ? String(row.player_id) : null,
    name: String(row.name ?? row.display_name ?? 'Участник'),
  };
}

function mapExecution(row: Record<string, unknown>, assignees: CoachWorkoutAssignee[]): CoachExerciseExecution {
  return {
    id: String(row.id ?? ''),
    planItemId: row.workout_plan_item_id ? String(row.workout_plan_item_id) : null,
    exerciseId: String(row.exercise_id ?? ''),
    exerciseTitle: String(row.exercise_title ?? ''),
    status: String(row.status ?? 'completed') as CoachExerciseExecution['status'],
    targetDurationSeconds: Number(row.target_duration_seconds ?? 0),
    elapsedSeconds: Number(row.elapsed_seconds ?? 0),
    liveElapsedSeconds: liveElapsed(row),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    startedAt: asIso(row.started_at),
    resumedAt: row.resumed_at ? asIso(row.resumed_at) : null,
    pausedAt: row.paused_at ? asIso(row.paused_at) : null,
    endedAt: row.ended_at ? asIso(row.ended_at) : null,
    courtLabel: String(row.court_label ?? ''),
    coachRating: row.coach_rating == null ? null : Number(row.coach_rating),
    coachComment: String(row.coach_comment ?? ''),
    revision: Number(row.revision ?? 1),
    assignees,
  };
}

async function ensureWorkoutPlan(client: PoolClient, sessionId: string, actorId: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO coach_workout_plans (training_session_id, title, created_by_actor, updated_by_actor)
     SELECT session.id, session.title, $2, $2
       FROM coach_training_sessions session
      WHERE session.id = $1::uuid
     ON CONFLICT (training_session_id) DO UPDATE SET updated_by_actor = coach_workout_plans.updated_by_actor
     RETURNING id::text`,
    [sessionId, actorId],
  );
  if (!rows[0]) throw new Error('NotFound');
  return String(rows[0].id);
}

export async function ensureCoachWorkoutPlan(sessionId: string, actorId: string): Promise<string> {
  const client = await getPool().connect();
  try {
    return await ensureWorkoutPlan(client, sessionId, actorId);
  } finally {
    client.release();
  }
}

export async function getCoachWorkoutPlan(sessionId: string): Promise<CoachWorkoutPlan | null> {
  const pool = getPool();
  const { rows: planRows } = await pool.query(
    `SELECT plan.id::text, plan.training_session_id::text, plan.title, plan.status,
            plan.started_at, plan.completed_at,
            COALESCE((SELECT SUM(item.planned_duration_seconds) FROM coach_workout_plan_items item WHERE item.workout_plan_id = plan.id), 0)::int AS planned_duration_seconds,
            COALESCE((SELECT SUM(execution.duration_seconds) FROM coach_exercise_executions execution WHERE execution.training_session_id = plan.training_session_id AND execution.status = 'completed'), 0)::int AS actual_duration_seconds
       FROM coach_workout_plans plan
      WHERE plan.training_session_id = $1::uuid
      LIMIT 1`,
    [sessionId],
  );
  if (!planRows[0]) return null;
  const planId = String(planRows[0].id);
  const [itemsResult, itemAssigneesResult, executionsResult, executionAssigneesResult] = await Promise.all([
    pool.query(
      `SELECT item.id::text, item.exercise_id::text, item.sort_order,
              item.planned_duration_seconds, item.court_label, item.coach_note,
              item.recommendation_source, item.recommendation_score, item.recommendation_reasons,
              exercise.title, exercise.category, exercise.coach_cues,
              COALESCE((SELECT photo.storage_url FROM coach_exercise_photos photo WHERE photo.exercise_id = exercise.id ORDER BY photo.sort_order, photo.created_at LIMIT 1), '') AS photo_url,
              COALESCE((SELECT video.url FROM coach_exercise_videos video WHERE video.exercise_id = exercise.id ORDER BY video.sort_order, video.created_at LIMIT 1), '') AS video_url,
              latest.status AS execution_status, latest.duration_seconds AS actual_duration_seconds
         FROM coach_workout_plan_items item
         JOIN coach_exercises exercise ON exercise.id = item.exercise_id
         LEFT JOIN LATERAL (
           SELECT execution.status, execution.duration_seconds
             FROM coach_exercise_executions execution
            WHERE execution.workout_plan_item_id = item.id
            ORDER BY execution.started_at DESC, execution.id DESC
            LIMIT 1
         ) latest ON true
        WHERE item.workout_plan_id = $1::uuid
        ORDER BY item.sort_order, item.id`,
      [planId],
    ),
    pool.query(
      `SELECT assignment.workout_plan_item_id::text, assignment.training_participant_id::text,
              assignment.player_id::text, player.name, participant.display_name
         FROM coach_workout_plan_item_athletes assignment
         JOIN coach_training_participants participant ON participant.id = assignment.training_participant_id
         LEFT JOIN players player ON player.id = assignment.player_id
        WHERE assignment.workout_plan_id = $1::uuid
        ORDER BY COALESCE(player.name, participant.display_name), participant.id`,
      [planId],
    ),
    pool.query(
      `SELECT execution.id::text, execution.workout_plan_item_id::text, execution.exercise_id::text,
              exercise.title AS exercise_title, execution.status, execution.target_duration_seconds,
              execution.elapsed_seconds, execution.duration_seconds, execution.started_at,
              execution.resumed_at, execution.paused_at, execution.ended_at,
              execution.court_label, execution.coach_rating, execution.coach_comment, execution.revision
         FROM coach_exercise_executions execution
         JOIN coach_exercises exercise ON exercise.id = execution.exercise_id
        WHERE execution.training_session_id = $1::uuid
        ORDER BY execution.started_at, execution.id`,
      [sessionId],
    ),
    pool.query(
      `SELECT assignment.execution_id::text, assignment.training_participant_id::text,
              assignment.player_id::text, player.name, participant.display_name
         FROM coach_exercise_execution_athletes assignment
         JOIN coach_training_participants participant ON participant.id = assignment.training_participant_id
         LEFT JOIN players player ON player.id = assignment.player_id
        WHERE assignment.training_session_id = $1::uuid
        ORDER BY COALESCE(player.name, participant.display_name), participant.id`,
      [sessionId],
    ),
  ]);
  const itemAssignees = new Map<string, CoachWorkoutAssignee[]>();
  for (const row of itemAssigneesResult.rows) {
    const key = String(row.workout_plan_item_id);
    itemAssignees.set(key, [...(itemAssignees.get(key) ?? []), mapAssignee(row)]);
  }
  const executionAssignees = new Map<string, CoachWorkoutAssignee[]>();
  for (const row of executionAssigneesResult.rows) {
    const key = String(row.execution_id);
    executionAssignees.set(key, [...(executionAssignees.get(key) ?? []), mapAssignee(row)]);
  }
  const items: CoachWorkoutPlanItem[] = itemsResult.rows.map((row) => ({
    id: String(row.id),
    exerciseId: String(row.exercise_id),
    title: String(row.title),
    category: String(row.category) as CoachWorkoutPlanItem['category'],
    plannedDurationSeconds: Number(row.planned_duration_seconds),
    courtLabel: String(row.court_label ?? ''),
    coachNote: String(row.coach_note ?? ''),
    sortOrder: Number(row.sort_order),
    photoUrl: sanitizeServerImageUrl(row.photo_url),
    videoUrl: String(row.video_url ?? ''),
    coachCues: textArray(row.coach_cues),
    assignees: itemAssignees.get(String(row.id)) ?? [],
    executionStatus: row.execution_status ? String(row.execution_status) as CoachWorkoutPlanItem['executionStatus'] : null,
    actualDurationSeconds: row.actual_duration_seconds == null ? null : Number(row.actual_duration_seconds),
    recommendationSource: String(row.recommendation_source ?? 'manual') as CoachWorkoutPlanItem['recommendationSource'],
    recommendationScore: row.recommendation_score == null ? null : Number(row.recommendation_score),
    recommendationReasons: textArray(row.recommendation_reasons),
  }));
  const executions = executionsResult.rows.map((row) => mapExecution(row, executionAssignees.get(String(row.id)) ?? []));
  const activeExecution = executions.find((execution) => execution.status === 'running' || execution.status === 'paused') ?? null;
  return {
    id: planId,
    trainingSessionId: String(planRows[0].training_session_id),
    title: String(planRows[0].title ?? ''),
    status: String(planRows[0].status ?? 'draft') as CoachWorkoutPlan['status'],
    startedAt: planRows[0].started_at ? asIso(planRows[0].started_at) : null,
    completedAt: planRows[0].completed_at ? asIso(planRows[0].completed_at) : null,
    plannedDurationSeconds: Number(planRows[0].planned_duration_seconds ?? 0),
    actualDurationSeconds: Number(planRows[0].actual_duration_seconds ?? 0),
    items,
    activeExecution,
    executions,
  };
}

export async function getCoachWorkoutWorkspace(sessionId: string, actorId: string): Promise<CoachWorkoutWorkspaceData | null> {
  const session = await getCoachTrainingSession(sessionId);
  if (!session) return null;
  await ensureCoachWorkoutPlan(sessionId, actorId);
  const [plan, exercises] = await Promise.all([getCoachWorkoutPlan(sessionId), listCoachExercises()]);
  if (!plan) throw new Error('NotFound');
  return {
    session,
    plan,
    exercises,
    eligibleParticipants: session.participants.filter((participant) => participant.actualAttendance !== 'absent'),
    serverNow: new Date().toISOString(),
  };
}

async function lockPlan(client: PoolClient, sessionId: string): Promise<Record<string, unknown>> {
  const { rows } = await client.query(
    `SELECT plan.* FROM coach_workout_plans plan WHERE plan.training_session_id = $1::uuid FOR UPDATE`,
    [sessionId],
  );
  if (!rows[0]) throw new Error('NotFound');
  if (String(rows[0].status) === 'completed') throw new Error('BadRequest: тренировка уже завершена');
  return rows[0];
}

async function replaceItemAssignees(client: PoolClient, input: {
  planId: string;
  sessionId: string;
  itemId: string;
  participantIds: string[];
}): Promise<void> {
  await client.query('DELETE FROM coach_workout_plan_item_athletes WHERE workout_plan_item_id = $1::uuid', [input.itemId]);
  if (!input.participantIds.length) return;
  const result = await client.query(
    `INSERT INTO coach_workout_plan_item_athletes
      (workout_plan_item_id, workout_plan_id, training_session_id, training_participant_id, player_id)
     SELECT $1::uuid, $2::uuid, $3::uuid, participant.id, participant.player_id
       FROM coach_training_participants participant
      WHERE participant.training_session_id = $3::uuid
        AND participant.id = ANY($4::uuid[])
     RETURNING training_participant_id`,
    [input.itemId, input.planId, input.sessionId, input.participantIds],
  );
  if (result.rowCount !== input.participantIds.length) throw new Error('BadRequest: один из участников не входит в эту тренировку');
}

async function normalizeItemOrder(client: PoolClient, planId: string): Promise<void> {
  await client.query(
    `WITH ordered AS (
       SELECT id, (row_number() OVER (ORDER BY sort_order, id) - 1)::smallint AS next_order
         FROM coach_workout_plan_items WHERE workout_plan_id = $1::uuid
     )
     UPDATE coach_workout_plan_items item SET sort_order = ordered.next_order
       FROM ordered WHERE item.id = ordered.id`,
    [planId],
  );
}

export async function addCoachWorkoutItem(sessionId: string, input: WorkoutItemInput & { actorId: string }): Promise<CoachWorkoutPlan> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, sessionId);
    const { rows } = await client.query(
      `INSERT INTO coach_workout_plan_items
        (workout_plan_id, exercise_id, sort_order, planned_duration_seconds, court_label, coach_note, created_by_actor)
       SELECT $1::uuid, exercise.id,
              COALESCE((SELECT MAX(sort_order) + 1 FROM coach_workout_plan_items WHERE workout_plan_id = $1::uuid), 0),
              $3, $4, $5, $6
         FROM coach_exercises exercise
        WHERE exercise.id = $2::uuid AND exercise.archived_at IS NULL
       RETURNING id::text`,
      [plan.id, input.exerciseId, input.durationMinutes * 60, input.courtLabel, input.coachNote, input.actorId],
    );
    if (!rows[0]) throw new Error('BadRequest: упражнение не найдено');
    await replaceItemAssignees(client, { planId: String(plan.id), sessionId, itemId: String(rows[0].id), participantIds: input.participantIds });
    await client.query(`UPDATE coach_workout_plans SET status = 'ready', updated_by_actor = $2 WHERE id = $1::uuid`, [plan.id, input.actorId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const result = await getCoachWorkoutPlan(sessionId);
  if (!result) throw new Error('NotFound');
  return result;
}

export async function updateCoachWorkoutItem(sessionId: string, itemId: string, input: WorkoutItemInput & { actorId: string }): Promise<CoachWorkoutPlan> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, sessionId);
    const result = await client.query(
      `UPDATE coach_workout_plan_items item
          SET exercise_id = exercise.id, planned_duration_seconds = $4,
              court_label = $5, coach_note = $6,
              recommendation_source = CASE WHEN item.exercise_id <> exercise.id THEN 'manual' ELSE item.recommendation_source END,
              recommendation_run_id = CASE WHEN item.exercise_id <> exercise.id THEN NULL ELSE item.recommendation_run_id END,
              recommendation_score = CASE WHEN item.exercise_id <> exercise.id THEN NULL ELSE item.recommendation_score END,
              recommendation_reasons = CASE WHEN item.exercise_id <> exercise.id THEN '{}'::text[] ELSE item.recommendation_reasons END
         FROM coach_exercises exercise
        WHERE item.id = $2::uuid AND item.workout_plan_id = $1::uuid
          AND exercise.id = $3::uuid AND exercise.archived_at IS NULL`,
      [plan.id, itemId, input.exerciseId, input.durationMinutes * 60, input.courtLabel, input.coachNote],
    );
    if (!result.rowCount) throw new Error('BadRequest: пункт плана или упражнение не найдены');
    await replaceItemAssignees(client, { planId: String(plan.id), sessionId, itemId, participantIds: input.participantIds });
    await client.query(`UPDATE coach_workout_plans SET updated_by_actor = $2 WHERE id = $1::uuid`, [plan.id, input.actorId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const result = await getCoachWorkoutPlan(sessionId);
  if (!result) throw new Error('NotFound');
  return result;
}

export async function moveCoachWorkoutItem(sessionId: string, itemId: string, direction: 'up' | 'down', actorId: string): Promise<CoachWorkoutPlan> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, sessionId);
    const current = await client.query(`SELECT id::text, sort_order FROM coach_workout_plan_items WHERE id = $2::uuid AND workout_plan_id = $1::uuid FOR UPDATE`, [plan.id, itemId]);
    if (!current.rows[0]) throw new Error('NotFound');
    const neighbor = await client.query(
      `SELECT id::text, sort_order FROM coach_workout_plan_items
        WHERE workout_plan_id = $1::uuid AND sort_order ${direction === 'up' ? '<' : '>'} $2
        ORDER BY sort_order ${direction === 'up' ? 'DESC' : 'ASC'} LIMIT 1 FOR UPDATE`,
      [plan.id, current.rows[0].sort_order],
    );
    if (neighbor.rows[0]) {
      await client.query(`UPDATE coach_workout_plan_items SET sort_order = -1 WHERE id = $1::uuid`, [itemId]);
      await client.query(`UPDATE coach_workout_plan_items SET sort_order = $2 WHERE id = $1::uuid`, [neighbor.rows[0].id, current.rows[0].sort_order]);
      await client.query(`UPDATE coach_workout_plan_items SET sort_order = $2 WHERE id = $1::uuid`, [itemId, neighbor.rows[0].sort_order]);
    }
    await client.query(`UPDATE coach_workout_plans SET updated_by_actor = $2 WHERE id = $1::uuid`, [plan.id, actorId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const result = await getCoachWorkoutPlan(sessionId);
  if (!result) throw new Error('NotFound');
  return result;
}

export async function removeCoachWorkoutItem(sessionId: string, itemId: string, actorId: string): Promise<CoachWorkoutPlan> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, sessionId);
    const active = await client.query(`SELECT 1 FROM coach_exercise_executions WHERE workout_plan_item_id = $1::uuid AND status IN ('running','paused')`, [itemId]);
    if (active.rowCount) throw new Error('BadRequest: сначала завершите текущее упражнение');
    const removed = await client.query(`DELETE FROM coach_workout_plan_items WHERE id = $2::uuid AND workout_plan_id = $1::uuid`, [plan.id, itemId]);
    if (!removed.rowCount) throw new Error('NotFound');
    await normalizeItemOrder(client, String(plan.id));
    await client.query(`UPDATE coach_workout_plans SET status = CASE WHEN EXISTS (SELECT 1 FROM coach_workout_plan_items WHERE workout_plan_id = $1::uuid) THEN status ELSE 'draft' END, updated_by_actor = $2 WHERE id = $1::uuid`, [plan.id, actorId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const result = await getCoachWorkoutPlan(sessionId);
  if (!result) throw new Error('NotFound');
  return result;
}

async function copyExecutionAssignees(client: PoolClient, input: { executionId: string; itemId: string; sessionId: string }): Promise<void> {
  const explicit = await client.query(
    `INSERT INTO coach_exercise_execution_athletes (execution_id, training_session_id, training_participant_id, player_id)
     SELECT $1::uuid, $3::uuid, assignment.training_participant_id, assignment.player_id
       FROM coach_workout_plan_item_athletes assignment
      WHERE assignment.workout_plan_item_id = $2::uuid
     RETURNING training_participant_id`,
    [input.executionId, input.itemId, input.sessionId],
  );
  if (explicit.rowCount) return;
  await client.query(
    `INSERT INTO coach_exercise_execution_athletes (execution_id, training_session_id, training_participant_id, player_id)
     SELECT $1::uuid, $2::uuid, participant.id, participant.player_id
       FROM coach_training_participants participant
      WHERE participant.training_session_id = $2::uuid
        AND participant.actual_attendance <> 'absent'
        AND participant.telegram_status <> 'not_going'`,
    [input.executionId, input.sessionId],
  );
}

async function startExecutionTx(client: PoolClient, sessionId: string, itemId: string, actorId: string): Promise<void> {
  const active = await client.query(`SELECT 1 FROM coach_exercise_executions WHERE training_session_id = $1::uuid AND status IN ('running','paused')`, [sessionId]);
  if (active.rowCount) throw new Error('BadRequest: сначала завершите текущее упражнение');
  const { rows } = await client.query(
    `INSERT INTO coach_exercise_executions
      (training_session_id, workout_plan_item_id, exercise_id, status, target_duration_seconds,
       started_at, resumed_at, court_label, created_by_actor, updated_by_actor)
     SELECT plan.training_session_id, item.id, item.exercise_id, 'running', item.planned_duration_seconds,
            now(), now(), item.court_label, $3, $3
       FROM coach_workout_plan_items item
       JOIN coach_workout_plans plan ON plan.id = item.workout_plan_id
      WHERE plan.training_session_id = $1::uuid AND item.id = $2::uuid AND plan.status <> 'completed'
     RETURNING id::text`,
    [sessionId, itemId, actorId],
  );
  if (!rows[0]) throw new Error('BadRequest: пункт плана не найден');
  await copyExecutionAssignees(client, { executionId: String(rows[0].id), itemId, sessionId });
  await client.query(`UPDATE coach_workout_plans SET status = 'in_progress', started_at = COALESCE(started_at, now()), updated_by_actor = $2 WHERE training_session_id = $1::uuid`, [sessionId, actorId]);
  await client.query(`UPDATE coach_training_sessions SET status = 'in_progress', updated_by_actor = $2 WHERE id = $1::uuid AND status NOT IN ('completed','cancelled')`, [sessionId, actorId]);
}

async function finishExecutionTx(client: PoolClient, input: { sessionId: string; executionId: string; revision: number; actorId: string; status?: 'completed' | 'cancelled' }): Promise<Record<string, unknown>> {
  const { rows } = await client.query(
    `UPDATE coach_exercise_executions
        SET elapsed_seconds = LEAST(86400, elapsed_seconds + CASE WHEN status = 'running' THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - resumed_at))::int) ELSE 0 END),
            duration_seconds = LEAST(86400, elapsed_seconds + CASE WHEN status = 'running' THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - resumed_at))::int) ELSE 0 END),
            status = $5, resumed_at = NULL, paused_at = CASE WHEN $5 = 'cancelled' THEN paused_at ELSE NULL END,
            ended_at = now(), revision = revision + 1, updated_by_actor = $4
      WHERE id = $2::uuid AND training_session_id = $1::uuid
        AND revision = $3 AND status IN ('running','paused')
      RETURNING *`,
    [input.sessionId, input.executionId, input.revision, input.actorId, input.status ?? 'completed'],
  );
  if (!rows[0]) throw new Error('BadRequest: таймер уже изменился — обновите экран');
  return rows[0];
}

export async function startCoachWorkoutSession(sessionId: string, actorId: string): Promise<CoachWorkoutPlan> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, sessionId);
    const first = await client.query(
      `SELECT item.id::text FROM coach_workout_plan_items item
        WHERE item.workout_plan_id = $1::uuid
          AND NOT EXISTS (SELECT 1 FROM coach_exercise_executions execution WHERE execution.workout_plan_item_id = item.id AND execution.status = 'completed')
        ORDER BY item.sort_order, item.id LIMIT 1`,
      [plan.id],
    );
    if (!first.rows[0]) throw new Error('BadRequest: добавьте новое упражнение или завершите занятие');
    await startExecutionTx(client, sessionId, String(first.rows[0].id), actorId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const result = await getCoachWorkoutPlan(sessionId);
  if (!result) throw new Error('NotFound');
  return result;
}

export async function startCoachExerciseExecution(sessionId: string, itemId: string, actorId: string): Promise<CoachWorkoutPlan> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await lockPlan(client, sessionId);
    await startExecutionTx(client, sessionId, itemId, actorId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const result = await getCoachWorkoutPlan(sessionId);
  if (!result) throw new Error('NotFound');
  return result;
}

export async function commandCoachExecution(sessionId: string, input: {
  action: 'pause' | 'resume' | 'adjust' | 'finish' | 'next';
  executionId: string;
  revision: number;
  deltaSeconds?: number;
  actorId: string;
}): Promise<CoachWorkoutPlan> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, sessionId);
    if (input.action === 'pause') {
      const result = await client.query(
        `UPDATE coach_exercise_executions
            SET elapsed_seconds = LEAST(86400, elapsed_seconds + GREATEST(0, EXTRACT(EPOCH FROM (now() - resumed_at))::int)),
                status = 'paused', resumed_at = NULL, paused_at = now(), revision = revision + 1, updated_by_actor = $4
          WHERE id = $2::uuid AND training_session_id = $1::uuid AND revision = $3 AND status = 'running'`,
        [sessionId, input.executionId, input.revision, input.actorId],
      );
      if (!result.rowCount) throw new Error('BadRequest: таймер уже изменился — обновите экран');
    } else if (input.action === 'resume') {
      const result = await client.query(
        `UPDATE coach_exercise_executions SET status = 'running', resumed_at = now(), paused_at = NULL,
                revision = revision + 1, updated_by_actor = $4
          WHERE id = $2::uuid AND training_session_id = $1::uuid AND revision = $3 AND status = 'paused'`,
        [sessionId, input.executionId, input.revision, input.actorId],
      );
      if (!result.rowCount) throw new Error('BadRequest: таймер уже изменился — обновите экран');
    } else if (input.action === 'adjust') {
      const result = await client.query(
        `UPDATE coach_exercise_executions SET target_duration_seconds = LEAST(21600, GREATEST(60, target_duration_seconds + $4)),
                revision = revision + 1, updated_by_actor = $5
          WHERE id = $2::uuid AND training_session_id = $1::uuid AND revision = $3 AND status IN ('running','paused')`,
        [sessionId, input.executionId, input.revision, input.deltaSeconds ?? 0, input.actorId],
      );
      if (!result.rowCount) throw new Error('BadRequest: таймер уже изменился — обновите экран');
    } else {
      const finished = await finishExecutionTx(client, { sessionId, executionId: input.executionId, revision: input.revision, actorId: input.actorId });
      if (input.action === 'next' && finished.workout_plan_item_id) {
        const next = await client.query(
          `SELECT item.id::text
             FROM coach_workout_plan_items item
             JOIN coach_workout_plan_items current ON current.id = $2::uuid AND current.workout_plan_id = item.workout_plan_id
            WHERE item.workout_plan_id = $1::uuid AND item.sort_order > current.sort_order
              AND NOT EXISTS (SELECT 1 FROM coach_exercise_executions execution WHERE execution.workout_plan_item_id = item.id AND execution.status = 'completed')
            ORDER BY item.sort_order, item.id LIMIT 1`,
          [plan.id, finished.workout_plan_item_id],
        );
        if (next.rows[0]) await startExecutionTx(client, sessionId, String(next.rows[0].id), input.actorId);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const result = await getCoachWorkoutPlan(sessionId);
  if (!result) throw new Error('NotFound');
  return result;
}

export async function completeCoachWorkoutSession(sessionId: string, actorId: string): Promise<CoachWorkoutPlan> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, sessionId);
    const active = await client.query(`SELECT id::text, revision FROM coach_exercise_executions WHERE training_session_id = $1::uuid AND status IN ('running','paused') FOR UPDATE`, [sessionId]);
    if (active.rows[0]) await finishExecutionTx(client, { sessionId, executionId: String(active.rows[0].id), revision: Number(active.rows[0].revision), actorId });
    await client.query(`UPDATE coach_workout_plans SET status = 'completed', started_at = COALESCE(started_at, now()), completed_at = now(), updated_by_actor = $2 WHERE id = $1::uuid`, [plan.id, actorId]);
    await client.query(`UPDATE coach_training_sessions SET status = 'completed', updated_by_actor = $2 WHERE id = $1::uuid`, [sessionId, actorId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const result = await getCoachWorkoutPlan(sessionId);
  if (!result) throw new Error('NotFound');
  return result;
}
