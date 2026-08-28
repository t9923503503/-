import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const root=path.resolve(import.meta.dirname,'../..');const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
describe('LP Coach video foundation source contract',()=>{
  it('stores assets, clips, frames, annotations and comparisons',()=>{const sql=read('migrations/098_lp_coach_video_foundation.sql');for(const table of ['coach_video_assets','coach_video_clips','coach_video_frames','coach_video_annotations','coach_video_comparisons'])expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);expect(sql).toContain('coach_challenge_attempts_video_asset_fk');});
  it('protects and audits every write endpoint',()=>{const files=['web/app/api/coach/media/route.ts','web/app/api/coach/media/comparisons/route.ts','web/app/api/coach/media/[id]/clips/route.ts','web/app/api/coach/media/[id]/frames/route.ts','web/app/api/coach/media/[id]/annotations/route.ts'];for(const file of files){const source=read(file);expect(source).toContain('requireCoachApiActor');expect(source).toContain('writeAuditLog');}});
  it('exposes fast manual marking and before/after UI',()=>{const page=read('web/app/coach/(workspace)/media/page.tsx');const workspace=read('web/components/coach/VideoWorkspace.tsx');const shell=read('web/components/coach/CoachShell.tsx');expect(page).toContain('Stage 8 · Video Foundation');expect(page).toContain('CreateVideoComparisonForm');expect(workspace).toContain('Поставить отметку');expect(workspace).toContain('Ключевой кадр');expect(shell).toContain('/coach/media');});
});
