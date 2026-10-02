// Çuval: konum tabanlı dinamik (PBD) kumaş simülasyonu + yüksek çözünürlüklü görüntü ağı.
// Çuval gerçek bir un çuvalı gibi düz dikilmiş bir torbadır: altta dikiş çizgisi ve iki "kulak",
// üstte dışa kıvrılmış ağız kenarı. Ağız ellerde ve belde tutulur, içerideki bacaklar ve ayaklarla
// çarpışır, yere değince yayılıp sürtünür, zıplarken savrulur. Sıkışan yerlerde katlar oluşur:
// geometride gerçek kıvrımlar, gölgelendiricide ince kırışık kabartması.
import * as THREE from 'three';

const NS = 20, NR = 12, N = NS * NR;       // simülasyon: çevre × halka (0 = alt dikiş, NR-1 = ağız)
const RIM = NR - 1;
const G = -9.81;
const idx = (r, s) => r * NS + ((s % NS) + NS) % NS;
const smooth = (t) => t * t * (3 - 2 * t);

// Catmull-Rom ağırlıkları
function crw(t, out, o) {
  const t2 = t * t, t3 = t2 * t;
  out[o] = -0.5 * t3 + t2 - 0.5 * t;
  out[o + 1] = 1.5 * t3 - 2.5 * t2 + 1;
  out[o + 2] = -1.5 * t3 + 2 * t2 + 0.5 * t;
  out[o + 3] = 0.5 * t3 - 0.5 * t2;
}

const FRAG_HEAD = /* glsl */`
varying vec2 vSUv; varying vec2 vStrain; varying float vWY;
`;
// kırışık yüksekliği: çevresel sıkışma dikey büzgü, boyuna sıkışma yatay kat üretir
const FRAG_WRINKLE = /* glsl */`
float wrU = sin(vSUv.x * 6.2831 * 46.0 + sin(vSUv.y * 21.0) * 1.7 + sin(vSUv.y * 57.0) * 0.6);
float wrV = sin(vSUv.y * 6.2831 * 34.0 + sin(vSUv.x * 6.2831 * 3.0) * 1.4 + sin(vSUv.x * 6.2831 * 11.0) * 0.5);
float wrH = vStrain.x * wrU + vStrain.y * wrV;
`;
const FRAG_COLOR = /* glsl */`
{
  ${FRAG_WRINKLE}
  float crease = clamp(-wrH, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 - crease * 0.22;
  diffuseColor.rgb *= mix(1.0, 0.78, smoothstep(0.09, 0.0, vWY));   // yere değen kısımda temas gölgesi
  if (!gl_FrontFacing) diffuseColor.rgb *= 0.42;                       // çuvalın içi
}
`;
const FRAG_BUMP = /* glsl */`
{
  ${FRAG_WRINKLE}
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float Hh = wrH * 0.0035;
  float hx = dFdx(Hh), hy = dFdy(Hh);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;

export function sackMaterial(o) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide, ...o });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aStrain;\n' + FRAG_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSUv = uv; vStrain = aStrain; vWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_BUMP);
  };
  m.customProgramCacheKey = () => 'sack-cloth-v1';
  return m;
}

export class SackCloth {
  // build: yarışmacının yapısı, height: boy ölçeği, lod: düşük çözünürlük
  constructor({ build = 1, height = 1, material, lod = false }) {
    this.sc = 0.92 + build * 0.12;
    this.hgt = height;
    this.rimR = 0.39 * this.sc;
    this.rimY0 = 1.04;
    this.len = 1.13;                 // kumaş boyu: ayakta altta biraz bol kalır, yere yığılır
    this.its = lod ? 4 : 6;
    this.seed = Math.random() * 10;
    // kapsül (bacaklar + etek) ve ayak tabanları, tilt yerel uzayında
    this.capA = new THREE.Vector3(0, 0.86 * height, 0);
    this.capB = new THREE.Vector3(0, 0.1, 0);
    this.capRA = 0.155 + 0.045 * build; this.capRB = 0.15 + 0.028 * build;
    this.footX = 0.1 * height; this.footR = 0.105;

    // --- dinlenme biçimi ---
    this.rest = new Float32Array(N * 3);
    const base = 0.31 * this.sc;
    for (let r = 0; r < NR; r++) {
      const v = r / RIM;
      let rx, rz;
      if (v < 0.3) { const t = v / 0.3; rx = THREE.MathUtils.lerp(0.375 * this.sc, base, Math.pow(t, 0.8)); rz = THREE.MathUtils.lerp(0.012, base * 0.95, Math.sqrt(t)); }
      else if (v > 0.76) { const t = smooth((v - 0.76) / 0.24); rx = THREE.MathUtils.lerp(base, this.rimR, t); rz = THREE.MathUtils.lerp(base * 0.95, this.rimR * 0.88, t); }
      else { rx = base; rz = base * 0.95; }
      const y = this.rimY0 - this.len + v * this.len;
      for (let s = 0; s < NS; s++) {
        const a = (s / NS) * Math.PI * 2, i = idx(r, s) * 3;
        this.rest[i] = rx * Math.cos(a); this.rest[i + 1] = y; this.rest[i + 2] = rz * Math.sin(a);
      }
    }
    // --- kısıtlar ---
    const C = [];
    const add = (a, b, k) => {
      const ia = a * 3, ib = b * 3;
      C.push(a, b, Math.hypot(this.rest[ia] - this.rest[ib], this.rest[ia + 1] - this.rest[ib + 1], this.rest[ia + 2] - this.rest[ib + 2]), k);
    };
    for (let r = 0; r < NR; r++) for (let s = 0; s < NS; s++) {
      add(idx(r, s), idx(r, s + 1), 1);                       // çevre
      add(idx(r, s), idx(r, s + 2), 0.18);                    // çevresel eğilme
      if (r < RIM) {
        add(idx(r, s), idx(r + 1, s), 1);                     // boyuna
        add(idx(r, s), idx(r + 1, s + 1), 0.55);              // kesme
        add(idx(r, s + 1), idx(r + 1, s), 0.55);
      }
      if (r < RIM - 1) add(idx(r, s), idx(r + 2, s), 0.22);   // boyuna eğilme (çuval bezi biraz serttir)
    }
    for (let s = 1; s < NS / 2; s++) add(idx(0, s), idx(0, NS - s), 1); // alt dikiş: ön ve arka yüz dikili
    this.cA = new Int32Array(C.length / 4); this.cB = new Int32Array(C.length / 4);
    this.cL = new Float32Array(C.length / 4); this.cK = new Float32Array(C.length / 4);
    for (let i = 0; i < C.length / 4; i++) { this.cA[i] = C[i * 4]; this.cB[i] = C[i * 4 + 1]; this.cL[i] = C[i * 4 + 2]; this.cK[i] = C[i * 4 + 3]; }
    this.ringRest = new Float32Array(N); this.vertRest = new Float32Array(N);
    for (let r = 0; r < NR; r++) for (let s = 0; s < NS; s++) {
      const i = idx(r, s), j = idx(r, s + 1), k = idx(Math.min(RIM, r + 1), s), rr = this.rest;
      this.ringRest[i] = Math.hypot(rr[i * 3] - rr[j * 3], rr[i * 3 + 1] - rr[j * 3 + 1], rr[i * 3 + 2] - rr[j * 3 + 2]);
      this.vertRest[i] = r < RIM ? Math.hypot(rr[i * 3] - rr[k * 3], rr[i * 3 + 1] - rr[k * 3 + 1], rr[i * 3 + 2] - rr[k * 3 + 2]) : this.vertRest[idx(r - 1, s)];
    }
    // --- durum ---
    this.p = new Float32Array(N * 3); this.q = new Float32Array(N * 3);   // konum, önceki konum (dünya)
    this.pinPrev = new Float32Array(NS * 3); this.pinNow = new Float32Array(NS * 3);
    this.contact = new Uint8Array(N);
    this.ready = false;
    this.frame = new THREE.Matrix4(); this.inv = new THREE.Matrix4();
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._o = new THREE.Vector3();
    this.lastOrigin = new THREE.Vector3();

    // --- görüntü ağı ---
    this.RS = lod ? 36 : 52; this.RJ = lod ? 20 : 30;
    const RS = this.RS, RJ = this.RJ, rings = RJ + 2;            // +2: kıvrık ağız kenarı
    const nv = rings * (RS + 1);
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.strain = new Float32Array(nv * 2);
    this.geo.setAttribute('aStrain', new THREE.BufferAttribute(this.strain, 2).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(nv * 2);
    for (let j = 0; j < rings; j++) for (let i = 0; i <= RS; i++) {
      const k = j * (RS + 1) + i;
      uv[k * 2] = i / RS - 0.125;                               // damga ön ve arka yüzün ortasına gelir
      uv[k * 2 + 1] = j < RJ ? j / (RJ - 1) : 1 + (j - RJ + 1) * 0.02;
    }
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const ind = [];
    for (let j = 0; j < rings - 1; j++) for (let i = 0; i < RS; i++) {
      const a = j * (RS + 1) + i, b = a + RS + 1;
      ind.push(a, b, a + 1, a + 1, b, b + 1);                   // dış yüz ön yüzdür
    }
    for (let i = 0; i < RS / 2; i++) ind.push(i, i + 1, RS - i, i + 1, RS - i - 1, RS - i); // alt dikiş kapanışı
    this.geo.setIndex(ind);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.55, 0), 1.6);
    // Catmull-Rom tabloları
    this.wJ = new Float32Array(RJ * 4); this.rJ = new Int32Array(RJ);
    for (let j = 0; j < RJ; j++) { const f = (j / (RJ - 1)) * RIM, r0 = Math.min(RIM - 1, Math.floor(f)); this.rJ[j] = r0; crw(f - r0, this.wJ, j * 4); }
    this.wI = new Float32Array(RS * 4); this.sI = new Int32Array(RS);
    for (let i = 0; i < RS; i++) { const f = (i / RS) * NS, s0 = Math.floor(f); this.sI[i] = s0; crw(f - s0, this.wI, i * 4); }
    // sabit kıvrım dalgaları (sıkışmayla ölçeklenir) ve kalıcı buruşukluk, köşe başına önceden
    this.fU = new Float32Array(RJ * RS); this.fV = new Float32Array(RJ * RS); this.fP = new Float32Array(RJ * RS);
    for (let j = 0; j < RJ; j++) for (let i = 0; i < RS; i++) {
      const v = j / (RJ - 1), ua = (i / RS) * Math.PI * 2, sd = this.seed, k = j * RS + i;
      this.fU[k] = Math.sin(ua * 13 + Math.sin(v * 9 + sd) * 2.2 + Math.sin(v * 23) * 0.6);
      this.fV[k] = Math.sin(v * Math.PI * 2 * 9 + Math.sin(ua * 3 + sd) * 1.8 + Math.sin(ua * 7) * 0.7);
      this.fP[k] = (Math.sin(ua * 5 + sd) * 0.5 + Math.sin(ua * 11 + v * 9 + sd * 2) * 0.3 + Math.sin(ua * 17 - v * 23 + sd) * 0.2) * 0.006 * (0.4 + v);
    }
    this.T = new Float32Array(NR * RS * 3);                     // çevre yönünde ara değerlenmiş halkalar
    this.L = new Float32Array(N * 3);                           // kök yerelinde parçacıklar
    this.cu = new Float32Array(N); this.cv = new Float32Array(N);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  // dinlenme biçimini çerçeveye yerleştir (ilk kare, ışınlanma)
  _reset(frame) {
    const v = this._v;
    for (let i = 0; i < N; i++) {
      v.set(this.rest[i * 3], Math.max(this.rest[i * 3 + 1], 0.01), this.rest[i * 3 + 2]).applyMatrix4(frame);
      this.p[i * 3] = this.q[i * 3] = v.x; this.p[i * 3 + 1] = this.q[i * 3 + 1] = v.y; this.p[i * 3 + 2] = this.q[i * 3 + 2] = v.z;
    }
    this.ready = true;
  }

  // ağız halkasının hedefleri (dünya): bel elipsi, eller kavrıyorsa elin çevresi oraya toplanır
  _pins(out, frame, inv, rimY, hands) {
    const v = this._v, w = this._w;
    const rx = this.rimR, rz = this.rimR * 0.88;
    const hl = hands ? hands.map((h) => h && h.clone().applyMatrix4(inv)) : null;
    for (let s = 0; s < NS; s++) {
      const a = (s / NS) * Math.PI * 2;
      v.set(rx * Math.cos(a), rimY, rz * Math.sin(a));
      if (hl) for (const h of hl) {
        if (!h) continue;
        const ah = Math.atan2(h.z / rz, h.x / rx);
        let d = a - ah; d = Math.atan2(Math.sin(d), Math.cos(d));
        const k = Math.exp(-((d / 0.4) ** 2)) * 0.92;
        // ağız kenarı yumruğun içinden geçer: parmakların hizasına toplanır
        w.set(h.x * 0.98, h.y - 0.045, h.z * 0.98);
        v.lerp(w, k);
      }
      v.applyMatrix4(frame);
      out[s * 3] = v.x; out[s * 3 + 1] = v.y; out[s * 3 + 2] = v.z;
    }
  }

  // drv: { frame: tilt.matrixWorld, rimY, hands: [Vector3|null, Vector3|null] | null }
  step(dt, drv) {
    if (dt <= 0) return;
    const frame = this.frame.copy(drv.frame), inv = this.inv.copy(frame).invert();
    const o = this._o.setFromMatrixPosition(frame);
    if (!this.ready || o.distanceTo(this.lastOrigin) > 1.2) { this._reset(frame); this._pins(this.pinNow, frame, inv, drv.rimY, null); }
    this.lastOrigin.copy(o);
    this.pinPrev.set(this.pinNow);
    this._pins(this.pinNow, frame, inv, drv.rimY, drv.hands);
    dt = Math.min(dt, 1 / 20);
    const n = Math.min(4, Math.max(1, Math.ceil(dt * 120))), h = dt / n;
    const p = this.p, q = this.q, e = inv.elements, f = frame.elements;
    const damp = 0.988, g = G * h * h;
    const its = this.its, fx0 = this.footX, fr2 = this.footR * this.footR;
    const capBy = this.capB.y, capH = this.capA.y - this.capB.y, capRB = this.capRB, capDR = this.capRA - this.capRB;
    for (let sub = 1; sub <= n; sub++) {
      const tp = sub / n;
      // Verlet tümleştirme
      for (let i = 0; i < (RIM) * NS; i++) {
        const k = i * 3;
        const vx = (p[k] - q[k]) * damp, vy = (p[k + 1] - q[k + 1]) * damp, vz = (p[k + 2] - q[k + 2]) * damp;
        q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
        p[k] += vx; p[k + 1] += vy + g; p[k + 2] += vz;
      }
      // ağız: kinematik, kare içinde ara değerlenir
      for (let s = 0; s < NS; s++) {
        const k = idx(RIM, s) * 3, m = s * 3;
        q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
        p[k] = this.pinPrev[m] + (this.pinNow[m] - this.pinPrev[m]) * tp;
        p[k + 1] = this.pinPrev[m + 1] + (this.pinNow[m + 1] - this.pinPrev[m + 1]) * tp;
        p[k + 2] = this.pinPrev[m + 2] + (this.pinNow[m + 2] - this.pinPrev[m + 2]) * tp;
      }
      this.contact.fill(0);
      for (let it = 0; it < its; it++) {
        // mesafe kısıtları
        const A = this.cA, B = this.cB, Ls = this.cL, K = this.cK;
        for (let c = 0; c < A.length; c++) {
          const a = A[c], b = B[c], ka = a * 3, kb = b * 3;
          const wa = a >= RIM * NS ? 0 : 1, wb = b >= RIM * NS ? 0 : 1, ws = wa + wb;
          if (!ws) continue;
          const dx = p[kb] - p[ka], dy = p[kb + 1] - p[ka + 1], dz = p[kb + 2] - p[ka + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          let diff = (d - Ls[c]) / d;
          if (K[c] < 1 && diff < 0) diff *= 0.35;             // eğilme yayları sıkışmaya karşı yumuşak: kumaş katlanabilir
          diff *= K[c] / ws;
          p[ka] += dx * diff * wa; p[ka + 1] += dy * diff * wa; p[ka + 2] += dz * diff * wa;
          p[kb] -= dx * diff * wb; p[kb + 1] -= dy * diff * wb; p[kb + 2] -= dz * diff * wb;
        }
        // çarpışmalar (tilt yerelinde): bacak kapsülü, ayak tabanları; sonra zemin (dünya)
        for (let i = 0; i < RIM * NS; i++) {
          const k = i * 3, x = p[k], y = p[k + 1], z = p[k + 2];
          let lx = e[0] * x + e[4] * y + e[8] * z + e[12], ly = e[1] * x + e[5] * y + e[9] * z + e[13], lz = e[2] * x + e[6] * y + e[10] * z + e[14];
          let moved = false;
          // kapsül: A (kalça) - B (ayak bileği), dikey eksen
          const t = Math.min(1, Math.max(0, (ly - capBy) / capH));
          const rad = capRB + capDR * t + 0.008;
          const cy = capBy + capH * t;
          let dx = lx, dy = ly - cy, dz = lz;
          let dd = dx * dx + dy * dy + dz * dz;
          if (dd < rad * rad) {
            const d = Math.sqrt(dd) || 1e-6, s = rad / d;
            lx = dx * s; ly = cy + dy * s; lz = dz * s; moved = true;
          }
          // ayak tabanı: tabanın altındaki bez yukarı çıkamaz (ayaklar çuvalın dibine basar)
          if (ly > -0.006) {
            const ea = lx - fx0, eb = lx + fx0, zz = lz * lz;
            if (ea * ea + zz < fr2 || eb * eb + zz < fr2) { ly = -0.006; moved = true; }
          }
          if (moved) {
            p[k] = f[0] * lx + f[4] * ly + f[8] * lz + f[12];
            p[k + 1] = f[1] * lx + f[5] * ly + f[9] * lz + f[13];
            p[k + 2] = f[2] * lx + f[6] * ly + f[10] * lz + f[14];
          }
          if (p[k + 1] < 0.006) { p[k + 1] = 0.006; this.contact[i] = 1; }
        }
      }
      // zemin sürtünmesi ve biçim hafızası (kumaş dinlenme biçimini hafifçe hatırlar)
      for (let i = 0; i < RIM * NS; i++) {
        const k = i * 3;
        if (this.contact[i]) { q[k] = p[k] + (q[k] - p[k]) * 0.25; q[k + 2] = p[k + 2] + (q[k + 2] - p[k + 2]) * 0.25; if (q[k + 1] < 0.006) q[k + 1] = 0.006; }
        const r = Math.floor(i / NS), km = r < 3 ? 0.002 : r > RIM - 3 ? 0.03 : 0.012;
        const rx = this.rest[k], ry = this.rest[k + 1], rz = this.rest[k + 2];
        const wx = f[0] * rx + f[4] * ry + f[8] * rz + f[12], wy = f[1] * rx + f[5] * ry + f[9] * rz + f[13], wz = f[2] * rx + f[6] * ry + f[10] * rz + f[14];
        p[k] += (wx - p[k]) * km; p[k + 1] += (wy - p[k + 1]) * km * 0.4; p[k + 2] += (wz - p[k + 2]) * km;
      }
    }
  }

  // görüntü ağını kök (root) yerelinde kur
  updateMesh(rootInv) {
    const L = this.L, p = this.p, e = rootInv.elements;
    for (let i = 0; i < N; i++) {
      const k = i * 3, x = p[k], y = p[k + 1], z = p[k + 2];
      L[k] = e[0] * x + e[4] * y + e[8] * z + e[12]; L[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; L[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    // sıkışma (0 = gergin/doğal, >0 = katlanıyor)
    for (let r = 0; r < NR; r++) for (let s = 0; s < NS; s++) {
      const i = idx(r, s), j = idx(r, s + 1), u = idx(Math.min(RIM, r + 1), s);
      const du = Math.hypot(L[i * 3] - L[j * 3], L[i * 3 + 1] - L[j * 3 + 1], L[i * 3 + 2] - L[j * 3 + 2]);
      this.cu[i] = Math.min(0.7, Math.max(0, 1 - du / this.ringRest[i]) * 1.6);
      if (r < RIM) {
        const dv = Math.hypot(L[i * 3] - L[u * 3], L[i * 3 + 1] - L[u * 3 + 1], L[i * 3 + 2] - L[u * 3 + 2]);
        this.cv[i] = Math.min(0.7, Math.max(0, 1 - dv / this.vertRest[i]) * 1.4);
      } else this.cv[i] = this.cv[idx(r - 1, s)];
    }
    // eksen: çerçevenin yukarı yönü (radyal kıvrım yönü için)
    const fe = this.frame.elements;
    const O = this._v.set(fe[12], fe[13], fe[14]).applyMatrix4(rootInv);
    const U = this._w.set(fe[4], fe[5], fe[6]).transformDirection(rootInv);
    const RS = this.RS, RJ = this.RJ, pos = this.pos, st = this.strain, wJ = this.wJ, wI = this.wI, T = this.T;
    // 1) her simülasyon halkasını çevre yönünde ara değerle (Catmull-Rom, dönemli)
    for (let r = 0; r < NR; r++) for (let i = 0; i < RS; i++) {
      const s0 = this.sI[i], w0 = wI[i * 4], w1 = wI[i * 4 + 1], w2 = wI[i * 4 + 2], w3 = wI[i * 4 + 3];
      const a0 = idx(r, s0 - 1) * 3, a1 = idx(r, s0) * 3, a2 = idx(r, s0 + 1) * 3, a3 = idx(r, s0 + 2) * 3, o = (r * RS + i) * 3;
      T[o] = L[a0] * w0 + L[a1] * w1 + L[a2] * w2 + L[a3] * w3;
      T[o + 1] = L[a0 + 1] * w0 + L[a1 + 1] * w1 + L[a2 + 1] * w2 + L[a3 + 1] * w3;
      T[o + 2] = L[a0 + 2] * w0 + L[a1 + 2] * w1 + L[a2 + 2] * w2 + L[a3 + 2] * w3;
    }
    // 2) boyuna ara değerle, sıkışmaya göre kıvrımları ekle
    for (let j = 0; j < RJ; j++) {
      const r0 = this.rJ[j], fr = (j / (RJ - 1)) * RIM - r0;
      const rA = Math.max(0, r0 - 1), rD = Math.min(RIM, r0 + 2);
      const w0 = wJ[j * 4], w1 = wJ[j * 4 + 1], w2 = wJ[j * 4 + 2], w3 = wJ[j * 4 + 3];
      for (let i = 0; i < RS; i++) {
        const a0 = (rA * RS + i) * 3, a1 = (r0 * RS + i) * 3, a2 = ((r0 + 1) * RS + i) * 3, a3 = (rD * RS + i) * 3;
        const x = T[a0] * w0 + T[a1] * w1 + T[a2] * w2 + T[a3] * w3;
        const y = T[a0 + 1] * w0 + T[a1 + 1] * w1 + T[a2 + 1] * w2 + T[a3 + 1] * w3;
        const z = T[a0 + 2] * w0 + T[a1 + 2] * w1 + T[a2 + 2] * w2 + T[a3 + 2] * w3;
        const s0 = this.sI[i], fs = (i / RS) * NS - s0;
        const i00 = idx(r0, s0), i01 = idx(r0, s0 + 1), i10 = idx(r0 + 1, s0), i11 = idx(r0 + 1, s0 + 1);
        const cu = (this.cu[i00] * (1 - fs) + this.cu[i01] * fs) * (1 - fr) + (this.cu[i10] * (1 - fs) + this.cu[i11] * fs) * fr;
        const cv = (this.cv[i00] * (1 - fs) + this.cv[i01] * fs) * (1 - fr) + (this.cv[i10] * (1 - fs) + this.cv[i11] * fs) * fr;
        let dx = x - O.x, dy = y - O.y, dz = z - O.z;
        const dp = dx * U.x + dy * U.y + dz * U.z;
        dx -= U.x * dp; dy -= U.y * dp; dz -= U.z * dp;
        const dl = 1 / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1);
        const f = j * RS + i, disp = (cu * 0.038 * this.fU[f] + cv * 0.045 * this.fV[f] + this.fP[f]) * dl;
        const vi = j * (RS + 1) + i, k = vi * 3;
        pos[k] = x + dx * disp; pos[k + 1] = y + dy * disp; pos[k + 2] = z + dz * disp;
        st[vi * 2] = cu; st[vi * 2 + 1] = cv;
      }
      const a = j * (RS + 1) * 3, b = (j * (RS + 1) + RS) * 3;
      pos[b] = pos[a]; pos[b + 1] = pos[a + 1]; pos[b + 2] = pos[a + 2];
      st[(j * (RS + 1) + RS) * 2] = st[j * (RS + 1) * 2]; st[(j * (RS + 1) + RS) * 2 + 1] = st[j * (RS + 1) * 2 + 1];
    }
    // ağız kenarı: dışa kıvrılıp aşağı katlanan kalın bir kenar (iki ek halka)
    const top = (RJ - 1) * (RS + 1);
    for (let i = 0; i <= RS; i++) {
      const k = (top + i) * 3;
      let dx = pos[k] - O.x, dy = pos[k + 1] - O.y, dz = pos[k + 2] - O.z;
      const dp = dx * U.x + dy * U.y + dz * U.z;
      dx -= U.x * dp; dy -= U.y * dp; dz -= U.z * dp;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      const k1 = (top + RS + 1 + i) * 3, k2 = (top + 2 * (RS + 1) + i) * 3;
      pos[k1] = pos[k] + dx * 0.013 + U.x * 0.009; pos[k1 + 1] = pos[k + 1] + dy * 0.013 + U.y * 0.009; pos[k1 + 2] = pos[k + 2] + dz * 0.013 + U.z * 0.009;
      pos[k2] = pos[k] + dx * 0.024 - U.x * 0.032; pos[k2 + 1] = pos[k + 1] + dy * 0.024 - U.y * 0.032; pos[k2 + 2] = pos[k + 2] + dz * 0.024 - U.z * 0.032;
      const s0 = (top + i) * 2;
      st[(top + RS + 1 + i) * 2] = st[s0]; st[(top + RS + 1 + i) * 2 + 1] = 0;
      st[(top + 2 * (RS + 1) + i) * 2] = st[s0]; st[(top + 2 * (RS + 1) + i) * 2 + 1] = 0;
    }
    const g = this.geo;
    g.attributes.position.needsUpdate = true;
    g.attributes.aStrain.needsUpdate = true;
    // normaller: ızgara komşularından (çevre yönü dönemli, boyuna uçlarda tek yönlü fark)
    const nr = g.attributes.normal.array, rings = RJ + 2, W = RS + 1;
    for (let j = 0; j < rings; j++) {
      const jp = Math.min(rings - 1, j + 1), jm = Math.max(0, j - 1);
      for (let i = 0; i < RS; i++) {
        const ip = (i + 1) % RS, im = (i + RS - 1) % RS;
        const a = (j * W + ip) * 3, b = (j * W + im) * 3, c = (jp * W + i) * 3, d = (jm * W + i) * 3;
        const ux = pos[a] - pos[b], uy = pos[a + 1] - pos[b + 1], uz = pos[a + 2] - pos[b + 2];
        const vx = pos[c] - pos[d], vy = pos[c + 1] - pos[d + 1], vz = pos[c + 2] - pos[d + 2];
        let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux;
        const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
        const k = (j * W + i) * 3;
        nr[k] = nx * l; nr[k + 1] = ny * l; nr[k + 2] = nz * l;
      }
      const a = j * W * 3, b = (j * W + RS) * 3;
      nr[b] = nr[a]; nr[b + 1] = nr[a + 1]; nr[b + 2] = nr[a + 2];
    }
    g.attributes.normal.needsUpdate = true;
  }
}
