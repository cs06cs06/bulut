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
  reset() {
    this.save = { found: [], collected: [], best: {} }; this._store();
    for (const c of CHALLENGES) try { localStorage.removeItem(this._ghostKey(c.id)); } catch { /* ignore */ }
  }

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
    this.challenges = CHALLENGES.map((c0) => {
      // snap the start onto the nearest road sample
      let s = c0.start, bd = Infinity;
      for (const r of this.roads.roads) for (const p of r.points) {
        const d = (p[0] - c0.start.x) ** 2 + (p[1] - c0.start.z) ** 2;
        if (d < bd) { bd = d; s = { ...c0.start, x: p[0], z: p[1] }; }
      }
      const c = { ...c0, start: s };
      let route;
      if (c.checkpoints === 'spiral' || c.checkpoints === 'spiralDown') {
        const sp = this.roads.roads.find(r => r.name === 'Zirve Yolu').points;
        route = [];
        if (c.checkpoints === 'spiral') for (let i = 60; i < sp.length - 1; i += 60) route.push([sp[i][0], sp[i][1]]);
        else for (let i = sp.length - 60; i > 0; i -= 60) route.push([sp[i][0], sp[i][1]]);
        route.push([c.finish.x, c.finish.z]);
      } else route = c.route;
      // flag and sign stand beside the start line, perpendicular to the direction of the first gate
      const r0 = route[0];
      const fl = Math.hypot(r0[0] - s.x, r0[1] - s.z) || 1, fx = (r0[0] - s.x) / fl, fz = (r0[1] - s.z) / fl;
      const flag = this.lib.clone('flag');
      flag.position.set(s.x + fz * 7, this.terrain.heightAt(s.x + fz * 7, s.z - fx * 7), s.z - fx * 7);
      const sign = this.lib.clone('billboard');
      const sx = s.x - fz * 9 + fx * 4, sz = s.z + fx * 9 + fz * 4;
      sign.position.set(sx, this.terrain.heightAt(sx, sz), sz);
      sign.rotation.y = Math.atan2(fx, fz) + Math.PI / 2;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff7a50, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(14, 14, 1); glow.position.set(s.x, this.terrain.heightAt(s.x, s.z) + 2, s.z);
      this.group.add(flag, sign, glow);
      // medal times from route length (uphill is slower, downhill a bit faster)
      let len = 0, px = c.start.x, pz = c.start.z;
      for (const [x, z] of route) { len += Math.hypot(x - px, z - pz); px = x; pz = z; }
      const k = c.checkpoints === 'spiral' ? 0.8 : c.checkpoints === 'spiralDown' ? 0.95 : 1;
      const medals = { gold: len / (21 * k), silver: len / (16.5 * k), bronze: len / (11.5 * k) };
      return { ...c, route, glow, len, medals };
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
    const s = c.start, first = c.route[0];
    const heading = Math.atan2(first[0] - s.x, first[1] - s.z); // face the first gate
    vehicle.reset({ x: s.x, y: this.terrain.heightAt(s.x, s.z) + 1.2, z: s.z }, heading);
    this.active = { c, index: 0, t: 0, countdown: 3, rec: [], recT: 0 };
    this._placeGate();
    this._startGhost(c.id);
    this.audio.play('ui_switch', { bus: 'ui', volume: 0.8 });
  }

  cancelChallenge() {
    if (!this.active) return;
    this.active = null; this.gate.visible = false;
    this._stopGhost();
    this.hud.challenge(null);
    this.hud.toast('Görev iptal edildi', '', 'Bir dahaki sefere!');
  }

  // ------------------------------------------------------------ ghost of the best run
  _ghostKey(id) { return 'tozlu-yollar-ghost-' + id; }

  _recordGhost(a, vehicle, dt) {
    a.recT -= dt;
    if (a.recT > 0) return;
    a.recT = 0.1;
    const p = vehicle.object.position, q = vehicle.object.quaternion;
    a.rec.push(+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3));
  }

  _saveGhost(id, data) { try { localStorage.setItem(this._ghostKey(id), JSON.stringify(data)); } catch { /* quota */ } }

  _startGhost(id) {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(this._ghostKey(id)) || 'null'); } catch { data = null; }
    if (!data || data.length < 14) { this.ghostData = null; return; }
    this.ghostData = data;
    if (!this.ghost) {
      this.ghost = this.lib.clone('pickup');
      const mat = new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.32, depthWrite: false });
      this.ghost.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
      this.group.add(this.ghost);
    }
    this.ghost.visible = false;
  }

  _playGhost(t) {
    const d = this.ghostData;
    if (!d || !this.ghost) return;
    const n = d.length / 7, f = t / 0.1, i = Math.floor(f);
    if (i >= n - 1) { this.ghost.visible = false; return; }
    const k = f - i, o = i * 7, o2 = o + 7;
    this.ghost.visible = true;
    this.ghost.position.set(d[o] + (d[o2] - d[o]) * k, d[o + 1] + (d[o2 + 1] - d[o + 1]) * k, d[o + 2] + (d[o2 + 2] - d[o + 2]) * k);
    _qa.set(d[o + 3], d[o + 4], d[o + 5], d[o + 6]); _qb.set(d[o2 + 3], d[o2 + 4], d[o2 + 5], d[o2 + 6]);
    this.ghost.quaternion.slerpQuaternions(_qa, _qb, k);
  }

  _stopGhost() { if (this.ghost) this.ghost.visible = false; this.ghostData = null; }

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
        this.onDiscover?.(p);
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
      this._recordGhost(a, vehicle, dt);
      this._playGhost(a.t);
      this.gate.userData.arrow.rotation.y += dt * 2;
      this.gate.userData.arrow.position.y = 6 + Math.sin(this.time * 3) * 0.4;
      const p = a.c.route[a.index];
      if (Math.hypot(pos.x - p[0], pos.z - p[1]) < 12) {
        a.index++;
        this.audio.play('ui_switch', { bus: 'ui', volume: 0.9, rate: 1.2 });
        if (a.index >= a.c.route.length) {
          const best = this.save.best[a.c.id];
          const rec = !best || a.t < best;
          if (rec) { this.save.best[a.c.id] = a.t; this._store(); this._saveGhost(a.c.id, a.rec); }
          this._stopGhost();
          const m = a.c.medals;
          const medal = a.t <= m.gold ? 'gold' : a.t <= m.silver ? 'silver' : a.t <= m.bronze ? 'bronze' : null;
          const names = { gold: 'Altın', silver: 'Gümüş', bronze: 'Bronz' };
          this.hud.toast(medal ? `${names[medal]} Madalya${rec ? ' · Rekor!' : ''}` : (rec ? 'Yeni Rekor!' : 'Tamamlandı'), fmt(a.t),
            `${a.c.name} · Altın ${fmt(m.gold)} · Gümüş ${fmt(m.silver)} · Bronz ${fmt(m.bronze)}`);
          this.audio.play('discover', { bus: 'ui', volume: 0.8 });
          this.onChallengeDone?.(a.c, a.t, medal);
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

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

export function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
