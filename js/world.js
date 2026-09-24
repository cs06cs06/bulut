/* Fizik dünyası: Matter.js kurulum, hasar modeli, patlamalar, kuş yetenekleri.
 * DOM'a bağımlı değildir; Node'da test edilebilir.
 */
(function (root) {
  var SCALE = 0.6; // Kenney 70px -> 42 birim
  var GRAVITY_STEP = 0.001 * (1000 / 60) * (1000 / 60); // Matter: adım başına ivme

  var SHAPES = {
    s70: [70, 70], r140x70: [140, 70], r220x70: [220, 70],
    r70x140: [70, 140], r140x140: [140, 140], r220x140: [220, 140],
    r70x220: [70, 220], r140x220: [140, 220],
    circle: [70, 70], tri: [140, 70]
  };

  var MATERIALS = {
    wood:  { density: 0.0012, friction: 0.8, restitution: 0.05, hp: 42,  score: 500 },
    stone: { density: 0.0028, friction: 0.9, restitution: 0.02, hp: 115, score: 800 },
    glass: { density: 0.0011, friction: 0.5, restitution: 0.05, hp: 22,  score: 300 },
    tnt:   { density: 0.0012, friction: 0.8, restitution: 0.05, hp: 18,  score: 500 }
  };

  var PIGS = {
    small:  { r: 16, hp: 9, score: 5000 },
    medium: { r: 22, hp: 13, score: 5000 },
    helmet: { r: 22, hp: 42, score: 7000 },
    king:   { r: 30, hp: 70, score: 10000 }
  };

  var BIRDS = {
    red:    { r: 19, density: 0.005 },
    yellow: { r: 19, density: 0.005 },
    blue:   { r: 13, density: 0.006 },
    black:  { r: 23, density: 0.0062 }
  };

  var SLING = { x: 0, y: -112, maxPull: 95, power: 0.235 };
  var DMG_THRESHOLD = 2.2;

  function World(Matter, level, hooks) {
    this.M = Matter;
    this.level = level;
    this.hooks = hooks || {};
    this.time = 0;
    this.armed = false; // hasar sistemi (kurulum oturması için gecikmeli)
    this.blocks = [];
    this.pigs = [];
    this.birds = [];
    this.removed = [];
    var E = Matter.Engine;
    this.engine = E.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    this.engine.gravity.y = 1;
    this.build();
    var self = this;
    Matter.Events.on(this.engine, 'collisionStart', function (e) { self.onCollisions(e.pairs); });
  }

  World.prototype.add = function (b) { this.M.Composite.add(this.engine.world, b); };

  World.prototype.build = function () {
    var M = this.M, B = M.Bodies, lv = this.level;
    var ground = B.rectangle(1000, 250, 12000, 500, { isStatic: true, friction: 1, label: 'ground' });
    ground.plugin = { kind: 'ground' };
    this.add(ground);
    this.ground = ground;
    var wallL = B.rectangle(-900, -1500, 100, 4000, { isStatic: true });
    wallL.plugin = { kind: 'wall' };
    var wallR = B.rectangle(lv.right + 1400, -1500, 100, 4000, { isStatic: true });
    wallR.plugin = { kind: 'wall' };
    this.add([wallL, wallR]);

    var i;
    for (i = 0; i < lv.blocks.length; i++) this.addBlock(lv.blocks[i]);
    for (i = 0; i < lv.pigs.length; i++) this.addPig(lv.pigs[i]);
    // Başlangıçta her şeyi uyut: yapı ilk temasa kadar sabit kalır.
    var all = this.blocks.concat(this.pigs);
    for (i = 0; i < all.length; i++) M.Sleeping.set(all[i], true);
  };

  World.prototype.addBlock = function (d) {
    var M = this.M, B = M.Bodies;
    var sz = SHAPES[d.s], w = sz[0] * SCALE, h = sz[1] * SCALE;
    var mat = MATERIALS[d.m];
    var x = d.x, y = -(d.b + h / 2);
    var opts = { density: mat.density, friction: mat.friction, frictionStatic: 1.2, restitution: mat.restitution, slop: 0.02, sleepThreshold: 50 };
    var body, off = { x: 0, y: 0 };
    if (d.s === 'circle') {
      body = B.circle(x, y, w / 2, opts);
    } else if (d.s === 'tri') {
      var verts = [{ x: -w / 2, y: h / 2 }, { x: w / 2, y: h / 2 }, { x: 0, y: -h / 2 }];
      body = B.fromVertices(x, y + h / 6, [verts], opts);
      off = { x: 0, y: h / 6 }; // sprite merkezi = gövde merkezi - off
    } else {
      body = B.rectangle(x, y, w, h, opts);
    }
    body.plugin = { kind: 'block', mat: d.m, shape: d.s, w: w, h: h, off: off, hp: mat.hp, maxHp: mat.hp, flash: 0, id: this.blocks.length };
    this.blocks.push(body);
    this.add(body);
    return body;
  };

  World.prototype.addPig = function (d) {
    var p = PIGS[d.t];
    var body = this.M.Bodies.circle(d.x, -(d.b + p.r), p.r, {
      density: 0.0012, friction: 0.9, frictionStatic: 1.5, restitution: 0.1, frictionAir: 0.004, slop: 0.02, sleepThreshold: 50
    });
    body.plugin = { kind: 'pig', type: d.t, r: p.r, hp: p.hp, maxHp: p.hp, hurt: 0, blink: Math.random() * 3, seed: Math.random() };
    this.pigs.push(body);
    this.add(body);
    return body;
  };

  World.prototype.spawnBird = function (type, x, y) {
    var d = BIRDS[type];
    var body = this.M.Bodies.circle(x, y, d.r, {
      density: d.density, friction: 0.6, frictionStatic: 0.8, restitution: 0.32, frictionAir: 0, slop: 0.02
    });
    body.plugin = { kind: 'bird', type: type, r: d.r, launched: false, hit: false, ability: true, age: 0, still: 0, fuse: -1, trail: [], lastTrail: null, squash: 0, hurt: 0 };
    body.sleepThreshold = 1e9;
    return body;
  };

  World.prototype.launch = function (body, vx, vy) {
    this.add(body);
    this.M.Body.setVelocity(body, { x: vx, y: vy });
    body.plugin.launched = true;
    this.birds.push(body);
  };

  // Fırlatma hızının hesaplanması (sapan ofsetinden)
  World.launchVelocity = function (dx, dy) {
    return { x: -dx * SLING.power, y: -dy * SLING.power };
  };

  // Yörünge önizlemesi (Matter entegrasyonunu taklit eder)
  World.predict = function (x, y, vx, vy, steps, every) {
    var pts = [];
    for (var i = 1; i <= steps; i++) {
      vy += GRAVITY_STEP;
      x += vx; y += vy;
      if (i % every === 0) pts.push({ x: x, y: y });
      if (y > 0) break;
    }
    return pts;
  };

  World.prototype.onCollisions = function (pairs) {
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      var a = pair.bodyA.parent, b = pair.bodyB.parent;
      var pa = a.plugin || {}, pb = b.plugin || {};
      var n = pair.collision.normal;
      var rvx = a.velocity.x - b.velocity.x, rvy = a.velocity.y - b.velocity.y;
      var vn = Math.abs(rvx * n.x + rvy * n.y);
      var ma = a.isStatic ? Infinity : a.mass, mb = b.isStatic ? Infinity : b.mass;
      var mu = ma === Infinity ? mb : mb === Infinity ? ma : (ma * mb) / (ma + mb);
      var energy = 0.5 * mu * vn * vn;

      if (pa.kind === 'bird') this.birdHit(a, b, vn);
      if (pb.kind === 'bird') this.birdHit(b, a, vn);

      if (this.hooks.impact && vn > 1.2) {
        var sup = pair.collision.supports && pair.collision.supports[0];
        var px = sup ? sup.x : (a.position.x + b.position.x) / 2;
        var py = sup ? sup.y : (a.position.y + b.position.y) / 2;
        this.hooks.impact(a, b, vn, px, py);
      }
      if (!this.armed) continue;
      var bonus = (pa.kind === 'bird' || pb.kind === 'bird') ? 1.35 : 1;
      if (pa.kind === 'block' || pa.kind === 'pig') this.damage(a, (energy / a.mass) * bonus);
      if (pb.kind === 'block' || pb.kind === 'pig') this.damage(b, (energy / b.mass) * bonus);
    }
  };

  World.prototype.birdHit = function (bird, other, vn) {
    var p = bird.plugin;
    if (!p.hit) {
      p.hit = true;
      bird.frictionAir = 0.012;
      if (p.type === 'black' && p.fuse < 0) p.fuse = 1.6;
      if (p.type !== 'black') p.ability = false;
    }
    p.squash = Math.min(1, vn / 14);
    if (vn > 3) p.hurt = 0.6;
  };

  World.prototype.damage = function (body, dmg) {
    var p = body.plugin;
    if (!p || p.dead || dmg < DMG_THRESHOLD) return;
    p.hp -= dmg;
    if (p.kind === 'pig') p.hurt = 0.5;
    else p.flash = 0.15;
    if (this.hooks.damaged) this.hooks.damaged(body, dmg);
    if (p.hp <= 0) this.kill(body);
  };

  World.prototype.kill = function (body) {
    var p = body.plugin;
    if (p.dead) return;
    p.dead = true;
    this.removed.push(body);
    if (p.kind === 'block' && p.mat === 'tnt') {
      var self = this, pos = { x: body.position.x, y: body.position.y };
      this.pendingExplosions = this.pendingExplosions || [];
      this.pendingExplosions.push({ x: pos.x, y: pos.y, r: 150, power: 1, delay: 0.05, src: 'tnt' });
    }
  };

  World.prototype.explode = function (x, y, radius, power) {
    var M = this.M;
    var list = this.blocks.concat(this.pigs, this.birds);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.plugin.dead) continue;
      var dx = b.position.x - x, dy = b.position.y - y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > radius) continue;
      var f = 1 - d / radius;
      M.Sleeping.set(b, false);
      var kick = (f * 15 * power) / Math.max(1, Math.sqrt(b.mass / 3));
      M.Body.setVelocity(b, { x: b.velocity.x + (dx / d) * kick, y: b.velocity.y + (dy / d) * kick - f * 3 * power });
      M.Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.3 * f);
      if (b.plugin.kind !== 'bird' && this.armed) this.damage(b, f * 130 * power + 4);
    }
    if (this.hooks.explosion) this.hooks.explosion(x, y, radius, power);
  };

  // Yetenek: dokunulduğunda
  World.prototype.activate = function (bird) {
    var M = this.M, p = bird.plugin;
    if (!p.ability || !p.launched) return false;
    var v = bird.velocity;
    if (p.type === 'yellow' && !p.hit) {
      var sp = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
      var ns = Math.min(34, sp * 2.3 + 4);
      M.Body.setVelocity(bird, { x: (v.x / sp) * ns, y: (v.y / sp) * ns });
      p.ability = false; p.boosted = 0.6;
      return 'boost';
    }
    if (p.type === 'blue' && !p.hit) {
      p.ability = false;
      var ang = Math.atan2(v.y, v.x), spd = Math.sqrt(v.x * v.x + v.y * v.y);
      var kids = [];
      for (var k = -1; k <= 1; k += 2) {
        var a2 = ang + k * 0.2;
        var nb = this.spawnBird('blue', bird.position.x - Math.sin(ang) * k * 16, bird.position.y + Math.cos(ang) * k * 16);
        nb.plugin.ability = false; nb.plugin.clone = true;
        this.launch(nb, Math.cos(a2) * spd, Math.sin(a2) * spd);
        kids.push(nb);
      }
      return { split: kids };
    }
    if (p.type === 'black') {
      p.ability = false;
      this.detonateBird(bird);
      return 'bomb';
    }
    return false;
  };

  World.prototype.detonateBird = function (bird) {
    var p = bird.plugin;
    if (p.exploded) return;
    p.exploded = true; p.dead = true;
    this.removed.push(bird);
    this.explode(bird.position.x, bird.position.y, 175, 1.25);
  };

  World.prototype.removeBody = function (b) {
    this.M.Composite.remove(this.engine.world, b);
    var arr = b.plugin.kind === 'block' ? this.blocks : b.plugin.kind === 'pig' ? this.pigs : this.birds;
    var i = arr.indexOf(b);
    if (i >= 0) arr.splice(i, 1);
  };

  World.prototype.step = function (dt) {
    // dt: saniye (sabit 1/60)
    this.time += dt;
    if (!this.armed && this.time > 0.6) this.armed = true;
    this.M.Engine.update(this.engine, 1000 / 60);
    var i;
    for (i = 0; i < this.birds.length; i++) {
      var b = this.birds[i], p = b.plugin;
      p.age += dt;
      if (p.fuse > 0) { p.fuse -= dt; if (p.fuse <= 0) this.detonateBird(b); }
      var sp = b.speed;
      if (p.hit && sp < 0.35) p.still += dt; else p.still = 0;
      if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 3);
      if (p.hurt > 0) p.hurt -= dt;
      if (p.boosted > 0) p.boosted -= dt;
    }
    for (i = 0; i < this.pigs.length; i++) {
      var pp = this.pigs[i].plugin;
      if (pp.hurt > 0) pp.hurt -= dt;
      // Harita dışına düşen domuzlar
      if (this.pigs[i].position.y > 60 || Math.abs(this.pigs[i].position.x) > 5000) this.kill(this.pigs[i]);
    }
    for (i = 0; i < this.blocks.length; i++) {
      var bp = this.blocks[i].plugin;
      if (bp.flash > 0) bp.flash -= dt;
    }
    if (this.pendingExplosions) {
      var rest = [];
      for (i = 0; i < this.pendingExplosions.length; i++) {
        var ex = this.pendingExplosions[i];
        ex.delay -= dt;
        if (ex.delay <= 0) this.explode(ex.x, ex.y, ex.r, ex.power); else rest.push(ex);
      }
      this.pendingExplosions = rest.length ? rest : null;
    }
    var out = this.removed;
    this.removed = [];
    for (i = 0; i < out.length; i++) {
      this.removeBody(out[i]);
      if (this.hooks.killed) this.hooks.killed(out[i]);
    }
  };

  // Tüm dinamik cisimler durdu mu?
  World.prototype.settled = function () {
    var list = this.blocks.concat(this.pigs);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b.isSleeping && b.speed > 0.22) return false;
    }
    return !this.pendingExplosions;
  };

  World.SCALE = SCALE;
  World.SHAPES = SHAPES;
  World.MATERIALS = MATERIALS;
  World.PIGS = PIGS;
  World.BIRDS = BIRDS;
  World.SLING = SLING;
  World.GRAVITY_STEP = GRAVITY_STEP;

  root.World = World;
  if (typeof module !== 'undefined') module.exports = World;
})(typeof window !== 'undefined' ? window : globalThis);
