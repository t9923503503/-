import { NextRequest } from 'next/server';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { getCoachVideoAsset } from '@/lib/coach/video-service';
import { isCoachUuid } from '@/lib/coach/validators';
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,context:Context){const auth=requireCoachApiActor(req);if(!auth.ok)return auth.response;const {id}=await context.params;if(!isCoachUuid(id))return Response.json({error:'Некорректный ID видео'},{status:400});try{const asset=await getCoachVideoAsset(id);return asset?Response.json({asset}):Response.json({error:'Видео не найдено'},{status:404});}catch(error){return coachErrorResponse(error,'video-assets.get');}}
