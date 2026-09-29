import * as THREE from 'three';
import { UI } from './ui.js';
import { AudioManager } from './audio.js';
import { World } from './world.js';
import { PostFX, QUALITY } from './fx.js';
import { loadCharacterBase } from './character.js';
import { loadBallMesh } from './ball.js';
import { Game, DIFFICULTY } from './game.js';

const TIPS = [
  'İPUCU: Sarı bölgede bırakılan şut hem sert hem isabetlidir; çok sert vurursan top üstten gider.',
  'İPUCU: Falso (Q / E) kaleciyi yanıltır ama topu köşeden uzaklaştırabilir.',
  'İPUCU: Kalecilikte kaleye vuruş anına yakın tıkla; erken atlarsan yerde kalırsın.',
  'İPUCU: Gerilim arttıkça nişan halkası titrer. Nefes al, doğru anı bekle.',
  'İPUCU: Tekrarı geçmek için BOŞLUK ya da tıklamak yeterli.',
];
const LS = 'penalti.settings.v1';
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer:coarse)').matches);

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { }
  return {
    difficulty: s.difficulty || 'normal',
    quality: s.quality || (isMobile ? 'medium' : 'high'),
    sound: s.sound !== false,
    replay: s.replay !== false,
    autoScale: true, renderScale: 1, maxScale: 1,
  };
}
function saveSettings(s) { try { localStorage.setItem(LS, JSON.stringify({ difficulty: s.difficulty, quality: s.quality, sound: s.sound, replay: s.replay })); } catch (e) { } }

async function boot() {
  const ui = new UI();
  ui.setTip(TIPS[Math.floor(Math.random() * TIPS.length)]);
  const settings = loadSettings();
  const canvas = document.getElementById('game');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  } catch (e) { throw new Error('WebGL2 desteklenmiyor. Lütfen güncel bir tarayıcı kullanın.'); }
  if (!renderer.capabilities.isWebGL2) throw new Error('Bu oyun WebGL2 gerektirir.');
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x02040a, 1);
  const q = QUALITY[settings.quality];
  settings.maxScale = q.scale; settings.renderScale = Math.min(q.scale, isMobile ? 0.8 : q.scale);

  ui.setLoad(0.03, 'Yazı tipleri…');
  try { await Promise.all([document.fonts.load('800 60px "Barlow Condensed"'), document.fonts.load('600 60px "Barlow Condensed"'), document.fonts.load('500 20px "Barlow"')]); } catch (e) { }

  const audio = new AudioManager();
  let audioP = audio.load().catch(e => console.warn('audio', e));

  ui.setLoad(0.08, 'Oyuncular ve kaleci hazırlanıyor…');
  const base = await loadCharacterBase();
  ui.setLoad(0.30, 'Stadyum kuruluyor…');
  const world = new World(renderer, settings.quality);
  await world.load(p => ui.setLoad(0.30 + p * 0.45, 'Stadyum kuruluyor…'));
  ui.setLoad(0.78, 'Top ve efektler…');
  const ballMesh = await loadBallMesh();
  const fx = new PostFX(renderer, settings.quality);

  const setSound = (on) => { settings.sound = on; audio.setEnabled(on); ui.el.btnSound.innerHTML = `SES: <b>${on ? 'AÇIK' : 'KAPALI'}</b>`; saveSettings(settings); };
  settings.setSound = setSound;

  ui.setLoad(0.86, 'Karakterler kitleniyor…');
  await new Promise(r => setTimeout(r, 30));
  const game = new Game({ renderer, world, fx, audio, ui, base, ballMesh, settings, canvas });
  window.__game = game;
  game.onResize();
  window.addEventListener('resize', () => game.onResize());
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.phase !== 'menu' && !game.paused) game.togglePause(); });

  // prepare a couple of frames so all shaders are compiled before the first reveal
  ui.setLoad(0.92, 'Gölgeler ve ışıklar derleniyor…');
  game.enterMenu();
  for (let i = 0; i < 3; i++) { game.frame(1 / 60); game.render(1 / 60); await new Promise(r => setTimeout(r, 16)); }
  try { renderer.compile(world.scene, game.camera); } catch (e) { }
  await audioP;
  ui.setLoad(1, 'Hazır!');

  const applyQuality = (name) => {
    settings.quality = name; const qq = QUALITY[name];
    fx.setQuality(name);
    settings.maxScale = qq.scale; settings.renderScale = Math.min(qq.scale, isMobile ? 0.8 : qq.scale);
    world.applyQuality(name);
    game.onResize();
    ui.el.btnQuality.innerHTML = `GRAFİK: <b>${{ low: 'DÜŞÜK', medium: 'ORTA', high: 'YÜKSEK', ultra: 'ULTRA' }[name]}</b>`;
    saveSettings(settings);
  };
  const refreshMenu = () => {
    ui.el.btnDiff.innerHTML = `ZORLUK: <b>${DIFFICULTY[settings.difficulty].name}</b>`;
    ui.el.btnQuality.innerHTML = `GRAFİK: <b>${{ low: 'DÜŞÜK', medium: 'ORTA', high: 'YÜKSEK', ultra: 'ULTRA' }[settings.quality]}</b>`;
    ui.el.btnSound.innerHTML = `SES: <b>${settings.sound ? 'AÇIK' : 'KAPALI'}</b>`;
  };
  refreshMenu();
  audio.setEnabled(settings.sound);

  ui.el.btnPlay.onclick = async () => { await audio.unlock(); game.startMatch(); };
  ui.el.btnDiff.onclick = () => { const k = Object.keys(DIFFICULTY); settings.difficulty = k[(k.indexOf(settings.difficulty) + 1) % k.length]; refreshMenu(); saveSettings(settings); audio.tick(); };
  ui.el.btnQuality.onclick = () => { const k = ['low', 'medium', 'high', 'ultra']; applyQuality(k[(k.indexOf(settings.quality) + 1) % k.length]); audio.tick(); };
  ui.el.btnSound.onclick = () => { audio.unlock(); setSound(!settings.sound); };
  ui.el.btnHow.onclick = () => { ui.show('how'); };
  ui.el.btnHowClose.onclick = () => ui.hide('how');
  ui.el.btnAgain.onclick = () => { ui.hide('end'); game.startMatch(); };
  ui.el.btnMenu.onclick = () => { ui.hide('end'); ui.hide('pause'); game.paused = false; audio.ctx && audio.ctx.resume(); ui.show('menu'); game.enterMenu(); };
  ui.el.btnResume.onclick = () => game.togglePause();
  ui.el.btnPauseMenu.onclick = () => { ui.hide('pause'); game.paused = false; audio.ctx && audio.ctx.resume(); ui.show('menu'); game.enterMenu(); };
  ui.el.btnPause.onclick = (e) => { e.stopPropagation(); game.togglePause(); };
  ui.el.btnPause.addEventListener('pointerdown', e => e.stopPropagation());

  await new Promise(r => setTimeout(r, 250));
  ui.hide('loading'); ui.show('menu');

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    game.frame(dt);
    game.render(dt);
  });
  window.__ready = true;
}

boot().catch(err => {
  console.error(err);
  const ui = document.getElementById('fatalText'); if (ui) ui.textContent = String(err && err.message || err);
  document.getElementById('loading').classList.add('hidden'); document.getElementById('fatal').classList.remove('hidden');
});
