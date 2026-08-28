import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';
import AiReviewWorkspace from '@/components/ai/AiReviewWorkspace';

export const dynamic = 'force-dynamic';

export default async function AiReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminSessionFromCookies();
  if (!actor || actor.role !== 'admin') redirect('/admin/login');
  return <AiReviewWorkspace jobId={(await params).id} />;
}
