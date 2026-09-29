// Cinematic post-processing: MSAA HDR scene target -> depth-of-field -> bloom pyramid -> grade (ACES, vignette, grain, CA).
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsMat(fragment, uniforms, defines) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fragment, uniforms, defines, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
}

export const QUALITY = {
  low:    { scale: 0.7,  msaa: 0, shadow: 1024, shadowLights: 2, bloom: true,  dof: false, dofTaps: 0,  grain: false, crowd: 0.6, anisotropy: 4 },
  medium: { scale: 0.9,  msaa: 2, shadow: 1536, shadowLights: 2, bloom: true,  dof: true,  dofTaps: 12, grain: true,  crowd: 0.85, anisotropy: 8 },
  high:   { scale: 1.0,  msaa: 4, shadow: 2048, shadowLights: 4, bloom: true,  dof: true,  dofTaps: 20, grain: true,  crowd: 1.0, anisotropy: 16 },
  ultra:  { scale: 1.25, msaa: 4, shadow: 4096, shadowLights: 4, bloom: true,  dof: true,  dofTaps: 32, grain: true,  crowd: 1.0, anisotropy: 16 },
};

export class PostFX {
  constructor(renderer, quality = 'high') {
    this.r = renderer;
    this.q = QUALITY[quality];
    this.quality = quality;
    this.tri = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), null);
    this.tri.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.tri);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const ext = renderer.extensions;
    this.hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.params = { exposure: 1.0, bloom: 0.55, bloomThreshold: 1.0, vignette: 0.45, grain: 0.035, ca: 0.0018, saturation: 1.08, contrast: 1.06, focus: 8, range: 1.2, aperture: 120, fade: 0, dofOn: 1 };
    this.time = 0;
    this.build();
  }
  build() {
    const dofDefine = { TAPS: Math.max(this.q.dofTaps, 4) };
    this.mDof = fsMat(/* glsl */`
      #include <packing>
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform float uNear, uFar, uFocusNear, uFocusFar, uAperture, uMaxCoc, uAspect;
      uniform vec2 uTexel; uniform float uDebug; varying vec2 vUv;
      float viewZ(float d){ return perspectiveDepthToViewZ(d, uNear, uFar); }
      float coc(float z){ // z positive distance; sharp between uFocusNear and uFocusFar
        float c = 0.0;
        if (z > uFocusFar) c = uAperture * (1.0 / uFocusFar - 1.0 / z);
        else if (z < uFocusNear) c = uAperture * 0.8 * (1.0 / max(z, 0.05) - 1.0 / uFocusNear);
        return clamp(c, 0.0, uMaxCoc);
      }
      void main(){
        vec4 base = texture2D(tColor, vUv);
        float z0 = -viewZ(texture2D(tDepth, vUv).x);
        float c0 = coc(z0);
        if (uDebug > 0.5) { gl_FragColor = vec4(vec3(c0 / uMaxCoc), 1.0); return; }
        if (c0 < 0.6) { gl_FragColor = base; return; }
        vec3 acc = base.rgb; float wsum = 1.0;
        const float GA = 2.39996323;
        for (int i = 1; i < TAPS; i++) {
          float fi = float(i);
          float r = sqrt(fi / float(TAPS)) * c0;
          float a = fi * GA;
          vec2 off = vec2(cos(a), sin(a)) * r * uTexel;
          vec2 uv = vUv + off;
          float zs = -viewZ(texture2D(tDepth, uv).x);
          float cs = coc(zs);
          // a tap contributes if its own blur radius reaches this pixel, or if it lies behind the focus plane and we are far
          float reach = smoothstep(r - 1.0, r + 1.0, cs);
          float w = reach + (zs > z0 ? 0.0 : 0.0);
          vec3 s = texture2D(tColor, uv).rgb;
          // bokeh highlight boost
          float lum = dot(s, vec3(0.3, 0.59, 0.11));
          w *= 1.0 + smoothstep(2.0, 12.0, lum) * 2.0;
          acc += s * w; wsum += w;
        }
        gl_FragColor = vec4(acc / wsum, 1.0);
      }`, {
      tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 400 }, uFocusNear: { value: 3 }, uFocusFar: { value: 20 }, uAperture: { value: 120 },
      uMaxCoc: { value: 14 }, uAspect: { value: 1 }, uTexel: { value: new THREE.Vector2() }, uDebug: { value: 0 },
    }, dofDefine);
    this.mPre = fsMat(/* glsl */`
      uniform sampler2D tColor; uniform float uThreshold; varying vec2 vUv; uniform vec2 uTexel;
      void main(){
        vec3 c = texture2D(tColor, vUv).rgb * 0.5
               + texture2D(tColor, vUv + uTexel*vec2( 1.0, 1.0)).rgb * 0.125 + texture2D(tColor, vUv + uTexel*vec2(-1.0, 1.0)).rgb * 0.125
               + texture2D(tColor, vUv + uTexel*vec2( 1.0,-1.0)).rgb * 0.125 + texture2D(tColor, vUv + uTexel*vec2(-1.0,-1.0)).rgb * 0.125;
        float lum = max(c.r, max(c.g, c.b));
        float soft = clamp(lum - uThreshold + 0.5, 0.0, 1.0); soft = soft * soft * 0.5;
        float contrib = max(soft, lum - uThreshold) / max(lum, 1e-4);
        gl_FragColor = vec4(min(c * contrib, vec3(60.0)), 1.0);
      }`, { tColor: { value: null }, uThreshold: { value: 1.0 }, uTexel: { value: new THREE.Vector2() } });
    this.mDown = fsMat(/* glsl */`
      uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv;
      void main(){
        vec2 t = uTexel;
        vec3 a = texture2D(tColor, vUv + t*vec2(-2.,-2.)).rgb, b = texture2D(tColor, vUv + t*vec2(0.,-2.)).rgb, c = texture2D(tColor, vUv + t*vec2(2.,-2.)).rgb;
        vec3 d = texture2D(tColor, vUv + t*vec2(-2.,0.)).rgb, e = texture2D(tColor, vUv).rgb, f = texture2D(tColor, vUv + t*vec2(2.,0.)).rgb;
        vec3 g = texture2D(tColor, vUv + t*vec2(-2.,2.)).rgb, h = texture2D(tColor, vUv + t*vec2(0.,2.)).rgb, i = texture2D(tColor, vUv + t*vec2(2.,2.)).rgb;
        vec3 j = texture2D(tColor, vUv + t*vec2(-1.,-1.)).rgb, k = texture2D(tColor, vUv + t*vec2(1.,-1.)).rgb, l = texture2D(tColor, vUv + t*vec2(-1.,1.)).rgb, m = texture2D(tColor, vUv + t*vec2(1.,1.)).rgb;
        vec3 o = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
        gl_FragColor = vec4(o, 1.0);
      }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = fsMat(/* glsl */`
      uniform sampler2D tColor; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uMix; varying vec2 vUv;
      void main(){
        vec2 t = uTexel;
        vec3 s = texture2D(tColor, vUv + t*vec2(-1.,-1.)).rgb + texture2D(tColor, vUv + t*vec2(0.,-1.)).rgb*2. + texture2D(tColor, vUv + t*vec2(1.,-1.)).rgb
               + texture2D(tColor, vUv + t*vec2(-1.,0.)).rgb*2. + texture2D(tColor, vUv).rgb*4. + texture2D(tColor, vUv + t*vec2(1.,0.)).rgb*2.
               + texture2D(tColor, vUv + t*vec2(-1.,1.)).rgb + texture2D(tColor, vUv + t*vec2(0.,1.)).rgb*2. + texture2D(tColor, vUv + t*vec2(1.,1.)).rgb;
        s /= 16.0;
        vec3 prev = texture2D(tPrev, vUv).rgb;
        gl_FragColor = vec4(prev * uMix + s, 1.0);
      }`, { tColor: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1.0 } });
    this.mFinal = fsMat(/* glsl */`
      uniform sampler2D tColor; uniform sampler2D tBloom; uniform float uExposure, uBloom, uVignette, uGrain, uCA, uSat, uContrast, uTime, uFade; uniform vec2 uRes; varying vec2 vUv;
      vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
      float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
      vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec2 uv = vUv; vec2 cc = uv - 0.5;
        float r2 = dot(cc, cc);
        vec2 ca = cc * uCA * (0.4 + 2.2 * r2) ;
        vec3 col;
        col.r = texture2D(tColor, uv + ca).r; col.g = texture2D(tColor, uv).g; col.b = texture2D(tColor, uv - ca).b;
        vec3 bl = texture2D(tBloom, uv).rgb;
        col += bl * uBloom;
        col *= uExposure;
        // vignette
        col *= 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 2.6);
        // filmic
        col = aces(col * 0.82) * 1.0;
        // grade: contrast around mid grey, saturation, cool shadows / warm highlights
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, uSat);
        col = (col - 0.5) * uContrast + 0.5;
        col += (vec3(-0.010, 0.004, 0.018) * (1.0 - l) + vec3(0.012, 0.004, -0.006) * l) * 0.8;
        col = clamp(col, 0.0, 1.0);
        vec3 o = toSRGB(col);
        // grain + dithering
        float gr = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
        o += gr * uGrain * (1.0 - l * 0.5) + (hash(uv * uRes * 1.37 + 3.1) - 0.5) / 255.0;
        o *= 1.0 - uFade;
        gl_FragColor = vec4(o, 1.0);
      }`, { tColor: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.5 }, uVignette: { value: 0.4 }, uGrain: { value: 0.03 }, uCA: { value: 0.0015 }, uSat: { value: 1.08 }, uContrast: { value: 1.05 }, uTime: { value: 0 }, uFade: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } });
    this.size = new THREE.Vector2(1, 1);
  }
  setQuality(name) { this.quality = name; this.q = QUALITY[name]; this.dispose(); this.build(); this.setSize(this.size.x, this.size.y); }
  dispose() { for (const k of ['sceneRT', 'dofRT', 'depthRT']) if (this[k]) this[k].dispose(); (this.bloomRTs || []).forEach(t => t.dispose()); (this.bloomUp || []).forEach(t => t.dispose()); }
  setSize(w, h) {
    this.size.set(w, h);
    const rt = (ww, hh, opts = {}) => new THREE.WebGLRenderTarget(ww, hh, { type: this.type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...opts });
    if (this.sceneRT) this.dispose();
    this.sceneRT = rt(w, h, { depthBuffer: true, samples: this.q.msaa });
    if (this.q.dof) {
      this.depthRT = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, colorSpace: THREE.NoColorSpace, type: THREE.UnsignedByteType });
      this.depthRT.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
      this.depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, side: THREE.DoubleSide }); this.depthMat.colorWrite = false;
    }
    this.dofRT = rt(w, h);
    this.bloomRTs = []; this.bloomUp = [];
    let bw = Math.max(2, Math.floor(w / 2)), bh = Math.max(2, Math.floor(h / 2));
    for (let i = 0; i < 6; i++) {
      this.bloomRTs.push(rt(bw, bh)); this.bloomUp.push(rt(bw, bh));
      bw = Math.max(2, Math.floor(bw / 2)); bh = Math.max(2, Math.floor(bh / 2));
    }
  }
  pass(mat, target) {
    this.tri.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }
  render(scene, camera, dt) {
    const r = this.r, p = this.params, q = this.q;
    this.time += dt;
    const w = this.size.x, h = this.size.y;
    // 1. scene
    camera.layers.enable(1);
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    let colorTex = this.sceneRT.texture;
    const useDof = q.dof && p.dofOn > 0.01 && this.depthRT;
    if (useDof) {
      // cheap depth-only pass (layer 0 only: crowd / sprites / nets live on layer 1)
      const sh = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
      const bg = scene.background, ov = scene.overrideMaterial, fog = scene.fog;
      scene.background = null; scene.overrideMaterial = this.depthMat; scene.fog = null;
      camera.layers.disable(1);
      r.setRenderTarget(this.depthRT); r.clear();
      r.render(scene, camera);
      camera.layers.enable(1);
      scene.background = bg; scene.overrideMaterial = ov; scene.fog = fog; r.shadowMap.autoUpdate = sh;
    }
    // 2. DoF
    if (useDof) {
      const u = this.mDof.uniforms;
      u.tColor.value = colorTex; u.tDepth.value = this.depthRT.depthTexture; u.uNear.value = camera.near; u.uFar.value = camera.far;
      const fr = p.range === undefined ? 1.2 : p.range; u.uFocusNear.value = Math.max(p.focus / (1 + fr), 0.4); u.uFocusFar.value = p.focus * (1 + fr); u.uAperture.value = p.aperture * p.dofOn; u.uMaxCoc.value = 14 * (h / 1080) * Math.max(0.8, this.r.getPixelRatio() * 0.9);
      u.uTexel.value.set(1 / w, 1 / h); u.uDebug.value = this.debugDepth ? 1 : 0;
      this.pass(this.mDof, this.dofRT);
      colorTex = this.dofRT.texture;
    }
    // 3. bloom
    let bloomTex = null;
    if (q.bloom && p.bloom > 0.001) {
      const pre = this.mPre.uniforms; pre.tColor.value = colorTex; pre.uThreshold.value = p.bloomThreshold; pre.uTexel.value.set(1 / w, 1 / h);
      this.pass(this.mPre, this.bloomRTs[0]);
      for (let i = 1; i < this.bloomRTs.length; i++) {
        const u = this.mDown.uniforms; u.tColor.value = this.bloomRTs[i - 1].texture; u.uTexel.value.set(1 / this.bloomRTs[i - 1].width, 1 / this.bloomRTs[i - 1].height);
        this.pass(this.mDown, this.bloomRTs[i]);
      }
      const n = this.bloomRTs.length;
      // upsample chain: up[n-1] = down[n-1]; up[i] = down[i] + tent(up[i+1])
      const weights = [0.5, 0.65, 0.8, 0.9, 1.0, 1.0];
      let prev = this.bloomRTs[n - 1];
      for (let i = n - 2; i >= 0; i--) {
        const u = this.mUp.uniforms; u.tColor.value = prev.texture; u.tPrev.value = this.bloomRTs[i].texture; u.uMix.value = 1.0;
        u.uTexel.value.set(1 / prev.width, 1 / prev.height);
        this.pass(this.mUp, this.bloomUp[i]);
        prev = this.bloomUp[i];
      }
      bloomTex = prev.texture;
    }
    // 4. final
    const f = this.mFinal.uniforms;
    f.tColor.value = colorTex; f.tBloom.value = bloomTex || this.blackTex || (this.blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1));
    if (this.blackTex) this.blackTex.needsUpdate = true;
    f.uExposure.value = p.exposure; f.uBloom.value = bloomTex ? p.bloom * 0.45 : 0; f.uVignette.value = p.vignette; f.uGrain.value = q.grain ? p.grain : 0.0; f.uCA.value = p.ca;
    f.uSat.value = p.saturation; f.uContrast.value = p.contrast; f.uTime.value = this.time; f.uFade.value = p.fade; f.uRes.value.set(w, h);
    this.pass(this.mFinal, null);
  }
}
