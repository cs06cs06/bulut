// WebAudio manager: decoded CC0 samples, dynamic stadium ambience, synthesized extras (whoosh, thump, heartbeat).
const FILES = {
  ambience: 'ambience_loop', cheer1: 'cheer_goal', cheer2: 'cheer_goal2', oooh: 'crowd_oooh', sigh: 'crowd_sigh', boo: 'crowd_boo',
  gasp: 'crowd_gasp', chant: 'crowd_chant', kick: 'kick', kickHard: 'kick_hard', net: 'net', bounce: 'bounce', whistle: 'whistle', post: 'post',
};

export class AudioManager {
  constructor() {
    this.ctx = null; this.buffers = {}; this.enabled = true; this.ready = false;
    this.vol = { master: 0.9, sfx: 1.0, crowd: 0.8 };
    this.tension = 0.4;
  }
  async load(onProgress) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol.master;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    this.crowdBus = this.ctx.createGain(); this.crowdBus.gain.value = this.vol.crowd; this.crowdFilter = this.ctx.createBiquadFilter(); this.crowdFilter.type = 'lowpass'; this.crowdFilter.frequency.value = 6000;
    this.crowdBus.connect(this.crowdFilter); this.crowdFilter.connect(this.master);
    // simple convolution-free "stadium" reverb: feedback delays
    this.rev = this.ctx.createGain(); this.rev.gain.value = 0.18;
    const d1 = this.ctx.createDelay(1); d1.delayTime.value = 0.093; const d2 = this.ctx.createDelay(1); d2.delayTime.value = 0.167;
    const fb = this.ctx.createGain(); fb.gain.value = 0.42; const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.sfxBus.connect(d1); d1.connect(lp); lp.connect(d2); d2.connect(fb); fb.connect(d1); d2.connect(this.rev); this.rev.connect(this.master);
    const names = Object.keys(FILES); let done = 0;
    await Promise.all(names.map(async n => {
      try {
        const r = await fetch(`./assets/audio/${FILES[n]}.mp3`);
        const ab = await r.arrayBuffer();
        this.buffers[n] = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
      } catch (e) { console.warn('audio load failed', n, e); }
      onProgress && onProgress(++done / names.length);
    }));
    // noise buffer for synth
    const nb = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate); const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    this.ready = true;
  }
  async unlock() { if (this.ctx && this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) { } } }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.setTargetAtTime(on ? this.vol.master : 0, this.ctx.currentTime, 0.05); }
  startAmbience() {
    if (!this.ready || this.amb) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.buffers.ambience; src.loop = true;
    this.ambGain = this.ctx.createGain(); this.ambGain.gain.value = 0.55;
    src.connect(this.ambGain); this.ambGain.connect(this.crowdBus); src.start();
    this.amb = src;
  }
  // 0 = hushed, 1 = roaring
  setTension(t, time = 0.6) { if (!this.ready) return; const c = this.ctx.currentTime; this.ambGain && this.ambGain.gain.setTargetAtTime(0.32 + t * 0.55, c, time); this.crowdFilter.frequency.setTargetAtTime(2500 + t * 6000, c, time); }
  play(name, { vol = 1, rate = 1, pan = 0, delay = 0, bus = 'sfx', fadeOut = 0, offset = 0 } = {}) {
    if (!this.ready || !this.enabled || !this.buffers[name]) return null;
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.buffers[name]; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = vol;
    let node = src; src.connect(g); node = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(bus === 'crowd' ? this.crowdBus : this.sfxBus);
    const t0 = c.currentTime + delay;
    src.start(t0, offset);
    if (fadeOut) { g.gain.setValueAtTime(vol, t0 + Math.max(0, src.buffer.duration / rate - fadeOut)); g.gain.linearRampToValueAtTime(0, t0 + src.buffer.duration / rate); }
    return { src, gain: g, stop: (t = 0.2) => { try { g.gain.setTargetAtTime(0, c.currentTime, t / 3); src.stop(c.currentTime + t); } catch (e) { } } };
  }
  whoosh(dur = 0.5, from = 400, to = 2400, vol = 0.25) {
    if (!this.ready || !this.enabled) return;
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(from, c.currentTime); f.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.linearRampToValueAtTime(vol, c.currentTime + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(); src.stop(c.currentTime + dur + 0.05);
  }
  thump(freq = 70, dur = 0.22, vol = 0.5) {
    if (!this.ready || !this.enabled) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq * 1.8, c.currentTime); o.frequency.exponentialRampToValueAtTime(freq, c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(); o.stop(c.currentTime + dur + 0.02);
  }
  heartbeat(rate = 1.2) {
    this.thump(58, 0.16, 0.35); setTimeout(() => this.thump(52, 0.2, 0.28), 170 / rate);
  }
  tick() { this.thump(880, 0.05, 0.08); }
}
