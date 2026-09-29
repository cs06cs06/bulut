// Ball visual + deterministic fixed-step physics (drag, Magnus, bounce with spin, posts, net, keeper, boards).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GOAL } from './goal.js';

export const BALL_R = 0.111;
const MASS = 0.43, AREA = Math.PI * BALL_R * BALL_R, RHO = 1.2, G = 9.81;
const I_SHELL = (2 / 3) * MASS * BALL_R * BALL_R;

export async function loadBallMesh() {
  const gltf = await new GLTFLoader().loadAsync('./assets/models/ball/football.gltf');
  let mesh = null;
  gltf.scene.traverse(o => { if (o.isMesh && o.parent && /inflated/i.test(o.parent.name + o.name) && !/deflated/i.test(o.parent.name + o.name)) mesh = o; });
  if (!mesh) gltf.scene.traverse(o => { if (o.isMesh) mesh = mesh || o; });
  const geo = mesh.geometry.clone();
  geo.computeBoundingSphere();
  const c = geo.boundingSphere.center.clone();
  geo.translate(-c.x, -c.y, -c.z);
  geo.computeBoundingSphere();
  const s = BALL_R / geo.boundingSphere.radius;
  geo.scale(s, s, s);
  const mat = mesh.material;
  mat.side = THREE.FrontSide;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  mat.envMapIntensity = 1.2;
  mat.roughness = 1.0;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float m = smoothstep(0.10, 0.36, l);
        vec3 white = vec3(0.86, 0.86, 0.88) * (0.90 + 0.25 * l);
        vec3 black = vec3(0.025, 0.025, 0.03) * (0.7 + l * 2.0);
        diffuseColor.rgb = mix(black, white, m);
      }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor * 0.55 + 0.12, 0.0, 1.0);`);
  };
  return m;
}

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = v3(), _b = v3(), _c = v3(), _d = v3(), _e = v3();

function closestOnSegment(p, a, b, out) {
  _a.copy(b).sub(a); const l2 = _a.lengthSq();
  let t = l2 > 1e-9 ? _b.copy(p).sub(a).dot(_a) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return out.copy(a).addScaledVector(_a, t);
}

export class BallPhysics {
  constructor(goal) {
    this.goal = goal;
    this.p = v3(0, BALL_R, 11); this.v = v3(); this.w = v3();
    this.q = new THREE.Quaternion();
    this.events = [];
    this.state = 'rest';           // rest | flight | held | dead
    this.time = 0;
    this.touchedKeeper = false; this.hitPost = false; this.hitBar = false; this.scored = false; this.crossed = false;
    this.rngState = 1;
    this.heldBy = null; this.heldOffset = v3();
    this.bounces = 0;
    this.lastKeeperContact = -1;
    this.trail = [];
    this.prevP = v3();
  }
  seed(s) { this.rngState = (s >>> 0) || 1; }
  rand() { this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0; return this.rngState / 4294967296; }
  reset(pos) {
    this.p.copy(pos); this.v.set(0, 0, 0); this.w.set(0, 0, 0); this.state = 'rest'; this.time = 0;
    this.touchedKeeper = false; this.hitPost = false; this.hitBar = false; this.scored = false; this.crossed = false; this.heldBy = null; this.bounces = 0;
    this.q.identity(); this.events.length = 0; this.prevP.copy(pos); this.netHit = false; this.missWide = false;
    this.netSides = new Map(); this.crossT = undefined; this.touchT = undefined; this.postT = undefined;
  }
  launch(vel, spin) { this.v.copy(vel); this.w.copy(spin); this.state = 'flight'; this.time = 0; }

  accel(p, v, w, out) {
    const sp = v.length();
    out.set(0, -G, 0);
    if (sp > 1e-3) {
      const cd = 0.22 + 0.25 * Math.exp(-Math.pow(sp / 9, 2));
      out.addScaledVector(v, -0.5 * RHO * cd * AREA * sp / MASS);
      const wl = w.length();
      if (wl > 1e-3) {
        const S = BALL_R * wl / sp;
        const cl = 1.25 * S / (1 + 1.6 * S);
        _c.crossVectors(w, v);
        const cl2 = _c.length();
        if (cl2 > 1e-6) out.addScaledVector(_c, 0.5 * RHO * AREA * cl * sp / MASS / (wl));
      }
    }
    return out;
  }

  // integrate one fixed step. ctx: { keeper: {colliders, prev, dt} , alpha }
  step(h, ctx) {
    if (this.state === 'rest' || this.state === 'dead') return;
    this.time += h;
    if (this.state === 'held') {
      const hc = ctx && ctx.keeper && ctx.keeper.heldPoint;
      if (hc) this.p.copy(hc);
      this.v.set(0, 0, 0);
      return;
    }
    this.prevP.copy(this.p);
    // semi-implicit RK-ish (midpoint)
    const a1 = this.accel(this.p, this.v, this.w, _d).clone();
    const vm = _e.copy(this.v).addScaledVector(a1, h * 0.5);
    const pm = _a.copy(this.p).addScaledVector(this.v, h * 0.5);
    const a2 = this.accel(pm, vm, this.w, _d);
    this.v.addScaledVector(a2, h);
    this.p.addScaledVector(vm, h);
    // spin decay
    this.w.multiplyScalar(1 - 0.06 * h);
    this.collideGround(h);
    this.collideGoal(h);
    if (ctx && ctx.keeper) this.collideKeeper(h, ctx);
    this.collideBoards();
    this.checkLine();
    // orientation
    const wl = this.w.length();
    if (wl > 1e-4) { _b.copy(this.w).divideScalar(wl); this.q.premultiply(new THREE.Quaternion().setFromAxisAngle(_b, wl * h)); }
    if (this.p.y < -2 || this.time > 9 || this.p.z > 140) this.state = 'dead';
  }

  collideGround(h) {
    const r = BALL_R;
    if (this.p.y > r) return;
    this.p.y = r;
    const vn = this.v.y;
    if (vn < 0) {
      const e = Math.max(0.15, 0.62 - 0.012 * Math.abs(vn));
      const Jn = -(1 + e) * MASS * vn;
      // contact point velocity (tangential)
      const cr = v3(0, -r, 0);
      _b.crossVectors(this.w, cr);                     // w x r_c
      _c.set(this.v.x + _b.x, 0, this.v.z + _b.z);     // slip velocity
      const us = _c.length();
      this.v.y = -vn * e;
      if (us > 1e-4) {
        const Jt = Math.min(0.42 * Jn, (MASS * us) / (1 + MASS * r * r / I_SHELL));
        _c.multiplyScalar(-Jt / us);                  // impulse vector
        this.v.x += _c.x / MASS; this.v.z += _c.z / MASS;
        // torque = r_c x J
        _d.crossVectors(cr, _c);
        this.w.addScaledVector(_d, 1 / I_SHELL);
      }
      if (Math.abs(vn) > 1.2) this.events.push({ type: 'bounce', speed: Math.abs(vn), pos: this.p.clone() });
      this.bounces++;
    } else if (this.v.y < 0.5) this.v.y = Math.max(this.v.y, 0);
    // rolling: friction toward rolling constraint + rolling resistance
    if (Math.abs(this.v.y) < 0.8) {
      const hv = Math.hypot(this.v.x, this.v.z);
      const rollW = v3(this.v.z / r, 0, -this.v.x / r);   // w for pure rolling (y up): w = (n x v)/r with n=(0,1,0) -> (vz/r, 0, -vx/r)
      this.w.lerp(rollW, Math.min(1, 6 * h));
      if (hv > 1e-3) { const dec = Math.min(hv, (0.55 + 0.12 * hv) * h); this.v.x -= (this.v.x / hv) * dec; this.v.z -= (this.v.z / hv) * dec; }
      if (hv < 0.06 && Math.abs(this.v.y) < 0.2 && this.time > 0.6) { this.v.set(0, 0, 0); this.w.multiplyScalar(0.9); }
    }
  }

  collideCapsule(a, b, R, e, name, fric = 0.25) {
    closestOnSegment(this.p, a, b, _d);
    _e.copy(this.p).sub(_d);
    const d = _e.length(), rr = BALL_R + R;
    if (d >= rr || d < 1e-6) return false;
    _e.divideScalar(d);
    this.p.copy(_d).addScaledVector(_e, rr);
    const vn = this.v.dot(_e);
    if (vn < 0) {
      const sp = -vn;
      this.v.addScaledVector(_e, -(1 + e) * vn);
      // friction on tangential component + spin exchange
      _c.copy(this.v).addScaledVector(_e, -this.v.dot(_e));
      this.v.addScaledVector(_c, -fric * 0.5);
      this.w.addScaledVector(_b.crossVectors(_e, _c).multiplyScalar(-0.6 / BALL_R), 0.5);
      this.events.push({ type: name, speed: sp, pos: this.p.clone() });
    }
    return true;
  }

  collideGoal(h) {
    const g = this.goal;
    if (!g) return;
    // posts / bar
    for (let i = 0; i < g.capsules.length; i++) {
      const [a, b, R] = g.capsules[i];
      if (this.collideCapsule(a, b, R, 0.62, i === 2 ? 'bar' : 'post', 0.15)) { if (i === 2) this.hitBar = true; else this.hitPost = true; }
    }
    // nets: soft membranes (spring + damper). The side the ball first touched is remembered so it can't tunnel out.
    if (!this.netSides) this.netSides = new Map();
    for (const P of g.panels) {
      const pr = P.project(this.p);
      const dist = pr.dist;
      const inBounds = pr.u > -0.02 && pr.u < 1.02 && pr.v > -0.02 && pr.v < 1.02;
      let side = this.netSides.get(P);
      if (side === undefined) {
        if (!inBounds || Math.abs(dist) > BALL_R) continue;
        const pd = P.project(this.prevP).dist;
        side = (Math.abs(pd) > 1e-4 ? pd : dist) >= 0 ? 1 : -1;
        this.netSides.set(P, side);
      }
      const ds = dist * side;
      if (ds > BALL_R + 0.25 || !inBounds && ds > 0) { this.netSides.delete(P); continue; }
      const pen = BALL_R - ds;
      if (pen <= 0) continue;
      const nn = _e.copy(P.n).multiplyScalar(side);
      const va = this.v.dot(nn);
      const k = 2100, c = 42;
      const acc = (k * pen - c * Math.min(0, va)) / MASS;
      this.v.addScaledVector(nn, acc * h);
      this.v.multiplyScalar(1 - 1.4 * h);
      const netD = dist - side * BALL_R;
      P.press(this.p, 0.5, netD);
      if (!this.netHit && this.p.z < 0) { this.netHit = true; this.events.push({ type: 'net', speed: this.v.length(), pos: this.p.clone() }); }
      if (pen > 0.5) this.p.addScaledVector(nn, pen - 0.5);
    }
  }

  collideKeeper(h, ctx) {
    const K = ctx.keeper, cols = K.colliders, prev = K.prev, alpha = ctx.alpha;
    if (!cols) return;
    for (let i = 0; i < cols.length; i++) {
      const [name, a, b, R, isHand] = cols[i];
      let A = a, B = b;
      if (prev && prev[i]) { A = _a.copy(prev[i][1]).lerp(a, alpha); B = _b.copy(prev[i][2]).lerp(b, alpha); A = A.clone(); B = B.clone(); }
      closestOnSegment(this.p, A, B, _c);
      const d = _e.copy(this.p).sub(_c).length();
      if (d >= BALL_R + R || d < 1e-6) continue;
      // velocity of the collider surface
      let vq = _d.set(0, 0, 0);
      if (prev && prev[i] && K.dt) {
        const qa = closestOnSegment(this.p, prev[i][1], prev[i][2], v3());
        vq = v3().copy(_c).sub(qa).divideScalar(K.dt);
      }
      const n = _e.clone().divideScalar(d);
      this.p.copy(_c).addScaledVector(n, BALL_R + R);
      const rel = this.v.clone().sub(vq);
      const vn = rel.dot(n);
      if (vn >= 0) continue;
      const sp = -vn;
      const first = !this.touchedKeeper;
      this.touchedKeeper = true;
      if (this.time - this.lastKeeperContact > 0.05) this.events.push({ type: 'keeper', part: name, speed: sp, pos: this.p.clone() });
      this.lastKeeperContact = this.time;
      if (isHand && !this.heldBy) {
        // catch chance depends on impact speed
        const limit = 12 + this.rand() * 9;
        if (sp < limit && K.canCatch !== false) {
          this.state = 'held'; this.heldBy = name; this.v.set(0, 0, 0); this.w.set(0, 0, 0);
          this.events.push({ type: 'catch', part: name, speed: sp, pos: this.p.clone() });
          return;
        }
        // parry: soft deflection
        const e = 0.28;
        rel.addScaledVector(n, -(1 + e) * vn);
        rel.multiplyScalar(0.72);
        this.v.copy(rel).add(vq);
        this.v.y += 1.5 + this.rand() * 2.0;
        this.events.push({ type: 'parry', part: name, speed: sp, pos: this.p.clone() });
      } else {
        const e = isHand ? 0.3 : 0.42;
        rel.addScaledVector(n, -(1 + e) * vn);
        this.v.copy(rel).add(vq);
      }
      this.w.multiplyScalar(0.6);
    }
  }

  collideBoards() {
    // advertising boards behind the goal
    if (this.p.z < -6.5 + BALL_R && this.p.y < 0.95 && this.v.z < 0 && this.state === 'flight') {
      this.p.z = -6.5 + BALL_R; this.v.z *= -0.35; this.v.x *= 0.7; this.events.push({ type: 'board', speed: Math.abs(this.v.z), pos: this.p.clone() });
    }
  }

  checkLine() {
    if (this.crossed) return;
    if (this.p.z < -BALL_R && this.prevP.z >= -BALL_R) {
      // interpolate crossing point
      const t = (this.prevP.z + BALL_R) / (this.prevP.z - this.p.z || 1);
      const x = this.prevP.x + (this.p.x - this.prevP.x) * t, y = this.prevP.y + (this.p.y - this.prevP.y) * t;
      this.crossed = true; this.crossPoint = v3(x, y, -BALL_R);
      if (Math.abs(x) < GOAL.halfW - 0.005 && y < GOAL.h - 0.005) { this.scored = true; this.events.push({ type: 'goal', pos: this.crossPoint.clone(), speed: this.v.length() }); }
      else this.events.push({ type: 'out', pos: this.crossPoint.clone(), speed: this.v.length() });
    }
  }
}

/* ------------- trajectory prediction / shot solver ------------- */
export function simulateToGoal(start, vel, spin, goal, opts = {}) {
  const ph = new BallPhysics(goal);
  ph.reset(start); ph.launch(vel, spin);
  const h = 1 / 240;
  let best = null;
  for (let i = 0; i < 240 * 2; i++) {
    const prevZ = ph.p.z;
    ph.step(h, null);
    if (ph.p.z <= 0 && prevZ > 0) { const t = prevZ / (prevZ - ph.p.z); best = { x: ph.prevP.x + (ph.p.x - ph.prevP.x) * t, y: ph.prevP.y + (ph.p.y - ph.prevP.y) * t, t: ph.time - h + h * t }; break; }
    if (ph.state === 'dead') break;
  }
  return best;
}

// find the launch velocity so that (with spin) the ball crosses z=0 at (tx,ty). Returns { vel, spin, arrive }
export function solveShot(start, target, speed, spin, goal) {
  const aim = target.clone();
  let res = null;
  for (let it = 0; it < 7; it++) {
    const dir = v3(aim.x - start.x, aim.y - start.y, aim.z - start.z).normalize();
    // account for gravity drop roughly by raising direction
    const vel = dir.multiplyScalar(speed);
    res = simulateToGoal(start, vel, spin, null);
    if (!res) break;
    const ex = target.x - res.x, ey = target.y - res.y;
    if (Math.abs(ex) < 0.004 && Math.abs(ey) < 0.004) return { vel, arrive: res.t, hit: res };
    aim.x += ex * 1.0; aim.y += ey * 1.0;
    // keep the aim point on the goal plane
    aim.z = target.z;
    var last = { vel, arrive: res.t, hit: res };
  }
  return last || (res ? { vel: v3(target.x - start.x, target.y - start.y, target.z - start.z).normalize().multiplyScalar(speed), arrive: res.t, hit: res } : { vel: v3(0, 0, -speed), arrive: 0.5, hit: null });
}
