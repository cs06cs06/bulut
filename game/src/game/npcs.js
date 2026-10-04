import * as THREE from 'three';
import { FARMS, BOARDS, POIS, TOWN } from '../world/layout.js';
import { NPC } from './story.js';

// Named neighbours standing around Palouse (drive up and press F to chat) and hitchhikers
// thumbing a ride by the road: pick them up, drop them off, collect the fare.
const LINES = {
  earl: ['Motor sesin düzgün mü? Hasar varsa getir, bakarım.', 'Benzinlikte nitro bedava, kimseye söyleme.', 'Walt bu tezgâhta saatlerce kahve içerdi. Hep aynı fincan.',
    'Bir yere saplanırsan X’e bas, vinci bir ağaca bağla.', 'Batı tepelerindeki bir ahırda eski bir minibüs varmış diyorlar.'],
  martha: ['İnekler bugün huysuz. Çitlere çarpma da büsbütün ürkmesinler!', 'Panayırda benim balkabağı turtam var, kaçırma!', 'İlan panosunda yeni işler var. Yük düşürmeyene bahşiş veririm.',
    'Walt’ın pikabını görünce gözlerim doldu.'],
  rosie: ['Bacağım iyileşiyor, sorduğun için sağ ol!', 'Kasabada herkes herkesin mektubunu merak eder. Ben söylemem tabii.', 'Kutuların yanında yavaşla yeter, mektubu ben atarım… yani sen atarsın.',
    'Şerif Dale yine radar kurmuş, dikkat et.'],
  dale: ['Kasabada yavaş sür evlat. Yayalar kaçarken şapkalarını düşürüyor.', 'Hız kapanlarını ben kurmadım ama rekorları ben tutuyorum.', 'Gözetleme kulelerinden bütün vadi görünür.',
    'Dawson’larla aranı iyi tut… ya da onları yarışta geç.'],
  hank: ['Ne bakıyorsun Miller? Bayrak orada, cesaretin varsa.', 'Babam bu toprakları istiyor, ben de kupayı.', 'Kamyonun güzelmiş. Bende daha hızlısı var.'],
  hankAfter: ['Tamam, tamam… iyi sürüyorsun. Bir rövanş belki?', 'Babam artık senden “komşu” diye bahsediyor. Garip.'],
};
const RIDERS = { m: ['Bob', 'Jed', 'Cody', 'Buck', 'Wade', 'Hal'], f: ['Lucy', 'Mae', 'Ruth', 'Ellie', 'June', 'Peggy'] };
const CHAT = ['Güzel pikap! Dedeminki de böyleydi.', 'Panayıra yetişirsem turtalardan kalmış olur belki.', 'Bu tozlu yolları özlemişim.', 'Radyoda hep aynı şarkılar, değil mi?',
  'Az önce bir geyik sürüsü gördüm, inanılmazdı!', 'Yavaş olabilir miyiz? Midem biraz hassas.', 'Şu tepenin ardında harika bir manzara var.', 'Teşekkürler, yürüyerek saatler sürerdi.'];

export class Townsfolk {
  constructor({ game }) {
    this.g = game;
    const W = game.world, P = game.people, at = W.townFrame.at;
    this.npcs = [];
    const add = (key, char, x, z, yaw, label) => {
      const p = P.add('npc', x, z, yaw, { char, noDodge: false });
      P.tag(p, label);
      p.key = key;
      this.npcs.push(p);
      return p;
    };
    const gs = W.gasStation, sh = gs.shop;
    add('earl', 'char_m_c', sh.x + (gs.x - sh.x) * 0.35, sh.z + (gs.z - sh.z) * 0.35, sh.yaw, 'Earl · tamirci');
    const po = W.townSpots.shop_d;
    add('rosie', 'char_f_b', po.x + po.dx * 2, po.z + po.dz * 2, Math.atan2(-po.rx, -po.rz) + Math.PI, 'Rosie · postacı');
    // the sheriff leans on his patrol car at the north end of the street
    const car = at(158, 1, 1.2), dale = at(154, 1, 3.6);
    const pc = W.place('k_police', car.x, car.z, Math.atan2(car.f.dx, car.f.dz) * 180 / Math.PI, 1).object;
    pc.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); game.rs.scene.add(pc);
    add('dale', 'char_m_a', dale.x, dale.z, Math.atan2(-dale.rx, -dale.rz) + Math.PI, 'Şerif Dale');
    const mf = FARMS.find((f) => f.id === 'watertower'), b = BOARDS.watertower, c = Math.cos(mf.rot * Math.PI / 180), s = Math.sin(mf.rot * Math.PI / 180);
    add('martha', 'char_f_d', mf.x + (b[0] + 3) * c + (b[1] + 2) * s, mf.z - (b[0] + 3) * s + (b[1] + 2) * c, 0, 'Martha · çiftçi');
    const rn = game.races.races.find((r) => r.id === 'north'), p0 = rn.P[0];
    add('hank', 'char_m_f', p0.x + p0.fz * 9, p0.z - p0.fx * 9, Math.atan2(-p0.fz, p0.fx), 'Hank Dawson');
    // hitchhiker spots on road shoulders, away from town and farms
    this.spots = [];
    const R = mulberry(99);
    for (const r of game.terrain.roads.roads) {
      if (!['Palouse Yolu', 'Doğu Yolu', 'Batı Yolu', 'Güney Yolu', 'Tepe Yolu', 'Değirmen Yolu', 'Butte Yolu'].includes(r.name)) continue;
      for (let k = 0; k < 3; k++) {
        const i = Math.floor(r.points.length * (0.15 + R() * 0.7)), p = r.points[i], q = r.points[i + 1];
        const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1, off = r.width / 2 + 2;
        const x = p[0] + dz / l * off, z = p[1] - dx / l * off;
        if (Math.hypot(x - TOWN.center[0], z - TOWN.center[1]) < TOWN.radius + 40 || FARMS.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 30)) continue;
        this.spots.push({ x, z, yaw: Math.atan2(-dz / l, dx / l) });
      }
    }
    this.dests = [
      { name: 'Steptoe Kasabası', x: TOWN.center[0], z: TOWN.center[1] }, { name: 'Benzinlik', x: W.gasStation.x, z: W.gasStation.z },
      ...FARMS.map((f) => ({ name: POIS.find((p) => p.id === f.id)?.name || f.id, x: f.x, z: f.z })),
      ...['chapel', 'camp', 'fair', 'pond', 'picnic', 'windmill'].map((id) => { const p = POIS.find((q) => q.id === id); return { name: p.name, x: p.x, z: p.z }; }),
    ];
    this.hitchers = [];
    this.ride = null;
    this.spawnT = 0;
    const mat = new THREE.SpriteMaterial({ map: game.tex.glow, color: 0x9fe0ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beacon = new THREE.Group();
    for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(mat); sp.scale.setScalar(5 - i * 0.5); sp.position.y = 2 + i * 7; this.beacon.add(sp); }
    this.beacon.visible = false;
    game.rs.scene.add(this.beacon);
    for (let i = 0; i < 3; i++) this._spawnHitcher(true);
  }

  _spawnHitcher(initial = false) {
    const pos = this.g.vehicle.position;
    const free = this.spots.filter((s) => !this.hitchers.some((h) => h.spot === s) && Math.hypot(s.x - pos.x, s.z - pos.z) > (initial ? 120 : 250));
    if (!free.length) return;
    const s = free[Math.floor(Math.random() * free.length)];
    const p = this.g.people.add('hitch', s.x, s.z, s.yaw);
    this.g.people.tag(p, '👍 Otostop', '#cdefff');
    const names = RIDERS[p.o.name.includes('_f_') ? 'f' : 'm'];
    p.spot = s; p.riderName = names[Math.floor(Math.random() * names.length)];
    this.hitchers.push(p);
  }

  near(pos, list, r) { return list.find((p) => !p.hidden && Math.hypot(p.x - pos.x, p.z - pos.z) < r); }
  nearNpc(pos) { return this.near(pos, this.npcs, 7); }
  nearHitcher(pos) { return this.ride ? null : this.near(pos, this.hitchers, 7); }

  talk(p) {
    const done = this.g.progress.data.storyDone;
    const pool = p.key === 'hank' && done ? LINES.hankAfter : LINES[p.key];
    p.lineI = ((p.lineI ?? Math.floor(Math.random() * pool.length)) + 1) % pool.length;
    p.play('yes', 0.2); p.back = 2;
    this.g.story.say([[p.key, pool[p.lineI]]]);
  }

  pickUp(p) {
    const pos = this.g.vehicle.position;
    const options = this.dests.filter((d) => { const dd = Math.hypot(d.x - pos.x, d.z - pos.z); return dd > 600 && dd < 1900; });
    const dest = options[Math.floor(Math.random() * options.length)] || this.dests[0];
    const dist = Math.hypot(dest.x - pos.x, dest.z - pos.z);
    p.hidden = true;
    this.hitchers = this.hitchers.filter((h) => h !== p);
    this.ride = { p, name: p.riderName, dest, dist, t: 0, limit: Math.round(dist * 1.3 / 14 + 30), fare: Math.round(60 + dist * 0.12), hits: 0, chatT: 12 };
    this.beacon.position.set(dest.x, this.g.terrain.heightAt(dest.x, dest.z), dest.z);
    this.beacon.visible = true;
    this.g.story.say([['rider', `Selam, ben ${p.riderName}! Beni ${dest.name} civarına bırakabilir misin? ${(dist / 1000).toFixed(1)} km kadar.`]]);
    this.g.audio.play('door_close', { volume: 0.7 });
  }

  // a hard knock upsets the passenger and cuts the tip
  bump(k) {
    if (!this.ride || k < 0.35) return;
    this.ride.hits++;
    this.g.hud.popup(`${this.ride.name}: “Hey, dikkat!”`, 'bad');
  }

  cancelRide() {
    if (!this.ride) return;
    const r = this.ride; this.ride = null; this.beacon.visible = false;
    r.p.hidden = false; r.p.x = this.g.vehicle.position.x + 3; r.p.z = this.g.vehicle.position.z; r.p.mode = 'stand'; r.p.home = { x: r.p.x, z: r.p.z, yaw: 0 };
    this.g.hud.objective(null);
  }

  update(dt) {
    const g = this.g, v = g.vehicle;
    this.spawnT -= dt;
    if (this.hitchers.length < 3 && this.spawnT <= 0) { this.spawnT = 40; this._spawnHitcher(); }
    const r = this.ride;
    if (!r) return null;
    r.t += dt;
    this.beacon.children.forEach((s, i) => { s.material.opacity = 0.35 + Math.sin(r.t * 4 + i) * 0.12; });
    r.chatT -= dt;
    if (r.chatT <= 0) { r.chatT = 22 + Math.random() * 14; g.hud.popup(`${r.name}: “${CHAT[Math.floor(Math.random() * CHAT.length)]}”`, 'info'); }
    const d = Math.hypot(v.position.x - r.dest.x, v.position.z - r.dest.z);
    if (d < 16 && v.speed < 4) {
      const onTime = r.t <= r.limit, tip = Math.max(0, Math.round(r.fare * (onTime ? 0.35 : 0.1) - r.hits * r.fare * 0.12));
      g.progress.addMoney(r.fare + tip);
      g.progress.stat('rides', 1);
      g.progress.daily('ride');
      g.hud.toast('Yolcu bırakıldı', `+$${r.fare + tip}`, `${r.name}: “${r.hits ? 'Biraz hoplattın ama sağ ol!' : onTime ? 'Uçar gibi geldik, harikasın!' : 'Geç oldu ama vardık, teşekkürler.'}”${tip ? ` · bahşiş $${tip}` : ''}`);
      g.audio.play('discover', { bus: 'ui', volume: 0.6, rate: 1.2 });
      // the passenger gets out and wanders off
      const p = r.p; p.hidden = false; p.mode = 'walk';
      const ox = v.position.x + 3, oz = v.position.z + 2;
      p.x = ox; p.z = oz; p.path = [[ox, oz], [ox + 12, oz + 6]]; p.i = 1; p.dir = 1; p.loop = false; p.pause = 0;
      if (p.tagSprite) p.tagSprite.visible = false, p.root.remove(p.tagSprite), p.tagSprite = null;
      setTimeout(() => { p.hidden = true; }, 12000);
      this.ride = null; this.beacon.visible = false;
      return null;
    }
    const left = Math.max(0, r.limit - r.t);
    g.hud.objective({ title: `Yolcu · ${r.name}`, lines: [`→ ${r.dest.name}: ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}`, left > 0 ? `Bahşiş için ${Math.ceil(left)} sn` : 'Bahşiş süresi doldu'] });
    return { target: [r.dest.x, r.dest.z] };
  }
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
