import * as THREE from 'three';
import { BALL } from './config.js';
import { BallState } from './physics.js';

const R = BALL.radius;

// Truncated icosahedron: pentagon centres = icosahedron vertices,
// hexagon centres = icosahedron face centres.
function panelCentres() {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(a => new THREE.Vector3(...a).normalize());
  const f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const hex = f.map(([a, b, c]) => v[a].clone().add(v[b]).add(v[c]).normalize());
  return { pent: v, hex };
}

function makeBallMaterial() {
  const { pent, hex } = panelCentres();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
  });
  const uniforms = {
    uPent: { value: pent },
    uHex: { value: hex },
    uObjToView: { value: new THREE.Matrix3() },
    uPentColor: { value: new THREE.Color(0x10131c) },
    uAccent: { value: new THREE.Color(0xf2b51d) },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjN = normalize(position);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObjN;
uniform vec3 uPent[12];
uniform vec3 uHex[20];
uniform mat3 uObjToView;
uniform vec3 uPentColor;
uniform vec3 uAccent;
float gSeam; float gPent; float gRing; vec3 gPerturb;
void ballPanels(vec3 n) {
  // central projection onto the truncated icosahedron: face with max dot/d wins
  const float KP = 0.97414;
  float s1 = -2.0, s2 = -2.0; vec3 c1 = vec3(0.0), c2 = vec3(0.0); float p1 = 0.0;
  for (int i = 0; i < 12; i++) {
    float s = dot(n, uPent[i]) * KP;
    if (s > s1) { s2 = s1; c2 = c1; s1 = s; c1 = uPent[i] * KP; p1 = 1.0; }
    else if (s > s2) { s2 = s; c2 = uPent[i] * KP; }
  }
  for (int i = 0; i < 20; i++) {
    float s = dot(n, uHex[i]);
    if (s > s1) { s2 = s1; c2 = c1; s1 = s; c1 = uHex[i]; p1 = 0.0; }
    else if (s > s2) { s2 = s; c2 = uHex[i]; }
  }
  vec3 g = c1 - c2;
  float gl = max(length(g - n * dot(g, n)), 1e-4);
  float dist = (s1 - s2) / gl;               // ~angular distance to the nearest seam
  float aa = fwidth(dist) * 1.2 + 1e-4;
  gSeam = 1.0 - smoothstep(0.016, 0.016 + aa, dist);
  gPent = p1;
  float ringD = abs(dist - 0.085);
  gRing = p1 * (1.0 - smoothstep(0.012, 0.012 + aa, ringD));
  // groove: tilt the normal toward the seam, plus a soft panel pillow
  float groove = (1.0 - smoothstep(0.0, 0.05, dist)) * 0.55;
  vec3 toSeam = normalize(-(g - n * dot(g, n)));
  vec3 cDir = normalize(c1);
  gPerturb = normalize(n + toSeam * groove * 0.35 + (cDir - n) * 0.12);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
ballPanels(normalize(vObjN));
vec3 panelCol = mix(vec3(0.96, 0.965, 0.95), uPentColor, gPent);
panelCol = mix(panelCol, uAccent, gRing);
panelCol = mix(panelCol, vec3(0.05), gSeam * 0.85);
diffuseColor.rgb *= panelCol;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.85, gSeam);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(uObjToView * gPerturb);`)
      .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
clearcoatNormal = normalize(uObjToView * normalize(vObjN));`);
  };
  return mat;
}

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _m4 = new THREE.Matrix4();
const _dq = new THREE.Quaternion();
const _axis = new THREE.Vector3();

export class Ball {
  constructor(scene) {
    this.state = new BallState();
    this.material = makeBallMaterial();
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 12), this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      _m4.multiplyMatrices(camera.matrixWorldInverse, this.mesh.matrixWorld);
      this.material.userData.uniforms.uObjToView.value.setFromMatrix4(_m4);
    };
    scene.add(this.mesh);

    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false })
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;
    scene.add(this.blob);

    this.attached = null; // Object3D the ball is glued to (keeper's hands)
    this.attachOffset = new THREE.Vector3();
    this.trail = new BallTrail(scene);
    this.sync();
  }

  place(x, z) {
    const s = this.state;
    s.p.set(x, R, z);
    s.v.set(0, 0, 0);
    s.w.set(0, 0, 0);
    s.knuckle = 0;
    s.onGround = true;
    this.attached = null;
    this.mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0));
    this.trail.reset();
    this.sync();
  }

  /** Integrates the visual spin from the angular velocity. */
  spin(dt) {
    const w = this.state.w;
    const ang = w.length() * dt;
    if (ang > 1e-6) {
      _axis.copy(w).normalize();
      _dq.setFromAxisAngle(_axis, ang);
      this.mesh.quaternion.premultiply(_dq);
    }
  }

  sync() {
    const p = this.state.p;
    this.mesh.position.copy(p);
    const h = Math.max(0, p.y - R);
    const s = 0.34 + h * 0.18;
    this.blob.scale.set(s, s, 1);
    this.blob.position.set(p.x, 0.012, p.z);
    this.blob.material.opacity = Math.max(0, 1 - h / 3.5);
  }
}

/** Ribbon trail that fades out behind a moving ball. */
class BallTrail {
  constructor(scene) {
    this.max = 48;
    this.points = [];
    const n = this.max * 2;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const sideAttr = new Float32Array(n);
    for (let i = 0; i < n; i++) sideAttr[i] = (i % 2) * 2 - 1;
    geo.setAttribute('aSide', new THREE.BufferAttribute(sideAttr, 1));
    const idx = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 0 } },
      vertexShader: `attribute float aAlpha; attribute float aSide; varying float vA; varying float vSide;
        void main(){ vSide = aSide;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        // fade the ribbon when it passes right by the camera (replays, chase cam)
        vA = aAlpha * smoothstep(1.5, 5.0, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA; varying float vSide;
        void main(){ float edge = 1.0 - vSide * vSide; float a = vA * uOpacity * (0.35 + 0.65 * edge);
        gl_FragColor = vec4(uColor * (1.2 + edge), a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.opacity = 0;
    this.active = false;
  }
  reset() {
    this.points.length = 0;
    this.active = false;
    this.opacity = 0;
    this.material.uniforms.uOpacity.value = 0;
  }
  setColor(hex) { this.material.uniforms.uColor.value.set(hex); }
  update(ballPos, camera, dt) {
    if (this.active) {
      this.points.unshift(ballPos.clone());
      if (this.points.length > this.max) this.points.pop();
      this.opacity = Math.min(0.6, this.opacity + dt * 6);
    } else {
      this.opacity = Math.max(0, this.opacity - dt * 1.6);
      if (this.points.length > 1) this.points.pop();
    }
    this.material.uniforms.uOpacity.value = this.opacity;
    const pts = this.points;
    const n = pts.length;
    const camPos = camera.position;
    const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();
    for (let i = 0; i < this.max; i++) {
      const p = pts[Math.min(i, n - 1)] || ballPos;
      const q = pts[Math.min(i + 1, n - 1)] || p;
      dir.subVectors(p, q);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      tmp.subVectors(camPos, p);
      side.crossVectors(dir, tmp).normalize();
      const f = i / (this.max - 1);
      const w = R * 0.55 * (1 - f) + 0.003;
      const a = i < n ? (1 - f) * (1 - f) : 0;
      this.pos[i * 6 + 0] = p.x + side.x * w; this.pos[i * 6 + 1] = p.y + side.y * w; this.pos[i * 6 + 2] = p.z + side.z * w;
      this.pos[i * 6 + 3] = p.x - side.x * w; this.pos[i * 6 + 4] = p.y - side.y * w; this.pos[i * 6 + 5] = p.z - side.z * w;
      this.alpha[i * 2] = a; this.alpha[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
