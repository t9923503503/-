import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { GoJudgeScreen } from '@/components/go-next/GoJudgeScreen';
import { ThaiTournamentJudgeWorkspace } from '@/components/thai-live/ThaiTournamentJudgeWorkspace';
import { getGoJudgeSnapshotByPin, isGoNextError } from '@/lib/go-next';
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
    title: `Judge ${String(pin || '').trim().toUpperCase()} | LPVOLLEY`,
    description: 'Mobile court scoring workspace for active LPVOLLEY tournaments.',
    manifest: `/court/${normalizedPin}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: `Judge ${String(pin || '').trim().toUpperCase()}`,
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
  const { pin } = await params;

  try {
    const snapshot = await getThaiJudgeTournamentSnapshotByPin(pin);
    return <ThaiTournamentJudgeWorkspace initialSnapshot={snapshot} />;
  } catch (error) {
    if (!isThaiJudgeError(error) || error.status !== 404) {
      throw error;
    }
  }

  try {
    const snapshot = await getGoJudgeSnapshotByPin(pin);
    return <GoJudgeScreen pin={pin} initialSnapshot={snapshot} />;
  } catch (error) {
    if (isGoNextError(error) && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
