// Harici olarak indirilen ham asset paketlerini mobil için optimize edilmiş GLB'lere çevirir.
// Kullanım: node tools/build-assets.mjs <ham-paketlerin-klasörü> <çıktı: assets/models>
// Gerekenler: @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp meshoptimizer
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress, mergeDocuments, unpartition, resample, simplifyPrimitive, weldPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) { console.error('kullanım: node build-assets.mjs <src> <out>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

const UBC = `${SRC}/ubc/Universal Base Characters[Standard]`;
const OUTF = `${SRC}/outfits/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)`;
const HAIR = `${UBC}/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)`;
const UAL1 = `${SRC}/ual/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb`;
const UAL2 = `${SRC}/ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb`;
const NAT = `${SRC}/snm/glTF`;
const PROPS = `${SRC}/props/Exports/glTF`;
const PH = `${SRC}/../ph`;

// Kullanılmayan köşe öznitelikleri (ekstra UV ve renk kanalları) dosyayı şişirir
function stripAttributes(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const sem of prim.listSemantics()) {
        if (/^(TEXCOORD_[1-9]|COLOR_\d)$/.test(sem)) prim.setAttribute(sem, null);
      }
    }
  }
}

// Tam gövdeden sadece baş ve boyun üçgenlerini tutar (kıyafetin altında kalan gövde çizilmesin)
function keepJoints(doc, keepNames, minWeight = 0.5) {
  for (const skin of doc.getRoot().listSkins()) {
    const joints = skin.listJoints();
    const keep = new Set(joints.map((j, i) => (keepNames.includes(j.getName()) ? i : -1)).filter((i) => i >= 0));
    for (const node of doc.getRoot().listNodes()) {
      if (node.getSkin() !== skin || !node.getMesh()) continue;
      for (const prim of node.getMesh().listPrimitives()) {
        const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0'), idx = prim.getIndices();
        const score = new Float32Array(J.getCount());
        const j4 = [], w4 = [];
        for (let v = 0; v < J.getCount(); v++) {
          J.getElement(v, j4); W.getElement(v, w4);
          let s = 0; for (let k = 0; k < 4; k++) if (keep.has(j4[k])) s += w4[k];
          score[v] = s;
        }
        const src = idx.getArray(), out = [];
        for (let t = 0; t < src.length; t += 3) {
          if (score[src[t]] >= minWeight && score[src[t + 1]] >= minWeight && score[src[t + 2]] >= minWeight) out.push(src[t], src[t + 1], src[t + 2]);
        }
        idx.setArray(new Uint32Array(out));
      }
    }
  }
}

function removeMeshesExcept(doc, names) {
  for (const node of doc.getRoot().listNodes()) {
    const m = node.getMesh();
    if (m && !names.some((n) => m.getName() === n || node.getName() === n)) { node.setMesh(null); node.setSkin(null); }
  }
}

async function compress(doc, size, normalSize = size) {
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [normalSize, normalSize], quality: 82, slots: /^normalTexture$/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82, slots: /^(?!normalTexture$).*$/ }),
  );
}

function sloppyAll(doc, ratio) {
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray(), idx = prim.getIndices();
    const src = new Uint32Array(idx.getArray());
    const target = Math.max(3, Math.floor((src.length * ratio) / 3) * 3);
    const out = MeshoptSimplifier.simplifySloppy(src, pos, 3, null, target, 0.06);
    if (out[0].length >= 3) idx.setArray(new Uint32Array(out[0]));
  }
}

async function finish(doc, file, { size = 1024, normalSize, lod = 0, sloppy = 0 } = {}) {
  stripAttributes(doc);
  const steps = [prune(), dedup()];
  if (lod) steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: lod, error: 0.02 }));
  steps.push(prune());
  await doc.transform(...steps);
  if (sloppy) { sloppyAll(doc, sloppy); await doc.transform(prune()); }
  await compress(doc, size, normalSize ?? size);
  await doc.transform(unpartition());
  await io.write(path.join(OUT, file), doc);
  const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  console.log(`${file.padEnd(22)} ${String(kb).padStart(5)} KB  ${Math.round(tris)} üçgen`);
}

// ---------- Karakter parçaları ----------
const parts = [
  // [çıktı, kaynak, saklanacak meshler veya null, baş kesimi]
  ['f_head', `${UBC}/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf`, null, true],
  ['m_head', `${UBC}/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf`, null, true],
  ['f_peasant', `${OUTF}/Outfits/Female_Peasant.gltf`],
  ['m_peasant', `${OUTF}/Outfits/Male_Peasant.gltf`],
  ['f_hood', `${OUTF}/Modular Parts/Female_Ranger_Head_Hood.gltf`],
  ['m_beard', `${HAIR}/Hair_Beard.gltf`],
];
for (const [name, file, keep, head] of parts) {
  for (const lod of [0, 1, 2]) {
    const doc = await io.read(file);
    if (keep) removeMeshesExcept(doc, keep);
    if (head) {
      keepJoints(doc, ['Head', 'neck_01', 'spine_03'], 0.5);
    }
    // lod 1: kalabalık (çok düşük), lod 2: orta mesafe (köşk, davulcu, çığırtkan)
    const ratio = !lod ? 0 : lod === 2 ? (name.includes('head') ? 0.45 : 0.35) : name.includes('head') ? 0.1 : name.includes('peasant') ? 0.065 : 0.18;
    const suffix = ['', '_lod', '_mid'][lod];
    // kalabalık LOD'u: kenar daraltma hata sınırına takılınca topolojiden bağımsız ek sadeleştirme
    const sloppy = lod === 1 ? (name.includes('head') ? 0.5 : name.includes('peasant') ? 0.45 : 0.6) : 0;
    await finish(doc, `${name}${suffix}.glb`, { size: [1024, 256, 512][lod], normalSize: [512, 128, 256][lod], lod: ratio, sloppy });
  }
}

// ---------- Animasyonlar: sadece kullanılan klipler, mesh yok ----------
const CLIPS = {
  [UAL1]: ['Idle_Loop', 'Idle_Talking_Loop', 'Jump_Loop', 'Jump_Start', 'Jump_Land', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Dance_Loop', 'Death01', 'Hit_Chest', 'Interact', 'Spell_Simple_Idle_Loop'],
  [UAL2]: ['Idle_FoldArms_Loop', 'Idle_Rail_Call', 'Yes', 'LayToIdle', 'Idle_No_Loop', 'Hit_Knockback'],
};
let k = 1;
for (const [file, keep] of Object.entries(CLIPS)) {
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) {
    if (!keep.includes(a.getName())) {
      for (const ch of a.listChannels()) ch.dispose();
      for (const sm of a.listSamplers()) sm.dispose();
      a.dispose(); continue;
    }
    // ölçek kanalları sabit; öteleme yalnızca kök ve leğen kemiğinde anlamlı
    for (const ch of a.listChannels()) {
      const p = ch.getTargetPath(), n = ch.getTargetNode()?.getName();
      if (p === 'scale' || (p === 'translation' && !['root', 'pelvis'].includes(n))) { const sm = ch.getSampler(); ch.dispose(); sm.dispose(); }
    }
  }
  for (const n of doc.getRoot().listNodes()) { n.setMesh(null); n.setSkin(null); }
  for (const s of doc.getRoot().listSkins()) s.dispose();
  await doc.transform(resample({ tolerance: 0.0005 }), prune({ keepLeaves: true }), dedup());
  await doc.transform(unpartition());
  await io.write(path.join(OUT, `anims${k}.glb`), doc);
  console.log(`anims${k}.glb`.padEnd(22), Math.round(fs.statSync(path.join(OUT, `anims${k}.glb`)).size / 1024), 'KB', doc.getRoot().listAnimations().map((a) => a.getName()).join(' '));
  k++;
}

// ---------- Model setleri: tek dosyada birleştir, ortak dokuları paylaş ----------
async function bundle(outName, list, size, normalSize, lod = 0, perMaterial = null) {
  const doc = await io.read(list[0][1]);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const wrap = (sc, name) => {
    const g = doc.createNode(name);
    for (const c of sc.listChildren()) { sc.removeChild(c); g.addChild(c); }
    return g;
  };
  const roots = [wrap(scene, list[0][0])];
  for (const [name, file] of list.slice(1)) {
    const src = await io.read(file);
    const map = mergeDocuments(doc, src);
    const srcScene = src.getRoot().getDefaultScene() || src.getRoot().listScenes()[0];
    const sc = map.get(srcScene);
    roots.push(wrap(sc, name));
    sc.dispose();
  }
  for (const r of roots) scene.addChild(r);
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  doc.getRoot().setDefaultScene(scene);
  // malzemeye özel sadeleştirme (ör. ağaç kabuğu yoğun, yaprak kartlarına dokunma)
  if (perMaterial) {
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
      const r = Object.entries(perMaterial).find(([re]) => new RegExp(re).test(prim.getMaterial()?.getName() || ''));
      if (!r) continue;
      // köşeleri kaynaşmamış meshlerde de çalışan topolojiden bağımsız sadeleştirme
      const pos = prim.getAttribute('POSITION').getArray(), idx = prim.getIndices();
      const src = new Uint32Array(idx.getArray());
      const target = Math.max(3, Math.floor((src.length * r[1]) / 3) * 3);
      const out = MeshoptSimplifier.simplifySloppy(src, pos, 3, null, target, 0.02);
      if (out[0].length >= 3) idx.setArray(new Uint32Array(out[0]));
    }
  }
  await finish(doc, outName, { size, normalSize, lod });
}

const NATURE = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_1', 'Pine_3',
  'Bush_Common', 'Bush_Common_Flowers', 'Grass_Wispy_Tall', 'Grass_Wispy_Short', 'Grass_Common_Tall',
  'Flower_3_Group', 'Flower_4_Group', 'Fern_1', 'Clover_1', 'Plant_1_Big', 'Rock_Medium_1', 'Rock_Medium_2', 'Mushroom_Common'];
await bundle('nature.glb', NATURE.map((n) => [n, `${NAT}/${n}.gltf`]), 512, 256, 0, { Bark: 0.25, Flowers: 0.5, Rocks: 0.5 });

const PROP = ['Chair_1', 'Bench', 'Stool', 'Table_Plate', 'Mug', 'Vase_2', 'Vase_4', 'Barrel_Apples', 'FarmCrate_Apple',
  'Banner_1_Cloth', 'Banner_2_Cloth', 'Bucket_Wooden_1', 'Pot_1', 'Barrel', 'Bag'];
await bundle('props.glb', PROP.map((n) => [n, `${PROPS}/${n}.gltf`]), 512, 256);

const PHM = ['tea_set_01', 'food_pomegranate_01', 'food_apple_01', 'carved_wooden_plate', 'wooden_bowl_01', 'brass_diya_lantern', 'wicker_basket_01'];
await bundle('polyhaven.glb', PHM.map((n) => [n, `${PH}/${n}/${n}_1k.gltf`]), 512, 256, 0.12);
