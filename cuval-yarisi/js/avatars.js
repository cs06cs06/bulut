// Karakterler: Microsoft Rocketbox avatarları (MIT) ve hareket yakalama animasyonları.
// tools/build-rocketbox.cjs ile GLB'ye çevrildi. Kadınlar entari-yemeni (Female_Adult_06; yarışmacılar
// için renk/desen varyantları) ve çarşaf (Female_Adult_10); erkekler takım elbise, yelek, gömlek,
// uzun gömlek ve takke. Fes: Printables "Just a FEZ" (Esteban Chardonnet, CC-BY).
// Eski oyun koduyla aynı arayüz: createCharacter, bakePose, solveArmIK, loadCharacterParts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DIR = 'assets/avatars/';
export const AVATARS = {
  f06: 'f', f10: 'f', bm01: 'm', bm02: 'm', bm03: 'm', bm04: 'm', bm05: 'm', bm06: 'm', m15: 'm',
};
const VARIANTS = ['adile', 'zekiye', 'hatice', 'rukiye', 'nazire', 'fitnat', 'leyla', 'crowd0', 'crowd1', 'crowd2', 'crowd3'];
// oyunun klip adları -> Rocketbox klipleri (cinsiyete göre f_/m_ öneki)
const CLIP_MAP = {
  Idle_Loop: 'idle', Idle2: 'idle2', Jump_Loop: 'idle', Hit_Chest: 'idle2', Cheer: 'cheer', Cheer2: 'cheer2', Clap: 'clap',
  Dance_Loop: 'dance', Idle_Talking_Loop: 'talk', Announce: 'announce', Sitting_Idle_Loop: 'sit', Sitting_Talking_Loop: 'sit_talk',
  Wave: 'wave', Laugh: 'laugh', Yes: 'nod', HandsHips: 'idle2', FoldArms: 'idle2',
};
const ANIM_NAMES = {
  f: ['idle', 'idle2', 'cheer', 'cheer2', 'clap', 'dance', 'talk', 'sit', 'sit_talk', 'wave', 'laugh'],
  m: ['idle', 'idle2', 'cheer', 'cheer2', 'clap', 'talk', 'announce', 'sit', 'sit_talk', 'wave', 'laugh', 'nod', 'dance'],
};
export const CLIPS = Object.fromEntries(Object.keys(CLIP_MAP).map((k) => [k, { name: k }]));
export const APOSE = 0;

// oyunun kemik adları -> biped kemikleri
const BONE = {
  root: 'RootNode', pelvis: 'Bip01_Pelvis', spine_01: 'Bip01_Spine', spine_02: 'Bip01_Spine1', spine_03: 'Bip01_Spine2', neck_01: 'Bip01_Neck', Head: 'Bip01_Head',
};
for (const [s, S] of [['l', 'L'], ['r', 'R']]) {
  Object.assign(BONE, {
    [`clavicle_${s}`]: `Bip01_${S}_Clavicle`, [`upperarm_${s}`]: `Bip01_${S}_UpperArm`, [`lowerarm_${s}`]: `Bip01_${S}_Forearm`, [`hand_${s}`]: `Bip01_${S}_Hand`,
    [`thigh_${s}`]: `Bip01_${S}_Thigh`, [`calf_${s}`]: `Bip01_${S}_Calf`, [`foot_${s}`]: `Bip01_${S}_Foot`, [`ball_${s}`]: `Bip01_${S}_Toe0`,
  });
}

const TPL = {}, LOD = {}, ANIM = { f: {}, m: {} }, VTEX = {};
let FEZ = null;

export async function loadCharacterParts(loadBin, track) {
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  const glb = (url) => loadBin(url).then((b) => gl.parseAsync(b, ''));
  const jobs = [];
  for (const k of Object.keys(AVATARS)) {
    jobs.push(track(glb(`${DIR}${k}.glb`).then((g) => { TPL[k] = prepTemplate(g.scene); })));
    jobs.push(track(glb(`${DIR}${k}_lod.glb`).then((g) => { LOD[k] = g.scene; })));
  }
  jobs.push(track(glb(`${DIR}fez.glb`).then((g) => {
    FEZ = g.scene;
    FEZ.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material.roughness = 0.95; } });
  })));
  for (const sex of ['f', 'm']) for (const a of ANIM_NAMES[sex]) {
    jobs.push(track(glb(`${DIR}anim/${sex}_${a}.glb`).then((g) => { ANIM[sex][a] = g.animations[0]; })));
  }
  const tl = new THREE.TextureLoader();
  for (const v of VARIANTS) for (const part of ['body', 'head', 'opacity']) {
    jobs.push(track(tl.loadAsync(`${DIR}tex/${v}_${part}.webp`).then((t) => {
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      VTEX[`${v}_${part}`] = t;
    })));
  }
  await Promise.all(jobs);
}

// şablon: gölgeler, malzeme ayarları
function prepTemplate(scene) {
  // her köşenin dinlenme pozundaki dünya yüksekliği (çuval içini kesmek için)
  scene.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const pos = o.geometry.attributes.position, ry = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); ry[i] = v.y; }
    o.geometry.setAttribute('aRestY', new THREE.BufferAttribute(ry, 1));
  });
  // kafa tepesi ve kafatasının yatay merkezi (fesin oturacağı yer)
  let top = -1e9;
  const up = [];
  scene.traverse((o) => {
    if (!o.isSkinnedMesh || /opacity/.test(o.material.name)) return;
    const pos = o.geometry.attributes.position, ry = o.geometry.attributes.aRestY;
    for (let i = 0; i < pos.count; i++) {
      const y = ry.getX(i);
      if (y > top) top = y;
      if (y > 1.5) { v.fromBufferAttribute(pos, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); up.push(v.x, v.y, v.z); }
    }
  });
  let cx = 0, cz = 0, n = 0;
  for (let i = 0; i < up.length; i += 3) if (up[i + 1] > top - 0.1) { cx += up[i]; cz += up[i + 2]; n++; }
  scene.userData.crown = new THREE.Vector3(cx / n, top, cz / n);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const m = o.material;
    m.envMapIntensity = 0.8;
    if (m.alphaTest > 0) { m.side = THREE.DoubleSide; }
  });
  return scene;
}

// bağlama pozundaki (çizim uzayı) y yüksekliğinin altını kesen malzeme yaması (çuvalın içi)
function patchClip(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uClipY = U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRestY; varying float vBindY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindY = aRestY;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uClipY; varying float vBindY;')
      .replace('void main() {', 'void main() {\nif (vBindY < uClipY) discard;');
  };
  mat.customProgramCacheKey = () => 'rb-clip2-' + (mat.alphaTest > 0 ? 'a' : 'o');
}

function pickAvatar(o) {
  if (o.avatar) return o.avatar;
  if ((o.sex ?? 'f') === 'f') return o.chador ? 'f10' : 'f06';
  const pick = (list) => list[(o.pick ?? 0) % list.length];
  switch (o.outfit) {
    case 'uniform': return 'bm02';
    case 'villager': return pick(['bm04', 'bm06']);
    case 'kurta': return 'm15';
    default: return pick(['bm01', 'bm03', 'bm05']);
  }
}

// bağlama pozunda dünya uzayında verilen dönüşümü bir kemiğe sabitle
// fesin dinlenme pozundaki dünya matrisi: model gerçek boyutta (taban ~17,5 cm, gövde 13 cm); kafatasının
// tepesinden 7 cm aşağıya kadar geçer, hafifçe arkaya yatar, püskülü arkaya-sola sarkar
function fezMatrix(key) {
  const c = TPL[key].userData.crown;
  return new THREE.Matrix4().compose(new THREE.Vector3(c.x, c.y - 0.07, c.z - 0.01),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 2.1, 0)), new THREE.Vector3(0.94, 0.94, 0.94));
}

function attachAtBind(obj, bone, worldMatrix) {
  bone.updateWorldMatrix(true, false);
  const inv = bone.matrixWorld.clone().invert();
  obj.matrix.copy(inv.multiply(worldMatrix));
  obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  bone.add(obj);
}

function teamSash(color, waistY, rx, rz) {
  const g = new THREE.TorusGeometry(1, 0.11, 6, 28);
  g.rotateX(Math.PI / 2); g.scale(rx, 0.32, rz);
  // önde düğüm ve sarkan uçlar
  const knot = new THREE.SphereGeometry(0.035, 8, 6).translate(rx * 0.35, 0, rz * 0.93);
  const tail = new THREE.BoxGeometry(0.05, 0.16, 0.012).translate(rx * 0.38, -0.09, rz * 0.97);
  const m = new THREE.Mesh(mergeGeometries([g.toNonIndexed(), knot.toNonIndexed(), tail.toNonIndexed()]), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.castShadow = true;
  return m;
}

export function createCharacter(o = {}) {
  const key = pickAvatar(o);
  const sex = AVATARS[key];
  const root = new THREE.Group();
  const model = cloneSkinned(TPL[key]);
  root.add(model);
  const U = { value: -10 };
  const variant = o.variant ?? o.look?.variant;
  const meshes = [];
  model.traverse((m) => {
    if (!m.isMesh) return;
    meshes.push(m);
    const mat = m.material.clone();
    if (variant && key === 'f06') {
      const part = mat.name.split('_').pop();
      const t = VTEX[`${variant}_${part}`];
      if (t) mat.map = t;
    }
    if (o.tint && /body/.test(mat.name)) mat.color.set(o.tint);
    patchClip(mat, U);
    m.material = mat;
  });
  const bones = {};
  for (const [k, n] of Object.entries(BONE)) bones[k] = model.getObjectByName(n);
  model.updateMatrixWorld(true);
  const rest = {}, restPos = {};
  for (const [k, b] of Object.entries(bones)) if (b) { rest[k] = b.quaternion.clone(); restPos[k] = b.position.clone(); }
  // fes: tepeye oturur, hafif arkaya yatık
  if (o.fez && FEZ && key !== 'm15') attachAtBind(FEZ.clone(), bones.Head, fezMatrix(key));
  // takım kuşağı (halat çekme, davulcu)
  if (o.sash) {
    const s = teamSash(o.sash, 0, 0.165, 0.125);
    attachAtBind(s, bones.spine_01, new THREE.Matrix4().makeTranslation(0, bones.spine_01.getWorldPosition(new THREE.Vector3()).y - 0.02, 0.01));
  }
  // yüz kemikleri
  const lids = [], lidsB = [];
  let jaw = null;
  model.traverse((b) => {
    if (/EyeBlinkTop$/.test(b.name)) lids.push([b, b.position.x]);
    if (/EyeBlinkBottom$/.test(b.name)) lidsB.push([b, b.position.x]);
    if (b.name === 'Bip01_MJaw') jaw = [b, b.quaternion.clone()];
  });
  const mixer = new THREE.AnimationMixer(model);
  let current = null;
  const actionFor = (name) => {
    const clip = ANIM[sex][CLIP_MAP[name] ?? 'idle'] ?? ANIM[sex].idle;
    return mixer.clipAction(clip);
  };
  let blinkT = 1 + Math.random() * 3, blink = 0;
  const qj = new THREE.Quaternion(), zAx = new THREE.Vector3(0, 0, 1);
  const ch = {
    root, bones, mesh: meshes[0], meshes, mats: meshes.map((m) => m.material), legMeshes: [], rest, restPos, key, sex,
    expression: 'neutral',
    face(name) { ch.expression = name; },
    showLegs(show, clipY = 0.6) { U.value = show ? -10 : clipY; },
    play(name, { fade = 0.25, speed = 1, loop = true, restart = false } = {}) {
      const a = actionFor(name);
      a.setEffectiveTimeScale(speed);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop;
      if (current === a && !restart) return a;
      a.enabled = true; a.setEffectiveWeight(1);
      if (restart || current !== a) a.reset();
      if (current) a.crossFadeFrom(current, fade, false);
      a.play();
      current = a;
      return a;
    },
    poseAt(name, t) { mixer.stopAllAction(); const a = actionFor(name); a.reset().play(); a.time = t; current = a; mixer.update(0); root.updateMatrixWorld(true); },
    update(dt) {
      mixer.update(dt);
      // göz kırpma ve ifade
      blinkT -= dt;
      if (blinkT <= 0) { blink = 1; blinkT = 2 + Math.random() * 3.5; }
      blink = Math.max(0, blink - dt * 7);
      const e = ch.expression;
      const close = Math.sin(Math.min(1, blink) * Math.PI) * (e === 'shock' ? 0.6 : 1);
      const wide = e === 'shock' ? 0.004 : e === 'strain' ? -0.003 : 0;
      for (const [b, x0] of lids) b.position.x = x0 - 0.0098 * close + wide;
      for (const [b, x0] of lidsB) b.position.x = x0 + 0.003 * close;
      if (jaw) {
        const open = e === 'joy' ? 0.1 : e === 'shock' ? 0.13 : ch.talking ? Math.max(0, Math.sin(performance.now() * 0.018)) * 0.06 : 0;
        jaw[0].quaternion.copy(jaw[1]).multiply(qj.setFromAxisAngle(zAx, open));
      }
    },
  };
  ch.play(o.clip || 'Idle_Loop', { fade: 0 });
  ch.update(Math.random() * 3);
  return ch;
}

// ---------- IK ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion();
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
function rotateBoneWorld(bone, from, to) {
  _q.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qw));
  bone.updateMatrixWorld(true);
}
export function solveArmIK(upper, lower, hand, target, pole) {
  upper.updateMatrixWorld(true);
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); hand.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  _d.subVectors(target, _a);
  const dist = Math.min(_d.length(), (l1 + l2) * 0.999);
  _d.normalize();
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _u.subVectors(pole, _a); _u.addScaledVector(_d, -_u.dot(_d)).normalize();
  _e.copy(_a).addScaledVector(_d, cosA * l1).addScaledVector(_u, sinA * l1);
  rotateBoneWorld(upper, _v1.subVectors(_b, _a).normalize(), _v2.subVectors(_e, _a).normalize());
  lower.getWorldPosition(_b); hand.getWorldPosition(_c);
  _e.copy(_a).addScaledVector(_d, dist);
  rotateBoneWorld(lower, _v1.subVectors(_c, _b).normalize(), _v2.subVectors(_e, _b).normalize());
}

// nicemlenmiş (KHR_mesh_quantization) öznitelikleri float'a çevir; yalnız konum/normal/uv kalır
function floatGeometry(src) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = src.attributes[k];
    if (!a) { if (k === 'uv') g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2)); continue; }
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
    g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
  }
  g.setIndex(src.index ? Array.from(src.index.array) : Array.from({ length: src.attributes.position.count }, (_, i) => i));
  return g;
}

// ---------- Kalabalık: sadeleştirilmiş avatarın pozunu statik geometriye pişir ----------
export function bakePose(o) {
  const key = pickAvatar(o);
  const sex = AVATARS[key];
  const model = cloneSkinned(LOD[key]);
  const full = TPL[key], mats = {};
  full.traverse((m) => { if (m.isMesh) mats[m.material.name] = m.material; });
  const mixer = new THREE.AnimationMixer(model);
  const a = mixer.clipAction(ANIM[sex][CLIP_MAP[o.clip] ?? 'idle'] ?? ANIM[sex].idle);
  a.play(); a.time = o.time ?? 0; mixer.update(0);
  model.updateMatrixWorld(true);
  const geos = [], materials = [];
  const v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();
  model.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    m.skeleton.update();
    const g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3), UV = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
      w.copy(v).addScaledVector(n, 0.01);
      m.applyBoneTransform(i, v); m.applyBoneTransform(i, w);
      v.applyMatrix4(m.matrixWorld); w.applyMatrix4(m.matrixWorld);      // Rocketbox Z-yukarı: düğüm dönüşümü de pişsin
      n.subVectors(w, v).normalize();
      P.set([v.x, v.y, v.z], i * 3); N.set([n.x, n.y, n.z], i * 3);
      if (uv) { UV[i * 2] = uv.getX(i); UV[i * 2 + 1] = uv.getY(i); }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(P, 3));
    bg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    bg.setIndex(Array.from(g.index.array));
    geos.push(bg);
    let mat = (mats[m.material.name] || m.material).clone();
    if (o.variant && key === 'f06') { const t = VTEX[`${o.variant}_${mat.name.split('_').pop()}`]; if (t) mat.map = t; }
    materials.push(mat);
  });
  // fes (pişirilmiş)
  if (o.fez && FEZ && key.startsWith('bm')) {
    const head = model.getObjectByName('Bip01_Head');
    const ref = cloneSkinned(LOD[key]); ref.updateMatrixWorld(true);
    const hb = ref.getObjectByName('Bip01_Head');
    const bindLocal = hb.matrixWorld.clone().invert().multiply(fezMatrix(key));
    const mw = head.matrixWorld.clone().multiply(bindLocal);
    FEZ.updateMatrixWorld(true);
    FEZ.traverse((m) => {
      if (!m.isMesh) return;
      const fg = floatGeometry(m.geometry);
      fg.applyMatrix4(mw.clone().multiply(m.matrixWorld));
      geos.push(fg); materials.push(m.material);
    });
  }
  const geometry = mergeGeometries(geos.map(floatGeometry), true);
  return { geometry, materials };
}
