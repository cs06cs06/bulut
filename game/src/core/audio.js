import * as THREE from 'three';

// Web Audio mixer: buses (music / sfx / ambience), layered engine with RPM crossfades,
// surface loops, positional one-shots and a streamed country music playlist.
export const MUSIC = [
  { file: 'hillbilly_swing.mp3', title: 'Hillbilly Swing', artist: 'Kevin MacLeod' },
  { file: 'gone_fishin_memoraphile.mp3', title: "Gone Fishin'", artist: 'memoraphile' },
  { file: 'still_pickin.mp3', title: 'Still Pickin', artist: 'Kevin MacLeod' },
  { file: 'fireflies_and_stardust.mp3', title: 'Fireflies and Stardust', artist: 'Kevin MacLeod' },
  { file: 'bama_country.mp3', title: 'Bama Country', artist: 'Kevin MacLeod' },
  { file: 'komiku_down_the_river.mp3', title: 'Down the River', artist: 'Komiku' },
  { file: 'river_valley_breakdown.mp3', title: 'River Valley Breakdown', artist: 'Kevin MacLeod' },
  { file: 'guts_and_bourbon.mp3', title: 'Guts and Bourbon', artist: 'Kevin MacLeod' },
];

export const SFX_FILES = ['engine_idle', 'engine_low', 'engine_mid', 'engine_high', 'engine_diesel', 'gravel_loop', 'skid_dirt', 'skid_road',
  'wind_loop', 'birds_loop', 'countryside', 'wheat_field', 'cow_moo_1', 'cow_moo_2', 'rooster', 'chickens', 'stream',
  'crash_1', 'crash_2', 'crash_3', 'impact_wood', 'impact_metal', 'impact_stone', 'land_thud', 'suspension', 'horn', 'gear',
  'engine_start', 'door_close', 'ui_click', 'ui_hover', 'ui_switch', 'discover', 'rain_loop', 'thunder_1', 'thunder_2'];

export class AudioSystem {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    // gentle master compressor for a polished mix
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.bus = {};
    for (const b of ['music', 'sfx', 'amb', 'ui']) { this.bus[b] = this.ctx.createGain(); this.bus[b].connect(comp); }
    comp.connect(this.master);
    this.buffers = {};
    this.loops = {};
    this.volumes = { master: 0.9, music: 0.55, sfx: 0.9, amb: 0.7 };
    this.applyVolumes();
    this.listener = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1) };
    this.trackIndex = Math.floor(Math.random() * MUSIC.length);
    this.musicEl = null;
    this.onTrack = null;
  }

  applyVolumes() {
    const v = this.volumes, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.bus.music.gain.setTargetAtTime(v.music, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.bus.amb.gain.setTargetAtTime(v.amb, t, 0.05);
    this.bus.ui.gain.setTargetAtTime(Math.max(v.sfx, 0.4), t, 0.05);
  }

  async load(name, url) {
    const buf = await (await fetch(url)).arrayBuffer();
    this.buffers[name] = await this.ctx.decodeAudioData(buf);
  }

  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }

  loop(name, bus = 'sfx', { volume = 0, rate = 1, offset = Math.random() } = {}) {
    const buf = this.buffers[name];
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = volume;
    src.connect(g); g.connect(this.bus[bus]);
    src.start(0, offset * buf.duration);
    const l = { src, gain: g, set: (vol, r, tc = 0.06) => {
      const t = this.ctx.currentTime;
      g.gain.setTargetAtTime(vol, t, tc);
      if (r !== undefined) src.playbackRate.setTargetAtTime(r, t, tc);
    }, stop: () => { try { src.stop(); } catch (e) { /* already stopped */ } } };
    return l;
  }

  play(name, { volume = 1, rate = 1, bus = 'sfx', position = null, maxDist = 220 } = {}) {
    const buf = this.buffers[name];
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = volume;
    src.connect(g);
    if (position) {
      const pan = this.ctx.createStereoPanner();
      const d = position.distanceTo(this.listener.pos);
      if (d > maxDist) return null;
      g.gain.value = volume * Math.pow(1 - d / maxDist, 2);
      const to = position.clone().sub(this.listener.pos).normalize();
      const right = new THREE.Vector3().crossVectors(this.listener.fwd, new THREE.Vector3(0, 1, 0)).normalize();
      pan.pan.value = THREE.MathUtils.clamp(to.dot(right), -1, 1) * 0.8;
      g.connect(pan); pan.connect(this.bus[bus]);
    } else g.connect(this.bus[bus]);
    src.start();
    return { src, gain: g };
  }

  // ------------------------------------------------------------- vehicle
  startVehicle() {
    const L = this.loops;
    L.idle = this.loop('engine_idle', 'sfx');
    L.low = this.loop('engine_low', 'sfx');
    L.mid = this.loop('engine_mid', 'sfx');
    L.high = this.loop('engine_high', 'sfx');
    L.diesel = this.loop('engine_diesel', 'sfx');
    L.gravel = this.loop('gravel_loop', 'sfx');
    L.skidDirt = this.loop('skid_dirt', 'sfx');
    L.skidRoad = this.loop('skid_road', 'sfx');
    L.windFast = this.loop('wind_loop', 'sfx');
    // engine low-pass filter opens with throttle (muffled when coasting)
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 2500;
    for (const k of ['idle', 'low', 'mid', 'high', 'diesel']) { L[k].gain.disconnect(); L[k].gain.connect(this.engineFilter); }
    this.engineFilter.connect(this.bus.sfx);
  }

  updateVehicle(v, dt, paused = false) {
    const L = this.loops;
    if (!L.idle) return;
    if (paused) { for (const k in L) L[k]?.set(0); return; }
    const rpm = v.rpm, thr = v.throttle;
    const x = THREE.MathUtils.clamp((rpm - 850) / (6200 - 850), 0, 1);
    const bell = (c, w) => Math.max(0, 1 - Math.abs(x - c) / w);
    const load = 0.55 + thr * 0.45;
    L.idle.set(bell(0, 0.22) * 0.55, 0.85 + x * 2.4);
    L.diesel.set(bell(0.18, 0.3) * 0.45 * load, 0.75 + x * 1.6);
    L.low.set(bell(0.32, 0.32) * 0.7 * load, 0.7 + x * 1.3);
    L.mid.set(bell(0.62, 0.3) * 0.42 * load, 0.62 + x * 0.75);
    L.high.set(bell(0.95, 0.32) * 0.36 * load, 0.62 + x * 0.55);
    this.engineFilter.frequency.setTargetAtTime(900 + thr * 5200 + x * 1500, this.ctx.currentTime, 0.08);

    // surfaces
    let ground = 0, slipDirt = 0, slipRoad = 0, n = 0;
    for (const w of v.wheelState) {
      if (!w.contact) continue;
      n++;
      ground += 1;
      if (w.surface === 'rock') slipRoad = Math.max(slipRoad, w.slip); else slipDirt = Math.max(slipDirt, w.slip);
    }
    const sp = v.speed;
    const roll = n > 0 ? Math.min(1, sp / 18) * (ground / 4) : 0;
    L.gravel.set(roll * 0.55, 0.7 + Math.min(1, sp / 30) * 0.6);
    L.skidDirt.set(slipDirt * Math.min(1, sp / 4) * 0.6, 0.9 + slipDirt * 0.2);
    L.skidRoad.set(slipRoad * Math.min(1, sp / 5) * 0.35, 1);
    L.windFast.set(Math.min(1, Math.max(0, sp - 8) / 30) * 0.45, 0.9 + Math.min(1, sp / 40) * 0.6);
  }

  // ------------------------------------------------------------- ambience
  startAmbience() {
    this.loops.birds = this.loop('birds_loop', 'amb', { volume: 0 });
    this.loops.country = this.loop('countryside', 'amb', { volume: 0 });
    this.loops.wind = this.loop('wind_loop', 'amb', { volume: 0 });
    this.loops.wheat = this.loop('wheat_field', 'amb', { volume: 0 });
    this.loops.birds.set(0.45, 1, 2); this.loops.country.set(0.35, 1, 2); this.loops.wind.set(0.25, 1, 2);
  }

  updateAmbience(height, nearTrees, inField) {
    const L = this.loops;
    if (!L.birds) return;
    const hi = THREE.MathUtils.smoothstep(height, 120, 330);
    L.wind.set(0.18 + hi * 0.55, 1, 1.5);
    L.birds.set((0.25 + nearTrees * 0.5) * (1 - hi * 0.7), 1, 1.5);
    L.country.set(0.3 * (1 - hi * 0.6), 1, 1.5);
    L.wheat.set(inField * 0.4, 1, 1.5);
  }

  // ------------------------------------------------------------- music
  playMusic(index = this.trackIndex) {
    this.trackIndex = (index + MUSIC.length) % MUSIC.length;
    const t = MUSIC[this.trackIndex];
    if (!this.musicEl) {
      this.musicEl = new Audio();
      this.musicEl.crossOrigin = 'anonymous';
      this.musicNode = this.ctx.createMediaElementSource(this.musicEl);
      this.musicNode.connect(this.bus.music);
      this.musicEl.addEventListener('ended', () => this.playMusic(this.trackIndex + 1));
    }
    this.musicEl.src = `assets/music/${t.file}`;
    this.musicEl.play().catch(() => {});
    this.onTrack?.(t);
  }

  nextTrack() { this.playMusic(this.trackIndex + 1); }
  toggleMusic() {
    if (!this.musicEl) return this.playMusic();
    if (this.musicEl.paused) { this.musicEl.play(); return true; }
    this.musicEl.pause(); return false;
  }

  setListener(pos, fwd) { this.listener.pos.copy(pos); this.listener.fwd.copy(fwd); }
}
