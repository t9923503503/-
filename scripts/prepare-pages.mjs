import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, '_site');

const topLevelDirs = ['assets', 'data', 'formats', 'locales', 'prototypes', 'shared'];
const topLevelFiles = ['admin-init.js', 'admin.css', 'icon.svg', 'manifest.webmanifest', 'sw.js'];

function copyIntoSite(relPath) {
  const source = path.join(root, relPath);
  if (!fs.existsSync(source)) return;

  const target = path.join(outDir, relPath);
  const stats = fs.statSync(source);

  if (stats.isDirectory()) {
    fs.cpSync(source, target, { recursive: true });
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function listTopLevelHtml() {
  return fs.readdirSync(root).filter((entry) => {
    if (!entry.endsWith('.html')) return false;
    return fs.statSync(path.join(root, entry)).isFile();
  });
}

function validateServiceWorkerAssets() {
  const swPath = path.join(outDir, 'sw.js');
  const swSource = fs.readFileSync(swPath, 'utf8');
  const match = swSource.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/);

  if (!match) {
    throw new Error('Unable to parse CORE_ASSETS from _site/sw.js');
  }

  const missing = match[1]
    .split('\n')
    .map((line) => line.trim().replace(/^['"]\.\//, '').replace(/['"],?$/, ''))
    .filter((relPath) => relPath && relPath !== './')
    .filter((relPath) => !fs.existsSync(path.join(outDir, relPath)));

  if (missing.length > 0) {
    throw new Error(`Prepared Pages site is missing CORE_ASSETS files: ${missing.join(', ')}`);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const relPath of listTopLevelHtml()) {
  copyIntoSite(relPath);
}

for (const relPath of topLevelFiles) {
  copyIntoSite(relPath);
}

for (const relPath of topLevelDirs) {
  copyIntoSite(relPath);
}

// Pages should not depend on a private local config.js file being present.
fs.writeFileSync(
  path.join(outDir, 'config.js'),
  'window.APP_CONFIG = window.APP_CONFIG || {};\n',
  'utf8',
);
fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

validateServiceWorkerAssets();

console.log(`Prepared GitHub Pages artifact in ${outDir}`);
