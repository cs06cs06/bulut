import * as THREE from 'three';
import { FARMS, BOARDS } from '../world/layout.js';

// Farm-to-farm cargo jobs. Cargo is simulated: it rides loose in the truck bed and can be lost
// on bumps, jumps and rollovers. Pay scales with distance, cargo kept and a time bonus.

export const CARGO = {
  hay: { name: 'Saman balyası', model: 'haybale', size: 0.34, count: 6, pay: 1.0, density: 80, icon: '▦' },
  pumpkin: { name: 'Balkabağı kasası', model: 'crate_pumpkin', size: 0.3, count: 4, pay: 1.3, density: 130, icon: '◍' },
  milk: { name: 'Süt varili', model: 'barrel', size: 0.85, count: 4, pay: 1.5, density: 160, icon: '▮', cylinder: true },
};

const DEG = Math.PI / 180;

export class Delivery {
  constructor({ scene, physics, RAPIER, lib, terrain, hud, audio, progress, glowTex }) {
    Object.assign(this, { scene, physics, R: RAPIER, lib, terrain, hud, audio, progress });
    this.group = new THREE.Group(); this.group.name = 'delivery'; scene.add(this.group);
    this.job = null;
    this.cargo = [];
    this.time = 0;
    this.boards = FARMS.map((f) => {
      const [lx, lz, rot] = BOARDS[f.id];
      const r = f.rot * DEG, c = Math.cos(r), s = Math.sin(r);
      const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c, y = terrain.heightAt(x, z);
      const sign = lib.clone('billboard', 1.2);
      sign.position.set(x, y, z); sign.rotation.y = (rot + f.rot) * DEG;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd36b, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(9, 9, 1); glow.position.set(x, y + 1.6, z);
      this.group.add(sign, glow);
      return { farm: f, x, z, y, glow };
    });
    // destination beacon: a tall additive light column
    const beamMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x9fe0ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beacon = new THREE.Group();
    for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(beamMat); sp.scale.set(6 - i * 0.6, 6 - i * 0.6, 1); sp.position.y = 2 + i * 7; this.beacon.add(sp); }
    this.beacon.visible = false;
    this.group.add(this.beacon);
  }

  boardNear(pos, r = 11) { return this.boards.find((b) => Math.hypot(pos.x - b.x, pos.z - b.z) < r); }

  // offers for the board UI (deterministic for a few minutes per board)
  offers(board) {
    const seed = Math.floor(Date.now() / 180000) + board.farm.id.length * 31;
    let a = seed;
    const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    const others = this.boards.filter((b) => b !== board);
    const kinds = Object.keys(CARGO);
    const list = [];
    for (let i = 0; i < 3; i++) {
      const dest = others[Math.floor(rnd() * others.length)];
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      const dist = Math.hypot(dest.x - board.x, dest.z - board.z) * 1.3;
      const c = CARGO[kind];
      const reward = Math.round((90 + dist * 0.2) * c.pay / 10) * 10;
      const limit = Math.round(dist / 13 + 30);
      list.push({ id: `${board.farm.id}-${i}-${seed}`, from: board, dest, kind, cargo: c, dist, reward, limit });
    }
    return list;
  }

  accept(offer, vehicle) {
    if (!vehicle.cfg.bed) return 'Bu iş için kasalı bir araç gerekli (Pikap veya Canavar Kamyon).';
    if (vehicle.speed > 1.5) return 'Yükleme için aracı durdur.';
    this.clearCargo();
    this.job = { ...offer, t: 0, lost: 0, total: offer.cargo.count, settle: 0 };
    this._spawnCargo(offer.cargo, vehicle);
    this.beacon.position.set(offer.dest.x, offer.dest.y, offer.dest.z);
    this.beacon.visible = true;
    this.audio.play('impact_wood', { volume: 0.6 });
    return null;
  }

  cancel() {
    if (!this.job) return;
    this.job = null; this.beacon.visible = false;
    this.hud.objective(null);
    this.clearCargo();
  }

  _spawnCargo(c, vehicle) {
    const bed = vehicle.cfg.bed;
    const proto = this.lib.clone(c.model, 1);
    proto.scale.setScalar(c.size);
    proto.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(proto), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    // choose the orientation that packs the most items per layer
    const W = bed.halfX * 2 - 0.08, L = bed.zMax - bed.zMin - 0.08;
    const fitA = Math.floor(W / size.x) * Math.floor(L / size.z), fitB = Math.floor(W / size.z) * Math.floor(L / size.x);
    const rotate = fitB > fitA;
    const sx = rotate ? size.z : size.x, sz = rotate ? size.x : size.z;
    const nx = Math.max(1, Math.floor(W / sx)), nz = Math.max(1, Math.floor(L / sz));
    const slots = [];
    for (let layer = 0; layer < 3 && slots.length < c.count; layer++)
      for (let k = 0; k < nz && slots.length < c.count; k++)
        for (let i = 0; i < nx && slots.length < c.count; i++)
          slots.push([-(nx * sx) / 2 + sx * (i + 0.5), bed.floorY + size.y * (layer + 0.5) + 0.03 + layer * 0.02, bed.zMin + 0.04 + (L - nz * sz) / 2 + sz * (k + 0.5)]);
    const q = vehicle.object.quaternion.clone();
    if (rotate) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
    const lv = vehicle.body.linvel();
    const p = new THREE.Vector3();
    for (const [x, y, z] of slots) {
      vehicle.bedToWorld(x, y, z, p);
      const mesh = proto.clone(true);
      mesh.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const body = this.physics.createRigidBody(this.R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinvel(lv.x, lv.y, lv.z).setCcdEnabled(true).setLinearDamping(0.05).setAngularDamping(0.2));
      // collider centred on the visual bounds (model origin is at its base)
      const off = ctr.clone().sub(proto.position);
      const desc = c.cylinder ? this.R.ColliderDesc.cylinder(size.y / 2, Math.min(size.x, size.z) / 2) : this.R.ColliderDesc.cuboid(size.x / 2 - 0.01, size.y / 2 - 0.01, size.z / 2 - 0.01);
      desc.setTranslation(off.x, off.y, off.z).setDensity(c.density).setFriction(0.95).setRestitution(0.05);
      const col = this.physics.createCollider(desc, body);
      col.userData = { kind: 'cargo' };
      mesh.position.copy(p); mesh.quaternion.copy(q);
      this.group.add(mesh);
      this.cargo.push({ mesh, body, lost: false, out: 0 });
    }
  }

  clearCargo() {
    for (const c of this.cargo) { this.physics.removeRigidBody(c.body); this.group.remove(c.mesh); }
    this.cargo = [];
  }

  get kept() { return this.cargo.filter((c) => !c.lost).length; }

  update(dt, vehicle) {
    this.time += dt;
    for (const b of this.boards) b.glow.material.opacity = (this.job ? 0.15 : 0.32) + Math.sin(this.time * 2.5 + b.x) * 0.12;
    for (const c of this.cargo) {
      const t = c.body.translation(), r = c.body.rotation();
      c.mesh.position.set(t.x, t.y, t.z); c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    const j = this.job;
    if (!j) return null;
    j.t += dt;
    this.beacon.children.forEach((s, i) => { s.material.opacity = 0.35 + Math.sin(this.time * 3 + i) * 0.15; });
    // lost cargo: outside the bed for a moment
    for (const c of this.cargo) {
      if (c.lost) continue;
      const inBed = vehicle.isInBed(c.mesh.position);
      c.out = inBed ? 0 : c.out + dt;
      if (c.out > 0.7) {
        c.lost = true; j.lost++;
        this.progress.stat('cargoLost', 1);
        this.hud.popup(`Yük düştü! ${this.kept}/${j.total}`, 'bad');
        this.audio.play('impact_wood', { volume: 0.5, rate: 0.8 });
      }
    }
    const dist = Math.hypot(vehicle.position.x - j.dest.x, vehicle.position.z - j.dest.z);
    const left = Math.max(0, j.limit - j.t);
    this.hud.objective({
      title: `Teslimat → ${j.dest.farm.name}`,
      lines: [`${j.cargo.icon} ${j.cargo.name}: <b>${this.kept}/${j.total}</b>`, `${dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1) + ' km'} · ${left > 0 ? 'Bonus ' + Math.ceil(left) + ' sn' : 'Bonus süresi doldu'}`],
    });
    if (this.kept === 0) {
      this.hud.toast('Teslimat başarısız', 'Tüm yük düştü', 'Yeni bir iş için ilan panosuna dön.');
      this.audio.play('crash_3', { volume: 0.4 });
      this.cancel();
      return null;
    }
    if (dist < 16 && vehicle.speed < 2.5) {
      j.settle += dt;
      if (j.settle > 0.8) return this._complete(vehicle);
    } else j.settle = 0;
    return { target: [j.dest.x, j.dest.z], dist };
  }

  _complete() {
    const j = this.job;
    const kept = this.kept;
    const base = Math.round(j.reward * kept / j.total);
    const bonus = j.t <= j.limit ? Math.round(j.reward * 0.3) : 0;
    const perfect = kept === j.total ? Math.round(j.reward * 0.2) : 0;
    const total = base + bonus + perfect;
    this.progress.addMoney(total);
    this.progress.stat('deliveries', 1);
    if (perfect) this.progress.stat('perfect', 1);
    const parts = [`Yük ${kept}/${j.total}: $${base}`];
    if (bonus) parts.push(`Hız bonusu: $${bonus}`);
    if (perfect) parts.push(`Hasarsız: $${perfect}`);
    this.hud.toast('Teslim Edildi', `+$${total}`, parts.join(' · '));
    this.audio.play('discover', { bus: 'ui', volume: 0.8 });
    this.job = null; this.beacon.visible = false;
    this.hud.objective(null);
    setTimeout(() => this.clearCargo(), 600);
    return { done: true, total };
  }
}
