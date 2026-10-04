import fs from 'fs';
import { Terrain } from '../../src/world/terrain.js';
import * as L from '../../src/world/layout.js';
const meta = JSON.parse(fs.readFileSync('public/assets/terrain/terrain.json'));
const inner = new Uint16Array(fs.readFileSync('public/assets/terrain/height.bin').buffer.slice(0));
const outer = new Uint16Array(fs.readFileSync('public/assets/terrain/height_outer.bin').buffer.slice(0));
const P = Terrain.prototype;
for (const k of ['_buildHeights', '_buildSplat', '_initChunks', '_buildOuter']) { const f = P[k]; P[k] = function (...a) { const t = performance.now(); const r = f.apply(this, a); console.log(k, (performance.now() - t).toFixed(0), 'ms'); return r; }; }
const t = performance.now();
const layout = { roads: L.ROADS.map(r => ({ ...r })), farmyards: L.FARMS.map(f => ({ x: f.x, z: f.z, r: f.r })), flatten: L.FARMS.map(f => ({ x: f.x, z: f.z, r: f.r * 0.75, falloff: 30 })) };
new Terrain({ meta, inner, outer, layout, textures: {} });
console.log('total', (performance.now() - t).toFixed(0));
