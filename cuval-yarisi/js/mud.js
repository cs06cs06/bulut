// Pistteki çamur birikintileri: ıslak, gökyüzünü yansıtan yüzey; basılınca halka halka dalgalanır.
// Oyun kuralı (racer.js): çamura inen yarışmacı bir sonraki zıplayışı MÜKEMMEL değilse yavaşlar
// ve dengesi bozulur. Her kulvara iki birikinti düşer, böylece kimse şanslı ya da şanssız olmaz.
import * as THREE from 'three';
import { TRACK } from './config.js';

const HALF = (TRACK.lanes * TRACK.laneWidth) / 2;
const MAX_RIPPLES = 8;

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const VERT_HEAD = /* glsl */`
attribute float aEdge; attribute vec2 aCenter;
varying float vEdge; varying vec2 vWXZ; varying vec2 vCenter;
`;
const FRAG_HEAD = /* glsl */`
uniform float uTime; uniform vec3 uRip[${MAX_RIPPLES}];
varying float vEdge; varying vec2 vWXZ; varying vec2 vCenter;
float mh(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float mn(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x), mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y); }
float mudH(vec2 p){
  float h = mn(p * 9.0) * 0.5 + mn(p * 23.0) * 0.25;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec3 r = uRip[i]; float age = uTime - r.z;
    if (age < 0.0 || age > 2.2) continue;
    float d = distance(p, r.xy), front = age * 0.9;
    h += sin((d - front) * 38.0) * exp(-abs(d - front) * 9.0) * (1.0 - age / 2.2) * 1.6;
  }
  return h;
}
`;
const FRAG_COLOR = /* glsl */`
{
  float edgeN = vEdge + (mn(vWXZ * 5.0) - 0.5) * 0.35;
  float wet = 1.0 - smoothstep(0.55, 0.85, edgeN);      // ortası su birikintisi, kenarı koyu ıslak çamur
  vec3 mud = mix(vec3(0.2, 0.13, 0.07), vec3(0.3, 0.2, 0.11), mn(vWXZ * 3.0));
  vec3 water = vec3(0.12, 0.08, 0.045);
  diffuseColor.rgb = mix(mud, water, wet * 0.85);
  diffuseColor.a = 1.0 - smoothstep(0.82, 1.02, edgeN);
}
`;
const FRAG_ROUGH = /* glsl */`
{
  float edgeN = vEdge + (mn(vWXZ * 5.0) - 0.5) * 0.35;
  roughnessFactor = mix(0.1, 0.6, smoothstep(0.45, 0.9, edgeN));
}
`;
const FRAG_BUMP = /* glsl */`
{
  float H = mudH(vWXZ) * 0.004;
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float hx = dFdx(H), hy = dFdy(H);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;

export class MudField {
  constructor(scene, seed = 31) {
    const rand = mulberry(seed);
    this.puddles = [];
    // her kulvara iki birikinti: biri ilk yarıda, biri ikinci yarıda
    for (let lane = 0; lane < TRACK.lanes; lane++) {
      const cx = -HALF + TRACK.laneWidth * (lane + 0.5);
      for (const [z0, z1] of [[9, 23], [27, 43]]) {
        const z = z0 + rand() * (z1 - z0);
        this.puddles.push({ x: cx + (rand() - 0.5) * 0.4, z, rx: 0.55 + rand() * 0.2, rz: 0.55 + rand() * 0.35, rot: (rand() - 0.5) * 0.8, seed: rand() * 10 });
      }
    }
    // geometri: düzensiz kenarlı elips diskler
    const pos = [], edge = [], cen = [], idx = [];
    const SEG = 40, RINGS = 4;
    for (const p of this.puddles) {
      const base = pos.length / 3;
      pos.push(p.x, 0.014, -p.z); edge.push(0); cen.push(p.x, -p.z);
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      for (let r = 1; r <= RINGS; r++) {
        const f = r / RINGS;
        for (let i = 0; i < SEG; i++) {
          const a = (i / SEG) * Math.PI * 2;
          const wob = 1 + Math.sin(a * 3 + p.seed) * 0.16 + Math.sin(a * 7 + p.seed * 2) * 0.08;
          const lx = Math.cos(a) * p.rx * wob * f * 1.12, lz = Math.sin(a) * p.rz * wob * f * 1.12;
          pos.push(p.x + lx * c - lz * s, 0.014, -p.z + lx * s + lz * c);
          edge.push(f); cen.push(p.x, -p.z);
        }
      }
      for (let i = 0; i < SEG; i++) idx.push(base, base + 1 + ((i + 1) % SEG), base + 1 + i);
      for (let r = 1; r < RINGS; r++) {
        const a0 = base + 1 + (r - 1) * SEG, b0 = base + 1 + r * SEG;
        for (let i = 0; i < SEG; i++) {
          const i1 = (i + 1) % SEG;
          idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setAttribute('aCenter', new THREE.Float32BufferAttribute(cen, 2));
    g.setIndex(idx);
    this.U = { uTime: { value: 0 }, uRip: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3(0, 0, -99)) } };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0, envMapIntensity: 0.55, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge; vCenter = aCenter; vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_COLOR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_BUMP);
    };
    mat.customProgramCacheKey = () => 'mud-v2';
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.rip = 0;
  }

  // yarışmacının (x, z ilerlemesi) altındaki birikinti
  at(x, z) {
    for (const p of this.puddles) {
      const dx = x - p.x, dz = z - p.z, c = Math.cos(p.rot), s = Math.sin(p.rot);
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      if ((lx / p.rx) ** 2 + (lz / p.rz) ** 2 < 1) return p;
    }
    return null;
  }

  ripple(x, z) {
    this.U.uRip.value[this.rip].set(x, -z, this.U.uTime.value);
    this.rip = (this.rip + 1) % MAX_RIPPLES;
  }

  update(dt) { this.U.uTime.value += dt; }
}
