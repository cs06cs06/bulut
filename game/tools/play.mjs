// Headless test in manual-step mode: load, screenshot menu, play, drive with scripted keys.
// usage: STEPS='[{"down":["KeyW"],"secs":3,"shot":"drive"}]' node tools/play.mjs outdir
import { chromium } from 'playwright';
import fs from 'fs';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctxOpts = process.env.MOBILE ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } };
const page = await (await browser.newContext(ctxOpts)).newPage();
page.on('console', (m) => { const t = `[${m.type()}] ${m.text().slice(0, 400)}`; if ((m.type() === 'error' || m.type() === 'warning' || /\[load\]/.test(t)) && !/Clock|parallel_shader|404/.test(t)) console.log(t); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
const t0 = Date.now();
await page.goto((process.env.URL || 'http://127.0.0.1:5173/') + '?manual' + (process.env.MOBILE ? '&mobile' : '') + (process.env.Q ? '&' + process.env.Q : ''));
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
const adv = async (secs, dt) => page.evaluate(([s, d]) => window.__advance(s, d), [secs, dt || 1 / 30]);
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); };
if (process.env.PRE) await page.evaluate(process.env.PRE);
await adv(0.5); await shot('01_menu');
if (process.env.PLAY !== '0') {
  if (process.env.MOBILE) await page.tap('[data-action="play"]'); else await page.click('[data-action="play"]');
  await page.waitForTimeout(700);
  await adv(1); await shot('02_play');
  const steps = JSON.parse(process.env.STEPS || '[]');
  let i = 3;
  for (const s of steps) {
    if (s.eval) await page.evaluate(s.eval);
    if (s.touch) await page.evaluate(([sel, type, x]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: r.left + r.width / 2 + (x || 0), clientY: r.top + r.height / 2 })); }, s.touch);
    if (s.touch2) await page.evaluate(([sel, type, x]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: r.left + r.width / 2 + (x || 0), clientY: r.top + r.height / 2 })); }, s.touch2);
    if (s.down) for (const k of s.down) await page.keyboard.down(k);
    if (s.secs) await adv(s.secs);
    if (s.up) for (const k of s.up) await page.keyboard.up(k);
    if (s.shot) await shot(String(i++).padStart(2, '0') + '_' + s.shot);
    if (s.log) console.log(s.shot || 'log', JSON.stringify(await page.evaluate(s.log)));
  }
}
const info = await page.evaluate(() => { const g = window.__game; const r = g.rs.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, pos: g.vehicle.position.toArray().map(v => +v.toFixed(1)), kmh: +(g.vehicle.speed * 3.6).toFixed(1) }; });
console.log(JSON.stringify(info));
await browser.close();
