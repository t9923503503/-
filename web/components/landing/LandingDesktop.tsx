import Link from 'next/link';
import LandingHeroAccessPanel from '@/components/landing/LandingHeroAccessPanel';
import LandingPlayGuide from '@/components/landing/LandingPlayGuide';
import ActivityTabs from '@/components/landing/ActivityTabs';
import type { HomeStats } from '@/lib/queries';
import type { LeaderboardEntry, Tournament } from '@/lib/types';
import MetrikaExternalLink from '@/components/analytics/MetrikaExternalLink';
import { METRIKA_GOALS } from '@/lib/metrika-goals';

interface LandingDesktopProps {
  stats: HomeStats;
  topPlayers: LeaderboardEntry[];
  tournaments: Tournament[];
}

/** CSS-only hero/cards: `/pencil/*.png` were never in git; missing files break prod after rsync --delete on public/. */
const HERO_BACKDROP =
  'absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(0,209,255,0.22),transparent_55%),radial-gradient(ellipse_80%_60%_at_100%_50%,rgba(255,122,0,0.12),transparent_50%),linear-gradient(165deg,#0c1628_0%,#14101c_45%,#0a0a0f_100%)]';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center backdrop-blur-sm">
      <div
        className="text-2xl font-black text-white md:text-3xl"
        style={{ fontFamily: 'Sora, sans-serif' }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
    </div>
  );
}

const QUICK_STEPS = [
  { num: '1', title: 'Зарегистрируйся', text: 'Создай аккаунт — подавай заявки, ищи пару и следи за турнирами.' },
  { num: '2', title: 'Найди пару или заявись', text: 'Ищи напарника в сообществе или выбирай турнир с индивидуальной заявкой.' },
  { num: '3', title: 'Приходи на корт', text: 'Спортивная форма, вода и хорошее настроение. Всё остальное — на месте.' },
] as const;

function QuickSteps() {
  return (
    <section className="px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Как начать</div>
          <h2
            className="mt-2 text-2xl font-black uppercase tracking-[-0.04em] text-white md:text-3xl"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            Три шага до первой игры
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {QUICK_STEPS.map((step) => (
            <div
              key={step.num}
              className="relative overflow-hidden rounded-[20px] border border-white/10 bg-[#11161F] p-5"
            >
              <div
                className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-[#FF8A4C] text-sm font-black text-white"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                {step.num}
              </div>
              <h3 className="text-base font-bold text-white">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{step.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 text-center">
          <Link href="/how-it-works" className="text-sm text-brand transition-colors hover:text-brand/80">
            Подробнее о том, как всё устроено →
          </Link>
        </div>
      </div>
    </section>
  );
}

const COMPACT_FEATURES = [
  { icon: '🏐', title: 'Разные уровни', desc: 'Турниры для новичков, любителей и опытных' },
  { icon: '🔥', title: 'Форматы', desc: 'King of the Court, Thai, миксты' },
  { icon: '📊', title: 'Рейтинг', desc: 'Личный рейтинг и статистика по сезонам' },
  { icon: '📅', title: 'Календарь', desc: 'Удобное расписание всех событий' },
] as const;

function CompactFeatures() {
  return (
    <section className="px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Всё для игры</div>
          <h2
            className="mt-2 text-2xl font-black uppercase tracking-[-0.04em] text-white md:text-3xl"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            Возможности
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMPACT_FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#11161F] p-4 transition-colors hover:border-brand/30"
            >
              <span className="text-xl" aria-hidden>{f.icon}</span>
              <div>
                <div className="text-sm font-bold text-white">{f.title}</div>
                <div className="text-xs text-slate-400">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LandingDesktop({ stats, topPlayers, tournaments }: LandingDesktopProps) {
  return (
    <div className="bg-surface text-text-primary">
      {/* Hero */}
      <section className="px-4 pb-4 pt-4 md:px-6 md:pb-6 md:pt-6">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0A0A0F] shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
          <div className="relative min-h-[280px] overflow-hidden md:min-h-[340px]">
            <div className={HERO_BACKDROP} aria-hidden />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,15,0.12),rgba(10,10,15,0.22)_20%,rgba(10,10,15,0.7)_70%,rgba(10,10,15,0.92))]" />
            <LandingHeroAccessPanel />

            <div className="relative flex min-h-[280px] flex-col items-center justify-end px-5 py-8 text-center md:min-h-[340px] md:justify-center md:px-10 md:py-10">
              <div className="rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.28em] text-brand">
                Сезон 2026 — уже открыт!
              </div>

              <h1
                className="mt-4 text-3xl font-black uppercase leading-[0.95] tracking-[-0.05em] text-white md:mt-5 md:text-6xl lg:text-7xl"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Доминируй
                <br />
                <span className="bg-gradient-to-r from-[#00D1FF] via-[#D8F156] to-[#FF7A00] bg-clip-text text-transparent">
                  на корте
                </span>
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-6 text-white/78 md:mt-5 md:text-base">
                Записывайся на турниры, следи за рейтингом и становись королём пляжного волейбола
              </p>
            </div>
          </div>

          <div className="grid gap-3 border-t border-white/10 bg-[#0A0A0F] px-5 py-4 md:grid-cols-3 md:px-8">
            <StatCard label="Турниров" value={String(stats.tournamentCount)} />
            <StatCard label="Игроков" value={`${stats.playerCount}+`} />
            <StatCard label="Открыто" value={String(stats.openCount)} />
          </div>
        </div>
      </section>

      {/* Activity Tabs: Tournaments + Rating */}
      <ActivityTabs tournaments={tournaments} topPlayers={topPlayers} />

      {/* Play Guide */}
      <LandingPlayGuide />

      {/* Quick Steps */}
      <QuickSteps />

      {/* Compact Features */}
      <CompactFeatures />

      {/* CTA */}
      <section className="px-4 pb-10 pt-4 md:px-6 md:pb-12">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#111827_0%,#0B1019_60%,#111827_100%)] px-5 py-7 md:px-8 md:py-9">
          <div className="flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <div className="text-[10px] uppercase tracking-[0.28em] text-brand/80">LP Volley</div>
              <h2
                className="mt-2 text-2xl font-black uppercase tracking-[-0.04em] text-white md:text-4xl"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Готов к игре?
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/70 md:text-base">
                Выбирай турнир в календаре, находи пару и выходи на песок.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link href="/calendar" className="btn-action inline-flex items-center justify-center">
                Выбрать турнир
              </Link>
              <MetrikaExternalLink
                href="https://vk.com/lpvolley"
                target="_blank"
                rel="noopener noreferrer"
                goalId={METRIKA_GOALS.vkClick}
                goalParams={{ placement: 'landing_bottom_cta' }}
                className="btn-action-outline inline-flex items-center justify-center"
              >
                Мы во ВКонтакте
              </MetrikaExternalLink>
              <a
                href="https://t.me/+ZkXujfqOmNE5ODMy"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action-outline inline-flex items-center justify-center"
              >
                TG
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
