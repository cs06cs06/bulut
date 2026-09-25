import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sfx } from './audio.js';
import { rigBird } from './bird-rig.js';

// ---------------------------------------------------------------------------
// Ayarlar (dünya birimi: z=0 düzleminde 1 birim)
// ---------------------------------------------------------------------------

const MODELS = {
  bird: 'assets/models/bird.glb',
  pipe: 'assets/models/pipe.glb',
  cloud: 'assets/models/cloud.glb',
  bush: 'assets/models/bush.glb',
};

const FOV = 38;
const BASE_VIEW_H = 12; // yatay ekranlarda görünen dünya yüksekliği
const MIN_VIEW_W = 6.8; // dar (dikey) ekranlarda en az bu kadar genişlik görünür
const GROUND_SHARE = 0.16; // ekranın alt kısmında görünen zemin oranı
const CEILING = 11.2; // kuşun çıkabileceği en yüksek nokta

const GRAVITY = 26;
const FLAP_VELOCITY = 8.2;
const MAX_FALL = 13;
const BASE_SPEED = 3.3;

const PIPE_W = 1.45;
const PIPE_GAP = 3.3;
const PIPE_SPACING = 4.6;
const PIPE_LEN = 16;
const GAP_MIN = 1.1 + PIPE_GAP / 2;
const GAP_MAX = 9.5 - PIPE_GAP / 2;

const BIRD_X = 0;
const BIRD_LEN = 1.55; // gagadan kuyruğa
const BIRD_R = 0.42;
const BIRD_SCREEN_X = 0.3; // oyun sırasında kuşun ekrandaki yatay konumu (0-1)
const FACE_PLAY = Math.PI / 2 - 0.5; // sağa uçar, biraz kameraya dönük
const FACE_MENU = 0.4; // menüde oyuncuya dönük havada asılı kalır
const BANK_PLAY = 0.28; // kanatların üstü görünsün diye hafif yatış

const STEP = 1 / 120;

const MEDALS = [
  [40, 'platinum', 'Platin madalya'],
  [30, 'gold', 'Altın madalya'],
  [20, 'silver', 'Gümüş madalya'],
  [10, 'bronze', 'Bronz madalya'],
];

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* depolama kapalı olabilir; oyun yine çalışır */
    }
  },
};

const $ = (id) => document.getElementById(id);
const ui = {
  app: $('app'),
  canvas: $('scene'),
  flash: $('flash'),
  hud: $('hud'),
  score: $('score'),
  loading: $('loading'),
  loadBar: $('load-bar'),
  loadText: $('load-text'),
  retry: $('retry-btn'),
  menu: $('menu'),
  menuBest: $('menu-best'),
  paused: $('paused'),
  gameover: $('gameover'),
  finalScore: $('final-score'),
  finalBest: $('final-best'),
  newBest: $('new-best'),
  medal: $('medal'),
  restart: $('restart-btn'),
  pause: $('pause-btn'),
  mute: $('mute-btn'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sfx = new Sfx();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Sahne
// ---------------------------------------------------------------------------

// Yüksek yoğunluklu (retina) ekranlarda kenar yumuşatma gereksiz ve pahalıdır.
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const renderer = new THREE.WebGLRenderer({
  canvas: ui.canvas,
  antialias: DPR < 2,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const SKY_TOP = '#4fb6d3';
const SKY_HORIZON = '#d9f4ea';
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(SKY_HORIZON, 30, 95);

const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
const view = { h: BASE_VIEW_H, w: BASE_VIEW_H, dist: 1, camY: 0, camX: 0 };

scene.add(new THREE.HemisphereLight('#e6f7ff', '#7d9b4a', 1.5));
const sun = new THREE.DirectionalLight('#fff4dc', 2.4);
sun.position.set(-6, 12, 10);
scene.add(sun);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(canvas, repeatX = false) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeatX) tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function makeSkyTexture() {
  const [c, g] = makeCanvas(4, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(0.62, '#9fdde0');
  grad.addColorStop(1, SKY_HORIZON);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return canvasTexture(c);
}

// Yatayda kesintisiz tekrar eden tepe silueti (sinüslerin periyotları tuval
// genişliğine tam bölünür).
function makeHillsTexture(colors, seed) {
  const W = 1024;
  const H = 256;
  const [c, g] = makeCanvas(W, H);
  const layers = colors.length;
  colors.forEach((color, i) => {
    const base = H * (0.35 + (i / layers) * 0.35);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) {
      const t = (x / W) * Math.PI * 2;
      const y =
        base -
        Math.sin(t * (2 + i) + seed + i) * 26 -
        Math.sin(t * (5 + i * 2) + seed * 2) * 12 -
        Math.sin(t * 11 + i) * 4;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  });
  return canvasTexture(c, true);
}

// Zemin üstü: Flappy Bird'ün çapraz çim şeritleri.
function makeGrassTexture() {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = '#8fd14f';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#7cbf3c';
  for (let i = -128; i < 256; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 + 128, 128);
    g.lineTo(i + 128, 128);
    g.closePath();
    g.fill();
  }
  const tex = canvasTexture(c, true);
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Zemin ön yüzü: üstte çim şeridi, altında toprak.
function makeDirtTexture() {
  const [c, g] = makeCanvas(128, 256);
  g.fillStyle = '#ded895';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#d2c77a';
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.arc((i * 53) % 128, 40 + ((i * 97) % 216), 3 + (i % 4), 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#5a9e2a';
  g.fillRect(0, 0, 128, 10);
  g.fillStyle = '#8fd14f';
  g.fillRect(0, 10, 128, 18);
  g.fillStyle = '#7cbf3c';
  for (let x = 0; x < 128; x += 32) g.fillRect(x, 10, 16, 18);
  g.fillStyle = '#c7a55a';
  g.fillRect(0, 28, 128, 6);
  return canvasTexture(c, true);
}

function makeShadowTexture() {
  const [c, g] = makeCanvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(40,50,20,0.55)');
  grad.addColorStop(1, 'rgba(40,50,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}

// Zemin: gerçek bir kutu; kamera hafif yukarıdan baktığı için üst yüzeyi de
// görünür ve borular bu yüzeyin üstüne oturur.
const GROUND_FRONT = 2.6;
const GROUND_BACK = -6;
const grassTex = makeGrassTexture();
const dirtTex = makeDirtTexture();
const GROUND_W = 240;
grassTex.repeat.set(GROUND_W / 1.6, (GROUND_FRONT - GROUND_BACK) / 1.6);
dirtTex.repeat.set(GROUND_W / 2.2, 1);
const ground = new THREE.Mesh(
  new THREE.BoxGeometry(GROUND_W, 6, GROUND_FRONT - GROUND_BACK),
  [
    new THREE.MeshLambertMaterial({ color: '#c9bd72' }),
    new THREE.MeshLambertMaterial({ color: '#c9bd72' }),
    new THREE.MeshLambertMaterial({ map: grassTex }),
    new THREE.MeshLambertMaterial({ color: '#c9bd72' }),
    new THREE.MeshLambertMaterial({ map: dirtTex }),
    new THREE.MeshLambertMaterial({ color: '#c9bd72' }),
  ],
);
ground.position.set(0, -3, (GROUND_FRONT + GROUND_BACK) / 2);
scene.add(ground);

const hillsFar = new THREE.Mesh(
  new THREE.PlaneGeometry(320, 40),
  new THREE.MeshBasicMaterial({
    map: makeHillsTexture(['#b9e6d0', '#a3dcc0'], 1.3),
    transparent: true,
    fog: true,
  }),
);
hillsFar.material.map.repeat.set(320 / 90, 1);
hillsFar.position.set(0, -6, -55);
scene.add(hillsFar);

const hillsNear = new THREE.Mesh(
  new THREE.PlaneGeometry(220, 22),
  new THREE.MeshBasicMaterial({
    map: makeHillsTexture(['#8fd29a', '#78c486'], 4.1),
    transparent: true,
    fog: true,
  }),
);
hillsNear.material.map.repeat.set(220 / 50, 1);
hillsNear.position.set(0, -3.5, -24);
scene.add(hillsNear);

const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 0.9),
  new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.set(BIRD_X, 0.02, 0);
scene.add(shadow);

// ---------------------------------------------------------------------------
// Varlıkların yüklenmesi
// ---------------------------------------------------------------------------

const loader = new GLTFLoader();
// GLB içindeki dokular blob: adresinden yüklenir. ImageBitmapLoader bunun için
// fetch() kullanır ve sıkı içerik güvenliği (CSP) olan sayfalarda engellenebilir;
// <img> tabanlı TextureLoader her yerde çalışır.
loader.register((parser) => {
  parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
  return { name: 'image_element_textures' };
});

async function loadAll() {
  const names = Object.keys(MODELS);
  const progress = Object.fromEntries(names.map((n) => [n, { loaded: 0, total: 0 }]));
  const report = () => {
    let loaded = 0;
    let total = 0;
    for (const p of Object.values(progress)) {
      loaded += p.loaded;
      total += p.total || 1;
    }
    const pct = Math.round((loaded / total) * 100);
    ui.loadBar.style.width = `${pct}%`;
    ui.loadText.textContent = `%${pct}`;
  };
  const results = await Promise.all(
    names.map((name) =>
      loader.loadAsync(MODELS[name], (e) => {
        progress[name] = { loaded: e.loaded, total: e.total || e.loaded };
        report();
      }),
    ),
  );
  return Object.fromEntries(names.map((n, i) => [n, results[i]]));
}

function firstMesh(root) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.isMesh) found = o;
  });
  return found;
}

// Modelin geometrisini dünya dönüşümüyle birlikte kopyalar.
function bakedGeometry(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const mesh = firstMesh(gltf.scene);
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  return { geo, material: mesh.material };
}

// Meshy'nin ürettiği boruyu kullanır: ağız kısmı olduğu gibi kalır, gövde ise
// ekranı dolduracak kadar aşağı doğru uzatılır (yeşil gövde dikey esnediği için
// doku bozulması fark edilmez).
function buildPipe(gltf) {
  const { geo, material } = bakedGeometry(gltf);
  geo.computeBoundingBox();
  // translate()/scale() sınır kutusunu yerinde güncellediği için değerleri kopyala.
  const bb = geo.boundingBox.clone();
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
  const h = bb.max.y - bb.min.y;

  const pos = geo.attributes.position;
  const radiusIn = (y0, y1) => {
    let r = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y >= y0 && y <= y1) r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    return r;
  };
  const bodyR = radiusIn(bb.min.y + h * 0.35, bb.min.y + h * 0.6);
  const rimR = radiusIn(bb.max.y - h * 0.08, bb.max.y);
  const s = PIPE_W / (2 * bodyR);
  geo.scale(s, s, s);
  geo.translate(0, -bb.max.y * s, 0);

  const len = h * s;
  const keep = len * 0.32;
  const k = (PIPE_LEN - keep) / (len - keep);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -keep) pos.setY(i, -keep + (y + keep) * k);
  }
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  material.metalness = 0;
  material.roughness = 0.38;
  return {
    geo,
    material,
    bodyHalf: bodyR * s,
    rimHalf: Math.max(rimR, bodyR) * s,
    rimH: Math.min(len * 0.14, 0.7),
  };
}

// Meshy önizleme modelleri dokusuz gelir; köşeleri birleştirip normalleri
// yeniden hesaplayarak yumuşak, oyuncak gibi bir görünüm elde ederiz.
function smoothGeometry(gltf, targetSize) {
  const { geo } = bakedGeometry(gltf);
  // Yalnızca konumları (iç içe geçmemiş bir dizi olarak) alıyoruz; mergeVertices
  // interleaved öznitelikleri desteklemiyor.
  const src = geo.attributes.position;
  const positions = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) {
    positions[i * 3] = src.getX(i);
    positions[i * 3 + 1] = src.getY(i);
    positions[i * 3 + 2] = src.getZ(i);
  }
  const plain = new THREE.BufferGeometry();
  plain.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (geo.index) plain.setIndex(Array.from(geo.index.array));
  const merged = mergeVertices(plain, 1e-4);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  const bb = merged.boundingBox.clone();
  const size = new THREE.Vector3();
  bb.getSize(size);
  const s = targetSize / Math.max(size.x, size.y, size.z);
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  merged.scale(s, s, s);
  return merged;
}

// ---------------------------------------------------------------------------
// Oyun nesneleri
// ---------------------------------------------------------------------------

const bird = {
  root: new THREE.Group(),
  tilt: new THREE.Group(),
  face: new THREE.Group(),
  bank: new THREE.Group(),
  mixer: null,
  actions: {},
  current: null,
  y: 6,
  vy: 0,
  angle: 0,
  facing: FACE_MENU,
  flapBoost: 0,
};
bird.root.add(bird.tilt);
bird.tilt.add(bird.face);
bird.face.add(bird.bank);
scene.add(bird.root);

function setupBird(gltf) {
  const { mesh, clips } = rigBird(gltf, BIRD_LEN);
  mesh.material.metalness = 0;
  mesh.material.roughness = 0.62;
  bird.bank.add(mesh);
  bird.mixer = new THREE.AnimationMixer(mesh);
  for (const [name, clip] of Object.entries(clips)) {
    const action = bird.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    bird.actions[name] = action;
  }
}

function playAction(name, fade = 0.25) {
  const next = bird.actions[name];
  if (!next || bird.current === next) return next;
  next.reset();
  next.timeScale = 1;
  next.setEffectiveWeight(1);
  next.play();
  if (bird.current) bird.current.crossFadeTo(next, fade, false);
  bird.current = next;
  return next;
}

const pipeKit = {};
const pipes = [];
const pipePool = [];

function spawnPipe(x, gapY) {
  let pair = pipePool.pop();
  if (!pair) {
    const group = new THREE.Group();
    const bottom = new THREE.Mesh(pipeKit.geo, pipeKit.material);
    const top = new THREE.Mesh(pipeKit.geo, pipeKit.material);
    top.rotation.z = Math.PI;
    group.add(bottom, top);
    scene.add(group);
    pair = { group, bottom, top };
  }
  pair.x = x;
  pair.gapY = gapY;
  pair.scored = false;
  pair.bottom.position.y = gapY - PIPE_GAP / 2;
  pair.top.position.y = gapY + PIPE_GAP / 2;
  pair.group.position.x = x;
  pair.group.visible = true;
  pipes.push(pair);
  return pair;
}

function clearPipes() {
  for (const p of pipes) {
    p.group.visible = false;
    pipePool.push(p);
  }
  pipes.length = 0;
}

function nextGapY(prev) {
  const lo = Math.max(GAP_MIN, prev - 3.4);
  const hi = Math.min(GAP_MAX, prev + 3.4);
  return rand(lo, hi);
}

// Arka plan süsleri (bulutlar ve çalılar) sonsuz şerit gibi geri dönüştürülür.
// Her tür tek bir InstancedMesh ile çizilir (mobilde az sayıda çizim çağrısı).
const scenery = [];
const dummy = new THREE.Object3D();

function addScenery(geo, material, count, opts) {
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  const group = { mesh, items: [], ...opts };
  for (let i = 0; i < count; i++) {
    const item = { x: 0, y: 0, z: 0, s: 1, r: 0 };
    placeScenery(group, item, lerp(-opts.span / 2, opts.span / 2, i / count) + rand(-1, 1));
    group.items.push(item);
  }
  scene.add(mesh);
  scenery.push(group);
}

function placeScenery(group, item, x) {
  item.x = x;
  item.y = rand(group.y[0], group.y[1]);
  item.z = rand(group.z[0], group.z[1]);
  item.s = rand(group.scale[0], group.scale[1]);
  item.r = rand(0, Math.PI * 2);
}

function updateScenery(dt, drift) {
  for (const group of scenery) {
    group.items.forEach((item, i) => {
      item.x -= drift * group.speed * dt;
      const depth = view.dist - item.z;
      const halfW = (view.w / 2) * (depth / view.dist) + 6;
      if (item.x < view.camX - halfW) placeScenery(group, item, view.camX + halfW + rand(0, 4));
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, item.r, 0);
      dummy.scale.setScalar(item.s);
      dummy.updateMatrix();
      group.mesh.setMatrixAt(i, dummy.matrix);
    });
    group.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Tüy efekti
// ---------------------------------------------------------------------------

const feathers = [];
{
  const geo = new THREE.PlaneGeometry(0.22, 0.09);
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? '#ffffff' : '#ffd23f',
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    feathers.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
  }
}

function burstFeathers() {
  for (const f of feathers) {
    f.mesh.visible = true;
    f.mesh.position.set(BIRD_X, bird.y, 0.3);
    f.vel.set(rand(-3, 3), rand(0.5, 4.5), rand(-1, 2));
    f.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
    f.life = 1;
  }
}

function updateFeathers(dt) {
  for (const f of feathers) {
    if (f.life <= 0) continue;
    f.life -= dt * 0.8;
    f.vel.y -= 6 * dt;
    f.vel.multiplyScalar(1 - 1.5 * dt);
    f.mesh.position.addScaledVector(f.vel, dt);
    f.mesh.rotation.x += f.spin.x * dt;
    f.mesh.rotation.y += f.spin.y * dt;
    f.mesh.rotation.z += f.spin.z * dt;
    f.mesh.material.opacity = Math.max(0, f.life);
    if (f.life <= 0) f.mesh.visible = false;
  }
}

// ---------------------------------------------------------------------------
// Oyun durumu
// ---------------------------------------------------------------------------

const game = {
  mode: 'loading', // loading | menu | playing | dying | over | paused
  score: 0,
  best: store.get('flappy3d.best', 0),
  time: 0,
  scroll: 0, // zeminin toplam kayma miktarı
  lastGap: 5.5,
  shake: 0,
  overAt: 0,
  groundedAt: 0,
};

function show(el, visible) {
  el.hidden = !visible;
}

function setMode(mode) {
  game.mode = mode;
  show(ui.menu, mode === 'menu');
  show(ui.hud, mode === 'playing' || mode === 'dying' || mode === 'paused');
  show(ui.paused, mode === 'paused');
  show(ui.gameover, mode === 'over');
  show(ui.pause, mode === 'playing');
}

function goToMenu() {
  clearPipes();
  game.score = 0;
  bird.y = view.camY + 0.4;
  bird.vy = 0;
  bird.angle = 0;
  ui.menuBest.textContent = game.best;
  ui.score.textContent = '0';
  playAction('flap', 0.3);
  setMode('menu');
}

function startGame() {
  game.score = 0;
  ui.score.textContent = '0';
  const right = playCamX() + view.w / 2;
  game.lastGap = clamp(bird.y, GAP_MIN, GAP_MAX);
  spawnPipe(Math.max(right + PIPE_W, BIRD_X + 7.5), nextGapY(game.lastGap));
  sfx.swoosh();
  setMode('playing');
  flap();
}

function flap() {
  bird.vy = FLAP_VELOCITY;
  bird.flapBoost = 1;
  const action = playAction('flap', 0.12);
  if (action) action.time = 0;
  sfx.flap();
}

function die(hitPipe) {
  setMode('dying');
  sfx.hit();
  if (hitPipe) sfx.fall();
  if (hitPipe) bird.vy = Math.min(bird.vy, 1.5);
  burstFeathers();
  ui.flash.classList.remove('is-on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('is-on');
  if (!reducedMotion) game.shake = 0.35;
  playAction('fall', 0.15);
  if (navigator.vibrate) navigator.vibrate(60);
}

function showGameOver() {
  const isNewBest = game.score > game.best;
  if (isNewBest) {
    game.best = game.score;
    store.set('flappy3d.best', game.best);
  }
  ui.finalScore.textContent = game.score;
  ui.finalBest.textContent = game.best;
  show(ui.newBest, isNewBest && game.score > 0);
  const medal = MEDALS.find(([min]) => game.score >= min);
  ui.medal.className = `medal medal--${medal ? medal[1] : 'none'}`;
  ui.medal.setAttribute('aria-label', medal ? medal[2] : 'Madalya yok');
  game.overAt = performance.now();
  setMode('over');
}

function addPoint() {
  game.score += 1;
  ui.score.textContent = game.score;
  ui.score.classList.remove('pop');
  void ui.score.offsetWidth;
  ui.score.classList.add('pop');
  sfx.point();
}

function pause() {
  if (game.mode !== 'playing') return;
  setMode('paused');
}

function resume() {
  if (game.mode !== 'paused') return;
  setMode('playing');
}

function press() {
  sfx.unlock();
  switch (game.mode) {
    case 'menu':
      startGame();
      break;
    case 'playing':
      flap();
      break;
    case 'paused':
      resume();
      break;
    default:
      break;
  }
}

function restart() {
  if (game.mode !== 'over' || performance.now() - game.overAt < 450) return;
  sfx.unlock();
  sfx.swoosh();
  goToMenu();
}

// ---------------------------------------------------------------------------
// Güncelleme döngüsü
// ---------------------------------------------------------------------------

function speed() {
  return BASE_SPEED + Math.min(game.score, 40) * 0.015;
}

function circleHitsRect(cx, cy, r, x0, x1, y0, y1) {
  const nx = clamp(cx, x0, x1);
  const ny = clamp(cy, y0, y1);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

function hitsPipe(p) {
  const { bodyHalf, rimHalf, rimH } = pipeKit;
  const bx = BIRD_X;
  const by = bird.y;
  const low = p.gapY - PIPE_GAP / 2;
  const high = p.gapY + PIPE_GAP / 2;
  return (
    circleHitsRect(bx, by, BIRD_R, p.x - bodyHalf, p.x + bodyHalf, -10, low - rimH) ||
    circleHitsRect(bx, by, BIRD_R, p.x - rimHalf, p.x + rimHalf, low - rimH, low) ||
    circleHitsRect(bx, by, BIRD_R, p.x - rimHalf, p.x + rimHalf, high, high + rimH) ||
    circleHitsRect(bx, by, BIRD_R, p.x - bodyHalf, p.x + bodyHalf, high + rimH, 40)
  );
}

function scrollWorld(dx) {
  game.scroll += dx;
  grassTex.offset.x = (game.scroll / 1.6) % 1;
  dirtTex.offset.x = (game.scroll / 2.2) % 1;
  hillsNear.material.map.offset.x = ((game.scroll * 0.9) / 50) % 1;
  hillsFar.material.map.offset.x = ((game.scroll * 0.9) / 90) % 1;
}

function update(dt) {
  game.time += dt;
  const mode = game.mode;

  if (mode === 'menu') {
    scrollWorld(BASE_SPEED * dt);
    bird.y = view.camY + 0.4 + Math.sin(game.time * 2.4) * 0.25;
  }

  if (mode === 'playing' || mode === 'dying') {
    bird.vy = Math.max(bird.vy - GRAVITY * dt, -MAX_FALL);
    bird.y += bird.vy * dt;
    if (bird.y > CEILING) {
      bird.y = CEILING;
      bird.vy = Math.min(bird.vy, 0);
    }
  }

  if (mode === 'playing') {
    const dx = speed() * dt;
    scrollWorld(dx);
    for (const p of pipes) {
      p.x -= dx;
      p.group.position.x = p.x;
      if (!p.scored && p.x < BIRD_X) {
        p.scored = true;
        addPoint();
      }
    }
    const left = view.camX - view.w / 2 - PIPE_W * 2;
    while (pipes.length && pipes[0].x < left) {
      const p = pipes.shift();
      p.group.visible = false;
      pipePool.push(p);
    }
    const right = playCamX() + view.w / 2 + PIPE_W;
    let last = pipes[pipes.length - 1] ?? spawnPipe(right, nextGapY(game.lastGap));
    while (last.x < right) {
      game.lastGap = nextGapY(last.gapY);
      last = spawnPipe(last.x + PIPE_SPACING, game.lastGap);
    }

    if (bird.y - BIRD_R <= 0) {
      bird.y = BIRD_R;
      die(false);
    } else if (pipes.some(hitsPipe)) {
      die(true);
    }
  }

  if (mode === 'dying' && bird.y - BIRD_R * 0.8 <= 0) {
    bird.y = BIRD_R * 0.8;
    bird.vy = 0;
    if (!game.groundedAt) game.groundedAt = game.time;
    if (game.time - game.groundedAt > 0.55) {
      game.groundedAt = 0;
      showGameOver();
    }
  }

  // Kuşun eğimi: yükselirken burnu yukarı, düşerken pike.
  let targetAngle = 0;
  if (mode === 'playing' || mode === 'dying') {
    targetAngle =
      bird.vy > -2.5
        ? 0.1 + 0.3 * clamp(bird.vy / FLAP_VELOCITY, 0, 1)
        : lerp(0.1, -1.25, clamp((-bird.vy - 2.5) / (MAX_FALL - 4), 0, 1));
  }
  if (mode !== 'over') bird.angle = lerp(bird.angle, targetAngle, 1 - Math.exp(-dt * 9));
}

function playCamX() {
  return BIRD_X + view.w * (0.5 - BIRD_SCREEN_X);
}

function updateVisuals(dt) {
  const mode = game.mode;
  const playing = mode !== 'menu';

  // Kamera: menüde kuş ortada, oyunda sola kayar.
  const targetX = playing ? playCamX() : BIRD_X;
  view.camX = lerp(view.camX, targetX, 1 - Math.exp(-dt * 4));
  let sx = 0;
  let sy = 0;
  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt);
    const a = game.shake * 0.6;
    sx = rand(-a, a);
    sy = rand(-a, a);
  }
  camera.position.set(view.camX + sx, view.camY + sy, view.dist);
  camera.lookAt(view.camX + sx, view.camY + sy, 0);

  ground.position.x = view.camX;
  hillsNear.position.x = view.camX;
  hillsFar.position.x = view.camX;

  // Kuş
  const faceTarget = playing ? FACE_PLAY : FACE_MENU;
  bird.facing = lerp(bird.facing, faceTarget, 1 - Math.exp(-dt * 6));
  bird.face.rotation.y = bird.facing;
  bird.root.position.set(BIRD_X, bird.y, 0);
  bird.tilt.rotation.z = bird.angle;

  bird.bank.rotation.z = lerp(bird.bank.rotation.z, playing ? BANK_PLAY : 0, 1 - Math.exp(-dt * 6));

  // Kanat çırpma hızı: menüde yavaş süzülme, her dokunuşta hızlı bir vuruş.
  if (bird.current === bird.actions.flap) {
    bird.flapBoost = Math.max(0, bird.flapBoost - dt * 2.2);
    bird.current.timeScale = (mode === 'menu' ? 1.8 : 2.3) + bird.flapBoost * 3;
  }
  if (mode === 'over') playAction('rest', 0.4);
  if (bird.mixer) bird.mixer.update(dt);

  // Gölge yüksekliğe göre küçülür ve silikleşir.
  const hgt = clamp(bird.y / 9, 0, 1);
  shadow.position.x = BIRD_X;
  shadow.scale.setScalar(lerp(1.1, 0.45, hgt));
  shadow.material.opacity = lerp(0.9, 0.25, hgt);

  const drift = mode === 'playing' ? speed() : mode === 'menu' ? BASE_SPEED : 0;
  updateScenery(dt, drift);
  updateFeathers(dt);
  adaptResolution(dt);
}

// Kare hızı düşük kalırsa (zayıf telefonlar) çözünürlüğü kademeli olarak azalt.
const perf = { time: 0, frames: 0, ratio: DPR };

function adaptResolution(dt) {
  perf.time += dt;
  perf.frames += 1;
  if (perf.time < 2) return;
  const fps = perf.frames / perf.time;
  perf.time = 0;
  perf.frames = 0;
  if (fps < 45 && perf.ratio > 1) {
    perf.ratio = Math.max(1, perf.ratio - 0.25);
    renderer.setPixelRatio(perf.ratio);
    resize();
  }
}

// ---------------------------------------------------------------------------
// Boyutlandırma
// ---------------------------------------------------------------------------

function resize() {
  const w = ui.app.clientWidth;
  const h = ui.app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  view.h = Math.max(BASE_VIEW_H, MIN_VIEW_W / camera.aspect);
  view.w = view.h * camera.aspect;
  view.camY = view.h / 2 - view.h * GROUND_SHARE;
  view.dist = view.h / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  camera.far = view.dist + 120;
  camera.updateProjectionMatrix();
  if (game.mode === 'menu') view.camX = BIRD_X;
}

window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Girdi
// ---------------------------------------------------------------------------

ui.app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  if (e.button !== undefined && e.button > 0) return;
  e.preventDefault();
  press();
});

// iOS Safari sesi yalnızca dokunma bittiğinde açabiliyor.
ui.app.addEventListener('pointerup', () => sfx.unlock());
ui.app.addEventListener('touchend', () => sfx.unlock());
ui.app.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter'].includes(e.code)) {
    if (e.target.closest?.('button') && e.code !== 'Space') return;
    e.preventDefault();
    if (game.mode === 'over') restart();
    else press();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.mode === 'playing') pause();
    else if (game.mode === 'paused') resume();
  } else if (e.code === 'KeyM') {
    toggleMute();
  }
});

ui.restart.addEventListener('click', restart);
ui.pause.addEventListener('click', pause);
ui.mute.addEventListener('click', toggleMute);
ui.retry.addEventListener('click', () => window.location.reload());

function applyMute(muted) {
  sfx.setMuted(muted);
  ui.mute.setAttribute('aria-pressed', String(muted));
  ui.mute.setAttribute('aria-label', muted ? 'Sesi aç' : 'Sesi kapat');
}

function toggleMute() {
  sfx.unlock();
  const muted = !sfx.muted;
  applyMute(muted);
  store.set('flappy3d.muted', muted);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// ---------------------------------------------------------------------------
// Başlat
// ---------------------------------------------------------------------------

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game.mode !== 'paused' && game.mode !== 'loading') {
    acc += dt;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    updateVisuals(dt);
  }
  renderer.render(scene, camera);
}

async function boot() {
  applyMute(store.get('flappy3d.muted', false));
  resize();
  setMode('loading');
  requestAnimationFrame(frame);

  let assets;
  try {
    assets = await loadAll();
  } catch (err) {
    console.error(err);
    ui.loadText.textContent = 'Modeller yüklenemedi. Bağlantını kontrol edip tekrar dene.';
    show(ui.retry, true);
    return;
  }

  setupBird(assets.bird);
  Object.assign(pipeKit, buildPipe(assets.pipe));

  const cloudGeo = smoothGeometry(assets.cloud, 1);
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#d7eef6', emissiveIntensity: 0.45 });
  addScenery(cloudGeo, cloudMat, 9, {
    span: 90, scale: [4, 7.5], y: [8, 17], z: [-45, -28], speed: 0.35,
  });

  const bushGeo = smoothGeometry(assets.bush, 1);
  const bushMat = new THREE.MeshLambertMaterial({ color: '#5fb03a', emissive: '#1f4a10', emissiveIntensity: 0.25, side: THREE.DoubleSide });
  const bushMatDark = new THREE.MeshLambertMaterial({ color: '#4b9a33', emissive: '#16380b', emissiveIntensity: 0.25, side: THREE.DoubleSide });
  addScenery(bushGeo, bushMat, 26, {
    span: 70, scale: [1.6, 2.8], y: [-0.35, -0.1], z: [-5.6, -4.4], speed: 1,
  });
  addScenery(bushGeo, bushMatDark, 14, {
    span: 90, scale: [3, 5], y: [-0.5, -0.2], z: [-14, -9], speed: 1,
  });

  show(ui.loading, false);
  view.camX = BIRD_X;
  goToMenu();
}

boot();
// Otomatik testler için: ?debug adresiyle açıldığında oyun durumunu dışa aç.
if (new URLSearchParams(window.location.search).has('debug')) {
  window.__flappy = { pipes, pipeKit, bird, game, view, perf };
}
