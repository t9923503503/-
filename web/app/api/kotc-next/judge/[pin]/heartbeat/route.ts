import { NextRequest, NextResponse } from 'next/server';
import { heartbeatKotcNextJudge } from '@/lib/kotc-next';
import { kotcNextErrorResponse } from '@/lib/kotc-next-http';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ pin: string }> }) {
  try {
    const { pin } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await heartbeatKotcNextJudge(
      pin,
      {
        deviceId: String(body.deviceId || ''),
        selectedRaundNo: Number(body.selectedRaundNo),
        appVersion: body.appVersion == null ? undefined : String(body.appVersion),
        platform: body.platform == null ? undefined : String(body.platform),
        knownRevision: body.knownRevision == null ? undefined : Number(body.knownRevision),
      },
      { userAgent: req.headers.get('user-agent') },
    );
    return NextResponse.json(result);
  } catch (error) {
    return kotcNextErrorResponse(error, 'judge.heartbeat');
  }
}
