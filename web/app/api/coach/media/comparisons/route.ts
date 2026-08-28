import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { createCoachVideoComparison, listCoachVideoComparisons } from '@/lib/coach/video-service';
import { normalizeCoachVideoComparisonInput, validateCoachVideoComparisonInput } from '@/lib/coach/video-validators';

export async function GET(req:NextRequest){const auth=requireCoachApiActor(req);if(!auth.ok)return auth.response;try{return Response.json({comparisons:await listCoachVideoComparisons()});}catch(error){return coachErrorResponse(error,'video-comparisons.list');}}
export async function POST(req:NextRequest){const auth=requireCoachApiActor(req);if(!auth.ok)return auth.response;const raw=await req.json().catch(()=>null) as Record<string,unknown>|null;if(!raw)return Response.json({error:'Ожидается JSON'},{status:400});const input=normalizeCoachVideoComparisonInput(raw);const invalid=validateCoachVideoComparisonInput(input);if(invalid)return Response.json({error:invalid},{status:400});try{const comparison=await createCoachVideoComparison({...input,actorId:auth.actor.id});await writeAuditLog({actorId:auth.actor.id,actorRole:auth.actor.role,action:'coach.video_comparison.create',entityType:'coach_video_comparison',entityId:comparison.id,afterState:comparison,source:'lp-coach'});return Response.json({comparison},{status:201});}catch(error){return coachErrorResponse(error,'video-comparisons.create');}}
