// Dumps the resolved layout (incl. spiral road) to JSON for tools/design.mjs
import fs from 'fs';
import * as L from '../src/world/layout.js';
import { resolveSpiral } from '../src/world/roads.js';
const meta = JSON.parse(fs.readFileSync('public/assets/terrain/terrain.json'));
const u16 = new Uint16Array(fs.readFileSync('public/assets/terrain/height.bin').buffer.slice(0));
const N = meta.resolution, half = meta.size / 2, sp = meta.size / (N - 1);
const bh = (x, z) => { const i = Math.round((x + half) / sp), j = Math.round((z + half) / sp); return u16[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))] / 65535 * (meta.maxHeight - meta.minHeight) + meta.minHeight - 740; };
const roads = L.ROADS.map(r => r.spiral ? { ...r, points: resolveSpiral(r.spiral, bh) } : r);
const sp2 = roads.find(r => r.spiral); let len = 0; for (let i = 1; i < sp2.points.length; i++) len += Math.hypot(sp2.points[i][0] - sp2.points[i - 1][0], sp2.points[i][1] - sp2.points[i - 1][1]);
console.log('spiral length', len.toFixed(0), 'm, climb', (352 - bh(-330, -362)).toFixed(0), 'm');
fs.writeFileSync(process.argv[2], JSON.stringify({ roads, farmyards: L.FARMS, pois: L.POIS }));
