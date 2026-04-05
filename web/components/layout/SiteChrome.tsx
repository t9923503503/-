'use client';

import { usePathname } from 'next/navigation';
import Footer from '@/components/layout/Footer';
import Header from '@/components/layout/Header';

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const hideSiteChrome = pathname === '/live/thai' || pathname.startsWith('/live/thai/');

  if (hideSiteChrome) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  }

  return (
    <>
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </>
  );
}
