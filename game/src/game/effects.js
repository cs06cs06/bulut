import * as THREE from 'three';

// Dust particles (Kenney particle pack smoke/dirt sprites) and persistent tyre tracks.

const DUST_VS = `
attribute float aSize; attribute float aAlpha; attribute float aRot; attribute vec3 aColor; attribute float aTex;
varying float vAlpha; varying float vRot; varying vec3 vColor; varying float vTex;
uniform float uScale;
varying float vNear;
#include <fog_pars_vertex>
void main(){
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale / -mvPosition.z;
  vAlpha = aAlpha; vRot = aRot; vColor = aColor; vTex = aTex;
  vNear = smoothstep(2.5, 9.0, -mvPosition.z); // fade puffs that reach the camera
  #include <fog_vertex>
}`;
const DUST_FS = `
uniform sampler2D tSmoke; uniform sampler2D tDirt;
varying float vAlpha; varying float vRot; varying vec3 vColor; varying float vTex;
varying float vNear;
#include <fog_pars_fragment>
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = mat2(c, -s, s, c) * p + 0.5;
  vec4 t = vTex < 0.5 ? texture2D(tSmoke, p) : texture2D(tDirt, p);
  float a = t.a * vAlpha * vNear;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * (0.75 + t.r * 0.35), a);
  #include <fog_fragment>
}`;

export class Dust {
  constructor(scene, tex, max = 1400) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.rotV = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aTex = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha); g.setAttribute('aRot', this.aRot);
    g.setAttribute('aColor', this.aColor); g.setAttribute('aTex', this.aTex);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tSmoke: { value: tex.smoke }, tDirt: { value: tex.dirt }, uScale: { value: 800 } }]),
      vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, fog: true,
    });
    this.material.uniforms.tSmoke.value = tex.smoke;
    this.material.uniforms.tDirt.value = tex.dirt;
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.cursor = 0;
    this.aAlpha.array.fill(0);
  }

  setViewport(h, fov) { this.material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); }

  emit(p, v, { size = 2, life = 2, alpha = 0.5, color = [0.75, 0.65, 0.5], tex = 0 } = {}) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.life[i] = 0; this.maxLife[i] = life; this.size0[i] = size; this.alpha0[i] = alpha;
    this.rotV[i] = (Math.random() - 0.5) * 1.5;
    this.aRot.array[i] = Math.random() * 6.28;
    this.aColor.array[i * 3] = color[0]; this.aColor.array[i * 3 + 1] = color[1]; this.aColor.array[i * 3 + 2] = color[2];
    this.aTex.array[i] = tex;
  }

  update(dt, wind) {
    const P = this.pos, V = this.vel;
    const sz = this.aSize.array, al = this.aAlpha.array, rot = this.aRot.array;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] >= this.maxLife[i]) { al[i] = 0; continue; }
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      const drag = Math.exp(-dt * 1.6);
      V[i * 3] = V[i * 3] * drag + wind.x * dt * 0.6;
      V[i * 3 + 1] = V[i * 3 + 1] * drag + (this.aTex.array[i] > 0.5 ? -9 * dt : 0.25 * dt);
      V[i * 3 + 2] = V[i * 3 + 2] * drag + wind.z * dt * 0.6;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      sz[i] = this.size0[i] * (0.5 + Math.sqrt(t) * 1.6);
      al[i] = this.alpha0[i] * Math.min(1, t * 8) * (1 - t) * (1 - t);
      rot[i] += this.rotV[i] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aRot.needsUpdate = this.aColor.needsUpdate = this.aTex.needsUpdate = true;
  }
}

// Ribbon tyre tracks pressed into the ground; ring buffer per wheel.
export class TireTracks {
  constructor(scene, texture, wheels = 4, maxSeg = 900) {
    this.maxSeg = maxSeg;
    this.tracks = [];
    texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, color: 0x3a2a1c, opacity: 1,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true,
    });
    mat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aA; varying float vA;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vA * (1.0 - smoothstep(0.35, 0.5, abs(vMapUv.x - 0.5)));');
    };
    for (let w = 0; w < wheels; w++) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(maxSeg * 4 * 3), uv = new Float32Array(maxSeg * 4 * 2), a = new Float32Array(maxSeg * 4);
      const idx = new Uint16Array(maxSeg * 6);
      for (let s = 0; s < maxSeg; s++) { const v = s * 4; idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], s * 6); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('aA', new THREE.BufferAttribute(a, 1).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 2;
      scene.add(mesh);
      this.tracks.push({ mesh, pos, uv, a, cursor: 0, last: null, lastL: null, lastR: null, v: 0 });
    }
  }

  // p: contact point, dir: forward (xz), normal, width, intensity 0..1
  add(w, p, dir, normal, width, intensity) {
    const t = this.tracks[w];
    if (intensity <= 0.02) { t.last = null; return; }
    if (t.last && t.last.distanceToSquared(p) < 0.36) return;
    const side = new THREE.Vector3().crossVectors(normal, dir).normalize().multiplyScalar(width / 2);
    const lift = normal.clone().multiplyScalar(0.04);
    const L = p.clone().add(side).add(lift), R = p.clone().sub(side).add(lift);
    if (t.last && t.last.distanceToSquared(p) < 9) {
      const s = t.cursor; t.cursor = (t.cursor + 1) % this.maxSeg;
      const o = s * 12;
      const vlen = t.last.distanceTo(p) / 1.6;
      t.pos.set([t.lastL.x, t.lastL.y, t.lastL.z, t.lastR.x, t.lastR.y, t.lastR.z, L.x, L.y, L.z, R.x, R.y, R.z], o);
      t.uv.set([0, t.v, 1, t.v, 0, t.v + vlen, 1, t.v + vlen], s * 8);
      const ia = t.lastI ?? intensity;
      t.a.set([ia, ia, intensity, intensity], s * 4);
      t.v += vlen;
      const g = t.mesh.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.attributes.aA.needsUpdate = true;
    }
    t.last = p.clone(); t.lastL = L; t.lastR = R; t.lastI = intensity;
  }
}

// Fireflies: blinking glow points drifting low over the grass around the player on clear nights.
export class Fireflies {
  constructor(scene, glowTex, count = 140) {
    this.count = count;
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: { tGlow: { value: glowTex }, uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uScale: { value: 600 } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime, uAmount, uScale; uniform vec3 uCenter; varying float vA;
        void main(){
          const float R = 34.0;
          vec2 base = (aSeed.xy - 0.5) * 2.0 * R;
          vec2 drift = vec2(sin(uTime * 0.3 + aSeed.z * 40.0), cos(uTime * 0.23 + aSeed.w * 40.0)) * 3.0;
          vec2 p = mod(base + drift - uCenter.xz + R, 2.0 * R) - R;            // wrap around the player
          vec3 wp = vec3(uCenter.x + p.x, position.y + 0.6 + aSeed.z * 2.2 + sin(uTime * 0.8 + aSeed.w * 30.0) * 0.4, uCenter.z + p.y);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float blink = smoothstep(0.2, 0.9, sin(uTime * (0.6 + aSeed.z) + aSeed.w * 50.0));
          vA = blink * uAmount * smoothstep(R, R * 0.6, length(p));
          gl_PointSize = clamp((0.6 + aSeed.x * 0.4) * uScale / -mv.z, 2.0, 40.0);
        }`,
      fragmentShader: `uniform sampler2D tGlow; varying float vA;
        void main(){ float a = texture2D(tGlow, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * a * 2.0, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    this.points.visible = false;
    scene.add(this.points);
  }

  // heights are filled from the terrain lazily around the player every few metres
  update(dt, center, terrain, amount) {
    const u = this.material.uniforms;
    u.uAmount.value += (amount - u.uAmount.value) * Math.min(1, dt * 0.5);
    this.points.visible = u.uAmount.value > 0.02;
    if (!this.points.visible) return;
    u.uTime.value += dt;
    u.uCenter.value.set(center.x, 0, center.z);
    // use the ground height under the player as the base (the swarm hugs the local terrain)
    const pos = this.points.geometry.attributes.position;
    const h = terrain.heightAt(center.x, center.z);
    if (Math.abs((this._h ?? -1e9) - h) > 0.5) { this._h = h; for (let i = 0; i < this.count; i++) pos.setY(i, h); pos.needsUpdate = true; }
  }
}
