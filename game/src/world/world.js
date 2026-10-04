import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildInstances } from './models.js';
import { bakeImpostorAtlas, ImpostorField } from './impostors.js';
import { createNoise2D, fbm, mulberry32, smoothstep } from '../util/noise.js';
import { FARMS, FARM_BUILDINGS, PADDOCKS, POIS, POI_PROPS, HERDS } from './layout.js';
import { Animal } from '../game/animals.js';

const DEG = Math.PI / 180;
const _rq = {};
const DYNAMIC_PROPS = new Set(['haybale', 'barrel', 'hay_cube', 'crate_pumpkin']);

// Populates the terrain with farms, fences, vegetation, physics props and animals.
export class World {
  constructor({ scene, terrain, lib, RAPIER, physics, renderer, sunDir, density = 1 }) {
    this.density = density;
    this.renderer = renderer; this.sunDir = sunDir;
    this.scene = scene; this.terrain = terrain; this.lib = lib; this.R = RAPIER; this.physics = physics;
    this.root = new THREE.Group(); this.root.name = 'world'; scene.add(this.root);
    this.static = new THREE.Group(); this.static.name = 'static'; this.root.add(this.static);
    this.veg = new THREE.Group(); this.veg.name = 'vegetation'; this.root.add(this.veg);
    this.cells = [];
    this.dynamic = [];   // {mesh, body}
    this.animals = [];
    this.spinners = [];  // windmill blades
    this.treePoints = []; // for ambience
    this.noise = createNoise2D(99);
    this.rand = mulberry32(2024);
  }

  build() {
    this._farms();
    this._paddocks();
    this._poiProps();
    this._vegetation();
    this._herds();
    this._bounds();
  }

  // ------------------------------------------------------------ helpers
  groundY(x, z, footprint = 0) {
    const t = this.terrain;
    if (footprint <= 0) return t.heightAt(x, z);
    let mn = Infinity;
    for (const [dx, dz] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) mn = Math.min(mn, t.heightAt(x + dx * footprint, z + dz * footprint));
    return mn;
  }

  _boxCollider(name, x, y, z, rotY, scaleMul = 1, friction = 0.7) {
    const b = this.lib.bounds(name, scaleMul);
    const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const off = c.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const desc = this.R.ColliderDesc.cuboid(Math.max(0.1, size.x / 2), Math.max(0.1, size.y / 2), Math.max(0.1, size.z / 2))
      .setTranslation(x + off.x, y + c.y, z + off.z).setRotation(q).setFriction(friction);
    const col = this.physics.createCollider(desc);
    col.userData = { kind: 'building', model: name };
    return col;
  }

  // Merge many static clones into one mesh per material (draw-call friendly)
  _mergeStatic(objects, name) {
    const byMat = new Map();
    const keep = new THREE.Group(); keep.name = name;
    for (const o of objects) {
      o.updateMatrixWorld(true);
      o.traverse((m) => {
        if (!m.isMesh || m.isSkinnedMesh || m.userData.keep) return;
        if (Array.isArray(m.material)) return;
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        if (g.attributes.color) g.deleteAttribute('color');
        const ng = g.index ? g.toNonIndexed() : g;
        const key = m.material.uuid;
        if (!byMat.has(key)) byMat.set(key, { material: m.material, geos: [] });
        byMat.get(key).geos.push(ng);
      });
    }
    for (const { material, geos } of byMat.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      keep.add(mesh);
    }
    this.static.add(keep);
    return keep;
  }

  // Place a single model; returns {object, collider}
  place(name, x, z, rotDeg = 0, scaleMul = 1, opts = {}) {
    const rot = rotDeg * DEG;
    const b = this.lib.bounds(name, scaleMul);
    const fp = Math.min(6, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.35);
    const y = (opts.y ?? this.groundY(x, z, fp)) + (opts.lift || 0);
    if (DYNAMIC_PROPS.has(name) && opts.dynamic !== false) return this._dynamicProp(name, x, y, z, rot, scaleMul);
    const o = this.lib.clone(name, scaleMul);
    o.position.set(x, y - 0.05, z);
    o.rotation.y = rot;
    if (opts.collider !== false) this._boxCollider(name, x, y, z, rot, scaleMul);
    return { object: o };
  }

  _dynamicProp(name, x, y, z, rot, scaleMul) {
    const o = this.lib.clone(name, scaleMul);
    const b = this.lib.bounds(name, scaleMul);
    const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const body = this.physics.createRigidBody(this.R.RigidBodyDesc.dynamic().setTranslation(x, y + 0.02, z).setRotation(q)
      .setLinearDamping(0.3).setAngularDamping(0.5).setCanSleep(true));
    const volume = size.x * size.y * size.z;
    const density = name === 'barrel' ? 120 : name === 'crate_pumpkin' ? 160 : 140;
    const desc = name === 'barrel'
      ? this.R.ColliderDesc.cylinder(size.y / 2, Math.min(size.x, size.z) / 2).setTranslation(c.x, c.y, c.z)
      : this.R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(c.x, c.y, c.z);
    desc.setDensity(density).setFriction(0.8).setRestitution(0.1);
    const col = this.physics.createCollider(desc, body);
    col.userData = { kind: 'prop', model: name, mass: volume * density };
    body.sleep();
    o.position.set(x, y, z); o.quaternion.copy(q);
    o.traverse((m) => { if (m.isMesh) m.userData.keep = true; });
    this.root.add(o);
    this.dynamic.push({ mesh: o, body });
    return { object: o, body };
  }

  // ------------------------------------------------------------ farms
  _farms() {
    for (const f of FARMS) {
      const objs = [];
      const rot = f.rot * DEG;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const toWorld = (lx, lz) => [f.x + lx * cos + lz * sin, f.z - lx * sin + lz * cos];
      for (const [model, lx, lz, r = 0, s = 1, lift = 0] of FARM_BUILDINGS[f.id] || []) {
        const [x, z] = toWorld(lx, lz);
        const res = this.place(model, x, z, r + f.rot, s, { lift: lift ? this.lib.bounds(model, s).max.y * lift * 0.9 : 0 });
        if (res.object && !res.body) {
          if (model === 'windmill') this._registerSpinner(res.object);
          objs.push(res.object);
        }
      }
      // windbreak: a row of trees north of each farm (very Palouse)
      const wb = [];
      for (let i = -4; i <= 4; i++) {
        const [x, z] = toWorld(i * 9 + (this.rand() - 0.5) * 3, -f.r - 10 + (this.rand() - 0.5) * 3);
        wb.push(this._treeMatrix(i % 3 === 0 ? 'pine_1' : 'tree_' + (1 + (Math.abs(i) % 4)), x, z, 1 + this.rand() * 0.3));
      }
      this._windbreak = (this._windbreak || []).concat(wb);
      const merged = this._mergeStatic(objs.filter(o => !o.userData.spinner), 'farm_' + f.id);
      merged.userData.center = new THREE.Vector3(f.x, 0, f.z);
      merged.userData.maxDist = 2200;
      this.cells.push(merged);
      for (const o of objs.filter(o => o.userData.spinner)) this.static.add(o);
    }
  }

  _registerSpinner(obj) {
    obj.userData.spinner = true;
    let blades = null;
    obj.traverse((o) => { if (!blades && /blade|fan|wheel|rotor/i.test(o.name)) blades = o; });
    if (blades) this.spinners.push({ node: blades, speed: 0.8 + this.rand() * 0.8 });
  }

  // Fence segments are individual fixed bodies drawn with instancing; a hard hit turns one dynamic.
  _fenceLine(model, x0, z0, x1, z1) {
    const b = this.lib.bounds(model);
    const seg = (b.max.x - b.min.x) * 0.98;            // fence models run along local X
    const cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / seg));
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    const sc = this.lib.scaleOf(model), stretch = len / n / seg;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const ha = this.terrain.heightAt(x0 + (x1 - x0) * (i / n), z0 + (z1 - z0) * (i / n));
      const hb = this.terrain.heightAt(x0 + (x1 - x0) * ((i + 1) / n), z0 + (z1 - z0) * ((i + 1) / n));
      const o = new THREE.Object3D();
      o.scale.set(sc * stretch, sc, sc);
      o.rotation.y = ang;
      o.rotateZ(Math.atan2(hb - ha, len / n));
      // centre the model's bounding box on the segment midpoint
      const off = new THREE.Vector3(-cx * stretch, 0, -cz).applyQuaternion(o.quaternion);
      o.position.set(x + off.x, (ha + hb) / 2 - 0.08 + off.y, z + off.z);
      o.updateMatrix();
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const by = (ha + hb) / 2 + 0.6;
      const body = this.physics.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(x, by, z).setRotation(q));
      const col = this.physics.createCollider(this.R.ColliderDesc.cuboid(len / n / 2, 0.6, 0.12).setFriction(0.5).setDensity(22), body);
      const bodyMat = new THREE.Matrix4().compose(new THREE.Vector3(x, by, z), q, new THREE.Vector3(1, 1, 1));
      const segm = { model, body, local: bodyMat.invert().multiply(o.matrix), broken: false, index: -1 };
      col.userData = { kind: 'fence', seg: segm };
      (this.fenceSegs = this.fenceSegs || []).push(segm);
    }
  }

  _buildFences() {
    this.fenceMeshes = {};
    const g = new THREE.Group(); g.name = 'fences';
    const byModel = {};
    for (const sg of this.fenceSegs || []) (byModel[sg.model] = byModel[sg.model] || []).push(sg);
    const m = new THREE.Matrix4(), tmp = new THREE.Matrix4();
    for (const [model, segs] of Object.entries(byModel)) {
      const sc = this.lib.scaleOf(model);
      const unscale = new THREE.Matrix4().makeScale(1 / sc, 1 / sc, 1 / sc);
      const meshes = this.lib.parts(model).map((part) => {
        const im = new THREE.InstancedMesh(part.geometry, part.material, segs.length);
        im.userData.raw = unscale.clone().multiply(part.matrix);
        im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
        g.add(im);
        return im;
      });
      segs.forEach((sg, i) => {
        sg.index = i;
        const t = sg.body.translation(), r = sg.body.rotation();
        m.compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion(r.x, r.y, r.z, r.w), new THREE.Vector3(1, 1, 1)).multiply(sg.local);
        for (const im of meshes) im.setMatrixAt(i, tmp.multiplyMatrices(m, im.userData.raw));
      });
      for (const im of meshes) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
      this.fenceMeshes[model] = meshes;
    }
    this.root.add(g);
    this.brokenFences = [];
  }

  breakFence(seg, vel) {
    if (!seg || seg.broken) return false;
    seg.broken = true;
    seg.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    seg.body.setLinearDamping(0.4); seg.body.setAngularDamping(0.6);
    const mass = seg.body.mass();
    seg.body.applyImpulse({ x: vel.x * mass * 0.7, y: mass * 2.5, z: vel.z * mass * 0.7 }, true);
    seg.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * mass * 3, y: (Math.random() - 0.5) * mass * 2, z: (Math.random() - 0.5) * mass * 3 }, true);
    this.brokenFences.push(seg);
    return true;
  }

  _paddocks() {
    this.paddocks = [];
    for (const p of PADDOCKS) {
      const f = FARMS.find(ff => ff.id === p.farm);
      const rot = f.rot * DEG, cos = Math.cos(rot), sin = Math.sin(rot);
      const toWorld = (lx, lz) => [f.x + lx * cos + lz * sin, f.z - lx * sin + lz * cos];
      const hw = p.w / 2, hd = p.d / 2;
      const c = [toWorld(p.x - hw, p.z - hd), toWorld(p.x + hw, p.z - hd), toWorld(p.x + hw, p.z + hd), toWorld(p.x - hw, p.z + hd)];
      for (let i = 0; i < 4; i++) {
        const a = c[i], b = c[(i + 1) % 4];
        if (i === 2 && p.w > 30) {
          // leave a gate gap on the far side so you can drive in
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const dir = [(b[0] - a[0]) / p.w, (b[1] - a[1]) / p.w];
          this._fenceLine(p.fence, a[0], a[1], mid[0] - dir[0] * 5, mid[1] - dir[1] * 5);
          this._fenceLine(p.fence, mid[0] + dir[0] * 5, mid[1] + dir[1] * 5, b[0], b[1]);
        } else this._fenceLine(p.fence, a[0], a[1], b[0], b[1]);
      }
      const center = toWorld(p.x, p.z);
      const area = { cx: center[0], cz: center[1], hw: hw - 3, hd: hd - 3, rot };
      this.paddocks.push(area);
      for (const [model, n] of p.animals) for (let i = 0; i < n; i++) this._spawnAnimal(model, area, false);
    }
    this._buildFences();
  }

  _spawnAnimal(model, area, wild) {
    const a = new Animal({ lib: this.lib, model, area, terrain: this.terrain, rand: this.rand, wild, onScare: () => this.onAnimalScared?.() });
    this.root.add(a.object);
    this.animals.push(a);
  }

  _herds() {
    for (const h of HERDS) {
      const area = { cx: h.x, cz: h.z, hw: 70, hd: 70, rot: 0 };
      for (let i = 0; i < h.n; i++) this._spawnAnimal(h.model, area, true);
    }
  }

  _poiProps() {
    const objs = [];
    for (const [id, model, dx, dz, rot, s = 1, lift = 0] of POI_PROPS) {
      const p = POIS.find(pp => pp.id === id);
      const res = this.place(model, p.x + dx, p.z + dz, rot, s, { lift: lift ? this.lib.bounds(model, s).max.y * 0.9 : 0, collider: model !== 'pond' });
      if (res.object && !res.body) {
        if (model === 'windmill') { this._registerSpinner(res.object); this.static.add(res.object); }
        else objs.push(res.object);
      }
    }
    const m = this._mergeStatic(objs, 'poi_props');
    m.userData.maxDist = 99999;
    // dead trees + rocks around the forgotten tractor
    const t = POIS.find(p => p.id === 'tractor');
    this._extraTrees = [this._treeMatrix('dead_1', t.x + 9, t.z - 6, 1), this._treeMatrix('dead_2', t.x - 12, t.z + 3, 0.9)];
  }

  // ------------------------------------------------------------ vegetation
  _treeMatrix(name, x, z, s, tilt = 0.04) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((this.rand() - 0.5) * tilt, this.rand() * Math.PI * 2, (this.rand() - 0.5) * tilt));
    m.compose(new THREE.Vector3(x, this.terrain.heightAt(x, z) - 0.15, z), q, new THREE.Vector3(s, s, s));
    m.userData = { name };
    return m;
  }

  _vegetation() {
    const T = this.terrain, half = T.half - 30;
    const n = this.noise;
    const lists = {};
    const push = (name, m) => { (lists[name] = lists[name] || []).push(m); };
    for (const m of [...(this._windbreak || []), ...(this._extraTrees || [])]) push(m.userData.name, m);
    const inPaddock = (x, z) => (this.paddocks || []).some((a) => {
      const dx = x - a.cx, dz = z - a.cz, c = Math.cos(a.rot), s = Math.sin(a.rot);
      return Math.abs(dx * c - dz * s) < a.hw + 8 && Math.abs(dx * s + dz * c) < a.hd + 8;
    });
    const farAway = (x, z, extra = 0) => FARMS.every(f => Math.hypot(x - f.x, z - f.z) > f.r + 12 + extra) && POIS.every(p => Math.hypot(x - p.x, z - p.z) > 14) && !inPaddock(x, z);
    const trees = ['tree_1', 'tree_2', 'tree_3', 'tree_4', 'tree_5'];
    const colliders = [];

    // trees: jittered grid, density from groves + valley moisture + elevation
    const step = 13 / Math.sqrt(this.density);
    for (let gz = -half; gz < half; gz += step) for (let gx = -half; gx < half; gx += step) {
      const x = gx + (this.rand() - 0.5) * step, z = gz + (this.rand() - 0.5) * step;
      const s = T.splatAt(x, z);
      if (s.road > 0.05 || s.yard > 0.1) continue;
      // keep trunks a few metres clear of the road edge
      const rq = T.roads.query(x, z, _rq);
      if (rq && rq.dist < rq.halfWidth + 4) continue;
      const crop = s.wheat + s.plowed + s.green + s.fallow;
      const h = T.heightAt(x, z);
      const slope = T.slopeAt(x, z);
      const around = (T.heightAt(x + 40, z) + T.heightAt(x - 40, z) + T.heightAt(x, z + 40) + T.heightAt(x, z - 40)) / 4;
      const valley = smoothstep(0.5, 4, around - h);
      const grove = smoothstep(0.32, 0.62, fbm(n, x * 0.0035, z * 0.0035, 3) * 0.5 + 0.5);
      let d = grove * 0.55 + valley * 0.45;
      d *= 1 - smoothstep(0.15, 0.5, crop);
      if (h > 210) d = d * 0.3 + 0.03;
      if (slope > 0.35) d *= 0.3;
      if (this.rand() > d * 0.9) continue;
      if (!farAway(x, z)) continue;
      let name;
      const r = this.rand();
      if (h > 170) name = r < 0.7 ? 'pine_' + (1 + Math.floor(this.rand() * 3)) : (r < 0.85 ? 'dead_1' : 'tree_4');
      else if (r < 0.08) name = 'birch_1';
      else if (r < 0.12) name = 'maple_1';
      else if (r < 0.3) name = 'pine_' + (1 + Math.floor(this.rand() * 3));
      else name = trees[Math.floor(this.rand() * trees.length)];
      const sc = 0.85 + this.rand() * 0.55;
      push(name, this._treeMatrix(name, x, z, sc));
      colliders.push([x, z, 0.35 * sc, 4 * sc]);
      this.treePoints.push(x, z);
      // undergrowth
      if (this.rand() < 0.5) {
        const bx = x + (this.rand() - 0.5) * 8, bz = z + (this.rand() - 0.5) * 8;
        push(this.rand() < 0.3 ? 'bush_flowers' : 'bush', this._treeMatrix('bush', bx, bz, 0.8 + this.rand() * 0.8, 0.1));
      }
    }
    // field-edge bushes & rocks
    for (let i = 0; i < 9000 * this.density; i++) {
      const x = (this.rand() * 2 - 1) * half, z = (this.rand() * 2 - 1) * half;
      const s = T.splatAt(x, z);
      if (s.road > 0.05 || s.yard > 0.1 || !farAway(x, z, -6)) continue;
      const crop = s.wheat + s.plowed + s.green + s.fallow;
      if (s.rock > 0.25 && this.rand() < 0.55) {
        const name = 'rock_' + (1 + Math.floor(this.rand() * 3));
        const sc = 0.5 + this.rand() * 1.4 * (1 + s.rock);
        const m = this._treeMatrix(name, x, z, sc, 0.6);
        m.elements[13] -= sc * 0.35;
        push(name, m);
        if (sc > 0.9) colliders.push([x, z, 1.2 * sc, 1.6 * sc, 'rock']);
      } else if (crop < 0.2 && crop > 0.02 && this.rand() < 0.5) {
        push(this.rand() < 0.25 ? 'bush_flowers' : 'bush', this._treeMatrix('bush', x, z, 0.7 + this.rand() * 0.7, 0.1));
      } else if (crop < 0.05 && this.rand() < 0.06) {
        const name = 'rock_' + (1 + Math.floor(this.rand() * 3));
        const sc = 0.3 + this.rand() * 0.6;
        const m = this._treeMatrix(name, x, z, sc, 0.6); m.elements[13] -= sc * 0.3;
        push(name, m);
      }
    }
    // rocky POI cluster
    const rp = POIS.find(p => p.id === 'rocks');
    for (let i = 0; i < 26; i++) {
      const a = this.rand() * Math.PI * 2, r = 6 + this.rand() * 40, sc = 1.2 + this.rand() * 2.5;
      const x = rp.x + Math.cos(a) * r, z = rp.z + Math.sin(a) * r;
      const name = 'rock_' + (1 + (i % 3));
      const m = this._treeMatrix(name, x, z, sc, 0.8); m.elements[13] -= sc * 0.3;
      push(name, m); colliders.push([x, z, 1.2 * sc, 1.6 * sc, 'rock']);
    }
    // grove POI: extra pines and birches
    const gp = POIS.find(p => p.id === 'grove');
    for (let i = 0; i < 40; i++) {
      const a = this.rand() * Math.PI * 2, r = 12 + this.rand() * 70;
      const x = gp.x + Math.cos(a) * r, z = gp.z + Math.sin(a) * r;
      if (T.roadWeight(x, z) > 0.05) continue;
      const name = this.rand() < 0.5 ? 'pine_' + (1 + (i % 3)) : (this.rand() < 0.5 ? 'birch_1' : 'tree_' + (1 + (i % 5)));
      const sc = 0.9 + this.rand() * 0.5;
      push(name, this._treeMatrix(name, x, z, sc)); colliders.push([x, z, 0.35 * sc, 4 * sc]); this.treePoints.push(x, z);
    }

    // near cells: real meshes; everything else: one draw call of baked billboards
    const NEAR = 300, CELL = 150;
    const impNames = Object.keys(lists).filter((n) => !n.startsWith('rock'));
    this.atlas = bakeImpostorAtlas(this.renderer, this.lib, impNames, this.sunDir);
    this.impostors = new ImpostorField(this.atlas, NEAR);
    for (const [name, list] of Object.entries(lists)) {
      const rock = name.startsWith('rock');
      const created = buildInstances(this.lib, name, list, rock ? { group: this.veg, cell: 300, maxDist: 700 } : {
        group: this.veg, cell: CELL, near: NEAR, onCell: (m, c) => this.impostors.add(name, m, c),
      });
      this.cells.push(...created);
    }
    this.veg.add(this.impostors.build());
    // physics: trunks and rocks
    for (const [x, z, r, h, kind] of colliders) {
      const y = T.heightAt(x, z);
      const desc = kind === 'rock' ? this.R.ColliderDesc.ball(r).setTranslation(x, y + r * 0.2, z) : this.R.ColliderDesc.cylinder(h / 2, r).setTranslation(x, y + h / 2, z);
      const col = this.physics.createCollider(desc.setFriction(0.6));
      col.userData = { kind: kind || 'tree' };
    }
    this.vegCounts = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length]));
  }

  // invisible walls at the edge of the playable map
  _bounds() {
    const h = this.terrain.half - 15;
    for (const [x, z, hx, hz] of [[h, 0, 2, h], [-h, 0, 2, h], [0, h, h, 2], [0, -h, h, 2]]) {
      this.physics.createCollider(this.R.ColliderDesc.cuboid(hx, 400, hz).setTranslation(x, 200, z));
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt, time, playerPos, vehicleSpeed, audio) {
    for (const s of this.spinners) s.node.rotation.z += dt * s.speed * 2.2;
    if (this.brokenFences?.length) {
      const m = new THREE.Matrix4(), tmp = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
      for (const sg of this.brokenFences) {
        if (sg.body.isSleeping()) continue;
        const t = sg.body.translation(), r = sg.body.rotation();
        m.compose(v.set(t.x, t.y, t.z), q.set(r.x, r.y, r.z, r.w), one).multiply(sg.local);
        for (const im of this.fenceMeshes[sg.model]) { im.setMatrixAt(sg.index, tmp.multiplyMatrices(m, im.userData.raw)); im.instanceMatrix.needsUpdate = true; }
      }
    }
    for (const d of this.dynamic) {
      if (d.body.isSleeping()) continue;
      const t = d.body.translation(), r = d.body.rotation();
      d.mesh.position.set(t.x, t.y, t.z); d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const a of this.animals) a.update(dt, playerPos, vehicleSpeed, audio);
    this.impostors?.update(playerPos);
    // distance culling of cells
    if (!this._cullT || time - this._cullT > 0.25) {
      this._cullT = time;
      for (const c of this.cells) {
        const ctr = c.userData.center;
        if (!ctr) continue;
        const d = Math.hypot(playerPos.x - ctr.x, playerPos.z - ctr.z);
        c.visible = c.userData.near ? d < c.userData.near : d < (c.userData.maxDist || 1500) + 300;
      }
    }
  }

  setQuality(q) {
    const near = { low: 170, medium: 230, high: 300, ultra: 420 }[q] ?? 300;
    for (const c of this.cells) if (c.userData.near) c.userData.near = near;
    if (this.impostors) this.impostors.material.uniforms.uNear.value = near;
    this._cullT = 0;
  }

  nearTrees(x, z) {
    let n = 0;
    const p = this.treePoints;
    for (let i = 0; i < p.length; i += 2) { const dx = p[i] - x, dz = p[i + 1] - z; if (dx * dx + dz * dz < 3600) { n++; if (n > 6) break; } }
    return Math.min(1, n / 6);
  }
}
