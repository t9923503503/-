import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('email provider source contract', () => {
  it('keeps Resend fallback for environments without SMTP credentials', () => {
    const source = read('web/lib/email.ts');

    expect(source).toContain('process.env.RESEND_API_KEY');
    expect(source).toContain("fetch('https://api.resend.com/emails'");
    expect(source).toContain('No email provider configured');
    expect(source).toContain('hasSmtpCredentials()');
  });
});
