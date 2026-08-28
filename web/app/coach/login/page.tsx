import { redirect } from 'next/navigation';
import CoachLoginForm from '@/components/coach/CoachLoginForm';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';

export default async function CoachLoginPage() {
  const actor = await getAdminSessionFromCookies();
  if (actor && actor.role !== 'viewer') redirect('/coach');

  return (
    <main className="coach-dark-surface relative grid min-h-screen place-items-center overflow-hidden bg-[#070b14] p-4 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,209,255,0.10),transparent_32%),radial-gradient(circle_at_85%_75%,rgba(255,90,0,0.14),transparent_34%)]" />
      <div className="relative z-10 w-full max-w-md">
        <CoachLoginForm />
        <p className="mt-4 text-center text-xs text-slate-600">Доступ только для тренерского штаба</p>
      </div>
    </main>
  );
}
