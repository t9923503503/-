import { notFound } from 'next/navigation';
import { SixPairLiveWorkspace } from '@/components/individual-mix/SixPairLiveWorkspace';

export const dynamic = 'force-dynamic';

export default function IndividualMixLivePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-screen bg-[#050912] px-3 py-4 text-white sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <SixPairLiveWorkspace
          tournamentId="individual-mix-live-preview"
          tournamentName="Бездельники · безопасная проверка"
          initialPlayers={[]}
          demoMode
        />
      </div>
    </main>
  );
}
