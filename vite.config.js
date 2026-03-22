import { defineConfig } from 'vite';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vite multi-page config for "Лютые Пляжники".
 *
 * 9 HTML entry points. ES modules bundled + tree-shaken.
 * Classic scripts copied to dist/ via post-build plugin.
 * Next.js app (web/) excluded.
 */

function copyDirSync(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Vite injects style-src 'unsafe-inline' into CSP meta during HTML transform; strip so
 * production output matches strict CSP (S5.3).
 */
function stripStyleSrcUnsafeInlineFromHtml() {
  return {
    name: 'strip-style-src-unsafe-inline-html',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const id = String(ctx.filename || ctx.path || '');
        // register.html / profile.html still use inline <style> — keep unsafe-inline until extracted to CSS
        if (/(?:^|[\\/])register\.html$/i.test(id) || /(?:^|[\\/])profile\.html$/i.test(id)) {
          return html;
        }
        return html
          .replace(/\bstyle-src 'self' 'unsafe-inline' /g, "style-src 'self' ")
          .replace(/\bstyle-src 'self' 'unsafe-inline'/g, "style-src 'self'");
      },
    },
  };
}

function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    writeBundle() {
      const items = [
        'assets/js',
        'assets/images',
        'assets/sounds',
        'assets/app.css',
        'admin.css',
        'shared',
        'config.js',
        'sw.js',
        'manifest.webmanifest',
      ];
      for (const item of items) {
        const src = resolve(__dirname, item);
        const dest = resolve(__dirname, 'dist', item);
        if (!existsSync(src)) continue;
        if (statSync(src).isDirectory()) {
          copyDirSync(src, dest);
        } else {
          mkdirSync(dirname(dest), { recursive: true });
          copyFileSync(src, dest);
        }
      }
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: false,

  server: {
    port: 8000,
    open: '/index.html',
    headers: {
      'X-Frame-Options': 'SAMEORIGIN',
    },
    watch: {
      ignored: ['**/web/**', '**/node_modules/**', '**/.next/**', '**/dist/**'],
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ipt: resolve(__dirname, 'ipt-session.html'),
        admin: resolve(__dirname, 'admin.html'),
        playerCard: resolve(__dirname, 'player-card.html'),
        profile: resolve(__dirname, 'profile.html'),
        rating: resolve(__dirname, 'rating.html'),
        register: resolve(__dirname, 'register.html'),
        kotc: resolve(__dirname, 'formats/kotc/kotc.html'),
        thai: resolve(__dirname, 'formats/thai/thai.html'),
      },
    },
    assetsInlineLimit: 0,
    sourcemap: true,
    target: 'es2020',
  },

  plugins: [stripStyleSrcUnsafeInlineFromHtml(), copyStaticAssets()],
});
