#!/usr/bin/env node
// Usage:
//   node scripts/backfill-kotc-rating-results.mjs
//   node scripts/backfill-kotc-rating-results.mjs --apply
//   node scripts/backfill-kotc-rating-results.mjs --apply --tournament-id=<uuid>
// Requires DATABASE_URL (env or web/.env.local).

import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const tournamentIdArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--tournament-id='));
const tournamentId = tournamentIdArg ? tournamentIdArg.slice('--tournament-id='.length).trim() : '';

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

const TARGET_SQL = `
  WITH latest_zone AS (
    SELECT DISTINCT ON (r.tournament_id, stats.player_id)
      r.tournament_id,
      stats.player_id,
      CASE
        WHEN LOWER(COALESCE(stats.zone, '')) IN ('advance', 'advanced') THEN 'advance'
        WHEN LOWER(COALESCE(stats.zone, '')) = 'medium' THEN 'medium'
        WHEN LOWER(COALESCE(stats.zone, '')) IN ('lite', 'light') THEN 'lite'
        ELSE 'hard'
      END AS rating_level
    FROM kotcn_player_round_stat stats
    JOIN kotcn_round r ON r.id = stats.round_id
    JOIN tournaments t ON t.id = r.tournament_id
    WHERE t.status = 'finished'
      AND (LOWER(COALESCE(t.format, '')) = 'kotc' OR LOWER(COALESCE(t.format, '')) LIKE '%king%')
      AND ($1::uuid IS NULL OR t.id = $1::uuid)
    ORDER BY r.tournament_id, stats.player_id, r.round_no DESC
  ),
  target AS (
    SELECT
      tr.tournament_id,
      tr.player_id,
      t.name AS tournament_name,
      p.name AS player_name,
      tr.place AS old_place,
      CASE WHEN tr.rating_pool = 'novice' THEN 'novice' ELSE 'pro' END AS rating_pool,
      lz.rating_level,
      COALESCE(tr.rating_pts, 0) AS old_rating_pts,
      tr.rating_level AS old_rating_level,
      DENSE_RANK() OVER (
        PARTITION BY tr.tournament_id, lz.rating_level
        ORDER BY tr.place ASC
      )::int AS zone_place,
      CASE
        WHEN lz.rating_level = 'hard' THEN
          CASE DENSE_RANK() OVER (
            PARTITION BY tr.tournament_id, lz.rating_level
            ORDER BY tr.place ASC
          )::int
            WHEN 1 THEN 100
            WHEN 2 THEN 90
            WHEN 3 THEN 82
            WHEN 4 THEN 76
            WHEN 5 THEN 70
            ELSE 1
          END
        WHEN lz.rating_level = 'advance' THEN
          CASE DENSE_RANK() OVER (
            PARTITION BY tr.tournament_id, lz.rating_level
            ORDER BY tr.place ASC
          )::int
            WHEN 1 THEN 65
            WHEN 2 THEN 60
            WHEN 3 THEN 56
            WHEN 4 THEN 52
            WHEN 5 THEN 48
            ELSE 1
          END
        WHEN lz.rating_level = 'medium' THEN
          CASE DENSE_RANK() OVER (
            PARTITION BY tr.tournament_id, lz.rating_level
            ORDER BY tr.place ASC
          )::int
            WHEN 1 THEN 44
            WHEN 2 THEN 42
            WHEN 3 THEN 40
            WHEN 4 THEN 38
            WHEN 5 THEN 36
            ELSE 1
          END
        ELSE
          CASE DENSE_RANK() OVER (
            PARTITION BY tr.tournament_id, lz.rating_level
            ORDER BY tr.place ASC
          )::int
            WHEN 1 THEN 34
            WHEN 2 THEN 32
            WHEN 3 THEN 30
            WHEN 4 THEN 28
            WHEN 5 THEN 26
            ELSE 1
          END
      END AS base_rating_pts
    FROM tournament_results tr
    JOIN tournaments t ON t.id = tr.tournament_id
    JOIN players p ON p.id = tr.player_id
    JOIN latest_zone lz
      ON lz.tournament_id = tr.tournament_id
     AND lz.player_id = tr.player_id
    WHERE t.status = 'finished'
      AND (LOWER(COALESCE(t.format, '')) = 'kotc' OR LOWER(COALESCE(t.format, '')) LIKE '%king%')
      AND ($1::uuid IS NULL OR t.id = $1::uuid)
  ),
  diff AS (
    SELECT
      tournament_id,
      player_id,
      tournament_name,
      player_name,
      old_place,
      zone_place AS new_place,
      rating_level,
      old_rating_pts,
      old_rating_level,
      CASE
        WHEN rating_pool = 'novice' THEN ROUND(base_rating_pts::numeric / 2)::int
        ELSE base_rating_pts
      END AS new_rating_pts
    FROM target
    WHERE old_place IS DISTINCT FROM zone_place
      OR old_rating_pts IS DISTINCT FROM
      CASE
        WHEN rating_pool = 'novice' THEN ROUND(base_rating_pts::numeric / 2)::int
        ELSE base_rating_pts
      END
      OR COALESCE(old_rating_level, '') IS DISTINCT FROM rating_level
  )
  SELECT
    tournament_id::text,
    player_id::text,
    tournament_name,
    player_name,
    old_place,
    new_place,
    rating_level,
    old_rating_pts,
    old_rating_level,
    new_rating_pts
  FROM diff
  ORDER BY tournament_name ASC, new_place ASC, player_name ASC
`;

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(TARGET_SQL, [tournamentId || null]);
    console.log(
      `[kotc-rating-backfill] mode=${apply ? 'apply' : 'dry-run'} tournament=${tournamentId || 'ALL'} candidates=${rows.length}`,
    );

    if (!rows.length) {
      return;
    }

    for (const row of rows.slice(0, 20)) {
      console.log(
        [
          row.tournament_name,
          `place ${row.old_place} -> ${row.new_place}`,
          row.player_name,
          `${row.old_rating_pts} -> ${row.new_rating_pts}`,
          `${row.old_rating_level || 'null'} -> ${row.rating_level}`,
        ].join(' | '),
      );
    }
    if (rows.length > 20) {
      console.log(`[kotc-rating-backfill] ... ${rows.length - 20} more rows`);
    }

    if (!apply) {
      return;
    }

    await client.query('BEGIN');
    const updateResult = await client.query(
      `
        WITH diff AS (${TARGET_SQL})
        UPDATE tournament_results tr
        SET place = diff.new_place,
            rating_pts = diff.new_rating_pts,
            rating_level = diff.rating_level
        FROM diff
        WHERE tr.tournament_id::text = diff.tournament_id
          AND tr.player_id::text = diff.player_id
      `,
      [tournamentId || null],
    );
    await client.query('COMMIT');
    console.log(`[kotc-rating-backfill] updated ${Number(updateResult.rowCount || 0)} row(s).`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
