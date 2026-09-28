import * as THREE from 'three';
import { FIELD } from './config.js';

const G = 9.81;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (x) => x * x * (3 - 2 * x);

const COLLIDERS = [
  ['hips', 'spine2', 0.18, 'body'],
  ['spine2', 'neck', 0.17, 'body'],
  ['head', 'headTop', 0.12, 'head', 0.45],
  ['lArm', 'lFore', 0.07, 'arm'], ['rArm', 'rFore', 0.07, 'arm'],
  ['lUp', 'lLeg', 0.1, 'leg'], ['rUp', 'rLeg', 0.1, 'leg'],
  ['lLeg', 'lFoot', 0.08, 'leg'], ['rLeg', 'rFoot', 0.08, 'leg'],
];

/** One defender in the wall: protective stance, anticipation squat, jump, landing. */
class WallPlayer {
  constructor(character) {
    this.c = character;
    this.y = 0; this.vy = 0;
    this.state = 'stand';
    this.t = 0;
    this.squat = 0;
    this.jumpDelay = 0;
    this.jumps = true;
    this.flinch = 0;
    this.nervous = Math.random() * 6;
    this.turn = 0;
    this.mood = null;
    this.moodW = 0;
  }
  update(dt, ctx) {
    const c = this.c;
    this.t += dt;
    c.updateMixer(dt);
    switch (this.state) {
      case 'wait':
        if (this.t >= this.jumpDelay) { this.state = this.jumps ? 'squat' : 'stand'; this.t = 0; }
        break;
      case 'squat':
        this.squat = Math.sin(clamp01(this.t / 0.13) * Math.PI * 0.5) * 0.13;
        if (this.t >= 0.13) { this.state = 'air'; this.t = 0; this.vy = (3.2 + Math.random() * 0.4) * Math.sqrt(this.jumpScale ?? 1); }
        break;
      case 'air':
        this.squat *= Math.exp(-dt * 20);
        this.vy -= G * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) { this.y = 0; this.state = 'land'; this.t = 0; ctx.onLand?.(this); }
        break;
      case 'land':
        this.squat = Math.sin(clamp01(this.t / 0.3) * Math.PI) * 0.1;
        if (this.t > 0.3) { this.state = 'stand'; this.t = 0; }
        break;
      default: break;
    }
    // flinch when the ball whistles past close to the head
    const bp = ctx.ball.state.p;
    const head = c.worldPos('head', _v);
    const d = head.distanceTo(bp);
    if (d < 1.2 && ctx.ballLive) this.flinch = Math.min(1, this.flinch + dt * 8);
    else this.flinch = Math.max(0, this.flinch - dt * 2);

    c.root.position.y = this.y;
    // once the ball is past, spin round to watch it
    if (ctx.ballLive && bp.z < c.root.position.z - 1) this.turn = Math.min(1, this.turn + dt * 2.6);
    else if (!ctx.ballLive) this.turn = Math.max(0, this.turn - dt * 1.5);
    if (this.turn > 0) {
      const face = Math.atan2(bp.x - c.root.position.x, bp.z - c.root.position.z);
      let d = face - this.baseYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      c.setYaw(this.baseYaw + d * smoothstep(this.turn));
    }
    const tuck = this.state === 'air' ? clamp01(this.vy > 0 ? 0.6 : this.y * 2) : 0;
    c.offsetHips(0, -this.squat - 0.03, 0);
    c.bendSpine(0.12 + this.squat * 1.2 + this.flinch * 0.25, this.flinch * 0.4, 0);
    c.bend('head', this.flinch * 0.35, 0, 0);
    c.model.updateMatrixWorld(true);
    // legs: planted on the grass unless airborne
    for (const [s, sx] of [['l', 1], ['r', -1]]) {
      if (this.state === 'air') {
        c.bend(s + 'Up', -0.35 * tuck, 0, 0);
        c.bend(s + 'Leg', 0.7 * tuck, 0, 0);
      } else {
        const foot = c.toWorld(sx * 0.13, 0.084 - this.y, 0.02, _v);
        c.legIK(s, foot, 1, c.dirToWorld(sx * 0.1, 0, 1, _w));
        c.footFlat(s, 0.9);
      }
    }
    c.model.updateMatrixWorld(true);
    // hands protecting the groin (the classic wall pose)
    const n = Math.sin(ctx.time * 1.7 + this.nervous) * 0.01;
    const lh = c.toWorld(0.05, 0.86 - this.squat * 0.7 + n, 0.2);
    const rh = c.toWorld(-0.05, 0.84 - this.squat * 0.7 - n, 0.23);
    this.moodW += ((this.mood ? 1 : 0) - this.moodW) * Math.min(1, dt * 3);
    if (this.mood === 'goal') {
      // hands on the head
      const head = c.worldPos('head', _w);
      lh.lerp(head.clone().add(c.dirToWorld(0.12, 0.13, 0.02)), this.moodW);
      rh.lerp(head.clone().add(c.dirToWorld(-0.12, 0.13, 0.02)), this.moodW);
    } else if (this.mood === 'save') {
      const pump = Math.abs(Math.sin(ctx.time * 6 + this.nervous)) * 0.1;
      lh.lerp(c.toWorld(0.3, 2.05 + pump, 0.15), this.moodW);
      rh.lerp(c.toWorld(-0.3, 2.05 + pump, 0.15), this.moodW);
    }
    const out = this.moodW * (this.mood ? 1 : 0);
    c.armIK('l', lh, 0.95, c.dirToWorld(0.8 + out * 0.4, -0.2 + out * 0.6, -0.4));
    c.armIK('r', rh, 0.95, c.dirToWorld(-0.8 - out * 0.4, -0.2 + out * 0.6, -0.4));
    c.lookAt(bp, 0.8 * (1 - this.flinch));
    this.colliders = c.buildColliders(COLLIDERS, dt);
  }
}

export class DefensiveWall {
  constructor(characters) {
    this.players = characters.map((c) => new WallPlayer(c));
    this.count = 0;
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
  }

  /**
   * Lines the wall up 9.15 m from the ball, covering the near post (+ a margin);
   * returns the spray line endpoints and the x of the wall's outer edge on the goal line.
   */
  setup(ballPos, count, jumpScale = 1) {
    this.count = count;
    this.jumpScale = jumpScale;
    const toGoal = new THREE.Vector3(-ballPos.x, 0, -ballPos.z).normalize();
    // near post relative to the ball
    const nearX = Math.abs(ballPos.x) < 1.5 ? (Math.random() < 0.5 ? -1 : 1) * FIELD.goalHalfWidth : Math.sign(ballPos.x) * FIELD.goalHalfWidth;
    const toNear = new THREE.Vector3(nearX - ballPos.x, 0, -ballPos.z).normalize();
    const center = ballPos.clone().setY(0).addScaledVector(toNear, FIELD.wallDistance);
    // perpendicular pointing from the near-post line toward the goal centre
    const perp = new THREE.Vector3(-toNear.z, 0, toNear.x);
    if (perp.dot(new THREE.Vector3(-nearX, 0, 0)) < 0) perp.negate();
    const spacing = 0.5;
    // the outermost defender stands just outside the near-post line
    const start = center.clone().addScaledVector(perp, -0.32);
    const yaw = Math.atan2(ballPos.x - center.x, ballPos.z - center.z);
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const on = i < count;
      p.c.root.visible = on;
      p.active = on;
      if (!on) continue;
      const pos = start.clone().addScaledVector(perp, i * spacing);
      p.c.root.position.copy(pos);
      p.baseYaw = yaw + (Math.random() - 0.5) * 0.08;
      p.c.setYaw(p.baseYaw);
      p.turn = 0; p.mood = null; p.moodW = 0;
      p.state = 'stand'; p.y = 0; p.vy = 0; p.squat = 0; p.flinch = 0; p.t = 0;
      p.jumpScale = jumpScale;
      p.c.blendTo({ idle: 1 }, 30);
    }
    const first = start.clone().addScaledVector(perp, -0.3);
    const last = start.clone().addScaledVector(perp, (count - 1) * spacing + 0.3);
    // shift the spray line 0.35 m toward the ball
    this.a.copy(first).addScaledVector(toGoal, -0.35);
    this.b.copy(last).addScaledVector(toGoal, -0.35);
    return { a: this.a, b: this.b, edgeX: nearX, toGoal, perp };
  }

  onKick() {
    for (const p of this.players) {
      if (!p.active) continue;
      p.state = 'wait';
      p.t = 0;
      p.jumpDelay = Math.random() * 0.09;
      p.jumps = Math.random() < 0.9;
    }
  }

  react(outcome) {
    const mood = outcome === 'goal' ? 'goal' : (outcome === 'caught' || outcome === 'parry' || outcome === 'wall') ? 'save' : null;
    for (const p of this.players) if (p.active) p.mood = mood;
  }

  update(dt, ctx) {
    const cols = [];
    for (const p of this.players) {
      if (!p.active) continue;
      p.update(dt, ctx);
      for (const c of p.colliders) cols.push(c);
    }
    this.colliders = cols;
  }
}
