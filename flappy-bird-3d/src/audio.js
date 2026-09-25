// Ses efektleri Web Audio ile anlık sentezlenir; ses dosyası indirilmez.
// Tarayıcılar sesi ancak bir kullanıcı etkileşiminden sonra açtığı için
// AudioContext ilk dokunuşta `unlock()` ile oluşturulur.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noise = null;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.noise = this.#makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  #makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  #env(gain, t, attack, peak, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  #ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  // Kanat çırpma: bant geçiren filtreden süzülen kısa "vuş" sesi.
  flap() {
    if (!this.#ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(1500, t);
    filter.frequency.exponentialRampToValueAtTime(420, t + 0.14);
    const gain = this.ctx.createGain();
    this.#env(gain, t, 0.01, 0.7, 0.14);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.3, 0.2);
  }

  // Puan: iki notalı parlak "ding".
  point() {
    if (!this.#ready()) return;
    const t = this.ctx.currentTime;
    [[988, 0], [1480, 0.08]].forEach(([freq, delay]) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      this.#env(gain, t + delay, 0.005, 0.18, 0.16);
      osc.connect(gain).connect(this.master);
      osc.start(t + delay);
      osc.stop(t + delay + 0.25);
    });
  }

  // Çarpma: alçak frekanslı tok bir vuruş + gürültü patlaması.
  hit() {
    if (!this.#ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    const gain = this.ctx.createGain();
    this.#env(gain, t, 0.005, 0.9, 0.22);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const ng = this.ctx.createGain();
    this.#env(ng, t, 0.002, 0.6, 0.12);
    src.connect(filter).connect(ng).connect(this.master);
    src.start(t, 0, 0.15);
  }

  // Düşüş: aşağı kayan bir ıslık.
  fall() {
    if (!this.#ready()) return;
    const t = this.ctx.currentTime + 0.12;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.55);
    const gain = this.ctx.createGain();
    this.#env(gain, t, 0.02, 0.28, 0.55);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.62);
  }

  // Menüden oyuna geçiş: yukarı kayan kısa "vuu".
  swoosh() {
    if (!this.#ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
    const gain = this.ctx.createGain();
    this.#env(gain, t, 0.05, 0.45, 0.22);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, 0, 0.32);
  }
}
