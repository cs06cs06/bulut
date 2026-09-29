// Procedural athletic body: signed-distance-field build around the rest skeleton,
// meshed with naive surface nets and skinned to the (Ready-Player-Me / Mixamo style) rig.
import * as THREE from 'three';

/* ---------- SDF helpers ---------- */
const _v = new THREE.Vector3();
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
// round cone between a and b with radii ra, rb
function sdRoundCone(px, py, pz, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}
function sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const m = Math.min(r[0], r[1], r[2]);
  return (k0 - 1) * m;
}

/* ---------- body description (built from the rest-pose joint positions) ---------- */
export function makeBodySDF(J) {
  // J: map of joint name -> [x,y,z] in rest pose (RPM naming without prefix)
  const P = n => J[n];
  const prims = [];
  const cone = (a, b, ra, rb, group) => prims.push({ t: 0, a, b, ra, rb, group });
  const ell = (c, r, group) => prims.push({ t: 1, c, r, group });
  const add = (v, o) => [v[0] + o[0], v[1] + o[1], v[2] + o[2]];
  const mid = (a, b, t = 0.5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  const hips = P('Hips'), spine = P('Spine'), spine1 = P('Spine1'), spine2 = P('Spine2'), neck = P('Neck'), head = P('Head');
  // ---- torso (stacked elliptical sections -> athletic V taper)
  ell(add(hips, [0, -0.035, -0.004]), [0.172, 0.105, 0.108], 'core');            // pelvis
  ell(add(hips, [0, 0.105, 0.0]), [0.150, 0.085, 0.092], 'core');                 // waist
  ell(add(spine1, [0, -0.005, 0.004]), [0.158, 0.10, 0.098], 'core');             // upper abdomen
  ell(add(spine2, [0, 0.005, 0.004]), [0.190, 0.125, 0.117], 'core');             // chest
  ell(add(spine2, [0, 0.075, -0.012]), [0.186, 0.068, 0.096], 'core');            // shoulder girdle
  ell(add(spine2, [0.090, 0.035, 0.056]), [0.090, 0.058, 0.044], 'core');         // pec L
  ell(add(spine2, [-0.090, 0.035, 0.056]), [0.090, 0.058, 0.044], 'core');        // pec R
  ell(add(spine1, [0.115, 0.03, -0.028]), [0.055, 0.14, 0.075], 'core');          // lat L
  ell(add(spine1, [-0.115, 0.03, -0.028]), [0.055, 0.14, 0.075], 'core');         // lat R
  ell(add(spine2, [0, 0.10, -0.045]), [0.118, 0.05, 0.055], 'core');              // traps
  ell(add(hips, [0.088, -0.075, -0.078]), [0.092, 0.092, 0.082], 'core');         // glute L
  ell(add(hips, [-0.088, -0.075, -0.078]), [0.092, 0.092, 0.082], 'core');        // glute R
  // ---- neck
  cone(add(neck, [0, -0.02, 0.0]), add(head, [0, 0.0, 0.0]), 0.056, 0.050, 'neck');
  ell(add(neck, [0, -0.005, -0.01]), [0.082, 0.038, 0.055], 'neck');
  // ---- arms + legs (mirror)
  for (const side of ['Left', 'Right']) {
    const sh = P(side + 'Shoulder'), arm = P(side + 'Arm'), fore = P(side + 'ForeArm'), hand = P(side + 'Hand');
    const s = side === 'Left' ? 1 : -1;
    cone(add(sh, [0, -0.005, -0.005]), arm, 0.052, 0.060, 'shoulder');
    ell(add(arm, [s * 0.005, 0.0, 0]), [0.068, 0.068, 0.068], 'shoulder');         // deltoid
    cone(arm, fore, 0.056, 0.042, 'uarm');
    ell(mid(arm, fore, 0.42), [0.050, 0.062, 0.046], 'uarm');                        // bicep/tricep
    cone(fore, hand, 0.042, 0.031, 'farm');
    ell(mid(fore, hand, 0.25), [0.048, 0.06, 0.044], 'farm');
    const up = P(side + 'UpLeg'), knee = P(side + 'Leg'), ankle = P(side + 'Foot'), toe = P(side + 'ToeBase'), toeEnd = P(side + 'Toe_End');
    cone(add(up, [0, 0.02, 0]), knee, 0.103, 0.062, 'thigh');
    ell(add(mid(up, knee, 0.40), [0, 0, 0.012]), [0.092, 0.18, 0.096], 'thigh');            // quad
    ell(add(mid(up, knee, 0.35), [-s * 0.02, 0, -0.05]), [0.085, 0.15, 0.075], 'thigh'); // hamstring
    cone(knee, ankle, 0.060, 0.038, 'calf');
    ell(add(mid(knee, ankle, 0.30), [0, 0, -0.03]), [0.056, 0.115, 0.058], 'calf');   // gastrocnemius
    cone(add(ankle, [0, 0.01, 0.005]), toe, 0.042, 0.041, 'foot');
    cone(toe, add(toeEnd, [0, 0.005, -0.02]), 0.043, 0.030, 'foot');
    ell(add(ankle, [0, -0.028, 0.055]), [0.046, 0.045, 0.098], 'foot');
  }
  // bounding boxes for culling
  for (const p of prims) {
    let mn, mx, m;
    if (p.t === 0) { m = Math.max(p.ra, p.rb) + 0.08; mn = [Math.min(p.a[0], p.b[0]) - m, Math.min(p.a[1], p.b[1]) - m, Math.min(p.a[2], p.b[2]) - m]; mx = [Math.max(p.a[0], p.b[0]) + m, Math.max(p.a[1], p.b[1]) + m, Math.max(p.a[2], p.b[2]) + m]; }
    else { m = 0.08; mn = [p.c[0] - p.r[0] - m, p.c[1] - p.r[1] - m, p.c[2] - p.r[2] - m]; mx = [p.c[0] + p.r[0] + m, p.c[1] + p.r[1] + m, p.c[2] + p.r[2] + m]; }
    p.mn = mn; p.mx = mx;
  }
  const K = 0.035;
  return function sdf(x, y, z) {
    let d = 1e9;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      if (x < p.mn[0] || x > p.mx[0] || y < p.mn[1] || y > p.mx[1] || z < p.mn[2] || z > p.mx[2]) continue;
      const v = p.t === 0 ? sdRoundCone(x, y, z, p.a, p.b, p.ra, p.rb) : sdEllipsoid(x, y, z, p.c, p.r);
      d = d > 1e8 ? v : smin(d, v, K);
    }
    return d;
  };
}

/* ---------- naive surface nets ---------- */
export function surfaceNets(sdf, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    field[idx(i, j, k)] = sdf(min[0] + i * h, min[1] + j * h, min[2] + k * h);
  }
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const verts = [];
  const cubeEdges = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const vals = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = field[idx(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
      vals[c] = v; if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const [a, b] of cubeEdges) {
      const va = vals[a], vb = vals[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      cx += corner[a][0] + t * (corner[b][0] - corner[a][0]);
      cy += corner[a][1] + t * (corner[b][1] - corner[a][1]);
      cz += corner[a][2] + t * (corner[b][2] - corner[a][2]);
      n++;
    }
    cellVert[idx(i, j, k)] = verts.length / 3;
    verts.push(min[0] + (i + cx / n) * h, min[1] + (j + cy / n) * h, min[2] + (k + cz / n) * h);
  }
  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c); else indices.push(a, b, c, a, c, d);
  };
  // for each grid edge with a sign change, emit a quad from the 4 cells sharing it
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = field[idx(i, j, k)] < 0;
    // x-edge
    let v1 = field[idx(i + 1, j, k)] < 0;
    if (v0 !== v1) quad(cellVert[idx(i, j - 1, k - 1)], cellVert[idx(i, j, k - 1)], cellVert[idx(i, j, k)], cellVert[idx(i, j - 1, k)], !v0);
    // y-edge
    v1 = field[idx(i, j + 1, k)] < 0;
    if (v0 !== v1) quad(cellVert[idx(i - 1, j, k - 1)], cellVert[idx(i - 1, j, k)], cellVert[idx(i, j, k)], cellVert[idx(i, j, k - 1)], !v0);
    // z-edge
    v1 = field[idx(i, j, k + 1)] < 0;
    if (v0 !== v1) quad(cellVert[idx(i - 1, j - 1, k)], cellVert[idx(i, j - 1, k)], cellVert[idx(i, j, k)], cellVert[idx(i - 1, j, k)], !v0);
  }
  return { positions: new Float32Array(verts), indices: new Uint32Array(indices) };
}

/* ---------- skinning ---------- */
function distSeg(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  let t = (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz + 1e-9);
  t = Math.max(0, Math.min(1, t));
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function buildBodyGeometry(J, boneIndexOf, { h = 0.0125 } = {}) {
  const sdf = makeBodySDF(J);
  const min = [-0.5, -0.02, -0.26], max = [0.5, 1.72, 0.30];
  const { positions, indices } = surfaceNets(sdf, min, max, h);
  const nv = positions.length / 3;

  // Laplacian smoothing of positions (keeps volume reasonable with 2 mild passes)
  const nbr = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    nbr[a].add(b); nbr[a].add(c); nbr[b].add(a); nbr[b].add(c); nbr[c].add(a); nbr[c].add(b);
  }
  const smooth = (arr, dim, lambda) => {
    const out = new Float32Array(arr.length);
    for (let v = 0; v < nv; v++) {
      const n = nbr[v];
      if (!n.size) { for (let d = 0; d < dim; d++) out[v * dim + d] = arr[v * dim + d]; continue; }
      for (let d = 0; d < dim; d++) {
        let s = 0; for (const u of n) s += arr[u * dim + d];
        out[v * dim + d] = arr[v * dim + d] * (1 - lambda) + (s / n.size) * lambda;
      }
    }
    return out;
  };
  let pos = positions;
  pos = smooth(pos, 3, 0.35);

  // Normals from SDF gradient
  const normals = new Float32Array(nv * 3);
  const e = h * 0.6;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    normals[v * 3] = gx / l; normals[v * 3 + 1] = gy / l; normals[v * 3 + 2] = gz / l;
  }

  // Bone segments for weighting: [bone, from, to, radius]
  const seg = [];
  const S = (bone, a, b, r) => seg.push({ bone, a: J[a], b: J[b] || J[a], r });
  S('Hips', 'Hips', 'Hips', 0.14); seg[seg.length - 1].a = [J.Hips[0], J.Hips[1] - 0.04, J.Hips[2]]; seg[seg.length - 1].b = [J.Hips[0], J.Hips[1] + 0.03, J.Hips[2]];
  S('Spine', 'Spine', 'Spine1', 0.13); S('Spine1', 'Spine1', 'Spine2', 0.15); S('Spine2', 'Spine2', 'Neck', 0.17);
  S('Neck', 'Neck', 'Head', 0.05);
  for (const side of ['Left', 'Right']) {
    S(side + 'Shoulder', side + 'Shoulder', side + 'Arm', 0.05);
    S(side + 'Arm', side + 'Arm', side + 'ForeArm', 0.05);
    S(side + 'ForeArm', side + 'ForeArm', side + 'Hand', 0.04);
    S(side + 'Hand', side + 'Hand', side + 'HandMiddle1', 0.03);
    S(side + 'UpLeg', side + 'UpLeg', side + 'Leg', 0.09);
    S(side + 'Leg', side + 'Leg', side + 'Foot', 0.055);
    S(side + 'Foot', side + 'Foot', side + 'ToeBase', 0.045);
    S(side + 'ToeBase', side + 'ToeBase', side + 'Toe_End', 0.04);
  }
  const NB = seg.length;
  const W = new Float32Array(nv * NB);
  const p = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    p[0] = pos[v * 3]; p[1] = pos[v * 3 + 1]; p[2] = pos[v * 3 + 2];
    let sum = 0;
    for (let s = 0; s < NB; s++) {
      const d = distSeg(p, seg[s].a, seg[s].b);
      const ex = Math.max(0, d - seg[s].r * 0.55);
      const w = 1 / Math.pow(0.012 + ex, 3.2);
      W[v * NB + s] = w; sum += w;
    }
    for (let s = 0; s < NB; s++) W[v * NB + s] /= sum;
  }
  // smooth weights across the surface, then keep top-4
  let Ws = W;
  for (let it = 0; it < 3; it++) Ws = smooth(Ws, NB, 0.5);
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4);
  const order = new Array(NB);
  for (let v = 0; v < nv; v++) {
    for (let s = 0; s < NB; s++) order[s] = s;
    order.sort((a, b) => Ws[v * NB + b] - Ws[v * NB + a]);
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += Ws[v * NB + order[k]];
    for (let k = 0; k < 4; k++) {
      skinIndex[v * 4 + k] = boneIndexOf(seg[order[k]].bone);
      skinWeight[v * 4 + k] = Ws[v * NB + order[k]] / sum;
    }
  }
  // uv: cylindrical-ish projection (only used for detail mapping fallback)
  const uv = new Float32Array(nv * 2);
  for (let v = 0; v < nv; v++) { uv[v * 2] = pos[v * 3] * 2.0 + 0.5; uv[v * 2 + 1] = pos[v * 3 + 1] * 1.0; }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
