// Renders a labelled design map of the play area (+ optional layout overlay) for planning.
import fs from 'fs'; import sharp from 'sharp';
const meta = JSON.parse(fs.readFileSync('public/assets/terrain/terrain.json'));
const u16 = new Uint16Array(fs.readFileSync('public/assets/terrain/height.bin').buffer.slice(0));
const N = meta.resolution, size = meta.size, half = size / 2, sp = size / (N - 1);
const H = (i, j) => u16[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))] / 65535 * (meta.maxHeight - meta.minHeight) + meta.minHeight - 740;
let best = [-1e9]; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (H(i, j) > best[0]) best = [H(i, j), i * sp - half, j * sp - half];
console.log('summit', best.map(v => v.toFixed(1)));
const out = Buffer.alloc(N * N * 3);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const dx = (H(i + 1, j) - H(i - 1, j)) / (2 * sp), dz = (H(i, j + 1) - H(i, j - 1)) / (2 * sp); const sl = Math.hypot(dx, dz);
  const s = (-dx * 0.6 + dz * 0.6 + 0.8) / Math.hypot(dx, dz, 1); const h = H(i, j);
  let r = s * 140 + h * 0.3 + 40, g = s * 150 + h * 0.2 + 50, b = s * 110 + 30;
  if (sl > 0.3) { r = 190; g = 70; b = 60; } else if (sl > 0.2) { r = 210; g = 150; b = 70; }
  const k = (j * N + i) * 3; out[k] = Math.min(255, r); out[k + 1] = Math.min(255, g); out[k + 2] = Math.min(255, b);
}
let svg = `<svg width="${N}" height="${N}" xmlns="http://www.w3.org/2000/svg">`;
const px = (w) => (w + half) / size * N;
for (let w = -1500; w <= 1500; w += 250) {
  svg += `<line x1="${px(w)}" y1="0" x2="${px(w)}" y2="${N}" stroke="#000" stroke-opacity="${w % 500 ? 0.15 : 0.4}"/><line y1="${px(w)}" x1="0" y2="${px(w)}" x2="${N}" stroke="#000" stroke-opacity="${w % 500 ? 0.15 : 0.4}"/>`;
  if (w % 500 === 0) svg += `<text x="${px(w) + 2}" y="12" font-size="11" fill="#fff">${w}</text><text x="2" y="${px(w) - 2}" font-size="11" fill="#fff">${w}</text>`;
}
// contour labels every 50 m
for (let j = 20; j < N; j += 60) for (let i = 20; i < N; i += 60) svg += `<text x="${i}" y="${j}" font-size="9" fill="#ffd">${H(i, j).toFixed(0)}</text>`;
if (process.argv[3]) {
  const L = JSON.parse(fs.readFileSync(process.argv[3]));
  for (const r of L.roads) svg += `<polyline fill="none" stroke="#e8c070" stroke-width="3" points="${r.points.map(p => px(p[0]) + ',' + px(p[1])).join(' ')}"/>`;
  for (const f of L.farmyards || []) svg += `<circle cx="${px(f.x)}" cy="${px(f.z)}" r="${f.r / size * N}" fill="#b5372a" fill-opacity="0.5"/><text x="${px(f.x) + 6}" y="${px(f.z)}" font-size="12" fill="#fff">${f.name || ''}</text>`;
  for (const p of L.pois || []) svg += `<circle cx="${px(p.x)}" cy="${px(p.z)}" r="5" fill="#4af"/><text x="${px(p.x) + 6}" y="${px(p.z) + 12}" font-size="11" fill="#cef">${p.id}</text>`;
}
svg += '</svg>';
await sharp(out, { raw: { width: N, height: N, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toFile(process.argv[2]);
