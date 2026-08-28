import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('runtime upload release boundary', () => {
  it('keeps player uploads out of source archives and demos', () => {
    const ignore = read('.gitignore');
    const demo = read('web/app/demo/play-result/page.tsx');

    expect(ignore).toContain('web/public/images/users/');
    expect(demo).not.toContain('/images/users/');
  });
});
