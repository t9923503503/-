import type { Metadata } from 'next';

import { GoV2JudgeWorkspace } from '@/components/go-v2/GoV2JudgeWorkspace';

const SCRUB_GRANT_FRAGMENT = `(function(){try{var h=window.location.hash.replace(/^#/,'');if(!h)return;var p=new URLSearchParams(h);var t=p.get('token');var d=p.get('device');if(t){sessionStorage.setItem('lpvolley:go-v2:pending-grant',JSON.stringify({token:t,device:d||''}));}history.replaceState(null,'',location.pathname+location.search);}catch(e){try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}}})()`;

export const metadata: Metadata = {
  title: 'Судья · Tournament Engine V2',
  robots: { index: false, follow: false },
};

export default async function GoV2JudgePage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRUB_GRANT_FRAGMENT }} />
      <GoV2JudgeWorkspace tournamentId={tournamentId} />
    </>
  );
}
