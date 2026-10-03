// Microsoft Rocketbox (MIT) avatarlarını ve animasyonlarını web için GLB'ye çevirir.
// 1) FBX2glTF ile FBX -> GLB, 2) dokular (rocketbox-textures.py çıktısı) WebP olarak gömülür,
// 3) kalabalık için sadeleştirilmiş LOD, 4) meshopt sıkıştırma; 5) fes STL'si (Printables, CC-BY) -> GLB;
// 6) seçilen hareket yakalama klipleri yeniden örneklenip ayrı GLB'lere yazılır.
// Kullanım: NODE_PATH=<node_modules> node build-rocketbox.cjs <Assets klasörü> <doku klasörü> <FBX2glTF> <fes.stl> <çıktı>
// Gerekenler: @gltf-transform/core|functions|extensions@4, meshoptimizer, sharp
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { NodeIO, Document } = require('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require('@gltf-transform/extensions');
const { prune, dedup, weld, simplify, resample, meshopt, quantize } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder } = require('meshoptimizer');
const sharp = require('sharp');

const [ASSETS, TEX, FBX2GLTF, FEZ_STL, OUT] = process.argv.slice(2);
fs.mkdirSync(path.join(OUT, 'anim'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'tex'), { recursive: true });
const TMP = fs.mkdtempSync('/tmp/rb-');

const AVATARS = {
  f06: 'Avatars/Adults/Female_Adult_06/Export/Female_Adult_06.fbx',
  f10: 'Avatars/Adults/Female_Adult_10/Export/Female_Adult_10.fbx',
  bm01: 'Avatars/Professions/Business_Male_01/Export/Business_Male_01.fbx',
  bm02: 'Avatars/Professions/Business_Male_02/Export/Business_Male_02.fbx',
  bm03: 'Avatars/Professions/Business_Male_03/Export/Business_Male_03.fbx',
  bm04: 'Avatars/Professions/Business_Male_04/Export/Business_Male_04.fbx',
  bm05: 'Avatars/Professions/Business_Male_05/Export/Business_Male_05.fbx',
  bm06: 'Avatars/Professions/Business_Male_06/Export/Business_Male_06.fbx',
  m15: 'Avatars/Adults/Male_Adult_15/Export/Male_Adult_15.fbx',
};
// oyun içi ad -> Rocketbox klibi
const ANIMS = {
  f_idle: 'f_idle_neutral_01', f_idle2: 'f_idle_look_around_01', f_cheer: 'f_cheer_01', f_cheer2: 'f_cheer_02', f_clap: 'f_claphands_01',
  f_dance: 'f_dancing_neutral', f_talk: 'f_gestic_talk_neutral_01', f_sit: 'f_sit_chair_idle_neutral_01', f_sit_talk: 'f_sit_chair_gestic_thoughtful',
  f_wave: 'f_wave_01', f_laugh: 'f_gestic_laugh_loud',
  m_idle: 'm_idle_neutral_01', m_idle2: 'm_idle_look_around_01', m_cheer: 'm_cheer_01', m_cheer2: 'm_cheer_03', m_clap: 'm_claphands_01',
  m_talk: 'm_gestic_talk_neutral_01', m_announce: 'm_gestic_talk_excited_01', m_sit: 'm_sit_chair_idle_neutral_01', m_sit_talk: 'm_sit_chair_gestic_shrug_01',
  m_wave: 'm_wave_01', m_laugh: 'm_gestic_laugh_loud', m_nod: 'm_gestic_listen_accept_01', m_dance: 'm_dancing_neutral',
};
const ANIM_URL = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Animations/all_animations_max_motextr_static/';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const kb = (f) => Math.round(fs.statSync(f).size / 1024);

async function webp(file, quality = 82, alpha = false) {
  return sharp(file).webp({ quality, alphaQuality: 90, effort: 5, smartSubsample: true }).toBuffer();
}

function fbx(input, name) {
  const out = path.join(TMP, name);
  execFileSync(FBX2GLTF, ['--binary', '--input', input, '--output', out], { stdio: 'pipe' });
  return out + '.glb';
}

async function buildAvatar(key, rel) {
  const raw = fbx(path.join(ASSETS, rel), key);
  const doc = await io.read(raw);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose();
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('COLOR_0', null);
  // malzemeler: <anahtar>_<parça>_color/normal dokuları
  for (const mat of root.listMaterials()) {
    const part = mat.getName().split('_').slice(1).join('_') || mat.getName();
    const col = path.join(TEX, `${key}_${part}_color.png`), nor = path.join(TEX, `${key}_${part}_normal.png`);
    mat.setMetallicFactor(0).setRoughnessFactor(part === 'opacity' ? 0.6 : 0.82).setBaseColorFactor([1, 1, 1, 1]);
    mat.setExtension?.('KHR_materials_specular', null);
    if (fs.existsSync(col)) {
      const t = doc.createTexture(`${key}_${part}`).setImage(await webp(col, part === 'opacity' ? 85 : 80)).setMimeType('image/webp');
      mat.setBaseColorTexture(t);
    }
    if (fs.existsSync(nor) && part !== 'opacity') {
      const t = doc.createTexture(`${key}_${part}_n`).setImage(await webp(nor, 75)).setMimeType('image/webp');
      mat.setNormalTexture(t);
    }
    if (part === 'opacity' || part === 'eyelashes') { mat.setAlphaMode('MASK').setAlphaCutoff(0.35).setDoubleSided(true); }
  }
  await doc.transform(prune(), dedup());
  // kalabalık LOD'u: dokusuz, sadeleştirilmiş kopya (çalışma anında ana malzemeler kullanılır)
  const lod = await io.read(raw);
  for (const a of lod.getRoot().listAnimations()) a.dispose();
  for (const m of lod.getRoot().listMeshes()) for (const p of m.listPrimitives()) { p.setAttribute('COLOR_0', null); }
  for (const t of lod.getRoot().listTextures()) t.dispose();
  await lod.transform(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.004, lockBorder: false }), prune({ keepAttributes: true }));
  lod.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await lod.transform(quantize({ quantizeNormal: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, `${key}_lod.glb`), lod);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await doc.transform(quantize({ quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, `${key}.glb`), doc);
  let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  let lt = 0; for (const m of lod.getRoot().listMeshes()) for (const p of m.listPrimitives()) lt += p.getIndices().getCount() / 3;
  console.log(`${key.padEnd(6)} ${kb(path.join(OUT, key + '.glb'))} KB  ${tris} üçgen  | lod ${kb(path.join(OUT, key + '_lod.glb'))} KB ${lt} üçgen`);
}

// fes: ikili STL -> keçe gövde ve püskül (geometrik ayrım); silindirik UV
async function buildFez() {
  const buf = fs.readFileSync(FEZ_STL);
  const n = buf.readUInt32LE(80), pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(84 + i * 50 + 12 + k * 4);
  // kaynak: milimetre, Y-yukarı, taban y=0'da. Taban çapı (z boyu, püskül x'e sarkar) gerçek fes ölçüsüne: 18,5 cm
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
  const cz = (mn[2] + mx[2]) / 2, cx = mn[0] + (mx[2] - mn[2]) / 2;
  const s = 0.185 / (mx[2] - mn[2]);
  // köşe kaynaştırma ve bağlı parçalar
  const key = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
  const map = new Map(), verts = [], idx = [];
  for (let i = 0; i < n * 3; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], k = key(x, y, z);
    let v = map.get(k); if (v === undefined) { v = verts.length / 3; map.set(k, v); verts.push((x - cx) * s, (y - mn[1]) * s, (z - cz) * s); }
    idx.push(v);
  }
  // keçe / püskül ayrımı (model tek parça): gövde tabanda r=75, tepede (y=112 mm) r=57 mm'lik kesik koni;
  // koninin dışında ya da tepe diskinin üstünde kalan üçgenler püskül ve kordonu
  const isTassel = (t) => {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { const v = idx[t + k] * 3; x += verts[v]; y += verts[v + 1]; z += verts[v + 2]; }
    x /= 3 * s; y /= 3 * s; z /= 3 * s;
    return y > 117 || Math.hypot(x, z) > 75 - 18 * Math.min(1, y / 112) + 3;
  };
  const doc = new Document(); const b0 = doc.createBuffer();
  const sc = doc.createScene('fez'), node = doc.createNode('fez'); sc.addChild(node);
  const mesh = doc.createMesh('fez'); node.setMesh(mesh);
  const felt = doc.createMaterial('felt').setBaseColorFactor([0.36, 0.025, 0.03, 1]).setRoughnessFactor(0.95).setMetallicFactor(0);
  const tassel = doc.createMaterial('tassel').setBaseColorFactor([0.05, 0.03, 0.03, 1]).setRoughnessFactor(0.8).setMetallicFactor(0);
  for (const [mat, pick] of [[felt, true], [tassel, false]]) {
    const sel = []; for (let t = 0; t < idx.length; t += 3) if (isTassel(t) !== pick) sel.push(idx[t], idx[t + 1], idx[t + 2]);
    if (!sel.length) continue;
    const remap = new Map(), P = [], UV = [], I = [];
    for (const v of sel) { let r = remap.get(v); if (r === undefined) { r = P.length / 3; remap.set(v, r); P.push(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]); UV.push(Math.atan2(verts[v * 3 + 2], verts[v * 3]) / (2 * Math.PI) + 0.5, verts[v * 3 + 1] * 6); } I.push(r); }
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(b0))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(UV)).setBuffer(b0))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(b0));
    mesh.addPrimitive(prim);
  }
  await doc.transform(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: 0.12, error: 0.002 }));
  const { normals } = require('@gltf-transform/functions');
  await doc.transform(normals({ overwrite: true }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await doc.transform(quantize({}), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, 'fez.glb'), doc);
  let tris = 0; for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  console.log(`fez    ${kb(path.join(OUT, 'fez.glb'))} KB  ${tris} üçgen, taban çapı 0.185 m, boy ${((mx[1] - mn[1]) * s).toFixed(3)} m (püskül dahil)`);
}

async function buildAnim(name, clip) {
  const src = path.join(TMP, clip + '.fbx');
  if (!fs.existsSync(src)) {
    const r = await fetch(ANIM_URL + clip + '.max.fbx');
    if (!r.ok) throw new Error(clip + ' indirilemedi ' + r.status);
    fs.writeFileSync(src, Buffer.from(await r.arrayBuffer()));
  }
  const doc = await io.read(fbx(src, 'a_' + clip));
  const root = doc.getRoot();
  const anim = root.listAnimations()[0]; anim.setName(name);
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode(), p = ch.getTargetPath(), nm = node?.getName() || '';
    // yalnızca biped kemikleri; öteleme sadece leğende (yerinde: yatay kayma sabitlenir)
    if (!nm.startsWith('Bip01') || nm === 'Bip01 Footsteps' || p === 'scale' || (p === 'translation' && nm !== 'Bip01 Pelvis')) { const s = ch.getSampler(); ch.dispose(); s.dispose(); continue; }
    if (p === 'translation') {
      const out = ch.getSampler().getOutput(), a = out.getArray().slice();
      for (let i = 0; i < a.length; i += 3) { a[i] = a[0]; a[i + 2] = a[2]; }
      out.setArray(a);
    }
  }
  // en fazla 8 saniye (döngü olarak kullanılır)
  const cut = new Map();
  for (const s of anim.listSamplers()) {
    const ia = s.getInput();
    if (!cut.has(ia)) { const inp = ia.getArray(); let k = inp.length; while (k > 2 && inp[k - 1] > 8) k--; cut.set(ia, { n: inp.length, k }); }
  }
  for (const s of anim.listSamplers()) {
    const { n, k } = cut.get(s.getInput()), out = s.getOutput().getArray(), w = out.length / n;
    if (k < n) s.getOutput().setArray(out.slice(0, k * w));
  }
  for (const [ia, { n, k }] of cut) if (k < n) ia.setArray(ia.getArray().slice(0, k));
  for (const m of root.listMeshes()) m.dispose();
  for (const sk of root.listSkins()) sk.dispose();
  await doc.transform(resample({ tolerance: 0.0008 }), prune({ keepLeaves: true }), dedup());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, 'anim', name + '.glb'), doc);
  console.log(`anim ${name.padEnd(12)} ${kb(path.join(OUT, 'anim', name + '.glb'))} KB  (${clip})`);
}

(async () => {
  await MeshoptEncoder.ready; await MeshoptSimplifier.ready; await MeshoptDecoder.ready;
  const only = process.env.ONLY;
  if (!only || only === 'avatars') for (const [k, rel] of Object.entries(AVATARS)) await buildAvatar(k, rel);
  if (!only || only === 'fez') await buildFez();
  if (!only || only === 'tex') {
    // f06 renk varyantları: ayrı WebP dokular (çalışma anında değiştirilir)
    for (const f of fs.readdirSync(TEX)) {
      const m = f.match(/^(adile|zekiye|hatice|rukiye|nazire|fitnat|leyla|crowd\d)_(body|head|opacity)_color\.png$/);
      if (!m) continue;
      fs.writeFileSync(path.join(OUT, 'tex', `${m[1]}_${m[2]}.webp`), await webp(path.join(TEX, f), m[2] === 'opacity' ? 85 : 80));
    }
    console.log('varyant dokuları yazıldı');
  }
  if (!only || only === 'anim') for (const [n, c] of Object.entries(ANIMS)) await buildAnim(n, c);
})().catch((e) => { console.error(e); process.exit(1); });
