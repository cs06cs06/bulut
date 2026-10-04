import * as THREE from 'three';
import { FARMS } from './layout.js';

// Birds: flocks circling high over the farms, and low flocks skimming the fields that
// scatter upwards when a car drives underneath. Pigeon model (CC0) with its own flap / idle clips.
const _v = new THREE.Vector3();

export class Birds {
  constructor({ scene, lib, terrain, flocks = 5, perFlock = 9, ground = 6 }) {
    Object.assign(this, { scene, lib, terrain });
    const g = lib.gltf.bird;
    this.clips = { flap: g.animations.find((a) => /flap/.test(a.name)), idle: g.animations.find((a) => /idle/.test(a.name)) };
    this.group = new THREE.Group(); this.group.name = 'birds';
    scene.add(this.group);
    this.birds = [];
    this.flocks = [];
    const rnd = mulberry(4242);
    // circling flocks: around farms and over open fields
    for (let f = 0; f < flocks; f++) {
      const farm = FARMS[f % FARMS.length];
      const cx = farm.x + (rnd() - 0.5) * 300, cz = farm.z + (rnd() - 0.5) * 300;
      const flock = { cx, cz, ox: cx, oz: cz, r: 40 + rnd() * 50, h: 28 + rnd() * 30, dir: rnd() < 0.5 ? 1 : -1, w: 0.18 + rnd() * 0.12, t: rnd() * 100, birds: [] };
      for (let i = 0; i < perFlock; i++) {
        const b = this._bird(1.7);
        b.mode = 'circle'; b.flock = flock;
        b.phase = (i / perFlock) * Math.PI * 2 * (0.25 + rnd() * 0.2) + rnd() * 0.3;
        b.dr = (rnd() - 0.5) * 16; b.dh = (rnd() - 0.5) * 7; b.bob = rnd() * 6;
        flock.birds.push(b);
      }
      this.flocks.push(flock);
    }
    // low flocks skim the fields along the roads and scatter upwards when a car passes underneath
    this.spots = [];
    for (let i = 0; i < ground; i++) {
      const farm = FARMS[(i * 3 + 1) % FARMS.length], a = rnd() * Math.PI * 2, d = farm.r + 60 + rnd() * 120;
      const cx = farm.x + Math.cos(a) * d, cz = farm.z + Math.sin(a) * d;
      const flock = { cx, cz, ox: cx, oz: cz, r: 18 + rnd() * 14, h: 7 + rnd() * 5, low: true, scare: 0, dir: rnd() < 0.5 ? 1 : -1, w: 0.35 + rnd() * 0.15, t: rnd() * 100, birds: [] };
      for (let k = 0; k < Math.max(4, perFlock - 3); k++) {
        const b = this._bird(1.4);
        b.mode = 'circle'; b.flock = flock;
        b.phase = rnd() * Math.PI * 2; b.dr = (rnd() - 0.5) * 10; b.dh = (rnd() - 0.5) * 3; b.bob = rnd() * 6;
        flock.birds.push(b);
      }
      this.flocks.push(flock);
    }
  }

  _bird(scale) {
    const o = this.lib.clone('bird', scale);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
    const mixer = new THREE.AnimationMixer(o);
    const fly = mixer.clipAction(this.clips.flap), idle = mixer.clipAction(this.clips.idle);
    fly.play(); fly.time = Math.random() * this.clips.flap.duration; fly.timeScale = 0.9 + Math.random() * 0.4;
    this.group.add(o);
    const b = { o, mixer, fly, idle, vel: new THREE.Vector3(), glide: 0 };
    this.birds.push(b);
    return b;
  }

  update(dt, time, camPos, carPos, carSpeed) {
    for (const f of this.flocks) {
      const near = Math.hypot(f.cx - camPos.x, f.cz - camPos.z) < 900;
      // low flocks: a car close underneath sends them climbing; they drift back down after a while
      if (f.low) {
        const dc = Math.hypot(f.cx - carPos.x, f.cz - carPos.z);
        if (dc < f.r + 22 && carSpeed > 4 && f.scare < 0.5) { f.scare = 1; this.onScatter?.(f); }
        f.scare = Math.max(0, f.scare - dt / 25);
      }
      const sc = f.low ? Math.min(1, f.scare * 1.6) : 0;
      f.t += dt * (1 + sc * 1.2);
      // the flock centre wanders around its home
      const wander = f.low ? 30 : 60;
      f.cx = f.ox + Math.sin(f.t * 0.05) * wander; f.cz = f.oz + Math.cos(f.t * 0.037) * wander;
      const gy = this.terrain.heightAt(f.cx, f.cz);
      for (const b of f.birds) {
        b.o.visible = near;
        if (!near) continue;
        const a = f.t * f.w * f.dir + b.phase, r = (f.r + b.dr) * (1 + sc * 0.8);
        const x = f.cx + Math.cos(a) * r, z = f.cz + Math.sin(a) * r, y = gy + f.h + sc * (30 + b.bob * 3) + b.dh * (1 + sc * 2) + Math.sin(f.t * 0.7 + b.bob) * 2.5;
        // face along the orbit, banked into the turn
        b.o.position.set(x, y, z);
        b.o.rotation.set(0, Math.atan2(-Math.sin(a) * f.dir, Math.cos(a) * f.dir), -0.35 * f.dir, 'YXZ');
        // alternate flapping and gliding
        b.glide -= dt;
        if (b.glide < -3 - (b.bob % 2)) b.glide = 1.5 + Math.random() * 2;
        b.fly.timeScale = sc > 0.2 ? 1.9 : b.glide > 0 ? 0 : 1.0;
        b.mixer.update(dt);
      }
    }
  }
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
