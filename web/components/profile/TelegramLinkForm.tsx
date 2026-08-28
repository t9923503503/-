"use client";

import { useEffect, useState } from 'react';

type LinkState = 'loading' | 'linked' | 'unlinked';

export default function TelegramLinkForm({
  embedded = false,
  setupReturnTo = null,
}: {
  embedded?: boolean;
  setupReturnTo?: string | null;
}) {
  const [state, setState] = useState<LinkState>('loading');
  const [canUnlink, setCanUnlink] = useState(false);
  const [linkingAvailable, setLinkingAvailable] = useState(false);
  const [authMethod, setAuthMethod] = useState<'telegram' | 'email'>('email');
  const [bot, setBot] = useState('Lpvolley_bot');
  const [linkUrl, setLinkUrl] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function refreshLinkState() {
      try {
        const res = await fetch('/api/auth/telegram-link', { cache: 'no-store' });
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (!data) {
          setState('unlinked');
        } else {
          if (data.bot) setBot(String(data.bot));
          setLinkingAvailable(Boolean(data.linkingAvailable));
          setCanUnlink(Boolean(data.canUnlink));
          setAuthMethod(data.authMethod === 'telegram' ? 'telegram' : 'email');
          const linked = Boolean(data.linked);
          setState(linked ? 'linked' : 'unlinked');
          if (linked && setupReturnTo) {
            window.location.assign(setupReturnTo);
            return;
          }
        }
      } catch {
        if (!cancelled) setState('unlinked');
      }
      if (!cancelled && setupReturnTo) timer = setTimeout(refreshLinkState, 2500);
    }

    void refreshLinkState();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [setupReturnTo]);

  async function onGenerate() {
    if (!linkingAvailable) return;
    setStatus('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/telegram-link', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data?.error || 'Не удалось создать ссылку');
        return;
      }
      setLinkUrl(String(data.url || ''));
      window.open(String(data.url), '_blank', 'noopener');
      setStatus('Ссылка действует 15 минут. Перейди в Telegram и нажми «Start» — затем вернись и обнови страницу.');
    } catch {
      setStatus('Ошибка сети');
    } finally {
      setBusy(false);
    }
  }

  async function onUnlink() {
    setStatus('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/telegram-link', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState('unlinked');
        setCanUnlink(false);
        setLinkUrl('');
        setStatus('Telegram отвязан.');
      } else {
        setStatus(data?.error || 'Не удалось отвязать Telegram');
      }
    } catch {
      setStatus('Ошибка сети');
    } finally {
      setBusy(false);
    }
  }

  const rootClass = embedded
    ? ''
    : 'rounded-xl border border-white/10 bg-surface-light/20 p-4';

  return (
    <section id="telegram" className={`${rootClass} scroll-mt-24`}>
      <h3 className="font-heading text-lg text-text-primary tracking-wide">Telegram</h3>

      {state === 'loading' ? (
        <p className="mt-1.5 text-sm font-body text-text-secondary">Проверяем привязку…</p>
      ) : state === 'linked' ? (
        <>
          <p className="mt-1.5 text-sm font-body text-text-secondary">
            {authMethod === 'telegram'
              ? `Telegram — основной способ входа. Уведомления приходят в @${bot}.`
              : `Telegram подключён — подтверждения заявок и напоминания приходят в @${bot}.`}
          </p>
          {canUnlink ? (
            <button
              type="button"
              onClick={onUnlink}
              disabled={busy}
              className="mt-3 inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2 text-sm font-body font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
            >
              {busy ? 'Отвязываем…' : 'Отвязать Telegram'}
            </button>
          ) : (
            <p className="mt-2 text-xs font-body text-text-secondary">
              Отвязать Telegram можно после добавления другого способа входа.
            </p>
          )}
        </>
      ) : (
        <>
          {linkingAvailable ? (
            <>
              <p className="mt-1.5 text-sm font-body text-text-secondary">
                Привяжи @{bot}, чтобы получать подтверждения заявок и напоминания об играх.
              </p>
              <button
                type="button"
                onClick={onGenerate}
                disabled={busy}
                className="mt-3 inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-body font-semibold text-white transition-colors hover:bg-brand-light disabled:opacity-50"
              >
                {busy ? 'Создаём ссылку…' : 'Привязать Telegram'}
              </button>
              {linkUrl ? (
                <p className="mt-2 text-xs font-body text-text-secondary">
                  Не открылось?{' '}
                  <a href={linkUrl} target="_blank" rel="noopener" className="text-brand underline">
                    Перейти в Telegram
                  </a>
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1.5 text-sm font-body text-text-secondary">
              Привязка Telegram временно недоступна. Попробуйте ещё раз позже.
            </p>
          )}
        </>
      )}

      {status ? <p className="mt-2 text-xs font-body text-text-secondary">{status}</p> : null}
    </section>
  );
}
