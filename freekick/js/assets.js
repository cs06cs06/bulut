import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const BASE = new URL('../assets/', import.meta.url).href;

export const SOUND_FILES = {
  ambience: 'audio/crowd_ambience.mp3',
  chant: 'audio/crowd_chant.mp3',
  goal: 'audio/crowd_goal.mp3',
  goal2: 'audio/crowd_goal2.mp3',
  miss: 'audio/crowd_miss.mp3',
  ooh: 'audio/crowd_ooh.mp3',
  applause: 'audio/crowd_applause.mp3',
  whistle: 'audio/whistle.mp3',
  kick: 'audio/kick.mp3',
  kick2: 'audio/kick2.mp3',
  post: 'audio/post.mp3',
  post2: 'audio/post2.mp3',
  net: 'audio/net.mp3',
  glove: 'audio/glove.mp3',
  bounce: 'audio/bounce.mp3',
  body: 'audio/body.mp3',
  step0: 'audio/step0.mp3',
  step1: 'audio/step1.mp3',
  step2: 'audio/step2.mp3',
  step3: 'audio/step3.mp3',
  click: 'audio/click.mp3',
  confirm: 'audio/confirm.mp3',
};

/**
 * Loads every external asset with a combined progress callback (0..1).
 * The HDR environment is optional: if it fails, the tonemapped JPG panorama is used.
 */
export async function loadAssets(onProgress) {
  const weights = { model: 2.9, hdr: 1.5, bg: 1.5, grass: 1.0, audio: 1.4, fonts: 0.1 };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const done = {};
  const report = (k, f) => { done[k] = f * weights[k]; onProgress?.(Object.values(done).reduce((a, b) => a + b, 0) / total); };

  const manager = new THREE.LoadingManager();
  const gltfLoader = new GLTFLoader(manager);
  const texLoader = new THREE.TextureLoader(manager);

  const model = new Promise((res, rej) => gltfLoader.load(BASE + 'models/xbot.glb', (g) => { report('model', 1); res(g); },
    (e) => e.total && report('model', e.loaded / e.total), rej));

  const tex = (p) => new Promise((res, rej) => texLoader.load(BASE + p, res, undefined, rej));
  const bg = tex('sky/stadium_01_bg.jpg').then((t) => { report('bg', 1); return t; });
  const grass = Promise.all([tex('textures/grass_color.jpg'), tex('textures/grass_normal.jpg'), tex('textures/grass_rough.jpg')])
    .then(([color, normal, rough]) => { report('grass', 1); return { color, normal, rough }; });

  const hdr = new Promise((res) => {
    new HDRLoader(manager).load(BASE + 'sky/stadium_01_1k.hdr', (t) => { report('hdr', 1); res(t); },
      (e) => e.total && report('hdr', e.loaded / e.total), () => { report('hdr', 1); res(null); });
  });

  let audioDone = 0;
  const names = Object.keys(SOUND_FILES);
  const audio = Promise.all(names.map((k) => fetch(BASE + SOUND_FILES[k])
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null)
    .then((buf) => { audioDone++; report('audio', audioDone / names.length); return [k, buf]; })))
    .then((pairs) => Object.fromEntries(pairs));

  const fonts = (document.fonts ? Promise.all([
    document.fonts.load('700 40px Teko'), document.fonts.load('600 40px Teko'), document.fonts.load('500 20px "Barlow Condensed"'), document.fonts.load('700 20px "Barlow Condensed"'),
  ]).catch(() => null) : Promise.resolve()).then(() => report('fonts', 1));

  const [xbot, bgTex, grassTex, hdrTex, audioBufs] = await Promise.all([model, bg, grass, hdr, audio, fonts]);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  if (hdrTex) hdrTex.mapping = THREE.EquirectangularReflectionMapping;
  return { xbot, bg: bgTex, hdr: hdrTex, grass: grassTex, audio: audioBufs };
}
