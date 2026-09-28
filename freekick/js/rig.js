import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Mixamo X Bot (three.js examples). Rest pose is a T-pose where every bone's world
// rotation is identity, the character faces +Z and its left side is +X. That makes
// procedural posing straightforward: local axes line up with the character's axes.

const NAMES = {
  hips: 'Hips', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head', headTop: 'HeadTop_End',
  lSh: 'LeftShoulder', lArm: 'LeftArm', lFore: 'LeftForeArm', lHand: 'LeftHand',
  rSh: 'RightShoulder', rArm: 'RightArm', rFore: 'RightForeArm', rHand: 'RightHand',
  lUp: 'LeftUpLeg', lLeg: 'LeftLeg', lFoot: 'LeftFoot', lToe: 'LeftToeBase', lToeEnd: 'LeftToe_End',
  rUp: 'RightUpLeg', rLeg: 'RightLeg', rFoot: 'RightFoot', rToe: 'RightToeBase', rToeEnd: 'RightToe_End',
};

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();

function numberTexture(num, color, trim) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.font = '700 190px Teko, "Arial Narrow", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = trim;
  g.strokeText(String(num), 128, 142);
  g.fillStyle = color;
  g.fillText(String(num), 128, 142);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Football kit painted procedurally onto the bind-pose body: shirt, collar trim, sleeves,
 * shorts, socks with a band, boots, gloves for the keeper and a printed back number.
 */
export function makeKitMaterial(kit, opts = {}) {
  const hex = (h) => new THREE.Color(h);
  const uniforms = {
    uShirt: { value: hex(kit.shirt) },
    uTrim: { value: hex(kit.shirt2) },
    uShorts: { value: hex(kit.shorts) },
    uSocks: { value: hex(kit.socks) },
    uSkin: { value: hex(opts.skin ?? 0xc98f6b) },
    uHair: { value: hex(opts.hair ?? 0x1d1510) },
    uBoot: { value: hex(opts.boot ?? 0x111111) },
    uBootAccent: { value: hex(opts.bootAccent ?? 0xffffff) },
    uGlove: { value: hex(opts.glove ?? 0x33c46b) },
    uNumber: { value: numberTexture(opts.number ?? 10, '#' + hex(kit.number).getHexString(), '#' + hex(kit.shirt2).getHexString()) },
    uKeeper: { value: opts.keeper ? 1 : 0 },
    uLongSleeve: { value: opts.keeper ? 1 : 0 },
    uJoint: { value: opts.joint ? 1 : 0 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind; varying vec3 vBindN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position; vBindN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBind; varying vec3 vBindN;
uniform vec3 uShirt, uTrim, uShorts, uSocks, uSkin, uHair, uBoot, uBootAccent, uGlove;
uniform sampler2D uNumber; uniform float uKeeper; uniform float uLongSleeve; uniform float uJoint;
float gRough;
vec3 kitColor(vec3 p, vec3 n) {
  float ax = abs(p.x);
  gRough = 0.72;
  // head, neck and hair
  if (p.y > 1.52 && ax < 0.16) {
    gRough = 0.55;
    vec3 c = uSkin;
    float hair = step(1.69, p.y + max(0.0, -p.z) * 1.2) * step(-0.2, p.y);
    hair = max(hair, step(1.585, p.y) * step(p.z, -0.035));
    c = mix(c, uHair, hair);
    float eye = 1.0 - smoothstep(0.009, 0.013, length(vec2(ax - 0.031, p.y - 1.662)));
    c = mix(c, vec3(0.03), eye * step(0.06, p.z) * (1.0 - hair));
    if (p.y < 1.56) c = mix(uTrim, uSkin, smoothstep(1.535, 1.55, p.y));
    return c;
  }
  // arms (T-pose, horizontal)
  if (ax > 0.185 && p.y > 1.28) {
    float sleeveEnd = mix(0.37, 0.69, uLongSleeve);
    if (ax > 0.685) { gRough = 0.5; return mix(uSkin, uGlove, uKeeper); }
    if (ax < sleeveEnd) {
      vec3 c = uShirt;
      c = mix(c, uTrim, step(sleeveEnd - 0.025, ax));
      c = mix(c, uTrim, step(0.25, ax) * step(ax, 0.27) * (1.0 - uKeeper));
      return c;
    }
    gRough = 0.55;
    return uSkin;
  }
  // shirt
  if (p.y > 0.93) {
    vec3 c = uShirt;
    // collar
    c = mix(c, uTrim, step(1.49, p.y) * step(abs(p.x), 0.1));
    // side panels
    c = mix(c, uTrim, step(0.145, ax) * step(p.y, 1.36) * 0.9);
    // chest band for the keeper
    c = mix(c, uTrim, uKeeper * step(1.26, p.y) * step(p.y, 1.31) * step(0.0, p.z));
    // back number
    if (n.z < -0.2 && ax < 0.14 && p.y > 1.05 && p.y < 1.42) {
      vec2 uv = vec2(0.5 - p.x / 0.28, (p.y - 1.05) / 0.37);
      vec4 t = texture2D(uNumber, uv);
      c = mix(c, t.rgb, t.a);
    }
    // small front number / crest
    if (n.z > 0.2 && p.y > 1.28 && p.y < 1.4 && p.x > 0.04 && p.x < 0.13) {
      vec2 uv = vec2((p.x - 0.04) / 0.09, (p.y - 1.28) / 0.12);
      vec4 t = texture2D(uNumber, uv);
      c = mix(c, t.rgb, t.a);
    }
    return c;
  }
  // shorts
  if (p.y > 0.6) {
    vec3 c = uShorts;
    c = mix(c, uTrim, step(p.y, 0.622));
    c = mix(c, uTrim, step(0.8, abs(n.x)) * step(0.1, ax) * step(p.y, 0.9) * 0.85);
    return c;
  }
  // knees / thighs
  if (p.y > 0.47) { gRough = 0.55; return uSkin; }
  // socks
  if (p.y > 0.1) {
    vec3 c = uSocks;
    c = mix(c, uTrim, step(0.4, p.y) * step(p.y, 0.43));
    return c;
  }
  // boots
  gRough = 0.32;
  vec3 b = uBoot;
  b = mix(b, uBootAccent, step(0.035, p.y) * step(p.y, 0.05) * step(0.0, p.z));
  return b;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= kitColor(vBind, normalize(vBindN)) * mix(1.0, 0.58, uJoint);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = min(1.0, gRough + uJoint * 0.12);`);
  };
  mat.userData.uniforms = uniforms;
  return mat;
}

export class Character {
  constructor(base, opts) {
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(base.scene);
    this.root.add(this.model);
    this.material = makeKitMaterial(opts.kit, opts);
    this.jointMaterial = makeKitMaterial(opts.kit, { ...opts, joint: true });
    this.jointMaterial.userData.uniforms.uNumber = this.material.userData.uniforms.uNumber;
    this.meshes = [];
    this.model.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = o.name === 'Beta_Joints' ? this.jointMaterial : this.material;
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        this.meshes.push(o);
      }
    });
    this.b = {};
    for (const [k, n] of Object.entries(NAMES)) {
      this.b[k] = this.model.getObjectByName('mixamorig' + n);
    }
    this.armature = this.b.hips.parent;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of base.animations) {
      if (!['idle', 'run', 'walk'].includes(clip.name)) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(clip.name === 'idle' ? 1 : 0);
      this.actions[clip.name] = a;
    }
    this.actions.idle.time = Math.random() * 2;
    this.weights = { idle: 1, run: 0, walk: 0 };
    this.targetWeights = { idle: 1, run: 0, walk: 0 };
    this.colliders = [];
    this.prevCollider = [];
    this.lookTarget = null;
    this.lookWeight = 0;
    this.yaw = 0;
    const s = opts.scale ?? 1;
    this.root.scale.setScalar(s);
  }

  setYaw(y) { this.yaw = y; this.root.rotation.y = y; }

  /** Cross-fades the clip layer toward the requested weights. */
  blendTo(weights, speed = 6) {
    Object.assign(this.targetWeights, { idle: 0, run: 0, walk: 0 }, weights);
    this.blendSpeed = speed;
  }

  updateMixer(dt) {
    const sp = this.blendSpeed ?? 6;
    for (const k of Object.keys(this.actions)) {
      const w = this.weights[k] + (this.targetWeights[k] - this.weights[k]) * Math.min(1, dt * sp);
      this.weights[k] = w;
      this.actions[k].setEffectiveWeight(w);
    }
    this.mixer.update(dt);
    this.model.updateMatrixWorld(true);
  }

  worldPos(name, out) { return out.setFromMatrixPosition(this.b[name].matrixWorld); }

  /** Rotates a bone by a world-space delta and re-expresses it locally. */
  rotateWorld(bone, qDelta) {
    bone.getWorldQuaternion(_q1);
    _q1.premultiply(qDelta);
    bone.parent.getWorldQuaternion(_q2);
    bone.quaternion.copy(_q2.invert().multiply(_q1));
    bone.updateMatrixWorld(true);
  }

  /** Points bone -> child toward target (minimal rotation). */
  aim(bone, child, target, weight = 1) {
    const p = _v1.setFromMatrixPosition(bone.matrixWorld);
    const c = _v2.setFromMatrixPosition(child.matrixWorld).sub(p).normalize();
    const t = _v3.copy(target).sub(p).normalize();
    _q3.setFromUnitVectors(c, t);
    if (weight < 1) _q3.slerp(_q2.identity(), 1 - weight);
    this.rotateWorld(bone, _q3);
  }

  /**
   * Analytic two-bone IK (thigh/shin or upper arm/forearm). `pole` is a world point the
   * middle joint should bend toward.
   */
  twoBone(a, b, c, target, pole, weight = 1) {
    if (weight <= 0.001) return;
    const A = this.b[a], B = this.b[b], C = this.b[c];
    const pa = _v4.setFromMatrixPosition(A.matrixWorld);
    const pb = _v5.setFromMatrixPosition(B.matrixWorld);
    const pc = _v6.setFromMatrixPosition(C.matrixWorld);
    const la = pa.distanceTo(pb), lb = pb.distanceTo(pc);
    const tgt = new THREE.Vector3().copy(pc).lerp(target, weight);
    const dir = new THREE.Vector3().subVectors(tgt, pa);
    let d = dir.length();
    dir.normalize();
    d = Math.min(Math.max(d, Math.abs(la - lb) + 1e-3), la + lb - 1e-3);
    const polev = new THREE.Vector3().subVectors(pole, pa);
    polev.addScaledVector(dir, -polev.dot(dir));
    if (polev.lengthSq() < 1e-8) polev.subVectors(pb, pa).addScaledVector(dir, -pb.clone().sub(pa).dot(dir));
    polev.normalize();
    const cosA = Math.min(1, Math.max(-1, (la * la + d * d - lb * lb) / (2 * la * d)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    const mid = new THREE.Vector3().copy(pa).addScaledVector(dir, la * cosA).addScaledVector(polev, la * sinA);
    const end = new THREE.Vector3().copy(pa).addScaledVector(dir, d);
    this.aim(A, B, mid);
    this.aim(B, C, end);
  }

  /** Sets a bone's world orientation (relative to the character root) with a blend weight. */
  orientWorld(name, qWorld, weight = 1) {
    const bone = this.b[name];
    bone.parent.getWorldQuaternion(_q2);
    _q1.copy(_q2).invert().multiply(qWorld);
    bone.quaternion.slerp(_q1, weight);
    bone.updateMatrixWorld(true);
  }

  /** Additive rotation in the parent's frame, from Euler angles (radians). */
  bend(name, x, y, z, weight = 1) {
    if (weight <= 0.0001) return;
    _e.set(x * weight, y * weight, z * weight, 'XYZ');
    _q1.setFromEuler(_e);
    this.b[name].quaternion.premultiply(_q1);
  }

  /** Spine curl distributed over three vertebrae. */
  bendSpine(x, y, z, weight = 1) {
    this.bend('spine', x / 3, y / 3, z / 3, weight);
    this.bend('spine1', x / 3, y / 3, z / 3, weight);
    this.bend('spine2', x / 3, y / 3, z / 3, weight);
  }

  /** Places the hips in world space (the skeleton root) — used for dives and jumps. */
  setHipsWorld(pos, quat, weight = 1) {
    const h = this.b.hips;
    const parent = h.parent;
    parent.updateWorldMatrix(true, false);
    _v1.copy(pos);
    parent.worldToLocal(_v1);
    h.position.lerp(_v1, weight);
    if (quat) {
      parent.getWorldQuaternion(_q2);
      _q1.copy(_q2).invert().multiply(quat);
      h.quaternion.slerp(_q1, weight);
    }
    h.updateMatrixWorld(true);
  }

  offsetHips(dx, dy, dz) {
    // offsets in world metres, applied in the armature's space (which is scaled 0.01)
    const h = this.b.hips;
    const inv = 1 / this.armature.getWorldScale(_v1).y;
    _v2.set(dx, dy, dz).applyQuaternion(this.root.quaternion.clone().invert());
    h.position.x += _v2.x * inv; h.position.y += _v2.y * inv; h.position.z += _v2.z * inv;
  }

  lookAt(target, weight) {
    if (!target || weight <= 0.001) return;
    const head = this.b.head;
    head.updateWorldMatrix(true, false);
    const hp = _v1.setFromMatrixPosition(head.matrixWorld);
    const fwd = _v2.set(0, 0, 1).applyQuaternion(head.getWorldQuaternion(_q1));
    const to = _v3.subVectors(target, hp).normalize();
    // limit how far the neck can twist
    const ang = fwd.angleTo(to);
    const lim = Math.min(1, 1.2 / Math.max(ang, 1e-3));
    _q3.setFromUnitVectors(fwd, to);
    _q3.slerp(_q2.identity(), 1 - weight * Math.min(1, lim));
    // split between neck and head
    _q2.identity().slerp(_q3, 0.4);
    this.rotateWorld(this.b.neck, _q2);
    head.getWorldQuaternion(_q1);
    const fwd2 = _v2.set(0, 0, 1).applyQuaternion(_q1);
    _q3.setFromUnitVectors(fwd2, to);
    _q3.slerp(_q2.identity(), 1 - weight * Math.min(1, lim));
    this.rotateWorld(head, _q3);
  }

  legIK(side, target, weight, poleDir) {
    const k = this.worldPos(side + 'Leg', new THREE.Vector3()).add(poleDir);
    this.twoBone(side + 'Up', side + 'Leg', side + 'Foot', target, k, weight);
  }

  armIK(side, target, weight, poleDir) {
    const e = this.worldPos(side + 'Fore', new THREE.Vector3()).add(poleDir);
    this.twoBone(side + 'Arm', side + 'Fore', side + 'Hand', target, e, weight);
  }

  /** Character-space direction (x = left, y = up, z = forward) to world. */
  dirToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyQuaternion(this.root.quaternion);
  }

  /** Character-space point (metres from the root) to world. */
  toWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyQuaternion(this.root.quaternion).add(this.root.position);
  }

  /** Keeps a foot flat on the grass (or tilted) after leg IK. */
  footFlat(side, weight = 1, pitch = 0) {
    const name = side === 'l' ? 'lFoot' : 'rFoot';
    _q1.setFromEuler(_e.set(pitch, 0, 0));
    _q2.copy(this.root.getWorldQuaternion(_q3)).multiply(_q1);
    this.orientWorld(name, _q2, weight);
  }

  /** Rebuilds the capsule colliders from the current skeleton pose. */
  buildColliders(spec, dt) {
    this.model.updateMatrixWorld(true);
    const prev = this.colliders;
    const out = [];
    for (let i = 0; i < spec.length; i++) {
      const [a, b, r, part] = spec[i];
      const pa = this.worldPos(a, new THREE.Vector3());
      const pb = b ? this.worldPos(b, new THREE.Vector3()) : pa.clone();
      if (b && spec[i][4]) pb.lerp(pa, spec[i][4]);
      const c = { a: pa, b: pb, r, part, owner: this, vel: new THREE.Vector3() };
      if (prev[i] && dt > 0) {
        c.vel.copy(pa).add(pb).sub(prev[i].a).sub(prev[i].b).multiplyScalar(0.5 / dt);
        if (c.vel.lengthSq() > 400) c.vel.setLength(20);
      }
      out.push(c);
    }
    this.colliders = out;
    return out;
  }

  /** Snapshot of the full pose for the replay system. */
  snapshot() {
    const bones = [];
    this.model.traverse((o) => { if (o.isBone) bones.push(o); });
    if (!this._boneList) this._boneList = bones;
    const arr = new Float32Array(7 + this._boneList.length * 4 + 3);
    arr[0] = this.root.position.x; arr[1] = this.root.position.y; arr[2] = this.root.position.z;
    arr[3] = this.root.quaternion.x; arr[4] = this.root.quaternion.y; arr[5] = this.root.quaternion.z; arr[6] = this.root.quaternion.w;
    let k = 7;
    for (const b of this._boneList) { arr[k++] = b.quaternion.x; arr[k++] = b.quaternion.y; arr[k++] = b.quaternion.z; arr[k++] = b.quaternion.w; }
    arr[k++] = this.b.hips.position.x; arr[k++] = this.b.hips.position.y; arr[k++] = this.b.hips.position.z;
    return arr;
  }

  applySnapshot(a, b, t) {
    if (!this._boneList) this.snapshot();
    const lerp = (i) => a[i] + (b[i] - a[i]) * t;
    this.root.position.set(lerp(0), lerp(1), lerp(2));
    _q1.set(a[3], a[4], a[5], a[6]); _q2.set(b[3], b[4], b[5], b[6]);
    this.root.quaternion.slerpQuaternions(_q1, _q2, t);
    let k = 7;
    for (const bone of this._boneList) {
      _q1.set(a[k], a[k + 1], a[k + 2], a[k + 3]); _q2.set(b[k], b[k + 1], b[k + 2], b[k + 3]);
      bone.quaternion.slerpQuaternions(_q1, _q2, t);
      k += 4;
    }
    this.b.hips.position.set(lerp(k), lerp(k + 1), lerp(k + 2));
    this.model.updateMatrixWorld(true);
  }
}

export { NAMES };
