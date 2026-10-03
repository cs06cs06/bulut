// Karakterler: ilkel geometrilerden kurulmuş, iskeletli "kukla"lar.
import * as THREE from 'three';
import { mat, box, sph, cyl, canvasTex, keyMesh } from './sets.js';

const SKIN = '#e2b48f';

export const LOOKS = {
  yil: {
    height: 1.9, build: 0.86, belly: 0.0, skin: '#e3b28c',
    hair: { style: 'short', color: '#2b1d14' }, mustache: { color: '#2b1d14', size: 1.1 },
    glasses: 'round', brows: '#2b1d14',
    outfits: { normal: { torso: '#4f6382', arms: '#4f6382', legs: '#2f3542', shoes: '#1c1c1c', collar: '#e8e3d6' } },
  },
  ilk: {
    height: 1.76, build: 1.2, belly: 0.75, skin: '#d9a17a',
    hair: { style: 'buzz', color: '#3a281c' }, beard: { color: '#3a281c' }, brows: '#3a281c',
    outfits: {
      normal: { torso: '#b9563d', arms: '#b9563d', legs: '#36465c', shoes: '#5a4030' },
      pajama: { torso: 'stripes', arms: 'stripes', legs: 'stripes', shoes: '#8a5a3a' },
      coat: { torso: '#6b4a2e', arms: '#6b4a2e', legs: 'stripes', shoes: '#8a5a3a', skirt: '#6b4a2e', hat: '#3a2a1a' },
    },
  },
  nec: {
    height: 1.68, build: 1.0, belly: 0.45, skin: '#e6b998', hunch: 0.18,
    hair: { style: 'sides', color: '#e9e9e9' }, mustache: { color: '#efefef', size: 1.25 },
    glasses: 'square', brows: '#dddddd',
    outfits: { normal: { torso: '#8f7b52', arms: '#8f7b52', legs: '#5d554b', shoes: '#3a2e25', collar: '#f0f0f0' } },
  },
  rem: {
    height: 1.78, build: 1.22, belly: 0.9, skin: '#c99068',
    hair: { style: 'short', color: '#1b1b1b' }, mustache: { color: '#1b1b1b', size: 1.6 }, brows: '#1b1b1b',
    outfits: { normal: { torso: '#4b4b4f', arms: '#e3dfd3', legs: '#3d3a36', shoes: '#1c1c1c', collar: '#e3dfd3' } },
  },
  suk: {
    height: 1.72, build: 1.15, belly: 0.8, skin: '#d8a27c',
    hair: { style: 'sides', color: '#6b6b6b' }, mustache: { color: '#3a3a3a', size: 1.45 }, brows: '#3a3a3a',
    outfits: { normal: { torso: '#2f6b45', arms: '#efe9da', legs: '#4a4038', shoes: '#2a2018', collar: '#efe9da' } },
  },
  hus: {
    height: 1.8, build: 1.05, belly: 0.25, skin: '#d29a70',
    hair: { style: 'short', color: '#2b2017' }, stubble: '#4a3a2c', brows: '#2b2017',
    cap: '#c62828',
    outfits: { normal: { torso: '#2d4f7a', arms: '#2d4f7a', legs: '#2d4f7a', shoes: '#222', collar: '#e0a03a' } },
  },
};

let stripeTex = null;
function stripes() {
  if (stripeTex) return stripeTex;
  stripeTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#e9f1fb'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6f97cf';
    for (let i = 0; i < 4; i++) g.fillRect(i * 16, 0, 7, h);
  });
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set(3, 2);
  return stripeTex;
}
const clothMat = (c) => (c === 'stripes' ? mat('#ffffff', { map: stripes() }) : mat(c));

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// --- kol pozları: {R:{sx,sy,sz,ex}, L:{...}} (L için sy/sz aynalanır) ---------
export const REST = { sx: 0.05, sy: 0, sz: -0.1, ex: -0.18 };
const A = (sx, sy, sz, ex) => ({ sx, sy, sz, ex });

// t: jestin başından beri geçen süre; sp: konuşma anı
export function gesturePose(g, t) {
  const s = Math.sin, w = t * 7;
  switch (g) {
    case 'point': return { R: A(-1.45, 0.25, -0.05, -0.08) };
    case 'raise': case 'count1': return { R: A(-0.55, 0.3, -0.25, -2.0 + 0.08 * s(w)) };
    case 'count2': return { R: A(-0.6, 0.35, -0.3, -1.95 + 0.1 * s(w)) };
    case 'count3': return { R: A(-0.7, 0.4, -0.35, -1.9 + 0.12 * s(w * 1.3)) };
    case 'shrug': return { R: A(-0.45, 0, -0.55, -1.35), L: A(-0.45, 0, -0.55, -1.35), shrug: 1, tilt: 0.12 };
    case 'explain': return {
      R: A(-0.65 + 0.22 * s(w * 0.6), 0.25, -0.25, -1.15 + 0.25 * s(w * 0.6 + 1)),
      L: A(-0.55 + 0.2 * s(w * 0.6 + 2), 0.25, -0.25, -1.1 + 0.2 * s(w * 0.6 + 2.6)),
    };
    case 'talk': return { R: A(-0.35 + 0.12 * s(w * 0.5), 0.2, -0.18, -0.85 + 0.15 * s(w * 0.45)) };
    case 'facepalm': return { R: A(-1.05, 0.55, 0.15, -2.45), pitch: 0.35 };
    case 'cross': return { R: A(-0.75, 0.75, 0.15, -1.85), L: A(-0.7, 0.75, 0.15, -1.85) };
    case 'hips': return { R: A(0.25, 0.4, -0.75, -1.5), L: A(0.25, 0.4, -0.75, -1.5) };
    case 'wave': return { R: A(-0.2, 0, -2.5 + 0.35 * s(t * 12), -0.5) };
    case 'scratch': return { R: A(-0.5, 0.4, -2.3, -2.2 + 0.1 * s(t * 18)), tilt: 0.1 };
    case 'jump': return { R: A(-0.4, 0, -0.9, -0.6), L: A(-0.4, 0, -0.9, -0.6), jump: 1 };
    case 'nod': return { pitch: 0.18 * Math.max(0, s(t * 9)) };
    case 'shake': return { yaw: 0.3 * s(t * 11) };
    case 'present': return { R: A(-1.15, 0.2, -0.12, -0.5), L: A(-1.15, 0.2, -0.12, -0.5) };
    case 'stop': return { R: A(-1.25, 0.2, -0.15, -1.15) };
    case 'hush': return { R: A(-0.95, 0.6, 0.12, -2.55) };
    case 'flail': return {
      R: A(-0.5 + 0.4 * s(t * 14), 0, -2.3 + 0.3 * s(t * 11), -0.4),
      L: A(-0.5 + 0.4 * s(t * 14 + 1.5), 0, -2.3 + 0.3 * s(t * 11 + 1), -0.4), bounce: 0.04 * Math.abs(s(t * 14)),
    };
    case 'heart': return { R: A(-0.55, 0.85, 0.35, -1.95), pitch: -0.05 };
    case 'think': return { R: A(-0.95, 0.55, 0.15, -2.6), L: A(-0.35, 0.8, 0.2, -1.7), tilt: 0.15, pitch: -0.08 };
    case 'inspect': return { R: A(-1.0, 0.35, -0.05, -1.65), pitch: 0.18 };
    case 'shake_key': return { R: A(-1.35 + 0.15 * s(t * 20), 0.2, -0.1, -1.25) };
    case 'sip': return { R: A(-0.85, 0.55, 0.1, -2.5), pitch: -0.12 };
    case 'glasses': return { R: A(-1.05, 0.5, 0.1, -2.55) };
    case 'freeze': return { R: A(-0.35, 0, -0.5, -0.4), L: A(0.35, 0, -0.5, -0.4), lean: 0.1 };
    case 'work': return { R: A(-1.1 + 0.15 * s(t * 15), 0.3, -0.1, -0.7), L: A(-0.9, 0.3, -0.1, -0.9), lean: 0.35, pitch: 0.25 };
    case 'phoneShow': return { R: A(-1.3, 0.2, -0.05, -0.9) };
    case 'tie': return { R: A(-0.75, 0.75, 0.2, -2.0 + 0.08 * s(t * 9)), L: A(-0.7, 0.75, 0.2, -1.95), pitch: 0.18 };
    case 'bell': { const k = Math.max(0, s(Math.min(t, 1.1) * 5.7)); return { R: A(-0.95 + 0.2 * k, 0.35, -0.05, -0.75 - 0.15 * k), pitch: 0.12 }; }
    case 'write': return { R: A(-0.45 + 0.04 * s(t * 16), 0.45, 0.0, -1.05 + 0.05 * s(t * 23)), pitch: 0.38 };
    case 'sigh': return { shrug: -1 + Math.sin(Math.min(t, 1.5) * 2.1) * 2, pitch: 0.12 * Math.sin(Math.min(t, 1.5) * 2.1), tilt: 0.05 };
    default: return {};
  }
}

export const PERSIST = {
  phone: { R: A(-0.95, 0.95, -0.3, -2.5), tilt: 0.14 },
  tiptoe: { R: A(-0.55, 0.2, -0.35, -1.7), L: A(-0.55, 0.2, -0.35, -1.7), lean: 0.22 },
};
export const HOLD_POSE = {
  tea: { R: A(-0.25, 0.25, -0.05, -1.35) },
  key: { R: A(-0.3, 0.2, -0.05, -1.2) },
  gift: { R: A(-0.75, 0.3, 0.05, -0.85), L: A(-0.75, 0.3, 0.05, -0.85) },
  pan: { R: A(-0.6, 0.15, -0.1, -0.85) },
  card: { R: A(-0.4, 0.2, -0.05, -1.1) },
  paper: { R: A(-0.95, 0.4, -0.05, -1.35), L: A(-0.95, 0.4, -0.05, -1.35), pitch: 0.12 },
  coat: { R: A(-0.8, 0.35, 0.05, -1.0), L: A(-0.8, 0.35, 0.05, -1.0) },
  toolbox: { R: A(0.0, 0, -0.18, -0.05) },
  phone: { R: A(-0.75, 0.35, -0.05, -1.45), pitch: 0.12 },
  remote: { R: A(-0.35, 0.2, -0.05, -1.1) },
  notebook: { R: A(-0.55, 0.45, 0.0, -1.1), L: A(-0.55, 0.45, 0.0, -1.1), pitch: 0.2 },
  phoneItem: {},
  clipboard: { R: A(-0.7, 0.45, 0.0, -1.25), pitch: 0.06 },
  envelope: { R: A(-0.35, 0.2, -0.05, -1.15) },
};

export function blendArm(a, b, w) {
  return { sx: lerp(a.sx, b.sx, w), sy: lerp(a.sy, b.sy, w), sz: lerp(a.sz, b.sz, w), ex: lerp(a.ex, b.ex, w) };
}

// --- el eşyaları --------------------------------------------------------------
export function makeItem(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 'key': { const k = keyMesh(); k.rotation.x = Math.PI / 2; k.position.set(0, -0.03, 0.03); g.add(k); break; }
    case 'gift': {
      box(0.18, 0.12, 0.18, '#c0392b', 0.0, 0.0, 0.08, g);
      box(0.19, 0.125, 0.03, '#f1c40f', 0.0, 0.0, 0.08, g);
      box(0.03, 0.125, 0.19, '#f1c40f', 0.0, 0.0, 0.08, g);
      sph(0.03, '#f1c40f', 0, 0.07, 0.08, g, 8);
      g.position.set(0.11, -0.02, 0.0);
      break;
    }
    case 'tea': {
      const glass = cyl(0.028, 0.02, 0.085, mat('#b5481c', { transparent: true, opacity: 0.85 }), 0, 0.05, 0.03, g, 10);
      glass.castShadow = false;
      cyl(0.045, 0.045, 0.008, '#f4f4f4', 0, 0.005, 0.03, g, 14);
      break;
    }
    case 'phone': case 'phoneItem': box(0.075, 0.15, 0.012, '#111', 0, 0.02, 0.03, g); break;
    case 'pan': {
      cyl(0.13, 0.11, 0.05, '#2b2b2b', 0, 0.0, 0.38, g, 16);
      cyl(0.1, 0.1, 0.01, '#f6f2e0', 0, 0.03, 0.38, g, 14);
      sph(0.04, '#f2b51d', 0.02, 0.035, 0.38, g, 10).scale.y = 0.4;
      box(0.03, 0.025, 0.26, '#222', 0, 0.0, 0.14, g);
      break;
    }
    case 'card': box(0.055, 0.085, 0.004, '#e9eef5', 0, 0.02, 0.05, g); break;
    case 'paper': {
      const p = box(0.55, 0.38, 0.01, mat('#ffffff', {
        map: canvasTex(220, 152, (c, w, h) => {
          c.fillStyle = '#f1efe6'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#111'; c.font = 'bold 22px DejaVu Serif'; c.fillText('GÜNDEM', 10, 26);
          c.fillStyle = '#555';
          for (let i = 0; i < 9; i++) c.fillRect(10 + (i % 2) * 105, 40 + Math.floor(i / 2) * 22, 95, 5);
        }),
      }), -0.2, 0.05, 0.12, g);
      p.rotation.y = Math.PI;
      break;
    }
    case 'coat': box(0.2, 0.18, 0.45, '#6b4a2e', 0.1, 0, 0.12, g); break;
    case 'remote': box(0.045, 0.02, 0.17, '#1c1c1c', 0, -0.01, 0.06, g); break;
    case 'clipboard': {
      const b = box(0.24, 0.33, 0.012, '#8a5a2b', 0.02, 0.0, 0.13, g); b.rotation.x = -1.0;
      const pp = box(0.21, 0.28, 0.004, mat('#ffffff', { map: canvasTex(84, 112, (c, w, h) => {
        c.fillStyle = '#fbfbf6'; c.fillRect(0, 0, w, h); c.fillStyle = '#334';
        c.fillRect(8, 8, 50, 6); for (let i = 0; i < 9; i++) c.fillRect(8, 22 + i * 9, 40 + (i * 17) % 28, 3);
      }) }), 0.02, 0.008, 0.124, g); pp.rotation.x = -1.0;
      box(0.07, 0.02, 0.02, '#c0c0c0', 0.02, 0.13, 0.04, g).rotation.x = -1.0;
      break;
    }
    case 'envelope': {
      const e = box(0.17, 0.1, 0.006, '#e8dcc0', 0, -0.01, 0.07, g); e.rotation.x = -0.4;
      break;
    }
    case 'notebook': {
      const pg = mat('#f6f0dc');
      const l = box(0.2, 0.012, 0.27, pg, 0.11, 0, 0.1, g); l.rotation.z = 0.12;
      const r = box(0.2, 0.012, 0.27, pg, -0.09, 0, 0.1, g); r.rotation.z = -0.12;
      box(0.42, 0.006, 0.29, '#7a2a2a', 0.01, -0.012, 0.1, g);
      g.position.set(0.05, -0.02, 0.05);
      break;
    }
    case 'toolbox': {
      box(0.36, 0.2, 0.16, '#c62828', 0, -0.14, 0, g);
      box(0.2, 0.03, 0.03, '#333', 0, -0.02, 0, g);
      break;
    }
  }
  return g;
}

// ============================================================================
export class Character {
  constructor(id, look = LOOKS[id]) {
    this.id = id;
    this.look = look;
    const S = look.height / 1.8;
    this.S = S;
    const b = look.build;
    this.root = new THREE.Group();
    this.root.name = id;
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.root.scale.setScalar(S);

    this.mats = {};
    for (const [k, o] of Object.entries(look.outfits)) {
      this.mats[k] = {
        torso: clothMat(o.torso), arms: clothMat(o.arms), legs: clothMat(o.legs),
        shoes: mat(o.shoes), skirt: o.skirt ? mat(o.skirt) : null, hat: o.hat ? mat(o.hat) : null,
        collar: o.collar ? mat(o.collar) : null,
      };
    }
    const skin = mat(look.skin || SKIN);
    this.skin = skin;
    const M = this.mats.normal;

    this.thighL0 = 0.42; this.shin0 = 0.4; this.legLen = 0.86;
    // kalça
    this.hips = new THREE.Group();
    this.hips.position.y = this.legLen;
    this.body.add(this.hips);
    this.pelvis = box(0.34 * b, 0.16, 0.22 * b, M.legs, 0, 0.0, 0, this.hips);
    this.legs = [];
    for (const side of [1, -1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.1 * b, -0.02, 0);
      this.hips.add(thigh);
      const tm = cyl(0.075 * b, 0.065 * b, 0.44, M.legs, 0, -0.22, 0, thigh, 10);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      thigh.add(knee);
      const sm = cyl(0.062 * b, 0.052 * b, 0.42, M.legs, 0, -0.2, 0, knee, 10);
      const foot = box(0.1 * b + 0.02, 0.07, 0.24, M.shoes, 0, -0.41, 0.05, knee);
      this.legs.push({ thigh, knee, tm, sm, foot });
    }
    // gövde
    this.spine = new THREE.Group();
    this.spine.position.y = 0.05;
    this.hips.add(this.spine);
    const tr = 0.17 * b;
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(tr, 0.3, 6, 14), M.torso);
    this.torso.scale.set(1.08, 1, 0.72);
    this.torso.position.y = 0.3;
    this.torso.castShadow = true;
    this.spine.add(this.torso);
    if (look.belly > 0) {
      this.bellyM = sph(0.15 * b * (0.7 + 0.4 * look.belly), M.torso, 0, 0.16, 0.06 + 0.05 * look.belly, this.spine, 14);
      this.bellyM.scale.set(1.05, 0.95, 0.9);
    }
    // yaka
    this.collar = M.collar ? cyl(0.075, 0.09, 0.05, M.collar, 0, 0.6, 0, this.spine, 12) : null;
    // palto eteği
    this.skirt = new THREE.Mesh(new THREE.CylinderGeometry(tr * 1.0, tr * 1.45, 0.62, 14, 1, true), mat('#6b4a2e', { side: THREE.DoubleSide }));
    this.skirt.scale.z = 0.8;
    this.skirt.position.y = -0.22;
    this.skirt.visible = false;
    this.hips.add(this.skirt);

    // kollar
    this.arms = {};
    for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
      const sh = new THREE.Group();
      sh.position.set(side * (tr + 0.06), 0.53, 0);
      sh.rotation.order = 'YXZ';
      this.spine.add(sh);
      const um = cyl(0.055 * b, 0.05 * b, 0.3, M.arms, 0, -0.15, 0, sh, 10);
      sph(0.06 * b, M.arms, 0, 0, 0, sh, 10);
      const el = new THREE.Group();
      el.position.y = -0.29;
      sh.add(el);
      const fm = cyl(0.048 * b, 0.042 * b, 0.27, M.arms, 0, -0.135, 0, el, 10);
      const hand = sph(0.052, skin, 0, -0.29, 0.0, el, 10);
      hand.scale.set(0.9, 1.1, 0.75);
      const anchor = new THREE.Group();
      anchor.position.set(0, -0.31, 0.0);
      el.add(anchor);
      this.arms[key] = { sh, el, um, fm, hand, anchor, side };
    }
    // boyun + kafa
    this.neck = cyl(0.055, 0.06, 0.12, skin, 0, 0.66, 0, this.spine, 10);
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = 0.7;
    this.headPivot.rotation.order = 'YXZ';
    this.spine.add(this.headPivot);
    this.buildHead(look, skin);

    // el eşyaları
    this.items = {};
    for (const k of ['key', 'gift', 'tea', 'phone', 'pan', 'card', 'paper', 'coat', 'toolbox', 'remote', 'notebook']) {
      const it = makeItem(k);
      it.visible = false;
      this.arms.R.anchor.add(it);
      this.items[k] = it;
    }
    this.outfit = 'normal';
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  buildHead(look, skin) {
    const R = 0.16;
    this.R = R;
    const H = new THREE.Group();
    H.position.y = R * 0.95;
    this.headPivot.add(H);
    this.head = H;
    const skull = sph(R, skin, 0, 0, 0, H, 22);
    skull.scale.set(0.95, 1.08, 0.98);
    // kulaklar, burun
    for (const s of [-1, 1]) { const e = sph(0.04, skin, s * R * 0.93, -0.005, -0.005, H, 8); e.scale.set(0.5, 1, 0.8); }
    const nose = sph(0.032, mat(shadeHex(look.skin, -6)), 0, -0.012, R * 0.97, H, 10);
    nose.scale.set(0.9, 1.05, 1.15);
    // gözler
    this.eyes = [];
    const white = mat('#ffffff');
    const black = mat('#1a1a1a');
    for (const s of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(s * 0.056, 0.035, R * 0.86);
      H.add(eg);
      const ew = sph(0.03, white, 0, 0, 0, eg, 12);
      ew.scale.z = 0.6;
      const pu = sph(0.017, black, 0, 0, 0.017, eg, 10);
      this.eyes.push({ eg, pu });
    }
    // kaşlar
    this.brows = [];
    const bm = mat(look.brows || '#333');
    for (const s of [-1, 1]) {
      const br = box(0.062, 0.014, 0.015, bm, s * 0.058, 0.083, R * 0.93, H);
      br.castShadow = false;
      this.brows.push({ m: br, s });
    }
    // ağız
    this.mouth = sph(0.035, mat('#5a1f1f'), 0, -0.073, R * 0.93, H, 12);
    this.mouth.scale.set(1.2, 0.18, 0.4);
    // saç
    const hm = mat(look.hair.color);
    if (look.hair.style === 'short' || look.hair.style === 'buzz') {
      const cover = look.hair.style === 'short' ? 0.37 : 0.33;
      const hair = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 22, 12, 0, Math.PI * 2, 0, Math.PI * cover), hm);
      hair.scale.set(0.97, 1.1, 1.0);
      hair.rotation.x = -0.32;
      hair.position.y = 0.006;
      H.add(hair);
      const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 22, 12, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.25, Math.PI * 0.35), hm);
      back.scale.set(0.97, 1.08, 1.0);
      H.add(back);
      if (look.hair.style === 'short') {
        for (const s of [-1, 1]) { const sb = box(0.02, 0.06, 0.05, hm, s * R * 0.92, 0.03, 0.02, H); sb.castShadow = false; }
      }
    } else if (look.hair.style === 'sides') {
      const ring = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 22, 10, Math.PI * 1.05, Math.PI * 0.9, Math.PI * 0.42, Math.PI * 0.16), hm);
      ring.scale.set(0.97, 1.08, 1.0);
      H.add(ring);
      for (const s of [-1, 1]) sph(0.035, hm, s * R * 0.88, 0.02, -0.03, H, 8).scale.set(0.6, 1.2, 1.4);
    }
    if (look.mustache) {
      const ms = look.mustache.size || 1;
      const mm = mat(look.mustache.color);
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.014 * ms, 0.045 * ms, 4, 8), mm);
        m.rotation.z = Math.PI / 2 + s * 0.28;
        m.position.set(s * 0.03 * ms, -0.048, R * 0.95);
        H.add(m);
      }
    }
    if (look.beard) {
      const bmat = mat(look.beard.color);
      const beard = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 22, 10, Math.PI * 0.02, Math.PI * 0.96, Math.PI * 0.57, Math.PI * 0.33), bmat);
      beard.scale.set(0.97, 1.1, 1.02);
      beard.rotation.y = 0;
      H.add(beard);
      // bıyık şeridi
      const ms = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.07, 4, 8), bmat);
      ms.rotation.z = Math.PI / 2; ms.position.set(0, -0.048, R * 0.95); H.add(ms);
      this.mouth.position.z = R * 1.0;
      this.mouth.material = mat('#7a2a2a');
    }
    if (look.stubble) {
      const st = new THREE.Mesh(new THREE.SphereGeometry(R * 1.01, 22, 10, Math.PI * 0.02, Math.PI * 0.96, Math.PI * 0.55, Math.PI * 0.32),
        mat(look.stubble, { transparent: true, opacity: 0.55 }));
      st.scale.set(0.97, 1.08, 1.0);
      H.add(st);
    }
    if (look.glasses) {
      const gm = mat('#1d1d1d');
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 6, look.glasses === 'square' ? 4 : 16), gm);
        if (look.glasses === 'square') { ring.rotation.z = Math.PI / 4; ring.scale.set(1.15, 0.85, 1); }
        ring.position.set(s * 0.057, 0.035, R * 0.98);
        H.add(ring);
        const tm = box(0.006, 0.006, 0.15, gm, s * 0.098, 0.04, R * 0.45, H);
        tm.castShadow = false;
      }
      box(0.03, 0.006, 0.006, gm, 0, 0.04, R * 1.0, H);
    }
    // şapka (palto ile birlikte) ve kasket
    this.hat = new THREE.Group();
    this.hat.position.y = R * 0.75;
    H.add(this.hat);
    cyl(0.25, 0.25, 0.018, '#3a2a1a', 0, 0, 0, this.hat, 18);
    cyl(0.15, 0.165, 0.15, '#3a2a1a', 0, 0.08, 0, this.hat, 16);
    cyl(0.166, 0.166, 0.035, '#6b2a2a', 0, 0.025, 0, this.hat, 16);
    this.hat.visible = false;
    if (look.cap) {
      const cm = mat(look.cap);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), cm);
      cap.position.y = 0.01; H.add(cap);
      const brim = box(0.2, 0.015, 0.13, cm, 0, 0.065, R * 0.95, H);
      brim.rotation.x = 0.15;
    }
  }

  setOutfit(name) {
    if (this.outfit === name || !this.mats[name]) return;
    this.outfit = name;
    const M = this.mats[name];
    this.torso.material = M.torso;
    if (this.bellyM) this.bellyM.material = M.torso;
    this.pelvis.material = M.legs;
    for (const l of this.legs) { l.tm.material = M.legs; l.sm.material = M.legs; l.foot.material = M.shoes; }
    for (const a of Object.values(this.arms)) {
      a.um.material = M.arms; a.fm.material = M.arms;
      a.sh.children[1].material = M.arms;
    }
    this.skirt.visible = !!M.skirt;
    if (M.skirt) this.skirt.material = M.skirt;
    this.hat.visible = !!M.hat;
  }

  // state: timeline'dan hesaplanan anlık durum
  update(st) {
    const { t } = st;
    this.root.visible = st.visible;
    if (!st.visible) return;
    this.setOutfit(st.outfit || 'normal');
    this.root.position.set(st.x, st.y, st.z);
    this.root.rotation.y = st.yaw;

    // eşyalar
    for (const [k, it] of Object.entries(this.items)) it.visible = st.hold === k || (k === 'phone' && st.pose === 'phone');

    const sit = st.sit;
    const sitH = st.sitH ?? 0.46;
    const floor = sitH < 0.3;
    const look = this.look;

    // --- bacaklar / kalça
    let hipY = this.legLen;
    let bob = 0, lean = (look.hunch || 0);
    const legRot = [[0, 0], [0, 0]];
    let armSwing = 0;
    if (st.walking) {
      const run = (st.speed || 1.2) > 2.2;
      const sneaky = st.pose === 'tiptoe';
      const cyc = st.phase / (run ? 1.6 : 1.05) * Math.PI * 2;
      const amp = run ? 0.75 : sneaky ? 0.35 : 0.5;
      for (let i = 0; i < 2; i++) {
        const ph = cyc + i * Math.PI;
        legRot[i][0] = -Math.sin(ph) * amp;
        legRot[i][1] = Math.max(0, Math.sin(ph - 1.2)) * (run ? 1.2 : 0.7);
      }
      bob = Math.abs(Math.sin(cyc)) * (run ? 0.06 : 0.025);
      armSwing = Math.sin(cyc) * (run ? 0.9 : 0.4);
      lean += run ? 0.2 : 0.03;
    }
    // oturma
    if (sit > 0) {
      const thighSit = -Math.PI / 2 + (floor ? 0.12 : 0);
      const kneeSit = floor ? 0.12 : Math.PI / 2 - 0.05;
      for (let i = 0; i < 2; i++) {
        legRot[i][0] = lerp(legRot[i][0], thighSit, sit);
        legRot[i][1] = lerp(legRot[i][1], kneeSit, sit);
      }
      hipY = lerp(this.legLen, sitH + 0.07, smooth(sit));
      lean = lerp(lean, floor ? -0.12 : -0.06, sit);
    }
    // jest
    let gp = { R: null, L: null };
    let gw = 0;
    let extra = { pitch: 0, yaw: 0, tilt: 0, lean: 0, shrug: 0, jump: 0, bounce: 0 };
    const applyExtra = (p, w) => {
      for (const k of Object.keys(extra)) if (p[k]) extra[k] += p[k] * w;
    };
    // kalıcı poz + eşya pozu
    let baseR = REST, baseL = REST;
    const hp = st.hold && HOLD_POSE[st.hold];
    if (hp) {
      if (hp.R) baseR = hp.R;
      if (hp.L) baseL = hp.L;
      applyExtra(hp, 1);
    }
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
    // konuşma sırasında hafif el hareketi
    if (st.talking && !st.gestures.length && !st.hold && !st.pose && sit < 0.5 && !st.walking) {
      const p = gesturePose('talk', t);
      R = blendArm(R, p.R, 0.7);
    }
    for (const g of st.gestures) {
      const p = gesturePose(g.g, g.local);
      const w = g.w;
      if (p.R) R = blendArm(R, p.R, w);
      if (p.L) L = blendArm(L, p.L, w);
      applyExtra(p, w);
      gw = Math.max(gw, w);
    }
    if (st.walking && gw < 0.5 && !st.pose && !hp) {
      R = { ...R, sx: R.sx + armSwing };
      L = { ...L, sx: L.sx - armSwing };
    }

    for (let i = 0; i < 2; i++) {
      this.legs[i].thigh.rotation.x = legRot[i][0];
      this.legs[i].knee.rotation.x = legRot[i][1];
    }
    const jumpY = extra.jump > 0 ? Math.sin(clamp(st.jumpT || 0, 0, 1) * Math.PI) * 0.18 * extra.jump : 0;
    const breath = Math.sin(t * 2.1 + this.id.length) * (st.sleep ? 0.02 : 0.008);
    this.hips.position.y = hipY + bob + jumpY + extra.bounce;
    this.hips.position.z = sit > 0 ? lerp(0, floor ? -0.05 : -0.12, sit) : 0;
    this.spine.rotation.x = lean + extra.lean;
    this.torso.scale.y = 1 + breath;

    const setArm = (a, p, mirror) => {
      a.sh.rotation.set(p.sx, mirror * p.sy, mirror * p.sz);
      a.el.rotation.x = p.ex;
    };
    setArm(this.arms.R, R, 1);
    setArm(this.arms.L, L, -1);
    const shrug = extra.shrug * 0.05;
    this.arms.R.sh.position.y = 0.53 + shrug;
    this.arms.L.sh.position.y = 0.53 + shrug;

    // --- kafa
    const hy = clamp(st.lookYaw, -1.15, 1.15) + extra.yaw;
    const hpch = clamp(st.lookPitch, -0.5, 0.5) + extra.pitch + (st.emo === 'sad' ? 0.12 : 0) + (st.sleep ? 0.45 : 0);
    this.headPivot.rotation.set(hpch - lean * 0.6, hy, extra.tilt + (st.sleep ? 0.35 : 0) + (st.talking ? Math.sin(t * 3.3) * 0.03 : 0));

    // --- yüz
    const E = st.emo || 'neutral';
    const eyeOpen = st.sleep ? 0.08 : st.blink ? 0.1 : ({ tired: 0.55, smug: 0.62, serious: 0.82, angry: 0.85 }[E] ?? 1);
    const eyeBig = { surprised: 1.22, scared: 1.25 }[E] ?? 1;
    for (const e of this.eyes) {
      e.eg.scale.set(eyeBig, eyeOpen * eyeBig, 1);
    }
    // göz bebeği bakış
    const pupX = clamp(st.eyeX || 0, -1, 1) * 0.008;
    for (const e of this.eyes) e.pu.position.x = pupX;
    const browCfg = {
      neutral: [0, 0], happy: [0.012, -0.08], angry: [-0.01, 0.38], surprised: [0.025, -0.05], sad: [0.006, -0.35],
      smug: [0.008, 0.15], scared: [0.022, -0.3], tired: [-0.006, -0.1], serious: [-0.006, 0.18],
    }[E] || [0, 0];
    this.brows.forEach((b, i) => {
      let dy = browCfg[0], rz = browCfg[1];
      if (E === 'smug' && i === 1) { dy += 0.012; rz = -0.1; }
      b.m.position.y = 0.083 + dy;
      b.m.rotation.z = b.s * -rz;
    });
    const base = { surprised: 0.45, scared: 0.35 }[E] ?? 0;
    const open = clamp(Math.max(base, st.mouth * 1.05), 0, 1);
    const wide = { happy: 1.45, smug: 1.25, angry: 0.85, surprised: 0.8, scared: 1.1, serious: 0.95 }[E] ?? 1.1;
    this.mouth.scale.set(lerp(wide, 0.95, open * 0.4), 0.14 + open * 0.95, 0.4);
  }
}

function shadeHex(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, clamp(hsl.l + amt / 100, 0, 1));
  return '#' + c.getHexString();
}
