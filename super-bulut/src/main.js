// Süper Bulut: oyun döngüsü, durum makinesi ve oyun kuralları.
import * as THREE from 'three';
import { STEP, START_LIVES, TIME_UNIT, HURRY_AT, SCORE, NAZAR_TIME, INVULN_TIME, PHYSICS } from './config.js';
import { LEVELS } from './levels.js';
import { Level, T } from './level.js';
import { Assets } from './assets.js';
import { World } from './world.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { Enemy } from './enemies.js';
import { Coin, PopCoin, PowerUp } from './items.js';
import { Hud } from './hud.js';
import { overlap } from './physics.js';

const TEMPO = { normal: 150, hurry: 190, nazar: 210 };

function readBest() {
  try {
    return Number(localStorage.getItem('superbulut.best')) || 0;
  } catch {
    return 0;
  }
}

function writeBest(v) {
  try {
    localStorage.setItem('superbulut.best', String(v));
  } catch {}
}

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.quality = { level: 0, frames: 0, time: 0 };

    this.assets = new Assets();
    this.input = new Input();
    this.sound = new Sound();
    this.hud = new Hud();
    this.state = 'loading';
    this.stateTime = 0;
    this.acc = 0;
    this.score = 0;
    this.coins = 0;
    this.lives = START_LIVES;
    this.levelIndex = 0;
    this.best = readBest();
    this.time = 0;
    this.playerBig = false;
    this.checkpoint = null;
  }

  async boot() {
    this.hud.setLoading(0);
    try {
      await this.assets.load((p) => this.hud.setLoading(p));
    } catch (err) {
      console.error(err);
      this.hud.showError(`Oyun yüklenemedi: ${err.message}. Oyunu bir web sunucusu üzerinden açın (README'ye bakın).`);
      return;
    }
    this.hud.setAssetStatus(this.assets.stats, Object.keys(this.assets.defs).length);
    this.hud.setMuted(this.sound.muted);

    this.world = new World(this);
    this.effects = new Effects(this.world, this.hud.popupRoot);
    this.player = new Player(this);
    this.input.bindTouch(document.getElementById('touch'));
    this.input.onAnyInput = () => this.sound.unlock();
    window.addEventListener('pointerdown', () => this.sound.unlock());
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    });
    document.getElementById('btn-start').addEventListener('click', () => this.onStart());
    document.getElementById('btn-restart').addEventListener('click', () => this.onStart());
    document.getElementById('btn-again').addEventListener('click', () => this.onStart());
    document.getElementById('btn-resume').addEventListener('click', () => this.togglePause());
    document.getElementById('btn-pause').addEventListener('click', () => this.togglePause());
    document.getElementById('btn-mute').addEventListener('click', () => this.hud.setMuted(this.sound.toggleMute()));

    this.resize();
    this.loadLevel(0);
    this.setState('title');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.world.resize(w, h);
    this.viewW = w;
    this.viewH = h;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
    this.input.clearLatches();
    const def = LEVELS[this.levelIndex];
    this.hud.screen(s, { best: this.best, id: def?.id, name: def?.name, lives: this.lives, score: this.score, newBest: this.newBest });
  }

  // ---------- Bölüm yönetimi

  loadLevel(index, { fromCheckpoint = false } = {}) {
    this.effects.clear();
    const def = LEVELS[index];
    this.level = new Level(def);
    this.world.build(this.level, def.theme);
    this.enemies = this.level.enemies.map((e) => new Enemy(this, e.type, e.x, e.y));
    this.coinObjs = this.level.coins.map((c) => new Coin(this, c.x, c.y));
    this.items = [];
    this.world.add(this.player.root);
    const useCheckpoint = fromCheckpoint && this.level.checkpointX;
    const start = useCheckpoint ? { x: this.level.checkpointX, y: 2 } : this.level.start;
    this.player.reset(start.x, start.y, this.playerBig);
    this.time = def.time;
    this.timeAcc = 0;
    this.hurried = false;
    this.flagProgress = 0;
    this.world.setFlagProgress(0);
    this.world.updateCamera(0, this.player.cameraTarget(), true);
  }

  onStart() {
    this.sound.unlock();
    if (this.state === 'title') this.newGame();
    else if (this.state === 'gameover' || this.state === 'win') {
      this.loadLevel(0);
      this.setState('title');
    }
  }

  newGame() {
    this.score = 0;
    this.coins = 0;
    this.lives = START_LIVES;
    this.levelIndex = 0;
    this.playerBig = false;
    this.checkpoint = null;
    this.newBest = false;
    this.startLevel();
  }

  startLevel() {
    this.loadLevel(this.levelIndex, { fromCheckpoint: this.checkpoint === this.levelIndex });
    this.setState('intro');
  }

  // ---------- Döngü

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.input.poll();
    this.#globalKeys();
    this.acc += dt;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
    this.render(dt);
    this.#adaptQuality(dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  // Zayıf cihazlarda kare hızı düşükse önce çözünürlüğü, sonra gölgeleri azalt
  #adaptQuality(dt) {
    const q = this.quality;
    if (q.level >= 2 || document.hidden) return;
    q.frames++;
    q.time += dt;
    if (q.time < 2) return;
    const fps = q.frames / q.time;
    q.frames = 0;
    q.time = 0;
    if (fps >= 28) return;
    q.level++;
    if (q.level === 1) {
      this.renderer.setPixelRatio(1);
      this.resize();
    } else {
      this.renderer.shadowMap.enabled = false;
      this.world.sun.castShadow = false;
    }
    console.info(`[kalite] ${fps.toFixed(1)} fps, kalite seviyesi ${q.level}`);
  }

  #globalKeys() {
    const inp = this.input;
    if (inp.take('mute')) this.hud.setMuted(this.sound.toggleMute());
    if (inp.take('pause') && (this.state === 'playing' || this.state === 'paused')) this.togglePause();
    if (this.state === 'title' || this.state === 'gameover' || this.state === 'win') {
      if (inp.take('start') || (this.state === 'title' && this.stateTime > 0.3 && inp.take('jump'))) this.onStart();
    } else if (this.state === 'paused' && inp.take('start')) this.togglePause();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.setState('paused');
      this.sound.stopMusic();
      this.sound.play('pause');
    } else if (this.state === 'paused') {
      this.setState('playing');
      this.sound.startMusic(this.#tempo());
    }
  }

  #tempo() {
    if (this.player.nazar > 0) return TEMPO.nazar;
    return this.hurried ? TEMPO.hurry : TEMPO.normal;
  }

  step(dt) {
    this.stateTime += dt;
    switch (this.state) {
      case 'title':
        this.#titleCamera(dt);
        break;
      case 'intro':
        if (this.stateTime > 2.2) {
          this.setState('playing');
          this.sound.startMusic(this.#tempo());
        }
        break;
      case 'playing':
        this.#updatePlaying(dt);
        break;
      case 'grow':
        if (this.player.growTick(dt)) this.setState('playing');
        break;
      case 'dying':
        this.player.updateDeath(dt);
        if (this.stateTime > 3) this.#afterDeath();
        break;
      case 'flag':
        this.#updateFlag(dt);
        break;
      case 'clear':
        this.#updateClear(dt);
        break;
    }
  }

  #titleCamera(dt) {
    const x = this.level.start.x + 9 + Math.sin(this.stateTime * 0.12) * 7;
    this.world.updateCamera(dt, { x, y: 2, facing: 0 });
  }

  #updatePlaying(dt) {
    const p = this.player;
    const level = this.level;
    p.update(dt, this.input, level);
    if (this.state !== 'playing') return;

    if (level.checkpointX && p.body.x > level.checkpointX) this.checkpoint = this.levelIndex;

    // Düşmanlar
    const { x0, x1 } = this.world.visibleRange();
    for (const e of this.enemies) {
      if (!e.active && e.body.x > x0 && e.body.x < x1) e.active = true;
      e.update(dt, level);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (!a.active || !a.solid || a.cfg.flying) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (!b.active || !b.solid || b.cfg.flying || !overlap(a.body, b.body)) continue;
        const d = Math.sign(b.body.x - a.body.x) || 1;
        a.dir = -d;
        b.dir = d;
      }
    }
    for (const e of this.enemies) {
      if (!e.active || !e.solid || !overlap(p.body, e.body, 0.06)) continue;
      if (p.nazar > 0) {
        e.flip(p.facing);
        this.addScore(SCORE.nazarKill, e.body.x, e.body.y + 1);
        this.sound.play('kick');
        continue;
      }
      const falling = p.body.vy < 0 || p.body.y < p.prevY;
      const above = p.prevY >= e.body.y + e.body.h * 0.45;
      if (e.cfg.stompable && falling && above) {
        e.stomp();
        p.body.y = Math.max(p.body.y, e.body.y + e.body.h * 0.6);
        p.body.vy = this.input.isDown('jump') ? PHYSICS.stompBounceHold : PHYSICS.stompBounce;
        p.jumpHeld = this.input.isDown('jump');
        this.#stompScore(e);
        this.sound.play('stomp');
        this.effects.puff(e.body.x, e.body.y + 0.3);
      } else if (p.invuln <= 0) {
        this.hurtPlayer();
        if (this.state !== 'playing' && this.state !== 'grow') return;
      }
    }
    this.enemies = this.enemies.filter((e) => !e.removed);

    // Altınlar
    for (const c of this.coinObjs) {
      if (!c.taken && overlap(p.body, c.body)) this.#collectCoin(c);
    }

    // Eşyalar
    for (const it of this.items) {
      it.update(dt, level);
      if (it instanceof PowerUp && !it.removed && it.state === 'move' && overlap(p.body, it.body)) this.#collectPowerUp(it);
    }
    this.items = this.items.filter((it) => !it.removed);

    // Süre
    this.timeAcc += dt;
    while (this.timeAcc >= TIME_UNIT) {
      this.timeAcc -= TIME_UNIT;
      this.time--;
      if (this.time === HURRY_AT) {
        this.hurried = true;
        this.sound.play('hurry');
        this.sound.setTempo(this.#tempo());
      }
      if (this.time <= 0) {
        this.time = 0;
        this.killPlayer();
        return;
      }
    }

    if (p.body.y < -1.5) {
      this.killPlayer({ pit: true });
      return;
    }

    const f = level.flag;
    if (f && p.body.x + p.body.w / 2 >= f.x - 0.08) this.#startFlag();
  }

  // ---------- Kurallar

  addScore(points, x, y) {
    this.score += points;
    if (x !== undefined) this.effects.popup(String(points), x, y);
  }

  addCoin() {
    this.coins++;
    if (this.coins >= 100) {
      this.coins -= 100;
      this.#oneUp();
    }
  }

  #oneUp() {
    this.lives++;
    this.sound.play('oneup');
    this.effects.popup('1UP', this.player.body.x, this.player.body.y + 2, 'oneup');
  }

  #stompScore(e) {
    const chain = SCORE.stompChain;
    const i = this.player.stompChain++;
    if (i >= chain.length) this.#oneUp();
    else this.addScore(chain[i], e.body.x, e.body.y + 1);
  }

  #collectCoin(c) {
    c.take();
    this.addCoin();
    this.score += SCORE.coin;
    this.sound.play('coin');
    this.effects.sparkle(c.body.x, c.body.y + 0.4);
  }

  #collectPowerUp(it) {
    const p = this.player;
    it.remove();
    this.addScore(SCORE.powerup, it.body.x, it.body.y + 1);
    if (it.kind === 'simit') {
      this.sound.play('powerup');
      if (!p.big) {
        p.setBig(true);
        this.playerBig = true;
        this.setState('grow');
      }
    } else {
      p.nazar = NAZAR_TIME;
      this.sound.play('nazar');
      this.sound.setTempo(this.#tempo());
    }
  }

  onNazarEnd() {
    this.sound.setTempo(this.#tempo());
  }

  hurtPlayer() {
    const p = this.player;
    if (p.big) {
      p.setBig(false);
      this.playerBig = false;
      p.invuln = INVULN_TIME;
      this.sound.play('shrink');
      this.setState('grow');
    } else this.killPlayer();
  }

  killPlayer({ pit = false } = {}) {
    this.player.die(pit);
    this.playerBig = false;
    this.sound.stopMusic();
    this.sound.play('die');
    this.setState('dying');
  }

  #afterDeath() {
    this.lives--;
    if (this.lives <= 0) {
      this.#saveBest();
      this.setState('gameover');
      this.sound.play('gameover');
    } else this.startLevel();
  }

  #saveBest() {
    this.newBest = this.score > this.best;
    if (this.newBest) {
      this.best = this.score;
      writeBest(this.best);
    }
  }

  // Oyuncunun kafası bir bloğa alttan çarptı
  hitBlock(tx, ty) {
    const level = this.level;
    const t = level.get(tx, ty);
    const key = level.idx(tx, ty);
    const content = level.contents.get(key);

    // Bloğun üstündekiler: düşmanlar devrilir, altınlar toplanır, eşyalar zıplar
    for (const e of this.enemies) {
      if (e.standsOn(tx, ty)) {
        e.flip(Math.sign(e.body.x - (tx + 0.5)) || 1);
        this.addScore(SCORE.bumpKill, e.body.x, e.body.y + 1);
        this.sound.play('kick');
      }
    }
    for (const c of this.coinObjs) {
      if (!c.taken && Math.abs(c.body.x - (tx + 0.5)) < 0.6 && Math.abs(c.body.y - (ty + 1)) < 0.6) this.#collectCoin(c);
    }
    for (const it of this.items) {
      if (it instanceof PowerUp && Math.abs(it.body.x - (tx + 0.5)) < 0.8 && Math.abs(it.body.y - (ty + 1)) < 0.2) it.hop();
    }

    if (content && (t === T.MYSTERY || t === T.BRICK)) {
      if (content.type === 'coin') {
        this.items.push(new PopCoin(this, tx + 0.5, ty + 1));
        this.addCoin();
        this.score += SCORE.coin;
        this.sound.play('coin');
        content.count--;
      } else {
        this.items.push(new PowerUp(this, content.type, tx, ty));
        this.sound.play('appear');
        content.count = 0;
      }
      if (content.count <= 0) {
        level.set(tx, ty, T.USED);
        level.contents.delete(key);
        this.world.setBlock(tx, ty, T.USED);
      }
      this.world.bump(tx, ty);
    } else if (t === T.MYSTERY) {
      level.set(tx, ty, T.USED);
      this.world.setBlock(tx, ty, T.USED);
      this.world.bump(tx, ty);
      this.sound.play('bump');
    } else if (t === T.BRICK) {
      if (this.player.big) {
        level.set(tx, ty, T.EMPTY);
        this.world.setBlock(tx, ty, T.EMPTY);
        this.effects.bricks(tx + 0.5, ty + 0.5);
        this.score += SCORE.brick;
        this.sound.play('break');
      } else {
        this.world.bump(tx, ty);
        this.sound.play('bump');
      }
    } else {
      this.sound.play('bump');
    }
  }

  // ---------- Bölüm sonu

  #startFlag() {
    const f = this.level.flag;
    const p = this.player;
    this.sound.stopMusic();
    this.sound.play('flag');
    p.body.vx = 0;
    p.body.vy = 0;
    p.body.x = f.x - p.body.w / 2 - 0.02;
    p.body.y = Math.min(Math.max(p.body.y, f.y), f.y + f.height - p.body.h);
    const h = p.body.y - f.y;
    const pts = h > 6 ? 5000 : h > 4.5 ? 2000 : h > 3 ? 800 : h > 1.5 ? 400 : 100;
    this.addScore(pts, f.x + 0.8, p.body.y + 1);
    p.facing = 1;
    p.forcedAnim = 'slide';
    this.flagPhase = 'slide';
    this.phaseT = 0;
    this.flagProgress = 0;
    this.setState('flag');
  }

  #updateFlag(dt) {
    const f = this.level.flag;
    const p = this.player;
    const tower = this.level.tower;
    this.phaseT += dt;
    if (this.flagPhase === 'slide') {
      p.body.y = Math.max(f.y, p.body.y - 8 * dt);
      this.flagProgress = Math.min(1, this.flagProgress + dt / 1.1);
      this.world.setFlagProgress(this.flagProgress);
      if (p.body.y <= f.y && this.flagProgress >= 1) {
        this.flagPhase = 'hop';
        this.phaseT = 0;
      }
    } else if (this.flagPhase === 'hop') {
      if (this.phaseT > 0.35) {
        p.body.x = f.x + p.body.w / 2 + 0.1;
        p.forcedAnim = null;
        this.flagPhase = 'walk';
        this.phaseT = 0;
      }
    } else if (this.flagPhase === 'walk') {
      p.autoWalk(dt, this.level, 3.6);
      if (!tower || p.body.x >= tower.x) {
        p.body.vx = 0;
        p.forcedAnim = 'victory';
        this.flagPhase = 'enter';
        this.phaseT = 0;
        this.sound.play('clear');
      } else if (p.body.x > this.level.width - 1) this.flagPhase = 'enter';
    } else if (this.flagPhase === 'enter') {
      if (this.phaseT > 1.3) {
        p.hide();
        p.forcedAnim = null;
        this.setState('clear');
      }
    }
  }

  #updateClear(dt) {
    this.tallyAcc = (this.tallyAcc || 0) + dt;
    while (this.time > 0 && this.tallyAcc >= 0.012) {
      this.tallyAcc -= 0.012;
      this.time--;
      this.score += SCORE.timeUnit;
      if (this.time % 4 === 0) this.sound.play('tick');
    }
    if (this.time <= 0) {
      this.time = 0;
      if (!this.tallyDoneAt) this.tallyDoneAt = this.stateTime;
      if (this.stateTime - this.tallyDoneAt > 1.2) {
        this.tallyDoneAt = 0;
        this.#nextLevel();
      }
    }
  }

  #nextLevel() {
    this.levelIndex++;
    this.checkpoint = null;
    this.playerBig = this.player.big;
    if (this.levelIndex >= LEVELS.length) {
      this.#saveBest();
      this.levelIndex = LEVELS.length - 1;
      this.setState('win');
    } else this.startLevel();
  }

  // ---------- Çizim

  render(dt) {
    const frozen = this.state === 'paused';
    const live = this.state === 'playing' || this.state === 'flag' || this.state === 'clear' || this.state === 'title';
    if (!frozen) {
      this.world.update(dt);
      this.effects.update(dt);
      this.player.animate(this.state === 'grow' ? 0 : dt);
      const edt = live ? dt : 0;
      for (const e of this.enemies) {
        if (e.active || this.state === 'title') e.animate(edt);
      }
      for (const c of this.coinObjs) c.animate(dt);
      for (const it of this.items) it.animate(edt);
      if (this.state !== 'title') this.world.updateCamera(dt, this.player.cameraTarget());
    }
    this.renderer.render(this.world.scene, this.world.camera);
    this.effects.render(this.world.camera, this.viewW, this.viewH, frozen ? 0 : dt);
    this.hud.update(this);
  }
}

const game = new Game();
window.__game = game;
game.boot();
