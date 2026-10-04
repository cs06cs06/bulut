import * as THREE from 'three';
import { buildInstances } from '../world/models.js';

// Freight railway (Kenney Train Kit): track laid along a carved rail bed, a diesel with seven
// wagons running end to end across the east of the map, level crossings with flashing lights,
// a horn before every crossing and road traffic that waits for the train.
const CONSIST = ['diesel_a', 'wagon_coal', 'wagon_lumber', 'wagon_tank', 'wagon_box', 'wagon_coal', 'wagon_wood', 'wagon_flatbed_wood'];
const SPEED = 15, GAP = 0.5, TRACK = 2.6;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Train {
  constructor({ scene, lib, terrain, physics, RAPIER, audio, world, glowTex }) {
    Object.assign(this, { scene, lib, terrain, physics, R: RAPIER, audio, world, glowTex });
    const rail = terrain.roads.roads.find((r) => r.rail);
    this.rail = rail;
    const pts = rail.points, H = rail.heights, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    Object.assign(this, { pts, H, cum, len: cum[cum.length - 1] });
    this.group = new THREE.Group(); this.group.name = 'railway'; scene.add(this.group);
    // track
    const mats = []; // model scale is applied by buildInstances
    for (let s = 1; s < this.len - 1; s += TRACK) {
      const a = this.at(s), b = this.at(s + TRACK);
      _e.set(-Math.atan2(b.y - a.y, TRACK), Math.atan2(b.x - a.x, b.z - a.z), 0);
      const m = new THREE.Matrix4().compose(_p.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.08, (a.z + b.z) / 2), _q.setFromEuler(_e), _s.set(1, 0.7, 1.02));
      mats.push(m);
    }
    for (const part of lib.parts('track_single')) { part.material = part.material.clone(); part.material.color.setHex(0x9a8c80); } // weathered steel and timber
    const cells = buildInstances(lib, 'track_single', mats, { group: this.group, maxDist: 1300, castShadow: false });
    world.cells.push(...cells);
    // level crossings: where another road meets the rail
    this.crossings = [];
    for (const r of terrain.roads.roads) {
      if (r.rail) continue;
      let last = -1e9;
      for (let i = 0; i < r.points.length; i += 2) {
        const [x, z] = r.points[i];
        const pr = this.project(x, z);
        if (pr.d < 3 && pr.s - last > 30 && pr.s > 10 && pr.s < this.len - 10) {
          last = pr.s;
          const q = r.points[Math.min(r.points.length - 1, i + 2)], dx = q[0] - x, dz = q[1] - z, l = Math.hypot(dx, dz) || 1;
          this.crossings.push({ s: pr.s, x, z, rdx: dx / l, rdz: dz / l, hw: r.width / 2, lights: [] });
        }
      }
    }
    for (const c of this.crossings) {
      for (const side of [-1, 1]) {
        // warning sign on each road approach, flashing lamps beside it
        const ox = c.x - c.rdx * 9 * side + c.rdz * (c.hw + 1.4) * side, oz = c.z - c.rdz * 9 * side - c.rdx * (c.hw + 1.4) * side;
        const sign = world.place('sign_warning', ox, oz, Math.atan2(c.rdx * side, c.rdz * side) * 180 / Math.PI, 1).object;
        if (sign) this.group.add(sign);
        const y = terrain.heightAt(ox, oz) + 2.6;
        for (const k of [-0.35, 0.35]) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff2a1a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
          sp.position.set(ox + c.rdz * k, y, oz - c.rdx * k); sp.scale.setScalar(1.4);
          this.group.add(sp); c.lights.push(sp);
        }
      }
    }
    // the train
    this.cars = CONSIST.map((name) => {
      const o = lib.clone(name);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const b = lib.bounds(name), half = (b.max.z - b.min.z) / 2;
      const body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -700, 0));
      const size = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
      physics.createCollider(RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, half).setTranslation(ctr.x, ctr.y, ctr.z), body).userData = { kind: 'train' };
      this.group.add(o);
      return { o, body, half };
    });
    let off = 0;
    for (const c of this.cars) { off += c.half; c.off = off; off += c.half + GAP; }
    this.length = off;
    this.s = -40; this.wait = 0; this.v = SPEED;
    this.sound = audio.buffers.engine_diesel ? audio.loop('engine_diesel', 'sfx', { volume: 0 }) : null;
    this.time = 0;
  }

  // centre line and bed height at arc length s
  at(s, out = {}) {
    const { pts, H, cum } = this;
    s = Math.max(0, Math.min(this.len, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    out.x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t; out.z = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
    out.y = H[lo] + (H[hi] - H[lo]) * t - 0.12;
    return out;
  }

  project(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.pts.length; i += 3) { const d = (this.pts[i][0] - x) ** 2 + (this.pts[i][1] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return { s: this.cum[best], d: Math.sqrt(bd) };
  }

  // traffic asks this before driving over a crossing
  blocked(x, z) {
    for (const c of this.crossings) if (c.active && Math.hypot(x - c.x, z - c.z) < 22) return c;
    return null;
  }

  update(dt, listener) {
    this.time += dt;
    if (this.wait > 0) { this.wait -= dt; if (this.wait <= 0) this.s = -40; }
    else {
      this.s += this.v * dt;
      if (this.s - this.length > this.len + 40) { this.wait = 45 + Math.random() * 40; }
    }
    const A = _a, B = _b;
    for (const c of this.cars) {
      const sc = this.s - c.off;
      const on = this.wait <= 0 && sc > c.half && sc < this.len - c.half;
      c.o.visible = on;
      if (!on) { c.body.setNextKinematicTranslation({ x: 0, y: -700, z: 0 }); continue; }
      this.at(sc + c.half * 0.8, A); this.at(sc - c.half * 0.8, B);
      const x = (A.x + B.x) / 2, z = (A.z + B.z) / 2, y = (A.y + B.y) / 2;
      _e.set(-Math.atan2(A.y - B.y, c.half * 1.6), Math.atan2(A.x - B.x, A.z - B.z), Math.sin(this.time * 7 + c.off) * 0.004);
      c.o.position.set(x, y + 0.12, z); c.o.quaternion.setFromEuler(_e);
      c.body.setNextKinematicTranslation({ x, y: y + 0.12, z });
      const q = c.o.quaternion; c.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    // crossings: lamps flash while the train is near; horn as it approaches
    for (const cr of this.crossings) {
      const head = this.s, tail = this.s - this.length;
      cr.active = this.wait <= 0 && head > cr.s - 260 && tail < cr.s + 20;
      const blink = cr.active && Math.floor(this.time * 2.4) % 2;
      cr.lights.forEach((l, i) => { l.material.opacity = cr.active ? ((i % 2) === blink ? 0.95 : 0.08) : 0; });
      if (cr.active && !cr.horned && head > cr.s - 220) {
        cr.horned = true;
        const loco = this.cars[0].o.position;
        this.audio.play('horn', { position: loco, volume: 1, rate: 0.5, maxDist: 700 });
        setTimeout(() => this.audio.play('horn', { position: this.cars[0].o.position, volume: 1, rate: 0.5, maxDist: 700 }), 1100);
      }
      if (!cr.active) cr.horned = false;
      if (cr.active && Math.floor(this.time * 2.4) !== Math.floor((this.time - dt) * 2.4)) {
        this.audio.play('ui_click', { position: _p.set(cr.x, this.terrain.heightAt(cr.x, cr.z) + 2, cr.z), volume: 0.6, rate: 0.55, maxDist: 160 });
      }
    }
    if (this.sound) {
      const loco = this.cars[0].o;
      const d = loco.visible ? loco.position.distanceTo(listener) : 1e9;
      this.sound.set(Math.pow(Math.max(0, 1 - d / 450), 2) * 0.55, 0.55, 0.2);
    }
  }
}

const _a = {}, _b = {};
