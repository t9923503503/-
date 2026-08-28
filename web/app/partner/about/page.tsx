import type { Metadata } from 'next';
import Link from 'next/link';
import PlayHowItWorks from '@/components/play/PlayHowItWorks';

export const metadata: Metadata = {
  title: 'Как пользоваться открытыми играми | LPVolley',
  description: 'Как найти игру по пляжному волейболу в Сургуте, записаться, следить за изменениями и управлять участием.',
  alternates: { canonical: 'https://lpvolley.ru/partner/about' },
};

export default function PlayAboutPage() {
  return (
    <main className="play-surface mx-auto max-w-[1100px] px-4 pb-20 pt-6 md:px-5 md:pt-9">
      <Link href="/partner" className="text-sm font-bold text-cyan-300 transition hover:text-cyan-200">← Вернуться к играм</Link>
      <div className="mt-8 rounded-3xl border border-white/10 bg-card px-5 py-10 shadow-xl md:px-8 md:py-14">
        <PlayHowItWorks />
      </div>
    </main>
  );
}
