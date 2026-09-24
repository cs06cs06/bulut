/* Öfkeli Kanatlar — ana oyun: yükleme, render, kamera, girdi, akış. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  var SL = World.SLING;
  var Audio = window.GameAudio;

  // ---------------------------------------------------------------- Temalar
  var THEMES = {
    meadow: {
      sky: ['#2f8fe6', '#7cc3f5', '#d8f1ff'], haze: '#cfeafc',
      sun: { x: 0.8, y: 0.16, rgb: '255,246,210', r: 60, rays: true },
      farTint: '#a9cfe8', far2Tint: '#bcdcef', bandTint: '#ffffff', bandAlpha: 0.9,
      hills: 'hills_grass', hillsFill: '#a0db44', hillsShade: 'rgba(40,110,160,0.18)',
      near: ['tree05', 'tree01', 'tree12', 'tree02', 'tree05', 'tree09'], nearShade: 'rgba(40,90,140,0.12)',
      ground: { dirt: ['#8f5d34', '#6c4222', '#3a2111'], pebble: ['#a57a52', '#5b3a22', '#c49e74', '#7d5836'], edge: ['#79cc3e', '#3f8a1e'], blades: ['#5bb82c', '#7fd23e', '#4a9a22', '#96e650', '#3f8a1e'], seed: 11 },
      clouds: 1, ambient: 'leaves', vignette: 0.32, grade: null, music: 'meadow'
    },
    desert: {
      sky: ['#e8573a', '#ff9f5c', '#ffe1a6'], haze: '#ffd09a',
      sun: { x: 0.64, y: 0.5, rgb: '255,214,150', r: 105, rays: true },
      farTint: '#d98a68', far2Tint: '#e8a57a', bandTint: '#ffd9b0', bandAlpha: 0.75,
      hills: 'hills_desert', hillsFill: '#e7dfc2', hillsShade: 'rgba(230,110,60,0.28)',
      near: ['tree17', 'cactus', 'tree19', 'rock', 'tree17', 'cactus'], nearShade: 'rgba(200,90,50,0.18)',
      ground: { dirt: ['#e6bf7d', '#c9985a', '#8a6030'], pebble: ['#b88a52', '#f2d49c', '#9a7040', '#d9aa6a'], edge: ['#f6dca4', '#d7ae6c'], blades: null, seed: 5 },
      clouds: 0.55, ambient: 'sand', vignette: 0.38, grade: 'rgba(255,120,40,0.07)', music: 'desert'
    },
    dusk: {
      sky: ['#0d0b2e', '#3b2c6e', '#c9687a'], haze: '#6a4a8a',
      moon: { x: 0.8, y: 0.18, r: 34 },
      farTint: '#2e2458', far2Tint: '#3e2f6a', bandTint: '#7a5a9a', bandAlpha: 0.55,
      hills: 'hills_shroom', hillsFill: '#5a3f58', hillsShade: 'rgba(30,15,70,0.55)',
      near: ['shroom', 'shroom', 'shroom', 'shroom'], nearShade: 'rgba(20,10,60,0.35)',
      ground: { dirt: ['#4d3a4f', '#35273d', '#1a1220'], pebble: ['#5e4a66', '#2a1f30', '#6f5a78'], edge: ['#5f8f3c', '#34542a'], blades: ['#4f7f34', '#6aa044', '#3a5e28', '#7cbf52'], seed: 23 },
      clouds: 0.35, stars: true, ambient: 'fireflies', vignette: 0.5, grade: 'rgba(70,30,140,0.14)', music: 'dusk'
    }
  };

  // ---------------------------------------------------------------- Varlıklar
  var IMG = {};
  function imageList() {
    var list = [];
    var shapes = Object.keys(World.SHAPES);
    ['wood', 'stone', 'glass'].forEach(function (m) {
      shapes.forEach(function (s) { for (var l = 0; l < 3; l++) list.push('blocks/' + m + '_' + s + '_' + l); });
    });
    for (var l = 0; l < 3; l++) list.push('blocks/tnt_s70_' + l);
    ['Glass', 'Stone', 'Wood'].forEach(function (m) { for (var i = 1; i <= 3; i++) list.push('debris/debris' + m + '_' + i); });
    ['smoke_01', 'smoke_04', 'smoke_07', 'smoke_10', 'star_06', 'star_07', 'spark_05', 'spark_06', 'flare_01', 'circle_05', 'light_02', 'flame_03', 'fire_01', 'dirt_02', 'twirl_02', 'scorch_02', 'magic_03', 'trace_01']
      .forEach(function (n) { list.push('fx/' + n); });
    ['cloud1', 'cloud2', 'cloud3', 'cloud5', 'cloud7', 'cloud8', 'cloudband', 'flat_pointy_mountains', 'flat_mountain1', 'flat_mountain2', 'flat_mountain3', 'flat_hills1', 'flat_hills2',
      'hills_grass', 'hills_desert', 'hills_shroom', 'tree01', 'tree02', 'tree05', 'tree09', 'tree12', 'tree17', 'tree19', 'cactus', 'rock', 'bush', 'starGold']
      .forEach(function (n) { list.push('bg/' + n); });
    return list;
  }

  function loadImages(onProgress) {
    var list = imageList(), done = 0;
    return Promise.all(list.map(function (n) {
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () { IMG[n] = im; done++; onProgress(done / list.length); res(); };
        im.onerror = function () { done++; onProgress(done / list.length); res(); };
        im.src = 'assets/' + n + '.png';
      });
    }));
  }

  // ---------------------------------------------------------------- Tema önbelleği
  var themeCache = {};
  function themeRes(name) {
    if (themeCache[name]) return themeCache[name];
    var th = THEMES[name];
    var r = {
      ground: Art.makeGround(th.ground),
      far: tinted(IMG['bg/flat_pointy_mountains'], th.farTint),
      mts: [tinted(IMG['bg/flat_mountain1'], th.far2Tint), tinted(IMG['bg/flat_mountain2'], th.far2Tint), tinted(IMG['bg/flat_mountain3'], th.far2Tint)],
      band: tinted(IMG['bg/cloudband'], th.bandTint),
      hills: shade(IMG['bg/' + th.hills], th.hillsShade),
      clouds: ['cloud1', 'cloud2', 'cloud3', 'cloud5', 'cloud7', 'cloud8'].map(function (n) { return name === 'dusk' ? tinted(IMG['bg/' + n], '#6c5a96') : IMG['bg/' + n]; }),
      near: th.near.map(function (n) { return n === 'shroom' ? makeShroom(Math.random()) : shade(IMG['bg/' + n], th.nearShade); })
    };
    themeCache[name] = r;
    return r;
  }

  function shade(img, color) {
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    if (color) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  // Gece için parlayan dev mantar
  function makeShroom(seed) {
    var c = document.createElement('canvas'); c.width = 180; c.height = 260;
    var g = c.getContext('2d');
    var hue = seed < 0.5 ? [255, 120, 200] : [120, 220, 255];
    var glow = g.createRadialGradient(90, 90, 10, 90, 90, 90);
    glow.addColorStop(0, 'rgba(' + hue + ',0.35)'); glow.addColorStop(1, 'rgba(' + hue + ',0)');
    g.fillStyle = glow; g.fillRect(0, 0, 180, 200);
    // Sap
    g.beginPath(); g.moveTo(78, 260); g.quadraticCurveTo(70, 170, 84, 110); g.lineTo(98, 110); g.quadraticCurveTo(108, 170, 104, 260); g.closePath();
    var sg = g.createLinearGradient(70, 0, 110, 0); sg.addColorStop(0, '#4a3b5e'); sg.addColorStop(1, '#2a2040');
    g.fillStyle = sg; g.fill();
    // Şapka
    g.beginPath(); g.moveTo(20, 120); g.quadraticCurveTo(30, 40, 90, 36); g.quadraticCurveTo(152, 40, 162, 120); g.quadraticCurveTo(90, 104, 20, 120); g.closePath();
    var cg = g.createLinearGradient(0, 36, 0, 120); cg.addColorStop(0, 'rgb(' + hue.map(function (v) { return Math.round(v * 0.75); }) + ')'); cg.addColorStop(1, 'rgb(' + hue.map(function (v) { return Math.round(v * 0.35); }) + ')');
    g.fillStyle = cg; g.fill();
    for (var i = 0; i < 6; i++) {
      g.beginPath(); g.ellipse(40 + i * 20, 70 + Math.sin(i * 2) * 14, 7, 5, 0, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
    }
    return c;
  }

  // ---------------------------------------------------------------- Durum
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var G = {
    W: 0, H: 0, dpr: 1, t: 0,
    mode: 'loading', // loading | menu | play
    levelIndex: 0, level: null, theme: null, world: null, fx: null,
    cam: { x: -300, y: -500, z: 1 }, zoomMul: 1, zoomMulT: 1, userCam: false,
    phase: 'none', phaseT: 0, queue: [], onSling: null, loadAnim: null,
    aim: null, flying: [], trail: [], oldTrail: [], score: 0, killsThisTurn: 0,
    laughT: 0, timeScale: 1, slowT: 0, acc: 0, pigState: new WeakMap(), birdState: {},
    ambient: [], stars: [], clouds: [], nearProps: [], shown: {}, paused: false
  };
  window.G = G;

  function resize() {
    G.dpr = Math.min(2, window.devicePixelRatio || 1);
    G.W = window.innerWidth; G.H = window.innerHeight;
    canvas.width = Math.round(G.W * G.dpr); canvas.height = Math.round(G.H * G.dpr);
    canvas.style.width = G.W + 'px'; canvas.style.height = G.H + 'px';
    G.vignette = null;
  }
  window.addEventListener('resize', resize);
  resize();

  function baseZoom(W, H) {
    return Math.max(0.32, Math.min(1.5, Math.min(H / 560, W / 920)));
  }

  // ---------------------------------------------------------------- Seviye
  function seeded(seed) {
    var s = seed;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function setupScenery(level) {
    var rnd = seeded(level.id * 97 + 3);
    G.clouds = [];
    for (var i = 0; i < 9; i++) G.clouds.push({ x: rnd() * 3000 - 600, y: 60 + rnd() * 220, s: 0.5 + rnd() * 0.7, k: Math.floor(rnd() * 6), f: 0.06 + rnd() * 0.1, v: 3 + rnd() * 6 });
    G.nearProps = [];
    var x = -700;
    while (x < level.right + 1600) {
      x += 150 + rnd() * 260;
      G.nearProps.push({ x: x, k: Math.floor(rnd() * 6), s: 0.55 + rnd() * 0.45, flip: rnd() < 0.5 });
    }
    G.stars = [];
    for (i = 0; i < 140; i++) G.stars.push({ x: rnd(), y: rnd() * 0.6, r: 0.5 + rnd() * 1.4, p: rnd() * TAU });
    G.ambient = [];
  }

  function makeWorld(level) {
    return new World(Matter, level, {
      impact: onImpact, killed: onKilled, damaged: onDamaged, explosion: onExplosion
    });
  }

  function startLevel(i, opts) {
    opts = opts || {};
    G.levelIndex = i;
    G.level = LEVELS[i];
    G.theme = THEMES[G.level.theme];
    G.world = makeWorld(G.level);
    G.fx = new FX(IMG);
    G.queue = G.level.birds.slice();
    G.queueFx = G.queue.map(function () { return { hop: Math.random() * 3, y: 0, vy: 0, blink: 0, look: 0 }; });
    G.onSling = null; G.loadAnim = null; G.aim = null; G.flying = [];
    G.trail = []; G.oldTrail = [];
    G.score = 0; G.laughT = 0; G.timeScale = 1; G.slowT = 0; G.acc = 0;
    G.pigState = new WeakMap();
    G.userCam = false; G.zoomMul = G.zoomMulT = 1;
    G.bonusQ = null;
    setupScenery(G.level);
    themeRes(G.level.theme);
    var z = baseZoom(G.W, G.H);
    G.cam.z = z;
    var vw = G.W / z, vh = G.H / z;
    G.cam.x = G.level.right + 350 - vw;
    G.cam.y = -vh * 0.86;
    if (opts.demo) {
      G.mode = 'menu'; setPhase('demo');
    } else {
      G.mode = 'play'; setPhase(opts.quick ? 'next' : 'intro');
      UI.hud(true, G.level);
      UI.score(0);
      Audio.play('start', 0.6);
    }
    Audio.startMusic(opts.demo ? 'menu' : G.theme.music);
  }

  function setPhase(p) {
    G.phase = p; G.phaseT = 0;
  }

  // ---------------------------------------------------------------- Olay kancaları
  function matSound(body) {
    var p = body.plugin;
    if (p.kind === 'block') return p.mat === 'tnt' ? 'wood' : p.mat;
    if (p.kind === 'pig') return 'soft';
    if (p.kind === 'bird') return 'punch';
    return null;
  }

  function onImpact(a, b, vn, x, y) {
    var vol = Math.min(1, (vn - 1) / 9);
    var sa = matSound(a), sb = matSound(b);
    var s = sa === 'punch' || sb === 'punch' ? (sa === 'punch' ? sb || 'punch' : sa) : sa || sb;
    if (s) Audio.play(s, vol * 0.8, 1, 0.045);
    if ((a.plugin.kind === 'bird' || b.plugin.kind === 'bird') && vn > 2.5) {
      Audio.play('punch', vol * 0.6, 1.1, 0.08);
      var bird = a.plugin.kind === 'bird' ? a : b;
      var col = Art.BIRD_COL[bird.plugin.type].mid;
      G.fx.feathers(bird.position.x, bird.position.y, col, Math.min(9, Math.floor(vn / 1.6)), 1);
      if (vn > 8) G.fx.shake = Math.max(G.fx.shake, vn * 0.35);
    }
    var ground = a.plugin.kind === 'ground' || b.plugin.kind === 'ground';
    if (ground && vn > 2.2) G.fx.dust(x, -2, vn, G.level.theme === 'desert' ? '#f3dcae' : G.level.theme === 'dusk' ? '#9a86a8' : '#e9dcc0');
  }

  function onDamaged(body, dmg) {
    var p = body.plugin;
    if (p.kind === 'pig' && p.hp > 0) Audio.oink(p.type === 'king' ? 0.8 : p.type === 'small' ? 1.25 : 1);
  }

  function onKilled(body) {
    var p = body.plugin, x = body.position.x, y = body.position.y;
    if (p.kind === 'block') {
      var n = Math.max(3, Math.min(10, Math.round((p.w * p.h) / 500)));
      G.fx.debris(x, y, p.mat, n, p.w, p.h, body.velocity.x, body.velocity.y);
      G.fx.smoke(x, y, 3, p.mat === 'glass' ? '#eefaff' : '#e8dcc8', Math.max(p.w, p.h) * 0.4, 1, 0.3);
      Audio.play(p.mat === 'tnt' ? 'woodbreak' : p.mat + 'break', 0.8, 1, 0.03);
      var sc = World.MATERIALS[p.mat].score;
      addScore(sc, x, y, p.mat === 'glass' ? '#dff8ff' : p.mat === 'stone' ? '#e6ecf0' : '#ffe6b8');
    } else if (p.kind === 'pig') {
      G.fx.poof(x, y, p.r * 1.3, '#dff5c6');
      G.fx.feathers(x, y, '#8ad63c', 0, 1);
      Audio.pigPop();
      addScore(World.PIGS[p.type].score, x, y - 10, '#b4ff5a', true);
      G.killsThisTurn++;
      if (G.world.pigs.length <= 1) { G.slowT = 0.9; }
    } else if (p.kind === 'bird' && !p.exploded) {
      G.fx.poof(x, y, p.r, '#ffffff');
      G.fx.feathers(x, y, Art.BIRD_COL[p.type].mid, 8, 1.2);
      Audio.play('pop', 0.5, 1.2);
    }
  }

  function onExplosion(x, y, r, power) {
    G.fx.explosion(x, y, r);
    Audio.explosion();
    G.slowT = Math.max(G.slowT, 0.35);
  }

  function addScore(v, x, y, color, big) {
    G.score += v;
    G.fx.score(x, y, v, color, big);
    UI.score(G.score);
  }

  // ---------------------------------------------------------------- Kuş yönetimi
  function queuePos(i) {
    return { x: SL.x - 62 - i * 44, y: 0 };
  }

  function birdR(type) { return World.BIRDS[type].r; }

  function loadNextBird() {
    if (!G.queue.length) return false;
    var type = G.queue.shift();
    var qf = G.queueFx.shift();
    var from = queuePos(0);
    G.loadAnim = { type: type, t: 0, from: { x: from.x, y: -birdR(type) + (qf ? qf.y : 0) } };
    setPhase('loading');
    Audio.play('select', 0.35, 1.3);
    return true;
  }

  function launchBird() {
    var a = G.aim;
    var v = World.launchVelocity(a.dx, a.dy);
    var type = G.onSling.type;
    var b = G.world.spawnBird(type, SL.x + a.dx, SL.y + a.dy);
    G.world.launch(b, v.x, v.y);
    G.flying = [b];
    G.oldTrail = G.trail; G.trail = [];
    G.onSling = null; G.aim = null;
    G.killsThisTurn = 0;
    G.userCam = false;
    Audio.launch(type);
    G.fx.smoke(SL.x + a.dx * 0.5, SL.y + a.dy * 0.5, 3, '#ffffff', 14, 1, 0);
    setPhase('flying');
    UI.hint(null);
  }

  function tapAbility() {
    for (var i = 0; i < G.flying.length; i++) {
      var b = G.flying[i];
      if (b.plugin.dead || !b.plugin.ability) continue;
      var r = G.world.activate(b);
      if (!r) continue;
      var x = b.position.x, y = b.position.y;
      if (r === 'boost') {
        Audio.ability('boost');
        G.fx.ring(x, y, 30, '#fff6b0');
        G.fx.sparkles(x, y, 10, '#ffe46a', 6);
      } else if (r.split) {
        Audio.ability('split');
        G.fx.ring(x, y, 22, '#bfe9ff');
        G.fx.sparkles(x, y, 8, '#bfe9ff', 5);
        G.flying = G.flying.concat(r.split);
      }
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- Girdi
  var pointers = new Map();
  var pan = null, pinch = null;

  function toWorld(sx, sy) {
    return { x: G.cam.x + sx / G.cam.z, y: G.cam.y + sy / G.cam.z };
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    Audio.unlock();
    if (G.mode !== 'play' || G.paused) return;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      G.aim && cancelAim();
      var pts = Array.from(pointers.values());
      pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), m: G.zoomMulT };
      pan = null;
      return;
    }
    if (G.phase === 'intro') { G.phaseT = 99; return; }
    var w = toWorld(e.clientX, e.clientY);
    if (G.phase === 'flying' && tapAbility()) return;
    if (G.phase === 'ready' && G.onSling) {
      var d = Math.hypot(w.x - SL.x, w.y - SL.y);
      if (d < Math.max(120, 80 / G.cam.z)) {
        G.aim = { sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, id: e.pointerId, maxed: false };
        G.userCam = false;
        Audio.stretch();
        return;
      }
    }
    pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      var pts = Array.from(pointers.values());
      var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      G.zoomMulT = Math.max(0.62, Math.min(1.9, pinch.m * d / Math.max(20, pinch.d)));
      G.userCam = true;
      return;
    }
    if (G.aim && e.pointerId === G.aim.id) {
      var z = G.cam.z;
      var dx = (e.clientX - G.aim.sx) / z * 1.15, dy = (e.clientY - G.aim.sy) / z * 1.15;
      var len = Math.hypot(dx, dy);
      if (len > SL.maxPull) { dx *= SL.maxPull / len; dy *= SL.maxPull / len; }
      G.aim.dx = dx; G.aim.dy = dy;
      if (len > SL.maxPull * 0.9 && !G.aim.maxed) { G.aim.maxed = true; Audio.stretch(); }
      if (len < SL.maxPull * 0.7) G.aim.maxed = false;
      return;
    }
    if (pan && e.pointerId === pan.id) {
      var ddx = e.clientX - pan.x, ddy = e.clientY - pan.y;
      pan.x = e.clientX; pan.y = e.clientY;
      if (Math.abs(ddx) + Math.abs(ddy) > 0) {
        G.userCam = true;
        G.camT = G.camT || { x: G.cam.x, y: G.cam.y };
        G.userX = (G.userX == null ? G.cam.x : G.userX) - ddx / G.cam.z;
        G.userY = (G.userY == null ? G.cam.y : G.userY) - ddy / G.cam.z;
      }
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (G.aim && e.pointerId === G.aim.id) {
      if (Math.hypot(G.aim.dx, G.aim.dy) > 18) launchBird();
      else cancelAim();
    }
    if (pan && pan.id === e.pointerId) pan = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    G.zoomMulT = Math.max(0.62, Math.min(1.9, G.zoomMulT * (e.deltaY > 0 ? 0.9 : 1.1)));
    G.userCam = true;
  }, { passive: false });
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  function cancelAim() {
    G.aim = null;
    Audio.play('pluck', 0.3, 1.4);
  }

  // ---------------------------------------------------------------- Güncelleme
  function update(dt) {
    G.t += dt;
    G.phaseT += dt;
    if (G.mode === 'loading') return;
    var w = G.world;

    // Ağır çekim
    if (G.slowT > 0) { G.slowT -= dt; G.timeScale += (0.35 - G.timeScale) * Math.min(1, dt * 10); }
    else G.timeScale += (1 - G.timeScale) * Math.min(1, dt * 4);

    var sim = G.mode === 'play' && !G.paused && G.phase !== 'intro';
    if (sim) {
      G.acc += dt * G.timeScale;
      var n = 0;
      while (G.acc >= 1 / 60 && n < 4) { w.step(1 / 60); G.acc -= 1 / 60; n++; }
      if (n === 4) G.acc = 0;
    }
    var fdt = G.paused ? 0 : dt * G.timeScale;
    G.fx.update(fdt);
    if (G.laughT > 0) G.laughT -= dt;

    updateQueue(dt);
    if (G.mode === 'play' && !G.paused) updatePhase(dt);
    updateCamera(dt);
    updateAmbient(dt);
  }

  function updateQueue(dt) {
    for (var i = 0; i < G.queueFx.length; i++) {
      var q = G.queueFx[i];
      q.hop -= dt;
      if (q.hop <= 0 && q.y === 0) { q.vy = -(3 + Math.random() * 3); q.hop = 1.2 + Math.random() * 3; }
      if (q.vy !== 0 || q.y < 0) {
        q.vy += 22 * dt; q.y += q.vy * dt * 60 * 0.5;
        if (q.y >= 0) { q.y = 0; q.vy = 0; }
      }
      q.blink = Math.max(0, q.blink - dt * 8);
      if (Math.random() < dt * 0.4) q.blink = 1;
      q.look += dt;
    }
  }

  function updatePhase(dt) {
    var w = G.world;
    switch (G.phase) {
      case 'intro':
        if (G.phaseT > 3.2) setPhase('next');
        break;
      case 'next':
        if (G.phaseT > 0.25) {
          if (!loadNextBird()) setPhase('resolve');
        }
        break;
      case 'loading':
        var la = G.loadAnim;
        la.t += dt / 0.5;
        if (la.t >= 1) {
          G.onSling = { type: la.type, blink: 0 };
          G.loadAnim = null;
          setPhase('ready');
          showHintFor(la.type);
        }
        break;
      case 'flying':
        var alive = [];
        for (var i = 0; i < G.flying.length; i++) {
          var b = G.flying[i], p = b.plugin;
          if (p.dead) continue;
          // İz
          var last = G.trail[G.trail.length - 1];
          if (!p.hit && !p.clone && (!last || Math.hypot(b.position.x - last.x, b.position.y - last.y) > 22)) {
            G.trail.push({ x: b.position.x, y: b.position.y, s: G.trail.length % 3 === 0 ? 1 : 0.55 });
          }
          if (p.boosted > 0) G.fx.speedLines(b.position.x, b.position.y, b.velocity.x, b.velocity.y);
          if (p.fuse > 0 && Math.random() < 0.6) {
            var fx = b.position.x + Math.cos(b.angle - 1.35) * p.r * 1.4, fy = b.position.y + Math.sin(b.angle - 1.35) * p.r * 1.4;
            G.fx.add({ tex: G.fx.tex('spark_06', '#ffd060'), x: fx, y: fy, add: true, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, size0: 8, size1: 1, max: 0.3, g: 0.1, fade: 'out' });
          }
          var out = b.position.x > G.level.right + 1200 || b.position.x < -850 || b.position.y > 100;
          if (p.still > 1.1 || (p.hit && p.age > 7) || p.age > 12 || out) {
            if (!p.dead) G.world.kill(b);
            continue;
          }
          alive.push(b);
        }
        G.flying = alive;
        if (!alive.length) setPhase('settle');
        break;
      case 'settle':
        if ((w.settled() && G.phaseT > 0.7) || G.phaseT > 5) setPhase('resolve');
        break;
      case 'resolve':
        if (!w.pigs.length) {
          setPhase('won');
          G.bonusQ = G.queue.slice();
          G.bonusIdx = 0;
        } else if (!G.queue.length) {
          setPhase('lost');
          G.laughT = 2.5;
          Audio.laugh();
          setTimeout(function () { Audio.lose(); }, 500);
        } else {
          if (G.killsThisTurn === 0) { G.laughT = 1.4; Audio.laugh(); }
          setPhase('next');
        }
        break;
      case 'won':
        // Kalan kuş bonusları
        if (G.bonusIdx < G.bonusQ.length && G.phaseT > 0.8 + G.bonusIdx * 0.55) {
          var qp = queuePos(G.bonusIdx);
          addScore(10000, qp.x, -60, '#ffd84a', true);
          G.fx.poof(qp.x, -20, 18, '#ffffff');
          G.fx.sparkles(qp.x, -30, 12, '#ffe46a', 6);
          Audio.play('confirm', 0.6, 1 + G.bonusIdx * 0.12);
          G.queueFx[G.bonusIdx] && (G.queueFx[G.bonusIdx].gone = true);
          G.bonusIdx++;
        }
        if (G.phaseT > 1.6 + G.bonusQ.length * 0.55 && !G.resultShown) {
          G.resultShown = true;
          finishLevel(true);
        }
        break;
      case 'lost':
        if (G.phaseT > 2.4 && !G.resultShown) { G.resultShown = true; finishLevel(false); }
        break;
    }
  }

  function showHintFor(type) {
    var key = 'hint_' + type;
    var txt = {
      red: 'Kuşu geriye çek ve bırak!',
      yellow: 'Sarı kuş: uçarken ekrana dokun → HIZLAN!',
      blue: 'Mavi kuş: uçarken dokun → 3\'e BÖLÜN!',
      black: 'Bomba kuş: dokun → PATLA! (Çarpınca da patlar)'
    }[type];
    if (!G.shown[key]) { G.shown[key] = true; UI.hint(txt); }
    else UI.hint(null);
  }

  function finishLevel(won) {
    var stars = 0;
    if (won) {
      var th = G.level.stars;
      stars = G.score >= th[2] ? 3 : G.score >= th[1] ? 2 : 1;
      Progress.save(G.levelIndex, stars, G.score);
      Audio.play('win', 0.8);
    }
    UI.result(won, stars, G.score, Progress.best(G.levelIndex), G.levelIndex);
  }

  // ---------------------------------------------------------------- Kamera
  function updateCamera(dt) {
    var cam = G.cam;
    G.zoomMul += (G.zoomMulT - G.zoomMul) * Math.min(1, dt * 8);
    var tz = baseZoom(G.W, G.H) * G.zoomMul;
    cam.z += (tz - cam.z) * Math.min(1, dt * 6);
    var vw = G.W / cam.z, vh = G.H / cam.z;
    var minX = -560, maxX = Math.max(minX, G.level.right + 380 - vw);
    var groundTop = -vh * 0.86;
    var tx, ty = groundTop, k = 3;
    var slingX = SL.x - vw * 0.2;
    if (G.phase === 'demo') {
      tx = minX + (maxX - minX) * (0.5 - 0.5 * Math.cos(G.t * 0.12));
      k = 2;
    } else if (G.phase === 'intro') {
      var u = Math.max(0, Math.min(1, (G.phaseT - 1.2) / 1.8));
      u = u * u * (3 - 2 * u);
      cam.x = maxX + (slingX - maxX) * u;
      cam.y = groundTop;
      return;
    } else if (G.flying.length && G.phase === 'flying') {
      var b = G.flying[0];
      tx = b.position.x - vw * 0.38;
      var topNeed = b.position.y - vh * 0.2;
      ty = Math.min(groundTop, topNeed);
      k = 4;
      G.userX = G.userY = null;
    } else if (G.phase === 'settle' || G.phase === 'resolve' || G.phase === 'won' || G.phase === 'lost') {
      tx = G.lastFocus != null ? G.lastFocus : cam.x;
      if (G.phase === 'won' && G.phaseT > 0.5) tx = slingX;
      k = 2;
    } else {
      tx = slingX;
      k = 2.5;
    }
    if (G.phase === 'flying' && G.flying.length) G.lastFocus = G.flying[0].position.x - vw * 0.45;
    if (G.userCam && G.userX != null && (G.phase === 'ready' || G.phase === 'settle' || G.phase === 'next' || G.phase === 'loading')) {
      tx = G.userX; ty = Math.min(groundTop, G.userY);
      k = 12;
    }
    if (G.aim) { G.userX = G.userY = null; G.userCam = false; }
    tx = Math.max(minX, Math.min(maxX, tx));
    ty = Math.max(-1800, Math.min(groundTop, ty));
    if (G.userX != null) { G.userX = Math.max(minX, Math.min(maxX, G.userX)); G.userY = Math.max(-1800, Math.min(groundTop, G.userY)); }
    var f = 1 - Math.exp(-dt * k);
    cam.x += (tx - cam.x) * f;
    cam.y += (ty - cam.y) * f;
    // Zemin her zaman görünür kalsın
    cam.y = Math.min(cam.y, -vh * 0.6);
  }

  // ---------------------------------------------------------------- Ortam parçacıkları (ekran uzayı)
  function updateAmbient(dt) {
    var th = G.theme;
    if (!th) return;
    var A = G.ambient, W = G.W, H = G.H;
    var target = th.ambient === 'fireflies' ? 28 : th.ambient === 'sand' ? 26 : 12;
    while (A.length < target) {
      A.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, p: Math.random() * TAU, s: 0.5 + Math.random(), r: Math.random() * TAU });
    }
    for (var i = 0; i < A.length; i++) {
      var a = A[i];
      a.p += dt;
      if (th.ambient === 'leaves') { a.x += (-25 + Math.sin(a.p * 1.3) * 30) * dt * a.s; a.y += (22 + Math.cos(a.p * 2) * 10) * dt * a.s; a.r += dt * 2 * a.s; }
      else if (th.ambient === 'sand') { a.x += (-160 * a.s) * dt; a.y += Math.sin(a.p * 3) * 12 * dt; }
      else { a.x += Math.sin(a.p * 0.7 + a.r) * 14 * dt; a.y += Math.cos(a.p * 0.9 + a.r) * 10 * dt; }
      if (a.x < -20) a.x = W + 20; if (a.x > W + 20) a.x = -20;
      if (a.y > H + 20) a.y = -20; if (a.y < -20) a.y = H + 20;
    }
  }

  // ---------------------------------------------------------------- Render
  function render() {
    var W = G.W, H = G.H, dpr = G.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.mode === 'loading' || !G.world) {
      ctx.fillStyle = '#1b2440'; ctx.fillRect(0, 0, W, H);
      return;
    }
    renderScene(ctx, { W: W, H: H, dpr: dpr, cam: G.cam, world: G.world, theme: G.theme, level: G.level, t: G.t, live: true });
  }

  function renderScene(c, v) {
    var th = v.theme, cam = v.cam, z = cam.z, W = v.W, H = v.H, t = v.t;
    var res = themeRes(v.level.theme);
    var shx = 0, shy = 0;
    if (v.live && G.fx.shake > 0) { shx = (Math.random() - 0.5) * G.fx.shake; shy = (Math.random() - 0.5) * G.fx.shake; }
    var groundSY = (0 - cam.y) * z;

    // Gökyüzü
    var sg = c.createLinearGradient(0, 0, 0, Math.max(10, groundSY));
    sg.addColorStop(0, th.sky[0]); sg.addColorStop(0.55, th.sky[1]); sg.addColorStop(1, th.sky[2]);
    c.fillStyle = sg; c.fillRect(0, 0, W, H);

    // Yıldızlar
    if (th.stars) {
      for (var i = 0; i < G.stars.length; i++) {
        var s = G.stars[i];
        var a = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.p));
        c.globalAlpha = a * 0.9;
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(s.x * W, s.y * groundSY, s.r, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
    // Güneş / Ay
    if (th.sun) {
      var sx = th.sun.x * W - cam.x * z * 0.02, sy = th.sun.y * groundSY;
      var R = th.sun.r * Math.max(0.7, z);
      var gl = c.createRadialGradient(sx, sy, R * 0.2, sx, sy, R * 5);
      gl.addColorStop(0, 'rgba(' + th.sun.rgb + ',0.9)'); gl.addColorStop(0.25, 'rgba(' + th.sun.rgb + ',0.35)'); gl.addColorStop(1, 'rgba(' + th.sun.rgb + ',0)');
      c.fillStyle = gl; c.fillRect(sx - R * 5, sy - R * 5, R * 10, R * 10);
      if (th.sun.rays) {
        c.save(); c.translate(sx, sy); c.rotate(t * 0.03);
        c.globalCompositeOperation = 'lighter';
        for (var k = 0; k < 12; k++) {
          c.rotate(TAU / 12);
          var rg = c.createLinearGradient(0, 0, R * 9, 0);
          rg.addColorStop(0, 'rgba(' + th.sun.rgb + ',0.14)'); rg.addColorStop(1, 'rgba(' + th.sun.rgb + ',0)');
          c.fillStyle = rg;
          c.beginPath(); c.moveTo(0, 0); c.lineTo(R * 9, -R * 0.9); c.lineTo(R * 9, R * 0.9); c.closePath(); c.fill();
        }
        c.restore();
        c.globalCompositeOperation = 'source-over';
      }
      c.beginPath(); c.arc(sx, sy, R, 0, TAU);
      var sd = c.createRadialGradient(sx - R * 0.3, sy - R * 0.3, R * 0.1, sx, sy, R);
      sd.addColorStop(0, '#fffef5'); sd.addColorStop(1, 'rgba(' + th.sun.rgb + ',1)');
      c.fillStyle = sd; c.fill();
    }
    if (th.moon) {
      var mx = th.moon.x * W - cam.x * z * 0.02, my = th.moon.y * groundSY, mr = th.moon.r * Math.max(0.8, z);
      var mg = c.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
      mg.addColorStop(0, 'rgba(220,210,255,0.35)'); mg.addColorStop(1, 'rgba(220,210,255,0)');
      c.fillStyle = mg; c.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
      c.beginPath(); c.arc(mx, my, mr, 0, TAU);
      var md = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      md.addColorStop(0, '#fffdf0'); md.addColorStop(1, '#d9d2f0');
      c.fillStyle = md; c.fill();
      c.fillStyle = 'rgba(160,150,200,0.35)';
      [[0.3, -0.2, 0.2], [-0.35, 0.25, 0.15], [0.1, 0.4, 0.12]].forEach(function (q) { c.beginPath(); c.arc(mx + q[0] * mr, my + q[1] * mr, q[2] * mr, 0, TAU); c.fill(); });
    }

    // Parallaks katman yardımcıları
    function layerY(f) { return (H * 0.86) + (groundSY - H * 0.86) * f; }
    function tileImg(img, f, sc, yb, alpha, drift) {
      var w = img.width * sc, h = img.height * sc;
      var off = -((cam.x * z * f + (drift || 0)) % w);
      if (off > 0) off -= w;
      c.globalAlpha = alpha == null ? 1 : alpha;
      for (var x = off; x < W; x += w - 1) c.drawImage(img, x, yb - h, w, h);
      c.globalAlpha = 1;
    }

    // Uzak bulutlar
    var zs = Math.max(0.55, z);
    for (i = 0; i < G.clouds.length; i++) {
      var cl = G.clouds[i], im = res.clouds[cl.k];
      var cw = im.width * cl.s * zs, ch = im.height * cl.s * zs;
      var span = W + cw + 400;
      var cx = ((cl.x - cam.x * z * cl.f + t * cl.v) % span + span) % span - cw - 200;
      c.globalAlpha = 0.85 * th.clouds;
      c.drawImage(im, cx, layerY(0.05) - cl.y * zs - 120 * zs, cw, ch);
    }
    c.globalAlpha = 1;
    // Dağlar
    tileImg(res.far, 0.08, zs * 1.5, layerY(0.1) - 70 * zs, 1);
    var mts = res.mts;
    var mspan = 900 * zs;
    var moff = -((cam.x * z * 0.14) % mspan);
    for (var mx2 = moff - mspan; mx2 < W + mspan; mx2 += mspan) {
      var idx = Math.abs(Math.round((mx2 - moff) / mspan)) % 3;
      var mi = mts[idx];
      c.drawImage(mi, mx2 + 120 * zs, layerY(0.14) - mi.height * zs * 0.9 - 40 * zs, mi.width * zs * 0.9, mi.height * zs * 0.9);
    }
    // Bulut bandı (ufuk sisi)
    tileImg(res.band, 0.2, zs * 1.2, layerY(0.22) + 10 * zs, th.bandAlpha, t * 4);
    // Tepeler
    var hs = zs * 1.05;
    var hy = layerY(0.4) + 40 * zs;
    tileImg(res.hills, 0.4, hs, hy, 1);
    c.fillStyle = th.hillsFill;
    c.fillRect(0, hy - 1, W, H);
    c.fillStyle = th.hillsShade;
    c.fillRect(0, hy - 1, W, H);
    // Atmosfer sisi
    var hg = c.createLinearGradient(0, hy - 200 * zs, 0, groundSY);
    hg.addColorStop(0, 'rgba(0,0,0,0)');
    hg.addColorStop(1, hexA(th.haze, 0.45));
    c.fillStyle = hg; c.fillRect(0, hy - 200 * zs, W, groundSY - hy + 200 * zs + 2);

    // Dünya dönüşümü
    var dpr = v.dpr;
    function worldTf(f) {
      c.setTransform(dpr * z, 0, 0, dpr * z, dpr * (-cam.x * z * f + shx), dpr * (-cam.y * z + shy));
    }
    // Yakın dekor (ağaçlar vb.) — 0.75 paralaks
    worldTf(0.75);
    for (i = 0; i < G.nearProps.length; i++) {
      var np = G.nearProps[i], ni = res.near[np.k % res.near.length];
      var nw = ni.width * np.s, nh = ni.height * np.s;
      var nx = np.x;
      c.save();
      c.translate(nx, 4);
      if (np.flip) c.scale(-1, 1);
      if (v.level.theme === 'dusk') {
        var sw = Math.sin(t * 0.8 + np.x) * 0.02;
        c.rotate(sw);
      }
      c.drawImage(ni, -nw / 2, -nh, nw, nh);
      c.restore();
    }
    // Zemin
    worldTf(1);
    var vw = W / z, vh = H / z;
    var left = cam.x - 60, right = cam.x + vw + 60;
    c.save();
    c.scale(0.5, 0.5);
    var pat = res.dirtPat || (res.dirtPat = c.createPattern(res.ground.dirt, 'repeat'));
    c.fillStyle = pat;
    c.fillRect(left * 2, 0, (right - left) * 2, Math.max(400, (cam.y + vh) * 2 + 40));
    var e = res.ground.edge;
    var ex0 = Math.floor(left * 2 / e.width) * e.width;
    for (var ex = ex0; ex < right * 2; ex += e.width) c.drawImage(e, ex, -20);
    c.restore();

    // Gölgeler
    var bodies = v.world.blocks.concat(v.world.pigs, v.world.birds);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (i = 0; i < bodies.length; i++) {
      var bd = bodies[i];
      var bb = bd.bounds, hgt = -bb.max.y;
      if (hgt > 180) continue;
      var aa = (1 - hgt / 180) * 0.35;
      var bw = (bb.max.x - bb.min.x) * 0.55 * (1 + hgt / 250);
      c.globalAlpha = aa;
      c.beginPath(); c.ellipse(bd.position.x, 1, bw, 4 + bw * 0.08, 0, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;

    // Önceki atış izi ve mevcut iz
    drawTrail(c, G.oldTrail, 0.35);
    drawTrail(c, G.trail, 0.9);

    // Sapan (arka)
    c.save(); c.translate(SL.x, 0);
    Art.drawSlingTrunk(c);
    Art.drawSlingBack(c);
    c.restore();
    var slingBird = null;
    if (v.live && (G.onSling || G.aim)) {
      var adx = G.aim ? G.aim.dx : 0, ady = G.aim ? G.aim.dy : 0;
      slingBird = { type: G.onSling.type, x: SL.x + adx, y: SL.y + ady, dx: adx, dy: ady };
    }
    var bandStretch = slingBird ? Math.hypot(slingBird.dx, slingBird.dy) : 0;
    var pouchP = null;
    if (slingBird) {
      var r0 = birdR(slingBird.type);
      var dl = Math.hypot(slingBird.dx, slingBird.dy);
      var ux = dl > 4 ? slingBird.dx / dl : -1, uy = dl > 4 ? slingBird.dy / dl : 0.05;
      pouchP = { x: slingBird.x + ux * r0 * 0.75, y: slingBird.y + uy * r0 * 0.75, a: Math.atan2(uy, ux), r: r0 };
      Art.band(c, SL.x + Art.SL.backBand.x, Art.SL.backBand.y, pouchP.x, pouchP.y, bandStretch);
      Art.pouch(c, pouchP.x, pouchP.y, pouchP.a, r0 * 1.05);
    } else {
      Art.band(c, SL.x + Art.SL.backBand.x, Art.SL.backBand.y, SL.x - 3, SL.y + 4, 0);
    }

    // Bloklar
    var W_ = v.world;
    for (i = 0; i < W_.blocks.length; i++) drawBlock(c, W_.blocks[i]);
    // Domuzlar
    for (i = 0; i < W_.pigs.length; i++) drawPigBody(c, W_.pigs[i], t);
    // Sıradaki kuşlar
    drawQueue(c, t);
    // Yükleme animasyonu
    if (v.live && G.loadAnim) {
      var la = G.loadAnim, u = Math.min(1, la.t), e2 = u * u * (3 - 2 * u);
      var lx = la.from.x + (SL.x - la.from.x) * e2, ly = la.from.y + (SL.y - la.from.y) * e2 - Math.sin(u * Math.PI) * 70;
      c.save(); c.translate(lx, ly); c.rotate(u * TAU);
      Art.drawBird(c, la.type, birdR(la.type), { look: { x: 1, y: 0 }, t: t });
      c.restore();
    }
    // Uçan kuşlar
    for (i = 0; i < W_.birds.length; i++) drawFlyingBird(c, W_.birds[i], t);
    // Sapandaki kuş
    if (slingBird) {
      c.save(); c.translate(slingBird.x, slingBird.y);
      var dl2 = Math.hypot(slingBird.dx, slingBird.dy);
      if (dl2 > 4) c.rotate(Math.atan2(-slingBird.dy, -slingBird.dx));
      var sq = dl2 / SL.maxPull;
      c.scale(1 + sq * 0.12, 1 - sq * 0.1);
      G.onSling.blink = Math.max(0, (G.onSling.blink || 0) - 0.12);
      if (Math.random() < 0.006) G.onSling.blink = 1;
      Art.drawBird(c, slingBird.type, birdR(slingBird.type), { look: { x: 1, y: 0 }, blink: G.aim ? 0 : G.onSling.blink, t: t, fuse: false });
      c.restore();
      Art.band(c, SL.x + Art.SL.frontBand.x, Art.SL.frontBand.y, pouchP.x, pouchP.y, bandStretch);
    } else {
      Art.band(c, SL.x + Art.SL.frontBand.x, Art.SL.frontBand.y, SL.x - 3, SL.y + 4, 0);
    }
    c.save(); c.translate(SL.x, 0);
    Art.drawSlingFront(c);
    c.restore();

    // Nişan noktaları
    if (v.live && G.aim && Math.hypot(G.aim.dx, G.aim.dy) > 10) {
      var vel = World.launchVelocity(G.aim.dx, G.aim.dy);
      var pts = World.predict(SL.x + G.aim.dx, SL.y + G.aim.dy, vel.x, vel.y, 70, 4);
      for (i = 0; i < pts.length; i++) {
        var fade = 1 - i / pts.length;
        c.globalAlpha = 0.85 * fade;
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(pts[i].x, pts[i].y, 4.5 * fade + 1.5, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.stroke();
      }
      c.globalAlpha = 1;
    }

    if (v.live) {
      G.fx.draw(c);
      G.fx.drawTexts(c, z);
    }

    // Ekran uzayı efektleri
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (v.live) drawAmbient(c, th);
    if (th.grade) { c.fillStyle = th.grade; c.fillRect(0, 0, W, H); }
    if (v.live && G.fx.flash > 0) {
      c.fillStyle = 'rgba(255,245,220,' + (G.fx.flash * 0.8) + ')';
      c.fillRect(0, 0, W, H);
    }
    drawVignette(c, W, H, th.vignette, v.live);
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function drawVignette(c, W, H, amount, live) {
    var key = W + 'x' + H + ':' + amount;
    if (!G.vig || G.vig.key !== key) {
      var vc = document.createElement('canvas');
      vc.width = Math.max(1, Math.round(W / 2)); vc.height = Math.max(1, Math.round(H / 2));
      var g = vc.getContext('2d');
      var rg = g.createRadialGradient(vc.width / 2, vc.height * 0.45, Math.min(vc.width, vc.height) * 0.35, vc.width / 2, vc.height / 2, Math.max(vc.width, vc.height) * 0.75);
      rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,10,' + amount + ')');
      g.fillStyle = rg; g.fillRect(0, 0, vc.width, vc.height);
      if (live) G.vig = { key: key, c: vc };
      c.drawImage(vc, 0, 0, W, H);
      return;
    }
    c.drawImage(G.vig.c, 0, 0, W, H);
  }

  function drawAmbient(c, th) {
    var A = G.ambient;
    for (var i = 0; i < A.length; i++) {
      var a = A[i];
      if (th.ambient === 'leaves') {
        c.save(); c.translate(a.x, a.y); c.rotate(a.r);
        c.scale(1, Math.cos(a.p * 3) * 0.8 + 0.2 || 0.2);
        c.fillStyle = i % 3 ? 'rgba(120,200,60,0.85)' : 'rgba(240,190,60,0.85)';
        c.beginPath(); c.ellipse(0, 0, 6 * a.s, 3 * a.s, 0, 0, TAU); c.fill();
        c.restore();
      } else if (th.ambient === 'sand') {
        c.strokeStyle = 'rgba(255,230,180,' + (0.25 * a.s) + ')';
        c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + 26 * a.s, a.y); c.stroke();
      } else {
        var gl = 0.5 + 0.5 * Math.sin(a.p * 3 + a.r * 5);
        var rr = 10 * a.s;
        var g = c.createRadialGradient(a.x, a.y, 0, a.x, a.y, rr);
        g.addColorStop(0, 'rgba(230,255,150,' + (0.9 * gl) + ')'); g.addColorStop(1, 'rgba(180,255,120,0)');
        c.fillStyle = g;
        c.fillRect(a.x - rr, a.y - rr, rr * 2, rr * 2);
      }
    }
  }

  function drawTrail(c, trail, alpha) {
    if (!trail.length) return;
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 1;
    c.globalAlpha = alpha;
    for (var i = 0; i < trail.length; i++) {
      var p = trail[i];
      c.beginPath(); c.arc(p.x, p.y, 4.2 * p.s + 1, 0, TAU); c.fill(); c.stroke();
    }
    c.globalAlpha = 1;
  }

  var flashCache = {};
  function drawBlock(c, b) {
    var p = b.plugin;
    var frac = p.hp / p.maxHp;
    var lvl = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
    var key = 'blocks/' + p.mat + '_' + p.shape + '_' + lvl;
    var im = IMG[key];
    c.save();
    c.translate(b.position.x, b.position.y);
    c.rotate(b.angle);
    c.translate(-p.off.x, -p.off.y);
    if (im) c.drawImage(im, -p.w / 2, -p.h / 2, p.w, p.h);
    if (p.flash > 0 && im) {
      var fk = flashCache[key] || (flashCache[key] = tinted(im, '#ffffff'));
      c.globalAlpha = Math.min(0.6, p.flash * 4);
      c.drawImage(fk, -p.w / 2, -p.h / 2, p.w, p.h);
      c.globalAlpha = 1;
    }
    c.restore();
  }

  function pigAnim(b) {
    var s = G.pigState.get(b);
    if (!s) { s = { blink: 0, next: 1 + Math.random() * 3 }; G.pigState.set(b, s); }
    return s;
  }

  function currentBirdPos() {
    if (G.flying && G.flying.length) return G.flying[0].position;
    if (G.onSling) return { x: SL.x + (G.aim ? G.aim.dx : 0), y: SL.y + (G.aim ? G.aim.dy : 0) };
    return { x: SL.x, y: SL.y };
  }

  function drawPigBody(c, b, t) {
    var p = b.plugin, s = pigAnim(b);
    s.next -= 1 / 60;
    if (s.next <= 0) { s.blink = 1; s.next = 1.5 + Math.random() * 3.5; }
    s.blink = Math.max(0, s.blink - 0.12);
    var bp = currentBirdPos();
    var dx = bp.x - b.position.x, dy = bp.y - b.position.y, d = Math.hypot(dx, dy) || 1;
    // Gövde dönüşünü telafi ederek bakış
    var ca = Math.cos(-b.angle), sa = Math.sin(-b.angle);
    var lx = (dx / d) * ca - (dy / d) * sa, ly = (dx / d) * sa + (dy / d) * ca;
    var scared = G.flying && G.flying.length && d < 260;
    c.save();
    c.translate(b.position.x, b.position.y);
    c.rotate(b.angle);
    if (p.hurt > 0) c.scale(1 + p.hurt * 0.15, 1 - p.hurt * 0.15);
    Art.drawPig(c, p.type, p.r, { look: { x: lx, y: ly }, blink: s.blink, hp: p.hp / p.maxHp, t: t, seed: p.seed, scared: scared, hurt: p.hurt > 0.2, laugh: G.laughT > 0 && !scared });
    c.restore();
  }

  function drawQueue(c, t) {
    var q = G.queue;
    for (var i = 0; i < q.length; i++) {
      var qf = G.queueFx[i] || { y: 0, blink: 0, look: 0 };
      if (qf.gone) continue;
      var pos = queuePos(i), r = birdR(q[i]);
      c.save();
      c.translate(pos.x, -r + qf.y);
      var sq = qf.y < 0 ? 0 : 0;
      var lookX = Math.sin(qf.look * 0.7 + i) > 0.6 ? -0.6 : 1;
      if (lookX < 0) c.scale(-1, 1);
      Art.drawBird(c, q[i], r, { look: { x: 1, y: -0.2 }, blink: qf.blink, t: t });
      c.restore();
    }
  }

  function drawFlyingBird(c, b, t) {
    var p = b.plugin;
    var v = b.velocity, sp = Math.hypot(v.x, v.y);
    c.save();
    c.translate(b.position.x, b.position.y);
    var va = Math.atan2(v.y, v.x);
    var st = Math.min(0.16, sp * 0.006) * (p.hit ? 0.3 : 1);
    if (p.squash > 0) st = -p.squash * 0.22;
    c.rotate(va); c.scale(1 + st, 1 - st); c.rotate(-va);
    c.rotate(p.hit ? b.angle : va * 0.25);
    var flip = !p.hit && v.x < 0;
    if (flip) c.scale(-1, 1);
    Art.drawBird(c, p.type, p.r, {
      look: { x: 1, y: 0 }, mouth: !p.hit ? 1 : (p.hurt > 0 ? 0.6 : 0), hurt: p.hurt > 0.2, t: t, fuse: p.fuse > 0, blink: 0
    });
    c.restore();
  }

  // ---------------------------------------------------------------- Küçük resim (seviye kartı)
  function renderThumb(i, w, h) {
    var lv = LEVELS[i];
    var cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = h * 2;
    var cx = cv.getContext('2d');
    cx.setTransform(2, 0, 0, 2, 0, 0);
    var world = new World(Matter, lv, {});
    var z = h / 520;
    var vw = w / z;
    var cam = { x: (lv.right + 100) / 2 - vw / 2 + 60, y: -(h / z) * 0.86, z: z };
    var saved = { stars: G.stars, clouds: G.clouds, nearProps: G.nearProps, queue: G.queue, queueFx: G.queueFx, onSling: G.onSling, trail: G.trail, oldTrail: G.oldTrail, flying: G.flying };
    setupScenery(lv);
    G.queue = []; G.queueFx = []; G.onSling = null; G.trail = []; G.oldTrail = []; G.flying = [];
    renderScene(cx, { W: w, H: h, dpr: 2, cam: cam, world: world, theme: THEMES[lv.theme], level: lv, t: 3, live: false });
    for (var k in saved) G[k] = saved[k];
    return cv;
  }

  // ---------------------------------------------------------------- İlerleme
  var Progress = {
    data: {},
    load: function () { try { this.data = JSON.parse(localStorage.getItem('ok_progress') || '{}'); } catch (e) { this.data = {}; } },
    save: function (i, stars, score) {
      var d = this.data[i] || { stars: 0, best: 0 };
      d.stars = Math.max(d.stars, stars); d.best = Math.max(d.best, score);
      this.data[i] = d;
      try { localStorage.setItem('ok_progress', JSON.stringify(this.data)); } catch (e) {}
    },
    stars: function (i) { return (this.data[i] || {}).stars || 0; },
    best: function (i) { return (this.data[i] || {}).best || 0; },
    unlocked: function (i) { return i === 0 || this.stars(i - 1) > 0; }
  };
  Progress.load();

  // ---------------------------------------------------------------- Döngü
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      update(dt);
      render();
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'play' && !G.paused && G.phase !== 'won' && G.phase !== 'lost') UI.pause(true);
  });

  // ---------------------------------------------------------------- Dışa açık API
  window.Game = {
    boot: function () {
      Audio.init();
      var pImg = 0, pSnd = 0;
      function prog() { UI.loading(pImg * 0.7 + pSnd * 0.3); }
      return Promise.all([
        loadImages(function (p) { pImg = p; prog(); }),
        Audio.load(function (p) { pSnd = p; prog(); }),
        document.fonts && document.fonts.load ? document.fonts.load('40px "Lilita One"').catch(function () {}) : Promise.resolve()
      ]).then(function () {
        startLevel(0, { demo: true });
        requestAnimationFrame(frame);
      });
    },
    toMenu: function () {
      G.paused = false;
      startLevel(0, { demo: true });
      UI.hud(false);
    },
    play: function (i, quick) {
      G.paused = false; G.resultShown = false;
      startLevel(i, { quick: quick });
    },
    restart: function () { this.play(G.levelIndex, true); },
    next: function () { if (G.levelIndex < LEVELS.length - 1) this.play(G.levelIndex + 1); else this.toMenu(); },
    setPaused: function (p) { G.paused = p; if (p) { G.aim = null; } },
    thumb: renderThumb,
    progress: Progress,
    levels: LEVELS,
    drawBirdIcon: function (cv, type, look) {
      var c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      c.save(); c.translate(cv.width / 2, cv.height / 2);
      Art.drawBird(c, type, cv.width * 0.36, { look: look || { x: 0.8, y: 0 } });
      c.restore();
    }
  };
})();
