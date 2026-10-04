import * as THREE from 'three';
import { FARMS, BOARDS, TOWN } from './layout.js';

// People of Palouse (Kenney Mini Characters, CC0): townsfolk strolling the pavements, neighbours
// chatting outside shops, fair vendors and visitors, campers by the fire, farmers at work, joggers
// on the roads. They step out of the way of cars. Story NPCs carry name tags.
export const CHARS = ['char_m_a', 'char_m_b', 'char_m_c', 'char_m_d', 'char_m_e', 'char_m_f', 'char_f_a', 'char_f_b', 'char_f_c', 'char_f_d', 'char_f_e', 'char_f_f'];
const CLIP = { idle: 'idle', walk: 'walk', sprint: 'sprint', sit: 'sit', yes: 'emote-yes', no: 'emote-no', interact: 'interact-right', pick: 'pick-up', jump: 'jump' };
const _v = new THREE.Vector3();

class Person {
  constructor(lib, id, rnd) {
    this.root = new THREE.Group();
    this.o = lib.clone(id);
    this.meshes = [];
    this.o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; this.meshes.push(m); } });
    this.root.add(this.o);
    this.mixer = new THREE.AnimationMixer(this.o);
    const clips = lib.gltf[id].animations;
    this.actions = {};
    for (const [k, name] of Object.entries(CLIP)) {
      const c = clips.find((a) => a.name === name);
      if (c) this.actions[k] = this.mixer.clipAction(c);
    }
    for (const k of ['yes', 'no', 'interact', 'pick', 'jump']) if (this.actions[k]) { this.actions[k].setLoop(THREE.LoopOnce, 1); this.actions[k].clampWhenFinished = true; }
    this.x = 0; this.z = 0; this.yaw = 0; this.yawT = 0;
    this.timer = rnd() * 6; this.acc = 0;
    this.speed = 1.1 + rnd() * 0.5;
  }

  play(name, fade = 0.25, timeScale = 1) {
    const a = this.actions[name] || this.actions.idle;
    if (this.cur === a) return;
    a.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = a; this.curName = name;
  }
}

export class People {
  constructor({ scene, lib, terrain, world, density = 1 }) {
    Object.assign(this, { scene, lib, terrain, world, density });
    this.group = new THREE.Group(); this.group.name = 'people';
    scene.add(this.group);
    this.list = [];
    let seed = 1234;
    this.rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    this._ci = 0;
    this.populate();
  }

  _char() { return CHARS[(this._ci++ * 5) % CHARS.length]; }

  add(mode, x, z, yaw = 0, opts = {}) {
    const p = new Person(this.lib, opts.char || this._char(), this.rnd);
    Object.assign(p, { mode, x, z, yaw, yawT: yaw, home: { x, z, yaw }, ...opts });
    this.group.add(p.root);
    p.play(mode === 'walk' || mode === 'work' ? 'walk' : mode === 'sit' ? 'sit' : 'idle', 0);
    p.cur.time = this.rnd() * 2;
    this.list.push(p);
    this._place(p);
    return p;
  }

  // floating name tag (story NPCs)
  tag(p, text, color = '#ffe39a') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = '700 30px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = Math.min(250, x.measureText(text).width + 30);
    x.fillStyle = 'rgba(28,19,12,0.8)'; x.beginPath(); x.roundRect((256 - w) / 2, 10, w, 44, 12); x.fill();
    x.fillStyle = color; x.fillText(text, 128, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
    sp.scale.set(2.6, 0.65, 1); sp.position.y = 2.45; sp.renderOrder = 8;
    p.root.add(sp); p.tagSprite = sp;
  }

  // ------------------------------------------------------------ who lives where
  populate() {
    const W = this.world, R = this.rnd, D = this.density, T = TOWN;
    const at = W.townFrame?.at;
    if (at) {
      // pavement strollers
      const n = Math.round(14 * D);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, ta = 40 + R() * 80, tb = ta + 40 + R() * 70;
        const path = [];
        for (let t = ta; t <= tb; t += 10) { const q = at(t, side, 2.4 + R() * 0.6); path.push([q.x, q.z]); }
        const k = Math.floor(R() * path.length);
        this.add('walk', path[k][0], path[k][1], 0, { path, i: k, dir: R() < 0.5 ? 1 : -1, pause: 0.25 });
      }
      // chatting groups outside shops
      const spots = [W.gasStation?.shop, W.townSpots?.diner, W.townSpots?.chapel, W.townSpots?.store, W.townSpots?.shop_c, W.townSpots?.shop_f, W.townSpots?.market].filter(Boolean);
      spots.forEach((s, gi) => {
        const k = 2 + (gi % 2) + (D > 0.8 && gi % 3 === 0 ? 1 : 0);
        for (let j = 0; j < k; j++) {
          const a = j / k * Math.PI * 2 + R(), x = s.x + Math.cos(a) * 0.95, z = s.z + Math.sin(a) * 0.95;
          this.add('stand', x, z, Math.atan2(s.x - x, s.z - z), { chat: true });
        }
      });
      // people resting on benches
      for (const b of (W.benches || []).slice(0, Math.round(4 * D))) this.add('sit', b.x, b.z, b.yaw, { sitY: 0.12 });
    }
    const L = W.leisure || {};
    if (L.fair) { // vendors behind the stalls, visitors browsing, kids running around the hay
      for (const s of L.fair.stalls) {
        this.add('stand', s.vendor.x, s.vendor.z, s.vendor.yaw + Math.PI, { chat: true });
        if (R() < 0.4 + D * 0.4) this.add('stand', s.x, s.z, s.yaw + Math.PI, { chat: true });
      }
      const ring = [];
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ring.push([L.fair.x + Math.cos(a) * 7.5, L.fair.z + Math.sin(a) * 7.5]); }
      for (let i = 0; i < Math.round(4 * D) + 1; i++) { const k = Math.floor(R() * ring.length); this.add('walk', ring[k][0], ring[k][1], 0, { path: ring, i: k, dir: i % 2 ? 1 : -1, loop: true, pause: 0.35 }); }
    }
    if (L.camp) {
      L.camp.seats.slice(0, 3).forEach((s) => this.add('sit', s.x, s.z, s.yaw, { sitY: 0.3 }));
      this.add('stand', L.camp.x + 2.4, L.camp.z - 2.2, Math.atan2(-2.4, 2.2), { chat: true });
    }
    if (L.fisher) this.add('sit', L.fisher.x, L.fisher.z, L.fisher.yaw, { sitY: 0.3, char: 'char_m_e' });
    if (L.picnic) {
      const p = L.picnic;
      this.add('sit', p.x + 3.5, p.z + 1.4, -1.2, { sitY: 0 }); this.add('sit', p.x + 4.6, p.z + 2.8, -2.3, { sitY: 0 });
      this.add('stand', p.x - 1.6, p.z + 0.6, 1.2, { chat: true });
      const loop = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; loop.push([p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6]); }
      this.add('walk', loop[0][0], loop[0][1], 0, { path: loop, i: 0, dir: 1, loop: true, speed: 2.2, run: true, char: 'char_f_c' });
    }
    // farmers working the yards
    for (const f of FARMS) {
      const c = Math.cos(f.rot * Math.PI / 180), s = Math.sin(f.rot * Math.PI / 180), b = BOARDS[f.id] || [0, 20];
      const local = [[b[0] * 0.8, b[1] * 0.8], [f.r * 0.3, f.r * 0.15], [-f.r * 0.2, -f.r * 0.3], [f.r * 0.1, -f.r * 0.35]];
      const path = local.map(([lx, lz]) => [f.x + lx * c + lz * s, f.z - lx * s + lz * c]);
      const k = (f.r > 50 && D > 0.8) ? 2 : 1;
      for (let j = 0; j < k; j++) this.add('work', path[j][0], path[j][1], 0, { path, i: j, dir: 1, loop: true, pause: 1, speed: 1.0 });
    }
    // joggers and walkers on the country roads
    const roads = this.terrain.roads.roads.filter((r) => ['Palouse Yolu', 'Doğu Yolu', 'Güney Yolu', 'Tepe Yolu', 'Batı Yolu'].includes(r.name));
    for (let i = 0; i < Math.round(5 * D); i++) {
      const r = roads[i % roads.length], pts = r.points, a = Math.floor(pts.length * (0.15 + R() * 0.6)), side = R() < 0.5 ? -1 : 1, off = r.width / 2 + 1.8;
      const path = [];
      for (let k = a; k < Math.min(pts.length - 2, a + 140); k += 10) {
        const p0 = pts[k], p1 = pts[k + 1], dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz) || 1;
        const x = p0[0] - dz / l * off * side, z = p0[1] + dx / l * off * side;
        if (Math.hypot(x - T.center[0], z - T.center[1]) < T.radius + 20 || FARMS.some((f) => Math.hypot(x - f.x, z - f.z) < f.r)) break;
        path.push([x, z]);
      }
      if (path.length < 4) continue;
      const run = i % 2 === 0;
      this.add('walk', path[0][0], path[0][1], 0, { path, i: 0, dir: 1, speed: run ? 2.6 : 1.3, run });
    }
  }

  // a friendly honk: people nearby turn and wave
  honk(pos) {
    for (const p of this.list) {
      if (p.hidden || p.mode === 'sit' || p.mode === 'dodge') continue;
      if (Math.hypot(p.x - pos.x, p.z - pos.z) > 30) continue;
      p.yaw = Math.atan2(pos.x - p.x, pos.z - p.z);
      if (p.mode === 'walk' || p.mode === 'work') p.wait = 2;
      p.play('yes', 0.15); p.back = 2.2; p.timer = Math.max(p.timer, 3);
    }
  }

  // ------------------------------------------------------------ per frame
  _place(p) {
    p.root.position.set(p.x, this.terrain.heightAt(p.x, p.z) + (p.mode === 'sit' ? (p.sitY || 0) : 0), p.z);
    p.root.rotation.y = p.yaw;
  }

  update(dt, camPos, car) {
    this.frame = (this.frame || 0) + 1;
    const cv = car.speed > 3 ? _v.copy(car.vel).setY(0).normalize() : null;
    for (const p of this.list) {
      if (p.hidden) { p.root.visible = false; continue; }
      const d = Math.hypot(p.x - camPos.x, p.z - camPos.z);
      p.root.visible = d < 280;
      if (!p.root.visible) continue;
      // get out of the way of cars
      const dx = p.x - car.pos.x, dz = p.z - car.pos.z, dc = Math.hypot(dx, dz);
      if (cv && dc < 14 && p.mode !== 'dodge' && p.mode !== 'sit' && !p.noDodge) {
        const along = dx * cv.x + dz * cv.z, lat = dx * -cv.z + dz * cv.x;
        if (along > -1.5 && along < 6 + car.speed * 0.6 && Math.abs(lat) < 3.2) {
          const sgn = Math.abs(lat) > 0.2 ? Math.sign(lat) : (this.rnd() < 0.5 ? -1 : 1);
          p.prevMode = p.mode; p.mode = 'dodge'; p.timer = 1.1;
          p.dvx = -cv.z * sgn; p.dvz = cv.x * sgn;
          p.yaw = Math.atan2(p.dvx, p.dvz);
          p.play('sprint', 0.1);
          this.onDodge?.(p);
        }
      }
      if (dc < 1.6) { const k = 1.6 / Math.max(dc, 0.01); p.x = car.pos.x + dx * k; p.z = car.pos.z + dz * k; }
      this._behave(p, dt, camPos);
      this._place(p);
      // animation level of detail
      p.acc += dt;
      if (d < 130 || this.frame % 3 === 0) { p.mixer.update(p.acc); p.acc = 0; }
      if (p.tagSprite) p.tagSprite.visible = d < 45;
      const sh = d < 50; // only nearby people cast shadows
      if (p.shadow !== sh) { p.shadow = sh; for (const m of p.meshes) m.castShadow = sh; }
    }
  }

  _behave(p, dt, camPos) {
    p.timer -= dt;
    switch (p.mode) {
      case 'dodge': {
        p.x += p.dvx * 5.2 * dt; p.z += p.dvz * 5.2 * dt;
        if (p.timer <= 0) { p.mode = p.prevMode; p.timer = 1.5; p.play(p.mode === 'walk' || p.mode === 'work' ? 'idle' : 'idle'); p.wait = 1.2; }
        break;
      }
      case 'walk': case 'work': {
        if (p.wait > 0) { p.wait -= dt; if (p.wait <= 0) p.play(p.run ? 'sprint' : 'walk', 0.3, p.run ? 0.75 : 1); break; }
        const tgt = p.path[p.i], tx = tgt[0] - p.x, tz = tgt[1] - p.z, l = Math.hypot(tx, tz);
        if (l < 0.4) {
          if (p.loop) p.i = (p.i + p.dir + p.path.length) % p.path.length;
          else { if (p.i + p.dir < 0 || p.i + p.dir >= p.path.length) p.dir *= -1; p.i += p.dir; }
          if (this.rnd() < (p.pause ?? 0.15)) {
            p.wait = p.mode === 'work' ? 3 + this.rnd() * 3 : 2 + this.rnd() * 4;
            p.play(p.mode === 'work' ? (this.rnd() < 0.5 ? 'pick' : 'interact') : (this.rnd() < 0.3 ? 'yes' : 'idle'), 0.3);
          }
          break;
        }
        if (p.curName !== 'walk' && p.curName !== 'sprint') p.play(p.run ? 'sprint' : 'walk', 0.3, p.run ? 0.75 : 1);
        const sp = (p.run ? p.speed : p.speed) * dt;
        p.x += tx / l * Math.min(sp, l); p.z += tz / l * Math.min(sp, l);
        p.yawT = Math.atan2(tx, tz);
        let dy = p.yawT - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 6);
        break;
      }
      case 'stand': case 'npc': case 'hitch': {
        if (p.mode === 'npc' || p.mode === 'hitch') {
          const near = Math.hypot(camPos.x - p.x, camPos.z - p.z) < 18;
          const want = near ? Math.atan2(camPos.x - p.x, camPos.z - p.z) : p.home.yaw;
          let dy = want - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 3);
        } else if (Math.hypot(p.x - p.home.x, p.z - p.home.z) > 0.5) { // walk back after dodging
          const tx = p.home.x - p.x, tz = p.home.z - p.z, l = Math.hypot(tx, tz);
          p.x += tx / l * Math.min(l, 1.3 * dt); p.z += tz / l * Math.min(l, 1.3 * dt); p.yaw = Math.atan2(tx, tz);
          if (p.curName !== 'walk') p.play('walk');
          break;
        } else if (p.curName === 'walk') { p.yaw = p.home.yaw; p.play('idle'); }
        if (p.timer <= 0) {
          p.timer = 5 + this.rnd() * 8;
          const r = this.rnd();
          p.play(p.mode === 'hitch' ? 'yes' : r < 0.35 ? 'yes' : r < 0.55 ? 'no' : r < 0.75 ? 'interact' : 'idle', 0.3);
          p.back = 2.2;
        }
        if (p.back > 0) { p.back -= dt; if (p.back <= 0) p.play('idle', 0.4); }
        break;
      }
      default: break; // sit
    }
  }
}
