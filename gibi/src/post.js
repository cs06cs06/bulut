// Motor 2 son işleme: tek geçişte ton eşleme (ACES) + sinematik renk + vinyet +
// film greni + FXAA; yakın planlarda ek olarak alan derinliği (bokeh).
// CPU'da (SwiftShader) her tam ekran geçiş pahalı olduğu için zincir kısa tutulur.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, exposure: { value: 1.0 },
    vignette: { value: 0.34 }, grain: { value: 0.012 }, warmth: { value: 0.035 },
    contrast: { value: 1.05 }, sat: { value: 1.08 }, res: { value: new THREE.Vector2(1600, 900) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, exposure, vignette, grain, warmth, contrast, sat; uniform vec2 res;
    varying vec2 vUv;
    vec3 aces(vec3 x){ x *= exposure * 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    vec3 tm(vec2 uv){ return toSRGB(aces(texture2D(tDiffuse, uv).rgb)); }
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 px = 1.0 / res;
      vec3 cM = tm(vUv);
      vec3 cNW = tm(vUv + vec2(-1.0,-1.0)*px), cNE = tm(vUv + vec2(1.0,-1.0)*px);
      vec3 cSW = tm(vUv + vec2(-1.0, 1.0)*px), cSE = tm(vUv + vec2(1.0, 1.0)*px);
      float lM = luma(cM), lNW = luma(cNW), lNE = luma(cNE), lSW = luma(cSW), lSE = luma(cSE);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec3 c = cM;
      if (lMax - lMin > max(0.04, lMax * 0.12)) {
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
        float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078);
        dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * px;
        vec3 a = 0.5 * (tm(vUv + dir * (1.0/3.0 - 0.5)) + tm(vUv + dir * (2.0/3.0 - 0.5)));
        vec3 b = a * 0.5 + 0.25 * (tm(vUv - dir * 0.5) + tm(vUv + dir * 0.5));
        float lb = luma(b);
        c = (lb < lMin || lb > lMax) ? a : b;
      }
      float l = luma(c);
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c += vec3(warmth, warmth * 0.4, -warmth * 0.55) * smoothstep(0.3, 1.0, l);
      c += vec3(-0.01, 0.003, 0.016) * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 q = vUv - 0.5; q.x *= res.x / res.y;
      c *= 1.0 - vignette * smoothstep(0.38, 1.05, length(q));
      c += (hash(vUv * res + fract(time * 7.13) * 91.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, W, H) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;
  renderer.toneMapping = THREE.NoToneMapping; // ton eşleme son geçişte

  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 2.0, aperture: 0.004, maxblur: 0.007 });
  composer.addPass(bokeh);
  const fin = new ShaderPass(FinalShader);
  fin.uniforms.res.value.set(W, H);
  composer.addPass(fin);

  return {
    composer, bokeh, fin,
    setExposure(e) { fin.uniforms.exposure.value = e; },
    render(t, cam) {
      fin.uniforms.time.value = t;
      const close = cam && (cam.kind === 'cu' || cam.kind === 'crash' || cam.kind === 'ots');
      bokeh.enabled = !!close;
      if (close) {
        bokeh.uniforms.focus.value = cam.pos.distanceTo(cam.look);
        bokeh.uniforms.aperture.value = cam.kind === 'ots' ? 0.0035 : 0.005;
        bokeh.uniforms.maxblur.value = 0.0075;
      }
      composer.render();
    },
  };
}
