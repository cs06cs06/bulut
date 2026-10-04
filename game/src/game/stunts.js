import * as THREE from 'three';

// Speed traps on long straights and jump zones on the dirt kickers sculpted into the roads.
// Personal bests are stored in progress and pay out when improved.
const TRAPS = [[195, 1150], [850, 740], [1500, -560], [-1100, 505], [300, -150]];
const STARS_TRAP = [90, 110, 130];
const STARS_JUMP = [18, 32, 48];

export class StuntZones {
  constructor({ scene, lib, terrain, hud, progress, audio, glowTex }) {
    Object.assign(this, { terrain, hud, progress, audio });
    this.group = new THREE.Group(); this.group.name = 'stunts'; scene.add(this.group);
    const roads = terrain.roads.roads;
    const snap = (x, z) => {
      let best = null, bd = Infinity;
      for (const r of roads) for (let i = 0; i < r.points.length; i++) { const p = r.points[i]; const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = { p, r, i }; } }
      return best;
    };
    const marker = (x, z, color, model, scale) => {
      const y = terrain.heightAt(x, z);
      const o = lib.clone(model, scale); o.position.set(x + 6, terrain.heightAt(x + 6, z), z);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(10, 10, 1); glow.position.set(x, y + 1.5, z);
      this.group.add(o, glow);
      return glow;
    };
    this.traps = TRAPS.map(([x, z], i) => {
      const s = snap(x, z);
      return { id: 'trap' + i, x: s.p[0], z: s.p[1], glow: marker(s.p[0], s.p[1], 0x7fd4ff, 'sign', 1.1), inside: false, max: 0 };
    });
    this.jumps = terrain.kickers.map((k, i) => {
      // the arrow sign stands beside the run-up, pointing along the jump
      const bx = k.x - k.dx * 22 + k.dz * 7, bz = k.z - k.dz * 22 - k.dx * 7;
      const glow = marker(k.x - k.dx * 6, k.z - k.dz * 6, 0xffa04a, 'arrow', 1.1);
      const sign = this.group.children[this.group.children.length - 2];
      sign.position.set(bx, terrain.heightAt(bx, bz), bz);
      sign.rotation.y = Math.atan2(k.dx, k.dz) - Math.PI / 2;
      return { id: 'jump' + i, x: k.x, z: k.z, glow };
    });
    this.pending = null; // {id, x, z, t}
    this.flight = null;
  }

  _stars(v, th) { return v >= th[2] ? 3 : v >= th[1] ? 2 : v >= th[0] ? 1 : 0; }

  _record(id, value, th, label, unit) {
    const P = this.progress, bests = P.data.bests || (P.data.bests = {});
    const prev = bests[id] || 0;
    const stars = this._stars(value, th), prevStars = this._stars(prev, th);
    const starTxt = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    if (value > prev) {
      bests[id] = value;
      const money = Math.round((value - prev) * (unit === 'm' ? 4 : 2)) + (stars - prevStars) * 100;
      P.addMoney(money);
      this.hud.popup(`${label} ${Math.round(value)} ${unit} ${starTxt} <small>REKOR +$${money}</small>`);
      this.audio.play('ui_switch', { bus: 'ui', volume: 0.8, rate: 1.3 });
    } else this.hud.popup(`${label} ${Math.round(value)} ${unit} <small>rekor ${Math.round(prev)}</small>`, 'info');
    P.save();
  }

  update(dt, v) {
    const pos = v.position;
    const t = performance.now() * 0.001;
    for (const z of [...this.traps, ...this.jumps]) z.glow.material.opacity = 0.25 + Math.sin(t * 3 + z.x) * 0.1;
    // speed traps: best speed while within 14 m
    for (const tr of this.traps) {
      const d = Math.hypot(pos.x - tr.x, pos.z - tr.z);
      if (d < 14) { tr.inside = true; tr.max = Math.max(tr.max, v.speed * 3.6); }
      else if (tr.inside) {
        tr.inside = false;
        if (tr.max > 40) { this._record(tr.id, tr.max, STARS_TRAP, 'HIZ KAPANI', 'km/sa'); this.progress.stat('maxTrap', tr.max, 'max'); }
        tr.max = 0;
      }
    }
    // jump zones: airborne shortly after crossing → horizontal distance until landing
    for (const j of this.jumps) if (Math.hypot(pos.x - j.x, pos.z - j.z) < 12 && v.speed > 8) this.pending = { id: j.id, t: 1.2 };
    if (this.pending) {
      this.pending.t -= dt;
      if (v.contacts === 0 && !this.flight) this.flight = { id: this.pending.id, x: pos.x, z: pos.z };
      if (this.pending.t <= 0 && !this.flight) this.pending = null;
    }
    if (this.flight && v.contacts >= 2) {
      const dist = Math.hypot(pos.x - this.flight.x, pos.z - this.flight.z);
      if (dist > 6) { this._record(this.flight.id, dist, STARS_JUMP, 'ATLAMA', 'm'); this.progress.stat('maxJump', dist, 'max'); }
      this.flight = null; this.pending = null;
    }
  }
}
