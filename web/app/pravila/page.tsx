import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Виды турниров | Лютые Пляжники',
  description:
    'Форматы турниров, зоны, система очков и регламент — всё что нужно знать перед первой игрой.',
};

/* ── data ─────────────────────────────────────────── */

interface Format {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;       // tailwind ring/border accent
  bg: string;           // card gradient
  bannerSrc: string;
  bannerAlt: string;
  tagline: string;
  description: string;
  pills: string[];
  mechanics: string[];
  forWhom: string;
  profit: string;
  stats: { label: string; value: number; max: number }[];
}

const formats: Format[] = [
  {
    id: 'kotc',
    title: 'King of the Court',
    subtitle: 'Король Корта',
    icon: '👑',
    color: 'border-yellow-500/60',
    bg: 'from-yellow-500/10 to-amber-900/10',
    bannerSrc: '/images/pravila/kotc.svg',
    bannerAlt: 'Иллюстрация: King of the Court — король и претендент на площадке',
    tagline: 'Займи трон или стой в очереди',
    description:
      'Самый быстрый и жёсткий формат. Пары непрерывно сменяют друг друга на корте. Нет времени на передышку — только агрессия и точный удар.',
    pills: ['2×2', 'таймер 10–15 мин', 'очки только на стороне короля'],
    mechanics: [
      'Сторона Короля — единственное место, где ты зарабатываешь очки',
      'Сторона Претендента — твой шанс свергнуть монарха',
      'Проиграл — в конец очереди. Выиграл — занимаешь трон',
      'Таймер на раунд 10–15 мин. Сирена — итоги',
    ],
    forWhom: 'Для тех, кто хочет максимум адреналина и быстрый темп',
    profit: 'Личный рейтинг по сумме коронаций за все раунды',
    stats: [
      { label: 'Темп', value: 5, max: 5 },
      { label: 'Физ. нагрузка', value: 4, max: 5 },
      { label: 'Стратегия', value: 3, max: 5 },
      { label: 'Социальность', value: 3, max: 5 },
    ],
  },
  {
    id: 'mixup',
    title: 'Случайные связи',
    subtitle: 'Mix-Up',
    icon: '🌪',
    color: 'border-purple-500/60',
    bg: 'from-purple-500/10 to-fuchsia-900/10',
    bannerSrc: '/images/pravila/mixup.svg',
    bannerAlt: 'Иллюстрация: Mix-Up — перемешивание пар и динамика турнира',
    tagline: 'Новый сет — новый партнёр. Выживет самый гибкий!',
    description:
      'Турнир, где всё решает химия и адаптивность. Заявляешься один — напарник на каждый сет определяется жребием.',
    pills: ['заявка соло', 'пары меняются', 'очки в личный рейтинг'],
    mechanics: [
      'Заявка индивидуальная — приходишь один',
      'Перед каждым сетом жребий / алгоритм определяет пару',
      'Очки капают лично тебе, независимо от напарника',
      'Нельзя винить партнёра — тащи сам!',
    ],
    forWhom: 'Для тех, кто хочет прокачать коммуникацию и найти новых друзей',
    profit: 'Личный рейтинг. Лучшая проверка индивидуального мастерства',
    stats: [
      { label: 'Темп', value: 4, max: 5 },
      { label: 'Физ. нагрузка', value: 3, max: 5 },
      { label: 'Адаптивность', value: 5, max: 5 },
      { label: 'Социальность', value: 5, max: 5 },
    ],
  },
  {
    id: 'double',
    title: 'Дабл Трабл',
    subtitle: 'Double Trouble',
    icon: '🧨',
    color: 'border-red-500/60',
    bg: 'from-red-500/10 to-orange-900/10',
    bannerSrc: '/images/pravila/double.svg',
    bannerAlt: 'Иллюстрация: Double Trouble — стабильная пара против соперников',
    tagline: 'Двое против всех. Никаких оправданий',
    description:
      'Классика в квадрате. Ты и твой напарник — единое целое. Идёте до конца: либо со щитом, либо на щите.',
    pills: ['фикс-пара', 'Round Robin / плей-офф', 'сетка матчей'],
    mechanics: [
      'Заявка парой — стабильный состав на весь турнир',
      'Round Robin или плей-офф в зависимости от количества команд',
      'Каждый матч — сет до 15 или до 21 очков',
      'Максимальная сыгранность решает',
    ],
    forWhom: 'Для сыгранных дуэтов, которые понимают друг друга по взгляду',
    profit: 'Командный триумф и максимальный уровень сыгранности',
    stats: [
      { label: 'Темп', value: 3, max: 5 },
      { label: 'Физ. нагрузка', value: 4, max: 5 },
      { label: 'Сыгранность', value: 5, max: 5 },
      { label: 'Социальность', value: 3, max: 5 },
    ],
  },
];

interface Zone {
  name: string;
  tag: string;
  emoji: string;
  color: string;
  desc: string;
  points: string[];
}

const zones: Zone[] = [
  {
    name: 'Hard',
    tag: 'ТОП',
    emoji: '🔥',
    color: 'border-red-500/50 from-red-500/10 to-red-900/5',
    desc: 'Сильнейшие игроки. Максимальная конкуренция и максимальные очки.',
    points: ['1 место — 100', '2 место — 80', '3 место — 65', '4 место — 55', '5–6 — 45', '7–8 — 35'],
  },
  {
    name: 'Medium',
    tag: '2-Й ЭШЕЛОН',
    emoji: '⚡',
    color: 'border-yellow-500/50 from-yellow-500/10 to-yellow-900/5',
    desc: 'Средний уровень. Хорошая конкуренция с возможностью роста в Hard.',
    points: ['1 место — 60', '2 место — 48', '3 место — 39', '4 место — 33', '5–6 — 27', '7–8 — 21'],
  },
  {
    name: 'Lite',
    tag: '4-Й ЭШЕЛОН',
    emoji: '🍀',
    color: 'border-green-500/50 from-green-500/10 to-green-900/5',
    desc: 'Начинающие и любители. Комфортный старт в соревновательном волейболе.',
    points: ['1 место — 30', '2 место — 24', '3 место — 20', '4 место — 17', '5–6 — 14', '7–8 — 11'],
  },
];

const zonePointsTable = [
  { place: '1 место', hard: 100, medium: 60, lite: 30 },
  { place: '2 место', hard: 80, medium: 48, lite: 24 },
  { place: '3 место', hard: 65, medium: 39, lite: 20 },
  { place: '4 место', hard: 55, medium: 33, lite: 17 },
  { place: '5–6', hard: 45, medium: 27, lite: 14 },
  { place: '7–8', hard: 35, medium: 21, lite: 11 },
] as const;

const courtRules = [
  {
    icon: '⏱',
    title: 'Тайминг',
    text: 'Раунд длится 10–15 минут. Розыгрыш, начавшийся до сирены, доигрывается.',
  },
  {
    icon: '🏐',
    title: 'Подача',
    text: 'Серия начинается с подачи Претендента. Играется до 3 побед в серии (или иное число, объявленное перед турниром).',
  },
  {
    icon: '👨‍⚖️',
    title: 'Судья',
    text: 'Решение судьи — окончательно. Без судьи спорные моменты = переигровка.',
  },
  {
    icon: '🤝',
    title: 'Поведение',
    text: 'Уважение к сопернику и судье обязательно. Грубость = предупреждение или дисквалификация.',
  },
  {
    icon: '📱',
    title: 'Регистрация',
    text: 'Зайди на сайт, выбери турнир в Календаре и нажми «Записаться». Бронь подтверждается оператором.',
  },
  {
    icon: '🎒',
    title: 'Что взять',
    text: 'Спортивная форма, вода, хорошее настроение. Мячи и сетку мы обеспечиваем.',
  },
];

/* ── components ───────────────────────────────────── */

function StatBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-text-secondary font-body shrink-0">{label}</span>
      <div className="flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={`w-5 h-2.5 rounded-sm ${i < value ? 'bg-brand' : 'bg-white/10'}`}
          />
        ))}
      </div>
    </div>
  );
}

function CourtFlow() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-heading text-xs text-text-primary uppercase tracking-widest">
          Схема KOTC за 10 секунд
        </p>
        <a
          href="/images/pravila/court-flow.svg"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-heading uppercase tracking-wider text-text-secondary hover:text-brand transition-colors"
        >
          Открыть
        </a>
      </div>
      <img
        src="/images/pravila/court-flow.svg"
        alt="Схема: сторона короля и претендента, очередь и переходы при победе/поражении"
        loading="lazy"
        className="w-full h-auto rounded-lg bg-black/10 border border-white/10"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          'Очки — только на стороне короля',
          'Проиграл — в очередь',
          'Выиграл у короля — занял трон',
        ].map((t) => (
          <span
            key={t}
            className="text-xs font-body text-text-secondary bg-white/5 rounded px-2 py-1"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function FormatCard({ f }: { f: Format }) {
  return (
    <div
      id={f.id}
      className={`scroll-mt-24 rounded-2xl border ${f.color} bg-gradient-to-br ${f.bg} overflow-hidden`}
    >
      {/* Banner */}
      <div className="relative h-44 md:h-52">
        <img
          src={f.bannerSrc}
          alt={f.bannerAlt}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface/90 via-surface/40 to-transparent" />
        <div className="absolute inset-0 px-6 py-5 flex flex-col justify-end">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{f.icon}</span>
            <div>
              <h2 className="font-heading text-3xl text-text-primary tracking-wide">
                {f.title}
              </h2>
              <p className="font-body text-text-secondary text-sm">{f.subtitle}</p>
            </div>
          </div>
          <p className="mt-2 font-heading text-brand text-lg italic">
            &laquo;{f.tagline}&raquo;
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex flex-wrap gap-2">
          {f.pills.map((p) => (
            <span
              key={p}
              className="text-xs font-heading uppercase tracking-wider text-text-secondary bg-white/5 border border-white/10 rounded-full px-3 py-1"
            >
              {p}
            </span>
          ))}
        </div>
        <p className="mt-3 font-body text-text-secondary text-sm leading-relaxed">
          {f.description}
        </p>
      </div>

      {/* Body — two columns on md+ */}
      <div className="px-6 pb-6 grid md:grid-cols-2 gap-6">
        {/* Left: mechanics */}
        <div>
          <h3 className="font-heading text-sm text-text-primary uppercase tracking-widest mb-3">
            Механика
          </h3>
          <ol className="space-y-2">
            {f.mechanics.map((m, i) => (
              <li key={i} className="flex gap-2 text-sm font-body text-text-secondary">
                <span className="text-brand font-bold shrink-0">{i + 1}.</span>
                {m}
              </li>
            ))}
          </ol>

          {f.id === 'kotc' ? (
            <div className="mt-5">
              <CourtFlow />
            </div>
          ) : null}

          <div className="mt-5 space-y-2">
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-xs font-heading text-text-primary uppercase tracking-wider mb-1">
                Для кого
              </p>
              <p className="text-sm font-body text-text-secondary">{f.forWhom}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-xs font-heading text-text-primary uppercase tracking-wider mb-1">
                Твой профит
              </p>
              <p className="text-sm font-body text-text-secondary">{f.profit}</p>
            </div>
          </div>
        </div>

        {/* Right: stats */}
        <div>
          <h3 className="font-heading text-sm text-text-primary uppercase tracking-widest mb-3">
            Характеристики
          </h3>
          <div className="space-y-3">
            {f.stats.map((s) => (
              <StatBar key={s.label} {...s} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoneCard({ z }: { z: Zone }) {
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${z.color} p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{z.emoji}</span>
        <h3 className="font-heading text-xl text-text-primary">{z.name}</h3>
        <span className="ml-auto text-xs font-heading uppercase tracking-wider text-text-secondary bg-white/10 px-2 py-0.5 rounded-full">
          {z.tag}
        </span>
      </div>
      <p className="text-sm font-body text-text-secondary mb-3">{z.desc}</p>
      <div className="flex flex-wrap gap-2">
        {z.points.map((p) => (
          <span key={p} className="text-xs font-body text-text-secondary bg-white/5 rounded px-2 py-1">
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── page ─────────────────────────────────────────── */

export default function PravilaPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="font-heading text-5xl md:text-6xl text-brand tracking-wide uppercase">
          Виды турниров
        </h1>
        <p className="mt-4 font-body text-text-secondary text-lg max-w-2xl mx-auto">
          Три игровых режима, три зоны силы, одна цель — стать королём корта.
          Выбери свой формат и вперёд на песок.
        </p>
        <div className="mt-6 grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto text-left">
          {[
            { t: 'Понять за минуту', d: 'Схемы и краткие правила — без воды.' },
            { t: 'Выбрать зону', d: 'Hard / Medium / Lite и система очков.' },
            { t: 'Записаться', d: 'Календарь турниров и быстрый старт.' },
          ].map((b) => (
            <div key={b.t} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="font-heading text-sm text-text-primary uppercase tracking-widest mb-1">
                {b.t}
              </p>
              <p className="font-body text-text-secondary text-sm">{b.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick nav */}
      <div className="sticky top-16 z-40 -mx-4 px-4 py-3 mb-10 border-y border-white/10 bg-surface/80 backdrop-blur-xl">
        <nav className="flex flex-wrap justify-center gap-2">
          {[
            { href: '#kotc', label: '👑 King of the Court' },
            { href: '#mixup', label: '🌪 Случайные связи' },
            { href: '#double', label: '🧨 Дабл Трабл' },
            { href: '#zones', label: '🏅 Зоны и очки' },
            { href: '#rules', label: '⚡ Регламент' },
            { href: '#faq', label: '❓ FAQ' },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-4 py-2 rounded-full border border-white/15 bg-white/5 text-sm font-body text-text-secondary hover:border-brand hover:text-brand transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Section: Formats */}
      <section className="mb-16">
        <p className="text-center font-heading text-2xl text-text-primary uppercase tracking-widest mb-8">
          Выбери свой режим битвы
        </p>
        <div className="flex flex-col gap-8">
          {formats.map((f) => (
            <FormatCard key={f.id} f={f} />
          ))}
        </div>
      </section>

      {/* Section: Zones */}
      <section id="zones" className="scroll-mt-24 mb-16">
        <h2 className="font-heading text-3xl text-text-primary mb-2">
          🏅 Зоны и рейтинговые очки
        </h2>
        <p className="font-body text-text-secondary text-sm mb-6">
          Первый раз — выбираешь зону сам. Дальше рейтинг определяет твой уровень.
          Побеждаешь стабильно — поднимаешься выше. В итоговый рейтинг идут лучшие 5–6 результатов сезона.
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {zones.map((z) => (
            <ZoneCard key={z.name} z={z} />
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="font-heading text-sm text-text-primary uppercase tracking-widest mb-4">
            Быстрое сравнение очков
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-[520px] w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-heading uppercase tracking-widest text-text-secondary">
                  <th className="py-2 pr-4">Место</th>
                  <th className="py-2 px-4">Hard</th>
                  <th className="py-2 px-4">Medium</th>
                  <th className="py-2 pl-4">Lite</th>
                </tr>
              </thead>
              <tbody className="text-sm font-body text-text-secondary">
                {zonePointsTable.map((r) => (
                  <tr key={r.place} className="border-t border-white/10">
                    <td className="py-3 pr-4 text-text-primary">{r.place}</td>
                    <td className="py-3 px-4">{r.hard}</td>
                    <td className="py-3 px-4">{r.medium}</td>
                    <td className="py-3 pl-4">{r.lite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Section: Court rules */}
      <section id="rules" className="scroll-mt-24 mb-16">
        <h2 className="font-heading text-3xl text-text-primary mb-6">
          ⚡ Регламент корта
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courtRules.map((r) => (
            <div
              key={r.title}
              className="rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <p className="text-2xl mb-2">{r.icon}</p>
              <h3 className="font-heading text-lg text-brand mb-1">{r.title}</h3>
              <p className="font-body text-text-secondary text-sm leading-relaxed">
                {r.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section: FAQ */}
      <section id="faq" className="scroll-mt-24 mb-16">
        <h2 className="font-heading text-3xl text-text-primary mb-6">
          ❓ FAQ
        </h2>
        <div className="space-y-3">
          {[
            {
              q: 'Сколько длится раунд и что если сирена прозвучала во время розыгрыша?',
              a: 'Обычно 10–15 минут. Розыгрыш, который начался до сирены, доигрывается — потом фиксируются итоги.',
            },
            {
              q: 'Кто судит и что делать в спорной ситуации?',
              a: 'Если есть судья — его решение окончательно. Если судьи нет, спорные мячи по умолчанию переигрываются.',
            },
            {
              q: 'Можно ли поменять зону (Hard/Medium/Lite) по ходу сезона?',
              a: 'Стартовую зону выбираешь сам, дальше уровень определяется рейтингом и решениями организаторов. Если стабильно доминируешь — тебя могут поднять выше.',
            },
            {
              q: 'В Mix-Up как подбираются пары?',
              a: 'Перед каждым сетом пары определяются жребием/алгоритмом. Очки идут в личный рейтинг игрока, а не в «пару».',
            },
            {
              q: 'Что если опоздал/не пришёл партнёр?',
              a: 'Зависит от формата и регламента конкретного турнира. Как правило: либо замена, либо тех. поражение — уточняй у организатора в день игры.',
            },
            {
              q: 'Как подтвердить запись на турнир?',
              a: 'Запись делается через «Календарь», после чего бронь подтверждается оператором (смс/мессенджер).',
            },
          ].map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <summary className="cursor-pointer list-none flex items-start gap-3">
                <span className="mt-0.5 text-brand transition-transform group-open:rotate-90">›</span>
                <span className="font-heading text-text-primary">{item.q}</span>
              </summary>
              <p className="mt-3 font-body text-text-secondary text-sm leading-relaxed pl-6">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="rounded-2xl border border-brand/30 bg-brand/5 p-8 text-center">
        <p className="font-heading text-2xl text-text-primary mb-2">
          Готов к битве?
        </p>
        <p className="font-body text-text-secondary text-sm mb-5">
          Выбери ближайший турнир и запишись прямо сейчас.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href="/calendar"
            className="px-6 py-3 rounded-lg bg-brand text-surface font-heading text-sm uppercase tracking-wider hover:brightness-110 transition"
          >
            Календарь турниров
          </a>
          <a
            href="/rankings"
            className="px-6 py-3 rounded-lg border border-white/20 bg-white/5 font-heading text-sm text-text-primary uppercase tracking-wider hover:border-brand transition"
          >
            Рейтинги
          </a>
        </div>
      </div>
    </main>
  );
}
