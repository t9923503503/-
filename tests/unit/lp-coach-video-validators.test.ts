import { describe, expect, it } from 'vitest';
import {
  normalizeCoachVideoAnnotationInput, normalizeCoachVideoAssetInput, normalizeCoachVideoClipInput,
  normalizeCoachVideoComparisonInput, normalizeCoachVideoFrameInput, validateCoachVideoAnnotationInput,
  validateCoachVideoAssetInput, validateCoachVideoClipInput, validateCoachVideoComparisonInput, validateCoachVideoFrameInput,
} from '../../web/lib/coach/video-validators';

const uuidA='11111111-1111-4111-8111-111111111111';
const uuidB='22222222-2222-4222-8222-222222222222';

describe('LP Coach video validators',()=>{
  it('normalizes a linked HTTPS video asset',()=>{const input=normalizeCoachVideoAssetInput({title:'  Приём на ветру  ',source:'youtube',originalUrl:'https://youtu.be/test',athleteId:uuidA,durationMs:'45000',tags:'приём, турнир'});expect(input.title).toBe('Приём на ветру');expect(input.tags).toEqual(['приём','турнир']);expect(input.durationMs).toBe(45000);expect(validateCoachVideoAssetInput(input)).toBeNull();});
  it('rejects an asset without a safe source URL',()=>{const input=normalizeCoachVideoAssetInput({title:'Видео',originalUrl:'http://unsafe.test/a'});expect(validateCoachVideoAssetInput(input)).toContain('ссылку');});
  it('requires a positive clip interval',()=>{expect(validateCoachVideoClipInput(normalizeCoachVideoClipInput({title:'Эпизод',startMs:5000,endMs:4000}))).toContain('позже');expect(validateCoachVideoClipInput(normalizeCoachVideoClipInput({title:'Эпизод',startMs:1000,endMs:4000}))).toBeNull();});
  it('accepts local frame paths and clamps manual confidence',()=>{expect(validateCoachVideoFrameInput(normalizeCoachVideoFrameInput({imageUrl:'/uploads/frame.jpg',timestampMs:2000}))).toBeNull();const annotation=normalizeCoachVideoAnnotationInput({text:'Поздний старт',confidence:3});expect(annotation.confidence).toBe(1);expect(validateCoachVideoAnnotationInput(annotation)).toBeNull();});
  it('requires two different clips for before and after',()=>{expect(validateCoachVideoComparisonInput(normalizeCoachVideoComparisonInput({title:'До после',beforeClipId:uuidA,afterClipId:uuidA}))).toContain('разных');expect(validateCoachVideoComparisonInput(normalizeCoachVideoComparisonInput({title:'До после',beforeClipId:uuidA,afterClipId:uuidB}))).toBeNull();});
});
