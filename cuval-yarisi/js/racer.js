// Yarışmacı: zıplama fiziği, ritim değerlendirmesi, denge, düşme ve yapay zekâ.
import * as THREE from 'three';
import { HOP, TRACK, derive } from './config.js';
import { buildRacer } from './racerModel.js';
import { HALF } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Racer {
  constructor(def, lane, { isPlayer = false, sweet = 0.17, skill = 0.75, num = 1, lod = false } = {}) {
    this.def = def;
    this.lane = lane;
    this.isPlayer = isPlayer;
    this.p = derive(def.stats, sweet);
    this.skill = skill;
    this.baseSkill = skill;
    this.model = buildRacer(def, num, lod);
    this.x = -HALF + TRACK.laneWidth * (lane + 0.5);
    this.model.root.position.set(this.x, 0, 0);
    this.listeners = {};
    this.reset();
  }

  // Her yarış öncesi kulvar, rol ve zorluk ataması
  configure({ lane, isPlayer, sweet, skill }) {
    this.lane = lane;
    this.isPlayer = isPlayer;
    this.p = derive(this.def.stats, sweet);
    this.skill = this.baseSkill = skill;
    this.x = -HALF + TRACK.laneWidth * (lane + 0.5);
    this.reset();
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, a) { for (const f of this.listeners[ev] || []) f(a, this); }

  reset() {
    this.z = 0;            // ilerleme (m)
    this.state = 'idle';   // idle | air | ground | fallen | finished
    this.t = 0;            // mevcut durumdaki süre
    this.combo = 0;
    this.wobble = 0;
    this.wobbleDir = Math.random() < 0.5 ? -1 : 1;
    this.hopDist = 0;
    this.airTime = this.p.airTime;
    this.buffered = false;
    this.finishTime = null;
    this.squash = 0;
    this.lean = 0;
    this.fallAnim = 0;
    this.coskun = 0;       // hücum göstergesi (0..1)
    this.hucum = 0;        // aktif hücum süresi
    this.ai = { wait: 0.2 + Math.random() * 0.3, mashCd: 0 };
    this.pullUp = 0;
    this.started = false;
    this.lastJudge = null;
    this.sackRise = 1;
    const r = this.model.root;
    r.position.set(this.x, 0, 0); r.rotation.set(0, 0, 0);
    this.model.hop.position.set(0, 0, 0); this.model.hop.rotation.set(0, 0, 0); this.model.hop.scale.set(1, 1, 1);
    this.model.tilt.rotation.set(0, 0, 0);
    this.model.setFace('smile');
  }

  get speed() { return this.state === 'air' ? this.hopDist / this.airTime : 0; }

  start() { this.started = true; this.state = 'ground'; this.t = 0.6; }

  // Oyuncu ya da YZ "zıpla" dediğinde
  press() {
    if (!this.started || this.state === 'finished') return null;
    if (this.state === 'fallen') return null;
    if (this.state === 'air') {
      const left = this.airTime - this.t;
      if (left <= HOP.bufferWindow) { this.buffered = true; return null; }
      // havada panikle basmak dengeyi bozar
      this.addWobble(0.11);
      return this.judge('panik');
    }
    const dt = this.t;
    let j;
    if (this.hucum > 0) j = 'mukemmel';
    else if (dt < HOP.goodWindow) j = 'acele';
    else if (dt <= HOP.goodWindow + this.p.sweet) j = 'mukemmel';
    else if (dt < HOP.lateLimit) j = 'gec';
    else j = 'durgun';
    this.launch(j);
    return j;
  }

  judge(j) { this.lastJudge = j; this.emit('judge', j); return j; }

  launch(j) {
    if (j === 'mukemmel') { this.combo = Math.min(HOP.maxCombo, this.combo + 1); this.wobble = Math.max(0, this.wobble - 0.07); this.coskun = Math.min(1, this.coskun + 0.11); }
    else if (j === 'acele') { this.combo = Math.max(0, this.combo - 1); this.addWobble(0.06); this.coskun = Math.min(1, this.coskun + 0.03); }
    else if (j === 'tampon') { this.addWobble(0.035); this.coskun = Math.min(1, this.coskun + 0.04); }
    else if (j === 'gec') { this.combo = this.def.stats.denge >= 5 ? Math.max(0, this.combo - 2) : Math.floor(this.combo / 2); }
    else if (j === 'durgun') { this.combo = 0; }
    // hız arttıkça denge zorlaşır
    if (this.hucum <= 0) this.addWobble(0.012 * this.combo * this.p.wobbleGain);
    const boost = this.hucum > 0 ? 1.28 : 1;
    this.hopDist = HOP.baseDist * (1 + HOP.comboGain * this.p.comboMul * this.combo) * this.p.distMul * boost;
    if (this.combo === 0 && j === 'durgun') this.hopDist *= 0.85;
    this.airTime = this.p.airTime * (this.hucum > 0 ? 0.92 : 1) * (1 + this.combo * 0.012);
    this.state = 'air'; this.t = 0; this.buffered = false;
    this.squash = -0.22;
    this.pullUp = 1;
    this.judge(j);
    this.emit('hop', j);
  }

  addWobble(v) {
    if (this.hucum > 0) return;
    this.wobble += v * this.p.wobbleGain;
    if (this.wobble >= 1) this.fall();
  }

  fall() {
    if (this.state === 'fallen' || this.state === 'finished') return;
    this.state = 'fallen'; this.t = 0; this.combo = 0; this.wobble = 0;
    this.fallSide = this.wobbleDir;
    this.coskun = Math.max(0, this.coskun - 0.25);
    this.model.setFace('shock');
    this.emit('fall');
  }

  activateHucum() {
    if (this.coskun < 1 || this.hucum > 0 || this.state === 'fallen' || this.state === 'finished') return false;
    this.hucum = 3.6; this.coskun = 0; this.wobble = 0;
    this.emit('hucum');
    return true;
  }

  update(dt, raceTime) {
    this.t += dt;
    if (this.hucum > 0) { this.hucum -= dt; if (this.hucum <= 0) this.emit('hucumEnd'); }
    const m = this.model;
    switch (this.state) {
      case 'air': {
        const k = Math.min(1, this.t / this.airTime);
        this.z += this.speed * dt;
        const y = 4 * HOP.height * (0.85 + this.combo * 0.03) * k * (1 - k);
        m.hop.position.y = y;
        this.wobble = Math.max(0, this.wobble - this.p.wobbleDecay * 0.4 * dt);
        if (this.t >= this.airTime) {
          // iniş
          this.z += 0; m.hop.position.y = 0;
          this.state = 'ground'; this.t = 0;
          this.squash = 0.32 + this.combo * 0.02;
          this.emit('land');
          if (this.buffered) { this.buffered = false; this.launch('tampon'); }
        }
        break;
      }
      case 'ground': {
        this.wobble = Math.max(0, this.wobble - this.p.wobbleDecay * dt);
        if (this.t > HOP.lateLimit && this.combo > 0) this.combo = Math.max(0, this.combo - dt * 6) | 0;
        break;
      }
      case 'fallen': {
        const dur = this.p.recover;
        if (this.t > dur) { this.state = 'ground'; this.t = 0.4; this.model.setFace('strain'); this.emit('getup'); }
        break;
      }
      default: break;
    }
    if (this.state !== 'finished' && this.z >= TRACK.length && this.finishTime === null) {
      this.finishTime = raceTime;
      this.emit('finish', raceTime);
    }
    if (this.isPlayer === false && this.started && this.state !== 'finished') this.think(dt, raceTime);
    this.animate(dt, raceTime);
  }

  finishRun() {
    this.state = 'finished'; this.t = 0;
    this.model.setFace('joy');
  }

  // ---------- Yapay zekâ ----------
  setRubber(delta, amount) {
    // oyuncudan çok öndeyse biraz yavaşla, çok gerideyse hızlan (zorluğa göre)
    this.skill = clamp(this.baseSkill - clamp(delta / 12, -1, 1) * amount, 0.25, 0.98);
  }

  think(dt) {
    const a = this.ai;
    const per = this.def.personality || { aggression: 0.6, nerves: 0.4 };
    if (this.state === 'ground') {
      if (a.target === undefined) {
        // hedef basış zamanı: beceriye göre tatlı pencereye yakın
        const sweetMid = HOP.goodWindow + this.p.sweet * 0.5;
        const r = Math.random();
        if (r < this.skill) a.target = sweetMid + (Math.random() - 0.5) * this.p.sweet * 0.8;
        else if (r < this.skill + (1 - this.skill) * (0.4 + per.aggression * 0.3)) a.target = Math.random() * HOP.goodWindow; // acele
        else a.target = HOP.goodWindow + this.p.sweet + Math.random() * 0.25; // geç
        // dengesi bozuksa temkinli davran
        if (this.wobble > 0.62 - per.aggression * 0.15) a.target = HOP.goodWindow + this.p.sweet * 0.6 + 0.12;
        if (this.coskun >= 1 && Math.random() < 0.6) this.activateHucum();
      }
      if (this.t >= a.target) { a.target = undefined; this.press(); }
    } else if (this.state === 'air') {
      a.target = undefined;
      // heyecanlı yarışmacılar arada panik yapar
      a.mashCd -= dt;
      if (a.mashCd <= 0) {
        a.mashCd = 0.5;
        if (Math.random() < (1 - this.skill) * per.nerves * 0.35 && this.t < this.airTime - HOP.bufferWindow - 0.05) this.press();
      }
    }
  }

  // ---------- Prosedürel animasyon ----------
  animate(dt, t) {
    const m = this.model;
    // esneme-büzülme yaya
    this.squash += (0 - this.squash) * Math.min(1, dt * 14);
    const sq = this.state === 'air' ? -0.1 * Math.sin(Math.min(1, this.t / this.airTime) * Math.PI) : this.squash;
    const sy = 1 - sq * 0.4, sxz = 1 + sq * 0.2;
    m.hop.scale.set(sxz, sy, sxz);
    m.sack.scale.set(1, (1 + (this.state === 'air' ? 0.04 : -this.squash * 0.15)) * 1.06 * this.sackRise, 1);

    // denge kaybı: yana sallanma
    this.wobbleDir = Math.sin(t * 2.3 + this.lane) > 0 ? 1 : -1;
    const wob = this.wobble;
    const sway = Math.sin(t * (6 + wob * 6) + this.lane * 1.7) * wob * 0.3;
    this.lean += ((this.state === 'air' ? 0.1 + this.combo * 0.018 : 0.03) - this.lean) * Math.min(1, dt * 8);

    if (this.state === 'fallen') {
      const k = this.t / this.p.recover;
      const down = k < 0.18 ? (k / 0.18) : k < 0.72 ? 1 : 1 - (k - 0.72) / 0.28;
      const e = down * down * (3 - 2 * down);
      m.tilt.rotation.z = this.fallSide * e * 1.42;
      m.tilt.rotation.x = -e * 0.2;
      m.hop.position.y = Math.max(0, Math.sin(Math.min(1, k / 0.18) * Math.PI) * 0.2) * (k < 0.18 ? 1 : 0);
      m.root.position.x = this.x + this.fallSide * e * 0.5;
    } else {
      m.tilt.rotation.z = sway;
      m.tilt.rotation.x = -this.lean * 0.6;
      m.root.position.x = this.x;
      if (this.state === 'finished') m.hop.position.y = 0;
    }
    m.root.position.z = -this.z;
    m.root.position.y = 0;
    m.pose(this, dt);
    const lift = m.hop.position.y;
    m.blob.scale.setScalar(Math.max(0.45, 1 - lift * 1.1));
    m.blob.position.x = m.tilt.rotation.z * -0.4;
  }
}
