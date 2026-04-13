import Link from 'next/link';
import {
  getAccessDisplayName,
  getAccessSubtitle,
  getAccessSummaryFromCookies,
  hasAnyAccess,
} from '@/lib/access-summary';

export default async function LandingHeroAccessPanel() {
  const summary = await getAccessSummaryFromCookies();
  const active = hasAnyAccess(summary);
  const title = active ? getAccessDisplayName(summary) : 'Вход на сайт';
  const subtitle = active ? getAccessSubtitle(summary) : 'Регистрация';

  return (
    <div className="absolute right-4 top-4 z-10 md:hidden">
      <Link
        href="/cabinet"
        className="group flex max-w-[220px] items-center gap-3 rounded-2xl border border-white/10 bg-[#121722]/92 px-3.5 py-3 text-left shadow-[0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all duration-200 hover:border-brand/35 hover:bg-[#171d28]/96"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand/12 text-brand">
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path
              d="M10 2.5a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5Zm0 10.75c3.25 0 5.89 1.63 5.89 3.64 0 .34-.28.61-.62.61H4.73a.61.61 0 0 1-.62-.61c0-2.01 2.64-3.64 5.89-3.64Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-[0.24em] text-white/52">
            {active
              ? '\u041b\u0438\u0447\u043d\u044b\u0439 \u043a\u0430\u0431\u0438\u043d\u0435\u0442'
              : '\u0410\u043a\u043a\u0430\u0443\u043d\u0442'}
          </div>
          <div className="mt-1 truncate text-[13px] font-semibold uppercase leading-tight tracking-[0.08em] text-white">
            {title}
          </div>
          <div className="mt-1 truncate text-[10px] uppercase tracking-[0.18em] text-white/60">
            {subtitle}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-white/14 bg-white/6 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-white/80 transition-colors group-hover:border-brand/30 group-hover:text-white">
          {active ? '\u041e\u0442\u043a\u0440\u044b\u0442\u044c' : '\u0412\u0445\u043e\u0434'}
        </span>
      </Link>
    </div>
  );
}
