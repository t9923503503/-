'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

type FlowKey = 'find' | 'create';

type GuideStep = {
  image: string;
  title: string;
  text: string;
  alt: string;
  imageClassName?: string;
  imageWidth: number;
  imageHeight: number;
};

const FLOWS: Record<FlowKey, {
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  href: string;
  steps: GuideStep[];
}> = {
  find: {
    eyebrow: 'Ищу, где поиграть',
    title: 'Как найти игру',
    description: 'Выберите подходящее событие, проверьте детали и запишитесь в состав.',
    action: 'Посмотреть игры',
    href: '/partner?tab=games&view=all',
    steps: [
      {
        image: '/images/play/how-it-works/real-step-1-browse.webp',
        title: 'Откройте ленту',
        text: 'Переключайтесь между играми и тренировками. Во вкладке «Для тебя» собраны ближайшие подходящие события.',
        alt: 'Лента ближайших игр LPVolley на мобильном телефоне',
        imageWidth: 620,
        imageHeight: 1102,
      },
      {
        image: '/images/play/how-it-works/real-step-2-join.webp',
        title: 'Выберите игру',
        text: 'В карточке сразу видны дата, время, площадка, уровень, стоимость и количество свободных мест.',
        alt: 'Карточка открытой игры LPVolley со свободными местами',
        imageWidth: 620,
        imageHeight: 1102,
      },
      {
        image: '/images/play/how-it-works/published-game.png',
        title: 'Запишитесь в состав',
        text: 'Откройте игру и нажмите «Войти и записаться». Если основной состав заполнен, можно встать в лист ожидания.',
        alt: 'Страница игры LPVolley с кнопкой записи и подробностями события',
        imageClassName: 'object-cover object-top',
        imageWidth: 882,
        imageHeight: 677,
      },
    ],
  },
  create: {
    eyebrow: 'Хочу собрать свою игру',
    title: 'Как создать игру',
    description: 'Создание занимает около минуты: выберите формат, заполните основные поля и опубликуйте.',
    action: 'Создать игру',
    href: '/partner/manage',
    steps: [
      {
        image: '/images/play/how-it-works/create-dashboard.png',
        title: 'Нажмите «Создать игру»',
        text: 'В кабинете организатора выберите «Игра». Для регулярного события можно повторить прошлое или использовать шаблон.',
        alt: 'Кабинет организатора LPVolley с выбором игры или тренировки',
        imageClassName: 'object-cover object-top',
        imageWidth: 916,
        imageHeight: 937,
      },
      {
        image: '/images/play/how-it-works/create-dashboard.png',
        title: 'Заполните короткую форму',
        text: 'Укажите формат, дату, время, площадку, уровень, стоимость и количество игроков — остальное можно настроить позже.',
        alt: 'Экран создания и управления событиями LPVolley',
        imageClassName: 'object-cover object-center',
        imageWidth: 916,
        imageHeight: 937,
      },
      {
        image: '/images/play/how-it-works/published-game.png',
        title: 'Опубликуйте и приглашайте',
        text: 'Готовая игра появится в общей ленте. В кабинете можно менять условия, следить за составом и повторять событие.',
        alt: 'Опубликованная игра LPVolley с составом и площадкой',
        imageClassName: 'object-cover object-top',
        imageWidth: 882,
        imageHeight: 677,
      },
    ],
  },
};

export default function PlayHowItWorks({ compact = false, embedded = false }: { compact?: boolean; embedded?: boolean }) {
  const [activeFlow, setActiveFlow] = useState<FlowKey>('find');
  const [showMobileScreenshots, setShowMobileScreenshots] = useState(false);
  const flow = FLOWS[activeFlow];
  const compactMobile = compact && embedded;

  return (
    <section id={embedded ? undefined : 'how-it-works'} className={compact && !embedded ? 'mt-12' : ''}>
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-brand">Новая инструкция со скриншотами</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-text-primary md:text-4xl">Играть или собрать свою?</h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">Выберите задачу — покажем весь путь по шагам.</p>
      </div>

      <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 rounded-2xl bg-surface-lighter p-1.5" role="tablist" aria-label="Выбор инструкции">
        {(['find', 'create'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeFlow === key}
            onClick={() => {
              setActiveFlow(key);
              setShowMobileScreenshots(false);
            }}
            className={`rounded-xl px-3 py-3 text-sm font-black transition ${activeFlow === key ? 'bg-card text-text-primary shadow-sm ring-1 ring-white/10' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {key === 'find' ? '🔎 Найти игру' : '➕ Создать игру'}
          </button>
        ))}
      </div>

      <div className="mt-7 text-center" aria-live="polite">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-300">{flow.eyebrow}</p>
        <h3 className="mt-1 text-2xl font-black tracking-tight text-text-primary">{flow.title}</h3>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{flow.description}</p>
      </div>

      {compactMobile ? (
        <div className="mt-6 grid gap-3 md:hidden" role="tabpanel">
          {flow.steps.map((step, index) => (
            <article key={`mobile:${activeFlow}:${step.title}`} className="flex gap-3 rounded-2xl border border-white/10 bg-surface/60 p-4">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{index + 1}</span>
              <div>
                <h4 className="text-sm font-black tracking-tight text-text-primary">{step.title}</h4>
                <p className="mt-1 text-sm leading-5 text-text-secondary">{step.text}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className={`mt-7 ${compactMobile ? 'hidden md:grid' : 'grid'} gap-7 ${compact ? 'lg:gap-5' : 'lg:gap-8'} md:grid-cols-3`} role={compactMobile ? undefined : 'tabpanel'}>
        {flow.steps.map((step, index) => (
          <article key={`${activeFlow}:${step.title}`} className="group flex flex-col rounded-2xl border border-white/10 bg-surface/60 p-3 shadow-sm">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-white shadow-[0_16px_36px_rgba(2,8,23,0.18)] ring-1 ring-black/5">
              <Image
                src={step.image}
                alt={step.alt}
                width={step.imageWidth}
                height={step.imageHeight}
                sizes="(max-width: 767px) 90vw, 30vw"
                className={`h-full w-full transition duration-300 group-hover:scale-[1.02] ${step.imageClassName ?? 'object-cover object-top'}`}
              />
              <span className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-black text-white shadow-lg shadow-orange-950/25">{index + 1}</span>
            </div>
            <div className="flex flex-1 flex-col px-1 pb-2 pt-4">
              <h4 className="text-base font-black tracking-tight text-text-primary">{step.title}</h4>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{step.text}</p>
            </div>
          </article>
        ))}
      </div>

      {compactMobile ? (
        <div className="mt-4 md:hidden">
          <button
            type="button"
            aria-expanded={showMobileScreenshots}
            aria-controls="mobile-guide-screenshots"
            onClick={() => setShowMobileScreenshots((current) => !current)}
            className="flex min-h-11 w-full items-center justify-center rounded-xl border border-white/12 bg-surface px-4 py-2.5 text-sm font-black text-text-primary transition hover:border-cyan-300/35"
          >
            {showMobileScreenshots ? 'Скрыть примеры экранов' : 'Показать примеры экранов'}
          </button>
          {showMobileScreenshots ? (
            <div id="mobile-guide-screenshots" className="mt-3 grid gap-3">
              {flow.steps.map((step, index) => (
                <figure key={`mobile-shot:${activeFlow}:${step.title}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white p-2 shadow-sm">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-white">
                    <Image
                      src={step.image}
                      alt={step.alt}
                      width={step.imageWidth}
                      height={step.imageHeight}
                      sizes="90vw"
                      className={`h-full w-full ${step.imageClassName ?? 'object-cover object-top'}`}
                    />
                    <span className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{index + 1}</span>
                  </div>
                  <figcaption className="px-1 pb-1 pt-3 text-sm font-black text-slate-900">{step.title}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-7 flex justify-center">
        <Link href={flow.href} className="rounded-xl bg-brand px-6 py-3 text-sm font-black text-white shadow-lg shadow-orange-950/20 transition hover:-translate-y-0.5">
          {flow.action} →
        </Link>
      </div>
    </section>
  );
}
