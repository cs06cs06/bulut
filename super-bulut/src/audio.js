// WebAudio ile sentezlenen ses efektleri ve özgün arka plan müziği (dosya gerekmez).

const NOTE = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
  return 440 * Math.pow(2, (base + (Number(m[3]) + 1) * 12 - 69) / 12);
};

// 8'lik notalar; '.' sus, '-' önceki notayı uzat
const MELODY = [
  'C5 . E5 G5 . E5 C5 .',
  'D5 . F5 A5 . G5 F5 E5',
  'E5 . G5 C6 . B5 A5 G5',
  'A5 G5 E5 D5 C5 - - .',
  'F5 . A5 . G5 . E5 .',
  'D5 E5 F5 . E5 D5 C5 .',
  'E5 . D5 . C5 . A4 B4',
  'C5 - G4 . C5 - - .',
]
  .join(' ')
  .split(' ');

const BASS = [
  'C3 . G3 . C3 . G3 .',
  'D3 . A3 . D3 . A3 .',
  'E3 . B3 . E3 . B3 .',
  'F3 . C4 . G3 . D4 .',
  'F3 . C4 . F3 . C4 .',
  'D3 . A3 . G3 . D4 .',
  'A2 . E3 . F3 . C4 .',
  'G3 . D4 . C3 . G3 .',
]
  .join(' ')
  .split(' ');

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('superbulut.muted') === '1';
    } catch {}
    this.music = { playing: false, step: 0, nextTime: 0, tempo: 150, timer: null };
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.55;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.28;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('superbulut.muted', this.muted ? '1' : '0');
    } catch {}
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0, bus = this.sfxBus } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.2, freq = 1500, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur);
  }

  arp(notes, step, opts = {}) {
    notes.forEach((n, i) => this.tone(NOTE(n), step * 1.6, { ...opts, delay: (opts.delay || 0) + i * step }));
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump':
        this.tone(280, 0.16, { slide: 640, vol: 0.12 });
        break;
      case 'jumpBig':
        this.tone(200, 0.2, { slide: 520, vol: 0.13 });
        break;
      case 'coin':
        this.tone(NOTE('B5'), 0.07, { vol: 0.12 });
        this.tone(NOTE('E6'), 0.35, { vol: 0.12, delay: 0.07 });
        break;
      case 'stomp':
        this.tone(520, 0.12, { type: 'triangle', slide: 110, vol: 0.3 });
        this.noise(0.06, { vol: 0.15, freq: 900 });
        break;
      case 'bump':
        this.tone(140, 0.09, { type: 'triangle', slide: 90, vol: 0.3 });
        break;
      case 'break':
        this.noise(0.3, { vol: 0.35, freq: 1400 });
        this.tone(120, 0.15, { type: 'triangle', slide: 60, vol: 0.3 });
        break;
      case 'appear':
        this.tone(220, 0.45, { type: 'triangle', slide: 880, vol: 0.2 });
        break;
      case 'powerup':
        this.arp(['C5', 'G4', 'C5', 'E5', 'G5', 'C6', 'G5', 'C6', 'E6'], 0.045, { vol: 0.1 });
        break;
      case 'nazar':
        this.arp(['E5', 'B5', 'E6', 'G#5', 'B5', 'E6', 'B6'], 0.05, { vol: 0.1, type: 'triangle' });
        break;
      case 'shrink':
        this.arp(['C6', 'G5', 'E5', 'C5', 'G4', 'C4'], 0.05, { vol: 0.1 });
        break;
      case 'oneup':
        this.arp(['E6', 'G6', 'E7', 'C7', 'D7', 'G7'], 0.08, { vol: 0.09 });
        break;
      case 'kick':
        this.tone(700, 0.1, { slide: 200, vol: 0.15 });
        break;
      case 'die':
        this.tone(NOTE('G5'), 0.12, { vol: 0.12 });
        this.tone(NOTE('D5'), 0.12, { vol: 0.12, delay: 0.14 });
        this.tone(NOTE('A4'), 1.0, { vol: 0.13, slide: 80, delay: 0.32 });
        break;
      case 'flag':
        this.tone(200, 1.0, { type: 'triangle', slide: 1200, vol: 0.2 });
        break;
      case 'clear':
        this.arp(['G4', 'C5', 'E5', 'G5', 'C6'], 0.12, { vol: 0.12 });
        this.tone(NOTE('E6'), 0.8, { vol: 0.12, delay: 0.62 });
        this.tone(NOTE('C6'), 0.8, { vol: 0.08, delay: 0.62, type: 'triangle' });
        break;
      case 'tick':
        this.tone(1320, 0.03, { vol: 0.05 });
        break;
      case 'pause':
        this.tone(NOTE('E6'), 0.06, { vol: 0.08 });
        this.tone(NOTE('C6'), 0.1, { vol: 0.08, delay: 0.08 });
        break;
      case 'hurry':
        this.arp(['C6', 'D6', 'E6', 'C6', 'D6', 'E6'], 0.08, { vol: 0.1 });
        break;
      case 'gameover':
        this.arp(['C5', 'G4', 'E4', 'A4', 'B4', 'A4', 'G#4', 'A#4', 'G#4', 'G4'], 0.14, { vol: 0.1, type: 'triangle' });
        break;
    }
  }

  // ---- Müzik
  startMusic(tempo = 150) {
    if (!this.ctx) return;
    this.music.tempo = tempo;
    if (this.music.playing) return;
    this.music.playing = true;
    this.music.step = 0;
    this.music.nextTime = this.ctx.currentTime + 0.08;
    this.music.timer = setInterval(() => this.#schedule(), 25);
  }

  setTempo(tempo) {
    this.music.tempo = tempo;
  }

  stopMusic() {
    this.music.playing = false;
    clearInterval(this.music.timer);
    this.music.timer = null;
  }

  #schedule() {
    const m = this.music;
    const stepDur = 60 / m.tempo / 2;
    while (m.nextTime < this.ctx.currentTime + 0.12) {
      const i = m.step % MELODY.length;
      this.#note(MELODY, i, m.nextTime, stepDur, { type: 'square', vol: 0.09 });
      this.#note(BASS, i, m.nextTime, stepDur, { type: 'triangle', vol: 0.22 });
      if (i % 2 === 0) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 6000;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(i % 8 === 4 ? 0.12 : 0.05, m.nextTime);
        g.gain.exponentialRampToValueAtTime(0.0001, m.nextTime + 0.05);
        src.connect(f).connect(g).connect(this.musicBus);
        src.start(m.nextTime);
        src.stop(m.nextTime + 0.06);
      }
      m.nextTime += stepDur;
      m.step++;
    }
  }

  #note(track, i, time, stepDur, { type, vol }) {
    const n = track[i];
    if (n === '.' || n === '-') return;
    let len = 1;
    while (track[(i + len) % track.length] === '-') len++;
    const dur = stepDur * len * 0.92;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = NOTE(n);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
    g.gain.setValueAtTime(vol, time + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }
}
