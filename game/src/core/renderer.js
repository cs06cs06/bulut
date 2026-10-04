import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, SMAAEffect, SMAAPreset,
  HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

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

  setupLighting(skyTexture, envHdr) {
    const s = this.scene;
    skyTexture.mapping = THREE.EquirectangularReflectionMapping;
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    s.background = skyTexture;
    s.backgroundIntensity = 1.0;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    envHdr.mapping = THREE.EquirectangularReflectionMapping;
    s.environment = pmrem.fromEquirectangular(envHdr).texture;
    s.environmentIntensity = 0.75;
    envHdr.dispose(); pmrem.dispose();
    // Sun azimuth matches the sun in the HDRI; elevation lowered a bit for nicer shading
    const az = (0.5925 - 0.5) * Math.PI * 2, el = 52 * Math.PI / 180;
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    this.sun = sun;
    s.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7350, 0.35);
    s.add(hemi);
    s.fog = new THREE.Fog(0xb7cbe0, 650, 4800);
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
