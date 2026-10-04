import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const b = getBounds(scene);
  const size = b.max.map((v, i) => (v - b.min[i]).toFixed(2));
  console.log(`\n# ${f.split('/').pop()}  size=${size.join('x')} min=${b.min.map(v=>v.toFixed(2))} tris≈${root.listMeshes().reduce((a,m)=>a+m.listPrimitives().reduce((s,p)=>s+((p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3),0),0)} mats=${root.listMaterials().map(m=>m.getName()).join(',')} tex=${root.listTextures().length} anims=${root.listAnimations().map(a=>a.getName()).join(',')}`);
  const walk = (n, d) => { console.log('  '.repeat(d) + '- ' + n.getName() + ' t=' + n.getTranslation().map(v=>v.toFixed(2)) + (n.getMesh() ? ' [mesh]' : '')); n.listChildren().forEach(c => walk(c, d + 1)); };
  if (process.env.TREE) scene.listChildren().forEach(n => walk(n, 1));
}
