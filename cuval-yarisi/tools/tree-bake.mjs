// Poly Haven ağaçlarını tree-bake.html ile üç açıdan render edip PNG + sınır kutusu JSON'u yazar.
// tree-bake.html'in bulunduğu klasör three/ (three.js) ve ph/<id>/<id>_1k.gltf ile birlikte sunulmalı.
// Kullanım: BAKE_URL=http://localhost:8090 OUT=<klasör> [F=/ph/x/x.glb] node tools/tree-bake.mjs <id>...
import { chromium } from 'playwright';
import fs from 'fs';
const ids = process.argv.slice(2);
const URL = process.env.BAKE_URL || 'http://localhost:8090', OUT = process.env.OUT || '.';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const id of ids) {
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`${URL}/tree-bake.html?id=${id}&s=512&v=3${process.env.F ? '&f=' + process.env.F : ''}`);
  await p.waitForFunction(() => window.__bake, null, { timeout: 600000 });
  const r = await p.evaluate(() => window.__bake);
  r.out.forEach((d, i) => fs.writeFileSync(`${OUT}/${id}_${i}.png`, Buffer.from(d.split(',')[1], 'base64')));
  fs.writeFileSync(`${OUT}/${id}.json`, JSON.stringify({ box: r.box, half: r.half, center: r.center }));
  console.log(id, JSON.stringify({ box: r.box.map((v) => v.map((x) => +x.toFixed(2))), half: +r.half.toFixed(2) }));
  await p.close();
}
await b.close();
