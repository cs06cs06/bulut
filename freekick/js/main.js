import { Engine, pickQuality } from './engine.js';
import { loadAssets } from './assets.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { SwipeInput } from './input.js';
import { Game, store } from './game.js';

window.__fkBooted = true;
const ui = new UI();
const $ = (id) => document.getElementById(id);
ui.stage('Başlatılıyor…');

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

async function boot() {
  if (!webglOK()) {
    ui.loadError('Bu tarayıcı WebGL desteklemiyor. Oyunu güncel Chrome, Safari veya Firefox ile açın.');
    return;
  }
  const savedQ = store.get('quality', 'auto');
  const quality = pickQuality(savedQ === 'auto' ? null : savedQ);
  const engine = new Engine($('scene'), quality);
  $('scene').addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ui.loadError('Grafik belleği yetmedi (WebGL bağlamı kayboldu). Menüden Grafik: Düşük seçip sayfayı yenileyin.');
  });

  // never spin forever: after a minute say what is still missing
  let pendingNow = [];
  const slow = setTimeout(() => {
    if (!window.__fkReady) ui.loadError('Yükleme bitmedi. Bekleyen: ' + (pendingNow.join(', ') || 'sahne hazırlığı') + '. Bağlantınızı kontrol edip sayfayı yenileyin.');
  }, 60000);

  let assets;
  try {
    assets = await loadAssets((f, pending) => { pendingNow = pending; ui.progress(f, pending); }, { smallSky: quality.name !== 'high' });
  } catch (e) {
    console.error(e);
    ui.loadError('Oyun dosyaları yüklenemedi (' + (e?.message || e) + '). Sayfayı yenileyin; yerelde açıyorsanız bir web sunucusu kullanın (ör. npx serve).');
    return;
  }
  engine.setEnvironment(assets.hdr, assets.bg);

  const audio = new Audio(assets.audio);
  audio.setMuted(store.get('muted', false));
  const input = new SwipeInput($('touch'), $('swipe'));
  ui.stage('Oyuncular sahaya çıkıyor…');
  await new Promise((r) => requestAnimationFrame(() => r()));
  const game = new Game(engine, assets, audio, ui, input);
  window.__game = game;

  // warm up shaders before revealing the stadium
  ui.stage('Stadyum kuruluyor…');
  await new Promise((r) => requestAnimationFrame(() => r()));
  engine.renderer.compile(engine.scene, engine.camera);
  game.update(1 / 60);
  window.__fkReady = true;
  clearTimeout(slow);
  ui.loaded();
  ui.showMenu(game.best);

  const click = () => audio.play('click', { vol: 0.5, detune: 0 });
  const soundLabel = () => {
    $('btn-menu-sound').textContent = 'Ses: ' + (audio.muted ? 'Kapalı' : 'Açık');
    $('snd-wave').toggleAttribute('hidden', audio.muted);
    $('snd-off').toggleAttribute('hidden', !audio.muted);
  };
  const qNames = { auto: 'Otomatik', high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
  const qLabel = () => { $('btn-quality').textContent = 'Grafik: ' + qNames[store.get('quality', 'auto')]; };
  soundLabel(); qLabel();

  const startMode = async (mode) => { await audio.unlock(); click(); game.start(mode); };
  $('btn-career').addEventListener('click', () => startMode('career'));
  $('btn-practice').addEventListener('click', () => startMode('practice'));
  const toggleSound = async () => { await audio.unlock(); audio.setMuted(!audio.muted); store.set('muted', audio.muted); soundLabel(); click(); };
  $('btn-menu-sound').addEventListener('click', toggleSound);
  $('btn-sound').addEventListener('click', toggleSound);
  $('btn-quality').addEventListener('click', () => {
    const order = ['auto', 'high', 'medium', 'low'];
    const cur = store.get('quality', 'auto');
    const next = order[(order.indexOf(cur) + 1) % order.length];
    store.set('quality', next);
    qLabel();
    // renderer settings (MSAA, shadow size) are fixed at creation: reload to apply
    setTimeout(() => location.reload(), 250);
  });
  const setPause = (on) => {
    if (game.state === 'menu' || game.state === 'over') return;
    game.paused = on;
    ui.pause(on);
    if (audio.ctx) on ? audio.ctx.suspend() : audio.ctx.resume();
  };
  $('btn-pause').addEventListener('click', () => { click(); setPause(true); });
  $('btn-resume').addEventListener('click', () => { click(); setPause(false); });
  $('btn-quit').addEventListener('click', () => { click(); game.paused = false; ui.pause(false); audio.ctx?.resume(); game.toMenu(); });
  $('btn-again').addEventListener('click', () => { click(); game.start(game.mode); });
  $('btn-menu').addEventListener('click', () => { click(); game.toMenu(); });
  $('btn-skip').addEventListener('click', () => { click(); game.stopReplay(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p') setPause(!game.paused);
    if (e.key === ' ' && game.state === 'replay') game.stopReplay();
  });
  // any first touch unlocks audio on iOS
  addEventListener('pointerdown', () => audio.unlock(), { once: true });

  // ?warp=N (testing): N fixed simulation steps per rendered frame
  const warp = Math.max(1, Math.min(20, parseInt(new URLSearchParams(location.search).get('warp') || '1', 10) || 1));
  let last = performance.now();
  const loop = (now) => {
    const dt = warp > 1 ? 1 / 30 : Math.min(0.1, (now - last) / 1000);
    last = now;
    for (let i = 1; i < warp; i++) { game.skipRender = true; game.update(dt); }
    game.skipRender = false;
    game.update(dt);
    engine.trackPerformance(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  ui.loadError('Oyun başlatılamadı: ' + (e?.message || e));
});
