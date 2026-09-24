// Düşmanlar: kestane (yürür, kenardan düşer), kirpi (dikenli, kenarda döner), arı (uçar).
import * as THREE from 'three';
import { ENEMY } from './config.js';
import { moveBody, edgeAhead } from './physics.js';

const FACE = Math.PI / 2 - 0.25;

export class Enemy {
  constructor(game, type, x, y) {
    this.game = game;
    this.type = type;
    this.cfg = ENEMY[type];
    this.body = { x, y, w: this.cfg.w, h: this.cfg.h, vx: 0, vy: 0 };
    this.dir = -1;
    this.state = 'walk'; // walk | squashed | flipped
    this.active = false;
    this.removed = false;
    this.onGround = false;
    this.t = Math.random() * 10;
    this.homeX = x;
    this.baseY = y + 0.35;

    const inst = game.assets.instance(type);
    this.root = new THREE.Group();
    this.model = inst.object;
    this.root.add(this.model);
    this.parts = {};
    for (const n of ['body', 'footL', 'footR', 'wingL', 'wingR']) this.parts[n] = this.model.getObjectByName(n);
    this.model.rotation.y = -FACE;
    game.world.add(this.root);
    this.animate(0);
  }

  get solid() {
    return this.state === 'walk' && !this.removed;
  }

  update(dt, level) {
    if (!this.active || this.removed) return;
    this.t += dt;
    const b = this.body;
    if (this.state === 'squashed') {
      this.timer -= dt;
      if (this.timer <= 0) this.destroy();
      return;
    }
    if (this.state === 'flipped') {
      b.vy -= 40 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -4) this.destroy();
      return;
    }
    if (this.cfg.flying) {
      const px = b.x;
      b.x = this.homeX + Math.sin(this.t * this.cfg.speed * 0.6) * 1.6;
      b.y = this.baseY + Math.sin(this.t * 2.4) * 1.0;
      this.dir = b.x >= px ? 1 : -1;
      return;
    }
    b.vx = this.dir * this.cfg.speed;
    b.vy = Math.max(b.vy - 60 * dt, -20);
    if (this.cfg.turnAtEdges && this.onGround && edgeAhead(b, level, this.dir)) {
      this.dir = -this.dir;
      b.vx = this.dir * this.cfg.speed;
    }
    const res = moveBody(b, level, dt);
    this.onGround = res.onGround;
    if (res.hitX) this.dir = -res.hitX;
    if (b.y < -3) this.destroy();
  }

  turn() {
    this.dir = -this.dir;
  }

  stomp() {
    if (this.cfg.flying) {
      this.flip(this.dir);
      return;
    }
    this.state = 'squashed';
    this.timer = 0.5;
  }

  flip(dirX = 1) {
    this.state = 'flipped';
    this.body.vy = 9;
    this.body.vx = dirX * 2.2;
  }

  // Bu düşman (tx, ty) bloğunun üstünde mi duruyor?
  standsOn(tx, ty) {
    const b = this.body;
    return this.solid && !this.cfg.flying && Math.abs(b.y - (ty + 1)) < 0.08 && Math.abs(b.x - (tx + 0.5)) < 0.5 + b.w / 2 - 0.05;
  }

  destroy() {
    this.removed = true;
    this.game.world.remove(this.root);
  }

  animate(dt) {
    const b = this.body;
    this.root.position.set(b.x, b.y, 0);
    const m = this.model;
    const target = this.dir > 0 ? FACE : -FACE;
    m.rotation.y += (target - m.rotation.y) * (1 - Math.exp(-10 * dt));

    if (this.state === 'squashed') {
      m.scale.set(1.25, 0.28, 1.25);
      return;
    }
    if (this.state === 'flipped') {
      m.rotation.z = Math.PI;
      m.position.y = this.cfg.h;
      return;
    }
    const t = this.t;
    const { body, footL, footR, wingL, wingR } = this.parts;
    if (this.cfg.flying) {
      if (wingL) {
        wingL.rotation.y = Math.sin(t * 45) * 0.7;
        wingR.rotation.y = -Math.sin(t * 45) * 0.7;
      }
      m.rotation.z = Math.sin(t * 2.4) * 0.12;
      return;
    }
    const step = Math.sin(t * this.cfg.speed * 5);
    if (footL) {
      footL.position.y = 0.07 + Math.max(0, step) * 0.06;
      footR.position.y = 0.07 + Math.max(0, -step) * 0.06;
      body.rotation.z = step * 0.08;
    } else {
      // Meshy modeli: bütün gövdeyle paytak yürüyüş
      m.rotation.z = step * 0.1;
      m.position.y = Math.abs(step) * 0.05;
    }
  }
}
