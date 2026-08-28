'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import MetrikaExternalLink from '@/components/analytics/MetrikaExternalLink';
import { METRIKA_GOALS, reachMetrikaGoal } from '@/lib/metrika-goals';

const DEFAULT_BOT = 'Lpvolley_bot';
const COMMUNITY_URL = 'https://t.me/+ZkXujfqOmNE5ODMy';

type TelegramState = 'guest' | 'loading' | 'unlinked' | 'linked' | 'error';

function safeBotName(value: unknown): string {
  const candidate = String(value || '').replace(/^@/, '').trim();
  return /^[A-Za-z0-9_]{5,64}$/.test(candidate) ? candidate : DEFAULT_BOT;
}

function isTelegramUrl(value: unknown): value is string {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 't.me';
  } catch {
    return false;
  }
}

export default function PartnerTelegramCallout({ authenticated }: { authenticated: boolean }) {
  const [state, setState] = useState<TelegramState>(authenticated ? 'loading' : 'guest');
  const [bot, setBot] = useState(DEFAULT_BOT);
  const [linkingAvailable, setLinkingAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const authState = state === 'linked' ? 'linked' : authenticated ? 'authenticated' : 'guest';
  const botUrl = `https://t.me/${bot}`;

  const checkLink = useCallback(async () => {
    if (!authenticated) {
      setState('guest');
      return;
    }

    setState('loading');
    setStatus('');
    try {
      const response = await fetch('/api/auth/telegram-link', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState(response.status === 401 ? 'unlinked' : 'error');
        setStatus(response.status === 401 ? 'Сессия устарела — войдите снова, чтобы подключить уведомления.' : 'Не удалось проверить привязку. Бот всё равно доступен по обычной ссылке.');
        return;
      }
      setBot(safeBotName(data.bot));
      setLinkingAvailable(Boolean(data.linkingAvailable));
      setState(data.linked ? 'linked' : 'unlinked');
    } catch {
      setState('error');
      setStatus('Не удалось проверить привязку. Бот всё равно доступен по обычной ссылке.');
    }
  }, [authenticated]);

  useEffect(() => {
    void checkLink();
  }, [checkLink]);

  async function connectTelegram() {
    if (!linkingAvailable) return;
    setBusy(true);
    setStatus('');
    reachMetrikaGoal(METRIKA_GOALS.telegramClick, {
      placement: 'partner_callout',
      action: 'connect_start',
      authState,
    });

    try {
      const response = await fetch('/api/auth/telegram-link', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.assign('/login?returnTo=%2Fpartner%23telegram-bot');
        return;
      }
      if (!response.ok || !isTelegramUrl(data.url)) {
        setState('error');
        setStatus(data.error || 'Не удалось создать безопасную ссылку. Попробуйте ещё раз или откройте бота напрямую.');
        reachMetrikaGoal(METRIKA_GOALS.telegramClick, {
          placement: 'partner_callout',
          action: 'connect_error',
          authState,
        });
        return;
      }

      reachMetrikaGoal(METRIKA_GOALS.telegramClick, {
        placement: 'partner_callout',
        action: 'connect_link_created',
        authState,
      });
      window.location.assign(data.url);
    } catch {
      setState('error');
      setStatus('Ошибка сети. Попробуйте ещё раз или откройте бота напрямую.');
    } finally {
      setBusy(false);
    }
  }

  const externalGoalParams = { placement: 'partner_callout', action: 'bot_open', authState };

  return (
    <section
      id="telegram-bot"
      className="relative mt-5 scroll-mt-24 overflow-hidden rounded-3xl border border-cyan-300/25 bg-[radial-gradient(circle_at_top_left,rgba(0,209,255,0.2),transparent_38%),linear-gradient(135deg,#0c1828_0%,#102d45_58%,#0c5361_100%)] px-5 py-6 text-white shadow-[0_20px_55px_rgba(2,12,27,0.28)] md:px-7 md:py-7"
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full border border-white/10 bg-white/[0.035]" aria-hidden="true" />
      <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/25" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M21.7 3.4 18.6 20c-.2 1.2-.9 1.5-1.9.9l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.4-.1-.6-.6-.2L6.3 13.8l-4.7-1.5c-1-.3-1-1 .2-1.5L20.2 3.7c.9-.3 1.7.2 1.5-.3Z" /></svg>
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Telegram-помощник</p>
              <h2 className="mt-0.5 text-2xl font-black tracking-tight md:text-3xl">Игра рядом — бот напомнит</h2>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm font-medium leading-6 text-white/78">
            Смотрите ближайшие игры и турниры, записывайтесь, получайте подтверждения, изменения состава и напоминания.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-cyan-50">
            {['Ближайшие игры', 'Запись в состав', 'Изменения и напоминания'].map((item) => (
              <span key={item} className="rounded-full border border-white/12 bg-white/[0.07] px-3 py-1.5">✓ {item}</span>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/62">
            Новости и общение —{' '}
            <MetrikaExternalLink
              href={COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              goalId={METRIKA_GOALS.telegramClick}
              goalParams={{ placement: 'partner_callout', action: 'community_open', authState }}
              className="font-bold text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-white"
            >
              в Telegram-сообществе
            </MetrikaExternalLink>
          </p>
        </div>

        <div className="min-w-0 rounded-2xl border border-white/12 bg-black/15 p-4 backdrop-blur-sm lg:w-[290px]">
          {state === 'loading' ? <p className="text-xs font-bold text-cyan-100">Проверяем привязку…</p> : null}
          {state === 'linked' ? <p className="text-xs font-black text-emerald-200">✓ Telegram подключён</p> : null}
          {state === 'unlinked' ? (
            <p className="text-xs font-bold text-cyan-100">
              {linkingAvailable ? 'Подключите аккаунт для личных уведомлений' : 'Привязка временно недоступна'}
            </p>
          ) : null}
          {state === 'guest' ? <p className="text-xs font-bold text-cyan-100">Бот показывает игры и турниры и помогает войти на сайт</p> : null}
          {state === 'error' ? <p className="text-xs font-bold text-amber-200">Связь с профилем временно недоступна</p> : null}

          <div className="mt-3 grid gap-2">
            {state === 'unlinked' && linkingAvailable ? (
              <button
                type="button"
                onClick={() => void connectTelegram()}
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? 'Создаём ссылку…' : 'Подключить уведомления'}
              </button>
            ) : (
              <MetrikaExternalLink
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                goalId={METRIKA_GOALS.telegramClick}
                goalParams={externalGoalParams}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
              >
                Открыть @{bot}
              </MetrikaExternalLink>
            )}

            {state === 'guest' ? (
              <Link
                href="/login?returnTo=%2Fpartner%23telegram-bot"
                onClick={() => reachMetrikaGoal(METRIKA_GOALS.telegramClick, { placement: 'partner_callout', action: 'login_to_connect', authState })}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/18 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Войти на сайт
              </Link>
            ) : null}
            {state === 'linked' ? (
              <Link href="/profile?tab=settings#telegram" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/18 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10">
                Настройки
              </Link>
            ) : null}
            {state === 'unlinked' && linkingAvailable ? (
              <MetrikaExternalLink href={botUrl} target="_blank" rel="noopener noreferrer" goalId={METRIKA_GOALS.telegramClick} goalParams={externalGoalParams} className="text-center text-xs font-bold text-cyan-200 hover:text-white">
                Просто открыть @{bot}
              </MetrikaExternalLink>
            ) : null}
            {state === 'error' ? (
              <button type="button" onClick={() => void checkLink()} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/18 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10">
                Повторить проверку
              </button>
            ) : null}
          </div>
          {status ? <p role="status" className="mt-3 text-xs leading-5 text-amber-100">{status}</p> : null}
        </div>
      </div>
    </section>
  );
}
