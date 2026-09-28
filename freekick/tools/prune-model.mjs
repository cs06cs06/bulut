// One-off: slims the X Bot for the web. Drops the clips the game never plays
// (agree, headShake, poses), dedups accessors and quantizes normals/skin weights.
// POSITION stays float: the kit shader paints zones from bind-pose metres.
// Usage: node tools/prune-model.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize } from '@gltf-transform/functions';

const file = new URL('../assets/models/xbot.glb', import.meta.url).pathname;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const keep = ['idle', 'run', 'walk'];
for (const a of doc.getRoot().listAnimations()) if (!keep.includes(a.getName())) a.dispose();
await doc.transform(dedup(), quantize({ pattern: /^(NORMAL|JOINTS_\d|WEIGHTS_\d)$/, quantizeNormal: 10 }), prune());
const out = await io.writeBinary(doc);
(await import('node:fs')).writeFileSync(file, out);
console.log('kept', doc.getRoot().listAnimations().map((a) => a.getName()).join(', '), '-', (out.byteLength / 1024).toFixed(0), 'KB');
