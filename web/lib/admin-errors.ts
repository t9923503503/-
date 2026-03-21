import { NextResponse } from 'next/server';

export function adminErrorResponse(err: unknown, context: string) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[admin-api] ${context}:`, err);

  if (message.includes('Missing DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database is not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
