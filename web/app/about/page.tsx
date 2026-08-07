import Link from 'next/link';
import TournamentGallery from '@/components/landing/TournamentGallery';
import { OrganizationSchema } from '@/components/seo/SchemaOrg';

export const metadata = {
  title: 'О нас — Лютые пляжники | LPVOLLEY.RU',
  description:
    'Сообщество любителей пляжного волейбола в Сургуте. Игры, тренировки, турниры. Площадка «Малибу».',
};

const COMMUNITY_BENEFITS = [
  { icon: '🏐', title: 'Разные уровни', description: 'Турниры для разных уровней подготовки', href: '/pravila' },
  { icon: '🔥', title: 'Форматы', description: 'King of the Court, Thai, миксты и командные игры', href: '/pravila#thai' },
  { icon: '📊', title: 'Рейтинг', description: 'Личный рейтинг и статистика игроков', href: '/rankings' },
  { icon: '🤝', title: 'Найди пару', description: 'Поиск напарника на турнир или тренировку', href: '/partner' },
  { icon: '📅', title: 'Календарь', description: 'Удобный календарь ближайших событий', href: '/calendar' },
  { icon: '📸', title: 'Атмосфера', description: 'Яркие игры, фотографии, призы и крутая атмосфера', href: 'https://vk.ru/albums-231914175' },
] as const;

const DIVISIONS = [
  { emoji: '🔥', name: 'HARD', desc: 'Опытные игроки, высокий темп, серьёзная борьба' },
  { emoji: '⚡', name: 'ADVANCE', desc: 'Уверенные пляжники, хорошая техника' },
  { emoji: '🏐', name: 'MEDIUM', desc: 'Средний уровень, развивающиеся игроки' },
  { emoji: '🌱', name: 'LIGHT', desc: 'Новички и любители, первые шаги на песке' },
] as const;

export default function AboutPage() {
  return (
    <div className="bg-surface text-text-primary">
      <OrganizationSchema />

      {/* Hero */}
      <section className="px-4 pb-6 pt-6 md:px-6 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0A0A0F] shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
          <div className="relative px-6 py-10 md:px-12 md:py-16">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(0,209,255,0.12),transparent_36%),radial-gradient(circle_at_100%_15%,rgba(255,90,0,0.14),transparent_34%)]"
              aria-hidden
            />
            <div className="relative">
              <div className="text-[10px] uppercase tracking-[0.3em] text-brand">Пляжный волейбол в Сургуте</div>
              <h1
                className="mt-3 text-3xl font-black uppercase leading-tight tracking-[-0.04em] text-white md:text-5xl"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Лютые пляжники —{' '}
                <span className="bg-gradient-to-r from-[#00D1FF] to-[#FF7A00] bg-clip-text text-transparent">
                  больше, чем волейбол
                </span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72 md:text-base">
                Сообщество любителей пляжного волейбола из Сургута. Объединяем новичков, любителей и
                опытных игроков, проводим регулярные игры, тренировки и турниры разных уровней —
                от первых матчей на песке до настоящих заруб за чемпионство.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72 md:text-base">
                У нас не нужно быть профессионалом. Главное — желание играть, развиваться, знакомиться
                с новыми людьми и получать удовольствие от волейбола.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { href: '/calendar', label: 'Календарь' },
                  { href: '/partner', label: 'Игры и пары' },
                  { href: '/pravila', label: 'Форматы' },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand/40"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Divisions */}
      <section className="px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-brand">Турниры</div>
            <h2
              className="mt-2 text-2xl font-black uppercase tracking-[-0.04em] text-white md:text-3xl"
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              4 дивизиона — каждому по силам
            </h2>
          </div>

          <div className="mb-4 rounded-[20px] border border-white/10 bg-[#11161F] p-5 md:p-6">
            <p className="text-sm leading-7 text-white/72">
              Наши турниры проходят в нескольких дивизионах. Первый круг — общий формат: новички,
              любители и опытные игроки играют вместе. После первого этапа участники распределяются
              по результатам на равные дивизионы. Во втором круге каждый играет с соперниками
              примерно своего уровня.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DIVISIONS.map((d) => (
              <div
                key={d.name}
                className="rounded-[20px] border border-white/10 bg-[#11161F] p-5 text-center transition-colors hover:border-brand/30"
              >
                <div className="text-2xl">{d.emoji}</div>
                <div
                  className="mt-2 text-lg font-black uppercase tracking-wide text-white"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  {d.name}
                </div>
                <div className="mt-1 text-xs text-slate-400">{d.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-brand">Всё для игры</div>
            <h2
              className="mt-2 text-2xl font-black uppercase tracking-[-0.04em] text-white md:text-3xl"
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              Что тебя ждёт
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {COMMUNITY_BENEFITS.map((benefit) => (
              <Link
                key={benefit.title}
                href={benefit.href}
                target={benefit.href.startsWith('http') ? '_blank' : undefined}
                rel={benefit.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-[#11161F] p-3 transition hover:border-brand/40 hover:bg-[#161b26]"
              >
                <span className="text-lg" aria-hidden>{benefit.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{benefit.title}</div>
                  <div className="truncate text-xs text-white/55">{benefit.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <TournamentGallery />

      {/* Location */}
      <section className="px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[20px] border border-white/10 bg-[#11161F] p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-brand">Локация</div>
                <h2
                  className="mt-1 text-xl font-black uppercase tracking-[-0.04em] text-white"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  Где проходят игры
                </h2>
                <p className="mt-2 text-sm text-white/72">
                  Большинство событий проходит на площадках спортивного комплекса{' '}
                  <strong className="text-white">«Малибу»</strong> в Сургуте.
                </p>
              </div>
              <Link
                href="/calendar"
                className="btn-action inline-flex items-center justify-center self-start"
              >
                Смотреть расписание
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
