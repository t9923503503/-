import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KotcNextDemoResetButton } from '@/components/kotc-next/KotcNextDemoResetButton';
import { getKotcNextDemoLandingData } from '@/lib/kotc-next-demo';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const demo = await getKotcNextDemoLandingData(slug);
  if (!demo) {
    return {
      title: 'KOTC Next Demo',
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${demo.tournamentName} · KOTC Next Demo`,
    description: 'Обучающий demo-турнир KOTC Next: judge-экраны, spectator view и reset.',
    robots: { index: false, follow: false },
  };
}

export default async function KotcNextDemoPage({ params }: PageProps) {
  const { slug } = await params;
  const demo = await getKotcNextDemoLandingData(slug);
  if (!demo) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="rounded-3xl border border-white/10 bg-surface-light/20 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
              KOTC Next Demo
            </div>
            <h1 className="mt-4 font-heading text-4xl tracking-wide text-text-primary md:text-5xl">
              {demo.tournamentName}
            </h1>
            <p className="mt-3 text-sm text-text-secondary md:text-base">
              Тренажёр для судей. Ссылка открывает общий demo-турнир: все участники видят одно состояние и могут
              тренироваться на judge-экранах.
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {demo.tournamentDate}
              {demo.tournamentTime ? ` · ${demo.tournamentTime}` : ''}
              {demo.tournamentLocation ? ` · ${demo.tournamentLocation}` : ''}
            </p>
          </div>

          <div className="grid min-w-[240px] gap-3 sm:grid-cols-2 md:grid-cols-1">
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">Stage</div>
              <div className="mt-1 text-lg font-semibold text-text-primary">{demo.stage}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">Courts</div>
              <div className="mt-1 text-lg font-semibold text-text-primary">{demo.courtCount || demo.judgeLinks.length}</div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={demo.spectatorUrl}
            className="inline-flex items-center justify-center rounded-lg border border-brand bg-brand/20 px-6 py-3 text-sm font-semibold text-brand-light hover:bg-brand/30"
          >
            Открыть spectator view
          </Link>
          <KotcNextDemoResetButton slug={demo.slug} />
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-3xl tracking-wide text-text-primary">Judge Links</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Открывайте нужный корт. Если demo уже “накликали”, используйте reset выше и продолжайте тренировку.
            </p>
          </div>
        </div>

        {demo.judgeLinks.length ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {demo.judgeLinks.map((link) => (
              <Link
                key={link.courtId}
                href={link.judgeUrl}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-brand hover:bg-brand/10"
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">{link.label}</div>
                <div className="mt-2 text-lg font-semibold text-text-primary">Судья {link.courtNo}</div>
                <div className="mt-2 font-mono text-sm text-brand">{link.pinCode}</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
            Demo-турнир ещё не подготовлен для judge-ссылок. Выполните reset, чтобы заново собрать R1.
          </div>
        )}
      </section>
    </main>
  );
}
