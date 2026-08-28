import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { createCoachVideoAsset, listCoachVideoAssets } from '@/lib/coach/video-service';
import { normalizeCoachVideoAssetInput, validateCoachVideoAssetInput } from '@/lib/coach/video-validators';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth=requireCoachApiActor(req); if(!auth.ok) return auth.response;
  try { return Response.json({ assets: await listCoachVideoAssets(new URL(req.url).searchParams.get('q') ?? '') }); }
  catch(error){ return coachErrorResponse(error,'video-assets.list'); }
}

export async function POST(req: NextRequest) {
  const auth=requireCoachApiActor(req); if(!auth.ok) return auth.response;
  const raw=await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(!raw) return Response.json({error:'Ожидается JSON'},{status:400});
  const input=normalizeCoachVideoAssetInput(raw); const validationError=validateCoachVideoAssetInput(input);
  if(validationError) return Response.json({error:validationError},{status:400});
  try {
    const asset=await createCoachVideoAsset({...input,actorId:auth.actor.id});
    await writeAuditLog({actorId:auth.actor.id,actorRole:auth.actor.role,action:'coach.video_asset.create',entityType:'coach_video_asset',entityId:asset.id,afterState:asset,source:'lp-coach'});
    return Response.json({asset},{status:201});
  } catch(error){ return coachErrorResponse(error,'video-assets.create'); }
}
