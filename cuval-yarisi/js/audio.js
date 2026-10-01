// Ses motoru: indirilen efektler + gerçek zamanlı sentezlenen davul ve zurna.
import { assets, SOUNDS } from './assets.js';

// Hicaz makamı (Re karar): Re, Mi♭, Fa♯, Sol, La, Si♭, Do, Re', Mi♭'
const HICAZ = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33, 622.25, 739.99];
// Zurna ezgisi: her eleman bir sekizlik; sayı = makam derecesi, '-' = önceki nota uzar, '.' = sus
const MELODY = [
  // A bölümü
  4, 4, 5, 4, 3, 2, 3, 4, 4, '-', 3, 2, 1, 0, '-', '.',
  0, 1, 2, 3, 4, 5, 4, 3, 2, 3, 2, 1, 0, '-', '-', '.',
  // B bölümü
  7, 7, 6, 5, 4, 5, 6, 7, 6, 5, 4, 3, 4, '-', '-', '.',
  4, 5, 4, 3, 2, 3, 4, 5, 4, 3, 2, 1, 0, '-', '-', '.',
];
// Davul kalıbı (sekizlik): D = güm (tokmak), t = tek (çubuk), . = boş
const DRUM = ['D', '.', 't', 't', 'D', 't', '.', 't'];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.enabled = { sfx: true, music: true };
    this.bpm = 112;
    this.musicOn = false;
    this.zurnaOn = false;
    this.step = 0;
    this.nextTime = 0;
    this.onBeat = null; // davulcu animasyonu için geri çağırma
    this.loops = {};
    this.intensity = 0;
    this.voice = null;
  }

  // İlk kullanıcı dokunuşunda çağrılmalı (iOS kısıtı)
  async unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    this.master.connect(this.comp).connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.8; this.musicBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.gain.value = 0.7; this.ambBus.connect(this.master);
    // Açık hava yankısı: kısa, sentetik bir impuls yanıtı
    this.verb = c.createConvolver();
    this.verb.buffer = this._impulse(1.6, 2.5);
    this.verbSend = c.createGain(); this.verbSend.gain.value = 0.22;
    this.verbSend.connect(this.verb).connect(this.master);
    this._noise = this._makeNoise();
    // silent buffer: iOS kilidini açar
    const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
    await Promise.all(SOUNDS.map(async (k) => {
      try { this.buffers[k] = await c.decodeAudioData(assets.sounds[k].slice(0)); } catch (e) { console.warn('ses çözülemedi', k, e); }
    }));
    this._pickVoice();
    setInterval(() => this._schedule(), 25);
    this.applySettings();
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.enabled.sfx ? 1 : 0, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.enabled.sfx ? 0.7 : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.enabled.music ? 0.8 : 0, t, 0.05);
  }

  _impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
    }
    return b;
  }

  _makeNoise() {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  play(name, { vol = 1, rate = 1, pan = 0, when = 0, verb = 0.3 } = {}) {
    if (!this.ctx || !this.buffers[name]) return null;
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = this.buffers[name];
    src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = vol;
    let node = src.connect(g);
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node = node.connect(p); }
    node.connect(this.sfxBus);
    if (verb > 0) { const vs = c.createGain(); vs.gain.value = verb; node.connect(vs).connect(this.verbSend); }
    src.start(when || c.currentTime);
    return src;
  }

  loop(name, vol, bus = 'amb') {
    if (!this.ctx || !this.buffers[name]) return;
    if (this.loops[name]) { this.loops[name].g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.4); return; }
    const src = this.ctx.createBufferSource(); src.buffer = this.buffers[name]; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.6);
    src.connect(g).connect(bus === 'amb' ? this.ambBus : this.sfxBus);
    src.start();
    this.loops[name] = { src, g };
  }

  setLoopVol(name, vol, tc = 0.3) {
    const l = this.loops[name];
    if (l && this.ctx) l.g.gain.setTargetAtTime(vol, this.ctx.currentTime, tc);
  }

  // ---------- Sentez: davul ----------
  _dum(t, v = 1) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g).connect(this.musicBus); g.connect(this.verbSend);
    o.start(t); o.stop(t + 0.6);
    // deri tokmak darbesi
    const n = c.createBufferSource(); n.buffer = this._noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.5 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(f).connect(ng).connect(this.musicBus);
    n.start(t, Math.random() * 0.5); n.stop(t + 0.1);
  }

  _tek(t, v = 1) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this._noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400 + Math.random() * 400; f.Q.value = 1.4;
    const g = c.createGain(); g.gain.setValueAtTime(0.42 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(f).connect(g).connect(this.musicBus); g.connect(this.verbSend);
    n.start(t, Math.random() * 0.5); n.stop(t + 0.08);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 340;
    const og = c.createGain(); og.gain.setValueAtTime(0.18 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(og).connect(this.musicBus); o.start(t); o.stop(t + 0.08);
  }

  // Oyuncu kendi zıplamasıyla davula vurgu katar
  accent(strength = 1) {
    if (!this.ctx || !this.enabled.music) return;
    this._dum(this.ctx.currentTime + 0.005, 0.55 * strength);
  }

  // ---------- Sentez: zurna ----------
  _zurnaVoice() {
    const c = this.ctx;
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square';
    const vib = c.createOscillator(); vib.frequency.value = 5.6;
    const vibG = c.createGain(); vibG.gain.value = 0;
    vib.connect(vibG); vibG.connect(o1.frequency); vibG.connect(o2.frequency);
    const mix = c.createGain(); mix.gain.value = 0.5;
    const o2g = c.createGain(); o2g.gain.value = 0.35;
    o1.connect(mix); o2.connect(o2g).connect(mix);
    // Zurnanın genizden gelen sesi için iki formant filtresi
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1250; f1.Q.value = 2.2;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2900; f2.Q.value = 3;
    const f2g = c.createGain(); f2g.gain.value = 0.6;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(2.2 * x); }
    shaper.curve = curve;
    const env = c.createGain(); env.gain.value = 0;
    mix.connect(shaper);
    shaper.connect(f1).connect(env); shaper.connect(f2).connect(f2g).connect(env);
    env.connect(hp);
    const out = c.createGain(); out.gain.value = 0.16;
    hp.connect(out).connect(this.musicBus); out.connect(this.verbSend);
    o1.start(); o2.start(); vib.start();
    this.zurna = { o1, o2, vibG, env, out };
  }

  _zurnaNote(t, freq, dur) {
    const z = this.zurna; if (!z) return;
    // süsleme: notaya alttan kısa bir kaydırmayla gir
    const from = freq * (Math.random() < 0.35 ? 0.94 : 0.985);
    for (const o of [z.o1, z.o2]) {
      o.frequency.cancelScheduledValues(t);
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.035);
    }
    z.env.gain.cancelScheduledValues(t);
    z.env.gain.setTargetAtTime(1, t, 0.012);
    z.env.gain.setTargetAtTime(0.82, t + 0.05, 0.08);
    z.vibG.gain.cancelScheduledValues(t);
    z.vibG.gain.setValueAtTime(0, t);
    z.vibG.gain.linearRampToValueAtTime(freq * 0.012, t + Math.min(dur, 0.4));
    if (dur < 0.6) z.env.gain.setTargetAtTime(0.0, t + dur - 0.025, 0.012);
  }

  _zurnaRest(t) {
    if (this.zurna) this.zurna.env.gain.setTargetAtTime(0, t, 0.02);
  }

  startMusic(bpm = 112, zurna = true) {
    if (!this.ctx) return;
    this.bpm = bpm;
    if (!this.musicOn) { this.musicOn = true; this.step = 0; this.nextTime = this.ctx.currentTime + 0.1; }
    this.zurnaOn = zurna;
    if (zurna && !this.zurna) this._zurnaVoice();
    if (!zurna) this._zurnaRest(this.ctx.currentTime);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.ctx) this._zurnaRest(this.ctx.currentTime);
  }

  setTempo(bpm) { this.bpm = bpm; }

  _schedule() {
    if (!this.ctx || !this.musicOn) return;
    const c = this.ctx;
    while (this.nextTime < c.currentTime + 0.12) {
      const t = this.nextTime, eighth = 30 / this.bpm;
      const d = DRUM[this.step % DRUM.length];
      const v = 0.85 + Math.random() * 0.15;
      if (d === 'D') this._dum(t, v);
      else if (d === 't') this._tek(t, v);
      if (this.intensity > 0.6 && d === '.') this._tek(t, 0.5); // coşkuda boşlukları doldur
      if (this.onBeat && d !== '.') {
        const delay = Math.max(0, (t - c.currentTime) * 1000);
        setTimeout(() => this.onBeat(d), delay);
      }
      if (this.zurnaOn) {
        const m = MELODY[this.step % MELODY.length];
        if (typeof m === 'number') {
          let len = 1;
          while (MELODY[(this.step + len) % MELODY.length] === '-') len++;
          this._zurnaNote(t, HICAZ[m] * (this.intensity > 0.6 ? 1 : 1), eighth * len);
        } else if (m === '.') this._zurnaRest(t);
      }
      this.nextTime += eighth;
      this.step++;
    }
  }

  // ---------- Çığırtkan sesi (cihazda Türkçe ses varsa) ----------
  _pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find((v) => /^tr/i.test(v.lang)) || null;
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
  }

  say(text, { rate = 1.05, pitch = 0.85 } = {}) {
    if (!this.enabled.sfx || !this.voice || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.voice; u.lang = this.voice.lang; u.rate = rate; u.pitch = pitch; u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* sessizce geç */ }
  }
}

export const audio = new AudioEngine();
