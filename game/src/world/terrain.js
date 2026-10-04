import * as THREE from 'three';
import { createNoise2D, fbm, clamp, smoothstep, lerp } from '../util/noise.js';
import { RoadNetwork, resolveSpiral } from './roads.js';
import { createTerrainMaterial } from './terrainMaterial.js';

// Real elevation data (AWS Terrain Tiles) → playable heightfield.
// Heights are stored relative to BASE so the plains sit near y = 0.
export const BASE_HEIGHT = 740;
const CHUNK = 256;

export class Terrain {
  constructor({ meta, inner, outer, layout, textures, resolution = 2049 }) {
    this.meta = meta;
    this.size = meta.size;
    this.half = meta.size / 2;
    this.G = resolution;                 // final grid samples per side (2049 desktop, 1025 mobile)
    this.cells = this.G - 1;
    this.sp = this.size / this.cells;    // ~1.62 m
    this.noise = createNoise2D(1337);
    this.noiseB = createNoise2D(4242);
    this.layout = layout;
    this.textures = textures;
    this.group = new THREE.Group();
    this.group.name = 'terrain';

    this._decode(inner, outer);
    for (const r of layout.roads) if (r.spiral && !r.points) r.points = resolveSpiral(r.spiral, (x, z) => this.baseHeight(x, z));
    this.roads = new RoadNetwork(layout.roads);
    this.roads.computeProfiles((x, z) => this.baseHeight(x, z));
    this._buildHeights();
    this._buildSplat();
    this.material = createTerrainMaterial(textures, this.splatA, this.splatB, -this.half, this.size);
    this._initChunks();
    this._buildOuter();
  }

  _decode(innerU16, outerU16) {
    const { minHeight: mn, maxHeight: mx } = this.meta;
    const k = (mx - mn) / 65535;
    const n = this.meta.resolution;
    this.src = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) this.src[i] = innerU16[i] * k + mn - BASE_HEIGHT;
    this.srcN = n;
    const m = this.meta.outer.resolution;
    this.outerSrc = new Float32Array(m * m);
    for (let i = 0; i < m * m; i++) this.outerSrc[i] = outerU16[i] * k + mn - BASE_HEIGHT;
  }

  // Bicubic sample of the source DEM (no detail, no roads). Hot path: no closures/allocations.
  baseHeight(x, z) {
    const n = this.srcN, S = this.src, m = n - 1;
    let fx = (x + this.half) / this.size, fz = (z + this.half) / this.size;
    fx = (fx < 0 ? 0 : fx > 1 ? 1 : fx) * m; fz = (fz < 0 ? 0 : fz > 1 ? 1 : fz) * m;
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const x0 = ix > 0 ? ix - 1 : 0, x1 = ix, x2 = ix + 1 > m ? m : ix + 1, x3 = ix + 2 > m ? m : ix + 2;
    const rows = [iz > 0 ? iz - 1 : 0, iz, iz + 1 > m ? m : iz + 1, iz + 2 > m ? m : iz + 2];
    let r0 = 0, r1 = 0, r2 = 0, r3 = 0;
    for (let k = 0; k < 4; k++) {
      const o = rows[k] * n;
      const p0 = S[o + x0], p1 = S[o + x1], p2 = S[o + x2], p3 = S[o + x3];
      const v = p1 + 0.5 * tx * (p2 - p0 + tx * (2 * p0 - 5 * p1 + 4 * p2 - p3 + tx * (3 * (p1 - p2) + p3 - p0)));
      if (k === 0) r0 = v; else if (k === 1) r1 = v; else if (k === 2) r2 = v; else r3 = v;
    }
    return r1 + 0.5 * tz * (r2 - r0 + tz * (2 * r0 - 5 * r1 + 4 * r2 - r3 + tz * (3 * (r1 - r2) + r3 - r0)));
  }

  _buildHeights() {
    const G = this.G, sp = this.sp, half = this.half;
    const H = new Float32Array(G * G);
    const roadW = new Float32Array(G * G); // road influence, reused by splat
    const q = {};
    const flats = this.layout.flatten || [];
    // precompute flatten target heights
    for (const f of flats) f.h = f.height ?? this.baseHeight(f.x, f.z);
    const n = this.noise, nb = this.noiseB;
    for (let j = 0; j < G; j++) {
      const z = j * sp - half;
      for (let i = 0; i < G; i++) {
        const x = i * sp - half;
        let h = this.baseHeight(x, z);
        // flatten zones (farmyards)
        let flatW = 0;
        for (const f of flats) {
          const fdx = x - f.x, fdz = z - f.z;
          if (fdx * fdx + fdz * fdz > (f.r + f.falloff) * (f.r + f.falloff)) continue;
          const d = Math.sqrt(fdx * fdx + fdz * fdz);
          {
            const w = 1 - smoothstep(f.r, f.r + f.falloff, d);
            h = lerp(h, f.h, w); flatW = Math.max(flatW, w);
          }
        }
        // offroad detail: rolling bumps and small ruts
        const bumps = fbm(n, x * 0.03, z * 0.03, 2) * 0.55 + n(x * 0.14 + 31, z * 0.14) * 0.11;
        let detail = bumps;
        // roads carve the slope: flat across, smooth along
        let rw = 0;
        const r = this.roads.query(x, z, q);
        if (r && r.dist < r.halfWidth + 14) {
          const inner = r.halfWidth, outer = r.halfWidth + 6 + Math.min(8, Math.abs(h - r.height) * 1.2);
          rw = 1 - smoothstep(inner, outer, r.dist);
          const bed = r.height - 0.12 + n(x * 0.3, z * 0.3) * 0.05;
          h = lerp(h, bed, rw);
          detail *= 1 - rw * 0.92;
          roadW[j * G + i] = 1 - smoothstep(inner - 1.2, inner + 1.0, r.dist);
        }
        detail *= 1 - flatW * 0.85;
        H[j * G + i] = h + detail;
      }
    }
    this.H = H;
    this.roadW = roadW;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < H.length; i++) { if (H[i] < mn) mn = H[i]; if (H[i] > mx) mx = H[i]; }
    this.minH = mn; this.maxH = mx;
  }

  heightAt(x, z) {
    const G = this.G;
    const fx = clamp((x + this.half) / this.sp, 0, this.cells - 1e-4);
    const fz = clamp((z + this.half) / this.sp, 0, this.cells - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const H = this.H, o = j * G + i;
    // same triangulation as the mesh (diagonal from (i,j) to (i+1,j+1))
    if (tx > tz) return H[o] + (H[o + 1] - H[o]) * tx + (H[o + G + 1] - H[o + 1]) * tz;
    return H[o] + (H[o + G + 1] - H[o + G]) * tx + (H[o + G] - H[o]) * tz;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.sp;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  slopeAt(x, z) { return 1 - this.normalAt(x, z, _n).y; }

  roadWeight(x, z) {
    const i = Math.round((x + this.half) / this.sp), j = Math.round((z + this.half) / this.sp);
    if (i < 0 || j < 0 || i >= this.G || j >= this.G) return 0;
    return this.roadW[j * this.G + i];
  }

  // ---------------------------------------------------------------- fields
  // Voronoi farm fields with warped borders. Returns {type, angle, hue, edge}
  // type: 0 meadow, 1 wheat, 2 green crop, 3 plowed, 4 canola-ish fallow
  fieldAt(x, z, out = {}) {
    const n = this.noiseB;
    const wx = x + n(x * 0.004, z * 0.004) * 70, wz = z + n(x * 0.004 + 50, z * 0.004 - 20) * 70;
    const C = 230;
    const cx = Math.floor(wx / C), cz = Math.floor(wz / C);
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const gx = cx + a, gz = cz + b;
      const hsh = hash2(gx, gz);
      const px = (gx + 0.15 + 0.7 * hsh) * C, pz = (gz + 0.15 + 0.7 * hash2(gz + 17, gx - 9)) * C;
      const ex = wx - px, ez = wz - pz;
      const d = Math.sqrt(ex * ex + ez * ez);
      if (d < d1) { d2 = d1; d1 = d; id = hsh; } else if (d < d2) d2 = d;
    }
    const r = id;
    out.type = r < 0.4 ? 1 : r < 0.62 ? 2 : r < 0.82 ? 3 : r < 0.9 ? 4 : 0;
    out.angle = hash2(Math.floor(r * 9973), 7) * Math.PI;
    out.hue = hash2(Math.floor(r * 7919), 3);
    out.edge = d2 - d1; // distance to border (×2)
    return out;
  }

  _buildSplat() {
    const R = this.G - 1;                // one splat texel per height cell
    const a = new Uint8Array(R * R * 4), b = new Uint8Array(R * R * 4);
    const f = {};
    const farms = this.layout.farmyards || [];
    const nn = this.noise;
    const inv2sp = 1 / (2 * this.sp);
    const fieldRow = [];
    for (let j = 0; j < R; j++) {
      const z = (j + 0.5) / R * this.size - this.half;
      for (let i = 0; i < R; i++) {
        const x = (i + 0.5) / R * this.size - this.half;
        const o = (j * R + i) * 4;
        // texel (i, j) sits on grid sample (i, j) of the height grid
        const G = this.G, H = this.H, gi = i < 1 ? 1 : i > G - 2 ? G - 2 : i, gj = j < 1 ? 1 : j > G - 2 ? G - 2 : j, go = gj * G + gi;
        const ddx = (H[go + 1] - H[go - 1]) * inv2sp, ddz = (H[go + G] - H[go - G]) * inv2sp;
        const slope = 1 - 1 / Math.sqrt(1 + ddx * ddx + ddz * ddz);
        const h = H[go];
        const road = this.roadW[go];
        let rock = smoothstep(0.16, 0.3, slope + nn(x * 0.05, z * 0.05) * 0.06);
        rock = Math.max(rock, smoothstep(300, 345, h) * 0.5);
        // fields vary slowly: evaluate once per 2×2 texel block
        if ((i & 1) === 0 && (j & 1) === 0) this.fieldAt(x + this.size / R * 0.5, z + this.size / R * 0.5, f);
        else if ((i & 1) === 0) { const c = fieldRow[i >> 1]; f.type = c.type; f.angle = c.angle; f.hue = c.hue; f.edge = c.edge; }
        if ((j & 1) === 0) { const c = fieldRow[i >> 1] || (fieldRow[i >> 1] = {}); c.type = f.type; c.angle = f.angle; c.hue = f.hue; c.edge = f.edge; }
        // natural meadow on the butte and steep ground
        let farmable = (1 - smoothstep(0.07, 0.12, slope)) * (1 - smoothstep(95, 130, h));
        let yard = 0;
        for (const y of farms) {
          const dx = x - y.x, dz = z - y.z;
          if (dx * dx + dz * dz > (y.r + 30) * (y.r + 30)) continue;
          const d = Math.sqrt(dx * dx + dz * dz);
          yard = Math.max(yard, 1 - smoothstep(y.r * 0.6, y.r, d + nn(x * 0.08, z * 0.08) * 6));
          farmable *= smoothstep(y.r, y.r + 25, d);
        }
        const border = smoothstep(3, 9, f.edge + nn(x * 0.1, z * 0.1) * 2);
        const crop = farmable * border * (1 - road);
        a[o] = road * 255;
        a[o + 1] = rock * (1 - road) * 255;
        a[o + 2] = (f.type === 1 ? crop : 0) * 255;
        a[o + 3] = (f.type === 3 ? crop : 0) * 255;
        b[o] = (f.type === 2 ? crop : 0) * 255;
        b[o + 1] = f.angle / Math.PI * 255;
        b[o + 2] = Math.max(yard * (1 - road), (f.type === 4 ? crop : 0) * 0.0) * 255;
        b[o + 3] = (f.type === 4 ? crop : 0) * 255;
      }
    }
    const mk = (data) => {
      const t = new THREE.DataTexture(data, R, R, THREE.RGBAFormat);
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4;
      t.needsUpdate = true; return t;
    };
    this.splatA = mk(a);
    this.splatB = mk(b);
    this.splatData = { a, b, R };
  }

  // Splat lookup on CPU (for vegetation placement): returns weights
  splatAt(x, z) {
    const { a, b, R } = this.splatData;
    const i = clamp(Math.floor((x + this.half) / this.size * R), 0, R - 1);
    const j = clamp(Math.floor((z + this.half) / this.size * R), 0, R - 1);
    const o = (j * R + i) * 4;
    return { road: a[o] / 255, rock: a[o + 1] / 255, wheat: a[o + 2] / 255, plowed: a[o + 3] / 255, green: b[o] / 255, angle: b[o + 1] / 255 * Math.PI, yard: b[o + 2] / 255, fallow: b[o + 3] / 255 };
  }

  // ---------------------------------------------------------------- chunks
  _initChunks() {
    const nc = this.cells / CHUNK;
    this.chunks = [];
    for (let cz = 0; cz < nc; cz++) for (let cx = 0; cx < nc; cx++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.lod = -1;
      mesh.name = `chunk_${cx}_${cz}`;
      const c = { cx, cz, mesh, lod: -1, centerX: (cx + 0.5) * CHUNK * this.sp - this.half, centerZ: (cz + 0.5) * CHUNK * this.sp - this.half };
      this.chunks.push(c);
      this.group.add(mesh);
    }
  }

  _chunkGeometry(cx, cz, step) {
    const G = this.G, H = this.H, sp = this.sp, half = this.half;
    const n = CHUNK / step + 1;
    const i0 = cx * CHUNK, j0 = cz * CHUNK;
    const vcount = n * n + 4 * n;
    const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3);
    let minY = Infinity, maxY = -Infinity;
    const hAt = (i, j) => H[clamp(j, 0, G - 1) * G + clamp(i, 0, G - 1)];
    let v = 0;
    const put = (i, j, drop) => {
      const h = hAt(i, j);
      pos[v * 3] = i * sp - half; pos[v * 3 + 1] = h - drop; pos[v * 3 + 2] = j * sp - half;
      const s = Math.max(1, step >> 1);
      const nx = hAt(i - s, j) - hAt(i + s, j), nz = hAt(i, j - s) - hAt(i, j + s), ny = 2 * s * sp;
      const l = Math.hypot(nx, ny, nz);
      nor[v * 3] = nx / l; nor[v * 3 + 1] = ny / l; nor[v * 3 + 2] = nz / l;
      if (h < minY) minY = h; if (h > maxY) maxY = h;
      v++;
    };
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) put(i0 + a * step, j0 + b * step, 0);
    const drop = 1.5 + step * 1.2;
    const skirtStart = v;
    for (let a = 0; a < n; a++) put(i0 + a * step, j0, drop);                 // north
    for (let a = 0; a < n; a++) put(i0 + a * step, j0 + CHUNK, drop);         // south
    for (let b = 0; b < n; b++) put(i0, j0 + b * step, drop);                 // west
    for (let b = 0; b < n; b++) put(i0 + CHUNK, j0 + b * step, drop);         // east
    const idx = [];
    for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) {
      const p = b * n + a;
      idx.push(p, p + n, p + n + 1, p, p + n + 1, p + 1);
    }
    const s0 = skirtStart, s1 = s0 + n, s2 = s1 + n, s3 = s2 + n;
    for (let a = 0; a < n - 1; a++) {
      idx.push(a, a + 1, s0 + a + 1, a, s0 + a + 1, s0 + a);                                  // north
      const t = (n - 1) * n + a;
      idx.push(t, s1 + a + 1, t + 1, t, s1 + a, s1 + a + 1);                                  // south
      const w = a * n;
      idx.push(w, s2 + a, s2 + a + 1, w, s2 + a + 1, w + n);                                  // west
      const e = a * n + n - 1;
      idx.push(e, e + n, s3 + a + 1, e, s3 + a + 1, s3 + a);                                  // east
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    const x0 = i0 * sp - half, z0 = j0 * sp - half, w = CHUNK * sp;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, minY - drop, z0), new THREE.Vector3(x0 + w, maxY, z0 + w));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    return g;
  }

  // LOD update; force = rebuild everything synchronously (initial load)
  update(camPos, force = false) {
    let budget = force ? 1e9 : 3;
    // nearest chunks first
    const list = this.chunks;
    for (const c of list) c._d = Math.hypot(camPos.x - c.centerX, camPos.z - c.centerZ);
    if (!force) list.sort((a, b) => a._d - b._d);
    for (const c of list) {
      const d = Math.max(0, c._d - CHUNK * this.sp * 0.5);
      const lod = d < 110 ? 1 : d < 330 ? 2 : d < 800 ? 4 : d < 1500 ? 8 : 16;
      if (lod !== c.lod && budget > 0) {
        const old = c.mesh.geometry;
        c.mesh.geometry = this._chunkGeometry(c.cx, c.cz, lod);
        old.dispose();
        c.lod = lod;
        budget--;
      }
    }
  }

  // Low-res terrain for the horizon (whole 6.6 km DEM)
  _buildOuter() {
    const o = this.meta.outer, m = o.resolution;
    const g = new THREE.PlaneGeometry(o.size, o.size, m - 1, m - 1);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const cxw = -o.offsetX, czw = -o.offsetZ;
    for (let k = 0; k < p.count; k++) {
      const i = k % m, j = Math.floor(k / m);
      let h = this.outerSrc[j * m + i];
      const x = p.getX(k) + cxw, z = p.getZ(k) + czw;
      if (Math.abs(x) < this.half - 4 && Math.abs(z) < this.half - 4) h -= 12;
      p.setXYZ(k, x, h, z);
    }
    g.computeVertexNormals();
    const mat = createTerrainMaterial(this.textures, this.splatA, this.splatB, -this.half, this.size, true);
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = false;
    mesh.name = 'terrain_outer';
    this.outerMesh = mesh;
    this.outerMaterial = mat;
    this.group.add(mesh);
  }

  setWet(w) { this.material.userData.uniforms.uWet.value = w; this.outerMaterial.userData.uniforms.uWet.value = w * 0.8; }

  setTime(t) { this.material.userData.uniforms.uTime.value = t; this.outerMaterial.userData.uniforms.uTime.value = t; }

  // Rapier heightfield (column-major: index = xi * G + zi)
  createCollider(RAPIER, world) {
    const G = this.G;
    const hf = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) hf[i * G + j] = this.H[j * G + i];
    const desc = RAPIER.ColliderDesc.heightfield(G - 1, G - 1, hf, { x: this.size, y: 1, z: this.size })
      .setFriction(1.0).setRestitution(0.05);
    this.collider = world.createCollider(desc);
    this.collider.userData = { kind: 'terrain' };
    return this.collider;
  }
}

const _n = new THREE.Vector3();
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
