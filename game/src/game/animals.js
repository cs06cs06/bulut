import * as THREE from 'three';

// Simple wandering/fleeing animal AI driving the Quaternius skeletal animations.
const SPEEDS = { cow: [1.0, 5.5], bull: [1.0, 5.5], horse: [1.4, 9], horse_white: [1.4, 9], donkey: [1.0, 6], alpaca: [1.1, 6], deer: [1.3, 10], chicken: [0.6, 2.6] };
const SOUNDS = { cow: ['cow_moo_1', 'cow_moo_2'], bull: ['cow_moo_2'], chicken: ['chickens'] };

export class Animal {
  constructor({ lib, model, area, terrain, rand, wild }) {
    this.model = model; this.area = area; this.terrain = terrain; this.rand = rand; this.wild = wild;
    const s = 0.9 + rand() * 0.2;
    this.object = lib.clone(model, s);
    this.object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.mixer = new THREE.AnimationMixer(this.object);
    const clips = lib.gltf[model].animations;
    const find = (...res) => { for (const re of res) { const c = clips.find(a => re.test(a.name)); if (c) return c; } return null; };
    this.actions = {
      idle: find(/^idle$/i, /idle/i), walk: find(/^walk$/i, /walk/i), run: find(/gallop$/i, /run/i, /walk/i),
      eat: find(/eat/i, /headlow/i, /idle/i),
    };
    for (const k in this.actions) if (this.actions[k]) this.actions[k] = this.mixer.clipAction(this.actions[k]);
    this.state = 'idle'; this.current = null;
    this.speeds = SPEEDS[model] || [1, 5];
    this.timer = rand() * 5;
    this.heading = rand() * Math.PI * 2;
    const p = this._randomPoint();
    this.pos = new THREE.Vector3(p[0], 0, p[1]);
    this.target = null;
    this.speed = 0;
    this.soundTimer = 5 + rand() * 25;
    this._play('idle');
    this.mixer.update(rand() * 3);
    this._place();
  }

  _randomPoint() {
    const a = this.area, lx = (this.rand() * 2 - 1) * a.hw, lz = (this.rand() * 2 - 1) * a.hd;
    const c = Math.cos(a.rot), s = Math.sin(a.rot);
    return [a.cx + lx * c + lz * s, a.cz - lx * s + lz * c];
  }

  _inside(x, z) {
    const a = this.area, dx = x - a.cx, dz = z - a.cz, c = Math.cos(a.rot), s = Math.sin(a.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) <= a.hw && Math.abs(lz) <= a.hd;
  }

  _play(name) {
    const act = this.actions[name] || this.actions.idle;
    if (!act || act === this.current) return;
    act.reset().setEffectiveWeight(1).fadeIn(0.35).play();
    if (this.current) this.current.fadeOut(0.35);
    this.current = act;
    this.state = name;
  }

  update(dt, playerPos, playerSpeed, audio) {
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    if (d > 380) { this.object.visible = false; return; }
    this.object.visible = true;
    const scare = this.wild ? (d < 30 && playerSpeed > 1.5) || d < 12 : d < 9 && playerSpeed > 1;
    if (scare) {
      // run directly away from the player
      const ax = this.pos.x - playerPos.x, az = this.pos.z - playerPos.z, l = Math.hypot(ax, az) || 1;
      let tx = this.pos.x + ax / l * 25, tz = this.pos.z + az / l * 25;
      if (!this.wild && !this._inside(tx, tz)) { const p = this._randomPoint(); tx = p[0]; tz = p[1]; }
      this.target = [tx, tz]; this.fleeing = 2.5;
    }
    this.fleeing = Math.max(0, (this.fleeing || 0) - dt);
    this.timer -= dt;
    if (!this.target && this.timer <= 0) {
      if (this.rand() < 0.55) { const p = this._randomPoint(); this.target = p; }
      else { this._play(this.rand() < 0.5 ? 'eat' : 'idle'); this.timer = 4 + this.rand() * 8; }
    }
    let want = 0;
    if (this.target) {
      const dx = this.target[0] - this.pos.x, dz = this.target[1] - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist < 1.2) { this.target = null; this.timer = 3 + this.rand() * 6; this._play(this.rand() < 0.6 ? 'eat' : 'idle'); }
      else {
        const h = Math.atan2(dx, dz);
        let dh = h - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.heading += dh * Math.min(1, dt * (this.fleeing > 0 ? 6 : 2.5));
        want = this.fleeing > 0 ? this.speeds[1] : this.speeds[0];
        if (Math.abs(dh) > 1.2) want *= 0.3;
      }
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 3);
    if (this.speed > 0.05) {
      const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt, nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
      if (this.wild || this._inside(nx, nz)) { this.pos.x = nx; this.pos.z = nz; } else { this.target = null; this.speed = 0; }
      const run = this.speed > this.speeds[0] * 1.8;
      this._play(run ? 'run' : 'walk');
      if (this.current) this.current.timeScale = run ? this.speed / this.speeds[1] * 1.1 : Math.max(0.4, this.speed / this.speeds[0]);
    } else if (this.state === 'walk' || this.state === 'run') { this._play('idle'); if (this.current) this.current.timeScale = 1; }
    this.mixer.update(d < 160 ? dt : dt * 0.5);
    this._place();
    // vocalisations
    this.soundTimer -= dt;
    if (this.soundTimer <= 0 && audio && SOUNDS[this.model]) {
      this.soundTimer = 12 + this.rand() * 30;
      const list = SOUNDS[this.model];
      audio.play(list[Math.floor(this.rand() * list.length)], { position: this.pos, volume: this.model === 'chicken' ? 0.35 : 0.7, maxDist: 160, bus: 'amb', rate: 0.92 + this.rand() * 0.16 });
    }
  }

  _place() {
    const y = this.terrain.heightAt(this.pos.x, this.pos.z);
    this.pos.y = y;
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.heading;
  }
}
