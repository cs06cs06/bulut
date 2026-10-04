// Re-maps the Rogland Clear Night HDRI background: keeps only the sky above the rocky hills,
// stretches it down to the horizon and fills the lower hemisphere with a dark gradient.
import sharp from 'sharp';
const [src, out] = process.argv.slice(2);
const W = 4096, H = 2048, cut = Math.round(H * 0.355);
const full = await sharp(src, { limitInputPixels: false }).resize(W, H).toBuffer();
const top = await sharp(await sharp(full).extract({ left: 0, top: 0, width: W, height: cut }).toBuffer()).resize(W, H / 2, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const img = Buffer.alloc(W * H * 3);
top.copy(img, 0);
// average colour of the last sky rows → horizon glow / ground colour
let r = 0, g = 0, b = 0; const row = (H / 2 - 4) * W * 3;
for (let i = 0; i < W; i++) { r += top[row + i * 3]; g += top[row + i * 3 + 1]; b += top[row + i * 3 + 2]; }
r /= W; g /= W; b /= W;
for (let y = H / 2 - 120; y < H / 2; y++) {   // soften the horizon
  const t = (y - (H / 2 - 120)) / 120;
  for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; img[o] = img[o] * (1 - t * 0.7) + r * t * 0.7; img[o + 1] = img[o + 1] * (1 - t * 0.7) + g * t * 0.7; img[o + 2] = img[o + 2] * (1 - t * 0.7) + b * t * 0.7; }
}
for (let y = H / 2; y < H; y++) {
  const t = Math.min(1, (y - H / 2) / 300);
  for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; img[o] = r * (1 - t * 0.6); img[o + 1] = g * (1 - t * 0.6); img[o + 2] = b * (1 - t * 0.6); }
}
await sharp(img, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
console.log('horizon colour', r.toFixed(0), g.toFixed(0), b.toFixed(0));
