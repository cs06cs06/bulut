// Oyuncu karakteri: kontroller, fizik ve görünüm (iskeletli Meshy modeli ya da yer tutucu).
import * as THREE from 'three';
import { PHYSICS as P, PLAYER_SIZE, BIG_SCALE } from './config.js';
import { moveBody } from './physics.js';
import { Animator } from './animator.js';
import { T } from './level.js';

const FACE_RIGHT = Math.PI / 2 - 0.35;
const FACE_LEFT = -Math.PI / 2 + 0.35;
const GROW_PATTERN = [0, 0.5, 0, 0.5, 1, 0, 0.5, 1, 0.5, 1]; // 0=küçük, 1=büyük

function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export class Player {
  constructor(game) {
    this.game = game;
    const inst = game.assets.instance('player');
    this.root = new THREE.Group();
    this.model = inst.object;
    this.root.add(this.model);
    this.animator = inst.clips.length ? new Animator(this.model, inst.clips) : null;
    if (this.animator?.empty) this.animator = null;
    this.parts = {};
    for (const n of ['legL', 'legR', 'armL', 'armR', 'upper']) this.parts[n] = this.model.getObjectByName(n);
    this.procedural = !this.animator && !!this.parts.legL;

    // Nazar parıltısı için malzemeleri kopyala (paylaşılan malzemeler etkilenmesin)
    this.materials = [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      const clone = (m) => {
        const c = m.clone();
        if (c.emissive) this.materials.push({ m: c, color: c.emissive.clone(), intensity: c.emissiveIntensity });
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
    });

    this.body = { x: 0, y: 0, w: PLAYER_SIZE.small.w, h: PLAYER_SIZE.small.h, vx: 0, vy: 0 };
    this.time = 0;
    this.phase = 0;
    this.reset(0, 0, false);
  }

  reset(x, y, big) {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.vx = b.vy = 0;
    b.dropThrough = false;
    this.big = big;
    this.#applySize();
    this.sizeScale = big ? BIG_SCALE : 1;
    this.facing = 1;
    this.onGround = true;
    this.prevY = y;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumpHeld = false;
    this.invuln = 0;
    this.nazar = 0;
    this.stompChain = 0;
    this.skidding = false;
    this.dead = false;
    this.deathT = 0;
    this.forcedAnim = null;
    this.squash = 1;
    this.dropTimer = 0;
    this.hidden = false;
    this.root.visible = true;
    this.model.rotation.y = FACE_RIGHT;
    this.#setTint(0);
  }

  #applySize() {
    const s = this.big ? PLAYER_SIZE.big : PLAYER_SIZE.small;
    this.body.w = s.w;
    this.body.h = s.h;
  }

  setBig(big) {
    this.big = big;
    this.#applySize();
    this.growT = 0;
    this.growFrom = big ? 1 : BIG_SCALE;
    this.growTo = big ? BIG_SCALE : 1;
  }

  // Büyüme/küçülme titreşimi; bitince true döner
  growTick(dt) {
    this.growT += dt;
    const i = Math.min(GROW_PATTERN.length - 1, Math.floor(this.growT / 0.08));
    const k = GROW_PATTERN[i];
    this.sizeScale = this.growFrom + (this.growTo - this.growFrom) * k;
    if (this.growT >= GROW_PATTERN.length * 0.08) {
      this.sizeScale = this.growTo;
      return true;
    }
    return false;
  }

  update(dt, input, level) {
    const b = this.body;
    const dir = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const running = input.isDown('run');
    const maxV = running ? P.runMax : P.walkMax;

    if (dir !== 0) {
      const reversing = Math.sign(b.vx) === -dir && Math.abs(b.vx) > 0.5;
      const accel = !this.onGround ? P.accelAir : reversing ? P.skid : running ? P.accelRun : P.accelWalk;
      if (Math.abs(b.vx) <= maxV || reversing) {
        b.vx += dir * accel * dt;
        if (Math.sign(b.vx) === dir && Math.abs(b.vx) > maxV) b.vx = dir * maxV;
      } else {
        // Koşma tuşu bırakıldı: yürüme hızına yavaşça in
        b.vx = dir * Math.max(maxV, Math.abs(b.vx) - P.friction * dt);
      }
      this.facing = dir;
      this.skidding = this.onGround && reversing && Math.abs(b.vx) > 2;
    } else {
      const f = (this.onGround ? P.friction : P.friction * 0.35) * dt;
      b.vx = Math.abs(b.vx) <= f ? 0 : b.vx - Math.sign(b.vx) * f;
      this.skidding = false;
    }

    // Zıplama: tampon + coyote süresi
    if (input.take('jump')) this.jumpBuf = P.jumpBuffer;
    else this.jumpBuf -= dt;
    this.coyote = this.onGround ? P.coyoteTime : this.coyote - dt;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      b.vy = P.jumpSpeed + P.jumpRunBonus * Math.min(1, Math.abs(b.vx) / P.runMax);
      this.jumpHeld = true;
      this.jumpBuf = 0;
      this.coyote = 0;
      this.onGround = false;
      this.squash = 1.2;
      this.game.sound.play(this.big ? 'jumpBig' : 'jump');
    }
    if (!input.isDown('jump')) this.jumpHeld = false;

    // Aşağı: bulut platformundan in
    if (input.isDown('down') && this.onGround && level.get(Math.floor(b.x), Math.floor(b.y - 0.1)) === T.PLATFORM) {
      this.dropTimer = 0.25;
    }
    this.dropTimer -= dt;
    b.dropThrough = this.dropTimer > 0;

    const g = b.vy > 0 && this.jumpHeld ? P.gravityHold : P.gravity;
    b.vy = Math.max(b.vy - g * dt, -P.maxFall);

    this.prevY = b.y;
    const res = moveBody(b, level, dt, { corner: true });
    if (res.ceiling) {
      this.jumpHeld = false;
      this.game.hitBlock(res.ceiling.tx, res.ceiling.ty);
    }
    if (!this.onGround && res.onGround) {
      this.squash = 0.8;
      this.stompChain = 0;
    }
    this.onGround = res.onGround;

    if (this.invuln > 0) this.invuln -= dt;
    if (this.nazar > 0) {
      this.nazar -= dt;
      if (this.nazar <= 0) this.game.onNazarEnd();
    }
  }

  // Bölüm sonu gibi otomatik yürüme sahneleri için
  autoWalk(dt, level, speed) {
    const b = this.body;
    b.vx = speed;
    b.vy = Math.max(b.vy - P.gravity * dt, -P.maxFall);
    this.facing = Math.sign(speed) || this.facing;
    const res = moveBody(b, level, dt);
    this.onGround = res.onGround;
  }

  // Çukura düşünce karakter görünmez kalır; düşmana çarpınca klasik zıplayıp düşme
  die(pit = false) {
    this.dead = true;
    this.deathT = 0;
    this.launched = pit;
    this.body.vx = 0;
    this.body.vy = 0;
    this.invuln = 0;
    this.nazar = 0;
    this.#setTint(0);
    if (pit) this.hide();
  }

  updateDeath(dt) {
    this.deathT += dt;
    const b = this.body;
    if (this.deathT > 0.45 && !this.launched) {
      this.launched = true;
      b.vy = 15;
    }
    if (this.launched) {
      b.vy -= 42 * dt;
      b.y += b.vy * dt;
    }
  }

  #setTint(k) {
    for (const { m, color, intensity } of this.materials) {
      if (k > 0) {
        m.emissive.setHSL((this.time * 2.5) % 1, 1, 0.5);
        m.emissiveIntensity = 0.55 * k;
      } else {
        m.emissive.copy(color);
        m.emissiveIntensity = intensity;
      }
    }
  }

  #state() {
    const b = this.body;
    if (this.dead) return 'dead';
    if (this.forcedAnim) return this.forcedAnim;
    if (!this.onGround) return b.vy > 0 ? 'jump' : 'fall';
    if (this.skidding) return 'skid';
    const s = Math.abs(b.vx);
    if (s > P.walkMax + 0.6) return 'run';
    if (s > 0.25) return 'walk';
    return 'idle';
  }

  // Görsel güncelleme (her karede)
  animate(dt) {
    this.time += dt;
    const b = this.body;
    const st = this.#state();

    this.root.position.set(b.x, b.y, 0);
    const targetRot = st === 'dead' ? 0 : st === 'slide' ? FACE_RIGHT + 0.5 : this.facing > 0 ? FACE_RIGHT : FACE_LEFT;
    this.model.rotation.y = dampAngle(this.model.rotation.y, targetRot, 16, dt);

    this.squash = THREE.MathUtils.damp(this.squash, 1, 10, dt);
    const sx = 1 + (1 - this.squash) * 0.5;
    const s = this.sizeScale;
    this.model.scale.set(s * sx, s * this.squash, s * sx);

    this.root.visible = !this.hidden && (this.invuln <= 0 || this.dead || Math.floor(this.time * 18) % 2 === 0);
    this.#setTint(this.nazar > 0 ? Math.min(1, this.nazar) : 0);

    if (this.animator) this.#animateRig(st, dt);
    else if (this.procedural) this.#animateParts(st, dt);
    else this.#animateWhole(st, dt);
  }

  // İskeletsiz model (ör. rigging başarısız olduysa): bütün gövdeyle zıplayarak yürü
  #animateWhole(st, dt) {
    const m = this.model;
    let bob = 0;
    let tilt = 0;
    if (st === 'walk' || st === 'run') {
      this.phase += dt * (6 + Math.abs(this.body.vx) * 1.4);
      bob = Math.abs(Math.sin(this.phase)) * 0.07 * this.sizeScale;
      tilt = Math.sin(this.phase) * 0.09;
    } else if (st === 'jump' || st === 'fall') tilt = -0.12;
    m.position.y = THREE.MathUtils.damp(m.position.y, bob, 20, dt);
    m.rotation.z = THREE.MathUtils.damp(m.rotation.z, tilt, 14, dt);
  }

  hide() {
    this.hidden = true;
    this.root.visible = false;
  }

  show() {
    this.hidden = false;
    this.root.visible = true;
  }

  #animateRig(st, dt) {
    const a = this.animator;
    const speed = Math.abs(this.body.vx);
    switch (st) {
      case 'walk':
        a.play('walk', { timeScale: THREE.MathUtils.clamp(speed / 4, 0.6, 1.6) }) || a.play('run', { timeScale: 0.6 });
        break;
      case 'run':
        a.play('run', { timeScale: THREE.MathUtils.clamp(speed / 8, 0.8, 1.4) }) || a.play('walk', { timeScale: 1.8 });
        break;
      case 'jump':
        a.play('jump', { loop: false, startAt: 0.2, fade: 0.08 }) || a.play('idle');
        break;
      case 'fall':
        if (a.currentName !== 'jump') a.play('jump', { loop: false, startAt: 0.5, fade: 0.1 }) || a.play('idle');
        break;
      case 'victory':
        a.play('victory') || a.play('idle');
        break;
      case 'dead':
        a.play('idle', { timeScale: 0 });
        break;
      default:
        a.play('idle') || a.play('walk', { timeScale: 0 });
    }
    a.update(dt);
  }

  #animateParts(st, dt) {
    const { legL, legR, armL, armR, upper } = this.parts;
    const speed = Math.abs(this.body.vx);
    let lL = 0,
      lR = 0,
      aL = 0,
      aR = 0,
      lean = 0,
      bob = 0;
    const t = this.time;
    if (st === 'walk' || st === 'run') {
      this.phase += dt * (4 + speed * 1.7);
      const amp = st === 'run' ? 0.95 : 0.7;
      const sw = Math.sin(this.phase);
      lL = sw * amp;
      lR = -sw * amp;
      aL = -sw * amp * 0.8;
      aR = sw * amp * 0.8;
      bob = Math.abs(Math.cos(this.phase)) * 0.035;
      lean = st === 'run' ? 0.12 : 0.05;
    } else if (st === 'jump' || st === 'fall') {
      lL = -0.7;
      lR = 0.45;
      aL = 0.4;
      aR = -2.7;
    } else if (st === 'skid') {
      lL = 0.5;
      lR = 0.3;
      aL = -0.8;
      aR = -0.6;
      lean = -0.2;
    } else if (st === 'slide') {
      lL = -0.4;
      lR = -0.2;
      aL = -2.9;
      aR = -2.6;
    } else if (st === 'victory') {
      const w = Math.sin(t * 10) * 0.3;
      aL = -2.8 + w;
      aR = -2.8 - w;
      bob = Math.abs(Math.sin(t * 5)) * 0.08;
    } else if (st === 'dead') {
      aL = -2.9;
      aR = -2.9;
      lL = 0.3;
      lR = -0.3;
    } else {
      bob = Math.sin(t * 2.2) * 0.008;
      aL = Math.sin(t * 2.2) * 0.05;
      aR = -aL;
    }
    const k = 22;
    legL.rotation.x = THREE.MathUtils.damp(legL.rotation.x, lL, k, dt);
    legR.rotation.x = THREE.MathUtils.damp(legR.rotation.x, lR, k, dt);
    armL.rotation.x = THREE.MathUtils.damp(armL.rotation.x, aL, k, dt);
    armR.rotation.x = THREE.MathUtils.damp(armR.rotation.x, aR, k, dt);
    upper.rotation.x = THREE.MathUtils.damp(upper.rotation.x, lean, 12, dt);
    upper.position.y = bob;
  }

  cameraTarget() {
    return { x: this.body.x, y: this.body.y, facing: this.dead ? 0 : this.facing };
  }
}
