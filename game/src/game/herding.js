import * as THREE from 'three';
import { FARMS, BOARDS } from '../world/layout.js';

// Cattle drive: five cows broke out and graze in a field. Drive behind them to push them back
// into the corral in the farmyard. Cows flee from the car, keep together and calm down once
// they are inside the ring.
export const HERD_FARMS = ['miller', 'dairy', 'hillhouse'];
const N = 5, R_PEN = 10, TIME = 240;
const _d = new THREE.Vector3();

export class Herding {
  constructor({ scene, lib, terrain, hud, audio, progress, glowTex }) {
    Object.assign(this, { scene, lib, terrain, hud, audio, progress });
    const clips = lib.gltf.cow.animations, find = (n) => clips.find((a) => a.name === n);
    this.clips = { idle: find('Idle'), walk: find('Walk'), run: find('Gallop'), eat: find('Eating') };
    // corral marker: ring of soft lights + beacon
    this.ring = new THREE.Group();
    const mat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd36b, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 20; i++) { const sp = new THREE.Sprite(mat); sp.scale.setScalar(1.6); this.ring.add(sp); }
    for (let i = 0; i < 5; i++) { const sp = new THREE.Sprite(mat); sp.scale.setScalar(4 - i * 0.5); sp.userData.beam = i; this.ring.add(sp); }
    this.ring.visible = false;
    scene.add(this.ring);
    this.active = null;
  }

  offer(farmId) { return HERD_FARMS.includes(farmId) ? { reward: 350, n: N } : null; }

  start(farmId, playerPos) {
    const f = FARMS.find((x) => x.id === farmId), b = BOARDS[farmId] || [0, 20];
    const c = Math.cos(f.rot * Math.PI / 180), s = Math.sin(f.rot * Math.PI / 180);
    const pen = { x: f.x + (b[0] * c + b[1] * s) * 0.55, z: f.z + (-b[0] * s + b[1] * c) * 0.55 };
    // the herd grazes out in the fields, away from the player
    const T = this.terrain;
    let hx = 0, hz = 0;
    for (let tries = 0; tries < 60; tries++) {
      const a = Math.random() * Math.PI * 2, d = 150 + Math.random() * 60;
      hx = pen.x + Math.cos(a) * d; hz = pen.z + Math.sin(a) * d;
      if (Math.abs(hx) < T.half - 60 && Math.abs(hz) < T.half - 60 && T.slopeAt(hx, hz) < 0.18 && T.roadWeight(hx, hz) < 0.05) break;
    }
    const cows = [];
    for (let i = 0; i < N; i++) {
      const o = this.lib.clone('cow');
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
      const mixer = new THREE.AnimationMixer(o), acts = {};
      for (const [k, clip] of Object.entries(this.clips)) if (clip) acts[k] = mixer.clipAction(clip);
      const cow = { o, mixer, acts, x: hx + (Math.random() - 0.5) * 14, z: hz + (Math.random() - 0.5) * 14, vx: 0, vz: 0, yaw: Math.random() * 6, penned: false };
      this._anim(cow, 'eat');
      this.scene.add(o);
      cows.push(cow);
    }
    this.active = { farm: f, pen, cows, t: 0, penned: 0 };
    const y = T.heightAt(pen.x, pen.z);
    this.ring.children.forEach((sp, i) => {
      if (sp.userData.beam !== undefined) sp.position.set(pen.x, y + 3 + sp.userData.beam * 7, pen.z);
      else { const a = i / 20 * Math.PI * 2, x = pen.x + Math.cos(a) * R_PEN, z = pen.z + Math.sin(a) * R_PEN; sp.position.set(x, T.heightAt(x, z) + 0.6, z); }
    });
    this.ring.visible = true;
    this.audio.play('cow_moo_1', { volume: 0.8 });
    this.hud.toast('Sığır Gütme', `${N} inek kaçtı!`, 'Haritada ▼ işaretli sürüyü bul, arkalarından sürerek ağıla (sarı halka) it. Çok yaklaşma, dağılırlar!');
  }

  cancel() {
    if (!this.active) return;
    for (const c of this.active.cows) this.scene.remove(c.o);
    this.active = null; this.ring.visible = false;
  }

  _anim(c, name) {
    if (c.cur === name) return;
    const a = c.acts[name] || c.acts.idle;
    a.reset().fadeIn(0.3).play();
    if (c.curA) c.curA.fadeOut(0.3);
    c.curA = a; c.cur = name;
  }

  update(dt, car, carSpeed) {
    const a = this.active;
    if (!a) return null;
    a.t += dt;
    const T = this.terrain, pen = a.pen;
    let cx = 0, cz = 0, n = 0;
    for (const c of a.cows) if (!c.penned) { cx += c.x; cz += c.z; n++; }
    if (n) { cx /= n; cz /= n; }
    for (const c of a.cows) {
      let ax = 0, az = 0, speedWant = 0;
      if (c.penned) {
        // mill about inside the ring
        const tx = pen.x + Math.cos(c.yaw) * 4 - c.x, tz = pen.z + Math.sin(c.yaw) * 4 - c.z;
        ax = tx * 0.2; az = tz * 0.2; speedWant = Math.hypot(tx, tz) > 1 ? 1 : 0;
      } else {
        const dx = c.x - car.x, dz = c.z - car.z, d = Math.hypot(dx, dz);
        if (d < 24) { const k = (1 - d / 24) * (carSpeed > 1 ? 1.6 : 0.8); ax += dx / d * k * 6; az += dz / d * k * 6; speedWant = 2 + k * 4; }
        // stay with the herd, but not on top of each other
        ax += (cx - c.x) * 0.06; az += (cz - c.z) * 0.06;
        for (const o of a.cows) { if (o === c) continue; const ox = c.x - o.x, oz = c.z - o.z, od = Math.hypot(ox, oz); if (od < 2.6 && od > 0.01) { ax += ox / od * 2; az += oz / od * 2; } }
        if (Math.hypot(c.x - pen.x, c.z - pen.z) < R_PEN - 1) {
          c.penned = true; a.penned++;
          this.audio.play(Math.random() < 0.5 ? 'cow_moo_1' : 'cow_moo_2', { position: c.o.position, volume: 0.9, maxDist: 150 });
          this.hud.popup(`İnek ağılda! <small>${a.penned}/${N}</small>`, 'info');
        }
      }
      const al = Math.hypot(ax, az);
      const want = Math.min(6, speedWant);
      const tvx = al > 0.01 ? ax / al * want : 0, tvz = al > 0.01 ? az / al * want : 0;
      c.vx += (tvx - c.vx) * Math.min(1, dt * 2.5); c.vz += (tvz - c.vz) * Math.min(1, dt * 2.5);
      // steep ground slows them down
      const sp = Math.hypot(c.vx, c.vz), slow = T.slopeAt(c.x, c.z) > 0.35 ? 0.4 : 1;
      c.x += c.vx * dt * slow; c.z += c.vz * dt * slow;
      if (sp > 0.3) { const ty = Math.atan2(c.vx, c.vz); let dy = ty - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, dt * 5); }
      this._anim(c, sp > 3.2 ? 'run' : sp > 0.4 ? 'walk' : (c.penned ? 'idle' : 'eat'));
      c.o.position.set(c.x, T.heightAt(c.x, c.z), c.z);
      c.o.rotation.y = c.yaw;
      c.mixer.update(dt);
    }
    this.ring.children.forEach((sp, i) => { sp.material.opacity = 0.45 + Math.sin(a.t * 3 + i) * 0.15; });
    if (a.penned >= N) {
      const bonus = a.t < TIME ? Math.round((TIME - a.t) * 1.5) : 0, pay = 350 + bonus;
      this.progress.addMoney(pay);
      this.progress.stat('herds', 1);
      this.hud.toast('Sürü Ağılda!', `+$${pay}`, bonus ? `Hız bonusu $${bonus}` : 'Biraz uzun sürdü ama hepsi evde.');
      this.audio.play('discover', { bus: 'ui', volume: 0.8 });
      const done = a.cows; setTimeout(() => done.forEach((c) => this.scene.remove(c.o)), 20000);
      this.active = null; this.ring.visible = false;
      this.onDone?.();
      return null;
    }
    const left = Math.max(0, TIME - a.t);
    this.hud.objective({ title: 'Sığır Gütme', lines: [`Ağılda: ${a.penned} / ${N}`, left > 0 ? `Bonus için ${Math.ceil(left)} sn` : 'Bonus süresi doldu'] });
    return { target: n && Math.hypot(car.x - cx, car.z - cz) > 40 ? [cx, cz] : [pen.x, pen.z] };
  }
}
