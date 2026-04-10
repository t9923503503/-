import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { KotcNextJudgeScreen } from '@/components/kotc-next/KotcNextJudgeScreen';
import { getKotcNextJudgeSnapshotByPin, isKotcNextError } from '@/lib/kotc-next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pin: string }>;
}): Promise<Metadata> {
  const { pin } = await params;
  const normalizedPin = String(pin || '').trim().toUpperCase();
  return {
    title: `KOTC Next Judge ${normalizedPin} | LPVOLLEY`,
    description: 'KOTC Next judge workspace for mobile court scoring and round control.',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: `KOTC ${normalizedPin}`,
    },
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: '#090913',
  };
}

export default async function KotcNextJudgePage({
  params,
}: {
  params: Promise<{ pin: string }>;
}) {
  try {
    const { pin } = await params;
    const snapshot = await getKotcNextJudgeSnapshotByPin(pin);
    return <KotcNextJudgeScreen initialSnapshot={snapshot} />;
  } catch (error) {
    if (isKotcNextError(error) && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
