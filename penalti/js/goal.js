// Goal frame + cloth-like net (wave simulation on 4 panels) + geometry data for collisions.
import * as THREE from 'three';

export const GOAL = {
  halfW: 3.66,            // inner half width
  h: 2.44,                // inner height
  post: 0.06,             // post radius
  topDepth: 0.9, topY: 2.22, groundDepth: 2.0,
};

function netTexture(renderer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-8, -8); g.lineTo(136, 136); g.moveTo(-8, 136); g.lineTo(136, -8); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

class NetPanel {
  constructor(corners, nu, nv, outward, tex, material, cell = 0.14) {
    // corners: p00 (u0,v0), p10 (u1,v0), p01 (u0,v1), p11 (u1,v1)
    this.nu = nu; this.nv = nv;
    const [p00, p10, p01, p11] = corners;
    this.corners = corners;
    this.rest = new Float32Array(nu * nv * 3);
    this.uv = new Float32Array(nu * nv * 2);
    const lenU = p00.distanceTo(p10), lenV = p00.distanceTo(p01);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const u = i / (nu - 1), v = j / (nv - 1);
      const a = p00.clone().lerp(p10, u), b = p01.clone().lerp(p11, u);
      const p = a.lerp(b, v);
      const k = (j * nu + i);
      this.rest[k * 3] = p.x; this.rest[k * 3 + 1] = p.y; this.rest[k * 3 + 2] = p.z;
      this.uv[k * 2] = u * lenU / cell; this.uv[k * 2 + 1] = v * lenV / cell;
    }
    // normal (outward)
    const t1 = p10.clone().sub(p00), t2 = p01.clone().sub(p00);
    this.n = new THREE.Vector3().crossVectors(t1, t2).normalize();
    if (this.n.dot(outward) < 0) this.n.negate();
    this.origin = p00.clone(); this.tu = t1.clone(); this.tv = t2.clone();
    this.d = new Float32Array(nu * nv); this.vel = new Float32Array(nu * nv);
    this.pos = new Float32Array(nu * nv * 3);
    const idx = [];
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.geo.setIndex(idx);
    const nrm = new Float32Array(nu * nv * 3); for (let k = 0; k < nu * nv; k++) { nrm[k * 3] = this.n.x; nrm[k * 3 + 1] = this.n.y; nrm[k * 3 + 2] = this.n.z; }
    this.geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.layers.set(1);
    this.sag = 0.035;
    this.dirty = true;
    this.energy = 0;
    this.write();
  }
  // world point -> panel (u,v) in [0,1] + signed distance
  project(p) {
    const r = p.clone().sub(this.origin);
    const lu = this.tu.lengthSq(), lv = this.tv.lengthSq();
    // trapezoid-safe: solve in plane by least squares on tu/tv
    const a = r.dot(this.tu) / lu, b = r.dot(this.tv) / lv;
    return { u: a, v: b, dist: r.dot(this.n) };
  }
  write() {
    const { nu, nv, rest, d, pos, n } = this;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      const u = i / (nu - 1), v = j / (nv - 1);
      const sag = this.sag * 4 * u * (1 - u) * 4 * v * (1 - v) * (this.sagSign || 1);
      const dd = d[k] + sag;
      pos[k * 3] = rest[k * 3] + n.x * dd; pos[k * 3 + 1] = rest[k * 3 + 1] + n.y * dd - (this.gravSag ? 0.02 * (1 - v) * v * 4 : 0); pos[k * 3 + 2] = rest[k * 3 + 2] + n.z * dd;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  // press the net outward around a world position (ball contact)
  press(p, radius, depth) {
    const { nu, nv, rest, d } = this;
    const r2 = radius * radius; let touched = false;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      const dx = rest[k * 3] - p.x, dy = rest[k * 3 + 1] - p.y, dz = rest[k * 3 + 2] - p.z;
      const q = dx * dx + dy * dy + dz * dz;
      if (q < r2) { const f = 1 - q / r2; const t = depth * f * f * (3 - 2 * f); if (Math.abs(t) > Math.abs(d[k])) { d[k] = t; this.vel[k] = 0; touched = true; } }
    }
    if (touched) this.dirty = true;
  }
  step(dt) {
    if (!this.dirty && this.energy < 1e-6) return;
    const { nu, nv, d, vel } = this;
    const A = 1400, K = 22, C = 2.6;
    const sub = 2, h = dt / sub;
    let e = 0;
    for (let s = 0; s < sub; s++) {
      for (let j = 1; j < nv - 1; j++) for (let i = 1; i < nu - 1; i++) {
        const k = j * nu + i;
        const lap = d[k - 1] + d[k + 1] + d[k - nu] + d[k + nu] - 4 * d[k];
        vel[k] += (A * lap - K * d[k] - C * vel[k]) * h;
      }
      for (let j = 1; j < nv - 1; j++) for (let i = 1; i < nu - 1; i++) { const k = j * nu + i; d[k] += vel[k] * h; e += vel[k] * vel[k] + d[k] * d[k]; }
    }
    this.energy = e; this.dirty = e > 1e-6; if (!this.dirty) { d.fill(0); vel.fill(0); }
    this.write();
  }
}

export class Goal {
  constructor(renderer) {
    this.group = new THREE.Group();
    this.renderer = renderer;
    const hw = GOAL.halfW, H = GOAL.h, pr = GOAL.post;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.34, metalness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.4, metalness: 0.5 });
    const tube = (a, b, r, mat = frameMat) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20, 1), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m); return m;
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const px = hw + pr, top = H + pr;
    // front frame
    tube(V(-px, 0, 0), V(-px, top + pr, 0), pr);
    tube(V(px, 0, 0), V(px, top + pr, 0), pr);
    tube(V(-px - pr, top, 0), V(px + pr, top, 0), pr);
    // rear frame
    const td = GOAL.topDepth, ty = GOAL.topY, gd = GOAL.groundDepth;
    tube(V(-px, top, 0), V(-px, ty + pr, -td), 0.025, darkMat);
    tube(V(px, top, 0), V(px, ty + pr, -td), 0.025, darkMat);
    tube(V(-px, ty + pr, -td), V(px, ty + pr, -td), 0.025, darkMat);
    tube(V(-px, ty + pr, -td), V(-px, 0.02, -gd), 0.025, darkMat);
    tube(V(px, ty + pr, -td), V(px, 0.02, -gd), 0.025, darkMat);
    tube(V(-px, 0.02, -gd), V(px, 0.02, -gd), 0.02, darkMat);
    tube(V(-px, 0.02, 0), V(-px, 0.02, -gd), 0.02, darkMat);
    tube(V(px, 0.02, 0), V(px, 0.02, -gd), 0.02, darkMat);
    // net
    this.tex = netTexture(renderer);
    this.netMat = new THREE.MeshStandardMaterial({
      color: 0xb8bfc8, roughness: 0.9, metalness: 0, alphaMap: this.tex, transparent: false, alphaTest: 0.04, side: THREE.DoubleSide, alphaToCoverage: true,
    });
    this.netMat.onBeforeCompile = (shader) => {
      const before = shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a = clamp(diffuseColor.a * 1.05, 0.0, 1.0); if (diffuseColor.a < 0.05) discard;');
      if (before === shader.fragmentShader) console.warn('net alpha not patched');
    };
    this.netMat.customProgramCacheKey = () => 'net';
    const inner = hw, cell = 0.13;
    const nx = Math.round(2 * inner / cell) + 1;
    const mk = (corners, nu, nv, outward, sagSign = 1) => { const p = new NetPanel(corners, nu, nv, outward, this.tex, this.netMat, cell); p.sagSign = sagSign; this.group.add(p.mesh); return p; };
    const top0 = ty, topz = -td;
    this.panels = [
      mk([V(-inner, ty, -td), V(inner, ty, -td), V(-inner, H, 0), V(inner, H, 0)], nx, 9, V(0, 1, 0), -1),                       // roof
      mk([V(-inner, gd * 0 + 0, -gd), V(inner, 0, -gd), V(-inner, ty, -td), V(inner, ty, -td)], nx, 18, V(0, 0, -1), 1),              // back
      mk([V(-inner, 0, 0), V(-inner, 0, -gd), V(-inner, H, 0), V(-inner, ty, -td)], 16, 18, V(-1, 0, 0), 1),                          // left
      mk([V(inner, 0, 0), V(inner, 0, -gd), V(inner, H, 0), V(inner, ty, -td)], 16, 18, V(1, 0, 0), 1),                               // right
    ];
    this.panelNames = ['roof', 'back', 'left', 'right'];
    // post / bar capsules for physics: [a, b, r]
    this.capsules = [
      [V(-px, 0, 0), V(-px, top + pr, 0), pr],
      [V(px, 0, 0), V(px, top + pr, 0), pr],
      [V(-px - pr, top, 0), V(px + pr, top, 0), pr],
    ];
    // ground shadow catcher inside goal (dark, subtle)
  }
  update(dt) { for (const p of this.panels) p.step(dt); }
  pressAll(pos, radius, depth) { for (const p of this.panels) { const pr = p.project(pos); if (Math.abs(pr.dist) < radius + 0.3) p.press(pos, radius, depth); } }
  ripple(pos, strength = 0.25, radius = 0.5) { for (const p of this.panels) { const pr = p.project(pos); if (Math.abs(pr.dist) < 1.0) p.press(pos, radius, strength); } }
}
