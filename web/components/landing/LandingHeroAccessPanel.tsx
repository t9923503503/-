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
    <div className="absolute right-4 top-4 z-10 md:right-6 md:top-6">
      <Link
        href="/cabinet"
        className="group flex min-w-[220px] max-w-[280px] items-center justify-between gap-3 overflow-hidden rounded-[22px] border border-white/12 bg-[linear-gradient(135deg,rgba(255,206,56,0.98)_0%,rgba(255,206,56,0.98)_46%,rgba(0,103,144,0.98)_46%,rgba(0,103,144,0.98)_100%)] px-4 py-3 text-left shadow-[0_16px_40px_rgba(0,0,0,0.32)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(0,0,0,0.38)]"
      >
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-[#0b2030]/80">
            {active ? 'Личный кабинет' : 'Аккаунт'}
          </div>
          <div className="mt-1 truncate text-sm font-black uppercase leading-tight tracking-[0.05em] text-white md:text-base">
            {title}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/88">
            {subtitle}
          </div>
        </div>
        <span className="rounded-full border border-white/30 bg-white/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white transition-colors group-hover:bg-white/18">
          {active ? 'Открыть' : 'Вход'}
        </span>
      </Link>
    </div>
  );
}
