// Her vuruşun başında/ortasında bir kare çizip hata arar
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { serve, CHROME_ARGS } from './server.mjs';
const tl = JSON.parse(fs.readFileSync('build/timeline.json', 'utf8'));
const { srv, url } = await serve(path.resolve('.'));
const browser = await chromium.launch({ args: CHROME_ARGS });
const page = await browser.newPage();
let bad = 0;
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') { bad++; console.log('[sayfa]', m.text()); } });
await page.goto(`${url}/index.html?mode=render`);
await page.waitForFunction(() => window.READY === true);
const times = tl.beats.flatMap((b) => [b.start + 0.05, b.start + b.dur / 2]);
const errs = await page.evaluate((ts) => {
  const out = [];
  for (const t of ts) { try { window.renderTime(t); } catch (e) { out.push(`${t.toFixed(2)}: ${e.message}`); } }
  return out;
}, times);
console.log(`${times.length} kare denendi, ${errs.length} hata, ${bad} uyarı`);
errs.slice(0, 20).forEach((e) => console.log(e));
await browser.close(); srv.close();
