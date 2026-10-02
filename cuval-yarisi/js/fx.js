// Parçacık efektleri: iniş tozu, çimen kırıntısı, bitişte gül yaprağı/konfeti.
import * as THREE from 'three';

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}

export class Particles {
  constructor(scene, max = 900) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.kind = new Uint8Array(max);
    this.grow = new Float32Array(max);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vA; varying vec3 vC; uniform float scale;
        void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D map; varying float vA; varying vec3 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a * vA < 0.01) discard; gl_FragColor = vec4(vC, t.a * vA); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
    for (let i = 0; i < max; i++) this.alpha[i] = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, kind = 0, grow = 1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([r, g, b], i * 3);
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.kind[i] = kind; this.grow[i] = grow;
  }

  dust(x, z, power = 1) {
    const n = Math.round(10 + power * 10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.6 + Math.random() * 1.4) * power;
      const shade = 0.72 + Math.random() * 0.15;
      this.spawn(x + Math.cos(a) * 0.3, 0.06, z + Math.sin(a) * 0.3, Math.cos(a) * s, 0.25 + Math.random() * 0.6, Math.sin(a) * s,
        0.55 + Math.random() * 0.5, 0.14 + Math.random() * 0.14, shade * 0.82, shade * 0.78, shade * 0.6, 0, 2.6);
    }
    // koparılan çimen parçaları
    for (let i = 0; i < 5 * power; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(x, 0.08, z, Math.cos(a) * 1.2, 1.6 + Math.random() * 1.4, Math.sin(a) * 1.2, 0.9, 0.05, 0.3, 0.5, 0.15, 1, 1);
    }
  }

  // çamura iniş: kahverengi damlalar ve alçak ıslak sıçrama
  splash(x, z, power = 1) {
    const n = Math.round(18 + power * 14);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.5 + Math.random() * 1.6) * power;
      const shade = 0.16 + Math.random() * 0.12;
      this.spawn(x + Math.cos(a) * 0.25, 0.05, z + Math.sin(a) * 0.25, Math.cos(a) * s, 1.2 + Math.random() * 2.2 * power, Math.sin(a) * s,
        0.6 + Math.random() * 0.4, 0.035 + Math.random() * 0.05, shade * 1.35, shade, shade * 0.62, 1, 1);
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(x + Math.cos(a) * 0.3, 0.04, z + Math.sin(a) * 0.3, Math.cos(a) * 0.5, 0.15, Math.sin(a) * 0.5, 0.5, 0.18, 0.3, 0.24, 0.17, 0, 1.6);
    }
  }

  confetti(x, z, n = 140) {
    const pal = [[0.85, 0.12, 0.16], [0.97, 0.93, 0.85], [0.85, 0.64, 0.25], [0.12, 0.52, 0.29], [0.95, 0.45, 0.55]];
    for (let i = 0; i < n; i++) {
      const c = pal[i % pal.length];
      this.spawn(x + (Math.random() - 0.5) * 6, 3 + Math.random() * 2.5, z + (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3, 1 + Math.random() * 3.5, (Math.random() - 0.5) * 3, 3.5 + Math.random() * 2, 0.07 + Math.random() * 0.05, c[0], c[1], c[2], 2, 1);
    }
  }

  update(dt) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = this.kind[i];
      const j = i * 3;
      if (k === 0) { v[j] *= 1 - dt * 3; v[j + 2] *= 1 - dt * 3; v[j + 1] -= dt * 0.4; }
      else if (k === 1) { v[j + 1] -= dt * 9; }
      else { v[j] *= 1 - dt * 1.5; v[j + 2] *= 1 - dt * 1.5; v[j + 1] = Math.max(v[j + 1] - dt * 6, -0.9); v[j] += Math.sin(this.life[i] * 7 + i) * dt * 2; }
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      if (p[j + 1] < 0.01) { p[j + 1] = 0.01; v[j + 1] = 0; v[j] *= 0.5; v[j + 2] *= 0.5; }
      const lf = this.life[i] / this.maxLife[i];
      this.alpha[i] = k === 0 ? Math.min(1, lf * 1.6) * 0.5 : Math.min(1, lf * 3);
      if (k === 0) this.size[i] += dt * 0.25 * this.grow[i];
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}
