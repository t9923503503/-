import { notFound } from 'next/navigation';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import ExerciseWorkspace from '@/components/coach/ExerciseWorkspace';
import { getCoachExercise, listCoachIssueOptions } from '@/lib/coach/exercise-service';
import { getCoachExerciseAnalytics } from '@/lib/coach/analytics-service';
import { listCoachSkills } from '@/lib/coach/service';
import { isCoachUuid } from '@/lib/coach/validators';

type Props = { params: Promise<{ id: string }> };

export default async function CoachExercisePage({ params }: Props) {
  const { id } = await params;
  if (!isCoachUuid(id)) notFound();
  let exercise;
  let skills;
  let issues;
  let analytics;
  try {
    [exercise, skills, issues, analytics] = await Promise.all([getCoachExercise(id), listCoachSkills(), listCoachIssueOptions(), getCoachExerciseAnalytics(id)]);
  } catch (error) {
    return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }
  if (!exercise) notFound();
  return <ExerciseWorkspace exercise={exercise} skills={skills} issueOptions={issues} analytics={analytics} />;
}
