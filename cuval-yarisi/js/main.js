// Çuval Yarışı: oyun döngüsü, kamera, sinematik giriş, HUD ve menüler.
import * as THREE from 'three';
import { loadAll } from './assets.js';
import { audio } from './audio.js';
import { World, HALF } from './world.js';
import { initMaterials } from './people.js';
import { Racer } from './racer.js';
import { Particles } from './fx.js';
import { HEROES, RIVALS, DIFFICULTIES, TRACK, POINTS, HOP } from './config.js';

const $ = (s) => document.querySelector(s);
const L = TRACK.length;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

// ---------- Ayarlar (yerel depolama) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('cuval.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cuval.' + k, JSON.stringify(v)); } catch { /* özel sekme */ } },
};
const settings = Object.assign({ sfx: true, music: true, film: false, haptic: true, quality: 'auto', hero: 0, diff: 1 }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
// zayıf telefonlar (az bellek / az çekirdek) otomatik olarak düşük kaliteyle açılır
const weakDevice = (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const resolveQuality = () => settings.quality !== 'auto' ? settings.quality : isMobile ? (weakDevice ? 'low' : 'medium') : 'high';
const quality = resolveQuality();

// ---------- Görüntüleyici ----------
const canvas = $('#c');
const dpr = window.devicePixelRatio || 1;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 1.5, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const prMax = { low: 1, medium: Math.min(dpr, 1.5), high: Math.min(dpr, 2) }[quality];
let pixelRatio = prMax;
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
scene.fog = new THREE.Fog(0xb9c6bf, 60, 240);
scene.background = new THREE.Color(0xb9c6bf);

let world, fx, racers = [], heroRacers = [], rivalRacers = [], player = null;
let state = 'loading';
let raceTime = 0, timeScale = 1, finishOrder = [];
let seq = [], seqT = 0;
const camPos = new THREE.Vector3(0, 3, 8), camLook = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3();
let shake = 0, fovKick = 0;
let menuAngle = 0;
let lastLeader = null, lastLeadT = 0, halfwayCalled = false;
let tags = [];

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  applyViewOffset();
}
function applyViewOffset() {
  const w = window.innerWidth, h = window.innerHeight;
  if (state === 'menu') {
    if (w < h) camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    else if (h < 520) camera.setViewOffset(w, h, w * 0.2, 0, w, h);
    else camera.setViewOffset(w, h, 0, h * 0.12, w, h);
  } else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- Yükleme ----------
const tips = [
  'Ahali toplanıyor, davullar akort ediliyor…',
  'Çuvallar İskenderiye değirmeninden getirildi…',
  'Daver Bey köşkteki yerini alıyor…',
  'Seferoğulları gözünü yarıştan ayırmıyor…',
  'Zurnacı nefesini topluyor…',
];
let tipI = 0;
const tipTimer = setInterval(() => { $('#load-tip').textContent = tips[++tipI % tips.length]; }, 1600);

function grainBg() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), d = x.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 60; }
  x.putImageData(d, 0, 0);
  // birkaç film çiziği
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(37, 0, 1, 128); x.fillRect(101, 0, 1, 70);
  $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

async function boot() {
  resize();
  grainBg();
  initMaterials();
  await loadAll(renderer, (p) => { $('#load-bar').style.width = `${Math.round(p * 100)}%`; });

  // ortam ışığı: Poly Haven HDRI
  const { assets } = await import('./assets.js');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(assets.hdr).texture;
  scene.environmentIntensity = 0.75;
  pmrem.dispose();

  world = new World(scene, quality);
  fx = new Particles(scene, quality === 'low' ? 500 : 1000);
  heroRacers = HEROES.map((d, i) => new Racer(d, 0, { num: i + 1 }));
  rivalRacers = RIVALS.map((d, i) => new Racer(d, 0, { num: i + 4, lod: quality === 'low' ? 'mid' : false }));
  racers = [...heroRacers, ...rivalRacers];
  for (const r of racers) { scene.add(r.model.root); hookRacer(r); }
  tags = racers.map((r) => makeTag(r));
  audio.onBeat = (d) => world.drumHit(d);

  setupMenu();
  arrangeLanes();
  // gölgeleri ve shader'ları ilk karede derle
  renderer.compile(scene, camera);
  clearInterval(tipTimer);
  $('#loading').classList.remove('show');
  goMenu();
  requestAnimationFrame(loop);
}

// ---------- İsim etiketleri ----------
function makeTag(r) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80;
  const x = c.getContext('2d');
  const tel = r.def.family === 'Tellioğlu';
  x.fillStyle = tel ? 'rgba(143,29,33,0.92)' : 'rgba(31,78,121,0.92)';
  x.beginPath(); x.roundRect(18, 14, 220, 48, 24); x.fill();
  x.strokeStyle = '#f1cf7a'; x.lineWidth = 3; x.stroke();
  x.fillStyle = '#fbf2dc'; x.font = '34px "Lilita One", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(r.def.name, 128, 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.95, 0.3, 1); s.renderOrder = 10;
  r.model.tagAnchor.add(s);
  // oyuncu için altın ok
  const ac = document.createElement('canvas'); ac.width = 64; ac.height = 64;
  const ax = ac.getContext('2d'); ax.fillStyle = '#f1cf7a'; ax.strokeStyle = '#3a0d10'; ax.lineWidth = 5;
  ax.beginPath(); ax.moveTo(10, 14); ax.lineTo(54, 14); ax.lineTo(32, 52); ax.closePath(); ax.stroke(); ax.fill();
  const at = new THREE.CanvasTexture(ac); at.colorSpace = THREE.SRGBColorSpace;
  const arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: at, depthTest: false, transparent: true }));
  arrow.scale.set(0.3, 0.3, 1); arrow.position.y = 0.33; arrow.renderOrder = 10;
  r.model.tagAnchor.add(arrow);
  return { r, s, arrow };
}
function showTags(on) { for (const t of tags) { t.s.visible = on; t.arrow.visible = on && t.r === player; } }

// ---------- Kulvar dizilimi ----------
function arrangeLanes() {
  const diff = DIFFICULTIES[settings.diff];
  const hero = heroRacers[settings.hero];
  const mates = heroRacers.filter((r) => r !== hero);
  // Tellioğlu ve Seferoğlu kadınları sırayla dizilir, oyuncu ortada
  const order = [rivalRacers[0], mates[0], hero, rivalRacers[1], mates[1], rivalRacers[2]];
  order.forEach((r, lane) => {
    const [a, b] = diff.skill;
    const skill = r === hero ? 1 : lerp(a, b, Math.random()) * (r.def.family === 'Tellioğlu' ? 0.97 : 1);
    r.configure({ lane, isPlayer: r === hero, sweet: diff.sweet, skill });
    if (r !== hero) r.p.distMul *= diff.aiPace;
  });
  player = hero;
}

// ---------- Olaylar ----------
function hookRacer(r) {
  r.on('land', (_, rr) => {
    const d = camPos.distanceTo(rr.model.root.position);
    const vol = clamp(1 - d / 26, 0, 1) * (rr === player ? 0.9 : 0.5);
    if (vol > 0.02) {
      audio.play(Math.random() < 0.5 ? 'zipla_0' : 'zipla_1', { vol, rate: 0.85 + Math.random() * 0.25, pan: clamp((rr.x - camPos.x) / 6, -0.8, 0.8) });
      audio.play(Math.random() < 0.5 ? 'cuval_0' : 'cuval_1', { vol: vol * 0.45, rate: 0.9 + Math.random() * 0.3, verb: 0 });
    }
    if (d < 30) fx.dust(rr.x, -rr.z, 0.6 + rr.combo * 0.12);
    if (rr === player) shake = Math.max(shake, 0.04 + rr.combo * 0.012);
  });
  r.on('judge', (j, rr) => {
    if (rr !== player || state !== 'race') return;
    const map = {
      mukemmel: ['MÜKEMMEL!', '#7dff8f'], acele: ['ACELE!', '#ffb347'], tampon: ['İYİ', '#fff3c4'],
      gec: ['GEÇ', '#d9d0c0'], panik: ['PANİK!', '#ff6a5a'], durgun: null,
    };
    const m = map[j]; if (!m) return;
    const el = $('#judge');
    el.textContent = m[0]; el.style.color = m[1];
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    if (j === 'mukemmel') {
      audio.accent(0.6 + rr.combo * 0.06);
      if (settings.haptic) navigator.vibrate?.(8);
    }
    if (j === 'panik') audio.play('tik', { vol: 0.5, rate: 0.7 });
  });
  r.on('fall', (_, rr) => {
    const d = camPos.distanceTo(rr.model.root.position);
    audio.play('dusme', { vol: clamp(1 - d / 30, 0.1, 1), rate: 0.75 });
    if (state !== 'race') return;
    if (rr === player) {
      audio.play('ooo', { vol: 0.9 });
      shake = 0.35;
      if (settings.haptic) navigator.vibrate?.([40, 30, 80]);
      $('#flash').classList.add('on'); setTimeout(() => $('#flash').classList.remove('on'), 260);
      say('Çığırtkan', pick([`Eyvah! ${rr.def.name} çuvalıyla yere kapaklandı!`, 'Aman efendim! Çuval bir yana, hanım bir yana!', `Kalk ${rr.def.name} Hanım, kalk! Daha yarış bitmedi!`]), 2.2);
    } else if (d < 18) {
      audio.play('ooo', { vol: 0.45, rate: 1.1 });
      if (Math.random() < 0.6) say('Çığırtkan', `${rr.def.title} tökezledi!`, 1.8);
    }
    fx.dust(rr.x + rr.fallSide * 0.5, -rr.z, 1.6);
  });
  r.on('hucum', (_, rr) => {
    if (rr === player) {
      audio.intensity = 1; audio.setTempo(150);
      audio.play('kalabalik', { vol: 0.6, rate: 1.1 });
      say('Çığırtkan', 'Seferoğulları\'na hücuuum!', 2);
      $('#speedlines').classList.add('on');
      fovKick = 9;
    }
  });
  r.on('hucumEnd', (_, rr) => {
    if (rr === player) { audio.intensity = 0.3; audio.setTempo(126); $('#speedlines').classList.remove('on'); }
  });
  r.on('finish', (t, rr) => {
    finishOrder.push(rr);
    rr.finishRun();
    if (finishOrder.length === 1) {
      world.breakRibbon();
      fx.confetti(0, -L, 120);
      audio.play('alkis', { vol: 0.8 });
      if (rr !== player && state === 'race') say('Çığırtkan', `${rr.def.title} birinci geldi!`, 2);
    }
    if (rr === player && state === 'race') onPlayerFinish();
  });
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- Altyazı / çığırtkan ----------
let subTimer = 0;
function say(who, text, dur = 2.6, speak = false) {
  $('#sub-who').textContent = who;
  $('#sub-text').textContent = text;
  $('#subtitle').classList.add('on');
  subTimer = dur;
  if (speak) audio.say(text);
}

// ---------- Menü ----------
function setupMenu() {
  const hs = $('#heroes');
  HEROES.forEach((h, i) => {
    const b = document.createElement('button');
    b.className = 'hero';
    const pips = (n) => `<span class="pips">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
    b.innerHTML = `<div class="fm">${h.family}</div><div class="nm">${h.name}</div>
      <div class="st"><div>GÜÇ ${pips(h.stats.guc)}</div><div>DENGE ${pips(h.stats.denge)}</div><div>ÇEVİKLİK ${pips(h.stats.ceviklik)}</div></div>`;
    b.onclick = () => { settings.hero = i; saveSettings(); refreshMenu(); arrangeLanes(); uiClick(); };
    hs.appendChild(b);
  });
  const blurb = document.createElement('div'); blurb.className = 'hero-blurb'; blurb.id = 'blurb';
  hs.after(blurb);
  const ds = $('#diffs');
  DIFFICULTIES.forEach((d, i) => {
    const b = document.createElement('button'); b.textContent = d.label;
    b.onclick = () => { settings.diff = i; saveSettings(); refreshMenu(); arrangeLanes(); uiClick(); };
    ds.appendChild(b);
  });
  const qs = $('#set-quality');
  [['auto', 'Otomatik'], ['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek']].forEach(([k, l]) => {
    const b = document.createElement('button'); b.textContent = l; b.dataset.k = k;
    b.onclick = () => {
      settings.quality = k; saveSettings(); uiClick();
      [...qs.children].forEach((c) => c.classList.toggle('sel', c.dataset.k === k));
      if (resolveQuality() !== quality) say('Bilgi', 'Grafik ayarı oyunu yeniden açınca tamamen uygulanır.', 2.6);
    };
    qs.appendChild(b);
  });
  [...qs.children].forEach((c) => c.classList.toggle('sel', c.dataset.k === settings.quality));

  $('#btn-start').onclick = async () => { await unlockAudio(); audio.play('onay', { vol: 0.7 }); startIntro(); };
  $('#btn-howto').onclick = () => openModal('#howto');
  $('#btn-settings').onclick = () => openModal('#settings');
  $('#btn-credits').onclick = () => openModal('#credits');
  document.querySelectorAll('.modal .close').forEach((b) => { b.onclick = () => { b.closest('.modal').classList.remove('show'); uiClick(); }; });
  const bind = (id, key, fn) => { const el = $(id); el.checked = settings[key]; el.onchange = () => { settings[key] = el.checked; saveSettings(); fn?.(); }; };
  bind('#set-sfx', 'sfx', applyAudio);
  bind('#set-music', 'music', applyAudio);
  bind('#set-film', 'film', () => document.body.classList.toggle('film', settings.film));
  bind('#set-haptic', 'haptic');
  document.body.classList.toggle('film', settings.film);

  $('#btn-pause').onclick = () => pause(true);
  $('#btn-resume').onclick = () => pause(false);
  $('#btn-restart').onclick = () => { $('#pause').classList.remove('show'); startIntro(true); };
  $('#btn-quit').onclick = () => { $('#pause').classList.remove('show'); goMenu(); };
  $('#btn-again').onclick = () => { uiClick(); startIntro(true); };
  $('#btn-menu').onclick = () => { uiClick(); goMenu(); };
  $('#btn-hucum').onpointerdown = (e) => { e.stopPropagation(); if (state === 'race') player.activateHucum(); };
  refreshMenu();
}

function refreshMenu() {
  [...$('#heroes').children].forEach((b, i) => b.classList.toggle('sel', i === settings.hero));
  [...$('#diffs').children].forEach((b, i) => b.classList.toggle('sel', i === settings.diff));
  $('#blurb').textContent = HEROES[settings.hero].blurb;
  const best = store.get(`best.${HEROES[settings.hero].id}.${DIFFICULTIES[settings.diff].id}`, null);
  $('#best').textContent = best ? `En iyi derece: ${best.toFixed(2)} sn` : '';
}

function openModal(id) { uiClick(); $(id).classList.add('show'); }
function uiClick() { audio.play('sec', { vol: 0.5, verb: 0 }); }
function applyAudio() { audio.enabled.sfx = settings.sfx; audio.enabled.music = settings.music; audio.applySettings(); }

let audioUnlocked = false;
async function unlockAudio() {
  if (audioUnlocked) { await audio.unlock(); return; }
  audioUnlocked = true;
  await audio.unlock();
  applyAudio();
  audio.loop('kuslar', 0.35);
  audio.loop('kalabalik', 0.12);
  audio.startMusic(96, true);
}
// menüde herhangi bir dokunuş sesi açar
window.addEventListener('pointerdown', () => { if (!audioUnlocked && state === 'menu') unlockAudio(); }, { capture: true });

function goMenu() {
  state = 'menu';
  document.body.classList.remove('cine', 'racing', 'finished');
  $('#menu').classList.add('show');
  $('#hud').classList.add('hidden');
  $('#results').classList.remove('show');
  $('#subtitle').classList.remove('on');
  $('#speedlines').classList.remove('on');
  timeScale = 1;
  arrangeLanes();
  for (const r of racers) { r.sackRise = 1; }
  world.resetRibbon();
  world.excite = 0.25;
  showTags(false);
  if (audioUnlocked) { audio.startMusic(96, true); audio.intensity = 0; audio.setLoopVol('kalabalik', 0.12); }
  applyViewOffset();
}

// ---------- Sinematik giriş ----------
function startIntro(quick = false) {
  $('#menu').classList.remove('show');
  $('#results').classList.remove('show');
  $('#hud').classList.add('hidden');
  state = 'intro';
  applyViewOffset();
  arrangeLanes();
  world.resetRibbon();
  finishOrder = []; raceTime = 0; timeScale = 1; halfwayCalled = false; lastLeader = null;
  $('#speedlines').classList.remove('on');
  document.body.classList.add('cine');
  document.body.classList.remove('racing', 'finished');
  showTags(false);
  audio.startMusic(100, false);
  audio.setLoopVol('kalabalik', 0.25);
  audio.intensity = 0;
  for (const r of racers) r.sackRise = 0.32;
  seq = []; seqT = 0;
  const at = (t, fn) => seq.push({ t, fn });
  const k = world.koskPos;
  if (!quick) {
    // her çekim: hedef noktası, hedefe göre kamera açısı (Y ekseni), mesafe ve yükseklik
    shots = [
      { t0: 0, t1: 3.4, tg: [k.x + 0.25, 1.2, k.z + 1.9], tg2: [k.x + 0.25, 1.15, k.z - 1.5], a: -Math.PI / 2 - 0.45, a2: -Math.PI / 2 + 0.3, d: 3.9, d2: 3.1, h: 1.75, h2: 1.3 },
      { t0: 3.4, t1: 6.6, tg: [-HALF - 1.15, 1.45, 0.5], tg2: [-HALF - 1.0, 1.6, -0.2], a: Math.PI - 0.3, a2: Math.PI + 0.12, d: 4.6, d2: 3.6, h: 0.15, h2: -0.1 },
      { t0: 6.6, t1: 10, tg: [HALF - 0.8, 0.85, 0], tg2: [-HALF + 0.8, 0.85, 0], a: Math.PI - 0.55, a2: Math.PI + 0.55, d: 3.3, d2: 3.1, h: 0.45, h2: 0.75 },
    ];
    at(0.0, () => titleCard(true));
    at(2.6, () => titleCard(false));
    at(0.3, () => say('Çığırtkan', 'Ahali! Daver Bey\'in kır eğlencesine hoş geldiniz!', 3, true));
    at(3.6, () => { world.crier.target = 1; say('Çığırtkan', 'Şimdi de kadınlar arası çuval yarışı!', 3, true); audio.play('kalabalik', { vol: 0.5 }); world.excite = 0.7; });
    at(6.8, () => { world.crier.target = 0.2; say('Çığırtkan', 'Hanımlar, çuvalları belinize çekin, aynı hizaya dizilin!', 3.2, true); world.excite = 0.4; });
    for (let i = 0; i < racers.length; i++) at(7.0 + i * 0.22, () => { racers[i].riseT = 0; });
    at(10, () => startCountdown());
  } else {
    shots = [];
    for (const r of racers) r.sackRise = 1;
    at(0.05, () => startCountdown());
  }
}
let shots = [];
function titleCard(on) { $('#titlecard').classList.toggle('on', on); }

function startCountdown() {
  state = 'countdown';
  document.body.classList.remove('cine');
  for (const r of racers) { r.sackRise = 1; r.riseT = undefined; }
  $('#hud').classList.remove('hidden');
  document.body.classList.add('racing');
  showTags(true);
  updateHud();
  seq = []; seqT = 0;
  const cd = (txt, t, drum) => seq.push({ t, fn: () => {
    const el = $('#countdown'); el.textContent = txt; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    if (drum === 'D') audio.accent(1.2); else audio.play('tik', { vol: 0.7, rate: 0.8 });
    if (drum === 'D') world.drumHit('D'); else world.drumHit('t');
  } });
  seq.push({ t: 0.0, fn: () => { world.crier.target = 1; audio.say('Hazır!'); } });
  cd('HAZIR', 0.25, 't');
  seq.push({ t: 1.05, fn: () => audio.say('Dikkat!') });
  cd('DİKKAT', 1.2, 't');
  cd('BAŞLA!', 2.2, 'D');
  seq.push({ t: 2.2, fn: () => {
    world.crier.target = -0.2;
    audio.say('Başla!');
    state = 'race'; raceTime = 0;
    for (const r of racers) r.start();
    audio.startMusic(126, true);
    audio.intensity = 0.3;
    audio.setLoopVol('kalabalik', 0.4);
    world.excite = 0.55;
    audio.play('kalabalik', { vol: 0.5 });
  } });
}

// ---------- Bitiş ----------
let finishCam = 0;
function onPlayerFinish() {
  state = 'finish';
  document.body.classList.add('finished');
  showTags(false);
  finishCam = 0;
  timeScale = 0.35;
  world.excite = 1;
  const place = finishOrder.indexOf(player) + 1;
  audio.play('alkis', { vol: place === 1 ? 1 : 0.6 });
  audio.setLoopVol('kalabalik', 0.65);
  if (place === 1) { fx.confetti(player.x, -L - 1, 160); say('Çığırtkan', `Birinci ${player.def.title}! Maşallah!`, 3, true); }
  else say('Çığırtkan', `${player.def.title} ${place}. oldu!`, 3, true);
  $('#speedlines').classList.remove('on');
  seq = []; seqT = 0;
  seq.push({ t: 1.2, fn: () => { timeScale = 1; } });
  seq.push({ t: 3.4, fn: () => showResults() });
}

function showResults() {
  state = 'results';
  $('#subtitle').classList.remove('on'); subTimer = 0;
  document.body.classList.remove('racing');
  $('#hud').classList.add('hidden');
  // bitirmeyenler için tahmini süre
  const est = racers.filter((r) => r.finishTime === null).map((r) => {
    const v = Math.max(1.6, r.z / Math.max(1, raceTime));
    return { r, t: raceTime + (L - r.z) / v };
  });
  const rows = [...finishOrder.map((r) => ({ r, t: r.finishTime })), ...est.sort((a, b) => a.t - b.t)];
  const list = $('#res-list'); list.innerHTML = '';
  let tel = 0, sef = 0;
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    const isTel = row.r.def.family === 'Tellioğlu';
    if (isTel) tel += POINTS[i]; else sef += POINTS[i];
    li.style.setProperty('--c', isTel ? 'var(--telli)' : 'var(--sefer)');
    if (row.r === player) li.className = 'me';
    li.innerHTML = `<span class="pos">${i + 1}</span><span>${row.r.def.name}${row.r === player ? ' (sen)' : ''}<span class="fam">${row.r.def.family}</span></span><span class="tm">${row.t.toFixed(2)} sn${row.r.finishTime === null ? '*' : ''}</span>`;
    list.appendChild(li);
  });
  const place = rows.findIndex((x) => x.r === player) + 1;
  $('#res-banner').textContent = 'Kadınlar arası çuval yarışı';
  $('#res-place').textContent = place === 1 ? 'BİRİNCİ!' : `${place}. oldun`;
  const telWin = tel >= sef;
  $('#res-team').innerHTML = `<div class="t ${telWin ? 'win' : ''}">TELLİOĞULLARI<b>${tel}</b></div><div class="s ${telWin ? '' : 'win'}">SEFEROĞULLARI<b>${sef}</b></div>`;
  $('#res-quote').textContent = place === 1
    ? '“Bravo! Tellioğulları\'nın kızları çuvalla bile uçuyor!” — Daver Bey'
    : telWin ? '“Gördün mü Seferoğlu? Bu eğlencenin galibi yine biziz!” — Tellioğlu Lütfü'
      : '“Seferoğulları\'na çuval yarışında kimse yetişemez!” — Seferoğlu Sıtkı';
  const key = `best.${player.def.id}.${DIFFICULTIES[settings.diff].id}`;
  const prev = store.get(key, null);
  if (player.finishTime !== null && (prev === null || player.finishTime < prev)) {
    store.set(key, player.finishTime);
    if (prev !== null) $('#res-banner').textContent = `Yeni kişisel rekor! (önceki ${prev.toFixed(2)} sn)`;
  }
  $('#results').classList.add('show');
  audio.startMusic(104, true);
  audio.intensity = 0;
}

// ---------- Duraklatma ----------
let prevState = null;
function pause(on) {
  if (on && (state === 'race' || state === 'countdown')) {
    prevState = state; state = 'paused';
    $('#pause').classList.add('show');
    audio.ctx?.suspend();
  } else if (!on && state === 'paused') {
    state = prevState;
    $('#pause').classList.remove('show');
    audio.ctx?.resume();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(true); if (state !== 'paused') audio.ctx?.suspend(); }
  else if (state !== 'paused') audio.ctx?.resume();
});

// ---------- Girdi ----------
function press() {
  if (state === 'intro') { skipIntro(); return; }
  if (state !== 'race') return;
  player.press();
  const t = $('#tap'); t.classList.add('press'); setTimeout(() => t.classList.remove('press'), 90);
}
function skipIntro() {
  if (seqT < 0.6) return;
  titleCard(false);
  $('#subtitle').classList.remove('on');
  for (const r of racers) r.sackRise = 1;
  startCountdown();
}
window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .modal, .screen.show:not(#loading)')) return;
  if (e.button > 0) return;
  press();
});
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); press(); }
  else if (e.code === 'KeyH' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { if (state === 'race') player.activateHucum(); }
  else if (e.code === 'Escape' || e.code === 'KeyP') pause(state !== 'paused');
});
// iOS çift dokunma yakınlaştırmasını engelle
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- HUD ----------
const miniEls = new Map();
function updateHud() {
  const mini = $('#mini');
  if (!miniEls.size) {
    for (const r of racers) {
      const i = document.createElement('i');
      mini.appendChild(i); miniEls.set(r, i);
    }
  }
  for (const r of racers) {
    const i = miniEls.get(r);
    i.style.background = r.def.family === 'Tellioğlu' ? 'var(--telli)' : 'var(--sefer)';
    i.className = r === player ? 'me' : '';
    i.style.left = `calc(${clamp(r.z / L, 0, 1)} * (100% - 14px))`;
  }
  const order = rankOrder();
  $('#rank').textContent = order.indexOf(player) + 1;
  $('#timer').textContent = raceTime.toFixed(2);
  const c = $('#combo');
  const txt = player.combo >= 2 ? `KOMBO ×${player.combo}` : '';
  if (c.textContent !== txt) { c.textContent = txt; if (txt) { c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 120); } }
  const w = clamp(player.wobble, 0, 1);
  const bf = $('#bal-fill');
  bf.style.width = `${w * 100}%`;
  bf.style.background = `hsl(${120 - w * 120} 72% 46%)`;
  $('#warn').classList.toggle('on', w > 0.68 && state === 'race');
  // zıplama halkası: inişe yaklaşırken daralır, tatlı pencerede yeşil yanar
  const ring = $('#tap-ring'), tap = $('#tap');
  let hot = false;
  if (player.state === 'air') {
    const k = clamp(player.t / player.airTime, 0, 1);
    ring.style.transform = `scale(${1.65 - k * 0.65})`; ring.style.opacity = 0.35 + k * 0.6;
    ring.style.borderColor = k > 0.78 ? '#b8ffb8' : 'rgba(255,255,255,0.85)';
  } else if (player.state === 'ground' && state === 'race') {
    const t = player.t;
    hot = player.hucum > 0 || (t >= HOP.goodWindow && t <= HOP.goodWindow + player.p.sweet);
    ring.style.transform = 'scale(1)'; ring.style.opacity = hot ? 1 : 0.15;
    ring.style.borderColor = hot ? '#b8ffb8' : 'rgba(255,255,255,0.6)';
  } else { ring.style.opacity = 0; }
  tap.classList.toggle('hot', hot);
  const hb = $('#btn-hucum');
  $('#hucum-arc').style.strokeDashoffset = `${276.5 * (1 - (player.hucum > 0 ? player.hucum / 3.6 : player.coskun))}`;
  hb.classList.toggle('ready', player.coskun >= 1 && player.hucum <= 0);
  hb.classList.toggle('active', player.hucum > 0);
}

function rankOrder() {
  return [...racers].sort((a, b) => {
    if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
    if (a.finishTime !== null) return -1;
    if (b.finishTime !== null) return 1;
    return b.z - a.z;
  });
}

// ---------- Kamera ----------
function raceCamera(dt) {
  const portrait = camera.aspect < 1;
  const p = player.model.root.position;
  const dist = portrait ? 5.0 : 4.3, height = portrait ? 2.55 : 2.25;
  tmpV.set(p.x * 0.55, height + player.model.hop.position.y * 0.25, p.z + dist);
  tmpL.set(p.x * 0.8, 0.9, p.z - (portrait ? 5.5 : 5));
  const k = 1 - Math.exp(-dt * 6);
  camPos.lerp(tmpV, k); camLook.lerp(tmpL, k);
  const baseFov = portrait ? 64 : 52;
  const want = baseFov + player.combo * 0.7 + fovKick;
  camera.fov = lerp(camera.fov, want, 1 - Math.exp(-dt * 4));
}

function updateCamera(dt, t) {
  if (state === 'menu') {
    const h = heroRacers[settings.hero].model.root.position;
    menuAngle += dt * 0.18;
    tmpV.set(h.x + Math.sin(menuAngle) * 1.6 - 0.6, 1.45, h.z - 3.6 + Math.cos(menuAngle) * 0.3);
    tmpL.set(h.x, 1.05, h.z);
    const k = 1 - Math.exp(-dt * 2.5);
    camPos.lerp(tmpV, k); camLook.lerp(tmpL, k);
    camera.fov = lerp(camera.fov, camera.aspect < 1 ? 62 : 45, 0.05);
  } else if (state === 'intro') {
    const s = shots.find((x) => seqT >= x.t0 && seqT < x.t1) || shots[shots.length - 1];
    if (s) {
      const u = ease(clamp((seqT - s.t0) / (s.t1 - s.t0), 0, 1));
      const far = camera.aspect < 1 ? 1.45 : 1;
      const a = lerp(s.a, s.a2, u), d = lerp(s.d, s.d2, u) * far, hh = lerp(s.h, s.h2, u);
      camLook.set(lerp(s.tg[0], s.tg2[0], u), lerp(s.tg[1], s.tg2[1], u), lerp(s.tg[2], s.tg2[2], u));
      camPos.set(camLook.x + Math.sin(a) * d, camLook.y + hh, camLook.z + Math.cos(a) * d);
      camera.fov = camera.aspect < 1 ? 58 : 40;
    }
  } else if (state === 'countdown' || state === 'race' || state === 'paused') {
    if (state !== 'paused') raceCamera(dt);
  } else if (state === 'finish' || state === 'results') {
    finishCam += dt;
    const p = player.model.root.position;
    const a = 0.4 + finishCam * 0.25;
    const r = camera.aspect < 1 ? 5.2 : 4.2;
    tmpV.set(p.x + Math.sin(a) * r, 1.7, p.z - Math.cos(a) * r);
    tmpL.set(p.x, 1.1, p.z);
    const k = 1 - Math.exp(-dt * 3);
    camPos.lerp(tmpV, k); camLook.lerp(tmpL, k);
    camera.fov = lerp(camera.fov, camera.aspect < 1 ? 60 : 48, 0.05);
  }
  fovKick = Math.max(0, fovKick - dt * 6);
  shake = Math.max(0, shake - dt * 1.8);
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(tmpV.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
  world.skyMesh.position.copy(camera.position);
  // gölge kamerası oyuncuyu takip eder
  const focus = state === 'intro' ? camLook : player.model.root.position;
  world.followSun(tmpL.set(focus.x * 0.3, 0, focus.z - 4));
}

// ---------- Yarış mantığı ----------
function raceLogic(dt) {
  raceTime += dt;
  // lastik bant: YZ oyuncuya göre ayarlanır
  const diff = DIFFICULTIES[settings.diff];
  for (const r of racers) if (r !== player) r.setRubber(r.z - player.z, diff.rubber);
  // heyecan: önde birbirine yakın yarışmacılar
  const order = rankOrder();
  const lead = order[0];
  world.excite = clamp(0.5 + (player.combo / 7) * 0.3 + (player.hucum > 0 ? 0.3 : 0), 0, 1);
  if (lead !== lastLeader && raceTime > 2.5 && raceTime - lastLeadT > 3 && lead.finishTime === null) {
    lastLeadT = raceTime;
    if (lastLeader) say('Çığırtkan', lead === player ? `${lead.def.name} öne geçti! Haydi Tellioğulları!` : `${lead.def.title} öne geçti!`, 2);
  }
  lastLeader = lead;
  if (!halfwayCalled && player.z > L / 2) { halfwayCalled = true; say('Çığırtkan', pick(['Yarı yol! Davulcu, vur davula!', 'Yarıladık! Çuvallar havada uçuşuyor!']), 2); }
  audio.setTempo(player.hucum > 0 ? 150 : 120 + Math.round(player.combo * 2.5));
  audio.setLoopVol('kalabalik', 0.35 + world.excite * 0.3);
}

// ---------- Döngü ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (testMode) return;
  adaptResolution(rdt);
  tick(rdt);
  renderer.render(scene, camera);
}

function tick(rdt) {
  if (state === 'paused') return;
  const dt = rdt * timeScale;
  if (autoBot && state === 'race' && player.state === 'ground' && player.t > HOP.goodWindow + 0.03) press();
  if (autoBot && state === 'race' && player.coskun >= 1) player.activateHucum();

  if (seq.length) {
    seqT += rdt;
    while (seq.length && seq[0].t <= seqT) seq.shift().fn();
    seq.sort((a, b) => a.t - b.t);
  }
  if (subTimer > 0) { subTimer -= rdt; if (subTimer <= 0) $('#subtitle').classList.remove('on'); }

  if (state === 'race') raceLogic(dt);
  else if (state === 'finish' || state === 'results') raceTime += dt;

  const t = world.time;
  for (const r of racers) {
    if (r.riseT !== undefined) { r.riseT += dt; r.sackRise = 0.32 + ease(clamp(r.riseT / 0.7, 0, 1)) * 0.68; }
    if (state === 'race' || state === 'finish' || state === 'results') {
      r.update(dt, raceTime);
    } else {
      r.animate(dt, t);
      if (state === 'menu' && r === heroRacers[settings.hero]) {
        r.model.hop.position.y = Math.max(0, Math.sin(t * 3.2)) * 0.16;
        const s = Math.sin(t * 3.2);
        if (s < 0 && r._mh > 0) fx.dust(r.x, -r.z, 0.25);
        r._mh = s;
      } else if (state !== 'intro' || r.riseT === undefined) r.model.hop.position.y = 0;
    }
  }
  // bitirdiği halde "air"de kalan YZ'ler bitiş ötesinde durur
  world.update(dt);
  fx.update(dt);
  updateCamera(rdt, t);
  if (state === 'race' || state === 'countdown' || state === 'finish') updateHud();
}

function adaptResolution(dt) {
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT < 2.5) return;
  const fps = fpsN / fpsAcc;
  fpsAcc = 0; fpsN = 0; fpsT = 0;
  const min = 0.75;
  let np = pixelRatio;
  if (fps < 40 && pixelRatio > min) np = Math.max(min, pixelRatio - 0.25);
  else if (fps > 57 && pixelRatio < prMax) np = Math.min(prMax, pixelRatio + 0.125);
  if (np !== pixelRatio) { pixelRatio = np; renderer.setPixelRatio(np); resize(); }
}

// ---------- Çevrimdışı oynanabilirlik ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().catch((e) => {
  console.error(e);
  $('#load-tip').textContent = 'Yükleme başarısız oldu: ' + e.message;
});

// test ve hata ayıklama için: ?test=1 iken simülasyon dışarıdan adım adım ilerletilir
const testMode = new URLSearchParams(location.search).has('test');
let autoBot = false;
window.__game = {
  get state() { return state; }, get player() { return player; }, racers: () => racers, press, startIntro, skipIntro, scene,
  set bot(v) { autoBot = v; },
  shot(px, py, pz, lx, ly, lz, fov = 40) {
    camera.clearViewOffset(); camera.fov = fov; camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); camera.updateProjectionMatrix();
    renderer.render(scene, camera); return renderer.info.render;
  },
  advance(sec, step = 1 / 30, draw = true) { for (let t = 0; t < sec; t += step) tick(step); if (draw) renderer.render(scene, camera); return renderer.info.render; },
};
