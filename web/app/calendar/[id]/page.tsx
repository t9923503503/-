import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import FinishedTournamentPage from '@/components/calendar/FinishedTournamentPage';
import {
  fetchTournamentById,
  fetchTournamentResults,
  fetchTournaments,
} from '@/lib/queries';
import { isThaiAdminFormat } from '@/lib/admin-legacy-sync';
import { getThaiSpectatorBoardPayload } from '@/lib/thai-spectator';
import {
  absoluteLocalPosterForTournamentId,
  localPosterForTournamentId,
} from '@/lib/tournament-poster';
import { buildThaiSpectatorBoardUrl, buildTournamentMapsUrl } from '@/lib/tournament-links';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

function encodeHtmlEntities(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.codePointAt(0);
      return code && code > 127 ? `&#${code};` : char;
    })
    .join('');
}

function EntityText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: encodeHtmlEntities(text) }} />;
}

const FINISHED_TOURNAMENT_HERO_FALLBACKS: Record<string, string> = {
  'a19522bb-864e-4520-8182-61e035c27894':
    'https://lpvolley.ru/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/hero.jpg',
};

function resolveFinishedHeroPhoto(id: string, photoUrl?: string | null): string | null {
  const normalized = String(photoUrl || '').trim();
  return FINISHED_TOURNAMENT_HERO_FALLBACKS[id] || normalized || null;
}

function statusLabel(status: string): string {
  if (status === 'open') return 'Открыта запись';
  if (status === 'full') return 'Основной состав заполнен';
  if (status === 'finished') return 'Турнир завершен';
  if (status === 'cancelled') return 'Турнир отменен';
  return status;
}

function statusHelpText(status: string): string {
  if (status === 'finished' || status === 'cancelled') {
    return 'Регистрация на этот турнир закрыта.';
  }
  if (status === 'full') {
    return 'Новые одобренные заявки попадают в лист ожидания. Если освободится место, перевод происходит автоматически.';
  }
  return 'Заявка сначала попадает на модерацию. После одобрения игрок автоматически добавляется в основной состав турнира.';
}

function statusPill(status: string): string {
  if (status === 'open') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  if (status === 'full') return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
  if (status === 'cancelled') return 'border-red-500/40 bg-red-500/15 text-red-200';
  return 'border-white/10 bg-white/5 text-text-primary/70';
}

function formatDateLabel(date: string, time: string): string {
  if (!date) return 'Дата уточняется';
  try {
    const base = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    }).format(new Date(`${date}T00:00:00`));
    return time ? `${base} · ${time}` : base;
  } catch {
    return [date, time].filter(Boolean).join(' · ');
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchTournamentById(id);

  if (!tournament) {
    return { title: 'Tournament | LPVOLLEY.RU' };
  }

  if (tournament.status === 'finished') {
    const dateLabel = formatDateLabel(tournament.date, tournament.time);
    const heroPhotoUrl = resolveFinishedHeroPhoto(tournament.id, tournament.photoUrl);
    const description = `Tournament results · ${dateLabel}${tournament.location ? ` · ${tournament.location}` : ''}`;
    return {
      title: `Results: ${tournament.name} | LPVOLLEY.RU`,
      description,
      openGraph: {
        title: `Results: ${tournament.name}`,
        description,
        type: 'website',
        locale: 'ru_RU',
        ...(heroPhotoUrl
          ? { images: [{ url: heroPhotoUrl, width: 1200, height: 630 }] }
          : {}),
      },
      ...(heroPhotoUrl
        ? { twitter: { card: 'summary_large_image' as const, images: [heroPhotoUrl] } }
        : {}),
    };
  }

  return {
    title: `${tournament.name} | LPVOLLEY.RU`,
    description:
      tournament.description?.slice(0, 160) ||
      `Tournament details for ${tournament.name}. Registration status, venue, participants and results.`,
    ...(absoluteLocalPosterForTournamentId(tournament.id)
      ? {
          openGraph: {
            title: tournament.name,
            description:
              tournament.description?.slice(0, 160) ||
              `Tournament details for ${tournament.name}. Registration status, venue, participants and results.`,
            type: 'website',
            locale: 'ru_RU',
            images: [
              {
                url: absoluteLocalPosterForTournamentId(tournament.id),
                width: 768,
                height: 1024,
              },
            ],
          },
          twitter: {
            card: 'summary_large_image' as const,
            images: [absoluteLocalPosterForTournamentId(tournament.id)],
          },
        }
      : {}),
  };
}

export default async function TournamentPage({ params }: PageProps) {
  const { id } = await params;
  const tournament = await fetchTournamentById(id);

  if (!tournament) notFound();

  const [tournaments, results, thaiBoard] = await Promise.all([
    fetchTournaments(8),
    tournament.status === 'finished' ? fetchTournamentResults(id) : Promise.resolve([]),
    tournament.status === 'finished' && isThaiAdminFormat(tournament.format)
      ? getThaiSpectatorBoardPayload(id).catch(() => null)
      : Promise.resolve(null),
  ]);

  const related = tournaments.filter((item) => item.id !== tournament.id).slice(0, 4);
  const localPosterSrc = localPosterForTournamentId(tournament.id);

  // Finished tournament gets its own rich landing page
  if (tournament.status === 'finished') {
    return (
      <FinishedTournamentPage
        tournament={tournament}
        results={results}
        related={related}
        thaiBoard={thaiBoard}
        heroPhotoUrl={resolveFinishedHeroPhoto(tournament.id, tournament.photoUrl)}
      />
    );
  }

  const mapsUrl = buildTournamentMapsUrl(tournament.location);
  const partnerUrl = `/partner?tournament=${encodeURIComponent(tournament.id)}`;
  const calendarUrl = `/api/calendar/${tournament.id}/ics`;
  const cta =
    tournament.status === 'cancelled'
      ? null
      : {
          href: `/calendar/${tournament.id}/register`,
          label:
            tournament.status === 'full'
              ? 'Подать заявку в waitlist'
              : 'Подать заявку',
        };

  const metricCards = [
    {
      label: 'Статус',
      value: statusLabel(tournament.status),
      accent: tournament.status,
    },
    {
      label: 'Участники',
      value: `${tournament.participantCount}/${tournament.capacity}`,
      accent: 'neutral',
    },
    tournament.spotsLeft != null
      ? {
          label: 'Свободные места',
          value: String(tournament.spotsLeft),
          accent: tournament.spotsLeft > 0 ? 'open' : 'full',
        }
      : null,
    Number(tournament.waitlistCount ?? 0) > 0
      ? {
          label: 'Лист ожидания',
          value: String(tournament.waitlistCount),
          accent: 'full',
        }
      : null,
    Number(tournament.partnerRequestCount ?? 0) > 0
      ? {
          label: 'Ищут пару',
          value: String(tournament.partnerRequestCount),
          accent: 'partner',
        }
      : null,
  ].filter(Boolean) as { label: string; value: string; accent: string }[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <nav className="text-sm font-body text-text-secondary">
        <Link href="/calendar" className="transition-colors hover:text-brand">
          <EntityText text="← Календарь" />
        </Link>
      </nav>

      <section className="mt-4 rounded-2xl border border-white/10 bg-surface-light/20 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div
              className={[
                'inline-flex rounded-full border px-3 py-1 text-xs font-body font-semibold',
                statusPill(tournament.status),
              ].join(' ')}
            >
              <EntityText text={statusLabel(tournament.status)} />
            </div>
            <h1 className="mt-4 font-heading text-4xl tracking-wide text-text-primary md:text-5xl">
              {tournament.name}
            </h1>
            <p className="mt-3 text-sm font-body text-text-primary/80 md:text-base">
              {formatDateLabel(tournament.date, tournament.time)}
            </p>
            {tournament.location ? (
              <p className="mt-1 text-sm font-body text-text-secondary md:text-base">
                {tournament.location}
              </p>
            ) : null}
          </div>

          <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 md:grid-cols-1">
            {metricCards.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <div className="text-[11px] font-body uppercase tracking-[0.18em] text-text-secondary">
                  <EntityText text={item.label} />
                </div>
                <div className="mt-1 text-lg font-body font-semibold text-text-primary">
                  <EntityText text={item.value} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-body uppercase tracking-[0.18em] text-text-secondary">
              <EntityText text="Формат" />
            </div>
            <div className="mt-2 text-sm font-body text-text-primary">{tournament.format}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-body uppercase tracking-[0.18em] text-text-secondary">
              <EntityText text="Дивизион" />
            </div>
            <div className="mt-2 text-sm font-body text-text-primary">
              {tournament.division || '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-body uppercase tracking-[0.18em] text-text-secondary">
              <EntityText text="Уровень" />
            </div>
            <div className="mt-2 text-sm font-body text-text-primary">
              {tournament.level || '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-body uppercase tracking-[0.18em] text-text-secondary">
              <EntityText text="Для участника" />
            </div>
            <div className="mt-2 text-sm font-body text-text-primary">
              <EntityText text={statusHelpText(tournament.status)} />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {cta ? (
            <Link
              href={cta.href}
              className="inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 font-body font-semibold text-white transition-colors hover:bg-brand-light"
            >
              <EntityText text={cta.label} />
            </Link>
          ) : (
            <span className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-white/10 bg-white/5 px-6 py-3 font-body font-semibold text-text-primary/50">
              <EntityText text="Регистрация закрыта" />
            </span>
          )}

          {isThaiAdminFormat(tournament.format) ? (
            <Link
              href={buildThaiSpectatorBoardUrl(tournament.id)}
              className="inline-flex items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/15 px-6 py-3 font-body font-semibold text-sky-100 transition-colors hover:border-sky-400/60 hover:bg-sky-500/25"
            >
              <EntityText text="Табло для зрителей" />
            </Link>
          ) : null}

          <a
            href={calendarUrl}
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-6 py-3 font-body font-semibold text-text-primary transition-colors hover:border-brand hover:text-brand"
          >
            <EntityText text="Добавить в календарь" />
          </a>

          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-6 py-3 font-body font-semibold text-text-primary transition-colors hover:border-brand hover:text-brand"
            >
              <EntityText text="Открыть карту" />
            </a>
          ) : null}

          <Link
            href={partnerUrl}
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-6 py-3 font-body font-semibold text-text-primary transition-colors hover:border-brand hover:text-brand"
          >
            <EntityText
              text={
                Number(tournament.partnerRequestCount ?? 0) > 0
                  ? `Найти пару (${tournament.partnerRequestCount})`
                  : 'Найти пару'
              }
            />
          </Link>
        </div>

        {tournament.description ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5">
            <h2 className="font-heading text-2xl tracking-wide text-text-primary">
              <EntityText text="Афиша турнира" />
            </h2>
            {localPosterSrc ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <img
                  src={localPosterSrc}
                  alt={`Афиша ${tournament.name}`}
                  className="w-full object-cover"
                  loading="lazy"
                />
              </div>
            ) : null}
            <p className="mt-4 whitespace-pre-line text-sm font-body leading-7 text-text-primary/85">
              {tournament.description}
            </p>
          </div>
        ) : null}

        {results.length > 0 ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-2xl tracking-wide text-text-primary">
                <EntityText text="Результаты" />
              </h2>
              <span className="text-xs font-body text-text-secondary">
                <EntityText text={`${results.length} игроков`} />
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm font-body">
                <thead className="text-text-secondary">
                  <tr className="border-b border-white/10">
                    <th className="pb-3 pr-4"><EntityText text="Место" /></th>
                    <th className="pb-3 pr-4"><EntityText text="Игрок" /></th>
                    <th className="pb-3 pr-4"><EntityText text="Победы" /></th>
                    <th className="pb-3 pr-4">Diff</th>
                    <th className="pb-3 pr-4">Balls</th>
                    <th className="pb-3" title="Очки в общий рейтинг за место">
                      <EntityText text="В рейтинг" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={`${row.playerId}-${row.place}`} className="border-b border-white/5">
                      <td className="py-3 pr-4 text-text-primary">{row.place}</td>
                      <td className="py-3 pr-4 text-text-primary">{row.playerName}</td>
                      <td className="py-3 pr-4 text-text-primary/80">{row.wins}</td>
                      <td className="py-3 pr-4 text-text-primary/80">{row.diff}</td>
                      <td className="py-3 pr-4 text-text-primary/80">{row.balls}</td>
                      <td className="py-3 text-brand">{row.ratingPts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tournament.participantListText ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5">
            <h2 className="font-heading text-2xl tracking-wide text-text-primary">
              <EntityText text="Состав участников" />
            </h2>
            <p className="mt-4 whitespace-pre-line text-sm font-body leading-7 text-text-primary/85">
              {tournament.participantListText}
            </p>
          </div>
        ) : null}
      </section>

      {related.length ? (
        <section className="mt-10">
          <h2 className="font-heading text-3xl tracking-wide text-text-primary">
            <EntityText text="Похожие турниры" />
          </h2>
          <div className="mt-6">
            <CalendarGrid tournaments={related} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
