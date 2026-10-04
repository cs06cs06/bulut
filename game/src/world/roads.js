// Dirt road network: smooth splines, spatial hash for distance queries,
// and a smoothed target height profile used to carve the terrain.

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export class RoadNetwork {
  constructor(defs, cell = 24) {
    this.cell = cell;
    this.roads = [];
    this.segs = []; // flat: ax, az, bx, bz, ha, hb, halfWidth, roadIndex
    this.grid = new Map();
    for (const def of defs) this.roads.push(this._densify(def));
  }

  _densify(def) {
    const pts = def.points;
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(2, Math.ceil(len / 2));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        out.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
      }
    }
    out.push(pts[n - 1].slice());
    return { name: def.name, width: def.width || 6, points: out, heights: null, rail: !!def.rail, smooth: def.smooth };
  }

  // Compute a smooth longitudinal height profile from a height sampler.
  computeProfiles(sampleHeight) {
    for (const r of this.roads) {
      const raw = r.points.map(p => {
        // average across the road so the bed sits between uphill and downhill sides
        return sampleHeight(p[0], p[1]);
      });
      let h = raw.slice();
      const win = r.smooth || 9; // ~18 m each side (railway: much longer)
      for (let pass = 0; pass < 3; pass++) {
        const nh = h.slice();
        for (let i = 0; i < h.length; i++) {
          let s = 0, c = 0;
          for (let k = -win; k <= win; k++) {
            const j = Math.min(h.length - 1, Math.max(0, i + k));
            const w = 1 - Math.abs(k) / (win + 1);
            s += h[j] * w; c += w;
          }
          nh[i] = s / c;
        }
        h = nh;
      }
      r.heights = h;
    }
    this._buildSegments();
  }

  // level crossings: bring each road up/down to the rail bed where it meets the railway
  alignToRail() {
    const rail = this.roads.find((r) => r.rail);
    if (!rail) return;
    for (const r of this.roads) {
      if (r.rail) continue;
      for (let i = 0; i < r.points.length; i++) {
        const [x, z] = r.points[i];
        let bd = Infinity, bi = 0;
        for (let k = 0; k < rail.points.length; k += 2) { const d = (rail.points[k][0] - x) ** 2 + (rail.points[k][1] - z) ** 2; if (d < bd) { bd = d; bi = k; } }
        const d = Math.sqrt(bd);
        if (d > 60) continue;
        const w = 1 - Math.min(1, Math.max(0, (d - 8) / 52));
        const s = w * w * (3 - 2 * w);
        r.heights[i] += (rail.heights[bi] - r.heights[i]) * s;
      }
    }
    this.grid.clear();
    this._buildSegments();
  }

  _buildSegments() {
    const segs = [];
    this.roads.forEach((r, ri) => {
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i], b = r.points[i + 1];
        segs.push(a[0], a[1], b[0], b[1], r.heights[i], r.heights[i + 1], r.width / 2, ri);
      }
    });
    this.segs = new Float32Array(segs);
    const reach = 40; // max query distance supported
    const nseg = this.segs.length / 8;
    for (let s = 0; s < nseg; s++) {
      const o = s * 8;
      const minx = Math.min(this.segs[o], this.segs[o + 2]) - reach, maxx = Math.max(this.segs[o], this.segs[o + 2]) + reach;
      const minz = Math.min(this.segs[o + 1], this.segs[o + 3]) - reach, maxz = Math.max(this.segs[o + 1], this.segs[o + 3]) + reach;
      for (let cx = Math.floor(minx / this.cell); cx <= Math.floor(maxx / this.cell); cx++)
        for (let cz = Math.floor(minz / this.cell); cz <= Math.floor(maxz / this.cell); cz++) {
          const k = cx * 100003 + cz;
          let arr = this.grid.get(k);
          if (!arr) { arr = []; this.grid.set(k, arr); }
          arr.push(s);
        }
    }
  }

  // Returns nearest road info or null. out = {dist, height, halfWidth, dirX, dirZ}
  query(x, z, out = {}) {
    const arr = this.grid.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (!arr) return null;
    let best = Infinity, bi = -1, bt = 0;
    const S = this.segs;
    for (let k = 0; k < arr.length; k++) {
      const o = arr[k] * 8;
      const ax = S[o], az = S[o + 1], dx = S[o + 2] - ax, dz = S[o + 3] - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - x, pz = az + dz * t - z;
      const d = px * px + pz * pz;
      if (d < best) { best = d; bi = o; bt = t; }
    }
    if (bi < 0) return null;
    out.dist = Math.sqrt(best);
    out.height = S[bi + 4] + (S[bi + 5] - S[bi + 4]) * bt;
    out.halfWidth = S[bi + 6];
    const dx = S[bi + 2] - S[bi], dz = S[bi + 3] - S[bi + 1], l = Math.hypot(dx, dz) || 1;
    out.dirX = dx / l; out.dirZ = dz / l;
    out.road = S[bi + 7];
    return out;
  }
}

// Builds a contour-following spiral road: for each angle step the road sits at the radius
// where the terrain reaches a steadily rising target height → constant, drivable grade.
export function resolveSpiral(spec, baseHeight) {
  const { cx, cz, startX, startZ, turns, endHeight, dir = 1 } = spec;
  const a0 = Math.atan2(startZ - cz, startX - cx);
  const r0 = Math.hypot(startX - cx, startZ - cz);
  const h0 = baseHeight(startX, startZ);
  const steps = Math.round(turns * 180);
  const radii = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const th = a0 + dir * t * turns * Math.PI * 2;
    const target = h0 + (endHeight - h0) * t;
    let r = 12;
    for (let rr = r0 * 1.25; rr > 12; rr -= 1.5) {
      if (baseHeight(cx + Math.cos(th) * rr, cz + Math.sin(th) * rr) >= target) { r = rr; break; }
    }
    radii.push(r);
  }
  radii[0] = r0;
  // smooth radius profile, keep it from spiralling outwards
  for (let pass = 0; pass < 4; pass++) {
    const c = radii.slice();
    for (let k = 1; k < radii.length - 1; k++) {
      let s = 0, n = 0;
      for (let j = -6; j <= 6; j++) { const i = Math.min(radii.length - 1, Math.max(0, k + j)); s += c[i]; n++; }
      radii[k] = s / n;
    }
    for (let k = 1; k < radii.length; k++) radii[k] = Math.min(radii[k], radii[k - 1] + 2);
  }
  const pts = [];
  for (let k = 0; k <= steps; k += 2) {
    const th = a0 + dir * (k / steps) * turns * Math.PI * 2;
    pts.push([cx + Math.cos(th) * radii[k], cz + Math.sin(th) * radii[k]]);
  }
  const last = pts[pts.length - 1];
  pts.push([(last[0] + cx) / 2, (last[1] + cz) / 2]);
  pts.push([cx, cz]);
  return pts;
}
