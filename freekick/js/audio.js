// Web Audio mixer: decoded buffers, one-shot voices with pitch/pan variation and a
// crowd bed whose loudness follows the tension on the pitch.
export class Audio {
  constructor(buffers) {
    this.raw = buffers;
    this.buffers = {};
    this.ctx = null;
    this.muted = false;
    this.crowdLevel = 0.35;
    this.crowdTarget = 0.35;
  }

  /** Must run inside a user gesture (browsers keep audio locked until then). */
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3.5;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.crowdBus = this.ctx.createGain();
      this.crowdBus.gain.value = 0;
      this.crowdBus.connect(this.master);
      await Promise.all(Object.entries(this.raw).map(async ([k, buf]) => {
        if (!buf) return;
        try { this.buffers[k] = await this.ctx.decodeAudioData(buf.slice(0)); } catch (e) { /* unsupported codec: skip */ }
      }));
      this.startBed();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  startBed() {
    const loop = (name, gain) => {
      const b = this.buffers[name];
      if (!b) return null;
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      // skip the mp3 encoder padding at both ends for a seamless loop
      src.loopStart = 0.06;
      src.loopEnd = b.duration - 0.06;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.crowdBus);
      src.start(0, Math.random() * (b.duration - 1));
      return g;
    };
    this.ambGain = loop('ambience', 0.8);
    this.chantGain = loop('chant', 0.0);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  play(name, { vol = 1, rate = 1, pan = 0, detune = 0.04, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const b = this.buffers[name];
    if (!b) return;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * detune);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    let node = src.connect(g);
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(this.sfx);
    src.start(this.ctx.currentTime + delay);
    return { src, gain: g };
  }

  /** Crowd reaction layered over the bed. */
  crowd(name, vol = 1) {
    if (!this.ctx || this.muted) return;
    const b = this.buffers[name];
    if (!b) return;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.crowdBus);
    src.start();
  }

  /** 0..1 — the bed swells as a shot heads toward goal. */
  setTension(x) { this.crowdTarget = 0.35 + x * 0.65; }

  update(dt) {
    if (!this.ctx) return;
    this.crowdLevel += (this.crowdTarget - this.crowdLevel) * Math.min(1, dt * 2.5);
    this.crowdBus.gain.value = this.crowdLevel;
    if (this.chantGain) this.chantGain.gain.value = Math.max(0, 0.55 - this.crowdLevel * 0.4);
  }
}
