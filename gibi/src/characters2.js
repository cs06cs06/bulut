// Motor 2 karakterleri: aynı iskelet ve jest sistemi (characters.js), ama
// yumuşak hatlı gövde, beş parmaklı eller, göz kapakları, iris/göz bebeği,
// kaş eğrileri, dudaklar ve ağız içi, giyim ayrıntıları ve ikincil hareketler.
import * as THREE from 'three';
import { mat, canvasTex } from './sets.js';
import { gesturePose, PERSIST, HOLD_POSE, REST, blendArm, makeItem } from './characters.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export const LOOKS = {
  yil: {
    height: 1.9, build: 0.86, belly: 0.0, skin: '#deae88', eyes: '#4a3222', nose: 1.15,
    hair: { style: 'short', color: '#231710' }, mustache: { color: '#231710', size: 1.0 },
    glasses: 'round', brows: '#231710', browThick: 1.15,
    outfits: {
      normal: { shirt: '#4f6382', sleeves: '#4f6382', pants: '#2f3542', shoes: '#1c1c1c', collar: '#e8e3d6', knit: true },
      suit: { shirt: '#24324a', sleeves: '#24324a', pants: '#24324a', shoes: '#141414', collar: '#f2f2f2', tie: '#9b2335', lapels: true },
    },
  },
  ilk: {
    height: 1.76, build: 1.18, belly: 0.75, skin: '#d29c76', eyes: '#3b2716', nose: 1.0,
    hair: { style: 'buzz', color: '#2f2117' }, beard: { color: '#2f2117' }, brows: '#2f2117', browThick: 1.2,
    outfits: {
      normal: { shirt: '#b9563d', sleeves: '#b9563d', pants: '#36465c', shoes: '#5a4030', tee: true },
      pajama: { shirt: 'stripes', sleeves: 'stripes', pants: 'stripes', shoes: '#8a5a3a' },
      coat: { shirt: '#6b4a2e', sleeves: '#6b4a2e', pants: 'stripes', shoes: '#8a5a3a', skirt: '#6b4a2e', hat: '#3a2a1a' },
    },
  },
  nec: {
    height: 1.68, build: 1.0, belly: 0.45, skin: '#e3b593', hunch: 0.16, eyes: '#5a6b78', nose: 1.25, age: 1,
    hair: { style: 'sides', color: '#e6e6e6' }, mustache: { color: '#efefef', size: 1.3 },
    glasses: 'square', brows: '#d8d8d8', browThick: 1.3,
    outfits: { normal: { shirt: '#8f7b52', sleeves: '#8f7b52', pants: '#5d554b', shoes: '#3a2e25', collar: '#f0f0f0', cardigan: true } },
  },
  rem: {
    height: 1.78, build: 1.22, belly: 0.9, skin: '#c68e66', eyes: '#2a1c12', nose: 1.2,
    hair: { style: 'short', color: '#161616' }, mustache: { color: '#161616', size: 1.6 }, brows: '#161616', browThick: 1.4,
    outfits: { normal: { shirt: '#4b4b4f', sleeves: '#e3dfd3', pants: '#3d3a36', shoes: '#1c1c1c', collar: '#e3dfd3', vest: true } },
  },
  suk: {
    height: 1.72, build: 1.15, belly: 0.8, skin: '#d8a27c', eyes: '#3b2716', nose: 1.2,
    hair: { style: 'sides', color: '#6b6b6b' }, mustache: { color: '#3a3a3a', size: 1.45 }, brows: '#3a3a3a',
    outfits: { normal: { shirt: '#2f6b45', sleeves: '#efe9da', pants: '#4a4038', shoes: '#2a2018', collar: '#efe9da' } },
  },
  hus: {
    height: 1.8, build: 1.05, belly: 0.25, skin: '#d29a70', eyes: '#2a1c12',
    hair: { style: 'short', color: '#2b2017' }, stubble: '#4a3a2c', brows: '#2b2017', cap: '#c62828',
    outfits: { normal: { shirt: '#2d4f7a', sleeves: '#2d4f7a', pants: '#2d4f7a', shoes: '#222', collar: '#e0a03a' } },
  },
  sev: {
    height: 1.67, build: 0.86, belly: 0.1, skin: '#e8bc9a', eyes: '#3d5a3c', nose: 0.85, female: true,
    hair: { style: 'bun', color: '#5a2e1c' }, brows: '#4a2618', browThick: 0.85, lips: '#a23b45', lashes: true,
    glasses: 'cat', earrings: '#d4af37',
    outfits: { normal: { shirt: '#7a1f3d', sleeves: '#7a1f3d', pants: '#d9b49a', shoes: '#2a1a1a', collar: '#f4efe6', dress: '#3b3f4a', blazer: true } },
  },
};

// --- dokular ------------------------------------------------------------------
const texCache = {};
function fabricTex(kind) {
  if (texCache[kind]) return texCache[kind];
  let t;
  if (kind === 'stripes') {
    t = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#e9f1fb'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#6f97cf'; for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 13, h);
      g.fillStyle = 'rgba(0,0,0,0.04)'; for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
    });
    t.repeat.set(3, 2);
  } else {
    // ince dokuma (kumaş) — beyaz taban, renk malzemeden gelir
    t = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) { const v = 225 + Math.floor(Math.random() * 30); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
      g.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
      if (kind === 'knit') { g.fillStyle = 'rgba(0,0,0,0.07)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h); }
    });
    t.repeat.set(kind === 'knit' ? 6 : 3, kind === 'knit' ? 6 : 3);
  }
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache[kind] = t;
  return t;
}
const cloth = (c, kind = 'cloth') => (c === 'stripes'
  ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: fabricTex('stripes'), roughness: 0.85 })
  : new THREE.MeshStandardMaterial({ color: c, map: fabricTex(kind), roughness: 0.88 }));

let shadowTex = null;
function blobShadowTex() {
  if (shadowTex) return shadowTex;
  shadowTex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  shadowTex.colorSpace = THREE.NoColorSpace;
  return shadowTex;
}

// --- geometri yardımcıları -----------------------------------------------------
function M(geo, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const sphere = (r, wS = 24, hS = 16) => new THREE.SphereGeometry(r, wS, hS);
// konik uzuv: üstte r1, altta r2, boy len (pivot üstte, aşağı uzanır)
function limb(parent, r1, r2, len, material) {
  const g = new THREE.CylinderGeometry(r1, r2, len, 18, 1, true);
  const m = M(g, material, parent, 0, -len / 2, 0);
  M(sphere(r2, 16, 12), material, parent, 0, -len, 0);
  return m;
}
function tube(points, r, material, parent, segs = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, segs, r, 8, false);
  // uçları yuvarla
  const m = M(g, material, parent);
  M(sphere(r, 8, 6), material, m, ...points[0]);
  M(sphere(r, 8, 6), material, m, ...points[points.length - 1]);
  return m;
}
function shade(hex, amt) {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, clamp(hsl.l + amt / 100, 0, 1));
  return '#' + c.getHexString();
}

// ============================================================================
export class Character {
  constructor(id, look = LOOKS[id]) {
    this.id = id;
    this.look = look;
    this.seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const S = look.height / 1.8;
    const b = look.build;
    const F = !!look.female;
    this.root = new THREE.Group();
    this.root.name = id;
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.root.scale.setScalar(S);

    this.skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.55, emissive: new THREE.Color(look.skin).multiplyScalar(0.06) });
    this.skinDark = new THREE.MeshStandardMaterial({ color: shade(look.skin, -10), roughness: 0.6 });
    this.mats = {};
    for (const [k, o] of Object.entries(look.outfits)) {
      this.mats[k] = {
        shirt: cloth(o.shirt, o.knit ? 'knit' : 'cloth'), sleeves: cloth(o.sleeves, o.knit ? 'knit' : 'cloth'),
        pants: cloth(o.pants), shoes: new THREE.MeshStandardMaterial({ color: o.shoes, roughness: 0.45 }),
        skirt: o.skirt ? cloth(o.skirt) : null, hat: o.hat ? cloth(o.hat) : null, cfg: o,
      };
    }
    const MM = this.mats.normal;

    // --- kalça ve bacaklar
    this.legLen = 0.86;
    this.hips = new THREE.Group();
    this.hips.position.y = this.legLen;
    this.body.add(this.hips);
    const hipW = F ? 0.13 : 0.115 * b;
    this.pelvis = M(sphere(0.16 * b + (F ? 0.03 : 0), 24, 14), MM.pants, this.hips, 0, 0.0, 0);
    this.pelvis.scale.set(1.12 + (F ? 0.1 : 0), 0.62, 0.78);
    this.legs = [];
    const legMat = F ? this.skin : MM.pants;
    for (const side of [1, -1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * hipW * 0.85, -0.03, 0);
      this.hips.add(thigh);
      const tm = limb(thigh, (F ? 0.07 : 0.085) * b, (F ? 0.05 : 0.064) * b, 0.42, legMat);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      thigh.add(knee);
      const sm = limb(knee, (F ? 0.05 : 0.062) * b, (F ? 0.035 : 0.048) * b, 0.39, legMat);
      // ayakkabı
      const shoe = new THREE.Group(); shoe.position.set(0, -0.405, 0.02); knee.add(shoe);
      const sh1 = M(sphere(0.05, 18, 12), MM.shoes, shoe, 0, 0.0, 0.055); sh1.scale.set(F ? 0.85 : 1.05, 0.62, 1.95);
      const sole = M(new THREE.BoxGeometry(F ? 0.085 : 0.105, 0.018, 0.25), new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.9 }), shoe, 0, -0.03, 0.05);
      if (F) M(new THREE.CylinderGeometry(0.012, 0.008, 0.05, 8), MM.shoes, shoe, 0, -0.035, -0.06);
      this.legs.push({ thigh, knee, tm, sm, shoe: sh1, sole });
    }
    // pantolon paçası (kadın: etek)
    this.dress = null;
    if (F) {
      const pts = [[0.17, 0.05], [0.2, -0.05], [0.24, -0.3], [0.27, -0.52]].map(([r, y]) => new THREE.Vector2(r * b * 1.1, y));
      this.dress = M(new THREE.LatheGeometry(pts, 28), cloth(look.outfits.normal.dress || '#333'), this.hips, 0, 0, 0);
      this.dress.material.side = THREE.DoubleSide;
      this.dress.scale.z = 0.8;
    }
    // kemer
    if (!F) {
      this.belt = M(new THREE.CylinderGeometry(0.168 * b, 0.168 * b, 0.035, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 0.5 }), this.hips, 0, 0.065, 0);
      this.belt.scale.z = 0.78;
      M(new THREE.BoxGeometry(0.04, 0.032, 0.01), new THREE.MeshStandardMaterial({ color: '#c9a64a', metalness: 0.8, roughness: 0.3 }), this.hips, 0, 0.065, 0.132 * b);
    }

    // --- gövde (torna profili)
    this.spine = new THREE.Group();
    this.spine.position.y = 0.05;
    this.hips.add(this.spine);
    const prof = F
      ? [[0.0, 0.135], [0.08, 0.125], [0.18, 0.12], [0.3, 0.145], [0.4, 0.155], [0.5, 0.165], [0.56, 0.15], [0.6, 0.1], [0.63, 0.05]]
      : [[0.0, 0.158], [0.08, 0.16], [0.2, 0.158], [0.32, 0.17], [0.44, 0.185], [0.52, 0.18], [0.58, 0.14], [0.62, 0.07], [0.64, 0.04]];
    const lp = prof.map(([y, r]) => new THREE.Vector2(r * (y > 0.4 ? Math.max(b, 0.95) : b), y));
    this.torso = M(new THREE.LatheGeometry(lp, 32), MM.shirt, this.spine);
    this.torso.scale.z = 0.7;
    // üst kapak (boyun dibi)
    M(sphere(0.05, 12, 8), MM.shirt, this.spine, 0, 0.62, 0).scale.set(1.5, 0.5, 1.2);
    if (look.belly > 0) {
      this.bellyM = M(sphere(0.15 * b * (0.7 + 0.45 * look.belly), 28, 18), MM.shirt, this.spine, 0, 0.17, 0.045 + 0.05 * look.belly);
      this.bellyM.scale.set(1.05, 0.95, 0.85);
    }
    if (F) { // göğüs hacmi
      for (const s of [-1, 1]) M(sphere(0.06, 16, 12), MM.shirt, this.spine, s * 0.06, 0.4, 0.075).scale.set(1, 0.85, 0.75);
    }
    this.details = new THREE.Group(); this.spine.add(this.details);
    this.buildClothes(MM.cfg);
    // palto eteği
    this.skirt = M(new THREE.CylinderGeometry(0.17 * b, 0.25 * b, 0.62, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.9, side: THREE.DoubleSide }), this.hips, 0, -0.22, 0);
    this.skirt.scale.z = 0.8;
    this.skirt.visible = false;

    // --- kollar ve eller
    this.arms = {};
    const tr = 0.17 * Math.max(b, 0.95) * (F ? 0.88 : 1);
    for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
      const sh = new THREE.Group();
      sh.position.set(side * (tr + 0.045), 0.53, 0);
      sh.rotation.order = 'YXZ';
      this.spine.add(sh);
      const ball = M(sphere(0.068 * b, 18, 12), MM.sleeves, sh); ball.scale.set(1, 1, 0.9);
      const um = limb(sh, 0.06 * b, 0.05 * b, 0.29, MM.sleeves);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      const fm = limb(el, 0.05 * b, 0.04 * b, 0.25, MM.sleeves);
      // manşet
      const cuff = M(new THREE.CylinderGeometry(0.043 * b, 0.043 * b, 0.025, 14), MM.sleeves, el, 0, -0.245, 0);
      const wrist = new THREE.Group(); wrist.position.y = -0.255; el.add(wrist);
      const hand = this.buildHand(wrist, side);
      const anchor = new THREE.Group(); anchor.position.set(0, -0.06, 0.0); wrist.add(anchor);
      this.arms[key] = { sh, el, um, fm, ball, cuff, wrist, hand, anchor, side };
    }

    // --- boyun ve kafa
    this.neck = M(new THREE.CylinderGeometry(0.048, 0.056, 0.13, 16), this.skin, this.spine, 0, 0.66, 0.0);
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = 0.7;
    this.headPivot.rotation.order = 'YXZ';
    this.spine.add(this.headPivot);
    this.buildHead(look);

    // --- eşyalar
    this.items = {};
    for (const k of ['key', 'gift', 'tea', 'phone', 'pan', 'card', 'paper', 'coat', 'toolbox', 'remote', 'notebook', 'clipboard', 'envelope']) {
      const it = makeItem(k);
      it.visible = false;
      it.scale.setScalar(0.92);
      this.arms.R.anchor.add(it);
      this.items[k] = it;
    }
    // temas gölgesi
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * b, 0.75 * b), new THREE.MeshBasicMaterial({ map: blobShadowTex(), transparent: true, depthWrite: false, opacity: 0.7 }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.006;
    this.blob.renderOrder = 1;
    this.root.add(this.blob);

    this.outfit = 'normal';
    this.root.traverse((o) => { if (o.isMesh && o !== this.blob) o.castShadow = true; });
  }

  buildHand(wrist, side) {
    const H = new THREE.Group();
    H.position.y = -0.005;
    wrist.add(H);
    const palm = M(sphere(0.04, 16, 12), this.skin, H, 0, -0.045, 0.002);
    palm.scale.set(0.95, 1.15, 0.5);
    const fingers = [];
    const fx = [-0.024, -0.008, 0.008, 0.024];
    const fl = [0.036, 0.042, 0.04, 0.032];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Group(); p.position.set(fx[i] * -side, -0.085, 0.004); H.add(p);
      const seg1 = M(new THREE.CapsuleGeometry(0.0085, fl[i] * 0.55, 4, 8), this.skin, p, 0, -fl[i] * 0.3, 0);
      const j = new THREE.Group(); j.position.y = -fl[i] * 0.6; p.add(j);
      M(new THREE.CapsuleGeometry(0.0078, fl[i] * 0.45, 4, 8), this.skin, j, 0, -fl[i] * 0.25, 0);
      fingers.push({ p, j, seg1 });
    }
    const thumb = new THREE.Group(); thumb.position.set(0.034 * -side, -0.035, 0.012); H.add(thumb);
    thumb.rotation.z = -side * 0.7; thumb.rotation.x = -0.4;
    M(new THREE.CapsuleGeometry(0.0095, 0.032, 4, 8), this.skin, thumb, 0, -0.024, 0);
    return { H, fingers, thumb };
  }

  buildClothes(o) {
    const d = this.details;
    d.clear();
    const b = this.look.build;
    const F = !!this.look.female;
    const front = 0.17 * Math.max(b, 0.95) * 0.7;
    const colMat = o.collar ? cloth(o.collar) : null;
    if (o.lapels) {
      // takım: gövde yüzeyine yaslanan bir "plaka" üzerinde gömlek V'si, kravat, yakalar, mendil
      const plate = new THREE.Group();
      plate.position.set(0, 0.5, 0.18 * Math.max(b, 0.95) * 0.7 + 0.008);
      plate.rotation.x = -0.17;
      d.add(plate);
      let zl = 0;
      const tri = (pts, color) => {
        const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1] - 0.5); for (const p of pts.slice(1)) sh.lineTo(p[0], p[1] - 0.5); sh.closePath();
        zl += 0.0025;
        return M(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }), plate, 0, 0, zl);
      };
      tri([[-0.05, 0.6], [0.05, 0.6], [0, 0.39]], o.collar);
      tri([[-0.013, 0.585], [0.013, 0.585], [0.021, 0.41], [0, 0.385], [-0.021, 0.41]], o.tie);
      for (const s2 of [-1, 1]) {
        tri([[s2 * 0.048, 0.61], [s2 * 0.09, 0.6], [s2 * 0.07, 0.5], [s2 * 0.006, 0.385]], shade(o.shirt, -10));
        tri([[s2 * 0.01, 0.605], [s2 * 0.05, 0.605], [s2 * 0.028, 0.56]], o.collar);
      }
      M(new THREE.BoxGeometry(0.026, 0.02, 0.012), new THREE.MeshStandardMaterial({ color: o.tie, roughness: 0.5 }), plate, 0, 0.087, 0.006);
      tri([[0.06, 0.475], [0.105, 0.475], [0.085, 0.452]], '#f2f2f2');
      for (let i = 0; i < 2; i++) M(sphere(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: '#111' }), d, 0.0, 0.3 - i * 0.08, front + 0.015);
    } else if (o.tee) {
      M(new THREE.TorusGeometry(0.058, 0.009, 8, 24), cloth(shade(o.shirt, -8)), d, 0, 0.615, 0.01).rotation.x = Math.PI / 2 - 0.25;
    } else if (o.vest) {
      for (const s of [-1, 1]) {
        const fl = M(new THREE.BoxGeometry(0.05, 0.08, 0.01), colMat, d, s * 0.04, 0.585, front - 0.005);
        fl.rotation.z = s * 0.5; fl.rotation.x = -0.4;
      }
      for (let i = 0; i < 4; i++) M(sphere(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: '#222' }), d, 0, 0.47 - i * 0.09, front + 0.014 + (i > 1 ? 0.03 * this.look.belly : 0));
    } else if (o.blazer) {
      // bluz yakası + ceket yakaları + kolye
      const v = M(new THREE.PlaneGeometry(0.1, 0.16), new THREE.MeshStandardMaterial({ color: o.collar, roughness: 0.6, side: THREE.DoubleSide }), d, 0, 0.53, front + 0.01);
      v.rotation.x = -0.3;
      for (const s of [-1, 1]) {
        const lp = M(new THREE.BoxGeometry(0.05, 0.22, 0.012), cloth(shade(o.shirt, -6)), d, s * 0.055, 0.47, front + 0.006);
        lp.rotation.z = s * 0.3; lp.rotation.x = -0.2;
      }
      const neck = M(new THREE.TorusGeometry(0.06, 0.004, 6, 28), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.9, roughness: 0.25 }), d, 0, 0.6, 0.02);
      neck.rotation.x = Math.PI / 2 - 0.5;
      M(sphere(0.012, 10, 8), new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.2 }), d, 0, 0.555, front + 0.025);
      for (let i = 0; i < 2; i++) M(sphere(0.009, 8, 6), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.8, roughness: 0.3 }), d, 0.0, 0.3 - i * 0.09, front + 0.02);
    } else if (o.cardigan) {
      for (let i = 0; i < 5; i++) M(sphere(0.009, 8, 6), new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 0.4 }), d, 0, 0.52 - i * 0.09, front + 0.012 + (i > 2 ? 0.03 * this.look.belly : 0));
      for (const s of [-1, 1]) {
        const fl = M(new THREE.BoxGeometry(0.05, 0.075, 0.01), colMat, d, s * 0.038, 0.59, front - 0.006);
        fl.rotation.z = s * 0.55; fl.rotation.x = -0.4;
      }
      for (const s of [-1, 1]) M(new THREE.BoxGeometry(0.07, 0.07, 0.008), cloth(shade(o.shirt, -6)), d, s * 0.075, 0.2, front + 0.01 + 0.03 * this.look.belly);
    } else {
      // gömlek yakası + düğmeler
      if (colMat) {
        for (const s of [-1, 1]) {
          const fl = M(new THREE.BoxGeometry(0.055, 0.075, 0.01), colMat, d, s * 0.04, 0.59, front - 0.004);
          fl.rotation.z = s * 0.55; fl.rotation.x = -0.4;
        }
      }
      if (!o.knit) for (let i = 0; i < 4; i++) M(sphere(0.007, 8, 6), new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.3 }), d, 0, 0.5 - i * 0.1, front + 0.01);
    }
  }

  buildHead(look) {
    const R = 0.135;
    this.R = R;
    const H = new THREE.Group();
    H.position.y = R * 1.0;
    this.headPivot.add(H);
    this.head = H;
    const skin = this.skin;
    const F = !!look.female;
    // kafatası + çene + yanaklar
    const skull = M(sphere(R, 40, 28), skin, H); skull.scale.set(0.9, 1.1, 0.98);
    const jaw = M(sphere(R * 0.78, 32, 20), skin, H, 0, -R * 0.42, R * 0.18); jaw.scale.set(F ? 0.92 : 1.0, 0.82, 0.9);
    for (const s of [-1, 1]) M(sphere(R * 0.32, 16, 12), skin, H, s * R * 0.5, -R * 0.2, R * 0.62).scale.set(1, 0.85, 0.8);
    // kulaklar
    for (const s of [-1, 1]) {
      const ear = M(sphere(0.032, 16, 12), skin, H, s * R * 0.9, -0.005, -0.005); ear.scale.set(0.45, 1.05, 0.75);
      M(sphere(0.018, 10, 8), this.skinDark, ear, s * 0.02, 0, 0.004).scale.set(0.6, 0.8, 0.5);
      if (look.earrings) M(sphere(0.008, 10, 8), new THREE.MeshStandardMaterial({ color: look.earrings, metalness: 0.9, roughness: 0.2 }), H, s * R * 0.92, -0.045, 0.0);
    }
    // burun
    const nz = look.nose || 1;
    const nose = new THREE.Group(); nose.position.set(0, -0.005, R * 0.93); H.add(nose);
    const bridge = M(new THREE.CapsuleGeometry(0.011 * nz, 0.03 * nz, 4, 10), skin, nose, 0, 0.0, 0.006); bridge.rotation.x = 0.35;
    M(sphere(0.018 * nz, 14, 10), skin, nose, 0, -0.022 * nz, 0.016 * nz).scale.set(1.15, 0.9, 1);
    for (const s of [-1, 1]) M(sphere(0.011 * nz, 10, 8), skin, nose, s * 0.014 * nz, -0.026 * nz, 0.006);
    // gözler
    this.eyes = [];
    const white = new THREE.MeshStandardMaterial({ color: '#f6f3ee', roughness: 0.18 });
    const irisM = new THREE.MeshStandardMaterial({ color: look.eyes || '#3b2716', roughness: 0.3 });
    const pupilM = new THREE.MeshBasicMaterial({ color: '#050505' });
    const lidM = skin;
    const lashM = new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.6 });
    const er = 0.022;
    for (const s of [-1, 1]) {
      const socket = new THREE.Group(); socket.position.set(s * 0.043, 0.022, R * 0.8); H.add(socket);
      const ball = new THREE.Group(); socket.add(ball);
      M(sphere(er, 24, 18), white, ball);
      const iris = M(new THREE.CircleGeometry(er * 0.55, 24), irisM, ball, 0, 0, er * 0.985);
      M(new THREE.CircleGeometry(er * 0.26, 18), pupilM, ball, 0, 0, er * 0.99);
      const hl = M(sphere(er * 0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), socket, -er * 0.25, er * 0.3, er * 1.0);
      hl.castShadow = false;
      // göz kapakları: yarım küre kabuklar
      const upper = new THREE.Group(); socket.add(upper);
      M(new THREE.SphereGeometry(er * 1.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidM, upper);
      const lower = new THREE.Group(); socket.add(lower);
      M(new THREE.SphereGeometry(er * 1.1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidM, lower);
      if (look.lashes) {
        const lash = M(new THREE.TorusGeometry(er * 1.12, 0.0025, 4, 18, Math.PI), lashM, upper, 0, 0, 0);
        lash.rotation.set(0, 0, 0);
      }
      this.eyes.push({ socket, ball, upper, lower, hl, s });
    }
    // kaşlar (eğri tüp)
    this.brows = [];
    const bm = new THREE.MeshStandardMaterial({ color: look.brows || '#333', roughness: 0.9 });
    const th = 0.0058 * (look.browThick || 1);
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(s * 0.045, 0.062, R * 0.86); H.add(g);
      tube([[-0.026 * s, -0.003, -0.004], [-0.008 * s, 0.004, 0.003], [0.012 * s, 0.004, 0.002], [0.028 * s, -0.004, -0.006]], th, bm, g, 16);
      this.brows.push({ g, s });
    }
    // ağız: iç + dişler + dudaklar (dört parça, köşeleri hareketli)
    const mouth = new THREE.Group(); mouth.position.set(0, -0.062, R * 0.86); H.add(mouth);
    this.mouth = mouth;
    this.cavity = M(sphere(0.03, 24, 14), new THREE.MeshStandardMaterial({ color: '#3a0d10', roughness: 0.8 }), mouth, 0, 0, 0.004);
    this.teeth = M(new THREE.BoxGeometry(0.032, 0.008, 0.006), new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.3 }), mouth, 0, 0.004, 0.018);
    this.tongue = M(sphere(0.014, 12, 8), new THREE.MeshStandardMaterial({ color: '#9b3b3b', roughness: 0.6 }), mouth, 0, -0.008, 0.008);
    this.tongue.scale.set(1.3, 0.5, 1);
    const lipM = new THREE.MeshStandardMaterial({ color: look.lips || shade(look.skin, -14), roughness: 0.45 });
    this.lips = [];
    for (const up of [1, -1]) for (const s of [-1, 1]) {
      const p = new THREE.Group(); p.position.set(0, 0, 0.02); mouth.add(p);
      const m = M(new THREE.CapsuleGeometry(up > 0 ? 0.0052 : 0.0062, 0.016, 4, 10), lipM, p, s * 0.009, 0, 0);
      m.rotation.z = Math.PI / 2;
      this.lips.push({ p, m, up, s });
    }
    // sakal, bıyık, kirli sakal
    if (look.beard) {
      const bmat = new THREE.MeshStandardMaterial({ color: look.beard.color, roughness: 1.0 });
      const beard = M(new THREE.SphereGeometry(R * 1.02, 32, 16, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.55, Math.PI * 0.33), bmat, H, 0, -R * 0.08, R * 0.04);
      beard.scale.set(0.98, 1.1, 1.0);
      const chin = M(sphere(R * 0.62, 24, 14), bmat, H, 0, -R * 0.62, R * 0.28); chin.scale.set(1.0, 0.65, 0.8);
      tube([[-0.034, -0.042, R * 0.94], [-0.012, -0.036, R * 1.0], [0.012, -0.036, R * 1.0], [0.034, -0.042, R * 0.94]], 0.0075, bmat, H, 16);
      mouth.position.z = R * 0.92; mouth.scale.setScalar(1.05);
    }
    if (look.mustache) {
      const ms = look.mustache.size || 1;
      const mm = new THREE.MeshStandardMaterial({ color: look.mustache.color, roughness: 0.95 });
      tube([[-0.034 * ms, -0.054, R * 0.88], [-0.016, -0.04, R * 0.99], [0, -0.04, R * 1.0], [0.016, -0.04, R * 0.99], [0.034 * ms, -0.054, R * 0.88]], 0.0072 * ms, mm, H, 20);
    }
    if (look.stubble) {
      const st = M(new THREE.SphereGeometry(R * 1.008, 32, 14, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.56, Math.PI * 0.3),
        new THREE.MeshStandardMaterial({ color: look.stubble, roughness: 1, transparent: true, opacity: 0.45 }), H, 0, -R * 0.06, R * 0.03);
      st.scale.set(0.95, 1.08, 1.0);
    }
    // saç
    const hm = new THREE.MeshStandardMaterial({ color: look.hair.color, roughness: 0.75 });
    const st = look.hair.style;
    if (st === 'short' || st === 'buzz') {
      const cover = st === 'short' ? 0.4 : 0.36;
      const cap = M(new THREE.SphereGeometry(R * (st === 'short' ? 1.06 : 1.02), 36, 18, 0, Math.PI * 2, 0, Math.PI * cover), hm, H, 0, 0.008, -0.004);
      cap.scale.set(0.92, 1.12, 1.0); cap.rotation.x = -0.32;
      const back = M(new THREE.SphereGeometry(R * 1.035, 36, 16, Math.PI * 1.08, Math.PI * 0.84, Math.PI * 0.22, Math.PI * 0.36), hm, H);
      back.scale.set(0.92, 1.1, 1.0);
      for (const s of [-1, 1]) M(new THREE.BoxGeometry(0.012, 0.045, 0.03), hm, H, s * R * 0.86, 0.02, 0.025);
      if (st === 'short') {
        // yumuşak yan ayrım: tepede hafif kabarıklık
        const puff = M(sphere(R * 0.62, 28, 16), hm, H, -R * 0.12, R * 0.62, R * 0.12);
        puff.scale.set(1.35, 0.42, 1.25); puff.rotation.z = 0.12;
      }
    } else if (st === 'sides') {
      const ring = M(new THREE.SphereGeometry(R * 1.035, 36, 12, Math.PI * 1.02, Math.PI * 0.96, Math.PI * 0.4, Math.PI * 0.2), hm, H);
      ring.scale.set(0.92, 1.1, 1.0);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) M(sphere(0.022, 10, 8), hm, H, s * R * 0.84, 0.02 - i * 0.014, -0.025 + i * 0.012).scale.set(0.7, 1.0, 1.2);
    } else if (st === 'bun') {
      const cap = M(new THREE.SphereGeometry(R * 1.07, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), hm, H, 0, 0.004, -0.006);
      cap.scale.set(0.95, 1.12, 1.02);
      const bun = M(sphere(0.06, 24, 16), hm, H, 0, R * 0.95, -R * 0.65);
      for (let i = 0; i < 5; i++) M(new THREE.TorusGeometry(0.045, 0.012, 8, 20), hm, bun, 0, 0, 0).rotation.set(i * 0.6, i * 0.9, 0);
      // alın perçemi
      const fr = M(new THREE.CapsuleGeometry(0.03, 0.09, 4, 12), hm, H, -R * 0.35, R * 0.78, R * 0.6);
      fr.rotation.set(0.2, 0, 1.25);
      for (const s of [-1, 1]) M(new THREE.CapsuleGeometry(0.02, 0.08, 4, 10), hm, H, s * R * 0.88, -0.01, 0.0).rotation.z = s * 0.1;
    }
    // gözlük
    if (look.glasses) {
      const gm = new THREE.MeshStandardMaterial({ color: look.glasses === 'cat' ? '#5a1a2a' : '#151515', roughness: 0.35, metalness: 0.2 });
      const lens = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.0 });
      for (const s of [-1, 1]) {
        let rim;
        if (look.glasses === 'round') rim = M(new THREE.TorusGeometry(0.031, 0.0035, 8, 32), gm, H, s * 0.045, 0.02, R * 0.98);
        else {
          const sh = new THREE.Shape(); const w = 0.034, h2 = look.glasses === 'cat' ? 0.024 : 0.026, r = 0.01;
          sh.moveTo(-w + r, -h2); sh.lineTo(w - r, -h2); sh.quadraticCurveTo(w, -h2, w, -h2 + r); sh.lineTo(w, h2 - r);
          sh.quadraticCurveTo(w + (look.glasses === 'cat' ? 0.01 * s : 0), h2 + (look.glasses === 'cat' ? 0.008 : 0), w - r, h2);
          sh.lineTo(-w + r, h2); sh.quadraticCurveTo(-w, h2, -w, h2 - r); sh.lineTo(-w, -h2 + r); sh.quadraticCurveTo(-w, -h2, -w + r, -h2);
          const hole = new THREE.Path(); const iw = w - 0.005, ih = h2 - 0.005;
          hole.moveTo(-iw, -ih); hole.lineTo(iw, -ih); hole.lineTo(iw, ih); hole.lineTo(-iw, ih); hole.lineTo(-iw, -ih);
          sh.holes.push(hole);
          rim = M(new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false }), gm, H, s * 0.045, 0.02, R * 0.97);
          if (s < 0 && look.glasses === 'cat') rim.scale.x = -1;
        }
        const l = M(new THREE.CircleGeometry(0.03, 20), lens, H, s * 0.045, 0.02, R * 0.985); l.castShadow = false;
        const temple = M(new THREE.BoxGeometry(0.004, 0.004, 0.13), gm, H, s * 0.083, 0.024, R * 0.4);
        temple.rotation.y = s * 0.08;
      }
      M(new THREE.BoxGeometry(0.022, 0.004, 0.004), gm, H, 0, 0.026, R * 0.995);
    }
    // şapka (palto ile) ve kasket
    this.hat = new THREE.Group(); this.hat.position.y = R * 0.8; H.add(this.hat);
    const hatM = new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.8 });
    M(new THREE.CylinderGeometry(0.23, 0.23, 0.014, 32), hatM, this.hat);
    M(new THREE.CylinderGeometry(0.135, 0.15, 0.14, 28), hatM, this.hat, 0, 0.075, 0);
    M(new THREE.CylinderGeometry(0.151, 0.151, 0.03, 28), new THREE.MeshStandardMaterial({ color: '#6b2a2a', roughness: 0.6 }), this.hat, 0, 0.022, 0);
    this.hat.visible = false;
    if (look.cap) {
      const cm = new THREE.MeshStandardMaterial({ color: look.cap, roughness: 0.7 });
      M(new THREE.SphereGeometry(R * 1.08, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.47), cm, H, 0, 0.012, 0);
      const brim = M(new THREE.BoxGeometry(0.19, 0.012, 0.11), cm, H, 0, 0.06, R * 0.95); brim.rotation.x = 0.15;
    }
  }

  setOutfit(name) {
    if (this.outfit === name || !this.mats[name]) return;
    this.outfit = name;
    const Mt = this.mats[name];
    this.torso.material = Mt.shirt;
    if (this.bellyM) this.bellyM.material = Mt.shirt;
    this.pelvis.material = Mt.pants;
    if (!this.look.female) for (const l of this.legs) { l.tm.material = Mt.pants; l.sm.material = Mt.pants; }
    for (const l of this.legs) l.shoe.material = Mt.shoes;
    for (const a of Object.values(this.arms)) {
      for (const m of [a.um, a.fm, a.ball, a.cuff]) m.material = Mt.sleeves;
      a.um.parent.children.forEach((c) => { if (c.isMesh && c.geometry.type === 'SphereGeometry' && c !== a.ball) c.material = Mt.sleeves; });
      a.fm.parent.children.forEach((c) => { if (c.isMesh && c.geometry.type === 'SphereGeometry') c.material = Mt.sleeves; });
    }
    this.skirt.visible = !!Mt.skirt;
    if (Mt.skirt) this.skirt.material = Mt.skirt;
    this.hat.visible = !!Mt.hat;
    this.buildClothes(Mt.cfg);
    this.details.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  setFingers(hand, mode, w) {
    // mode: relaxed | point | open | fist | two | three
    const curl = { relaxed: [0.5, 0.55, 0.6, 0.65], point: [0.05, 1.4, 1.5, 1.5], open: [0.08, 0.08, 0.1, 0.12], fist: [1.5, 1.5, 1.5, 1.5], two: [0.05, 0.08, 1.45, 1.5], three: [0.05, 0.08, 0.1, 1.5], hold: [1.0, 1.05, 1.1, 1.15] }[mode] || [0.5, 0.55, 0.6, 0.65];
    const base = [0.5, 0.55, 0.6, 0.65];
    hand.fingers.forEach((f, i) => {
      const c = lerp(base[i], curl[i], w);
      f.p.rotation.x = c * 0.9;
      f.j.rotation.x = c * 0.8;
    });
    hand.thumb.rotation.x = -0.4 - (mode === 'fist' || mode === 'hold' ? 0.5 * w : 0);
  }

  update(st) {
    const { t } = st;
    this.root.visible = st.visible;
    if (!st.visible) return;
    this.setOutfit(st.outfit || 'normal');
    this.root.position.set(st.x, st.y, st.z);
    this.root.rotation.y = st.yaw;
    for (const [k, it] of Object.entries(this.items)) it.visible = st.hold === k || (k === 'phone' && st.pose === 'phone');
    const look = this.look;
    const sit = st.sit;
    const sitH = st.sitH ?? 0.46;
    const floor = sitH < 0.3;
    this.blob.visible = st.y < 0.05;
    this.blob.material.opacity = 0.7 - 0.3 * sit;

    // --- bacaklar, kalça, yürüyüş
    let hipY = this.legLen, bob = 0, lean = look.hunch || 0, sway = 0, twist = 0;
    const legRot = [[0, 0], [0, 0]];
    let armSwing = 0;
    if (st.walking) {
      const run = (st.speed || 1.2) > 2.2;
      const sneaky = st.pose === 'tiptoe';
      const cyc = st.phase / (run ? 1.6 : 1.05) * Math.PI * 2;
      const amp = run ? 0.75 : sneaky ? 0.35 : 0.48;
      for (let i = 0; i < 2; i++) {
        const ph = cyc + i * Math.PI;
        legRot[i][0] = -Math.sin(ph) * amp;
        legRot[i][1] = Math.max(0, Math.sin(ph - 1.2)) * (run ? 1.25 : 0.75);
      }
      bob = Math.abs(Math.sin(cyc)) * (run ? 0.055 : 0.022);
      armSwing = Math.sin(cyc) * (run ? 0.9 : 0.38);
      lean += run ? 0.2 : 0.035;
      sway = Math.sin(cyc) * 0.018;
      twist = Math.sin(cyc) * 0.09;
    } else {
      // dururken ağırlık aktarımı
      sway = Math.sin(t * 0.55 + this.seed) * 0.012 * (1 - sit);
    }
    if (sit > 0) {
      const thighSit = -Math.PI / 2 + (floor ? 0.12 : 0);
      const kneeSit = floor ? 0.12 : Math.PI / 2 - 0.05;
      for (let i = 0; i < 2; i++) {
        legRot[i][0] = lerp(legRot[i][0], thighSit, sit);
        legRot[i][1] = lerp(legRot[i][1], kneeSit, sit);
      }
      hipY = lerp(this.legLen, sitH + 0.08, smooth(sit));
      lean = lerp(lean, floor ? -0.12 : -0.05, sit);
    }

    // --- kollar: eşya + kalıcı poz + jestler (characters.js tablosu)
    const extra = { pitch: 0, yaw: 0, tilt: 0, lean: 0, shrug: 0, jump: 0, bounce: 0 };
    const applyExtra = (p, w) => { for (const k of Object.keys(extra)) if (p[k]) extra[k] += p[k] * w; };
    let baseR = REST, baseL = REST;
    const hp = st.hold && HOLD_POSE[st.hold];
    if (hp) { if (hp.R) baseR = hp.R; if (hp.L) baseL = hp.L; applyExtra(hp, 1); }
    const blendPersist = (name, w) => {
      const p = PERSIST[name];
      if (!p || w <= 0) return;
      if (p.R) baseR = blendArm(baseR, p.R, w);
      if (p.L) baseL = blendArm(baseL, p.L, w);
      applyExtra(p, w);
    };
    blendPersist(st.pose, st.poseW);
    blendPersist(st.prevPose, 1 - st.poseW);
    let R = { ...baseR }, L = { ...baseL };
    let fingerR = st.hold ? 'hold' : 'relaxed', fingerL = 'relaxed', fwR = st.hold ? 1 : 0, fwL = 0;
    if (st.talking && !st.gestures.length && !st.hold && !st.pose && sit < 0.5 && !st.walking) {
      const p = gesturePose('talk', t);
      R = blendArm(R, p.R, 0.65);
      fingerR = 'open'; fwR = 0.4;
    }
    let gw = 0;
    const FING = { point: 'point', raise: 'point', count1: 'point', count2: 'two', count3: 'three', present: 'open', stop: 'open', wave: 'open', shrug: 'open', explain: 'open', flail: 'open', hush: 'point', bell: 'open', heart: 'open', facepalm: 'open', shake_key: 'hold', write: 'hold' };
    for (const g of st.gestures) {
      const p = gesturePose(g.g, g.local);
      const w = g.w;
      if (p.R) { R = blendArm(R, p.R, w); if (FING[g.g] && !st.hold) { fingerR = FING[g.g]; fwR = w; } }
      if (p.L) { L = blendArm(L, p.L, w); if (FING[g.g]) { fingerL = FING[g.g] === 'point' ? 'relaxed' : FING[g.g]; fwL = w; } }
      applyExtra(p, w);
      gw = Math.max(gw, w);
    }
    if (st.walking && gw < 0.5 && !st.pose && !hp) {
      R = { ...R, sx: R.sx + armSwing };
      L = { ...L, sx: L.sx - armSwing };
    }
    // dinlerken / dururken hafif kol nefesi
    const idle = Math.sin(t * 0.9 + this.seed) * 0.02;
    for (let i = 0; i < 2; i++) {
      this.legs[i].thigh.rotation.x = legRot[i][0];
      this.legs[i].knee.rotation.x = legRot[i][1];
      this.legs[i].thigh.rotation.z = (i ? -1 : 1) * sway * 0.6 * (1 - sit);
    }
    const jumpY = extra.jump > 0 ? Math.sin(clamp(st.jumpT || 0, 0, 1) * Math.PI) * 0.18 * extra.jump : 0;
    const breath = Math.sin(t * 1.9 + this.seed) * (st.sleep ? 0.02 : 0.009);
    this.hips.position.set(sway * (1 - sit), hipY + bob + jumpY + extra.bounce, sit > 0 ? lerp(0, floor ? -0.05 : -0.12, sit) : 0);
    this.hips.rotation.y = twist * 0.5;
    this.spine.rotation.set(lean + extra.lean, -twist * 0.8, -sway * 1.2);
    this.torso.scale.set(1 + breath * 0.5, 1 + breath, 0.7 + breath * 0.6);
    const setArm = (a, p, mirror) => {
      a.sh.rotation.set(p.sx + idle, mirror * p.sy, mirror * p.sz);
      a.el.rotation.x = p.ex;
      a.wrist.rotation.x = clamp(-p.ex * 0.12, -0.3, 0.3);
    };
    setArm(this.arms.R, R, 1);
    setArm(this.arms.L, L, -1);
    this.setFingers(this.arms.R.hand, fingerR, fwR);
    this.setFingers(this.arms.L.hand, fingerL, fwL);
    const shrug = extra.shrug * 0.045;
    this.arms.R.sh.position.y = 0.53 + shrug;
    this.arms.L.sh.position.y = 0.53 + shrug;

    // --- kafa: bakış + konuşurken vurgu başı
    const talkNod = st.talking ? (Math.sin(t * 2.7 + this.seed) * 0.025 + (st.mouthD || 0) * 0.05) : 0;
    const hy = clamp(st.lookYaw, -1.1, 1.1) * 0.82 + extra.yaw;
    const hpch = clamp(st.lookPitch, -0.5, 0.5) * 0.85 + extra.pitch + (st.emo === 'sad' ? 0.12 : 0) + (st.emo === 'tired' ? 0.06 : 0) + (st.sleep ? 0.45 : 0) + talkNod;
    const tilt = extra.tilt + (st.sleep ? 0.35 : 0) + (st.talking ? Math.sin(t * 1.7 + this.seed) * 0.035 : Math.sin(t * 0.6 + this.seed) * 0.015);
    this.headPivot.rotation.set(hpch - lean * 0.6, hy, tilt);

    // --- gözler: hedefe kalan açıyı göz kapatır + küçük sıçramalar (sakkad)
    const E = st.emo || 'neutral';
    const resid = clamp(st.lookYaw - hy, -0.4, 0.4);
    const sk = Math.floor(t / (0.9 + (this.seed % 5) * 0.15));
    const sx = (hash(sk + this.seed) - 0.5) * 0.12, sy2 = (hash(sk * 1.7 + this.seed) - 0.5) * 0.08;
    const gazeY = resid + sx, gazeX = clamp(st.lookPitch * 0.15, -0.2, 0.2) + sy2;
    const openBase = { tired: 0.55, smug: 0.62, serious: 0.82, angry: 0.78, surprised: 1.15, scared: 1.2, happy: 0.85, sad: 0.75 }[E] ?? 0.95;
    const open = st.sleep ? 0 : st.blink ? 0.02 : openBase;
    for (const e of this.eyes) {
      e.ball.rotation.set(gazeX, gazeY, 0);
      // üst kapak: açık → yukarı kıvrık (-1.25), kapalı → +0.25
      e.upper.rotation.x = lerp(0.3, -1.3, clamp(open, 0, 1.2) / 1.2) - (E === 'angry' ? -0.15 : 0);
      e.upper.rotation.z = e.s * (E === 'sad' ? -0.25 : E === 'angry' ? 0.22 : 0);
      e.lower.rotation.x = lerp(-0.15, 0.55, clamp(open, 0, 1)) + (E === 'happy' ? -0.2 : 0);
      e.hl.visible = open > 0.2;
    }
    // kaşlar
    const browCfg = {
      neutral: [0, 0], happy: [0.006, -0.06], angry: [-0.008, 0.32], surprised: [0.016, -0.05], sad: [0.004, -0.32],
      smug: [0.004, 0.1], scared: [0.014, -0.28], tired: [-0.004, -0.1], serious: [-0.005, 0.15],
    }[E] || [0, 0];
    const speechLift = st.talking ? (st.mouth || 0) * 0.003 : 0;
    this.brows.forEach((bw, i) => {
      let dy = browCfg[0] + speechLift, rz = browCfg[1];
      if (E === 'smug' && i === 1) { dy += 0.01; rz = -0.12; }
      bw.g.position.y = 0.062 + dy;
      bw.g.rotation.z = bw.s * -rz;
    });
    // --- ağız: açıklık (env), genişlik (wid), yuvarlaklık (rnd) + duygu köşeleri
    const baseOpen = { surprised: 0.4, scared: 0.3 }[E] ?? 0;
    const op = clamp(Math.max(baseOpen, (st.mouth || 0) * 1.08), 0, 1);
    const rnd = st.rnd || 0, wid = st.wid || 0;
    const smile = { happy: 1, smug: 0.6, angry: -0.5, sad: -0.7, scared: -0.3, tired: -0.2, serious: -0.15 }[E] ?? 0.05;
    const width = clamp(1.0 + wid * 0.35 - rnd * 0.35 + smile * 0.18, 0.6, 1.5);
    this.cavity.scale.set(width * 0.95, 0.12 + op * 0.95 * (1 + rnd * 0.2), 0.45);
    this.teeth.visible = op > 0.12;
    this.teeth.position.y = 0.002 + op * 0.012;
    this.tongue.position.y = -0.006 - op * 0.012;
    for (const lp of this.lips) {
      const yoff = lp.up > 0 ? 0.003 + op * 0.016 : -0.003 - op * 0.019;
      lp.p.position.set(0, yoff, 0.021 + rnd * 0.004);
      lp.m.position.x = lp.s * 0.0095 * width;
      lp.m.scale.y = width * 0.95;
      // köşe kıvrımı (gülümseme yukarı, asık aşağı)
      lp.m.rotation.z = Math.PI / 2 + lp.s * (smile * 0.22 * (lp.up > 0 ? 1 : 0.8)) - lp.s * lp.up * op * 0.15;
    }
  }
}
