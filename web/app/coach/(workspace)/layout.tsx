import CoachShell from '@/components/coach/CoachShell';
import { requireCoachPageActor } from '@/lib/coach/auth';

export default async function CoachWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireCoachPageActor();
  return <CoachShell actorId={actor.id}>{children}</CoachShell>;
}
