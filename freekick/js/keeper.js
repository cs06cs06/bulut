import * as THREE from 'three';
import { FIELD, BALL } from './config.js';
import { predictGoalPlane } from './physics.js';

const G = 9.81;
const R = BALL.radius;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _qr = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;

const COLLIDERS = [
  ['hips', 'spine2', 0.17, 'body'],
  ['spine2', 'neck', 0.16, 'body'],
  ['head', 'headTop', 0.115, 'head', 0.45],
  ['lArm', 'lFore', 0.07, 'arm'], ['rArm', 'rFore', 0.07, 'arm'],
  ['lFore', 'lHand', 0.065, 'arm'], ['rFore', 'rHand', 0.065, 'arm'],
  ['lUp', 'lLeg', 0.1, 'leg'], ['rUp', 'rLeg', 0.1, 'leg'],
  ['lLeg', 'lFoot', 0.075, 'leg'], ['rLeg', 'rFoot', 0.075, 'leg'],
];

/**
 * Goalkeeper: positions on the angle, does a split-step as the ball is struck, reads the
 * flight (imperfectly, depending on difficulty), shuffles, then dives on a ballistic arc
 * with both gloves reaching for the ball. Colliders come from the live skeleton.
 */
export class Keeper {
  constructor(character) {
    this.c = character;
    this.state = 'ready';
    this.t = 0;
    this.home = new THREE.Vector3(0, 0, 0.3);
    this.hips0 = new THREE.Vector3();
    this.hipsVel = new THREE.Vector3();
    this.hipsPos = new THREE.Vector3();
    this.reach = new THREE.Vector3();
    this.holdPoint = new THREE.Vector3();
    this.w = { ready: 1, dive: 0, arms: 0.9, legs: 1, jump: 0, lie: 0, hold: 0, dejected: 0, celebrate: 0 };
    this.roll = 0;
    this.pitch = 0;
    this.holding = false;
    this.lateralVel = 0;
    this.stepPhase = 0;
  }

  setup(ballPos, wallEdgeX, difficulty) {
    this.diff = difficulty;
    // stand on the line bisecting the angle to the posts, nudged away from the wall
    const toL = Math.atan2(-FIELD.goalHalfWidth - ballPos.x, -ballPos.z);
    const toR = Math.atan2(FIELD.goalHalfWidth - ballPos.x, -ballPos.z);
    const mid = (toL + toR) / 2;
    const z = 0.45;
    let x = ballPos.x + Math.tan(mid) * (z - ballPos.z);
    if (wallEdgeX !== null) x += Math.sign(x - wallEdgeX || 1) * 0.35;
    x = Math.max(-1.6, Math.min(1.6, x));
    this.home.set(x, 0, z);
    this.c.root.position.copy(this.home);
    this.faceBall(ballPos);
    this.state = 'ready';
    this.t = 0;
    this.holding = false;
    this.roll = 0; this.pitch = 0;
    Object.assign(this.w, { ready: 1, dive: 0, arms: 0.9, legs: 1, jump: 0, lie: 0, hold: 0, dejected: 0, celebrate: 0 });
    this.lateralVel = 0;
    this.decided = false;
    this.target = null;
    this.c.blendTo({ idle: 1 }, 20);
  }

  faceBall(p) {
    const r = this.c.root.position;
    this.c.setYaw(Math.atan2(p.x - r.x, p.z - r.z) * 0.85);
  }

  onKick(time, screened) {
    this.state = 'set';
    this.t = 0;
    this.kickTime = time;
    this.reactAt = this.diff.reaction + (screened ? 0.1 : 0) + Math.random() * 0.05;
  }

  /** Reads the flight. Spin perception improves the longer the keeper watches. */
  read(ballState, wind, progress) {
    const spinRead = this.diff.spinRead + (1 - this.diff.spinRead) * clamp01(progress);
    const pr = predictGoalPlane(ballState, wind, spinRead);
    if (!this.noise) this.noise = { x: gauss() * this.diff.noise, y: gauss() * this.diff.noise * 0.6 };
    const fade = 1 - clamp01(progress) * 0.7;
    pr.x += this.noise.x * fade;
    pr.y = Math.max(R, pr.y + this.noise.y * fade);
    return pr;
  }

  planDive(pr, now) {
    const c = this.c;
    const side = Math.sign(pr.x - c.root.position.x) || 1;
    this.side = side;
    const tAvail = Math.max(0.12, pr.t - now);
    const load = 0.1;
    const tFly = THREE.MathUtils.clamp(tAvail - load, 0.16, 0.55);
    c.worldPos('hips', this.hips0);
    const handY = Math.min(pr.y, FIELD.goalHeight + 0.25);
    const hy = Math.max(0.35, Math.min(1.75, handY - 0.35));
    const dyHand = handY - hy;
    const lateralReach = Math.sqrt(Math.max(0.05, 0.92 * 0.92 - dyHand * dyHand));
    const hx = pr.x - side * lateralReach;
    let vx = (hx - this.hips0.x) / tFly;
    const vmax = this.diff.dive;
    vx = Math.max(-vmax, Math.min(vmax, vx));
    let vy = (hy - this.hips0.y + 0.5 * G * tFly * tFly) / tFly;
    vy = Math.max(0.6, Math.min(4.4, vy));
    const vz = Math.max(-0.5, Math.min(1.8, (0.55 - this.hips0.z) / tFly + 0.6));
    this.hipsVel.set(vx, vy, vz);
    this.rollTarget = -side * THREE.MathUtils.lerp(1.42, 0.62, clamp01((handY - 0.4) / 1.9));
    this.loadT = load;
    this.target = pr;
  }

  update(dt, ctx) {
    const c = this.c;
    const ball = ctx.ball;
    const bs = ball.state;
    this.t += dt;
    const now = ctx.time - (this.kickTime ?? ctx.time);
    const W = this.w;
    const approach = (k, v, s) => { W[k] += (v - W[k]) * Math.min(1, dt * s); };

    c.updateMixer(dt);

    switch (this.state) {
      case 'ready': {
        this.faceBall(bs.p);
        approach('ready', 1, 6);
        break;
      }
      case 'set': {
        // split-step: a little hop as the ball is struck
        if (this.t >= this.reactAt) {
          this.state = 'track';
          this.t = 0;
          this.noise = null;
        }
        break;
      }
      case 'track': {
        const progress = now / 1.1;
        const pr = this.read(bs, ctx.wind, progress);
        this.target = pr;
        const r = c.root.position;
        const dx = pr.x - r.x;
        const tLeft = pr.t - now;
        const wide = Math.abs(pr.x) > FIELD.goalHalfWidth + 1.1 || pr.y > FIELD.goalHeight + 0.9 || !pr.reached;
        if (wide && !this.decided) {
          // obviously off target: shuffle and watch it go
          this.lateralVel += (Math.sign(dx) * Math.min(1.2, Math.abs(dx)) - this.lateralVel) * Math.min(1, dt * 5);
          r.x += this.lateralVel * dt * 0.4;
          if (tLeft < 0.1) { this.state = 'watch'; this.t = 0; }
          break;
        }
        const handReachStanding = 0.75;
        const needDive = Math.abs(dx) > handReachStanding || pr.y > 2.05;
        if (!needDive) {
          // step across and take it in the body / gloves
          const sp = Math.sign(dx) * Math.min(2.0, Math.abs(dx) * 5);
          this.lateralVel += (sp - this.lateralVel) * Math.min(1, dt * 10);
          r.x += this.lateralVel * dt;
          this.stepPhase += dt * 14 * Math.min(1, Math.abs(this.lateralVel));
          if (pr.y > 1.65 && tLeft < 0.32) { this.startJump(pr); }
          break;
        }
        // dive as late as possible: flight time is short and explosive, spare time is
        // spent side-stepping so the dive itself gets shorter
        const tFlight = THREE.MathUtils.clamp(Math.abs(dx) / this.diff.dive, 0.26, 0.5);
        if (tLeft > tFlight + 0.1 + 0.06) {
          const want = Math.abs(dx) > 0.95 ? Math.sign(dx) * 2.4 : 0;
          this.lateralVel += (want - this.lateralVel) * Math.min(1, dt * 8);
          r.x += this.lateralVel * dt;
          this.stepPhase += dt * 16 * Math.min(1, Math.abs(this.lateralVel));
        } else {
          this.planDive(pr, now);
          this.state = 'load';
          this.t = 0;
          this.decided = true;
        }
        break;
      }
      case 'load': {
        if (this.t >= this.loadT) { this.state = 'dive'; this.t = 0; c.worldPos('hips', this.hips0); this.hipsPos.copy(this.hips0); }
        break;
      }
      case 'dive': {
        const hv = this.hipsVel;
        hv.y -= G * dt;
        this.hipsPos.addScaledVector(hv, dt);
        const lying = 0.2;
        if (this.hipsPos.y <= lying && hv.y < 0) {
          this.hipsPos.y = lying;
          hv.y = 0;
          this.state = 'ground';
          this.t = 0;
          ctx.onKeeperLand?.();
        }
        // mid-air: arms keep tracking the live ball
        this.roll += (this.rollTarget - this.roll) * Math.min(1, dt * 9);
        break;
      }
      case 'jump': {
        const hv = this.hipsVel;
        hv.y -= G * dt;
        this.hipsPos.addScaledVector(hv, dt);
        if (this.hipsPos.y <= this.hips0.y && hv.y < 0) {
          this.hipsPos.y = this.hips0.y;
          this.state = this.holding ? 'hold' : 'watch';
          this.t = 0;
          ctx.onKeeperLand?.(true);
        }
        break;
      }
      case 'ground': {
        const hv = this.hipsVel;
        const k = Math.exp(-dt * 5);
        hv.x *= k; hv.z *= k;
        this.hipsPos.addScaledVector(hv, dt);
        this.roll += (-this.side * 1.52 - this.roll) * Math.min(1, dt * 8);
        if (this.t > 1.05) { this.state = 'recover'; this.t = 0; this.recoverFrom = this.hipsPos.clone(); this.rollFrom = this.roll; }
        break;
      }
      case 'recover': {
        const f = smooth(clamp01(this.t / 0.9));
        const r = c.root.position;
        r.x += (this.recoverFrom.x - r.x) * Math.min(1, dt * 6);
        this.roll = this.rollFrom * (1 - f);
        if (this.t > 0.95) { this.state = this.holding ? 'hold' : 'watch'; this.t = 0; }
        break;
      }
      default: break;
    }

    // ---------------- pose layers -----------------
    const inAir = this.state === 'dive' || this.state === 'ground' || this.state === 'jump' || this.state === 'recover';
    approach('dive', inAir ? 1 : 0, this.state === 'recover' ? 3 : 14);
    approach('lie', this.state === 'ground' ? 1 : 0, 5);
    approach('dejected', this.dejected ? 1 : 0, 2);
    approach('celebrate', this.celebrating ? 1 : 0, 3);

    // ready crouch & bounce
    const pre = this.state === 'ready' || this.state === 'set' || this.state === 'track' || this.state === 'load' || this.state === 'watch' || this.state === 'hold';
    let crouch = 0;
    if (pre) {
      const tense = this.state === 'ready' ? 0.75 : 1;
      crouch = 0.12 * tense * (1 - W.dejected) * (1 - W.celebrate);
      if (this.state === 'set') crouch += Math.sin(Math.min(1, this.t / 0.22) * Math.PI) * -0.04;
      if (this.state === 'load') crouch += 0.08 * Math.sin(clamp01(this.t / this.loadT) * Math.PI * 0.5);
      if (this.state === 'ready') crouch += Math.sin(ctx.time * 5.2) * 0.012;
      if (this.state === 'watch' || this.state === 'hold') crouch *= 0.3;
      c.offsetHips(0, -crouch, 0);
      c.bendSpine(0.32 * tense * (1 - W.dejected * 0.2), 0, 0, 1 - W.celebrate);
      c.model.updateMatrixWorld(true);
      // planted feet with side-step skips
      const lift = Math.abs(this.lateralVel) > 0.3 ? 0.07 : 0;
      for (const [s, sx, ph] of [['l', 1, 0], ['r', -1, Math.PI]]) {
        const up = lift * Math.max(0, Math.sin(this.stepPhase + ph));
        const foot = c.toWorld(sx * 0.2, 0.084 + up, 0.03, _v);
        c.legIK(s, foot, 1, c.dirToWorld(sx * 0.15, 0, 1, _w));
        c.footFlat(s, 0.8);
      }
    }

    if (W.dive > 0.01) {
      // body flight: hips placed on the ballistic path and rolled toward the dive side
      _qy.setFromAxisAngle(Y, c.yaw);
      _qr.setFromAxisAngle(Z, this.roll);
      _q.copy(_qy).multiply(_qr);
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(X, this.state === 'jump' ? -0.05 : 0.22);
      _q.multiply(pitchQ);
      let hp = this.hipsPos;
      if (this.state === 'recover') {
        const f = smooth(clamp01(this.t / 0.9));
        hp = _u.copy(this.recoverFrom).lerp(c.toWorld(0, 1.0, 0.02, _w), f);
      }
      c.setHipsWorld(hp, this.state === 'jump' ? null : _q, W.dive);
      // legs trail: straight bottom leg, top leg bent
      const top = this.side > 0 ? 'r' : 'l';
      const bot = this.side > 0 ? 'l' : 'r';
      if (this.state !== 'jump') {
        c.bend(top + 'Up', -0.55, 0, 0, W.dive);
        c.bend(top + 'Leg', 0.9, 0, 0, W.dive);
        c.bend(bot + 'Up', -0.15, 0, this.side * 0.15, W.dive);
        c.bend(bot + 'Leg', 0.2, 0, 0, W.dive);
        c.bendSpine(0.12, 0, -this.side * 0.12 * W.lie, W.dive);
      } else {
        c.bend('lUp', -0.35, 0, 0, W.dive); c.bend('rUp', -0.2, 0, 0, W.dive);
        c.bend('lLeg', 0.75, 0, 0, W.dive); c.bend('rLeg', 0.55, 0, 0, W.dive);
      }
      c.model.updateMatrixWorld(true);
    }

    // arms
    const armTarget = this.computeArmTargets(ctx, now);
    if (armTarget) {
      const { l, r: rr, w, pole } = armTarget;
      c.armIK('l', l, w, pole.l);
      c.armIK('r', rr, w, pole.r);
    }

    if (!this.holding || this.state !== 'dive') c.lookAt(bs.p, 0.85);

    // ball in the gloves
    if (this.holding) {
      const chest = c.worldPos('spine2', _v);
      const fwd = c.dirToWorld(0, 0, 1, _w);
      const hold = _u.copy(chest).addScaledVector(fwd, 0.26).add(new THREE.Vector3(0, -0.12, 0));
      if (this.state === 'dive' || this.state === 'ground') {
        const lh = c.worldPos('lHand', new THREE.Vector3()), rh = c.worldPos('rHand', new THREE.Vector3());
        hold.copy(lh).add(rh).multiplyScalar(0.5).addScaledVector(fwd, 0.06);
      }
      this.holdPoint.lerp(hold, Math.min(1, dt * 12));
    }

    this.colliders = this.buildColliders(dt);
  }

  startJump(pr) {
    const c = this.c;
    c.worldPos('hips', this.hips0);
    this.hipsPos.copy(this.hips0);
    const h = Math.max(0.15, Math.min(0.6, pr.y - 2.0 + 0.3));
    this.hipsVel.set((pr.x - c.root.position.x) * 1.5, Math.sqrt(2 * G * h), 0);
    this.state = 'jump';
    this.t = 0;
    this.side = Math.sign(pr.x - c.root.position.x) || 1;
    this.decided = true;
  }

  computeArmTargets(ctx, now) {
    const c = this.c;
    const bs = ctx.ball.state;
    const W = this.w;
    const fwd = c.dirToWorld(0, 0, 1, new THREE.Vector3());
    const poleDown = { l: c.dirToWorld(0.6, -0.8, -0.3), r: c.dirToWorld(-0.6, -0.8, -0.3) };
    if (this.holding && this.state !== 'dive') {
      const hp = this.holdPoint;
      return {
        l: hp.clone().add(c.dirToWorld(0.12, -0.02, -0.02)), r: hp.clone().add(c.dirToWorld(-0.12, -0.02, -0.02)),
        w: 1, pole: poleDown,
      };
    }
    if (this.celebrating && W.celebrate > 0.05) {
      const sh = Math.sin(ctx.time * 9) * 0.08;
      return { l: c.toWorld(0.35, 2.15 + sh, 0.1), r: c.toWorld(-0.35, 2.15 - sh, 0.1), w: W.celebrate, pole: { l: c.dirToWorld(1, 0, -0.3), r: c.dirToWorld(-1, 0, -0.3) } };
    }
    if (this.dejected && W.dejected > 0.05) {
      // hands on the hips, head shaking
      return { l: c.toWorld(0.2, 1.02, -0.02), r: c.toWorld(-0.2, 1.02, -0.02), w: W.dejected, pole: { l: c.dirToWorld(1, 0, -0.6), r: c.dirToWorld(-1, 0, -0.6) } };
    }
    if (W.dive > 0.05 && this.state !== 'recover') {
      // reach: live ball when it is close, otherwise the predicted crossing point
      const tgt = this.target;
      const reach = new THREE.Vector3(tgt ? tgt.x : bs.p.x, tgt ? tgt.y : bs.p.y, 0.25);
      const dBall = bs.p.distanceTo(c.worldPos('spine2', new THREE.Vector3()));
      if (dBall < 3.5) reach.lerp(bs.p, clamp01((3.5 - dBall) / 2.5));
      if (this.holding) reach.copy(this.holdPoint);
      const spread = this.state === 'jump' ? c.dirToWorld(0.1, 0, 0) : new THREE.Vector3(0, 0.1, 0);
      const botHand = this.side > 0 ? 'l' : 'r';
      const l = reach.clone().addScaledVector(spread, botHand === 'l' ? -1 : 1);
      const r = reach.clone().addScaledVector(spread, botHand === 'l' ? 1 : -1);
      const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(c.b.hips.getWorldQuaternion(new THREE.Quaternion()));
      const back = fwd.clone().multiplyScalar(-0.5).addScaledVector(bodyUp, -0.4);
      const w = this.state === 'ground' ? 1 - W.lie * 0.4 : Math.min(1, W.dive * 1.3);
      return { l, r, w, pole: { l: back, r: back } };
    }
    // ready position: gloves up and open in front of the waist
    const spread = 0.34;
    const h = this.state === 'ready' ? 1.02 : 1.08;
    const pr = this.target;
    const lean = pr && this.state === 'track' ? THREE.MathUtils.clamp((pr.x - c.root.position.x) * 0.2, -0.25, 0.25) : 0;
    let l = c.toWorld(spread + lean, h, 0.38);
    let r = c.toWorld(-spread + lean, h, 0.38);
    if (pr && this.state === 'track' && this.target) {
      // body save: bring the gloves to the ball's line
      const aim = new THREE.Vector3(pr.x, Math.max(0.35, Math.min(1.9, pr.y)), 0.55);
      const k = clamp01(1.2 - (pr.t - now) * 2.2);
      l.lerp(aim.clone().add(c.dirToWorld(0.1, 0, 0)), k);
      r.lerp(aim.clone().add(c.dirToWorld(-0.1, 0, 0)), k);
    }
    return { l, r, w: 0.95 * W.ready, pole: poleDown };
  }

  buildColliders(dt) {
    const c = this.c;
    const cols = c.buildColliders(COLLIDERS, dt);
    // gloves: palm centres just beyond the wrists
    for (const s of ['l', 'r']) {
      const wrist = c.worldPos(s + 'Hand', new THREE.Vector3());
      const elbow = c.worldPos(s + 'Fore', new THREE.Vector3());
      const palm = wrist.clone().addScaledVector(wrist.clone().sub(elbow).normalize(), 0.085);
      const prev = this['prevPalm' + s];
      const vel = prev && dt > 0 ? palm.clone().sub(prev).multiplyScalar(1 / dt) : new THREE.Vector3();
      if (vel.lengthSq() > 400) vel.setLength(20);
      this['prevPalm' + s] = palm.clone();
      cols.push({ a: palm, b: palm, r: 0.115, part: 'hand', side: s, owner: c, vel });
    }
    return cols;
  }

  /** Decides what happens when the ball meets a glove: catch or parry. */
  handleTouch(ballState, collider) {
    if (this.holding) return 'held';
    const c = this.c;
    const lh = c.worldPos('lHand', new THREE.Vector3()), rh = c.worldPos('rHand', new THREE.Vector3());
    const bothNear = lh.distanceTo(ballState.p) < 0.36 && rh.distanceTo(ballState.p) < 0.36;
    const speed = ballState.v.length();
    const catchable = collider.part === 'hand' && bothNear && speed < this.diff.catchSpeed && ballState.p.y < 2.35;
    const stretched = this.state === 'dive' && Math.abs(ballState.p.x - this.hipsPos.x) > 0.95;
    if (catchable && !stretched && Math.random() < 0.85) {
      this.holding = true;
      this.holdPoint.copy(ballState.p);
      return 'catch';
    }
    return 'parry';
  }

  react(outcome) {
    this.dejected = outcome === 'goal';
    this.celebrating = outcome === 'save';
  }

  releaseBall() { this.holding = false; }
}
