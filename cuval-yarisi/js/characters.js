// İskeletli karakterler: Quaternius Universal Base Characters + Modular Outfits (CC0).
// Parçalar ortak 65 kemikli iskelete bağlanır, kıyafetler shader'da renk maskesiyle boyanır,
// animasyonlar Universal Animation Library'den gelir. Kalabalık için pozlar statik geometriye pişirilir.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PARTS = ['f_head', 'f_peasant', 'f_hood', 'm_head', 'm_peasant', 'm_beard',
  'f_head_lod', 'f_peasant_lod', 'f_hood_lod', 'm_head_lod', 'm_peasant_lod', 'm_beard_lod',
  'f_head_mid', 'f_peasant_mid', 'f_hood_mid', 'm_head_mid', 'm_peasant_mid', 'm_beard_mid', 'anims1', 'anims2'];

const raw = {};          // yüklenmiş glTF'ler
export const CLIPS = {}; // ad -> AnimationClip
const templates = {};    // önbellekli birleştirilmiş şablonlar

export async function loadCharacterParts(loadBin, track) {
  const gl = new GLTFLoader();
  await Promise.all(PARTS.map((p) => track(loadBin(`assets/models/${p}.glb`).then((b) => gl.parseAsync(b, '')).then((g) => { raw[p] = g; }))));
  for (const a of [...raw.anims1.animations, ...raw.anims2.animations]) {
    // kök kemiğin ötelemesini at: karakteri biz konumlandırıyoruz
    a.tracks = a.tracks.filter((t) => !/^root\.position$/.test(t.name));
    CLIPS[a.name] = a;
  }
}

// ---------- Boya: kremi ana renge, hardalı süs rengine, yeşili başörtüsü rengine çevir ----------
function dye(mat, { main = null, trim = null, scarf = null, instanced = false, skin = null } = {}) {
  const m = mat.clone();
  m.userData.dye = {
    uMain: { value: new THREE.Color(main ?? 0xffffff) }, uTrim: { value: new THREE.Color(trim ?? 0xffffff) },
    uScarf: { value: new THREE.Color(scarf ?? 0xffffff) },
    uAmt: { value: new THREE.Vector3(main !== null ? 1 : 0, trim !== null ? 1 : 0, scarf !== null ? 1 : 0) },
  };
  if (skin !== null) m.color.multiply(new THREE.Color(skin));
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.dye);
    sh.fragmentShader = 'uniform vec3 uMain; uniform vec3 uTrim; uniform vec3 uScarf; uniform vec3 uAmt;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', instanced ? '' : '#include <color_fragment>')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;                 // doğrusal renk
          vec3 g = sqrt(max(c, vec3(0.0)));          // yaklaşık gama uzayı: maske hesabı için
          float mx = max(g.r, max(g.g, g.b)), mn = min(g.r, min(g.g, g.b));
          float sat = (mx - mn) / (mx + 1e-4);
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float lumS = dot(g, vec3(0.2126, 0.7152, 0.0722));
          ${instanced ? 'vec3 mainC = vColor; vec3 scarfC = vColor;' : 'vec3 mainC = uMain; vec3 scarfC = uScarf;'}
          float cream = smoothstep(0.3, 0.42, lumS) * (1.0 - smoothstep(0.3, 0.46, sat));
          float ocher = smoothstep(0.55, 0.7, sat) * smoothstep(0.32, 0.45, lumS) * step(g.b, g.g) * step(g.g, g.r);
          float green = smoothstep(0.04, 0.14, g.g - max(g.r, g.b));
          c = mix(c, mainC * clamp(lum / 0.2, 0.25, 1.5), cream * uAmt.x);
          c = mix(c, uTrim * clamp(lum / 0.24, 0.3, 1.4), ocher * uAmt.y);
          c = mix(c, scarfC * clamp(lum / 0.2, 0.2, 1.25), green * uAmt.z);
          diffuseColor.rgb = c;
        }`);
  };
  m.customProgramCacheKey = () => `dye-${instanced}-${main !== null}-${trim !== null}-${scarf !== null}`;
  return m;
}

// Bir parçanın SkinnedMesh'lerini temel iskelete bağlar
function attachPart(base, boneMap, part) {
  part.scene.updateMatrixWorld(true);
  const meshes = [];
  part.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const src of meshes) {
    const mesh = src.clone();
    const bones = src.skeleton.bones.map((b) => boneMap[b.name]);
    mesh.matrixAutoUpdate = true;
    src.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    base.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses.map((m) => m.clone())), src.bindMatrix.clone());
  }
}

// Fes: keçe gövde + siyah püskül, renk köşe renginden: tek mesh, tek çizim çağrısı
let _fezGeo = null, _fezMat = null;
function fezMesh() {
  if (!_fezGeo) {
    const part = (g, color, m) => {
      g.applyMatrix4(m);
      const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g.index ? g : g;
    };
    const T = (x, y, z, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1));
    _fezGeo = mergeGeometries([
      part(new THREE.CylinderGeometry(0.083, 0.104, 0.15, 24, 1), 0x8e1414, T(0, 0.075, 0)),
      part(new THREE.CircleGeometry(0.083, 24), 0x8e1414, T(0, 0.15, 0, -Math.PI / 2)),
      part(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6), 0x141010, T(0, 0.16, 0)),
      part(new THREE.ConeGeometry(0.022, 0.13, 10, 1, true), 0x141010, T(0, 0.11, 0.09, 0.55)),
    ].map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); return g; }));
    _fezMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, name: 'Fez' });
  }
  const m = new THREE.Mesh(_fezGeo, _fezMat);
  m.castShadow = true;
  return m;
}

// Kafa kemiğine, bağlama pozunda tepe noktasına oturan bir nesne ekler
function attachToHeadTop(root, obj, lift = -0.02, forward = 0.0) {
  root.updateMatrixWorld(true);
  const head = root.getObjectByName('Head');
  let top = -Infinity;
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !/head|Superhero/i.test(o.name)) return;
    const p = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); if (v.y > top) top = v.y; }
  });
  const hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
  const world = new THREE.Matrix4().makeTranslation(hp.x, top + lift, hp.z + forward);
  obj.matrixAutoUpdate = false;
  obj.matrix.copy(new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(world));
  head.add(obj);
}

// Bir karakter şablonu: baş + kıyafet + aksesuarlar (bağlama pozunda)
function template(key, sex, lod, opts) {
  if (templates[key]) return templates[key];
  const S = lod === 'mid' ? '_mid' : lod ? '_lod' : '';
  const base = cloneSkinned(raw[`${sex}_head${S}`].scene);
  const boneMap = {};
  base.traverse((o) => { if (o.isBone) boneMap[o.name] = o; });
  attachPart(base, boneMap, raw[`${sex}_peasant${S}`]);
  if (opts.hood) attachPart(base, boneMap, raw[`f_hood${S}`]);
  if (opts.beard) attachPart(base, boneMap, raw[`m_beard${S}`]);
  if (opts.fez) attachToHeadTop(base, fezMesh(), -0.035, 0.0);
  templates[key] = base;
  return base;
}

// ---------- Canlı karakter ----------
export function createCharacter(o = {}) {
  const sex = o.sex ?? 'f', lod = o.lod === 'mid' ? 'mid' : !!o.lod;
  const opts = { hood: o.hood ?? sex === 'f', beard: !!o.beard, hair: !!o.hair, fez: !!o.fez };
  const key = `${sex}${lod}${opts.hood}${opts.beard}${opts.hair}${opts.fez}`;
  const root = cloneSkinned(template(key, sex, lod, opts));
  const mats = [];
  const legMeshes = [];
  root.traverse((m) => { if (m.isMesh && /_(Legs|Feet)$/.test(m.name)) legMeshes.push(m); });
  if (o.hideLegs) for (const m of legMeshes) m.visible = false;
  root.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false; // iskelet animasyonunda sınır kutusu güncellenmez
    const n = m.material.name || '';
    if (/Peasant/.test(n)) m.material = dye(m.material, { main: o.main ?? null, trim: o.trim ?? null });
    else if (/Ranger/.test(n)) m.material = dye(m.material, { scarf: o.scarf ?? 0xf2ead7 });
    else if (/Superhero|Regular/.test(n)) m.material = dye(m.material, { skin: o.skin ?? 0xffffff });
    else if (/Hair/.test(n)) { m.material = m.material.clone(); m.material.color.set(o.hairColor ?? 0x2a1a12); }
    if (m.material.map) m.material.map.anisotropy = 4;
    mats.push(m.material);
  });
  const bones = {};
  root.traverse((b) => { if (b.isBone) bones[b.name] = b; });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  let current = null;
  const ch = {
    root, bones, mixer, mats, legMeshes,
    showLegs(v) { for (const m of legMeshes) m.visible = v; },
    play(name, { fade = 0.2, loop = true, speed = 1, clamp = true, restart = false } = {}) {
      const clip = CLIPS[name]; if (!clip) return null;
      let a = actions[name] || (actions[name] = mixer.clipAction(clip));
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = clamp; a.timeScale = speed;
      if (current === a && !restart) return a;
      a.reset().setEffectiveWeight(1).play();
      if (current && current !== a) current.crossFadeTo(a, fade, false);
      current = a;
      return a;
    },
    get current() { return current; },
    update(dt) { mixer.update(dt); },
  };
  // kıyafetin kemik eksenlerini öğren: dinlenme pozunu sakla
  ch.rest = {}; ch.restPos = {};
  for (const [n, b] of Object.entries(bones)) { ch.rest[n] = b.quaternion.clone(); ch.restPos[n] = b.position.clone(); }
  return ch;
}

// ---------- İki kemikli IK (omuz-dirsek-el) ----------
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

// ---------- Kalabalık: pozu statik geometriye pişir ----------
// Döner: { geometry (gruplu), materials } — InstancedMesh ile çizilir
export function bakePose({ sex, clip, time, beard = false, fez = false, hood = sex === 'f' }) {
  const ch = createCharacter({ sex, lod: true, beard, fez, hood });
  ch.root.rotation.y = Math.PI;
  if (clip && CLIPS[clip]) { const a = ch.mixer.clipAction(CLIPS[clip]); a.play(); ch.mixer.setTime(time ?? 0); }
  ch.root.updateMatrixWorld(true);
  const byMat = new Map();
  const v = new THREE.Vector3(), n = new THREE.Vector3(), w = new THREE.Vector3();
  ch.root.traverse((m) => {
    if (!m.isMesh) return;
    const g = m.geometry;
    const pos = g.attributes.position, nor = g.attributes.normal;
    const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
      if (m.isSkinnedMesh) {
        w.copy(v).addScaledVector(n, 0.01);
        m.applyBoneTransform(i, v); m.applyBoneTransform(i, w);
        v.applyMatrix4(m.matrixWorld); w.applyMatrix4(m.matrixWorld);
        n.subVectors(w, v).normalize();
      } else { v.applyMatrix4(m.matrixWorld); n.transformDirection(m.matrixWorld); }
      P.set([v.x, v.y, v.z], i * 3); N.set([n.x, n.y, n.z], i * 3);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    out.setAttribute('uv', g.attributes.uv ? g.attributes.uv.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    out.setIndex(g.index ? g.index.clone() : null);
    if (!out.index) { const idx = []; for (let i = 0; i < pos.count; i++) idx.push(i); out.setIndex(idx); }
    const srcMat = m.material;
    if (byMat.has(srcMat)) { byMat.get(srcMat).geos.push(out); return; }
    const name = srcMat.name || '';
    // kalabalıkta örnek rengi (instanceColor) kıyafeti ve başörtüsünü boyar, teni etkilemez
    let mat;
    if (/Peasant/.test(name)) mat = dye(m.material, { main: 0xffffff, instanced: true });
    else if (/Ranger/.test(name)) mat = dye(m.material, { scarf: 0xffffff, instanced: true });
    else if (/Fez/.test(name)) {
      // fes köşe rengini korur, örnek rengini yok sayar
      mat = m.material.clone();
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', 'vColor = vec3(1.0);\n#ifdef USE_COLOR\n vColor *= color;\n#endif');
      };
      mat.customProgramCacheKey = () => 'fez-inst';
    } else {
      mat = m.material.clone();
      if (/Hair/.test(name)) mat.color.set(0x2a1a12);
      mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', ''); }; mat.customProgramCacheKey = () => 'nocolor'; }
    byMat.set(srcMat, { geos: [out], mat });
  });
  const groups = [...byMat.values()];
  return { geometry: mergeGeometries(groups.map((g) => (g.geos.length > 1 ? mergeGeometries(g.geos) : g.geos[0])), true), materials: groups.map((g) => g.mat) };
}
