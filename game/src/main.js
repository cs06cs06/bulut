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
import * as LAYOUT from './world/layout.js';
import { Vehicle } from './game/vehicle.js';
import { CameraRig } from './game/cameraRig.js';
import { Dust, TireTracks } from './game/effects.js';
import { Gameplay } from './game/gameplay.js';
import { HUD } from './ui/hud.js';
import { creditsHTML } from './credits.js';

const MODELS = ['pickup', 'tractor', 'barn', 'barn_big', 'barn_small', 'barn_open', 'silo', 'silo_house', 'windmill', 'water_tower', 'chicken_coop', 'well',
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
];
const FIXED = 1 / 60;
const MANUAL = new URLSearchParams(location.search).has('manual'); // test hook: frames advanced by window.__advance
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
    $('credits').innerHTML = creditsHTML();
    let ti = Math.floor(Math.random() * TIPS.length);
    $('load-tip').textContent = TIPS[ti];
    this._tipTimer = setInterval(() => { ti = (ti + 1) % TIPS.length; $('load-tip').textContent = TIPS[ti]; }, 4500);
  }

  _loadSettings() {
    const def = { quality: 'high', master: 0.9, music: 0.5, sfx: 0.9, amb: 0.7, units: 'kmh' };
    try { return Object.assign(def, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { return def; }
  }
  _saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ } }

  progress(p, text) {
    $('load-bar').style.width = `${Math.round(p * 100)}%`;
    if (text) $('load-text').textContent = text;
  }

  async load() {
    const gltfLoader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    const tasks = [];
    let done = 0;
    const track = (p, w = 1) => { tasks.push({ p, w }); return p.then((v) => { done += w; this.progress(0.75 * done / totalW(), 'Varlıklar indiriliyor…'); return v; }); };
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
      texP('skid', 'assets/particles/skidmark.png', true, false), texP('sky', 'assets/sky/sky_4k.jpg', true, false),
    ];
    const hdrP = track(new HDRLoader().loadAsync('assets/sky/sky_1k.hdr'), 2);
    const metaP = track(fetch('assets/terrain/terrain.json').then((r) => r.json()), 1);
    const hP = track(fetch('assets/terrain/height.bin').then((r) => r.arrayBuffer()), 3);
    const hoP = track(fetch('assets/terrain/height_outer.bin').then((r) => r.arrayBuffer()), 1);
    const audioPs = SFX_FILES.map((n) => track(this.audio.load(n, `assets/audio/${n}.ogg`).catch((e) => console.warn('audio', n, e)), 0.5));

    await Promise.all([physicsP, ...modelPs, ...texPs, hdrP, metaP, hP, hoP, ...audioPs]);
    const [meta, hBuf, hoBuf, hdr] = await Promise.all([metaP, hP, hoP, hdrP]);
    this.lib = lib; this.tex = tex;

    this.progress(0.78, 'Palouse tepeleri şekilleniyor…');
    await nextFrame();
    const rs = this.rs;
    rs.setupLighting(tex.sky, hdr);
    const roads = LAYOUT.ROADS.map((r) => ({ ...r }));
    const layout = { roads, farmyards: LAYOUT.FARMS.map((f) => ({ x: f.x, z: f.z, r: f.r })), flatten: LAYOUT.FARMS.map((f) => ({ x: f.x, z: f.z, r: f.r * 0.75, falloff: 30 })) };
    this.terrain = new Terrain({ meta, inner: new Uint16Array(hBuf), outer: new Uint16Array(hoBuf), layout, textures: tex });
    rs.scene.add(this.terrain.group);

    this.progress(0.86, 'Fizik dünyası kuruluyor…');
    await nextFrame();
    this.physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.physics.timestep = FIXED;
    this.events = new RAPIER.EventQueue(true);
    this.terrain.createCollider(RAPIER, this.physics);

    this.progress(0.9, 'Çiftlikler ve ağaçlar yerleştiriliyor…');
    await nextFrame();
    this.world = new World({ scene: rs.scene, terrain: this.terrain, lib, RAPIER, physics: this.physics, renderer: rs.renderer, sunDir: rs.sunDir });
    this.world.build();
    this.grass = new GroundCover({ lib, terrain: this.terrain, scene: rs.scene, quality: 'high' });

    this.progress(0.95, 'Pikap hazırlanıyor…');
    await nextFrame();
    // snap the spawn onto the nearest road sample
    let bestD = Infinity, best = null;
    for (const r of this.terrain.roads.roads) for (const p of r.points) {
      const d = Math.hypot(p[0] - SPAWN.x, p[1] - SPAWN.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    SPAWN.x = best[0]; SPAWN.z = best[1];
    const sy = this.terrain.heightAt(SPAWN.x, SPAWN.z) + 1.2;
    this.vehicle = new Vehicle({ RAPIER, world: this.physics, model: lib.gltf.pickup.scene, spawn: { x: SPAWN.x, y: sy, z: SPAWN.z }, heading: SPAWN.heading, config: { scale: 1.0 } });
    rs.scene.add(this.vehicle.object);
    this.vehicle.onShift = () => this.audio.play('gear', { volume: 0.25 });
    this.cameraRig = new CameraRig(rs.camera, $('game'));
    this.dust = new Dust(rs.scene, { smoke: tex.smoke, dirt: tex.debris });
    this.tracks = new TireTracks(rs.scene, tex.skid);
    this.gameplay = new Gameplay({ scene: rs.scene, terrain: this.terrain, lib, tex, hud: this.hud, audio: this.audio, roads: this.terrain.roads });
    this.hud.buildMap(this.terrain);
    this.hud.updateCounts(this.gameplay);
    this.audio.onTrack = (t) => this.hud.nowPlaying(t);

    this.applySettings();
    this.progress(0.98, 'Gölgeler ve ışık hazırlanıyor…');
    await nextFrame();
    this.terrain.update(this.vehicle.position, true);
    this.grass.update(this.vehicle.position);
    this.vehicle.sync(1);
    this._menuCamera(0);
    await rs.renderer.compileAsync(rs.scene, rs.camera).catch(() => {});
    rs.render(0.016);
    this.progress(1, 'Hazır!');
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

  applySettings() {
    const s = this.settings;
    this.rs.setQuality(s.quality);
    this.grass.setQuality(s.quality);
    this.world.setQuality(s.quality);
    Object.assign(this.audio.volumes, { master: s.master, music: s.music, sfx: s.sfx, amb: s.amb });
    this.audio.applyVolumes();
    this.hud.units = s.units;
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
    $('bigmap').addEventListener('click', (e) => {
      const [x, z] = this.hud.bigMapToWorld(e);
      const near = LAYOUT.POIS.find((p) => this.gameplay.isFound(p.id) && Math.hypot(p.x - x, p.z - z) < 90);
      if (near) this.teleport(near);
    });
  }

  _tab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('hidden', b.dataset.body !== name));
    if (name === 'map') { this.hud.drawBigMap(this.vehicle.position, this.vehicle.heading(), this.gameplay); this.hud.fillPoiList(this.gameplay, (p) => this.teleport(p)); }
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
      this.state = 'play';
      this.cameraRig.initialized = false;
      $('fade').classList.remove('on');
      if (first) {
        this.audio.startVehicle(); this.audio.startAmbience();
        this.audio.play('engine_start', { volume: 0.8 });
        setTimeout(() => this.audio.playMusic(), 1800);
        this.hud.hint('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> sür · <kbd>Boşluk</kbd> el freni · <kbd>Tab</kbd> harita · <kbd>R</kbd> düzelt', 7);
      }
    }, 550);
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

    // physics (keeps simulating in the menu so the truck idles naturally)
    if (this.state !== 'pause') {
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
      this._effects(dt);
      this.hud.update(dt, v, this.gameplay, v.heading());
      const near = this.gameplay.nearChallenge(v.position);
      this.hud.prompt(near ? `<kbd>F</kbd> ${near.name}` : null);
      if (v.lastLandingImpact > 0) {
        const k = v.lastLandingImpact;
        this.audio.play('land_thud', { volume: 0.3 + k * 0.7, rate: 0.9 + Math.random() * 0.2 });
        if (k > 0.4) this.audio.play('suspension', { volume: k * 0.4 });
        this.cameraRig.addShake(k * 0.9);
        v.lastLandingImpact = 0;
      }
    } else if (this.state === 'menu') this._menuCamera(this.time);

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
    this.grass.update(v.position);
    this.terrain.update(cam.position);
    this.lib.windUniform.value = this.time;
    this.dust.update(dt, { x: 1.2, z: 0.4 });
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
      if (this.gameplay.active) this.gameplay.cancelChallenge();
      else { const c = this.gameplay.nearChallenge(v.position); if (c) { this.gameplay.startChallenge(c, v); this.cameraRig.initialized = false; this.hud.toast('Görev', c.name, c.desc); } }
    }
    const horn = inp.keys.has('KeyH') || inp.keys.has('PadKeyH');
    if (horn && !this.hornLoop) this.hornLoop = this.audio.loop('horn', 'sfx', { volume: 0.55, offset: 0.02 });
    if (!horn && this.hornLoop) { this.hornLoop.set(0, 1, 0.03); const h = this.hornLoop; setTimeout(() => h.stop(), 150); this.hornLoop = null; }
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
      const col = dusty > 0.5 ? [0.78, 0.66, 0.5] : [0.62, 0.6, 0.45];
      while (n-- > 0) {
        tmpV.set((Math.random() - 0.5) * 2 + fwd.x * sp * 0.25, 0.5 + Math.random() * 1.0, (Math.random() - 0.5) * 2 + fwd.z * sp * 0.25);
        this.dust.emit(w.pos, tmpV, { size: 1.6 + Math.random() * 2 + sp * 0.04, life: 1.4 + Math.random() * 1.4, alpha: (0.1 + dusty * 0.18) * (0.6 + w.slip), color: col, tex: 0 });
        if (w.slip > 0.4 && Math.random() < 0.25) {
          tmpV.set((Math.random() - 0.5) * 3 - fwd.x * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3 - fwd.z * 3);
          this.dust.emit(w.pos, tmpV, { size: 0.8, life: 0.9, alpha: 0.9, color: [0.5, 0.4, 0.3], tex: 1 });
        }
      }
    }
  }
}

const game = new Game();
game.load().catch((e) => {
  console.error(e);
  $('load-text').textContent = 'Hata: ' + e.message;
});
