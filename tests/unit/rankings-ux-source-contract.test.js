import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('rankings UX source contract', () => {
  it('labels the personal-meetings guide without implying ranking methodology', () => {
    const guide = read('web/app/rankings/RankingsGuide.tsx');

    expect(guide).toContain('aria-label="Новый гайд: личные встречи игроков"');
    expect(guide).toContain('Новое');
    expect(guide).toContain('Личные встречи — новый гайд');
    expect(guide).toContain('className="grid h-11 w-11');
    expect(guide).toContain('className="group grid h-11 w-9');
    expect(guide.match(/className="min-h-11 rounded-full border/g)).toHaveLength(2);
    expect(guide).not.toContain('>\n        Инструкция\n      </button>');
  });

  it('keeps the full list prominent and mobile filters touch-friendly', () => {
    const client = read('web/app/rankings/RankingsClient.tsx');

    expect(client).toContain('className: "mt-6 hidden sm:block"');
    expect(client).toContain('className: "mt-4 sm:mt-6"');
    expect(client).toContain('"min-h-11 shrink-0 rounded-full border');
    expect(client).toContain('"min-h-11 flex-1 rounded-[16px] border');
  });

  it('explains that the total is unique while ranking sections overlap', () => {
    const client = read('web/app/rankings/RankingsClient.tsx');
    const styles = read('web/app/globals.css');

    expect(client).toContain('"aria-describedby": "rankings-counts-note"');
    expect(client).toContain('«Всего» — число уникальных игроков.');
    expect(client).toContain('Разделы пересекаются: один игрок может играть в нескольких категориях.');
    expect(styles).toContain('[class~="text-white\\/60"]');
  });
});
