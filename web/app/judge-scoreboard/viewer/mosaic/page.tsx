import type { Metadata, Viewport } from 'next';
import { ViewerMosaicWall } from '@/components/judge-scoreboard/ViewerMosaicWall';

export const metadata: Metadata = {
  title: 'Judge Viewer Mosaic | LPVOLLEY',
  description: 'Read-only 2x2 scoreboard mosaic for all LPVOLLEY courts.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Viewer Mosaic',
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

export default function JudgeScoreboardViewerMosaicPage() {
  return <ViewerMosaicWall />;
}
