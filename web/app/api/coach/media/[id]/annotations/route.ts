import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { addCoachVideoAnnotation } from '@/lib/coach/video-service';
import { normalizeCoachVideoAnnotationInput, validateCoachVideoAnnotationInput } from '@/lib/coach/video-validators';
import { isCoachUuid } from '@/lib/coach/validators';
type Context={params:Promise<{id:string}>};
export async function POST(req:NextRequest,context:Context){const auth=requireCoachApiActor(req);if(!auth.ok)return auth.response;const {id}=await context.params;if(!isCoachUuid(id))return Response.json({error:'Некорректный ID видео'},{status:400});const raw=await req.json().catch(()=>null) as Record<string,unknown>|null;if(!raw)return Response.json({error:'Ожидается JSON'},{status:400});const input=normalizeCoachVideoAnnotationInput(raw);const invalid=validateCoachVideoAnnotationInput(input);if(invalid)return Response.json({error:invalid},{status:400});try{const annotation=await addCoachVideoAnnotation(id,{...input,actorId:auth.actor.id});await writeAuditLog({actorId:auth.actor.id,actorRole:auth.actor.role,action:'coach.video_annotation.create',entityType:'coach_video_asset',entityId:id,afterState:annotation,source:'lp-coach'});return Response.json({annotation},{status:201});}catch(error){return coachErrorResponse(error,'video-annotations.create');}}
