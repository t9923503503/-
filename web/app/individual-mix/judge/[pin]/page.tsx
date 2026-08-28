import type { Metadata, Viewport } from 'next';
import { IndividualMixJudgeWorkspace } from '@/components/individual-mix/IndividualMixJudgeWorkspace';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ pin: string }> }): Promise<Metadata> {
  const { pin } = await params;
  const normalized = String(pin || '').trim().toUpperCase();
  return {
    title: `Корт · ${normalized} | LPVOLLEY`,
    description: 'Судейский экран турнира «Бездельники · 6 пар».',
    manifest: `/individual-mix/judge/${encodeURIComponent(normalized)}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: `Корт ${normalized}` },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: '#080d15', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
}

export default async function IndividualMixJudgePage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  return <IndividualMixJudgeWorkspace pin={pin} />;
}
