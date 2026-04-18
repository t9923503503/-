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
    title: `Judge Viewer · Court ${normalized} | LPVOLLEY`,
    description: 'Read-only scoreboard viewer for LPVOLLEY courts.',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: `Viewer ${normalized}`,
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

export default async function JudgeScoreboardViewerCourtPage({
  params,
}: {
  params: Promise<{ courtId: string }>;
}) {
  const resolved = await params;
  const normalized = String(resolved.courtId || '').trim() || '1';
  return <JudgeScoreboardScreen courtId={normalized} readOnly />;
}
