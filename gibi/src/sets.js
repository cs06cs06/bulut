// Bölümün beş seti: İlkkan'ın evi (A), Yılmaz'ın evi (B), koridor (C),
// apartman girişi (D), sokak (E). Hepsi basit geometrilerden kurulur.
import * as THREE from 'three';
import { layout } from './layout.js';

// --- malzeme ve doku yardımcıları -----------------------------------------
let gradientMap = null;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 170, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}
const matCache = new Map();
let STYLE = 'toon';
// 'pbr': fiziksel tabanlı malzemeler (motor 2)
export function setStyle(s) { STYLE = s; matCache.clear(); }
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.map && matCache.has(key)) return matCache.get(key);
  const m = STYLE === 'pbr'
    ? new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...opts })
    : new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
  if (!opts.map) matCache.set(key, m);
  return m;
}
export function basic(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function woodTex(base = '#9a6b43', dark = '#7d5434', planks = 8) {
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const ph = h / planks;
    for (let i = 0; i < planks; i++) {
      g.fillStyle = i % 2 ? base : shade(base, -8);
      g.fillRect(0, i * ph, w, ph);
      g.fillStyle = dark; g.fillRect(0, i * ph, w, 2);
      const off = (i * 137) % w;
      g.fillRect(off, i * ph, 2, ph);
      g.globalAlpha = 0.12;
      for (let k = 0; k < 6; k++) { g.fillRect(0, i * ph + 6 + k * (ph / 6), w, 1); }
      g.globalAlpha = 1;
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function tileTex(a = '#d8d2c4', b = '#bdb6a6', n = 8) {
  const t = canvasTex(512, 512, (g, w, h) => {
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? a : b;
      g.fillRect(i * s, j * s, s, s);
    }
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt / 100)));
  return '#' + c.getHexString();
}

export function textPlane(w, h, draw, px = 256) {
  const tex = canvasTex(Math.round(px * w / h), px, draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat('#ffffff', { map: tex }));
  return m;
}

// --- geometri yardımcıları ---------------------------------------------------
export function box(w, h, d, color, x = 0, y = 0, z = 0, parent, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, parent, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
export function sph(r, color, x = 0, y = 0, z = 0, parent, seg = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.7 | 0)), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// Delikli duvar: yerel düzlemde (u: yatay, v: dikey), normal +z
function wallMesh(len, h, holes, material) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0); s.lineTo(len / 2, h); s.lineTo(-len / 2, h); s.lineTo(-len / 2, 0);
  for (const [u0, u1, v0, v1] of holes) {
    const p = new THREE.Path();
    p.moveTo(u0, v0); p.lineTo(u0, v1); p.lineTo(u1, v1); p.lineTo(u1, v0); p.lineTo(u0, v0);
    s.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(s);
  // dokular için uv'leri metreye ölçekle
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

// İki tonlu (alt yarısı yağlıboya) apartman duvarı malzemesi
function twoToneTex(top, bottom, split = 0.42, stripe = '#00000022') {
  return canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = top; g.fillRect(0, 0, w, h);
    g.fillStyle = bottom; g.fillRect(0, h * (1 - split), w, h * split);
    g.fillStyle = stripe; g.fillRect(0, h * (1 - split) - 3, w, 3);
  });
}

// Oda: zemin + arka/sol/sağ duvar (ön taraf açık, sitcom sahnesi gibi)
function room(parent, o) {
  const { w = 9, d = 6, h = 3.6 } = o;
  const g = new THREE.Group();
  parent.add(g);
  // zemin
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, d + 3), o.floorMat);
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(0, 0, 1.5 - 0.0);
  fl.receiveShadow = true;
  g.add(fl);
  const wm = o.wallMat;
  // arka duvar (normal +z)
  const back = wallMesh(w, h, o.backHoles || [], o.backMat || wm);
  back.position.set(0, 0, -d / 2);
  g.add(back);
  // sol duvar: yerel u → dünya -z
  const left = wallMesh(d + 3, h, (o.leftHoles || []).map(([z0, z1, v0, v1]) => [-(z1 - 1.5), -(z0 - 1.5), v0, v1]), wm);
  left.rotation.y = Math.PI / 2;
  left.position.set(-w / 2, 0, 1.5);
  g.add(left);
  // sağ duvar: yerel u → dünya +z
  const right = wallMesh(d + 3, h, (o.rightHoles || []).map(([z0, z1, v0, v1]) => [z0 - 1.5, z1 - 1.5, v0, v1]), wm);
  right.rotation.y = -Math.PI / 2;
  right.position.set(w / 2, 0, 1.5);
  g.add(right);
  // süpürgelik
  const sk = o.skirt || '#5b4636';
  box(w, 0.1, 0.03, sk, 0, 0.05, -d / 2 + 0.015, g, { cast: false });
  // dördüncü duvar (motor 2): kamera sahnenin açık tarafına baktığında boşluk görünmesin
  if (STYLE === 'pbr') {
    const fw = wallMesh(w, h, [], o.frontMat || wm);
    fw.rotation.y = Math.PI; fw.position.set(0, 0, d / 2 + 3); g.add(fw);
    box(w, 0.1, 0.03, o.skirt || '#5b4636', 0, 0.05, d / 2 + 3 - 0.015, g, { cast: false });
  }
  // kornij + tavan (yalnızca aşağıdan görünür, gölge düşürmez)
  box(w, 0.08, 0.08, '#f2efe8', 0, h - 0.04, -d / 2 + 0.04, g, { cast: false });
  addCeiling(g, w, d + 3, h, 0, 1.5, o.ceil || '#f4f0e6');
  return g;
}

function addCeiling(g, w, d, h, x, z, color) {
  const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  c.rotation.x = Math.PI / 2;
  c.position.set(x, h, z);
  c.castShadow = false;
  g.add(c);
  return c;
}

function doorLeaf(color, opts = {}) {
  const pivot = new THREE.Group();
  const leaf = new THREE.Group();
  pivot.add(leaf);
  // kanat, menteşeden +z yönüne uzanır (yerel)
  box(0.05, 2.05, 0.98, color, 0, 1.025, 0.49, leaf);
  // paneller
  box(0.06, 0.7, 0.7, shade(color, -6), 0, 1.5, 0.49, leaf);
  box(0.06, 0.7, 0.7, shade(color, -6), 0, 0.6, 0.49, leaf);
  // kol (iki yüzde)
  for (const s of [-1, 1]) {
    box(0.06, 0.04, 0.16, '#d8c27a', s * 0.05, 1.0, 0.85, leaf);
  }
  if (opts.number) {
    for (const s of [-1, 1]) {
      const p = textPlane(0.16, 0.16, (g2, w, h) => {
        g2.fillStyle = '#d6b85a'; g2.fillRect(0, 0, w, h);
        g2.fillStyle = '#3b2b10'; g2.font = `bold ${h * 0.75}px DejaVu Sans, sans-serif`;
        g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(opts.number, w / 2, h * 0.54);
      }, 64);
      p.position.set(s * 0.032, 1.72, 0.49);
      p.rotation.y = s * Math.PI / 2;
      leaf.add(p);
    }
    // dürbün
    for (const s of [-1, 1]) cyl(0.018, 0.018, 0.02, '#222', s * 0.03, 1.55, 0.49, leaf).rotation.z = Math.PI / 2;
  }
  return pivot;
}

function couch(parent, color, x, z, yaw = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = yaw;
  box(2.3, 0.42, 0.9, color, 0, 0.21, 0, g);
  box(2.3, 0.65, 0.22, shade(color, -5), 0, 0.6, -0.36, g);
  box(0.22, 0.6, 0.9, shade(color, -5), -1.15, 0.38, 0, g);
  box(0.22, 0.6, 0.9, shade(color, -5), 1.15, 0.38, 0, g);
  box(1.0, 0.1, 0.62, shade(color, 6), -0.53, 0.46, 0.08, g);
  box(1.0, 0.1, 0.62, shade(color, 6), 0.53, 0.46, 0.08, g);
  // yastık
  const p = box(0.4, 0.34, 0.12, '#e8c26a', 0.85, 0.66, -0.2, g); p.rotation.z = 0.2;
  parent.add(g);
  return g;
}

function plant(parent, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  cyl(0.18, 0.13, 0.35, '#b5633a', 0, 0.175, 0, g);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    const l = sph(0.17, '#3f8a3a', Math.cos(a) * 0.14, 0.55 + (i % 3) * 0.16, Math.sin(a) * 0.14, g, 10);
    l.scale.set(1, 1.5, 0.6); l.rotation.y = a;
  }
  parent.add(g);
  return g;
}

function framePic(parent, w, h, x, y, z, draw, yaw = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  box(w + 0.08, h + 0.08, 0.04, '#3b2a1c', 0, 0, 0, g, { cast: false });
  const p = textPlane(w, h, draw);
  p.position.z = 0.025;
  g.add(p);
  parent.add(g);
  return g;
}

function windowSky(parent, x, y, z, w, h, yaw = 0) {
  // pencere dışı: renkli düzlem (zaman dilimine göre değişir)
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, h + 0.6), basic('#9cc9ee'));
  sky.position.set(x, y, z);
  sky.rotation.y = yaw;
  parent.add(sky);
  return sky;
}

function windowFrame(parent, x, y, z, w, h) {
  const fc = '#f4f1ea';
  box(w + 0.1, 0.08, 0.12, fc, x, y - h / 2, z, parent);
  box(w + 0.1, 0.08, 0.12, fc, x, y + h / 2, z, parent);
  box(0.08, h, 0.12, fc, x - w / 2, y, z, parent);
  box(0.08, h, 0.12, fc, x + w / 2, y, z, parent);
  box(0.05, h, 0.06, fc, x, y, z, parent);
  box(w + 0.3, 0.05, 0.22, fc, x, y - h / 2 - 0.04, z + 0.08, parent);
}

function curtains(parent, x, y, z, w, h, color) {
  for (const s of [-1, 1]) {
    const c = box(0.35, h + 0.3, 0.06, color, x + s * (w / 2 + 0.12), y, z + 0.12, parent);
    c.castShadow = false;
  }
  box(w + 1.0, 0.04, 0.04, '#6b5440', x, y + h / 2 + 0.18, z + 0.12, parent);
}

function floorLamp(parent, x, z, sets, key) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  cyl(0.18, 0.2, 0.04, '#333', 0, 0.02, 0, g);
  cyl(0.02, 0.02, 1.5, '#333', 0, 0.77, 0, g);
  const shadeM = cyl(0.16, 0.26, 0.3, mat('#f3dfae', { emissive: '#7a5a20', emissiveIntensity: 0.6 }), 0, 1.6, 0, g);
  shadeM.castShadow = false;
  const L = new THREE.PointLight('#ffcf8a', 0, 7, 1.6);
  L.position.set(0, 1.5, 0.1);
  g.add(L);
  sets.lamps.push({ light: L, key, shade: shadeM });
  parent.add(g);
  return g;
}

function stairs(parent, { x, z0, z1, w, y0, y1, n, color = '#c9c1b2', rail = true }) {
  // basamaklar z0'dan (yüksek, y0) z1'e (alçak, y1)
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const zz = z0 + (z1 - z0) * (f + 0.5 / n);
    const top = y0 + (y1 - y0) * f;
    const hh = Math.max(0.02, top - Math.min(y0, y1) + 0.02);
    box(w, hh, Math.abs(z1 - z0) / n + 0.01, color, x, top - hh / 2, zz, g);
  }
  if (rail) {
    const rx = x + w / 2 + 0.03;
    const len = Math.hypot(z1 - z0, y1 - y0);
    const r = box(0.06, 0.06, len, '#6b4a2e', rx, (y0 + y1) / 2 + 0.95, (z0 + z1) / 2, g);
    r.rotation.x = Math.atan2(y0 - y1, z1 - z0) * (z1 > z0 ? 1 : -1);
    for (let i = 0; i <= 6; i++) {
      const f = i / 6;
      cyl(0.018, 0.018, 0.95, '#333', rx, y0 + (y1 - y0) * f + 0.47, z0 + (z1 - z0) * f, g, 6);
    }
  }
  parent.add(g);
  return g;
}

// ============================================================================
export function buildSets(scene) {
  const sets = { groups: {}, doors: {}, flags: {}, lamps: [], skies: [], listFrames: {}, van: null, tv: null };
  const O = (k) => layout[k].origin;

  // ---------------------------------------------------------------- A: İlkkan
  {
    const g = new THREE.Group(); g.position.set(...O('A')); scene.add(g); sets.groups.A = g;
    const fm = mat('#ffffff', { map: woodTex('#a8784c', '#80583a') }); fm.map.repeat.set(4, 4);
    const wmTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#e9dcc0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e0cfae';
      for (let i = 0; i < w; i += 32) c.fillRect(i, 0, 12, h);
    });
    wmTex.wrapS = wmTex.wrapT = THREE.RepeatWrapping;
    room(g, {
      floorMat: fm, wallMat: mat('#ffffff', { map: wmTex }),
      backHoles: [[-0.9, 0.9, 1.0, 2.3]],
      leftHoles: [[0.1, 1.1, 0, 2.12]],
      skirt: '#6d4c35',
    });
    const sky = windowSky(g, 0, 1.65, -3.6, 1.8, 1.3);
    sets.skies.push({ mesh: sky, set: 'A' });
    windowFrame(g, 0, 1.65, -2.98, 1.8, 1.3);
    curtains(g, 0, 1.65, -2.98, 1.8, 1.3, '#9e3d3d');
    // halı
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), mat('#ffffff', {
      map: canvasTex(320, 220, (c, w, h) => {
        c.fillStyle = '#8c2f2f'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#e6c27a'; c.lineWidth = 8; c.strokeRect(14, 14, w - 28, h - 28);
        c.fillStyle = '#2f4f7a';
        for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(50 + i * 55, h / 2, 16, 0, 7); c.fill(); }
      }),
    }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0.1, 0.005, -1.0); rug.receiveShadow = true; g.add(rug);
    couch(g, '#5d7a99', 0.05, -2.3);
    // sehpa
    box(1.2, 0.05, 0.6, '#6b4a2e', 0.05, 0.4, -0.95, g);
    for (const [a, b] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) box(0.05, 0.4, 0.05, '#5a3d25', 0.05 + a, 0.2, -0.95 + b, g);
    // sehpadaki telefon ve kumanda
    box(0.08, 0.012, 0.16, '#111', 0.35, 0.43, -0.9, g);
    box(0.05, 0.02, 0.18, '#333', -0.25, 0.43, -1.0, g);
    cyl(0.04, 0.035, 0.1, mat('#fff', { transparent: true, opacity: 0.7 }), -0.4, 0.475, -0.85, g);
    // TV (sağ duvarda)
    box(0.5, 0.55, 1.6, '#4a3424', 4.15, 0.275, -1.0, g);
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.75), basic('#2a3a5a'));
    box(0.06, 0.8, 1.38, '#111', 4.2, 1.0, -1.0, g);
    tvScreen.position.set(4.16, 1.0, -1.0); tvScreen.rotation.y = -Math.PI / 2; g.add(tvScreen);
    sets.tv = tvScreen;
    // kitaplık
    const shelf = new THREE.Group(); shelf.position.set(-2.8, 0, -2.75); g.add(shelf);
    box(1.4, 2.0, 0.35, '#7a5638', 0, 1.0, 0, shelf);
    const bookCols = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1'];
    for (let r = 0; r < 4; r++) {
      box(1.3, 0.03, 0.3, '#5a3d25', 0, 0.25 + r * 0.45, 0.03, shelf);
      let bx = -0.6;
      for (let i = 0; bx < 0.55; i++) {
        const bw = 0.05 + ((i * 7 + r * 3) % 4) * 0.02;
        const bh = 0.24 + ((i * 5 + r) % 3) * 0.05;
        box(bw, bh, 0.22, bookCols[(i + r * 2) % bookCols.length], bx + bw / 2, 0.27 + r * 0.45 + bh / 2, 0.05, shelf);
        bx += bw + 0.01;
      }
    }
    floorLamp(g, 1.75, -2.5, sets, 'A');
    plant(g, -3.9, -2.5, 1.1);
    framePic(g, 0.7, 0.5, 2.3, 1.75, -2.97, (c, w, h) => {
      c.fillStyle = '#87b5d9'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3f7a3a'; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.35, h * 0.35); c.lineTo(w * 0.7, h); c.fill();
      c.fillStyle = '#5c8f4a'; c.beginPath(); c.moveTo(w * 0.4, h); c.lineTo(w * 0.75, h * 0.45); c.lineTo(w, h); c.fill();
      c.fillStyle = '#f7e27a'; c.beginPath(); c.arc(w * 0.8, h * 0.25, 18, 0, 7); c.fill();
    });
    // kapı ve kasası
    sets.doors.A = doorLeaf('#7b5236');
    g.add(sets.doors.A);
    box(0.14, 0.1, 1.2, '#5a3d25', -4.5, 2.15, 0.6, g);
    box(0.14, 2.15, 0.08, '#5a3d25', -4.5, 1.07, 0.06, g);
    box(0.14, 2.15, 0.08, '#5a3d25', -4.5, 1.07, 1.14, g);
    // kapı dışı (koridor rengi)
    box(0.05, 2.4, 1.6, '#b9c7a8', -5.6, 1.2, 0.6, g, { cast: false });
    box(1.2, 2.4, 0.05, '#b9c7a8', -5.0, 1.2, -0.2, g, { cast: false });
    // portmanto
    const hook = new THREE.Group(); hook.position.set(-4.4, 0, 1.9); g.add(hook);
    box(0.06, 0.06, 0.6, '#5a3d25', 0, 1.7, 0, hook);
    const sc = box(0.12, 0.6, 0.35, '#2d6a4f', 0.06, 1.38, 0.0, hook); sc.rotation.x = 0.1;
  }

  // ---------------------------------------------------------------- B: Yılmaz
  {
    const g = new THREE.Group(); g.position.set(...O('B')); scene.add(g); sets.groups.B = g;
    const fm = mat('#ffffff', { map: woodTex('#c49a6c', '#9c7550', 10) }); fm.map.repeat.set(4, 4);
    const wmTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#d6e3d3'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#c3d4bf';
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.beginPath(); c.arc(i * 32 + (j % 2) * 16, j * 32, 4, 0, 7); c.fill(); }
    });
    wmTex.wrapS = wmTex.wrapT = THREE.RepeatWrapping;
    room(g, {
      floorMat: fm, wallMat: mat('#ffffff', { map: wmTex }),
      backHoles: [[0.2, 2.0, 1.0, 2.3]],
      leftHoles: [[0.1, 1.1, 0, 2.12]],
      skirt: '#7a5a3a',
    });
    const sky = windowSky(g, 1.1, 1.65, -3.6, 1.8, 1.3);
    sets.skies.push({ mesh: sky, set: 'B' });
    windowFrame(g, 1.1, 1.65, -2.98, 1.8, 1.3);
    curtains(g, 1.1, 1.65, -2.98, 1.8, 1.3, '#d9b44a');
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.0), mat('#ffffff', {
      map: canvasTex(300, 200, (c, w, h) => {
        c.fillStyle = '#3d5a80'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#98c1d9';
        for (let i = 0; i < 6; i++) c.fillRect(0, i * 36 + 10, w, 10);
      }),
    }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.005, -1.0); rug.receiveShadow = true; g.add(rug);
    couch(g, '#6a8f5a', 0.05, -2.3);
    // yan sehpa + çay
    box(0.5, 0.5, 0.5, '#6b4a2e', -1.55, 0.25, -2.3, g);
    // berjer
    const arm = new THREE.Group(); arm.position.set(2.3, 0, -1.1); arm.rotation.y = -1.1; g.add(arm);
    box(0.9, 0.42, 0.85, '#b05a3c', 0, 0.21, 0, arm);
    box(0.9, 0.7, 0.2, '#9a4c31', 0, 0.62, -0.33, arm);
    box(0.18, 0.55, 0.85, '#9a4c31', -0.45, 0.4, 0, arm);
    box(0.18, 0.55, 0.85, '#9a4c31', 0.45, 0.4, 0, arm);
    // konsol + kâse + çekmece
    const con = new THREE.Group(); con.position.set(-4.15, 0, -0.6); g.add(con);
    box(0.5, 0.06, 1.0, '#5a3d25', 0, 0.8, 0, con);
    box(0.46, 0.25, 0.96, '#6b4a2e', 0, 0.64, 0, con);
    box(0.02, 0.18, 0.5, '#7d5a3a', 0.24, 0.64, 0, con);
    box(0.03, 0.03, 0.12, '#d8c27a', 0.26, 0.64, 0, con);
    for (const zz of [-0.45, 0.45]) box(0.05, 0.52, 0.05, '#5a3d25', 0.2, 0.26, zz, con);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#2c7a7b', { side: THREE.DoubleSide }));
    bowl.position.set(0, 0.95, 0); con.add(bowl);
    const bowlKey = keyMesh(); bowlKey.position.set(0, 0.86, 0.02); bowlKey.rotation.set(-Math.PI / 2, 0, 0.6); con.add(bowlKey);
    sets.flags['B.bowlKey'] = { obj: bowlKey, def: false };
    // askı + palto + şapka
    const rack = new THREE.Group(); rack.position.set(-4.1, 0, 1.75); g.add(rack);
    cyl(0.03, 0.03, 1.85, '#4a3424', 0, 0.92, 0, rack, 8);
    cyl(0.22, 0.25, 0.04, '#4a3424', 0, 0.02, 0, rack);
    const rackItems = new THREE.Group(); rack.add(rackItems);
    const coat = box(0.18, 0.95, 0.5, '#6b4a2e', 0.1, 1.3, 0, rackItems); coat.rotation.z = 0.05;
    const hatG = new THREE.Group(); hatG.position.set(0, 1.86, 0); rackItems.add(hatG);
    cyl(0.2, 0.2, 0.02, '#3a2a1a', 0, 0, 0, hatG);
    cyl(0.12, 0.13, 0.13, '#3a2a1a', 0, 0.07, 0, hatG);
    sets.flags['B.rack'] = { obj: rackItems, def: true };
    // mutfak köşesi
    const k = new THREE.Group(); k.position.set(4.05, 0, -1.8); g.add(k);
    box(0.9, 0.9, 2.4, '#e8e4da', 0, 0.45, 0, k);
    box(0.95, 0.04, 2.45, '#7a6a58', 0, 0.92, 0, k);
    box(0.9, 0.7, 2.4, '#e8e4da', 0.05, 2.0, 0, k);
    for (const zz of [-0.6, 0.6]) box(0.02, 0.6, 1.1, '#d8d2c4', -0.41, 2.0, zz, k);
    // ocak
    box(0.6, 0.02, 0.6, '#222', -0.05, 0.945, 0.2, k);
    for (const [a, b] of [[-0.15, 0.05], [0.1, 0.05], [-0.15, 0.35], [0.1, 0.35]]) cyl(0.08, 0.08, 0.01, '#555', a, 0.96, b, k);
    for (let i = 0; i < 4; i++) box(0.02, 0.05, 0.05, '#ccc', -0.46, 0.8, -0.1 + i * 0.12, k);
    // davlumbaz
    box(0.6, 0.18, 0.7, '#bbb', -0.05, 1.58, 0.2, k);
    // buzdolabı
    box(0.8, 1.9, 0.7, '#f1f1f1', 0.05, 0.95, 1.55, k);
    box(0.03, 0.4, 0.04, '#999', -0.36, 1.2, 1.35, k);
    // ACİL DURUM LİSTESİ çerçevesi
    const drawList = (n) => (c, w, h) => {
      c.fillStyle = '#fdf6e3'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#b22222'; c.font = `bold ${h * 0.12}px DejaVu Sans, sans-serif`;
      c.textAlign = 'center'; c.fillText('ACİL DURUM LİSTESİ', w / 2, h * 0.18);
      c.fillStyle = '#222'; c.textAlign = 'left'; c.font = `${h * 0.1}px DejaVu Serif, serif`;
      ['1. Yangın', '2. Sel', '3. Ben "acil" dersem'].forEach((s, i) => c.fillText(s, w * 0.1, h * (0.38 + i * 0.16)));
      if (n >= 4) {
        c.fillStyle = '#1d4ed8'; c.font = `italic bold ${h * 0.11}px DejaVu Sans, sans-serif`;
        c.save(); c.translate(w * 0.1, h * 0.88); c.rotate(-0.04); c.fillText('4. Necmi Bey', 0, 0); c.restore();
      }
    };
    const lf = framePic(g, 0.75, 0.6, -2.2, 1.7, -2.97, drawList(3));
    const tex3 = lf.children[1].material.map;
    const tex4 = canvasTex(Math.round(256 * 0.75 / 0.6), 256, drawList(4));
    sets.listFrames = { mesh: lf.children[1], 3: tex3, 4: tex4 };
    const belge = framePic(g, 0.46, 0.6, -1.35, 1.68, -2.97, (c, w, h) => {
      c.fillStyle = '#fbf8ee'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1e3a8a'; c.font = `bold ${h * 0.065}px DejaVu Serif, serif`; c.textAlign = 'center';
      c.fillText('HUZUR APT. YÖNETİMİ', w / 2, h * 0.1);
      c.fillStyle = '#222'; c.font = `${h * 0.055}px DejaVu Serif, serif`; c.textAlign = 'left';
      ['Asansör yoktur.', 'Kapıcı kapı açmaz.', 'Otomat on saniyedir.', 'Bunlara rağmen', 'Yılmaz Bey', 'aidat öder.'].forEach((t, i) => c.fillText(t, w * 0.1, h * (0.25 + i * 0.1)));
      c.strokeStyle = '#1e3a8a'; c.lineWidth = 2; c.beginPath(); c.moveTo(w * 0.5, h * 0.9); c.bezierCurveTo(w * 0.6, h * 0.8, w * 0.7, h * 0.95, w * 0.85, h * 0.86); c.stroke();
      c.fillStyle = '#b91c1c'; c.beginPath(); c.arc(w * 0.25, h * 0.88, h * 0.06, 0, 7); c.fill();
    });
    sets.flags['B.belge'] = { obj: belge, def: false };
    framePic(g, 0.5, 0.65, -0.9, 1.75, -2.97, (c, w, h) => {
      c.fillStyle = '#e8d8b8'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7a5a3a'; c.beginPath(); c.arc(w / 2, h * 0.4, w * 0.22, 0, 7); c.fill();
      c.fillRect(w * 0.25, h * 0.62, w * 0.5, h * 0.4);
    });
    floorLamp(g, -1.6, -2.65, sets, 'B');
    plant(g, 3.6, 2.6, 0.9);
    // televizyon (sağ duvar, önde) — ekranı bölüme göre değişir
    box(0.55, 0.5, 1.6, '#4a3424', 4.15, 0.25, 1.3, g);
    box(0.08, 0.8, 1.36, '#111', 4.22, 0.95, 1.3, g);
    const tvB = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.7), basic('#ffffff'));
    tvB.position.set(4.17, 0.95, 1.3); tvB.rotation.y = -Math.PI / 2; g.add(tvB);
    sets.tvB = { mesh: tvB, tex: tvScreens(), cur: null };
    sets.flags['B.tv'] = { screen: true, def: 'off' };
    // modem rafı boş (modem Necmi Bey'de)
    box(0.35, 0.03, 0.25, '#7a5a3a', 3.0, 1.2, -2.85, g);
    sets.doors.B = doorLeaf('#6e4a30');
    g.add(sets.doors.B);
    box(0.14, 0.1, 1.2, '#4a3424', -4.5, 2.15, 0.6, g);
    box(0.14, 2.15, 0.08, '#4a3424', -4.5, 1.07, 0.06, g);
    box(0.14, 2.15, 0.08, '#4a3424', -4.5, 1.07, 1.14, g);
    box(0.05, 2.4, 1.6, '#b9c7a8', -5.6, 1.2, 0.6, g, { cast: false });
    box(1.2, 2.4, 0.05, '#b9c7a8', -5.0, 1.2, -0.2, g, { cast: false });
  }

  // ---------------------------------------------------------------- C: Koridor
  {
    const g = new THREE.Group(); g.position.set(...O('C')); scene.add(g); sets.groups.C = g;
    const fm = mat('#ffffff', { map: tileTex('#d9d3c3', '#a89f8c', 8) }); fm.map.repeat.set(3, 3);
    const wtex = twoToneTex('#e4ead8', '#7f9a76');
    const wm = mat('#ffffff', { map: wtex });
    // koridor: arka duvar z=-2.5, iki kapı boşluğu
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 7), fm);
    fl.rotation.x = -Math.PI / 2; fl.position.set(-0.4, 0, 0.6); fl.receiveShadow = true; g.add(fl);
    const back = wallMesh(10, 3.4, [[-2.5, -1.5, 0, 2.1], [1.7, 2.7, 0, 2.1]], wm);
    // uv'yi iki ton için dikeyde ölçekle
    const uv = back.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 2 / 3.4);
    back.position.set(0, 0, -2.5); g.add(back);
    addCeiling(g, 16, 7, 3.4, 1.5, 0.9, '#f2f0e8');
    if (STYLE === 'pbr') {
      const fw = wallMesh(12, 3.4, [], wm); fw.rotation.y = Math.PI; fw.position.set(1.0, 0, 4.1); g.add(fw);
      const uvf = fw.geometry.attributes.uv; for (let i = 0; i < uvf.count; i++) uvf.setY(i, uvf.getY(i) * 2 / 3.4);
    }
    const left = wallMesh(7, 3.4, [], wm);
    left.geometry.attributes.uv.array.forEach((_, i, a) => { if (i % 2) a[i] = a[i] * 2 / 3.4; });
    left.rotation.y = Math.PI / 2; left.position.set(-4.9, 0, 1.0); g.add(left);
    // kapıların arkası: daire içleri (sıcak ışık)
    box(1.2, 2.2, 0.05, '#e8d9b8', -2.0, 1.1, -3.6, g, { cast: false });
    box(1.2, 2.2, 0.05, '#d8c8a8', 2.2, 1.1, -3.6, g, { cast: false });
    box(0.05, 2.2, 1.1, '#e0d0b0', -2.6, 1.1, -3.05, g, { cast: false });
    box(0.05, 2.2, 1.1, '#e0d0b0', -1.4, 1.1, -3.05, g, { cast: false });
    box(0.05, 2.2, 1.1, '#d0c0a0', 1.6, 1.1, -3.05, g, { cast: false });
    box(0.05, 2.2, 1.1, '#d0c0a0', 2.8, 1.1, -3.05, g, { cast: false });
    const inF = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), mat('#b08a60'));
    inF.rotation.x = -Math.PI / 2; inF.position.set(-2.0, 0.003, -3.05); g.add(inF);
    const inF2 = inF.clone(); inF2.position.x = 2.2; g.add(inF2);
    // kapı kasaları
    for (const cx of [-2.0, 2.2]) {
      box(1.2, 0.1, 0.14, '#5a3d25', cx, 2.15, -2.5, g);
      box(0.08, 2.15, 0.14, '#5a3d25', cx - 0.56, 1.07, -2.5, g);
      box(0.08, 2.15, 0.14, '#5a3d25', cx + 0.56, 1.07, -2.5, g);
      // paspas
      const mt = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.6), mat('#ffffff', {
        map: canvasTex(190, 120, (c, w, h) => {
          c.fillStyle = cx < 0 ? '#8b5a2b' : '#5b3a6b'; c.fillRect(0, 0, w, h);
          c.strokeStyle = '#e8d4a8'; c.lineWidth = 5; c.strokeRect(8, 8, w - 16, h - 16);
          c.fillStyle = '#f4e4c0'; c.font = 'bold 20px DejaVu Sans, sans-serif'; c.textAlign = 'center';
          c.fillText('HOŞ GELDİNİZ', w / 2, h / 2 + 7);
        }),
      }));
      mt.rotation.x = -Math.PI / 2; mt.position.set(cx, 0.006, -2.0); mt.receiveShadow = true; g.add(mt);
    }
    sets.doors.C7 = doorLeaf('#7b5236', { number: '7' });
    sets.doors.C8 = doorLeaf('#6a4a6a', { number: '8' });
    g.add(sets.doors.C7, sets.doors.C8);
    // sağda merdiven boşluğu: korkuluk ve aşağı inen basamaklar
    box(0.08, 1.0, 0.08, '#4a3424', 4.1, 0.5, -2.4, g);
    box(0.08, 1.0, 0.08, '#4a3424', 4.1, 0.5, 2.4, g);
    const rl = box(0.08, 0.08, 4.8, '#6b4a2e', 4.1, 1.0, 0, g);
    for (let i = 0; i < 12; i++) cyl(0.015, 0.015, 0.95, '#333', 4.1, 0.48, -2.2 + i * 0.4, g, 6);
    rl.castShadow = false;
    // merdiven dışı (aşağı kat boşluğu) karanlık
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(3, 7), basic('#2b2f2a'));
    pit.rotation.x = -Math.PI / 2; pit.position.set(5.7, -0.8, 0.5); g.add(pit);
    const wallR = wallMesh(7, 5, [], wm); wallR.rotation.y = -Math.PI / 2; wallR.position.set(7.0, -1.2, 1); g.add(wallR);
    const wallB2 = wallMesh(2.2, 4.6, [], wm); wallB2.position.set(6.0, -1.2, -2.5); g.add(wallB2);
    // elektrik sayacı, otomat düğmesi, lamba
    box(0.55, 0.7, 0.12, '#c9c9c9', 0.1, 1.9, -2.44, g);
    box(0.45, 0.2, 0.02, '#333', 0.1, 2.0, -2.37, g);
    box(0.08, 0.12, 0.03, '#f5f5f5', -0.9, 1.25, -2.48, g);
    sph(0.025, mat('#ff6a3d', { emissive: '#ff3d00', emissiveIntensity: 0.8 }), -0.9, 1.25, -2.46, g, 8);
    const cl = sph(0.16, mat('#fff7e0', { emissive: '#fff1c0', emissiveIntensity: 0.9 }), 0, 3.38, -0.8, g);
    ceilingLight(g, sets, 'C', 0, 3.1, -0.6);
    cl.scale.y = 0.5; cl.castShadow = false;
    plant(g, 3.3, -2.0, 0.9);
    const notice = textPlane(0.42, 0.56, (c, w, h) => {
      c.fillStyle = '#fdfcf6'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#b91c1c'; c.font = `bold ${h * 0.06}px DejaVu Sans, sans-serif`; c.textAlign = 'center';
      c.fillText('OLAĞANÜSTÜ', w / 2, h * 0.12); c.fillText('TOPLANTI', w / 2, h * 0.2);
      c.fillStyle = '#333'; for (let i = 0; i < 8; i++) c.fillRect(w * 0.12, h * (0.3 + i * 0.07), w * (0.5 + ((i * 13) % 5) * 0.06), h * 0.018);
      c.fillStyle = '#c8a24a'; c.beginPath(); c.arc(w / 2, h * 0.035, h * 0.018, 0, 7); c.fill();
    }, 256);
    notice.position.set(1.0, 1.5, -2.47); g.add(notice);
    sets.flags['C.notice'] = { obj: notice, def: false };
    // ayakkabılık
    box(0.8, 0.45, 0.35, '#8a6a4a', -3.6, 0.225, -2.3, g);
    box(0.25, 0.08, 0.12, '#222', -3.75, 0.49, -2.25, g);
    box(0.25, 0.08, 0.12, '#7a2a2a', -3.45, 0.49, -2.25, g);
  }

  // ---------------------------------------------------------------- D: Giriş
  {
    const g = new THREE.Group(); g.position.set(...O('D')); scene.add(g); sets.groups.D = g;
    const fm = mat('#ffffff', { map: tileTex('#cfc6b4', '#e4ddcf', 10) }); fm.map.repeat.set(3, 3);
    const wtex = twoToneTex('#efe6cf', '#a3825c');
    const wm = mat('#ffffff', { map: wtex });
    const r = room(g, { w: 10, d: 6, h: 3.6, floorMat: fm, wallMat: wm, backHoles: [[-0.8, 0.8, 0, 2.3]], skirt: '#5b4636' });
    r.children.forEach((m) => {
      if (m.geometry && m.geometry.type === 'ShapeGeometry') {
        const uv = m.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 2 / 3.6);
      }
    });
    // cam giriş kapısı (dışarısı aydınlık)
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), basic('#dff1ff'));
    outside.position.set(0, 1.4, -3.4); g.add(outside);
    sets.skies.push({ mesh: outside, set: 'D', bright: true });
    for (const s of [-1, 1]) {
      box(0.05, 2.3, 0.08, '#333', s * 0.8, 1.15, -3, g);
      const glass = box(0.76, 2.2, 0.03, mat('#bcdff0', { transparent: true, opacity: 0.35 }), s * 0.4, 1.12, -3, g);
      glass.castShadow = false;
      box(0.04, 0.3, 0.06, '#aaa', s * 0.06, 1.1, -2.95, g);
    }
    box(1.7, 0.08, 0.1, '#333', 0, 2.3, -3, g);
    // paspas
    const mt = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), mat('#444'));
    mt.rotation.x = -Math.PI / 2; mt.position.set(0, 0.006, -2.5); g.add(mt);
    // posta kutuları (sağ duvar)
    const mb = new THREE.Group(); mb.position.set(4.92, 1.35, 0.6); mb.rotation.y = -Math.PI / 2; g.add(mb);
    box(1.6, 0.9, 0.2, '#8c7a5a', 0, 0, 0, mb);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      box(0.34, 0.24, 0.03, '#b8a47a', -0.6 + i * 0.4, 0.28 - j * 0.28, 0.11, mb);
      box(0.12, 0.03, 0.02, '#333', -0.6 + i * 0.4, 0.33 - j * 0.28, 0.13, mb);
    }
    // duyuru panosu
    framePic(g, 0.9, 0.65, 1.6, 1.75, -2.97, (c, w, h) => {
      c.fillStyle = '#c9a26b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fffbea'; c.fillRect(w * 0.06, h * 0.08, w * 0.55, h * 0.84);
      c.fillStyle = '#b22222'; c.font = `bold ${h * 0.12}px DejaVu Sans, sans-serif`; c.fillText('DUYURU', w * 0.12, h * 0.25);
      c.fillStyle = '#222'; c.font = `${h * 0.075}px DejaVu Sans, sans-serif`;
      ['Aidatlar ayın 5\'ine', 'kadar Remzi Ef.\'ye', 'ödenecektir.', '— Yönetim'].forEach((s, i) => c.fillText(s, w * 0.1, h * (0.42 + i * 0.13)));
      c.fillStyle = '#fef08a'; c.fillRect(w * 0.66, h * 0.15, w * 0.28, h * 0.35);
      c.fillStyle = '#222'; c.font = `${h * 0.07}px DejaVu Sans, sans-serif`; c.fillText('Asansör', w * 0.68, h * 0.28); c.fillText('yoktur.', w * 0.68, h * 0.4);
    });
    // kapıcı masası ve sandalye
    const desk = new THREE.Group(); desk.position.set(2.6, 0, -1.45); g.add(desk);
    box(1.4, 0.05, 0.7, '#6b4a2e', 0, 0.75, 0, desk);
    box(1.36, 0.7, 0.04, '#5a3d25', 0, 0.38, 0.33, desk);
    box(0.04, 0.73, 0.66, '#5a3d25', -0.67, 0.37, 0, desk);
    box(0.04, 0.73, 0.66, '#5a3d25', 0.67, 0.37, 0, desk);
    // radyo, çaydanlık, çay
    box(0.3, 0.18, 0.12, '#7a2a2a', 0.45, 0.87, -0.15, desk);
    sph(0.035, '#ddd', 0.5, 0.9, -0.08, desk, 8);
    cyl(0.1, 0.12, 0.2, '#d0d0d0', -0.4, 0.88, -0.1, desk);
    cyl(0.07, 0.09, 0.12, '#c8c8c8', -0.4, 1.04, -0.1, desk);
    cyl(0.03, 0.025, 0.08, mat('#b5481c', { transparent: true, opacity: 0.85 }), -0.1, 0.82, 0.1, desk, 10);
    const chair = new THREE.Group(); chair.position.set(2.6, 0, -2.15); g.add(chair);
    box(0.5, 0.05, 0.5, '#3a5a7a', 0, 0.44, 0, chair);
    box(0.5, 0.5, 0.05, '#3a5a7a', 0, 0.7, -0.24, chair);
    for (const [a, b] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) box(0.04, 0.44, 0.04, '#333', a, 0.22, b, chair);
    // merdiven (sol arka, yukarı çıkar)
    stairs(g, { x: -3.85, z0: -3.0, z1: -0.8, w: 1.2, y0: 1.6, y1: 0, n: 9 });
    box(1.2, 0.2, 2.3, '#b9b1a2', -3.85, 1.5, -4.1, g);
    plant(g, -1.6, -2.6, 1.0);
    // asma lamba
    const cl = sph(0.18, mat('#fff7e0', { emissive: '#fff1c0', emissiveIntensity: 0.9 }), 0, 3.55, -0.8, g);
    ceilingLight(g, sets, 'D', 0, 3.2, -0.6);
    cl.scale.y = 0.5; cl.castShadow = false;
  }

  // ---------------------------------------------------------------- E: Sokak
  {
    const g = new THREE.Group(); g.position.set(...O('E')); scene.add(g); sets.groups.E = g;
    // zemin: kaldırım + yol
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(60, 3.2), mat('#ffffff', { map: tileTex('#c8c3b8', '#b5afa2', 8) }));
    sw.material.map.repeat.set(30, 1.6);
    sw.rotation.x = -Math.PI / 2; sw.position.set(0, 0.12, 0.0); sw.receiveShadow = true; g.add(sw);
    box(60, 0.12, 0.15, '#9a948a', 0, 0.06, 1.6, g, { cast: false });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 9), mat('#4a4a4e'));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.0, 6.1); road.receiveShadow = true; g.add(road);
    for (let i = -14; i < 15; i++) box(1.4, 0.01, 0.15, '#e8e8e8', i * 2.2, 0.01, 6.0, g, { cast: false });
    // apartman cephesi
    const facade = new THREE.Group(); facade.position.set(0, 0.12, -1.6); g.add(facade);
    box(12, 13, 0.4, '#e9c9a0', 0, 6.5, -0.2, facade);
    box(12.4, 0.3, 0.6, '#c9a982', 0, 13.0, -0.1, facade);
    for (let fl = 0; fl < 5; fl++) {
      const y = 1.9 + fl * 2.4 + (fl > 0 ? 0.5 : 0);
      for (const x of [-4.4, -2.4, 2.4, 4.4]) {
        if (fl === 0 && Math.abs(x) < 3) continue;
        const win = box(1.1, 1.3, 0.05, mat('#a8c8e0', { emissive: '#203040', emissiveIntensity: 0.2 }), x, y + 0.6, 0.02, facade, { cast: false });
        box(1.25, 0.08, 0.2, '#f4f1ea', x, y - 0.08, 0.06, facade);
        box(0.06, 1.3, 0.06, '#f4f1ea', x, y + 0.6, 0.06, facade);
        if (fl > 0 && (x === 2.4 || x === -2.4)) {
          box(2.0, 0.12, 0.8, '#cfcfcf', x, y - 0.25, 0.4, facade);
          box(2.0, 0.6, 0.04, '#5a5a5a', x, y + 0.05, 0.8, facade);
        }
        // perde rengi
        if ((fl + x) % 3 === 0) box(0.35, 1.2, 0.02, '#c0574a', x - 0.35, y + 0.6, 0.05, facade, { cast: false });
      }
    }
    // giriş kapısı ve saçak
    box(1.8, 2.5, 0.08, '#3a3a3a', 0, 1.25, 0.05, facade);
    box(0.8, 2.3, 0.04, mat('#cfe6f2', { transparent: true, opacity: 0.6 }), -0.42, 1.15, 0.1, facade);
    box(0.8, 2.3, 0.04, mat('#cfe6f2', { transparent: true, opacity: 0.6 }), 0.42, 1.15, 0.1, facade);
    box(2.6, 0.12, 1.2, '#7a7a7a', 0, 2.7, 0.55, facade);
    const sign = textPlane(2.2, 0.45, (c, w, h) => {
      c.fillStyle = '#1e3a5f'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f2d16b'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#f8f3e0'; c.font = `bold ${h * 0.52}px DejaVu Serif, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('HUZUR APARTMANI', w / 2, h * 0.55);
    });
    sign.position.set(0, 3.1, 0.03); facade.add(sign);
    const no = textPlane(0.35, 0.25, (c, w, h) => {
      c.fillStyle = '#1e5aa8'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `bold ${h * 0.7}px DejaVu Sans`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('12', w / 2, h / 2);
    }, 64);
    no.position.set(1.3, 2.2, 0.03); facade.add(no);
    // basamak
    box(2.4, 0.12, 0.5, '#b5afa2', 0, 0.06, 0.4, facade);
    // komşu binalar
    box(10, 16, 6, '#c7d3dd', -11.5, 8, -4.6, g);
    box(10, 11, 6, '#d9b8b8', 11.5, 5.5, -4.6, g);
    for (const [bx, cols, rows, base] of [[-11.5, 4, 6, '#9fb7c9'], [11.5, 4, 4, '#a9c2d6']]) {
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        box(1.0, 1.2, 0.05, base, bx - 3.6 + i * 2.4, 2 + j * 2.4, -1.58, g, { cast: false });
      }
    }
    // sokak lambası
    const lamp = new THREE.Group(); lamp.position.set(-12.5, 0.12, 1.2); g.add(lamp);
    cyl(0.07, 0.1, 4.6, '#2f3a40', 0, 2.3, 0, lamp, 10);
    box(0.9, 0.08, 0.08, '#2f3a40', 0.4, 4.55, 0, lamp);
    box(0.4, 0.15, 0.25, '#2f3a40', 0.8, 4.48, 0, lamp);
    // ağaç
    const tree = new THREE.Group(); tree.position.set(4.6, 0.12, 0.9); g.add(tree);
    cyl(0.14, 0.2, 2.6, '#6b4a2e', 0, 1.3, 0, tree, 10);
    for (const [a, b, c2, r] of [[0, 3.2, 0, 1.1], [0.6, 2.8, 0.3, 0.8], [-0.6, 2.9, -0.2, 0.85], [0.1, 3.8, 0.1, 0.8]]) sph(r, '#4f8f3a', a, b, c2, tree, 12);
    cyl(0.6, 0.6, 0.02, '#5b4636', 0, 0.01, 0, tree);
    // gökyüzü ve uzak tepeler
    const skyBg = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), basic('#ffffff', {
      map: canvasTex(16, 256, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#5aa0de'); gr.addColorStop(0.7, '#bfe0f7'); gr.addColorStop(1, '#eaf6ff');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
      }),
    }));
    skyBg.position.set(0, 20, -30); g.add(skyBg);
    sets.streetSky = skyBg;
    // minibüs
    const van = new THREE.Group(); van.position.set(-30, 0, 3.6); g.add(van);
    box(4.2, 1.9, 1.9, '#f2f2f2', 0, 1.35, 0, van);
    box(1.3, 1.2, 1.9, '#f2f2f2', 2.65, 1.0, 0, van);
    box(0.05, 0.75, 1.6, mat('#2a3a4a', { emissive: '#1a2a3a', emissiveIntensity: 0.3 }), 3.3, 1.35, 0, van);
    box(4.2, 0.35, 1.92, '#d62828', 0, 0.55, 0, van);
    for (const [wx, wz] of [[-1.3, 0.95], [1.9, 0.95], [-1.3, -0.95], [1.9, -0.95]]) {
      const w = cyl(0.38, 0.38, 0.25, '#222', wx, 0.38, wz, van, 14); w.rotation.x = Math.PI / 2;
      const hc = cyl(0.18, 0.18, 0.26, '#aaa', wx, 0.38, wz, van, 10); hc.rotation.x = Math.PI / 2;
    }
    const vanText = textPlane(3.6, 1.0, (c, w, h) => {
      c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d62828'; c.font = `bold ${h * 0.36}px DejaVu Sans, sans-serif`; c.textAlign = 'center';
      c.fillText('HÜSNÜ ÇİLİNGİR', w / 2, h * 0.42);
      c.fillStyle = '#1e3a5f'; c.font = `bold ${h * 0.28}px DejaVu Sans, sans-serif`;
      c.fillText('7/24  •  0 555 KAPI AÇ', w / 2, h * 0.82);
    });
    vanText.position.set(-0.1, 1.5, 0.96); van.add(vanText);
    // anahtar sembolü
    const sym = textPlane(0.7, 0.7, (c, w, h) => {
      c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#d62828'; c.lineWidth = 14; c.beginPath(); c.arc(w * 0.3, h * 0.5, w * 0.17, 0, 7); c.stroke();
      c.fillStyle = '#d62828'; c.fillRect(w * 0.45, h * 0.45, w * 0.45, h * 0.1); c.fillRect(w * 0.75, h * 0.55, w * 0.08, h * 0.15);
    }, 128);
    sym.position.set(2.65, 1.25, 0.96); van.add(sym);
    sets.van = van;
  }

  // ---------------------------------------------------------------- F: Bakkal
  {
    const g = new THREE.Group(); g.position.set(...O('F')); scene.add(g); sets.groups.F = g;
    const fm = mat('#ffffff', { map: tileTex('#d6d6cc', '#b9b9ad', 10) }); fm.map.repeat.set(3, 3);
    const wtex = twoToneTex('#f1e3b5', '#c98f4a', 0.3);
    const wm = mat('#ffffff', { map: wtex });
    const r = room(g, { w: 9, d: 6, h: 3.4, floorMat: fm, wallMat: wm, backHoles: [[-1.2, 1.2, 0.0, 2.4]], leftHoles: [[0.1, 1.1, 0, 2.15]], skirt: '#6b4a2e', ceil: '#efefe8' });
    r.children.forEach((m) => {
      if (m.geometry && m.geometry.type === 'ShapeGeometry') {
        const uv = m.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 2 / 3.4);
      }
    });
    // vitrin camı + dışarısı
    const out = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.0), basic('#1b2848'));
    out.position.set(0, 1.3, -3.5); g.add(out);
    sets.skies.push({ mesh: out, set: 'F' });
    box(0.06, 2.4, 0.08, '#2b2b2b', 0, 1.2, -3.0, g);
    box(2.5, 0.08, 0.1, '#2b2b2b', 0, 2.4, -3.0, g);
    const glass = box(2.4, 2.4, 0.02, mat('#a7c8dd', { transparent: true, opacity: 0.25 }), 0, 1.2, -3.0, g); glass.castShadow = false;
    // vitrin yazısı (içeriden ters okunur — o yüzden içeriye dönük ikinci tabela)
    const sign = textPlane(3.4, 0.55, (c, w, h) => {
      c.fillStyle = '#1f6b3a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f2d16b'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#fff8e0'; c.font = `bold ${h * 0.5}px DejaVu Serif, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText("ŞÜKRÜ'NÜN YERİ", w / 2, h * 0.54);
    });
    sign.position.set(0, 2.85, -2.97); g.add(sign);
    // raflar (sol arka ve sol duvar)
    const prodCols = ['#e63946', '#f1c40f', '#2a9d8f', '#e76f51', '#457b9d', '#8ac926', '#ffffff', '#ff8fab', '#6a4c93'];
    const shelfUnit = (x, z, yaw, wdt) => {
      const u = new THREE.Group(); u.position.set(x, 0, z); u.rotation.y = yaw; g.add(u);
      box(wdt, 2.2, 0.08, '#8a6a45', 0, 1.1, -0.2, u);
      for (let rI = 0; rI < 5; rI++) {
        const y = 0.3 + rI * 0.45;
        box(wdt, 0.04, 0.4, '#a07d52', 0, y, 0, u);
        let px = -wdt / 2 + 0.08;
        for (let i = 0; px < wdt / 2 - 0.1; i++) {
          const kind = (i + rI) % 3;
          const col = prodCols[(i * 3 + rI * 5) % prodCols.length];
          if (kind === 0) { box(0.16, 0.24, 0.12, col, px + 0.08, y + 0.14, 0.02, u); px += 0.19; }
          else if (kind === 1) { cyl(0.05, 0.05, 0.22, col, px + 0.05, y + 0.13, 0.04, u, 10); px += 0.12; }
          else { box(0.12, 0.16, 0.16, col, px + 0.06, y + 0.1, 0.0, u); px += 0.15; }
        }
      }
    };
    shelfUnit(-2.9, -2.72, 0, 2.6);
    shelfUnit(-4.22, -1.3, Math.PI / 2, 1.9);
    shelfUnit(2.75, -2.72, 0, 1.2);
    // içecek dolabı (sağ arka)
    const fr = new THREE.Group(); fr.position.set(3.85, 0, -2.4); fr.rotation.y = -Math.PI / 2; g.add(fr);
    box(1.0, 2.0, 0.6, '#c62828', 0, 1.0, 0, fr);
    const frGlass = box(0.86, 1.6, 0.02, mat('#d8f0ff', { emissive: '#9fd8ff', emissiveIntensity: 0.5 }), 0, 1.05, 0.31, fr); frGlass.castShadow = false;
    for (let rI = 0; rI < 4; rI++) for (let i = 0; i < 6; i++) cyl(0.04, 0.04, 0.24, ['#2e7d32', '#ff9800', '#c62828', '#6d4c41'][(i + rI) % 4], -0.34 + i * 0.135, 0.4 + rI * 0.38, 0.2, fr, 8);
    const frLogo = textPlane(0.9, 0.22, (c, w, h) => { c.fillStyle = '#c62828'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `bold ${h * 0.6}px DejaVu Sans`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SOĞUK İÇECEK', w / 2, h / 2); });
    frLogo.position.set(0, 1.9, 0.32); fr.add(frLogo);
    // tezgâh (sağda, z boyunca) — Şükrü arkasında x≈3.1
    const ct = new THREE.Group(); ct.position.set(2.3, 0, -0.9); g.add(ct);
    box(0.7, 1.0, 2.6, '#b5651d', 0, 0.5, 0, ct);
    box(0.8, 0.05, 2.7, '#e8d9b0', 0, 1.02, 0, ct);
    box(0.02, 0.6, 2.4, '#9a5418', -0.36, 0.5, 0, ct);
    // yazar kasa
    const reg = new THREE.Group(); reg.position.set(0.1, 1.05, -0.8); ct.add(reg);
    box(0.4, 0.18, 0.35, '#3a3a3a', 0, 0.09, 0, reg);
    const disp = box(0.3, 0.14, 0.04, '#222', 0, 0.26, -0.05, reg); disp.rotation.x = -0.3;
    box(0.2, 0.05, 0.02, mat('#7cff7c', { emissive: '#3aff3a', emissiveIntensity: 0.8 }), 0, 0.27, -0.025, reg);
    // terazi, sakız kutusu, gazete
    box(0.3, 0.06, 0.3, '#ddd', 0.05, 1.08, 0.75, ct);
    box(0.24, 0.02, 0.24, '#aaa', 0.05, 1.12, 0.75, ct);
    for (let i = 0; i < 4; i++) box(0.1, 0.12, 0.1, prodCols[i + 2], -0.15 + (i % 2) * 0.12, 1.11, 0.15 + Math.floor(i / 2) * 0.12, ct);
    // ekmek sepeti (boş — "ekmek bitti")
    const bs = cyl(0.3, 0.22, 0.25, '#b8864b', -0.9, 0.12, 0.9, ct, 14); bs.scale.z = 0.6;
    // meyve kasaları (ön sol)
    for (const [x, col] of [[-3.3, '#e63946'], [-2.4, '#f4a261'], [-1.5, '#8ac926']]) {
      box(0.75, 0.3, 0.5, '#a07d52', x, 0.45, 1.6, g);
      box(0.06, 0.45, 0.06, '#7a5a3a', x - 0.33, 0.22, 1.4, g); box(0.06, 0.45, 0.06, '#7a5a3a', x + 0.33, 0.22, 1.4, g);
      for (let i = 0; i < 8; i++) sph(0.07, col, x - 0.26 + (i % 4) * 0.17, 0.66, 1.5 + Math.floor(i / 4) * 0.18, g, 8);
    }
    // duvar yazıları
    framePic(g, 0.9, 0.45, -0.1, 2.75, -1.0 + 0.0, (c, w, h) => {
      c.fillStyle = '#fffbea'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#b22222'; c.font = `bold ${h * 0.26}px DejaVu Serif, serif`; c.textAlign = 'center';
      c.fillText('Bugün peşin,', w / 2, h * 0.42); c.fillText('yarın veresiye.', w / 2, h * 0.8);
    }, 0).position.set(4.47, 2.0, 0.4);
    g.children[g.children.length - 1].rotation.y = -Math.PI / 2;
    // kapı kasası (sol) + zil
    box(0.14, 0.1, 1.2, '#5a3d25', -4.5, 2.2, 0.6, g);
    box(0.14, 2.2, 0.08, '#5a3d25', -4.5, 1.1, 0.06, g);
    box(0.14, 2.2, 0.08, '#5a3d25', -4.5, 1.1, 1.14, g);
    box(0.05, 2.4, 1.6, '#2a3046', -5.6, 1.2, 0.6, g, { cast: false });
    sph(0.05, '#d4af37', -4.4, 2.05, 0.3, g, 8);
    // floresanlar
    for (const z of [-1.6, 0.6]) {
      const tube = box(1.4, 0.06, 0.18, mat('#ffffff', { emissive: '#f4fbff', emissiveIntensity: 1.0 }), -0.5, 3.36, z, g, { cast: false });
      tube.castShadow = false;
    }
    ceilingLight(g, sets, 'F', -0.5, 3.1, -0.5, true, 7, '#f4fbff');
    ceilingLight(g, sets, 'F', 2.0, 3.0, -0.8, true, 4, '#fff3dc');
  }

  buildNecmiHome(scene, sets);
  return sets;
}

// ---------------------------------------------------------------- G: Necmi Bey'in evi
function buildNecmiHome(scene, sets) {
  const g = new THREE.Group(); g.position.set(...layout.G.origin); scene.add(g); sets.groups.G = g;
  const parquet = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#8a5a34'; c.fillRect(0, 0, w, h);
    const s = 64;
    for (let i = -8; i < 16; i++) for (let j = 0; j < 20; j++) {
      c.save(); c.translate(i * s + (j % 2) * s / 2, j * s / 2); c.rotate((j % 2 ? 1 : -1) * Math.PI / 4);
      const v = 120 + ((i * 37 + j * 53) % 40);
      c.fillStyle = `rgb(${v + 20},${v - 20},${v - 60})`; c.fillRect(0, 0, s * 0.95, s * 0.3);
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.strokeRect(0, 0, s * 0.95, s * 0.3); c.restore();
    }
  });
  parquet.wrapS = parquet.wrapT = THREE.RepeatWrapping; parquet.repeat.set(3, 3);
  const paper = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#e9dcbc'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * 64 + (j % 2) * 32 + 16, y = j * 64 + 20;
      c.fillStyle = '#b9a27a'; c.beginPath(); c.ellipse(x, y, 7, 11, 0.4, 0, 7); c.fill();
      c.fillStyle = '#7e8f5e'; c.beginPath(); c.ellipse(x + 9, y + 10, 4, 9, -0.6, 0, 7); c.fill(); c.beginPath(); c.ellipse(x - 9, y + 10, 4, 9, 0.6, 0, 7); c.fill();
      c.fillStyle = '#a0522d'; c.beginPath(); c.arc(x, y - 2, 3, 0, 7); c.fill();
    }
    c.fillStyle = 'rgba(120,90,50,0.08)'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 2, h);
  });
  paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
  room(g, { w: 9, d: 6, h: 3.2, floorMat: mat('#ffffff', { map: parquet, roughness: 0.55 }), wallMat: mat('#ffffff', { map: paper }),
    backHoles: [[0.6, 2.4, 1.0, 2.4]], leftHoles: [[0.1, 1.1, 0, 2.12]], skirt: '#5a3d25', ceil: '#f1ead8' });
  const sky = windowSky(g, 1.5, 1.7, -3.6, 1.8, 1.4); sets.skies.push({ mesh: sky, set: 'G' });
  windowFrame(g, 1.5, 1.7, -2.98, 1.8, 1.4);
  const lace = canvasTex(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(i * 32 + 16, j * 32 + 16, 11, 0, 7); c.stroke(); c.beginPath(); c.arc(i * 32 + 16, j * 32 + 16, 4, 0, 7); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, 0, w, h);
  });
  lace.wrapS = lace.wrapT = THREE.RepeatWrapping; lace.repeat.set(3, 3);
  const laceM = mat('#ffffff', { map: lace, transparent: true, side: THREE.DoubleSide, roughness: 0.9 });
  for (const s2 of [-1, 1]) { const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.6), laceM); lp.position.set(1.5 + s2 * 0.55, 1.65, -2.88); g.add(lp); }
  curtains(g, 1.5, 1.7, -2.98, 1.8, 1.4, '#7a2e2e');
  for (let i = 0; i < 10; i++) box(0.06, 0.6, 0.1, '#e9e6de', 0.9 + i * 0.13, 0.55, -2.92, g);
  const kilim = canvasTex(512, 320, (c, w, h) => {
    c.fillStyle = '#8c1c1c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e8c27a'; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
    c.strokeStyle = '#1f3a5f'; c.lineWidth = 6; c.strokeRect(34, 34, w - 68, h - 68);
    for (let i = 0; i < 5; i++) {
      const x = 80 + i * 88, y = h / 2;
      c.fillStyle = i % 2 ? '#1f3a5f' : '#e8c27a';
      c.beginPath(); c.moveTo(x, y - 60); c.lineTo(x + 34, y); c.lineTo(x, y + 60); c.lineTo(x - 34, y); c.closePath(); c.fill();
      c.fillStyle = '#8c1c1c'; c.beginPath(); c.moveTo(x, y - 24); c.lineTo(x + 13, y); c.lineTo(x, y + 24); c.lineTo(x - 13, y); c.closePath(); c.fill();
    }
  });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.6), mat('#ffffff', { map: kilim, roughness: 0.95 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.006, -0.9); rug.receiveShadow = true; g.add(rug);
  // oval masa + dantel örtü + masa zili + çay
  const tbl = new THREE.Group(); tbl.position.set(0, 0, -0.85); g.add(tbl);
  const top = cyl(0.62, 0.62, 0.05, '#6b4226', 0, 0.74, 0, tbl, 40); top.scale.x = 1.25;
  const cloth = cyl(0.5, 0.5, 0.006, mat('#ffffff', { map: lace, transparent: true, roughness: 0.9 }), 0, 0.768, 0, tbl, 40); cloth.scale.x = 1.25;
  cyl(0.06, 0.09, 0.7, '#5a3820', 0, 0.37, 0, tbl, 16);
  cyl(0.3, 0.34, 0.04, '#5a3820', 0, 0.02, 0, tbl, 24);
  const bell = new THREE.Group(); bell.position.set(0.0, 0.775, -0.42); tbl.add(bell);
  cyl(0.04, 0.045, 0.012, mat('#2a2a2a', { metalness: 0.5, roughness: 0.4 }), 0, 0.006, 0, bell, 20);
  sph(0.034, mat('#d4af37', { metalness: 0.95, roughness: 0.2 }), 0, 0.014, 0, bell, 20).scale.y = 0.75;
  cyl(0.006, 0.006, 0.02, mat('#d4af37', { metalness: 0.9, roughness: 0.25 }), 0, 0.045, 0, bell, 8);
  cyl(0.07, 0.09, 0.14, mat('#c0c0c0', { metalness: 0.8, roughness: 0.3 }), 0.35, 0.84, 0.1, tbl, 18);
  for (const [x, z] of [[-0.45, 0.05], [0.5, -0.15], [-0.15, 0.3]]) cyl(0.025, 0.02, 0.07, mat('#b5481c', { transparent: true, opacity: 0.85, roughness: 0.1 }), x, 0.81, z, tbl, 12);
  const sticky = (parent, x, y, z, ry = 0, rx = 0) => {
    const n = textPlane(0.09, 0.09, (c, w, h) => {
      c.fillStyle = '#fde047'; c.fillRect(0, 0, w, h); c.fillStyle = '#333'; c.font = `bold ${h * 0.2}px DejaVu Sans`; c.textAlign = 'center';
      c.fillText('Yılmaz', w / 2, h * 0.42); c.fillText('Bey', w / 2, h * 0.7);
    }, 64);
    n.position.set(x, y, z); n.rotation.set(rx, ry, 0); parent.add(n); return n;
  };
  // Yılmaz Bey'in dört sandalyesi
  const chair = (x, z, yaw) => {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = yaw; g.add(c);
    box(0.46, 0.05, 0.44, '#7a4a2a', 0, 0.42, 0, c);
    box(0.44, 0.04, 0.42, '#3f5d3a', 0, 0.46, 0.0, c);
    box(0.46, 0.55, 0.04, '#7a4a2a', 0, 0.72, -0.21, c);
    for (const [a, b] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) box(0.04, 0.42, 0.04, '#5a3820', a, 0.21, b, c);
    sticky(c, 0.0, 0.85, -0.185, Math.PI, 0);
    return c;
  };
  chair(-1.12, -0.65, Math.PI / 2);
  chair(1.12, -0.65, -Math.PI / 2);
  chair(0.0, -2.07, 0);
  const c4 = chair(-2.3, -2.5, 0.3);
  box(0.3, 0.12, 0.25, '#2c3e50', 0, 0.54, 0, c4);
  // Necmi Bey'in kadife koltuğu
  const arm = new THREE.Group(); arm.position.set(2.66, 0, -1.12); arm.rotation.y = -70 * Math.PI / 180; g.add(arm);
  const vel = mat('#6d1f2a', { roughness: 0.95 });
  box(0.85, 0.42, 0.8, vel, 0, 0.21, 0, arm); box(0.85, 0.8, 0.18, vel, 0, 0.62, -0.33, arm);
  box(0.16, 0.6, 0.8, vel, -0.43, 0.42, 0, arm); box(0.16, 0.6, 0.8, vel, 0.43, 0.42, 0, arm);
  const doily = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), mat('#ffffff', { map: lace, transparent: true }));
  doily.position.set(0, 0.98, -0.235); arm.add(doily);
  // vitrin
  const vit = new THREE.Group(); vit.position.set(-3.3, 0, -2.7); g.add(vit);
  box(1.4, 2.0, 0.45, '#5a3820', 0, 1.0, 0, vit);
  const vg = box(1.3, 1.1, 0.02, mat('#cfe7f5', { transparent: true, opacity: 0.22, roughness: 0.05 }), 0, 1.35, 0.23, vit); vg.castShadow = false;
  for (let r = 0; r < 2; r++) {
    box(1.3, 0.03, 0.4, '#6b4226', 0, 0.95 + r * 0.5, 0.0, vit);
    for (let i = 0; i < 6; i++) {
      const x = -0.55 + i * 0.22;
      if (i % 2) sph(0.06, mat('#f4f4f4', { roughness: 0.15 }), x, 1.05 + r * 0.5, 0.05, vit, 14).scale.y = 1.2;
      else cyl(0.04, 0.05, 0.14, mat(i % 4 ? '#2a5aa0' : '#f4f4f4', { roughness: 0.15 }), x, 1.04 + r * 0.5, 0.05, vit, 14);
    }
  }
  box(1.3, 0.55, 0.02, '#4a2e18', 0, 0.35, 0.23, vit);
  // tüplü televizyon
  const tvg = new THREE.Group(); tvg.position.set(3.6, 0, -2.45); tvg.rotation.y = -0.5; g.add(tvg);
  box(0.9, 0.55, 0.5, '#4a2e18', 0, 0.275, 0, tvg);
  box(0.72, 0.56, 0.55, '#2b2b2b', 0, 0.83, 0, tvg);
  const scr = box(0.56, 0.42, 0.01, mat('#1a2a3a', { emissive: '#2a4a6a', emissiveIntensity: 0.25, roughness: 0.1 }), 0, 0.84, 0.28, tvg); scr.castShadow = false;
  const doily2 = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), mat('#ffffff', { map: lace, transparent: true }));
  doily2.rotation.x = -Math.PI / 2; doily2.position.set(0, 1.115, 0); tvg.add(doily2);
  // Yılmaz Bey'in modemi (yanıp sönen ışıklar)
  const shelf = new THREE.Group(); shelf.position.set(-1.6, 1.25, -2.92); g.add(shelf);
  box(0.6, 0.03, 0.2, '#6b4226', 0, 0, 0.08, shelf);
  box(0.24, 0.05, 0.15, '#f2f2f2', 0, 0.04, 0.08, shelf);
  sets.modemLeds = [];
  for (let i = 0; i < 4; i++) sets.modemLeds.push(sph(0.007, mat('#22c55e', { emissive: '#22c55e', emissiveIntensity: 2 }), -0.08 + i * 0.05, 0.05, 0.158, shelf, 8));
  sticky(shelf, 0.2, 0.08, 0.17, -0.2);
  // matkap ve tava (konsolda, etiketli)
  const side = new THREE.Group(); side.position.set(-3.9, 0, 0.0); side.rotation.y = Math.PI / 2; g.add(side);
  box(1.4, 0.8, 0.45, '#6b4226', 0, 0.4, 0, side);
  const drill = new THREE.Group(); drill.position.set(-0.3, 0.86, 0.02); side.add(drill);
  box(0.22, 0.08, 0.07, '#1d4ed8', 0, 0.02, 0, drill); box(0.06, 0.14, 0.06, '#1d4ed8', -0.06, -0.06, 0, drill);
  cyl(0.008, 0.008, 0.08, mat('#999', { metalness: 0.9, roughness: 0.3 }), 0.15, 0.02, 0, drill, 8).rotation.z = Math.PI / 2;
  sticky(drill, 0.0, 0.1, 0.04, 0, 0);
  cyl(0.13, 0.11, 0.05, mat('#2b2b2b', { metalness: 0.4, roughness: 0.5 }), 0.35, 0.83, 0.0, side, 24);
  sticky(side, 0.35, 0.87, 0.14, 0, -0.6);
  // duvar saati
  const clock = new THREE.Group(); clock.position.set(-0.2, 2.35, -2.96); g.add(clock);
  cyl(0.22, 0.22, 0.05, '#5a3820', 0, 0, 0, clock, 32).rotation.x = Math.PI / 2;
  const face = textPlane(0.38, 0.38, (c, w, h) => {
    c.fillStyle = '#fbf6e6'; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 7); c.fill();
    c.fillStyle = '#222'; c.font = `bold ${h * 0.09}px DejaVu Serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; c.fillText(String(i), w / 2 + Math.sin(a) * w * 0.38, h / 2 - Math.cos(a) * h * 0.38); }
  }, 128);
  face.position.z = 0.027; clock.add(face);
  sets.clockHands = [];
  for (const [len, wdt] of [[0.1, 0.012], [0.15, 0.007], [0.16, 0.003]]) {
    const hp = new THREE.Group(); hp.position.z = 0.032 + sets.clockHands.length * 0.002; clock.add(hp);
    box(wdt, len, 0.004, wdt < 0.005 ? '#b91c1c' : '#111', 0, len / 2 - 0.02, 0, hp, { cast: false });
    sets.clockHands.push(hp);
  }
  for (const [x, y, wdt] of [[2.9, 2.0, 0.35], [3.4, 1.62, 0.3], [-2.4, 2.1, 0.32]]) {
    framePic(g, wdt, wdt * 1.25, x, y, -2.97, (c, w, h) => {
      c.fillStyle = '#c9b48a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#6b5a40'; c.beginPath(); c.arc(w / 2, h * 0.4, w * 0.2, 0, 7); c.fill(); c.fillRect(w * 0.25, h * 0.6, w * 0.5, h * 0.4);
      c.fillStyle = 'rgba(255,240,210,0.25)'; c.fillRect(0, 0, w, h);
    });
  }
  box(0.14, 0.1, 1.2, '#5a3d25', -4.5, 2.15, 0.6, g);
  box(0.14, 2.15, 0.08, '#5a3d25', -4.5, 1.07, 0.06, g);
  box(0.14, 2.15, 0.08, '#5a3d25', -4.5, 1.07, 1.14, g);
  box(0.05, 2.4, 1.6, '#4e5a48', -5.6, 1.2, 0.6, g, { cast: false });
  for (const [x, col] of [[-4.0, '#7a2e2e'], [-3.8, '#2e4a7a']]) for (const s2 of [-0.05, 0.05]) box(0.08, 0.04, 0.22, col, x + s2, 0.02, 1.7, g);
  plant(g, 3.8, 0.8, 1.2);
  // avize + lambader
  const chd = new THREE.Group(); chd.position.set(0, 2.75, -0.85); g.add(chd);
  cyl(0.01, 0.01, 0.45, '#8a6a3a', 0, 0.22, 0, chd, 6);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const sh = cyl(0.06, 0.09, 0.12, mat('#f6e7c8', { emissive: '#ffcf8a', emissiveIntensity: 1.2 }), Math.cos(a) * 0.25, -0.02, Math.sin(a) * 0.25, chd, 14); sh.castShadow = false;
  }
  ceilingLight(g, sets, 'G', 0, 2.5, -0.85, true, 7, '#ffcf96');
  floorLamp(g, 3.95, -0.3, sets, 'G');
  return g;
}

function ceilingLight(g, sets, key, x, y, z, always = false, power = 6, color = '#fff1d0') {
  const L = new THREE.PointLight(color, 0, 9, 1.4);
  L.position.set(x, y, z);
  g.add(L);
  sets.lamps.push({ light: L, key, shade: null, always, power });
}

// Yılmaz'ın televizyonunun ekran durumları
function tvScreens() {
  const W = 512, H = 288;
  const mk = (draw) => canvasTex(W, H, draw);
  const centerText = (c, txt, size, col, y) => { c.fillStyle = col; c.font = `bold ${size}px DejaVu Sans, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, W / 2, y); };
  const pitch = (c) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#2f8f3a' : '#37a043'; c.fillRect(i * W / 8, 0, W / 8, H); }
    c.strokeStyle = '#e8ffe8'; c.lineWidth = 3; c.strokeRect(20, 20, W - 40, H - 40);
    c.beginPath(); c.moveTo(W / 2, 20); c.lineTo(W / 2, H - 20); c.stroke();
    c.beginPath(); c.arc(W / 2, H / 2, 40, 0, 7); c.stroke();
    const pl = [[150, 120, '#d62828'], [200, 180, '#d62828'], [260, 140, '#f2f2f2'], [330, 110, '#f2f2f2'], [300, 200, '#d62828'], [380, 160, '#f2f2f2']];
    for (const [x, y, col] of pl) { c.fillStyle = col; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(270, 150, 4, 0, 7); c.fill();
  };
  const score = (c, s, time) => {
    c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(14, 12, 300, 34);
    c.fillStyle = '#fff'; c.font = 'bold 20px DejaVu Sans'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`DERBİ  ${s}`, 24, 29); c.fillStyle = '#f2b705'; c.fillText(time, 178, 29);
  };
  return {
    off: mk((c) => { c.fillStyle = '#15181d'; c.fillRect(0, 0, W, H); }),
    nosignal: mk((c) => {
      c.fillStyle = '#1d4ed8'; c.fillRect(0, 0, W, H);
      centerText(c, '⚠', 64, '#fff', H * 0.36);
      centerText(c, 'İnternet bağlantısı yok', 28, '#fff', H * 0.62);
      centerText(c, 'Modeminizi kontrol edin', 18, '#c7d7ff', H * 0.76);
    }),
    loading: mk((c) => {
      c.fillStyle = '#0d1117'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#f2b705'; c.lineWidth = 8; c.beginPath(); c.arc(W / 2, H * 0.42, 34, 0.3, 4.6); c.stroke();
      centerText(c, 'Bağlanıyor...', 24, '#fff', H * 0.75);
    }),
    match: mk((c) => { pitch(c); score(c, '0-0', "00:12"); }),
    match2: mk((c) => { pitch(c); score(c, '2-1', "MAÇ SONU"); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, H - 60, W, 44); centerText(c, 'MAÇ SONA ERDİ', 26, '#fff', H - 38); }),
    fish: mk((c) => {
      const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1e88c7'); gr.addColorStop(1, '#0a3a5c');
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
      for (const [x, y, s, col] of [[150, 130, 1.3, '#ffb703'], [320, 90, 0.9, '#fb8500'], [380, 190, 1.1, '#ffd166'], [230, 210, 0.7, '#8ecae6']]) {
        c.fillStyle = col; c.beginPath(); c.ellipse(x, y, 34 * s, 16 * s, 0, 0, 7); c.fill();
        c.beginPath(); c.moveTo(x - 30 * s, y); c.lineTo(x - 52 * s, y - 16 * s); c.lineTo(x - 52 * s, y + 16 * s); c.fill();
        c.fillStyle = '#000'; c.beginPath(); c.arc(x + 18 * s, y - 4 * s, 3, 0, 7); c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(40 + i * 33, 260 - (i * 37) % 200, 4, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, H - 50, W, 36);
      centerText(c, 'BALIKLARIN GİZLİ DÜNYASI', 22, '#fff', H - 32);
    }),
  };
}

// Anahtar modeli (karakterlerin elinde ve kâsede)
export function keyMesh() {
  const g = new THREE.Group();
  const m = mat('#e0c35a', { emissive: '#4a3a10', emissiveIntensity: 0.4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, 6, 14), m);
  g.add(ring);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.006), m);
  shaft.position.y = -0.055; g.add(shaft);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.006), m);
  bit.position.set(0.012, -0.08, 0); g.add(bit);
  const bit2 = bit.clone(); bit2.position.y = -0.06; g.add(bit2);
  return g;
}

// Zaman dilimine göre gökyüzü/lamba ayarı
const PBR_TIME = {
  night: { sky: '#0f1830', hemi: 0.18, sun: 0.12, sunColor: '#7d93d6', lamp: 9, tv: '#5d86c4', env: 0.12, exposure: 1.25 },
  morning: { sky: '#d6ebff', hemi: 0.75, sun: 2.4, sunColor: '#ffe9c8', lamp: 0, tv: '#20262f', env: 0.3, exposure: 0.95 },
  day: { sky: '#bfe0ff', hemi: 0.8, sun: 2.6, sunColor: '#fff6ea', lamp: 0, tv: '#20262f', env: 0.32, exposure: 0.92 },
  evening: { sky: '#f3a86b', hemi: 0.55, sun: 1.6, sunColor: '#ffb27a', lamp: 0, tv: '#20262f', street: '#ffc49a', env: 0.22, exposure: 1.0 },
};
export function applyTimeOfDay(sets, setId, time, lights) {
  if (lights.engine >= 2) {
    const cfg = PBR_TIME[time || 'day'];
    if (sets.streetSky) sets.streetSky.material.color.set(cfg.street || '#ffffff');
    for (const s of sets.skies) if (!s.bright) s.mesh.material.color.set(cfg.sky);
    for (const l of sets.lamps) {
      const on = l.key === setId && (cfg.lamp > 0 || l.always);
      // fiziksel ışık birimleri: toon değerlerinin kabaca 1.6 katı
      l.light.intensity = on ? (l.power || cfg.lamp || 6) * 1.6 : 0;
      l.light.castShadow = false;
      // kapalı ışıklar gölgelendiriciden tamamen çıkarılsın (CPU'da her ışık pahalı)
      l.light.visible = on;
      if (l.shade) { l.shade.material.emissive?.set('#ffb766'); l.shade.material.emissiveIntensity = on ? 1.6 : 0.05; }
    }
    lights.hemi.intensity = cfg.hemi;
    lights.sun.intensity = cfg.sun;
    lights.sun.color.set(cfg.sunColor);
    if (lights.scene) lights.scene.environmentIntensity = cfg.env;
    if (lights.post) lights.post.setExposure(cfg.exposure);
    if (sets.tv) sets.tv.material.color.set(cfg.tv);
    return;
  }
  const cfg = {
    night: { sky: '#1b2848', hemi: 0.55, sun: 0.25, sunColor: '#8fa6ff', lamp: 9, tv: '#5d86c4' },
    morning: { sky: '#cfe6ff', hemi: 1.15, sun: 1.6, sunColor: '#fff1d6', lamp: 0, tv: '#20262f' },
    day: { sky: '#a9d6ff', hemi: 1.25, sun: 2.0, sunColor: '#ffffff', lamp: 0, tv: '#20262f' },
    evening: { sky: '#f3a86b', hemi: 0.9, sun: 1.2, sunColor: '#ffb27a', lamp: 0, tv: '#20262f', street: '#ffc49a' },
  }[time || 'day'];
  if (sets.streetSky) sets.streetSky.material.color.set(cfg.street || '#ffffff');
  for (const s of sets.skies) {
    if (s.bright) continue;
    s.mesh.material.color.set(cfg.sky);
  }
  for (const l of sets.lamps) {
    const on = l.key === setId && (cfg.lamp > 0 || l.always);
    l.light.intensity = on ? (l.power || cfg.lamp || 6) : 0;
    if (l.shade) l.shade.material.emissiveIntensity = on ? 0.9 : 0.15;
  }
  lights.hemi.intensity = cfg.hemi;
  lights.sun.intensity = cfg.sun;
  lights.sun.color.set(cfg.sunColor);
  if (sets.tv) sets.tv.material.color.set(cfg.tv);
}
