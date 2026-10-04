import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [f, roofY, floorY] of [['pickup', 1.9, 0.92], ['monster', 3.2, 1.6]]) {
  const doc = await io.read(`public/assets/models/${f}.glb`);
  let rz = [1e9, -1e9], bx = 0;
  doc.getRoot().listScenes()[0].traverse((n) => {
    const m = n.getMesh(); if (!m || /wheel/i.test(n.getName())) return; const wm = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); const v = [];
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); const x = wm[0]*v[0]+wm[4]*v[1]+wm[8]*v[2]+wm[12], y = wm[1]*v[0]+wm[5]*v[1]+wm[9]*v[2]+wm[13], z = wm[2]*v[0]+wm[6]*v[1]+wm[10]*v[2]+wm[14];
        if (y > roofY) { rz[0] = Math.min(rz[0], z); rz[1] = Math.max(rz[1], z); }
        if (Math.abs(y - floorY) < 0.08 && z < -1) bx = Math.max(bx, Math.abs(x)); } }
  });
  console.log(f, 'roof z range', rz.map(v => v.toFixed(2)).join('..'), 'bed floor half-width', bx.toFixed(2));
}
