import * as THREE from 'three';

// Rain: GPU-animated streaks (Kenney particle "trace" sprite) wrapped around the camera,
// wet ground, darker sky, thunder + lightning. `mode`: clear | rain | dynamic.
const VS = `
attribute vec3 iOffset; attribute float iSpeed;
uniform float uTime; uniform vec3 uCam; uniform float uRain; uniform vec2 uWind;
varying vec2 vUv; varying float vA;
#include <fog_pars_vertex>
void main(){
  const vec3 box = vec3(60.0, 34.0, 60.0);
  float py = mod(iOffset.y - uTime * iSpeed, box.y);
  // drops live in world space; wrap horizontally around the camera
  vec2 xz = mod(iOffset.xz - uCam.xz + box.xz * 0.5, box.xz) - box.xz * 0.5;
  vec3 world = vec3(uCam.x + xz.x, uCam.y - box.y * 0.45 + py, uCam.z + xz.y);
  world.xz += uWind * (box.y - py) * 0.04;
  vec3 toCam = normalize(vec3(cameraPosition.x - world.x, 0.0, cameraPosition.z - world.z) + 1e-4);
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  world += right * position.x * 0.05 + vec3(uWind.x * 0.03, 1.0, uWind.y * 0.03) * position.y * 0.9;
  vUv = uv;
  float idx = fract(iOffset.x * 13.7 + iOffset.z * 7.1);
  vA = step(idx, uRain) * smoothstep(1.0, 6.0, length(world - cameraPosition));
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
uniform sampler2D tStreak; uniform vec3 uColor;
varying vec2 vUv; varying float vA;
#include <fog_pars_fragment>
void main(){
  float a = texture2D(tStreak, vUv).a * vA * 0.55;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <fog_fragment>
}`;

export class Weather {
  constructor({ scene, rs, terrain, audio, streakTex, count = 7000 }) {
    Object.assign(this, { scene, rs, terrain, audio });
    this.mode = 'clear'; this.rain = 0; this.target = 0; this.time = 0;
    this.nextThunder = 12; this.flash = 0; this.cycle = 0;
    const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    const off = new Float32Array(count * 3), spd = new Float32Array(count);
    for (let i = 0; i < count; i++) { off[i * 3] = Math.random() * 60; off[i * 3 + 1] = Math.random() * 34; off[i * 3 + 2] = Math.random() * 60; spd[i] = 17 + Math.random() * 8; }
    g.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3));
    g.setAttribute('iSpeed', new THREE.InstancedBufferAttribute(spd, 1));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uRain: { value: 0 }, uWind: { value: new THREE.Vector2(3, 1.5) },
        tStreak: { value: null }, uColor: { value: new THREE.Color(0xc8d4e0) },
      }]),
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: true,
    });
    this.mat.uniforms.tStreak.value = streakTex;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'clear') this.target = 0;
    else if (mode === 'rain') this.target = 1;
    else this.cycle = 0;
  }

  get wet() { return this.rain; }

  update(dt, camPos) {
    this.time += dt;
    if (this.mode === 'dynamic') {
      // ~4 min clear, ~2.5 min rain
      this.cycle += dt;
      const t = this.cycle % 400;
      this.target = t > 240 ? 1 : 0;
    }
    this.rain += (this.target - this.rain) * Math.min(1, dt * 0.12);
    if (Math.abs(this.target - this.rain) < 0.002) this.rain = this.target;
    const r = this.rain;
    this.mesh.visible = r > 0.01;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uCam.value.copy(camPos);
    this.mat.uniforms.uRain.value = r;
    this.mat.uniforms.uColor.value.set(this.rs.isNight ? 0x56606e : 0xc8d4e0);
    // thunder & lightning while it pours
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (r > 0.6) {
      this.nextThunder -= dt;
      if (this.nextThunder <= 0) {
        this.nextThunder = 14 + Math.random() * 26;
        this.flash = 1;
        const delay = 400 + Math.random() * 1800;
        setTimeout(() => this.audio?.play(Math.random() < 0.5 ? 'thunder_1' : 'thunder_2', { bus: 'amb', volume: 0.5 + Math.random() * 0.4 }), delay);
      }
    }
    this.rs.applyWeather(r, this.flash);
    this.terrain.setWet(r);
    if (this.audio?.loops.rain) this.audio.loops.rain.set(r * 0.55, 1, 0.5);
    else if (r > 0.01 && this.audio?.buffers.rain_loop && this.audio.loops.birds) this.audio.loops.rain = this.audio.loop('rain_loop', 'amb', { volume: 0 });
  }
}
