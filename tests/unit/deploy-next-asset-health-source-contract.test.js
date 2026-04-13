import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('deploy next asset health source contract', () => {
  it('checks referenced Next static assets during deploy healthchecks', () => {
    const source = read('scripts/deploy-server.sh');

    expect(source).toContain('probe_next_route_assets() {');
    expect(source).toContain('NEXT_ASSET_HEALTHCHECK_URLS="${NEXT_ASSET_HEALTHCHECK_URLS:-}"');
    expect(source).toContain("| grep -oE '/_next/static/");
    expect(source).toContain('probe_next_route_assets "$page_url" "Next assets"');
    expect(source).toContain('die "${label}: asset ${asset} returned ${code}"');
  });

  it('supports body-level healthchecks for mojibake or stale content', () => {
    const source = read('scripts/deploy-server.sh');

    expect(source).toContain('probe_body_contains() {');
    expect(source).toContain('probe_body_not_contains() {');
    expect(source).toContain('PUBLIC_BODY_HEALTHCHECK_URL="${PUBLIC_BODY_HEALTHCHECK_URL:-}"');
    expect(source).toContain('PUBLIC_BODY_HEALTHCHECK_CONTAINS="${PUBLIC_BODY_HEALTHCHECK_CONTAINS:-}"');
    expect(source).toContain('PUBLIC_BODY_HEALTHCHECK_NOT_CONTAINS="${PUBLIC_BODY_HEALTHCHECK_NOT_CONTAINS:-}"');
    expect(source).toContain('probe_body_contains "$PUBLIC_BODY_HEALTHCHECK_URL" "$PUBLIC_BODY_HEALTHCHECK_CONTAINS" "Public body"');
    expect(source).toContain('probe_body_not_contains "$PUBLIC_BODY_HEALTHCHECK_URL" "$PUBLIC_BODY_HEALTHCHECK_NOT_CONTAINS" "Public body"');
    expect(source).toContain("does not contain expected marker");
    expect(source).toContain("still contains forbidden marker");
  });

  it('documents asset healthchecks in the example deploy env', () => {
    const source = read('scripts/deploy-server.env.example');

    expect(source).toContain('NEXT_ASSET_HEALTHCHECK_URLS=https://lpvolley.ru/admin/login,https://lpvolley.ru/profile');
    expect(source).toContain('PUBLIC_BODY_HEALTHCHECK_URL=');
    expect(source).toContain('PUBLIC_BODY_HEALTHCHECK_CONTAINS=');
    expect(source).toContain('PUBLIC_BODY_HEALTHCHECK_NOT_CONTAINS=');
  });
});
