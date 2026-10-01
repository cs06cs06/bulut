// Kır eğlencesi sahnesi: açık çayır, pist, Daver Bey'in köşkü, seyirciler, davulcu, ağaçlar.
import * as THREE from 'three';
import { assets } from './assets.js';
import { TRACK } from './config.js';
import { MAT, paint, merge, personMesh } from './people.js';
import { createCharacter, bakePose, solveArmIK } from './characters.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Model setinden adıyla bir nesnenin kopyası
export function propClone(set, name) {
  const src = assets.models[set]?.getObjectByName(name);
  if (!src) return null;
  const o = src.clone(true);
  o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return o;
}

// Yaprak ve çimen için rüzgâr salınımı (örnek konumuna göre faz kayar)
const _windCache = new Map();
function windMaterial(mat, amp, U) {
  const key = mat.uuid + amp;
  if (_windCache.has(key)) return _windCache.get(key);
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 wp = vec3(0.0);
      #endif
      float hgt = max(position.y, 0.0);
      float sw = sin(uTime * 1.6 + wp.x * 0.3 + wp.z * 0.2 + position.y * 0.6) * 0.6 + sin(uTime * 3.1 + wp.z * 0.7 + position.x) * 0.25;
      transformed.x += sw * ${(0.035).toFixed(3)} * ${amp.toFixed(2)} * hgt;
      transformed.z += cos(uTime * 1.2 + wp.x * 0.2) * ${(0.02).toFixed(3)} * ${amp.toFixed(2)} * hgt;`);
  };
  m.customProgramCacheKey = () => 'wind' + amp;
  _windCache.set(key, m);
  return m;
}

// Statik birleştirme: bir gruptaki hareketsiz meshleri malzemeye göre tek mesh'e toplar (çizim çağrısını azaltır)
function staticBatch(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), victims = [];
  const visit = (o) => {
    if (o.userData.dynamic) return;
    if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !Array.isArray(o.material)) {
      const g = o.geometry.index ? o.geometry.clone() : o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const keep = ['position', 'normal', 'uv'];
      if (o.material.vertexColors) keep.push('color');
      for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const g2 = g.index ? g : g.toNonIndexed();
      if (!g2.index) { const n = g2.attributes.position.count, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g2.setIndex(new THREE.BufferAttribute(idx, 1)); }
      const key = o.material.uuid;
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [], shadow: false });
      const b = buckets.get(key); b.geos.push(g2); b.shadow ||= o.castShadow;
      victims.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(group);
  for (const o of victims) o.parent.remove(o);
  for (const { mat, geos, shadow } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
  }
}

// Sahte Tosun Paşa'nın altın apoletleri ve madalyaları
function addEpaulettes(c) {
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0b44a, metalness: 0.85, roughness: 0.3 });
  const parts = [new THREE.CylinderGeometry(0.075, 0.075, 0.02, 18)];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    parts.push(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 4).translate(Math.cos(a) * 0.07, -0.035, Math.sin(a) * 0.07));
  }
  const geo = mergeGeometries(parts);
  for (const n of ['upperarm_l', 'upperarm_r']) {
    const m = new THREE.Mesh(geo, gold);
    m.position.set(0, 0.03, 0);
    c.bones[n].add(m);
  }
}

const L = TRACK.length;
export const HALF = (TRACK.lanes * TRACK.laneWidth) / 2;
const rand = mulberry(7);
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rr = (a, b) => a + rand() * (b - a);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const Mx = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

export function groundHeight(x, z) {
  const ax = Math.abs(x);
  let h = smooth(18, 75, ax) * 14 + smooth(-80, -150, z) * 10 + smooth(40, 110, z) * 8;
  h += (Math.sin(x * 0.07) * Math.cos(z * 0.05) + Math.sin(x * 0.023 + z * 0.031) * 1.6) * smooth(14, 40, ax) * 2.2;
  return h;
}

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.updaters = [];
    this.animated = [];
    this.crowd = [];
    this.excite = 0.2;
    this.time = 0;
    this.build();
  }

  build() {
    this.lights();
    this.sky();
    this.ground();
    this.chalk();
    this.ropeFence();
    this.finishLine();
    this.kosk();
    this.crowdBuild();
    this.musicians();
    this.trees();
    this.grassField();
  }

  // ---------- Işık ----------
  lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5d6b2f, 0.55);
    s.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.7);
    sun.castShadow = true;
    const sz = this.quality === 'low' ? 512 : this.quality === 'medium' ? 1024 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    const c = sun.shadow.camera; c.left = -16; c.right = 16; c.top = 16; c.bottom = -16; c.near = 1; c.far = 120;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.sunOffset = new THREE.Vector3(-26, 42, 18);
    s.add(sun); s.add(sun.target);
    this.sun = sun;
  }

  // ---------- Gökyüzü: degrade + güneş parıltısı + kayan bulutlar ----------
  sky() {
    const sunDir = this.sunOffset.clone().normalize();
    this.skyU = { uSun: { value: sunDir }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 uSun; uniform float uTime;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 zenith = vec3(0.16, 0.36, 0.78), horizon = vec3(0.72, 0.80, 0.86), haze = vec3(0.62, 0.68, 0.62);
          vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
          col = mix(haze, col, smoothstep(-0.05, 0.08, h));
          float s = max(dot(d, normalize(uSun)), 0.0);
          col += vec3(1.0, 0.86, 0.62) * (pow(s, 900.0) * 30.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.08);
          vec2 uv = d.xz / (h + 0.18) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
          float c = fbm(uv) * 0.75 + fbm(uv * 3.1 - uTime * 0.01) * 0.25;
          float cloud = smoothstep(0.48, 0.78, c) * smoothstep(0.0, 0.22, h);
          vec3 cc = mix(vec3(0.78, 0.8, 0.84), vec3(1.0, 0.98, 0.95), smoothstep(0.5, 0.9, c)) + vec3(1.0, 0.9, 0.7) * pow(s, 6.0) * 0.4;
          col = mix(col, cc, cloud * 0.9);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), mat);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -10;
    this.scene.add(this.skyMesh);
    this.updaters.push((dt, t) => { this.skyU.uTime.value = t; });
  }

  followSun(target) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
  }

  // ---------- Zemin ----------
  ground() {
    const size = 340, seg = this.quality === 'low' ? 90 : 150;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, groundHeight(x, z));
      // biçilmiş pist şeritleri + doğal renk oynamaları
      const n = Math.sin(x * 0.31 + z * 0.17) * 0.5 + Math.sin(x * 0.07 - z * 0.13) * 0.5;
      let k = 0.92 + n * 0.08;
      const onTrack = Math.abs(x) < HALF + 0.4 && z < 12 && z > -L - 12;
      if (onTrack) {
        const lane = Math.floor((x + HALF) / TRACK.laneWidth);
        k *= lane % 2 ? 1.1 : 0.98;
        k *= 1.04;
      }
      const dry = smooth(30, 90, Math.abs(x)) * 0.35 + (onTrack ? 0 : smooth(-0.2, 1, n) * 0.12);
      c.setRGB(k * (1 + dry * 0.35), k * (1 - dry * 0.05), k * (1 - dry * 0.3));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const rep = size / 3.2;
    const map = assets.tex.grass.clone(); map.repeat.set(rep, rep); map.needsUpdate = true;
    const nor = assets.tex.grassNor.clone(); nor.repeat.set(rep, rep); nor.needsUpdate = true;
    const arm = assets.tex.grassArm.clone(); arm.repeat.set(rep, rep); arm.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      map, normalMap: nor, roughnessMap: arm, aoMap: arm, aoMapIntensity: 0.6,
      vertexColors: true, roughness: 1, metalness: 0, color: 0xc8d8a0, normalScale: new THREE.Vector2(0.8, 0.8),
    });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    this.scene.add(m);
    this.groundMesh = m;
  }

  // ---------- Kireç çizgiler ----------
  chalk() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const x = cv.getContext('2d');
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(255,255,250,${0.25 + Math.random() * 0.6})`;
      const px = 8 + Math.random() * 48 + (Math.random() - 0.5) * 10;
      x.fillRect(px, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 4);
    }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const list = [];
    const strip = (x0, z0, x1, z1, w) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.PlaneGeometry(w, len, 1, 1); g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 1.5);
      const ang = Math.atan2(x1 - x0, z1 - z0);
      g.applyMatrix4(Mx((x0 + x1) / 2, 0.012, (z0 + z1) / 2, 0, ang, 0));
      list.push(g);
    };
    strip(-HALF, 0, HALF, 0, 0.12);                  // başlangıç
    strip(-HALF, -L, HALF, -L, 0.16);                // bitiş
    for (let i = 0; i <= TRACK.lanes; i++) {
      const lx = -HALF + i * TRACK.laneWidth;
      for (let z = 2; z > -L - 2; z -= 2.2) strip(lx, z, lx, z - 1.3, 0.05);
    }
    const m = new THREE.Mesh(merge(list.map((g) => paint(g, 0xffffff))), mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.scene.add(m);
  }

  // ---------- Seyircileri pistten ayıran kazık ve ip çit ----------
  ropeFence() {
    const posts = [], ropes = [];
    const fx = HALF + 1.25, step = 2.6;
    for (const side of [-1, 1]) {
      const pts = [];
      for (let z = 6; z > -L - 6; z -= step) {
        if (side === -1 && z > -2.6 && z < 3.6) { if (pts.length > 1) ropes.push(pts.splice(0)); else pts.length = 0; continue; }
        posts.push(Mx(side * fx, 0.45, z, 0, rand() * 3, (rand() - 0.5) * 0.06));
        pts.push(new THREE.Vector3(side * fx, 0.86, z));
      }
      if (pts.length > 1) ropes.push(pts);
    }
    const postGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.9, 7);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.85, normalMap: assets.tex.hessianNor, normalScale: new THREE.Vector2(0.4, 0.4) });
    const im = new THREE.InstancedMesh(postGeo, wood, posts.length);
    posts.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.receiveShadow = true;
    this.scene.add(im);
    // kazıklar arasında hafifçe sarkan kenevir ip
    const geos = [];
    for (const pts of ropes) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], mid = a.clone().lerp(b, 0.5); mid.y -= 0.07;
        geos.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 8, 0.012, 5));
      }
    }
    const rope = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.95 }));
    rope.castShadow = true;
    this.scene.add(rope);
  }

  // ---------- Bitiş: direkler, bayraklı ip, kırmızı kurdele ----------
  finishLine() {
    const g = new THREE.Group(); g.position.z = -L; this.scene.add(g);
    const wood = 0x6b4a2b, px = HALF + 0.55;
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push(paint(new THREE.CylinderGeometry(0.06, 0.075, 3.0, 10), wood, Mx(s * px, 1.5, 0)));
      parts.push(paint(new THREE.SphereGeometry(0.1, 12, 8), 0xd9a441, Mx(s * px, 3.05, 0)));
      parts.push(paint(new THREE.ConeGeometry(0.03, 0.35, 8), 0xd9a441, Mx(s * px, 3.3, 0)));
    }
    // sarkan ip + üçgen flamalar
    const curve = new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((t) => new THREE.Vector3(t * px, 2.85 - (1 - t * t) * 0.35, 0)));
    parts.push(paint(new THREE.TubeGeometry(curve, 30, 0.012, 5), 0xeee3c8));
    const cols = [0xc0392b, 0xf4ecd8, 0x1e8449, 0xd9a441];
    const n = 18;
    for (let i = 1; i < n; i++) {
      const p = curve.getPointAt(i / n);
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.32, 0], 3));
      tri.setIndex([0, 1, 2, 2, 1, 0]);
      tri.computeVertexNormals();
      parts.push(paint(tri, cols[i % cols.length], Mx(p.x, p.y, p.z, 0, 0, (rand() - 0.5) * 0.15)));
    }
    // "BİTİŞ" pankartı
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const x = cv.getContext('2d');
    x.fillStyle = '#8f1d21'; x.fillRect(0, 0, 512, 96);
    x.strokeStyle = '#d9a441'; x.lineWidth = 6; x.strokeRect(6, 6, 500, 84);
    x.fillStyle = '#f6e7c1'; x.font = '60px "Lilita One", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('☾ BİTİŞ ✦', 256, 52);
    const bt = new THREE.CanvasTexture(cv); bt.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.48), new THREE.MeshStandardMaterial({ map: bt, side: THREE.DoubleSide, roughness: 0.9 }));
    banner.position.set(0, 2.45, 0.02); banner.castShadow = true;
    g.add(banner);
    const m = new THREE.Mesh(merge(parts), MAT.vc); m.castShadow = true; g.add(m);
    // kurdele: iki yarım, kazanan geçince kopar
    this.ribbon = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * px, 1.05, 0); g.add(piv);
      const r = new THREE.Mesh(new THREE.BoxGeometry(px, 0.06, 0.01), new THREE.MeshStandardMaterial({ color: 0xd4202a, roughness: 0.5 }));
      r.position.x = -s * px / 2; r.castShadow = true; piv.add(r);
      this.ribbon.push({ piv, s, ang: 0, vel: 0 });
    }
    this.ribbonBroken = false;
    this.updaters.push((dt, t) => {
      banner.rotation.x = Math.sin(t * 1.7) * 0.05;
      for (const rb of this.ribbon) {
        if (this.ribbonBroken) { rb.vel += (rb.s * -1.45 - rb.ang) * 30 * dt - rb.vel * 3 * dt; rb.ang += rb.vel * dt; }
        else rb.ang = Math.sin(t * 2 + rb.s) * 0.01;
        rb.piv.rotation.z = rb.ang;
      }
    });
  }

  breakRibbon() { if (!this.ribbonBroken) { this.ribbonBroken = true; for (const r of this.ribbon) r.vel = -r.s * 4; } }
  resetRibbon() { this.ribbonBroken = false; for (const r of this.ribbon) { r.ang = 0; r.vel = 0; } }

  // ---------- Daver Bey'in köşkü (kadife gölgelik + uzun masa) ----------
  kosk() {
    const g = new THREE.Group();
    g.position.set(HALF + 6.2, 0, -L + 13);
    this.scene.add(g);
    this.koskPos = g.position.clone();
    const W = 4.2, D = 8.0, H = 3.1; // x derinlik, z genişlik
    const velvet = assets.tex.velvet.clone(); velvet.repeat.set(2, 2); velvet.needsUpdate = true;
    const vn = assets.tex.velvetNor.clone(); vn.repeat.set(2, 2); vn.needsUpdate = true;
    const vMat = new THREE.MeshStandardMaterial({ map: velvet, normalMap: vn, color: 0xd23a3a, roughness: 0.85, side: THREE.DoubleSide });
    // çatı: sarkık kumaş
    const roof = new THREE.PlaneGeometry(W + 0.6, D + 0.6, 12, 20); roof.rotateX(-Math.PI / 2);
    const rp = roof.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i) / ((W + 0.6) / 2), z = rp.getZ(i) / ((D + 0.6) / 2);
      rp.setY(i, H + 0.35 - (1 - x * x) * 0.1 - (1 - z * z) * 0.25 + Math.abs(Math.sin(z * Math.PI * 3)) * 0.05);
    }
    roof.computeVertexNormals();
    const roofM = new THREE.Mesh(roof, vMat); roofM.castShadow = true; roofM.receiveShadow = true; g.add(roofM);
    // saçak: dalgalı kenar
    const val = (len, rotY, px, pz) => {
      const pg = new THREE.PlaneGeometry(len, 0.5, Math.ceil(len * 6), 2);
      const pp = pg.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i);
        if (y < 0) pp.setY(i, y - Math.abs(Math.sin(x * Math.PI / 0.8)) * 0.16);
        pp.setZ(i, Math.sin(x * 9) * 0.02);
      }
      pg.computeVertexNormals();
      const m = new THREE.Mesh(pg, vMat); m.position.set(px, H + 0.05, pz); m.rotation.y = rotY; m.castShadow = true; g.add(m);
    };
    val(D + 0.6, Math.PI / 2, -(W + 0.6) / 2, 0);
    val(D + 0.6, Math.PI / 2, (W + 0.6) / 2, 0);
    val(W + 0.6, 0, 0, (D + 0.6) / 2);
    val(W + 0.6, 0, 0, -(D + 0.6) / 2);
    // arka perde: kıvrımlı
    const cur = new THREE.PlaneGeometry(D, H, 60, 4);
    const cp = cur.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 7) * 0.07);
    cur.computeVertexNormals();
    const curM = new THREE.Mesh(cur, vMat); curM.position.set(W / 2, H / 2, 0); curM.rotation.y = -Math.PI / 2; curM.receiveShadow = true; g.add(curM);
    // direkler, püsküller, bağlı yan perdeler
    const parts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(paint(new THREE.CylinderGeometry(0.07, 0.09, H + 0.4, 12), 0x5a3a22, Mx(sx * W / 2, (H + 0.4) / 2, sz * D / 2)));
      parts.push(paint(new THREE.SphereGeometry(0.12, 12, 8), 0xd9a441, Mx(sx * W / 2, H + 0.5, sz * D / 2)));
      parts.push(paint(new THREE.ConeGeometry(0.04, 0.3, 8), 0xd9a441, Mx(sx * W / 2, H + 0.75, sz * D / 2)));
    }
    for (let i = 0; i <= 16; i++) {
      const z = -D / 2 - 0.3 + i * (D + 0.6) / 16;
      parts.push(paint(new THREE.ConeGeometry(0.035, 0.16, 6), 0xd9a441, Mx(-(W + 0.6) / 2 - 0.01, H - 0.32, z, Math.PI, 0, 0)));
    }
    g.add(personMesh(parts, MAT.vcShiny));
    for (const sz of [-1, 1]) {
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, H, 14, 4, true), vMat);
      drape.position.set(-W / 2 + 0.15, H / 2, sz * (D / 2 - 0.2)); drape.scale.z = 0.6; drape.castShadow = true; g.add(drape);
    }
    // halı
    const rug = document.createElement('canvas'); rug.width = 256; rug.height = 512;
    const rx = rug.getContext('2d');
    rx.fillStyle = '#7a1420'; rx.fillRect(0, 0, 256, 512);
    rx.strokeStyle = '#d9a441'; rx.lineWidth = 10; rx.strokeRect(14, 14, 228, 484);
    rx.strokeStyle = '#1e3a5f'; rx.lineWidth = 16; rx.strokeRect(34, 34, 188, 444);
    rx.fillStyle = '#d9a441';
    for (let y = 80; y < 460; y += 64) { rx.beginPath(); rx.moveTo(128, y - 26); rx.lineTo(160, y); rx.lineTo(128, y + 26); rx.lineTo(96, y); rx.closePath(); rx.fill(); }
    const rugT = new THREE.CanvasTexture(rug); rugT.colorSpace = THREE.SRGBColorSpace;
    const rugM = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, D - 0.4), new THREE.MeshStandardMaterial({ map: rugT, roughness: 1 }));
    rugM.rotation.x = -Math.PI / 2; rugM.position.y = 0.02; rugM.receiveShadow = true; g.add(rugM);

    // uzun masa: beyaz örtü + kırmızı püsküllü kordon
    const T = [];
    const tx = -0.6, tw = 0.9, tl = D - 1.0, th = 0.8;
    T.push(paint(new THREE.BoxGeometry(tw, 0.04, tl), 0xf7f3ea, Mx(tx, th, 0)));
    T.push(paint(new THREE.BoxGeometry(tw + 0.08, th - 0.05, tl + 0.08), 0xf2ede2, Mx(tx, (th - 0.05) / 2 + 0.03, 0)));
    const swag = [];
    const nS = 7;
    for (let i = 0; i < nS; i++) {
      const z0 = -tl / 2 + (i / nS) * tl, z1 = -tl / 2 + ((i + 1) / nS) * tl;
      const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(tx - tw / 2 - 0.05, th - 0.05, z0), new THREE.Vector3(tx - tw / 2 - 0.06, th - 0.32, (z0 + z1) / 2), new THREE.Vector3(tx - tw / 2 - 0.05, th - 0.05, z1));
      swag.push(paint(new THREE.TubeGeometry(c, 10, 0.014, 5), 0xb3202a));
      swag.push(paint(new THREE.ConeGeometry(0.03, 0.2, 7), 0xb3202a, Mx(tx - tw / 2 - 0.06, th - 0.17, z0, Math.PI, 0, 0)));
      swag.push(paint(new THREE.SphereGeometry(0.035, 8, 6), 0xd9a441, Mx(tx - tw / 2 - 0.06, th - 0.05, z0)));
    }
    const table = personMesh(T, MAT.vcSoft); table.receiveShadow = true; g.add(table);
    g.add(personMesh(swag, MAT.vc));
    // masa üstü: Poly Haven çay takımı, nar, elma, oymalı tabak, pirinç fener
    const onTable = (name, x, z, s = 1, ry = 0) => { const o = propClone('polyhaven', name); if (!o) return; o.position.set(tx + x, th + 0.02, z); o.scale.setScalar(s); o.rotation.y = ry; g.add(o); return o; };
    for (let i = 0; i < 5; i++) {
      const z = -tl / 2 + 0.7 + i * (tl - 1.4) / 4;
      onTable('carved_wooden_plate', -0.05, z, 1.1, i);
      for (let k = 0; k < 3; k++) onTable(k % 2 ? 'food_apple_01' : 'food_pomegranate_01', -0.05 + Math.cos(k * 2.1) * 0.06, z + Math.sin(k * 2.1) * 0.06, 1, k);
      if (i % 2 === 0) onTable('tea_set_01', -0.12, z + 0.45, 0.8, i * 1.3 + 0.4);
    }
    onTable('brass_diya_lantern', 0.1, -tl / 2 + 0.25, 1.2);
    onTable('brass_diya_lantern', 0.1, tl / 2 - 0.25, 1.2);
    onTable('wooden_bowl_01', 0.05, 0.05, 1.2);
    const basket = propClone('polyhaven', 'wicker_basket_01');
    if (basket) { basket.position.set(-W / 2 - 0.35, 0, D / 2 + 0.2); g.add(basket); }
    const barrel = propClone('props', 'Barrel_Apples');
    if (barrel) { barrel.position.set(-W / 2 - 0.3, 0, -D / 2 - 0.5); barrel.scale.setScalar(0.85); g.add(barrel); }

    // ileri gelenler: iskeletli karakterler masanın arkasında oturur, piste bakar (-X)
    const seatX = 0.32;
    const vip = [
      { z: -3.0, sex: 'm', main: 0x5f5f66, trim: 0x8a7a50, beard: true, hairColor: 0xd8d6cf, clip: 'Sitting_Idle_Loop' },           // Akil, Tellioğulları reisi
      { z: -1.9, sex: 'm', main: 0x6b4a2e, trim: 0xb08d3c, beard: true, clip: 'Sitting_Talking_Loop' },                            // Tellioğlu Lütfü
      { z: -0.75, sex: 'm', main: 0x14182c, trim: 0xe0b44a, pasa: true, clip: 'Sitting_Idle_Loop' },                               // sahte Tosun Paşa (Şaban)
      { z: 0.45, sex: 'f', main: 0xc0232e, trim: 0xe0b44a, scarf: 0xc8202b, clip: 'Sitting_Idle_Loop' },                           // Leyla
      { z: 1.6, sex: 'm', main: 0x1a2340, trim: 0xd9a441, beard: true, clip: 'Sitting_Talking_Loop' },                             // Daver Bey
      { z: 2.8, sex: 'm', main: 0x26442f, trim: 0x9a8a50, beard: true, clip: 'Sitting_Idle_Loop' },                                // Seferoğlu Sıtkı
    ];
    this.vips = [];
    for (const v of vip) {
      const c = createCharacter({ sex: v.sex, lod: this.quality === 'low' ? true : 'mid', hideLegs: true, main: v.main, trim: v.trim, scarf: v.scarf, beard: v.beard, fez: v.sex === 'm', hairColor: v.hairColor });
      c.root.position.set(seatX, 0, v.z);
      c.root.rotation.y = -Math.PI / 2;
      c.play(v.clip).time = rand() * 3;
      if (v.pasa) addEpaulettes(c);
      c.root.userData.dynamic = true;
      c.root.traverse((m) => { if (m.isMesh) m.castShadow = false; });
      g.add(c.root);
      this.vips.push(c);
      const chair = propClone('props', 'Chair_1');
      if (chair) { chair.position.set(seatX + 0.06, 0, v.z); chair.rotation.y = -Math.PI / 2; g.add(chair); }
    }
    this.animated.push(...this.vips);
    staticBatch(g);
  }

  // ---------- Seyirciler: iskeletli karakterlerin pozları statik geometriye pişirilip örneklenir ----------
  crowdBuild() {
    const POSES = [
      { sex: 'f', clip: 'Yes', time: 0.35 }, { sex: 'f', clip: 'Idle_Talking_Loop', time: 1.1 },
      { sex: 'f', clip: 'Dance_Loop', time: 0.6 }, { sex: 'f', clip: 'Idle_FoldArms_Loop', time: 0.4 },
      { sex: 'm', clip: 'Idle_Rail_Call', time: 0.9, fez: true }, { sex: 'm', clip: 'Yes', time: 0.6, fez: true, beard: true },
      { sex: 'm', clip: 'Idle_FoldArms_Loop', time: 0.5, fez: true, beard: true }, { sex: 'm', clip: 'Idle_Talking_Loop', time: 1.4, fez: true },
    ];
    const budget = { low: 60, medium: 100, high: 170 }[this.quality];
    const spots = [];
    const zMin = -L - 8, zMax = 5;
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        const x0 = HALF + 1.7 + row * 0.95;
        for (let z = zMax; z > zMin; z -= rr(0.75, 1.15)) {
          if (side === 1 && z < this.koskPos.z + 5 && z > this.koskPos.z - 5) continue;
          if (side === -1 && z > -2.8 && z < 3.8) continue;
          spots.push({ x: side * (x0 + rr(-0.15, 0.25)), z: z + rr(-0.12, 0.12), side, row });
        }
      }
    }
    for (let i = 0; i < 16; i++) spots.push({ x: HALF + 3.6 + rr(0, 2.4), z: this.koskPos.z + (rand() < 0.5 ? -1 : 1) * rr(4.6, 6.4), side: 1, row: 3 });
    // bütçeye göre seyrelt (kameraya yakın ön sıra öncelikli)
    spots.sort((p, q) => p.row - q.row + (rand() - 0.5) * 0.8);
    spots.length = Math.min(spots.length, budget);
    const scarves = [0xf2ead7, 0xe9d8b4, 0xc94f4f, 0x8fb3c9, 0x6a8f5a, 0xd9a441, 0x7d4e8a];
    const shirts = [0xe8e2d0, 0x3c5a8a, 0x8a3c3c, 0x5a7a4a, 0x6b5a3a, 0xc9b88a, 0x2c3e50];
    this.crowdInst = [];
    const dummy = new THREE.Object3D();
    POSES.forEach((pose, pi) => {
      const mine = spots.filter((_, i) => i % POSES.length === pi);
      if (!mine.length) return;
      const baked = bakePose(pose);
      const im = new THREE.InstancedMesh(baked.geometry, baked.materials, mine.length);
      im.castShadow = this.quality === 'high';
      const list = [];
      mine.forEach((s, k) => {
        const rot = s.side * Math.PI / 2 + rr(-0.35, 0.35) + (s.row === 3 ? 0.5 * Math.sign(this.koskPos.z - s.z) : 0);
        const pal = pose.sex === 'f' ? scarves : shirts;
        im.setColorAt(k, new THREE.Color(pal[Math.floor(rand() * pal.length)]).multiplyScalar(rr(0.85, 1.1)));
        list.push({ k, x: s.x, z: s.z, y: groundHeight(s.x, s.z), rot, sc: rr(0.93, 1.06), ph: rand() * 10, sp: rr(0.8, 1.3) });
      });
      im.instanceColor.needsUpdate = true;
      this.scene.add(im);
      this.crowdInst.push({ im, list });
    });
    const upd = () => {
      for (const { im, list } of this.crowdInst) {
        for (const it of list) {
          const e = this.excite, t = this.time;
          const jump = Math.max(0, Math.sin(t * (5 + e * 5) * it.sp + it.ph));
          dummy.position.set(it.x, it.y + jump * jump * (0.01 + e * 0.12), it.z);
          dummy.rotation.set(0, it.rot + Math.sin(t * 1.3 + it.ph) * 0.12, Math.sin(t * 3 * it.sp + it.ph) * 0.035 * e);
          dummy.scale.setScalar(it.sc);
          dummy.updateMatrix();
          im.setMatrixAt(it.k, dummy.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }
    };
    upd();
    this.updaters.push(upd);
  }

  // ---------- Davulcu ve çığırtkan (iskeletli, IK ile davul çalar) ----------
  musicians() {
    const dr = createCharacter({ sex: 'm', lod: 'mid', main: 0x8a2e1e, trim: 0xd9a441, fez: true, beard: true });
    dr.root.position.set(-HALF - 1.4, 0, 1.8);
    dr.root.rotation.y = Math.PI / 2 - 0.35;
    dr.play('Idle_Loop');
    this.scene.add(dr.root);
    // davul: ahşap gövde + gergin deri + ip örgüsü
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#6b3e1d'); gr.addColorStop(0.5, '#a8692f'); gr.addColorStop(1, '#5a3218');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(40,20,5,${Math.random() * 0.25})`; x.fillRect(Math.random() * 512, Math.random() * 128, 30 + Math.random() * 60, 1); }
    x.strokeStyle = '#efe0bb'; x.lineWidth = 5;
    x.beginPath(); for (let i = 0; i <= 16; i++) x.lineTo(i * 32, i % 2 ? 116 : 12); x.stroke();
    x.fillStyle = '#9b1b1b'; x.fillRect(0, 0, 512, 12); x.fillRect(0, 116, 512, 12);
    const dt = new THREE.CanvasTexture(cv); dt.colorSpace = THREE.SRGBColorSpace; dt.wrapS = THREE.RepeatWrapping;
    const drum = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.3, 32, 1, true), new THREE.MeshStandardMaterial({ map: dt, roughness: 0.6, side: THREE.DoubleSide }));
    shell.rotation.z = Math.PI / 2; shell.castShadow = true; drum.add(shell);
    const hide = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.85, normalMap: assets.tex.hessianNor, normalScale: new THREE.Vector2(0.15, 0.15) });
    for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), hide); sk.position.x = s * 0.151; sk.rotation.y = s * Math.PI / 2; drum.add(sk); }
    drum.position.set(0, 1.0, 0.36);
    dr.root.add(drum);
    const stick = (len, r, ball) => {
      const gg = new THREE.Group();
      const st = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 }));
      st.position.y = len / 2; gg.add(st);
      if (ball) { const bl = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.9 })); bl.position.y = len; gg.add(bl); }
      return gg;
    };
    const tokmak = stick(0.36, 0.014, true), cubuk = stick(0.42, 0.006, false);
    dr.bones.hand_r.add(tokmak); dr.bones.hand_l.add(cubuk);
    this.drummer = { ch: dr, drum, hitR: 0, hitL: 0, tokmak, cubuk };

    const cr = createCharacter({ sex: 'm', lod: 'mid', main: 0x1f3a5a, trim: 0xd9a441, fez: true });
    cr.root.position.set(-HALF - 0.9, 0, -0.9);
    cr.root.rotation.y = Math.PI / 2 + 0.5;
    cr.play('Idle_Talking_Loop');
    this.scene.add(cr.root);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.2, 3, 3), new THREE.MeshStandardMaterial({ color: 0xfaf7ef, roughness: 0.9, side: THREE.DoubleSide }));
    cloth.position.set(0, 0.12, 0.05);
    cr.bones.hand_r.add(cloth);
    this.crier = { ch: cr, target: 0, raise: 0, cloth };
    this.animated.push(dr, cr);

    const ikT = new THREE.Vector3(), pole = new THREE.Vector3();
    this.updaters.push((dtt, t) => {
      const d = this.drummer;
      d.hitR = Math.max(0, d.hitR - dtt * 7); d.hitL = Math.max(0, d.hitL - dtt * 9);
      d.drum.rotation.z = Math.sin(t * 4.5) * 0.03;
      d.ch.root.updateMatrixWorld(true);
      // sağ el tokmakla sağ deriye, sol el çubukla sol deriye vurur
      for (const [side, hit, up, lo, ha] of [[1, d.hitR, 'upperarm_r', 'lowerarm_r', 'hand_r'], [-1, d.hitL, 'upperarm_l', 'lowerarm_l', 'hand_l']]) {
        const B = d.ch.bones;
        B[ha].getWorldPosition(ikT); d.ch.root.worldToLocal(ikT);
        const s = Math.sign(ikT.x) || side;
        ikT.set(s * (0.42 + (1 - hit) * 0.12), 1.06 + (1 - hit) * 0.16, 0.3);
        d.ch.root.localToWorld(ikT);
        pole.set(s * 0.8, 0.9, -0.3); d.ch.root.localToWorld(pole);
        solveArmIK(B[up], B[lo], B[ha], ikT, pole);
      }
      const c = this.crier;
      c.raise += (Math.max(0, c.target) - c.raise) * Math.min(1, dtt * 6);
      const wantClip = c.target < 0 ? 'Yes' : 'Idle_Talking_Loop';
      if (c.mode !== wantClip) { c.mode = wantClip; c.ch.play(wantClip, { fade: 0.4 }); }
      if (c.raise > 0.02) {
        // anons ederken sağ el mendille havaya kalkar
        const B = c.ch.bones;
        c.ch.root.updateMatrixWorld(true);
        B.hand_r.getWorldPosition(ikT); c.ch.root.worldToLocal(ikT);
        const s = Math.sign(ikT.x) || 1;
        const up = new THREE.Vector3(s * 0.32, 1.95 + Math.sin(t * 7) * 0.05, 0.12);
        ikT.lerp(up, c.raise);
        c.ch.root.localToWorld(ikT);
        pole.set(s * 0.9, 1.2, -0.4); c.ch.root.localToWorld(pole);
        solveArmIK(B.upperarm_r, B.lowerarm_r, B.hand_r, ikT, pole);
      }
      c.cloth.rotation.z = Math.sin(t * 9) * 0.35;
    });
  }

  // davulcu ve çığırtkanın durduğu alan (giriş çekimi kamerası da burada)
  inMusic(x, z) { return x < -HALF + 0.2 && x > -HALF - 4 && z > -6 && z < 5; }

  inKosk(x, z, pad = 0) {
    const k = this.koskPos;
    return k && x > k.x - 2.6 - pad && x < k.x + 2.6 + pad && z > k.z - 4.5 - pad && z < k.z + 4.5 + pad;
  }

  drumHit(type) {
    if (type === 'D') this.drummer.hitR = 1; else this.drummer.hitL = 1;
  }

  // ---------- Doğa: Quaternius Stylized Nature MegaKit (örneklenmiş, yapraklar rüzgârda salınır) ----------
  instNode(set, name, placements, { shadow = false, wind = 0 } = {}) {
    const src = assets.models[set]?.getObjectByName(name);
    if (!src || !placements.length) return;
    src.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    src.traverse((o) => {
      if (!o.isMesh) return;
      const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      let mat = o.material;
      const leafy = /Leaves|Leaf|Grass|Flowers/i.test(mat.name);
      if (wind && leafy) mat = windMaterial(mat, wind, this.windU);
      const im = new THREE.InstancedMesh(o.geometry, mat, placements.length);
      placements.forEach((m, i) => im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(m, local)));
      im.castShadow = shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.scene.add(im);
    });
  }

  trees() {
    this.windU = { uTime: { value: 0 } };
    this.updaters.push((dt, t) => { this.windU.uTime.value = t; });
    const treeNames = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'];
    const nTrees = { low: 32, medium: 48, high: 80 }[this.quality];
    const buckets = Object.fromEntries([...treeNames, 'Pine_1', 'Pine_3'].map((n) => [n, []]));
    const place = (x, z, s, pine = false) => {
      const n = pine ? (rand() < 0.5 ? 'Pine_1' : 'Pine_3') : treeNames[Math.floor(rand() * treeNames.length)];
      buckets[n].push(Mx(x, groundHeight(x, z) - 0.05, z, 0, rand() * 6.28, 0, s, s * rr(0.9, 1.15), s));
    };
    for (let i = 0; i < nTrees; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * rr(HALF + 5.5, 45), z = rr(-110, 35);
      if (side === 1 && Math.abs(z - this.koskPos.z) < 6 && Math.abs(x) < HALF + 10) continue;
      place(x, z, rr(1.0, 1.6) * (1 + Math.abs(x) / 90), Math.abs(x) > 30 && rand() < 0.4);
    }
    for (let i = 0; i < nTrees * 0.35; i++) place(rr(-38, 38), rr(-L - 22, -L - 80), rr(1.1, 1.7), rand() < 0.3);
    for (let i = 0; i < nTrees * 0.2; i++) place(rr(-38, 38), rr(16, 55), rr(1.1, 1.7), rand() < 0.3);
    for (const [n, list] of Object.entries(buckets)) this.instNode('nature', n, list, { shadow: false, wind: 1 });

    // çalılar, eğrelti, çiçekler, taşlar
    const deco = { Bush_Common: [], Bush_Common_Flowers: [], Fern_1: [], Flower_3_Group: [], Flower_4_Group: [], Plant_1_Big: [], Rock_Medium_1: [], Rock_Medium_2: [] };
    const keys = Object.keys(deco);
    const nDeco = { low: 70, medium: 120, high: 200 }[this.quality];
    for (let i = 0; i < nDeco; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * rr(HALF + 4.2, 24), z = rr(-L - 18, 18);
      if (this.inKosk(x, z, 1.5) || this.inMusic(x, z)) continue;
      const k = keys[Math.floor(rand() * keys.length)];
      const s = k.startsWith('Rock') ? rr(0.35, 0.8) : k.startsWith('Bush') ? rr(0.8, 1.3) : rr(0.9, 1.4);
      deco[k].push(Mx(x, groundHeight(x, z), z, 0, rand() * 6.28, 0, s, s, s));
    }
    // pist kenarında çiçek şeridi
    for (let i = 0; i < 60; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const fx = side * rr(HALF + 0.45, HALF + 1.2), fz = rr(-L - 8, 8);
      if (this.inMusic(fx, fz)) continue;
      deco[rand() < 0.5 ? 'Flower_3_Group' : 'Flower_4_Group'].push(Mx(fx, 0, fz, 0, rand() * 6.28, 0, 0.5, 0.5, 0.5));
    }
    for (const k of keys) this.instNode('nature', k, deco[k], { shadow: this.quality === 'high' && k.startsWith('Bush'), wind: 0.6 });

    // pist kenarlarına gür çimen öbekleri
    const tufts = { Grass_Common_Short: [], Grass_Common_Tall: [], Grass_Wispy_Short: [] };
    const tk = Object.keys(tufts);
    const nT = { low: 100, medium: 170, high: 280 }[this.quality];
    for (let i = 0; i < nT; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      // pist ile seyirci arasındaki dar şerit + seyircilerin arkası (önlerini kapatmasın)
      const x = side * (rand() < 0.6 ? rr(HALF + 0.25, HALF + 1.3) : rr(HALF + 4.2, HALF + 9)), z = rr(-L - 10, 10);
      if (this.inKosk(x, z, 0.5) || this.inMusic(x, z)) continue;
      const s = rr(0.5, 0.85);
      tufts[tk[Math.floor(rand() * tk.length)]].push(Mx(x, groundHeight(x, z), z, 0, rand() * 6.28, 0, s, s, s));
    }
    for (const k of tk) this.instNode('nature', k, tufts[k], { wind: 1.2 });
  }

  // ---------- Rüzgârda salınan çimen ----------
  grassField() {
    const count = this.quality === 'low' ? 2500 : this.quality === 'medium' ? 6000 : 11000;
    const h = 0.32;
    const blade = new THREE.PlaneGeometry(0.05, h, 1, 3);
    blade.translate(0, h / 2, 0);
    const bp = blade.attributes.position, colors = new Float32Array(bp.count * 3), nrm = blade.attributes.normal;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i) / h;
      bp.setX(i, bp.getX(i) * (1 - y * 0.85));
      const c = new THREE.Color().setRGB(0.18 + y * 0.32, 0.32 + y * 0.38, 0.08 + y * 0.12);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      nrm.setXYZ(i, 0, 1, 0);
    }
    blade.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 });
    const uniforms = { uTime: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float hh = position.y / ${h.toFixed(3)};
        float w = sin(uTime * 1.9 + wpos.x * 0.35 + wpos.z * 0.22) * 0.6 + sin(uTime * 3.7 + wpos.z * 0.9) * 0.25;
        transformed.x += w * 0.09 * hh * hh;
        transformed.z += cos(uTime * 1.3 + wpos.x * 0.2) * 0.04 * hh * hh;
      `);
    };
    const im = new THREE.InstancedMesh(blade, mat, count);
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      let x, z;
      const r = rand();
      if (r < 0.45) { const s = rand() < 0.5 ? -1 : 1; x = s * rr(HALF + 0.25, HALF + 1.55); z = rr(-L - 10, 10); }
      else if (r < 0.8) { const s = rand() < 0.5 ? -1 : 1; x = s * rr(HALF + 4, 22); z = rr(-L - 20, 18); }
      else { x = rr(-HALF - 2, HALF + 2); z = rand() < 0.5 ? rr(12, 30) : rr(-L - 12, -L - 30); }
      if (this.inKosk(x, z, 0.6)) { d.position.set(0, -50, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); continue; }
      d.position.set(x, groundHeight(x, z), z);
      d.rotation.set(rr(-0.2, 0.2), rand() * Math.PI, rr(-0.2, 0.2));
      const s = rr(0.6, 1.5); d.scale.set(s, s * rr(0.8, 1.4), s);
      d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    im.receiveShadow = true;
    this.scene.add(im);
    this.updaters.push((dt, t) => { uniforms.uTime.value = t; });
  }

  update(dt) {
    this.time += dt;
    for (const c of this.animated) c.update(dt);
    for (const u of this.updaters) u(dt, this.time);
  }
}
