import * as THREE from 'three';
import { FIELD, BALL } from './config.js';

const R = BALL.radius;
const hw = FIELD.goalHalfWidth + FIELD.postRadius;
const H = FIELD.goalHeight;
const Dr = FIELD.netRoofDepth;
const Db = FIELD.netBackDepth;

function makeNetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 7;
  g.lineCap = 'round';
  // two diamond cells per tile edge
  for (let k = -2; k <= 2; k++) {
    g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64 + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(k * 64 + 128, 0); g.lineTo(k * 64, 128); g.stroke();
  }
  // knots
  g.fillStyle = '#fff';
  for (const [x, y] of [[0, 0], [64, 64], [128, 0], [0, 128], [128, 128], [64, 0], [0, 64], [128, 64], [64, 128]]) {
    if ((x + y) % 128 === 0 || (x === 64 && y === 64)) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * One rectangular cloth panel (verlet particles on an s,t grid). All border particles
 * are pinned to the goal frame; the interior can sag, ripple and bulge around the ball.
 */
class Panel {
  constructor(name, cols, rows, pointAt, inward, bounds, cell) {
    this.name = name;
    this.cols = cols; this.rows = rows;
    this.inward = inward.clone().normalize();
    this.bounds = bounds; // (p) => boolean, is p within the panel footprint
    const n = cols * rows;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.rest = new Float32Array(n * 3);
    this.pinned = new Uint8Array(n);
    const v = new THREE.Vector3();
    const uvs = new Float32Array(n * 2);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        pointAt(i / (cols - 1), j / (rows - 1), v);
        this.pos.set([v.x, v.y, v.z], k * 3);
        this.prev.set([v.x, v.y, v.z], k * 3);
        this.rest.set([v.x, v.y, v.z], k * 3);
        this.pinned[k] = (i === 0 || j === 0 || i === cols - 1 || j === rows - 1) ? 1 : 0;
        uvs[k * 2] = (i / (cols - 1)) * cell.u;
        uvs[k * 2 + 1] = (j / (rows - 1)) * cell.v;
      }
    }
    this.planePoint = new THREE.Vector3(this.rest[0], this.rest[1], this.rest[2]);
    // structural constraints with a little slack so the net hangs
    const cons = [];
    const d = (a, b) => Math.hypot(this.rest[a * 3] - this.rest[b * 3], this.rest[a * 3 + 1] - this.rest[b * 3 + 1], this.rest[a * 3 + 2] - this.rest[b * 3 + 2]);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (i < cols - 1) cons.push(k, k + 1, d(k, k + 1) * 1.025);
      if (j < rows - 1) cons.push(k, k + cols, d(k, k + cols) * 1.025);
    }
    this.cons = new Float32Array(cons);

    const idx = [];
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(idx);
    this.geometry.computeVertexNormals();
    this.side = 0;     // which side of the panel the ball is on (+1 inside the goal)
    this.contact = 0;  // contact intensity for audio / fx
  }

  simulate(dt, gravity, iterations, time, windPush) {
    const { pos, prev, pinned, cons } = this;
    const n = pinned.length;
    const damp = 0.985;
    const g = gravity * dt * dt;
    for (let k = 0; k < n; k++) {
      if (pinned[k]) continue;
      const i3 = k * 3;
      const x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
      let vx = (x - prev[i3]) * damp, vy = (y - prev[i3 + 1]) * damp, vz = (z - prev[i3 + 2]) * damp;
      // gentle breeze ripple
      const r = Math.sin(time * 2.1 + x * 1.7 + y * 2.3) * windPush * dt * dt;
      prev[i3] = x; prev[i3 + 1] = y; prev[i3 + 2] = z;
      pos[i3] = x + vx + this.inward.x * r;
      pos[i3 + 1] = y + vy - g + this.inward.y * r;
      pos[i3 + 2] = z + vz + this.inward.z * r;
    }
    for (let it = 0; it < iterations; it++) {
      for (let c = 0; c < cons.length; c += 3) {
        const a = cons[c] * 3, b = cons[c + 1] * 3, rest = cons[c + 2];
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= rest) continue; // net threads only resist stretching
        const diff = (dist - rest) / dist;
        const pa = pinned[cons[c]], pb = pinned[cons[c + 1]];
        const wa = pa ? 0 : (pb ? 1 : 0.5), wb = pb ? 0 : (pa ? 1 : 0.5);
        pos[a] += dx * diff * wa; pos[a + 1] += dy * diff * wa; pos[a + 2] += dz * diff * wa;
        pos[b] -= dx * diff * wb; pos[b + 1] -= dy * diff * wb; pos[b + 2] -= dz * diff * wb;
      }
    }
  }

  /** Pushes particles out of the ball so the mesh wraps around it. */
  wrapBall(bp, pushDir) {
    const { pos, pinned } = this;
    const n = pinned.length;
    const rr = R + 0.035;
    const ob = (bp.x - this.planePoint.x) * pushDir.x + (bp.y - this.planePoint.y) * pushDir.y + (bp.z - this.planePoint.z) * pushDir.z;
    for (let k = 0; k < n; k++) {
      if (pinned[k]) continue;
      const i3 = k * 3;
      const dx = pos[i3] - bp.x, dy = pos[i3 + 1] - bp.y, dz = pos[i3 + 2] - bp.z;
      const along = dx * pushDir.x + dy * pushDir.y + dz * pushDir.z;
      const lx = dx - pushDir.x * along, ly = dy - pushDir.y * along, lz = dz - pushDir.z * along;
      const l2 = lx * lx + ly * ly + lz * lz;
      if (l2 > rr * rr * 2.2) continue;
      // required offset: cap of the ball plus a soft skirt around it
      const cap = l2 < rr * rr ? Math.sqrt(rr * rr - l2) : 0;
      const skirt = Math.max(0, 1 - Math.sqrt(l2) / (rr * 1.48));
      const need = cap + skirt * 0.02;
      const po = ((pos[i3] - this.planePoint.x) * pushDir.x + (pos[i3 + 1] - this.planePoint.y) * pushDir.y + (pos[i3 + 2] - this.planePoint.z) * pushDir.z);
      const target = ob + need;
      if (po < target && ob + R > 0) {
        const m = target - po;
        pos[i3] += pushDir.x * m; pos[i3 + 1] += pushDir.y * m; pos[i3 + 2] += pushDir.z * m;
      }
    }
  }

  poke(point, strength) {
    const { pos, prev, pinned } = this;
    for (let k = 0; k < pinned.length; k++) {
      if (pinned[k]) continue;
      const i3 = k * 3;
      const d2 = (pos[i3] - point.x) ** 2 + (pos[i3 + 1] - point.y) ** 2 + (pos[i3 + 2] - point.z) ** 2;
      const f = Math.exp(-d2 / 0.8) * strength;
      prev[i3] += this.inward.x * f; prev[i3 + 1] += this.inward.y * f; prev[i3 + 2] += this.inward.z * f;
    }
  }

  reset() {
    this.pos.set(this.rest);
    this.prev.set(this.rest);
    this.side = 0;
  }

  refresh() {
    this.posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}

const _pd = new THREE.Vector3();
const _rel = new THREE.Vector3();

export class Net {
  constructor(scene) {
    const cell = 0.16;
    const tex = makeNetTexture();
    this.material = new THREE.MeshStandardMaterial({
      color: 0xf2f4f5,
      alphaMap: tex,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
      depthWrite: false,
      emissive: 0x333333,
    });
    const tile = 0.26; // metres per texture repeat
    const sideCols = Math.round(Db / cell) + 1, sideRows = Math.round(H / cell) + 1;
    const backCols = Math.round((2 * hw) / cell) + 1;
    const backLen = Math.hypot(H, Db - Dr);
    const backRows = Math.round(backLen / cell) + 1;
    const roofRows = Math.round(Dr / cell) + 1;
    const inY = (p) => p.y > -0.2 && p.y < H + 0.04;
    this.panels = [
      new Panel('left', sideCols, sideRows,
        (s, t, v) => v.set(-hw, t * H, -s * (Db + (Dr - Db) * t)),
        new THREE.Vector3(1, 0, 0),
        (p) => inY(p) && p.z < 0.05 && p.z > -(Db + (Dr - Db) * Math.max(0, Math.min(1, p.y / H))) - 0.05,
        { u: Db / tile, v: H / tile }),
      new Panel('right', sideCols, sideRows,
        (s, t, v) => v.set(hw, t * H, -s * (Db + (Dr - Db) * t)),
        new THREE.Vector3(-1, 0, 0),
        (p) => inY(p) && p.z < 0.05 && p.z > -(Db + (Dr - Db) * Math.max(0, Math.min(1, p.y / H))) - 0.05,
        { u: Db / tile, v: H / tile }),
      new Panel('back', backCols, backRows,
        (s, t, v) => v.set(-hw + s * 2 * hw, t * H, -Db + (Db - Dr) * t),
        new THREE.Vector3(0, -(Db - Dr), H),
        (p) => inY(p) && Math.abs(p.x) < hw + 0.05,
        { u: (2 * hw) / tile, v: backLen / tile }),
      new Panel('roof', backCols, roofRows,
        (s, t, v) => v.set(-hw + s * 2 * hw, H, -t * Dr),
        new THREE.Vector3(0, -1, 0),
        (p) => Math.abs(p.x) < hw + 0.05 && p.z < 0.05 && p.z > -Dr - 0.05,
        { u: (2 * hw) / tile, v: Dr / tile }),
    ];
    this.group = new THREE.Group();
    for (const p of this.panels) {
      const m = new THREE.Mesh(p.geometry, this.material);
      m.renderOrder = 2;
      m.frustumCulled = false;
      this.group.add(m);
    }
    scene.add(this.group);
    this.time = 0;
    this.acc = 0;
    // let the net settle into its resting drape
    for (let i = 0; i < 240; i++) for (const p of this.panels) p.simulate(1 / 120, 9.81, 4, 0, 0);
    for (const p of this.panels) { p.rest.set(p.pos); p.prev.set(p.pos); p.refresh(); }
    this.ballInside = false;
  }

  reset() {
    for (const p of this.panels) { p.reset(); p.refresh(); }
    this.ballInside = false;
  }

  /**
   * Called every physics sub-step. Applies the soft net force to the ball and returns
   * the strongest contact speed this step (so the game can play a "swish").
   */
  interactBall(s, dt) {
    let hit = 0;
    for (const p of this.panels) {
      _pd.subVectors(s.p, p.planePoint);
      const sd = _pd.dot(p.inward); // + inside the goal
      if (!p.bounds(s.p)) { if (Math.abs(sd) > R * 1.5) p.side = 0; continue; }
      if (p.side === 0 && Math.abs(sd) > R * 0.5) p.side = Math.sign(sd);
      if (p.side === 0) continue;
      const pen = R - sd * p.side;
      if (pen <= 0) continue;
      const vn = s.v.dot(p.inward) * p.side; // negative while pushing into the net
      // stiff, lossy mesh: soaks up the shot and only nudges the ball back
      const k = 1150, c = 36;
      let acc = k * pen - c * vn;
      if (vn > 0) acc *= 0.25;
      s.v.addScaledVector(p.inward, acc * dt * p.side);
      if (vn > 0) s.v.addScaledVector(p.inward, -vn * p.side * Math.min(1, dt * 14));
      // friction of the mesh against the ball
      _rel.copy(s.v).addScaledVector(p.inward, -s.v.dot(p.inward));
      s.v.addScaledVector(_rel, -Math.min(1, dt * 5));
      s.w.multiplyScalar(1 - Math.min(1, dt * 4));
      if (vn < -1) hit = Math.max(hit, -vn);
      p.contact = Math.max(p.contact, Math.min(1, pen * 3));
      p.lastPush = p.side;
    }
    return hit;
  }

  poke(point, strength) {
    for (const p of this.panels) p.poke(point, strength);
  }

  update(dt, ballPos) {
    this.time += dt;
    this.acc += dt;
    const step = 1 / 120;
    let steps = 0;
    while (this.acc >= step && steps < 4) {
      for (const p of this.panels) p.simulate(step, 9.81, 3, this.time, 0.35);
      this.acc -= step;
      steps++;
    }
    if (steps === 4) this.acc = 0;
    for (const p of this.panels) {
      if (p.side !== 0) {
        _pd.copy(p.inward).multiplyScalar(-p.side);
        p.wrapBall(ballPos, _pd);
      }
      p.contact *= Math.exp(-dt * 6);
      if (steps > 0 || p.side !== 0) p.refresh();
    }
  }
}
