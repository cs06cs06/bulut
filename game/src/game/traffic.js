import * as THREE from 'three';
import { seatDriver, SEATS, glassify } from './driver.js';

// Ambient farm traffic: vehicles cruise the dirt roads (right-hand side), wait for the player,
// U-turn at road ends. Kinematic bodies, so you can bump into them.
const ROUTES = [
  { model: 'tractor', road: 'Tepe Yolu', speed: 6.5, axle: 'z', yaw: Math.PI / 2 },
  { model: 'van', road: 'Palouse Yolu', speed: 14, axle: 'x', yaw: 0, start: 0.35 },
  { model: 'truck', road: 'Batı Yolu', speed: 11, axle: 'x', yaw: 0, start: 0.2 },
  { model: 'tractor', road: 'Güney Yolu', speed: 5.5, axle: 'z', yaw: Math.PI / 2, start: 0.6 },
  { model: 'van', road: 'Doğu Yolu', speed: 13, axle: 'x', yaw: 0, start: 0.5 },
  // Kenney Car Kit: the sheriff's patrol and townsfolk running errands
  { model: 'k_police', road: 'Palouse Yolu', speed: 15, axle: 'x', yaw: 0, start: 0.62, sound: 'engine_low' },
  { model: 'k_sedan', road: 'Tepe Yolu', speed: 13, axle: 'x', yaw: 0, start: 0.35, sound: 'engine_low' },
  { model: 'k_hatchback', road: 'Güney Yolu', speed: 14, axle: 'x', yaw: 0, start: 0.75, sound: 'engine_low' },
  { model: 'k_delivery', road: 'Doğu Yolu', speed: 12, axle: 'x', yaw: 0, start: 0.15, sound: 'engine_low' },
  { model: 'k_taxi', road: 'Butte Yolu', speed: 11, axle: 'x', yaw: 0, start: 0.5, sound: 'engine_low' },
  { model: 'k_sedan', road: 'Değirmen Yolu', speed: 12, axle: 'x', yaw: 0, start: 0.4, sound: 'engine_low' },
];

export class Traffic {
  constructor({ scene, lib, terrain, physics, RAPIER, audio }) {
    Object.assign(this, { scene, lib, terrain, physics, R: RAPIER, audio });
    this.cars = [];
    for (const r of ROUTES) {
      const road = terrain.roads.roads.find((x) => x.name === r.road);
      if (!road) continue;
      // arc-length table
      const pts = road.points, cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const root = new THREE.Group();
      const model = lib.clone(r.model);
      model.rotation.y = r.yaw;
      root.add(model);
      root.updateMatrixWorld(true);
      // spinning wheels
      const wheels = [];
      model.traverse((o) => { if (o.isMesh && /wheel/i.test(o.name)) wheels.push(o); });
      const spins = wheels.map((w) => {
        const box = new THREE.Box3().setFromObject(w), c = box.getCenter(new THREE.Vector3());
        const local = model.worldToLocal(c.clone());
        const pivot = new THREE.Group(); pivot.position.copy(local);
        const wm = w.matrixWorld.clone();
        w.parent.remove(w); pivot.add(w); model.add(pivot);
        model.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
        wm.premultiply(inv); wm.decompose(w.position, w.quaternion, w.scale);
        return { pivot, radius: (box.max.y - box.min.y) / 2 };
      });
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      glassify(model);
      const driver = seatDriver(lib, root, box, SEATS[r.model], ['char_m_c', 'char_f_e', 'char_m_e', 'char_f_a'][this.cars.length % 4]);
      scene.add(root);
      const body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      const col = physics.createCollider(RAPIER.ColliderDesc.cuboid(size.x / 2 * 0.95, size.y / 2 * 0.9, size.z / 2 * 0.95).setTranslation(ctr.x, ctr.y, ctr.z).setFriction(0.6), body);
      col.userData = { kind: 'building' };
      const car = { ...r, root, model, driver, spins, body, pts, cum, len: cum[cum.length - 1], s: cum[cum.length - 1] * (r.start || 0.1), dir: 1, v: 0, turn: 0, halfLen: size.z / 2 };
      const snd = r.sound || 'engine_diesel';
      if (audio.buffers[snd]) car.sound = audio.loop(snd, 'sfx', { volume: 0 });
      this.cars.push(car);
      this._place(car, 0);
    }
  }

  _sample(car, s, out) {
    const { pts, cum } = car;
    s = Math.max(0, Math.min(car.len, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    out.x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t;
    out.z = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
    return out;
  }

  _place(car, dt) {
    const a = this._sample(car, car.s - car.dir * 2.5, _a), b = this._sample(car, car.s + car.dir * 2.5, _b);
    let fx = b.x - a.x, fz = b.z - a.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    if (car.turn > 0) { // U-turn in place
      const k = 1 - car.turn;
      const ang = Math.atan2(-fx, -fz) + Math.PI * k;
      fx = Math.sin(ang); fz = Math.cos(ang);
    }
    const c = this._sample(car, car.s, _c);
    const side = car.turn > 0 ? 0 : 2.2; // keep to the driver's right (local -X)
    const px = c.x - fz * side, pz = c.z + fx * side;
    const T = this.terrain;
    const hf = T.heightAt(px + fx * car.halfLen, pz + fz * car.halfLen), hb = T.heightAt(px - fx * car.halfLen, pz - fz * car.halfLen);
    const y = (hf + hb) / 2;
    const yaw = Math.atan2(fx, fz), pitch = -Math.atan2(hf - hb, car.halfLen * 2);
    car.root.position.set(px, y, pz);
    car.root.rotation.set(pitch, yaw, 0, 'YXZ');
    const q = car.root.quaternion;
    car.body.setNextKinematicTranslation({ x: px, y, z: pz });
    car.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    for (const w of car.spins) {
      const ang = (car.v * dt) / Math.max(0.2, w.radius);
      if (car.axle === 'z') w.pivot.rotation.z -= ang; else w.pivot.rotation.x += ang;
    }
  }

  // clear a road for a race: its traffic parks out of the way until the race ends
  suspendRoad(name) {
    for (const car of this.cars) {
      car.suspended = !!name && car.road === name;
      car.root.visible = !car.suspended;
      if (car.suspended) { car.body.setNextKinematicTranslation({ x: 0, y: -600, z: 0 }); car.sound?.set(0); }
    }
  }

  update(dt, player, playerSpeed) {
    for (const car of this.cars) {
      if (car.suspended) continue;
      const d = Math.hypot(player.x - car.root.position.x, player.z - car.root.position.z);
      // blocked if the player is close in front
      const fx = Math.sin(car.root.rotation.y), fz = Math.cos(car.root.rotation.y);
      const ahead = (player.x - car.root.position.x) * fx + (player.z - car.root.position.z) * fz;
      // wait for the player in front, or for a train at a level crossing ahead
      const cr = this.train?.blocked(car.root.position.x + fx * 6, car.root.position.z + fz * 6);
      const blocked = (d < 16 && ahead > 0) || (cr && (cr.x - car.root.position.x) * fx + (cr.z - car.root.position.z) * fz > 2);
      let want = blocked ? 0 : car.speed;
      if (car.turn > 0) {
        want = 0;
        car.turn -= dt / 2.5;
        if (car.turn <= 0) { car.turn = 0; car.dir *= -1; }
      } else {
        const remain = car.dir > 0 ? car.len - car.s : car.s;
        if (remain < 25) want = Math.min(want, remain * 0.4);
        if (remain < 1.5) car.turn = 1;
      }
      car.v += (want - car.v) * Math.min(1, dt * (want < car.v ? 3 : 0.8));
      car.s += car.v * car.dir * dt;
      if (blocked && car.v < 0.5) {
        car.honk = (car.honk || 0) - dt;
        if (car.honk <= 0 && d < 12) { car.honk = 6 + Math.random() * 6; this.audio.play('horn', { position: car.root.position, volume: 0.25, maxDist: 120, rate: 0.85 }); }
      }
      this._place(car, dt);
      if (car.sound) {
        const g = Math.pow(Math.max(0, 1 - d / 110), 2) * 0.35;
        car.sound.set(g, 0.7 + car.v / car.speed * 0.45, 0.2);
      }
      car.root.visible = d < 1500;
      if (d < 160) car.driver.mixer.update(dt);
    }
  }
}

const _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 }, _c = { x: 0, z: 0 };
