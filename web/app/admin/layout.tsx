import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAdminSessionFromCookies();
  if (!actor) {
    redirect('/admin/login');
  }

  return <AdminShell role={actor.role} actorId={actor.id}>{children}</AdminShell>;
}
