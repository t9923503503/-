export function coachErrorResponse(error: unknown, context: string): Response {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[coach-api] ${context}:`, error);
  const code = String((error as { code?: unknown })?.code ?? '');

  if (code === '42P01' || message.includes('coach_athlete_profiles') || message.includes('coach_exercises') || message.includes('coach_training_sessions') || message.includes('coach_workout_plans') || message.includes('coach_exercise_executions') || message.includes('coach_challenges')) {
    return Response.json({ error: 'LP Coach ещё не настроен в базе данных' }, { status: 503 });
  }
  if (message.startsWith('BadRequest: ')) {
    return Response.json({ error: message.slice('BadRequest: '.length) }, { status: 400 });
  }
  if (message === 'NotFound') return Response.json({ error: 'Не найдено' }, { status: 404 });
  if (code === '23505') return Response.json({ error: 'Такая запись уже существует' }, { status: 409 });
  if (code === '23503') return Response.json({ error: 'Связанная запись не найдена' }, { status: 400 });
  return Response.json({ error: 'Внутренняя ошибка LP Coach' }, { status: 500 });
}
