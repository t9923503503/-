'use client';

import { usePathname } from 'next/navigation';
import Footer from '@/components/layout/Footer';
import Header from '@/components/layout/Header';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import ThemeToggle from '@/components/layout/ThemeToggle';

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const playFocusMode = /^\/partner\/[^/]+\/live$/.test(pathname)
    || (process.env.NODE_ENV !== 'production' && pathname === '/demo/play-result');
  const hideSiteChrome =
    pathname === '/live/thai' ||
    pathname.startsWith('/live/thai/') ||
    pathname === '/judge-scoreboard' ||
    pathname.startsWith('/judge-scoreboard/') ||
    pathname.startsWith('/judge/go-v2/') ||
    pathname.startsWith('/kotc-next/judge/') ||
    pathname.startsWith('/coach') ||
    playFocusMode;

  if (hideSiteChrome) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  }

  const hideBottomNav =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/court') ||
    pathname.startsWith('/go/') ||
    pathname.startsWith('/kotc-next/') ||
    pathname.startsWith('/sudyam');

  return (
    <>
      <Header />
      <div className={`flex min-h-0 flex-1 flex-col ${hideBottomNav ? '' : 'site-mobile-nav-space'}`}>
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
      {hideBottomNav ? null : <MobileBottomNav />}
      <ThemeToggle />
    </>
  );
}
