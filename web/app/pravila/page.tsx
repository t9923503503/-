import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Правила | Лютые Пляжники',
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
  tagline: string;
  description: string;
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
    tagline: 'Займи трон или стой в очереди',
    description:
      'Самый быстрый и жёсткий формат. Пары непрерывно сменяют друг друга на корте. Нет времени на передышку — только агрессия и точный удар.',
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
    tagline: 'Новый сет — новый партнёр. Выживет самый гибкий!',
    description:
      'Турнир, где всё решает химия и адаптивность. Заявляешься один — напарник на каждый сет определяется жребием.',
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
    tagline: 'Двое против всех. Никаких оправданий',
    description:
      'Классика в квадрате. Ты и твой напарник — единое целое. Идёте до конца: либо со щитом, либо на щите.',
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

function FormatCard({ f }: { f: Format }) {
  return (
    <div
      id={f.id}
      className={`scroll-mt-24 rounded-2xl border ${f.color} bg-gradient-to-br ${f.bg} overflow-hidden`}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-4xl">{f.icon}</span>
            <h2 className="font-heading text-3xl text-text-primary mt-2 tracking-wide">
              {f.title}
            </h2>
            <p className="font-body text-text-secondary text-sm">{f.subtitle}</p>
          </div>
        </div>
        <p className="mt-3 font-heading text-brand text-lg italic">
          &laquo;{f.tagline}&raquo;
        </p>
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
      <div className="text-center mb-12">
        <h1 className="font-heading text-5xl md:text-6xl text-brand tracking-wide uppercase">
          Правила
        </h1>
        <p className="mt-4 font-body text-text-secondary text-lg max-w-2xl mx-auto">
          Три игровых режима, три зоны силы, одна цель — стать королём корта.
          Выбери свой формат и вперёд на песок.
        </p>
      </div>

      {/* Quick nav */}
      <nav className="flex flex-wrap justify-center gap-2 mb-14">
        {[
          { href: '#kotc', label: '👑 King of the Court' },
          { href: '#mixup', label: '🌪 Случайные связи' },
          { href: '#double', label: '🧨 Дабл Трабл' },
          { href: '#zones', label: '🏅 Зоны и очки' },
          { href: '#rules', label: '⚡ Регламент' },
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
