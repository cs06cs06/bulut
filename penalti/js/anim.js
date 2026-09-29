// Skeleton utilities: model-space rig, Mixamo->RPM retargeting, subtree deltas, two-bone IK.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const ID = new THREE.Quaternion();
export const DEG = Math.PI / 180;
export const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
export const qAxis = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG);

const strip = n => n.replace(/^mixamorig:?/, '');

export class Rig {
  constructor(rootObj) {
    this.root = rootObj;
    rootObj.updateMatrixWorld(true);
    this.bones = []; this.names = []; this.index = {}; this.parent = [];
    rootObj.traverse(o => { if (o.isBone) { this.index[strip(o.name)] = this.bones.length; this.names.push(strip(o.name)); this.bones.push(o); } });
    const n = this.bones.length;
    for (let i = 0; i < n; i++) {
      const p = this.bones[i].parent;
      this.parent[i] = p && p.isBone ? this.bones.indexOf(p) : -1;
    }
    this.children = Array.from({ length: n }, () => []);
    this.subtree = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) if (this.parent[i] >= 0) this.children[this.parent[i]].push(i);
    for (let i = 0; i < n; i++) { let a = i; while (a >= 0) { this.subtree[a].push(i); a = this.parent[a]; } }
    this.invRoot = new THREE.Matrix4();
    this.restLocalQ = this.bones.map(b => b.quaternion.clone());
    this.restLocalP = this.bones.map(b => b.position.clone());
    this.restModelQ = []; this.restModelP = []; this.restOff = [];
    this.readModel(this.restModelQ, this.restModelP);
    for (let i = 0; i < n; i++) {
      const p = this.parent[i];
      this.restOff[i] = p < 0 ? new THREE.Vector3() : this.restModelP[i].clone().sub(this.restModelP[p]);
    }
    this.topParentM = new THREE.Matrix4();
    const top = this.bones[this.parent.indexOf(-1)];
    this.topIdx = this.parent.indexOf(-1);
    // matrix of the top bone's parent in model space
    this.topParentM.copy(this.invRoot).multiply(top.parent.matrixWorld);
    this.TQ = this.restModelQ.map(q => q.clone());
    this.HP = this.restModelP[this.topIdx].clone();
    this.pos = this.restModelP.map(p => p.clone());
  }
  // read current model-space quats/pos from bone world matrices
  readModel(outQ, outP) {
    this.root.updateMatrixWorld(true);
    this.invRoot.copy(this.root.matrixWorld).invert();
    const s = new THREE.Vector3();
    for (let i = 0; i < this.bones.length; i++) {
      _m.multiplyMatrices(this.invRoot, this.bones[i].matrixWorld);
      if (!outQ[i]) outQ[i] = new THREE.Quaternion(); if (!outP[i]) outP[i] = new THREE.Vector3();
      _m.decompose(outP[i], outQ[i], s);
    }
  }
  resetTargets() { for (let i = 0; i < this.TQ.length; i++) this.TQ[i].copy(this.restModelQ[i]); this.HP.copy(this.restModelP[this.topIdx]); }
  // premultiply a model-space rotation onto bone i and its whole subtree (weight w)
  rotate(name, D, w = 1) {
    const i = typeof name === 'number' ? name : this.index[name]; if (i === undefined) return;
    let d = D;
    if (w !== 1) d = _q2.copy(ID).slerp(D, w);
    const dd = d.clone();
    for (const j of this.subtree[i]) this.TQ[j].premultiply(dd);
  }
  // set absolute orientation of a bone (children follow)
  setAbs(name, Q, w = 1) {
    const i = typeof name === 'number' ? name : this.index[name]; if (i === undefined) return;
    const target = w === 1 ? Q : new THREE.Quaternion().copy(this.TQ[i]).slerp(Q, w);
    const D = target.clone().multiply(this.TQ[i].clone().invert());
    for (const j of this.subtree[i]) this.TQ[j].premultiply(D);
  }
  // rotation relative to REST orientation (model axes), applied on the bone + subtree
  setRelRest(name, D, w = 1) {
    const i = this.index[name]; if (i === undefined) return;
    this.setAbs(i, D.clone().multiply(this.restModelQ[i]), w);
  }
  computePositions() {
    const n = this.bones.length;
    for (let i = 0; i < n; i++) {
      const p = this.parent[i];
      if (p < 0) this.pos[i].copy(this.HP);
      else {
        // local offset in parent's frame at rest, rotated by parent's current model quat
        _v.copy(this.restOff[i]).applyQuaternion(_q.copy(this.restModelQ[p]).invert()).applyQuaternion(this.TQ[p]);
        this.pos[i].copy(this.pos[p]).add(_v);
      }
    }
  }
  dirRest(a, b) { return this.restModelP[this.index[b]].clone().sub(this.restModelP[this.index[a]]).normalize(); }
  // current direction of bone segment a->b using bone a's current orientation
  dirNow(a, b) { const ia = this.index[a]; return this.dirRest(a, b).applyQuaternion(_q.copy(this.restModelQ[ia]).invert()).applyQuaternion(this.TQ[ia]); }
  segLen(a, b) { return this.restModelP[this.index[a]].distanceTo(this.restModelP[this.index[b]]); }
  // two-bone IK for a limb (UpLeg/Leg/Foot) to target joint position (model space)
  ik(hip, knee, ankle, target, pole, reach = 1) {
    this.computePositions();
    const H = this.pos[this.index[hip]].clone();
    const L1 = this.segLen(hip, knee), L2 = this.segLen(knee, ankle);
    const to = target.clone().sub(H);
    let d = Math.min(to.length(), (L1 + L2) * 0.9999 * reach);
    d = Math.max(d, Math.abs(L1 - L2) + 1e-4);
    const u = to.clone().normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
    const perp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
    if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1);
    perp.normalize();
    const K = H.clone().add(u.clone().multiplyScalar(a)).add(perp.multiplyScalar(h));
    // thigh
    const t1 = K.clone().sub(H).normalize();
    const c1 = this.dirNow(hip, knee);
    this.rotate(hip, new THREE.Quaternion().setFromUnitVectors(c1, t1));
    // shin
    const A = H.clone().add(u.clone().multiplyScalar(d));
    const t2 = A.clone().sub(K).normalize();
    const c2 = this.dirNow(knee, ankle);
    this.rotate(knee, new THREE.Quaternion().setFromUnitVectors(c2, t2));
  }
  // write targets into bone local transforms (top-down)
  commit() {
    const n = this.bones.length;
    const newQ = this._nq || (this._nq = Array.from({ length: n }, () => new THREE.Quaternion()));
    for (let i = 0; i < n; i++) {
      const p = this.parent[i];
      if (p < 0) {
        // parent (armature) model rotation
        _m.copy(this.topParentM); _m.decompose(_v, _q2, _v2);
        this.bones[i].quaternion.copy(_q2.invert().multiply(this.TQ[i]));
        // position
        const inv = _m2.copy(this.topParentM).invert();
        this.bones[i].position.copy(this.HP).applyMatrix4(inv);
      } else {
        this.bones[i].quaternion.copy(_q.copy(this.TQ[p]).invert().multiply(this.TQ[i]));
      }
    }
  }
}

/* ---- Mixamo (T-pose) -> RPM (A-pose) retargeting through world-space deltas ---- */
export class Retargeter {
  constructor(srcScene, srcClips, dstRig) {
    this.src = cloneSkinned(srcScene);
    this.holder = new THREE.Group(); this.holder.add(this.src);
    this.holder.updateMatrixWorld(true);
    this.srcRig = new Rig(this.src);
    this.dst = dstRig;
    this.mixer = new THREE.AnimationMixer(this.src);
    this.clips = {}; for (const c of srcClips) this.clips[c.name] = c;
    this.actions = {};
    this.map = [];
    for (let i = 0; i < dstRig.names.length; i++) {
      const j = this.srcRig.index[dstRig.names[i]];
      if (j !== undefined) this.map.push([i, j]);
    }
    const sh = this.srcRig.restModelP[this.srcRig.topIdx].y, dh = dstRig.restModelP[dstRig.topIdx].y;
    this.scale = dh / sh;
    this.srcHips0 = this.srcRig.restModelP[this.srcRig.topIdx].clone();
    this.sQ = []; this.sP = [];
    this.invSrcRest = this.srcRig.restModelQ.map(q => q.clone().invert());
    // destination reference orientations: identical to rest, except arm chains which are rotated into a T-pose
    this.dstRef = dstRig.restModelQ.map(q => q.clone());
    for (const side of ['Left', 'Right']) {
      const sx = side === 'Left' ? 1 : -1;
      for (const [b, c] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand'], ['Hand', 'HandMiddle1']]) {
        const i = dstRig.index[side + b]; if (i === undefined || dstRig.index[side + c] === undefined) continue;
        const dir = dstRig.dirRest(side + b, side + c);
        const T = new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(sx, 0, 0));
        this.dstRef[i] = T.multiply(dstRig.restModelQ[i]);
      }
    }
    // fingers keep their rest pose (relative to hand)
    this.skip = new Set(); dstRig.names.forEach((n, i) => { if (/Thumb|Index|Middle|Ring|Pinky/.test(n)) this.skip.add(i); });
    this.current = null; this.fadeTargets = [];
  }
  action(name) {
    if (!this.actions[name]) {
      const c = this.clips[name];
      if (!c) { console.warn('missing clip', name); return null; }
      this.actions[name] = this.mixer.clipAction(c);
    }
    return this.actions[name];
  }
  play(name, { fade = 0.2, timeScale = 1, loop = true, startAt = 0 } = {}) {
    const a = this.action(name); if (!a) return null;
    a.reset(); a.enabled = true; a.setEffectiveTimeScale(timeScale); a.setEffectiveWeight(1);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop;
    a.time = startAt;
    if (this.current && this.current !== a) { a.crossFadeFrom(this.current, fade, false); }
    a.play(); this.current = a; return a;
  }
  update(dt) {
    this.mixer.update(dt);
    this.srcRig.readModel(this.sQ, this.sP);
    const d = this.dst;
    for (const [i, j] of this.map) {
      if (this.skip.has(i)) continue;
      // delta in model space: current * inverse(rest)
      _q.copy(this.sQ[j]).multiply(this.invSrcRest[j]);
      d.TQ[i].copy(_q).multiply(this.dstRef[i]);
    }
    // fingers follow their hand
    for (const side of ['Left', 'Right']) {
      const h = d.index[side + 'Hand'];
      for (const j of d.subtree[h]) if (j !== h) { _q.copy(d.TQ[h]).multiply(_q2.copy(d.restModelQ[h]).invert()); d.TQ[j].copy(_q).multiply(d.restModelQ[j]); }
    }
    // hips translation (scaled)
    const ti = this.srcRig.topIdx;
    _v.copy(this.sP[ti]).sub(this.srcHips0).multiplyScalar(this.scale);
    d.HP.copy(d.restModelP[d.topIdx]).add(_v);
  }
}
