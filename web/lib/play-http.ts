import { NextResponse } from 'next/server';
import { PlayServiceError } from '@/lib/play-service';

export function playErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof PlayServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`[play/${context}]`, error);
  return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
}

