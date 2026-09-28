import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);

// Kicking-foot (ankle) path in the kicker's frame: x = left, y = up, z = forward.
// The ball sits at BALL_LOCAL when the plant foot lands.
const BALL_LOCAL = new THREE.Vector3(-0.2, 0.11, 0.4);
const FOOT_KEYS = [
  [0.0, new THREE.Vector3(-0.12, 0.2, -0.3)],
  [0.3, new THREE.Vector3(-0.15, 0.6, -0.5)],
  [0.47, new THREE.Vector3(BALL_LOCAL.x + 0.03, 0.14, BALL_LOCAL.z - 0.15)],
  [0.62, new THREE.Vector3(-0.1, 0.5, 0.7)],
  [0.78, new THREE.Vector3(-0.08, 0.7, 0.8)],
  [1.0, new THREE.Vector3(-0.12, 0.1, 0.72)],
];
export const CONTACT_T = 0.47;

function sampleKeys(keys, t) {
  if (t <= keys[0][0]) return keys[0][1].clone();
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const pm = keys[Math.max(0, i - 1)][1], pn = keys[Math.min(keys.length - 1, i + 2)][1];
      // Catmull-Rom
      const u2 = u * u, u3 = u2 * u;
      return new THREE.Vector3(
        0.5 * (2 * p0.x + (-pm.x + p1.x) * u + (2 * pm.x - 5 * p0.x + 4 * p1.x - pn.x) * u2 + (-pm.x + 3 * p0.x - 3 * p1.x + pn.x) * u3),
        0.5 * (2 * p0.y + (-pm.y + p1.y) * u + (2 * pm.y - 5 * p0.y + 4 * p1.y - pn.y) * u2 + (-pm.y + 3 * p0.y - 3 * p1.y + pn.y) * u3),
        0.5 * (2 * p0.z + (-pm.z + p1.z) * u + (2 * pm.z - 5 * p0.z + 4 * p1.z - pn.z) * u2 + (-pm.z + 3 * p0.z - 3 * p1.z + pn.z) * u3),
      );
    }
  }
  return keys[keys.length - 1][1].clone();
}

/**
 * The free-kick taker: waits beside the ball, short curved run-up (run clip), plants the
 * standing foot next to the ball and strikes through it with a procedurally keyed swing.
 */
export class Kicker {
  constructor(character) {
    this.c = character;
    this.state = 'idle';
    this.t = 0;
    this.kickW = 0;
    this.react = null;
    this.reactW = 0;
  }

  setup(ballPos, dir) {
    this.ball = ballPos.clone();
    this.dir = dir.clone().setY(0).normalize();
    this.left = new THREE.Vector3(this.dir.z, 0, -this.dir.x);
    this.start = this.ball.clone().addScaledVector(this.dir, -2.0).addScaledVector(this.left, 1.25).setY(0);
    this.plantRoot = this.ball.clone().addScaledVector(this.dir, -BALL_LOCAL.z).addScaledVector(this.left, -BALL_LOCAL.x).setY(0);
    this.plantFoot = this.ball.clone().addScaledVector(this.left, 0.24).addScaledVector(this.dir, -0.1).setY(0.084);
    this.kickYaw = Math.atan2(this.dir.x, this.dir.z);
    this.c.root.position.copy(this.start);
    const toBall = this.ball.clone().sub(this.start);
    this.c.setYaw(Math.atan2(toBall.x, toBall.z));
    this.state = 'idle';
    this.t = 0;
    this.kickW = 0;
    this.react = null;
    this.reactW = 0;
    this.contactDone = false;
    this.stopped = false;
    this.c.blendTo({ idle: 1 }, 30);
    for (const a of Object.values(this.c.actions)) a.timeScale = 1;
  }

  /** Starts the run-up; onContact fires when the boot meets the ball. */
  go(onContact, onStep) {
    this.state = 'run';
    this.t = 0;
    this.onContact = onContact;
    this.onStep = onStep;
    this.runT = 0.46;
    this.kickT = 0.5;
    this.c.blendTo({ run: 1 }, 18);
    this.c.actions.run.time = 0.12;
    this.c.actions.run.timeScale = 1.25;
    this.stepCount = 0;
  }

  setReaction(kind) {
    this.react = kind;
    if (kind === 'goal' && this.state === 'after') { this.state = 'celebrate'; this.t = 0; this.c.blendTo({ run: 1 }, 5); }
    if (kind === 'goal') {
      // wheel away toward the nearer touchline, then slow down with the fists up
      const side = Math.sign(this.ball.x || 1) || 1;
      this.celebFrom = this.c.root.position.clone();
      this.celebDir = new THREE.Vector3(side * 0.85, 0, 0.5).normalize();
    }
  }

  /** Airplane run away from goal, slowing into a fist-pumping stop. */
  celebrate(dt) {
    const c = this.c;
    const u = clamp01(this.t / 2.6);
    const speed = 5.2 * (1 - smooth(clamp01((u - 0.55) / 0.45)));
    c.root.position.addScaledVector(this.celebDir, speed * dt);
    const yaw = Math.atan2(this.celebDir.x, this.celebDir.z);
    c.setYaw(c.yaw + (yaw - c.yaw) * Math.min(1, dt * 5));
    c.actions.run.timeScale = 0.6 + speed / 5.2 * 0.6;
    if (u > 0.8 && !this.stopped) { this.stopped = true; c.blendTo({ idle: 1 }, 4); }
  }

  update(dt, ctx) {
    const c = this.c;
    this.t += dt;
    const r = c.root.position;
    if (this.state === 'run') {
      const u = clamp01(this.t / this.runT);
      // gentle curve into the ball
      const lin = this.start.clone().lerp(this.plantRoot, smooth(u) * 0.35 + u * 0.65);
      const bow = Math.sin(u * Math.PI) * 0.18;
      lin.addScaledVector(this.left, bow);
      r.copy(lin);
      const toBall = this.plantRoot.clone().sub(this.start);
      const yRun = Math.atan2(toBall.x, toBall.z);
      c.setYaw(yRun + (this.kickYaw - yRun) * smooth(u) * 0.7);
      const steps = Math.floor(this.t / 0.16);
      if (steps > this.stepCount) { this.stepCount = steps; this.onStep?.(steps); }
      if (u >= 1) { this.state = 'kick'; this.t = 0; c.blendTo({ idle: 0.15 }, 14); this.onStep?.(9); }
    } else if (this.state === 'kick') {
      const k = clamp01(this.t / this.kickT);
      if (!this.contactDone && k >= CONTACT_T) { this.contactDone = true; this.onContact?.(); }
      if (k > 0.5) {
        const f = smooth(clamp01((k - 0.5) / 0.5));
        r.copy(this.plantRoot).addScaledVector(this.dir, f * 0.55);
      } else r.copy(this.plantRoot);
      c.setYaw(this.kickYaw + THREE.MathUtils.lerp(0.3, -0.05, smooth(k)));
      if (k >= 1) {
        // carry the momentum: a few decelerating steps instead of freezing on the spot
        this.state = 'follow'; this.t = 0;
        c.blendTo({ walk: 1 }, 8);
        c.actions.walk.time = 0.3;
        c.actions.walk.timeScale = 1.35;
      }
    } else if (this.state === 'follow') {
      const u = clamp01(this.t / 0.75);
      r.addScaledVector(this.dir, 2.1 * (1 - u) * dt);
      c.actions.walk.timeScale = 1.35 * (1 - u * 0.7);
      if (u >= 1) { this.state = this.react === 'goal' ? 'celebrate' : 'after'; this.t = 0; c.blendTo(this.react === 'goal' ? { run: 1 } : { idle: 1 }, 4); }
    } else if (this.state === 'celebrate') {
      this.celebrate(dt);
    }
    c.updateMixer(dt);

    const kicking = this.state === 'kick';
    this.kickW += ((kicking ? 1 : 0) - this.kickW) * Math.min(1, dt * (kicking ? 30 : 4));
    const W = this.kickW;
    const k = kicking ? clamp01(this.t / this.kickT) : 1;

    if (W > 0.01) {
      // torso: coil on the back-swing, drive through contact
      const twist = kicking ? THREE.MathUtils.lerp(-0.35, 0.45, smooth(clamp01((k - 0.15) / 0.6))) : 0.4;
      const lean = kicking ? (k < CONTACT_T ? -0.1 * (k / CONTACT_T) : THREE.MathUtils.lerp(-0.1, 0.3, clamp01((k - CONTACT_T) / 0.4))) : 0.2;
      c.offsetHips(0, -0.07 * W, 0);
      c.bend('hips', 0, twist * 0.5 * W, 0);
      c.bendSpine(lean, twist * 0.6, -0.22, W);
      c.model.updateMatrixWorld(true);
      // standing foot planted beside the ball
      const plantW = W * (k < 0.82 ? 1 : 1 - (k - 0.82) / 0.18);
      c.legIK('l', this.plantFoot, plantW, c.dirToWorld(0.1, 0, 1, _w));
      c.footFlat('l', plantW * 0.9);
      // kicking foot along the keyed swing
      const fl = sampleKeys(FOOT_KEYS, k);
      const ft = c.toWorld(fl.x, fl.y, fl.z, _v);
      // express the swing relative to the plant root so root motion doesn't drag it
      if (k > 0.5) {
        const f = smooth(clamp01((k - 0.5) / 0.5));
        ft.addScaledVector(this.dir, -f * 0.55 * 0.4);
      }
      // lock the strike onto the real ball around contact
      const contactW = Math.exp(-Math.pow((k - CONTACT_T) / 0.09, 2));
      const cp = new THREE.Vector3().copy(this.ball).addScaledVector(this.dir, -0.15).setY(0.14);
      ft.lerp(cp, contactW);
      c.legIK('r', ft, W, c.dirToWorld(-0.15, -0.2, 1, _w));
      // instep: toes pointed through the strike
      const pitch = k < CONTACT_T ? -0.5 : THREE.MathUtils.lerp(-0.6, 0.0, clamp01((k - CONTACT_T) / 0.5));
      c.footFlat('r', W * 0.85, pitch);
      c.model.updateMatrixWorld(true);
      // balance arms
      const la = c.toWorld(0.68, 1.35 + (k > CONTACT_T ? 0.08 : 0), 0.1 + k * 0.2);
      const ra = c.toWorld(-0.42, 1.0 + k * 0.35, THREE.MathUtils.lerp(-0.3, 0.35, smooth(k)));
      c.armIK('l', la, W * 0.9, c.dirToWorld(0.3, -1, -0.3));
      c.armIK('r', ra, W * 0.8, c.dirToWorld(-0.3, -1, -0.3));
    }

    // reactions once the shot is decided
    const reacting = this.react && (this.state === 'after' || this.state === 'celebrate');
    this.reactW += ((reacting ? 1 : 0) - this.reactW) * Math.min(1, dt * 3);
    if (this.reactW > 0.01 && reacting) {
      const RW = this.reactW;
      if (this.react === 'goal' && this.state === 'celebrate' && !this.stopped) {
        // arms out like wings, leaning into the turn
        const flap = Math.sin(ctx.time * 3) * 0.06;
        c.armIK('l', c.toWorld(0.95, 1.38 + flap, -0.12), RW, c.dirToWorld(0, -1, -0.4));
        c.armIK('r', c.toWorld(-0.95, 1.38 - flap, -0.12), RW, c.dirToWorld(0, -1, -0.4));
        c.bendSpine(-0.12, 0, -Math.sign(this.celebDir.x) * 0.18, RW);
      } else if (this.react === 'goal') {
        const bounce = Math.abs(Math.sin(ctx.time * 7));
        c.root.position.y = bounce * 0.18 * RW;
        c.armIK('l', c.toWorld(0.32, 2.2 + bounce * 0.05, 0.12), RW, c.dirToWorld(1, 0, -0.3));
        c.armIK('r', c.toWorld(-0.32, 2.2 + bounce * 0.05, 0.12), RW, c.dirToWorld(-1, 0, -0.3));
        c.bendSpine(-0.2, 0, 0, RW);
      } else if (this.react === 'miss') {
        const head = c.worldPos('head', _v);
        c.armIK('l', head.clone().add(c.dirToWorld(0.12, 0.14, 0.02)), RW, c.dirToWorld(1, 0.3, 0));
        c.armIK('r', head.clone().add(c.dirToWorld(-0.12, 0.14, 0.02)), RW, c.dirToWorld(-1, 0.3, 0));
        c.bendSpine(-0.1, 0, 0, RW);
      } else if (this.react === 'close') {
        c.armIK('l', c.toWorld(0.3, 1.2, 0.3), RW, c.dirToWorld(1, -0.5, -0.3));
        c.armIK('r', c.toWorld(-0.3, 1.2, 0.3), RW, c.dirToWorld(-1, -0.5, -0.3));
        c.bendSpine(0.35, 0, 0, RW);
      }
    } else {
      c.root.position.y = 0;
    }
    if (this.state === 'celebrate') c.lookAt(ctx.camera || ctx.ball.state.p, 0.35);
    else if (this.state !== 'kick') c.lookAt(ctx.ball.state.p, 0.7);
    else c.lookAt(ctx.ball.state.p, k < CONTACT_T ? 0.9 : 0.5);
  }
}
