import { spawn } from 'node:child_process';

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
  console.log('\n[gate] 1/3 unit tests');
  await run('npm', ['run', 'test:unit']);

  console.log('\n[gate] 2/3 browser smoke');
  await run('npx', ['playwright', 'test', 'tests/smoke.spec.ts', '--reporter=list']);

  console.log('\n[gate] 3/3 thai e2e critical');
  await run('npx', ['playwright', 'test', 'tests/e2e', '--reporter=list']);

  console.log('\n[gate] release gate passed');
}

main().catch((err) => {
  console.error('\n[gate] release gate failed:', err.message);
  process.exit(1);
});

