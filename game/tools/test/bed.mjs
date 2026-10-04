import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of ['pickup', 'monster', 'suv']) {
  const doc = await io.read(`public/assets/models/${f}.glb`);
  const scene = doc.getRoot().listScenes()[0];
  scene.traverse((n) => {
    const m = n.getMesh(); if (!m || /wheel/i.test(n.getName())) return;
    const wm = n.getWorldMatrix();
    const ys = {}; let zmin = 1e9, zmax = -1e9, xmax = 0;
    for (const p of m.listPrimitives()) {
      const a = p.getAttribute('POSITION'); const v = [];
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, v);
        const x = wm[0] * v[0] + wm[4] * v[1] + wm[8] * v[2] + wm[12], y = wm[1] * v[0] + wm[5] * v[1] + wm[9] * v[2] + wm[13], z = wm[2] * v[0] + wm[6] * v[1] + wm[10] * v[2] + wm[14];
        if (z < -0.6 && Math.abs(x) < 0.9) { const k = y.toFixed(2); ys[k] = (ys[k] || 0) + 1; zmin = Math.min(zmin, z); }
      }
    }
    console.log(f, n.getName(), 'rear-centre vertex y histogram:', Object.entries(ys).sort((a, b) => +a[0] - +b[0]).map(([k, c]) => `${k}:${c}`).join(' '), 'zmin', zmin.toFixed(2));
  });
}
