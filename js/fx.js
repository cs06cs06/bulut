/* Parçacık sistemi: Kenney partikül dokuları (renklendirilmiş), tüyler, enkaz, puan yazıları. */
(function (root) {
  var TAU = Math.PI * 2;
  var tintCache = {};

  function tinted(img, color) {
    var key = img.src + '|' + color;
    if (tintCache[key]) return tintCache[key];
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    // Hafif doku kontrastı için orijinali çarp
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.25;
    g.drawImage(img, 0, 0);
    tintCache[key] = c;
    return c;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function FX(images) {
    this.img = images;
    this.list = [];     // dünya uzayı
    this.texts = [];    // puan yazıları
    this.shake = 0;
    this.flash = 0;
  }

  FX.prototype.tex = function (name, color) {
    var im = this.img['fx/' + name];
    if (!im) return null;
    return color ? tinted(im, color) : im;
  };

  FX.prototype.add = function (p) {
    p.life = 0;
    p.rot = p.rot || 0;
    p.vr = p.vr || 0;
    p.alpha = p.alpha == null ? 1 : p.alpha;
    p.g = p.g || 0;
    p.drag = p.drag == null ? 0.985 : p.drag;
    p.size1 = p.size1 == null ? p.size0 : p.size1;
    this.list.push(p);
    if (this.list.length > 900) this.list.shift();
    return p;
  };

  FX.prototype.smoke = function (x, y, n, color, size, spread, up) {
    var names = ['smoke_01', 'smoke_04', 'smoke_07', 'smoke_10'];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = rand(0.2, 1) * (spread || 1.5);
      this.add({
        tex: this.tex(names[i % 4], color || '#f3eadb'), x: x + rand(-6, 6), y: y + rand(-6, 6),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - (up || 0.4), rot: Math.random() * TAU, vr: rand(-0.04, 0.04),
        size0: (size || 30) * rand(0.6, 1), size1: (size || 30) * rand(1.6, 2.4), max: rand(0.7, 1.3), alpha: 0.85, drag: 0.94, fade: 'out'
      });
    }
  };

  FX.prototype.dust = function (x, y, strength, color) {
    var n = Math.min(8, 2 + Math.floor(strength / 3));
    for (var i = 0; i < n; i++) {
      var dir = i % 2 ? 1 : -1;
      this.add({
        tex: this.tex(i % 2 ? 'smoke_04' : 'smoke_07', color || '#e8dcc2'), x: x, y: y,
        vx: dir * rand(0.5, 2.2), vy: rand(-1.2, -0.2), rot: Math.random() * TAU, vr: rand(-0.05, 0.05),
        size0: rand(8, 14), size1: rand(26, 40), max: rand(0.5, 0.9), alpha: 0.6, drag: 0.93, fade: 'out'
      });
    }
  };

  FX.prototype.sparkles = function (x, y, n, color, spd) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = rand(1.5, spd || 5);
      this.add({
        tex: this.tex(i % 2 ? 'star_06' : 'star_07', color || '#fff6b0'), x: x, y: y, add: true,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, rot: Math.random() * TAU, vr: rand(-0.2, 0.2),
        size0: rand(10, 20), size1: 2, max: rand(0.4, 0.8), g: 0.12, drag: 0.95, fade: 'out'
      });
    }
  };

  FX.prototype.feathers = function (x, y, color, n, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = rand(1, 4) * (power || 1);
      this.add({
        feather: color, x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
        rot: Math.random() * TAU, vr: rand(-0.2, 0.2), size0: rand(4, 7), max: rand(1.4, 2.4), g: 0.03, drag: 0.93, fade: 'late', sway: rand(0, TAU)
      });
    }
  };

  FX.prototype.debris = function (x, y, mat, n, w, h, vx, vy) {
    var names = { wood: 'debrisWood_', stone: 'debrisStone_', glass: 'debrisGlass_', tnt: 'debrisStone_' };
    var base = names[mat] || 'debrisWood_';
    for (var i = 0; i < n; i++) {
      var im = this.img['debris/' + base + (1 + (i % 3))];
      var a = Math.random() * TAU, s = rand(1, 5);
      this.add({
        tex: im, x: x + rand(-w / 2, w / 2) * 0.7, y: y + rand(-h / 2, h / 2) * 0.7,
        vx: (vx || 0) * 0.4 + Math.cos(a) * s, vy: (vy || 0) * 0.4 + Math.sin(a) * s - 2.5,
        rot: Math.random() * TAU, vr: rand(-0.3, 0.3), size0: rand(10, 22), size1: null, max: rand(1.2, 2), g: 0.28, drag: 0.99, fade: 'late', bounce: true
      });
    }
    if (mat === 'glass') this.sparkles(x, y, 6, '#e8fbff', 4);
  };

  FX.prototype.explosion = function (x, y, radius) {
    var k = radius / 150;
    this.add({ tex: this.tex('light_02', '#fff1c0'), x: x, y: y, add: true, size0: 60 * k, size1: 420 * k, max: 0.35, fade: 'out', alpha: 1 });
    this.add({ tex: this.tex('circle_05', '#ffe7a8'), x: x, y: y, add: true, size0: 40 * k, size1: radius * 2.6, max: 0.45, fade: 'out', alpha: 0.9 });
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * TAU, s = rand(1, 6) * k;
      this.add({
        tex: this.tex(i % 2 ? 'fire_01' : 'flame_03', i % 3 ? '#ff9a2a' : '#ffd24a'), x: x, y: y, add: true,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, rot: Math.random() * TAU, vr: rand(-0.1, 0.1),
        size0: rand(40, 70) * k, size1: rand(90, 140) * k, max: rand(0.35, 0.6), drag: 0.9, fade: 'out'
      });
    }
    this.smoke(x, y, 14, '#4a4038', 50 * k, 4 * k, 0.8);
    this.smoke(x, y, 8, '#8a7a6a', 40 * k, 2.5 * k, 1);
    for (i = 0; i < 20; i++) {
      var b = Math.random() * TAU, sp = rand(5, 14) * k;
      this.add({
        tex: this.tex('spark_05', '#ffe08a'), x: x, y: y, add: true, stretch: true,
        vx: Math.cos(b) * sp, vy: Math.sin(b) * sp, size0: rand(16, 28), size1: 4, max: rand(0.3, 0.6), g: 0.25, drag: 0.96, fade: 'out'
      });
    }
    this.shake = Math.max(this.shake, 16 * k);
    this.flash = Math.max(this.flash, 0.35);
  };

  FX.prototype.poof = function (x, y, size, color) {
    this.add({ tex: this.tex('circle_05', '#ffffff'), x: x, y: y, add: true, size0: size, size1: size * 3.5, max: 0.35, fade: 'out', alpha: 0.8 });
    this.smoke(x, y, 10, color || '#e9f7d4', size * 0.9, 2.5, 0.6);
    this.sparkles(x, y, 8, '#fff6b0', 5);
  };

  FX.prototype.ring = function (x, y, size, color) {
    this.add({ tex: this.tex('circle_05', color || '#ffffff'), x: x, y: y, add: true, size0: size * 0.5, size1: size * 3, max: 0.35, fade: 'out', alpha: 0.9 });
  };

  FX.prototype.speedLines = function (x, y, vx, vy) {
    var a = Math.atan2(vy, vx);
    for (var i = 0; i < 2; i++) {
      this.add({
        tex: this.tex('trace_01', '#fff8d0'), x: x - Math.cos(a) * 10 + rand(-12, 12), y: y - Math.sin(a) * 10 + rand(-12, 12), add: true,
        rot: a + Math.PI / 2, size0: rand(30, 50), size1: 10, max: 0.25, fade: 'out', alpha: 0.8, vx: vx * 0.2, vy: vy * 0.2
      });
    }
  };

  FX.prototype.score = function (x, y, value, color, big) {
    this.texts.push({ x: x, y: y, text: String(value), color: color || '#ffffff', life: 0, max: 1.4, big: !!big });
  };

  FX.prototype.update = function (dt) {
    var k = dt * 60;
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) { this.list.splice(i, 1); continue; }
      p.vy += p.g * k;
      var dr = Math.pow(p.drag, k);
      p.vx *= dr; p.vy *= dr;
      if (p.feather) {
        p.sway += dt * 5;
        p.vx += Math.cos(p.sway) * 0.06 * k;
        p.vy = Math.min(p.vy, 0.9);
      }
      p.x += p.vx * k; p.y += p.vy * k;
      p.rot += p.vr * k;
      if (p.bounce && p.y > -3) { p.y = -3; p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.5; }
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      var t = this.texts[i];
      t.life += dt;
      if (t.life > t.max) this.texts.splice(i, 1);
    }
    this.shake *= Math.pow(0.02, dt);
    if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 1.2);
  };

  FX.prototype.draw = function (ctx) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      var u = p.life / p.max;
      var a = p.alpha;
      if (p.fade === 'out') a *= 1 - u * u;
      else if (p.fade === 'late') a *= u > 0.7 ? (1 - u) / 0.3 : 1;
      if (a <= 0.01) continue;
      var size = p.size0 + (p.size1 - p.size0) * (1 - Math.pow(1 - u, 2));
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.feather) {
        ctx.rotate(p.rot);
        Art.drawFeather(ctx, p.feather, size);
      } else if (p.tex) {
        if (p.stretch) {
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.drawImage(p.tex, -size, -size * 0.25, size * 2, size * 0.5);
        } else {
          ctx.rotate(p.rot);
          var tw = p.tex.width, th = p.tex.height, sc = size / Math.max(tw, th) * 2;
          ctx.drawImage(p.tex, -tw * sc / 2, -th * sc / 2, tw * sc, th * sc);
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  FX.prototype.drawTexts = function (ctx, zoom) {
    for (var i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      var u = t.life / t.max;
      var pop = u < 0.15 ? 0.5 + (u / 0.15) * 0.7 : u < 0.25 ? 1.2 - (u - 0.15) * 2 : 1;
      var a = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
      var fs = (t.big ? 34 : 24) / Math.max(0.6, zoom);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(t.x, t.y - u * 40);
      ctx.scale(pop, pop);
      ctx.font = fs + 'px "Lilita One", "Arial Black", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(20,20,30,0.9)';
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  root.FX = FX;
  root.tinted = tinted;
})(window);
