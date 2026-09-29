// Kicker and goalkeeper controllers: mocap run cycle + IK/procedural overlays, all driven by explicit time.
import * as THREE from 'three';
import { loadCharacterBase, createCharacter } from './character.js';
import { Rig, Retargeter, qAxis, X, Y, Z, DEG } from './anim.js';

const HIP_Y = 1.019;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const eulerQ = (rx, ry, rz) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * DEG, ry * DEG, rz * DEG, 'YXZ'));
const RX = d => qAxis(X, d), RY = d => qAxis(Y, d), RZ = d => qAxis(Z, d);

export class Actor {
  constructor(kitKey, opts = {}) {
    this.group = createCharacter(kitKey, opts);
    this.kit = this.group.userData.kit;
    this.root = new THREE.Group();          // world placement (yaw + position)
    this.root.add(this.group);
    this.model = this.group.children[0];
    this.rig = new Rig(this.model);
    const B = this.base = arguments[2] || null;
    this.rt = null; this.rtDance = null;
    this.yaw = 0;
    this.tmpQ = Q(); this.tmpV = V();
    this.faceState = { smile: 0, open: 0 };
  }
  attachAnimations(B) {
    this.rt = new Retargeter(B.xbot.scene, B.xbot.animations, this.rig);
    this.rtDance = new Retargeter(B.michelle.scene, B.michelle.animations, this.rig);
    this.active = this.rt;
  }
  place(x, z, yaw, y = 0) { this.root.position.set(x, y, z); this.root.rotation.set(0, yaw, 0); this.yaw = yaw; this.root.updateMatrixWorld(true); }
  toModel(w) { this.model.updateWorldMatrix(true, false); return this.model.worldToLocal(w.clone()); }
  toWorld(m) { this.model.updateWorldMatrix(true, false); return this.model.localToWorld(m.clone()); }
  bonePos(name) { this.rig.computePositions(); return this.rig.pos[this.rig.index[name]].clone(); }
  boneWorld(name) { return this.toWorld(this.bonePos(name)); }
  setFace(smile, open) {
    this.faceState.smile = smile; this.faceState.open = open;
    this.group.userData.morph('mouthSmile', smile); this.group.userData.morph('mouthOpen', open);
  }
  // look-at: rotate head/neck so the face points to a model-space target
  lookAt(targetModel, w = 0.8, maxDeg = 55) {
    const r = this.rig;
    r.computePositions();
    const hp = r.pos[r.index.Head].clone().add(V(0, 0.08, 0.03));
    const dir = targetModel.clone().sub(hp).normalize();
    const f0 = V(0, 0, 1);
    // limit relative to body forward (torso yaw ignored: use chest orientation)
    let q = Q().setFromUnitVectors(f0, dir);
    const ang = 2 * Math.acos(clamp(Math.abs(q.w), 0, 1));
    const lim = maxDeg * DEG;
    if (ang > lim) q.slerp(Q(), 1 - lim / ang);
    r.setAbs('Neck', q.clone().multiply(r.restModelQ[r.index.Neck]), w * 0.4);
    r.setAbs('Head', q.clone().multiply(r.restModelQ[r.index.Head]), w);
  }
  // feet-on-ground IK helper (model space targets for ankles)
  legIK(side, ankleTarget, pole, footQ, w = 1) {
    const r = this.rig;
    const before = { up: r.TQ[r.index[side + 'UpLeg']].clone(), lg: r.TQ[r.index[side + 'Leg']].clone(), ft: r.TQ[r.index[side + 'Foot']].clone() };
    r.ik(side + 'UpLeg', side + 'Leg', side + 'Foot', ankleTarget, pole);
    if (footQ) r.setAbs(side + 'Foot', footQ);
    if (w < 1) {
      // blend result against the pre-IK (animated) pose per bone (subtrees follow the recorded quats)
      const idx = [r.index[side + 'UpLeg'], r.index[side + 'Leg'], r.index[side + 'Foot']];
      const post = idx.map(i => r.TQ[i].clone());
      const pre = [before.up, before.lg, before.ft];
      // subtree children (toes) are rotated with their parent by the delta
      for (let k = 0; k < 3; k++) {
        const blended = pre[k].clone().slerp(post[k], w);
        const D = blended.clone().multiply(r.TQ[idx[k]].clone().invert());
        for (const j of r.subtree[idx[k]]) r.TQ[j].premultiply(D);
      }
    }
  }
  // rotate the forearm about the elbow so that it swings from the upper-arm direction toward `toward` (model space) by `deg`
  bend(side, deg, toward, w = 1) {
    const r = this.rig;
    const a = r.dirNow(side + 'Arm', side + 'ForeArm');
    const axis = new THREE.Vector3().crossVectors(a, toward.clone().normalize());
    if (axis.lengthSq() < 1e-6) return;
    r.rotate(side + 'ForeArm', qAxis(axis.normalize(), deg), w);
  }
  // ---- state snapshots (fixed-step interpolation and replay)
  packState() {
    const r = this.rig, n = r.TQ.length;
    const a = new Float32Array(10 + n * 4);
    const dr = this.diveRoot;
    a[0] = this.root.position.x; a[1] = this.root.position.y; a[2] = this.root.position.z; a[3] = this.root.rotation.y;
    a[4] = dr ? dr.position.y : 0; a[5] = dr ? dr.rotation.z : 0;
    a[6] = r.HP.x; a[7] = r.HP.y; a[8] = r.HP.z; a[9] = this.faceState.smile * 0 + 0;
    for (let i = 0; i < n; i++) { const q = r.TQ[i]; a[10 + i * 4] = q.x; a[11 + i * 4] = q.y; a[12 + i * 4] = q.z; a[13 + i * 4] = q.w; }
    return a;
  }
  applyLerp(a, b, t) {
    const r = this.rig, n = r.TQ.length;
    const L = (i) => a[i] + (b[i] - a[i]) * t;
    this.root.position.set(L(0), L(1), L(2));
    let dy = b[3] - a[3]; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
    this.root.rotation.y = a[3] + dy * t;
    if (this.diveRoot) { this.diveRoot.position.y = L(4); this.diveRoot.rotation.z = L(5); }
    r.HP.set(L(6), L(7), L(8));
    const qa = this._qa || (this._qa = new THREE.Quaternion()), qb = this._qb || (this._qb = new THREE.Quaternion());
    for (let i = 0; i < n; i++) {
      qa.set(a[10 + i * 4], a[11 + i * 4], a[12 + i * 4], a[13 + i * 4]); qb.set(b[10 + i * 4], b[11 + i * 4], b[12 + i * 4], b[13 + i * 4]);
      r.TQ[i].copy(qa).slerp(qb, t);
    }
    r.commit();
  }
  finalize() { this.rig.commit(); }
}

/* ============================================================= KICKER */
const RUN_T = 1.12;      // seconds from "go" to impact
export class KickerActor extends Actor {
  constructor(kitKey, B, opts) {
    super(kitKey, opts);
    this.attachAnimations(B);
    this.state = 'idle'; this.t = 0; this.impactFired = false;
    this.rt.play('idle', { fade: 0 });
    this.onImpact = null;
    this.rightFooted = opts?.rightFooted !== false;
    this.celebrate = null;
  }
  setup({ ball, aimPoint, approach = 1, start = null }) {
    // kick frame
    this.ball = ball.clone();
    const f = V(aimPoint.x - ball.x, 0, aimPoint.z - ball.z).normalize();
    this.f = f;
    this.l = V(f.z, 0, -f.x);              // character-left (world)
    this.kickYaw = Math.atan2(f.x, f.z);
    // root position at impact
    const side = this.rightFooted ? 1 : -1;  // side of kicking foot: +1 right
    this.R = ball.clone().addScaledVector(this.l, side * 0.11).addScaledVector(f, -0.31); this.R.y = 0;
    // start: behind & to the kicking-foot side, angled run
    const ang = 26 * DEG * (this.rightFooted ? 1 : -1) * approach;
    const back = f.clone().multiplyScalar(-1);
    const dirBack = back.clone().applyAxisAngle(Y, ang);
    this.S = start ? start.clone() : this.R.clone().addScaledVector(dirBack, 3.7); this.S.y = 0;
    this.nominalStart = this.R.clone().addScaledVector(dirBack, 3.7);
    this.runYaw = Math.atan2(this.R.x - this.S.x, this.R.z - this.S.z);
    // distance table with speed profile
    const N = 240; this.dist = new Float32Array(N + 1);
    let acc = 0, prev = 0; const sp = t => { const u = t / RUN_T; return sstep(0, 0.35, u) * (1 - 0.62 * sstep(0.45, 1.0, u)) ; };
    for (let i = 0; i <= N; i++) { const t = (i / N) * RUN_T; acc += sp(t) * (RUN_T / N); this.dist[i] = acc; }
    this.distTotal = acc; this.sp = sp;
    this.place(this.S.x, this.S.z, this.runYaw);
    this.state = 'wait'; this.t = 0; this.impactFired = false;
    this.rt.play('idle', { fade: 0 });
    this.setFace(0, 0);
  }
  go() { this.state = 'run'; this.t = 0; this.impactFired = false; this.rt.play('run', { fade: 0.2, timeScale: 0.6 }); }
  get tt() { return this.t - RUN_T; }
  update(dt) {
    const r = this.rig;
    if (this.state === 'wait' || this.state === 'done') { this.rt.update(dt); this.idleOverlay(dt); r.commit(); return; }
    if (this.state === 'celebrate') { this.updateCelebrate(dt); return; }
    if (this.state === 'sad') { this.updateSad(dt); return; }
    if (this.state !== 'run') return;
    this.t += dt;
    const tt = this.tt;
    // --- root motion
    const tc = clamp(this.t, 0, RUN_T);
    const di = clamp(Math.round(tc / RUN_T * 240), 0, 240);
    const u = this.dist[di] / this.distTotal;
    const pos = this.S.clone().lerp(this.R, u);
    const yaw = this.runYaw + this.angleDiff(this.runYaw, this.kickYaw) * sstep(-0.55, -0.12, tt);
    this.place(pos.x, pos.z, yaw);
    const speed = 3.7 * this.sp(tc) / this.distTotal;
    // cadence follows speed
    this.rt.current && this.rt.current.setEffectiveTimeScale(clamp(speed * 0.9, 0.3, 1.25) * (tt > -0.5 ? 0.85 : 1));
    this.rt.update(dt);
    // --- overlay blend weight (mocap -> strike)
    const w = sstep(-0.5, -0.24, tt);
    this.strikeOverlay(tt, w);
    if (!this.impactFired && tt >= 0) { this.impactFired = true; this.onImpact && this.onImpact(); }
    r.commit();
    if (tt > 0.85) { this.state = 'done'; this.rt.play('idle', { fade: 0.35 }); this.doneT = 0; }
  }
  angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
  idleOverlay(dt) {
    const r = this.rig;
    this.lookAt(this.toModel(this.ball.clone().add(V(0, 0.4, 0))), 0.7);
  }
  strikeOverlay(tt, w) {
    const r = this.rig;
    const side = this.rightFooted ? 'Right' : 'Left', supp = this.rightFooted ? 'Left' : 'Right';
    const sg = this.rightFooted ? 1 : -1;     // +1: kicking leg on character's right
    const ball = this.ball, f = this.f, l = this.l;
    const W = (a, c, y) => ball.clone().addScaledVector(l, a).addScaledVector(f, c).add(V(0, y, 0));
    // world ankle key targets relative to the ball (a: along character-left, c: along kick direction, y: height)
    const K = {
      back:   { t: -0.15, p: W(-sg * 0.10, -0.80, 0.55) },
      impact: { t: 0.0,   p: W(-sg * 0.03, -0.245, 0.19) },
      follow: { t: 0.24,  p: W(sg * 0.24, 0.50, 0.62) },
      step:   { t: 0.62,  p: W(sg * 0.08, 0.85, 0.13) },
    };
    // kicking-foot target
    let target = V();
    if (tt < K.back.t) {
      // moving from run pose to backswing: just aim at backswing point (blend weight handles the transition)
      target.copy(K.back.p);
    } else if (tt < K.impact.t) {
      const s = (tt - K.back.t) / (K.impact.t - K.back.t);
      target.copy(K.back.p).lerp(K.impact.p, Math.pow(s, 1.9));
    } else if (tt < K.follow.t) {
      const s = (tt - K.impact.t) / (K.follow.t - K.impact.t);
      target.copy(K.impact.p).lerp(K.follow.p, 1 - Math.pow(1 - s, 2.0));
    } else {
      const s = clamp((tt - K.follow.t) / (K.step.t - K.follow.t), 0, 1);
      target.copy(K.follow.p).lerp(K.step.p, s * s * (3 - 2 * s));
    }
    // support foot: planted beside the ball
    const plant = W(sg * 0.245, -0.02, 0.126);
    // hips: controlled height (slightly lowered over the ball), pulled to the rest x/z
    const hipTarget = HIP_Y - (0.035 + 0.035 * sstep(-0.3, -0.03, tt) * (1 - sstep(0.12, 0.5, tt)));
    r.HP.y = lerp(r.HP.y, hipTarget, w);
    r.HP.x = lerp(r.HP.x, r.restModelP[r.topIdx].x, w * 0.85);
    r.HP.z = lerp(r.HP.z, r.restModelP[r.topIdx].z - 0.02 * sstep(0, 0.3, tt), w * 0.85);
    // torso: lean over the ball, then rock back
    const lean = lerp(0, 8, sstep(-0.3, -0.02, tt)) - 20 * sstep(0.02, 0.24, tt) + 12 * sstep(0.3, 0.7, tt);
    const twist = sg * (-10 * sstep(-0.3, -0.05, tt) + 26 * sstep(-0.02, 0.22, tt) - 16 * sstep(0.3, 0.7, tt));
    r.rotate('Hips', RY(-twist * 0.25), w);
    r.rotate('Spine', RX(lean * 0.35).multiply(RY(twist * 0.3)), w);
    r.rotate('Spine1', RX(lean * 0.3).multiply(RY(twist * 0.3)), w);
    r.rotate('Spine2', RX(lean * 0.3).multiply(RY(twist * 0.3)), w);
    // arms for balance: absolute targets relative to the rest (A) pose, blended in with w
    const armOpen = sstep(-0.35, -0.08, tt) * (1 - sstep(0.3, 0.7, tt));
    const arm = (name, rx, rz, wt) => r.setRelRest(name, RX(rx).multiply(RZ(rz)), wt);
    const sgL = (side === 'Left') ? 1 : -1, sgS = -sgL;    // sign of kicking-side arm and support-side arm on model X
    // support-side arm: out & slightly forward (counter-balance) ; kicking-side arm: back / down
    arm(supp + 'Arm', -22, sgS * (36 * armOpen), w * armOpen);
    arm(supp + 'ForeArm', -28, 0, w * armOpen);
    arm(side + 'Arm', 18, sgL * (14 * armOpen), w * armOpen);
    arm(side + 'ForeArm', -22, 0, w * armOpen);
    // legs IK (model space)
    const toM = p => this.toModel(p);
    const footFlat = r.restModelQ[r.index[supp + 'Foot']].clone();
    // yaw compensation: model space is aligned with the root group, whose yaw already equals the kick heading late in the run
    const suppTarget = toM(plant);
    const kickTarget = toM(target);
    const pole = V(sg * -0.15, 0.0, 1.0).normalize();
    const kickPitch = 22 + 20 * (1 - sstep(-0.16, 0.0, tt)) - 25 * sstep(0.02, 0.2, tt);   // toe-down while striking
    const kickFootQ = RX(kickPitch).multiply(r.restModelQ[r.index[side + 'Foot']]);
    this.legIK(supp, suppTarget, V(sg * 0.1, 0, 1).normalize(), footFlat, sstep(-0.42, -0.2, tt));
    this.legIK(side, kickTarget, pole, kickFootQ, sstep(-0.47, -0.28, tt));
    // head: watch the ball, then the goal
    const look = tt < 0.08 ? ball.clone().add(V(0, 0.05, 0)) : ball.clone().addScaledVector(f, 6).add(V(0, 1.4, 0));
    this.lookAt(toM(look), 0.85 * sstep(-0.6, -0.3, tt) + 0.15);
  }
  /* ---- reactions */
  startCelebrate() {
    this.state = 'celebrate'; this.t = 0;
    this.rtDance.play('SambaDance', { fade: 0, timeScale: 1.0 });
    this.active = this.rtDance;
    this.setFace(1, 0.5);
  }
  updateCelebrate(dt) {
    this.t += dt;
    this.rtDance.update(dt);
    // turn toward camera-ish (behind the ball, +z)
    this.rig.commit();
  }
  startSad() { this.state = 'sad'; this.t = 0; this.setFace(0, 0); this.rt.play('idle', { fade: 0.3 }); }
  updateSad(dt) {
    this.t += dt;
    this.rt.update(dt);
    const r = this.rig;
    const a = sstep(0, 0.6, this.t);
    r.rotate('Spine', RX(12 * a), 1); r.rotate('Spine1', RX(10 * a), 1); r.rotate('Neck', RX(14 * a), 1);
    r.HP.y -= 0.03 * a;
    // hands to head
    for (const s of ['Left', 'Right']) {
      const sg = s === 'Left' ? 1 : -1;
      r.rotate(s + 'Arm', RX(-70 * a).multiply(RZ(sg * 60 * a)), 1);
      r.rotate(s + 'ForeArm', RX(-105 * a), 1);
    }
    r.commit();
  }
}

/* ============================================================= KEEPER */
export class KeeperActor extends Actor {
  constructor(kitKey, B, opts) {
    super(kitKey, opts);
    this.attachAnimations(B);
    this.mode = 'ready'; this.t = 0;
    this.home = V(0, 0, 0.35);
    this.dive = null;
    this.diveRoot = new THREE.Group();     // roll pivot (at hips)
    this.root.remove(this.group);
    this.root.add(this.diveRoot); this.diveRoot.add(this.group);
    this.group.position.set(0, -HIP_Y, 0); this.diveRoot.position.set(0, HIP_Y, 0);
    this.colliders = [];
    this.shuffle = 0;
  }
  setup(home) {
    this.home.copy(home);
    this.mode = 'ready'; this.t = 0; this.dive = null; this.shuffle = Math.random() * 6;
    this.diveRoot.position.set(0, HIP_Y, 0); this.diveRoot.rotation.set(0, 0, 0);
    this.place(home.x, home.z, 0);
    this.setFace(0, 0.1);
  }
  // Start a dive toward the world point T=(x,y) on the goal plane; `arrive` = seconds until hands should be there
  startDive(T, arrive) {
    const x0 = this.root.position.x;
    const L = 0.98;
    const dxT = T.x - x0;
    const sgn = Math.sign(dxT) || 1;
    const hi = clamp((T.y - 0.55) / 1.9, 0, 1);
    const centre = clamp(Math.abs(dxT) / 0.8, 0, 1);
    const phi = lerp(84, 14, Math.pow(hi, 0.85)) * (0.25 + 0.75 * centre);
    const sinp = Math.sin(phi * DEG), cosp = Math.cos(phi * DEG);
    const hipEnd = V(x0 + dxT - sgn * L * sinp, Math.max(T.y - L * cosp, 0.26), this.root.position.z);
    const arc = 0.08 + 0.34 * clamp((T.y - 0.6) / 1.5, 0, 1) + 0.10 * clamp(Math.abs(dxT) / 3, 0, 1);
    this.dive = { T: T.clone(), x0, dxT, sgn, phi, hipEnd, arc, t: 0, arrive: Math.max(arrive, 0.34), slide: 0, done: false };
    this.mode = 'dive'; this.t = 0;
  }
  update(dt) {
    const r = this.rig;
    this.t += dt;
    if (this.mode === 'celebrate') { this.rtDance.update(dt); this.rig.commit(); this.updateColliders(); return; }
    let st = 0;
    if (this.mode === 'dive' && this.dive) { this.dive.t += dt; const dd = this.dive; st = sstep(0, 0.4, clamp(dd.t / dd.arrive, 0, 1)); }
    this.readyPose(1 - st);
    if (this.mode === 'dive' && this.dive) this.divePose(dt);
    r.commit();
    this.updateColliders();
  }
  readyPose(aw = 1) {
    const r = this.rig;
    const T = this.t + this.shuffle;
    r.resetTargets();
    const bob = Math.sin(T * 5.2) * 0.012;
    r.HP.y -= 0.16 + bob;
    r.HP.z += 0.06;
    r.rotate('Hips', RX(14).multiply(RY(Math.sin(T * 1.3) * 4)));
    r.rotate('Spine1', RX(10)); r.rotate('Spine2', RX(6));
    for (const s of ['Left', 'Right']) {
      const sg = s === 'Left' ? 1 : -1;
      r.rotate(s + 'Arm', RX(-28 * aw).multiply(RZ(sg * 18 * aw)));
      if (aw > 0.01) this.bend(s, 85 * aw, V(-sg * 0.25, 0.55, 0.8));
      r.rotate(s + 'Hand', RX(-10 * aw));
    }
    this.legIK('Left', V(0.31, 0.126, 0.02), V(0.2, 0, 1), r.restModelQ[r.index.LeftFoot].clone(), 1);
    this.legIK('Right', V(-0.31, 0.126, 0.02), V(-0.2, 0, 1), r.restModelQ[r.index.RightFoot].clone(), 1);
    this.lookAt(V(0, 1.6, 8), 0.9);
  }
  divePose(dt) {
    const d = this.dive, r = this.rig;
    const s = clamp(d.t / d.arrive, 0, 1);
    const sEase = s * s * (3 - 2 * s);
    const travel = lerp(sEase, s, 0.4);
    let rootX = d.x0 + (d.hipEnd.x - d.x0) * travel;
    const y0 = HIP_Y - 0.16;
    let y = lerp(y0, d.hipEnd.y, sEase) + d.arc * Math.sin(Math.PI * s);
    let roll = d.phi * sstep(0.02, 0.9, s);
    if (d.t > d.arrive) {
      const a = d.t - d.arrive;
      const fall = sstep(0, 0.22, a);
      y = lerp(d.hipEnd.y, 0.24, fall);
      roll = lerp(d.phi, Math.max(d.phi, 84), fall);
      d.slide = Math.min(a, 0.55) * 0.8;
      const rec = sstep(1.5, 2.4, a);
      y = lerp(y, y0, rec); roll = lerp(roll, 0, rec);
      rootX += d.sgn * d.slide * 0.35 * (1 - rec);
      if (rec >= 1) d.done = true;
    }
    this.root.position.x = rootX;
    this.diveRoot.rotation.z = -d.sgn * roll * DEG;
    // hips world height = y  ->  pivot height accounts for the crouch drop already baked into HP
    const hipDrop = r.restModelP[r.topIdx].y - r.HP.y;
    this.diveRoot.position.y = y + hipDrop * (1 - sstep(0, 0.4, s));
    // pose: stretch out
    const st = sstep(0, 0.4, s) * (1 - sstep(1.5, 2.4, Math.max(0, d.t - d.arrive)) * (d.t > d.arrive ? 1 : 0));
    for (const sd of ['Left', 'Right']) {
      const sg = sd === 'Left' ? 1 : -1;
      r.rotate(sd + 'Arm', RZ(sg * 140 * st).multiply(RX(-8 * st)));
      r.rotate(sd + 'ForeArm', RX(8 * st));
    }
    r.rotate('Spine1', RX(-10 * st)); r.rotate('Spine2', RX(-8 * st)); r.rotate('Neck', RX(-12 * st));
    r.rotate('Hips', RX(-10 * st));
    const trail = V(0.20, 0.55, -0.55).lerp(V(0.31, 0.126, 0.02), 1 - st);
    this.legIK('Left', trail, V(0, 0.3, 1), null, st);
    this.legIK('Right', V(-0.2, 0.45, -0.78).lerp(V(-0.31, 0.126, 0.02), 1 - st), V(0, 0.3, 1), null, st);
    this.lookAt(V(0, 1.6, 8), 0.5);
  }
  updateColliders() {
    const r = this.rig;
    this.root.updateMatrixWorld(true);
    r.computePositions();
    const P = n => this.model.localToWorld(r.pos[r.index[n]].clone());
    this.colliders = [
      ['handL', P('LeftHand'), P('LeftHandMiddle1'), 0.14, true],
      ['handR', P('RightHand'), P('RightHandMiddle1'), 0.14, true],
      ['foreL', P('LeftForeArm'), P('LeftHand'), 0.075, false],
      ['foreR', P('RightForeArm'), P('RightHand'), 0.075, false],
      ['armL', P('LeftArm'), P('LeftForeArm'), 0.08, false],
      ['armR', P('RightArm'), P('RightForeArm'), 0.08, false],
      ['torso', P('Hips'), P('Spine2'), 0.19, false],
      ['head', P('Neck'), P('HeadTop_End'), 0.12, false],
      ['thighL', P('LeftUpLeg'), P('LeftLeg'), 0.11, false],
      ['thighR', P('RightUpLeg'), P('RightLeg'), 0.11, false],
      ['shinL', P('LeftLeg'), P('LeftFoot'), 0.075, false],
      ['shinR', P('RightLeg'), P('RightFoot'), 0.075, false],
    ];
  }
}
