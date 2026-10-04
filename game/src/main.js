import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RenderSystem } from './core/renderer.js';
import { Input } from './core/input.js';
import { AudioSystem, SFX_FILES } from './core/audio.js';
import { Terrain } from './world/terrain.js';
import { ModelLibrary } from './world/models.js';
import { World } from './world/world.js';
import { GroundCover } from './world/grass.js';
import { Weather } from './world/weather.js';
import * as LAYOUT from './world/layout.js';
import { Vehicle, VEHICLES, UPGRADES } from './game/vehicle.js';
import { Progress, ACHIEVEMENTS, DAILY_POOL } from './game/progress.js';
import { Delivery } from './game/delivery.js';
import { StuntZones } from './game/stunts.js';
import { Traffic } from './game/traffic.js';
import { CameraRig } from './game/cameraRig.js';
import { Dust, TireTracks } from './game/effects.js';
import { Gameplay } from './game/gameplay.js';
import { HUD } from './ui/hud.js';
import { creditsHTML } from './credits.js';

const MODELS = ['pickup', 'suv', 'monster', 'van', 'truck', 'tractor', 'barn', 'barn_big', 'barn_small', 'barn_open', 'silo', 'silo_house', 'windmill', 'water_tower', 'chicken_coop', 'well',
  'fence', 'fence2', 'farm_barn', 'cistern', 'mailbox', 'hay_round', 'hay_cube', 'cart', 'barrel', 'pond', 'haybale', 'crate_pumpkin', 'pumpkin',
  'farmhouse_a', 'farmhouse_e', 'farmhouse_g', 'farmhouse_h', 'farmhouse_r', 'flag', 'sign', 'arrow', 'billboard',
  'tree_1', 'tree_2', 'tree_3', 'tree_4', 'tree_5', 'pine_1', 'pine_2', 'pine_3', 'dead_1', 'dead_2', 'birch_1', 'maple_1', 'bush', 'bush_flowers',
  'grass_short', 'grass_tall', 'grass_wispy', 'flower_3', 'flower_4', 'fern', 'rock_1', 'rock_2', 'rock_3',
  'cow', 'bull', 'horse', 'horse_white', 'donkey', 'alpaca', 'deer', 'chicken'];

const TIPS = [
  'İpucu: Boşluk tuşu ile el frenini çekip toprak yolda drift yapabilirsin.',
  'İpucu: Spiral yol seni Steptoe Zirvesi’ne çıkarır — oradan tüm Palouse görünür.',
  'İpucu: Ters döndün mü? R tuşu aracı düzeltir.',
  'İpucu: Haritada keşfettiğin noktalara ışınlanabilirsin.',
  'İpucu: Saman balyalarına çarp, uçuşlarını izle.',
  'İpucu: Bayrakların yanında F’ye basarak zamana karşı görevleri başlat.',
  'İpucu: Çiftliklerdeki sarı ışıklı ilan panolarından teslimat işi al, yükü düşürmeden götür.',
  'İpucu: Kazandığın parayla Garaj’dan motor, lastik ve süspansiyon geliştir.',
  'İpucu: Uzun atlayışlar ve driftler para kazandırır.',
  'İpucu: Gece modunda farlarını L tuşuyla açıp kapatabilirsin.',
];
const FIXED = 1 / 60;
const MANUAL = new URLSearchParams(location.search).has('manual'); // test hook: frames advanced by window.__advance
// phones/tablets: lighter terrain grid, sparser vegetation, touch UI
const MOBILE = new URLSearchParams(location.search).has('mobile') || (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
const SPAWN = { x: 431, z: 338, heading: Math.PI };
const SETTINGS_KEY = 'tozlu-yollar-settings-v1';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

class Game {
  constructor() {
    this.state = 'loading';
    this.rs = new RenderSystem($('game'));
    this.input = new Input();
    this.hud = new HUD();
    this.settings = this._loadSettings();
    this.clock = new THREE.Clock();
    this.acc = 0; this.time = 0;
    this.impactCooldown = 0;
    this.progress = new Progress();
    this.drift = { t: 0, grace: 0 };
    this.photo = { dist: 9, fov: 50 };
    this.air = { clear: 0 };
    $('credits').innerHTML = creditsHTML();
    let ti = Math.floor(Math.random() * TIPS.length);
    $('load-tip').textContent = TIPS[ti];
    this._tipTimer = setInterval(() => { ti = (ti + 1) % TIPS.length; $('load-tip').textContent = TIPS[ti]; }, 4500);
  }

  _loadSettings() {
    const def = { quality: 'high', master: 0.9, music: 0.5, sfx: 0.9, amb: 0.7, units: 'kmh', time: 'noon', paint: 'green', weather: 'dynamic' };
    if (MOBILE) def.quality = 'low';
    try { return Object.assign(def, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { return def; }
  }
  _saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ } }

  loadProgress(p, text) {
    $('load-bar').style.width = `${Math.round(p * 100)}%`;
    if (text) $('load-text').textContent = text;
  }

  async load() {
    const gltfLoader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    const tasks = [];
    let done = 0;
    const track = (p, w = 1) => { tasks.push({ p, w }); return p.then((v) => { done += w; this.loadProgress(0.75 * done / totalW(), 'Varlıklar indiriliyor…'); return v; }); };
    const totalW = () => tasks.reduce((s, t) => s + t.w, 0);

    const physicsP = track(RAPIER.init(), 2);
    this.audio = new AudioSystem();
    const lib = new ModelLibrary();
    const modelPs = MODELS.map((n) => track(gltfLoader.loadAsync(`assets/models/${n}.glb`).then((g) => lib.add(n, g)), 1));
    const tex = {};
    const texP = (name, file, srgb = true, repeat = true) => track(texLoader.loadAsync(file).then((t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
      tex[name] = t;
    }), 1);
    const texPs = [
      texP('grass', 'assets/textures/grass.jpg'), texP('grass_n', 'assets/textures/grass_n.jpg', false), texP('dirt', 'assets/textures/dirt.jpg'),
      texP('dirt_n', 'assets/textures/dirt_n.jpg', false), texP('rock', 'assets/textures/rock.jpg'), texP('rock_n', 'assets/textures/rock_n.jpg', false),
      texP('smoke', 'assets/particles/smoke_04.png', true, false), texP('debris', 'assets/particles/dirt_01.png', true, false),
      texP('star', 'assets/particles/star_06.png', true, false), texP('glow', 'assets/particles/circle_05.png', true, false),
      texP('skid', 'assets/particles/skidmark.png', true, false), texP('streak', 'assets/particles/trace_01.png', true, false), texP('sky', 'assets/sky/sky_4k.jpg', true, false),
      texP('skySunset', 'assets/sky/sunset_4k.jpg', true, false), texP('skyNight', 'assets/sky/night_4k.jpg', true, false), texP('skyStorm', 'assets/sky/storm_4k.jpg', true, false),
    ];
    const hdrP = track(Promise.all(['sky', 'sunset', 'night'].map((n) => new HDRLoader().loadAsync(`assets/sky/${n}_1k.hdr`))), 4);
    const metaP = track(fetch('assets/terrain/terrain.json').then((r) => r.json()), 1);
    const hP = track(fetch('assets/terrain/height.bin').then((r) => r.arrayBuffer()), 3);
    const hoP = track(fetch('assets/terrain/height_outer.bin').then((r) => r.arrayBuffer()), 1);
    // Ogg Vorbis where supported (gapless loops), AAC fallback for older Safari/iOS
    const ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
    const audioPs = SFX_FILES.map((n) => track(this.audio.load(n, `assets/audio/${n}.${ext}`).catch((e) => console.warn('audio', n, e)), 0.5));

    await Promise.all([physicsP, ...modelPs, ...texPs, hdrP, metaP, hP, hoP, ...audioPs]);
    const [meta, hBuf, hoBuf, hdr] = await Promise.all([metaP, hP, hoP, hdrP]);
    this.lib = lib; this.tex = tex;

    this.loadProgress(0.78, 'Palouse tepeleri şekilleniyor…');
    await nextFrame();
    const rs = this.rs;
    rs.setupLighting({ noon: { sky: tex.sky, hdr: hdr[0] }, sunset: { sky: tex.skySunset, hdr: hdr[1] }, night: { sky: tex.skyNight, hdr: hdr[2] } }, tex.skyStorm);
    const roads = LAYOUT.ROADS.map((r) => ({ ...r }));
    const layout = { jumps: LAYOUT.JUMPS, roads, farmyards: LAYOUT.FARMS.map((f) => ({ x: f.x, z: f.z, r: f.r })), flatten: [
      ...LAYOUT.FARMS.map((f) => ({ x: f.x, z: f.z, r: f.r * 0.75, falloff: 30 })),
      ...LAYOUT.POI_FLATTEN.map(([id, r]) => { const p = LAYOUT.POIS.find((pp) => pp.id === id); return { x: p.x, z: p.z, r, falloff: 12 }; }),
    ] };
    let tm = performance.now();
    const mark = (label) => { const n = performance.now(); console.info(`[load] ${label}: ${(n - tm).toFixed(0)} ms`); tm = n; };
    this.terrain = new Terrain({ meta, inner: new Uint16Array(hBuf), outer: new Uint16Array(hoBuf), layout, textures: tex, resolution: MOBILE ? 1025 : 2049 });
    rs.scene.add(this.terrain.group);
    mark('terrain');

    this.loadProgress(0.86, 'Fizik dünyası kuruluyor…');
    await nextFrame();
    this.physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.physics.timestep = FIXED;
    this.events = new RAPIER.EventQueue(true);
    this.terrain.createCollider(RAPIER, this.physics);

    this.loadProgress(0.9, 'Çiftlikler ve ağaçlar yerleştiriliyor…');
    await nextFrame();
    this.world = new World({ scene: rs.scene, terrain: this.terrain, lib, RAPIER, physics: this.physics, renderer: rs.renderer, sunDir: rs.sunDir, density: MOBILE ? 0.55 : 1 });
    this.world.build();
    mark('world');
    this.grass = new GroundCover({ lib, terrain: this.terrain, scene: rs.scene, quality: 'high' });
    this.weather = new Weather({ scene: rs.scene, rs, terrain: this.terrain, audio: this.audio, streakTex: tex.streak, count: MOBILE ? 3000 : 7000 });

    this.loadProgress(0.95, 'Pikap hazırlanıyor…');
    await nextFrame();
    // snap the spawn onto the nearest road sample
    let bestD = Infinity, best = null;
    for (const r of this.terrain.roads.roads) for (const p of r.points) {
      const d = Math.hypot(p[0] - SPAWN.x, p[1] - SPAWN.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    SPAWN.x = best[0]; SPAWN.z = best[1];
    const sy = this.terrain.heightAt(SPAWN.x, SPAWN.z) + 1.2;
    this.RAPIER = RAPIER;
    if (!this.progress.data.owned.includes(this.progress.data.current)) this.progress.data.current = 'pickup';
    this.spawnVehicle(this.progress.data.current, { x: SPAWN.x, y: sy, z: SPAWN.z }, SPAWN.heading);
    this.cameraRig = new CameraRig(rs.camera, $('game'));
    this.dust = new Dust(rs.scene, { smoke: tex.smoke, dirt: tex.debris });
    this.tracks = new TireTracks(rs.scene, tex.skid);
    this.gameplay = new Gameplay({ scene: rs.scene, terrain: this.terrain, lib, tex, hud: this.hud, audio: this.audio, roads: this.terrain.roads });
    this.delivery = new Delivery({ scene: rs.scene, physics: this.physics, RAPIER, lib, terrain: this.terrain, hud: this.hud, audio: this.audio, progress: this.progress, glowTex: tex.glow });
    this.hud.boards = this.delivery.boards;
    this.stunts = new StuntZones({ scene: rs.scene, lib, terrain: this.terrain, hud: this.hud, progress: this.progress, audio: this.audio, glowTex: tex.glow });
    this.hud.stuntZones = this.stunts;
    this.traffic = new Traffic({ scene: rs.scene, lib, terrain: this.terrain, physics: this.physics, RAPIER, audio: this.audio });
    this._wireProgress();
    mark('vehicle+gameplay');
    this.hud.buildMap(this.terrain);
    mark('map');
    this.hud.updateCounts(this.gameplay);
    this.audio.onTrack = (t) => this.hud.nowPlaying(t);

    this.applySettings();
    this.loadProgress(0.98, 'Gölgeler ve ışık hazırlanıyor…');
    await nextFrame();
    this.terrain.update(this.vehicle.position, true);
    this.grass.update(this.vehicle.position);
    this.vehicle.sync(1);
    this._menuCamera(0);
    await rs.renderer.compileAsync(rs.scene, rs.camera).catch(() => {});
    rs.render(0.016);
    this.loadProgress(1, 'Hazır!');
    clearInterval(this._tipTimer);
    window.__game = this;
    this._bindUI();
    this.state = 'menu';
    $('loading').classList.add('fade-out');
    setTimeout(() => $('loading').classList.add('hidden'), 1000);
    $('menu').classList.remove('hidden');
    addEventListener('resize', () => { rs.resize(); this.dust.setViewport(innerHeight * rs.renderer.getPixelRatio(), rs.camera.fov); });
    this.dust.setViewport(innerHeight * rs.renderer.getPixelRatio(), rs.camera.fov);
    this.clock.getDelta();
    if (MANUAL) {
      window.__dbg = () => { const v = this.vehicle; return [+(v.speed * 3.6).toFixed(1), v.gear, Math.round(v.rpm), v.contacts, v.wheelState.map((w) => w.surface[0] + (w.contact ? 1 : 0)).join(''), +v.throttle.toFixed(2), +v.shiftTimer.toFixed(2), v.position.toArray().map((a) => +a.toFixed(1))]; };
      window.__perf = () => { const r = this.rs.renderer; r.info.autoReset = false; r.info.reset(); this.rs.render(0.016); const i = { calls: r.info.render.calls, tris: r.info.render.triangles }; r.info.autoReset = true; return i; };
      window.__perfBreakdown = () => {
        const counts = {};
        const key = (o) => { let k = o, path = []; while (k && k.parent && k.parent !== this.rs.scene) { path.unshift(k.name); k = k.parent; } return (k?.name || '?') + '/' + (path[0] || '').replace(/_-?\d+:-?\d+$/, ''); };
        this.rs.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite) { const kk = key(o); o.onBeforeRender = () => { counts[kk] = (counts[kk] || 0) + 1; }; } });
        this.rs.render(0.016);
        this.rs.scene.traverse((o) => { if (o.onBeforeRender) o.onBeforeRender = () => {}; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25);
      };
      window.__advance = (secs, dt = 1 / 30) => { const n = Math.max(1, Math.round(secs / dt)); for (let i = 0; i < n; i++) this.loop(dt, i < n - 1); };
      this.loop(1 / 30);
    } else this.loop();
  }

  // ------------------------------------------------------------ garage / progression
  spawnVehicle(id, pos, heading) {
    const spec = VEHICLES[id] || VEHICLES.pickup;
    const keepDirt = this.vehicle?.dirt || 0;
    if (this.vehicle) this.vehicle.dispose(this.rs.scene);
    this.vehicle = new Vehicle({ RAPIER: this.RAPIER, world: this.physics, model: this.lib.gltf[spec.model].scene, spawn: pos, heading,
      config: { ...spec }, upgrades: this.progress.data.upgrades });
    this.vehicle.id = id;
    this.vehicle.dirt = keepDirt;
    this.rs.scene.add(this.vehicle.object);
    this.vehicle.onShift = () => this.audio.play('gear', { volume: 0.25 });
    this.vehicle.setPaint(this.settings.paint);
    this.vehicle.setHeadlights(!!this.headlights);
    this.vehicle.sync(1);
    if (this.delivery?.job) { this.delivery.cancel(); this.hud.toast('Teslimat iptal edildi', 'Araç değişti', 'Yeni bir iş için ilan panosuna uğra.'); }
    if (this.cameraRig) this.cameraRig.initialized = false;
  }

  _respawnSame() {
    const v = this.vehicle, p = v.body.translation();
    this.spawnVehicle(v.id, { x: p.x, y: this.terrain.heightAt(p.x, p.z) + 1.3, z: p.z }, v.heading());
    this.delivery.cancel();
  }

  _wireProgress() {
    const P = this.progress, hud = this.hud;
    hud.setMoney(P.money);
    P.onChange = () => { hud.setMoney(P.money); if (!$('overlay').classList.contains('hidden')) this._renderGarage(); };
    P.onAchievement = (a) => {
      hud.toast('Başarım Açıldı', a.name, `${a.desc} · +$${a.reward}`);
      this.audio.play('discover', { bus: 'ui', volume: 0.9, rate: 1.2 });
    };
    this.gameplay.onDiscover = () => { P.addMoney(100); hud.popup('+$100 <small>keşif</small>'); };
    this.gameplay.onCollect = () => { P.addMoney(50); hud.popup('+$50 <small>balkabağı</small>'); };
    this.gameplay.onChallengeDone = (c, t, medal) => {
      const order = { bronze: 1, silver: 2, gold: 3 }, pay = { bronze: 200, silver: 400, gold: 700 };
      const medals = P.data.medals || (P.data.medals = {});
      const prev = medals[c.id];
      let money = 60;
      if (medal && (!prev || order[medal] > order[prev])) {
        money = pay[medal] - (prev ? pay[prev] : 0);
        medals[c.id] = medal;
        if (medal === 'gold') P.stat('golds', 1);
      }
      P.addMoney(money);
      P.daily('race');
      hud.popup(`+$${money} <small>${c.name}</small>`);
    };
    this.world.onAnimalScared = () => P.stat('scared', 1);
    P.onDaily = (def, t, bonus) => {
      if (bonus) { hud.toast('Günlük Görevler Tamam', '+$500', 'Bugünün tüm görevlerini bitirdin. Yarın yenileri gelecek!'); }
      else hud.popup(`GÜNLÜK: ${def.name} ✓ <small>+$${def.reward}</small>`);
      this.audio.play('discover', { bus: 'ui', volume: 0.6, rate: 1.3 });
    };
  }

  _renderGarage() {
    const P = this.progress, d = P.data;
    $('g-money').textContent = '$' + d.money.toLocaleString('tr-TR');
    const vEl = $('g-vehicles');
    vEl.innerHTML = '';
    for (const [id, v] of Object.entries(VEHICLES)) {
      const owned = d.owned.includes(id), cur = this.vehicle.id === id;
      const div = document.createElement('div');
      div.className = 'veh' + (cur ? ' current' : '');
      const bar = (x) => `<span class="bar5"><i style="width:${Math.min(100, x * 100)}%"></i></span>`;
      div.innerHTML = `<div class="vn">${v.name}</div><div class="vd">${v.desc}</div>
        <div class="vs"><span>Güç</span>${bar(v.power / 1.7)}<span>Tutuş</span>${bar(v.grip / 1.2)}<span>Arazi</span>${bar(v.suspensionTravel / 0.75)}<span>Kasa</span><span>${v.bed ? 'Var' : 'Yok'}</span></div>`;
      const b = document.createElement('button');
      b.className = 'btn' + (owned ? '' : ' primary');
      b.textContent = cur ? 'Kullanılıyor' : owned ? 'Seç' : `Satın al · $${v.price.toLocaleString('tr-TR')}`;
      b.disabled = cur || (!owned && d.money < v.price);
      b.onclick = () => {
        if (!owned) { if (!P.spend(v.price)) return; d.owned.push(id); P.save(); this.audio.play('discover', { bus: 'ui', volume: 0.7 }); }
        d.current = id; P.save();
        const p = this.vehicle.body.translation();
        this.spawnVehicle(id, { x: p.x, y: this.terrain.heightAt(p.x, p.z) + 1.5, z: p.z }, this.vehicle.heading());
        this._renderGarage();
      };
      div.appendChild(b);
      vEl.appendChild(div);
    }
    const wash = document.createElement('div');
    wash.className = 'upg';
    wash.innerHTML = `<div><div class="un">Araç yıkama</div><div class="ud">Çamur: %${Math.round(this.vehicle.dirt * 100)} · Söğüt Göleti’nden geçmek bedava!</div></div><div></div>`;
    const wb = document.createElement('button'); wb.className = 'btn'; wb.textContent = 'Yıka · $25';
    wb.disabled = this.vehicle.dirt < 0.05 || d.money < 25;
    wb.onclick = () => { if (!P.spend(25)) return; this.vehicle.dirt = 0; this.vehicle.setDirt(0); this.audio.play('ui_switch', { bus: 'ui' }); this._renderGarage(); };
    wash.appendChild(wb);
    const uEl = $('g-upgrades');
    uEl.innerHTML = '';
    for (const [key, u] of Object.entries(UPGRADES)) {
      const lvl = d.upgrades[key] || 0, price = u.prices[lvl];
      const div = document.createElement('div');
      div.className = 'upg';
      div.innerHTML = `<div><div class="un">${u.name}</div><div class="ud">${u.desc}</div></div><div class="pips">${u.prices.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>`;
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = price ? `Geliştir · $${price.toLocaleString('tr-TR')}` : 'Maksimum';
      b.disabled = !price || d.money < price;
      b.onclick = () => {
        if (!P.spend(price)) return;
        d.upgrades[key] = lvl + 1; P.save();
        this.audio.play('ui_switch', { bus: 'ui', volume: 0.8 });
        this._respawnSame();
        this._renderGarage();
      };
      div.appendChild(b);
      uEl.appendChild(div);
    }
    uEl.appendChild(wash);
  }

  _renderAchievements() {
    const P = this.progress, st = P.stats;
    const stats = [
      ['$' + st.earned.toLocaleString('tr-TR'), 'Toplam kazanç'], [st.deliveries, 'Teslimat'], [st.perfect, 'Hasarsız teslimat'],
      [(st.distance / 1000).toFixed(1) + ' km', 'Toplam yol'], [Math.round(st.topSpeed) + ' km/sa', 'En yüksek hız'], [st.maxAir.toFixed(1) + ' sn', 'En uzun uçuş'],
      [st.maxDrift.toFixed(1) + ' sn', 'En uzun drift'], [st.fences, 'Devrilen çit'], [st.scared, 'Ürkütülen hayvan'],
    ];
    const d = P.dailyTasks;
    $('g-daily').innerHTML = `<h3>Günlük Görevler</h3>` + d.tasks.map((t) => {
      const def = DAILY_POOL.find((x) => x.id === t.id);
      const v = def.scale ? t.value.toFixed(1) : Math.floor(t.value);
      return `<div class="daily ${t.done ? 'on' : ''}"><div class="ai">${t.done ? '✓' : '○'}</div><div><div class="an">${def.name}</div>
        <div class="bar5"><i style="width:${Math.min(100, t.value / t.goal * 100)}%"></i></div></div><div class="ar">${v}/${t.goal}${def.unit ? ' ' + def.unit : ''} · $${def.reward}</div></div>`;
    }).join('') + `<div class="muted">Hepsini bitirirsen +$500 bonus${d.bonus ? ' (alındı)' : ''}. Görevler her gün yenilenir.</div>`;
    $('g-stats').innerHTML = stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
    $('g-ach').innerHTML = ACHIEVEMENTS.map((a) => {
      const on = P.data.achievements.includes(a.id);
      return `<div class="ach ${on ? 'on' : ''}"><div class="ai">${on ? '★' : '☆'}</div><div><div class="an">${a.name}</div><div class="ad">${a.desc}</div></div><div class="ar">$${a.reward}</div></div>`;
    }).join('') + `<div class="muted">${P.data.achievements.length} / ${ACHIEVEMENTS.length} başarım</div>`;
  }

  // ------------------------------------------------------------ waypoint
  setWaypoint(p) {
    this.waypoint = p;
    this.hud.waypoint = p;
    if (!this.wpBeacon) {
      const mat = new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xb6ff9a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
      this.wpBeacon = new THREE.Group();
      for (let i = 0; i < 7; i++) { const sp = new THREE.Sprite(mat); sp.scale.setScalar(5 - i * 0.45); sp.position.y = 2 + i * 8; this.wpBeacon.add(sp); }
      this.rs.scene.add(this.wpBeacon);
    }
    this.wpBeacon.visible = !!p;
    if (p) this.wpBeacon.position.set(p[0], this.terrain.heightAt(p[0], p[1]), p[1]);
  }

  // ------------------------------------------------------------ job board
  openBoard(board) {
    this.state = 'board';
    this._board = board;
    $('board').classList.remove('hidden');
    $('board-title').textContent = `İş İlanları · ${board.farm.name}`;
    $('board-msg').textContent = '';
    const list = $('board-list');
    list.innerHTML = '';
    const D = this.delivery;
    if (D.job) {
      const j = D.job;
      const div = document.createElement('div');
      div.className = 'job active';
      div.innerHTML = `<div class="ji">${j.cargo.icon}</div><div><div class="jt">Aktif iş: ${j.cargo.name} → ${j.dest.farm.name}</div><div class="jd">Yük ${D.kept}/${j.total} · ödül $${j.reward}</div></div>`;
      const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'İptal et';
      b.onclick = () => { D.cancel(); this.audio.play('ui_click', { bus: 'ui' }); this.openBoard(board); };
      div.appendChild(b); list.appendChild(div);
    } else {
      for (const o of D.offers(board)) {
        const div = document.createElement('div');
        div.className = 'job';
        div.innerHTML = `<div class="ji">${o.cargo.icon}</div><div><div class="jt">${o.cargo.count} × ${o.cargo.name} → ${o.dest.farm.name}</div>
          <div class="jd">${(o.dist / 1000).toFixed(1)} km · bonus süresi ${Math.floor(o.limit / 60)}:${String(Math.round(o.limit % 60)).padStart(2, '0')}</div></div>`;
        const right = document.createElement('div');
        right.innerHTML = `<div class="pay">$${o.reward}</div>`;
        const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = 'Kabul et';
        b.onclick = () => {
          const err = D.accept(o, this.vehicle);
          if (err) { $('board-msg').textContent = err; this.audio.play('ui_click', { bus: 'ui', rate: 0.7 }); return; }
          this.closeBoard();
          this.hud.toast('Yük bindi', `${o.cargo.count} × ${o.cargo.name}`, `${o.dest.farm.name} çiftliğine götür. Yavaş git, yük düşmesin!`);
        };
        right.appendChild(b); div.appendChild(right); list.appendChild(div);
      }
    }
  }

  closeBoard() {
    $('board').classList.add('hidden');
    if (this.state === 'board') this.state = 'play';
    this.clock.getDelta();
  }

  // ------------------------------------------------------------ photo mode
  enterPhoto() {
    this.state = 'photo';
    this.hud.show(false);
    $('touch').classList.add('hidden');
    $('photo').classList.remove('hidden');
    this.cameraRig.orbitPitch = 0.15;
    this.photo = { dist: +$('ph-dist').value, fov: +$('ph-fov').value };
  }

  exitPhoto() {
    $('photo').classList.add('hidden');
    $('game').style.filter = '';
    this.hud.show(true);
    $('touch').classList.toggle('hidden', !this.input.touchEnabled);
    this.state = 'play';
    this.cameraRig.initialized = false;
    this.clock.getDelta();
  }

  takePhoto() {
    this.rs.render(0.016);
    const src = this.rs.renderer.domElement;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    const f = $('ph-filter').value;
    if (f !== 'none') x.filter = f;
    x.drawImage(src, 0, 0);
    x.filter = 'none';
    x.font = `700 ${Math.round(c.height * 0.028)}px Rye, serif`; x.fillStyle = 'rgba(246,234,210,0.85)'; x.textAlign = 'right';
    x.fillText('Tozlu Yollar', c.width - c.height * 0.03, c.height * 0.965);
    c.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tozlu-yollar-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
    const fl = document.createElement('div'); fl.className = 'photo-flash'; document.body.appendChild(fl); setTimeout(() => fl.remove(), 600);
    this.audio.play('ui_click', { bus: 'ui', volume: 1, rate: 0.6 });
  }

  applySettings() {
    const s = this.settings;
    this.rs.setQuality(s.quality);
    this.grass.setQuality(s.quality);
    this.world.setQuality(s.quality);
    Object.assign(this.audio.volumes, { master: s.master, music: s.music, sfx: s.sfx, amb: s.amb });
    this.audio.applyVolumes();
    this.hud.units = s.units;
    if (this.rs.timeOfDay !== s.time) {
      this.rs.setTimeOfDay(s.time);
      this.world.impostors.material.uniforms.uTint.value.copy(this.rs.impostorTint);
      this.headlights = this.rs.isNight;
      this.vehicle.setHeadlights(this.headlights);
    }
    this.vehicle.setPaint(s.paint);
    if (this.weather.mode !== s.weather) this.weather.setMode(s.weather);
    $('speed-unit').textContent = s.units === 'mph' ? 'mph' : 'km/sa';
    this.dust?.setViewport(innerHeight * this.rs.renderer.getPixelRatio(), this.rs.camera.fov);
  }

  _bindUI() {
    const click = () => this.audio.play('ui_click', { bus: 'ui', volume: 0.7 });
    document.querySelectorAll('.btn, .tab').forEach((b) => b.addEventListener('mouseenter', () => this.audio.play('ui_hover', { bus: 'ui', volume: 0.35 })));
    document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
      this.audio.resume(); click();
      const a = b.dataset.action;
      if (a === 'play') this.startPlay();
      else if (a === 'resume') this.resume();
      else if (a === 'menu') this.toMenu();
      else if (['settings', 'controls', 'credits'].includes(a)) this.openOverlay(a, true);
    }));
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { click(); this._tab(t.dataset.tab); }));
    const bindRange = (id, key) => { const el = $(id); el.value = this.settings[key]; el.addEventListener('input', () => { this.settings[key] = +el.value; this.applySettings(); this._saveSettings(); }); };
    bindRange('set-master', 'master'); bindRange('set-music', 'music'); bindRange('set-sfx', 'sfx'); bindRange('set-amb', 'amb');
    const q = $('set-quality'); q.value = this.settings.quality;
    q.addEventListener('change', () => { this.settings.quality = q.value; this.applySettings(); this._saveSettings(); });
    const u = $('set-units'); u.value = this.settings.units;
    u.addEventListener('change', () => { this.settings.units = u.value; this.applySettings(); this._saveSettings(); });
    const wx = $('set-weather'); wx.value = this.settings.weather;
    wx.addEventListener('change', () => { this.settings.weather = wx.value; this.applySettings(); this._saveSettings(); });
    const tod = $('set-time'); tod.value = this.settings.time;
    tod.addEventListener('change', () => { this.settings.time = tod.value; this.applySettings(); this._saveSettings(); });
    document.querySelectorAll('.swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.dataset.paint === this.settings.paint);
      sw.addEventListener('click', () => {
        this.settings.paint = sw.dataset.paint; this.applySettings(); this._saveSettings();
        document.querySelectorAll('.swatch').forEach((o) => o.classList.toggle('active', o === sw));
        this.audio.play('ui_switch', { bus: 'ui', volume: 0.6 });
      });
    });
    $('prompt').addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.pressed.add('KeyF'); });
    document.querySelector('[data-board="close"]').addEventListener('click', () => { click(); this.closeBoard(); });
    $('ph-shot').addEventListener('click', () => this.takePhoto());
    $('ph-exit').addEventListener('click', () => { click(); this.exitPhoto(); });
    $('ph-dist').addEventListener('input', (e) => { this.photo.dist = +e.target.value; });
    $('ph-fov').addEventListener('input', (e) => { this.photo.fov = +e.target.value; });
    $('ph-filter').addEventListener('change', (e) => { $('game').style.filter = e.target.value === 'none' ? '' : e.target.value; });
    $('reset-progress').addEventListener('click', () => {
      if (!confirm('Tüm ilerleme (para, araçlar, keşifler, rekorlar) silinsin mi?')) return;
      this.progress.reset(); this.gameplay.reset(); location.reload();
    });
    $('bigmap').addEventListener('click', (e) => {
      const [x, z] = this.hud.bigMapToWorld(e);
      const T = this.terrain;
      if (Math.abs(x) > T.half - 20 || Math.abs(z) > T.half - 20) return;
      if (this.waypoint && Math.hypot(this.waypoint[0] - x, this.waypoint[1] - z) < 60) this.setWaypoint(null);
      else this.setWaypoint([x, z]);
      click();
      this.hud.drawBigMap(this.vehicle.position, this.vehicle.heading(), this.gameplay);
    });
  }

  _tab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('hidden', b.dataset.body !== name));
    if (name === 'map') { this.hud.drawBigMap(this.vehicle.position, this.vehicle.heading(), this.gameplay); this.hud.fillPoiList(this.gameplay, (p) => this.teleport(p)); }
    if (name === 'garage') this._renderGarage();
    if (name === 'achievements') this._renderAchievements();
  }

  startPlay() {
    if (this.state === 'play') return;
    const first = !this.started;
    this.started = true;
    this.audio.resume();
    $('fade').classList.add('on');
    setTimeout(() => {
      $('menu').classList.add('hidden');
      this.hud.show(true);
      document.getElementById('touch').classList.toggle('hidden', !this.input.touchEnabled);
      this.state = 'play';
      this.cameraRig.initialized = false;
      $('fade').classList.remove('on');
      if (first) {
        if (MOBILE) this._goFullscreen();
        this.audio.startVehicle(); this.audio.startAmbience();
        this.audio.play('engine_start', { volume: 0.8 });
        setTimeout(() => this.audio.playMusic(), 1800);
        if (this.input.touchEnabled) this.hud.hint('Sol: direksiyon · Sağ: gaz / fren · Ekranı sürükle: kamera', 6);
        else this.hud.hint('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> sür · <kbd>Boşluk</kbd> el freni · <kbd>Tab</kbd> harita · <kbd>R</kbd> düzelt', 7);
      }
    }, 550);
  }

  _goFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    Promise.resolve(req.call(el, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  }

  openOverlay(tab = 'map', fromMenu = false) {
    this.overlayFromMenu = fromMenu;
    if (!fromMenu) this.state = 'pause';
    $('overlay').classList.remove('hidden');
    document.querySelector('[data-action="resume"]').textContent = fromMenu ? 'Geri' : 'Devam Et';
    document.querySelector('[data-action="menu"]').classList.toggle('hidden', fromMenu);
    this._tab(tab);
    if (this.audio.musicEl) this.audio.bus.music.gain.setTargetAtTime(this.settings.music * 0.5, this.audio.ctx.currentTime, 0.2);
  }

  resume() {
    $('overlay').classList.add('hidden');
    if (this.overlayFromMenu) return;
    this.state = 'play';
    this.audio.applyVolumes();
    this.clock.getDelta();
  }

  toMenu() {
    $('overlay').classList.add('hidden');
    this.hud.show(false);
    $('menu').classList.remove('hidden');
    this.state = 'menu';
    this.gameplay.cancelChallenge();
    this.audio.applyVolumes();
  }

  teleport(p) {
    const T = this.terrain;
    let x = p.x, z = p.z + (p.heading !== undefined ? 0 : 18);
    if (T.slopeAt(x, z) > 0.3) { x = p.x; z = p.z; }
    this.vehicle.reset({ x, y: T.heightAt(x, z) + 1.5, z }, (p.heading ?? 180) * Math.PI / 180);
    this.vehicle._prevPos = null;
    this.cameraRig.initialized = false;
    this.terrain.update(this.vehicle.body.translation(), true);
    this.resume();
  }

  _menuCamera(t) {
    const v = this.vehicle.object.position;
    const a = t * 0.08 + 2.2;
    const cam = this.rs.camera;
    cam.position.set(v.x + Math.sin(a) * 11, v.y + 3.2 + Math.sin(t * 0.13) * 0.6, v.z + Math.cos(a) * 11);
    const gh = this.terrain.heightAt(cam.position.x, cam.position.z) + 1;
    if (cam.position.y < gh) cam.position.y = gh;
    cam.lookAt(v.x - Math.cos(a) * 3.5, v.y + 1.4, v.z + Math.sin(a) * 3.5);
    cam.fov = 50; cam.updateProjectionMatrix();
  }

  surfaceAt = (x, z) => {
    const s = this.terrain.splatAt(x, z);
    if (s.road > 0.5 || s.yard > 0.5) return 'road';
    if (s.rock > 0.55) return 'rock';
    if (s.wheat + s.plowed + s.green > 0.5) return 'field';
    return 'grass';
  };

  // ------------------------------------------------------------ main loop
  loop = (fixedDt, skipRender = false) => {
    if (!MANUAL) requestAnimationFrame(() => this.loop());
    const dt = MANUAL ? fixedDt || 1 / 30 : Math.min(this.clock.getDelta(), 0.1);
    this.time += dt;
    const inp = this.input;
    inp.update(dt);
    const v = this.vehicle;
    const playing = this.state === 'play';

    if (playing) this._handleKeys();
    else if (this.state === 'pause' && (inp.wasPressed('Escape') || inp.wasPressed('Tab'))) this.resume();
    else if (this.state === 'board' && (inp.wasPressed('Escape') || inp.wasPressed('KeyF'))) this.closeBoard();
    else if (this.state === 'photo' && (inp.wasPressed('Escape') || inp.wasPressed('KeyP'))) this.exitPhoto();

    // physics (keeps simulating in the menu so the truck idles naturally)
    if (this.state !== 'pause' && this.state !== 'board' && this.state !== 'photo') {
      let freeze = false;
      if (playing) freeze = this._gameplayResult?.freeze;
      const drive = playing && !freeze ? inp : { throttle: 0, brake: 0, steer: 0, handbrake: true, boost: false };
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED && steps < 5) {
        v.savePrev();
        v.step(FIXED, drive, this.surfaceAt);
        this.physics.step(this.events);
        this._drainEvents();
        this.acc -= FIXED; steps++;
      }
      if (steps === 5) this.acc = 0;
      v.sync(this.acc / FIXED);
      // safety: fell through the world
      if (v.position.y < this.terrain.heightAt(v.position.x, v.position.z) - 6) this._resetVehicle();
    }

    if (playing) {
      this.cameraRig.update(dt, v, this.terrain, inp);
      this._gameplayResult = this.gameplay.update(dt, v);
      const dres = this.delivery.update(dt, v);
      this.hud.extraTarget = dres?.target || null;
      this._effects(dt);
      this._stunts(dt);
      this.stunts.update(dt, v);
      this.hud.update(dt, v, this.gameplay, v.heading());
      this._prompts();
      if (v.lastLandingImpact > 0) {
        const k = v.lastLandingImpact;
        this.audio.play('land_thud', { volume: 0.3 + k * 0.7, rate: 0.9 + Math.random() * 0.2 });
        if (k > 0.4) this.audio.play('suspension', { volume: k * 0.4 });
        this.cameraRig.addShake(k * 0.9);
        v.lastLandingImpact = 0;
      }
    } else if (this.state === 'menu') this._menuCamera(this.time);
    else if (this.state === 'photo') this.cameraRig.photo(dt, v, this.terrain, this.photo);
    if (this.state !== 'play' && this.state !== 'pause' && this.state !== 'board') this.delivery.update(0, v);

    const cam = this.rs.camera;
    if (MANUAL && window.__camOverride) { const o = window.__camOverride; cam.position.set(...o.pos); cam.lookAt(...o.look); cam.fov = o.fov || 60; cam.updateProjectionMatrix(); }
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    this.audio.setListener(v.position, fwd);
    this.audio.updateVehicle(v, dt, this.state === 'pause');
    if (playing && Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) {
      const s = this.terrain.splatAt(v.position.x, v.position.z);
      this.audio.updateAmbience(v.position.y, this.world.nearTrees(v.position.x, v.position.z), s.wheat);
    }

    this.world.update(dt, this.time, v.position, v.speed, playing ? this.audio : null);
    if (this.state !== 'pause' && this.state !== 'board') this.traffic.update(dt, v.position, v.speed);
    this.grass.update(v.position);
    this.terrain.update(cam.position);
    this.lib.windUniform.value = this.time;
    this.terrain.setTime(this.time);
    this.dust.update(dt, { x: 1.2, z: 0.4 });
    this.weather.update(dt, cam.position);
    v.weatherGrip = 1 - this.weather.wet * 0.18;
    this.rs.updateSun(v.position);
    if (!skipRender) this.rs.render(dt);
    inp.endFrame();
  };

  _handleKeys() {
    const inp = this.input, v = this.vehicle;
    if (inp.wasPressed('Escape') || inp.wasPressed('Tab')) { this.openOverlay('map'); return; }
    if (inp.wasPressed('KeyR')) this._resetVehicle();
    if (inp.wasPressed('KeyC')) this.hud.hint(`Kamera: ${this.cameraRig.cycle()}`, 1.5);
    if (inp.wasPressed('KeyM')) { const on = this.audio.toggleMusic(); this.hud.hint(on === false ? 'Müzik kapalı' : 'Müzik açık', 1.5); }
    if (inp.wasPressed('KeyN')) this.audio.nextTrack();
    if (inp.wasPressed('KeyF')) {
      const board = this.delivery.boardNear(v.position);
      if (this.gameplay.active) this.gameplay.cancelChallenge();
      else if (board && v.speed < 4) this.openBoard(board);
      else { const c = this.gameplay.nearChallenge(v.position); if (c) { this.gameplay.startChallenge(c, v); this.cameraRig.initialized = false; this.hud.toast('Görev', c.name, c.desc); } }
    }
    if (inp.wasPressed('KeyL')) { this.headlights = !this.headlights; v.setHeadlights(this.headlights); this.audio.play('ui_switch', { volume: 0.4 }); }
    if (inp.wasPressed('KeyP')) this.enterPhoto();
    const horn = inp.keys.has('KeyH') || inp.keys.has('PadKeyH') || inp.touch.horn;
    if (horn && !this.hornLoop) this.hornLoop = this.audio.loop('horn', 'sfx', { volume: 0.55, offset: 0.02 });
    if (!horn && this.hornLoop) { this.hornLoop.set(0, 1, 0.03); const h = this.hornLoop; setTimeout(() => h.stop(), 150); this.hornLoop = null; }
  }

  // airtime & drift scoring, distance / speed stats, achievements
  _stunts(dt) {
    const v = this.vehicle, P = this.progress, hud = this.hud;
    P.stat('distance', v.speed * dt);
    const kmh = v.speed * 3.6;
    if (kmh > P.stats.topSpeed) P.stat('topSpeed', kmh, 'max');
    if (v.contacts === 0) {
      const clear = v.position.y - this.terrain.heightAt(v.position.x, v.position.z);
      this.air.clear = Math.max(this.air.clear, clear);
    }
    if (v.landedAir) {
      const t = v.landedAir; v.landedAir = 0;
      if (t > 0.8 && this.air.clear > 1.8) {
        const money = Math.round(t * t * 10 + t * 8);
        P.addMoney(money); P.stat('maxAir', t, 'max');
        hud.popup(`HAVA ${t.toFixed(1)} sn <small>+$${money}</small>`);
        if (t >= 1) P.daily('air');
      }
      this.air.clear = 0;
    }
    const r = v.body.rotation(), lv = v.body.linvel();
    const right = _tmpV.set(1, 0, 0).applyQuaternion(_tmpQ.set(r.x, r.y, r.z, r.w));
    const lateral = Math.abs(lv.x * right.x + lv.y * right.y + lv.z * right.z);
    const d = this.drift;
    if (v.contacts >= 3 && v.speed > 9 && lateral > 3.2) { d.t += dt; d.grace = 0.45; }
    else if (d.t > 0) {
      d.grace -= dt;
      if (d.grace <= 0) {
        if (d.t > 1.2) {
          const money = Math.round(d.t * 12);
          P.addMoney(money); P.stat('maxDrift', d.t, 'max');
          hud.popup(`DRIFT ${d.t.toFixed(1)} sn <small>+$${money}</small>`);
          if (d.t >= 1.5) P.daily('drift');
        }
        d.t = 0;
      }
    }
    // mud builds up off-road (faster in rain); driving through the pond washes it off
    const surf = v.wheelState[0].surface, wet = this.weather.wet;
    if (v.contacts > 0 && v.speed > 2) v.dirt = Math.min(1, v.dirt + dt * Math.min(1, v.speed / 15) * (surf === 'road' ? 0.004 : surf === 'field' ? 0.012 : 0.008) * (1 + wet * 3));
    const pond = this._pond || (this._pond = LAYOUT.POIS.find((p) => p.id === 'pond'));
    if (v.dirt > 0.02 && Math.hypot(v.position.x - pond.x, v.position.z - pond.z) < 9) {
      v.dirt = Math.max(0, v.dirt - dt * 0.6);
      if (v.dirt < 0.05 && !this._washed) { this._washed = true; hud.popup('Araç tertemiz! ✨', 'info'); }
    } else if (v.dirt > 0.2) this._washed = false;
    v.setDirt(v.dirt);
    this._checkT = (this._checkT || 0) - dt;
    if (this._checkT <= 0) { this._checkT = 0.5; P.check(this.gameplay); }
  }

  _prompts() {
    const v = this.vehicle, hud = this.hud, touch = this.input.touchEnabled;
    const board = !this.gameplay.active && this.delivery.boardNear(v.position);
    const near = this.gameplay.nearChallenge(v.position);
    let msg = null;
    if (board) msg = touch ? `$ ${board.farm.name} ilan panosu — dokun` : `<kbd>F</kbd> İlan panosu`;
    else if (near) msg = touch ? `⚑ ${near.name} — başlamak için dokun` : `<kbd>F</kbd> ${near.name}`;
    hud.prompt(msg);
    hud.showBoards = !this.delivery.job;
    if (this.waypoint) {
      const dist = Math.hypot(v.position.x - this.waypoint[0], v.position.z - this.waypoint[1]);
      if (dist < 22) { this.setWaypoint(null); hud.popup('Yer işaretine vardın', 'info'); this.audio.play('ui_switch', { bus: 'ui', volume: 0.6 }); }
    }
    if (!this.delivery.job && !this.gameplay.active) {
      if (this.waypoint) {
        const dist = Math.hypot(v.position.x - this.waypoint[0], v.position.z - this.waypoint[1]);
        hud.objective({ title: 'Yer işareti', lines: [dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`] });
      } else if (this.progress.stats.deliveries === 0) hud.objective({ title: 'İlk işin', lines: ['Çiftliklerdeki sarı ışıklı <b>$</b> panodan teslimat işi al.', 'Miller Çiftliği’nin panosu evin önünde.'] });
      else hud.objective(null);
    } else if (!this.delivery.job) hud.objective(null);
  }

  _resetVehicle() {
    const v = this.vehicle, p = v.body.translation();
    const y = this.terrain.heightAt(p.x, p.z) + 1.6;
    v.reset({ x: p.x, y, z: p.z }, v.heading());
    v._prevPos = null;
    this.audio.play('suspension', { volume: 0.4 });
  }

  _drainEvents() {
    this.events.drainContactForceEvents((e) => {
      const mag = e.totalForceMagnitude();
      if (this.impactCooldown > this.time) return;
      const c1 = this.physics.getCollider(e.collider1()), c2 = this.physics.getCollider(e.collider2());
      const other = c1?.userData?.kind === 'vehicle' ? c2 : c1;
      const kind = other?.userData?.kind || 'terrain';
      if (kind === 'cargo' || kind === 'vehicle') return;
      if (kind === 'fence' && this.vehicle.speed > 3) {
        if (this.world.breakFence(other.userData.seg, this.vehicle.body.linvel())) {
          this.progress.stat('fences', 1);
          this.audio.play('impact_wood', { volume: 0.8, rate: 0.85 + Math.random() * 0.3 });
          this.cameraRig.addShake(0.35);
        }
        return;
      }
      const k = Math.min(1, (mag - 9000) / 60000);
      if (k <= 0.02) return;
      this.impactCooldown = this.time + 0.25;
      let name = kind === 'rock' ? 'impact_stone' : kind === 'fence' || kind === 'tree' || kind === 'prop' ? 'impact_wood' : kind === 'building' ? 'crash_1' : 'land_thud';
      if (k > 0.55 && kind !== 'terrain') name = Math.random() < 0.5 ? 'crash_2' : 'crash_3';
      this.audio.play(name, { volume: 0.35 + k * 0.65, rate: 0.9 + Math.random() * 0.2 });
      this.cameraRig.addShake(0.3 + k * 0.8);
    });
  }

  _effects(dt) {
    const v = this.vehicle;
    const sp = v.speed;
    const tmpV = new THREE.Vector3(), dir = new THREE.Vector3(), nrm = new THREE.Vector3();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.object.quaternion);
    dir.set(fwd.x, 0, fwd.z).normalize();
    for (let i = 0; i < 4; i++) {
      const w = v.wheelState[i];
      if (!w.contact) { this.tracks.add(i, w.pos, dir, nrm.set(0, 1, 0), 0.4, 0); continue; }
      const s = this.terrain.splatAt(w.pos.x, w.pos.z);
      const dusty = Math.min(1, s.road + s.plowed + s.yard + s.fallow * 0.6 + s.wheat * 0.4 + s.rock * 0.3);
      // tyre tracks: always faint, darker on soft ground and when sliding
      this.terrain.normalAt(w.pos.x, w.pos.z, nrm);
      const soft = 0.18 + dusty * 0.3;
      this.tracks.add(i, w.pos, dir, nrm, 0.42, Math.min(0.85, soft + w.slip * 0.6) * (sp > 0.5 ? 1 : 0));
      // dust
      const rate = (Math.max(0, sp - 3) * 0.05 * (0.2 + dusty) + w.slip * 1.2) * dt * 60;
      let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      const wet = this.weather.wet;
      const col = wet > 0.4 ? [0.36, 0.28, 0.2] : dusty > 0.5 ? [0.78, 0.66, 0.5] : [0.62, 0.6, 0.45];
      while (n-- > 0) {
        tmpV.set((Math.random() - 0.5) * 2 + fwd.x * sp * 0.25, 0.5 + Math.random() * 1.0, (Math.random() - 0.5) * 2 + fwd.z * sp * 0.25);
        if (wet < 0.4) this.dust.emit(w.pos, tmpV, { size: 1.6 + Math.random() * 2 + sp * 0.04, life: 1.4 + Math.random() * 1.4, alpha: (0.1 + dusty * 0.18) * (0.6 + w.slip) * (1 - wet), color: col, tex: 0 });
        if ((w.slip > 0.4 && Math.random() < 0.25) || (wet > 0.4 && Math.random() < 0.35)) {
          tmpV.set((Math.random() - 0.5) * 3 - fwd.x * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3 - fwd.z * 3);
          this.dust.emit(w.pos, tmpV, { size: 0.8, life: 0.9, alpha: 0.9, color: [0.5, 0.4, 0.3], tex: 1 });
        }
      }
    }
  }
}

const _tmpV = new THREE.Vector3(), _tmpQ = new THREE.Quaternion();
if (MOBILE) document.documentElement.classList.add('mobile');
const game = new Game();
game.load().catch((e) => {
  console.error(e);
  $('load-text').textContent = 'Hata: ' + e.message;
});
