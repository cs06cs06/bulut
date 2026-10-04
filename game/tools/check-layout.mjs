// Reports buildings that overlap roads (approximate footprint radius).
import * as L from '../src/world/layout.js';
const R = { barn: 6, barn_big: 7, barn_small: 5, barn_open: 5, silo: 3, silo_house: 4, windmill: 3, water_tower: 3, chicken_coop: 2, well: 1.5, farm_barn: 5, cistern: 2.5, tractor: 3, cart: 2, farmhouse_a: 6, farmhouse_e: 6, farmhouse_g: 6, farmhouse_h: 6, farmhouse_r: 5 };
const segs = [];
for (const r of L.ROADS) if (r.points) for (let i = 0; i < r.points.length - 1; i++) segs.push([...r.points[i], ...r.points[i + 1], r.width / 2, r.name]);
const dist = (x, z) => { let best = [1e9, '']; for (const [ax, az, bx, bz, hw, n] of segs) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = ((x - ax) * dx + (z - az) * dz) / l2; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(ax + dx * t - x, az + dz * t - z) - hw; if (d < best[0]) best = [d, n]; } return best; };
for (const f of L.FARMS) {
  const rot = f.rot * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
  for (const [m, lx, lz] of L.FARM_BUILDINGS[f.id]) {
    if (!R[m]) continue;
    const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c;
    const [d, n] = dist(x, z);
    if (d < R[m] + 2) console.log(`${f.id}: ${m} at (${x.toFixed(0)},${z.toFixed(0)}) is ${d.toFixed(1)}m from ${n}`);
  }
  for (const p of L.PADDOCKS.filter(p => p.farm === f.id)) {
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const lx = p.x + cx * p.w / 2, lz = p.z + cz * p.d / 2;
      const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c;
      const [d, n] = dist(x, z); if (d < 2) console.log(`${f.id}: paddock point (${x.toFixed(0)},${z.toFixed(0)}) on ${n}`);
    }
  }
  console.log(f.id, 'centre to road', dist(f.x, f.z).map(v => typeof v === 'number' ? v.toFixed(1) : v).join(' '));
}
