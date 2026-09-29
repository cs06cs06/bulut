// Penalty shootout game: state machine, fixed-step simulation, AI, input, replay.
import * as THREE from 'three';
import { BallPhysics, solveShot, BALL_R } from './ball.js';
import { KickerActor, KeeperActor } from './actors.js';
import { CameraDirector } from './camera.js';
import { GOAL } from './goal.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const H = 1 / 60;                 // fixed simulation step
const SUB = 4;                    // ball sub-steps per step

export const DIFFICULTY = {
  easy:   { name: 'KOLAY',  skill: 0.28, react: 0.20, cpuAcc: 0.55, cpuPower: [0.5, 0.82] },
  normal: { name: 'NORMAL', skill: 0.46, react: 0.14, cpuAcc: 0.72, cpuPower: [0.55, 0.9] },
  hard:   { name: 'ZOR',    skill: 0.62, react: 0.09, cpuAcc: 0.85, cpuPower: [0.62, 0.95] },
  legend: { name: 'EFSANE', skill: 0.78, react: 0.06, cpuAcc: 0.93, cpuPower: [0.7, 0.97] },
};

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);       // renderer, world, fx, audio, ui, base, ballMesh, settings, canvas
    this.scene = this.world.scene;
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.08, 420);
    this.cam = new CameraDirector(this.camera);
    this.spot = v3(0, BALL_R, 11);
    this.ball = new BallPhysics(this.world.goal);
    this.ballPrev = { p: this.spot.clone(), q: new THREE.Quaternion() };
    this.phase = 'boot'; this.time = 0; this.simAcc = 0; this.simTime = 0; this.timeScale = 1;
    this.timers = [];               // real-time scheduled callbacks
    this.simTimers = [];            // sim-time callbacks
    this.aim = v3(0, 1.1, 0); this.aimTarget = v3(0, 1.1, 0); this.power = 0; this.charging = false; this.chargeT = 0; this.curve = 0;
    this.pointer = { x: 0, y: 0, has: false, down: false, id: null };
    this.screenAim = { x: 0, y: 0 };
    this.match = null; this.recording = null; this.rec = [];
    this.shot = null; this.outcome = null; this.paused = false;
    this.replay = null;
    this.stats = { saves: 0, goals: 0, shots: 0, streak: 0, best: 0 };
    this.fadeTarget = 0; this.excite = 0.25; this.exciteTarget = 0.25;
    this.mouseNDC = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.tmp = v3();
    this.buildActors();
    this.bindInput();
  }

  /* ============================================================= setup */
  buildActors() {
    const B = this.base;
    this.kickers = { home: new KickerActor('home', B, { beard: true }), away: new KickerActor('away', B, { beard: false }) };
    this.keepers = { home: new KeeperActor('gkHome', B, { beard: false }), away: new KeeperActor('gkAway', B, { beard: true }) };
    for (const a of [...Object.values(this.kickers), ...Object.values(this.keepers)]) { this.scene.add(a.root); a.root.visible = false; a.st0 = a.st1 = null; }
    this.scene.add(this.ballMesh);
    this.ballMesh.position.copy(this.spot);
  }

  bindInput() {
    const c = this.canvas;
    const onMove = (e) => { this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.has = true; };
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerdown', (e) => {
      onMove(e); c.focus(); this.audio.unlock();
      if (e.pointerType === 'touch') { this.pointer.id = e.pointerId; try { c.setPointerCapture(e.pointerId); } catch (_) { } }
      this.pointer.down = true;
      this.onPress(e);
    });
    const up = (e) => { this.pointer.down = false; this.onRelease(e); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    c.addEventListener('wheel', (e) => { if (this.phase === 'aim' || this.phase === 'charge') { this.setCurve(this.curve + (e.deltaY > 0 ? -0.15 : 0.15)); e.preventDefault(); } }, { passive: false });
    const ui = this.ui.el;
    const hold = (btn, on, off) => { btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.audio.unlock(); btn.setPointerCapture(e.pointerId); on(); }); const u = (e) => { off(); }; btn.addEventListener('pointerup', u); btn.addEventListener('pointercancel', u); };
    hold(ui.btnShoot, () => this.onPress({ button: 0, fromButton: true }), () => this.onRelease({}));
    ui.btnCurveL.addEventListener('pointerdown', (e) => { e.preventDefault(); this.setCurve(this.curve - 0.34); });
    ui.btnCurveR.addEventListener('pointerdown', (e) => { e.preventDefault(); this.setCurve(this.curve + 0.34); });
    this.keys = {};
  }
  onKey(e, down) {
    if (e.repeat && down) return;
    this.keys[e.code] = down;
    if (!down) { if (e.code === 'Space') this.onRelease(e); return; }
    switch (e.code) {
      case 'Space': e.preventDefault(); this.audio.unlock(); this.onPress(e); break;
      case 'KeyQ': this.setCurve(this.curve - 0.25); break;
      case 'KeyE': this.setCurve(this.curve + 0.25); break;
      case 'KeyP': case 'Escape': this.togglePause(); break;
      case 'KeyM': this.settings.setSound(!this.audio.enabled); break;
      case 'KeyF': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'KeyH': this.ui.el.fps.classList.toggle('hidden'); break;
      case 'Enter': if (this.phase === 'replay') this.skipReplay(); break;
    }
  }
  setCurve(c) { this.curve = clamp(c, -1, 1); this.ui.curve(this.curve); }

  /* ============================================================= scheduling */
  later(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }
  laterSim(sec, fn) { this.simTimers.push({ t: this.simTime + sec, fn }); }
  clearTimers() { this.timers.length = 0; this.simTimers.length = 0; }

  /* ============================================================= match flow */
  newMatch() {
    this.match = { home: { goals: 0, kicks: [] }, away: { goals: 0, kicks: [] }, turn: 'home', round: 1, sudden: false, over: false };
    this.stats = { saves: 0, goals: 0, shots: 0, streak: 0, best: 0 };
    this.ui.score(0, 0); this.ui.dots(this.match);
    this.world.stadium.setScore(0, 0, 'PENALTİ KUPASI');
  }
  get diff() { return DIFFICULTY[this.settings.difficulty] || DIFFICULTY.normal; }
  get pressure() { const m = this.match; if (!m) return 0.2; const k = m.home.kicks.length + m.away.kicks.length; return clamp(0.15 + k * 0.07 + (m.sudden ? 0.3 : 0), 0, 1); }

  enterMenu() {
    this.phase = 'menu'; this.clearTimers();
    this.ui.hide('hud'); this.ui.cinema(false);
    this.setupTurn('home', true);
    this.cam.set('menu', {}, true);
    this.exciteTarget = 0.3; this.audio.setTension(0.5, 1.2);
  }

  startMatch() {
    this.newMatch();
    this.ui.show('hud'); this.ui.hide('menu');
    this.audio.startAmbience();
    this.audio.play('whistle', { vol: 0.8 });
    this.beginTurn(true);
  }

  // place actors for the turn of `team` ('home' = player shoots, 'away' = player defends)
  setupTurn(team, quiet = false) {
    const k = this.kickers[team], g = this.keepers[team === 'home' ? 'away' : 'home'];
    for (const a of [...Object.values(this.kickers), ...Object.values(this.keepers)]) { a.root.visible = false; a.st0 = a.st1 = null; }
    this.kicker = k; this.keeper = g;
    k.root.visible = true; g.root.visible = true;
    this.ball.reset(this.spot); this.ballMesh.position.copy(this.spot); this.ballMesh.quaternion.identity();
    this.ballPrev.p.copy(this.spot); this.ballPrev.q.identity();
    this.ball.heldBy = null;
    // nominal kick set-up (toward goal centre)
    k.setup({ ball: this.spot, aimPoint: v3(0, 1, 0) });
    k.update(0);
    g.setup(v3(0, 0, 0.35));
    g.update(H);
    this.world.goal.panels.forEach(p => { p.d.fill(0); p.vel.fill(0); p.dirty = true; });
    this.kickStart = k.S.clone();
    this.snapshotActors();
    this.shot = null; this.outcome = null; this.rec = []; this.recording = false;
    this.netHitSound = false;
  }

  beginTurn(first = false) {
    const m = this.match;
    this.clearTimers();
    const team = m.turn;
    const doStart = () => {
      this.setupTurn(team);
      this.ui.score(m.home.goals, m.away.goals); this.ui.dots(m);
      this.world.stadium.setScore(m.home.goals, m.away.goals, m.sudden ? 'AYNI ANDA ÖLÜM' : 'PENALTİ KUPASI');
      this.power = 0; this.charging = false; this.setCurve(0);
      this.aimTarget.set(0, 1.1, 0); this.aim.copy(this.aimTarget);
      this.cinema(false);
      if (team === 'home') {
        this.ui.turn('SENİN SIRAN', 'Kaleye nişan al, gücü ayarla ve şutu çek');
        this.phase = first ? 'intro' : 'aim';
        this.cam.set(first ? 'intro' : 'aim', {}, true);
        if (first) this.later(4.0, () => { if (this.phase === 'intro') this.toAim(); });
        else this.toAim();
      } else {
        this.ui.turn('KALECİ SENSİN', 'Rakip vurmadan önce kaleye tıkla: kalecin oraya atlasın', true);
        this.phase = 'wait';
        this.cam.set('keepercam', {}, true);
        this.setupCpuShot();
        this.ui.hint('KALEYE TIKLA / DOKUN → KALECİ O NOKTAYA ATLAR');
        this.audio.setTension(0.2, 0.5);
        this.later(1.6, () => { if (this.phase === 'wait') { this.audio.play('whistle', { vol: 0.7 }); this.later(0.5, () => this.startCpuRunup()); } });
      }
      this.fade(0);
    };
    if (first) { doStart(); } else { this.fade(1); this.later(0.35, doStart); }
  }
  cinema(on) { this.ui.cinema(on); }
  fade(to) { this.fadeTarget = to; }
  toAim() {
    this.phase = 'aim'; this.cam.set('aim', {}); this.ui.hint('NİŞAN AL • BASILI TUT: GÜÇ • BIRAK: ŞUT • Q/E: FALSO');
    this.audio.setTension(0.15, 0.6);
    this.exciteTarget = 0.2;
    this.ui.show('powerWrap'); this.ui.show('curveWrap');
    if ('ontouchstart' in window || matchMedia('(pointer:coarse)').matches) this.ui.show('touchUI');
  }

  /* ============================================================= player input */
  onPress(e) {
    if (this.paused) return;
    if (this.phase === 'replay') { this.skipReplay(); return; }
    if (this.phase === 'aim' && !(e && e.button > 0)) {
      this.phase = 'charge'; this.charging = true; this.chargeT = 0; this.power = 0; this.ui.hint('');
      this.audio.tick();
    } else if (this.phase === 'wait' || this.phase === 'defend') {
      this.commitDive();
    } else if (this.phase === 'intro') { this.toAim(); }
  }
  onRelease(e) {
    if (this.phase === 'charge') { this.charging = false; this.fire(); }
  }
  togglePause() {
    if (['menu', 'boot', 'end'].includes(this.phase)) return;
    this.paused = !this.paused;
    this.ui.el.pause.classList.toggle('hidden', !this.paused);
    if (this.audio.ctx) { this.paused ? this.audio.ctx.suspend() : this.audio.ctx.resume(); }
  }

  /* ============================================================= shooting (player) */
  fire() {
    const rng = mulberry((Math.random() * 1e9) | 0);
    const p = this.power, c = this.curve;
    // error model: wobble is already in the reticle; add inaccuracy for extreme power
    const over = clamp((p - 0.88) / 0.12, 0, 1), weak = clamp((0.4 - p) / 0.4, 0, 1);
    const sx = 0.06 + 0.42 * over + 0.05 * weak + 0.05 * this.pressure, sy = 0.05 + 0.40 * over + 0.03 * weak;
    const tgt = this.aimAtFire.clone();
    tgt.x += gauss(rng) * sx; tgt.y += gauss(rng) * sy + 0.75 * over;
    tgt.x = clamp(tgt.x, -6.5, 6.5); tgt.y = clamp(tgt.y, 0.06, 4.5);
    this.launchShot({ target: tgt, power: p, curve: c, by: 'player', rng });
  }

  // common path for both players and CPU. Prepares kicker, ball velocity and keeper decision.
  launchShot({ target, power, curve, by, rng }) {
    const speed = 15 + 18.5 * power;
    const spin = v3(-14 * power * power, -curve * 88, 0);
    const sol = solveShot(this.spot, v3(target.x, target.y, 0), speed, spin, null);
    this.shot = { by, target: target.clone(), power, curve, speed, spin, vel: sol.vel, hit: sol.hit, arrive: sol.arrive, rng, impacted: false, t0: this.simTime };
    this.stats.shots += by === 'player' ? 1 : 0;
    const k = this.kicker;
    k.setup({ ball: this.spot, aimPoint: v3(target.x, 0, 0), start: this.kickStart });
    k.update(0);
    k.onImpact = () => this.onImpact();
    this.ui.hint(''); this.ui.reticle(0, 0, false); this.ui.hide('powerWrap'); this.ui.hide('curveWrap'); this.ui.hide('touchUI');
    this.recording = true; this.rec = [];
    if (by === 'player') {
      this.phase = 'pre';
      this.audio.play('whistle', { vol: 0.85 }); this.audio.heartbeat(); this.audio.setTension(0.1, 0.3);
      this.laterSim(0.55, () => this.startRun());
    }
  }
  startRun() {
    this.phase = 'run';
    this.kicker.go();
    this.cam.set('runup', {});
    this.audio.setTension(0.05, 0.4); this.audio.whoosh(0.9, 200, 900, 0.10);
    this.decideKeeper();
    // brief cinematic slow-mo as the boot meets the ball
    this.laterSim(0.95, () => { if (this.phase === 'run') this.timeScale = 0.55; });
  }

  decideKeeper() {
    const s = this.shot; if (!s) return;
    if (s.by === 'cpu') return;        // player controls
    const rng = s.rng, d = this.diff, m = this.match;
    const skill = clamp(d.skill + 0.012 * (m.home.kicks.length) + (m.sudden ? 0.05 : 0), 0.05, 0.9);
    const hit = s.hit || { x: s.target.x, y: s.target.y, t: 0.5 };
    const corner = (Math.abs(hit.x) > 2.7 ? 0.10 : 0) + (hit.y > 1.9 ? 0.08 : 0) + (hit.y < 0.35 ? 0.05 : 0);
    const readP = clamp(skill - 0.12 * Math.abs(s.curve) - (s.power > 0.85 ? 0.10 : 0) - corner + (Math.abs(hit.x) < 1.0 ? 0.10 : 0), 0.06, 0.93);
    let T;
    if (rng() < readP) T = v3(hit.x + gauss(rng) * 0.22, hit.y + gauss(rng) * 0.24, 0);
    else {
      const r = rng();
      const side = r < 0.42 ? -1 : r < 0.84 ? 1 : 0;
      T = v3(side * (1.5 + rng() * 1.9), 0.3 + rng() * 1.9, 0);
      if (side === 0) T.set((rng() - 0.5) * 0.9, 1.2 + rng() * 1.2, 0);
    }
    T.x = clamp(T.x, -4.0, 4.0); T.y = clamp(T.y, 0.15, 2.7);
    const dx = Math.abs(T.x - this.keeper.root.position.x);
    const arrive = (0.29 + 0.060 * dx + 0.045 * Math.max(0, T.y - 1.2)) * lerp(1.16, 0.86, skill);
    const react = lerp(0.16, 0.0, skill) * (d.react / 0.14);
    s.keeperPlan = { T, arrive, react, readP };
    s.keeperDelay = react;
  }

  onImpact() {
    const s = this.shot; if (!s || s.impacted) return;
    s.impacted = true; s.impactTime = this.simTime;
    this.ball.reset(this.spot);
    this.ball.seed((Math.random() * 1e9) | 0);
    this.ball.launch(s.vel, s.spin);
    this.phase = 'flight';
    this.timeScale = 0.6; this.laterSim(0.5, () => { this.timeScale = 1; });
    const strong = s.speed > 27;
    this.audio.play(strong ? 'kickHard' : 'kick', { vol: 0.9 + 0.1 * s.power, rate: 0.92 + Math.random() * 0.16 });
    this.audio.whoosh(0.35, 900, 3600, 0.16);
    this.cam.set('flight', {}); this.cam.shake(0.004 + 0.004 * s.power, 0.25);
    this.audio.setTension(0.55, 0.4); this.exciteTarget = 0.55;
    // keeper reaction
    if (s.by === 'player' && s.keeperPlan) {
      const kp = s.keeperPlan;
      this.laterSim(kp.react, () => { if (this.phase === 'flight') this.keeper.startDive(kp.T, kp.arrive); });
    }
    if (s.by === 'cpu') {
      // player's late input still counts a short while after the kick
      this.phase = 'flight';
      this.ui.hint('');
    }
  }

  /* ============================================================= defending (CPU shooter) */
  setupCpuShot() {
    const rng = mulberry((Math.random() * 1e9) | 0), d = this.diff;
    const xs = [-3.1, -2.2, -1.0, 0, 1.0, 2.2, 3.1], ys = [0.35, 0.9, 1.7, 2.15];
    const tx = xs[Math.floor(rng() * xs.length)], ty = ys[Math.floor(rng() * ys.length)];
    const power = lerp(d.cpuPower[0], d.cpuPower[1], rng());
    const curve = (rng() < 0.3 ? (rng() - 0.5) * 1.2 : 0);
    const err = (1 - d.cpuAcc) * 0.9 + (power > 0.9 ? 0.3 : 0);
    const target = v3(tx + gauss(rng) * err * 0.5, ty + gauss(rng) * err * 0.45 + (power > 0.93 ? 0.4 : 0), 0);
    this.cpuShotParams = { target, power, curve, rng };
    // set kicker heading to the target from the start
    this.kicker.setup({ ball: this.spot, aimPoint: v3(target.x, 0, 0), start: this.kickStart });
    this.kicker.update(0);
    this.diveCommitted = false;
  }
  startCpuRunup() {
    if (this.phase !== 'wait') return;
    this.phase = 'defend';
    const p = this.cpuShotParams;
    this.launchShot({ target: p.target, power: p.power, curve: p.curve, by: 'cpu', rng: p.rng });
    this.recording = true;
    this.kicker.go();
    this.audio.heartbeat(); this.audio.whoosh(0.9, 200, 800, 0.08);
    this.cam.set('keepercam', { follow: false });
    this.audio.setTension(0.1, 0.3);
  }
  commitDive() {
    if (this.diveCommitted) return;
    if (!(this.phase === 'defend' || (this.phase === 'flight' && this.shot?.by === 'cpu' && this.simTime - this.shot.impactTime < 0.30))) return;
    this.diveCommitted = true;
    const T = this.aim.clone(); T.x = clamp(T.x, -4.2, 4.2); T.y = clamp(T.y, 0.15, 2.8); T.z = 0;
    const dx = Math.abs(T.x - this.keeper.root.position.x);
    const arrive = 0.30 + 0.062 * dx + 0.045 * Math.max(0, T.y - 1.2);
    this.keeper.startDive(T, arrive);
    this.ui.hint('');
    this.audio.whoosh(0.5, 300, 1200, 0.14);
    this.cam.shake(0.003, 0.2);
  }

  /* ============================================================= fixed-step simulation */
  stepSim() {
    this.simTime += H;
    // timers on sim clock
    for (let i = this.simTimers.length - 1; i >= 0; i--) { const t = this.simTimers[i]; if (this.simTime >= t.t) { this.simTimers.splice(i, 1); t.fn(); } }
    this.prevBall = this.ballPrev; this.ballPrev.p.copy(this.ball.p); this.ballPrev.q.copy(this.ball.q);
    for (const a of this.activeActors()) a.st0 = a.st1 || a.packState();
    const k = this.kicker, g = this.keeper;
    if (k) k.update(H);
    if (g) g.update(H);
    // ball
    if (this.ball.state === 'flight' || this.ball.state === 'held') {
      const prev = this.prevCols;
      const kctx = { colliders: g.colliders, prev, dt: H, heldPoint: this.heldPoint(g), canCatch: true };
      for (let i = 0; i < SUB; i++) this.ball.step(1 / (60 * SUB), { keeper: kctx, alpha: (i + 1) / SUB });
      this.handleBallEvents();
    }
    this.prevCols = g && g.colliders ? g.colliders.map(c => [c[0], c[1].clone(), c[2].clone()]) : null;
    for (const a of this.activeActors()) a.st1 = a.packState();
    if (this.recording) this.pushFrame();
    if (this.phase === 'flight' || this.phase === 'result') this.evaluateOutcome();
  }
  activeActors() { return this.kicker ? [this.kicker, this.keeper] : []; }
  snapshotActors() { for (const a of this.activeActors()) { a.rig.commit(); a.st0 = a.st1 = a.packState(); } }
  heldPoint(g) {
    if (this.ball.state !== 'held' || !g.colliders) return null;
    const hl = g.colliders[0], hr = g.colliders[1];
    const p = hl[1].clone().add(hl[2]).add(hr[1]).add(hr[2]).multiplyScalar(0.25);
    return p.add(v3(0, 0.04, 0.05));
  }

  handleBallEvents() {
    const ev = this.ball.events; if (!ev.length) return;
    for (const e of ev) {
      switch (e.type) {
        case 'bounce': this.audio.play('bounce', { vol: clamp(e.speed / 10, 0.1, 0.7), rate: 0.9 + Math.random() * 0.2, pan: clamp(e.pos.x / 12, -1, 1) }); break;
        case 'post': case 'bar':
          this.audio.play('post', { vol: clamp(0.4 + e.speed / 20, 0.5, 1), rate: 0.95 + Math.random() * 0.1, pan: clamp(e.pos.x / 8, -1, 1) });
          this.audio.play('gasp', { vol: 0.7, bus: 'crowd' }); this.cam.shake(0.010, 0.4);
          this.postHitT = this.simTime; break;
        case 'net':
          this.audio.play('net', { vol: 0.9, rate: 0.9 + Math.random() * 0.2 }); this.audio.thump(60, 0.3, 0.35); this.cam.shake(0.008, 0.5);
          this.world.goal.ripple(e.pos, 0.35, 0.9); break;
        case 'keeper': this.audio.play('kick', { vol: clamp(0.3 + e.speed / 30, 0.3, 0.8), rate: 0.7 + Math.random() * 0.1 }); this.touchT = this.simTime; break;
        case 'catch': this.audio.play('kick', { vol: 0.7, rate: 0.6 }); this.cam.shake(0.006, 0.3); break;
        case 'parry': this.cam.shake(0.008, 0.35); break;
        case 'board': this.audio.play('bounce', { vol: 0.5, rate: 0.7 }); break;
        case 'goal': this.goalT = this.simTime; break;
      }
    }
    ev.length = 0;
  }

  evaluateOutcome() {
    if (this.outcome) return;
    const b = this.ball, s = this.shot; if (!s || !s.impacted) return;
    const t = b.time;
    if (b.crossed && b.crossT === undefined) b.crossT = t;
    if (b.touchedKeeper && b.touchT === undefined) b.touchT = t;
    if ((b.hitPost || b.hitBar) && b.postT === undefined) b.postT = t;
    const slow = Math.hypot(b.v.x, b.v.z) < 2.5;
    let kind = null;
    if (b.scored) { if (t - b.crossT > 1.0) kind = 'goal'; }
    else if (b.state === 'held') kind = 'save';
    else if (b.crossed) { if (t - b.crossT > 0.7) kind = b.touchedKeeper ? 'save' : (b.hitPost || b.hitBar) ? 'post' : 'miss'; }
    else if (b.touchedKeeper && (t - b.touchT > 2.0 || (t - b.touchT > 0.8 && (slow || b.v.z > 1.0)))) kind = 'save';
    else if ((b.hitPost || b.hitBar) && (t - b.postT > 1.7 || (t - b.postT > 0.7 && (slow || b.v.z > 1.5)))) kind = 'post';
    else if (t > 3.6 || b.state === 'dead' || b.p.z > 28 || (b.p.z < -1 && !b.crossed)) kind = b.touchedKeeper ? 'save' : (b.hitPost || b.hitBar ? 'post' : 'miss');
    if (kind) this.finishShot(kind);
  }

  /* ============================================================= outcome */
  finishShot(kind) {
    if (this.outcome) return;
    this.outcome = kind; this.phase = 'result';
    this.timeScale = 1;
    const m = this.match, team = m.turn, s = this.shot, byPlayer = s.by === 'player';
    const scored = kind === 'goal';
    m[team].kicks.push(scored); if (scored) m[team].goals++;
    if (byPlayer) { if (scored) { this.stats.goals++; this.stats.streak++; this.stats.best = Math.max(this.stats.best, this.stats.streak); } else this.stats.streak = 0; }
    else if (kind === 'save') this.stats.saves++;
    this.ui.score(m.home.goals, m.away.goals); this.ui.dots({ ...m, turn: team });
    this.world.stadium.setScore(m.home.goals, m.away.goals, 'PENALTİ KUPASI');
    const A = this.audio;
    const goodForPlayer = (byPlayer && scored) || (!byPlayer && !scored);
    this.cinema(true);
    switch (kind) {
      case 'goal': {
        if (byPlayer) { this.ui.banner('GOOOL!', 'MÜKEMMEL ŞUT', '#ffd400'); A.play(Math.random() < 0.5 ? 'cheer1' : 'cheer2', { vol: 1.0, bus: 'crowd' }); this.kicker.startCelebrate(); this.cam.set('goalcam', { side: this.shot.target.x > 0 ? -1 : 1 }); this.later(1.5, () => this.cam.set('celebrate', {})); this.exciteTarget = 1; this.world.stadium.wave = 1; this.later(4, () => { this.world.stadium.wave = 0; }); }
        else { this.ui.banner('GOL YEDİN', 'RAKİP SKORU BULDU', '#ff5a6a'); A.play('boo', { vol: 0.6, bus: 'crowd' }); A.play('cheer2', { vol: 0.5, bus: 'crowd', delay: 0.1 }); this.kicker.startCelebrate(); this.cam.set('goalcam', { side: 1 }); this.later(1.4, () => this.cam.set('celebrate', { phase: 2 })); this.exciteTarget = 0.7; }
        break;
      }
      case 'save': {
        if (byPlayer) { this.ui.banner('KURTARDI!', 'RAKİP KALECİ DEVRE DIŞI', '#7fd0ff'); A.play('oooh', { vol: 0.95, bus: 'crowd' }); this.kicker.startSad(); }
        else { this.ui.banner('KURTARDIN!', 'HARİKA REFLEKS', '#5dff8a'); A.play(Math.random() < 0.5 ? 'cheer1' : 'cheer2', { vol: 1.0, bus: 'crowd' }); this.stats.saves = this.stats.saves; this.kicker.startSad(); this.exciteTarget = 1; }
        this.cam.set('savecam', {}); this.cam.shake(0.006, 0.3);
        break;
      }
      case 'post': {
        this.ui.banner(this.ball.hitBar ? 'ÜST BARA!' : 'DİREK!', 'ÇOK YAKLAŞTI', '#ffb03a'); A.play('oooh', { vol: 0.9, bus: 'crowd' }); this.kicker.startSad(); this.cam.set('sadcam', {});
        break;
      }
      default: {
        this.ui.banner('DIŞARI!', byPlayer ? 'BU KEZ OLMADI' : 'RAKİP KAÇIRDI', '#ff8a5a'); A.play('sigh', { vol: 1.0, bus: 'crowd' }); this.kicker.startSad(); this.cam.set('sadcam', {});
        if (!byPlayer) A.play('cheer2', { vol: 0.4, bus: 'crowd', delay: 0.4 });
      }
    }
    this.audio.setTension(0.9, 0.3);
    // next
    const wantReplay = this.settings.replay && (kind === 'goal' || kind === 'save' || kind === 'post') && this.rec.length > 40;
    this.recEndIndex = this.rec.length;
    if (wantReplay) this.later(2.6, () => this.startReplay(kind));
    else this.later(3.4, () => this.nextTurn());
    void goodForPlayer;
  }

  nextTurn() {
    const m = this.match;
    this.recording = false;
    this.cinema(false); this.ui.hint('');
    // advance turn / detect winner
    const h = m.home, a = m.away;
    const kh = h.kicks.length, ka = a.kicks.length;
    const remH = Math.max(0, 5 - kh), remA = Math.max(0, 5 - ka);
    let over = false;
    if (h.goals > a.goals + remA) over = true;
    else if (a.goals > h.goals + remH) over = true;
    else if (kh === ka && kh >= 5 && h.goals !== a.goals) over = true;
    if (kh === ka && kh >= 5 && h.goals === a.goals) m.sudden = true;
    if (over) { m.over = true; this.endMatch(); return; }
    if (m.turn === 'home') m.turn = 'away'; else { m.turn = 'home'; m.round++; }
    this.beginTurn(false);
  }

  endMatch() {
    this.phase = 'end';
    const m = this.match, win = m.home.goals > m.away.goals;
    const E = this.ui.el;
    E.endKicker.textContent = m.sudden ? 'AYNI ANDA ÖLÜM SONUCU' : 'SERİ PENALTI SONUCU';
    E.endTitle.textContent = win ? 'KAZANDIN!' : 'KAYBETTİN'; E.endTitle.className = win ? 'win' : 'lose';
    E.endScore.textContent = `${m.home.goals} – ${m.away.goals}`;
    E.endStats.innerHTML = `Attığın gol: <b>${this.stats.goals}</b> / ${m.home.kicks.length} &nbsp;•&nbsp; Kurtarış: <b>${this.stats.saves}</b> &nbsp;•&nbsp; En uzun seri: <b>${this.stats.best}</b>`;
    this.ui.hide('hud'); this.ui.show('end'); this.cinema(false);
    this.cam.set('orbit', {}, true);
    if (win) { this.audio.play('cheer1', { vol: 1, bus: 'crowd' }); this.audio.play('chant', { vol: 0.8, bus: 'crowd', delay: 1.5 }); this.world.stadium.wave = 1; this.exciteTarget = 1; }
    else { this.audio.play('sigh', { vol: 1, bus: 'crowd' }); this.exciteTarget = 0.3; this.world.stadium.wave = 0; }
    this.audio.play('whistle', { vol: 0.9 });
  }

  /* ============================================================= recording & replay */
  pushFrame() {
    const b = this.ball;
    const fr = { b: [b.p.x, b.p.y, b.p.z, b.q.x, b.q.y, b.q.z, b.q.w], k: this.kicker.st1, g: this.keeper.st1, n: null };
    this.rec.push(fr);
    if (this.rec.length > 60 * 14) this.rec.shift();
  }
  startReplay(kind) {
    const rec = this.rec; if (rec.length < 30) { this.nextTurn(); return; }
    this.phase = 'replay';
    this.ui.el.replayTag.classList.remove('hidden');
    this.ui.hint('BOŞLUK / TIKLA: GEÇ');
    // find impact frame (first frame where ball moves)
    let iImp = rec.findIndex(f => Math.abs(f.b[2] - this.spot.z) > 0.05);
    if (iImp < 0) iImp = 40;
    const start = Math.max(0, iImp - 50);
    const end = rec.length - 1;
    const goalSide = this.shot.target.x >= 0 ? 1 : -1;
    let cams;
    if (this.shot.by === 'cpu') cams = kind === 'save' ? ['side', 'net'] : ['net', 'side'];
    else cams = kind === 'goal' ? ['net', 'side'] : kind === 'save' ? ['side', 'chase'] : ['side'];
    this.replay = { cams, ci: 0, i: start, start, end, speed: 0.4, goalSide, done: false, iImp };
    this.setReplayCam();
    this.world.goal.panels.forEach(p => { p.d.fill(0); p.vel.fill(0); });
    this.audio.whoosh(0.6, 300, 2500, 0.2);
    this.fade(0);
  }
  setReplayCam() {
    const R = this.replay; const cam = R.cams[R.ci];
    this.cam.set('replay', { cam, side: R.goalSide }, true);
    R.i = R.start;
  }
  skipReplay() { if (this.phase === 'replay') this.endReplay(); }
  endReplay() {
    this.replay = null; this.ui.el.replayTag.classList.add('hidden'); this.ui.hint('');
    this.phase = 'result';
    this.fade(1); this.later(0.35, () => this.nextTurn());
  }
  updateReplay(dt) {
    const R = this.replay; if (!R) return;
    const rec = this.rec;
    // faster before impact, slow through the ball flight
    const sp = R.i < R.iImp - 6 ? 0.9 : R.speed;
    R.i += dt * 60 * sp;
    if (R.i >= R.end) {
      R.ci++;
      if (R.ci >= R.cams.length) { this.endReplay(); return; }
      this.setReplayCam(); return;
    }
    const i0 = Math.floor(R.i), t = R.i - i0, a = rec[i0], b = rec[Math.min(i0 + 1, rec.length - 1)];
    this.kicker.applyLerp(a.k, b.k, t); this.keeper.applyLerp(a.g, b.g, t);
    const bp = this.ballMesh.position; bp.set(lerp(a.b[0], b.b[0], t), lerp(a.b[1], b.b[1], t), lerp(a.b[2], b.b[2], t));
    this.ballMesh.quaternion.set(a.b[3], a.b[4], a.b[5], a.b[6]).slerp(new THREE.Quaternion(b.b[3], b.b[4], b.b[5], b.b[6]), t);
    // approximate net response by re-pressing where the ball is inside the goal
    if (bp.z < 0.1 && bp.z > -2.4) this.world.goal.ripple(bp, 0.22, 0.6);
    this.replayBall = bp;
  }

  /* ============================================================= per-frame update */
  frame(dtReal) {
    const dt = Math.min(dtReal, 0.1);
    if (!this.paused) this.time += dt;
    // real-time timers (also while paused? no)
    if (!this.paused) {
      for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; if (this.time >= t.t) { this.timers.splice(i, 1); t.fn(); } }
    }
    if (!this.paused && this.phase !== 'replay' && this.phase !== 'boot') {
      this.simAcc += dt * this.timeScale;
      let n = 0;
      while (this.simAcc >= H && n < 6) { this.stepSim(); this.simAcc -= H; n++; }
      if (n === 6) this.simAcc = 0;
    }
    const alpha = this.simAcc / H;
    if (this.phase === 'replay' && !this.paused) this.updateReplay(dt);
    else this.renderActors(alpha);
    this.updateInput(dt);
    this.updateBallVisual(alpha);
    // stadium
    const st = this.world.stadium;
    this.excite = lerp(this.excite, this.exciteTarget, 1 - Math.exp(-dt * 1.5));
    st.excite = this.excite;
    if (!this.paused) this.world.update(dt, this.time);
    this.updateCamera(dt);
    // post fx parameters
    const P = this.fx.params;
    P.focus = this.cam.focus; P.range = this.cam.range; P.aperture = this.cam.aperture * (this.settings.quality === 'low' ? 0 : 1);
    P.fade = lerp(P.fade, this.fadeTarget, 1 - Math.exp(-dt * 9));
    P.vignette = 0.42 + 0.12 * (this.phase === 'charge' ? 1 : 0);
    this.updateHUD(dt);
  }

  renderActors(alpha) {
    for (const a of this.activeActors()) {
      if (!a.st0 || !a.st1) continue;
      a.applyLerp(a.st0, a.st1, clamp(alpha, 0, 1));
    }
  }
  updateBallVisual(alpha) {
    if (this.phase === 'replay') return;
    const b = this.ball, pv = this.ballPrev;
    if (b.state === 'rest') { this.ballMesh.position.copy(b.p); this.ballMesh.quaternion.copy(b.q); return; }
    this.ballMesh.position.lerpVectors(pv.p, b.p, clamp(alpha, 0, 1));
    this.ballMesh.quaternion.copy(pv.q).slerp(b.q, clamp(alpha, 0, 1));
  }

  aimRay() {
    const c = this.camera;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.mouseNDC.set(this.pointer.x / w * 2 - 1, -(this.pointer.y / h) * 2 + 1);
    this.raycaster.setFromCamera(this.mouseNDC, c);
    const hit = this.raycaster.ray.intersectPlane(this.planeZ0, this.tmp);
    return hit;
  }

  updateInput(dt) {
    const ph = this.phase;
    const aiming = ph === 'aim' || ph === 'charge' || ph === 'wait' || ph === 'defend' || (ph === 'flight' && this.shot?.by === 'cpu' && !this.diveCommitted);
    if (aiming && this.pointer.has) {
      const hit = this.aimRay();
      if (hit) { this.aimTarget.set(clamp(hit.x, -4.9, 4.9), clamp(hit.y, 0.08, 3.3), 0); }
    }
    // keyboard aiming
    const K = this.keys || {};
    if (aiming) {
      const sx = (K.ArrowRight ? 1 : 0) - (K.ArrowLeft ? 1 : 0), sy = (K.ArrowUp ? 1 : 0) - (K.ArrowDown ? 1 : 0);
      if (sx || sy) { this.aimTarget.x = clamp(this.aimTarget.x + sx * dt * 3.5, -4.9, 4.9); this.aimTarget.y = clamp(this.aimTarget.y + sy * dt * 2.2, 0.08, 3.3); this.pointer.has = false; }
    }
    // smooth + wobble
    const t = this.time;
    const amp = (0.03 + 0.11 * this.pressure) * (ph === 'charge' ? 1.6 : 1) * (ph === 'aim' || ph === 'charge' ? 1 : 0);
    const wob = v3((Math.sin(t * 1.9) + 0.6 * Math.sin(t * 3.7 + 1.2)) * amp, (Math.sin(t * 1.4 + 0.5) + 0.6 * Math.sin(t * 3.1)) * amp * 0.8, 0);
    if (this.diveCommitted && (ph === 'defend' || ph === 'flight') && this.shot?.by === 'cpu') { /* lock */ }
    else {
      this.aim.x = lerp(this.aim.x, this.aimTarget.x, 1 - Math.exp(-dt * 16)); this.aim.y = lerp(this.aim.y, this.aimTarget.y, 1 - Math.exp(-dt * 16));
    }
    this.aimShown = this.aim.clone().add(wob);
    if (ph === 'aim' || ph === 'charge') { this.aimFinal = this.aimShown; }
    // for fire(): use the wobbled point
    if (ph === 'charge') this.aim.copy(this.aim);
    // charging
    if (ph === 'charge') {
      this.chargeT += dt;
      const period = 1.55;
      const u = (this.chargeT / period) % 2; this.power = u < 1 ? u : 2 - u;
      this.ui.power(this.power);
    }
    if (ph === 'aim') this.ui.power(0);
  }
  // final aim used at release includes the wobble
  get aimAtFire() { return this.aimShown || this.aim; }

  updateCamera(dt) {
    const k = this.kicker, g = this.keeper;
    const S = this.camState || (this.camState = {});
    S.ball = this.ballMesh.position; S.ballVel = this.ball.v; S.ballRest = this.spot;
    const sp = this.spot;
    S.aimCamPos = this.kickStart ? v3(sp.x + 1.25, 2.05, this.kickStart.z + 5.6) : v3(1.1, 2.05, sp.z + 9.2);
    S.aimLook = v3(-0.1, 1.0, sp.z - 7.5);
    S.runCamPos = v3(sp.x + 0.8, 1.75, sp.z + 6.6);
    S.kickerChest = k ? k.root.position.clone().add(v3(0, 1.3, 0)) : v3(0, 1.3, 12);
    S.kickerPos = k ? k.root.position : v3(0, 0, 11);
    S.keeperPos = g ? g.root.position : v3(0, 0, 0.3);
    S.keeperX = g ? g.root.position.x : 0;
    S.goalMid = v3(0, 1.2, 0);
    S.aim = this.aim;
    S.focusPoint = k ? k.root.position.clone().add(v3(0, 1.2, 0)) : null;
    if (this.phase === 'aim' || this.phase === 'charge') S.focusPoint = this.spot.clone().lerp(v3(0, 1, 0), 0.25);
    if (this.phase === 'replay') S.ball = this.ballMesh.position;
    this.cam.update(dt, S);
  }

  updateHUD(dt) {
    const ui = this.ui, ph = this.phase;
    // reticle
    const showAim = (ph === 'aim' || ph === 'charge') || ((ph === 'wait' || ph === 'defend') && !this.diveCommitted) || (ph === 'flight' && this.shot?.by === 'cpu' && !this.diveCommitted && this.simTime - (this.shot.impactTime ?? 0) < 0.28);
    const lockedDef = this.diveCommitted && (ph === 'wait' || ph === 'defend' || ph === 'flight') && this.shot?.by !== 'player';
    if (showAim || lockedDef) {
      const p = (ph === 'aim' || ph === 'charge') ? (this.aimShown || this.aim) : this.aim;
      this.tmp.copy(p).project(this.camera);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const x = (this.tmp.x * 0.5 + 0.5) * w, y = (-this.tmp.y * 0.5 + 0.5) * h;
      ui.reticle(x, y, true, lockedDef ? 'locked' : (ph === 'aim' || ph === 'charge') ? '' : 'defend');
    } else ui.reticle(0, 0, false);
    // fps + adaptive resolution
    this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 0.5) {
      const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; this.fps = fps;
      if (!ui.el.fps.classList.contains('hidden')) ui.el.fps.textContent = `${fps.toFixed(0)} fps • ${this.fx.size.x}×${this.fx.size.y} • ${this.settings.quality}`;
      this.adaptResolution(fps);
    }
  }
  adaptResolution(fps) {
    if (this.paused || this.phase === 'boot' || this.phase === 'menu' && false) return;
    const s = this.settings;
    if (!s.autoScale) return;
    this.lowCount = (fps < 40 ? (this.lowCount || 0) + 1 : 0); this.highCount = (fps > 57 ? (this.highCount || 0) + 1 : 0);
    if (this.lowCount >= 3 && s.renderScale > 0.55) { s.renderScale = Math.max(0.55, s.renderScale - 0.1); this.onResize(); this.lowCount = 0; }
    else if (this.highCount >= 10 && s.renderScale < s.maxScale) { s.renderScale = Math.min(s.maxScale, s.renderScale + 0.05); this.onResize(); this.highCount = 0; }
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * this.settings.renderScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.fx.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  render(dt) {
    this.fx.render(this.scene, this.camera, dt);
  }
}
