import * as THREE from 'three';

// GPU-light particle system: a fixed pool of sprites simulated on the CPU.
// Used for turf spray at the strike, chalk/paint chips off the woodwork and confetti.
const MAX = 1600;

function makeSpriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.spin = new Float32Array(MAX);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uTex: { value: makeSpriteTexture() }, uPx: { value: 800 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uPx;
        varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uPx / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  emit(n, origin, opts) {
    const { speed = 3, spread = 1, up = 1, color = [1, 1, 1], colorVar = 0.1, size = 0.05, life = 1, drag = 1.5, gravity = 9.8, dir = null, palette = null } = opts;
    for (let i = 0; i < n; i++) {
      const k = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const i3 = k * 3;
      this.pos[i3] = origin.x + (Math.random() - 0.5) * 0.1;
      this.pos[i3 + 1] = origin.y + Math.random() * 0.05;
      this.pos[i3 + 2] = origin.z + (Math.random() - 0.5) * 0.1;
      let vx = (Math.random() - 0.5) * 2 * spread, vy = Math.random() * up, vz = (Math.random() - 0.5) * 2 * spread;
      if (dir) { vx += dir.x; vy += dir.y; vz += dir.z; }
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i3] = vx * s; this.vel[i3 + 1] = vy * s; this.vel[i3 + 2] = vz * s;
      const c = palette ? palette[Math.floor(Math.random() * palette.length)] : color;
      const v = 1 + (Math.random() - 0.5) * 2 * colorVar;
      this.col[i3] = c[0] * v; this.col[i3 + 1] = c[1] * v; this.col[i3 + 2] = c[2] * v;
      this.size[k] = size * (0.6 + Math.random() * 0.8);
      this.life[k] = this.maxLife[k] = life * (0.6 + Math.random() * 0.8);
      this.drag[k] = drag;
      this.grav[k] = gravity;
      this.spin[k] = Math.random() * 6.28;
    }
  }

  turf(p, dir) {
    this.emit(26, p, { speed: 3.2, spread: 0.6, up: 1.2, dir: new THREE.Vector3(dir.x * 0.8, 0.6, dir.z * 0.8), color: [0.22, 0.42, 0.12], colorVar: 0.3, size: 0.035, life: 0.9, drag: 1.2, gravity: 9.8 });
    this.emit(10, p, { speed: 1.2, spread: 0.8, up: 0.6, color: [0.55, 0.5, 0.36], colorVar: 0.1, size: 0.16, life: 0.8, drag: 3, gravity: 0.6 });
  }

  chips(p) {
    this.emit(14, p, { speed: 3, spread: 1, up: 1, color: [1, 1, 1], colorVar: 0.05, size: 0.03, life: 0.7, drag: 1, gravity: 9.8 });
    this.emit(6, p, { speed: 0.6, spread: 1, up: 0.5, color: [1, 1, 1], colorVar: 0.05, size: 0.25, life: 0.45, drag: 3, gravity: 0 });
  }

  confetti(center, count = 280) {
    const palette = [[0.84, 0.15, 0.24], [1, 1, 1], [1, 0.82, 0.25], [0.84, 0.15, 0.24], [0.2, 0.4, 0.9]];
    for (const sx of [-1, 1]) {
      const o = new THREE.Vector3(center.x + sx * 9, 7.5, center.z - 10);
      this.emit(count / 2, o, { speed: 4.5, spread: 0.9, up: 1.4, dir: new THREE.Vector3(-sx * 0.3, 0.8, 0.9), palette, colorVar: 0.1, size: 0.07, life: 4.5, drag: 1.1, gravity: 2.2 });
    }
  }

  /** Pyro fountains behind the goal: bright sparks that bloom. */
  pyro(dt) {
    const n = Math.max(1, Math.round(dt * 130));
    for (const sx of [-13, -6.5, 6.5, 13]) {
      this.emit(n, new THREE.Vector3(sx, 0.95, -6.2), {
        speed: 6.5, spread: 0.12, up: 1, dir: new THREE.Vector3(0, 1.4, 0.15),
        palette: [[5, 3.2, 1.1], [5, 4.2, 2.2], [4, 2, 0.6]], colorVar: 0.15, size: 0.13, life: 1.0, drag: 0.7, gravity: 6,
      });
    }
  }

  update(dt, pxScale) {
    this.uniforms.uPx.value = pxScale;
    for (let k = 0; k < MAX; k++) {
      if (this.life[k] <= 0) { this.alpha[k] = 0; continue; }
      this.life[k] -= dt;
      const i3 = k * 3;
      const d = Math.exp(-this.drag[k] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[k] * dt; this.vel[i3 + 2] *= d;
      // confetti flutter
      if (this.grav[k] < 3 && this.grav[k] > 1) { this.spin[k] += dt * 7; this.vel[i3] += Math.sin(this.spin[k]) * dt * 1.5; }
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.01) { this.pos[i3 + 1] = 0.01; this.vel[i3] *= 0.5; this.vel[i3 + 1] = 0; this.vel[i3 + 2] *= 0.5; }
      const f = this.life[k] / this.maxLife[k];
      this.alpha[k] = Math.min(1, f * 3) * (this.grav[k] < 1 ? f * 0.5 : 1);
    }
    const g = this.points.geometry.attributes;
    g.position.needsUpdate = true; g.aColor.needsUpdate = true; g.aSize.needsUpdate = true; g.aAlpha.needsUpdate = true;
  }
}
