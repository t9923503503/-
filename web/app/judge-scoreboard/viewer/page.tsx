import type { Metadata, Viewport } from 'next';
import { ViewerWall } from '@/components/judge-scoreboard/ViewerWall';

export const metadata: Metadata = {
  title: 'Judge Viewer Wall | LPVOLLEY',
  description: 'Read-only rotating viewer wall for all LPVOLLEY courts.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Judge Viewer',
  },
};

export function generateViewport(): Viewport {
  return {
    themeColor: '#020611',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  };
}

export default async function JudgeScoreboardViewerWallPage({
  searchParams,
}: {
  searchParams?: Promise<{
    court?: string;
    auto?: string;
    interval?: string;
  }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialCourt = String(resolvedSearchParams.court || '1');
  const initialAuto = resolvedSearchParams.auto !== '0';
  const initialIntervalSec = Number(resolvedSearchParams.interval || 8);
  return (
    <ViewerWall
      initialCourt={initialCourt}
      initialAuto={initialAuto}
      initialIntervalSec={initialIntervalSec}
    />
  );
}
