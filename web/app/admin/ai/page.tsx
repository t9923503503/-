import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';
import AiWorkspace from '@/components/ai/AiWorkspace';

export const dynamic = 'force-dynamic';

export default async function AiPage() {
  const actor = await getAdminSessionFromCookies();
  if (!actor || actor.role !== 'admin') redirect('/admin/login');
  return <AiWorkspace />;
}
