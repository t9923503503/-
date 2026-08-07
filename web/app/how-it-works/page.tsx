import Link from 'next/link';
import LandingFAQ from '@/components/landing/LandingFAQ';

export const metadata = {
  title: 'Как начать играть — LPVOLLEY.RU',
  description:
    'Первый турнир по пляжному волейболу в Сургуте: регистрация, поиск пары, форматы, FAQ. Всё, что нужно новичку.',
};

const STEPS = [
  {
    num: '1',
    title: 'Зарегистрируйся',
    text: 'Создай аккаунт игрока — так ты сможешь подавать заявки, искать пару и следить за своими турнирами.',
    action: { href: '/login', label: 'Создать аккаунт →' },
  },
  {
    num: '2',
    title: 'Найди пару или заявись один',
    text: 'Ищи напарника в сообществе или выбирай турнир с индивидуальной заявкой — подходящий вариант найдётся для каждого.',
    action: { href: '/partner', label: 'Найти пару →' },
  },
  {
    num: '3',
    title: 'Приходи на корт в «Малибу»',
    text: 'В карточке турнира будут дата, время и площадка. Возьми спортивную форму, воду и приходи немного заранее — остальное расскажем на месте.',
    action: { href: '/calendar', label: 'Выбрать турнир →' },
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div className="bg-surface text-text-primary">
      {/* Hero */}
      <section className="px-4 pb-6 pt-6 md:px-6 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0A0A0F] shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
          <div className="relative px-6 py-10 md:px-12 md:py-16">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(0,209,255,0.12),transparent_36%),radial-gradient(circle_at_100%_15%,rgba(255,90,0,0.14),transparent_34%)]"
              aria-hidden
            />
            <div className="relative">
              <div className="text-[10px] uppercase tracking-[0.3em] text-brand">Для новичков и не только</div>
              <h1
                className="mt-3 text-3xl font-black uppercase leading-tight tracking-[-0.04em] text-white md:text-5xl"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Первый турнир —{' '}
                <span className="bg-gradient-to-r from-[#00D1FF] to-[#FF7A00] bg-clip-text text-transparent">
                  это просто
                </span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72 md:text-base">
                Даже если ты впервые выходишь на песок, до своей первой игры всего три шага.
                Уровень и опыт не важны — подскажем формат и поможем освоиться.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="relative overflow-hidden rounded-[20px] border border-white/10 bg-[#11161F] p-5"
              >
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-[#FF8A4C] text-sm font-black text-white"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  {step.num}
                </div>
                <h2 className="text-lg font-bold text-white">{step.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.text}</p>
                <Link
                  href={step.action.href}
                  className="mt-4 inline-block text-sm font-semibold text-brand transition-colors hover:text-brand/80"
                >
                  {step.action.label}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Formats hint */}
      <section className="px-4 py-4 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[20px] border border-white/10 bg-[#11161F] p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-brand">Форматы</div>
                <h2
                  className="mt-1 text-lg font-black uppercase tracking-[-0.04em] text-white"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  Не уверен, какой формат выбрать?
                </h2>
                <p className="mt-1 text-sm text-white/72">
                  Начни с ближайшего события для своего уровня.
                </p>
              </div>
              <Link
                href="/pravila"
                className="btn-action-outline inline-flex items-center justify-center self-start"
              >
                Посмотреть правила
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <LandingFAQ />

      {/* CTA */}
      <section className="px-4 pb-10 pt-4 md:px-6 md:pb-12">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#111827_0%,#0B1019_60%,#111827_100%)] px-5 py-7 md:px-8 md:py-9">
          <div className="flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <div className="text-[10px] uppercase tracking-[0.28em] text-brand/80">Готов?</div>
              <h2
                className="mt-2 text-2xl font-black uppercase tracking-[-0.04em] text-white md:text-3xl"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Выходи на песок
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/70 md:text-base">
                Выбирай турнир в календаре, находи пару и становись частью «Лютых пляжников».
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link href="/calendar" className="btn-action inline-flex items-center justify-center">
                Выбрать турнир
              </Link>
              <a
                href="https://t.me/+ZkXujfqOmNE5ODMy"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action-outline inline-flex items-center justify-center"
              >
                Telegram
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
