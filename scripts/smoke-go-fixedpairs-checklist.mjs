#!/usr/bin/env node
// Quick deploy smoke checklist helper for GO fixed-pairs UX.
// Usage:
//   node scripts/smoke-go-fixedpairs-checklist.mjs
//   node scripts/smoke-go-fixedpairs-checklist.mjs https://lpvolley.ru

const baseUrl = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3101').replace(/\/$/, '');

async function check(path) {
  try {
    const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    console.log(`${path} -> ${res.status}`);
  } catch (error) {
    console.log(`${path} -> ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function run() {
  console.log(`[smoke] baseUrl=${baseUrl}`);
  await check('/admin/tournaments');
  await check('/admin/login');
  await check('/calendar');

  console.log('\nManual checklist:');
  console.log('1) Open /admin/tournaments and create a new tournament.');
  console.log('2) Select format: "Группы + Олимп."');
  console.log('3) In "Посев", choose "Фикс. пары".');
  console.log('4) In "СОСТАВ ПО ГРУППАМ", verify View switch and HARD/MEDIUM/LITE columns.');
  console.log('5) Click a player from pool and verify placement into own level column.');
}

run();
