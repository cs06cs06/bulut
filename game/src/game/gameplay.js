import * as THREE from 'three';
import { POIS, CHALLENGES, FARMS } from '../world/layout.js';
import { mulberry32 } from '../util/noise.js';

// Discoveries, pumpkin collectibles and timed challenges. Progress persists in localStorage.
const SAVE_KEY = 'tozlu-yollar-save-v1';

export class Gameplay {
  constructor({ scene, terrain, lib, tex, hud, audio, roads }) {
    this.scene = scene; this.terrain = terrain; this.lib = lib; this.hud = hud; this.audio = audio; this.roads = roads;
    this.save = this._load();
    this.group = new THREE.Group(); this.group.name = 'gameplay'; scene.add(this.group);
    this.sparkleTex = tex.star; this.glowTex = tex.glow;
    this._collectibles();
    this._challengeMarkers();
    this.active = null;
    this.time = 0;
  }

  _load() {
    try { return Object.assign({ found: [], collected: [], best: {} }, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); }
    catch { return { found: [], collected: [], best: {} }; }
  }
  _store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* private mode */ } }
  reset() { this.save = { found: [], collected: [], best: {} }; this._store(); }

  get pois() { return POIS; }
  isFound(id) { return this.save.found.includes(id); }

  // ------------------------------------------------------------ collectibles
  _collectibles() {
    const rnd = mulberry32(777);
    const T = this.terrain;
    const pts = [];
    let tries = 0;
    while (pts.length < 24 && tries++ < 5000) {
      const x = (rnd() * 2 - 1) * (T.half - 120), z = (rnd() * 2 - 1) * (T.half - 120);
      if (T.slopeAt(x, z) > 0.32) continue;
      if (pts.some(p => Math.hypot(p.x - x, p.z - z) < 380)) continue;
      if (FARMS.some(f => Math.hypot(f.x - x, f.z - z) < f.r + 10)) continue;
      pts.push({ x, z });
    }
    // a few hand-placed treats on the summit road and the butte
    pts.push({ x: -805 + 18, z: -831 + 10 }, { x: -1270, z: -360 }, { x: -700, z: 950 });
    this.pumpkins = pts.map((p, i) => {
      const o = this.lib.clone('pumpkin', 1.6);
      const y = T.heightAt(p.x, p.z);
      o.position.set(p.x, y + 1.1, p.z);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffc46b, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(3.4); glow.position.set(p.x, y + 1.3, p.z);
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkleTex, color: 0xfff1c0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      spark.scale.setScalar(2.2); spark.position.set(p.x, y + 2.6, p.z);
      const g = new THREE.Group(); g.add(o, glow, spark);
      const id = 'p' + i;
      g.visible = !this.save.collected.includes(id);
      this.group.add(g);
      return { id, g, o, spark, x: p.x, z: p.z, y };
    });
  }

  get collectedCount() { return this.save.collected.length; }
  get collectibleTotal() { return this.pumpkins.length; }

  // ------------------------------------------------------------ challenges
  _challengeMarkers() {
    this.challenges = CHALLENGES.map((c) => {
      const s = c.start;
      const flag = this.lib.clone('flag');
      flag.position.set(s.x + 5, this.terrain.heightAt(s.x + 5, s.z), s.z);
      const sign = this.lib.clone('billboard');
      sign.position.set(s.x - 5, this.terrain.heightAt(s.x - 5, s.z), s.z);
      sign.rotation.y = s.heading * Math.PI / 180;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff7a50, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(14, 14, 1); glow.position.set(s.x, this.terrain.heightAt(s.x, s.z) + 2, s.z);
      this.group.add(flag, sign, glow);
      let route;
      if (c.checkpoints === 'spiral') {
        const sp = this.roads.roads.find(r => r.name === 'Zirve Yolu').points;
        route = [];
        for (let i = 60; i < sp.length - 1; i += 60) route.push([sp[i][0], sp[i][1]]);
        route.push([c.finish.x, c.finish.z]);
      } else route = c.route;
      return { ...c, route, glow };
    });
    // checkpoint gate (two flags + arrow), repositioned for the active challenge
    this.gate = new THREE.Group();
    const fl = this.lib.clone('flag'), fr = this.lib.clone('flag');
    fl.position.x = -7; fr.position.x = 7;
    const arrow = this.lib.clone('arrow', 1.4);
    arrow.position.y = 6;
    arrow.rotation.z = -Math.PI / 2;
    const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x7fd4ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.scale.set(16, 16, 1); beam.position.y = 3;
    this.gate.add(fl, fr, arrow, beam);
    this.gate.userData.arrow = arrow;
    this.gate.visible = false;
    this.group.add(this.gate);
  }

  nearChallenge(pos) {
    if (this.active) return null;
    for (const c of this.challenges) if (Math.hypot(pos.x - c.start.x, pos.z - c.start.z) < 14) return c;
    return null;
  }

  startChallenge(c, vehicle) {
    const s = c.start;
    vehicle.reset({ x: s.x, y: this.terrain.heightAt(s.x, s.z) + 1.2, z: s.z }, s.heading * Math.PI / 180);
    this.active = { c, index: 0, t: 0, countdown: 3 };
    this._placeGate();
    this.audio.play('ui_switch', { bus: 'ui', volume: 0.8 });
  }

  cancelChallenge() {
    if (!this.active) return;
    this.active = null; this.gate.visible = false;
    this.hud.challenge(null);
    this.hud.toast('Görev iptal edildi', '', 'Bir dahaki sefere!');
  }

  _placeGate() {
    const a = this.active;
    const p = a.c.route[a.index];
    const prev = a.index > 0 ? a.c.route[a.index - 1] : [a.c.start.x, a.c.start.z];
    const ang = Math.atan2(p[0] - prev[0], p[1] - prev[1]);
    this.gate.position.set(p[0], this.terrain.heightAt(p[0], p[1]), p[1]);
    this.gate.rotation.y = ang + Math.PI / 2 - Math.PI / 2;
    this.gate.children[0].position.y = this.terrain.heightAt(p[0] - Math.cos(ang) * 7, p[1] + Math.sin(ang) * 7) - this.gate.position.y;
    this.gate.children[1].position.y = this.terrain.heightAt(p[0] + Math.cos(ang) * 7, p[1] - Math.sin(ang) * 7) - this.gate.position.y;
    this.gate.visible = true;
  }

  // ------------------------------------------------------------ update
  update(dt, vehicle) {
    this.time += dt;
    const pos = vehicle.position;
    // discoveries
    for (const p of POIS) {
      if (this.isFound(p.id)) continue;
      if (Math.hypot(pos.x - p.x, pos.z - p.z) < p.r) {
        this.save.found.push(p.id); this._store();
        this.hud.toast('Yeni Keşif', p.name, p.desc);
        this.audio.play('discover', { bus: 'ui', volume: 0.7 });
        this.hud.updateCounts(this);
      }
    }
    // pumpkins
    for (const k of this.pumpkins) {
      if (!k.g.visible) continue;
      k.o.rotation.y += dt * 1.2;
      k.o.position.y = k.y + 1.1 + Math.sin(this.time * 2 + k.x) * 0.25;
      k.spark.material.rotation += dt * 0.8;
      if (Math.hypot(pos.x - k.x, pos.z - k.z) < 4.5 && Math.abs(pos.y - k.y) < 6) {
        k.g.visible = false;
        this.save.collected.push(k.id); this._store();
        this.audio.play('ui_click', { bus: 'ui', volume: 1, rate: 1.2 });
        this.audio.play('discover', { bus: 'ui', volume: 0.35, rate: 1.5 });
        const n = this.collectedCount, tot = this.collectibleTotal;
        this.hud.toast(n === tot ? 'Hepsini Buldun!' : 'Balkabağı', `${n} / ${tot}`, n === tot ? 'Palouse’un tüm balkabakları senin.' : '');
        this.hud.updateCounts(this);
        this.onCollect?.(k);
      }
    }
    for (const c of this.challenges) c.glow.material.opacity = 0.35 + Math.sin(this.time * 3) * 0.15;
    // active challenge
    const a = this.active;
    if (a) {
      if (a.countdown > 0) {
        const before = Math.ceil(a.countdown);
        a.countdown -= dt;
        const after = Math.ceil(a.countdown);
        if (after !== before) this.audio.play('ui_click', { bus: 'ui', volume: 0.9, rate: after > 0 ? 1 : 1.5 });
        this.hud.challenge({ name: a.c.name, time: a.countdown > 0 ? String(after) : 'BAŞLA!', sub: `Kapı 0 / ${a.c.route.length}` });
        return { freeze: a.countdown > 0 };
      }
      a.t += dt;
      this.gate.userData.arrow.rotation.y += dt * 2;
      this.gate.userData.arrow.position.y = 6 + Math.sin(this.time * 3) * 0.4;
      const p = a.c.route[a.index];
      if (Math.hypot(pos.x - p[0], pos.z - p[1]) < 12) {
        a.index++;
        this.audio.play('ui_switch', { bus: 'ui', volume: 0.9, rate: 1.2 });
        if (a.index >= a.c.route.length) {
          const best = this.save.best[a.c.id];
          const rec = !best || a.t < best;
          if (rec) { this.save.best[a.c.id] = a.t; this._store(); }
          this.hud.toast(rec ? 'Yeni Rekor!' : 'Tamamlandı', fmt(a.t), rec ? a.c.name : `En iyi: ${fmt(best)}`);
          this.audio.play('discover', { bus: 'ui', volume: 0.8 });
          this.active = null; this.gate.visible = false; this.hud.challenge(null);
          return {};
        }
        this._placeGate();
      }
      const best = this.save.best[a.c.id];
      this.hud.challenge({ name: a.c.name, time: fmt(a.t), sub: `Kapı ${a.index} / ${a.c.route.length}${best ? ' · Rekor ' + fmt(best) : ''}` });
      this.nextTarget = p;
    } else this.nextTarget = null;
    return {};
  }
}

export function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
