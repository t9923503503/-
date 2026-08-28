import { notFound } from 'next/navigation';
import ChallengeWorkspace from '@/components/coach/ChallengeWorkspace';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import { getCoachChallenge } from '@/lib/coach/challenge-service';
import { listCoachIssueOptions } from '@/lib/coach/exercise-service';
import { listCoachAthletes, listCoachSkills } from '@/lib/coach/service';
import { listCoachTrainingSessions } from '@/lib/coach/session-service';
import { isCoachUuid } from '@/lib/coach/validators';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

export default async function CoachChallengePage({ params }: Props) {
  const { id } = await params; if (!isCoachUuid(id)) notFound();
  try {
    const [challenge, athletes, sessions, skills, issues] = await Promise.all([getCoachChallenge(id), listCoachAthletes({ status: 'active' }), listCoachTrainingSessions('all'), listCoachSkills(), listCoachIssueOptions()]);
    if (!challenge) notFound();
    return <ChallengeWorkspace challenge={challenge} options={{ athletes, sessions: sessions.map((session) => ({ id: session.id, title: session.title, startsAt: session.startsAt })) }} skills={skills} issues={issues} />;
  } catch (error) { return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />; }
}
