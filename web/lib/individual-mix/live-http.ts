import { NextResponse } from 'next/server';
import { IndividualMixLiveDomainError } from './live-core';
import { isIndividualMixLiveServiceError } from './live-service';

export function individualMixLiveErrorResponse(error: unknown, source: string): NextResponse {
  if (isIndividualMixLiveServiceError(error)) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...error.details },
      { status: error.status },
    );
  }
  if (error instanceof IndividualMixLiveDomainError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
  }
  console.error(`[individual-mix.${source}]`, error);
  return NextResponse.json({ error: 'Не удалось выполнить действие live-сессии.', code: 'internal_error' }, { status: 500 });
}
