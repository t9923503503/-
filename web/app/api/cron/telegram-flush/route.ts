import { createHash, timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  runTelegramFlush,
  TelegramFlushConfigurationError,
} from '@/lib/play-cron';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const expected = String(process.env.CRON_SECRET ?? '');
  const provided = String(req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || !provided) return false;
  const expectedDigest = createHash('sha256').update(expected).digest();
  const providedDigest = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

// Schedule once per minute. This endpoint only bridges V2 domain events into
// telegram_outbox. The existing external relay remains the sole Telegram API
// sender and claims those rows through /api/telegram/agent.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const report = await runTelegramFlush();
    const status = report.status === 'busy'
      ? 409
      : report.goV2?.status === 'schema_unavailable'
        ? 503
        : (report.goV2?.failed ?? 0) > 0
          ? 502
          : 200;
    return NextResponse.json(report, { status });
  } catch (error) {
    if (error instanceof TelegramFlushConfigurationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
    }
    console.error('[cron/telegram-flush]', error);
    return NextResponse.json({ error: 'Telegram flush failed' }, { status: 500 });
  }
}
