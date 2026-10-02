// Belirli anların kare görüntüsü: node tools/shot.mjs <çıktı-klasörü> t1 t2 ...
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { serve, CHROME_ARGS } from './server.mjs';

const [outDir, ...times] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const { srv, url } = await serve(path.resolve('.'));
const browser = await chromium.launch({ args: CHROME_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[sayfa]', m.text()));
page.on('pageerror', (e) => console.log('[hata]', e.message));
await page.goto(`${url}/index.html?mode=render`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
for (const t of times) {
  const t0 = Date.now();
  const data = await page.evaluate((tt) => window.renderTime(Number(tt)), t);
  fs.writeFileSync(path.join(outDir, `t${String(t).padStart(6, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
  console.log(t, `${Date.now() - t0} ms`);
}
await browser.close();
srv.close();
