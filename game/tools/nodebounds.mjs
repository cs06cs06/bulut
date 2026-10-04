import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const scene = doc.getRoot().listScenes()[0];
scene.traverse(n => { if (n.getMesh()) { const b = getBounds(n); console.log(n.getName(), 'min', b.min.map(v=>v.toFixed(2)).join(','), 'max', b.max.map(v=>v.toFixed(2)).join(',')); } });
