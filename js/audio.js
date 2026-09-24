/* Ses motoru: Kenney örnekleri + WebAudio ile sentezlenen efektler ve müzik. */
(function (root) {
  var AC = root.AudioContext || root.webkitAudioContext;

  var FILES = {
    wood: ['wood0', 'wood1', 'wood2'], glass: ['glass0', 'glass1', 'glass2'], stone: ['stone0', 'stone1', 'stone2'],
    punch: ['punch0', 'punch1', 'punch2'], soft: ['soft0', 'soft1', 'soft2'],
    woodbreak: ['woodbreak0', 'woodbreak1'], glassbreak: ['glassbreak0', 'glassbreak1'], stonebreak: ['stonebreak0', 'stonebreak1'],
    click: ['click'], select: ['select'], pluck: ['pluck'], confirm: ['confirm'], pop: ['pop'],
    win: ['jingles_PIZZI01'], star: ['jingles_PIZZI10'], start: ['jingles_HIT00'], fanfare: ['jingles_STEEL00']
  };

  var Audio = {
    ctx: null, master: null, sfxGain: null, musicGain: null, buffers: {},
    sfxOn: true, musicOn: true, last: {}, musicTimer: null,

    init: function () {
      try {
        this.sfxOn = localStorage.getItem('ok_sfx') !== '0';
        this.musicOn = localStorage.getItem('ok_music') !== '0';
      } catch (e) {}
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
      var comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxOn ? 1 : 0;
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicOn ? 0.32 : 0;
      this.sfxGain.connect(this.master); this.musicGain.connect(this.master);
      // Kısa gürültü tamponu
      var len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this.noise.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },

    load: function (onProgress) {
      var self = this, names = [];
      Object.keys(FILES).forEach(function (k) { FILES[k].forEach(function (n) { names.push(n); }); });
      var done = 0;
      if (!this.ctx) return Promise.resolve();
      return Promise.all(names.map(function (n) {
        return fetch('assets/sfx/' + n + '.mp3').then(function (r) { return r.arrayBuffer(); })
          .then(function (ab) {
            return new Promise(function (res) {
              self.ctx.decodeAudioData(ab, function (b) { self.buffers[n] = b; res(); }, function () { res(); });
            });
          })
          .catch(function () {})
          .then(function () { done++; if (onProgress) onProgress(done / names.length); });
      }));
    },

    unlock: function () {
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    },

    setSfx: function (on) {
      this.sfxOn = on;
      if (this.sfxGain) this.sfxGain.gain.value = on ? 1 : 0;
      try { localStorage.setItem('ok_sfx', on ? '1' : '0'); } catch (e) {}
    },
    setMusic: function (on) {
      this.musicOn = on;
      if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.2);
      try { localStorage.setItem('ok_music', on ? '1' : '0'); } catch (e) {}
    },

    play: function (group, vol, rate, throttle) {
      if (!this.ctx || !this.sfxOn) return;
      var now = this.ctx.currentTime;
      if (throttle && this.last[group] && now - this.last[group] < throttle) return;
      this.last[group] = now;
      var list = FILES[group] || [group];
      var b = this.buffers[list[Math.floor(Math.random() * list.length)]];
      if (!b) return;
      var src = this.ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = (rate || 1) * (0.94 + Math.random() * 0.12);
      var g = this.ctx.createGain();
      g.gain.value = vol == null ? 1 : vol;
      src.connect(g); g.connect(this.sfxGain);
      src.start();
    },

    // ---- Sentez ----
    env: function (node, t, a, peak, dec, end) {
      var g = node.gain;
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(peak, t + a);
      g.exponentialRampToValueAtTime(end || 0.0001, t + a + dec);
    },

    noiseBurst: function (t, dur, freq, q, vol, type, sweepTo) {
      var c = this.ctx, s = c.createBufferSource();
      s.buffer = this.noise;
      var f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      var g = c.createGain();
      this.env(g, t, 0.005, vol, dur);
      s.connect(f); f.connect(g); g.connect(this.sfxGain);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },

    tone: function (t, type, f0, f1, dur, vol, dest, attack) {
      var c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      this.env(g, t, attack || 0.01, vol, dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t); o.stop(t + dur + (attack || 0.01) + 0.05);
      return o;
    },

    stretch: function () {
      if (!this.ctx || !this.sfxOn) return;
      var t = this.ctx.currentTime;
      this.noiseBurst(t, 0.35, 900, 6, 0.25, 'bandpass', 2400);
      this.tone(t, 'sawtooth', 110, 190, 0.3, 0.05);
    },

    launch: function (type) {
      if (!this.ctx || !this.sfxOn) return;
      var t = this.ctx.currentTime;
      this.play('pluck', 0.8, 0.8);
      this.noiseBurst(t, 0.45, 600, 0.8, 0.35, 'bandpass', 2800);
      // Kuş çığlığı
      var base = { red: 620, yellow: 820, blue: 980, black: 380 }[type] || 600;
      var c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      var lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'square'; f.type = 'lowpass'; f.frequency.value = 2600;
      o.frequency.setValueAtTime(base, t + 0.05);
      o.frequency.linearRampToValueAtTime(base * 1.6, t + 0.2);
      o.frequency.linearRampToValueAtTime(base * 1.1, t + 0.75);
      lfo.frequency.value = 11; lg.gain.value = base * 0.06;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.connect(f); f.connect(g); g.connect(this.sfxGain);
      o.start(t); lfo.start(t); o.stop(t + 0.85); lfo.stop(t + 0.85);
    },

    ability: function (kind) {
      if (!this.ctx || !this.sfxOn) return;
      var t = this.ctx.currentTime;
      if (kind === 'boost') {
        this.noiseBurst(t, 0.4, 1200, 1.2, 0.5, 'bandpass', 5000);
        this.tone(t, 'sawtooth', 300, 1400, 0.25, 0.08);
      } else if (kind === 'split') {
        this.tone(t, 'triangle', 1300, 1900, 0.12, 0.15);
        this.tone(t + 0.06, 'triangle', 1600, 2300, 0.12, 0.12);
      }
    },

    explosion: function (big) {
      if (!this.ctx || !this.sfxOn) return;
      var t = this.ctx.currentTime;
      this.noiseBurst(t, 1.1, 1800, 0.7, 0.9, 'lowpass', 120);
      this.tone(t, 'sine', 140, 38, 0.9, 0.9);
      this.tone(t, 'triangle', 90, 30, 0.6, 0.5);
      this.noiseBurst(t + 0.02, 0.25, 3500, 0.8, 0.3, 'highpass');
      this.play('stonebreak', 0.6, 0.6);
    },

    oink: function (pitch) {
      if (!this.ctx || !this.sfxOn) return;
      var t = this.ctx.currentTime, p = pitch || 1;
      var c = this.ctx;
      for (var i = 0; i < 2; i++) {
        var tt = t + i * 0.13;
        var o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(260 * p, tt);
        o.frequency.exponentialRampToValueAtTime(170 * p, tt + 0.12);
        f.type = 'bandpass'; f.frequency.value = 900 * p; f.Q.value = 4;
        this.env(g, tt, 0.01, 0.35, 0.12);
        o.connect(f); f.connect(g); g.connect(this.sfxGain);
        o.start(tt); o.stop(tt + 0.2);
      }
    },

    pigPop: function () {
      if (!this.ctx || !this.sfxOn) return;
      var t = this.ctx.currentTime;
      this.tone(t, 'sine', 520, 90, 0.18, 0.5);
      this.noiseBurst(t, 0.3, 1400, 1, 0.35, 'bandpass', 400);
      this.play('pop', 0.7, 0.9);
    },

    laugh: function () {
      if (!this.ctx || !this.sfxOn) return;
      var t = this.ctx.currentTime, c = this.ctx;
      for (var i = 0; i < 4; i++) {
        var tt = t + i * 0.12, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(330 - i * 20, tt);
        o.frequency.exponentialRampToValueAtTime(240 - i * 20, tt + 0.08);
        f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3;
        this.env(g, tt, 0.01, 0.22, 0.08);
        o.connect(f); f.connect(g); g.connect(this.sfxGain);
        o.start(tt); o.stop(tt + 0.14);
      }
    },

    lose: function () {
      if (!this.ctx || !this.sfxOn) return;
      var t = this.ctx.currentTime, c = this.ctx;
      var notes = [392, 370, 349, 262];
      for (var i = 0; i < 4; i++) {
        var tt = t + i * 0.42, dur = i === 3 ? 1.1 : 0.38;
        var o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = notes[i] / 2;
        f.type = 'lowpass'; f.Q.value = 6;
        f.frequency.setValueAtTime(400, tt); f.frequency.linearRampToValueAtTime(1600, tt + 0.12); f.frequency.linearRampToValueAtTime(500, tt + dur);
        if (i === 3) { l.frequency.value = 6; lg.gain.value = 5; l.connect(lg); lg.connect(o.frequency); l.start(tt); l.stop(tt + dur + 0.1); }
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.25, tt + 0.04); g.gain.setValueAtTime(0.25, tt + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
        o.connect(f); f.connect(g); g.connect(this.sfxGain);
        o.start(tt); o.stop(tt + dur + 0.05);
      }
    },

    starDing: function (i) {
      if (!this.ctx || !this.sfxOn) return;
      var t = this.ctx.currentTime, f = [880, 1109, 1319][i] || 1319;
      this.tone(t, 'triangle', f, f, 0.5, 0.25);
      this.tone(t, 'sine', f * 2, f * 2, 0.35, 0.12);
      this.tone(t + 0.05, 'sine', f * 1.5, f * 1.5, 0.4, 0.08);
    },

    tick: function () {
      if (!this.ctx || !this.sfxOn) return;
      this.tone(this.ctx.currentTime, 'square', 1800, 1800, 0.03, 0.04);
    },

    // ---- Prosedürel müzik: hafif pizzicato/marimba döngüsü ----
    startMusic: function (mood) {
      if (!this.ctx) return;
      this.stopMusic();
      var self = this, c = this.ctx;
      var bpm = mood === 'dusk' ? 92 : mood === 'desert' ? 104 : 112;
      var beat = 60 / bpm / 2;
      var scales = {
        meadow: [0, 2, 4, 7, 9, 12, 14, 16],
        desert: [0, 1, 4, 5, 7, 8, 11, 12],
        dusk: [0, 3, 5, 7, 10, 12, 15, 17],
        menu: [0, 2, 4, 7, 9, 12, 14, 16]
      };
      var root0 = { meadow: 60, desert: 57, dusk: 55, menu: 62 }[mood] || 60;
      var sc = scales[mood] || scales.meadow;
      var prog = [0, 5, 3, 4];
      var step = 0, next = c.currentTime + 0.1;
      var seed = 3;
      function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
      var pattern = [];
      for (var i = 0; i < 16; i++) pattern.push(rnd() < 0.62 ? Math.floor(rnd() * 6) : -1);
      function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
      function pluck(t, freq, vol, dur, type) {
        var o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
        o.type = type || 'triangle'; o.frequency.value = freq;
        f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t); f.frequency.exponentialRampToValueAtTime(freq * 1.2, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(self.musicGain);
        o.start(t); o.stop(t + dur + 0.05);
      }
      function schedule() {
        if (next < c.currentTime - 0.05) next = c.currentTime + 0.05;
        while (next < c.currentTime + 0.3) {
          var bar = Math.floor(step / 16) % 4, s16 = step % 16;
          var chordRoot = root0 + [0, 5, 3, 7][bar] - (bar === 2 ? 12 : 0);
          if (s16 % 8 === 0) pluck(next, mtof(chordRoot - 24), 0.35, beat * 3.5, 'sine');
          if (s16 % 8 === 4) pluck(next, mtof(chordRoot - 17), 0.18, beat * 2, 'sine');
          var n = pattern[s16];
          if (n >= 0) pluck(next, mtof(root0 + sc[(n + prog[bar]) % sc.length]), 0.12, beat * 1.6, 'triangle');
          if (s16 % 4 === 2) pluck(next, mtof(chordRoot + 12 + sc[2]), 0.04, beat * 0.8, 'square');
          next += beat; step++;
        }
      }
      schedule();
      this.musicTimer = setInterval(schedule, 100);
    },
    stopMusic: function () {
      if (this.musicTimer) clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  };

  root.GameAudio = Audio;
})(window);
