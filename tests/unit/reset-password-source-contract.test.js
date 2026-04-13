import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('reset password source contract', () => {
  it('sends recovery emails to the Next.js reset-password page', () => {
    const emailSource = read('web/lib/email.ts');

    expect(emailSource).toContain('/reset-password?token=');
    expect(emailSource).not.toContain('/play/index.html?route=reset');
  });

  it('keeps a public reset-password page wired to the confirm API and profile redirect', () => {
    const pageSource = read('web/app/reset-password/page.tsx');
    const formSource = read('web/components/profile/ResetPasswordForm.tsx');
    const confirmRouteSource = read('web/app/api/auth/reset-password/confirm/route.ts');

    expect(pageSource).toContain('ResetPasswordForm');
    expect(formSource).toContain('/api/auth/reset-password/confirm');
    expect(formSource).toContain('router.push');
    expect(formSource).toContain('"/profile"');
    expect(confirmRouteSource).toContain('setPlayerCookie');
    expect(confirmRouteSource).toContain("redirectTo: '/profile'");
  });
});
