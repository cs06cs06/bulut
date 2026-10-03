// Harici olarak indirilen asset'lerin (Poly Haven, Kenney, OpenGameArt) yüklenmesi.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadCharacterParts } from './avatars.js';

const TEX = 'assets/textures/';
// Poly Haven (CC0) bitkileri, ağaç billboard'ları, köy eşyaları ve masa takımı (tools/build-assets.mjs ile paketlendi)
const MODELS = ['nature', 'props', 'polyhaven'];
export const SOUNDS = [
  'alkis', 'kalabalik', 'ooo', 'kuslar', 'zipla_0', 'zipla_1', 'cuval_0', 'cuval_1',
  'dusme', 'tik', 'onay', 'sec',
];

export const assets = { tex: {}, models: {}, sounds: {}, hdr: null, images: {} };

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

// İkili dosyayı getirir. Yalnızca JSON/medya sunan barındırıcılar için (ör. Claude Artifact)
// window.__JSON_BIN açıksa dosyanın base64'lü .json kopyası okunur.
async function loadBin(url) {
  if (window.__JSON_BIN) {
    const j = await (await fetch(url + '.json')).json();
    const s = atob(j.b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} yüklenemedi (${r.status})`);
  return r.arrayBuffer();
}

function hdrTexture(buf) {
  const d = new RGBELoader().parse(buf);
  const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.flipY = true;
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.needsUpdate = true;
  return t;
}

export async function loadAll(renderer, onProgress) {
  const jobs = [];
  let done = 0;
  const track = (p) => { jobs.push(p.then((v) => { done++; onProgress(done / jobs.length); return v; })); return p; };

  const tl = new THREE.TextureLoader();
  const texJob = (key, file, srgb) => track(tl.loadAsync(TEX + file).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    assets.tex[key] = t;
  }));
  texJob('grass', 'leafy_grass_diff.jpg', true);
  texJob('grassNor', 'leafy_grass_nor.jpg');
  texJob('grassArm', 'leafy_grass_arm.jpg');
  texJob('hessianNor', 'hessian_230_nor.jpg');
  texJob('hessianArm', 'hessian_230_arm.jpg');
  texJob('velvet', 'velour_velvet_diff.jpg', true);
  texJob('velvetNor', 'velour_velvet_nor.jpg');
  // Çuval dokusu: üzerine damga basmak için ham görüntü olarak da lazım
  track(loadImage(TEX + 'hessian_230_diff.jpg').then((img) => { assets.images.hessian = img; }));

  track(loadBin('assets/hdri/ballawley_park_1k.hdr').then((b) => { assets.hdr = hdrTexture(b); }));

  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  for (const m of MODELS) {
    track(loadBin(`assets/models/${m}.glb`).then((b) => gl.parseAsync(b, '')).then((g) => { assets.models[m] = g.scene; }));
  }
  // iskeletli karakter parçaları ve animasyonlar
  jobs.push(loadCharacterParts(loadBin, track));

  // Sesler: AudioContext henüz açılmadığı için ham baytları çekiyoruz, çözme sonra.
  for (const s of SOUNDS) {
    track(fetch(`assets/audio/${s}.mp3`).then((r) => r.arrayBuffer()).then((b) => { assets.sounds[s] = b; }));
  }

  await document.fonts?.load?.('40px "Lilita One"').catch(() => {});
  await Promise.all(jobs);
  return assets;
}
