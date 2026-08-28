'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushMetrikaGoals } from '@/lib/metrika-goals';

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void;
  }
}

type YandexMetrikaProps = {
  counterId: string;
};

function normalizeCounterId(counterId: string) {
  const trimmed = counterId.trim();
  return /^\d+$/.test(trimmed) ? trimmed : '';
}

export function YandexMetrika({ counterId }: YandexMetrikaProps) {
  const normalizedCounterId = normalizeCounterId(counterId);
  const pathname = usePathname();
  const telemetryDisabled = pathname.startsWith('/judge/go-v2/');
  const searchParams = useSearchParams();
  const previousUrlRef = useRef<string | null>(null);
  const [metrikaReady, setMetrikaReady] = useState(false);

  const currentUrl = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (telemetryDisabled || !metrikaReady || !normalizedCounterId || typeof window.ym !== 'function') return;
    if (previousUrlRef.current === currentUrl) return;

    const referer = previousUrlRef.current
      ? `${window.location.origin}${previousUrlRef.current}`
      : document.referrer;

    window.ym(Number(normalizedCounterId), 'hit', window.location.href, {
      referer,
      title: document.title,
    });
    previousUrlRef.current = currentUrl;
  }, [currentUrl, metrikaReady, normalizedCounterId, telemetryDisabled]);

  if (!normalizedCounterId || telemetryDisabled) return null;

  const numericCounterId = Number(normalizedCounterId);

  return (
    <>
      <Script
        id="yandex-metrika"
        strategy="afterInteractive"
        onReady={() => {
          setMetrikaReady(true);
          flushMetrikaGoals();
        }}
        dangerouslySetInnerHTML={{
          __html: `
            (function(m,e,t,r,i,k,a){
              m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
            ym(${numericCounterId}, "init", {
              defer: true,
              clickmap: true,
              trackLinks: true,
              accurateTrackBounce: true
            });
          `,
        }}
      />
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${normalizedCounterId}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
