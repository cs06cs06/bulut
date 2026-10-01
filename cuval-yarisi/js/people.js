// Prosedürel karakterler: çuvallı yarışmacılar, fesli erkekler, yemenili kadınlar.
// Her parça renk özniteliğiyle boyanıp birleştirilir; böylece karakter başına çizim çağrısı az kalır.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets } from './assets.js';

const _c = new THREE.Color();

// Geometriye tek renk boyar (vertex color) ve isteğe bağlı dönüşüm uygular
export function paint(geo, color, m4) {
  if (m4) geo.applyMatrix4(m4);
  _c.set(color);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function ensureIndexed(g) {
  if (g.index) return g;
  const n = g.attributes.position.count, idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  g.setIndex(idx);
  return g;
}

export function merge(list) {
  const clean = list.map((g) => {
    ensureIndexed(g);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  });
  return mergeGeometries(clean, false);
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
};

// İki nokta arasında kapsül (kol/bacak için)
function limb(a, b, r, color, seg = 6, lod = false) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const g = lod ? new THREE.CylinderGeometry(r, r * 0.9, len, seg, 1) : new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 0.5), 3, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return paint(g, color, m);
}

// Basit gürültü: kumaş kırışıkları için
function wrinkle(a, y, seed) {
  return Math.sin(a * 5 + seed) * 0.5 + Math.sin(a * 11 + y * 9 + seed * 2) * 0.3 + Math.sin(a * 17 - y * 23 + seed) * 0.2;
}

export const MAT = {};
export function initMaterials() {
  MAT.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  MAT.vcSoft = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  MAT.vcShiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.65 });
  MAT.face = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
  MAT.blush = new THREE.MeshBasicMaterial({ color: 0xff7a7a, transparent: true, opacity: 0.35, depthWrite: false });
}

// ---------- Çuval dokusu (çuval bezi + damga) ----------
export function sackTexture(stamp, num, inkColor = '#3b2a1e') {
  const img = assets.images.hessian;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const x = cv.getContext('2d');
  x.drawImage(img, 0, 0, 512, 512);
  // hafif sarımsı, eski un çuvalı tonu
  x.fillStyle = 'rgba(214,180,120,0.18)'; x.fillRect(0, 0, 512, 512);
  x.save();
  x.translate(128, 250); x.rotate(-0.04);
  x.globalAlpha = 0.78;
  x.fillStyle = inkColor; x.strokeStyle = inkColor;
  x.lineWidth = 7;
  x.beginPath(); x.ellipse(0, 0, 98, 120, 0, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3;
  x.beginPath(); x.ellipse(0, 0, 86, 108, 0, 0, Math.PI * 2); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 30px Nunito, sans-serif';
  x.fillText(stamp[0], 0, -58);
  x.font = '400 92px "Lilita One", sans-serif';
  x.fillText(String(num), 0, 8);
  x.font = '900 24px Nunito, sans-serif';
  x.fillText(stamp[1], 0, 70);
  // ★ ve ☾ süslemesi
  x.font = '900 26px serif';
  x.fillText('☾✦', 0, -88);
  x.restore();
  // mürekkep aşınması
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    x.fillRect(Math.random() * 256, 100 + Math.random() * 300, 2 + Math.random() * 5, 1 + Math.random() * 3);
  }
  x.globalCompositeOperation = 'source-over';
  // çuval bezini damganın üzerine tekrar dokuyla kapla
  x.globalAlpha = 0.25; x.drawImage(img, 0, 0, 512, 512); x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------- Çuval geometrisi ----------
function sackGeometry(build) {
  const pts = [];
  const prof = [
    [0.0, 0.0], [0.17, 0.0], [0.26, 0.025], [0.3, 0.09], [0.31, 0.2], [0.3, 0.4],
    [0.29, 0.6], [0.295, 0.76], [0.31, 0.86], [0.345, 0.93], [0.375, 0.985], [0.37, 1.0],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r * (0.92 + build * 0.12), y));
  const g = new THREE.LatheGeometry(pts, 36);
  const p = g.attributes.position, v = new THREE.Vector3(), seed = Math.random() * 10;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.x, v.z), r = Math.hypot(v.x, v.z);
    if (r < 0.01) continue;
    const k = Math.min(1, v.y / 0.12) * (v.y > 0.85 ? 1.8 : 1); // ağızda büzgü
    const d = 1 + wrinkle(a, v.y, seed) * 0.035 * k;
    v.x *= d * 1.06; v.z *= d * 0.94;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- Yüz ifadeleri ----------
function faceSet(skin, brows, look) {
  const R = 0.125;
  const eyeWhite = 0xfdfaf3, pupil = 0x1b120c;
  const base = [];
  // gözler
  for (const s of [-1, 1]) {
    base.push(paint(new THREE.SphereGeometry(0.021, 10, 8), eyeWhite, M(s * 0.044, 0.018, -R * 0.86, 0, 0, 0, 1, 1.05, 0.55)));
    base.push(paint(new THREE.SphereGeometry(0.0125, 8, 6), pupil, M(s * 0.044, 0.016, -R * 0.93, 0, 0, 0, 1, 1.15, 0.5)));
    base.push(paint(new THREE.SphereGeometry(0.004, 5, 4), 0xffffff, M(s * 0.044 + 0.004, 0.022, -R * 0.985)));
  }
  const brow = (ang, dy) => [-1, 1].map((s) => paint(new THREE.CapsuleGeometry(0.006, 0.03, 2, 4), brows,
    M(s * 0.046, 0.052 + dy, -R * 0.9, 0, 0, Math.PI / 2 + s * ang)));
  const make = (extra) => merge([...base.map((g) => g.clone()), ...extra]);

  const sets = {};
  // gülümseme
  sets.smile = make([
    ...brow(0.12, 0),
    paint(new THREE.TorusGeometry(0.028, 0.0065, 5, 12, Math.PI), 0x6b1f1f, M(0, -0.045, -R * 0.93, 0, 0, Math.PI)),
  ]);
  // zorlanma: dişler sıkılı, kaşlar çatık
  sets.strain = make([
    ...brow(-0.32, -0.006),
    paint(new THREE.BoxGeometry(0.05, 0.016, 0.01), 0xf7f2e8, M(0, -0.05, -R * 0.94)),
    paint(new THREE.BoxGeometry(0.056, 0.004, 0.012), 0x6b1f1f, M(0, -0.05, -R * 0.945)),
  ]);
  // şaşkınlık / düşerken
  sets.shock = make([
    ...brow(0.28, 0.014),
    paint(new THREE.SphereGeometry(0.02, 10, 8), 0x3a0e0e, M(0, -0.055, -R * 0.9, 0, 0, 0, 0.85, 1.2, 0.5)),
  ]);
  // sevinç: ağız kocaman açık
  sets.joy = make([
    ...brow(0.2, 0.01),
    paint(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0x5a1414, M(0, -0.036, -R * 0.9, 0, 0, 0, 1.1, 1.1, 0.55)),
    paint(new THREE.BoxGeometry(0.044, 0.008, 0.008), 0xffffff, M(0, -0.04, -R * 0.965)),
  ]);
  return sets;
}

// ---------- Yemeni (başörtüsü) ----------
function scarfParts(look, R) {
  const parts = [];
  const win = 0.95; // yüz açıklığının yarı genişliği (radyan)
  // ana başörtüsü: yüzü açıkta bırakan küre dilimi (ön yön -Z)
  parts.push(paint(new THREE.SphereGeometry(R * 1.13, 26, 18, -Math.PI / 2 + win, Math.PI * 2 - win * 2, 0, Math.PI * 0.8),
    look.scarf, M(0, 0.008, 0.004)));
  // tepe: alnın üstünü de örten başlık
  parts.push(paint(new THREE.SphereGeometry(R * 1.12, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.27), look.scarf, M(0, 0.01, 0.0)));
  // alın bandı (çatkı): önde alnın üstünden, arkada aşağıdan geçen eğik halka
  const bandR = R * 0.98, bandM = M(0, R * 0.45, R * 0.13, Math.PI / 2 + 0.25, 0, 0);
  parts.push(paint(new THREE.TorusGeometry(bandR, 0.013, 6, 32), look.scarfTrim, bandM));
  // oya boncukları: bandın ön yayı boyunca hemen altında
  for (let i = -6; i <= 6; i++) {
    const t = -Math.PI / 2 + (i / 6) * 1.1;
    const q = new THREE.Vector3(bandR * Math.cos(t), bandR * Math.sin(t), 0).applyMatrix4(bandM);
    parts.push(paint(new THREE.SphereGeometry(0.011, 6, 4), look.scarfTrim, M(q.x, q.y - 0.02, q.z)));
  }
  // saç perçemi
  parts.push(paint(new THREE.SphereGeometry(R * 1.0, 18, 8, Math.PI, Math.PI, 0, Math.PI * 0.32), look.hair, M(0, 0.0, -0.006)));
  // boyuna dolanan uç ve arkadan sarkan üçgen
  parts.push(paint(new THREE.TorusGeometry(0.085, 0.035, 8, 18), look.scarf, M(0, -R * 0.95, 0.01, Math.PI / 2, 0, 0, 1.05, 1, 1)));
  parts.push(paint(new THREE.ConeGeometry(0.16, 0.34, 4, 1, true), look.scarf, M(0, -0.16, 0.1, -0.25, Math.PI / 4, 0, 1, 1, 0.35)));
  return parts;
}

let _blobMat = null;
function blobMaterial() {
  if (_blobMat) return _blobMat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(20,14,8,0.6)'); g.addColorStop(0.55, 'rgba(20,14,8,0.28)'); g.addColorStop(1, 'rgba(20,14,8,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  return _blobMat;
}

// ================= YARIŞMACI =================
export function buildRacer(def, laneNum) {
  const look = def.look, b = look.build, h = look.height;
  const root = new THREE.Group();
  const hop = new THREE.Group(); root.add(hop);           // zıplama + esneme
  const tilt = new THREE.Group(); hop.add(tilt);          // denge kaybında yan yatma

  // çuval
  const sackTex = sackTexture(def.family === 'Tellioğlu' ? ['TELLİOĞLU', 'UN • İSKENDERİYE'] : ['SEFEROĞLU', 'BUĞDAY • MISIR'], laneNum,
    def.family === 'Tellioğlu' ? '#5a1a12' : '#14304d');
  sackTex.repeat.set(2, 1);
  const sackMat = new THREE.MeshStandardMaterial({
    map: sackTex, normalMap: assets.tex.hessianNor, roughnessMap: assets.tex.hessianArm,
    roughness: 1, metalness: 0, side: THREE.DoubleSide, normalScale: new THREE.Vector2(0.9, 0.9),
  });
  const sack = new THREE.Mesh(sackGeometry(b), sackMat);
  sack.castShadow = true; sack.receiveShadow = true;
  sack.rotation.y = Math.PI * 0.75; // damga öne (-Z) baksın
  tilt.add(sack);
  // çuvalın iç karanlığı
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.3 * (0.92 + b * 0.12), 20), new THREE.MeshBasicMaterial({ color: 0x1a120a }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 0.9; sack.add(inner); // çuvalla birlikte ölçeklenir

  // gövde (bel üstü)
  const upper = new THREE.Group(); upper.position.y = 0.9 * h; tilt.add(upper);
  const W = b;
  const torsoProf = [[0.17, -0.12], [0.2, 0.0], [0.215, 0.14], [0.235, 0.27], [0.225, 0.36], [0.19, 0.44], [0.1, 0.5], [0.055, 0.53]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const torso = [];
  torso.push(paint(new THREE.LatheGeometry(torsoProf, 22), look.dress, M(0, 0, 0, 0, 0, 0, W, 1, 0.82 + W * 0.12)));
  // cepken/yelek: önü açık
  const vestProf = torsoProf.slice(1, 7).map((v) => new THREE.Vector2(v.x * 1.06, v.y));
  torso.push(paint(new THREE.LatheGeometry(vestProf, 22, Math.PI + 0.42, Math.PI * 2 - 0.84), look.vest, M(0, 0, 0, 0, 0, 0, W, 1, 0.82 + W * 0.12)));
  // sırma kenar
  torso.push(paint(new THREE.TorusGeometry(0.205, 0.012, 5, 26), look.trim, M(0, 0.0, 0, Math.PI / 2, 0, 0, W * 1.03, 0.86 + W * 0.12, 1)));
  // kuşak
  torso.push(paint(new THREE.CylinderGeometry(0.205, 0.2, 0.09, 22, 1, true), look.trim, M(0, 0.04, 0, 0, 0, 0, W * 1.02, 1, 0.84 + W * 0.12)));
  torso.push(paint(new THREE.CylinderGeometry(0.21, 0.205, 0.035, 22, 1, true), look.dress, M(0, 0.04, 0, 0, 0, 0, W * 1.03, 1, 0.85 + W * 0.12)));
  // düğmeler
  for (let i = 0; i < 4; i++) torso.push(paint(new THREE.SphereGeometry(0.013, 6, 5), look.trim, M(0, 0.15 + i * 0.07, -(0.205 + (i === 1 || i === 2 ? 0.02 : 0)) * (0.82 + W * 0.12))));
  // boyun
  torso.push(paint(new THREE.CylinderGeometry(0.05, 0.058, 0.12, 12), look.skin, M(0, 0.56, 0)));
  const torsoMesh = new THREE.Mesh(merge(torso), MAT.vc);
  torsoMesh.castShadow = true;
  upper.add(torsoMesh);

  // baş
  const R = 0.125;
  const head = new THREE.Group(); head.position.set(0, 0.7, 0); upper.add(head);
  const headParts = [
    paint(new THREE.SphereGeometry(R, 24, 18), look.skin, M(0, 0, 0, 0, 0, 0, 0.94, 1.08, 1)),
    paint(new THREE.SphereGeometry(0.02, 8, 6), look.skin, M(0, -0.012, -R * 0.99, 0, 0, 0, 0.9, 1, 1.1)), // burun
    ...scarfParts(look, R),
  ];
  const headMesh = new THREE.Mesh(merge(headParts), MAT.vc);
  headMesh.castShadow = true;
  head.add(headMesh);
  const faces = faceSet(look.skin, look.brows, look);
  const faceMeshes = {};
  for (const [k, g] of Object.entries(faces)) { const fm = new THREE.Mesh(g, MAT.face); fm.visible = k === 'smile'; head.add(fm); faceMeshes[k] = fm; }
  for (const s of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.CircleGeometry(0.024, 12), MAT.blush);
    bl.position.set(s * 0.068, -0.026, -0.1); bl.rotation.y = Math.PI - s * 0.55;
    head.add(bl);
  }

  // kollar: omuzdan çuval ağzına
  const arms = [];
  const rimR = 0.39 * (0.92 + b * 0.12);
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.2 * W, 0.42, 0);
    upper.add(pivot);
    const hx = rimR - 0.2 * W;
    const hand = new THREE.Vector3(s * hx, -0.37, -0.05);
    const elbow = new THREE.Vector3(s * (hx * 0.6 + 0.06), -0.2, 0.06);
    const parts = [
      paint(new THREE.SphereGeometry(0.068, 10, 8), look.dress, M(0, 0, 0)),
      limb(new THREE.Vector3(0, 0, 0), elbow, 0.058, look.dress),
      limb(elbow, hand.clone().multiplyScalar(0.98), 0.05, look.dress),
      paint(new THREE.TorusGeometry(0.048, 0.01, 4, 12), look.trim, M(hand.x * 0.93, hand.y * 0.9, hand.z * 0.9, Math.PI / 2, 0, 0)),
      paint(new THREE.SphereGeometry(0.048, 10, 8), look.skin, M(hand.x, hand.y - 0.02, hand.z, 0, 0, 0, 1, 1.2, 0.85)),
    ];
    const arm = new THREE.Mesh(merge(parts), MAT.vc);
    arm.castShadow = true;
    pivot.add(arm);
    arms.push(pivot);
  }

  // yumuşak zemin gölgesi (gölge haritası kapalıyken de karakteri yere oturtur)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), blobMaterial());
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; blob.renderOrder = 2;
  root.add(blob);

  // isim etiketi ve takım bayrağı için bağlantı noktası
  const tagAnchor = new THREE.Object3D(); tagAnchor.position.y = 1.95; root.add(tagAnchor);

  return {
    root, hop, tilt, upper, head, arms, sack, faceMeshes, tagAnchor, blob,
    setFace(name) { for (const [k, m] of Object.entries(faceMeshes)) m.visible = k === name; },
  };
}

// ================= ERKEK (fesli) =================
// pose: 'stand' | 'raise' | 'sit' | 'drum'
export function manParts(o = {}) {
  const q = o.lod ? 0.42 : 1, S = (n, m = 3) => Math.max(m, Math.round(n * q)), LS = o.lod ? 5 : 6;
  const suit = o.suit ?? 0x2c2c34, shirt = o.shirt ?? 0xf1ece0, skin = o.skin ?? 0xd9a07a;
  const fez = o.fez ?? 0x9b1b1b, belly = o.belly ?? 1, H = o.height ?? 1;
  const sit = o.pose === 'sit';
  const p = [];
  const legY = sit ? 0 : 0;
  if (!sit) {
    p.push(limb(new THREE.Vector3(-0.09, 0.05, 0), new THREE.Vector3(-0.1, 0.82, 0), 0.075, o.pants ?? 0x23232a, LS, o.lod));
    p.push(limb(new THREE.Vector3(0.09, 0.05, 0), new THREE.Vector3(0.1, 0.82, 0), 0.075, o.pants ?? 0x23232a, LS, o.lod));
    p.push(paint(new THREE.BoxGeometry(0.12, 0.07, 0.24), 0x1a1410, M(-0.09, 0.035, -0.04)));
    p.push(paint(new THREE.BoxGeometry(0.12, 0.07, 0.24), 0x1a1410, M(0.09, 0.035, -0.04)));
  }
  const by = sit ? 0.0 : 0.8 + legY;
  // gövde: redingot/ceket
  const prof = [[0.2 * belly, 0], [0.22 * belly, 0.16], [0.24 * belly, 0.3], [0.23, 0.46], [0.2, 0.56], [0.08, 0.62]].map(([r, y]) => new THREE.Vector2(r, y));
  p.push(paint(new THREE.LatheGeometry(prof, S(18)), suit, M(0, by, 0, 0, 0, 0, 1, H, 0.85)));
  // gömlek ön kısmı + kravat
  p.push(paint(new THREE.SphereGeometry(0.11, S(10), S(8), 0, Math.PI * 2, 0, Math.PI / 2), shirt, M(0, by + 0.5 * H, -0.12, -Math.PI / 2 + 0.3, 0, 0, 0.8, 1, 0.5)));
  p.push(paint(new THREE.ConeGeometry(0.025, 0.14, S(4)), o.tie ?? 0x5a1414, M(0, by + 0.44 * H, -0.19, Math.PI, 0, 0)));
  // düğmeler
  if (!o.lod) for (let i = 0; i < 3; i++) p.push(paint(new THREE.SphereGeometry(0.014, S(5), S(4)), o.trim ?? 0xb08d3c, M(0, by + 0.12 + i * 0.1, -0.205 * belly)));
  // boyun + baş
  const hy = by + 0.62 * H + 0.17;
  p.push(paint(new THREE.CylinderGeometry(0.055, 0.06, 0.1, S(10)), skin, M(0, hy - 0.13, 0)));
  p.push(paint(new THREE.SphereGeometry(0.125, S(18), S(14)), skin, M(0, hy, 0, 0, 0, 0, 0.95, 1.08, 1)));
  p.push(paint(new THREE.SphereGeometry(0.022, S(8), S(6)), skin, M(0, hy - 0.01, -0.125, 0, 0, 0, 1, 1, 1.2)));
  for (const s of [-1, 1]) {
    if (!o.lod) p.push(paint(new THREE.SphereGeometry(0.03, 8, 6), skin, M(s * 0.12, hy, 0.0, 0, 0, 0, 0.5, 1, 0.8))); // kulak
    p.push(paint(new THREE.SphereGeometry(0.013, S(6), S(5)), 0x1b120c, M(s * 0.042, hy + 0.02, -0.112)));            // göz
    p.push(paint(new THREE.CapsuleGeometry(0.006, 0.03, S(2), S(4)), 0x1b120c, M(s * 0.045, hy + 0.055, -0.113, 0, 0, Math.PI / 2 + s * 0.15)));
    if (o.mustache !== false) p.push(paint(new THREE.CapsuleGeometry(0.014, 0.05, S(3), S(5)), o.mustacheColor ?? 0x1b120c, M(s * 0.03, hy - 0.04, -0.122, 0, 0, Math.PI / 2 + s * 0.35)));
  }
  // fes + püskül
  if (fez) {
    p.push(paint(new THREE.CylinderGeometry(0.085, 0.112, 0.15, S(16)), fez, M(0, hy + 0.14, 0.0, -0.08, 0, 0)));
    p.push(paint(new THREE.CylinderGeometry(0.006, 0.006, 0.02, S(4)), 0x111111, M(0, hy + 0.225, 0.0)));
    p.push(paint(new THREE.CylinderGeometry(0.004, 0.02, 0.14, S(6)), 0x111111, M(0.07, hy + 0.17, 0.04, 0, 0, 0.5)));
  }
  // kollar
  const shoulderY = by + 0.52 * H;
  const armColor = o.sleeve ?? suit;
  for (const s of [-1, 1]) {
    const sh = new THREE.Vector3(s * 0.23, shoulderY, 0);
    let el, ha;
    if (o.pose === 'raise' || (o.pose === 'mixed' && s === 1)) { el = new THREE.Vector3(s * 0.33, shoulderY + 0.25, -0.02); ha = new THREE.Vector3(s * 0.3, shoulderY + 0.52, -0.05); }
    else if (o.pose === 'clap' || o.pose === 'sit') { el = new THREE.Vector3(s * 0.27, shoulderY - 0.22, -0.12); ha = new THREE.Vector3(s * 0.05, shoulderY - 0.1, -0.32); }
    else { el = new THREE.Vector3(s * 0.28, shoulderY - 0.25, 0.02); ha = new THREE.Vector3(s * 0.27, shoulderY - 0.5, -0.04); }
    if (o.noArms) continue;
    p.push(limb(sh, el, 0.062, armColor, LS, o.lod));
    p.push(limb(el, ha, 0.055, armColor, LS, o.lod));
    p.push(paint(new THREE.SphereGeometry(0.045, S(8), S(6)), skin, M(ha.x, ha.y, ha.z)));
  }
  return { parts: p, headY: hy, shoulderY, bodyY: by };
}

// ================= KADIN SEYİRCİ =================
export function womanParts(o = {}) {
  const q = o.lod ? 0.42 : 1, S = (n, m = 3) => Math.max(m, Math.round(n * q)), LS = o.lod ? 5 : 6;
  const dress = o.dress ?? 0x2f6f8f, scarf = o.scarf ?? 0xf2ead7, skin = o.skin ?? 0xe8b896;
  const p = [];
  const sit = o.pose === 'sit';
  const skirtH = sit ? 0.0 : 0.85;
  if (!sit) {
    const prof = [[0.0, 0], [0.3, 0], [0.3, 0.05], [0.26, 0.4], [0.2, 0.8], [0.17, 0.86]].map(([r, y]) => new THREE.Vector2(r, y));
    p.push(paint(new THREE.LatheGeometry(prof, S(18)), o.skirt ?? dress, M(0, 0, 0, 0, 0, 0, 1, 1, 0.9)));
  }
  const by = skirtH;
  const prof2 = [[0.17, 0], [0.2, 0.15], [0.21, 0.32], [0.17, 0.45], [0.06, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
  p.push(paint(new THREE.LatheGeometry(prof2, S(16)), dress, M(0, by, 0, 0, 0, 0, 1, 1, 0.85)));
  p.push(paint(new THREE.CylinderGeometry(0.175, 0.175, 0.06, S(16), 1, true), o.sash ?? 0xd9a441, M(0, by + 0.04, 0, 0, 0, 0, 1, 1, 0.86)));
  const hy = by + 0.68;
  p.push(paint(new THREE.CylinderGeometry(0.045, 0.05, 0.1, S(10)), skin, M(0, hy - 0.14, 0)));
  p.push(paint(new THREE.SphereGeometry(0.115, S(16), S(12)), skin, M(0, hy, 0, 0, 0, 0, 0.94, 1.08, 1)));
  p.push(paint(new THREE.SphereGeometry(0.128, S(18), S(12), -Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.82), scarf, M(0, hy + 0.008, 0.004)));
  p.push(paint(new THREE.SphereGeometry(0.127, S(16), S(8), 0, Math.PI * 2, 0, Math.PI * 0.27), scarf, M(0, hy + 0.01, 0)));
  p.push(paint(new THREE.ConeGeometry(0.15, 0.32, S(4), 1, true), scarf, M(0, hy - 0.16, 0.1, -0.25, Math.PI / 4, 0, 1, 1, 0.35)));
  for (const s of [-1, 1]) {
    p.push(paint(new THREE.SphereGeometry(0.012, S(6), S(5)), 0x1b120c, M(s * 0.04, hy + 0.02, -0.103)));
    p.push(paint(new THREE.TorusGeometry(0.022, 0.005, S(4), S(8), Math.PI), 0x8a2a2a, M(0, hy - 0.045, -0.108, 0, 0, Math.PI)));
    const sh = new THREE.Vector3(s * 0.19, by + 0.4, 0);
    let el, ha;
    if (o.pose === 'raise') { el = new THREE.Vector3(s * 0.28, by + 0.62, -0.02); ha = new THREE.Vector3(s * 0.24, by + 0.88, -0.06); }
    else { el = new THREE.Vector3(s * 0.24, by + 0.2, -0.12); ha = new THREE.Vector3(s * 0.04, by + 0.3, -0.3); }
    p.push(limb(sh, el, 0.05, dress, LS, o.lod));
    p.push(limb(el, ha, 0.045, dress, LS, o.lod));
    p.push(paint(new THREE.SphereGeometry(0.04, S(8), S(6)), skin, M(ha.x, ha.y, ha.z)));
  }
  return { parts: p, headY: hy };
}

export function personMesh(parts, mat = MAT.vc) {
  const m = new THREE.Mesh(merge(parts), mat);
  m.castShadow = true;
  return m;
}
