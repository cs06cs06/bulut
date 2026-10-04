import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_SCALE } from './layout.js';

// Loaded glTF library with material fix-ups and instancing helpers.
export class ModelLibrary {
  constructor() { this.gltf = {}; this.foliageMaterials = []; this.windUniform = { value: 0 }; }

  add(name, gltf) {
    this.gltf[name] = gltf;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) this._fixMaterial(name, m);
    });
  }

  _fixMaterial(name, m) {
    if (m.userData.fixed) return;
    m.userData.fixed = true;
    if (m.map) { m.map.anisotropy = 4; }
    const foliage = m.map && (m.transparent || m.alphaTest > 0 || /leaf|leaves|grass|flower|fern|bush|petal|clover|pine/i.test(m.name + ' ' + (m.map.name || '')));
    if (foliage) {
      m.transparent = false;
      m.alphaTest = 0.45;
      m.side = THREE.DoubleSide;
      m.alphaToCoverage = true;
      m.roughness = 0.85; m.metalness = 0;
      this._addWind(m, /grass|flower|fern|clover|petal/i.test(name) ? 1.0 : 0.35);
    } else {
      m.roughness = Math.max(m.roughness ?? 0.8, 0.6);
      m.metalness = Math.min(m.metalness ?? 0, 0.2);
    }
    if (/^cow|^bull|^horse|^donkey|^alpaca|^deer/.test(name)) { m.roughness = 0.9; }
  }

  // vertex sway (height-weighted), shared uniform drives all foliage
  _addWind(m, strength) {
    const wind = this.windUniform;
    m.onBeforeCompile = (s) => {
      s.uniforms.uWindTime = wind;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #endif
          float h = max(0.0, transformed.y);
          float ph = wp.x * 0.07 + wp.z * 0.05;
          float sway = (sin(uWindTime * 1.7 + ph) * 0.6 + sin(uWindTime * 3.1 + ph * 2.3) * 0.25) * ${strength.toFixed(2)};
          transformed.x += sway * h * 0.06;
          transformed.z += sway * h * 0.035;
        }`);
    };
    m.customProgramCacheKey = () => 'wind' + strength;
    this.foliageMaterials.push(m);
  }

  scaleOf(name) { return MODEL_SCALE[name] ?? 1; }

  // Plain clone (shares geometry & materials)
  clone(name, scaleMul = 1) {
    const g = this.gltf[name];
    if (!g) throw new Error('model not loaded: ' + name);
    const o = g.animations.length ? skeletonClone(g.scene) : g.scene.clone(true);
    o.scale.setScalar(this.scaleOf(name) * scaleMul);
    o.name = name;
    return o;
  }

  // Bounding box in model space at final scale
  bounds(name, scaleMul = 1) {
    const key = name + '@' + scaleMul;
    this._b = this._b || {};
    if (!this._b[key]) {
      const o = this.clone(name, scaleMul);
      o.updateMatrixWorld(true);
      this._b[key] = new THREE.Box3().setFromObject(o);
    }
    return this._b[key];
  }

  // List of {geometry, material, matrix} parts relative to the model root (scale applied)
  parts(name) {
    this._parts = this._parts || {};
    if (this._parts[name]) return this._parts[name];
    const root = this.gltf[name].scene;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const s = new THREE.Matrix4().makeScale(this.scaleOf(name), this.scaleOf(name), this.scaleOf(name));
    const out = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).premultiply(s);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.length === 1) out.push({ geometry: o.geometry, material: mats[0], matrix: m });
      else for (const g of o.geometry.groups) {
        const sub = o.geometry.clone(); sub.clearGroups(); sub.setDrawRange(g.start, g.count);
        out.push({ geometry: sub, material: mats[g.materialIndex], matrix: m });
      }
    });
    this._parts[name] = out;
    return out;
  }
}

// Builds InstancedMeshes for a model from a list of world matrices, split in spatial cells.
export function buildInstances(lib, name, matrices, { cell = 550, castShadow = true, receiveShadow = true, maxDist = 1400, near = 0, group, onCell } = {}) {
  const parts = lib.parts(name);
  const cells = new Map();
  const p = new THREE.Vector3();
  for (const m of matrices) {
    p.setFromMatrixPosition(m);
    const k = Math.floor(p.x / cell) + ':' + Math.floor(p.z / cell);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(m);
  }
  const created = [];
  for (const [k, list] of cells) {
    const g = new THREE.Group();
    g.name = `${name}_${k}`;
    g.userData.maxDist = maxDist;
    const [kx, kz] = k.split(':').map(Number);
    const c = new THREE.Vector3((kx + 0.5) * cell, 0, (kz + 0.5) * cell);
    g.userData.center = c;
    if (near) g.userData.near = near;
    if (onCell) for (const m of list) onCell(m, c);
    for (const part of parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      const tmp = new THREE.Matrix4();
      list.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, part.matrix)));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = castShadow; im.receiveShadow = receiveShadow;
      im.computeBoundingSphere();
      g.add(im);
    }
    group.add(g);
    created.push(g);
  }
  return created;
}
