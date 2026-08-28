import { getPool } from '@/lib/db';
import { sanitizeServerImageUrl } from '@/lib/server-image-url';
import type {
  CoachAnalyticsAlert,
  CoachAnalyticsData,
  CoachAnalyticsPeriod,
  CoachAthleteAnalytics,
  CoachAthleteTrainingStat,
  CoachDistributionStat,
  CoachExerciseAnalytics,
  CoachExerciseTrainingStat,
} from './analytics-types';

function asIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function roundedMinutes(value: unknown): number {
  return Math.round(Number(value ?? 0) / 60);
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(Number(value).toFixed(1));
}

function distribution(rows: Record<string, unknown>[]): CoachDistributionStat[] {
  const totalSeconds = rows.reduce((sum, row) => sum + Number(row.duration_seconds ?? 0), 0);
  return rows.map((row) => ({
    key: String(row.key ?? ''),
    label: String(row.label ?? ''),
    executionCount: Number(row.execution_count ?? 0),
    trainingMinutes: roundedMinutes(row.duration_seconds),
    sharePercent: totalSeconds ? Math.round(Number(row.duration_seconds ?? 0) * 100 / totalSeconds) : 0,
  }));
}

export async function getCoachAnalytics(periodDays: CoachAnalyticsPeriod): Promise<CoachAnalyticsData> {
  const pool = getPool();
  const period = [periodDays];
  const [summaryResult, athletesResult, exercisesResult, categoriesResult, skillsResult, alertCountsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT execution.training_session_id)::int AS factual_training_count,
              COALESCE(SUM(execution.duration_seconds), 0)::bigint AS training_seconds,
              COALESCE(SUM(execution.duration_seconds * athlete_count.count), 0)::bigint AS athlete_seconds,
              (SELECT COUNT(DISTINCT period_assignment.player_id)::int
                 FROM coach_exercise_execution_athletes period_assignment
                 JOIN coach_exercise_executions period_execution ON period_execution.id = period_assignment.execution_id
                WHERE period_assignment.player_id IS NOT NULL
                  AND period_execution.status = 'completed'
                  AND period_execution.ended_at >= now() - make_interval(days => $1::int)) AS athletes_trained,
              COUNT(DISTINCT execution.exercise_id)::int AS exercise_count,
              ROUND(AVG(execution.coach_rating)::numeric, 1) AS average_rating
         FROM coach_exercise_executions execution
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT assignment.player_id)::int AS count
             FROM coach_exercise_execution_athletes assignment
            WHERE assignment.execution_id = execution.id AND assignment.player_id IS NOT NULL
         ) athlete_count ON true
        WHERE execution.status = 'completed'
          AND execution.ended_at >= now() - make_interval(days => $1::int)`,
      period,
    ),
    pool.query(
      `SELECT profile.player_id::text, player.name, player.photo_url, profile.status,
              COUNT(DISTINCT execution.training_session_id)::int AS training_count,
              COUNT(DISTINCT execution.exercise_id)::int AS exercise_count,
              COALESCE(SUM(execution.duration_seconds), 0)::bigint AS duration_seconds,
              MAX(execution.ended_at) AS last_training_at
         FROM coach_athlete_profiles profile
         JOIN players player ON player.id = profile.player_id
         LEFT JOIN coach_exercise_execution_athletes assignment ON assignment.player_id = profile.player_id
         LEFT JOIN coach_exercise_executions execution
           ON execution.id = assignment.execution_id
          AND execution.status = 'completed'
          AND execution.ended_at >= now() - make_interval(days => $1::int)
        WHERE profile.status <> 'archived'
        GROUP BY profile.player_id, player.name, player.photo_url, profile.status
        ORDER BY duration_seconds DESC, player.name`,
      period,
    ),
    pool.query(
      `SELECT exercise.id::text AS exercise_id, exercise.title, exercise.category,
              COUNT(execution.id)::int AS execution_count,
              (SELECT COUNT(DISTINCT period_assignment.player_id)::int
                 FROM coach_exercise_execution_athletes period_assignment
                 JOIN coach_exercise_executions period_execution ON period_execution.id = period_assignment.execution_id
                WHERE period_execution.exercise_id = exercise.id
                  AND period_assignment.player_id IS NOT NULL
                  AND period_execution.status = 'completed'
                  AND period_execution.ended_at >= now() - make_interval(days => $1::int)) AS athlete_count,
              COALESCE(SUM(execution.duration_seconds), 0)::bigint AS duration_seconds,
              ROUND(AVG(execution.coach_rating)::numeric, 1) AS average_rating,
              MAX(execution.ended_at) AS last_used_at
         FROM coach_exercises exercise
         LEFT JOIN coach_exercise_executions execution
           ON execution.exercise_id = exercise.id
          AND execution.status = 'completed'
          AND execution.ended_at >= now() - make_interval(days => $1::int)
        WHERE exercise.archived_at IS NULL
        GROUP BY exercise.id, exercise.title, exercise.category
        ORDER BY duration_seconds DESC, exercise.title`,
      period,
    ),
    pool.query(
      `SELECT exercise.category AS key, exercise.category AS label,
              COUNT(execution.id)::int AS execution_count,
              COALESCE(SUM(execution.duration_seconds), 0)::bigint AS duration_seconds
         FROM coach_exercise_executions execution
         JOIN coach_exercises exercise ON exercise.id = execution.exercise_id
        WHERE execution.status = 'completed'
          AND execution.ended_at >= now() - make_interval(days => $1::int)
        GROUP BY exercise.category
        ORDER BY duration_seconds DESC, exercise.category`,
      period,
    ),
    pool.query(
      `SELECT skill.id::text AS key, skill.name AS label,
              COUNT(execution.id)::int AS execution_count,
              COALESCE(SUM(execution.duration_seconds), 0)::bigint AS duration_seconds
         FROM coach_exercise_executions execution
         JOIN coach_exercise_skills link ON link.exercise_id = execution.exercise_id AND link.is_primary
         JOIN coach_skills skill ON skill.id = link.skill_id
        WHERE execution.status = 'completed'
          AND execution.ended_at >= now() - make_interval(days => $1::int)
        GROUP BY skill.id, skill.name
        ORDER BY duration_seconds DESC, skill.name`,
      period,
    ),
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM coach_external_identities WHERE resolution_status = 'unresolved')::int AS unresolved_count,
         (SELECT COUNT(*) FROM coach_exercise_executions
           WHERE status = 'completed' AND coach_rating IS NULL
             AND ended_at >= now() - make_interval(days => $1::int))::int AS unrated_count,
         (SELECT COUNT(*) FROM coach_athlete_profiles profile
           WHERE profile.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM coach_exercise_execution_athletes assignment
               JOIN coach_exercise_executions execution ON execution.id = assignment.execution_id
              WHERE assignment.player_id = profile.player_id
                AND execution.status = 'completed'
                AND execution.ended_at >= now() - interval '14 days'
             ))::int AS inactive_count`,
      period,
    ),
  ]);

  const total = summaryResult.rows[0] ?? {};
  const athletes: CoachAthleteTrainingStat[] = athletesResult.rows.map((row) => ({
    playerId: String(row.player_id),
    name: String(row.name ?? 'Ученик'),
    photoUrl: sanitizeServerImageUrl(row.photo_url),
    status: String(row.status ?? 'active'),
    trainingCount: Number(row.training_count ?? 0),
    exerciseCount: Number(row.exercise_count ?? 0),
    trainingMinutes: roundedMinutes(row.duration_seconds),
    lastTrainingAt: asIso(row.last_training_at),
  }));
  const exercises: CoachExerciseTrainingStat[] = exercisesResult.rows.map((row) => ({
    exerciseId: String(row.exercise_id),
    title: String(row.title ?? 'Упражнение'),
    category: String(row.category ?? 'combined'),
    executionCount: Number(row.execution_count ?? 0),
    athleteCount: Number(row.athlete_count ?? 0),
    trainingMinutes: roundedMinutes(row.duration_seconds),
    averageRating: nullableNumber(row.average_rating),
    lastUsedAt: asIso(row.last_used_at),
  }));
  const categories = distribution(categoriesResult.rows);
  const skills = distribution(skillsResult.rows);
  const counts = alertCountsResult.rows[0] ?? {};
  const alerts: CoachAnalyticsAlert[] = [];
  const factualTrainingCount = Number(total.factual_training_count ?? 0);
  if (!factualTrainingCount) alerts.push({ id: 'no-facts', tone: 'info', title: 'Факт тренировок ещё не накоплен', detail: 'Запустите и завершите хотя бы одно упражнение. План сам по себе статистику не меняет.', href: '/coach/sessions' });
  if (Number(counts.inactive_count ?? 0)) alerts.push({ id: 'inactive-athletes', tone: 'warning', title: `Без факта 14 дней: ${counts.inactive_count}`, detail: 'Активные ученики, у которых не было завершённых упражнений за две недели.', href: '/coach/athletes' });
  if (Number(counts.unresolved_count ?? 0)) alerts.push({ id: 'unresolved-identities', tone: 'warning', title: `Не разобраны участники: ${counts.unresolved_count}`, detail: 'Свяжите внешние записи с игроками, чтобы персональная статистика была полной.', href: '/coach/sessions' });
  if (Number(counts.unrated_count ?? 0)) alerts.push({ id: 'unrated-executions', tone: 'info', title: `Без оценки тренера: ${counts.unrated_count}`, detail: 'Завершённые упражнения без быстрой оценки качества выполнения.', href: '/coach/sessions' });
  const concentration = categories.find((item) => item.sharePercent >= 55 && item.trainingMinutes >= 20);
  if (concentration) alerts.push({ id: `category-${concentration.key}`, tone: 'warning', title: `Перекос: ${concentration.sharePercent}% на одну категорию`, detail: `${concentration.label}: ${concentration.trainingMinutes} мин. Проверьте баланс плана следующей тренировки.`, href: '/coach/exercises' });

  return {
    periodDays,
    generatedAt: new Date().toISOString(),
    summary: {
      factualTrainingCount,
      trainingMinutes: roundedMinutes(total.training_seconds),
      athleteMinutes: roundedMinutes(total.athlete_seconds),
      athletesTrained: Number(total.athletes_trained ?? 0),
      exerciseCount: Number(total.exercise_count ?? 0),
      averageRating: nullableNumber(total.average_rating),
    },
    athletes,
    exercises,
    categories,
    skills,
    alerts,
  };
}

export async function getCoachAthleteAnalytics(playerId: string): Promise<CoachAthleteAnalytics> {
  const [summaryResult, exercisesResult, skillsResult] = await Promise.all([
    getPool().query(
      `SELECT COUNT(DISTINCT execution.training_session_id)::int AS training_count,
              COUNT(DISTINCT execution.exercise_id)::int AS exercise_count,
              COALESCE(SUM(execution.duration_seconds), 0)::bigint AS duration_seconds,
              MAX(execution.ended_at) AS last_training_at
         FROM coach_exercise_execution_athletes assignment
         JOIN coach_exercise_executions execution ON execution.id = assignment.execution_id
        WHERE assignment.player_id = $1::uuid AND execution.status = 'completed'`,
      [playerId],
    ),
    getPool().query(
      `SELECT exercise.id::text AS exercise_id, exercise.title,
              COALESCE(SUM(execution.duration_seconds), 0)::bigint AS duration_seconds
         FROM coach_exercise_execution_athletes assignment
         JOIN coach_exercise_executions execution ON execution.id = assignment.execution_id AND execution.status = 'completed'
         JOIN coach_exercises exercise ON exercise.id = execution.exercise_id
        WHERE assignment.player_id = $1::uuid
        GROUP BY exercise.id, exercise.title
        ORDER BY duration_seconds DESC, exercise.title LIMIT 5`,
      [playerId],
    ),
    getPool().query(
      `SELECT skill.id::text AS skill_id, skill.name,
              COALESCE(SUM(execution.duration_seconds), 0)::bigint AS duration_seconds
         FROM coach_exercise_execution_athletes assignment
         JOIN coach_exercise_executions execution ON execution.id = assignment.execution_id AND execution.status = 'completed'
         JOIN coach_exercise_skills link ON link.exercise_id = execution.exercise_id AND link.is_primary
         JOIN coach_skills skill ON skill.id = link.skill_id
        WHERE assignment.player_id = $1::uuid
        GROUP BY skill.id, skill.name
        ORDER BY duration_seconds DESC, skill.name LIMIT 8`,
      [playerId],
    ),
  ]);
  const row = summaryResult.rows[0] ?? {};
  return {
    trainingCount: Number(row.training_count ?? 0),
    exerciseCount: Number(row.exercise_count ?? 0),
    trainingMinutes: roundedMinutes(row.duration_seconds),
    lastTrainingAt: asIso(row.last_training_at),
    favoriteExercises: exercisesResult.rows.map((item) => ({ exerciseId: String(item.exercise_id), title: String(item.title), trainingMinutes: roundedMinutes(item.duration_seconds) })),
    trainedSkills: skillsResult.rows.map((item) => ({ skillId: String(item.skill_id), name: String(item.name), trainingMinutes: roundedMinutes(item.duration_seconds) })),
  };
}

export async function getCoachExerciseAnalytics(exerciseId: string): Promise<CoachExerciseAnalytics> {
  const [summaryResult, ratingsResult] = await Promise.all([
    getPool().query(
      `SELECT COUNT(execution.id)::int AS execution_count,
              (SELECT COUNT(DISTINCT assignment.player_id)::int
                 FROM coach_exercise_execution_athletes assignment
                 JOIN coach_exercise_executions assigned_execution ON assigned_execution.id = assignment.execution_id
                WHERE assigned_execution.exercise_id = $1::uuid
                  AND assigned_execution.status = 'completed'
                  AND assignment.player_id IS NOT NULL) AS athlete_count,
              COALESCE(SUM(execution.duration_seconds), 0)::bigint AS duration_seconds,
              ROUND(AVG(execution.coach_rating)::numeric, 1) AS average_rating,
              MAX(execution.ended_at) AS last_used_at
         FROM coach_exercise_executions execution
        WHERE execution.exercise_id = $1::uuid AND execution.status = 'completed'`,
      [exerciseId],
    ),
    getPool().query(
      `SELECT coach_rating, coach_comment, ended_at
         FROM coach_exercise_executions
        WHERE exercise_id = $1::uuid AND status = 'completed' AND coach_rating IS NOT NULL
        ORDER BY ended_at DESC LIMIT 5`,
      [exerciseId],
    ),
  ]);
  const row = summaryResult.rows[0] ?? {};
  return {
    executionCount: Number(row.execution_count ?? 0),
    athleteCount: Number(row.athlete_count ?? 0),
    trainingMinutes: roundedMinutes(row.duration_seconds),
    averageRating: nullableNumber(row.average_rating),
    lastUsedAt: asIso(row.last_used_at),
    recentRatings: ratingsResult.rows.map((item) => ({ rating: Number(item.coach_rating), comment: String(item.coach_comment ?? ''), endedAt: asIso(item.ended_at) ?? '' })),
  };
}
