import * as THREE from 'three';
import { BALL, PHYS, FIELD } from './config.js';

const R = BALL.radius;
const _rel = new THREE.Vector3();
const _a = new THREE.Vector3();
const _m = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _roll = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class BallState {
  constructor() {
    this.p = new THREE.Vector3(0, R, 20);
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
    this.knuckle = 0;      // 0..1 strength of the knuckle wobble
    this.knucklePhase = 0;
    this.onGround = true;
  }
  copy(o) {
    this.p.copy(o.p); this.v.copy(o.v); this.w.copy(o.w);
    this.knuckle = o.knuckle; this.knucklePhase = o.knucklePhase; this.onGround = o.onGround;
    return this;
  }
}

/**
 * Integrates one fixed sub-step of ball flight: gravity, quadratic drag against the
 * relative wind, Magnus lift from spin, optional knuckle wobble, and grass contact.
 * Returns the vertical impact speed when the ball bounced this step (for audio), else 0.
 */
export function stepBall(s, dt, wind, time = 0) {
  const { p, v, w } = s;
  _rel.copy(v);
  if (wind) _rel.sub(wind);
  const speed = _rel.length();

  _a.copy(_rel).multiplyScalar(-PHYS.dragK * speed);
  _m.crossVectors(w, _rel).multiplyScalar(PHYS.magnus);
  _a.add(_m);
  _a.y -= PHYS.gravity;

  if (s.knuckle > 0 && speed > 12 && p.y > R + 0.05) {
    // low-spin "knuckleball": unstable wake produces a wandering lateral force
    const k = s.knuckle * Math.min(1, (speed - 12) / 12) * 5.5;
    const ph = s.knucklePhase + time * 7.3;
    _a.x += Math.sin(ph) * Math.cos(ph * 0.37 + 1.3) * k;
    _a.y += Math.sin(ph * 1.71 + 0.6) * k * 0.55;
  }

  v.addScaledVector(_a, dt);
  p.addScaledVector(v, dt);
  w.multiplyScalar(Math.exp(-PHYS.spinDecay * dt));

  let impact = 0;
  if (p.y < R) {
    p.y = R;
    if (v.y < -0.6) {
      impact = -v.y;
      v.y = -v.y * PHYS.groundRestitution;
      // friction at the contact patch couples spin and horizontal speed
      const f = PHYS.groundFriction;
      _roll.crossVectors(UP, v).multiplyScalar(1 / R); // rolling spin for current velocity
      w.lerp(_roll, 0.45);
      w.y *= 0.6;
      v.x *= 1 - f * 0.35; v.z *= 1 - f * 0.35;
      s.onGround = false;
    } else {
      v.y = 0;
      s.onGround = true;
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0) {
        const dec = (PHYS.rollingResistance + hs * 0.12) * dt;
        const k = Math.max(0, hs - dec) / hs;
        v.x *= k; v.z *= k;
      }
      _roll.crossVectors(UP, v).multiplyScalar(1 / R);
      w.lerp(_roll, Math.min(1, dt * 12));
    }
  } else if (p.y > R + 0.01) {
    s.onGround = false;
  }
  return impact;
}

/** Segment-sphere helper: closest point on segment ab to p, written to out. */
export function closestOnSegment(p, a, b, out) {
  _t.subVectors(b, a);
  const len2 = _t.lengthSq();
  let t = len2 > 0 ? _c.subVectors(p, a).dot(_t) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return out.copy(a).addScaledVector(_t, t);
}

// Goal frame: two posts + crossbar, expressed as capsules.
const hw = FIELD.goalHalfWidth + FIELD.postRadius;
const top = FIELD.goalHeight + FIELD.postRadius;
export const GOAL_FRAME = [
  { a: new THREE.Vector3(-hw, 0, 0), b: new THREE.Vector3(-hw, top, 0), r: FIELD.postRadius, part: 'post' },
  { a: new THREE.Vector3(hw, 0, 0), b: new THREE.Vector3(hw, top, 0), r: FIELD.postRadius, part: 'post' },
  { a: new THREE.Vector3(-hw, top, 0), b: new THREE.Vector3(hw, top, 0), r: FIELD.postRadius, part: 'bar' },
];

/**
 * Resolves ball vs. capsule. `vel` is the collider's own velocity (moving limbs).
 * Returns the relative normal speed of the impact (0 when there was no contact).
 */
export function collideCapsule(s, cap, restitution, vel) {
  closestOnSegment(s.p, cap.a, cap.b, _c);
  _n.subVectors(s.p, _c);
  const d = _n.length();
  const minD = R + cap.r;
  if (d >= minD || d < 1e-6) return 0;
  _n.multiplyScalar(1 / d);
  s.p.copy(_c).addScaledVector(_n, minD + 1e-4);
  _rel.copy(s.v);
  if (vel) _rel.sub(vel);
  const vn = _rel.dot(_n);
  if (vn >= 0) return 0;
  // reflect relative velocity, damp tangential part a little
  _t.copy(_rel).addScaledVector(_n, -vn);
  _rel.copy(_t).multiplyScalar(0.86).addScaledVector(_n, -vn * restitution);
  if (vel) _rel.add(vel);
  s.v.copy(_rel);
  // glancing contact adds spin
  _m.crossVectors(_n, _t).multiplyScalar(-0.6 / R);
  s.w.multiplyScalar(0.55).add(_m.multiplyScalar(0.25));
  return -vn;
}

/** Advertising boards behind the goal line and along the touchlines. */
export function collideBoards(s) {
  const p = s.p, v = s.v;
  if (p.y < 0.9 + R) {
    if (p.z < -5.14 + R && p.z > -5.6 && Math.abs(p.x) < 28 && v.z < 0) { p.z = -5.14 + R; v.z = -v.z * 0.4; v.x *= 0.8; return true; }
    if (Math.abs(p.x) > 37.44 - R && Math.abs(p.x) < 38 && p.z > -2 && p.z < 78 && Math.sign(v.x) === Math.sign(p.x)) { p.x = Math.sign(p.x) * (37.44 - R); v.x = -v.x * 0.4; return true; }
  }
  return false;
}

export function collideGoalFrame(s) {
  let best = null;
  for (const cap of GOAL_FRAME) {
    const imp = collideCapsule(s, cap, PHYS.postRestitution, null);
    if (imp > 0 && (!best || imp > best.impact)) best = { impact: imp, part: cap.part };
  }
  return best;
}

/**
 * Forward-simulates a shot until it reaches the goal plane (z = 0) and returns where it
 * crossed. Used by the aim solver and by the goalkeeper's prediction.
 */
const _sim = new BallState();
export function predictGoalPlane(state, wind, spinScale = 1, maxT = 4, dt = 1 / 120) {
  const s = _sim.copy(state);
  s.w.multiplyScalar(spinScale);
  s.knuckle = 0;
  let t = 0;
  let prevZ = s.p.z, prevX = s.p.x, prevY = s.p.y;
  while (t < maxT) {
    stepBall(s, dt, wind, t);
    t += dt;
    if (s.p.z <= 0 && prevZ > 0) {
      const f = prevZ / (prevZ - s.p.z);
      return {
        x: prevX + (s.p.x - prevX) * f,
        y: prevY + (s.p.y - prevY) * f,
        t: t - dt * (1 - f),
        speed: s.v.length(),
        reached: true,
      };
    }
    prevZ = s.p.z; prevX = s.p.x; prevY = s.p.y;
    if (s.onGround && s.v.lengthSq() < 0.04) break;
    if (s.p.z > prevZ + 0.5) break;
  }
  return { x: s.p.x, y: s.p.y, t, speed: s.v.length(), reached: false };
}

/** Samples a trajectory (for aim-assist previews and the keeper's read). */
export function sampleTrajectory(state, wind, duration, dt = 1 / 60) {
  const s = _sim.copy(state);
  const pts = [];
  for (let t = 0; t < duration; t += dt) {
    stepBall(s, dt, wind, t);
    pts.push(s.p.clone());
    if (s.p.z < -1) break;
  }
  return pts;
}
