import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('admin login source contract', () => {
  it('renders the login page as a server form without a client directive', () => {
    const source = read('web/app/admin/login/page.tsx');

    expect(source).not.toContain("'use client'");
    expect(source).toContain("import { redirect } from 'next/navigation';");
    expect(source).toContain("import { getAdminSessionFromCookies } from '@/lib/admin-auth';");
    expect(source).toContain('action="/api/admin/auth"');
    expect(source).toContain('method="post"');
    expect(source).toContain('name="pin"');
    expect(source).toContain("redirect('/admin');");
    expect(source).toContain("invalid: 'Неверный PIN или ID'");
    expect(source).toContain("rate_limited: 'Слишком много попыток. Повторите вход через 15 минут.'");
  });

  it('accepts non-JS form posts and redirects them back into admin flow', () => {
    const source = read('web/app/api/admin/auth/route.ts');

    expect(source).toContain("function buildExternalRedirectUrl(req: NextRequest, targetPath: string): URL {");
    expect(source).toContain("const forwardedHost = req.headers.get('x-forwarded-host');");
    expect(source).toContain("const forwardedProto = req.headers.get('x-forwarded-proto');");
    expect(source).toContain("contentType.includes('application/x-www-form-urlencoded')");
    expect(source).toContain("contentType.includes('multipart/form-data')");
    expect(source).toContain("const form = await req.formData().catch(() => null);");
    expect(source).toContain("const redirectUrl = buildExternalRedirectUrl(req, response.ok ? '/admin' : '/admin/login');");
    expect(source).toContain("checkAdminLoginRateLimit(req.headers, id)");
    expect(source).toContain("recordAdminLoginFailure(req.headers, id)");
    expect(source).toContain("response.status === 429");
    expect(source).toContain("NextResponse.redirect(redirectUrl, { status: 303 })");
  });
});
