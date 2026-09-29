// Footballer / goalkeeper characters: RPM head+hands on a procedural SDF body, painted kit, hair shell, gloves.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { buildBodyGeometry } from './sdfbody.js';
import { KITS, createBodyMaterial, makeKitDecalTexture } from './kit.js';

const BONE_ORDER_CACHE = new Map();

function averageTextureColor(tex) {
  try {
    const img = tex.image;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 10) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch (e) { return new THREE.Color(0xd9a78a); }
}

function filterIndex(geometry, keepTri) {
  const g = geometry.clone();
  const idx = g.index.array, pa = g.attributes.position, out = [];
  for (let i = 0; i < idx.length; i += 3) if (keepTri(idx[i], idx[i + 1], idx[i + 2], pa)) out.push(idx[i], idx[i + 1], idx[i + 2]);
  g.setIndex(out);
  return g;
}

function hairMinY(z, ax) {
  // hairline as a function of position on the head (bind space)
  let y = 1.80;
  if (z < 0.075) y = 1.80 - Math.min(1, (0.075 - z) / 0.06) * 0.07;   // forehead -> temple
  if (ax > 0.07 && z < 0.06) y = Math.min(y, 1.735);                    // above ear
  if (z < -0.03) y = 1.665;                                              // nape
  return y;
}

function buildHairGeometry(headGeo) {
  const pa = headGeo.attributes.position, na = headGeo.attributes.normal;
  const idx = headGeo.index.array, out = [];
  const keep = new Uint8Array(pa.count);
  for (let i = 0; i < pa.count; i++) keep[i] = pa.getY(i) > hairMinY(pa.getZ(i), Math.abs(pa.getX(i))) - 0.015 ? 1 : 0;
  for (let i = 0; i < idx.length; i += 3) if (keep[idx[i]] && keep[idx[i + 1]] && keep[idx[i + 2]]) out.push(idx[i], idx[i + 1], idx[i + 2]);
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    const thick = 0.006 + 0.010 * Math.min(1, Math.max(0, (y - 1.72) / 0.11));
    pos[i * 3] = pa.getX(i) + na.getX(i) * thick;
    pos[i * 3 + 1] = y + na.getY(i) * thick + 0.002;
    pos[i * 3 + 2] = pa.getZ(i) + na.getZ(i) * thick;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', na.clone());
  g.setAttribute('uv', headGeo.attributes.uv.clone());
  g.setAttribute('skinIndex', headGeo.attributes.skinIndex.clone());
  g.setAttribute('skinWeight', headGeo.attributes.skinWeight.clone());
  g.setIndex(out);
  return g;
}

function expandGeometry(geo, amount) {
  const g = geo.clone();
  const pa = g.attributes.position, na = g.attributes.normal;
  for (let i = 0; i < pa.count; i++) pa.setXYZ(i, pa.getX(i) + na.getX(i) * amount, pa.getY(i) + na.getY(i) * amount, pa.getZ(i) + na.getZ(i) * amount);
  pa.needsUpdate = true;
  return g;
}

let BASE = null;
export async function loadCharacterBase(onProgress) {
  if (BASE) return BASE;
  const loader = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  const [rpm, xbot, michelle, clothNormal] = await Promise.all([
    loader.loadAsync('./assets/models/player_rpm.glb'),
    loader.loadAsync('./assets/models/xbot_anims.glb'),
    loader.loadAsync('./assets/models/michelle_anims.glb'),
    tl.loadAsync('./assets/textures/cotton_jersey/cotton_jersey_nor_1k.jpg'),
  ]);
  onProgress && onProgress();
  clothNormal.wrapS = clothNormal.wrapT = THREE.RepeatWrapping; clothNormal.anisotropy = 8;
  const root = rpm.scene;
  root.updateMatrixWorld(true);
  const J = {}; let head = null, handsMesh = null, beard = null, teeth = null, eyeL = null, eyeR = null;
  root.traverse(o => {
    if (o.isBone) { const p = new THREE.Vector3(); o.getWorldPosition(p); J[o.name] = p.toArray(); }
    if (o.isSkinnedMesh) {
      if (o.name === 'Wolf3D_Head') head = o;
      else if (o.name === 'Wolf3D_Body') handsMesh = o;
      else if (o.name === 'Wolf3D_Beard') beard = o;
      else if (o.name === 'Wolf3D_Teeth') teeth = o;
    }
  });
  // hands-only geometry (drop ankle stubs)
  handsMesh.geometry = filterIndex(handsMesh.geometry, (a, b, c, pa) => Math.abs((pa.getX(a) + pa.getX(b) + pa.getX(c)) / 3) > 0.40);
  const skel = head.skeleton;
  const boneIndexOf = n => skel.bones.findIndex(b => b.name === n);
  const t0 = performance.now();
  const bodyGeo = buildBodyGeometry(J, boneIndexOf, { h: 0.0125 });
  // per-vertex box-mapped UVs for cloth detail
  {
    const pa = bodyGeo.attributes.position, na = bodyGeo.attributes.normal, uv = bodyGeo.attributes.uv;
    for (let i = 0; i < pa.count; i++) {
      const ax = Math.abs(na.getX(i)), ay = Math.abs(na.getY(i)), az = Math.abs(na.getZ(i));
      let u, v;
      if (az >= ax && az >= ay) { u = pa.getX(i); v = pa.getY(i); }
      else if (ax >= ay) { u = pa.getZ(i); v = pa.getY(i); }
      else { u = pa.getX(i); v = pa.getZ(i); }
      uv.setXY(i, u * 5.5, v * 5.5);
    }
  }
  console.log('[char] body built in', (performance.now() - t0).toFixed(0), 'ms');
  const hairGeo = buildHairGeometry(head.geometry);
  const gloveGeo = expandGeometry(handsMesh.geometry, 0.0045);
  const skinAvg = averageTextureColor(head.material.map);
  BASE = { rpm, xbot, michelle, clothNormal, J, bodyGeo, hairGeo, gloveGeo, skinAvg, boneNames: skel.bones.map(b => b.name), heights: 1.87 };
  return BASE;
}

function makeHairMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vBind;
      float hh(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float vn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x), mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x), f.y),
                   mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x), mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x), f.y), f.z); }
      float hairMinY(float z, float ax){
        float y = 1.80;
        if (z < 0.075) y = 1.80 - min(1.0, (0.075 - z) / 0.06) * 0.07;
        if (ax > 0.07 && z < 0.06) y = min(y, 1.735);
        if (z < -0.03) y = 1.665;
        return y;
      }`).replace('#include <color_fragment>', `#include <color_fragment>
      {
        float edge = hairMinY(vBind.z, abs(vBind.x));
        float n = vn(vBind * 110.0) * 0.7 + vn(vBind * 320.0) * 0.3;
        if (vBind.y < edge + (n - 0.5) * 0.016) discard;
        float strand = 0.8 + 0.4 * vn(vBind * vec3(420.0, 60.0, 420.0));
        diffuseColor.rgb *= strand * (0.92 + 0.16 * sin(vBind.x * 700.0 + vBind.z * 420.0 + vBind.y * 90.0));
      }`);
  };
  return m;
}

export function createCharacter(kitKey, opts = {}) {
  const B = BASE;
  const kit = KITS[kitKey];
  const scene = cloneSkinned(B.rpm.scene);
  const group = new THREE.Group();
  group.add(scene);
  const bones = {}; let head = null, hands = null, beard = null, teeth = null;
  scene.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      if (o.name === 'Wolf3D_Head') head = o;
      else if (o.name === 'Wolf3D_Body') hands = o;
      else if (o.name === 'Wolf3D_Beard') beard = o;
      else if (o.name === 'Wolf3D_Teeth') teeth = o;
      else if (['Wolf3D_Outfit_Top', 'Wolf3D_Outfit_Bottom', 'Wolf3D_Outfit_Footwear', 'Wolf3D_Headwear'].includes(o.name)) o.visible = false;
    }
  });
  const skel = head.skeleton;
  const skinColor = B.skinAvg.clone().multiply(new THREE.Color(1.16, 1.08, 1.0)).multiplyScalar(kit.skin);
  // skin tinting of head / hands
  head.material = head.material.clone(); head.material.color.setScalar(kit.skin);
  hands.material = hands.material.clone(); hands.material.color.setScalar(kit.skin);
  if (opts.beard === false && beard) beard.visible = false;
  // body
  const decal = makeKitDecalTexture(kit);
  const bodyMat = createBodyMaterial(kit, { decalTex: decal, clothNormal: B.clothNormal, skinColor });
  const body = new THREE.SkinnedMesh(B.bodyGeo, bodyMat);
  body.name = 'KitBody'; body.frustumCulled = false; body.castShadow = true; body.receiveShadow = true;
  head.parent.add(body); body.bind(skel, head.bindMatrix);
  // hair
  const hair = new THREE.SkinnedMesh(B.hairGeo, makeHairMaterial(kit.hair));
  hair.frustumCulled = false; hair.castShadow = true; hair.receiveShadow = true;
  head.parent.add(hair); hair.bind(skel, head.bindMatrix);
  // gloves (goalkeepers)
  let gloves = null;
  if (kit.glove !== undefined) {
    const gm = new THREE.MeshStandardMaterial({ color: kit.glove, roughness: 0.55, metalness: 0, normalMap: B.clothNormal, normalScale: new THREE.Vector2(0.6, 0.6) });
    gloves = new THREE.SkinnedMesh(B.gloveGeo, gm);
    gloves.frustumCulled = false; gloves.castShadow = true;
    head.parent.add(gloves); gloves.bind(skel, hands.bindMatrix);
    gloves.material.onBeforeCompile = (shader) => {
      shader.uniforms.uAcc = { value: new THREE.Color(kit.gloveAccent) };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind; uniform vec3 uAcc;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          { float ax = abs(vBind.x); float wrist = smoothstep(0.455, 0.46, ax) * (1.0 - smoothstep(0.475, 0.48, ax));
            diffuseColor.rgb = mix(diffuseColor.rgb, uAcc, wrist);
            // white palm side (front, -y region)
            float palm = smoothstep(0.02, -0.02, vBind.z - 0.03) * 0.0; }`);
    };
    // cut the glove short at the wrist so it looks like a strap
  }
  // face morphs
  const morph = (name, v) => {
    for (const m of [head, teeth]) {
      if (!m || !m.morphTargetDictionary) continue;
      const i = m.morphTargetDictionary[name];
      if (i !== undefined) m.morphTargetInfluences[i] = v;
    }
  };
  group.userData = { kit, kitKey, bones, skel, head, morph, body, hair, gloves };
  return group;
}
