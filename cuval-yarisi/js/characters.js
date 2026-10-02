// Prosedürel karakterler: SDF ile heykel gibi üretilmiş tek parça gövde, yüz, eller ve başörtüsü;
// koddan kurulan iskelet + otomatik deri ağırlıkları, yüz morph'ları (göz kırpma, dudak, kaş),
// shader'da üretilen kumaş desenleri ve prosedürel animasyon klipleri. Harici model kullanılmaz.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh as surfaceNets, compile } from './proc/sdf.js';
import { R, TAGS, EYE, MOUTH, APOSE, skeleton, headOps, buildPart } from './proc/shapes.js';
import { MeshoptSimplifier } from '../vendor/meshoptimizer/meshopt_simplifier.module.js';
export { APOSE };

// ---------- Çözünürlükler (hücre boyu, metre) ----------
// [hücre boyu, hedef üçgen, sadeleştirici yoksa kaba hücre]
const RES = {
  full: { head: [0.0032, 7000, 0.0048], body: [0.009, 9000, 0.0135], hand: [0.0022, 1400, 0.0034], scarf: [0.0045, 3500, 0.006], fez: [0.0048, 1200, 0.007] },
  mid: { head: [0.0052, 2600, 0.0075], body: [0.015, 3600, 0.021], hand: [0.0042, 500, 0.006], scarf: [0.0068, 1400, 0.009], fez: [0.0075, 500, 0.01] },
  low: { head: [0.009, 420, 0.0125, 0.08], body: [0.025, 640, 0.034, 0.08], hand: [0.0095, 60, 0.012, 0.08], scarf: [0.011, 230, 0.0135, 0.08], fez: [0.011, 100, 0.013, 0.08] },
};
const res = (r) => ({ h: r[0], tris: r[1], hc: r[2], ...(r[3] ? { err: r[3] } : {}) });
const lodName = (lod) => (lod === 'mid' ? 'mid' : lod ? 'low' : 'full');

// ---------- Parça üretimi: worker havuzu ----------
const partCache = new Map();
let workers = null, nextId = 1;
const pending = new Map();
function pool() {
  if (workers !== null) return workers;
  workers = [];
  try {
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./proc/worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { const p = pending.get(e.data.id); pending.delete(e.data.id); if (e.data.error) p.rej(new Error(e.data.error)); else p.res(e.data.r); };
      workers.push(w);
    }
  } catch { workers = []; }
  return workers;
}
const jobKey = (job) => JSON.stringify(job);
let mainSimplify = null;
MeshoptSimplifier.ready.then(() => {
  mainSimplify = (indices, positions, attr, target, err = 0.03) => MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attr, 4, [0.25, 0.25, 0.25, 2.5], null, target, err, [])[0];
}).catch(() => {});
const buildMain = (job) => buildPart(mainSimplify ? job : { ...job, h: job.hc ?? job.h }, surfaceNets, mainSimplify);
function genPart(job) {
  const key = jobKey(job);
  if (partCache.has(key)) return partCache.get(key);
  const ws = pool();
  let p;
  if (ws.length) {
    const id = nextId++;
    p = new Promise((res, rej) => {
      pending.set(id, { res, rej });
      ws[id % ws.length].postMessage({ id, job });
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('worker zaman aşımı')); } }, 60000);
    }).catch(() => buildMain(job)); // worker başarısızsa ana iş parçacığında üret
  } else p = new Promise((r) => setTimeout(() => r(buildMain(job)), 0));
  partCache.set(key, p);
  p.then((r) => partCache.set(key, r));
  return p;
}
function partSync(job) {
  const key = jobKey(job);
  const c = partCache.get(key);
  if (c && !(c instanceof Promise)) return c;
  const r = buildMain(job);
  partCache.set(key, r);
  return r;
}

// ---------- Karakter tanımı -> parça işleri ----------
function specOf(o) {
  const sex = o.sex ?? 'f', lod = lodName(o.lod), H = RES[lod];
  const look = o.look || {};
  const build = Math.round((look.build ?? o.build ?? 1) * 10) / 10;
  const outfit = sex === 'f' ? 'entari' : (o.outfit ?? 'coat');
  const skirt = sex === 'f' ? (o.skirt ?? 'narrow') : null;
  const belly = Math.round((o.belly ?? 0) * 2) / 2;
  const bodyBuild = sex === 'f' ? (build > 1.05 ? 1.2 : 1.0) : 1;
  const round = sex === 'f' ? (build > 1.05 ? 1 : 0) : 0;
  const face = sex === 'm' ? { beard: !!o.beard, mustacheDroop: o.beard ? 0.4 : 0 } : { round };
  const S = sex === 'm' ? 1.08 : 1;
  const grip = o.grip ?? 0.35;
  const jobs = {
    body: { kind: 'body', o: { sex, build: bodyBuild, belly, outfit, skirt }, ...res(H.body) },
    head: { kind: 'head', face: sex, v: face, ...res(H.head) },
    handL: { kind: 'hand', grip, side: 1, S, ...res(H.hand) },
    handR: { kind: 'hand', grip, side: -1, S, ...res(H.hand) },
  };
  if (sex === 'f' && o.hood !== false) jobs.scarf = { kind: 'scarf', ...res(H.scarf), thick: Math.round(Math.max(0.008, H.scarf[2] * 1.5) * 1e4) / 1e4 };
  if (sex === 'm' && o.fez) jobs.fez = { kind: 'fez', ...res(H.fez) };
  return { sex, lod, jobs, face: lod !== 'low', key: `${sex}|${lod}|${jobKey(jobs)}` };
}

// Oyunda kullanılan karakter türleri: yüklemede hepsi arka planda üretilir
const PRESETS = [
  { sex: 'f', build: 1.0, grip: 0.95 }, { sex: 'f', build: 1.22, grip: 0.95 },
  { sex: 'f', lod: 'mid', build: 1.0, grip: 0.95 }, { sex: 'f', lod: 'mid', build: 1.22, grip: 0.95 },
  { sex: 'f', lod: 'mid', build: 1.0 },
  { sex: 'm', lod: 'mid', outfit: 'coat', beard: true, fez: true }, { sex: 'm', lod: 'mid', outfit: 'coat', beard: true, fez: true, belly: 1 },
  { sex: 'm', lod: 'mid', outfit: 'uniform', fez: true }, { sex: 'm', lod: 'mid', outfit: 'villager', beard: true, fez: true },
  { sex: 'm', lod: 'mid', outfit: 'coat', fez: true },
  { sex: 'f', lod: true, skirt: 'long' }, { sex: 'm', lod: true, outfit: 'villager', fez: true }, { sex: 'm', lod: true, outfit: 'villager', fez: true, beard: true },
  { sex: 'm', lod: true, outfit: 'coat', fez: true },
];

export async function loadCharacterParts(_loadBin, track) {
  const all = [];
  for (const p of PRESETS) for (const j of Object.values(specOf(p).jobs)) all.push(j);
  const uniq = [...new Map(all.map((j) => [jobKey(j), j])).values()];
  // büyük işler önce: worker'lar dengeli dolsun
  uniq.sort((a, b) => (a.h - b.h));
  await Promise.all(uniq.map((j) => track(genPart(j))));
}

// ---------- İskelet ----------
function buildSkeleton(sex) {
  const { bones } = skeleton(sex);
  const map = {}, list = [];
  for (const [name, parent, p] of bones) {
    const b = new THREE.Bone(); b.name = name;
    const pp = parent ? bones.find((x) => x[0] === parent)[2] : [0, 0, 0];
    b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    if (parent) map[parent].add(b);
    map[name] = b; list.push(b);
  }
  return { map, list, root: map.root };
}

// ---------- Yüz parçaları (morph'lu): göz kapakları, kaşlar, dudaklar ----------
const MORPH = ['blink', 'smile', 'open', 'strain', 'oh', 'browUp', 'browAngry'];
const faceCache = {};
function faceParts(sex) {
  if (faceCache[sex]) return faceCache[sex];
  const S = sex === 'm' ? 1.05 : 1;
  const sdf = compile(headOps(sex, {}).filter((o) => o.id !== 'recess'));
  const sdfN = (x, y, z) => { const e = 0.0005; const n = [sdf.f(x + e, y, z) - sdf.f(x - e, y, z), sdf.f(x, y + e, z) - sdf.f(x, y - e, z), sdf.f(x, y, z + e) - sdf.f(x, y, z - e)]; const l = Math.hypot(...n) || 1; return n.map((c) => c / l); };
  // yüzeyi önden ışınla bul (baş yerelinde)
  const surfZ = (x, y) => { let z = 0.16; for (let i = 0; i < 90; i++) { const d = sdf.f(x, y, z); if (d < 0.0003) break; z -= Math.max(d * 0.9, 0.0003); } return z; };
  const P = [], REG = [], MT = MORPH.map(() => []), IDX = [], NB = [], NS = [];
  // NB: yüz normali karışım ağırlığı (0 = başın SDF normali, kenarlarda dikişsiz geçiş), NS: SDF normali
  let curBlend = () => 1;
  const push = (base, reg, morphs, blend = 1) => {
    P.push(...base); REG.push(reg); NB.push(blend); NS.push(...(blend < 1 ? sdfN(base[0], base[1], base[2]) : [0, 0, 1]));
    MORPH.forEach((m, i) => { const t = morphs[m]; MT[i].push(t ? t[0] - base[0] : 0, t ? t[1] - base[1] : 0, t ? t[2] - base[2] : 0); });
  };
  // ızgara kurucusu: fn(u, v, morph) -> [x,y,z] veya null (o morph'ta değişmez)
  const grid = (U, V, fn, regFn) => {
    const start = P.length / 3;
    for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) {
      const base = fn(i / U, j / V, null), morphs = {};
      for (const m of MORPH) { const q = fn(i / U, j / V, m); if (q) morphs[m] = q; }
      push(base, regFn(i / U, j / V), morphs, curBlend(i / U, j / V));
    }
    const tri = [];
    for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
      const a = start + i * (V + 1) + j, b = a + V + 1;
      tri.push(a, b, a + 1, b, b + 1, a + 1);
    }
    // dışa bakan üçgen çoğunlukta değilse sarılmayı ters çevir
    let vote = 0;
    for (let t = 0; t < tri.length; t += 3) {
      const A = tri[t] * 3, B = tri[t + 1] * 3, Cc = tri[t + 2] * 3;
      const ux = P[B] - P[A], uy = P[B + 1] - P[A + 1], uz = P[B + 2] - P[A + 2], vx = P[Cc] - P[A], vy = P[Cc + 1] - P[A + 1], vz = P[Cc + 2] - P[A + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const cx = (P[A] + P[B] + P[Cc]) / 3, cy = (P[A + 1] + P[B + 1] + P[Cc + 1]) / 3, cz = (P[A + 2] + P[B + 2] + P[Cc + 2]) / 3;
      const nl = Math.hypot(nx, ny, nz) || 1, e = 0.002;
      vote += Math.sign(sdf.f(cx + nx / nl * e, cy + ny / nl * e, cz + nz / nl * e) - sdf.f(cx - nx / nl * e, cy - ny / nl * e, cz - nz / nl * e));
    }
    if (vote < 0) for (let t = 0; t < tri.length; t += 3) { const k = tri[t + 1]; tri[t + 1] = tri[t + 2]; tri[t + 2] = k; }
    IDX.push(...tri);
  };
  // --- üst göz kapakları: kapak kabuğunun içinde saklı durur, göz kırpınca yarığı kapatır; kirpik şeridi kenarla iner ---
  const lidEdge = (m) => (m === 'blink' ? -0.48 : m === 'browUp' || m === 'oh' ? 0.5 : m === 'browAngry' || m === 'strain' ? 0.2 : 0.43);
  for (const sx of [1, -1]) {
    const c = [sx * EYE.x * S, EYE.y * S, EYE.z * S], Rr = (EYE.r + 0.0012) * S;
    const lidM = (m) => !m || ['blink', 'browUp', 'browAngry', 'strain', 'oh'].includes(m);
    grid(14, 5, (u, v, m) => {
      if (m && !lidM(m)) return null;
      const a = (u - 0.5) * 2.0, b = 1.2 + (lidEdge(m) - 1.2) * v;
      return [c[0] + Rr * Math.sin(a) * Math.cos(b), c[1] + Rr * Math.sin(b), c[2] + Rr * Math.cos(a) * Math.cos(b)];
    }, () => R.SKIN);
    grid(14, 2, (u, v, m) => {
      if (m && !lidM(m)) return null;
      const a = (u - 0.5) * 1.95, curl = Math.sin(u * Math.PI);
      const b = lidEdge(m) - v * 0.07 * curl, rr = (EYE.r + 0.0021 + v * 0.0024 * curl) * S;
      return [c[0] + rr * Math.sin(a) * Math.cos(b), c[1] + rr * Math.sin(b), c[2] + rr * Math.cos(a) * Math.cos(b)];
    }, () => R.HAIR);
  }
  // --- kaşlar ---
  for (const sx of [1, -1]) {
    const pts = [[0.0095, 0.1055], [0.021, 0.1105], [0.034, 0.1108], [0.046, 0.1038]].map(([x, y]) => [x * S, y * S]);
    grid(12, 6, (u, v, m) => {
      if (m && !['browUp', 'browAngry', 'oh', 'strain'].includes(m)) return null;
      const k = u * (pts.length - 1), i0 = Math.min(pts.length - 2, Math.floor(k)), f = k - i0;
      let x = pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * f, y = pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * f;
      const inner = 1 - u;
      if (m === 'browUp' || m === 'oh') y += (0.005 + inner * 0.003) * S;
      if (m === 'browAngry' || m === 'strain') { y -= inner * 0.0055 * S - u * 0.0015 * S; x -= inner * 0.002 * S; }
      const z = surfZ(x, y) + 0.0012;
      const taper = Math.pow(Math.sin(Math.PI * Math.min(0.97, 0.12 + u * 0.88)), 0.6) * (1.15 - u * 0.4);
      const ang = v * Math.PI * 2;
      return [sx * x, y + Math.sin(ang) * 0.0028 * taper * (sex === 'm' ? 1.25 : 1), z + Math.cos(ang) * 0.0016 * taper];
    }, () => R.HAIR);
  }
  // --- ağız yaması: yüz yüzeyine oturur, dış kenarı cilde dikişsiz kaynaşır, iç kısmında dudak kabarıklığı ---
  const my = MOUTH.y * S, mw = MOUTH.w * S;
  for (const lip of ['up', 'lo']) {
    const sgn = lip === 'up' ? 1 : -1;
    curBlend = (u, v) => Math.min(1, Math.max(0, (v - 0.25) / 0.4));
    grid(22, 10, (u, v, m) => {
      const uu = u * 2 - 1, w = Math.pow(v, 1.5);
      const width = (0.0275 + (0.0195 - 0.0275) * v * v) * S;
      let x = uu * width;
      const hOut = (lip === 'up' ? 0.0165 : 0.0175) * S;
      const yOut = my + sgn * hOut * Math.sqrt(Math.max(0, 1 - uu * uu * 0.85));
      let yIn = my + sgn * 0.00035 * S + (lip === 'up' ? 0.00055 * S * Math.exp(-((uu / 0.3) ** 2)) - 0.0004 * S * Math.exp(-((uu / 0.07) ** 2)) : 0);
      let y = yOut + (yIn - yOut) * v;
      const lipStart = lip === 'up' ? 0.7 : 0.64;
      const t = Math.max(0, (v - lipStart) / (1 - lipStart));
      let bulge = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.65) * (lip === 'up' ? 0.0017 : 0.0025) * S * Math.pow(Math.max(0, 1 - uu * uu), 0.5);
      let dz = 0;
      if (m === 'smile') { x *= 1 + 0.1 * w; y += 0.0055 * S * uu * uu * w + 0.0015 * S * w * (1 - v) * uu * uu; dz -= 0.0025 * uu * uu * w; bulge *= 0.85; }
      else if (m === 'open') { y += (lip === 'up' ? 0.0025 * w : -(0.0115 * w + 0.004 * (1 - v))) * S * Math.pow(Math.max(0, 1 - uu * uu), 0.6); }
      else if (m === 'strain') { x *= 1 + 0.15 * w; y += (lip === 'up' ? 0.0022 : -0.0042) * S * w * (1 - uu * uu); bulge *= 0.6; }
      else if (m === 'oh') { x *= 1 - 0.36 * w; y += (lip === 'up' ? 0.005 : -0.0075) * S * w * Math.sqrt(Math.max(0, 1 - uu * uu)); dz += 0.0045 * w; }
      else if (m) return null;
      const zs = surfZ(x * 0.95, y);
      const n = sdfN(x, y, zs);
      return [x + n[0] * bulge, y + n[1] * bulge, zs + n[2] * bulge + 0.00025 + dz];
    }, (u, v) => (v > (lip === 'up' ? 0.7 : 0.64) ? R.LIP : R.SKIN));
    curBlend = () => 1;
  }
  // ağız içi (koyu elips) ve dişler
  const zc = surfZ(0, my) - 0.0028;
  grid(16, 1, (u, v, m) => {
    const a = u * Math.PI * 2;
    let rx = 0.019 * S, ry = 0.0012 * S;
    if (m === 'open') ry = 0.011 * S; else if (m === 'oh') { ry = 0.008 * S; rx = 0.012 * S; } else if (m === 'strain') ry = 0.004 * S; else if (m === 'smile') ry = 0.0025 * S; else if (m) return null;
    return [Math.cos(a) * rx * v, my - 0.001 + Math.sin(a) * ry * v, zc + 0.002 * (1 - v)];
  }, () => R.MOUTH);
  grid(10, 3, (u, v, m) => {
    if (m) return null;
    const x = (u - 0.5) * 0.031 * S, a = v * Math.PI;
    return [x, my + 0.0022 * S + Math.cos(a) * 0.0022 * S, zc + 0.0035 - Math.sin(a) * 0.0018 - Math.abs(x) * 0.25];
  }, () => R.TEETH);
  faceCache[sex] = { positions: P, regions: REG, morphs: MT, indices: IDX, blend: NB, sdfNormal: NS };
  return faceCache[sex];
}

// ---------- Göz dokusu ----------
let _eyeTex = null;
function eyeTexture() {
  if (_eyeTex) return _eyeTex;
  const W = 512, Hh = 256, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const x = c.getContext('2d');
  const sg = x.createRadialGradient(128, 128, 20, 128, 128, 200);
  sg.addColorStop(0, '#fbf8f3'); sg.addColorStop(0.6, '#f1e8e2'); sg.addColorStop(1, '#d9b8b0');
  x.fillStyle = sg; x.fillRect(0, 0, W, Hh);
  x.strokeStyle = 'rgba(190,70,70,0.22)'; x.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2; let px = 128 + Math.cos(a) * 120, py = 128 + Math.sin(a) * 90;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (128 - px) * 0.12 + (Math.random() - 0.5) * 10; py += (128 - py) * 0.12 + (Math.random() - 0.5) * 10; x.lineTo(px, py); }
    x.stroke();
  }
  const ir = 44;
  const ig = x.createRadialGradient(128, 128, 6, 128, 128, ir);
  ig.addColorStop(0, '#2a1608'); ig.addColorStop(0.35, '#7a4a1e'); ig.addColorStop(0.7, '#5a3412'); ig.addColorStop(0.9, '#3a200c'); ig.addColorStop(1, '#1a0e06');
  x.fillStyle = ig; x.beginPath(); x.arc(128, 128, ir, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + Math.random() * 0.05, r0 = 15 + Math.random() * 6, r1 = ir - 4 - Math.random() * 8;
    x.strokeStyle = `rgba(${200 + Math.random() * 40},${140 + Math.random() * 40},${60 + Math.random() * 30},${0.12 + Math.random() * 0.2})`;
    x.beginPath(); x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); x.lineTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1); x.stroke();
  }
  x.fillStyle = '#060302'; x.beginPath(); x.arc(128, 128, 15, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(10,5,2,0.8)'; x.lineWidth = 4; x.beginPath(); x.arc(128, 128, ir, 0, Math.PI * 2); x.stroke();
  _eyeTex = new THREE.CanvasTexture(c);
  _eyeTex.colorSpace = THREE.SRGBColorSpace;
  _eyeTex.wrapS = THREE.RepeatWrapping;
  _eyeTex.anisotropy = 4;
  return _eyeTex;
}
function eyeGeometry(sex, lod) {
  const S = sex === 'm' ? 1.05 : 1, seg = lod === 'low' ? 8 : lod === 'mid' ? 12 : 18;
  const gs = [1, -1].map((sx) => new THREE.SphereGeometry(EYE.r * S, seg, Math.round(seg * 0.75)).translate(sx * EYE.x * S, EYE.y * S, EYE.z * S));
  return mergeGeometries(gs);
}

// ---------- Kumaş/ten shader'ı ----------
const FRAG_HEAD = /* glsl */`
uniform vec3 uPal[20];
uniform vec3 uCheek;
uniform float uClipY;
flat varying float vRegion; varying float vAux; varying vec3 vRest;
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ return vnoise(p) * 0.5 + vnoise(p * 2.03) * 0.25 + vnoise(p * 4.1) * 0.125; }
float aaf(float c){ float w = fwidth(c); return 1.0 - smoothstep(0.35, 0.9, w); }
`;
const FRAG_ALBEDO = (instanced) => /* glsl */`
if (vRest.y < uClipY) discard;   // çuvalın içinde kalan bacaklar/etek çizilmez
int rg = int(vRegion + 0.5);
vec3 P = vRest;
vec3 base = uPal[rg];
${instanced ? `
#ifdef USE_INSTANCING_COLOR
  if (rg == 1 || rg == 3 || rg == 13) base = vColor;
  if (rg == 6) base = mix(vec3(0.95), vColor, 0.45);
#endif` : ''}
vec3 col = base;
float aRough = 0.7, aMetal = 0.0, aH = 0.0, aSheen = 0.0, aSSS = 0.0;
float ang = atan(P.x, P.z);
if (rg == 0) {                       // ten: çok hafif renk oynaması, yanaklarda allık, ince gözenek
  float n = fbm3(P * 60.0);
  col *= 0.97 + n * 0.05;
  float bl = max(0.0, 1.0 - distance(vec3(abs(P.x), P.y, P.z), uCheek) / 0.034);
  col = mix(col, col * vec3(1.08, 0.84, 0.82), bl * bl * 0.6);
  aRough = 0.5 + n * 0.08; aH = vnoise(P * 2200.0) * aaf(P.x * 2200.0) * 0.12; aSSS = 1.0;
} else if (rg == 1) {                // kutnu: ipek-pamuk çizgili kumaş
  float sc = ang * 11.0 / 3.14159, s = fract(sc), aa = aaf(sc);
  float stripe = smoothstep(0.40, 0.44, s) - smoothstep(0.56, 0.60, s);
  float thin = ((smoothstep(0.07, 0.09, s) - smoothstep(0.11, 0.13, s)) + (smoothstep(0.87, 0.89, s) - smoothstep(0.91, 0.93, s))) * aa;
  stripe = mix(0.3, stripe, aa);
  col = mix(base, uPal[17], stripe * 0.9);
  col = mix(col, uPal[4], thin * 0.75);
  vec2 cl = vec2(ang * 9.0 / 3.14159, P.y * 52.0); vec2 f = fract(cl) - 0.5;
  float dt = 1.0 - smoothstep(0.07, 0.13, length(f * vec2(1.0, 1.5)));
  col = mix(col, mix(uPal[4], vec3(1.0), 0.3), dt * (1.0 - stripe) * 0.55);
  aRough = 0.36 + 0.1 * vnoise(P * 300.0); aH = stripe * 0.6 + thin * 0.4 + vnoise(P * 1500.0) * aaf(P.y * 1500.0) * 0.3; aSheen = 0.55;
} else if (rg == 2) {                // beyaz keten gömlek
  float n = vnoise(P * 420.0);
  float weave = sin(P.x * 2600.0) * sin(P.y * 2600.0) * aaf(P.x * 2600.0);
  col = base * (0.93 + n * 0.07 + weave * 0.02);
  aRough = 0.82; aH = weave * 0.35 + n * 0.3;
} else if (rg == 3) {                // kadife yelek: kenarda altın sırma şerit, içte ince çizgi ve lale motifleri
  float e = vAux;
  float band = 1.0 - smoothstep(0.0075, 0.0095, e);
  float line2 = (smoothstep(0.0135, 0.0148, e) - smoothstep(0.0158, 0.0171, e));
  vec2 cl = vec2(ang * 5.0, P.y * 26.0); vec2 f = fract(cl) - 0.5;
  float tulip = (1.0 - smoothstep(0.1, 0.13, length(f - vec2(0.0, 0.05)))) + (1.0 - smoothstep(0.035, 0.06, abs(f.x))) * step(abs(f.y + 0.12), 0.12);
  tulip *= step(0.026, e) * aaf(cl.y);
  float gold = max(band, max(line2, tulip * 0.85));
  float braid = fract((P.x + P.y) * 380.0);
  col = mix(base * 0.8, uPal[4] * (0.82 + 0.25 * braid * band), gold);
  aMetal = gold * 0.88; aRough = mix(0.92, 0.33, gold); aSheen = 1.3 * (1.0 - gold); aH = band * 0.6 + line2 * 0.5 + tulip * 0.4 + braid * band * 0.4;
} else if (rg == 4 || rg == 14) {    // altın sırma / düğme
  float s = fract((P.x + P.y + P.z) * 260.0);
  col = uPal[4] * (0.78 + 0.3 * smoothstep(0.25, 0.75, s) * aaf((P.x + P.y) * 260.0));
  aMetal = 0.92; aRough = rg == 14 ? 0.22 : 0.34; aH = s * 0.5;
} else if (rg == 5) {                // çizgili kuşak
  float bnd = P.y * 70.0 + sin(ang * 3.0) * 0.2; float id = mod(floor(bnd), 5.0);
  col = id < 1.0 ? uPal[5] : id < 2.0 ? uPal[18] : id < 3.0 ? uPal[5] * 0.7 : id < 4.0 ? uPal[4] : uPal[18] * 0.8;
  aRough = 0.72; aH = (0.5 - abs(fract(bnd) - 0.5)) * 0.6 + vnoise(P * 1200.0) * 0.2;
} else if (rg == 6 && vAux < 0.0075) {   // yemeninin yüz kenarında oya
  float t = atan(P.y - (uCheek.y + 0.002), P.x) * 15.0; float id = mod(floor(t), 3.0);
  vec2 f = vec2(fract(t) - 0.5, vAux / 0.0075 - 0.5);
  float bead = 1.0 - smoothstep(0.25, 0.45, length(f * vec2(1.0, 1.4)));
  col = id < 1.0 ? uPal[7] : id < 2.0 ? uPal[19] : vec3(0.95, 0.9, 0.7);
  col *= 0.7 + 0.4 * bead;
  aRough = 0.45; aH = bead; aSheen = 0.3;
} else if (rg == 6) {                // çiçek baskılı yemeni
  vec2 cl = vec2(ang * 7.0, P.y * 58.0); vec2 f = fract(cl) - 0.5; vec2 idc = floor(cl);
  f += (vec2(h31(vec3(idc, 1.0)), h31(vec3(idc, 2.0))) - 0.5) * 0.25;
  float r = length(f), pet = 0.5 + 0.5 * cos(5.0 * atan(f.y, f.x));
  float fl = 1.0 - smoothstep(0.15 + 0.07 * pet, 0.2 + 0.07 * pet, r);
  float ctr = 1.0 - smoothstep(0.04, 0.07, r);
  col = mix(base, uPal[19], fl * 0.85);
  col = mix(col, uPal[7], ctr);
  aRough = 0.78; aH = fl * 0.35 + vnoise(P * 1000.0) * 0.2; aSheen = 0.3;
} else if (rg == 7) {                // oya: renkli küçük çiçekler
  float t = ang * 34.0 + P.y * 40.0; float id = mod(floor(t), 3.0);
  vec2 f = vec2(fract(t) - 0.5, fract(vAux * 160.0) - 0.5);
  float bead = 1.0 - smoothstep(0.28, 0.42, length(f));
  col = id < 1.0 ? uPal[7] : id < 2.0 ? uPal[19] : vec3(0.95);
  col *= 0.75 + 0.35 * bead;
  aRough = 0.45; aH = bead * 0.9; aSheen = 0.3;
} else if (rg == 8 || rg == 17) {    // saç, kaş, kirpik, püskül
  float s = sin(P.y * 800.0 + vnoise(P * 70.0) * 9.0 + P.x * 300.0);
  col = base * (0.82 + 0.22 * s * aaf(P.y * 800.0));
  aRough = 0.42; aH = s * 0.3;
} else if (rg == 9) {                // dudak
  col = base * (0.94 + 0.08 * sin(P.x * 1600.0) * aaf(P.x * 1600.0));
  aRough = 0.3; aSSS = 0.6;
} else if (rg == 10) {               // keçe fes
  float n = fbm3(P * 300.0);
  col = base * (0.88 + 0.16 * n); aRough = 0.95; aSheen = 0.6; aH = n * 0.4;
} else if (rg == 11) {               // deri
  float n = fbm3(P * 170.0);
  col = base * (0.82 + 0.25 * n); aRough = 0.48 + 0.2 * vnoise(P * 420.0); aH = vnoise(P * 650.0) * 0.4;
} else if (rg == 12) {               // pamuk şalvar
  float s = fract((P.x * 0.7 + P.y) * 520.0);
  col = base * (0.9 + 0.1 * s * aaf(P.y * 520.0) + 0.06 * vnoise(P * 60.0)); aRough = 0.86; aH = s * 0.2;
} else if (rg == 13) {               // yün redingot
  float n = fbm3(P * 380.0);
  col = base * (0.9 + 0.14 * n); aRough = 0.78; aSheen = 0.35; aH = n * 0.3;
} else if (rg == 15) { aRough = 0.6; }
else if (rg == 16) { aRough = 0.25; }
// redingot düğmeleri: ön orta çizgide kubbe biçimli pirinç düğmeler (SDF'te ızgaradan küçük kalırdı)
if ((rg == 13 || rg == 4) && P.z > 0.03 && abs(P.x) < 0.014 && P.y > 0.99 && P.y < 1.39) {
  float fy = (fract((P.y - 1.0) / 0.055 + 0.5) - 0.5) * 0.055;
  float d = length(vec2(P.x, fy));
  float btn = 1.0 - smoothstep(0.0058, 0.0074, d);
  float dome = sqrt(max(0.0, 1.0 - d * d / 0.000049));
  col = mix(col, uPal[4] * (0.65 + 0.5 * dome), btn);
  aMetal = mix(aMetal, 0.92, btn); aRough = mix(aRough, 0.24, btn); aH = mix(aH, dome, btn);
}
diffuseColor.rgb = col;
`;
const FRAG_BUMP = /* glsl */`
{
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float Hh = aH * 0.0012;
  float hx = dFdx(Hh), hy = dFdy(Hh);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;
const FRAG_RIM = /* glsl */`
{
  float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
  totalEmissiveRadiance += aSheen * fres * col * 0.4 + aSSS * (fres * 0.6 + 0.04) * vec3(0.32, 0.07, 0.04) * 0.35;
}
`;

const PAL_KEYS = ['skin', 'dress', 'chemise', 'vest', 'gold', 'sash', 'scarf', 'oya', 'hair', 'lip', 'felt', 'leather', 'pants', 'coat', 'button', 'mouth', 'teeth', 'accent', 'sash2', 'flower'];
function palette(p) {
  const d = {
    skin: 0xe2ad88, dress: 0x8a2030, chemise: 0xf1ebdc, vest: 0x2b1810, gold: 0xd4a645, sash: 0xb8862e, scarf: 0xf2ead7, oya: 0xd8343c,
    hair: 0x2a1a12, lip: 0xb5605a, felt: 0x9a1a1a, leather: 0x4a2e1a, pants: 0x3a3a46, coat: 0x26262e, button: 0xd4a645,
    mouth: 0x3a0e0e, teeth: 0xf4efe6, accent: 0xe9d39a, sash2: 0x6a1a20, flower: 0xc8384a,
  };
  return PAL_KEYS.map((k) => new THREE.Color(p[k] ?? d[k]));
}

function avatarMaterial(pal, instanced = false, cheek = [0.041, 1.536, 0.06]) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
  m.userData.U = { uPal: { value: pal }, uCheek: { value: new THREE.Vector3(...cheek) }, uClipY: { value: -10 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRegion; attribute float aAux; flat varying float vRegion; varying float vAux; varying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion; vAux = aAux; vRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <map_fragment>', FRAG_ALBEDO(instanced))
      .replace('#include <color_fragment>', '')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = aRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = aMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_BUMP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_RIM);
  };
  m.customProgramCacheKey = () => 'avatar-v4' + (instanced ? 'I' : '');
  return m;
}

function eyeMaterial() {
  const t = eyeTexture().clone(); t.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04 });
}

// ---------- Birleştirilmiş skinned geometri ----------
const geoCache = new Map();
function assemble(spec) {
  if (geoCache.has(spec.key)) return geoCache.get(spec.key);
  const { sex } = spec;
  const skel = skeleton(sex);
  const names = skel.bones.map((b) => b[0]);
  const BI = Object.fromEntries(names.map((n, i) => [n, i]));
  const BP = Object.fromEntries(skel.bones.map((b) => [b[0], b[2]]));
  const headP = BP.Head;
  const J = spec.jobs;
  const parts = [
    { g: partSync(J.body), off: [0, 0, 0], kind: 'body' },
    { g: partSync(J.head), off: headP, kind: 'head' },
    { g: partSync(J.handL), off: BP.hand_l, kind: 'hand', bone: 'hand_l', rot: APOSE },
    { g: partSync(J.handR), off: BP.hand_r, kind: 'hand', bone: 'hand_r', rot: -APOSE },
  ];
  if (J.scarf) parts.push({ g: partSync(J.scarf), off: headP, kind: 'scarf' });
  if (J.fez) parts.push({ g: partSync(J.fez), off: headP, kind: 'head' });
  const face = spec.face ? faceParts(sex) : null;

  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.g.positions.length / 3; ni += p.g.indices.length; }
  const nFace = face ? face.positions.length / 3 : 0;
  if (face) { nv += nFace; ni += face.indices.length; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), reg = new Float32Array(nv), aux = new Float32Array(nv);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = new Uint32Array(ni);
  const morph = face ? MORPH.map(() => new Float32Array(nv * 3)) : null;
  let v0 = 0, i0 = 0;
  const chain = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'];
  const chainY = chain.map((n) => BP[n][1]);
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const along = (p, a, b) => {
    const A = BP[a], B = BP[b], abx = B[0] - A[0], aby = B[1] - A[1], abz = B[2] - A[2];
    return ((p[0] - A[0]) * abx + (p[1] - A[1]) * aby + (p[2] - A[2]) * abz) / (abx * abx + aby * aby + abz * abz);
  };
  const bodyWeights = (tag, x, y, z) => {
    const p = [x, y, z], side = x >= 0 ? 'l' : 'r';
    if (tag === 'spine' || tag === 'Head') {
      if (y >= chainY[4]) return [[BI.neck_01, 1]];
      if (y <= chainY[0]) return [[BI.pelvis, 1]];
      let i = 0; while (i < 3 && y > chainY[i + 1]) i++;
      const t = (y - chainY[i]) / (chainY[i + 1] - chainY[i]);
      const out = [[BI[chain[i]], 1]];
      if (t > 0.6) out.push([BI[chain[i + 1]], (t - 0.6) / 0.8]);
      if (t < 0.4 && i > 0) out.push([BI[chain[i - 1]], (0.4 - t) / 0.8]);
      return out;
    }
    if (tag.startsWith('clavicle')) {
      const s2 = tag.slice(-1), w = sm(0.03, 0.13, Math.abs(x));
      const tu = along(p, `upperarm_${s2}`, `lowerarm_${s2}`);
      return [[BI[`clavicle_${s2}`], w], [BI.spine_03, 1 - w], [BI[`upperarm_${s2}`], Math.max(0, tu + 0.15) * 2.5 * w]];
    }
    if (tag.startsWith('upperarm')) {
      const s2 = tag.slice(-1), t = along(p, `upperarm_${s2}`, `lowerarm_${s2}`);
      return [[BI[tag], 1], [BI[`clavicle_${s2}`], Math.max(0, 0.18 - t) * 3], [BI[`lowerarm_${s2}`], Math.max(0, t - 0.82) * 3]];
    }
    if (tag.startsWith('lowerarm')) {
      const s2 = tag.slice(-1), t = along(p, `lowerarm_${s2}`, `hand_${s2}`);
      return [[BI[tag], 1], [BI[`upperarm_${s2}`], Math.max(0, 0.18 - t) * 3], [BI[`hand_${s2}`], Math.max(0, t - 0.9) * 4]];
    }
    if (tag === 'pelvis') {
      const out = [[BI.pelvis, 1]];
      if (y < chainY[0] - 0.08 && Math.abs(x) > 0.02) out.push([BI[`thigh_${side}`], sm(0.02, 0.12, Math.abs(x)) * sm(chainY[0] - 0.08, chainY[0] - 0.3, y) * 0.6]);
      if (y > chainY[0]) out.push([BI.spine_01, (y - chainY[0]) / (chainY[1] - chainY[0]) * 0.5]);
      return out;
    }
    if (tag.startsWith('thigh')) {
      const s2 = tag.slice(-1), t = along(p, `thigh_${s2}`, `calf_${s2}`);
      return [[BI[tag], 1], [BI.pelvis, Math.max(0, 0.2 - t) * 3], [BI[`calf_${s2}`], Math.max(0, t - 0.85) * 3]];
    }
    if (tag.startsWith('calf')) {
      const s2 = tag.slice(-1), t = along(p, `calf_${s2}`, `foot_${s2}`);
      return [[BI[tag], 1], [BI[`thigh_${s2}`], Math.max(0, 0.15 - t) * 3], [BI[`foot_${s2}`], Math.max(0, t - 0.9) * 4]];
    }
    if (tag.startsWith('foot')) return [[BI[tag], 1]];
    return [[BI.spine_02, 1]];
  };
  const setW = (v, list0) => {
    let list = list0;
    list = list.filter((e) => e[1] > 0.001 && e[0] !== undefined);
    list.sort((a, b) => b[1] - a[1]); list.length = Math.min(4, list.length);
    const s = list.reduce((t, x) => t + x[1], 0) || 1;
    for (let k = 0; k < 4; k++) { si[v * 4 + k] = list[k] ? list[k][0] : 0; sw[v * 4 + k] = list[k] ? list[k][1] / s : 0; }
  };
  const segDist = (x, y, z, s) => {
    const abx = s.b[0] - s.a[0], aby = s.b[1] - s.a[1], abz = s.b[2] - s.a[2];
    const apx = x - s.a[0], apy = y - s.a[1], apz = z - s.a[2];
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz)));
    return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
  };
  for (const p of parts) {
    const g = p.g, n = g.positions.length / 3;
    // eller dinlenme kolu yönünde modellenir; A pozundaki bileğe döndürülerek yerleşir
    const rc = Math.cos(p.rot || 0), rs = Math.sin(p.rot || 0);
    for (let k = 0; k < n; k++) {
      const v = v0 + k;
      const gx = g.positions[k * 3], gy = g.positions[k * 3 + 1], nx0 = g.normals[k * 3], ny0 = g.normals[k * 3 + 1];
      const x = gx * rc - gy * rs + p.off[0], y = gx * rs + gy * rc + p.off[1], z = g.positions[k * 3 + 2] + p.off[2];
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      nor[v * 3] = nx0 * rc - ny0 * rs; nor[v * 3 + 1] = nx0 * rs + ny0 * rc; nor[v * 3 + 2] = g.normals[k * 3 + 2];
      reg[v] = g.region[k]; aux[v] = g.aux[k];
      const ly = g.positions[k * 3 + 1], lz = g.positions[k * 3 + 2];
      if (p.kind === 'hand') setW(v, [[BI[p.bone], 1]]);
      else if (p.kind === 'head') { const wn = Math.max(0, Math.min(1, (-ly - 0.01) / 0.09)); setW(v, [[BI.Head, 1 - wn], [BI.neck_01, wn]]); }
      else if (p.kind === 'scarf') {
        const wt = lz < -0.035 ? Math.max(0, Math.min(1, (-ly - 0.03) / 0.13)) : 0;
        const wn = Math.max(0, Math.min(1, (-ly - 0.02) / 0.12)) * (1 - wt) * 0.6;
        setW(v, [[BI.Head, Math.max(0, 1 - wt - wn)], [BI.scarf_tail, wt], [BI.neck_01, wn]]);
      } else {
        // gövde: köşe hangi şeklin parçasıysa o kemiğe bağlanır, eklem yakınında komşu kemikle karışır
        setW(v, bodyWeights(TAGS[g.tag[k]], x, y, z));
      }
    }
    for (let k = 0; k < g.indices.length; k++) idx[i0 + k] = g.indices[k] + v0;
    v0 += n; i0 += g.indices.length;
  }
  if (face) {
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(face.positions), 3));
    fg.setIndex(face.indices); fg.computeVertexNormals();
    const fnorm = fg.attributes.normal.array;
    for (let k = 0; k < nFace; k++) {
      const v = v0 + k;
      const bl = face.blend[k];
      let nx = fnorm[k * 3] * bl + face.sdfNormal[k * 3] * (1 - bl), ny = fnorm[k * 3 + 1] * bl + face.sdfNormal[k * 3 + 1] * (1 - bl), nz = fnorm[k * 3 + 2] * bl + face.sdfNormal[k * 3 + 2] * (1 - bl);
      const nl = Math.hypot(nx, ny, nz) || 1;
      for (let c = 0; c < 3; c++) pos[v * 3 + c] = face.positions[k * 3 + c] + headP[c];
      nor[v * 3] = nx / nl; nor[v * 3 + 1] = ny / nl; nor[v * 3 + 2] = nz / nl;
      reg[v] = face.regions[k]; aux[v] = 0;
      setW(v, [[BI.Head, 1]]);
      for (let mi = 0; mi < MORPH.length; mi++) for (let c = 0; c < 3; c++) morph[mi][v * 3 + c] = face.morphs[mi][k * 3 + c];
    }
    for (let k = 0; k < face.indices.length; k++) idx[i0 + k] = face.indices[k] + v0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aRegion', new THREE.BufferAttribute(reg, 1));
  geo.setAttribute('aAux', new THREE.BufferAttribute(aux, 1));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (face) { geo.morphAttributes.position = morph.map((a) => new THREE.BufferAttribute(a, 3)); geo.morphTargetsRelative = true; }
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);
  const out = { geo, eye: eyeGeometry(sex, spec.lod), headP };
  geoCache.set(spec.key, out);
  return out;
}

// ---------- Prosedürel animasyon klipleri ----------
// Her klip: (t) => { kemik: [[eksen, açı], ...], pelvisY, talk }  (eksenler bağlama pozunda dünya eksenleri)
const S = Math.sin;
const CLIPS_DEF = {
  Idle_Loop: (t) => ({
    spine_02: [['x', S(t * 1.6) * 0.015]], spine_03: [['x', 0.02 + S(t * 1.6 + 0.4) * 0.01]],
    Head: [['x', S(t * 0.7) * 0.035], ['y', S(t * 0.43) * 0.1]], neck_01: [['x', 0.02]],
    upperarm_l: [['z', -0.08 + S(t * 1.6) * 0.012], ['x', 0.04]], upperarm_r: [['z', 0.08 - S(t * 1.6) * 0.012], ['x', 0.04]],
    lowerarm_l: [['x', -0.2]], lowerarm_r: [['x', -0.2]],
  }),
  Jump_Loop: (t) => ({ spine_02: [['x', 0.06]], spine_03: [['x', 0.04]], Head: [['x', -0.06 + S(t * 9) * 0.03]], neck_01: [['x', 0.02]] }),
  Dance_Loop: (t) => ({
    upperarm_l: [['z', 2.35 + S(t * 8) * 0.3]], upperarm_r: [['z', -2.35 - S(t * 8 + 1) * 0.3]],
    lowerarm_l: [['z', 0.45 + S(t * 8) * 0.4]], lowerarm_r: [['z', -0.45 - S(t * 8 + 1) * 0.4]],
    spine_01: [['z', S(t * 4) * 0.07]], spine_03: [['y', S(t * 4) * 0.12]], Head: [['z', S(t * 4 + 0.5) * 0.12], ['x', -0.12]],
  }),
  Hit_Chest: (t) => ({
    spine_02: [['x', -0.22]], spine_03: [['x', -0.18]], Head: [['x', -0.3 + S(t * 14) * 0.05]],
    upperarm_l: [['z', 1.1 + S(t * 16) * 0.3], ['x', -0.3]], upperarm_r: [['z', -1.1 - S(t * 16 + 1) * 0.3], ['x', -0.3]],
    lowerarm_l: [['x', -0.7]], lowerarm_r: [['x', -0.7]],
  }),
  Sitting_Idle_Loop: (t) => ({
    pelvisY: -0.44, thigh_l: [['x', -1.52]], thigh_r: [['x', -1.52]], calf_l: [['x', 1.5]], calf_r: [['x', 1.5]],
    spine_02: [['x', 0.05 + S(t * 1.4) * 0.012]], Head: [['x', S(t * 0.6) * 0.04], ['y', S(t * 0.37) * 0.15]],
    upperarm_l: [['x', -0.42], ['z', -0.12]], upperarm_r: [['x', -0.42], ['z', 0.12]],
    lowerarm_l: [['x', -1.05], ['y', -0.25]], lowerarm_r: [['x', -1.05], ['y', 0.25]],
  }),
  Sitting_Talking_Loop: (t) => ({
    pelvisY: -0.44, talk: true, thigh_l: [['x', -1.52]], thigh_r: [['x', -1.52]], calf_l: [['x', 1.5]], calf_r: [['x', 1.5]],
    spine_02: [['x', 0.04]], spine_03: [['y', S(t * 0.8) * 0.12]], Head: [['x', S(t * 2.2) * 0.06], ['y', S(t * 0.9) * 0.25]],
    upperarm_l: [['x', -0.42], ['z', -0.12]], lowerarm_l: [['x', -1.05], ['y', -0.25]],
    upperarm_r: [['x', -0.6 + S(t * 2.5) * 0.15], ['z', 0.35]], lowerarm_r: [['x', -1.3 + S(t * 3.1) * 0.35], ['y', 0.4]],
  }),
  Idle_Talking_Loop: (t) => ({
    talk: true, spine_03: [['y', S(t * 0.9) * 0.1]], Head: [['x', S(t * 2.1) * 0.05], ['y', S(t * 0.8) * 0.2]],
    upperarm_l: [['z', -0.1], ['x', -0.2 + S(t * 1.7) * 0.15]], lowerarm_l: [['x', -0.9 + S(t * 2.3) * 0.3]],
    upperarm_r: [['z', 0.12], ['x', -0.35 + S(t * 2.0 + 1) * 0.2]], lowerarm_r: [['x', -1.1 + S(t * 2.7) * 0.35]],
  }),
  Yes: (t) => ({ Head: [['x', S(t * 6) * 0.17]], upperarm_l: [['z', -0.08]], upperarm_r: [['z', 0.08]], lowerarm_l: [['x', -0.25]], lowerarm_r: [['x', -0.25]] }),
  Cheer: (t) => ({
    upperarm_l: [['z', 2.5 + S(t * 6) * 0.2], ['x', -0.2]], upperarm_r: [['z', -2.5 - S(t * 6 + 2) * 0.2], ['x', -0.2]],
    lowerarm_l: [['z', 0.3]], lowerarm_r: [['z', -0.3]], Head: [['x', -0.15]], spine_03: [['x', -0.05]],
  }),
  Clap: (t) => {
    const c = S(t * 12) * 0.12;
    return { upperarm_l: [['x', -0.75], ['z', -0.35 - c]], upperarm_r: [['x', -0.75], ['z', 0.35 + c]], lowerarm_l: [['x', -0.9], ['y', -0.6]], lowerarm_r: [['x', -0.9], ['y', 0.6]], Head: [['x', 0.05]] };
  },
  FoldArms: () => ({ upperarm_l: [['x', -0.35], ['z', 0.1]], upperarm_r: [['x', -0.35], ['z', -0.1]], lowerarm_l: [['x', -1.5], ['y', -1.25]], lowerarm_r: [['x', -1.5], ['y', 1.25]], Head: [['y', 0.15]] }),
  HandsHips: () => ({ upperarm_l: [['z', 0.62], ['x', 0.25]], upperarm_r: [['z', -0.62], ['x', 0.25]], lowerarm_l: [['z', -1.65]], lowerarm_r: [['z', 1.65]], spine_03: [['x', -0.05]] }),
  Wave: (t) => ({ upperarm_r: [['z', -2.6], ['x', -0.25]], lowerarm_r: [['z', -0.5 + S(t * 7) * 0.5]], upperarm_l: [['z', -0.08]], lowerarm_l: [['x', -0.2]], Head: [['x', -0.08]] }),
};
export const CLIPS = Object.fromEntries(Object.keys(CLIPS_DEF).map((k) => [k, { name: k }]));

const _qa = new THREE.Quaternion(), _ax = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
function poseQuat(list, out) {
  out.identity();
  if (!list) return out;
  for (const [a, ang] of list) { _qa.setFromAxisAngle(_ax[a], ang); out.premultiply(_qa); }
  return out;
}

// ---------- Canlı karakter ----------
export function createCharacter(o = {}) {
  const spec = specOf(o);
  const A = assemble(spec);
  const look = o.look || {};
  const isM = spec.sex === 'm';
  const pal = palette({
    skin: look.skin ?? o.skin, dress: look.dress ?? o.main, vest: look.vest ?? (isM ? o.main : undefined), gold: look.trim ?? o.trim,
    scarf: look.scarf ?? o.scarf, oya: look.scarfTrim ?? o.oya, hair: look.hair ?? o.hairColor, coat: o.main,
    accent: o.accent ?? (look.dress !== undefined ? new THREE.Color(look.dress).lerp(new THREE.Color(0xfff4dc), 0.45).getHex() : undefined),
    sash: o.sash ?? (isM ? 0x9a2a1e : look.trim), sash2: o.sash2 ?? (look.vest ?? 0x5a1a20), flower: look.scarfTrim ?? o.flower,
    lip: isM ? 0x9a5a50 : 0xaa5652, pants: o.pants, felt: o.felt,
  });
  const k = isM ? 1.05 : 1;
  const mat = avatarMaterial(pal, false, [0.041 * k, A.headP[1] + 0.061 * k, 0.06 * k]);
  const sk = buildSkeleton(spec.sex);
  const root = new THREE.Group();
  root.add(sk.root);
  root.updateMatrixWorld(true);
  const mesh = new THREE.SkinnedMesh(A.geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.bind(new THREE.Skeleton(sk.list), new THREE.Matrix4());
  const eyeMat = eyeMaterial();
  const eyes = new THREE.Mesh(A.eye, eyeMat);
  sk.map.Head.add(eyes);
  const bones = sk.map;
  // A pozunda bağlanan kollar: klip açıları eski (sarkık kol) çerçevesinde tanımlı.
  // Üst kol q·C⁻¹, alt kol ve el C·q·C⁻¹ ile çevrilir; dinlenme pozu kolu aşağı indirir.
  const PRE = {}, POST = {};
  for (const [sd, sg] of [['l', 1], ['r', -1]]) {
    const C = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sg * APOSE), Ci = C.clone().invert();
    POST[`upperarm_${sd}`] = Ci;
    PRE[`lowerarm_${sd}`] = C; POST[`lowerarm_${sd}`] = Ci;
    PRE[`hand_${sd}`] = C; POST[`hand_${sd}`] = Ci;
  }
  const rest = {}, restPos = {};
  for (const b of sk.list) {
    rest[b.name] = b.quaternion.clone();
    if (POST[b.name] && !PRE[b.name]) rest[b.name].multiply(POST[b.name]);
    b.quaternion.copy(rest[b.name]);
    restPos[b.name] = b.position.clone();
  }
  const MI = Object.fromEntries(MORPH.map((m, i) => [m, i]));
  const infl = mesh.morphTargetInfluences || [];
  const faceTarget = new Float32Array(MORPH.length);
  let cur = { name: 'Idle_Loop', t: Math.random() * 10, speed: 1 }, prev = null, fade = 1, fadeT = 0.2;
  let blinkT = 1 + Math.random() * 3, blink = 0, talkPhase = 0, gaze = [0, 0], gazeT = 0;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  let tailAng = 0, tailVel = 0, prevHeadY = null;
  const hp = new THREE.Vector3();

  function apply(dt) {
    cur.t += dt * cur.speed; if (prev) prev.t += dt * prev.speed;
    fade = Math.min(1, fade + dt / Math.max(0.001, fadeT));
    const pc = CLIPS_DEF[cur.name](cur.t), pp = prev && fade < 1 ? CLIPS_DEF[prev.name](prev.t) : null;
    for (const b of sk.list) {
      if (b.name === 'root' || b.name === 'scarf_tail') continue;
      poseQuat(pc[b.name], qa);
      if (pp) { poseQuat(pp[b.name], qb); qa.slerpQuaternions(qb, qa, fade); }
      if (POST[b.name]) { if (PRE[b.name]) qa.premultiply(PRE[b.name]); qa.multiply(POST[b.name]); b.quaternion.copy(qa); } else b.quaternion.copy(rest[b.name]).multiply(qa);
    }
    const py = pp ? (pc.pelvisY ?? 0) * fade + (pp.pelvisY ?? 0) * (1 - fade) : (pc.pelvisY ?? 0);
    bones.pelvis.position.copy(restPos.pelvis); bones.pelvis.position.y += py;
    return pc.talk || (pp && pp.talk && fade < 0.5);
  }

  const ch = {
    root, bones, mesh, mats: [mat, eyeMat], legMeshes: [], rest, restPos,
    // çuvalın içindeki bacak ve etek kısmını gizle (bağlama pozunda bu yüksekliğin altı)
    showLegs(show, clipY = 0.62) { mat.userData.U.uClipY.value = show ? -10 : clipY; },
    play(name, { fade: f = 0.2, speed = 1, restart = false } = {}) {
      if (!CLIPS_DEF[name]) name = 'Idle_Loop';
      if (cur.name === name && !restart) { cur.speed = speed; return cur; }
      prev = cur; cur = { name, t: restart ? 0 : Math.random() * 3, speed }; fade = 0; fadeT = f;
      return cur;
    },
    get current() { return cur; },
    expression: 'neutral',
    face(name) { ch.expression = name; },
    poseAt(name, t) { cur = { name, t, speed: 1 }; prev = null; fade = 1; apply(0); root.updateMatrixWorld(true); },
    update(dt) {
      const talking = apply(dt);
      faceTarget.fill(0);
      const e = ch.expression;
      if (e === 'smile') faceTarget[MI.smile] = 0.75;
      else if (e === 'joy') { faceTarget[MI.smile] = 0.9; faceTarget[MI.open] = 0.55; faceTarget[MI.browUp] = 0.6; }
      else if (e === 'strain') { faceTarget[MI.strain] = 1; faceTarget[MI.browAngry] = 0.9; }
      else if (e === 'shock') { faceTarget[MI.oh] = 1; faceTarget[MI.browUp] = 1; }
      if (talking) { talkPhase += dt * 11; faceTarget[MI.open] = Math.max(faceTarget[MI.open], 0.15 + Math.abs(S(talkPhase) * S(talkPhase * 0.37)) * 0.45); }
      // göz kırpma
      blinkT -= dt;
      if (blinkT <= 0) { blink = 1; blinkT = 2 + Math.random() * 3.5; }
      blink = Math.max(0, blink - dt * 7);
      faceTarget[MI.blink] = Math.max(e === 'strain' ? 0.25 : 0, blink > 0 ? Math.sin(blink * Math.PI) : 0);
      for (let i = 0; i < infl.length; i++) infl[i] += (faceTarget[i] - infl[i]) * Math.min(1, dt * (i === MI.blink ? 40 : 10));
      // bakış: rastgele küçük sıçramalar (iris dokusu kaydırılır)
      gazeT -= dt;
      if (gazeT <= 0) { gaze = [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.2]; gazeT = 0.8 + Math.random() * 2.2; }
      const mp = eyeMat.map;
      mp.offset.x += (-gaze[0] / (Math.PI * 2) - mp.offset.x) * Math.min(1, dt * 20);
      mp.offset.y += (gaze[1] / Math.PI - mp.offset.y) * Math.min(1, dt * 20);
      // başörtüsü ucu: başın dikey hızına tepki veren yay
      bones.Head.getWorldPosition(hp);
      if (prevHeadY !== null && dt > 0) {
        const vy = (hp.y - prevHeadY) / dt;
        tailVel += (-vy * 0.35 - tailAng) * 60 * dt - tailVel * 7 * dt;
        tailAng = Math.max(-0.6, Math.min(0.9, tailAng + tailVel * dt));
      }
      prevHeadY = hp.y;
      bones.scarf_tail.quaternion.setFromAxisAngle(_ax.x, -tailAng + S(cur.t * 1.7) * 0.03);
    },
  };
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
export function bakePose(o) {
  const ch = createCharacter({ ...o, lod: true });
  ch.root.rotation.y = Math.PI;
  ch.poseAt(o.clip && CLIPS_DEF[o.clip] ? o.clip : 'Idle_Loop', o.time ?? 0);
  ch.root.updateMatrixWorld(true);
  const m = ch.mesh, g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal;
  const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();
  m.skeleton.update();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    w.copy(v).addScaledVector(n, 0.01);
    m.applyBoneTransform(i, v); m.applyBoneTransform(i, w);
    v.applyMatrix4(m.matrixWorld); w.applyMatrix4(m.matrixWorld);
    n.subVectors(w, v).normalize();
    P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; N[i * 3] = n.x; N[i * 3 + 1] = n.y; N[i * 3 + 2] = n.z;
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(P, 3));
  body.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  body.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  body.setAttribute('aRegion', g.attributes.aRegion);
  body.setAttribute('aAux', g.attributes.aAux);
  body.setIndex(g.index);
  const eyes = ch.bones.Head.children.find((c) => c.isMesh);
  const eg = eyes.geometry.clone().applyMatrix4(eyes.matrixWorld);
  const ne = eg.attributes.position.count;
  eg.setAttribute('aRegion', new THREE.BufferAttribute(new Float32Array(ne).fill(16), 1));
  eg.setAttribute('aAux', new THREE.BufferAttribute(new Float32Array(ne), 1));
  const merged = mergeGeometries([body, eg], true);
  const U = ch.mesh.material.userData.U;
  return { geometry: merged, materials: [avatarMaterial(U.uPal.value, true, U.uCheek.value.toArray()), ch.mats[1]] };
}
