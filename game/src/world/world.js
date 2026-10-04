import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildInstances } from './models.js';
import { bakeImpostorAtlas, ImpostorField } from './impostors.js';
import { createNoise2D, fbm, mulberry32, smoothstep } from '../util/noise.js';
import { FARMS, FARM_BUILDINGS, PADDOCKS, POIS, POI_PROPS, HERDS, TOWN, BARNS, TOWERS } from './layout.js';
import { Animal } from '../game/animals.js';

const DEG = Math.PI / 180;
const _up = new THREE.Vector3(0, 1, 0);
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
    this._kickerProps();
    this.blockers = [];
    this._town();
    this._landmarks();
    this._leisure();
    this._powerLines();
    this._turbines();
    this._countryside();
    this._buildFences();
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
    if (name === 'mailbox') (this.mailboxes = this.mailboxes || []).push({ x, z });
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
    if (blades) {
      // spin around the thinnest axis of the blade disc
      const b = new THREE.Box3().setFromObject(blades), sz = b.getSize(new THREE.Vector3());
      const axis = sz.x < sz.z && sz.x < sz.y ? 'x' : 'z';
      this.spinners.push({ node: blades, speed: 0.8 + this.rand() * 0.8, axis });
    }
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

  // hay bales flanking the lip of each dirt kicker
  // Fill the fields: hay bale rows and piles, abandoned sheds, wind pumps, fences along farm roads
  _countryside() {
    const T = this.terrain, R = this.rand, half = T.half - 80, f = {};
    const roadDist = (x, z) => { const q = T.roads.query(x, z, _rq); return q ? q.dist - q.halfWidth : 99; };
    const free = (x, z, r) => FARMS.every((fm) => Math.hypot(x - fm.x, z - fm.z) > fm.r + 20 + r) && POIS.every((p) => Math.hypot(x - p.x, z - p.z) > 25 + r)
      && this.blockers.every((b) => Math.hypot(x - b[0], z - b[1]) > b[2] + r) && T.slopeAt(x, z) < 0.12 && roadDist(x, z) > 12 + r;
    const bales = [], piles = [];
    const baleB = this.lib.bounds('haybale'), bs = baleB.getSize(new THREE.Vector3());
    const mat = (x, z, rot, s) => { const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(x, T.heightAt(x, z) - 0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s)); return m; };
    // hay: rows of square bales on wheat stubble, loose piles on fallow fields
    let clusters = 0;
    for (let tries = 0; tries < 6000 && clusters < Math.round(80 * this.density); tries++) {
      const x = (R() * 2 - 1) * half, z = (R() * 2 - 1) * half;
      T.fieldAt(x, z, f);
      if ((f.type !== 1 && f.type !== 4) || f.edge < 14 || !free(x, z, 12)) continue;
      const sp = T.splatAt(x, z);
      if (sp.wheat + sp.fallow < 0.6) continue;
      clusters++;
      this.blockers.push([x, z, 14]);
      if (f.type === 1) {
        const dx = Math.cos(f.angle), dz = Math.sin(f.angle), n = 4 + Math.floor(R() * 5);
        for (let i = 0; i < n; i++) {
          const px = x + dx * (i - n / 2) * 6.5 + (R() - 0.5), pz = z + dz * (i - n / 2) * 6.5 + (R() - 0.5);
          bales.push(mat(px, pz, Math.atan2(dx, dz) + Math.PI / 2 + (R() - 0.5) * 0.3, 1));
          const c = this.physics.createCollider(this.R.ColliderDesc.cuboid(bs.x / 2, bs.y / 2, bs.z / 2).setTranslation(px, T.heightAt(px, pz) + bs.y / 2, pz)
            .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz) + Math.PI / 2)));
          c.userData = { kind: 'prop' };
        }
      } else {
        const n = 3 + Math.floor(R() * 4);
        for (let i = 0; i < n; i++) {
          const a = R() * Math.PI * 2, r = 3 + R() * 12, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
          piles.push(mat(px, pz, R() * 6.28, 0.6 + R() * 0.35));
        }
      }
    }
    for (const [name, list] of [['haybale', bales], ['hay_round', piles]]) {
      if (list.length) this.cells.push(...buildInstances(this.lib, name, list, { group: this.veg, cell: 300, maxDist: 1100 }));
    }
    // abandoned sheds with a dead tree, and old wind pumps
    const objs = [];
    const placeSome = (count, r, fn) => {
      for (let tries = 0, k = 0; tries < 3000 && k < count; tries++) {
        const x = (R() * 2 - 1) * half, z = (R() * 2 - 1) * half;
        if (!free(x, z, r) || T.heightAt(x, z) > 160) continue;
        k++; this.blockers.push([x, z, r]); fn(x, z);
      }
    };
    placeSome(Math.round(10 * this.density + 2), 18, (x, z) => {
      const res = this.place(R() < 0.5 ? 'barn_small' : 'barn_open', x, z, R() * 360, 0.9 + R() * 0.2);
      objs.push(res.object);
      (this._extraTrees = this._extraTrees || []).push(this._treeMatrix(R() < 0.5 ? 'dead_1' : 'dead_2', x + 10 + R() * 4, z + (R() - 0.5) * 10, 0.9 + R() * 0.3));
      if (R() < 0.6) objs.push(this.place('cart', x - 9, z + 5, R() * 360, 1).object);
    });
    placeSome(Math.round(12 * this.density + 2), 10, (x, z) => {
      const res = this.place('windmill', x, z, R() * 360, 0.9 + R() * 0.25);
      this._registerSpinner(res.object); this.static.add(res.object);
      if (R() < 0.7) objs.push(this.place('cistern', x + 4, z + 2, R() * 360, 0.8).object);
    });
    const m = this._mergeStatic(objs.filter(Boolean), 'countryside');
    m.userData.maxDist = 99999;
    // wooden fences along the roads that lead to farms (one side, ~200 m each way)
    const g = this.gasStation;
    const inTown = (x, z) => Math.hypot(x - TOWN.center[0], z - TOWN.center[1]) < TOWN.radius + 25 || (g && Math.hypot(x - g.x, z - g.z) < 60);
    for (const fm of FARMS) {
      const q = T.roads.query(fm.x, fm.z, {});
      let best = null, bd = Infinity;
      for (const r of T.roads.roads) for (let i = 0; i < (r.rail ? 0 : r.points.length); i++) { const p = r.points[i]; const d = (p[0] - fm.x) ** 2 + (p[1] - fm.z) ** 2; if (d < bd) { bd = d; best = { r, i }; } }
      if (!best || !q) continue;
      const pts = best.r.points, hw = best.r.width / 2 + 3.5;
      // fence on the side facing away from the farm so the driveway stays open
      const side = (() => { const p = pts[best.i], n = pts[Math.min(pts.length - 1, best.i + 1)]; const dx = n[0] - p[0], dz = n[1] - p[1]; return ((fm.x - p[0]) * -dz + (fm.z - p[1]) * dx) > 0 ? -1 : 1; })();
      const seg = 6;
      for (let i = Math.max(1, best.i - 100); i < Math.min(pts.length - 1, best.i + 100); i += seg) {
        const a = pts[i], b = pts[Math.min(pts.length - 1, i + seg)];
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * side * hw, nz = dx / l * side * hw;
        const ax = a[0] + nx, az = a[1] + nz, bx = b[0] + nx, bz = b[1] + nz;
        if (T.slopeAt(ax, az) > 0.2 || this.kickerNear(ax, az)) continue;
        // keep the town (and the gas station forecourt at its edge) open to the road
        if (inTown(ax, az) || inTown(bx, bz)) continue;
        this._fenceLine('fence', ax, az, bx, bz);
      }
    }
  }

  // ------------------------------------------------------------ town, power lines, wind farm
  // road frame `t` metres south of the anchor along the named road: {x, z, dx, dz} (direction of travel)
  _roadFrame(roadName, anchor, t) {
    const r = this.terrain.roads.roads.find((rr) => rr.name === roadName), pts = r.points;
    let ai = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = (p[0] - anchor[0]) ** 2 + (p[1] - anchor[1]) ** 2; if (d < bd) { bd = d; ai = i; } });
    let i = ai, acc = 0;
    while (i > 1 && acc < t) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); i--; }
    const a = pts[Math.min(pts.length - 1, i + 1)], b = pts[Math.max(0, i - 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return { x: pts[i][0], z: pts[i][1], dx: dx / l, dz: dz / l, hw: r.width / 2 };
  }

  _town() {
    const T = TOWN, objs = [];
    this.blockers.push([T.center[0], T.center[1], T.radius + 10]);
    // frame → world: side +1 is to the right of the travel direction (heading south)
    const at = (t, side, off) => { const f = this._roadFrame(T.road, T.anchor, t); const rx = -f.dz * side, rz = f.dx * side; return { x: f.x + rx * (f.hw + off), z: f.z + rz * (f.hw + off), rx, rz, f }; };
    const face = (p) => Math.atan2(-p.rx, -p.rz) * 180 / Math.PI; // model +Z towards the road
    this.townSpots = {}; this.benches = [];
    for (const [model, t, side, setback, sc = 1] of T.buildings) {
      const b = this.lib.bounds(model, sc), depth = b.max.z - b.min.z;
      const p = at(t, side, setback + depth / 2);
      const fr = at(t, side, Math.max(1.8, setback - 1.2)); // pavement in front of the door
      this.townSpots[model] = { x: fr.x, z: fr.z, rx: fr.rx, rz: fr.rz, dx: fr.f.dx, dz: fr.f.dz };
      const r = this.place(model, p.x, p.z, face(p), sc);
      if (r.object) objs.push(r.object);
    }
    for (const [model, t, side, setback, rot = 0] of T.props) {
      const p = at(t, side, setback);
      if (model === 'bench') this.benches.push({ x: p.x, z: p.z, yaw: Math.atan2(-p.rx, -p.rz) + rot * Math.PI / 180 });
      const r = this.place(model, p.x, p.z, face(p) + rot, 1);
      if (r.object) objs.push(r.object);
    }
    // street lights on both sides, arm over the road
    for (let t = 40; t <= 180; t += 24) for (const side of [-1, 1]) {
      const p = at(t + (side > 0 ? 12 : 0), side, 1.5);
      const o = this.lib.clone('streetlight');
      o.position.set(p.x, this.terrain.heightAt(p.x, p.z) - 0.05, p.z);
      o.rotation.y = Math.atan2(-p.rx, -p.rz);
      objs.push(o);
      this.physics.createCollider(this.R.ColliderDesc.cylinder(3.3, 0.18).setTranslation(p.x, o.position.y + 3.3, p.z)).userData = { kind: 'tree' };
      (this.streetLights = this.streetLights || []).push(new THREE.Vector3(p.x - p.rx * 2.6, o.position.y + 6.4, p.z - p.rz * 2.6));
    }
    // post office: mailbox + start point for the mail route
    const po = T.postOffice, pb = at(po[1], po[2], 1.6);
    this.place('mailbox', pb.x + pb.f.dx * 4, pb.z + pb.f.dz * 4, face(pb), 1);
    this.mailboxes.pop(); // the office box is the start, not a delivery target
    this.postOffice = { x: pb.x, z: pb.z };
    // gas station: canopy with pumps (pump islands collide, the roof does not), shop behind it, price sign at the road
    const g = T.gas, gc = at(g.t, g.side, g.setback + 7.5);
    const canopy = this.lib.clone('gas_canopy');
    const gy = this.groundY(gc.x, gc.z, 6);
    canopy.position.set(gc.x, gy, gc.z); canopy.rotation.y = Math.atan2(gc.f.dx, gc.f.dz);
    objs.push(canopy);
    canopy.updateMatrixWorld(true);
    for (const [px, pz] of [[7.1, 2.8], [7.1, -2.7], [-6.9, 2.8], [-6.9, -2.7]]) {
      const w = new THREE.Vector3(px, 0, pz).applyMatrix4(canopy.matrixWorld);
      this.physics.createCollider(this.R.ColliderDesc.cuboid(0.5, 1.3, 0.8).setTranslation(w.x, gy + 1.3, w.z).setRotation(canopy.quaternion)).userData = { kind: 'prop' };
    }
    const gsb = this.lib.bounds('gas_shop'), gs = at(g.t, g.side, g.setback + 15 + (gsb.max.z - gsb.min.z) / 2 + 4);
    const shop = this.place('gas_shop', gs.x, gs.z, face(gs), 1);
    if (shop.object) objs.push(shop.object);
    const sg = at(g.t - 16, g.side, 1.5);
    const sign = this.place('gas_sign', sg.x, sg.z, face(sg) + 90, 1);
    if (sign.object) objs.push(sign.object);
    for (const [dt, off] of [[-6, 22], [-2, 23]]) { const pp = at(g.t + dt, g.side, g.setback + off); const r = this.place('picnic', pp.x, pp.z, face(pp), 1); if (r.object) objs.push(r.object); }
    const gf = at(g.t, g.side, g.setback + 17);
    this.gasStation = { x: gc.x, z: gc.z, shop: { x: gf.x, z: gf.z, yaw: Math.atan2(-gf.rx, -gf.rz) } };
    this.townFrame = { at, face };
    const m = this._mergeStatic(objs, 'town');
    m.userData.center = new THREE.Vector3(T.center[0], 0, T.center[1]); m.userData.maxDist = 2600;
    this.cells.push(m);
  }

  // campsite by the pond, county fair beside the town, fishing spot, valley picnic (people live in world/people.js)
  _leisure() {
    const objs = [], P = (id) => POIS.find((p) => p.id === id), put = (m, x, z, rot = 0, sc = 1, opts) => { const r = this.place(m, x, z, rot, sc, opts); if (r.object) objs.push(r.object); return r; };
    this.leisure = {};
    // camp: two tents, a fire ring with log seats, bedrolls
    const c = P('camp');
    this.blockers.push([c.x, c.z, 26]);
    put('tent', c.x - 7, c.z - 5, 30); put('tent2', c.x + 6, c.z - 7, -20); put('bedroll', c.x - 3, c.z + 7, 80, 1, { collider: false });
    put('campfire', c.x, c.z, 0, 1, { collider: false });
    const seats = [];
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4, x = c.x + Math.cos(a) * 3.2, z = c.z + Math.sin(a) * 3.2; put('log_seat', x, z, 90 - a * 180 / Math.PI + 90, 1, { collider: false }); seats.push({ x, z, yaw: Math.atan2(c.x - x, c.z - z) }); }
    this.leisure.camp = { x: c.x, z: c.z, seats };
    // fishing spot on the west shore of the pond
    const pd = P('pond'), fx = pd.x - 13, fz = pd.z + 3;
    put('canoe', fx + 2, fz + 5, 70, 1, { collider: false }); put('fish_stand', fx - 1.5, fz - 1, 0, 1, { collider: false }); put('bucket', fx + 1.2, fz - 1.2, 0, 1, { collider: false });
    put('log_seat', fx, fz, 90, 1, { collider: false });
    this.leisure.fisher = { x: fx, z: fz, yaw: Math.atan2(pd.x - fx, pd.z - fz) };
    // county fair: a ring of stalls with lanterns, hay and pumpkins
    const fa = P('fair'), stalls = [];
    const kinds = ['stall_red', 'stall_green', 'stall', 'stall_red', 'stall_green', 'stall'];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, x = fa.x + Math.cos(a) * 15, z = fa.z + Math.sin(a) * 15;
      put(kinds[i], x, z, (-a * 180 / Math.PI) - 90);
      stalls.push({ x: fa.x + Math.cos(a) * 11.5, z: fa.z + Math.sin(a) * 11.5, yaw: Math.atan2(fa.x - x, fa.z - z) + Math.PI, vendor: { x: fa.x + Math.cos(a) * 16.5, z: fa.z + Math.sin(a) * 16.5, yaw: Math.atan2(fa.x - x, fa.z - z) } });
      const la = a + Math.PI / 6;
      put('lantern', fa.x + Math.cos(la) * 14, fa.z + Math.sin(la) * 14, 0, 1, { collider: false });
    }
    for (const [m, dx, dz, r] of [['hay_round', 0, 0, 0], ['crate_pumpkin', 3, 2, 20], ['crate_pumpkin', -3, 2.5, -30], ['pumpkin', 2, -3, 0], ['pumpkin', -2, -3.4, 0], ['stall_bench', 6, -6, 45], ['stall_bench', -6, 6, 45]])
      put(m, fa.x + dx, fa.z + dz, r);
    this.leisure.fair = { x: fa.x, z: fa.z, stalls };
    this.lanterns = Array.from({ length: 6 }, (_, i) => { const la = i / 6 * Math.PI * 2 + Math.PI / 6; return new THREE.Vector3(fa.x + Math.cos(la) * 14, this.terrain.heightAt(fa.x + Math.cos(la) * 14, fa.z + Math.sin(la) * 14) + 2.5, fa.z + Math.sin(la) * 14); });
    // valley picnic: table and a blanket
    const pi = P('picnic');
    put('picnic', pi.x, pi.z, 15); put('bedroll', pi.x + 4, pi.z + 2, 100, 1.4, { collider: false }); put('bucket', pi.x + 1.5, pi.z - 1.5, 0, 1, { collider: false });
    this.leisure.picnic = { x: pi.x, z: pi.z };
    this.blockers.push([fa.x, fa.z, 24], [pi.x, pi.z, 14], [fx, fz, 6]);
    if (objs.length) this._mergeStatic(objs, 'leisure').userData.maxDist = 99999;
  }

  // barn-find barns and lookout towers (gameplay lives in game/barns.js and game/explore.js)
  _landmarks() {
    const objs = [];
    for (const b of BARNS) {
      this.blockers.push([b.x, b.z, 16]);
      const r = this.place('barn_open', b.x, b.z, b.rot, 1.25);
      if (r.object) objs.push(r.object);
      // overgrown yard: dead tree, hay and an old cart
      for (const [m, dx, dz, rot, sc] of [['dead_1', 9, -6, 0, 1], ['hay_round', -7, 5, 30, 1], ['cart', 8, 6, 200, 1], ['dead_2', -10, -8, 90, 1]]) {
        const c = Math.cos(b.rot * Math.PI / 180), sn = Math.sin(b.rot * Math.PI / 180);
        const rr = this.place(m, b.x + dx * c + dz * sn, b.z - dx * sn + dz * c, rot, sc);
        if (rr.object) objs.push(rr.object);
      }
    }
    for (const t of TOWERS) {
      this.blockers.push([t.x, t.z, 10]);
      const r = this.place('water_tower', t.x, t.z, 20, 1.5);
      if (r.object) objs.push(r.object);
    }
    if (objs.length) this._mergeStatic(objs, 'landmarks').userData.maxDist = 99999;
  }

  // wooden power poles along the main roads with sagging wires between them
  _powerLines() {
    const T = this.terrain, S = 20, poles = [], wires = [];
    for (const name of ['Palouse Yolu', 'Doğu Yolu', 'Batı Yolu', 'Güney Yolu', 'Tepe Yolu']) {
      const r = T.roads.roads.find((rr) => rr.name === name);
      if (!r) continue;
      const pts = r.points, hw = r.width / 2 + 7;
      let acc = 0, prev = null;
      const line = [];
      for (let i = 1; i < pts.length - 1; i++) {
        acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acc < 42) continue;
        acc = 0;
        const dx = pts[i + 1][0] - pts[i - 1][0], dz = pts[i + 1][1] - pts[i - 1][1], l = Math.hypot(dx, dz) || 1;
        const x = pts[i][0] + dz / l * hw, z = pts[i][1] - dx / l * hw; // left side of the road
        const ok = Math.abs(x) < T.half - 30 && Math.abs(z) < T.half - 30 && T.slopeAt(x, z) < 0.3 && !this.kickerNear(x, z)
          && FARMS.every((f) => Math.hypot(x - f.x, z - f.z) > f.r * 0.7) && T.roadWeight(x, z) < 0.05;
        if (!ok) { prev = null; continue; }
        const y = T.heightAt(x, z) - 0.1;
        const p = { x, y, z, yaw: Math.atan2(-dz, dx) };
        line.push([prev, p]);
        prev = p;
      }
      for (const [a, b] of line) {
        poles.push(new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.y, b.z), new THREE.Quaternion().setFromAxisAngle(_up, b.yaw), new THREE.Vector3(S, S, S)));
        this.physics.createCollider(this.R.ColliderDesc.cylinder(5, 0.3).setTranslation(b.x, b.y + 5, b.z)).userData = { kind: 'tree' };
        if (!a) continue;
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        if (len > 70) continue;
        const yaw = Math.atan2(-dz, dx), q = new THREE.Quaternion().setFromAxisAngle(_up, yaw)
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(b.y - a.y, len)));
        const sx = len / 0.5;
        const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2).add(new THREE.Vector3(0.03 * sx, 0, 0).applyQuaternion(q));
        wires.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(sx, S, S)));
      }
    }
    this.cells.push(...buildInstances(this.lib, 'pole', poles, { group: this.veg, cell: 400, maxDist: 1500 }));
    this.cells.push(...buildInstances(this.lib, 'wires', wires, { group: this.veg, cell: 400, maxDist: 1300, castShadow: false }));
    this.powerPoleCount = poles.length;
  }

  // modern wind turbines on the high ridges (Palouse wind farm)
  _turbines() {
    const T = this.terrain, cands = [];
    for (let x = -T.half + 200; x < T.half - 200; x += 60) for (let z = -T.half + 200; z < T.half - 200; z += 60) {
      if (Math.hypot(x + 805, z + 831) < 650) continue; // keep the butte clear
      const h = T.heightAt(x, z);
      let avg = 0; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; avg += T.heightAt(x + Math.cos(a) * 160, z + Math.sin(a) * 160); }
      avg /= 8;
      const q = T.roads.query(x, z, _rq);
      if (T.slopeAt(x, z) > 0.15 || (q && q.dist < 45) || FARMS.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 80)) continue;
      cands.push({ x, z, score: h - avg + h * 0.02 });
    }
    cands.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const c of cands) {
      if (picked.length >= 8) break;
      if (picked.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 200) && this.blockers.every((b) => Math.hypot(c.x - b[0], c.z - b[1]) > b[2])) picked.push(c);
    }
    for (const c of picked) {
      const res = this.place('turbine', c.x, c.z, 90 + (this.rand() - 0.5) * 20, 0.9 + this.rand() * 0.2, { collider: false });
      this._registerSpinner(res.object);
      this.static.add(res.object);
      const y = T.heightAt(c.x, c.z);
      this.physics.createCollider(this.R.ColliderDesc.cylinder(25, 1.6).setTranslation(c.x, y + 25, c.z)).userData = { kind: 'building' };
      this.blockers.push([c.x, c.z, 25]);
    }
    this.turbines = picked;
  }

  kickerNear(x, z) { return (this.terrain.kickers || []).some((k) => Math.hypot(x - k.x, z - k.z) < 40); }

  _kickerProps() {
    for (const k of this.terrain.kickers || []) {
      for (const side of [-1, 1]) {
        const off = (k.hw + 1.8) * side;
        const x = k.x - k.dx * 2 + k.dz * off, z = k.z - k.dz * 2 - k.dx * off;
        const rot = Math.atan2(k.dx, k.dz) * 180 / Math.PI;
        this.place('haybale', x, z, rot, 1);
        this.place('haybale', x - k.dx * 2.4, z - k.dz * 2.4, rot, 1);
      }
    }
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
    const farAway = (x, z, extra = 0) => FARMS.every(f => Math.hypot(x - f.x, z - f.z) > f.r + 12 + extra) && POIS.every(p => Math.hypot(x - p.x, z - p.z) > 14) && !inPaddock(x, z)
      && this.blockers.every((b) => Math.hypot(x - b[0], z - b[1]) > b[2] + extra);
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
    for (const s of this.spinners) s.node.rotation[s.axis || 'z'] += dt * s.speed * (s.axis === 'x' ? 1.2 : 2.2);
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
