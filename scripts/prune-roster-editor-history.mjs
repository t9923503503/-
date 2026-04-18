#!/usr/bin/env node
// Usage:
//   node scripts/prune-roster-editor-history.mjs
//   node scripts/prune-roster-editor-history.mjs 45
// Requires DATABASE_URL (env or web/.env.local).

import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const retentionDays = Math.max(1, Math.trunc(Number(process.argv[2] || 30)));

if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8');
    const match = env.match(/^DATABASE_URL=(.+)$/m);
    if (match) process.env.DATABASE_URL = match[1].trim();
  } catch {}
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

let Pool;
try {
  ({ Pool } = require('../web/node_modules/pg'));
} catch {
  console.error('pg is not installed. Run: cd web && npm install');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `DELETE FROM roster_editor_action_log
        WHERE created_at < now() - ($1::text || ' days')::interval`,
      [String(retentionDays)],
    );
    console.log(
      `[roster-editor] deleted ${Number(result.rowCount || 0)} action-log rows older than ${retentionDays} day(s).`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
