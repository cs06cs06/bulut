// Bölüm oynatıcı: zaman çizelgesini okur, her t anı için sahneyi kurar,
// kamerayı yönetir ve altyazı/jenerik katmanını çizer.
// ?mode=render → kare kare dışa aktarma (tools/render.mjs kullanır)
import * as THREE from 'three';
import { buildSets, applyTimeOfDay, setStyle } from './sets.js';
import { layout } from './layout.js';
import { evalPos, evalStep, evalTween, lastKey } from './timeline.js';
import { createPost } from './post.js';

// W×H: katman (altyazı/jenerik) için mantıksal çözünürlük; çıktı RW×RH
const W = 1280, H = 720;
const params = new URLSearchParams(location.search);
const MODE = params.get('mode') || 'preview';
const EP = params.get('ep') || 'yedek-anahtar';

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const angN = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return Math.abs(h); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const tl = await (await fetch(`build/${EP}/timeline.json`)).json();
const META = tl.meta || { title: 'Yedek Anahtar' };
const FPS = tl.fps;
// motor 1: çizgi film (toon) görünümü, 720p · motor 2: PBR + ışık + son işleme, 1080p
const ENGINE = Number(params.get('engine') || META.engine || 1);
// motor 2: 3D 1600×900'de çizilir, katman (yazılar) 1920×1080'de net çizilir
const RW = ENGINE >= 2 ? Number(params.get('rw') || 1280) : W, RH = ENGINE >= 2 ? Math.round(RW * 9 / 16) : H;
const OW = ENGINE >= 2 ? 1920 : W, OH = ENGINE >= 2 ? 1080 : H;
if (ENGINE >= 2) setStyle('pbr');
const SANS = ENGINE >= 2 ? '"Inter", "DejaVu Sans", sans-serif' : '"DejaVu Sans", sans-serif';
const SERIF = ENGINE >= 2 ? '"Fraunces", "DejaVu Serif", serif' : '"DejaVu Serif", serif';
const DISPLAY = ENGINE >= 2 ? '"Archivo Black", "DejaVu Sans", sans-serif' : '"DejaVu Sans", sans-serif';
if (ENGINE >= 2) await Promise.all(['600 30px Inter', '800 30px Inter', '30px "Archivo Black"', 'italic 500 30px Fraunces'].map((f) => document.fonts.load(f, 'GİBİ şğüöçı')));
const { Character, LOOKS } = ENGINE >= 2 ? await import('./characters2.js') : await import('./characters.js');

// --- three.js ----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: ENGINE < 2, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = ENGINE >= 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (ENGINE >= 2) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color('#151515');
const camera = new THREE.PerspectiveCamera(45, W / H, 0.05, 70);

const hemi = new THREE.HemisphereLight('#fff6e8', '#6b5a48', 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#dfe8ff', 0.45);
scene.add(fill, fill.target);
const lights = { hemi, sun, engine: ENGINE };
const post = ENGINE >= 2 ? createPost(renderer, scene, camera, RW, RH) : null;
window.__post = post;
lights.scene = scene; lights.post = post;

const sets = buildSets(scene);
const chars = {};
for (const id of Object.keys(tl.chars)) {
  chars[id] = new Character(id);
  scene.add(chars[id].root);
}

// --- sahne/vuruş arama -------------------------------------------------------
const sceneStarts = tl.scenes.map((s) => ({ t: s.start }));
const beatStarts = tl.beats.map((b) => ({ t: b.start }));
const sceneAt = (t) => tl.scenes[Math.max(0, lastKey(sceneStarts, t))];
const beatIdxAt = (t) => lastKey(beatStarts, t);

// --- karakter durumu -----------------------------------------------------------
function headHeight(id, sit, sitH) {
  const S = LOOKS[id].height / 1.8;
  const stand = 1.76 * S;
  const seat = (sitH + 0.07 + 0.9) * S;
  return lerp(stand, seat, smooth(sit));
}

function baseState(id, t) {
  const C = tl.chars[id];
  const visible = evalStep(C.vis, t, false);
  const p = evalPos(C.pos, t);
  const sitI = lastKey(C.sit, t);
  const sit = evalTween(C.sit, t);
  const sitH = sitI >= 0 ? C.sit[sitI].h : 0.46;
  const yaw = evalTween(C.yaw, t, true);
  return { visible, ...p, yaw, sit, sitH, head: V(p.x, p.y + headHeight(id, sit, sitH), p.z) };
}

function lookTargetAt(id, t) {
  const C = tl.chars[id];
  const v = evalStep(C.look, t, null);
  if (v == null) return null;
  if (typeof v === 'string') {
    if (!evalStep(tl.chars[v].vis, t, false)) return null;
    return baseState(v, t).head;
  }
  return V(v[0], v[1], v[2]);
}

function charState(id, t) {
  const C = tl.chars[id];
  const b = baseState(id, t);
  if (!b.visible) return { visible: false };
  const st = { t, ...b };
  st.hold = evalStep(C.hold, t, null);
  const pi = lastKey(C.pose, t);
  if (pi >= 0) {
    const k = C.pose[pi];
    st.pose = k.v; st.prevPose = k.prev; st.poseW = smooth((t - k.t) / 0.35);
  } else { st.pose = null; st.prevPose = null; st.poseW = 1; }
  st.outfit = evalStep(C.outfit, t, 'normal');
  st.emo = evalStep(C.emo, t, 'neutral');
  st.sleep = evalStep(C.sleep, t, false);
  // jestler
  st.gestures = [];
  for (const g of C.gest) {
    if (g.t > t) break;
    const local = t - g.t;
    if (local > g.dur) continue;
    const w = smooth(local / 0.25) * smooth((g.dur - local) / 0.3);
    st.gestures.push({ g: g.g, local, w });
    if (g.g === 'jump') st.jumpT = local / 0.6;
  }
  // dudak senkronu
  st.mouth = 0; st.talking = false;
  const ti = lastKey(C.talk, t);
  if (ti >= 0 && t < C.talk[ti].end) {
    const env = tl.env[C.talk[ti].id] || [];
    const f = (t - C.talk[ti].t) * FPS;
    const i0 = Math.floor(f);
    const a = env[i0] || 0, c = env[i0 + 1] || 0;
    st.mouth = lerp(a, c, f - i0) / 100;
    st.mouthD = Math.max(0, ((env[i0 + 1] || 0) - (env[i0 - 1] || 0)) / 100);
    if (tl.rnd) {
      const r = tl.rnd[C.talk[ti].id] || [], w = tl.wid[C.talk[ti].id] || [];
      st.rnd = lerp(r[i0] || 0, r[i0 + 1] || 0, f - i0) / 100;
      st.wid = lerp(w[i0] || 0, w[i0 + 1] || 0, f - i0) / 100;
    }
    st.talking = true;
  }
  if (st.sleep) st.mouth = 0.15;
  // bakış (son ~0,3 sn ortalaması → yumuşak dönüş)
  let sy = 0, sp = 0, n = 0;
  for (let k = 0; k < 5; k++) {
    const tt = t - k * 0.075;
    const tgt = lookTargetAt(id, tt);
    const bb = k === 0 ? b : baseState(id, tt);
    let y = 0, p = 0;
    if (tgt) {
      const dx = tgt.x - bb.head.x, dz = tgt.z - bb.head.z;
      y = angN(Math.atan2(dx, dz) - bb.yaw);
      p = Math.atan2(bb.head.y - tgt.y, Math.hypot(dx, dz));
      y = clamp(y, -1.15, 1.15);
    }
    sy += y; sp += p; n++;
  }
  st.lookYaw = sy / n;
  st.lookPitch = sp / n;
  st.eyeX = clamp(st.lookYaw * 1.5, -1, 1) * 0;
  // göz kırpma
  const hh = hash(id);
  const period = 3.1 + (hh % 10) * 0.17;
  st.blink = ((t + (hh % 97) * 0.13) % period) < 0.12;
  return st;
}

// --- kamera -------------------------------------------------------------------
const WIDE = {
  A: { pos: [0.2, 1.8, 5.8], look: [-0.4, 1.0, -1.0], fov: 50 },
  B: { pos: [0.0, 1.8, 5.8], look: [-0.5, 1.0, -0.9], fov: 50 },
  C: { pos: [0.0, 1.65, 3.9], look: [-0.2, 1.2, -1.6], fov: 52 },
  D: { pos: [0.2, 1.85, 5.6], look: [-0.4, 1.0, -1.2], fov: 50 },
  E: { pos: [-0.4, 1.8, 10.5], look: [-0.8, 1.9, 0.0], fov: 46 },
  F: { pos: [-0.6, 1.8, 5.4], look: [0.3, 1.1, -1.0], fov: 50 },
  G: { pos: [0.4, 1.75, 4.4], look: [0.0, 0.95, -1.0], fov: 50 },
};
const toWorld = (setId, p) => { const o = layout[setId].origin; return V(o[0] + p[0], o[1] + p[1], o[2] + p[2]); };

// Her vuruş için çekim türünü önceden belirle (deterministik)
const shots = [];
{
  let firstSayInScene = {};
  tl.beats.forEach((b, i) => {
    const sc = tl.scenes[b.scene];
    let spec;
    if (!sc.set || ['card', 'title', 'credits', 'insert'].includes(b.type)) spec = { kind: 'none' };
    else if (b.cam) spec = parseCam(b.cam, b);
    else if (b.type === 'act') spec = { kind: 'wide' };
    else if (b.continueShot && shots[i - 1]) spec = { ...shots[i - 1], cont: true };
    else {
      const who = b.who[0];
      const to = b.to;
      const st0 = baseState(who, b.start + 0.4);
      const sameSet = to && tl.chars[to] && Math.abs(baseState(to, b.start).x - st0.x) < 15;
      if (b.os) spec = to ? { kind: 'cu', who: to } : { kind: 'wide' };
      else if (b.who.length > 1) spec = { kind: 'two', a: b.who[0], b: b.who[1] };
      else if (!to || !sameSet) spec = { kind: 'cu', who };
      else if (!firstSayInScene[b.scene]) spec = { kind: 'two', a: who, b: to };
      else {
        const h = hash(b.lineId) % 100;
        const sp = baseState(to, b.start + 0.4);
        const facing = V(Math.sin(st0.yaw), 0, Math.cos(st0.yaw));
        const toDir = V(sp.x - st0.x, 0, sp.z - st0.z).normalize();
        const faceOk = facing.dot(toDir) > 0.35 && !st0.sit && !sp.sit && Math.abs(st0.head.y - sp.head.y) < 0.25;
        const dur = b.speechDur;
        if (dur > 4.6 && h < 40) spec = { kind: 'two', a: who, b: to };
        else if (h < 60) spec = { kind: 'cu', who, to };
        else if (h < 84 && faceOk) spec = { kind: 'ots', who, to };
        else if (h < 92) spec = { kind: 'two', a: who, b: to };
        else spec = { kind: 'cu', who, to };
      }
      firstSayInScene[b.scene] = true;
    }
    spec.start = spec.cont ? shots[i - 1].start : b.start;
    spec.set = sc.set;
    spec.beat = i;
    shots.push(spec);
  });
}

function parseCam(cam, b) {
  if (typeof cam === 'object') return { kind: 'fixed', pos: cam.pos, look: cam.look };
  const [kind, who, who2] = cam.split(':');
  if (kind === 'two') {
    if (who && who2) return { kind: 'two', a: who, b: who2 };
    if (b.who) return { kind: 'two', a: b.who[0], b: b.to || b.who[1] || b.who[0] };
    return { kind: 'two', a: 'yil', b: 'ilk' };
  }
  if (kind === 'cu' || kind === 'crash') return { kind, who: who || (b.who && b.who[0]), to: b.to };
  return { kind };
}

function frontDirFor(setId) {
  const w = WIDE[setId];
  const d = V(w.pos[0] - w.look[0], 0, w.pos[2] - w.look[2]).normalize();
  return d;
}

// Kamera ile hedef arasında başka bir karakter var mı?
function occluded(pos, target, exclude, t) {
  for (const id of Object.keys(chars)) {
    if (exclude.includes(id)) continue;
    const b = baseState(id, t);
    if (!b.visible) continue;
    const r = 0.26 * LOOKS[id].build * (LOOKS[id].height / 1.8) + 0.08;
    for (let k = 1; k < 24; k++) {
      const f = k / 24;
      const x = lerp(pos.x, target.x, f), y = lerp(pos.y, target.y, f), z = lerp(pos.z, target.z, f);
      if (y > b.head.y + 0.28 || y < b.y) continue;
      if (Math.hypot(x - b.x, z - b.z) < r) return true;
    }
  }
  return false;
}
const rotY = (v, a) => V(v.x * Math.cos(a) + v.z * Math.sin(a), 0, -v.x * Math.sin(a) + v.z * Math.cos(a));
const TRY = [0, 0.4, -0.4, 0.8, -0.8, 1.15, -1.15];

const camCache = new Map();
function cuDir(spec, setId, dist) {
  const key = spec.beat;
  if (camCache.has(key)) return camCache.get(key);
  const t0 = spec.start + 0.45;
  const s = baseState(spec.who, t0);
  const facing = V(Math.sin(s.yaw), 0, Math.cos(s.yaw));
  let d = facing.clone();
  if (spec.to && spec.kind === 'cu' && evalStep(tl.chars[spec.to].vis, t0, false)) {
    const o = baseState(spec.to, t0);
    const toDir = V(o.x - s.x, 0, o.z - s.z);
    if (toDir.length() < 8) d.add(toDir.normalize().multiplyScalar(0.55));
  }
  const front = frontDirFor(setId);
  if (d.dot(front) < 0.2) d.add(front.clone().multiplyScalar(0.9));
  d.normalize();
  let best = d;
  for (const a of TRY) {
    const c = rotY(d, a);
    if (c.dot(front) < -0.05) continue;
    const pos = s.head.clone().add(c.clone().multiplyScalar(dist));
    if (!occluded(pos, s.head, [spec.who], t0)) { best = c; break; }
  }
  camCache.set(key, best);
  return best;
}

function computeCamera(t, sc) {
  const bi = beatIdxAt(t);
  const spec = shots[bi] || { kind: 'wide' };
  const setId = sc.set;
  const prog = clamp((t - spec.start) / 8, 0, 1);
  let pos, look, fov = 45;
  const visibleIn = () => Object.keys(chars).filter((id) => {
    const b = baseState(id, t);
    return b.visible && Math.abs(b.x - layout[setId].origin[0]) < 15;
  });
  switch (spec.kind) {
    case 'cu': case 'crash': {
      const s = baseState(spec.who, t);
      const dist = spec.kind === 'crash' ? 1.5 : 1.9;
      const d = cuDir(spec, setId, dist);
      pos = s.head.clone().add(d.clone().multiplyScalar(dist)).add(V(0, -0.02, 0));
      look = s.head.clone().add(V(0, -0.1, 0));
      fov = 36;
      if (spec.kind === 'crash') fov = lerp(40, 20, smooth((t - spec.start) / 0.22));
      break;
    }
    case 'ots': {
      const sp = baseState(spec.who, t), ls = baseState(spec.to, t);
      const v = V(ls.head.x - sp.head.x, 0, ls.head.z - sp.head.z).normalize();
      let side = V(-v.z, 0, v.x);
      if (side.dot(frontDirFor(setId)) < 0) side.negate();
      pos = ls.head.clone().add(v.multiplyScalar(1.0)).add(side.multiplyScalar(0.78)).add(V(0, 0.2, 0));
      look = sp.head.clone().add(V(0, -0.08, 0));
      fov = 40;
      break;
    }
    case 'two': {
      const a = baseState(spec.a, t), b = baseState(spec.b || spec.a, t);
      const c = a.head.clone().add(b.head).multiplyScalar(0.5);
      const v = V(b.head.x - a.head.x, 0, b.head.z - a.head.z);
      const sep = v.length();
      let n = sep > 0.01 ? V(-v.z, 0, v.x).normalize() : frontDirFor(setId);
      if (n.dot(frontDirFor(setId)) < 0) n.negate();
      n.add(frontDirFor(setId).multiplyScalar(0.35)).normalize();
      const dist = Math.max(2.1, sep * 1.25 + 1.1);
      const ck = 'two' + spec.beat;
      if (!camCache.has(ck)) {
        let best = n;
        for (const a2 of TRY.slice(0, 5)) {
          const c2 = rotY(n, a2);
          const p2 = c.clone().add(c2.clone().multiplyScalar(dist));
          const ex = [spec.a, spec.b];
          if (!occluded(p2, a.head, ex, t) && !occluded(p2, b.head, ex, t)) { best = c2; break; }
        }
        camCache.set(ck, best);
      }
      n = camCache.get(ck).clone();
      pos = c.clone().add(n.multiplyScalar(dist)).add(V(0, 0.12, 0));
      look = c.clone().add(V(0, -0.22, 0));
      fov = 42;
      break;
    }
    case 'fixed':
      pos = toWorld(setId, spec.pos); look = toWorld(setId, spec.look); fov = 45;
      break;
    default: { // geniş
      const w = WIDE[setId] || WIDE.A;
      pos = toWorld(setId, w.pos); look = toWorld(setId, w.look); fov = w.fov;
      const ids = visibleIn();
      if (ids.length && setId !== 'E') {
        let cx = 0, cz = 0;
        for (const id of ids) { const b = baseState(id, t); cx += b.x; cz += b.z; }
        cx /= ids.length; cz /= ids.length;
        const dx = clamp(cx - look.x, -3, 3);
        look.x += dx * 0.65; pos.x += dx * 0.45;
      }
      if (setId === 'E') {
        const ids2 = ids.filter((id) => baseState(id, t).visible);
        if (ids2.length) {
          let cx = 0; for (const id of ids2) cx += baseState(id, t).x; cx /= ids2.length;
          const dx = clamp(cx - look.x, -3, 3); look.x += dx * 0.6; pos.x += dx * 0.5;
        }
      }
    }
  }
  // yavaş yaklaşma + hafif el kamerası
  const push = spec.kind === 'crash' ? 0 : 0.06 * prog;
  pos.lerp(look, push);
  pos.x += Math.sin(t * 0.7) * 0.006; pos.y += Math.sin(t * 0.9 + 1) * 0.005;
  return { pos, look, fov, kind: spec.kind };
}

// --- katman (altyazı, kartlar, jenerik) -----------------------------------
const out = document.createElement('canvas');
out.width = OW; out.height = OH;
const g2 = out.getContext('2d');
g2.scale(OW / W, OH / H);
g2.imageSmoothingQuality = 'high';

function wrap(text, maxW, font) {
  g2.font = font;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (g2.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawSubtitle(t) {
  // aktif replik
  let ln = null;
  for (let i = lastKey(lineStarts, t); i >= 0 && i >= lastKey(lineStarts, t) - 1; i--) {
    const l = tl.lines[i];
    if (t >= l.start && t <= l.start + l.dur + 0.25) { ln = l; break; }
  }
  if (!ln) return;
  const font = `${ln.os ? 'italic ' : ''}600 ${ENGINE >= 2 ? 34 : 33}px ${SANS}`;
  const lines = wrap(ln.text, 1020, font);
  g2.font = font;
  g2.textAlign = 'center';
  g2.textBaseline = 'alphabetic';
  g2.lineJoin = 'round';
  const base = H - 46 - (lines.length - 1) * 42;
  lines.forEach((s, i) => {
    const y = base + i * 42;
    if (ENGINE >= 2) {
      g2.save(); g2.shadowColor = 'rgba(0,0,0,0.85)'; g2.shadowBlur = 10; g2.shadowOffsetY = 2;
      g2.lineWidth = 4.5; g2.strokeStyle = 'rgba(0,0,0,0.8)'; g2.strokeText(s, W / 2, y); g2.restore();
    } else {
      g2.lineWidth = 7;
      g2.strokeStyle = 'rgba(0,0,0,0.92)';
      g2.strokeText(s, W / 2, y);
    }
    g2.fillStyle = ln.who.length > 1 ? '#ffe58a' : '#ffffff';
    g2.fillText(s, W / 2, y);
  });
}
const lineStarts = tl.lines.map((l) => ({ t: l.start }));

function drawCard(text, local, dur) {
  const a = smooth(local / 0.35) * smooth((dur - local) / 0.35);
  g2.fillStyle = '#0b0b0b';
  g2.fillRect(0, 0, W, H);
  g2.globalAlpha = a;
  g2.fillStyle = '#f3efe2';
  g2.font = `italic 44px ${SERIF}`;
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillText(text, W / 2, H / 2);
  g2.globalAlpha = 1;
}

function drawTitle(local, dur) {
  // jenerik: harfler tek tek düşer, alt başlık kayarak gelir
  const bg = g2.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#f2b705'); bg.addColorStop(1, '#f28705');
  g2.fillStyle = bg; g2.fillRect(0, 0, W, H);
  // çapraz şeritler
  g2.save();
  g2.globalAlpha = 0.12;
  g2.fillStyle = '#000';
  for (let i = -10; i < 30; i++) {
    const x = i * 80 + (local * 60) % 80;
    g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x + 40, 0); g2.lineTo(x - 360, H); g2.lineTo(x - 400, H); g2.fill();
  }
  g2.restore();
  const letters = ['G', 'İ', 'B', 'İ'];
  g2.font = ENGINE >= 2 ? `200px ${DISPLAY}` : `900 210px ${DISPLAY}`;
  g2.textAlign = 'center'; g2.textBaseline = 'alphabetic';
  const total = letters.reduce((s, c) => s + g2.measureText(c).width + 18, -18);
  let x = W / 2 - total / 2;
  letters.forEach((c, i) => {
    const w = g2.measureText(c).width;
    const p = clamp((local - 0.25 - i * 0.22) / 0.45, 0, 1);
    const e = p < 1 ? 1 - Math.pow(1 - p, 3) : 1;
    const bounce = p >= 1 ? 0 : Math.sin(p * Math.PI) * 18;
    const y = lerp(-80, 380, e) - bounce;
    g2.save();
    g2.translate(x + w / 2, y);
    g2.rotate((1 - e) * (i % 2 ? 0.5 : -0.5));
    g2.fillStyle = '#1a1a1a';
    g2.fillText(c, 8, 8);
    g2.fillStyle = '#fffaf0';
    g2.fillText(c, 0, 0);
    g2.restore();
    x += w + 18;
  });
  const sp = smooth((local - 1.6) / 0.6);
  g2.globalAlpha = sp;
  g2.fillStyle = '#1a1a1a';
  g2.fillRect(W / 2 - 230 + (1 - sp) * 80, 430, 460, 70);
  g2.fillStyle = '#f2b705';
  g2.font = `bold 42px ${SANS}`;
  g2.textBaseline = 'middle';
  g2.fillText(META.title, W / 2 + (1 - sp) * 80, 467);
  g2.fillStyle = '#1a1a1a';
  g2.font = `italic 24px ${SERIF}`;
  g2.globalAlpha = smooth((local - 2.4) / 0.6);
  g2.fillText(`— ${(META.tag || 'hayran bölümü').toLocaleLowerCase('tr')} —`, W / 2, 540);
  g2.globalAlpha = 1;
  // çıkış
  const fo = smooth((local - (dur - 0.45)) / 0.45);
  if (fo > 0) { g2.fillStyle = `rgba(0,0,0,${fo})`; g2.fillRect(0, 0, W, H); }
}

const CREDITS = [
  ['GİBİ', 'big'], [`"${META.title}"`, 'mid'], [(META.tag || 'hayran bölümü').toLocaleLowerCase('tr'), 'small'], ['', 'gap'],
  ['OYNAYANLAR', 'head'],
  ...(META.credits || [['Yılmaz', 'kendisi gibi'], ['İlkkan', 'kendisi gibi'], ['Necmi Bey', 'sekiz numara'],
    ['Kapıcı Remzi', 'Huzur Apartmanı'], ['Çilingir Hüsnü', '7/24']]),
  ['', 'gap'],
  ['SENARYO', 'head'], ['Claude', 'small'], ['', 'gap'],
  ['GÖRÜNTÜ', 'head'], ['three.js ile kare kare çizildi', 'small'], ['', 'gap'],
  ['SESLER', 'head'], ['piper (tr_TR-dfki) sentetik seslendirme', 'small'], ['', 'gap'],
  ['Bu çalışma resmi bir Gibi bölümü değildir;', 'small'], ['diziye duyulan sevgiyle yapılmış bir hayran işidir.', 'small'],
  ['', 'gap'],
  [(META.outro || ['Kapıyı kapatmayı unutmayın.'])[0], 'mid'],
  [(META.outro || [null, 'Ya da unutun. Acil durum o zaman.'])[1], 'small'],
];
function drawCredits(local, dur) {
  g2.fillStyle = '#101010'; g2.fillRect(0, 0, W, H);
  g2.textAlign = 'center'; g2.textBaseline = 'middle';
  let y = H + 40 - local * ((H + 1150) / dur);
  for (const [a, b] of CREDITS) {
    if (b === 'gap') { y += 36; continue; }
    if (b === 'big') { g2.font = `900 96px ${SANS}`; g2.fillStyle = '#f2b705'; g2.fillText(a, W / 2, y); y += 100; continue; }
    if (b === 'mid') { g2.font = `bold 40px ${SANS}`; g2.fillStyle = '#f3efe2'; g2.fillText(a, W / 2, y); y += 54; continue; }
    if (b === 'small') { g2.font = `28px ${SANS}`; g2.fillStyle = '#cfcabb'; g2.fillText(a, W / 2, y); y += 40; continue; }
    if (b === 'head') { g2.font = `bold 24px ${SANS}`; g2.fillStyle = '#f2b705'; g2.fillText(a, W / 2, y); y += 42; continue; }
    g2.font = `bold 30px ${SANS}`; g2.fillStyle = '#f3efe2';
    g2.textAlign = 'right'; g2.fillText(a, W / 2 - 20, y);
    g2.font = `italic 28px ${SERIF}`; g2.fillStyle = '#a9a496';
    g2.textAlign = 'left'; g2.fillText(b, W / 2 + 20, y);
    g2.textAlign = 'center';
    y += 44;
  }
  const fo = smooth((local - (dur - 1.0)) / 1.0);
  if (fo > 0) { g2.fillStyle = `rgba(0,0,0,${fo})`; g2.fillRect(0, 0, W, H); }
}

// --- ara görüntüler: telefon ekranı ve veresiye defteri -----------------------
function roundRect(x, y, w, h, r) {
  g2.beginPath(); g2.moveTo(x + r, y); g2.arcTo(x + w, y, x + w, y + h, r); g2.arcTo(x + w, y + h, x, y + h, r);
  g2.arcTo(x, y + h, x, y, r); g2.arcTo(x, y, x + w, y, r); g2.closePath();
}
function wifiIcon(x, y, bars, col) {
  for (let i = 0; i < 4; i++) {
    g2.fillStyle = i < bars ? col : 'rgba(0,0,0,0.15)';
    g2.fillRect(x + i * 9, y - 6 - i * 6, 6, 8 + i * 6);
  }
}
function drawInsert(b, local) {
  const ins = b.insert;
  const a = smooth(local / 0.25) * smooth((b.dur - local) / 0.25);
  if (ins.kind === 'notice') {
    // koridor duvarında raptiyeli ilan
    const wg = g2.createLinearGradient(0, 0, 0, H);
    wg.addColorStop(0, '#dfe6d2'); wg.addColorStop(0.62, '#dfe6d2'); wg.addColorStop(0.62, '#7f9a76'); wg.addColorStop(1, '#6f8a66');
    g2.fillStyle = wg; g2.fillRect(0, 0, W, H);
    g2.save();
    g2.translate(W / 2 + (1 - a) * 30, H / 2 + 6); g2.rotate(0.012);
    g2.fillStyle = 'rgba(0,0,0,0.25)'; g2.fillRect(-312, -322, 640, 660);
    g2.fillStyle = '#fdfcf7'; g2.fillRect(-320, -330, 640, 660);
    g2.fillStyle = '#c8a24a'; g2.beginPath(); g2.arc(0, -308, 11, 0, 7); g2.fill();
    g2.fillStyle = '#555'; g2.font = `700 18px ${SANS}`; g2.textAlign = 'center'; g2.textBaseline = 'alphabetic';
    g2.fillText(ins.head, 0, -250);
    g2.fillStyle = '#b91c1c'; g2.font = `30px ${DISPLAY}`;
    const tl2 = wrap(ins.title, 560, g2.font);
    tl2.forEach((ln, i) => g2.fillText(ln, 0, -196 + i * 40));
    g2.fillStyle = '#222'; g2.textAlign = 'left';
    ins.lines.forEach((ln, i) => {
      const p = clamp((local - 0.5 - i * 0.28) / 0.3, 0, 1);
      g2.globalAlpha = p;
      g2.font = ln === 'GÜNDEM' ? `800 22px ${SANS}` : `500 22px ${SANS}`;
      g2.fillText(ln, -270, -100 + i * 38);
      g2.globalAlpha = 1;
    });
    g2.font = `italic 500 24px ${SERIF}`; g2.textAlign = 'right'; g2.fillStyle = '#1e3a8a';
    g2.fillText(ins.sign, 270, 290);
    g2.restore();
  } else if (ins.kind === 'note') {
    // tezgâh ahşabı üstünde açık defter
    g2.fillStyle = '#6b4226'; g2.fillRect(0, 0, W, H);
    g2.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 14; i++) g2.fillRect(0, i * 56 + 20, W, 3);
    g2.save();
    g2.translate(W / 2, H / 2 + (1 - a) * 40); g2.rotate(-0.03);
    g2.fillStyle = 'rgba(0,0,0,0.35)'; g2.fillRect(-418, -288, 846, 590);
    g2.fillStyle = ins.paper === 'white' ? '#fbfbf8' : '#f7f1dc'; g2.fillRect(-424, -296, 846, 590);
    g2.strokeStyle = '#9ec5e8'; g2.lineWidth = 2;
    for (let i = 0; i < 12; i++) { g2.beginPath(); g2.moveTo(-424, -210 + i * 44); g2.lineTo(422, -210 + i * 44); g2.stroke(); }
    g2.strokeStyle = '#e0787a'; g2.beginPath(); g2.moveTo(-330, -296); g2.lineTo(-330, 294); g2.stroke();
    g2.fillStyle = '#1e3a8a'; g2.font = `italic bold 34px ${SERIF}`; g2.textAlign = 'left'; g2.textBaseline = 'alphabetic';
    g2.fillText(ins.title, -300, -230);
    g2.font = `italic 30px ${SERIF}`;
    ins.lines.forEach((ln, i) => {
      const p = clamp((local - 0.3 - i * 0.25) / 0.3, 0, 1);
      g2.globalAlpha = p; g2.fillText(ln, -300, -168 + i * 44); g2.globalAlpha = 1;
    });
    const p = clamp((local - 0.4 - ins.lines.length * 0.25) / 0.5, 0, 1);
    g2.globalAlpha = p;
    g2.fillStyle = '#b91c1c'; g2.font = `italic bold 40px ${SERIF}`;
    g2.fillText(ins.last, -300, -168 + ins.lines.length * 44 + 6);
    g2.strokeStyle = '#b91c1c'; g2.lineWidth = 4;
    g2.beginPath(); g2.ellipse(-300 + g2.measureText(ins.last).width / 2, -180 + ins.lines.length * 44, g2.measureText(ins.last).width / 2 + 24, 34, -0.02, 0, 7); g2.stroke();
    g2.restore();
  } else {
    // telefon
    const bg = g2.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 700);
    bg.addColorStop(0, '#3b4252'); bg.addColorStop(1, '#0f1115');
    g2.fillStyle = bg; g2.fillRect(0, 0, W, H);
    const pw = 360, ph = 640, px = W / 2 - pw / 2, py = H / 2 - ph / 2 + (1 - a) * 60;
    g2.fillStyle = '#111'; roundRect(px - 14, py - 14, pw + 28, ph + 28, 46); g2.fill();
    g2.fillStyle = '#f5f6f8'; roundRect(px, py, pw, ph, 34); g2.fill();
    g2.save(); roundRect(px, py, pw, ph, 34); g2.clip();
    g2.fillStyle = '#e9ecf1'; g2.fillRect(px, py, pw, 92);
    g2.fillStyle = '#111'; g2.font = `600 17px ${SANS}`; g2.textAlign = 'left'; g2.textBaseline = 'middle';
    g2.fillText(ins.kind === 'wifi' ? '20.39' : '20.5' + (b.start % 10 | 0), px + 26, py + 24);
    g2.font = `bold 28px ${SANS}`;
    g2.fillText(ins.kind === 'wifi' ? 'Wi-Fi' : 'Şifre girin', px + 24, py + 64);
    if (ins.kind === 'wifi') {
      g2.font = `15px ${SANS}`; g2.fillStyle = '#667';
      g2.fillText('KULLANILABİLİR AĞLAR', px + 24, py + 122);
      ins.rows.forEach(([name, bars], i) => {
        const p = clamp((local - 0.2 - i * 0.18) / 0.25, 0, 1);
        const y = py + 160 + i * 66;
        g2.globalAlpha = p;
        g2.fillStyle = i === 0 ? '#e7f0ff' : '#ffffff'; g2.fillRect(px + 12, y - 28, pw - 24, 58);
        g2.fillStyle = '#111'; g2.font = `${i === 0 ? 'bold ' : ''}21px "DejaVu Sans", sans-serif`;
        g2.fillText(name, px + 28, y);
        g2.font = `17px ${SANS}`; g2.fillText('🔒', px + pw - 102, y);
        wifiIcon(px + pw - 72, y + 8, bars, '#1d4ed8');
        g2.globalAlpha = 1;
      });
      // vurgu
      const hp = clamp((local - 1.6) / 0.4, 0, 1);
      if (hp > 0) {
        g2.strokeStyle = `rgba(242,183,5,${hp})`; g2.lineWidth = 5; roundRect(px + 10, py + 130, pw - 20, 62, 12); g2.stroke();
      }
    } else {
      g2.fillStyle = '#556'; g2.font = `18px ${SANS}`;
      g2.fillText(`Ağ: ${ins.net}`, px + 24, py + 130);
      g2.fillStyle = '#fff'; g2.strokeStyle = '#c5cad3'; g2.lineWidth = 2;
      roundRect(px + 20, py + 160, pw - 40, 64, 12); g2.fill(); g2.stroke();
      const typeEnd = b.dur * 0.6;
      const n = Math.round(ins.input.length * clamp((local - 0.35) / (typeEnd - 0.35), 0, 1));
      g2.fillStyle = '#111'; g2.font = `26px "DejaVu Sans Mono", monospace`;
      const shown = ins.input.slice(0, n) + ((local * 2 | 0) % 2 && local < typeEnd ? '|' : '');
      g2.fillText(shown, px + 36, py + 193);
      // klavye
      g2.fillStyle = '#d6d9df'; g2.fillRect(px, py + ph - 250, pw, 250);
      const rows = ['qwertyuıopğü', 'asdfghjklşi', 'zxcvbnmöç'];
      g2.font = `17px ${SANS}`; g2.textAlign = 'center';
      const curCh = ins.input[n - 1];
      rows.forEach((r, ri) => {
        const kw = (pw - 20) / 12;
        const off = (12 - r.length) * kw / 2;
        [...r].forEach((ch, ci) => {
          const x = px + 10 + off + ci * kw, y = py + ph - 232 + ri * 58;
          const hit = local < typeEnd && ch === curCh;
          g2.fillStyle = hit ? '#9fb7ff' : '#fff'; roundRect(x + 2, y, kw - 4, 46, 6); g2.fill();
          g2.fillStyle = '#111'; g2.fillText(ch, x + kw / 2, y + 23);
        });
      });
      g2.textAlign = 'left';
      if (local >= b.dur * 0.68) {
        const ok = ins.ok;
        g2.fillStyle = ok ? '#15803d' : '#b91c1c';
        roundRect(px + 20, py + 250, pw - 40, 64, 12); g2.fill();
        g2.fillStyle = '#fff'; g2.font = `bold 22px ${SANS}`; g2.textAlign = 'center';
        g2.fillText(ok ? `✓ ${ins.okText || 'Bağlandı'}` : '✕ Yanlış şifre', px + pw / 2, py + 282);
        g2.textAlign = 'left';
      }
    }
    g2.restore();
  }
  if (a < 1) { g2.fillStyle = `rgba(0,0,0,${1 - a})`; g2.fillRect(0, 0, W, H); }
}

function drawBug() {
  g2.save();
  g2.globalAlpha = 0.78;
  g2.font = `900 26px ${SANS}`;
  g2.textAlign = 'left'; g2.textBaseline = 'top';
  g2.lineWidth = 4; g2.strokeStyle = 'rgba(0,0,0,0.6)';
  g2.strokeText('GİBİ', 28, 22);
  g2.fillStyle = '#f2b705';
  g2.fillText('GİBİ', 28, 22);
  g2.restore();
}

// --- ana çizim ----------------------------------------------------------------
let lastSceneKey = null;
function renderAt(t) {
  const sc = sceneAt(t);
  const bi = beatIdxAt(t);
  const beat = tl.beats[bi];
  const local = beat ? t - beat.start : 0;

  if (!sc.set || (beat && (beat.type === 'title' || beat.type === 'credits'))) {
    if (beat && beat.type === 'title') drawTitle(local, beat.dur);
    else if (beat && beat.type === 'credits') drawCredits(local, beat.dur);
    else { g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H); }
    return out;
  }
  if (beat && beat.type === 'card') {
    drawCard(beat.text, local, beat.dur);
    return out;
  }
  if (beat && beat.type === 'insert') {
    drawInsert(beat, local);
    drawBug();
    drawSubtitle(t);
    return out;
  }

  const key = sc.id;
  if (key !== lastSceneKey) {
    lastSceneKey = key;
    applyTimeOfDay(sets, sc.set, sc.time, lights);
    sets.listFrames.mesh.material.map = sets.listFrames[sc.list] || sets.listFrames[3];
    scene.background.set(sc.set === 'E' ? '#9fd0f5' : '#151515');
  }
  // setlerin görünürlüğü (aktif set + karakterlerin bulunduğu setler)
  const active = new Set([sc.set]);
  for (const id of Object.keys(chars)) {
    const st = charState(id, t);
    chars[id].update(st);
    if (st.visible) {
      for (const [k, v] of Object.entries(layout)) if (v.origin && Math.abs(st.x - v.origin[0]) < 15) active.add(k);
    }
  }
  for (const [k, g] of Object.entries(sets.groups)) g.visible = active.has(k);
  // kapılar
  for (const [d, cfg] of Object.entries(layout.doors)) {
    const piv = sets.doors[d];
    const o = layout[cfg.set].origin;
    piv.position.set(cfg.hinge[0], 0, cfg.hinge[1]);
    const v = tl.doors[d] ? evalTween(tl.doors[d], t) : 0;
    piv.rotation.y = (cfg.closedYaw * Math.PI) / 180 + cfg.sign * v * 1.65 * (cfg.closedYaw === 0 ? 1 : 1);
    void o;
  }
  // bayraklar
  for (const [k, f] of Object.entries(sets.flags)) {
    const arr = tl.flags[k];
    const v = arr ? evalStep(arr, t, f.def) : f.def;
    if (f.screen) {
      if (k === 'B.tv' && sets.tvB.cur !== v) { sets.tvB.cur = v; sets.tvB.mesh.material.map = sets.tvB.tex[v] || sets.tvB.tex.off; sets.tvB.mesh.material.needsUpdate = true; }
    } else f.obj.visible = !!v;
  }
  // minibüs
  if (sets.van) {
    const x = evalTween(tl.van, t);
    sets.van.position.x = x;
    sets.van.children.forEach((c) => { if (c.geometry && c.geometry.type === 'CylinderGeometry' && c.rotation.x) c.rotation.y = x * 2.6; });
  }
  // Necmi Bey'in saati (20.00'den başlar) ve modem ışıkları
  if (sets.clockHands && sc.set === 'G') {
    const sec = (t - sc.start) + 20 * 3600 + 5;
    const [hh, mm, ss] = sets.clockHands;
    hh.rotation.z = -((sec / 3600) % 12) / 12 * Math.PI * 2;
    mm.rotation.z = -((sec / 60) % 60) / 60 * Math.PI * 2;
    ss.rotation.z = -Math.floor(sec % 60) / 60 * Math.PI * 2;
    sets.modemLeds.forEach((l, i) => { l.visible = i === 0 || Math.sin(t * (7 + i * 3.1) + i) > -0.2; });
  }
  // TV titreşimi
  if (sets.tv && sc.time === 'night') {
    const f = 0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 3.1);
    sets.tv.material.color.setRGB(0.25 * f, 0.38 * f, 0.62 * f);
  }

  // güneş aktif setin üstünde
  const o = layout[sc.set].origin;
  sun.position.set(o[0] + 5, 10, o[2] + 7);
  sun.target.position.set(o[0], 0, o[2] - 0.5);
  fill.position.set(o[0] - 6, 4, o[2] + 8);
  fill.target.position.set(o[0], 1, o[2]);

  let cam;
  try { cam = computeCamera(t, sc); } catch (e) {
    console.warn('kamera', t, e.message);
    const w = WIDE[sc.set];
    cam = { pos: toWorld(sc.set, w.pos), look: toWorld(sc.set, w.look), fov: w.fov };
  }
  camera.position.copy(cam.pos);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(cam.look);
  if (post) post.render(t, cam); else renderer.render(scene, camera);

  g2.drawImage(renderer.domElement, 0, 0, W, H);
  drawBug();
  drawSubtitle(t);
  // sahne geçiş kararması
  const fin = smooth((t - sc.start) / 0.45);
  const fout = smooth((sc.end - t) / 0.45);
  const a = 1 - Math.min(fin, fout);
  if (a > 0.001) { g2.fillStyle = `rgba(0,0,0,${a})`; g2.fillRect(0, 0, W, H); }
  return out;
}

// --- dışa aktarma API'si ------------------------------------------------------
window.EPISODE = { duration: tl.duration, fps: FPS, frames: Math.ceil(tl.duration * FPS) };
window.renderFrame = (i, quality = 0.9) => {
  renderAt(i / FPS);
  return out.toDataURL('image/jpeg', quality);
};
window.renderTime = (t) => { renderAt(t); return out.toDataURL('image/jpeg', 0.9); };

if (MODE === 'preview') {
  const host = document.getElementById('stage');
  out.style.width = '100%';
  out.style.height = 'auto';
  host.appendChild(out);
  const audio = document.getElementById('audio');
  const seek = document.getElementById('seek');
  const label = document.getElementById('time');
  seek.max = tl.duration;
  let playing = false;
  let t0 = 0;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const tick = () => {
    const t = playing ? (audio.duration ? audio.currentTime : (performance.now() - t0) / 1000) : Number(seek.value);
    renderAt(t);
    if (playing) seek.value = t;
    label.textContent = `${fmt(t)} / ${fmt(tl.duration)}`;
    requestAnimationFrame(tick);
  };
  document.getElementById('play').onclick = () => {
    playing = !playing;
    if (playing) { audio.currentTime = Number(seek.value); audio.play().catch(() => {}); t0 = performance.now() - Number(seek.value) * 1000; }
    else audio.pause();
    document.getElementById('play').textContent = playing ? '❚❚' : '▶';
  };
  seek.oninput = () => { audio.currentTime = Number(seek.value); t0 = performance.now() - Number(seek.value) * 1000; };
  if (params.get('t')) seek.value = params.get('t');
  tick();
}
window.READY = true;
