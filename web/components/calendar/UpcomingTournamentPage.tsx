import Link from 'next/link';
import type { Tournament } from '@/lib/types';
import { buildTournamentMapsUrl } from '@/lib/tournament-links';

function cleanFormat(value: string): string {
  return /thai/i.test(value) ? 'Тайский формат' : value;
}

function cleanLocation(value: string): string {
  return String(value || '').replace(/МАЛИБУ/giu, 'Малибу').replace(/сити\s*молл/giu, 'Сити Молл').trim();
}

function cleanName(tournament: Tournament): string {
  const value = tournament.name
    .replace(/\s*[·|]\s*\d{4}-\d{2}-\d{2}\s*$/u, '')
    .replace(/^THAI\s*[·|:-]?\s*/iu, '')
    .trim();
  return value && !/^\d+$/u.test(value)
    ? value
    : [cleanFormat(tournament.format), tournament.division].filter(Boolean).join(' · ');
}

function dateParts(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: '—', month: 'Дата уточняется', line: value };
  return {
    day: new Intl.DateTimeFormat('ru-RU', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(date).replace('.', ''),
    line: new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(date),
  };
}

function levelLabel(value: string): string {
  const labels: Record<string, string> = { easy: 'Лёгкий уровень', medium: 'Средний уровень', advance: 'Продвинутый уровень', hard: 'Сильный уровень' };
  return labels[value.toLowerCase()] || value;
}

export default function UpcomingTournamentPage({
  tournament,
  related,
  posterSrc,
}: {
  tournament: Tournament;
  related: Tournament[];
  posterSrc: string;
}) {
  const date = dateParts(tournament.date);
  const isFull = tournament.status === 'full' || Number(tournament.spotsLeft ?? 0) <= 0;
  const isCancelled = tournament.status === 'cancelled';
  const fill = tournament.capacity ? Math.min(100, Math.round(tournament.participantCount / tournament.capacity * 100)) : 0;
  const mapsUrl = buildTournamentMapsUrl(tournament.location);
  const ctaLabel = isCancelled ? 'Регистрация закрыта' : isFull ? 'Встать в лист ожидания' : 'Записаться на турнир';
  const image = posterSrc || '/og-banner.jpg';

  return (
    <main className="tournament-public-page mx-auto max-w-6xl px-4 pb-16 pt-6 md:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/calendar" className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-brand">← Все турниры</Link>
        {tournament.goEngineVersion === 2 ? (
          <Link
            href={`/calendar/${encodeURIComponent(tournament.id)}/live`}
            className="inline-flex min-h-10 items-center rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 text-sm font-bold text-emerald-100 transition hover:bg-emerald-500/20"
          >
            LIVE: расписание и сетки →
          </Link>
        ) : null}
      </div>

      <section className="mt-5 overflow-hidden rounded-[32px] border border-white/10 bg-[#111] shadow-[0_32px_100px_rgba(0,0,0,.3)]">
        <div className="grid lg:grid-cols-[1.15fr_.85fr]">
          <div className="relative min-h-[470px] overflow-hidden p-6 md:p-10 lg:min-h-[600px]">
            <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
            <div className="relative flex h-full min-h-[420px] flex-col justify-between lg:min-h-[520px]">
              <div className="flex items-start justify-between gap-4">
                <span className={`rounded-full border px-4 py-2 text-xs font-bold backdrop-blur-md ${isCancelled ? 'border-red-300/30 bg-red-500/20 text-red-100' : isFull ? 'border-amber-300/30 bg-amber-500/20 text-amber-100' : 'border-emerald-300/30 bg-emerald-500/20 text-emerald-100'}`}>
                  {isCancelled ? 'Турнир отменён' : isFull ? 'Основной состав заполнен' : 'Запись открыта'}
                </span>
                <div className="rounded-2xl border border-white/15 bg-black/50 px-5 py-4 text-center backdrop-blur-md">
                  <div className="font-heading text-6xl leading-none text-white">{date.day}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-[.2em] text-brand">{date.month}</div>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.22em] text-brand">{cleanFormat(tournament.format)} · {tournament.division}</p>
                <h1 className="mt-3 max-w-3xl font-heading text-5xl leading-[.92] tracking-wide text-white md:text-7xl">{cleanName(tournament)}</h1>
                <p className="mt-5 text-base font-semibold capitalize text-white/80 md:text-lg">{date.line}{tournament.time ? ` · ${tournament.time.slice(0, 5)}` : ''}</p>
                {tournament.location ? <p className="mt-2 text-sm text-white/55">{cleanLocation(tournament.location)} · Сургут</p> : null}
              </div>
            </div>
          </div>

          <aside className="flex flex-col bg-[#151515] p-6 md:p-8 lg:p-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.22em] text-white/35">Регистрация</p>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div><span className="font-heading text-5xl text-white">{tournament.participantCount}</span><span className="text-lg text-white/30"> / {tournament.capacity}</span></div>
                <span className="pb-1 text-sm text-white/45">участников</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand" style={{ width: `${fill}%` }} /></div>
              <div className="mt-3 flex justify-between text-sm">
                <span className={isFull ? 'text-amber-200' : 'text-emerald-300'}>{isFull ? 'Мест нет' : `Свободно: ${Math.max(0, Number(tournament.spotsLeft ?? tournament.capacity - tournament.participantCount))}`}</span>
                {Number(tournament.waitlistCount ?? 0) > 0 ? <span className="text-white/45">В ожидании: {tournament.waitlistCount}</span> : null}
              </div>
            </div>

            <dl className="mt-8 divide-y divide-white/10 border-y border-white/10">
              <div className="flex justify-between gap-4 py-4"><dt className="text-sm text-white/40">Формат</dt><dd className="text-right text-sm font-semibold text-white/85">{cleanFormat(tournament.format)}</dd></div>
              <div className="flex justify-between gap-4 py-4"><dt className="text-sm text-white/40">Категория</dt><dd className="text-right text-sm font-semibold text-white/85">{tournament.division || 'Открытая'}</dd></div>
              <div className="flex justify-between gap-4 py-4"><dt className="text-sm text-white/40">Уровень</dt><dd className="text-right text-sm font-semibold text-white/85">{levelLabel(tournament.level)}</dd></div>
              <div className="flex justify-between gap-4 py-4"><dt className="text-sm text-white/40">Стоимость</dt><dd className="text-right text-sm font-semibold text-white/85">Уточняется организатором</dd></div>
            </dl>

            <div className="mt-8">
              {isCancelled ? (
                <span className="flex w-full cursor-not-allowed justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-4 font-bold text-white/35">{ctaLabel}</span>
              ) : (
                <Link href={`/calendar/${tournament.id}/register`} className="flex w-full justify-center rounded-xl bg-brand px-5 py-4 font-bold text-black transition hover:bg-brand-light">{ctaLabel}</Link>
              )}
              {isFull ? <p className="mt-3 text-center text-xs leading-5 text-white/40">Если освободится место, первый игрок из списка перейдёт в основной состав автоматически.</p> : <p className="mt-3 text-center text-xs leading-5 text-white/40">Заявка отправится организатору на подтверждение.</p>}
            </div>

            <div className="mt-auto flex flex-wrap gap-2 pt-8">
              <a href={`/api/calendar/${tournament.id}/ics`} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 transition hover:border-brand/35 hover:text-brand">＋ В календарь</a>
              {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 transition hover:border-brand/35 hover:text-brand">↗ Открыть карту</a> : null}
            </div>
          </aside>
        </div>
      </section>

      <nav className="mt-8 flex gap-6 overflow-x-auto border-b border-white/10 text-sm font-semibold text-white/45" aria-label="Разделы турнира">
        <a href="#about" className="border-b-2 border-brand pb-4 text-white">О турнире</a>
        {tournament.participantListText ? <a href="#participants" className="pb-4 transition hover:text-white">Участники</a> : null}
        <a href="#format" className="pb-4 transition hover:text-white">Формат и правила</a>
      </nav>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section id="about" className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-brand">Главное</p>
          <h2 className="mt-3 font-heading text-3xl text-white">О турнире</h2>
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/60">{tournament.description || 'Динамичный турнир по пляжному волейболу для игроков своего уровня. Точный регламент организатор сообщит участникам перед стартом.'}</p>
        </section>
        <section id="format" className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-brand">Как играем</p>
          <h2 className="mt-3 font-heading text-3xl text-white">{cleanFormat(tournament.format)}</h2>
          <p className="mt-4 text-sm leading-7 text-white/60">Составы и площадки формируются организатором. Приходите заранее на разминку и отметку. Итоговые правила и порядок игр будут доступны участникам до начала турнира.</p>
        </section>
      </div>

      {tournament.participantListText ? (
        <section id="participants" className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand">Состав</p><h2 className="mt-3 font-heading text-3xl text-white">Участники</h2></div><span className="text-sm text-white/40">{tournament.participantCount} игроков</span></div>
          <p className="mt-5 whitespace-pre-line text-sm leading-7 text-white/65">{tournament.participantListText}</p>
        </section>
      ) : null}

      {related.length ? (
        <section className="mt-14 border-t border-white/10 pt-10">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-white/35">Следующая игра</p><h2 className="mt-2 font-heading text-3xl text-white">Другие турниры</h2></div><Link href="/calendar" className="text-sm text-brand">Весь календарь →</Link></div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {related.slice(0, 3).map((item) => <Link key={item.id} href={`/calendar/${item.id}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-brand/35"><p className="text-xs capitalize text-brand">{dateParts(item.date).line}</p><h3 className="mt-3 font-heading text-xl text-white">{cleanName(item)}</h3><p className="mt-2 text-xs text-white/40">{cleanFormat(item.format)} · {item.division}</p></Link>)}
          </div>
        </section>
      ) : null}
    </main>
  );
}
