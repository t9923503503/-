import type { Metadata, Viewport } from 'next';
import { JudgeScoreboardScreen } from '@/components/judge-scoreboard/JudgeScoreboardScreen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courtId: string }>;
}): Promise<Metadata> {
  const { courtId } = await params;
  const normalized = String(courtId || '').trim() || '1';
  return {
    title: `Табло судьи · Корт ${normalized} | LPVOLLEY`,
    description: 'Судейское табло для пляжного волейбола.',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: `Корт ${normalized}`,
    },
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: '#050914',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  };
}

export default async function JudgeScoreboardCourtPage({
  params,
}: {
  params: Promise<{ courtId: string }>;
}) {
  const resolvedParams = await params;
  const courtId = resolvedParams.courtId;
  const normalized = String(courtId || '').trim() || '1';
  return <JudgeScoreboardScreen courtId={normalized} />;
}
