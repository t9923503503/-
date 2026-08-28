import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'LP Coach — рабочее место тренера',
  robots: { index: false, follow: false },
  alternates: null,
};

export default function CoachRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
