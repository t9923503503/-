import type { Metadata } from 'next';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: null,
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAdminSessionFromCookies();
  if (!actor) {
    return <>{children}</>;
  }

  return <AdminShell role={actor.role} actorId={actor.id}>{children}</AdminShell>;
}
