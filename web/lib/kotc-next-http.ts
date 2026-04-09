import { NextResponse } from 'next/server';
import { isKotcNextError } from '@/lib/kotc-next';

export function kotcNextErrorResponse(error: unknown, tag: string): NextResponse {
  if (isKotcNextError(error)) {
    const body = error.code ? { error: error.message, code: error.code } : { error: error.message };
    return NextResponse.json(body, { status: error.status });
  }
  console.error(`[KOTC NEXT] ${tag}:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
