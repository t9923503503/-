import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('play guest claim source contract', () => {
  it('stores only a one-time token hash with an expiry', () => {
    const service = read('web/lib/play-guest-claim.ts');
    const migration = read('migrations/089_play_guest_claim.sql');
    expect(service).toContain("randomBytes(32).toString('base64url')");
    expect(service).toContain("createHash('sha256')");
    expect(service).toContain('timingSafeEqual');
    expect(service).toContain('7 * 24 * 60 * 60 * 1000');
    expect(migration).toContain('guest_claim_token_hash');
    expect(migration).toContain('guest_claim_expires_at');
    expect(migration).toContain('name_snapshot');
  });

  it('lets only the organizer create a link and prevents duplicate roster identity', () => {
    const service = read('web/lib/play-guest-claim.ts');
    expect(service).toContain("actor.kind === 'admin' || Number(participant.owner_user_id) === actor.userId");
    expect(service).toContain("status IN ('pending', 'confirmed', 'reserve')");
    expect(service).toContain('guest_claimed_at = now()');
    expect(service).toContain('guest_claim_token_hash = NULL');
  });

  it('keeps the claim link available from the organizer roster and returns to the game', () => {
    const management = read('web/components/partner/PlayManagementClient.tsx');
    const client = read('web/components/play/PlayGuestClaimClient.tsx');
    expect(management).toContain('Ссылка регистрации');
    expect(management).toContain('/claim-link`');
    expect(client).toContain('Войти или зарегистрироваться');
    expect(client).toContain('Игра и результат теперь будут отображаться в вашем кабинете.');
  });
});
