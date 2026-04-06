import Link from 'next/link';
import type { Tournament } from '@/lib/types';
import type { TournamentResultRow } from '@/lib/queries';
import { isThaiAdminFormat } from '@/lib/admin-legacy-sync';
import type { ThaiSpectatorBoardPayload } from '@/lib/thai-spectator';
import FinishedTournamentGallery from '@/components/calendar/FinishedTournamentGallery';

interface Props {
  tournament: Tournament;
  results: TournamentResultRow[];
  related: Tournament[];
  thaiBoard?: ThaiSpectatorBoardPayload | null;
  heroPhotoUrl?: string | null;
}

interface FinishedPoolRow {
  place: string;
  left: string;
  right: string;
  leftRatingPts: number;
  rightRatingPts: number;
}

interface FinishedPoolSummary {
  title: string;
  note: string;
  rows: FinishedPoolRow[];
}

interface FinishedTournamentEditorial {
  eyebrow: string;
  title: string;
  subtitle: string;
  ratingIntro: string;
  pools: FinishedPoolSummary[];
  footer: string[];
  factTitle: string;
  factLines: string[];
}

interface FinishedTournamentGalleryEntry {
  src: string;
  caption: string;
}

const FINISHED_EDITORIALS: Record<string, FinishedTournamentEditorial> = {
  'a19522bb-864e-4520-8182-61e035c27894': {
    eyebrow: '🔥 РЕЗУЛЬТАТЫ ТУРНИРА 04.04.2026',
    title: 'ЛЮТЫЕ ПЛЯЖНИКИ × DOUBLE TROUBLE',
    subtitle: '8 туров • разные напарники • каждый сам за себя',
    ratingIntro: 'Ниже сразу видно, кто занял место в своей группе и сколько очков это дало в рейтинг.',
    pools: [
      {
        title: '🏆 HARD',
        note: '👉 Тут не играют. Тут выживают.',
        rows: [
          { place: '🥇', left: 'Рогожкин А (МОНСТРЫ)', right: 'Никифоров (ЛЮТЫЕ)', leftRatingPts: 100, rightRatingPts: 50 },
          { place: '🥈', left: 'Соболев (МОНСТРЫ)', right: 'Килатов (ЛЮТЫЕ)', leftRatingPts: 90, rightRatingPts: 45 },
          { place: '🥉', left: 'Рукавишников (МОНСТРЫ)', right: 'Шперлинг (ЛЮТЫЕ)', leftRatingPts: 82, rightRatingPts: 41 },
          { place: '4️⃣', left: 'Жидков (МОНСТРЫ)', right: 'Терехов (ЛЮТЫЕ)', leftRatingPts: 76, rightRatingPts: 38 },
        ],
      },
      {
        title: '🏆 ADVANCE',
        note: '👉 Ошибка = минус 1 место. Всё честно.',
        rows: [
          { place: '🥇', left: 'Лебедев (МОНСТРЫ)', right: 'Пивин (ЛЮТЫЕ)', leftRatingPts: 70, rightRatingPts: 35 },
          { place: '🥈', left: 'Салим (МОНСТРЫ)', right: 'Камалов (ЛЮТЫЕ)', leftRatingPts: 65, rightRatingPts: 33 },
          { place: '🥉', left: 'Паничкин (МОНСТРЫ)', right: 'Александр (ЛЮТЫЕ)', leftRatingPts: 60, rightRatingPts: 30 },
          { place: '4️⃣', left: 'Фатин (МОНСТРЫ)', right: 'Грузин (ЛЮТЫЕ)', leftRatingPts: 56, rightRatingPts: 28 },
        ],
      },
      {
        title: '🏆 MEDIUM',
        note: '👉 Тут ломались те, кто думал что готов.',
        rows: [
          { place: '🥇', left: 'Шелгачев А (МОНСТРЫ)', right: 'Привет (ЛЮТЫЕ)', leftRatingPts: 52, rightRatingPts: 26 },
          { place: '🥈', left: 'Салмин М (МОНСТРЫ)', right: 'Микуляк (ЛЮТЫЕ)', leftRatingPts: 48, rightRatingPts: 24 },
          { place: '🥉', left: 'Яковлев (МОНСТРЫ)', right: 'Обухов (ЛЮТЫЕ)', leftRatingPts: 44, rightRatingPts: 22 },
          { place: '4️⃣', left: 'Гадаборшев (МОНСТРЫ)', right: 'Шерметов (ЛЮТЫЕ)', leftRatingPts: 42, rightRatingPts: 21 },
        ],
      },
      {
        title: '🏆 LITE',
        note: '👉 Лёгкий? Только на бумаге.',
        rows: [
          { place: '🥇', left: 'Пекшев (МОНСТРЫ)', right: 'Андрей (ЛЮТЫЕ)', leftRatingPts: 38, rightRatingPts: 19 },
          { place: '🥈', left: 'Надымов Н (МОНСТРЫ)', right: 'Степанян (ЛЮТЫЕ)', leftRatingPts: 36, rightRatingPts: 18 },
          { place: '🥉', left: 'Артиков (МОНСТРЫ)', right: 'Мамедов (ЛЮТЫЕ)', leftRatingPts: 34, rightRatingPts: 17 },
          { place: '4️⃣', left: 'Смирнов (МОНСТРЫ)', right: 'Володя (ЛЮТЫЕ)', leftRatingPts: 32, rightRatingPts: 16 },
        ],
      },
    ],
    footer: ['⚡️ Стабильность > случайность', 'Спасибо всем за игру 🤝'],
    factTitle: '💣 ФАКТ ДНЯ',
    factLines: [
      'Каждый играл с разными напарниками.',
      'Но в итоге всё равно всплыли сильнейшие.',
      'Не спрятался.',
      'Не отсиделся.',
      'Не повезло.',
      '⚡️ СЛАБЫХ НЕТ. ЕСТЬ ТЕ, КТО ЛОМАЕТСЯ.',
    ],
  },
};

const FINISHED_TOURNAMENT_GALLERIES: Record<string, FinishedTournamentGalleryEntry[]> = {
  'a19522bb-864e-4520-8182-61e035c27894': [
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-00.jpg',
      caption: 'Общее фото турнира после финала',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-01.jpg',
      caption: 'Аплодисменты и награждение после решающих матчей',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-02.jpg',
      caption: 'Финалисты и участники после окончания игр',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-03.jpg',
      caption: 'Атака у сетки в одном из самых жёстких розыгрышей вечера',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-04.jpg',
      caption: 'Дуэль у сетки и борьба за каждый мяч',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-05.jpg',
      caption: 'Эмоции, улыбки и лёгкий хаос Double Trouble',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-06.jpg',
      caption: 'Приём на песке и игра до последнего касания',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-07.jpg',
      caption: 'Высокий мяч у сетки и полное внимание трибун',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-08.jpg',
      caption: 'Атака с хода и фирменная динамика Thai формата',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-09.jpg',
      caption: 'Спасение мяча в песке, когда розыгрыш уже почти потерян',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-10.jpg',
      caption: 'Розыгрыш под флагами и шум трибун на заднем плане',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-11.jpg',
      caption: 'Сэйв в защите и погоня за каждым очком',
    },
    {
      src: '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-12.jpg',
      caption: 'Момент удара в прыжке под светом площадки',
    },
  ],
};

const FIRE_KEYWORDS = ['МОНСТР', 'ЛЮТ', 'HARD', 'MONSTER', 'BEAST', 'FIRE', 'FIERCE'];
const MEDAL_EMOJI = ['🥇', '🥈', '🥉'];
const MEDAL_BORDER = [
  'border-[#FFD700]/55',
  'border-[#C0C0C0]/45',
  'border-[#CD7F32]/45',
];
const MEDAL_GLOW = [
  'shadow-[0_0_18px_rgba(255,215,0,0.25)]',
  'shadow-[0_0_12px_rgba(192,192,192,0.18)]',
  'shadow-[0_0_10px_rgba(205,127,50,0.18)]',
];

function isFieryCup(name: string): boolean {
  const upper = name.toUpperCase();
  return FIRE_KEYWORDS.some((keyword) => upper.includes(keyword)) || upper.includes('!');
}

function statsCaption(tournament: Pick<Tournament, 'level' | 'format'>): string {
  const level = (tournament.level || '').toLowerCase();
  const format = (tournament.format || '').toLowerCase();
  if (level.includes('hard')) return 'Один из самых жарких турниров сезона 🔥';
  if (format.includes('thai')) return 'Thai формат — настоящий экзамен для игроков ⚡';
  return 'Спасибо всем участникам за огонь и драйв!';
}

function formatDate(date: string, time: string): string {
  if (!date) return 'Дата уточняется';
  try {
    const base = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${date}T00:00:00`));
    return time ? `${base} · ${time}` : base;
  } catch {
    return [date, time].filter(Boolean).join(' · ');
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getFinishedTournamentEditorial(tournamentId: string): FinishedTournamentEditorial | null {
  return FINISHED_EDITORIALS[tournamentId] ?? null;
}

function VkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14C20.67 22 22 20.67 22 15.07V8.93C22 3.33 20.67 2 15.07 2zm3.08 13.5h-1.56c-.59 0-.77-.47-1.83-1.55-.92-.9-1.32-.9-1.55-.9-.31 0-.4.09-.4.52v1.41c0 .37-.12.59-1.1.59-1.62 0-3.41-1-4.67-2.85C5.34 10.66 5 8.66 5 8.28c0-.23.09-.44.52-.44h1.56c.38 0 .53.18.68.6.74 2.14 1.98 4.01 2.49 4.01.19 0 .28-.09.28-.58V9.5c-.06-1.04-.61-1.13-.61-1.5 0-.18.15-.37.38-.37h2.45c.33 0 .44.18.44.55v2.97c0 .33.15.44.24.44.19 0 .35-.11.7-.46 1.08-1.21 1.85-3.07 1.85-3.07.1-.23.29-.44.67-.44h1.56c.47 0 .57.24.47.57-.2.91-2.1 3.6-2.1 3.6-.17.27-.22.39 0 .69.16.22.68.68 1.03 1.09.64.73 1.13 1.35 1.26 1.77.13.41-.08.62-.5.62z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.69 7.96c-.12.56-.46.7-.93.43l-2.58-1.9-1.24 1.2c-.14.14-.25.25-.51.25l.18-2.62 4.72-4.26c.2-.18-.05-.28-.32-.1L7.9 14.38 5.36 13.6c-.55-.17-.56-.55.12-.82l8.94-3.44c.46-.17.86.11.72.82l-.5-.36z" />
    </svg>
  );
}

function Avatar({ photoUrl, name, size }: { photoUrl: string; name: string; size: number }) {
  const sharedClassName = 'rounded-full object-cover flex-shrink-0';
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className={sharedClassName}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`${sharedClassName} bg-white/10 flex items-center justify-center font-heading text-text-primary/80`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}

export default function FinishedTournamentPage({
  tournament,
  results,
  related,
  heroPhotoUrl = null,
}: Props) {
  const { id, name, date, time, location, format, division, level, participantCount, photoUrl } =
    tournament;
  const editorial = getFinishedTournamentEditorial(id);
  const previewPhotoUrl = heroPhotoUrl || photoUrl || null;
  const photoLinkUrl = photoUrl || heroPhotoUrl || null;
  const galleryImages = FINISHED_TOURNAMENT_GALLERIES[id] ?? [];
  const photoActionLabel =
    photoUrl && heroPhotoUrl && photoUrl !== heroPhotoUrl ? 'Открыть фотоотчёт' : 'Открыть фото';
  const primaryAnchor = editorial ? '#editorial' : '#results';
  const resultsActionLabel = editorial
    ? 'Места и рейтинг'
    : '🏆 Результаты турнира';
  const resultsSectionTitle = editorial
    ? 'Таблица начисления рейтинга'
    : 'Таблица результатов';

  const isThai = isThaiAdminFormat(format);
  const pageUrl = `https://lpvolley.ru/calendar/${id}`;
  const vkUrl = `https://vk.com/share.php?url=${encodeURIComponent(pageUrl)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(`Результаты: ${name}`)}`;

  const fiery = isFieryCup(name);
  const isHardLevel = (level || '').toLowerCase().includes('hard');

  const podiumMap = new Map<number, TournamentResultRow>();
  for (const row of results) {
    if (row.place >= 1 && row.place <= 3) {
      const previous = podiumMap.get(row.place);
      if (!previous || row.ratingPts > previous.ratingPts) {
        podiumMap.set(row.place, row);
      }
    }
  }
  const podium = ([1, 2, 3] as const)
    .map((place) => podiumMap.get(place))
    .filter(Boolean) as TournamentResultRow[];

  const totalWins = results.reduce((sum, row) => sum + (row.wins ?? 0), 0);
  const totalBalls = results.reduce((sum, row) => sum + (row.balls ?? 0), 0);
  const topRating = results.length > 0 ? Math.max(...results.map((row) => row.ratingPts)) : 0;

  const nextTournament = related.find((item) => item.status === 'open' || item.status === 'full') ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav aria-label="Навигация" className="anim-fade-up mb-5">
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1 text-sm font-body text-text-secondary transition-colors hover:text-brand"
        >
          <span className="text-base leading-none">&lsaquo;</span> Календарь
        </Link>
      </nav>

      <div className="hero-poster relative overflow-hidden rounded-2xl px-6 py-14 md:py-20 min-h-[420px] flex flex-col justify-end anim-fade-up anim-delay-1">
        {!editorial && heroPhotoUrl ? (
          <img
            src={heroPhotoUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-[1.03] object-cover opacity-45 md:opacity-50 blur-[1px]"
            fetchPriority="high"
            loading="lazy"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/35 to-[#FF5A00]/20 pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          <h1
            className={[
              'font-heading uppercase tracking-tight leading-none text-5xl md:text-7xl text-text-primary',
              fiery ? 'neon-fire' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ textShadow: '0 2px 24px rgba(255,90,0,0.45)' }}
          >
            {name}
          </h1>

          <div className="flex flex-wrap gap-2">
            {format ? (
              <span
                className={[
                  'text-xs px-3 py-1 rounded-full border font-body font-semibold',
                  isThai
                    ? 'border-teal-400/50 bg-teal-400/10 text-teal-300'
                    : 'border-white/20 bg-white/5 text-text-primary/80',
                ].join(' ')}
              >
                {format}
              </span>
            ) : null}
            {division ? (
              <span className="text-xs px-3 py-1 rounded-full border border-white/20 bg-white/5 text-text-primary/70 font-body">
                {division}
              </span>
            ) : null}
            {level ? (
              <span
                className={[
                  'text-xs px-3 py-1 rounded-full border font-body font-semibold',
                  isHardLevel
                    ? 'border-brand/50 bg-brand/15 text-orange-300'
                    : 'border-white/20 bg-white/5 text-text-primary/70',
                ].join(' ')}
              >
                {level}
              </span>
            ) : null}
            {participantCount > 0 ? (
              <span className="text-xs px-3 py-1 rounded-full border border-white/20 bg-white/5 text-text-primary/70 font-body">
                👥 {participantCount} участников
              </span>
            ) : null}
          </div>

          <p className="text-base md:text-lg font-body text-text-primary/90">
            {formatDate(date, time)}
            {location ? (
              <>
                {' '}
                <span className="text-text-secondary">·</span>{' '}
                <span className="text-text-secondary">{location}</span>
              </>
            ) : null}
          </p>

          <div>
            <span className="inline-flex items-center bg-brand text-white font-heading tracking-widest px-5 py-2 rounded-full text-sm neon-fire">
              ТУРНИР ЗАВЕРШЁН
            </span>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-2">
            <a href={primaryAnchor} className="btn-action flex items-center justify-center gap-2">
              {resultsActionLabel}
            </a>

            {photoLinkUrl ? (
              <a
                href={photoLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action-outline flex items-center justify-center gap-2"
                aria-label="Открыть фото турнира"
              >
                📸 {photoActionLabel}
              </a>
            ) : null}

            <a
              href={vkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-action-outline flex items-center justify-center gap-2"
              aria-label="Поделиться во ВКонтакте"
            >
              <VkIcon /> VK
            </a>

            <a
              href={tgUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-action-outline flex items-center justify-center gap-2"
              aria-label="Поделиться в Telegram"
            >
              <TelegramIcon /> Telegram
            </a>
          </div>
        </div>
      </div>

      {editorial ? (
        <section id="editorial" aria-label="Итоги по уровням" className="mt-8 anim-fade-up anim-delay-2">
          <div className="rounded-[28px] border border-brand/30 bg-[linear-gradient(180deg,rgba(18,14,12,0.98),rgba(9,9,14,0.98))] px-5 py-6 shadow-[0_24px_70px_rgba(0,0,0,0.35)] md:px-7">
            <div className="text-[11px] font-body uppercase tracking-[0.24em] text-brand/90">
              {editorial.eyebrow}
            </div>
            <h2 className="mt-2 font-heading text-3xl uppercase tracking-wide text-text-primary md:text-4xl">
              {editorial.title}
            </h2>
            <p className="mt-2 text-sm font-body text-text-secondary md:text-base">
              {editorial.subtitle}
            </p>
            <p className="mt-4 max-w-3xl text-sm font-body text-text-primary/85 md:text-base">
              {editorial.ratingIntro}
            </p>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {editorial.pools.map((pool) => (
                <section
                  key={pool.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading text-2xl uppercase tracking-wide text-text-primary">
                      {pool.title}
                    </h3>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-text-secondary">
                      2 группы × 4 места
                    </span>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                    <div className="hidden grid-cols-[76px,minmax(0,1fr),minmax(0,1fr)] gap-0 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-text-secondary sm:grid">
                      <span>Место</span>
                      <span>Монстры</span>
                      <span>Лютые</span>
                    </div>
                    <div className="divide-y divide-white/8">
                      {pool.rows.map((row) => (
                        <div
                          key={`${pool.title}-${row.place}-${row.left}`}
                          className="grid gap-2 px-3 py-3 sm:grid-cols-[76px,minmax(0,1fr),minmax(0,1fr)] sm:items-stretch"
                        >
                          <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 sm:justify-center">
                            <span className="text-xl leading-none">{row.place}</span>
                            <span className="text-[11px] uppercase tracking-[0.16em] text-text-secondary sm:hidden">
                              место
                            </span>
                          </div>
                          <EditorialRatingCell
                            groupLabel="Монстры"
                            label={row.left}
                            ratingPts={row.leftRatingPts}
                          />
                          <EditorialRatingCell
                            groupLabel="Лютые"
                            label={row.right}
                            ratingPts={row.rightRatingPts}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-body text-brand/90">{pool.note}</p>
                </section>
              ))}
            </div>

            <div className="mt-6">
              <div className="text-[11px] font-body uppercase tracking-[0.24em] text-brand/90">
                Как читать рейтинг
              </div>
              <EditorialRatingInfoGrid />
            </div>

            {isThai ? (
              <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-teal-400/30 bg-teal-400/10 px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[11px] font-body uppercase tracking-[0.24em] text-teal-300">
                    Табло турнира
                  </div>
                  <p className="mt-1 text-sm font-body text-text-primary/85">
                    Подробные игры, туры и архивное Thai-табло — отдельной страницей.
                  </p>
                </div>
                <Link
                  href={`/live/thai/${id}`}
                  className="btn-action-outline inline-flex items-center justify-center gap-2 whitespace-nowrap border-teal-400/45 bg-teal-400/10 text-teal-200 hover:bg-teal-400/20"
                >
                  Результаты игр турнира
                </Link>
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-brand/20 bg-brand/10 px-4 py-4">
              {editorial.footer.map((line) => (
                <p key={line} className="text-base font-body font-semibold text-text-primary">
                  {line}
                </p>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
              <h3 className="font-heading text-2xl uppercase tracking-wide text-text-primary">
                {editorial.factTitle}
              </h3>
              <div className="mt-3 space-y-1 text-sm font-body text-text-primary/90">
                {editorial.factLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {previewPhotoUrl || galleryImages.length > 0 ? (
        <section aria-label="Фото турнира" className="mt-8 anim-fade-up anim-delay-3">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-body uppercase tracking-[0.24em] text-brand/90">
                Фото турнира
              </div>
              <h2 className="mt-1 font-heading text-3xl uppercase tracking-wide text-text-primary">
                Атмосфера площадки
              </h2>
            </div>
            {photoLinkUrl ? (
              <a
                href={photoLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action-outline inline-flex items-center justify-center gap-2"
              >
                📸 {photoActionLabel}
              </a>
            ) : null}
          </div>

          {galleryImages.length > 0 ? (
            <FinishedTournamentGallery
              images={galleryImages.map((image, index) => ({
                src: image.src,
                alt: `Атмосфера площадки ${index + 1} · ${name}`,
                caption: image.caption,
              }))}
            />
          ) : previewPhotoUrl ? (
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
              <img
                src={previewPhotoUrl}
                alt={`Фото турнира ${name}`}
                className="block h-auto w-full object-cover"
                loading="eager"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {!editorial && podium.length >= 1 ? (
        <section aria-label="Победители" className="mt-10 anim-fade-up anim-delay-2">
          <h2 className="font-heading text-3xl md:text-4xl tracking-wide text-text-primary mb-6">
            Победители
          </h2>

          <div className="hidden md:flex items-end justify-center gap-4">
            {podium[1] ? (
              <PodiumSlot row={podium[1]} idx={1} heightClass="h-44" />
            ) : (
              <div className="flex-1 max-w-[180px] h-44" />
            )}
            {podium[0] ? (
              <PodiumSlot row={podium[0]} idx={0} heightClass="h-56" elevated />
            ) : null}
            {podium[2] ? (
              <PodiumSlot row={podium[2]} idx={2} heightClass="h-40" />
            ) : (
              <div className="flex-1 max-w-[180px] h-40" />
            )}
          </div>

          <div className="flex flex-col items-center gap-4 md:hidden">
            {podium.map((row) => (
              <PodiumSlot key={row.playerId} row={row} idx={row.place - 1} heightClass="h-auto" mobile />
            ))}
          </div>
        </section>
      ) : null}

      {!editorial && results.length > 0 ? (
        <div className="mt-8 anim-fade-up anim-delay-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon="👥" label="Участников" value={String(results.length)} />
            <StatCard icon="🔥" label="Матчей сыграно" value={String(totalWins)} />
            {totalBalls > 0 ? (
              <StatCard icon="🏐" label="Мячей в игре" value={String(totalBalls)} />
            ) : null}
            {topRating > 0 ? (
              <StatCard icon="⚡" label="Топ рейтинг" value={`${topRating} pts`} />
            ) : null}
          </div>
          <p className="text-sm font-body text-text-secondary italic mt-3 text-center">
            {statsCaption(tournament)}
          </p>
        </div>
      ) : null}

      {!editorial && results.length > 0 ? (
        <div id="results" className="mt-10 anim-fade-up anim-delay-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-heading text-3xl md:text-4xl tracking-wide text-text-primary">
              {resultsSectionTitle}
            </h2>
            <span className="text-xs font-body text-text-secondary border border-white/10 rounded-full px-3 py-1">
              {results.length} игроков
            </span>
          </div>
          <ResultsTable results={results} />
        </div>
      ) : null}

      {nextTournament ? (
        <div className="mt-8 anim-fade-up anim-delay-4">
          <div className="border border-brand/40 bg-brand/5 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-body uppercase tracking-[0.18em] text-brand mb-1">
                Следующий турнир
              </p>
              <h3 className="font-heading text-2xl text-text-primary">{nextTournament.name}</h3>
              <p className="text-sm font-body text-text-secondary mt-1">
                {formatDate(nextTournament.date, nextTournament.time)}
                {nextTournament.location ? ` · ${nextTournament.location}` : ''}
              </p>
            </div>
            <Link
              href={`/calendar/${nextTournament.id}`}
              className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 font-body font-semibold text-white transition-colors hover:bg-brand-light whitespace-nowrap"
            >
              Подробнее →
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function PodiumSlot({
  row,
  idx,
  heightClass,
  elevated = false,
  mobile = false,
}: {
  row: TournamentResultRow;
  idx: number;
  heightClass: string;
  elevated?: boolean;
  mobile?: boolean;
}) {
  const safeIdx = Math.min(Math.max(idx, 0), 2);
  return (
    <div
      className={[
        'flex-1 max-w-[200px] rounded-2xl p-4 flex flex-col items-center justify-end gap-2',
        'bg-gradient-to-t from-amber-900/30 to-black/50',
        'border-2',
        MEDAL_BORDER[safeIdx],
        MEDAL_GLOW[safeIdx],
        elevated ? 'rank-1-expanded' : '',
        heightClass,
        mobile ? 'w-full max-w-[260px]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Avatar photoUrl={row.playerPhotoUrl} name={row.playerName} size={72} />
      <span role="img" aria-label={`${row.place} место`} className="text-3xl leading-none mt-1">
        {MEDAL_EMOJI[safeIdx]}
      </span>
      <p className="font-heading text-lg text-text-primary text-center leading-tight">
        {row.playerName}
      </p>
      {row.ratingPts > 0 ? (
        <p className="text-brand font-semibold text-sm font-body">{row.ratingPts} pts</p>
      ) : null}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
      <div className="text-[11px] font-body uppercase tracking-[0.18em] text-text-secondary">
        {icon} {label}
      </div>
      <div className="text-xl font-heading text-text-primary mt-1">{value}</div>
    </div>
  );
}

function EditorialRatingCell({
  groupLabel,
  label,
  ratingPts,
}: {
  groupLabel: string;
  label: string;
  ratingPts: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.04] px-3 py-3">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.16em] text-text-secondary sm:hidden">
          {groupLabel}
        </div>
        <div className="truncate text-sm font-body text-text-primary">{label}</div>
      </div>
      <div className="shrink-0 rounded-full border border-brand/30 bg-brand/12 px-3 py-1 text-right">
        <div className="text-[10px] uppercase tracking-[0.16em] text-text-secondary">в рейтинг</div>
        <div className="text-sm font-body font-semibold text-brand">{ratingPts} pts</div>
      </div>
    </div>
  );
}

function EditorialRatingInfoGrid() {
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-brand/90">1. За что очки</div>
        <p className="mt-2 text-sm font-body text-text-primary/90">
          Рейтинг здесь начисляется за итоговое место игрока в своей группе, а не за промежуточные победы, diff или мячи.
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-brand/90">2. Почему два золота</div>
        <p className="mt-2 text-sm font-body text-text-primary/90">
          В этом Double Trouble было две параллельные сетки: «Монстры» и «Лютые». Поэтому у каждого уровня есть свой победитель
          и призёры в обеих группах.
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-brand/90">3. Почему нули в статах</div>
        <p className="mt-2 text-sm font-body text-text-primary/90">
          Колонки «Победы / Diff / Мячи» в этой архивной выгрузке не определяют итоговый рейтинг. Ключевые поля здесь: место и
          начисленные очки.
        </p>
      </div>
    </div>
  );
}

function ResultsTable({ results }: { results: TournamentResultRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
      <table role="table" className="min-w-full text-sm font-body">
        <thead>
          <tr className="sticky top-0 bg-surface/95 border-b border-white/10 text-text-secondary text-xs">
            <th className="px-4 py-3 text-left font-medium w-12">Место</th>
            <th className="px-4 py-3 text-left font-medium">Игрок</th>
            <th className="px-4 py-3 text-center font-medium">Победы</th>
            <th className="px-4 py-3 text-center font-medium">Diff</th>
            <th className="px-4 py-3 text-center font-medium">Мячи</th>
            <th className="px-4 py-3 text-right font-medium" title="Очки в рейтинг">
              В рейтинг
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((row) => {
            const medalIdx = row.place - 1;
            const hasMedal = medalIdx >= 0 && medalIdx <= 2;
            const borderClass = hasMedal
              ? [
                  'border-l-4 border-[#FFD700]/70',
                  'border-l-4 border-[#C0C0C0]/60',
                  'border-l-4 border-[#CD7F32]/60',
                ][medalIdx]
              : 'border-l-4 border-transparent';

            return (
              <tr
                key={`${row.playerId}-${row.place}`}
                className={`border-b border-white/5 ${borderClass} ${hasMedal ? 'bg-white/[0.02]' : ''}`}
              >
                <td className="px-4 py-3 text-text-primary font-semibold">
                  {hasMedal ? (
                    <span role="img" aria-label={`${row.place} место`}>
                      {MEDAL_EMOJI[medalIdx]}
                    </span>
                  ) : (
                    row.place
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar photoUrl={row.playerPhotoUrl} name={row.playerName} size={28} />
                    <span className="text-text-primary">{row.playerName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-text-primary/80">{row.wins}</td>
                <td className="px-4 py-3 text-center text-text-primary/80">{row.diff}</td>
                <td className="px-4 py-3 text-center text-text-primary/80">{row.balls}</td>
                <td className="px-4 py-3 text-right text-brand font-semibold">{row.ratingPts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
