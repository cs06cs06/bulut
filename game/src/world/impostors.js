import * as THREE from 'three';

// Billboard impostors for distant vegetation. Each tree/bush model is rendered once at load
// time into an atlas cell (side view, lit like the scene); far instances are drawn as
// camera-facing quads in a single draw call. Near cells use the real meshes instead.

const CELL_W = 256, CELL_H = 512, COLS = 8;

export function bakeImpostorAtlas(renderer, lib, names, sunDir) {
  const rows = Math.ceil(names.length / COLS);
  const rt = new THREE.WebGLRenderTarget(CELL_W * COLS, CELL_H * rows, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b5a40, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
  sun.position.copy(sunDir).multiplyScalar(10).setZ(Math.abs(sunDir.z) * 10 + 6);
  scene.add(sun);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const info = {};
  const prevTarget = renderer.getRenderTarget();
  const prevColor = new THREE.Color(); renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.setScissorTest(true);
  names.forEach((name, i) => {
    const obj = lib.clone(name, 1);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const halfW = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) * 1.02;
    const h = box.max.y * 1.02;
    // keep aspect of the cell (1:2) — fit whichever dimension is larger
    const fitW = Math.max(halfW, h / 4);
    const fitH = fitW * 4;
    cam.left = -fitW; cam.right = fitW; cam.bottom = 0; cam.top = fitH;
    cam.position.set(0, 0, 60); cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    scene.add(obj);
    const col = i % COLS, row = Math.floor(i / COLS);
    renderer.setViewport(col * CELL_W, row * CELL_H, CELL_W, CELL_H);
    renderer.setScissor(col * CELL_W, row * CELL_H, CELL_W, CELL_H);
    renderer.render(scene, cam);
    scene.remove(obj);
    info[name] = {
      uv: [col / COLS, row / rows, 1 / COLS, 1 / rows],
      width: fitW * 2, height: fitH,
    };
  });
  renderer.setScissorTest(false);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  renderer.toneMapping = prevTone;
  renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
  return { texture: rt.texture, info, rt };
}

const VS = `
attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iUV; attribute vec2 iCell;
uniform vec3 uPlayer; uniform float uNear;
varying vec2 vUv; varying float vShade;
#include <fog_pars_vertex>
void main(){
  vec3 toCam = cameraPosition - iPos; toCam.y = 0.0;
  toCam = normalize(toCam + vec3(1e-4));
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  vec3 world = iPos + right * position.x * iSize.x + vec3(0.0, position.y * iSize.y, 0.0);
  if (distance(iCell, uPlayer.xz) < uNear) world = vec3(0.0, -1.0e5, 0.0);
  vUv = iUV.xy + uv * iUV.zw;
  vShade = 0.92 + 0.08 * position.y;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
uniform sampler2D tAtlas; uniform vec3 uTint;
varying vec2 vUv; varying float vShade;
#include <fog_pars_fragment>
void main(){
  vec4 c = texture2D(tAtlas, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(c.rgb / max(c.a, 0.001) * uTint * vShade, 1.0);
  #include <fog_fragment>
}`;

export class ImpostorField {
  constructor(atlas, near) {
    this.atlas = atlas;
    this.items = [];
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tAtlas: { value: null }, uPlayer: { value: new THREE.Vector3() }, uNear: { value: near }, uTint: { value: new THREE.Color(0.86, 0.86, 0.84) } }]),
      vertexShader: VS, fragmentShader: FS, fog: true,
    });
    this.material.uniforms.tAtlas.value = atlas.texture;
  }

  add(name, matrix, cellCenter) { this.items.push({ name, matrix, cellCenter }); }

  build() {
    const n = this.items.length;
    const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    const pos = new Float32Array(n * 3), size = new Float32Array(n * 2), uv = new Float32Array(n * 4), cell = new Float32Array(n * 2);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    this.items.forEach((it, i) => {
      it.matrix.decompose(p, q, s);
      const inf = this.atlas.info[it.name];
      pos.set([p.x, p.y, p.z], i * 3);
      size.set([inf.width * s.x, inf.height * s.y], i * 2);
      uv.set(inf.uv, i * 4);
      cell.set([it.cellCenter.x, it.cellCenter.z], i * 2);
    });
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
    g.setAttribute('iUV', new THREE.InstancedBufferAttribute(uv, 4));
    g.setAttribute('iCell', new THREE.InstancedBufferAttribute(cell, 2));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'impostors';
    return this.mesh;
  }

  update(playerPos) { this.material.uniforms.uPlayer.value.copy(playerPos); }
}
