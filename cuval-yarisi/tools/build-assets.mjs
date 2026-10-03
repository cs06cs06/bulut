// Poly Haven'dan (CC0) indirilen modelleri mobil için optimize edilmiş üç GLB'ye çevirir:
//   nature.glb    – çalı, eğrelti, çiçek, çimen öbeği, kaya, kütük + ağaç billboard'ları
//   props.glb     – sandalye, bank, tabure, fıçı, kova, sandık, sepet, testi
//   polyhaven.glb – köşk masasındaki çay takımı, meyveler, tabak, fener
// Ağaçlar milyonlarca üçgen olduğundan tarayıcıda üç açıdan render edilip (tools/tree-bake.mjs)
// kesişen düzlemlere basılır (tools/tree-atlas.py ile tek atlas).
// Kullanım: node tools/build-assets.mjs <poly haven klasörü> <atlas.webp> <atlas.json> <çıktı: assets/models>
// Gerekenler: @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp meshoptimizer
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress, mergeDocuments, unpartition, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [PH, ATLAS, ATLAS_JSON, OUT] = process.argv.slice(2);
if (!OUT) { console.error('kullanım: node build-assets.mjs <ph> <atlas.webp> <atlas.json> <out>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const sceneOf = (doc) => doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
const disposeTree = (n) => { for (const c of n.listChildren()) disposeTree(c); n.dispose(); };

// Bir Poly Haven dosyasından tek bir düğümü (ya da tümünü) alır, merkeze taşır, sadeleştirir.
async function pick(id, node, name, { ratio = 1, error = 0.01, foliage = false, normals = true } = {}) {
  const doc = await io.read(`${PH}/${id}/${id}_1k.gltf`);
  const scene = sceneOf(doc);
  const root = doc.createNode(name);
  for (const n of scene.listChildren()) {
    scene.removeChild(n);
    if (node && n.getName() !== node) { disposeTree(n); continue; }
    if (node) { const t = n.getTranslation(); n.setTranslation([0, t[1], 0]); }
    root.addChild(n);
  }
  if (!root.listChildren().length) throw new Error(`${id}: ${node} yok`);
  scene.addChild(root);
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    // köşe renkleri Poly Haven'da maske olarak kullanılıyor; three.js çarpar ve kararır
    for (const sem of p.listSemantics()) if (/^(TEXCOORD_[1-9]|COLOR_\d)$/.test(sem)) p.setAttribute(sem, null);
  }
  for (const m of doc.getRoot().listMaterials()) {
    for (const e of m.listExtensions()) m.setExtension(e.extensionName, null);
    if (foliage) {
      m.setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true);
      m.setMetallicRoughnessTexture(null).setRoughnessFactor(0.85).setMetallicFactor(0);
    }
    if (!normals) m.setNormalTexture(null);
  }
  await doc.transform(prune());
  if (ratio < 1) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }));
  await doc.transform(prune());
  return doc;
}

async function pack(file, parts, { size = 512, small = 256, extra } = {}) {
  const doc = parts[0];
  const scene = sceneOf(doc);
  for (const src of parts.slice(1)) {
    const map = mergeDocuments(doc, src);
    const sc = map.get(sceneOf(src));
    for (const c of sc.listChildren()) { sc.removeChild(c); scene.addChild(c); }
    sc.dispose();
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  doc.getRoot().setDefaultScene(scene);
  await doc.transform(dedup(), prune());
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82, slots: /^baseColorTexture$/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [small, small], quality: 80, slots: /^(?!baseColorTexture$).*$/ }),
  );
  if (extra) await extra(doc);
  await doc.transform(unpartition(), quantize({ quantizeNormal: 8, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, file), doc);
  const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024);
  console.log(`${file.padEnd(16)} ${String(kb).padStart(5)} KB`);
  for (const n of scene.listChildren()) {
    let t = 0;
    n.traverse((c) => { const m = c.getMesh(); if (m) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; });
    console.log(`   ${n.getName().padEnd(22)} ${Math.round(t)} üçgen`);
  }
}

// ---------- Ağaç billboard'ları: her ağaç 3 kesişen düzlem (60°), tek atlas dokusu, ışıksız ----------
function billboards(doc) {
  const meta = JSON.parse(fs.readFileSync(ATLAS_JSON, 'utf8'));
  const { tile: T, cols, rowsN } = meta;
  const buf = doc.getRoot().listBuffers()[0];
  const tex = doc.createTexture('trees_atlas').setImage(fs.readFileSync(ATLAS)).setMimeType('image/webp').setURI('trees_atlas.webp');
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  const mat = doc.createMaterial('tree_billboard_leaves').setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(0.5)
    .setDoubleSided(true).setRoughnessFactor(1).setMetallicFactor(0).setExtension('KHR_materials_unlit', unlit.createUnlit());
  const NAMES = { island_tree_01: 'tree_island_01', island_tree_02: 'tree_island_02', island_tree_03: 'tree_island_03', tree_small_02: 'tree_small', pine_b: 'tree_pine' };
  for (const t of meta.trees) {
    const [cx, cy, cz] = t.center, h = t.half;
    const pos = [], uv = [], nor = [], idx = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI, rx = Math.cos(a), rz = -Math.sin(a);
      const [x0, y0, x1, y1] = t.crop[k];
      const base = pos.length / 3;
      for (const [px, py] of [[x0, y1], [x1, y1], [x1, y0], [x0, y0]]) {
        const u = (px / T) * 2 - 1, v = 1 - (py / T) * 2;                  // tile içi [-1,1]
        pos.push(cx + rx * u * h, cy + v * h, cz + rz * u * h);
        uv.push((k * T + px) / (cols * T), (t.row * T + py) / (rowsN * T));
        nor.push(0, 1, 0);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const acc = (arr, type, Ctor = Float32Array) => doc.createAccessor().setType(type).setArray(new Ctor(arr)).setBuffer(buf);
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', acc(pos, 'VEC3')).setAttribute('NORMAL', acc(nor, 'VEC3')).setAttribute('TEXCOORD_0', acc(uv, 'VEC2'))
      .setIndices(acc(idx, 'SCALAR', Uint16Array));
    // quantize ölçeği alt düğüme yazsın diye mesh bir sarmalayıcının içinde
    const node = doc.createNode(NAMES[t.id] || t.id).addChild(doc.createNode(t.id).setMesh(doc.createMesh(t.id).addPrimitive(prim)));
    sceneOf(doc).addChild(node);
  }
}

// ---------- Doğa ----------
const F = { foliage: true, normals: false };
const nature = await Promise.all([
  pick('shrub_02', 'shrub_02_a', 'bush_a', { ...F, ratio: 0.35, error: 0.02 }),
  pick('shrub_02', 'shrub_02_b', 'bush_b', { ...F, ratio: 0.45, error: 0.02 }),
  pick('shrub_02', 'shrub_02_d', 'bush_c', { ...F, ratio: 0.45, error: 0.02 }),
  pick('searsia_lucida', 'searsia_lucida_f_LOD0', 'bush_d', { ...F, ratio: 0.4, error: 0.02 }),
  pick('shrub_03', 'shrub_03_a', 'shrub_small_a', { ...F, ratio: 0.6, error: 0.01 }),
  pick('shrub_03', 'shrub_03_b', 'shrub_small_b', { ...F, ratio: 0.6, error: 0.01 }),
  pick('fern_02', 'fern_02_b', 'fern_a', { ...F, ratio: 0.6, error: 0.01 }),
  pick('fern_02', 'fern_02_a', 'fern_b', F),
  pick('flower_gazania', 'flower_gazania_h_LOD0', 'flower_gazania_a', { ...F, ratio: 0.4, error: 0.01 }),
  pick('flower_gazania', 'flower_gazania_f_LOD0', 'flower_gazania_b', { ...F, ratio: 0.45, error: 0.01 }),
  pick('flower_ursinia', 'flower_ursinia_c_LOD0', 'flower_ursinia', { ...F, ratio: 0.35, error: 0.01 }),
  pick('celandine_01', 'celandine_01_c_LOD0', 'flower_celandine', { ...F, ratio: 0.35, error: 0.01 }),
  pick('dandelion_01', 'dandelion_01_c_LOD0', 'flower_dandelion', { ...F, ratio: 0.5, error: 0.01 }),
  pick('periwinkle_plant', 'periwinkle_plant_02_LOD0', 'flower_periwinkle', { ...F, ratio: 0.2, error: 0.015 }),
  pick('grass_medium_01', 'grass_medium_01_tall_a_LOD0', 'grass_tall_a', F),
  pick('grass_medium_01', 'grass_medium_01_tall_b_LOD0', 'grass_tall_b', F),
  pick('grass_medium_01', 'grass_medium_01_mid_a_LOD0', 'grass_mid', { ...F, ratio: 0.4, error: 0.01 }),
  pick('grass_medium_02', 'grass_medium_02_d', 'grass_clump_a', { ...F, ratio: 0.45, error: 0.01 }),
  pick('grass_medium_02', 'grass_medium_02_e', 'grass_clump_b', { ...F, ratio: 0.5, error: 0.01 }),
  pick('rock_moss_set_01', 'rock_moss_set_01_rock02', 'rock_a', { ratio: 0.08, error: 0.01 }),
  pick('rock_moss_set_01', 'rock_moss_set_01_rock03', 'rock_b', { ratio: 0.15, error: 0.01 }),
  pick('rock_moss_set_01', 'rock_moss_set_01_rock05', 'rock_c', { ratio: 0.06, error: 0.01 }),
  pick('tree_stump_01', null, 'stump', { ratio: 0.04, error: 0.01 }),
]);
await pack('nature.glb', nature, { size: 512, small: 256, extra: billboards });

// ---------- Köy eşyaları ----------
const props = await Promise.all([
  pick('painted_wooden_chair_02', null, 'chair'),
  pick('painted_wooden_bench', null, 'bench'),
  pick('wooden_stool_02', null, 'stool', { ratio: 0.2, error: 0.005 }),
  pick('folding_wooden_stool', null, 'stool_folding', { ratio: 0.25, error: 0.005 }),
  pick('wine_barrel_01', null, 'barrel', { ratio: 0.2, error: 0.004 }),
  pick('wooden_barrels_01', 'wooden_barrels_01_barrel01', 'barrel_old', { ratio: 0.18, error: 0.004 }),
  pick('wooden_bucket_01', null, 'bucket', { ratio: 0.3, error: 0.004 }),
  pick('wooden_crate_02', null, 'crate', { ratio: 0.3, error: 0.004 }),
  pick('wicker_basket_02', null, 'basket', { ratio: 0.15, error: 0.004 }),
  pick('jug_01', null, 'jug', { ratio: 0.25, error: 0.003 }),
]);
await pack('props.glb', props, { size: 512, small: 256 });

// ---------- Köşk masası ----------
const PHM = [['tea_set_01', 0.12], ['food_pomegranate_01', 0.12], ['food_apple_01', 0.12], ['carved_wooden_plate', 0.12],
  ['wooden_bowl_01', 0.12], ['brass_diya_lantern', 0.12], ['wicker_basket_01', 0.12]];
const table = await Promise.all(PHM.map(([id, r]) => pick(id, null, id, { ratio: r, error: 0.02 })));
await pack('polyhaven.glb', table, { size: 512, small: 256 });
