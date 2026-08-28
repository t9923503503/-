import type { Metadata } from 'next';
import { IndividualMixAdminWorkspace } from '@/components/individual-mix/IndividualMixAdminWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Личный микст — пульт турнира | LPVolley',
  robots: { index: false, follow: false },
};

export default function IndividualMixAdminPage() {
  return <IndividualMixAdminWorkspace demoMode />;
}
