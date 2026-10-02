// Bölümü kare kare çizip MP4'e döker.
//   node tools/render.mjs [--workers 3] [--from 0] [--to <sn>] [--out dist/gibi-yedek-anahtar.mp4]
// Her işçi ayrı bir Chromium açar, kendi kare aralığını ffmpeg'e borular;
// sonunda parçalar birleştirilip build/episode.m4a ile muxlanır.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serve, CHROME_ARGS } from './server.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const WORKERS = Number(arg('workers', 3));
const OUT = arg('out', 'dist/gibi-yedek-anahtar.mp4');
const CRF = arg('crf', '21');
const tl = JSON.parse(fs.readFileSync('build/timeline.json', 'utf8'));
const FPS = tl.fps;
const F0 = Math.floor(Number(arg('from', 0)) * FPS);
const F1 = Math.min(Math.ceil(Number(arg('to', tl.duration)) * FPS), Math.ceil(tl.duration * FPS));
const total = F1 - F0;

fs.mkdirSync('build/chunks', { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const { srv, url } = await serve(path.resolve('.'));

let done = 0;
const t0 = Date.now();
const progress = setInterval(() => {
  const el = (Date.now() - t0) / 1000;
  const rate = done / el;
  const eta = rate > 0 ? (total - done) / rate : 0;
  console.log(`  ${done}/${total} kare  ${(100 * done / total).toFixed(1)}%  ${rate.toFixed(1)} kare/sn  kalan ~${Math.round(eta / 60)} dk`);
}, 30000);

async function worker(k, a, b) {
  const file = `build/chunks/part_${String(k).padStart(2, '0')}.mp4`;
  const browser = await chromium.launch({ args: CHROME_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log(`[işçi ${k}] hata:`, e.message));
  await page.goto(`${url}/index.html?mode=render`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 180000 });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-pix_fmt', 'yuv420p', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((r) => ff.on('close', r));
  for (let i = a; i < b; i++) {
    const data = await page.evaluate((n) => window.renderFrame(n, 0.93), i);
    const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    done++;
  }
  ff.stdin.end();
  await closed;
  await browser.close();
  return file;
}

const per = Math.ceil(total / WORKERS);
const jobs = [];
for (let k = 0; k < WORKERS; k++) {
  const a = F0 + k * per, b = Math.min(F1, a + per);
  if (a < b) jobs.push(worker(k, a, b));
}
const parts = await Promise.all(jobs);
clearInterval(progress);
srv.close();

fs.writeFileSync('build/chunks/list.txt', parts.map((p) => `file '${path.resolve(p)}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'build/chunks/list.txt', '-c', 'copy', 'build/chunks/video.mp4']);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', 'build/chunks/video.mp4', '-ss', String(F0 / FPS), '-t', String(total / FPS), '-i', 'build/episode.m4a',
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', OUT]);
const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
console.log(`bitti: ${OUT} (${mb} MB, ${(total / FPS).toFixed(1)} sn, ${((Date.now() - t0) / 60000).toFixed(1)} dk)`);
