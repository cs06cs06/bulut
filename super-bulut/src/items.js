// Toplanabilir eşyalar: altınlar, bloktan fırlayan altın, simit ve nazar boncuğu.
import * as THREE from 'three';
import { moveBody } from './physics.js';

export class Coin {
  constructor(game, x, y) {
    this.game = game;
    this.obj = game.assets.instance('coin').object;
    this.obj.position.set(x, y, 0);
    this.obj.rotation.y = x * 0.7;
    game.world.add(this.obj);
    this.body = { x, y: y - 0.4, w: 0.6, h: 0.8 };
    this.taken = false;
  }

  animate(dt) {
    this.obj.rotation.y += dt * 3;
  }

  take() {
    this.taken = true;
    this.game.world.remove(this.obj);
  }
}

// Sürpriz bloktan yukarı fırlayıp kaybolan altın
export class PopCoin {
  constructor(game, x, y) {
    this.game = game;
    this.obj = game.assets.instance('coin').object;
    this.obj.position.set(x, y, 0.1);
    game.world.add(this.obj);
    this.vy = 14;
    this.age = 0;
    this.removed = false;
  }

  update(dt) {
    this.age += dt;
    this.vy -= 48 * dt;
    this.obj.position.y += this.vy * dt;
    this.obj.rotation.y += dt * 18;
    if (this.age > 0.55) {
      const { x, y } = this.obj.position;
      this.game.effects.sparkle(x, y);
      this.game.effects.popup('200', x, y);
      this.game.world.remove(this.obj);
      this.removed = true;
    }
  }

  animate() {}
}

export class PowerUp {
  constructor(game, kind, tx, ty) {
    this.game = game;
    this.kind = kind; // 'simit' | 'nazar'
    // Model tabandan hizalı; dönebilmesi için merkezinden tutan bir kap içine koy
    this.half = (game.assets.defs[kind]?.fit?.value ?? 0.75) / 2;
    const model = game.assets.instance(kind).object;
    model.position.y = -this.half;
    this.obj = new THREE.Group();
    this.obj.add(model);
    game.world.add(this.obj);
    this.body = { x: tx + 0.5, y: ty + 0.05, w: 0.7, h: 0.7, vx: 0, vy: 0 };
    this.targetY = ty + 1;
    this.state = 'emerge';
    this.removed = false;
    this.spin = 0;
    this.animate(0);
  }

  update(dt, level) {
    const b = this.body;
    if (this.state === 'emerge') {
      b.y += dt * 1.6;
      if (b.y >= this.targetY) {
        b.y = this.targetY;
        this.state = 'move';
        b.vx = this.kind === 'nazar' ? 4 : 3;
        if (this.kind === 'nazar') b.vy = 8;
      }
      return;
    }
    b.vy = Math.max(b.vy - 45 * dt, -20);
    const res = moveBody(b, level, dt);
    if (res.hitX) b.vx = -res.hitX * Math.abs(this.kind === 'nazar' ? 4 : 3);
    if (this.kind === 'nazar' && res.onGround) b.vy = 10;
    if (b.y < -3) this.remove();
  }

  hop() {
    if (this.state !== 'move') return;
    this.body.vy = 10;
  }

  remove() {
    this.removed = true;
    this.game.world.remove(this.obj);
  }

  animate(dt) {
    const b = this.body;
    this.obj.position.set(b.x, b.y + this.half, 0);
    if (this.kind === 'simit') {
      this.obj.rotation.z -= (b.vx * dt) / 0.36;
    } else {
      this.spin += dt * 5;
      this.obj.rotation.y = Math.sin(this.spin) * 0.6;
    }
  }
}
