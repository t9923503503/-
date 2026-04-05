import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { ThaiTournamentJudgeWorkspace } from '@/components/thai-live/ThaiTournamentJudgeWorkspace';
import { getThaiJudgeTournamentSnapshotByPin, isThaiJudgeError } from '@/lib/thai-live';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pin: string }>;
}): Promise<Metadata> {
  const { pin } = await params;
  const normalizedPin = encodeURIComponent(String(pin || '').trim().toUpperCase());
  return {
    title: `Thai Judge ${String(pin || '').trim().toUpperCase()} | LPVOLLEY`,
    description: 'Thai judge workspace for mobile court scoring.',
    manifest: `/court/${normalizedPin}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: `Thai ${String(pin || '').trim().toUpperCase()}`,
    },
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: '#111827',
  };
}

export default async function CourtJudgePage({
  params,
}: {
  params: Promise<{ pin: string }>;
}) {
  try {
    const { pin } = await params;
    const snapshot = await getThaiJudgeTournamentSnapshotByPin(pin);
    return <ThaiTournamentJudgeWorkspace initialSnapshot={snapshot} />;
  } catch (error) {
    if (isThaiJudgeError(error) && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
