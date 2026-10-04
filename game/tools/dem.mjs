// Download Terrarium elevation tiles (AWS Open Data, Mapzen/Tilezen) and stitch them.
import sharp from 'sharp';
import fs from 'fs';
const [lat, lon, z, n, out] = [parseFloat(process.argv[2]), parseFloat(process.argv[3]), parseInt(process.argv[4]), parseInt(process.argv[5]), process.argv[6]];
const x0f = (lon + 180) / 360 * 2 ** z;
const y0f = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z;
const xs = Math.floor(x0f - n / 2 + 0.5), ys = Math.floor(y0f - n / 2 + 0.5);
const W = 256 * n;
const elev = new Float32Array(W * W);
for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${xs + tx}/${ys + ty}.png`;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const { data } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 3;
    elev[(ty * 256 + y) * W + tx * 256 + x] = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
  }
}
let mn = Infinity, mx = -Infinity; for (const v of elev) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
const mpp = 40075016 * Math.cos(lat * Math.PI / 180) / 2 ** z / 256;
console.log(JSON.stringify({ W, min: mn, max: mx, metersPerPixel: mpp, sizeMeters: mpp * W, tiles: [xs, ys, z] }));
fs.writeFileSync(out + '.f32', Buffer.from(elev.buffer));
// hillshade preview
const img = Buffer.alloc(W * W);
for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
  const dx = (elev[y * W + x + 1] - elev[y * W + x - 1]) / (2 * mpp), dy = (elev[(y + 1) * W + x] - elev[(y - 1) * W + x]) / (2 * mpp);
  const nl = Math.hypot(dx, dy, 1); const s = (-dx * 0.5 + -dy * -0.5 + 0.7) / nl;
  const h = (elev[y * W + x] - mn) / (mx - mn);
  img[y * W + x] = Math.max(0, Math.min(255, s * 180 + h * 75));
}
await sharp(img, { raw: { width: W, height: W, channels: 1 } }).png().toFile(out + '.png');
