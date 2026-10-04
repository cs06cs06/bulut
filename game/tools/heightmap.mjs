// Builds the game heightmap from the downloaded Terrarium DEM (6.5 m/px, zoom 14).
// Output: public/assets/terrain/height.bin (Uint16, N*N, inner play area, bicubic upsampled)
//         public/assets/terrain/height_outer.bin (Uint16, M*M, whole 6.6 km area for horizon)
//         public/assets/terrain/terrain.json (metadata)
import fs from 'fs';
import sharp from 'sharp';
const S = process.argv[2];
const SRC = new Float32Array(fs.readFileSync(S + '/dem/p14b.f32').buffer.slice(0));
const W = 1024, MPP = 6.512800810094509;
const CX = 300, CY = 260, CW = 512;           // crop (pixels in the z14 mosaic)
const N = 1024, M = 256;
const at = (x, y) => SRC[Math.min(W - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
const cub = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
const sample = (fx, fy) => {
  const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y; const r = [];
  for (let j = -1; j <= 2; j++) r.push(cub(at(x - 1, y + j), at(x, y + j), at(x + 1, y + j), at(x + 2, y + j), tx));
  return cub(r[0], r[1], r[2], r[3], ty);
};
let mn = Infinity, mx = -Infinity; for (const v of SRC) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
mn = Math.floor(mn) - 2; mx = Math.ceil(mx) + 2;
const enc = v => Math.round((v - mn) / (mx - mn) * 65535);
const inner = new Uint16Array(N * N), innerF = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const v = sample(CX + i / (N - 1) * (CW - 1), CY + j / (N - 1) * (CW - 1));
  innerF[j * N + i] = v; inner[j * N + i] = enc(v);
}
const outer = new Uint16Array(M * M);
for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) outer[j * M + i] = enc(sample(i / (M - 1) * (W - 1), j / (M - 1) * (W - 1)));
const out = 'public/assets/terrain/';
fs.writeFileSync(out + 'height.bin', Buffer.from(inner.buffer));
fs.writeFileSync(out + 'height_outer.bin', Buffer.from(outer.buffer));
const size = (CW - 1) * MPP, outerSize = (W - 1) * MPP;
const meta = { source: 'AWS Terrain Tiles (Terrarium), z14 tiles x2852-2855 y5759-5762 — Steptoe Butte / Palouse, Washington, USA',
  size: Math.round(size * 100) / 100, resolution: N, minHeight: mn, maxHeight: mx,
  outer: { size: Math.round(outerSize * 100) / 100, resolution: M, offsetX: Math.round(((CX + (CW - 1) / 2) - (W - 1) / 2) * MPP * 100) / 100, offsetZ: Math.round(((CY + (CW - 1) / 2) - (W - 1) / 2) * MPP * 100) / 100 } };
fs.writeFileSync(out + 'terrain.json', JSON.stringify(meta, null, 2));
console.log(meta);
// Design aid: hillshade with 250 m grid, world coords centred at 0
const img = Buffer.alloc(N * N * 3), sp = size / (N - 1);
for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
  const dx = (innerF[y * N + x + 1] - innerF[y * N + x - 1]) / (2 * sp), dy = (innerF[(y + 1) * N + x] - innerF[(y - 1) * N + x]) / (2 * sp);
  const sl = Math.hypot(dx, dy); const s = (-dx * 0.6 + dy * 0.6 + 0.8) / Math.hypot(dx, dy, 1);
  const h = (innerF[y * N + x] - 735) / 365; const k = (y * N + x) * 3;
  let r = s * 150 + h * 90, g = s * 160 + h * 70, b = s * 120 + h * 60;
  if (sl > 0.35) { r = 200; g = 60; b = 60; } else if (sl > 0.25) { r = 220; g = 150; b = 60; }
  const wx = x * sp - size / 2, wz = y * sp - size / 2;
  if (Math.abs(((wx % 250) + 250) % 250) < sp || Math.abs(((wz % 250) + 250) % 250) < sp) { r = g = b = 40; }
  img[k] = Math.min(255, Math.max(0, r)); img[k + 1] = Math.min(255, Math.max(0, g)); img[k + 2] = Math.min(255, Math.max(0, b));
}
await sharp(img, { raw: { width: N, height: N, channels: 3 } }).png().toFile(S + '/dem/design.png');
