#!/usr/bin/env node
// Запуск: node scripts/migrate.mjs migrations/011_round_robin_2026_03_21.sql
// или:    DATABASE_URL=postgresql://... node scripts/migrate.mjs <file.sql>

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';

const require = createRequire(import.meta.url);

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/migrate.mjs <path/to/file.sql>');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  // Try to read from web/.env.local
  try {
    const env = readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8');
    const match = env.match(/^DATABASE_URL=(.+)$/m);
    if (match) process.env.DATABASE_URL = match[1].trim();
  } catch {}
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Set it as env variable or in web/.env.local');
  process.exit(1);
}

let Pool;
try {
  ({ Pool } = require('./node_modules/pg') ?? require('../web/node_modules/pg'));
} catch {
  try { ({ Pool } = require('../web/node_modules/pg')); } catch(e) {
    console.error('pg not found. Run: cd web && npm install');
    process.exit(1);
  }
}

const sql = readFileSync(resolve(file), 'utf8');
const stmts = sql
  .split(/;[ \t]*\n/)
  .map(s => s.replace(/--[^\n]*/g, '').trim())
  .filter(Boolean);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  console.log(`Running ${stmts.length} statements from ${file}...`);
  let ok = 0, err = 0;
  for (const s of stmts) {
    try {
      await client.query(s);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${e.message.slice(0, 100)}`);
      console.error(`    SQL: ${s.slice(0, 80)}...`);
      err++;
    }
  }
  client.release();
  await pool.end();
  console.log(`\nDone: ✓ ${ok} OK  ✗ ${err} errors`);
  if (err > 0) process.exit(1);
}

run().catch(e => { console.error(e.message); process.exit(1); });
