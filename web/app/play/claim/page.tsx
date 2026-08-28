import type { Metadata } from 'next';
import Link from 'next/link';
import PlayGuestClaimClient from '@/components/play/PlayGuestClaimClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Привязать участие | LPVOLLEY',
  robots: { index: false, follow: false },
};

export default async function PlayGuestClaimPage({
  searchParams,
}: {
  searchParams?: Promise<{ participant?: string; token?: string }>;
}) {
  const params = (await searchParams) || {};
  const participantId = String(params.participant || '');
  const token = String(params.token || '');
  const valid = /^[0-9a-f-]{36}$/i.test(participantId) && token.length >= 32 && token.length <= 128;

  return (
    <main className="mx-auto max-w-xl px-4 py-10 md:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">LPVOLLEY · Игры</p>
      <h1 className="mt-2 font-heading text-4xl uppercase tracking-wide text-text-primary">Привязать гостевое место</h1>
      <p className="mt-2 text-sm text-text-secondary">После привязки игра сохранится в кабинете, а зарегистрированный состав сможет участвовать в рейтинге.</p>
      <div className="mt-6">
        {valid ? <PlayGuestClaimClient participantId={participantId} token={token} /> : (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-300/5 p-5">
            <p className="text-sm text-rose-100">Ссылка повреждена или неполная. Попросите организатора отправить новую.</p>
            <Link href="/cabinet" className="mt-4 inline-flex text-sm font-semibold text-cyan-200">Перейти в кабинет →</Link>
          </div>
        )}
      </div>
    </main>
  );
}
