'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const ig = require('./lib/instagram');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Yalnızca Instagram CDN'lerine vekil ol — açık proxy olmasın.
const MEDIA_HOST_RE = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(payload);
}

function sendError(res, err) {
  const status = err instanceof ig.IgError ? err.status : 500;
  const code = err instanceof ig.IgError ? err.code : 'internal';
  if (!(err instanceof ig.IgError)) console.error(err);
  sendJson(res, status, { error: code, message: err.message || 'Beklenmeyen hata' });
}

async function proxyMedia(req, res, rawUrl) {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return sendJson(res, 400, { error: 'bad_request', message: 'Geçersiz adres' });
  }
  if (target.protocol !== 'https:' || !MEDIA_HOST_RE.test(target.hostname)) {
    return sendJson(res, 403, { error: 'forbidden', message: 'Bu adrese izin verilmiyor' });
  }
  const headers = { 'User-Agent': ig.MOBILE_UA, Referer: 'https://www.instagram.com/' };
  if (req.headers.range) headers.Range = req.headers.range;

  const controller = new AbortController();
  req.on('close', () => controller.abort());
  let upstream;
  try {
    upstream = await fetch(target, { headers, signal: controller.signal });
  } catch {
    if (!res.headersSent) sendJson(res, 502, { error: 'upstream', message: 'Medya alınamadı' });
    return;
  }
  const out = {
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
  };
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const v = upstream.headers.get(h);
    if (v) out[h] = v;
  }
  if (req.query?.dl) out['Content-Disposition'] = `attachment; filename="${req.query.dl.replace(/[^\w.-]/g, '_')}"`;
  res.writeHead(upstream.status, out);
  if (!upstream.body || req.method === 'HEAD') return res.end();
  Readable.fromWeb(upstream.body)
    .on('error', () => res.destroy())
    .pipe(res);
}

// Tek dosyalık paket (scripts/bundle.js) statik dosyaları bellekte taşır.
const EMBEDDED = globalThis.__PENCERE_ASSETS || null;

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // SPA yönlendirmesi
  if (EMBEDDED) {
    const body = Object.hasOwn(EMBEDDED, rel) ? Buffer.from(EMBEDDED[rel], 'base64') : null;
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bulunamadı');
    }
    const ext = path.extname(rel);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': ext === '.html' || rel === '/sw.js' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bulunamadı');
    }
    const ext = path.extname(file);
    const noCache = ext === '.html' || path.basename(file) === 'sw.js';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname, searchParams } = url;
  req.query = Object.fromEntries(searchParams);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }

  try {
    let m;
    if ((m = pathname.match(/^\/api\/profile\/([^/]+)$/))) {
      return sendJson(res, 200, await ig.getProfile(decodeURIComponent(m[1])));
    }
    if ((m = pathname.match(/^\/api\/user\/(\d+)\/posts$/))) {
      return sendJson(res, 200, await ig.getMorePosts(m[1], searchParams.get('after') || ''));
    }
    if ((m = pathname.match(/^\/api\/post\/([^/]+)$/))) {
      return sendJson(res, 200, await ig.getPost(m[1]));
    }
    if (pathname === '/media') {
      return await proxyMedia(req, res, searchParams.get('u') || '');
    }
    if (pathname === '/api/health') {
      return sendJson(res, 200, { ok: true });
    }
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'not_found', message: 'Bilinmeyen uç nokta' });
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    return sendError(res, err);
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) sendError(res, err);
    else res.destroy();
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Pencere çalışıyor → ${url}`);
    // Aynı ağdaki diğer cihazlar için yerel IP adresleri
    for (const list of Object.values(require('node:os').networkInterfaces())) {
      for (const a of list || []) {
        if (a.family === 'IPv4' && !a.internal) console.log(`  Aynı Wi-Fi'deki cihazlardan: http://${a.address}:${PORT}`);
      }
    }
    // Termux'ta tarayıcıyı otomatik aç
    if (process.env.TERMUX_VERSION && !process.env.PENCERE_NO_OPEN) {
      require('node:child_process').spawn('termux-open-url', [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    }
    console.log('Durdurmak için Ctrl+C');
  });
}

module.exports = server;
