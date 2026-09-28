import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// resolved against the page so the same code works as ES modules or as one inline bundle
const BASE = new URL('assets/', document.baseURI).href;

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

const LABELS = { model: 'oyuncu modeli', hdr: 'ışık haritası', bg: 'gökyüzü', grass: 'çim dokusu', audio: 'sesler', fonts: 'yazı tipleri' };

/**
 * Single-file builds carry their assets inside the page as
 * <script type="text/x-asset" data-path="..."> base64 blocks; nothing is fetched then.
 */
function embedded(path) {
  const el = document.querySelector(`script[type="text/x-asset"][data-path="${path}"]`);
  return el ? el.textContent.replace(/\s+/g, '') : null;
}
export const isEmbedded = () => !!document.querySelector('script[type="text/x-asset"]');

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * Loads every asset with a combined progress callback: onProgress(fraction, pendingLabels).
 * The HDR environment, sounds and fonts are optional and never block the game.
 */
export async function loadAssets(onProgress, { smallSky = false } = {}) {
  const weights = { model: 1.6, hdr: 1.5, bg: 0.6, grass: 1.0, audio: 1.4, fonts: 0.1 };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const done = {};
  const finished = new Set();
  const pending = () => Object.keys(weights).filter((k) => !finished.has(k)).map((k) => LABELS[k]);
  const report = (k, f) => {
    done[k] = Math.min(1, f) * weights[k];
    if (f >= 1) finished.add(k);
    onProgress?.(Object.values(done).reduce((a, b) => a + b, 0) / total, pending());
  };
  const packed = isEmbedded();

  const manager = new THREE.LoadingManager();
  const gltfLoader = new GLTFLoader(manager);
  const texLoader = new THREE.TextureLoader(manager);

  // some static hosts refuse .glb; the same model as embedded glTF JSON is the fallback
  const loadModel = (file) => new Promise((res, rej) => gltfLoader.load(BASE + file, (g) => { report('model', 1); res(g); },
    (e) => e.total && report('model', e.loaded / e.total), rej));
  const glb = embedded('models/xbot.glb');
  const model = glb
    ? new Promise((res, rej) => gltfLoader.parse(b64ToBuffer(glb), BASE, (g) => { report('model', 1); res(g); }, (e) => rej(new Error('oyuncu modeli çözülemedi: ' + (e?.message || e)))))
    : loadModel('models/xbot.glb').catch(() => loadModel('models/xbot.gltf.json')).catch(() => { throw new Error('oyuncu modeli yüklenemedi'); });

  const tex = (p, mime = 'image/jpeg') => {
    const data = embedded(p);
    const url = data ? `data:${mime};base64,${data}` : BASE + p;
    return new Promise((res, rej) => texLoader.load(url, res, undefined, () => rej(new Error(p + ' yüklenemedi'))));
  };
  const skyFile = smallSky || packed ? 'sky/stadium_01_bg_2k.jpg' : 'sky/stadium_01_bg.jpg';
  const bg = tex(skyFile).then((t) => { report('bg', 1); return t; });
  const grass = Promise.all([tex('textures/grass_color.jpg'), tex('textures/grass_normal.jpg'), tex('textures/grass_rough.jpg')])
    .then(([color, normal, rough]) => { report('grass', 1); return { color, normal, rough }; });

  const hdr = packed ? Promise.resolve(null).then((v) => { report('hdr', 1); return v; }) : new Promise((res) => {
    new HDRLoader(manager).load(BASE + 'sky/stadium_01_1k.hdr', (t) => { report('hdr', 1); res(t); },
      (e) => e.total && report('hdr', e.loaded / e.total), () => { report('hdr', 1); res(null); });
  });

  // optional pieces never block the game: give up on them after a while
  const within = (promise, ms, fallback, key) => Promise.race([promise, new Promise((res) => setTimeout(() => { report(key, 1); res(fallback); }, ms))]);

  let audioDone = 0;
  const names = Object.keys(SOUND_FILES);
  const audio = Promise.all(names.map((k) => {
    const data = embedded(SOUND_FILES[k]);
    const get = data ? Promise.resolve(b64ToBuffer(data)) : fetch(BASE + SOUND_FILES[k]).then((r) => (r.ok ? r.arrayBuffer() : null));
    return get.catch(() => null).then((buf) => { audioDone++; report('audio', audioDone / names.length); return [k, buf]; });
  })).then((pairs) => Object.fromEntries(pairs));

  const fonts = (document.fonts ? Promise.all([
    document.fonts.load('700 40px Teko'), document.fonts.load('600 40px Teko'), document.fonts.load('500 20px "Barlow Condensed"'), document.fonts.load('700 20px "Barlow Condensed"'),
  ]).catch(() => null) : Promise.resolve()).then(() => report('fonts', 1));

  onProgress?.(0, pending());
  const [xbot, bgTex, grassTex, hdrTex, audioBufs] = await Promise.all([
    model, bg, grass, within(hdr, 20000, null, 'hdr'), within(audio, 25000, {}, 'audio'), within(fonts, 5000, null, 'fonts'),
  ]);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  if (hdrTex) hdrTex.mapping = THREE.EquirectangularReflectionMapping;
  return { xbot, bg: bgTex, hdr: hdrTex, grass: grassTex, audio: audioBufs };
}
