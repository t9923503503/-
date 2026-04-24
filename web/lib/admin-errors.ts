export function adminErrorResponse(err: unknown, context: string) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[admin-api] ${context}:`, err);
  const status =
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : null;

  if (message.includes('tournaments_capacity_check')) {
    return Response.json({ error: 'Capacity must be at least 4' }, { status: 400 });
  }

  if (message.includes('tournaments_division_check')) {
    return Response.json(
      { error: 'Division must be Мужской, Женский, or Микст' },
      { status: 400 }
    );
  }

  if (message.includes('tournaments_level_check')) {
    return Response.json({ error: 'Level must be hard, medium, or easy' }, { status: 400 });
  }

  if (message.includes('tournaments_status_check')) {
    return Response.json(
      { error: 'Status must be draft, open, full, finished, or cancelled' },
      { status: 400 }
    );
  }

  if (message.includes('Missing DATABASE_URL') || message.includes('Missing admin server DB')) {
    return Response.json(
      { error: 'Database is not configured' },
      { status: 503 }
    );
  }

  if (message.startsWith('BadRequest: ')) {
    return Response.json(
      { error: message.slice('BadRequest: '.length).trim() || 'Bad request' },
      { status: 400 }
    );
  }

  if (status && status >= 400 && status < 600) {
    return Response.json({ error: message || 'Request failed' }, { status });
  }

  return Response.json({ error: 'Internal error' }, { status: 500 });
}
