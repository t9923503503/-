'use client';

import { useEffect, useRef, useState } from 'react';

interface PlayShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  compact?: boolean;
}

export default function PlayShareButton({ title, text, url, compact = false }: PlayShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function payload() {
    const resolvedUrl = url ? new URL(url, window.location.origin).href : window.location.href;
    return { resolvedUrl, resolvedText: text || title };
  }

  async function systemShare() {
    const { resolvedUrl, resolvedText } = payload();
    if (navigator.share) {
      await navigator.share({ title, text: resolvedText, url: resolvedUrl }).catch(() => undefined);
      setOpen(false);
      return;
    }
    await copyLink();
  }

  async function copyLink() {
    const { resolvedUrl } = payload();
    await navigator.clipboard.writeText(resolvedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function openNetwork(network: 'telegram' | 'vk') {
    const { resolvedUrl, resolvedText } = payload();
    const target = network === 'telegram'
      ? `https://t.me/share/url?url=${encodeURIComponent(resolvedUrl)}&text=${encodeURIComponent(resolvedText)}`
      : `https://vk.com/share.php?url=${encodeURIComponent(resolvedUrl)}&title=${encodeURIComponent(title)}&comment=${encodeURIComponent(resolvedText)}`;
    window.open(target, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={compact
          ? 'min-h-10 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-cyan-300/50'
          : 'rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-text-primary transition hover:border-cyan-300/50'}
      >
        {copied ? 'Ссылка скопирована' : 'Поделиться'}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Поделиться игрой"
          className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-[#101722] p-3 shadow-2xl"
        >
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Отправить игру</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void systemShare()} className="col-span-2 min-h-11 rounded-xl bg-brand px-3 text-sm font-semibold text-white">
              Меню телефона
            </button>
            <button type="button" onClick={() => openNetwork('telegram')} className="min-h-11 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 text-sm font-semibold text-cyan-100">
              Telegram
            </button>
            <button type="button" onClick={() => openNetwork('vk')} className="min-h-11 rounded-xl border border-blue-300/25 bg-blue-300/10 px-3 text-sm font-semibold text-blue-100">
              VK
            </button>
            <button type="button" onClick={() => void copyLink()} className="col-span-2 min-h-11 rounded-xl border border-white/15 px-3 text-sm font-semibold text-text-primary">
              {copied ? 'Скопировано' : 'Скопировать ссылку'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
