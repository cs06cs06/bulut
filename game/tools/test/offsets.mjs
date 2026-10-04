import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of fs.readdirSync('public/assets/models')) {
  const doc = await io.read('public/assets/models/' + f);
  const b = getBounds(doc.getRoot().listScenes()[0]);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, ex = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  const off = Math.hypot(cx, cz) / ex;
  if (off > 0.15 || Math.abs(b.min[1]) > 0.1 * (b.max[1] - b.min[1])) console.log(f.padEnd(20), 'centre', cx.toFixed(2), cz.toFixed(2), 'minY', b.min[1].toFixed(2), 'extent', ex.toFixed(2));
}
