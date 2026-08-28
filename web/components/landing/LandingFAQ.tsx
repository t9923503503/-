'use client';

import { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'Сколько стоит участие?',
    answer: 'Стоимость зависит от конкретного турнира, игры или тренировки. Актуальная цена и способ оплаты указаны в карточке события. Загляни туда перед записью — там всё по-честному и без сюрпризов.',
  },
  {
    question: 'Нужен ли опыт для первого турнира?',
    answer: 'Нет! У нас играют и новички, и опытные пляжники. Выбирай событие подходящего уровня, записывайся и выходи на песок. Лютыми не рождаются — лютыми становятся! 🔥',
  },
  {
    question: 'Что взять с собой на площадку?',
    answer: 'Удобную спортивную форму, воду, полотенце и хорошее настроение. Мячи и сетки мы предоставим. Если игры проходят на солнце, захвати кепку и солнцезащитный крем — заруба должна быть жаркой только на площадке.',
  },
  {
    question: 'Нужно ли приходить со своим напарником?',
    answer: 'На большинство турниров можно записываться одному. Формат предполагает смену партнёров, поэтому за турнир ты успеешь сыграть с разными пляжниками. Если нужна постоянная пара или команда, мы обязательно укажем это в карточке события.',
  },
  {
    question: 'Что такое формат THAI?',
    answer: 'THAI — индивидуальный формат, в котором каждый тур ты играешь с новым случайным партнёром. На площадке четыре команды по очереди разыгрывают короткие матчи до одного победного очка. Максимум игры, минимум ожидания и постоянная смена партнёров и соперников. Победители дивизионов Hard, Advance, Medium и Light забирают призы. Быстро, жарко и по-лютому!',
  },
  {
    question: 'Что такое King of the Court?',
    answer: 'King of the Court — динамичный формат, где команды сражаются за королевскую сторону площадки. Побеждай в розыгрышах, удерживай трон и набирай очки. Здесь некогда скучать: игра идёт быстро, а борьба за корону не прекращается до самого финала. 👑',
  },
  {
    question: 'Как начисляются рейтинговые очки?',
    answer: 'Очки начисляются по итогам рейтинговых турниров согласно их правилам и твоему результату. После подведения итогов рейтинг обновится в профиле. Чем стабильнее играешь — тем выше поднимаешься. Таблица не врёт!',
  },
  {
    question: 'Где проходят игры и турниры?',
    answer: 'Большинство событий проходит на площадках спортивного комплекса «Малибу» в Сургуте, но место может меняться. Точный адрес, дату и время всегда проверяй в карточке события. Не перепутай корт — опоздать на лютую зарубу особенно обидно.',
  },
];

function FaqAccordion({ items }: { items: FAQItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, idx) => {
        const isOpen = openIdx === idx;
        return (
          <div
            key={idx}
            className={`rounded-[20px] border transition-colors ${
              isOpen ? 'border-brand/40 bg-brand/[0.04]' : 'border-white/10 bg-white/[0.02]'
            }`}
          >
            <button
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left md:px-5 md:py-3.5"
            >
              <span
                className={`mt-1 shrink-0 text-brand transition-transform duration-200 ${
                  isOpen ? 'rotate-90' : ''
                }`}
              >
                ▸
              </span>
              <span className="text-[15px] font-semibold leading-snug text-white md:text-base">
                {item.question}
              </span>
            </button>
            {isOpen && (
              <div className="px-5 pb-5 pl-11 md:px-6 md:pb-6 md:pl-12">
                <p className="text-sm leading-7 text-slate-300 md:text-[15px] md:leading-8">
                  {item.answer}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function LandingFAQ() {
  return (
    <section className="px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 text-center">
          <div className="text-[10px] uppercase tracking-[0.28em] text-brand/80">
            Для новичков и не только
          </div>
          <h2
            className="mt-2 text-2xl font-black uppercase tracking-[-0.04em] text-white md:text-4xl"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            Частые вопросы
          </h2>
        </div>

        <FaqAccordion items={FAQ_ITEMS} />

        {/* Schema.org FAQPage — невидимый JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: FAQ_ITEMS.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer,
                },
              })),
            }),
          }}
        />
      </div>
    </section>
  );
}
