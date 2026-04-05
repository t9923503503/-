#!/usr/bin/env node
// Статический сервер для КОТС с заголовками безопасности (frame-ancestors).
// Замена http-server для dev/production.
// Запуск: node serve.mjs [port]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2] || process.env.PORT || '8000', 10);

// Домены, которым разрешено встраивать КОТС в iframe.
// В продакшене замени на реальный домен, например 'https://sv-ugra.ru'.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
};

function getMime(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  // Убираем query string
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(__dirname, decodeURIComponent(url.pathname));

  // Если путь — директория, отдаём index.html
  if (filePath.endsWith(path.sep) || filePath === __dirname) {
    filePath = path.join(filePath, 'index.html');
  }

  // Безопасность: не выходим за пределы корня
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Если файл не найден, пробуем index.html (для SPA)
      if (path.extname(filePath) === '') {
        filePath = path.join(filePath, 'index.html');
        fs.stat(filePath, (err2, stats2) => {
          if (err2 || !stats2.isFile()) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          serve(filePath, res);
        });
        return;
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    serve(filePath, res);
  });
});

function serve(filePath, res) {
  const frameAncestors = ALLOWED_ORIGINS.split(',').map(s => s.trim()).join(' ');

  res.setHeader('Content-Type', getMime(filePath));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // frame-ancestors — современная замена X-Frame-Options,
  // разрешает встраивание только с указанных доменов
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frameAncestors}`);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Без кеша в dev
  res.setHeader('Cache-Control', 'no-cache');

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(500);
    res.end('Internal server error');
  });
  stream.pipe(res);
}

server.listen(PORT, () => {
  console.log(`КОТС сервер запущен: http://localhost:${PORT}`);
  console.log(`Разрешённые origins для iframe: ${ALLOWED_ORIGINS}`);
});
