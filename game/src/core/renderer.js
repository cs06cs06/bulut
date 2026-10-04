import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, SMAAEffect, SMAAPreset,
  HueSaturationEffect, BrightnessContrastEffect, DepthOfFieldEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export const TIME_PRESETS = {
  noon: { sunColor: 0xfff0d6, sunIntensity: 2.7, env: 0.75, bg: 1, hemi: [0xcfe3ff, 0x8a7350, 0.35], minElev: 40, maxElev: 55, fogNear: 650, fogFar: 4800, fogTint: 0xb7cbe0, impostorTint: 0xdbdbd6 },
  sunset: { sunColor: 0xffb46e, sunIntensity: 2.5, env: 0.85, bg: 1, hemi: [0xffd9b0, 0x5a4636, 0.32], minElev: 11, maxElev: 22, fogNear: 450, fogFar: 4200, fogTint: 0xf0c49a, impostorTint: 0xe8c4a0 },
  night: { sunColor: 0x9db4ff, sunIntensity: 0.55, env: 0.55, bg: 0.7, hemi: [0x4a5a88, 0x16130f, 0.28], minElev: 32, maxElev: 50, fogNear: 180, fogFar: 2400, fogTint: 0x161c2c, fogMix: 0.75, impostorTint: 0x3c4458, night: true },
};

// brightest texel of an equirect HDR → sun azimuth/elevation (three.js equirect convention)
function findSun(hdr) {
  const { data, width, height } = hdr.image;
  const half = data instanceof Uint16Array;
  const rd = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < height / 2; y++) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    const l = rd(i) * 0.2126 + rd(i + 1) * 0.7152 + rd(i + 2) * 0.0722;
    if (l > best) { best = l; bx = x; by = y; }
  }
  // HDRLoader data is stored top row first
  const u = (bx + 0.5) / width, v = (by + 0.5) / height;
  return { az: (u - 0.5) * Math.PI * 2, el: (0.5 - v) * Math.PI };
}

// average colour just above the horizon of the background image (used as fog colour)
function horizonColor(img) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, 128, 64);
  const d = x.getImageData(0, 28, 128, 3).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

const _rainFog = new THREE.Color();

// day cycle keyframes: [t, preset, clock hour]
const DAY_KEYS = [[0, 'noon', 10], [0.36, 'noon', 17], [0.46, 'sunset', 19], [0.53, 'sunset', 20], [0.61, 'night', 21.5],
  [0.84, 'night', 28.5], [0.91, 'sunset', 30], [0.95, 'sunset', 31], [1, 'noon', 34]];

export const QUALITY = {
  low: { pixelRatio: 1, shadow: 1024, ao: false, bloom: false, smaa: false, grass: 'low', shadowRange: 50 },
  medium: { pixelRatio: 1, shadow: 2048, ao: false, bloom: true, smaa: true, grass: 'medium', shadowRange: 80 },
  high: { pixelRatio: 1.25, shadow: 2048, ao: true, aoHalf: true, bloom: true, smaa: true, grass: 'high', shadowRange: 95 },
  ultra: { pixelRatio: 2, shadow: 4096, ao: true, aoHalf: false, bloom: true, smaa: true, grass: 'ultra', shadowRange: 120 },
};

// Renderer, lighting rig (HDRI + sun with player-following shadows) and the post stack.
export class RenderSystem {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 9000);
    this.quality = 'high';
  }

  // skies: { noon: {sky, hdr}, sunset: {sky, hdr} } — background JPG + HDR for image-based lighting
  setupLighting(skies, stormSky) {
    const s = this.scene;
    this._buildDome(stormSky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.skies = {};
    for (const [name, { sky, hdr }] of Object.entries(skies)) {
      sky.colorSpace = THREE.SRGBColorSpace;
      sky.generateMipmaps = false; sky.minFilter = THREE.LinearFilter; // no mip seam at the atan wrap
      sky.wrapS = THREE.RepeatWrapping; // skies are turned to follow the sun, so wrap across the seam
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const sun = findSun(hdr);
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      this.skies[name] = { sky, env, sunAz: sun.az, sunEl: sun.el, horizon: horizonColor(sky.image) };
    }
    pmrem.dispose();
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    this.sun = sun;
    s.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7350, 0.35);
    s.add(this.hemi);
    s.fog = new THREE.Fog(0xb7cbe0, 650, 4800);
    this.setTimeOfDay('noon');
  }

  // lighting state of one preset (sky, IBL, sun, hemi, fog) so presets can be blended
  _preset(name) {
    if (this._presets?.[name]) return this._presets[name];
    const P = TIME_PRESETS[name] || TIME_PRESETS.noon, sky = this.skies[name] || this.skies.noon;
    const el = THREE.MathUtils.clamp(sky.sunEl, P.minElev * Math.PI / 180, P.maxElev * Math.PI / 180);
    const st = {
      name, sky: sky.sky, env: sky.env, skyAz: sky.sunAz, sunAz: sky.sunAz, sunEl: el,
      sunColor: new THREE.Color(P.sunColor), sunI: P.sunIntensity, envI: P.env, bg: P.bg,
      hemiSky: new THREE.Color(P.hemi[0]), hemiGround: new THREE.Color(P.hemi[1]), hemiI: P.hemi[2],
      fogNear: P.fogNear, fogFar: P.fogFar, fog: sky.horizon.clone().lerp(new THREE.Color(P.fogTint), P.fogMix ?? 0.35),
      tint: new THREE.Color(P.impostorTint), night: !!P.night,
    };
    (this._presets = this._presets || {})[name] = st;
    return st;
  }

  setTimeOfDay(name) {
    this._blend(this._preset(name), this._preset(name), 0);
    this.timeOfDay = name;
  }

  // Day cycle: t in [0,1) walks morning → noon → sunset → night → dawn. Returns the clock hour.
  setDayCycle(t) {
    const K = DAY_KEYS;
    let i = 0;
    while (i < K.length - 2 && t >= K[i + 1][0]) i++;
    const a = K[i], b = K[i + 1], f = (t - a[0]) / (b[0] - a[0]);
    const k = f * f * (3 - 2 * f);
    this._blend(this._preset(a[1]), this._preset(b[1]), a[1] === b[1] ? 0 : k);
    this.timeOfDay = 'dynamic';
    return (a[2] + (b[2] - a[2]) * f) % 24;
  }

  _blend(A, B, k) {
    const s = this.scene, L = THREE.MathUtils.lerp;
    s.background = null;
    // sun sweeps between the two presets' sun positions (shortest way round)
    let dAz = B.sunAz - A.sunAz; dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
    const az = A.sunAz + dAz * k, el = L(A.sunEl, B.sunEl, k);
    (this.sunDir = this.sunDir || new THREE.Vector3()).set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    // sky: crossfade the two images, each turned so its painted sun sits where the light comes from
    const u = this.dome.material.uniforms;
    u.tA.value = A.sky; u.tA2.value = B.sky; u.uSkyMix.value = k;
    u.uRotA.value = A.skyAz - az; u.uRotA2.value = B.skyAz - az;
    s.environment = k < 0.5 ? A.env : B.env;
    // sunset ↔ night: the sun sets and the moon rises, so the key light dips in between
    const dip = A.night !== B.night ? 1 - 0.85 * Math.sin(Math.PI * k) : 1;
    // the IBL swap at k=0.5 is hidden in a short dip of the environment light
    const envDip = A.env !== B.env ? 1 - 0.35 * Math.max(0, 1 - Math.abs(k - 0.5) * 6) : 1;
    this.sun.color.copy(A.sunColor).lerp(B.sunColor, k);
    this.hemi.color.copy(A.hemiSky).lerp(B.hemiSky, k); this.hemi.groundColor.copy(A.hemiGround).lerp(B.hemiGround, k);
    s.fog.color.copy(A.fog).lerp(B.fog, k);
    this.isNight = k < 0.5 ? A.night : B.night;
    this.impostorTint = (this.impostorTint || new THREE.Color()).copy(A.tint).lerp(B.tint, k);
    this._base = { sun: L(A.sunI, B.sunI, k) * dip, env: L(A.envI, B.envI, k) * envDip, bg: L(A.bg, B.bg, k), hemi: L(A.hemiI, B.hemiI, k),
      fogNear: L(A.fogNear, B.fogNear, k), fogFar: L(A.fogFar, B.fogFar, k), fog: s.fog.color.clone() };
    this.applyWeather(this._wet || 0, 0);
  }

  // Sky dome: equirect day/sunset/night sky blended with an overcast storm sky while it rains
  _buildDome(storm) {
    for (const t of [storm]) { t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    const mat = new THREE.ShaderMaterial({
      uniforms: { tA: { value: null }, tA2: { value: null }, uSkyMix: { value: 0 }, uRotA: { value: 0 }, uRotA2: { value: 0 }, tB: { value: storm }, uMix: { value: 0 }, uIntA: { value: 1 }, uIntB: { value: 0.6 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform sampler2D tA, tA2, tB; uniform float uMix, uIntA, uIntB, uSkyMix, uRotA, uRotA2; varying vec3 vDir;
        vec2 equi(vec3 d, float rot){ return vec2(fract((atan(d.z, d.x) + rot) * 0.15915494 + 0.5), asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5); }
        void main(){
          vec3 d = normalize(vDir);
          vec2 uv = equi(d, 0.0);
          vec3 a = texture2D(tA, equi(d, uRotA)).rgb;
          if (uSkyMix > 0.001) a = mix(a, texture2D(tA2, equi(d, uRotA2)).rgb, uSkyMix);
          a *= uIntA;
          vec3 b = texture2D(tB, uv).rgb * uIntB;
          gl_FragColor = vec4(mix(a, b, uMix), 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.dome.name = 'sky';
    this.dome.onBeforeRender = (r, sc, cam) => { this.dome.position.copy(cam.position); this.dome.updateMatrixWorld(); };
    this.scene.add(this.dome);
  }

  // rain darkens sky and sun, thickens greyer fog; lightning briefly floods the scene
  applyWeather(w, flash = 0) {
    const b = this._base, s = this.scene;
    if (!b) return;
    this._wet = w;
    const night = this.isNight;
    const u = this.dome.material.uniforms;
    u.uMix.value = Math.min(1, w * 1.15);
    u.uIntA.value = b.bg + flash * 0.8;
    u.uIntB.value = (night ? 0.07 : 0.62) + flash * (night ? 0.9 : 0.5);
    this.sun.intensity = b.sun * (1 - w * 0.78) + flash * (night ? 4 : 2);
    s.environmentIntensity = b.env * (1 - w * 0.5) + flash * 0.6;
    this.hemi.intensity = b.hemi * (1 - w * 0.2) + flash * 1.5;
    s.fog.near = b.fogNear * (1 - w * 0.7);
    s.fog.far = b.fogFar * (1 - w * 0.6);
    s.fog.color.copy(b.fog).lerp(_rainFog.set(night ? 0x14181f : 0x8b939b), w * 0.75);
  }

  setQuality(q) {
    this.quality = q;
    const Q = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixelRatio));
    this.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    const r = Q.shadowRange, cam = this.sun.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = 900;
    cam.updateProjectionMatrix();
    this.shadowRange = r;
    this._buildComposer(Q);
    this.resize();
  }

  _buildComposer(Q) {
    if (this.composer) this.composer.dispose();
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (Q.ao) {
      const ao = new N8AOPostPass(this.scene, this.camera, innerWidth, innerHeight);
      ao.configuration.aoRadius = 2.2;
      ao.configuration.distanceFalloff = 1.2;
      ao.configuration.intensity = 2.2;
      ao.configuration.halfRes = !!Q.aoHalf;
      ao.configuration.gammaCorrection = false;
      ao.configuration.aoSamples = Q.aoHalf ? 12 : 16;
      ao.configuration.color = new THREE.Color(0x1d1408);
      composer.addPass(ao);
      this.ao = ao;
    } else this.ao = null;
    // photo mode: depth of field focused on the car
    if (this.photoDOF) {
      const dof = new DepthOfFieldEffect(this.camera, { worldFocusRange: 7, bokehScale: 3.2, resolutionScale: 0.75 });
      dof.target = this.dofTarget;
      composer.addPass(new EffectPass(this.camera, dof));
    }
    const effects = [];
    if (Q.bloom) effects.push(new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.82, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 }));
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }));
    effects.push(new HueSaturationEffect({ saturation: 0.12, hue: 0 }));
    effects.push(new BrightnessContrastEffect({ brightness: -0.02, contrast: 0.12 }));
    effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.48 }));
    composer.addPass(new EffectPass(this.camera, ...effects));
    if (Q.smaa) composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
    this.composer = composer;
  }

  setPhotoDOF(on, target) {
    if (this.photoDOF === on) return;
    this.photoDOF = on; this.dofTarget = target;
    this._buildComposer(QUALITY[this.quality]);
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  // keep the shadow frustum centred on the player, snapped to texels to avoid shimmering
  updateSun(focus) {
    const s = this.sun, r = this.shadowRange;
    const texel = (2 * r) / s.shadow.mapSize.x;
    const t = focus.clone();
    // snap in light space
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), this.sunDir.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = m.clone().invert();
    t.applyMatrix4(inv);
    t.x = Math.round(t.x / texel) * texel; t.y = Math.round(t.y / texel) * texel;
    t.applyMatrix4(m);
    s.target.position.copy(t);
    s.position.copy(t).addScaledVector(this.sunDir, 400);
    s.target.updateMatrixWorld();
  }

  render(dt) { this.composer.render(dt); }
}
