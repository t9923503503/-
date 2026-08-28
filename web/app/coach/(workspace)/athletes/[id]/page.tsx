import Link from 'next/link';
import { notFound } from 'next/navigation';
import AthleteFoundationPanel from '@/components/coach/AthleteFoundationPanel';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import { getCoachAthleteDetail, listCoachSkills } from '@/lib/coach/service';
import { getCoachAthleteAnalytics } from '@/lib/coach/analytics-service';
import { getCoachAthleteChallenges } from '@/lib/coach/challenge-service';
import AthleteChallengePanel from '@/components/coach/AthleteChallengePanel';
import { isCoachUuid } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string }> };

export default async function CoachAthletePage({ params }: Context) {
  const { id } = await params;
  if (!isCoachUuid(id)) notFound();
  try {
    const [athlete, skills, analytics, challenges] = await Promise.all([getCoachAthleteDetail(id), listCoachSkills(), getCoachAthleteAnalytics(id), getCoachAthleteChallenges(id)]);
    if (!athlete) notFound();
    return (
      <div>
        <Link href="/coach/athletes" className="mb-4 inline-flex min-h-11 items-center text-sm font-bold text-slate-500 transition hover:text-cyan-300">← Все ученики</Link>
        <AthleteFoundationPanel athlete={athlete} skills={skills} analytics={analytics} />
        <AthleteChallengePanel data={challenges} />
      </div>
    );
  } catch (error) {
    return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }
}
