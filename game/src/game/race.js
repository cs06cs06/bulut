import * as THREE from 'three';
import { RACES } from '../world/layout.js';
import { VEHICLES } from './vehicle.js';
import { fmt } from './gameplay.js';

// Road races against three AI rivals. Rivals are kinematic: they follow the road with a
// curvature-based speed profile, change lanes to overtake, fly off crests and lean / squat
// with their own suspension, so they read as real cars without the cost of full physics.
const RIVALS = [
  { name: 'Hank', model: 'suv', color: 0xa3241c, skill: 1.0 },
  { name: 'Dolly', model: 'jeep', color: 0xd9c36a, skill: 0.97 },
  { name: 'Billy Ray', model: 'pickup', color: 0x24508f, skill: 0.94 },
];
const G = 9.81;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class Races {
  constructor({ scene, lib, terrain, physics, RAPIER, audio, hud, dust, progress, glowTex }) {
    Object.assign(this, { scene, lib, terrain, physics, R: RAPIER, audio, hud, dust, progress, glowTex });
    this.group = new THREE.Group(); this.group.name = 'races'; scene.add(this.group);
    this.races = RACES.map((def) => this._buildRace(def));
    this.active = null;
    this.time = 0;
  }

  // ------------------------------------------------------------ track geometry
  _buildRace(def) {
    const road = this.terrain.roads.roads.find((r) => r.name === def.road);
    const pts = road.points, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    const idx = (f) => { let i = 0; while (i < cum.length - 1 && cum[i] < f * L) i++; return i; };
    let a = idx(def.from), b = idx(def.to);
    let path = a < b ? pts.slice(a, b + 1) : pts.slice(b, a + 1).reverse();
    // resample every 2 m with heading, curvature and lateral (right-hand) vectors
    const P = [];
    let acc = 0;
    P.push({ x: path[0][0], z: path[0][1] });
    for (let i = 1; i < path.length; i++) {
      const dx = path[i][0] - path[i - 1][0], dz = path[i][1] - path[i - 1][1], l = Math.hypot(dx, dz);
      acc += l;
      while (acc >= 2) { acc -= 2; const t = 1 - acc / l; P.push({ x: path[i - 1][0] + dx * t, z: path[i - 1][1] + dz * t }); }
    }
    const n = P.length;
    for (let i = 0; i < n; i++) {
      const p0 = P[Math.max(0, i - 2)], p1 = P[Math.min(n - 1, i + 2)];
      const fx = p1.x - p0.x, fz = p1.z - p0.z, l = Math.hypot(fx, fz) || 1;
      P[i].fx = fx / l; P[i].fz = fz / l; P[i].s = i * 2;
      P[i].y = this.terrain.heightAt(P[i].x, P[i].z);
    }
    // curvature over ±8 m → corner speed, then a backwards braking pass
    const vmax = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const A = P[Math.max(0, i - 4)], B = P[Math.min(n - 1, i + 4)];
      let da = Math.atan2(B.fx, B.fz) - Math.atan2(A.fx, A.fz);
      da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      const k = da / 16 + 1e-4;
      const slope = (P[Math.min(n - 1, i + 3)].y - P[Math.max(0, i - 3)].y) / 12;
      vmax[i] = Math.min(36, Math.sqrt(7 / k)) * (slope > 0.08 ? 1 - Math.min(0.3, (slope - 0.08) * 2) : 1);
    }
    for (let i = n - 2; i >= 0; i--) vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[i + 1] ** 2 + 2 * 8 * 2));
    const len = (n - 1) * 2;
    // start: flag on each side + billboard, glow beacon; finish: two flags
    const s = P[4], e = P[n - 3], hw = road.width / 2 + 2.5;
    const flagAt = (p, side) => { const o = this.lib.clone('flag'); const x = p.x - p.fz * hw * side, z = p.z + p.fx * hw * side; o.position.set(x, this.terrain.heightAt(x, z), z); this.group.add(o); };
    flagAt(e, 1); flagAt(e, -1);
    flagAt(P[0], -1);
    const sign = this.lib.clone('billboard');
    const sx = P[0].x + P[0].fz * (hw + 5), sz = P[0].z - P[0].fx * (hw + 5);
    sign.position.set(sx, this.terrain.heightAt(sx, sz), sz);
    sign.rotation.y = Math.atan2(P[0].fx, P[0].fz) - Math.PI / 2;
    this.group.add(sign);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x7fd4ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(14, 14, 1); glow.position.set(s.x, s.y + 2, s.z);
    this.group.add(glow);
    const prize = Math.round(len / 2.2 / 50) * 50;
    return { ...def, P, vmax, len, notes: this._paceNotes(P), start: { x: P[0].x, z: P[0].z }, glow, prizes: [prize, Math.round(prize * 0.5 / 10) * 10, Math.round(prize * 0.25 / 10) * 10, 40], hw: road.width / 2 };
  }

  // co-driver pace notes (rally style): corners graded 1 (hairpin) … 6 (fast kink), crests and jumps
  _paceNotes(P) {
    const n = P.length, notes = [];
    const head = (i) => Math.atan2(P[Math.max(0, Math.min(n - 1, i))].fx, P[Math.max(0, Math.min(n - 1, i))].fz);
    const curv = (i) => { let d = head(i + 4) - head(i - 4); d = Math.atan2(Math.sin(d), Math.cos(d)); return d / 16; };
    let i = 6;
    while (i < n - 6) {
      const k = curv(i);
      if (Math.abs(k) > 1 / 320) {
        let j = i, kmax = 0; const sign = Math.sign(k);
        while (j < n - 6 && Math.sign(curv(j)) === sign && Math.abs(curv(j)) > 1 / 380) { kmax = Math.max(kmax, Math.abs(curv(j))); j++; }
        const R = 1 / kmax, sev = R >= 140 ? 6 : R >= 100 ? 5 : R >= 70 ? 4 : R >= 45 ? 3 : R >= 28 ? 2 : 1;
        const longC = (j - i) * 2 > 70;
        notes.push({ s: i * 2, dir: sign > 0 ? 'SOL' : 'SAĞ', sev, text: `${sign > 0 ? 'SOL' : 'SAĞ'} ${sev}${longC ? ' UZUN' : ''}${sev <= 2 ? ' !' : ''}` });
        i = j + 3;
        continue;
      }
      // crest: higher than 10 m behind and drops away ahead
      const y = P[i].y, yb = P[Math.max(0, i - 6)].y, yf = P[Math.min(n - 1, i + 6)].y;
      if (y - yb > 0.8 && y - yf > 1.2) {
        notes.push({ s: i * 2, dir: 'TÜMSEK', sev: 0, text: y - yf > 2.6 ? 'ATLAMA!' : 'TÜMSEK' });
        i += 15; continue;
      }
      i++;
    }
    // sign that the following stretch is straight
    for (let k = 0; k < notes.length - 1; k++) if (notes[k + 1].s - notes[k].s > 260) notes[k].text += ' · UZUN DÜZ';
    return notes;
  }

  nearRace(pos) {
    if (this.active) return null;
    for (const r of this.races) if (Math.hypot(pos.x - r.start.x, pos.z - r.start.z) < 16) return r;
    return null;
  }

  // sample the centre line at arc length s
  _at(r, s, out = {}) {
    const P = r.P, f = Math.max(0, Math.min(P.length - 1.001, s / 2)), i = Math.floor(f), t = f - i, a = P[i], b = P[i + 1];
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
    out.fx = a.fx + (b.fx - a.fx) * t; out.fz = a.fz + (b.fz - a.fz) * t;
    const l = Math.hypot(out.fx, out.fz) || 1; out.fx /= l; out.fz /= l;
    out.vmax = r.vmax[i] + (r.vmax[i + 1] - r.vmax[i]) * t;
    return out;
  }

  // project a world point onto the track near index hint → { s, d, dist, i }
  _project(r, x, z, hint) {
    const P = r.P;
    let best = hint, bd = Infinity;
    for (let i = Math.max(0, hint - 60); i < Math.min(P.length, hint + 90); i++) {
      const d = (P[i].x - x) ** 2 + (P[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    const p = P[best];
    const along = (x - p.x) * p.fx + (z - p.z) * p.fz, d = (x - p.x) * -p.fz + (z - p.z) * p.fx;
    return { s: Math.max(0, p.s + along), d, dist: Math.sqrt(bd), i: best };
  }

  // ------------------------------------------------------------ rival cars
  _makeRival(def, i) {
    const spec = VEHICLES[def.model];
    const root = new THREE.Group();
    const model = this.lib.clone(spec.model);
    model.scale.setScalar(spec.scale || 1);
    model.rotation.y = spec.yaw || 0;
    root.add(model);
    // own paint
    const re = spec.paint;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (Array.isArray(o.material)) o.material = o.material.map((m) => (re.test(m.name) ? recolor(m, def.color) : m));
      else if (re.test(o.material.name)) o.material = recolor(o.material, def.color);
    });
    root.updateMatrixWorld(true);
    // spinning wheels: top-most nodes named *wheel*
    const wheels = [];
    model.traverse((o) => {
      if (!/wheel/i.test(o.name) || !(o.isMesh || o.children.length)) return;
      for (let p = o.parent; p; p = p.parent) if (wheels.includes(p)) return;
      wheels.push(o);
    });
    const spins = wheels.map((w) => {
      const box = new THREE.Box3().setFromObject(w), c = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(w.parent.worldToLocal(c.clone()));
      w.parent.add(pivot);
      pivot.updateMatrixWorld(true);
      const wm = w.matrixWorld.clone().premultiply(pivot.matrixWorld.clone().invert());
      pivot.add(w); wm.decompose(w.position, w.quaternion, w.scale);
      return { pivot, radius: Math.max(0.2, (box.max.y - box.min.y) / 2) };
    });
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    // head / tail lights for night races
    const lights = new THREE.Group();
    const mk = (color, sc, x, y, z) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(sc); sp.position.set(x, y, z); lights.add(sp); };
    for (const sx of [-1, 1]) { mk(0xfff1c8, 1.6, sx * size.x * 0.33, ctr.y, box.max.z + 0.1); mk(0xff3020, 0.8, sx * size.x * 0.36, ctr.y, box.min.z - 0.05); }
    lights.visible = false;
    root.add(lights);
    const body = this.physics.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500, 0));
    const col = this.physics.createCollider(this.R.ColliderDesc.cuboid(size.x / 2 * 0.92, size.y / 2 * 0.8, size.z / 2 * 0.95)
      .setTranslation(ctr.x, ctr.y, ctr.z).setFriction(0.5), body);
    col.userData = { kind: 'rival' };
    this.group.add(root);
    const sound = this.audio.buffers.engine_mid ? this.audio.loop('engine_mid', 'sfx', { volume: 0 }) : null;
    return { ...def, root, model, spins, body, col, sound, lights, halfLen: size.z / 2, halfW: size.x / 2,
      s: 0, d: 0, dTarget: 0, v: 0, y: 0, vy: 0, air: 0, pitch: 0, roll: 0, susp: 0, suspV: 0, finished: null, hint: 0, idx: i };
  }

  _disposeRivals() {
    for (const c of this.active?.cars || []) {
      this.group.remove(c.root);
      this.physics.removeRigidBody(c.body);
      c.sound?.set(0, undefined, 0.1); const snd = c.sound; setTimeout(() => snd?.stop(), 400);
    }
  }

  // ------------------------------------------------------------ race flow
  start(r, vehicle) {
    const lane = r.hw * 0.45;
    const cars = RIVALS.map((def, i) => this._makeRival(def, i));
    // grid: two columns, 8 m rows; the player starts last (back right)
    const slots = [[14, -lane], [14, lane], [6, -lane], [6, lane]];
    cars.forEach((c, i) => { c.s = slots[i][0]; c.d = c.dTarget = slots[i][1]; this._placeCar(r, c, 0, true); });
    const p = this._at(r, slots[3][0]);
    const px = p.x - p.fz * slots[3][1], pz = p.z + p.fx * slots[3][1];
    vehicle.reset({ x: px, y: this.terrain.heightAt(px, pz) + 1.2, z: pz }, Math.atan2(p.fx, p.fz));
    vehicle._prevPos = null;
    this.active = { r, cars, t: 0, countdown: 3.5, player: { s: slots[3][0], hint: 3, finished: null }, results: null, offTrack: 0 };
    this.onStart?.(r);
    this.audio.play('ui_switch', { bus: 'ui', volume: 0.8 });
  }

  cancel(msg = 'Yarış iptal edildi') {
    if (!this.active) return;
    this._disposeRivals();
    this.active = null;
    this.hud.challenge(null); this.hud.pace(null);
    this.hud.toast(msg, '', 'Başlangıç bayrağına dönüp tekrar dene.');
    this.onEnd?.();
  }

  _finish(place) {
    const a = this.active, r = a.r;
    const money = r.prizes[place - 1] || 0;
    const races = this.progress.data.races || (this.progress.data.races = {});
    const prev = races[r.id];
    const firstWin = place === 1 && prev !== 1;
    if (!prev || place < prev) races[r.id] = place;
    this.progress.addMoney(money + (firstWin ? 300 : 0));
    if (place === 1) this.progress.stat('raceWins', 1);
    this.progress.daily('race');
    const rows = this._standings().map((e, i) => `${i + 1}. ${e.name}${e.t ? ' ' + fmt(e.t) : ''}`).join(' · ');
    const title = place === 1 ? 'Kazandın!' : `${place}. oldun`;
    this.hud.toast(title, r.name, `${rows} · +$${money}${firstWin ? ' (+$300 ilk zafer)' : ''}`);
    this.audio.play('discover', { bus: 'ui', volume: 0.9, rate: place === 1 ? 1 : 0.85 });
    a.results = { place, t: 6 };
    const st = this._standings();
    this.onFinish?.(place, r.id, st.findIndex((e) => e.me) < st.findIndex((e) => e.name === 'Hank'));
  }

  _standings() {
    const a = this.active;
    const list = a.cars.map((c) => ({ name: c.name, s: c.s, t: c.finished }));
    list.push({ name: 'Sen', s: a.player.s, t: a.player.finished, me: true });
    return list.sort((x, y) => (x.t && y.t ? x.t - y.t : x.t ? -1 : y.t ? 1 : y.s - x.s));
  }

  // ------------------------------------------------------------ per-frame
  update(dt, vehicle) {
    this.time += dt;
    for (const r of this.races) r.glow.material.opacity = this.active ? 0.15 : 0.35 + Math.sin(this.time * 3 + 1) * 0.15;
    const a = this.active;
    if (!a) return null;
    const r = a.r, pos = vehicle.position;
    // player progress: only while close to the road, no teleporting ahead
    const pr = this._project(r, pos.x, pos.z, a.player.hint);
    if (pr.dist < 30 && pr.s - a.player.s < 40) { a.player.s = Math.max(a.player.s, pr.s); a.player.hint = pr.i; }
    a.player.d = pr.d;
    a.offTrack = pr.dist > 120 ? a.offTrack + dt : 0;
    if (a.offTrack > 4) { this.cancel('Parkurdan çıktın'); return null; }

    if (a.countdown > 0) {
      const before = Math.ceil(a.countdown);
      a.countdown -= dt;
      const after = Math.ceil(a.countdown);
      if (after !== before && after <= 3) this.audio.play('ui_click', { bus: 'ui', volume: 0.9, rate: after > 0 ? 1 : 1.6 });
      for (const c of a.cars) this._placeCar(r, c, dt, false);
      this.hud.challenge({ name: r.name, time: after > 3 ? 'HAZIR' : after > 0 ? String(after) : 'BAŞLA!', sub: `${a.cars.length + 1} araç · ${(r.len / 1000).toFixed(1)} km`, rows: this._rowsHTML() });
      return { freeze: a.countdown > 0 };
    }
    a.t += dt;
    if (!a.player.finished && a.player.s >= r.len - 6) { a.player.finished = a.t; this._finish(this._standings().findIndex((e) => e.me) + 1); }
    // rivals
    const others = [...a.cars.map((c) => ({ s: c.s, d: c.d, v: c.v, ref: c })), { s: a.player.s, d: a.player.d, v: vehicle.speed, ref: null, px: pos.x, pz: pos.z }];
    const lead = Math.max(...a.cars.map((c) => c.s));
    for (const c of a.cars) {
      if (c.finished && a.t - c.finished > 4) { c.v = Math.max(0, c.v - dt * 6); }
      const p = this._at(r, c.s + c.v * 0.9 + 4);
      let want = p.vmax * c.skill;
      // rubber band: keep the pack together around the player
      const gap = c.s - a.player.s;
      want *= gap > 60 ? 0.93 : gap < -80 ? 1.08 : 1;
      if (c.s === lead && gap > 0) want *= 0.985;
      // traffic ahead: overtake on the other lane or tuck in behind
      for (const o of others) {
        if (o.ref === c) continue;
        const ds = o.s - c.s;
        if (ds > 0 && ds < 14 && Math.abs(o.d - c.d) < 2.4) {
          const other = o.d > 0 ? -r.hw * 0.45 : r.hw * 0.45;
          const blocked = others.some((q) => q !== o && q.ref !== c && Math.abs(q.s - c.s) < 12 && Math.abs(q.d - other) < 2.2);
          if (!blocked && c.v > o.v - 0.5) c.dTarget = other;
          else want = Math.min(want, o.v * (ds < 7 ? 0.85 : 1));
        }
        // bumped by the player: get shoved aside and lose speed
        if (!o.ref) {
          const dx = c.root.position.x - o.px, dz = c.root.position.z - o.pz, dd = Math.hypot(dx, dz);
          if (dd < c.halfW + 1.6) { c.d += Math.sign(c.d - o.d || 1) * dt * 4; c.v *= 1 - dt * 1.5; }
        }
      }
      if (c.finished) want = Math.min(want, 8);
      const accel = want > c.v ? 4.2 * (1 - c.v / 42) : -9;
      const v0 = c.v;
      c.v = Math.max(0, c.v + accel * dt);
      if ((accel > 0 && c.v > want) || (accel < 0 && c.v < want)) c.v = want;
      c.accel = (c.v - v0) / Math.max(dt, 1e-4);
      c.s = Math.min(r.len + 30, c.s + c.v * dt);
      c.d += (c.dTarget - c.d) * Math.min(1, dt * 1.2);
      c.d = THREE.MathUtils.clamp(c.d, -r.hw + 0.8, r.hw - 0.8);
      if (!c.finished && c.s >= r.len - 6) c.finished = a.t;
      this._placeCar(r, c, dt, false);
    }
    // HUD
    const st = this._standings(), me = st.findIndex((e) => e.me) + 1;
    if (a.results) {
      a.results.t -= dt;
      if (a.results.t <= 0) { this._disposeRivals(); this.active = null; this.hud.challenge(null); this.hud.pace(null); this.onEnd?.(); return null; }
    }
    this.hud.challenge({ name: r.name, time: a.player.finished ? `${me}. / ${st.length}` : `${me}. / ${st.length}`, sub: `${fmt(a.player.finished || a.t)} · ${Math.max(0, Math.round(r.len - a.player.s))} m`, rows: this._rowsHTML(st) });
    const ahead = this._at(r, Math.min(r.len, a.player.s + 120));
    // next two pace notes within 260 m
    const up = r.notes.filter((n) => n.s > a.player.s + 5 && n.s < a.player.s + 260).slice(0, 2);
    if (up[0] && up[0] !== a.lastNote) { a.lastNote = up[0]; this.audio.play('ui_click', { bus: 'ui', volume: 0.35, rate: 1.8 }); }
    this.hud.pace(up.map((n) => ({ ...n, d: Math.round(n.s - a.player.s) })));
    return { target: [ahead.x, ahead.z], cars: a.cars };
  }

  _rowsHTML(st = this._standings()) {
    const meS = st.find((e) => e.me).s;
    return st.map((e, i) => `<div class="rr${e.me ? ' me' : ''}"><b>${i + 1}</b>${e.name}<span>${e.t ? fmt(e.t) : e.me ? '' : (Math.abs(e.s - meS) < 1 ? '—' : (e.s > meS ? '+' : '−') + Math.abs(Math.round(e.s - meS)) + ' m')}</span></div>`).join('');
  }

  // position, attitude, flight and suspension for one rival
  _placeCar(r, c, dt, snap) {
    const p = this._at(r, c.s, _p);
    const x = p.x - p.fz * c.d, z = p.z + p.fx * c.d;
    const T = this.terrain, hl = c.halfLen * 0.8, hw = c.halfW * 0.8;
    const hf = T.heightAt(x + p.fx * hl, z + p.fz * hl), hb = T.heightAt(x - p.fx * hl, z - p.fz * hl);
    const hr = T.heightAt(x - p.fz * hw, z + p.fx * hw), hlft = T.heightAt(x + p.fz * hw, z - p.fx * hw);
    const ground = (hf + hb) / 2;
    if (snap || dt === 0) { c.y = ground; c.vy = 0; c.groundPrev = ground; }
    else {
      const gv = (ground - c.groundPrev) / dt; c.groundPrev = ground;
      if (c.air > 0 || c.y > ground + 0.35) { // airborne
        c.vy -= G * dt; c.y += c.vy * dt; c.air += dt;
        if (c.y <= ground) {
          const impact = Math.min(1, Math.max(0, gv - c.vy) / 8);
          c.y = ground; c.vy = 0; c.suspV -= impact * 3;
          if (c.air > 0.35) this._landDust(c, impact);
          c.air = 0;
        }
      } else { c.y = ground; c.vy = Math.min(gv, 14); }
    }
    // suspension spring: squat under power, dive on brakes, bounce after landings
    c.suspV += (-c.susp * 60 - c.suspV * 9) * Math.min(dt, 0.05);
    c.susp += c.suspV * Math.min(dt, 0.05);
    const yaw = Math.atan2(p.fx, p.fz) + (c.dTarget - c.d) * 0.05;
    const tPitch = c.air > 0 ? c.pitch + 0.25 * dt : -Math.atan2(hf - hb, hl * 2) - THREE.MathUtils.clamp((c.accel || 0) * 0.008, -0.05, 0.05);
    const lat = c.v * c.v * this._curv(r, c.s);
    const tRoll = Math.atan2(hr - hlft, hw * 2) + THREE.MathUtils.clamp(lat * 0.006, -0.06, 0.06);
    const k = snap ? 1 : Math.min(1, dt * 8);
    c.pitch += (tPitch - c.pitch) * k; c.roll += (tRoll - c.roll) * k;
    c.root.position.set(x, c.y + c.susp * 0.1, z);
    _e.set(c.pitch, yaw, c.roll); c.root.quaternion.setFromEuler(_e);
    c.body.setNextKinematicTranslation({ x, y: c.y, z });
    const q = c.root.quaternion;
    c.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    for (const w of c.spins) w.pivot.rotation.x += (c.v * dt) / w.radius;
    c.lights.visible = !!this.isNight?.();
    // dust off the rear wheels, engine note
    if (dt > 0 && this.dust && c.v > 6 && c.air === 0) {
      const n = Math.random() < c.v * dt * 0.9 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        _v.set(x - p.fx * c.halfLen + (Math.random() - 0.5) * c.halfW * 2, c.y + 0.3, z - p.fz * c.halfLen);
        this.dust.emit(_v, { x: (Math.random() - 0.5) * 2 - p.fx * 2, y: 0.6 + Math.random(), z: (Math.random() - 0.5) * 2 - p.fz * 2 },
          { size: 2 + Math.random() * 2 + c.v * 0.05, life: 1.6 + Math.random(), alpha: 0.16, color: [0.78, 0.66, 0.5], tex: 0 });
      }
    }
    if (c.sound) {
      const d = c.root.position.distanceTo(this.audio.listener.pos);
      const g = Math.pow(Math.max(0, 1 - d / 140), 2) * 0.32;
      const gearPhase = (c.v % 9) / 9;
      c.sound.set(g, 0.7 + gearPhase * 0.55 + c.v * 0.006, 0.08);
    }
  }

  _curv(r, s) {
    const a = this._at(r, s - 6, _ca), b = this._at(r, s + 6, _cb);
    let da = Math.atan2(b.fx, b.fz) - Math.atan2(a.fx, a.fz);
    return Math.atan2(Math.sin(da), Math.cos(da)) / 12;
  }

  _landDust(c, k) {
    if (!this.dust) return;
    for (let i = 0; i < 8; i++) {
      _v.set(c.root.position.x + (Math.random() - 0.5) * 3, c.y + 0.2, c.root.position.z + (Math.random() - 0.5) * 3);
      this.dust.emit(_v, { x: (Math.random() - 0.5) * 6, y: 1 + Math.random() * 2, z: (Math.random() - 0.5) * 6 }, { size: 3 + k * 3, life: 1.8, alpha: 0.25, color: [0.75, 0.64, 0.5], tex: 0 });
    }
    this.audio.play('land_thud', { position: c.root.position, volume: 0.5 + k * 0.5, maxDist: 120 });
  }
}

function recolor(m, color) { const c = m.clone(); c.color.setHex(color); c.roughness = 0.45; c.metalness = 0.25; return c; }
const _p = {}, _ca = {}, _cb = {};
