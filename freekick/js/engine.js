import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SUN_TEX_DIR, ENV_ROTATION } from './config.js';

export const QUALITY = {
  high: { name: 'high', maxDpr: 2, shadow: 2048, post: true, samples: 4, crowdDensity: 1, anisotropy: 8, bloom: true },
  medium: { name: 'medium', maxDpr: 1.5, shadow: 2048, post: true, samples: 2, crowdDensity: 0.8, anisotropy: 4, bloom: true },
  low: { name: 'low', maxDpr: 1, shadow: 1024, post: false, samples: 0, crowdDensity: 0.55, anisotropy: 2, bloom: false },
};

export function pickQuality(saved) {
  if (saved && QUALITY[saved]) return QUALITY[saved];
  const mobile = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return cores >= 6 ? QUALITY.medium : QUALITY.low;
  return QUALITY.high;
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uTime: { value: 0 }, uFlash: { value: 0 }, uSat: { value: 1.06 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; uniform float uTime; uniform float uFlash; uniform float uSat; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * uVignette * 2.2;
      c.rgb *= v;
      c.rgb += uFlash;
      c.rgb += (rnd(vUv * 731.0) - 0.5) * 0.012;
      gl_FragColor = c;
    }`,
};

export class Engine {
  constructor(canvas, quality) {
    this.quality = quality;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !quality.post,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.dprScale = 1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
    this.camera.position.set(0, 1.8, 30);

    // keep the HDRI's sun azimuth but lift it so players cast readable shadows
    const sd = new THREE.Vector3(...SUN_TEX_DIR).applyAxisAngle(new THREE.Vector3(0, 1, 0), ENV_ROTATION);
    const elev = THREE.MathUtils.degToRad(40);
    const hl = Math.hypot(sd.x, sd.z);
    this.sunDir = new THREE.Vector3(sd.x / hl * Math.cos(elev), Math.sin(elev), sd.z / hl * Math.cos(elev)).normalize();
    this.sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.92, 0.8), 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadow, quality.shadow);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.HemisphereLight(0xbfd6ff, 0x3a5a2a, 0.2);
    this.scene.add(this.fill);

    if (quality.post) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: quality.samples });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      if (quality.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 1.15);
        this.composer.addPass(this.bloom);
      }
      this.composer.addPass(new OutputPass());
      this.grade = new ShaderPass(GradeShader);
      this.composer.addPass(this.grade);
    }
    this.resize();
    addEventListener('resize', () => this.resize());
    this.frameTimes = [];
  }

  setEnvironment(hdr, bg) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const src = hdr || bg;
    const env = pmrem.fromEquirectangular(src).texture;
    pmrem.dispose();
    this.scene.environment = env;
    this.scene.environmentIntensity = hdr ? 0.5 : 0.8;
    this.scene.environmentRotation.set(0, ENV_ROTATION, 0);
    this.scene.background = bg;
    this.scene.backgroundRotation.set(0, ENV_ROTATION, 0);
    this.scene.backgroundIntensity = 1.0;
  }

  /** Keeps the shadow frustum tight around the action. */
  focusShadow(center, radius = 22) {
    const s = this.sun;
    s.target.position.copy(center);
    s.position.copy(center).addScaledVector(this.sunDir, 80);
    const c = s.shadow.camera;
    if (c.right !== radius) {
      c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
      c.updateProjectionMatrix();
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, this.quality.maxDpr) * this.dprScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
      if (this.bloom) this.bloom.resolution.set(w * dpr * 0.5, h * dpr * 0.5);
    }
    this.pixelRatio = dpr;
  }

  /** Dynamic resolution: trade pixels for frame rate on slower devices. */
  trackPerformance(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    let s = this.dprScale;
    if (avg > 1 / 42 && s > 0.6) s = Math.max(0.6, s - 0.12);
    else if (avg < 1 / 57 && s < 1) s = Math.min(1, s + 0.06);
    if (s !== this.dprScale) { this.dprScale = s; this.resize(); }
  }

  render(t, flash = 0) {
    if (this.composer) {
      this.grade.uniforms.uTime.value = t % 10;
      this.grade.uniforms.uFlash.value = flash;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
