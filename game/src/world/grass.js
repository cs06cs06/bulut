import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';

// Dense ground cover around the player (grass clumps, golden wheat tufts, wild flowers).
// Instances are deterministic per 8 m cell so the field looks stable as you drive.
const CELL = 8;

export class GroundCover {
  constructor({ lib, terrain, scene, quality = 'high' }) {
    this.lib = lib; this.terrain = terrain;
    this.group = new THREE.Group(); this.group.name = 'groundcover';
    scene.add(this.group);
    this.setQuality(quality);
    this.types = [
      { name: 'grass_short', where: 'grass', density: 2.4, scale: [0.45, 0.8], tint: 0xb3c072 },
      { name: 'grass_tall', where: 'grass', density: 0.5, scale: [0.45, 0.75], tint: 0xb3c072 },
      { name: 'grass_wispy', where: 'wheat', density: 1.6, scale: [0.7, 1.0], tint: 0xffe2a0 },
      { name: 'grass_wispy', where: 'edge', density: 0.35, scale: [0.5, 0.8] },
      { name: 'flower_3', where: 'grass', density: 0.12, scale: [0.4, 0.7] },
      { name: 'flower_4', where: 'grass', density: 0.04, scale: [0.4, 0.7] },
      { name: 'fern', where: 'grass', density: 0.08, scale: [0.5, 0.9], tint: 0xa8b880 },
    ];
    this.meshes = this.types.map((t) => this._makeMeshes(t));
    this.center = new THREE.Vector2(1e9, 1e9);
  }

  setQuality(q) {
    this.radius = { low: 40, medium: 60, high: 80, ultra: 110 }[q] ?? 80;
    this.densityMul = { low: 0.45, medium: 0.7, high: 1, ultra: 1.25 }[q] ?? 1;
    this.center = new THREE.Vector2(1e9, 1e9);
  }

  _makeMeshes(t) {
    const parts = this.lib.parts(t.name);
    const cap = Math.ceil(Math.PI * 125 * 125 / (CELL * CELL) * t.density * 1.3 * 1.25);
    return parts.map((p) => {
      let mat = p.material;
      if (t.tint) { mat = p.material.clone(); mat.color = new THREE.Color(t.tint); mat.onBeforeCompile = p.material.onBeforeCompile; mat.customProgramCacheKey = p.material.customProgramCacheKey; }
      const im = new THREE.InstancedMesh(p.geometry, mat, cap);
      im.count = 0; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
      im.userData.local = p.matrix;
      this.group.add(im);
      return im;
    });
  }

  update(pos) {
    if (this.center.distanceTo(new THREE.Vector2(pos.x, pos.z)) < CELL * 1.5) return;
    this.center.set(pos.x, pos.z);
    const R = this.radius, T = this.terrain;
    const c0x = Math.floor((pos.x - R) / CELL), c1x = Math.floor((pos.x + R) / CELL);
    const c0z = Math.floor((pos.z - R) / CELL), c1z = Math.floor((pos.z + R) / CELL);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const tmp = new THREE.Matrix4();
    const counts = this.types.map(() => 0);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const ccx = (cx + 0.5) * CELL, ccz = (cz + 0.5) * CELL;
      const dist = Math.hypot(ccx - pos.x, ccz - pos.z);
      if (dist > R) continue;
      const fade = 1 - Math.max(0, (dist - R * 0.6) / (R * 0.4)) * 0.7;
      const rnd = mulberry32((cx * 73856093) ^ (cz * 19349663));
      const sp = T.splatAt(ccx, ccz);
      if (sp.road > 0.6 || sp.yard > 0.6 || Math.abs(ccx) > T.half - 5 || Math.abs(ccz) > T.half - 5) continue;
      const crop = sp.plowed + sp.green;
      for (let ti = 0; ti < this.types.length; ti++) {
        const t = this.types[ti];
        let w;
        if (t.where === 'grass') w = Math.max(0, 1 - sp.wheat - crop - sp.rock * 0.7 - sp.road - sp.fallow * 0.5);
        else if (t.where === 'wheat') w = sp.wheat;
        else w = Math.max(0, 0.6 - Math.abs(sp.wheat - 0.5)) + sp.fallow * 0.8;
        const n = Math.floor(t.density * w * fade * this.densityMul * CELL * CELL / 8 + rnd());
        for (let k = 0; k < n; k++) {
          const x = cx * CELL + rnd() * CELL, z = cz * CELL + rnd() * CELL;
          const sp2 = T.splatAt(x, z);
          if (sp2.road > 0.35) continue;
          const sc = t.scale[0] + rnd() * (t.scale[1] - t.scale[0]);
          e.set((rnd() - 0.5) * 0.25, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.25);
          q.setFromEuler(e);
          v.set(x, T.heightAt(x, z) - 0.05, z);
          s.set(sc, sc * (t.where === 'wheat' ? 0.9 + rnd() * 0.3 : 1), sc);
          m.compose(v, q, s);
          const list = this.meshes[ti];
          const i = counts[ti];
          if (i >= list[0].instanceMatrix.count) break;
          for (const im of list) im.setMatrixAt(i, tmp.multiplyMatrices(m, im.userData.local));
          counts[ti]++;
        }
      }
    }
    this.meshes.forEach((list, ti) => list.forEach((im) => { im.count = counts[ti]; im.instanceMatrix.needsUpdate = true; }));
  }
}
