/*
 * Kağıt Top — buruşturulmuş kağıdı çöp kutusuna atma oyunu.
 * Saf JavaScript + Canvas 2D; görsel/ses/font dosyaları assets/ klasöründen
 * yüklenir (bkz. download-assets.sh).
 */
(() => {
  'use strict';

  // ------------------------------------------------------------------
  // Sabitler
  // ------------------------------------------------------------------
  const W = 1280;
  const H = 720;
  const FLOOR_TOP = 628;          // duvar ile zeminin birleştiği çizgi (görsel)
  const GROUND = 656;             // top ve kutunun zemine değdiği çizgi
  const DESK = { x2: 292, y: 468, thick: 20 };
  const BALL_R = 20;
  const REST = { x: 236, y: DESK.y - BALL_R };
  const GRAVITY = 1500;
  const WIND_ACC = 55;            // 1 m/s rüzgârın yatay ivmesi (px/s²)
  const AIR_DRAG = 0.12;
  const MAX_PULL = 200;           // en fazla çekme mesafesi (px)
  const MAX_SPEED = 1550;         // en fazla atış hızı (px/s)
  const STEP = 1 / 240;           // sabit fizik adımı
  const LIVES = 3;
  const SETTLE_TIME = 1.25;       // atış sonucu ile yeni top arasındaki süre
  const WINDOW_RECT = { x: 470, y: 104, w: 240, h: 220 };
  const CLOCK = { x: 1010, y: 214, r: 44 };

  // Çöp kutusu görselinin ölçüleri (trash-bin.png'den ölçüldü, oransal)
  const BIN_CROP_X = 18 / 315;    // görselin sağ/sol boşluğunu kırp
  const BIN_CROP_W = 266 / 315;
  const BIN_RIM = 0.064;          // ağız elipsinin merkez çizgisi (yükseklik oranı)
  const BIN_RIM_RX = 0.4586;      // ağız elipsinin yarı genişliği (genişlik oranı)
  const BIN_RIM_RY = 0.053;       // ağız elipsinin yarı yüksekliği (yükseklik oranı)
  const BIN_FLOOR = 0.86;         // iç taban
  const BIN_WALL = 0.03;          // yan duvarların kenardan içe kaçıklığı

  const ASSETS = {
    img: {
      ball: 'assets/img/paper-ball.png',
      bin: 'assets/img/trash-bin.png',
      fan: 'assets/img/fan.png',
    },
    sfx: ['crumple', 'throw', 'rim1', 'rim2', 'rim3', 'thud1', 'thud2', 'bin',
      'score', 'swish', 'levelup', 'miss', 'gameover', 'click'],
  };

  const LEVEL_MSG = {
    2: 'Rüzgâr çıktı! Vantilatörü izle.',
    3: 'Kutu uzaklaşıyor…',
    4: 'Rüzgâr sertleşiyor…',
    5: 'Çöp kutusu kıpırdamaya başladı!',
  };

  const CONFETTI = ['#e2574c', '#3a7bd5', '#e8a33d', '#3aa76d', '#9b59b6', '#f06292'];

  // ------------------------------------------------------------------
  // Yardımcılar
  // ------------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOutBack = t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
  const font = size => `${size}px "Patrick Hand", "Comic Sans MS", sans-serif`;

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* gizli sekme vb. */ }
    },
  };

  // ------------------------------------------------------------------
  // Ses
  // ------------------------------------------------------------------
  const audio = {
    ctx: null,
    buffers: {},
    elements: {},
    lastPlayed: {},
    muted: store.get('kagitTop.muted', false),

    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (_) { this.ctx = null; }
    },

    async load(name) {
      const url = `assets/sfx/${name}.ogg`;
      if (this.ctx) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          const data = await res.arrayBuffer();
          this.buffers[name] = await new Promise((ok, fail) => {
            // Eski Safari yalnızca geri çağırma biçimini destekler, yenileri Promise döndürür
            const p = this.ctx.decodeAudioData(data, ok, fail);
            if (p && typeof p.then === 'function') p.then(ok, fail);
          });
          return;
        } catch (_) {
          // file:// üzerinden açıldıysa fetch çalışmaz; <audio> öğesine geri düş
        }
      }
      await new Promise(resolve => {
        const el = new Audio();
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          el.oncanplaythrough = el.onerror = null;
          resolve();
        };
        el.preload = 'auto';
        el.oncanplaythrough = done;
        el.onerror = done;
        el.src = url;
        this.elements[name] = el;
        setTimeout(done, 3000);
      });
    },

    unlock() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },

    play(name, volume = 1, rate = 1) {
      if (this.muted) return;
      const now = performance.now();
      if (now - (this.lastPlayed[name] || 0) < 45) return;
      this.lastPlayed[name] = now;

      const buffer = this.buffers[name];
      if (buffer && this.ctx) {
        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        src.buffer = buffer;
        src.playbackRate.value = rate;
        gain.gain.value = volume;
        src.connect(gain).connect(this.ctx.destination);
        src.start();
        return;
      }
      const el = this.elements[name];
      if (el) {
        const copy = el.cloneNode();
        copy.volume = clamp(volume, 0, 1);
        copy.playbackRate = rate;
        copy.play().catch(() => {});
      }
    },
  };

  // ------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const screens = overlay.querySelectorAll('[data-screen]');
  const progressBar = document.getElementById('progress-bar');
  const loadError = document.getElementById('load-error');
  const btnMute = document.getElementById('btn-mute');
  const btnPause = document.getElementById('btn-pause');

  let renderScale = 1;
  let bg = null;                  // önceden çizilmiş statik arka plan
  const images = {};
  let binAspect = 0.68;

  // ------------------------------------------------------------------
  // Oyun durumu
  // ------------------------------------------------------------------
  const game = {
    state: 'loading',             // loading | menu | aim | fly | settle | over
    paused: false,
    time: 0,
    score: 0,
    best: store.get('kagitTop.best', 0),
    lives: LIVES,
    level: 1,
    baskets: 0,
    swishes: 0,
    streak: 0,
    bestStreak: 0,
    throws: 0,
    wind: 0,
    windShown: 0,
    settleT: 0,
    spawnT: 1,
    lastResult: null,
    newRecord: false,
    levelUpPending: false,
    lifeLostT: 1,
  };

  const ball = {
    x: REST.x, y: REST.y, vx: 0, vy: 0, angle: 0, spin: 0,
    active: false, contact: false, restT: 0, flightT: 0, squash: 0,
    touchedBin: false, touchedRim: false, scored: false,
  };

  const bin = {
    baseX: 780, from: 780, to: 780, slideT: 1,
    h: 165, hFrom: 165, hTo: 165,
    amp: 0, ampFrom: 0, ampTo: 0, speed: 0, phase: 0,
    tilt: 0, tiltV: 0,
    pile: 0,
    get x() { return this.baseX + this.amp * Math.sin(this.phase); },
  };

  const aim = { dragging: false, pointerId: null, sx: 0, sy: 0, cx: 0, cy: 0, key: false, angle: 45, power: 0.6 };

  const litter = [];              // ıskalanan toplar yerde kalır
  const particles = [];
  const texts = [];
  const trail = [];
  let banner = null;
  let shakeAmt = 0;
  let trailT = 0;

  const clouds = [
    { x: 30, y: 46, s: 1 },
    { x: 150, y: 118, s: 0.7 },
    { x: 230, y: 74, s: 0.85 },
  ];
  const streaks = Array.from({ length: 16 }, () => ({
    x: rand(0, W), y: rand(70, FLOOR_TOP - 40), len: rand(40, 110), phase: rand(0, Math.PI * 2),
  }));

  function levelParams(level) {
    return {
      windMax: level <= 1 ? 0 : Math.min(1.2 + (level - 2) * 0.9, 7.5),
      binMinX: 560,
      binMaxX: Math.min(820 + (level - 1) * 55, 1190),
      binH: Math.max(165 - (level - 1) * 6, 118),
      preview: Math.max(0.6 - (level - 1) * 0.06, 0.14),
      moveAmp: level >= 5 ? Math.min(40 + (level - 5) * 20, 130) : 0,
      moveSpeed: 0.7 + Math.max(0, level - 5) * 0.12,
    };
  }

  // ------------------------------------------------------------------
  // Çöp kutusu geometrisi ve çarpışma yüzeyleri
  // ------------------------------------------------------------------
  function binGeom() {
    const h = bin.h;
    const w = h * binAspect;
    const top = GROUND - h;
    const x = bin.x;
    return {
      x, w, h, top,
      left: x - w / 2 + w * BIN_WALL,
      right: x + w / 2 - w * BIN_WALL,
      rimY: top + h * BIN_RIM,
      floorY: top + h * BIN_FLOOR - Math.min(bin.pile, 6) * 5,
      bottom: GROUND,
    };
  }

  function surfaces(g) {
    return [
      { x1: -500, y1: GROUND, x2: W + 500, y2: GROUND, kind: 'floor', e: 0.32, f: 0.018 },
      { x1: 0, y1: -4000, x2: 0, y2: GROUND, kind: 'wall', e: 0.45, f: 0.01 },
      { x1: W, y1: -4000, x2: W, y2: GROUND, kind: 'wall', e: 0.45, f: 0.01 },
      { x1: -10, y1: DESK.y, x2: DESK.x2, y2: DESK.y, kind: 'desk', e: 0.3, f: 0.02 },
      { x1: DESK.x2, y1: DESK.y, x2: DESK.x2, y2: DESK.y + DESK.thick, kind: 'desk', e: 0.3, f: 0.02 },
      { x1: g.left, y1: g.rimY, x2: g.left, y2: g.bottom, kind: 'binWall', e: 0.42, f: 0.01, thick: 2 },
      { x1: g.right, y1: g.rimY, x2: g.right, y2: g.bottom, kind: 'binWall', e: 0.42, f: 0.01, thick: 2 },
      { x1: g.left, y1: g.floorY, x2: g.right, y2: g.floorY, kind: 'binFloor', e: 0.15, f: 0.05 },
    ];
  }

  // Top (daire) ile doğru parçası çarpışması. Temas varsa topu dışarı iter,
  // hızı yansıtır ve çarpma bilgisini döndürür.
  function collide(b, s) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? clamp(((b.x - s.x1) * dx + (b.y - s.y1) * dy) / len2, 0, 1) : 0;
    const px = s.x1 + dx * t;
    const py = s.y1 + dy * t;
    let nx = b.x - px;
    let ny = b.y - py;
    const dist = Math.hypot(nx, ny);
    const minDist = BALL_R + (s.thick || 0);
    if (dist >= minDist || dist === 0) return null;

    nx /= dist;
    ny /= dist;
    b.x = px + nx * minDist;
    b.y = py + ny * minDist;

    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const vtx = b.vx - vn * nx;
      const vty = b.vy - vn * ny;
      b.vx = vtx * (1 - s.f) - vn * nx * s.e;
      b.vy = vty * (1 - s.f) - vn * ny * s.e;
      b.spin = (b.vx * -ny + b.vy * nx) / BALL_R;
    }
    return { impact: Math.max(0, -vn), nx, ny };
  }

  function physicsStep(dt) {
    const g = binGeom();

    ball.vy += GRAVITY * dt;
    if (!ball.contact) ball.vx += game.wind * WIND_ACC * dt; // rüzgâr sadece havadayken iter
    const drag = 1 - AIR_DRAG * dt;
    ball.vx *= drag;
    ball.vy *= drag;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.angle += ball.spin * dt;
    ball.flightT += dt;

    let contact = false;
    for (const s of surfaces(g)) {
      const hit = collide(ball, s);
      if (!hit) continue;
      contact = true;
      onContact(s, hit, g);
    }
    ball.contact = contact;
  }

  function onContact(s, hit, g) {
    const imp = hit.impact;
    switch (s.kind) {
      case 'binWall': {
        const rim = ball.y < g.rimY + 6;
        ball.touchedBin = true;
        if (rim) ball.touchedRim = true;
        if (imp > 90) {
          const vol = clamp(imp / 900, 0.15, 0.9) * (rim ? 1 : 0.6);
          audio.play(`rim${1 + Math.floor(Math.random() * 3)}`, vol, rand(0.94, 1.08));
          bin.tiltV += -hit.nx * clamp(imp, 0, 900) * 0.0007;
          shake(imp / 280);
        }
        break;
      }
      case 'binFloor':
        if (game.state === 'fly' && !ball.scored) scoreBasket();
        if (imp > 60) audio.play('bin', clamp(imp / 600, 0.2, 0.9));
        break;
      case 'floor':
        if (imp > 70) {
          audio.play(Math.random() < 0.5 ? 'thud1' : 'thud2', clamp(imp / 900, 0.15, 0.8));
          ball.squash = clamp(imp / 1400, 0, 0.3);
          if (imp > 350) dust(ball.x, GROUND);
        }
        if (game.state === 'fly' && !ball.scored) missBasket();
        break;
      default: // duvar, masa
        if (imp > 80) audio.play(Math.random() < 0.5 ? 'thud1' : 'thud2', clamp(imp / 900, 0.15, 0.7));
        break;
    }
  }

  // ------------------------------------------------------------------
  // Oyun akışı
  // ------------------------------------------------------------------
  function resetBall(silent = false) {
    Object.assign(ball, {
      x: REST.x, y: REST.y, vx: 0, vy: 0, angle: rand(0, Math.PI * 2), spin: 0,
      active: false, contact: false, restT: 0, flightT: 0, squash: 0,
      touchedBin: false, touchedRim: false, scored: false,
    });
    trail.length = 0;
    game.spawnT = 0;
    if (!silent) audio.play('crumple', 0.55, rand(0.95, 1.1));
  }

  function newWind(p) {
    game.wind = p.windMax ? Math.round(rand(-p.windMax, p.windMax) * 10) / 10 : 0;
  }

  function moveBin(p) {
    const amp = p.moveAmp;
    const minX = Math.max(p.binMinX, 480 + amp);
    const maxX = Math.max(minX, Math.min(p.binMaxX, W - 110 - amp)); // topun sığacağı boşluk kalsın
    let x = rand(minX, maxX);
    for (let i = 0; i < 10 && Math.abs(x - bin.baseX) < 90; i++) x = rand(minX, maxX);
    bin.from = bin.baseX;
    bin.to = x;
    bin.hFrom = bin.h;
    bin.hTo = p.binH;
    bin.ampFrom = bin.amp;
    bin.ampTo = amp;
    bin.slideT = 0;
    bin.speed = p.moveSpeed;
  }

  function startGame() {
    Object.assign(game, {
      score: 0, lives: LIVES, level: 1, baskets: 0, swishes: 0, streak: 0, bestStreak: 0,
      throws: 0, wind: 0, lastResult: null, newRecord: false, levelUpPending: false,
      paused: false, lifeLostT: 1,
    });
    const p = levelParams(1);
    Object.assign(bin, {
      baseX: 780, from: 780, to: 780, slideT: 1, h: p.binH, hFrom: p.binH, hTo: p.binH,
      amp: 0, ampFrom: 0, ampTo: 0, speed: 0, phase: 0, tilt: 0, tiltV: 0, pile: 0,
    });
    litter.length = 0;
    particles.length = 0;
    texts.length = 0;
    banner = null;
    aim.dragging = false;
    aim.key = false;
    resetBall();
    game.state = 'aim';
    showScreen(null);
  }

  function throwBall(v) {
    ball.active = true;
    ball.vx = v.vx;
    ball.vy = v.vy;
    ball.spin = v.vx / (BALL_R * 3) + rand(-2, 2);
    game.state = 'fly';
    game.throws++;
    audio.play('throw', 0.45 + v.power * 0.5, rand(0.95, 1.1));
  }

  function scoreBasket() {
    ball.scored = true;
    const swish = !ball.touchedBin;
    game.baskets++;
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    if (swish) game.swishes++;

    const mult = game.streak >= 6 ? 3 : game.streak >= 3 ? 2 : 1;
    const points = (swish ? 2 : 1) * mult;
    game.score += points;

    const g = binGeom();
    const label = swish ? 'Tertemiz!' : ball.touchedRim ? 'Kıl payı!' : 'Basket!';
    popText(`+${points}`, g.x, g.top - 34, '#2e9c5a', 64);
    popText(mult > 1 ? `${label}  ×${mult}` : label, g.x, g.top - 88, '#33363d', 40, 0.08);
    confetti(g.x, g.top + 12, swish ? 55 : 32);
    audio.play('score', 0.8);
    if (swish) setTimeout(() => audio.play('swish', 0.7), 140);

    if (game.score > game.best) {
      game.best = game.score;
      game.newRecord = true;
      store.set('kagitTop.best', game.best);
    }
    const level = Math.min(1 + Math.floor(game.baskets / 3), 12);
    if (level > game.level) {
      game.level = level;
      game.levelUpPending = true;
    }
    resolveThrow(true);
  }

  function missBasket() {
    game.streak = 0;
    game.lives--;
    game.lifeLostT = 0;
    popText(ball.touchedRim ? 'Az kaldı!' : 'Iska!', clamp(ball.x, 90, W - 90), clamp(ball.y - 60, 140, GROUND - 80), '#e2574c', 48);
    audio.play('miss', 0.55);
    resolveThrow(false);
  }

  function resolveThrow(scored) {
    game.state = 'settle';
    game.settleT = 0;
    game.lastResult = scored;
  }

  function nextThrow() {
    if (game.lastResult) {
      bin.pile++;
    } else if (ball.active && ball.y > GROUND - BALL_R - 6) {
      litter.push({ x: ball.x, y: ball.y, angle: ball.angle });
      if (litter.length > 14) litter.shift();
    }

    const p = levelParams(game.level);
    if (game.lastResult) {        // ıskadan sonra kurulum aynı kalır, düzeltme şansı olsun
      newWind(p);
      moveBin(p);
    }
    if (game.levelUpPending) {
      game.levelUpPending = false;
      banner = { title: `Seviye ${game.level}!`, sub: LEVEL_MSG[game.level] || 'Daha uzak, daha rüzgârlı…', t: 0 };
      audio.play('levelup', 0.7);
    }
    resetBall();
    game.state = 'aim';
  }

  function gameOver() {
    game.state = 'over';
    audio.play('gameover', 0.7);
    overlay.querySelector('[data-final]').textContent = game.score;
    overlay.querySelector('[data-record]').hidden = !game.newRecord;
    const stat = name => overlay.querySelector(`[data-stat="${name}"]`);
    stat('baskets').textContent = game.baskets;
    stat('swishes').textContent = game.swishes;
    stat('streak').textContent = game.bestStreak;
    stat('level').textContent = game.level;
    showScreen('over');
  }

  function setPaused(paused) {
    if (!['aim', 'fly', 'settle'].includes(game.state)) return;
    game.paused = paused;
    aim.dragging = false;
    canvas.classList.remove('dragging');
    showScreen(paused ? 'pause' : null);
  }

  function toggleMute() {
    audio.muted = !audio.muted;
    store.set('kagitTop.muted', audio.muted);
    updateMuteButton();
  }

  function updateMuteButton() {
    btnMute.classList.toggle('muted', audio.muted);
    btnMute.setAttribute('aria-label', audio.muted ? 'Sesi aç' : 'Sesi kapat');
  }

  // ------------------------------------------------------------------
  // Efektler
  // ------------------------------------------------------------------
  function shake(amount) {
    shakeAmt = Math.min(shakeAmt + amount, 9);
  }

  function popText(text, x, y, color, size, delay = 0) {
    texts.push({ text, x, y, color, size, t: -delay, life: 1.4 });
  }

  function confetti(x, y, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        kind: 'confetti', x: x + rand(-20, 20), y,
        vx: rand(-280, 280), vy: rand(-680, -260),
        rot: rand(0, Math.PI), vr: rand(-12, 12),
        size: rand(6, 10), color: CONFETTI[i % CONFETTI.length],
        life: rand(0.9, 1.6),
      });
    }
  }

  function dust(x, y) {
    for (let i = 0; i < 6; i++) {
      particles.push({
        kind: 'dust', x: x + rand(-14, 14), y: y - 4,
        vx: rand(-90, 90), vy: rand(-80, -20), size: rand(3, 6), life: rand(0.35, 0.6),
      });
    }
  }

  // ------------------------------------------------------------------
  // Nişan alma
  // ------------------------------------------------------------------
  function pointerAim() {
    const dx = aim.sx - aim.cx;
    const dy = aim.sy - aim.cy;
    const len = Math.hypot(dx, dy);
    if (len < 1) return { vx: 0, vy: 0, power: 0 };
    const power = Math.min(len, MAX_PULL) / MAX_PULL;
    const speed = power * MAX_SPEED;
    return { vx: (dx / len) * speed, vy: (dy / len) * speed, power };
  }

  function keyAim() {
    const a = (aim.angle * Math.PI) / 180;
    const speed = aim.power * MAX_SPEED;
    return { vx: Math.cos(a) * speed, vy: -Math.sin(a) * speed, power: aim.power };
  }

  function currentAim() {
    if (game.state !== 'aim') return null;
    if (aim.dragging) return pointerAim();
    if (aim.key) return keyAim();
    return null;
  }

  function canAim() {
    return game.state === 'aim' && !game.paused && game.spawnT > 0.25;
  }

  function toLogical(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * W) / rect.width,
      y: ((e.clientY - rect.top) * H) / rect.height,
    };
  }

  canvas.addEventListener('pointerdown', e => {
    audio.unlock();
    if (!canAim() || aim.dragging) return;
    const p = toLogical(e);
    Object.assign(aim, { dragging: true, pointerId: e.pointerId, sx: p.x, sy: p.y, cx: p.x, cy: p.y, key: false });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* eski tarayıcılar */ }
    canvas.classList.add('dragging');
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', e => {
    if (!aim.dragging || e.pointerId !== aim.pointerId) return;
    const p = toLogical(e);
    aim.cx = p.x;
    aim.cy = p.y;
  });

  const endDrag = (e, cancelled) => {
    if (!aim.dragging || e.pointerId !== aim.pointerId) return;
    aim.dragging = false;
    canvas.classList.remove('dragging');
    const v = pointerAim();
    if (cancelled || game.state !== 'aim') return;
    if (v.power > 0.08) throwBall(v);
    else if (game.throws > 0) popText('Geri çek ve bırak!', REST.x + 60, REST.y - 90, '#3a7bd5', 30); // ilk atışta öğretici zaten gösteriyor
  };
  canvas.addEventListener('pointerup', e => endDrag(e, false));
  canvas.addEventListener('pointercancel', e => endDrag(e, true));

  window.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'm' || k === 'M') {
      toggleMute();
      return;
    }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (['aim', 'fly', 'settle'].includes(game.state)) setPaused(!game.paused);
      return;
    }
    if (game.paused || game.state === 'menu' || game.state === 'over' || game.state === 'loading') return;

    const arrows = { ArrowUp: [2, 0], ArrowDown: [-2, 0], ArrowRight: [0, 0.03], ArrowLeft: [0, -0.03] };
    if (arrows[k]) {
      e.preventDefault();
      audio.unlock();
      aim.angle = clamp(aim.angle + arrows[k][0], 5, 85);
      aim.power = clamp(aim.power + arrows[k][1], 0.1, 1);
      aim.key = true;
    } else if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      audio.unlock();
      if (canAim() && !aim.dragging) throwBall(keyAim());
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !game.paused) setPaused(true);
  });

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    audio.unlock();
    audio.play('click', 0.6);
    const action = btn.dataset.action;
    if (action === 'play') startGame();
    else if (action === 'resume') setPaused(false);
    else if (action === 'menu') {
      game.paused = false;
      game.state = 'menu';
      resetBall(true);
      showScreen('menu');
    }
  });

  btnMute.addEventListener('click', () => {
    audio.unlock();
    toggleMute();
    btnMute.blur();
  });
  btnPause.addEventListener('click', () => {
    audio.unlock();
    setPaused(!game.paused);
    btnPause.blur();
  });

  function showScreen(name) {
    overlay.hidden = !name;
    screens.forEach(s => { s.hidden = s.dataset.screen !== name; });
    overlay.querySelectorAll('[data-best]').forEach(el => { el.textContent = game.best; });
    btnPause.hidden = !['aim', 'fly', 'settle'].includes(game.state) || game.paused;
    if (name) {
      const primary = overlay.querySelector(`[data-screen="${name}"] .btn`);
      if (primary) primary.focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------------
  // Güncelleme
  // ------------------------------------------------------------------
  function update(dt) {
    game.time += dt;
    game.spawnT = Math.min(game.spawnT + dt, 1);
    game.lifeLostT = Math.min(game.lifeLostT + dt, 1);
    game.windShown = lerp(game.windShown, game.wind, 1 - Math.exp(-dt * 4));

    // Çöp kutusu: yeni konuma kayma + (üst seviyelerde) salınım
    if (bin.slideT < 1) {
      bin.slideT = Math.min(bin.slideT + dt / 0.6, 1);
      const t = easeInOut(bin.slideT);
      bin.baseX = lerp(bin.from, bin.to, t);
      bin.h = lerp(bin.hFrom, bin.hTo, t);
      bin.amp = lerp(bin.ampFrom, bin.ampTo, t);
    }
    if (bin.amp) bin.phase += bin.speed * dt;
    bin.tiltV += (-70 * bin.tilt - 7 * bin.tiltV) * dt;
    bin.tilt = clamp(bin.tilt + bin.tiltV * dt, -0.12, 0.12);

    // Top fiziği
    if (ball.active) {
      const steps = Math.round(dt / STEP) || 1;
      for (let i = 0; i < steps; i++) physicsStep(dt / steps);
      ball.squash *= Math.exp(-dt * 14);

      trailT += dt;
      if (game.state === 'fly' && trailT > 1 / 45) {
        trailT = 0;
        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > 14) trail.shift();
      }
    }

    if (game.state === 'fly') {
      const speed = Math.hypot(ball.vx, ball.vy);
      ball.restT = ball.contact && speed < 30 ? ball.restT + dt : 0;
      if (ball.restT > 0.4 || ball.flightT > 8) missBasket();
    } else if (game.state === 'settle') {
      game.settleT += dt;
      if (trail.length) trail.shift();
      if (game.settleT > SETTLE_TIME) {
        if (game.lives <= 0) gameOver();
        else nextThrow();
      }
    }

    // Ortam: bulutlar ve rüzgâr çizgileri
    for (const c of clouds) {
      c.x += (8 + game.windShown * 14) * c.s * dt;
      if (c.x > WINDOW_RECT.w + 70) c.x = -70;
      if (c.x < -70) c.x = WINDOW_RECT.w + 70;
    }
    const sv = game.windShown * 70;
    for (const s of streaks) {
      s.x += (sv + Math.sign(sv) * 30) * dt;
      if (s.x > W + 150) { s.x = -150; s.y = rand(70, FLOOR_TOP - 40); }
      if (s.x < -150) { s.x = W + 150; s.y = rand(70, FLOOR_TOP - 40); }
    }

    // Parçacıklar ve yazılar
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (p.kind === 'confetti') {
        p.vy += 900 * dt;
        p.vx *= 1 - 1.5 * dt;
        p.rot += p.vr * dt;
      } else {
        p.vy += 60 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      texts[i].t += dt;
      if (texts[i].t > texts[i].life) texts.splice(i, 1);
    }
    if (banner) {
      banner.t += dt;
      if (banner.t > 2.4) banner = null;
    }
    shakeAmt *= Math.exp(-dt * 10);
  }

  // ------------------------------------------------------------------
  // Çizim — statik arka plan
  // ------------------------------------------------------------------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function buildBackground() {
    bg = document.createElement('canvas');
    bg.width = canvas.width;
    bg.height = canvas.height;
    const c = bg.getContext('2d');
    c.setTransform(renderScale, 0, 0, renderScale, 0, 0);

    // Duvar
    const wall = c.createLinearGradient(0, 0, 0, FLOOR_TOP);
    wall.addColorStop(0, '#e2d4bf');
    wall.addColorStop(1, '#efe6d6');
    c.fillStyle = wall;
    c.fillRect(0, 0, W, FLOOR_TOP);
    c.fillStyle = 'rgba(150, 120, 80, 0.06)';
    for (let x = 0; x < W; x += 48) c.fillRect(x, 0, 18, FLOOR_TOP);
    const ceil = c.createLinearGradient(0, 0, 0, 100);
    ceil.addColorStop(0, 'rgba(0, 0, 0, 0.14)');
    ceil.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = ceil;
    c.fillRect(0, 0, W, 100);

    // Pencere: çerçeve çizilir, camın olduğu yerler delinir (arkada canlı gökyüzü var)
    const wr = WINDOW_RECT;
    c.fillStyle = 'rgba(0, 0, 0, 0.12)';
    c.fillRect(wr.x - 10, wr.y - 6, wr.w + 28, wr.h + 26);
    c.fillStyle = '#fbfaf6';
    c.fillRect(wr.x - 14, wr.y - 14, wr.w + 28, wr.h + 28);
    c.fillStyle = '#e8e3d8';
    c.fillRect(wr.x - 24, wr.y + wr.h + 10, wr.w + 48, 12);   // pervaz
    c.save();
    c.globalCompositeOperation = 'destination-out';
    const pane = 6;
    const pw = (wr.w - pane) / 2;
    const ph = (wr.h - pane) / 2;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) c.fillRect(wr.x + i * (pw + pane), wr.y + j * (ph + pane), pw, ph);
    }
    c.restore();
    c.save();                                                     // cam yansıması
    c.beginPath();
    c.rect(wr.x, wr.y, wr.w, wr.h);
    c.clip();
    c.fillStyle = 'rgba(255, 255, 255, 0.16)';
    c.beginPath();
    c.moveTo(wr.x + 30, wr.y + wr.h);
    c.lineTo(wr.x + 110, wr.y);
    c.lineTo(wr.x + 150, wr.y);
    c.lineTo(wr.x + 70, wr.y + wr.h);
    c.fill();
    c.restore();

    // Saat kadranı (akrep/yelkovan canlı çizilir)
    c.fillStyle = 'rgba(0, 0, 0, 0.14)';
    c.beginPath();
    c.arc(CLOCK.x + 4, CLOCK.y + 6, CLOCK.r + 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#4a4f5a';
    c.beginPath();
    c.arc(CLOCK.x, CLOCK.y, CLOCK.r + 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fffdf6';
    c.beginPath();
    c.arc(CLOCK.x, CLOCK.y, CLOCK.r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#4a4f5a';
    c.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const inner = i % 3 === 0 ? CLOCK.r - 12 : CLOCK.r - 7;
      c.lineWidth = i % 3 === 0 ? 3 : 1.5;
      c.beginPath();
      c.moveTo(CLOCK.x + Math.cos(a) * inner, CLOCK.y + Math.sin(a) * inner);
      c.lineTo(CLOCK.x + Math.cos(a) * (CLOCK.r - 3), CLOCK.y + Math.sin(a) * (CLOCK.r - 3));
      c.stroke();
    }

    // Süpürgelik
    c.fillStyle = '#f7f2e8';
    c.fillRect(0, FLOOR_TOP - 22, W, 22);
    c.fillStyle = 'rgba(0, 0, 0, 0.1)';
    c.fillRect(0, FLOOR_TOP - 22, W, 2);
    c.fillRect(0, FLOOR_TOP - 2, W, 2);

    // Parke zemin
    const floor = c.createLinearGradient(0, FLOOR_TOP, 0, H);
    floor.addColorStop(0, '#9c6a42');
    floor.addColorStop(1, '#c2895a');
    c.fillStyle = floor;
    c.fillRect(0, FLOOR_TOP, W, H - FLOOR_TOP);
    const rows = [FLOOR_TOP, FLOOR_TOP + 9, FLOOR_TOP + 21, FLOOR_TOP + 37, FLOOR_TOP + 58, FLOOR_TOP + 86, H];
    c.strokeStyle = 'rgba(60, 35, 15, 0.28)';
    c.lineWidth = 1;
    for (let r = 1; r < rows.length; r++) {
      const y0 = rows[r - 1];
      const y1 = rows[r];
      c.beginPath();
      c.moveTo(0, y1 + 0.5);
      c.lineTo(W, y1 + 0.5);
      const plank = 140 + r * 40;
      for (let x = ((r * 97) % plank); x < W; x += plank) {
        c.moveTo(x + 0.5, y0);
        c.lineTo(x + 0.5, y1);
      }
      c.stroke();
    }

    // Masa gölgesi
    c.fillStyle = 'rgba(0, 0, 0, 0.18)';
    c.beginPath();
    c.ellipse(DESK.x2 / 2, GROUND - 2, DESK.x2 / 2 + 30, 12, 0, 0, Math.PI * 2);
    c.fill();

    // Masa: çekmece dolabı + ayak + tabla
    c.fillStyle = '#8d5d3b';
    c.fillRect(12, DESK.y + DESK.thick, 140, GROUND - DESK.y - DESK.thick - 4);
    c.fillStyle = '#9d6b46';
    for (let i = 0; i < 3; i++) {
      const y = DESK.y + DESK.thick + 8 + i * 54;
      c.fillRect(20, y, 124, 46);
      c.fillStyle = '#d9c3a0';
      c.fillRect(66, y + 20, 32, 6);
      c.fillStyle = '#9d6b46';
    }
    c.fillStyle = '#7b4f31';
    c.fillRect(DESK.x2 - 34, DESK.y + DESK.thick, 18, GROUND - DESK.y - DESK.thick - 2);
    const top = c.createLinearGradient(0, DESK.y, 0, DESK.y + DESK.thick);
    top.addColorStop(0, '#b27c52');
    top.addColorStop(1, '#7d5133');
    c.fillStyle = top;
    c.fillRect(0, DESK.y, DESK.x2, DESK.thick);
    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    c.fillRect(0, DESK.y, DESK.x2, 2);

    // Masadaki eşyalar: kağıt destesi ve kalemlik
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? '#f4f1ea' : '#ffffff';
      c.fillRect(24 + (i % 3) * 2, DESK.y - 3 - i * 3, 92, 3);
    }
    c.fillStyle = 'rgba(0, 0, 0, 0.08)';
    c.fillRect(24, DESK.y - 21, 96, 1);
    const pencils = [['#e8a33d', -0.12], ['#3a7bd5', 0.05], ['#e2574c', 0.18]];
    for (const [color, a] of pencils) {
      c.save();
      c.translate(164, DESK.y - 30);
      c.rotate(a);
      c.fillStyle = color;
      c.fillRect(-2.5, -34, 5, 34);
      c.fillStyle = '#f2d6a2';
      c.beginPath();
      c.moveTo(-2.5, -34);
      c.lineTo(2.5, -34);
      c.lineTo(0, -42);
      c.fill();
      c.restore();
    }
    c.fillStyle = '#5b6b7c';
    roundRect(c, 148, DESK.y - 38, 32, 38, 4);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.18)';
    c.fillRect(153, DESK.y - 34, 5, 30);
  }

  // ------------------------------------------------------------------
  // Çizim — sahne
  // ------------------------------------------------------------------
  function drawSky() {
    const wr = WINDOW_RECT;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wr.x, wr.y, wr.w, wr.h);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, wr.y, 0, wr.y + wr.h);
    sky.addColorStop(0, '#78b3ef');
    sky.addColorStop(1, '#d3e9fc');
    ctx.fillStyle = sky;
    ctx.fillRect(wr.x, wr.y, wr.w, wr.h);

    ctx.fillStyle = 'rgba(255, 244, 190, 0.9)';
    ctx.beginPath();
    ctx.arc(wr.x + wr.w - 50, wr.y + 46, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    for (const c of clouds) {
      const x = wr.x + c.x;
      const y = wr.y + c.y;
      const s = 18 * c.s;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.arc(x + s * 1.1, y - s * 0.5, s * 1.2, 0, Math.PI * 2);
      ctx.arc(x + s * 2.3, y, s * 0.95, 0, Math.PI * 2);
      ctx.rect(x, y - s * 0.2, s * 2.3, s * 1.1);
      ctx.fill();
    }

    // Uzaktaki binalar
    ctx.fillStyle = '#a9bdd1';
    const bx = [0, 34, 60, 104, 128, 170, 196];
    const bh = [58, 90, 44, 76, 110, 52, 84];
    bx.forEach((x, i) => ctx.fillRect(wr.x + x, wr.y + wr.h - bh[i], 30, bh[i]));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    bx.forEach((x, i) => {
      for (let y = wr.y + wr.h - bh[i] + 8; y < wr.y + wr.h - 8; y += 14) {
        ctx.fillRect(wr.x + x + 6, y, 6, 6);
        ctx.fillRect(wr.x + x + 18, y, 6, 6);
      }
    });
    ctx.restore();
  }

  function drawClockHands() {
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    const hand = (value, len, width, color) => {
      const a = value * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(CLOCK.x - Math.cos(a) * 6, CLOCK.y - Math.sin(a) * 6);
      ctx.lineTo(CLOCK.x + Math.cos(a) * len, CLOCK.y + Math.sin(a) * len);
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    hand(h / 12, 22, 5, '#33363d');
    hand(m / 60, 32, 3.5, '#33363d');
    hand(s / 60, 34, 1.5, '#e2574c');
    ctx.fillStyle = '#33363d';
    ctx.beginPath();
    ctx.arc(CLOCK.x, CLOCK.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStreaks() {
    const alpha = clamp(Math.abs(game.windShown) / 7, 0, 1) * 0.35;
    if (alpha < 0.02) return;
    const dir = Math.sign(game.windShown);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of streaks) {
      const wob = Math.sin(game.time * 3 + s.phase) * 6;
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(s.x - (dir * s.len) / 2, s.y + wob, s.x - dir * s.len, s.y);
    }
    ctx.stroke();
  }

  function drawBall(x, y, angle, scale = 1, squash = 0, alpha = 1) {
    const img = images.ball;
    const h = BALL_R * 2.3 * scale;
    const w = (h * img.naturalWidth) / img.naturalHeight;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y + BALL_R * squash);
    ctx.scale(1 + squash, 1 - squash);
    ctx.rotate(angle);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawShadow(x, surfaceY, height, size = 1) {
    const s = clamp(1 - height / 520, 0.2, 1) * size;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * s})`;
    ctx.beginPath();
    ctx.ellipse(x, surfaceY - 1, BALL_R * 1.1 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const PILE = [[-0.22, 0, 0.4], [0.2, -2, 2.1], [0.0, -14, 4.2], [-0.25, -22, 1.3], [0.22, -24, 5.5], [0.02, -32, 3.0]];

  function isBallInside(g) {
    return ball.active && (ball.scored || (ball.x > g.left && ball.x < g.right && ball.y > g.rimY - 2));
  }

  function drawBinAndBall(g) {
    const img = images.bin;
    const sx = img.naturalWidth * BIN_CROP_X;
    const sw = img.naturalWidth * BIN_CROP_W;
    const sh = img.naturalHeight;
    const x = g.x - g.w / 2;
    const inside = isBallInside(g);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(g.x, GROUND - 1, g.w * 0.62, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(g.x, GROUND);
    ctx.rotate(bin.tilt);
    ctx.translate(-g.x, -GROUND);
    ctx.drawImage(img, sx, 0, sw, sh, x, g.top, g.w, g.h);

    // İçerik: daha önce atılan toplar + içerideki top
    const floorY = g.top + g.h * BIN_FLOOR;
    for (let i = 0; i < Math.min(bin.pile, PILE.length); i++) {
      const [fx, dy, a] = PILE[i];
      drawBall(g.x + fx * g.w, floorY - BALL_R * 0.85 + dy, a, 0.9);
    }
    if (inside) drawBall(ball.x, ball.y, ball.angle, 1, ball.squash);

    // Ön katman: ağız elipsinin alt yarısından aşağısını yeniden çiz → top içeride görünür
    if (inside || bin.pile) {
      const cy = g.top + g.h * BIN_RIM;
      const rx = g.w * BIN_RIM_RX;
      const ry = g.h * BIN_RIM_RY;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - 4, cy);
      ctx.lineTo(g.x - rx, cy);
      ctx.ellipse(g.x, cy, rx, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x + g.w + 4, cy);
      ctx.lineTo(x + g.w + 4, g.top + g.h + 4);
      ctx.lineTo(x - 4, g.top + g.h + 4);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, sx, 0, sw, sh, x, g.top, g.w, g.h);
      ctx.restore();
    }
    ctx.restore();

    if (!inside) drawActiveBall();
  }

  function drawActiveBall() {
    // Gölge
    const onDesk = ball.x < DESK.x2 + 4 && ball.y < DESK.y;
    const surface = onDesk ? DESK.y : GROUND;
    drawShadow(ball.x, surface, surface - (ball.y + BALL_R));

    // Uçuş izi
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      ctx.fillStyle = `rgba(90, 90, 100, ${(i / trail.length) * 0.22})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 + (i / trail.length) * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    let scale = 1;
    if (!ball.active && game.spawnT < 1) scale = easeOutBack(clamp(game.spawnT / 0.4, 0, 1));
    const spin = !ball.active && game.spawnT < 0.4 ? (1 - game.spawnT / 0.4) * 3 : 0;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 6 * renderScale;
    ctx.shadowOffsetY = 2 * renderScale;
    drawBall(ball.x, ball.y, ball.angle + spin, scale, ball.squash);
    ctx.restore();

    // Ekranın üstüne çıktıysa ok göster
    if (ball.active && ball.y < -BALL_R) {
      const x = clamp(ball.x, 20, W - 20);
      ctx.fillStyle = '#3a7bd5';
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x - 10, 24);
      ctx.lineTo(x + 10, 24);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawAim() {
    const v = currentAim();
    if (!v) {
      if (game.state === 'aim' && game.throws === 0 && game.spawnT >= 1 && !game.paused) drawTutorial();
      return;
    }

    // Çekme çizgisi
    if (aim.dragging) {
      let dx = aim.cx - aim.sx;
      let dy = aim.cy - aim.sy;
      const len = Math.hypot(dx, dy);
      const maxLen = MAX_PULL * 0.6;
      if (len > maxLen) {
        dx = (dx / len) * maxLen;
        dy = (dy / len) * maxLen;
      }
      ctx.strokeStyle = 'rgba(51, 54, 61, 0.45)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(REST.x, REST.y);
      ctx.lineTo(REST.x + dx, REST.y + dy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(51, 54, 61, 0.35)';
      ctx.beginPath();
      ctx.arc(REST.x + dx, REST.y + dy, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Güç halkası
    const hue = 120 - v.power * 120;
    ctx.strokeStyle = `hsl(${hue}, 70%, 45%)`;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(REST.x, REST.y, BALL_R + 11, -Math.PI / 2, -Math.PI / 2 + v.power * Math.PI * 2);
    ctx.stroke();

    // Yörünge önizlemesi (rüzgâr hesaba katılmaz!)
    const preview = levelParams(game.level).preview;
    const dt = 1 / 60;
    const n = Math.round(preview / dt);
    let x = REST.x;
    let y = REST.y;
    let vx = v.vx;
    let vy = v.vy;
    for (let i = 1; i <= n; i++) {
      vy += GRAVITY * dt;
      vx *= 1 - AIR_DRAG * dt;
      vy *= 1 - AIR_DRAG * dt;
      x += vx * dt;
      y += vy * dt;
      if (y > GROUND - BALL_R) break;
      if (i % 2) continue;
      const k = 1 - i / n;
      ctx.fillStyle = `rgba(58, 123, 213, ${0.25 + k * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.5 + k * 3, 0, Math.PI * 2);
      ctx.fill();
    }

  }

  function drawTutorial() {
    const t = (game.time % 2.2) / 2.2;
    const k = easeInOut(clamp(t / 0.6, 0, 1));
    const fade = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
    const hx = REST.x + 8 - 110 * k;
    const hy = REST.y + 4 + 62 * k;
    ctx.save();
    ctx.globalAlpha = 0.75 * fade;
    ctx.strokeStyle = '#3a7bd5';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(REST.x, REST.y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(58, 123, 213, 0.35)';
    ctx.strokeStyle = '#3a7bd5';
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.font = font(30);
    ctx.textAlign = 'left';
    outlinedText('Geri çek ve bırak!', REST.x + 40, REST.y - 70, '#3a7bd5', 6);
  }

  function drawLitter() {
    for (const l of litter) drawBall(l.x, l.y, l.angle, 1, 0, 0.85);
  }

  function drawParticles() {
    for (const p of particles) {
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.globalAlpha = clamp(p.life * 2, 0, 1);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.fillStyle = `rgba(240, 232, 220, ${clamp(p.life * 1.6, 0, 0.8)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function outlinedText(text, x, y, color, outline = 6) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = outline;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    for (const t of texts) {
      if (t.t < 0) continue;
      const k = t.t / t.life;
      const pop = easeOutBack(clamp(t.t / 0.25, 0, 1));
      const alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.translate(t.x, t.y - easeOutCubic(k) * 40);
      ctx.scale(pop, pop);
      ctx.font = font(t.size);
      outlinedText(t.text, 0, 0, t.color, Math.max(5, t.size / 7));
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------
  // Çizim — arayüz
  // ------------------------------------------------------------------
  function drawHUD() {
    // Skor notu
    ctx.save();
    ctx.translate(24, 18);
    ctx.rotate(-0.025);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 8 * renderScale;
    ctx.shadowOffsetY = 3 * renderScale;
    ctx.fillStyle = '#ffe98a';
    ctx.fillRect(0, 0, 214, 104);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, 214, 14);
    ctx.font = font(20);
    ctx.fillStyle = '#8a7a3a';
    ctx.textAlign = 'left';
    ctx.fillText('SKOR', 16, 34);
    ctx.textAlign = 'right';
    ctx.fillText('EN İYİ', 198, 34);
    ctx.fillStyle = '#33363d';
    ctx.font = font(56);
    ctx.textAlign = 'left';
    ctx.fillText(String(game.score), 14, 88);
    ctx.font = font(34);
    ctx.textAlign = 'right';
    ctx.fillText(String(game.best), 198, 88);
    ctx.restore();

    // Kalan haklar (kağıt top ikonları)
    for (let i = 0; i < LIVES; i++) {
      const alive = i < game.lives;
      const justLost = i === game.lives && game.lifeLostT < 1;
      let x = 50 + i * 44;
      let scale = 0.85;
      if (justLost) {
        x += Math.sin(game.lifeLostT * 40) * 6 * (1 - game.lifeLostT);
        scale = 0.85 + 0.3 * (1 - game.lifeLostT);
      }
      drawBall(x, 150, i * 1.7, scale, 0, alive ? 1 : justLost ? 1 - game.lifeLostT * 0.8 : 0.2);
    }

    // Klavyeyle nişan alınıyorsa açı/güç bilgisi
    if (game.state === 'aim' && aim.key && !aim.dragging) {
      ctx.font = font(24);
      ctx.textAlign = 'left';
      outlinedText(`Açı ${Math.round(aim.angle)}° · Güç %${Math.round(aim.power * 100)}`, 28, 204, '#33363d', 5);
    }

    // Seviye ve seri
    ctx.textAlign = 'center';
    ctx.font = font(36);
    outlinedText(`Seviye ${game.level}`, W / 2, 50, '#33363d', 6);
    if (game.streak > 0) {
      const mult = game.streak >= 6 ? 3 : game.streak >= 3 ? 2 : 1;
      ctx.font = font(26);
      outlinedText(mult > 1 ? `Seri ${game.streak} · ×${mult} puan` : `Seri ${game.streak}`, W / 2, 84, mult > 1 ? '#d35400' : '#6b6f78', 5);
    }

    drawWindCard();
  }

  function drawWindCard() {
    const x = W - 244;
    const y = 18;
    const w = 222;
    const h = 104;
    const wind = game.windShown;
    const strength = Math.abs(wind);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.02);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 8 * renderScale;
    ctx.shadowOffsetY = 3 * renderScale;
    ctx.fillStyle = '#fffdf6';
    roundRect(ctx, 0, 0, w, h, 10);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Vantilatör (rüzgâr şiddetiyle titrer, yönüne göre döner)
    const fan = images.fan;
    const fh = 84;
    const fw = (fh * fan.naturalWidth) / fan.naturalHeight;
    ctx.save();
    ctx.translate(14 + fw / 2, 10 + fh);
    ctx.rotate(Math.sin(game.time * 30) * 0.012 * strength);
    if (wind < -0.05) ctx.scale(-1, 1);
    ctx.drawImage(fan, -fw / 2, -fh, fw, fh);
    ctx.restore();

    ctx.font = font(20);
    ctx.fillStyle = '#6b6f78';
    ctx.textAlign = 'center';
    const cx = 150;
    ctx.fillText('RÜZGÂR', cx, 28);

    const displayed = Math.round(strength * 10) / 10;
    if (displayed < 0.1) {
      ctx.font = font(26);
      ctx.fillStyle = '#3aa76d';
      ctx.fillText('yok', cx, 70);
    } else {
      const len = 14 + strength * 11;
      const dir = Math.sign(wind);
      const hue = 130 - clamp(strength / 7.5, 0, 1) * 130;
      const color = `hsl(${hue}, 65%, 42%)`;
      const ay = 56;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - (dir * len) / 2, ay);
      ctx.lineTo(cx + (dir * len) / 2 - dir * 8, ay);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + (dir * len) / 2 + dir * 4, ay);
      ctx.lineTo(cx + (dir * len) / 2 - dir * 12, ay - 10);
      ctx.lineTo(cx + (dir * len) / 2 - dir * 12, ay + 10);
      ctx.closePath();
      ctx.fill();
      ctx.font = font(24);
      ctx.fillStyle = '#33363d';
      ctx.fillText(`${displayed.toFixed(1)} m/s`, cx, 92);
    }
    ctx.restore();
  }

  function drawBanner() {
    if (!banner) return;
    const t = banner.t;
    const inK = easeOutBack(clamp(t / 0.4, 0, 1));
    const outK = t > 2 ? (t - 2) / 0.4 : 0;
    ctx.save();
    ctx.globalAlpha = clamp(1 - outK, 0, 1);
    ctx.translate(W / 2, 250 - outK * 30);
    ctx.rotate(-0.03);
    ctx.scale(inK, inK);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 12 * renderScale;
    ctx.shadowOffsetY = 4 * renderScale;
    ctx.fillStyle = '#fffdf6';
    ctx.fillRect(-260, -70, 520, 130);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(232, 163, 61, 0.55)';
    ctx.fillRect(-60, -82, 120, 24);
    ctx.textAlign = 'center';
    ctx.font = font(60);
    ctx.fillStyle = '#3a7bd5';
    ctx.fillText(banner.title, 0, 4);
    ctx.font = font(28);
    ctx.fillStyle = '#6b6f78';
    ctx.fillText(banner.sub, 0, 44);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    if (shakeAmt > 0.2) ctx.translate(rand(-shakeAmt, shakeAmt), rand(-shakeAmt, shakeAmt));
    drawSky();
    ctx.drawImage(bg, 0, 0, W, H);
    drawClockHands();
    drawStreaks();

    if (images.ball) {
      drawLitter();
      const g = binGeom();
      drawBinAndBall(g);
      drawAim();
      drawParticles();
      drawTexts();
    }
    ctx.restore();

    if (images.ball && game.state !== 'loading') {
      drawHUD();
      drawBanner();
    }
  }

  // ------------------------------------------------------------------
  // Boyutlandırma ve döngü
  // ------------------------------------------------------------------
  function resize() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    const cssW = Math.floor(W * scale);
    const cssH = Math.floor(H * scale);
    stage.style.width = `${cssW}px`;
    stage.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    renderScale = canvas.width / W;
    buildBackground();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (!game.paused) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------
  // Yükleme
  // ------------------------------------------------------------------
  function loadImage(key, url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { images[key] = img; resolve(); };
      img.onerror = () => reject(new Error(url));
      img.src = url;
    });
  }

  async function boot() {
    audio.init();
    updateMuteButton();
    resize();
    window.addEventListener('resize', resize);
    showScreen('loading');
    requestAnimationFrame(frame);

    const tasks = [
      ...Object.entries(ASSETS.img).map(([key, url]) => loadImage(key, url)),
      ...ASSETS.sfx.map(name => audio.load(name)),
      document.fonts ? document.fonts.load(font(32)).then(() => {}, () => {}) : Promise.resolve(),
    ];
    let done = 0;
    tasks.forEach(p => p.then(() => {
      done++;
      progressBar.style.width = `${(done / tasks.length) * 100}%`;
    }, () => {}));

    try {
      await Promise.all(tasks);
    } catch (err) {
      loadError.hidden = false;
      loadError.innerHTML = `Bir asset yüklenemedi: <code>${err.message}</code><br>` +
        'Oyun klasöründe <code>./download-assets.sh</code> komutunu çalıştırıp sayfayı yenile.';
      return;
    }

    const binImg = images.bin;
    binAspect = (binImg.naturalWidth * BIN_CROP_W) / binImg.naturalHeight;
    game.state = 'menu';
    resetBall(true);
    game.spawnT = 1;
    showScreen('menu');
  }

  boot();
})();
