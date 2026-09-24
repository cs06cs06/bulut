// Bağımlılıksız PNG ikon üretici: node scripts/make-icons.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const stops = [[0, [254, 218, 117]], [0.25, [250, 126, 30]], [0.5, [214, 41, 118]], [0.75, [150, 47, 191]], [1, [79, 91, 213]]];
function grad(t) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, a] = stops[i - 1];
      const [t1, b] = stops[i];
      const k = (t - t0) / (t1 - t0);
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return stops[stops.length - 1][1];
}
// Yuvarlatılmış dikdörtgen işaretli uzaklık fonksiyonu
function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  const s = size;
  const pad = maskable ? 0 : s * 0.02;
  const scale = maskable ? 0.72 : 1; // maskable ikonlarda güvenli alan
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          // Arka plan
          const bg = maskable ? -1 : sdRoundRect(fx, fy, s / 2, s / 2, s / 2 - pad, s / 2 - pad, s * 0.23);
          if (bg > 0) continue;
          const t = Math.min(1, Math.max(0, ((s - fy) + fx) / (2 * s)));
          let [r, g, b] = grad(t);
          // Beyaz pencere: çerçeve + artı
          const u = (fx - s / 2) / scale + s / 2;
          const v = (fy - s / 2) / scale + s / 2;
          const outer = sdRoundRect(u, v, s / 2, s / 2, s * 0.27, s * 0.27, s * 0.08);
          const stroke = s * 0.055;
          const frame = Math.abs(outer + stroke / 2) - stroke / 2;
          const bar = Math.min(
            Math.max(Math.abs(u - s / 2) - stroke * 0.42, outer + stroke * 0.5),
            Math.max(Math.abs(v - s / 2) - stroke * 0.42, outer + stroke * 0.5)
          );
          const dot = Math.hypot(u - s * 0.68, v - s * 0.32) - s * 0.035;
          if (Math.min(frame, bar) < 0 || dot < 0) [r, g, b] = [255, 255, 255];
          acc[0] += r; acc[1] += g; acc[2] += b; acc[3] += 255;
        }
      }
      const n = SS * SS;
      const i = (y * s + x) * 4;
      const a = acc[3] / n;
      px[i] = a ? acc[0] / (acc[3] / 255) : 0;
      px[i + 1] = a ? acc[1] / (acc[3] / 255) : 0;
      px[i + 2] = a ? acc[2] / (acc[3] / 255) : 0;
      px[i + 3] = a;
    }
  }
  return png(s, s, px);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512));
fs.writeFileSync(path.join(out, 'maskable-512.png'), render(512, { maskable: true }));
console.log('İkonlar üretildi →', out);
