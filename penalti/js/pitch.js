// Football pitch: PBR turf with mowing stripes, painted markings, wear patches.
import * as THREE from 'three';

export const PITCH = { w: 68, l: 105, halfW: 34, goalW: 7.32, goalH: 2.44, spotZ: 11, boxZ: 16.5, boxHalf: 20.16, sixZ: 5.5, sixHalf: 9.16, arcR: 9.15 };

const TILE = 2.4;           // metres per turf texture tile
const STRIPE = 5.0;         // mowing stripe width (metres)

function noiseGLSL() {
  return /* glsl */`
  float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
  `;
}

export async function loadTurfTextures(renderer) {
  const tl = new THREE.TextureLoader();
  const base = './assets/textures/grass/';
  const [diff, nor, rough, ao] = await Promise.all([
    tl.loadAsync(base + 'grass_diff_2k.jpg'), tl.loadAsync(base + 'grass_nor_2k.jpg'),
    tl.loadAsync(base + 'grass_rough_1k.jpg'), tl.loadAsync(base + 'grass_ao_1k.jpg'),
  ]);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  for (const t of [diff, nor, rough, ao]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; }
  diff.colorSpace = THREE.SRGBColorSpace;
  return { diff, nor, rough, ao };
}

export function createTurfMaterial(tex, { paint = false } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex.diff, normalMap: tex.nor, roughnessMap: tex.rough, aoMap: tex.ao,
    roughness: 1.0, metalness: 0.0, normalScale: new THREE.Vector2(1.1, 1.1), aoMapIntensity: 0.9,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTile = { value: TILE };
    shader.uniforms.uStripe = { value: STRIPE };
    shader.uniforms.uPaint = { value: paint ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; uniform float uTile; uniform float uStripe; uniform float uPaint;\n${noiseGLSL()}`)
      .replace('#include <map_fragment>', `
        vec2 wuv = vWPos.xz / uTile;
        // anti-tiling: blend two rotated / scaled lookups
        vec2 wuv2 = mat2(0.8, -0.6, 0.6, 0.8) * wuv * 0.37 + 0.31;
        vec4 g1 = texture2D(map, wuv), g2 = texture2D(map, wuv2);
        float mixw = smoothstep(0.25, 0.75, vnoise(vWPos.xz * 0.11));
        vec4 texel = mix(g1, g2, mixw * 0.55);
        // mowing stripes (alternate bands along the pitch length) + macro colour variation
        float band = floor(vWPos.z / uStripe);
        float par = mod(band, 2.0);
        float edge = smoothstep(0.0, 0.06, fract(vWPos.z / uStripe)) * (1.0 - smoothstep(0.94, 1.0, fract(vWPos.z / uStripe)));
        float macro = fbm(vWPos.xz * 0.06);
        vec3 tint = vec3(0.70, 0.93, 0.58) * mix(0.86, 1.08, par) * (0.9 + 0.22 * macro);
        // subtle worn patch near penalty spots and goal mouths
        float d1 = length(vWPos.xz - vec2(0.0, 11.0)); float d2 = length(vWPos.xz - vec2(0.0, 105.0 - 11.0));
        float dg = length((vWPos.xz - vec2(0.0, 1.2)) * vec2(0.24, 0.55)); float dg2 = length((vWPos.xz - vec2(0.0, 103.8)) * vec2(0.24, 0.55));
        float wear = max(max(smoothstep(0.85, 0.05, d1), smoothstep(0.85, 0.05, d2)), max(smoothstep(1.0, 0.1, dg), smoothstep(1.0, 0.1, dg2)) * 0.8);
        wear *= 0.55 + 0.45 * vnoise(vWPos.xz * 3.1);
        vec3 dirt = vec3(0.42, 0.34, 0.20);
        vec3 albedo = texel.rgb * tint;
        albedo = mix(albedo, dirt * (0.6 + 0.4 * texel.g), wear * 0.55);
        if (uPaint > 0.5) {
          float lum = dot(texel.rgb, vec3(0.30, 0.59, 0.11));
          albedo = vec3(0.9, 0.92, 0.9) * (0.55 + 0.75 * clamp(lum * 1.4, 0.0, 1.0));
        }
        diffuseColor.rgb *= albedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(0.92, 1.0, par) + 0.02, 0.0, 1.0);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>`);
  };
  return m;
}

/* ------- markings ------- */
function ribbon(points, width, closed = false, y = 0.004) {
  const pos = [], idx = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)], b = points[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz * width / 2, nz = dx * width / 2;
    pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) { const j = (i + 1) % n; idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / TILE, pos[i + 2] / TILE);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const arc = (cx, cz, r, a0, a1, n = 64) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return p; };

export function buildMarkings(paintMat) {
  const g = new THREE.Group();
  const W = 0.12, hw = PITCH.halfW, L = PITCH.l;
  const add = (pts, closed = false, w = W) => { const m = new THREE.Mesh(ribbon(pts, w, closed), paintMat); m.receiveShadow = true; m.renderOrder = 1; g.add(m); };
  add([[-hw, 0], [hw, 0], [hw, L], [-hw, L]], true);
  add([[-hw, L / 2], [hw, L / 2]]);
  add(arc(0, L / 2, PITCH.arcR, 0, Math.PI * 2, 96), true);
  for (const end of [0, 1]) {
    const s = end === 0 ? 1 : -1, z0 = end === 0 ? 0 : L;
    add([[-PITCH.boxHalf, z0], [-PITCH.boxHalf, z0 + s * PITCH.boxZ], [PITCH.boxHalf, z0 + s * PITCH.boxZ], [PITCH.boxHalf, z0]]);
    add([[-PITCH.sixHalf, z0], [-PITCH.sixHalf, z0 + s * PITCH.sixZ], [PITCH.sixHalf, z0 + s * PITCH.sixZ], [PITCH.sixHalf, z0]]);
    // penalty arc (outside the box)
    const sz = z0 + s * PITCH.spotZ;
    const dz = PITCH.boxZ - PITCH.spotZ;
    const a = Math.acos(dz / PITCH.arcR);
    const a0 = s > 0 ? Math.PI / 2 - (Math.PI / 2 - a) * 1 : 0;
    // arc on the field side: angles measured from +z axis toward +x
    const pts = []; const n = 48;
    for (let i = 0; i <= n; i++) { const t = -a + (2 * a) * i / n; pts.push([Math.sin(t) * PITCH.arcR, sz + s * Math.cos(t) * PITCH.arcR]); }
    add(pts);
    // spot
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), paintMat);
    spot.rotation.x = -Math.PI / 2; spot.position.set(0, 0.0045, sz); spot.receiveShadow = true;
    const sg = spot.geometry; const uv = []; const pa = sg.attributes.position; for (let i = 0; i < pa.count; i++) uv.push((pa.getX(i)) / TILE, (sz - pa.getY(i)) / TILE);
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setAttribute('uv1', new THREE.Float32BufferAttribute(uv, 2));
    g.add(spot);
    // corner arcs
    for (const cx of [-hw, hw]) {
      const a0c = cx < 0 ? (s > 0 ? 0 : -Math.PI / 2) : (s > 0 ? Math.PI / 2 : Math.PI);
      add(arc(cx, z0, 1.0, cx < 0 ? (s > 0 ? 0 : -Math.PI / 2) : (s > 0 ? Math.PI / 2 : Math.PI), (cx < 0 ? (s > 0 ? Math.PI / 2 : 0) : (s > 0 ? Math.PI : Math.PI * 1.5)), 16));
    }
  }
  // centre spot
  const cs = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), paintMat);
  cs.rotation.x = -Math.PI / 2; cs.position.set(0, 0.0045, L / 2);
  { const sg = cs.geometry; const uv = []; const pa = sg.attributes.position; for (let i = 0; i < pa.count; i++) uv.push(pa.getX(i) / TILE, (L / 2 - pa.getY(i)) / TILE); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setAttribute('uv1', new THREE.Float32BufferAttribute(uv, 2)); }
  g.add(cs);
  return g;
}

export function buildGround(turfMat) {
  const geo = new THREE.PlaneGeometry(120, 150, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv, pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) / TILE, pa.getZ(i) / TILE);
  geo.setAttribute('uv1', uv.clone());
  const mesh = new THREE.Mesh(geo, turfMat);
  mesh.position.set(0, 0, L_MID);
  mesh.receiveShadow = true;
  // uv must be in world coordinates: recompute with the offset
  for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) / TILE, (pa.getZ(i) + L_MID) / TILE);
  return mesh;
}
const L_MID = PITCH.l / 2;
