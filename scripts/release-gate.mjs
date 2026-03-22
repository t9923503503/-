import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

function assertSecurityAndStorageGuards() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const apiCode = readFileSync(new URL('../shared/api.js', import.meta.url), 'utf8');

  const metaMatch = html.match(
    /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i
  );
  if (!metaMatch) {
    throw new Error('CSP meta tag not found in index.html');
  }

  const scriptSrc = metaMatch[1]
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith('script-src'));
  if (!scriptSrc) {
    throw new Error('script-src directive not found in CSP');
  }
  if (scriptSrc.includes("'unsafe-inline'")) {
    throw new Error("script-src still contains 'unsafe-inline'");
  }

  const styleSrc = metaMatch[1]
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('style-src'));
  if (styleSrc && styleSrc.includes("'unsafe-inline'")) {
    throw new Error("style-src still contains 'unsafe-inline'");
  }

  if (!apiCode.includes('QuotaExceededError') || !apiCode.includes('showToast')) {
    throw new Error('localStorage quota guard is missing from shared/api.js');
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} failed with exit code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  console.log('\n[gate] 1/5 security + storage preflight');
  assertSecurityAndStorageGuards();

  console.log('\n[gate] 2/5 vite build');
  await run('npm', ['run', 'build']);

  console.log('\n[gate] 3/5 unit tests (includes build-smoke + localStorage stress)');
  await run('npm', ['run', 'test:unit']);

  console.log('\n[gate] 4/5 browser smoke');
  await run('npx', ['playwright', 'test', 'tests/smoke.spec.ts', '--reporter=list']);

  console.log('\n[gate] 5/5 thai + kotc e2e critical');
  await run('npx', ['playwright', 'test', 'tests/e2e', '--reporter=list']);

  console.log('\n[gate] release gate passed');
}

main().catch((err) => {
  console.error('\n[gate] release gate failed:', err.message);
  process.exit(1);
});

