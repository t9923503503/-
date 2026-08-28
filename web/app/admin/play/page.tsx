import Link from 'next/link';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';
import AdminPlayOrganizers from '@/components/admin/AdminPlayOrganizers';
import PlayManagementClient from '@/components/partner/PlayManagementClient';
import AdminPlayResults from '@/components/admin/AdminPlayResults';
import AdminUnfilledPlayPosts from '@/components/admin/AdminUnfilledPlayPosts';

export const dynamic = 'force-dynamic';

export default async function AdminPlayPage() {
  const actor = await getAdminSessionFromCookies();
  if (!actor) return <main className="mx-auto max-w-xl px-4 py-12"><p className="text-text-secondary">Требуется вход администратора.</p><Link href="/admin/login" className="mt-4 inline-block text-brand">Войти</Link></main>;
  return (
    <div className="space-y-8">
      <div><h1 className="font-heading text-4xl text-text-primary">Игры и тренировки</h1><p className="mt-2 text-sm text-text-secondary">Организаторы, площадки, тренеры, публикации и заявки.</p></div>
      <AdminUnfilledPlayPosts canDelete={actor.role === 'admin'} />
      <AdminPlayOrganizers />
      <AdminPlayResults canReverse={actor.role !== 'viewer'} />
      {actor.role === 'viewer' ? (
        <p className="rounded-2xl border border-white/10 p-5 text-sm text-text-secondary">Роль viewer может просматривать справочники, но не управлять событиями.</p>
      ) : <PlayManagementClient />}
    </div>
  );
}
