import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, SMAAEffect, SMAAPreset,
  HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export const TIME_PRESETS = {
  noon: { sunColor: 0xfff0d6, sunIntensity: 2.7, env: 0.75, bg: 1, hemi: [0xcfe3ff, 0x8a7350, 0.35], minElev: 40, maxElev: 55, fogNear: 650, fogFar: 4800, fogTint: 0xb7cbe0, impostorTint: 0xdbdbd6 },
  sunset: { sunColor: 0xffb46e, sunIntensity: 2.5, env: 0.85, bg: 1, hemi: [0xffd9b0, 0x5a4636, 0.32], minElev: 11, maxElev: 22, fogNear: 450, fogFar: 4200, fogTint: 0xf0c49a, impostorTint: 0xe8c4a0 },
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

export const QUALITY = {
  low: { pixelRatio: 0.75, shadow: 1024, ao: false, bloom: false, smaa: false, grass: 'low', shadowRange: 60 },
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
  setupLighting(skies) {
    const s = this.scene;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.skies = {};
    for (const [name, { sky, hdr }] of Object.entries(skies)) {
      sky.mapping = THREE.EquirectangularReflectionMapping;
      sky.colorSpace = THREE.SRGBColorSpace;
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

  setTimeOfDay(name) {
    const P = TIME_PRESETS[name] || TIME_PRESETS.noon, sky = this.skies[name] || this.skies.noon, s = this.scene;
    s.background = sky.sky;
    s.environment = sky.env;
    s.environmentIntensity = P.env;
    s.backgroundIntensity = P.bg;
    // light comes from where the sun is in the HDRI; elevation clamped for readable shadows
    const el = THREE.MathUtils.clamp(sky.sunEl, P.minElev * Math.PI / 180, P.maxElev * Math.PI / 180);
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(sky.sunAz), Math.sin(el), Math.cos(el) * Math.sin(sky.sunAz)).normalize();
    this.sun.color.set(P.sunColor); this.sun.intensity = P.sunIntensity;
    this.hemi.color.set(P.hemi[0]); this.hemi.groundColor.set(P.hemi[1]); this.hemi.intensity = P.hemi[2];
    s.fog.color.copy(sky.horizon).lerp(new THREE.Color(P.fogTint), 0.35);
    s.fog.near = P.fogNear; s.fog.far = P.fogFar;
    this.timeOfDay = name;
    this.impostorTint = new THREE.Color(P.impostorTint);
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
