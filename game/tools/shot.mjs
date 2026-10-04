// usage: node tools/shot.mjs <url> <out.png> [width height] [waitExpr]
import { chromium } from 'playwright';
import fs from 'fs';
const [url, out, w = 1600, h = 900] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || process.env.LOG) console.log('[console]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__done === true, null, { timeout: +(process.env.TIMEOUT || 120000) });
const data = await page.evaluate(() => window.__shot || null);
if (data) fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64')); else await page.screenshot({ path: out });
await browser.close();
