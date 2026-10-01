// Kır eğlencesi sahnesi: açık çayır, pist, Daver Bey'in köşkü, seyirciler, davulcu, ağaçlar.
import * as THREE from 'three';
import { assets } from './assets.js';
import { TRACK } from './config.js';
import { MAT, paint, merge, manParts, womanParts, personMesh } from './people.js';

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
    // yemiş tabakları, bardaklar
    for (let i = 0; i < 6; i++) {
      const z = -tl / 2 + 0.6 + i * (tl - 1.2) / 5;
      T.push(paint(new THREE.CylinderGeometry(0.2, 0.14, 0.04, 18), 0xd9c9a3, Mx(tx - 0.05, th + 0.04, z)));
      for (let k = 0; k < 5; k++) T.push(paint(new THREE.SphereGeometry(0.055, 10, 8), k % 2 ? 0xf08a24 : 0xe6b422, Mx(tx - 0.05 + Math.cos(k * 1.3) * 0.09, th + 0.1 + (k === 4 ? 0.06 : 0), z + Math.sin(k * 1.3) * 0.09)));
      T.push(paint(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 10), 0xe9f2f5, Mx(tx - 0.3, th + 0.075, z + 0.35)));
    }
    const table = personMesh(T, MAT.vcSoft); table.receiveShadow = true; g.add(table);
    g.add(personMesh(swag, MAT.vc));

    // ileri gelenler: masanın arkasında oturur, piste bakar (-X)
    const seatX = 0.35, seatY = 0.56;
    const vip = [
      { z: -3.0, kind: 'man', o: { suit: 0x4a4a52, shirt: 0xf3efe5, tie: 0x2e5e2e, fez: 0x8f1717, mustacheColor: 0xd8d8d0, skin: 0xd9a585 } },              // Akil, Tellioğulları reisi
      { z: -1.9, kind: 'man', o: { suit: 0x5a3b26, shirt: 0xf3efe5, tie: 0x6b1d1d, fez: 0x9b1b1b, skin: 0xd8a07a } },                                    // Tellioğlu Lütfü
      { z: -0.75, kind: 'pasa', o: { suit: 0x121218, shirt: 0xf3efe5, tie: 0x121218, fez: 0xa01c1c, trim: 0xe0b44a, skin: 0xe0ad86, mustache: false } }, // sahte Tosun Paşa (Şaban)
      { z: 0.45, kind: 'leyla' },                                                                                                                           // Leyla
      { z: 1.6, kind: 'man', o: { suit: 0x1a2340, shirt: 0xf3efe5, tie: 0x8f1d21, fez: 0x8f1717, trim: 0xd9a441, skin: 0xd9a07a } },                    // Daver Bey
      { z: 2.8, kind: 'man', o: { suit: 0x26442f, shirt: 0xf3efe5, tie: 0x14301f, fez: 0x8f1717, skin: 0xcf9873, belly: 1.15 } },                       // Seferoğlu Sıtkı
    ];
    this.vips = [];
    for (const v of vip) {
      let built;
      if (v.kind === 'leyla') built = womanParts({ pose: 'sit', dress: 0xc0232e, scarf: 0xd8262f, sash: 0xe0b44a, skin: 0xf2c8a8 });
      else built = manParts({ ...v.o, pose: 'sit' });
      const parts = built.parts;
      if (v.kind === 'pasa') {
        // apolet + madalyalar
        for (const s of [-1, 1]) {
          parts.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 14), 0xe0b44a, Mx(s * 0.22, built.shoulderY + 0.04, 0, 0, 0, s * 0.25)));
          for (let k = 0; k < 9; k++) {
            const a = (k / 8) * Math.PI - Math.PI / 2;
            parts.push(paint(new THREE.CylinderGeometry(0.007, 0.007, 0.08, 4), 0xe0b44a, Mx(s * (0.22 + Math.cos(a) * 0.0) + s * 0.08, built.shoulderY - 0.01, Math.sin(a) * 0.09)));
          }
        }
        for (let k = 0; k < 4; k++) parts.push(paint(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 10), k % 2 ? 0xd0d4dc : 0xe0b44a, Mx(-0.1 + k * 0.03, built.bodyY + 0.35, -0.2, Math.PI / 2, 0, 0)));
        parts.push(paint(new THREE.BoxGeometry(0.04, 0.4, 0.02), 0xa01c1c, Mx(0.0, built.bodyY + 0.3, -0.2, 0, 0, 0.6)));
      }
      const m = personMesh(parts);
      const holder = new THREE.Group();
      holder.add(m);
      holder.position.set(seatX, seatY, v.z);
      holder.rotation.y = Math.PI / 2;
      g.add(holder);
      this.vips.push({ holder, base: seatY, phase: rand() * 6 });
      // sandalye
      const ch = personMesh([
        paint(new THREE.BoxGeometry(0.46, 0.06, 0.46), 0x5a3a22, Mx(0, 0.42, 0)),
        paint(new THREE.BoxGeometry(0.46, 0.7, 0.05), 0x5a3a22, Mx(0, 0.78, 0.22)),
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => paint(new THREE.BoxGeometry(0.05, 0.42, 0.05), 0x3e2716, Mx(a * 0.2, 0.21, b * 0.2))),
      ]);
      ch.position.set(seatX + 0.05, 0, v.z); ch.rotation.y = Math.PI / 2; g.add(ch);
    }
    this.updaters.push((dt, t) => {
      for (const v of this.vips) {
        const e = this.excite;
        v.holder.position.y = v.base + Math.max(0, Math.sin(t * (5 + e * 6) + v.phase)) * 0.04 * (0.3 + e);
        v.holder.rotation.z = Math.sin(t * 2 + v.phase) * 0.03 * e;
      }
    });
  }

  // ---------- Seyirciler (örneklenmiş) ----------
  crowdBuild() {
    const variants = [];
    const suits = [0x2c2c34, 0x3b3328, 0x23324a, 0x4a3a2a, 0x2e3a2c, 0x50463a];
    const dresses = [0x2f6f8f, 0x8e3b46, 0x6b8e4e, 0xc49a3c, 0x5b4a8a, 0xb5651d, 0x3a7d7c];
    const scarves = [0xf2ead7, 0xe9d8b4, 0xffffff, 0xd8c6a8, 0xc94f4f, 0x8fb3c9];
    for (let i = 0; i < 4; i++) variants.push({ geo: merge(manParts({ suit: suits[i], pants: suits[(i + 2) % 6], pose: i % 2 ? 'raise' : 'clap', lod: true, belly: 1 + (i % 3) * 0.08, tie: [0x5a1414, 0x1d3557, 0x2b2b2b, 0x6b4f1d][i] }).parts), n: 0 });
    for (let i = 0; i < 2; i++) variants.push({ geo: merge(manParts({ suit: 0x6e5a40, sleeve: 0xf1ece0, pants: 0x3a3226, pose: i ? 'mixed' : 'clap', lod: true, tie: 0xc0392b, fez: 0xaf2020 }).parts), n: 0 }); // köylü: cepken
    for (let i = 0; i < 4; i++) variants.push({ geo: merge(womanParts({ dress: dresses[i], scarf: scarves[i], pose: i % 2 ? 'raise' : 'clap', lod: true, skirt: dresses[(i + 3) % 7] }).parts), n: 0 });

    const spots = [];
    const zMin = -L - 9, zMax = 6;
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        const x0 = HALF + 1.6 + row * 0.85;
        for (let z = zMax; z > zMin; z -= rr(0.62, 0.95)) {
          if (side === 1 && z < this.koskPos.z + 5 && z > this.koskPos.z - 5) continue; // köşkün önü boş
          if (side === -1 && z > -2.6 && z < 3.6 && row < 2) continue;                    // davulcu ve çığırtkan alanı
          if (rand() < 0.12) continue;
          spots.push({ x: side * (x0 + rr(-0.15, 0.25)), z: z + rr(-0.1, 0.1), side, row });
        }
      }
    }
    // köşkün iki yanında ayaktaki kalabalık
    for (let i = 0; i < 22; i++) spots.push({ x: HALF + 3.5 + rr(0, 2.5), z: this.koskPos.z + (rand() < 0.5 ? -1 : 1) * rr(4.6, 6.5), side: 1, row: 3 });
    const CH = 3, chunkLen = (zMax - zMin) / CH;
    for (const s of spots) { s.v = Math.floor(rand() * variants.length); s.c = Math.min(CH - 1, Math.max(0, Math.floor((zMax - s.z) / chunkLen))); }

    this.crowdInst = [];
    const dummy = new THREE.Object3D();
    for (let vi = 0; vi < variants.length * CH; vi++) {
      const v = variants[vi % variants.length], ch = Math.floor(vi / variants.length);
      const mine = spots.filter((s) => s.v === vi % variants.length && s.c === ch);
      if (!mine.length) continue;
      const im = new THREE.InstancedMesh(v.geo, MAT.vc, mine.length);
      im.castShadow = this.quality === 'high';
      im.receiveShadow = false;
      const list = [];
      let k = 0;
      for (const s of mine) {
        const sc = rr(0.92, 1.08);
        const rot = s.side * Math.PI / 2 + rr(-0.35, 0.35) + (s.row === 3 ? 0.5 * Math.sign(this.koskPos.z - s.z) : 0);
        const tint = new THREE.Color().setHSL(rr(0, 1), rr(0, 0.15), rr(0.78, 1.0));
        im.setColorAt(k, tint);
        const item = { k, x: s.x, z: s.z, y: groundHeight(s.x, s.z), rot, sc, ph: rand() * 10, sp: rr(0.8, 1.3) };
        dummy.position.set(item.x, item.y, item.z); dummy.rotation.set(0, rot, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
        list.push(item);
        k++;
      }
      im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.scene.add(im);
      this.crowdInst.push({ im, list });
    }
    this.updaters.push((dt, t) => {
      const e = this.excite;
      for (const { im, list } of this.crowdInst) {
        for (const it of list) {
          const jump = Math.max(0, Math.sin(t * (6 + e * 5) * it.sp + it.ph));
          dummy.position.set(it.x, it.y + jump * jump * (0.02 + e * 0.14), it.z);
          dummy.rotation.set(0, it.rot + Math.sin(t * 1.3 + it.ph) * 0.12, Math.sin(t * 3 * it.sp + it.ph) * 0.04 * e);
          dummy.scale.setScalar(it.sc);
          dummy.updateMatrix();
          im.setMatrixAt(it.k, dummy.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
      }
    });
  }

  // ---------- Davulcu ve çığırtkan ----------
  musicians() {
    // davulcu
    const dg = new THREE.Group(); dg.position.set(-HALF - 1.4, 0, 1.8); dg.rotation.y = -Math.PI / 2 - 0.35; this.scene.add(dg);
    const body = manParts({ suit: 0x7a2e1e, sleeve: 0xefe6d2, pants: 0x2b2b33, fez: 0xa61e1e, noArms: true, belly: 1.12, tie: 0xd9a441 });
    dg.add(personMesh(body.parts));
    // davul: gövde + iki deri yüz + ip örgüsü dokusu
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#7b4a25'); gr.addColorStop(0.5, '#a8692f'); gr.addColorStop(1, '#6a3d1d');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 128);
    x.strokeStyle = '#f0e2c0'; x.lineWidth = 5;
    x.beginPath(); for (let i = 0; i <= 16; i++) { x.lineTo(i * 32, i % 2 ? 118 : 10); } x.stroke();
    x.fillStyle = '#c0392b'; x.fillRect(0, 0, 512, 10); x.fillRect(0, 118, 512, 10);
    const dt = new THREE.CanvasTexture(cv); dt.colorSpace = THREE.SRGBColorSpace; dt.wrapS = THREE.RepeatWrapping;
    const drum = new THREE.Group(); drum.position.set(0, 1.08, -0.38); dg.add(drum);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 28, 1, true), new THREE.MeshStandardMaterial({ map: dt, roughness: 0.7, side: THREE.DoubleSide }));
    shell.rotation.z = Math.PI / 2; shell.castShadow = true; drum.add(shell);
    for (const s of [-1, 1]) {
      const skin = new THREE.Mesh(new THREE.CircleGeometry(0.34, 28), new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9, side: THREE.DoubleSide }));
      skin.position.x = s * 0.15; skin.rotation.y = s * Math.PI / 2; drum.add(skin);
    }
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.015, 5, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x3b2a1e }));
    strap.position.set(0, 0.0, 0.2); strap.rotation.set(0, 0, 0); drum.add(strap);
    const armDef = (s, tool) => {
      const piv = new THREE.Group(); piv.position.set(s * 0.23, body.shoulderY, 0); dg.add(piv);
      const p = [
        paint(new THREE.CapsuleGeometry(0.06, 0.24, 3, 6), 0xefe6d2, Mx(0, -0.15, -0.06, 0.4, 0, 0)),
        paint(new THREE.CapsuleGeometry(0.052, 0.22, 3, 6), 0xefe6d2, Mx(0, -0.3, -0.26, 1.3, 0, 0)),
        paint(new THREE.SphereGeometry(0.045, 8, 6), 0xd9a07a, Mx(0, -0.33, -0.42)),
      ];
      if (tool === 'tokmak') {
        p.push(paint(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6), 0x5a3a22, Mx(s * 0.12, -0.3, -0.45, 0, 0, Math.PI / 2 - 0.3)));
        p.push(paint(new THREE.SphereGeometry(0.06, 10, 8), 0x3b2a1e, Mx(s * 0.31, -0.24, -0.45)));
      } else {
        p.push(paint(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 4), 0x8a6a3a, Mx(s * 0.15, -0.28, -0.45, 0, 0, Math.PI / 2 - 0.4)));
      }
      const m = personMesh(p); piv.add(m);
      return piv;
    };
    const armR = armDef(1, 'tokmak'), armL = armDef(-1, 'cubuk');
    this.drummer = { g: dg, armR, armL, hitR: 0, hitL: 0, drum };

    // çığırtkan: mendil sallayan adam
    const cg = new THREE.Group(); cg.position.set(-HALF - 0.9, 0, -0.9); cg.rotation.y = -Math.PI / 2 + 0.5; this.scene.add(cg);
    const cb = manParts({ suit: 0x1f3a5a, pants: 0x1a1a22, fez: 0x9b1b1b, noArms: true, tie: 0xd9a441, trim: 0xd9a441 });
    cg.add(personMesh(cb.parts));
    const mkArm = (s, raise) => {
      const piv = new THREE.Group(); piv.position.set(s * 0.23, cb.shoulderY, 0); cg.add(piv);
      const p = [
        paint(new THREE.CapsuleGeometry(0.06, 0.4, 3, 6), 0x1f3a5a, Mx(0, -0.25, 0)),
        paint(new THREE.SphereGeometry(0.045, 8, 6), 0xd9a07a, Mx(0, -0.52, 0)),
      ];
      if (raise) {
        const cloth = new THREE.PlaneGeometry(0.32, 0.32, 3, 3);
        p.push(paint(cloth, 0xfaf7ef, Mx(0.05, -0.68, 0, 0, Math.PI / 2, 0.2)));
      }
      const m = personMesh(p); piv.add(m);
      if (raise) m.material = MAT.vc;
      return piv;
    };
    const cR = mkArm(1, true), cL = mkArm(-1, false);
    cL.rotation.z = -0.15; cL.rotation.x = -0.2;
    this.crier = { g: cg, arm: cR, raise: 0, target: 0.2 };

    this.updaters.push((dt, t) => {
      const d = this.drummer;
      d.hitR = Math.max(0, d.hitR - dt * 7); d.hitL = Math.max(0, d.hitL - dt * 9);
      d.armR.rotation.x = -0.25 + Math.sin(d.hitR * Math.PI) * 0.0 - d.hitR * 0.9;
      d.armR.rotation.z = 0.2 + d.hitR * 0.5;
      d.armL.rotation.x = -0.2 - d.hitL * 0.5;
      d.armL.rotation.z = -0.25 - d.hitL * 0.4;
      d.g.position.y = Math.abs(Math.sin(t * 4.5)) * 0.03;
      d.drum.rotation.z = Math.sin(t * 4.5) * 0.04;
      const c = this.crier;
      c.raise += (c.target - c.raise) * Math.min(1, dt * 8);
      c.arm.rotation.z = c.raise * 2.7 + Math.sin(t * 9) * 0.12 * c.raise;
      c.arm.rotation.x = -0.1;
    });
  }

  inKosk(x, z, pad = 0) {
    const k = this.koskPos;
    return k && x > k.x - 2.6 - pad && x < k.x + 2.6 + pad && z > k.z - 4.5 - pad && z < k.z + 4.5 + pad;
  }

  drumHit(type) {
    if (type === 'D') this.drummer.hitR = 1; else this.drummer.hitL = 1;
  }

  // ---------- Ağaçlar, çalılar (Kenney Nature Kit, örneklenmiş) ----------
  instModel(name, placements, opts = {}) {
    const src = assets.models[name]; if (!src) return;
    src.updateMatrixWorld(true);
    // Kenney paketinin turkuaz tonlarını yaz sonu çayır renklerine çevir
    const palette = { leafsGreen: 0x5e9431, leafsDark: 0x3c6e26, grass: 0x6b9e38, woodBark: 0x6e4c34, woodBarkDark: 0x4b3526, _defaultMat: 0x6e4c34 };
    src.traverse((o) => {
      if (!o.isMesh) return;
      const mat = o.material.clone();
      if (palette[mat.name] !== undefined) mat.color.set(palette[mat.name]);
      mat.roughness = 0.88; mat.metalness = 0;
      const leafy = /leafs|grass/.test(mat.name);
      const im = new THREE.InstancedMesh(o.geometry, mat, placements.length);
      placements.forEach((m, i) => {
        im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(m, o.matrixWorld));
        const r = mulberry(i * 31 + name.length)();
        im.setColorAt(i, new THREE.Color().setHSL(leafy ? 0.08 + r * 0.1 : 0, leafy ? 0.35 : 0, leafy ? 0.72 + r * 0.32 : 0.85 + r * 0.2));
      });
      im.castShadow = opts.shadow ?? false;
      im.receiveShadow = opts.receive ?? false;
      this.scene.add(im);
    });
  }

  trees() {
    const treeNames = ['tree_oak', 'tree_detailed', 'tree_fat', 'tree_default', 'tree_oak_dark', 'tree_detailed_dark'];
    const buckets = Object.fromEntries(treeNames.map((n) => [n, []]));
    const place = (x, z, s) => {
      const n = treeNames[Math.floor(rand() * treeNames.length)];
      buckets[n].push(Mx(x, groundHeight(x, z) - 0.1, z, 0, rand() * 6.28, 0, s, s * rr(0.9, 1.2), s));
    };
    // pistin iki yanında, seyircilerin arkasında koru
    for (let i = 0; i < (this.quality === 'low' ? 70 : 120); i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * rr(HALF + 6, 60), z = rr(-120, 40);
      if (side === 1 && Math.abs(z - this.koskPos.z) < 6 && Math.abs(x) < HALF + 10) continue;
      place(x, z, rr(5.5, 9.5) * (1 + Math.abs(x) / 80));
    }
    // bitişin ötesi ve başlangıcın gerisi
    for (let i = 0; i < 45; i++) place(rr(-40, 40), rr(-L - 25, -L - 90), rr(6, 10));
    for (let i = 0; i < 30; i++) place(rr(-40, 40), rr(18, 60), rr(6, 10));
    for (const n of treeNames) if (buckets[n].length) this.instModel(n, buckets[n], { shadow: false });

    // çalılar ve çiçekler
    const deco = { plant_bushLarge: [], plant_bushDetailed: [], flower_redA: [], flower_yellowA: [], flower_purpleA: [], flower_redB: [], stump_round: [], log: [] };
    const keys = Object.keys(deco);
    for (let i = 0; i < 260; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * rr(HALF + 4.6, 24), z = rr(-L - 20, 20);
      if (this.inKosk(x, z, 1.5)) continue;
      const k = keys[Math.floor(rand() * (keys.length - (rand() < 0.9 ? 2 : 0)))];
      const s = k.startsWith('flower') ? rr(2, 3.2) : k.startsWith('plant') ? rr(2.5, 4.5) : rr(2, 3);
      deco[k].push(Mx(x, groundHeight(x, z), z, 0, rand() * 6.28, 0, s, s, s));
    }
    for (let i = 0; i < 70; i++) {
      const k = ['flower_redA', 'flower_yellowA', 'flower_purpleA'][i % 3];
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * rr(HALF + 0.5, HALF + 1.4), z = rr(-L - 8, 8);
      deco[k].push(Mx(x, 0, z, 0, rand() * 6.28, 0, 1.3, 1.3, 1.3));
    }
    for (const k of keys) if (deco[k].length) this.instModel(k, deco[k], { shadow: this.quality === 'high' && k.startsWith('plant') });
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
    for (const u of this.updaters) u(dt, this.time);
  }
}
