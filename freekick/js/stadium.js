import * as THREE from 'three';
import { FIELD } from './config.js';

// ---------------------------------------------------------------------------
// Pitch: one large plane shaded procedurally (grass texture from ambientCG,
// mowing stripes, crisp analytic line markings and the referee's vanishing spray).
// ---------------------------------------------------------------------------
function makePitch(tex, maxAniso) {
  for (const t of [tex.color, tex.normal, tex.rough]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
  }
  tex.color.colorSpace = THREE.SRGBColorSpace;

  const uniforms = {
    uGrass: { value: tex.color },
    uGrassN: { value: tex.normal },
    uGrassR: { value: tex.rough },
    uSprayA: { value: new THREE.Vector2(0, 30) },
    uSprayB: { value: new THREE.Vector2(0, 30) },
    uSprayBall: { value: new THREE.Vector2(0, 30) },
    uSpray: { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.55 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform sampler2D uGrass; uniform sampler2D uGrassN; uniform sampler2D uGrassR;
uniform vec2 uSprayA; uniform vec2 uSprayB; uniform vec2 uSprayBall; uniform float uSpray;
float gLine; float gSprayM;
float segX(vec2 p, float x0, float x1, float z) { float dx = max(max(x0 - p.x, p.x - x1), 0.0); return length(vec2(dx, p.y - z)); }
float segZ(vec2 p, float z0, float z1, float x) { float dz = max(max(z0 - p.y, p.y - z1), 0.0); return length(vec2(p.x - x, dz)); }
float lmask(float d, float hw) { float aa = max(fwidth(d), 1e-4) * 0.9; return 1.0 - smoothstep(hw - aa, hw + aa, d); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float pitchLines(vec2 p) {
  const float hw = 0.06;
  float d = 1e3;
  d = min(d, segX(p, -34.0, 34.0, 0.0));
  d = min(d, segZ(p, 0.0, 105.0, -34.0));
  d = min(d, segZ(p, 0.0, 105.0, 34.0));
  d = min(d, segX(p, -34.0, 34.0, 52.5));
  d = min(d, segX(p, -20.16, 20.16, 16.5));
  d = min(d, segZ(p, 0.0, 16.5, -20.16));
  d = min(d, segZ(p, 0.0, 16.5, 20.16));
  d = min(d, segX(p, -9.16, 9.16, 5.5));
  d = min(d, segZ(p, 0.0, 5.5, -9.16));
  d = min(d, segZ(p, 0.0, 5.5, 9.16));
  float m = lmask(d, hw);
  float arc = abs(length(p - vec2(0.0, 11.0)) - 9.15);
  m = max(m, lmask(arc, hw) * step(16.5 + hw, p.y));
  m = max(m, lmask(length(p - vec2(0.0, 11.0)), 0.12));
  float cc = abs(length(p - vec2(0.0, 52.5)) - 9.15);
  m = max(m, lmask(cc, hw));
  m = max(m, lmask(length(p - vec2(0.0, 52.5)), 0.15));
  float ca = min(abs(length(p - vec2(-34.0, 0.0)) - 1.0), abs(length(p - vec2(34.0, 0.0)) - 1.0));
  m = max(m, lmask(ca, hw) * step(0.0, p.y) * step(abs(p.x), 34.0));
  return m;
}
float sprayMask(vec2 p) {
  vec2 ab = uSprayB - uSprayA;
  float t = clamp(dot(p - uSprayA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  float dl = length(p - (uSprayA + ab * t));
  float n = vnoise(p * 9.0) * 0.035 + vnoise(p * 31.0) * 0.02;
  float m = lmask(dl + n * 0.6, 0.04) * (0.55 + 0.3 * vnoise(p * 17.0));
  float ring = abs(length(p - uSprayBall) - 0.3);
  m = max(m, lmask(ring + n * 0.5, 0.022) * 0.55 * (0.6 + 0.4 * vnoise(p * 23.0)));
  return m * uSpray;
}`)
      .replace('#include <map_fragment>', `
vec2 wp = vWPos.xz;
vec3 g1 = texture2D(uGrass, wp / 2.6).rgb;
vec3 g2 = texture2D(uGrass, vec2(wp.y, -wp.x) / 7.3 + 0.37).rgb;
vec3 grass = mix(g1, g2, 0.35);
float macro = texture2D(uGrass, wp / 43.0).g;
grass *= 0.86 + macro * 0.3;
grass = mix(grass, vec3(dot(grass, vec3(0.33))), 0.12) * vec3(0.92, 1.02, 0.86);
float inPitch = step(abs(wp.x), 36.5) * step(-3.0, wp.y);
float band = mod(floor(wp.y / 5.25), 2.0);
float band2 = mod(floor((wp.x + 34.0) / 6.8), 2.0);
float stripe = mix(0.9, 1.1, band) * mix(0.985, 1.015, band2);
grass *= mix(1.0, stripe, inPitch);
float wear = exp(-dot(wp - vec2(0.0, 2.0), wp - vec2(0.0, 2.0)) / 9.0) * 0.35 + exp(-dot(wp - vec2(0.0, 11.0), wp - vec2(0.0, 11.0)) / 1.5) * 0.25;
grass = mix(grass, grass * vec3(1.18, 1.0, 0.7), wear * (0.6 + 0.4 * vnoise(wp * 1.7)));
gLine = pitchLines(wp) * inPitch;
gSprayM = sprayMask(wp);
vec3 paint = vec3(0.93, 0.95, 0.92) * (0.9 + 0.1 * g1.g * 2.0);
vec3 col = mix(grass, paint, max(gLine * 0.92, gSprayM));
diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = mix(0.72 + texture2D(uGrassR, wp / 2.6).g * 0.25, 0.6, gLine);`)
      .replace('#include <normal_fragment_maps>', `
vec3 nT = texture2D(uGrassN, wp / 2.6).xyz * 2.0 - 1.0;
nT.xy *= 0.9 * (1.0 - gLine * 0.7);
vec3 nW = normalize(vec3(nT.x, nT.z, -nT.y));
normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`);
  };
  mat.userData.uniforms = uniforms;

  const geo = new THREE.PlaneGeometry(220, 200, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 40);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------------------
// Goal frame
// ---------------------------------------------------------------------------
function makeGoalFrame() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.28, metalness: 0.05 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.45, metalness: 0.6 });
  const pr = FIELD.postRadius;
  const hw = FIELD.goalHalfWidth + pr;
  const H = FIELD.goalHeight + pr;
  const post = new THREE.CylinderGeometry(pr, pr, H, 24);
  post.translate(0, H / 2, 0);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(post, white);
    m.position.x = sx * hw;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(pr, 20, 12), white);
    cap.position.set(sx * hw, H, 0);
    cap.castShadow = true;
    g.add(cap);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, hw * 2, 24), white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, H, 0);
  bar.castShadow = true; bar.receiveShadow = true;
  g.add(bar);

  // support frame the net hangs on
  const tube = (a, b, r = 0.022) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), grey);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    g.add(m);
  };
  const Dr = FIELD.netRoofDepth, Db = FIELD.netBackDepth, Ht = FIELD.goalHeight;
  for (const sx of [-1, 1]) {
    tube(new THREE.Vector3(sx * hw, Ht, 0), new THREE.Vector3(sx * hw, Ht, -Dr));
    tube(new THREE.Vector3(sx * hw, Ht, -Dr), new THREE.Vector3(sx * hw, 0.02, -Db));
    tube(new THREE.Vector3(sx * hw, 0.02, 0), new THREE.Vector3(sx * hw, 0.02, -Db), 0.018);
  }
  tube(new THREE.Vector3(-hw, Ht, -Dr), new THREE.Vector3(hw, Ht, -Dr));
  tube(new THREE.Vector3(-hw, 0.02, -Db), new THREE.Vector3(hw, 0.02, -Db), 0.018);
  return g;
}

// ---------------------------------------------------------------------------
// LED advertising boards
// ---------------------------------------------------------------------------
const BOARD_MESSAGES = [
  ['BULUT ARENA', '#0e1b2c', '#ffd23f'],
  ['FRİKİK USTASI', '#d7263d', '#ffffff'],
  ['KÖŞE GÖNDER', '#10151f', '#6ee7ff'],
  ['9.15 M', '#f2d027', '#10151f'],
  ['BANDIRMA SPOR', '#1f3c88', '#ffffff'],
  ['FALSO TV', '#ffffff', '#d7263d'],
  ['ÇİM & TOPRAK', '#2f8f46', '#f4f7f2'],
  ['GOL KRALI', '#10151f', '#ffd23f'],
];
function makeBoardCanvas(mode) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 96;
  const g = c.getContext('2d');
  if (mode === 'goal') {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#ffd23f' : '#d7263d';
      g.fillRect(i * 256, 0, 256, 96);
      g.fillStyle = i % 2 ? '#10151f' : '#ffffff';
      g.font = '700 74px Teko, "Arial Narrow", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('GOOOL!', i * 256 + 128, 54);
    }
  } else {
    const w = 2048 / 4;
    for (let i = 0; i < 4; i++) {
      const [txt, bg, fg] = BOARD_MESSAGES[(i + (mode === 'b' ? 4 : 0)) % BOARD_MESSAGES.length];
      g.fillStyle = bg; g.fillRect(i * w, 0, w, 96);
      g.fillStyle = fg;
      g.font = '600 66px Teko, "Arial Narrow", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, i * w + w / 2, 54);
    }
  }
  // LED pixel grid
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let x = 0; x < 2048; x += 4) g.fillRect(x, 0, 1, 96);
  for (let y = 0; y < 96; y += 4) g.fillRect(0, y, 2048, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

class LedBoards {
  constructor(group) {
    this.texA = makeBoardCanvas('a');
    this.texB = makeBoardCanvas('b');
    this.texGoal = makeBoardCanvas('goal');
    this.mat = new THREE.MeshBasicMaterial({ map: this.texA, color: new THREE.Color(1.35, 1.35, 1.35) });
    this.matSide = new THREE.MeshBasicMaterial({ map: this.texB, color: new THREE.Color(1.3, 1.3, 1.3) });
    const back = new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: 0.7 });
    const mk = (len, mat, repeat) => {
      const geo = new THREE.BoxGeometry(len, 0.9, 0.12);
      // front face (+z) gets UVs scaled so the texture repeats along the board
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeat);
      const mats = [back, back, back, back, mat, back];
      const m = new THREE.Mesh(geo, mats);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };
    const behind = mk(56, this.mat, 2);
    behind.position.set(0, 0.45, -5.2);
    group.add(behind);
    for (const sx of [-1, 1]) {
      const b = mk(22, this.mat, 0.8);
      b.position.set(sx * 23.5, 0.45, -3.2);
      b.rotation.y = -sx * 0.18;
      group.add(b);
      const side = mk(80, this.matSide, 3);
      side.position.set(sx * 37.5, 0.45, 38);
      side.rotation.y = -sx * Math.PI / 2;
      group.add(side);
    }
    this.goalTimer = 0;
  }
  celebrate(seconds = 5) { this.goalTimer = seconds; }
  update(dt, t) {
    this.goalTimer = Math.max(0, this.goalTimer - dt);
    const goal = this.goalTimer > 0;
    const want = goal ? this.texGoal : this.texA;
    if (this.mat.map !== want) { this.mat.map = want; this.matSide.map = goal ? this.texGoal : this.texB; this.mat.needsUpdate = true; this.matSide.needsUpdate = true; }
    const speed = goal ? 0.35 : 0.018;
    this.mat.map.offset.x = (this.mat.map.offset.x + dt * speed) % 1;
    this.matSide.map.offset.x = (this.matSide.map.offset.x - dt * speed) % 1;
    const flash = goal ? 1.0 + 0.6 * (Math.sin(t * 18) > 0 ? 1 : 0) : 1.35;
    this.mat.color.setScalar(flash);
  }
}

// ---------------------------------------------------------------------------
// Stands + crowd
// ---------------------------------------------------------------------------
function buildStandGeometry(opts) {
  const { length, rows, rowDepth, rowRise, baseY, seatColor } = opts;
  const pos = [], col = [], nor = [];
  const quad = (a, b, c, d, n, color) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) { nor.push(...n); col.push(color.r, color.g, color.b); }
  };
  const L = length / 2;
  const concrete = new THREE.Color(0x6d7178);
  const concreteDark = new THREE.Color(0x3a3e45);
  let y0 = 0;
  for (let i = 0; i < rows; i++) {
    const z0 = -i * rowDepth, z1 = -(i + 1) * rowDepth;
    const y = baseY + i * rowRise;
    // riser
    quad([-L, y0, z0], [L, y0, z0], [L, y, z0], [-L, y, z0], [0, 0, 1], i === 0 ? concreteDark : concrete);
    // tread split into seat blocks for colour variety
    const blocks = Math.max(1, Math.round(length / 6));
    for (let b = 0; b < blocks; b++) {
      const xa = -L + (b / blocks) * length, xb = -L + ((b + 1) / blocks) * length;
      const c = seatColor(i, b, blocks);
      quad([xa, y, z0], [xb, y, z0], [xb, y, z1], [xa, y, z1], [0, 1, 0], c);
    }
    y0 = y;
  }
  // back wall
  const zb = -rows * rowDepth;
  quad([L, 0, zb], [-L, 0, zb], [-L, y0 + 3.5, zb], [L, y0 + 3.5, zb], [0, 0, 1], concreteDark);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

function makeCrowdAtlas() {
  // 4 x 4 atlas of fan sprites. Channels: R = shirt, G = skin, B = hair/trousers, A = coverage.
  const cw = 128, ch = 256;
  const c = document.createElement('canvas');
  c.width = cw * 4; c.height = ch * 4;
  const g = c.getContext('2d');
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 16; i++) {
    const ox = (i % 4) * cw, oy = Math.floor(i / 4) * ch;
    const cheer = i >= 8;
    const fat = 0.85 + rnd() * 0.35;
    const cx = ox + cw / 2;
    const shoulderY = oy + 96 + rnd() * 10;
    g.save();
    // trousers / legs (B)
    g.fillStyle = 'rgb(0,0,255)';
    g.fillRect(cx - 22 * fat, shoulderY + 88, 18 * fat, 70);
    g.fillRect(cx + 4 * fat, shoulderY + 88, 18 * fat, 70);
    // torso (R)
    g.fillStyle = 'rgb(255,0,0)';
    g.beginPath();
    g.moveTo(cx - 30 * fat, shoulderY + 4);
    g.quadraticCurveTo(cx, shoulderY - 8, cx + 30 * fat, shoulderY + 4);
    g.lineTo(cx + 26 * fat, shoulderY + 96);
    g.lineTo(cx - 26 * fat, shoulderY + 96);
    g.closePath(); g.fill();
    // arms
    const armW = 13;
    if (cheer) {
      const spread = 8 + rnd() * 18;
      for (const s of [-1, 1]) {
        g.fillStyle = 'rgb(255,0,0)';
        g.save(); g.translate(cx + s * 26 * fat, shoulderY + 8); g.rotate(s * (Math.PI - 0.35 - spread / 60));
        g.fillRect(-armW / 2, 0, armW, 40); g.fillStyle = 'rgb(0,255,0)'; g.fillRect(-armW / 2, 40, armW, 34);
        g.beginPath(); g.arc(0, 78, 9, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    } else {
      for (const s of [-1, 1]) {
        g.fillStyle = 'rgb(255,0,0)';
        g.save(); g.translate(cx + s * 28 * fat, shoulderY + 8); g.rotate(s * (0.12 + rnd() * 0.25));
        g.fillRect(-armW / 2, 0, armW, 38); g.fillStyle = 'rgb(0,255,0)'; g.fillRect(-armW / 2, 38, armW, 38);
        g.restore();
      }
    }
    // neck + head (G)
    g.fillStyle = 'rgb(0,255,0)';
    g.fillRect(cx - 8, shoulderY - 18, 16, 20);
    g.beginPath(); g.ellipse(cx, shoulderY - 38, 19, 23, 0, 0, Math.PI * 2); g.fill();
    // hair / cap (B)
    g.fillStyle = 'rgb(0,0,255)';
    g.beginPath();
    if (rnd() > 0.35) g.ellipse(cx, shoulderY - 50, 20, 13, 0, Math.PI, Math.PI * 2);
    else { g.ellipse(cx, shoulderY - 52, 21, 11, 0, Math.PI, Math.PI * 2); g.fillRect(cx - 2, shoulderY - 56, 30, 6); }
    g.fill();
    // scarf on some fans (R)
    if (rnd() > 0.6) { g.fillStyle = 'rgb(255,0,0)'; g.fillRect(cx - 18, shoulderY - 4, 36, 10); }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

class Crowd {
  constructor(group, density) {
    this.instances = [];
    this.atlas = makeCrowdAtlas();
    this.uniforms = {
      uAtlas: { value: this.atlas },
      uTime: { value: 0 },
      uExcite: { value: 0 },
      uSun: { value: 1.0 },
      uWave: { value: -100 },
      uFogColor: { value: new THREE.Color(0xc4cdd6) },
      uFogNear: { value: 70 },
      uFogFar: { value: 260 },
    };
    this.density = density;
    this.offsets = []; this.colors = []; this.meta = [];
  }
  addStand(transform, opts) {
    const { length, rows, rowDepth, rowRise, baseY, palette, fill = 0.86 } = opts;
    const spacing = 0.62 / this.density;
    const v = new THREE.Vector3();
    for (let i = 0; i < rows; i++) {
      const y = baseY + i * rowRise;
      const z = -(i + 0.45) * rowDepth;
      for (let x = -length / 2 + 0.4; x < length / 2 - 0.4; x += spacing) {
        if (Math.random() > fill) continue;
        v.set(x + (Math.random() - 0.5) * 0.18, y, z + (Math.random() - 0.5) * 0.1).applyMatrix4(transform);
        this.offsets.push(v.x, v.y, v.z);
        const c = palette[Math.floor(Math.random() * palette.length)];
        const cc = new THREE.Color(c).offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.12);
        this.colors.push(cc.r, cc.g, cc.b);
        this.meta.push(Math.random() * 6.283, Math.floor(Math.random() * 8), Math.random(), 0.9 + Math.random() * 0.2);
      }
    }
  }
  build(group) {
    const base = new THREE.PlaneGeometry(0.62, 1.24);
    base.translate(0, 0.62, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(new Float32Array(this.offsets), 3));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(new Float32Array(this.colors), 3));
    geo.setAttribute('iMeta', new THREE.InstancedBufferAttribute(new Float32Array(this.meta), 4));
    geo.instanceCount = this.offsets.length / 3;
    this.count = geo.instanceCount;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        attribute vec3 iOffset; attribute vec3 iColor; attribute vec4 iMeta;
        uniform float uTime; uniform float uExcite; uniform float uWave;
        varying vec2 vUv; varying vec3 vShirt; varying vec3 vSkin; varying vec3 vHair; varying float vShade; varying float vDepth;
        void main() {
          float phase = iMeta.x; float variant = iMeta.y; float r = iMeta.z; float sc = iMeta.w;
          // Mexican wave travels along x when the crowd is calm
          float wave = exp(-pow((iOffset.x - uWave) * 0.22, 2.0)) * step(uExcite, 0.3);
          float cheer = step(r, uExcite * 1.1) ;
          cheer = max(cheer, step(0.5, wave));
          float jump = (cheer * abs(sin(uTime * (7.0 + r * 3.0) + phase)) * 0.32 * uExcite) + wave * 0.45;
          float idle = sin(uTime * 1.3 + phase) * 0.02;
          float v = variant + cheer * 8.0;
          vec2 cell = vec2(mod(v, 4.0), floor(v / 4.0));
          vUv = (cell + vec2(uv.x, 1.0 - uv.y)) / 4.0;
          vUv.y = 1.0 - vUv.y;
          vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          vec3 wp = iOffset + right * (position.x * sc + idle) + vec3(0.0, position.y * sc + jump, 0.0);
          vShirt = iColor;
          float sk = fract(r * 13.7);
          vSkin = mix(vec3(0.93, 0.74, 0.6), vec3(0.42, 0.28, 0.19), sk * sk);
          vHair = mix(vec3(0.07, 0.06, 0.05), vec3(0.2, 0.2, 0.24), fract(r * 7.1));
          vShade = 0.72 + 0.28 * fract(r * 3.3);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas; uniform float uSun; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
        varying vec2 vUv; varying vec3 vShirt; varying vec3 vSkin; varying vec3 vHair; varying float vShade; varying float vDepth;
        void main() {
          vec4 t = texture2D(uAtlas, vUv);
          if (t.a < 0.45) discard;
          vec3 c = (vShirt * t.r + vSkin * t.g + vHair * t.b) / max(t.r + t.g + t.b, 1e-3);
          vec3 col = c * vShade * uSun;
          col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth) * 0.55);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    this.mesh = mesh;

    // camera flashes
    const n = Math.min(900, Math.floor(this.count * 0.08));
    const fp = new Float32Array(n * 3), fr = new Float32Array(n);
    const offs = this.offsets;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(Math.random() * (offs.length / 3)) * 3;
      fp[i * 3] = offs[k]; fp[i * 3 + 1] = offs[k + 1] + 1.2; fp[i * 3 + 2] = offs[k + 2];
      fr[i] = Math.random();
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('aR', new THREE.BufferAttribute(fr, 1));
    this.flashUniforms = { uTime: { value: 0 }, uFlash: { value: 0 }, uPx: { value: 1 } };
    const fm = new THREE.ShaderMaterial({
      uniforms: this.flashUniforms,
      vertexShader: `attribute float aR; uniform float uTime; uniform float uFlash; uniform float uPx; varying float vI;
        void main(){ float f = fract(uTime * (0.35 + aR * 0.6) + aR * 17.0);
          vI = pow(max(0.0, 1.0 - f * 14.0), 2.0) * uFlash;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (vI > 0.001 ? 0.9 : 0.0) * uPx / -mv.z;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vI; void main(){ vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d,d) * 30.0) * vI;
          gl_FragColor = vec4(vec3(4.0, 4.0, 4.4) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.flashes = new THREE.Points(fg, fm);
    this.flashes.frustumCulled = false;
    group.add(this.flashes);
  }
  update(dt, t, excite, flash, pxScale) {
    this.uniforms.uTime.value = t;
    this.uniforms.uExcite.value = excite;
    this.flashUniforms.uTime.value = t;
    this.flashUniforms.uFlash.value = flash;
    this.flashUniforms.uPx.value = pxScale;
    // occasional Mexican wave while the crowd is calm
    const w = this.uniforms.uWave;
    if (excite < 0.3) {
      w.value += dt * 18;
      if (w.value > 120) w.value = -300 - Math.random() * 300;
    }
  }
}

function makeFloodlight() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9199, roughness: 0.5, metalness: 0.7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 42, 10), steel);
  pole.position.y = 21;
  g.add(pole);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#20252c'; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
    const gr = x.createRadialGradient(16 + i * 32, 16 + j * 32, 1, 16 + i * 32, 16 + j * 32, 15);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#fff4d6'); gr.addColorStop(1, '#3a3f47');
    x.fillStyle = gr; x.beginPath(); x.arc(16 + i * 32, 16 + j * 32, 13, 0, 7); x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(3.2, 3.1, 2.9) }));
  lamp.position.set(0, 43, 0.5);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.6, 5.1, 0.6), steel);
  frame.position.set(0, 43, 0.1);
  g.add(frame, lamp);
  return g;
}

function makeBanner(text, bg, fg, stripe) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  if (stripe) {
    g.fillStyle = stripe;
    for (let i = -2; i < 12; i++) { g.beginPath(); g.moveTo(i * 110, 256); g.lineTo(i * 110 + 60, 256); g.lineTo(i * 110 + 200, 0); g.lineTo(i * 110 + 140, 0); g.fill(); }
  }
  g.fillStyle = fg;
  g.font = '700 150px Teko, "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 142);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Supporters' banners hung over the front rail; they ripple in the breeze. */
function makeBanners(group) {
  const uniforms = { uTime: { value: 0 } };
  const list = [
    ['BULUT ULTRAS', '#d7263d', '#ffffff', 'rgba(255,255,255,0.12)'],
    ['KIRMIZI BEYAZ', '#ffffff', '#d7263d', null],
    ['9,15 M ŞEREF', '#10151f', '#ffd23f', 'rgba(255,210,63,0.1)'],
    ['FRİKİK USTASI', '#d7263d', '#ffd23f', 'rgba(0,0,0,0.12)'],
  ];
  const out = [];
  list.forEach(([t, bg, fg, st], i) => {
    const geo = new THREE.PlaneGeometry(9, 2.2, 18, 4);
    geo.translate(0, -1.1, 0);
    const mat = new THREE.MeshStandardMaterial({ map: makeBanner(t, bg, fg, st), roughness: 0.9, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float hang = -position.y / 2.2;
          transformed.z += sin(uTime * 1.7 + position.x * 0.8 + ${i}.0) * 0.08 * hang + hang * 0.12;`);
    };
    const m = new THREE.Mesh(geo, mat);
    // draped over the seats of the lower tier, clear of the goal mouth
    const xs = [-31, -17, 17, 31];
    const row = 6 + (i % 2) * 2;
    m.position.set(xs[i], 1.3 + row * 0.46 + 2.1, -9 - row * 0.85 - 0.35);
    m.receiveShadow = true;
    group.add(m);
    out.push(m);
  });
  return uniforms;
}

function makeCornerFlag(x) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.55, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
  pole.position.y = 0.775;
  pole.castShadow = true;
  g.add(pole);
  const geo = new THREE.PlaneGeometry(0.42, 0.3, 8, 4);
  geo.translate(0.21, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd23f, side: THREE.DoubleSide, roughness: 0.8 });
  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uniforms.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = position.x / 0.42;
        transformed.z += sin(uTime * 6.0 - position.x * 14.0) * 0.06 * k;
        transformed.y -= k * k * 0.04;`);
  };
  const flag = new THREE.Mesh(geo, mat);
  flag.position.y = 1.4;
  flag.castShadow = true;
  g.add(flag);
  g.position.set(x, 0, 0);
  g.userData.uniforms = uniforms;
  return g;
}

export class Stadium {
  constructor(scene, assets, quality) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const maxAniso = quality.anisotropy;
    const pitch = makePitch(assets.grass, maxAniso);
    this.pitchUniforms = pitch.uniforms;
    this.group.add(pitch.mesh);
    this.goalFrame = makeGoalFrame();
    this.group.add(this.goalFrame);
    this.boards = new LedBoards(this.group);

    const seatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
    const home = [0xd7263d, 0xd7263d, 0xd7263d, 0xffffff, 0xb81d31, 0xf2f2f2, 0x1b1b1b];
    const away = [0x1f3c88, 0x2c56c2, 0xffffff, 0x1f3c88, 0xd7263d, 0x1b1b1b];
    const seatRed = new THREE.Color(0xa01d2c), seatWhite = new THREE.Color(0xd9d9d9), seatBlue = new THREE.Color(0x1f3c88);
    this.crowd = new Crowd(this.group, quality.crowdDensity);

    const addStand = (opts, pos, rotY, palette) => {
      const geo = buildStandGeometry(opts);
      const m = new THREE.Mesh(geo, seatMat);
      m.position.copy(pos);
      m.rotation.y = rotY;
      m.receiveShadow = true;
      m.updateMatrixWorld(true);
      this.group.add(m);
      this.crowd.addStand(m.matrixWorld, { ...opts, palette });
      return m;
    };
    const seatPattern = (a, b) => (i, blk) => ((Math.floor(i / 6) + blk) % 5 === 0 ? b : a);
    // north stand (behind the goal), two tiers
    addStand({ length: 96, rows: 26, rowDepth: 0.85, rowRise: 0.46, baseY: 1.3, seatColor: seatPattern(seatRed, seatWhite) },
      new THREE.Vector3(0, 0, -9), 0, home);
    addStand({ length: 100, rows: 20, rowDepth: 0.85, rowRise: 0.55, baseY: 15.5, seatColor: seatPattern(seatWhite, seatRed) },
      new THREE.Vector3(0, 0, -33.5), 0, home);
    // side stands
    for (const sx of [-1, 1]) {
      addStand({ length: 125, rows: 30, rowDepth: 0.85, rowRise: 0.5, baseY: 1.3, seatColor: seatPattern(sx < 0 ? seatBlue : seatRed, seatWhite) },
        new THREE.Vector3(sx * 42, 0, 48), -sx * Math.PI / 2, sx < 0 ? away : home);
    }
    // south stand (seen in replays)
    addStand({ length: 96, rows: 26, rowDepth: 0.85, rowRise: 0.46, baseY: 1.3, seatColor: seatPattern(seatRed, seatWhite) },
      new THREE.Vector3(0, 0, 112), Math.PI, home);
    this.crowd.build(this.group);

    // roofs with underside light strips
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.6, metalness: 0.4 });
    const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.5, 2.3) });
    const roof = (w, d, pos, rotY) => {
      const r = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), roofMat);
      r.add(slab);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.12, 0.5), stripMat);
      strip.position.set(0, -0.45, d / 2 - 1.2);
      r.add(strip);
      r.position.copy(pos); r.rotation.y = rotY;
      this.group.add(r);
    };
    roof(104, 22, new THREE.Vector3(0, 32, -44), 0);
    for (const sx of [-1, 1]) roof(128, 16, new THREE.Vector3(sx * (42 + 18), 22, 48), -sx * Math.PI / 2);

    for (const [x, z, ry] of [[-50, -12, 0.75], [50, -12, -0.75]]) {
      const f = makeFloodlight();
      f.position.set(x, 0, z);
      f.rotation.y = ry;
      this.group.add(f);
    }
    this.bannerUniforms = makeBanners(this.group);
    this.flags = [makeCornerFlag(-34), makeCornerFlag(34)];
    for (const f of this.flags) this.group.add(f);

    this.excite = 0;
    this.exciteTarget = 0;
    this.flash = 0;
  }

  setSpray(on, ballPos, wallA, wallB) {
    const u = this.pitchUniforms;
    u.uSpray.value = on ? 1 : 0;
    if (ballPos) u.uSprayBall.value.set(ballPos.x, ballPos.z);
    if (wallA) u.uSprayA.value.set(wallA.x, wallA.z);
    if (wallB) u.uSprayB.value.set(wallB.x, wallB.z);
  }

  cheer(level, seconds = 6) {
    this.exciteTarget = level;
    this.cheerTimer = seconds;
    if (level > 0.8) { this.flash = 1; this.boards.celebrate(seconds); }
  }

  update(dt, t, pxScale) {
    this.cheerTimer = Math.max(0, (this.cheerTimer || 0) - dt);
    if (this.cheerTimer <= 0) this.exciteTarget = 0.08;
    this.excite += (this.exciteTarget - this.excite) * Math.min(1, dt * (this.exciteTarget > this.excite ? 6 : 0.8));
    this.flash = Math.max(0, this.flash - dt * 0.18);
    this.crowd.update(dt, t, this.excite, this.flash, pxScale);
    this.boards.update(dt, t);
    for (const f of this.flags) f.userData.uniforms.uTime.value = t;
    this.bannerUniforms.uTime.value = t;
  }
}
