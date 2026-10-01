// İşaretli mesafe alanları (SDF) ve "surface nets" yüzey çıkarıcı.
// Karakterler küre/silindir yığını yerine, yumuşak birleştirilmiş şekillerden tek parça organik yüzey olarak üretilir.

// ---------- İlkel şekiller (iq'nun formülleri) ----------
const hypot3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// 3x3 döndürme (Euler XYZ) -> ters matris (dünyadan yerele)
function invRot(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz * Ry * Rx (three.js 'XYZ' sırası); tersi = transpoz
  const m = [
    cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz,
    cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz,
    -sy, sx * cy, cx * cy,
  ];
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function sphere(c, r) {
  const [cx, cy, cz] = c;
  return { f: (x, y, z) => hypot3(x - cx, y - cy, z - cz) - r, box: [cx - r, cy - r, cz - r, cx + r, cy + r, cz + r] };
}

export function ellipsoid(c, rad, rot) {
  const [cx, cy, cz] = c, [a, b, d] = rad;
  const R = rot ? invRot(...rot) : null;
  const m = Math.max(a, b, d);
  return {
    f: (x, y, z) => {
      let px = x - cx, py = y - cy, pz = z - cz;
      if (R) { const qx = R[0] * px + R[1] * py + R[2] * pz, qy = R[3] * px + R[4] * py + R[5] * pz, qz = R[6] * px + R[7] * py + R[8] * pz; px = qx; py = qy; pz = qz; }
      const k0 = hypot3(px / a, py / b, pz / d), k1 = hypot3(px / (a * a), py / (b * b), pz / (d * d));
      return k1 < 1e-9 ? -m : (k0 * (k0 - 1)) / k1;
    },
    box: [cx - m, cy - m, cz - m, cx + m, cy + m, cz + m],
  };
}

// İki uçta farklı yarıçaplı yuvarlak koni (kol, bacak, parmak, kumaş kolları)
export function cone(a, b, r1, r2) {
  const [ax, ay, az] = a, [bx, by, bz] = b;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const m = Math.max(r1, r2);
  return {
    f: (x, y, z) => {
      const pax = x - ax, pay = y - ay, paz = z - az;
      const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
      const xvx = pax * l2 - bax * yy, xvy = pay * l2 - bay * yy, xvz = paz * l2 - baz * yy;
      const x2 = xvx * xvx + xvy * xvy + xvz * xvz, y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
    box: [Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m, Math.max(az, bz) + m],
  };
}

// Yuvarlatılmış kutu
export function rbox(c, half, r = 0, rot) {
  const [cx, cy, cz] = c, [hx, hy, hz] = half;
  const R = rot ? invRot(...rot) : null;
  const m = hypot3(hx, hy, hz) + r;
  return {
    f: (x, y, z) => {
      let px = x - cx, py = y - cy, pz = z - cz;
      if (R) { const qx = R[0] * px + R[1] * py + R[2] * pz, qy = R[3] * px + R[4] * py + R[5] * pz, qz = R[6] * px + R[7] * py + R[8] * pz; px = qx; py = qy; pz = qz; }
      const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r, qz = Math.abs(pz) - hz + r;
      return hypot3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
    box: [cx - m, cy - m, cz - m, cx + m, cy + m, cz + m],
  };
}

// Y eksenli halka (kuşak, boyun sargısı), isteğe bağlı döndürme
export function torus(c, R0, r, rot, sy = 1) {
  const [cx, cy, cz] = c;
  const Ri = rot ? invRot(...rot) : null;
  const m = R0 + r;
  return {
    f: (x, y, z) => {
      let px = x - cx, py = y - cy, pz = z - cz;
      if (Ri) { const qx = Ri[0] * px + Ri[1] * py + Ri[2] * pz, qy = Ri[3] * px + Ri[4] * py + Ri[5] * pz, qz = Ri[6] * px + Ri[7] * py + Ri[8] * pz; px = qx; py = qy; pz = qz; }
      const q = Math.hypot(px, pz) - R0;
      return Math.hypot(q, py / sy) - r;
    },
    box: [cx - m, cy - m * 1.5, cz - m, cx + m, cy + m * 1.5, cz + m],
  };
}

// Düzlem yarı uzayı: n·p - d (n birim). Kesme işlemleri için.
export function plane(n, d) {
  return { f: (x, y, z) => n[0] * x + n[1] * y + n[2] * z - d, box: null };
}

// ---------- Yumuşak birleşimler ----------
export const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);

// Bileşik ilkeller: katmanlı kıyafet ve saç kabukları için
export function inter(a, b, k = 0) { return { f: (x, y, z) => smax(a.f(x, y, z), b.f(x, y, z), k), box: a.box }; }
export function diff(a, b, k = 0) { return { f: (x, y, z) => smax(a.f(x, y, z), -b.f(x, y, z), k), box: a.box }; }
export function union(list, k = 0) {
  const b = list.reduce((m, s) => [Math.min(m[0], s.box[0]), Math.min(m[1], s.box[1]), Math.min(m[2], s.box[2]), Math.max(m[3], s.box[3]), Math.max(m[4], s.box[4]), Math.max(m[5], s.box[5])], [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]);
  return { f: (x, y, z) => { let d = 1e9; for (const s of list) d = smin(d, s.f(x, y, z), k); return d; }, box: b };
}
// Bir şekli dışa doğru şişir (kıyafet katmanı)
export function inflate(a, t) { return { f: (x, y, z) => a.f(x, y, z) - t, box: a.box && [a.box[0] - t, a.box[1] - t, a.box[2] - t, a.box[3] + t, a.box[4] + t, a.box[5] + t] }; }

// Şekil programı: [{ s: ilkel, op: 'add'|'sub'|'int'|'shell', k, region, pri }]
// Değerlendirici, her noktada yalnızca sınır kutusu yakın olan ilkelleri hesaplar.
export function compile(ops, margin = 0.02) {
  const list = ops.map((o) => ({ ...o, k: o.k ?? 0, op: o.op ?? 'add' }));
  const f = (x, y, z) => {
    let d = 1e9;
    for (const o of list) {
      const b = o.s.box;
      if (o.op === 'add' && b) {
        const pad = o.k + margin;
        if (x < b[0] - pad || y < b[1] - pad || z < b[2] - pad || x > b[3] + pad || y > b[4] + pad || z > b[5] + pad) {
          // uzaktaki ilkel: kaba alt sınırla birleştir (işaret doğru kalır)
          const dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]);
          d = Math.min(d, hypot3(dx, dy, dz));
          continue;
        }
      }
      const v = o.s.f(x, y, z);
      if (o.op === 'add') d = smin(d, v, o.k);
      else if (o.op === 'sub') d = smax(d, -v, o.k);
      else if (o.op === 'int') d = smax(d, v, o.k);
      else if (o.op === 'shell') d = Math.abs(d) - v; // v burada kalınlık
    }
    return d;
  };
  // Bölge ve kemik: noktaya en yakın 'add' ilkelinin etiketleri (öncelik payı ile)
  const owner = (x, y, z) => {
    let best = 1e9, own = null;
    for (const o of list) {
      if (o.op !== 'add' || o.region === undefined) continue;
      const v = o.s.f(x, y, z) - (o.pri ?? 0) * 0.004;
      if (v < best) { best = v; own = o; }
    }
    return own;
  };
  const region = (x, y, z) => owner(x, y, z)?.region ?? 0;
  return { f, region, owner };
}

// ---------- Surface nets ----------
// f: mesafe fonksiyonu, bounds: [x0,y0,z0,x1,y1,z1], h: hücre boyu
// Dönüş: { positions: Float32Array, normals: Float32Array, indices: Uint32Array }
export function mesh(f, bounds, h, { project = true } = {}) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const N = nx * ny * nz;
  const val = new Float32Array(N);
  let p = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[p++] = f(x0 + i * h, y0 + j * h, z0 + k * h);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const [a, b, d] = corners[c]; cv[c] = val[idx(i + a, j + b, k + d)]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) {
      const v0 = cv[e0], v1 = cv[e1];
      if ((v0 < 0) === (v1 < 0)) continue;
      const t = v0 / (v0 - v1);
      const A = corners[e0], B = corners[e1];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    cellVert[cid(i, j, k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, b, c, a, c, d); else tris.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v = val[idx(i, j, k)], inside = v < 0;
    if (i < nx - 1 && (val[idx(i + 1, j, k)] < 0) !== inside) // x kenarı
      quad(cellVert[cid(i, j - 1, k - 1)], cellVert[cid(i, j, k - 1)], cellVert[cid(i, j, k)], cellVert[cid(i, j - 1, k)], inside);
    if (j < ny - 1 && (val[idx(i, j + 1, k)] < 0) !== inside) // y kenarı
      quad(cellVert[cid(i - 1, j, k - 1)], cellVert[cid(i - 1, j, k)], cellVert[cid(i, j, k)], cellVert[cid(i, j, k - 1)], inside);
    if (k < nz - 1 && (val[idx(i, j, k + 1)] < 0) !== inside) // z kenarı
      quad(cellVert[cid(i - 1, j - 1, k)], cellVert[cid(i, j - 1, k)], cellVert[cid(i, j, k)], cellVert[cid(i - 1, j, k)], inside);
  }
  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  const e = h * 0.35;
  for (let v = 0; v < positions.length; v += 3) {
    let x = positions[v], y = positions[v + 1], z = positions[v + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    let gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    if (project) {
      // bir Newton adımıyla yüzeye oturt: hücre ortalamasının yarattığı basamakları giderir
      const d = f(x, y, z);
      if (Math.abs(d) < h) { x -= gx * d; y -= gy * d; z -= gz * d; positions[v] = x; positions[v + 1] = y; positions[v + 2] = z; }
    }
    normals[v] = gx; normals[v + 1] = gy; normals[v + 2] = gz;
  }
  return { positions, normals, indices: new Uint32Array(tris) };
}
