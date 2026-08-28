import { notFound } from 'next/navigation';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import VideoWorkspace from '@/components/coach/VideoWorkspace';
import { listCoachIssueOptions } from '@/lib/coach/exercise-service';
import { listCoachSkills } from '@/lib/coach/service';
import { getCoachVideoAsset } from '@/lib/coach/video-service';
import { isCoachUuid } from '@/lib/coach/validators';
type Params=Promise<{id:string}>;
export const dynamic='force-dynamic';
export default async function CoachMediaDetailPage({params}:{params:Params}){const{id}=await params;if(!isCoachUuid(id))notFound();try{const[asset,skills,issues]=await Promise.all([getCoachVideoAsset(id),listCoachSkills(),listCoachIssueOptions()]);if(!asset)notFound();return <VideoWorkspace asset={asset} skills={skills} issues={issues}/>;}catch(error){return <CoachSetupNotice detail={error instanceof Error?error.message:undefined}/>;}}
