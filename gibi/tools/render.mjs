// Bölümü kare kare çizip MP4'e döker — kesintiye dayanıklı.
//   node tools/render.mjs --ep <bölüm> [--workers 2] [--from 0] [--to <sn>] [--out dist/<bölüm>.mp4]
// Kareler 20 saniyelik bölümlere ayrılır; her bölüm ayrı bir dosyaya yazılır ve
// bitince ".ok" işaretiyle kaydedilir. İşlem yarıda kesilirse yeniden
// çalıştırıldığında tamamlanmış bölümler atlanır. Sonunda bölümler birleştirilip
// build/<bölüm>/episode.m4a ile muxlanır.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serve, CHROME_ARGS } from './server.mjs';
import { BUILD, EP } from './ep.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const WORKERS = Number(arg('workers', 2));
const OUT = arg('out', `dist/${EP}.mp4`);
const CRF = arg('crf', '23');
const SEG = Number(arg('seg', 480));
const tl = JSON.parse(fs.readFileSync(`${BUILD}/timeline.json`, 'utf8'));
const FPS = tl.fps;
const F0 = Math.floor(Number(arg('from', 0)) * FPS);
const F1 = Math.min(Math.ceil(Number(arg('to', tl.duration)) * FPS), Math.ceil(tl.duration * FPS));
const total = F1 - F0;

const DIR = `${BUILD}/segs-${F0}-${F1}`;
fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const segs = [];
for (let a = F0, k = 0; a < F1; a += SEG, k++) {
  const file = `${DIR}/seg_${String(k).padStart(4, '0')}.mp4`;
  segs.push({ k, a, b: Math.min(F1, a + SEG), file, done: fs.existsSync(file + '.ok') && fs.existsSync(file) });
}
const todo = segs.filter((s) => !s.done);
const already = segs.length - todo.length;
console.log(`${segs.length} bölüm, ${already} tanesi hazır, ${todo.length} kaldı (${todo.reduce((n, s) => n + s.b - s.a, 0)} kare)`);

const { srv, url } = await serve(path.resolve('.'));
let done = 0;
const need = todo.reduce((n, s) => n + s.b - s.a, 0);
const t0 = Date.now();
const progress = setInterval(() => {
  const el = (Date.now() - t0) / 1000;
  const rate = done / el;
  const eta = rate > 0 ? (need - done) / rate : 0;
  console.log(`  ${done}/${need} kare  ${(100 * done / Math.max(1, need)).toFixed(1)}%  ${rate.toFixed(2)} kare/sn  kalan ~${Math.round(eta / 60)} dk`);
}, 60000);

let next = 0;
async function worker(w) {
  const browser = await chromium.launch({ args: CHROME_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log(`[işçi ${w}] hata:`, e.message));
  await page.goto(`${url}/index.html?mode=render&ep=${EP}${process.env.QS || ''}`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 180000 });
  while (next < todo.length) {
    const s = todo[next++];
    const tmp = s.file.replace('.mp4', '.tmp.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-tune', 'animation', '-crf', CRF, '-pix_fmt', 'yuv420p', '-r', String(FPS), tmp],
    { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise((r) => ff.on('close', r));
    for (let i = s.a; i < s.b; i++) {
      const data = await page.evaluate((n) => window.renderFrame(n, 0.93), i);
      const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      done++;
    }
    ff.stdin.end();
    const code = await closed;
    if (code !== 0) throw new Error(`ffmpeg hata kodu ${code} (bölüm ${s.k})`);
    fs.renameSync(tmp, s.file);
    fs.writeFileSync(s.file + '.ok', '');
    console.log(`  bölüm ${s.k} tamam (${s.a}-${s.b})`);
  }
  await browser.close();
}

await Promise.all(Array.from({ length: Math.min(WORKERS, Math.max(1, todo.length)) }, (_, w) => worker(w)));
clearInterval(progress);
srv.close();

fs.writeFileSync(`${DIR}/list.txt`, segs.map((s) => `file '${path.resolve(s.file)}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${DIR}/list.txt`, '-c', 'copy', `${DIR}/video.mp4`]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${DIR}/video.mp4`, '-ss', String(F0 / FPS), '-t', String(total / FPS), '-i', `${BUILD}/episode.m4a`,
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', OUT]);
const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
console.log(`bitti: ${OUT} (${mb} MB, ${(total / FPS).toFixed(1)} sn)`);
