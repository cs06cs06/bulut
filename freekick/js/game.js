import * as THREE from 'three';
import { FIELD, BALL, PHYS, DIFFICULTY, TEAM } from './config.js';
import { stepBall, collideGoalFrame, collideBoards, collideCapsule, closestOnSegment, sampleTrajectory, BallState } from './physics.js';
import { Ball } from './ball.js';
import { Net } from './net.js';
import { Stadium } from './stadium.js';
import { Character } from './rig.js';
import { Keeper } from './keeper.js';
import { DefensiveWall } from './wall.js';
import { Kicker } from './kicker.js';
import { analyzeSwipe, buildShot } from './shot.js';
import { CameraDirector } from './camera.js';
import { Particles } from './fx.js';

const R = BALL.radius;
const HW = FIELD.goalHalfWidth;
const GH = FIELD.goalHeight;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch (e) { /* not supported */ } };

const store = {
  get(k, d) { try { const v = localStorage.getItem('frikik.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('frikik.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};
export { store };

function makeTargetRing() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.4), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.52, 48), mat);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.44, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const dot = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 24), mat);
  g.add(ring, inner, dot);
  g.renderOrder = 4;
  g.userData = { ring, inner, mat };
  return g;
}

function makePreview() {
  const n = 46;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.arc(16, 16, 12, 0, 7); x.fill();
  const mat = new THREE.PointsMaterial({ size: 7 * Math.min(2, devicePixelRatio || 1), sizeAttenuation: false, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.85, depthWrite: false, color: 0xfff2b0 });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  p.visible = false;
  return p;
}

export class Game {
  constructor(engine, assets, audio, ui, input) {
    this.engine = engine;
    this.audio = audio;
    this.ui = ui;
    this.input = input;
    const scene = engine.scene;
    this.stadium = new Stadium(scene, assets, engine.quality);
    this.ball = new Ball(scene);
    this.net = new Net(scene);
    this.fx = new Particles(scene);
    this.camera = new CameraDirector(engine.camera);
    this.ring = makeTargetRing();
    scene.add(this.ring);
    this.preview = makePreview();
    scene.add(this.preview);

    const skins = [0x8d5a3b, 0xe8b894, 0xc98f6b, 0x5a3825, 0xd9a27e, 0xb07a55];
    const hair = [0x1d1510, 0x2b1d12, 0x0e0c0a, 0x5a3a1a, 0x1d1510, 0x7a5a30];
    const add = (c) => { scene.add(c.root); return c; };
    this.keeper = new Keeper(add(new Character(assets.xbot, { kit: TEAM.keeper, keeper: true, number: 1, skin: 0xe0ac86, hair: 0x3a2412, boot: 0x0b0b0b, glove: 0x39d353 })));
    const wallChars = [];
    for (let i = 0; i < 5; i++) {
      wallChars.push(add(new Character(assets.xbot, { kit: TEAM.away, number: [4, 5, 6, 8, 3][i], skin: skins[i], hair: hair[i], bootAccent: [0xffd23f, 0xffffff, 0xff5a36, 0x6ee7ff, 0xffffff][i] })));
    }
    this.wall = new DefensiveWall(wallChars);
    this.kicker = new Kicker(add(new Character(assets.xbot, { kit: TEAM.home, number: 10, skin: 0xd9a27e, hair: 0x1a120c, bootAccent: 0xffd23f })));

    this.state = 'menu';
    this.time = 0;
    this.timeScale = 1;
    this.slowmo = 1;
    this.wind = new THREE.Vector3();
    this.mode = 'career';
    this.best = store.get('best', 0);
    this.recording = [];
    this.replayT = 0;
    this.hintShots = store.get('hinted', 0) < 2 ? 2 : 0;

    input.onSwipe = (pts) => this.onSwipe(pts);
    input.onStart = () => { if (this.state === 'aim') this.ui.hint(false); };
    input.onMove = (pts) => this.onSwipeMove(pts);

    this.ctx = {
      ball: this.ball, time: 0, wind: this.wind, ballLive: false,
      onKeeperLand: (soft) => this.audio.play('body', { vol: soft ? 0.25 : 0.55, rate: 0.8 }),
      onLand: () => this.audio.play('step' + Math.floor(Math.random() * 4), { vol: 0.25, rate: 0.9 }),
    };
    this.setupShot(this.demoSpot(), true);
    this.camera.setMode('menu');
  }

  demoSpot() { return { x: -4.5, z: 23, diff: DIFFICULTY[1], wall: 4, wind: 0 }; }

  // ------------------------------------------------------------------ flow
  start(mode) {
    this.mode = mode;
    this.score = 0; this.goals = 0; this.shots = 0; this.lives = 3; this.streak = 0; this.bestStreak = 0;
    this.ui.hideMenu();
    this.ui.hideOver();
    this.ui.showHud(mode);
    this.ui.setScore(0, true);
    this.ui.setLives(3);
    this.ui.setStreak(0);
    this.nextShot(true);
  }

  toMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.ui.replay(false);
    this.ui.clearToast();
    this.ui.hint(false);
    this.ui.hideOver();
    this.ui.pause(false);
    this.preview.visible = false;
    this.setupShot(this.demoSpot(), true);
    this.camera.setMode('menu');
    this.ui.showMenu(this.best);
  }

  pickSpot() {
    const lvl = this.mode === 'career' ? this.goals : Math.floor(rand(0, 8));
    const diff = DIFFICULTY[Math.min(DIFFICULTY.length - 1, Math.floor(lvl / 2))];
    const dist = THREE.MathUtils.clamp(rand(18.5, 21.5) + lvl * 0.85, 18.5, 31);
    const maxAng = Math.min(0.62, 0.16 + lvl * 0.06);
    const ang = rand(-maxAng, maxAng);
    let x = Math.sin(ang) * dist, z = Math.cos(ang) * dist;
    if (Math.abs(x) < FIELD.boxHalfWidth + 0.5 && z < FIELD.boxDepth + 1.2) z = FIELD.boxDepth + 1.2 + Math.random() * 1.5;
    const wall = Math.max(2, diff.wall - (Math.abs(x) > 11 ? 1 : 0));
    return { x, z, diff, wall, wind: rand(0, diff.wind) };
  }

  setupShot(spot, quiet) {
    this.spot = spot;
    this.diff = spot.diff;
    this.ball.place(spot.x, spot.z);
    this.ball.attached = null;
    this.ball.trail.reset();
    this.net.reset();
    const bp = this.ball.state.p;
    const wallInfo = this.wall.setup(bp, spot.wall);
    this.wallInfo = wallInfo;
    this.keeper.setup(bp, wallInfo.edgeX, spot.diff);
    const toGoal = new THREE.Vector3(-bp.x * 0.8, 0, -bp.z).normalize();
    this.kicker.setup(bp, toGoal);
    this.stadium.setSpray(true, bp, wallInfo.a, wallInfo.b);
    const wa = Math.random() * Math.PI * 2;
    this.wind.set(Math.sin(wa) * spot.wind, 0, Math.cos(wa) * spot.wind);
    // bonus target in a corner
    const tx = (Math.random() < 0.5 ? -1 : 1) * (HW - 0.62);
    const ty = Math.random() < 0.72 ? GH - 0.58 : 0.62;
    this.ring.position.set(tx, ty, 0.03);
    this.ring.visible = !quiet;
    this.flags = {};
    this.outcome = null;
    this.ctx.ballLive = false;
    this.slowmo = 1;
    this.slowmoUsed = false;
    this.recording.length = 0;
    this.preview.visible = false;
    this.engine.focusShadow(new THREE.Vector3(bp.x * 0.4, 0, bp.z * 0.5), 20);
  }

  nextShot(first) {
    this.shots = (this.shots || 0) + 1;
    const spot = this.pickSpot();
    const go = () => {
      this.setupShot(spot);
      this.ui.setShot(this.shots);
      const bp = this.ball.state.p;
      this.ui.setShotInfo({
        distance: Math.hypot(bp.x, bp.z),
        wind: spot.wind,
        windAngle: Math.atan2(this.wind.x, -this.wind.z),
        wall: spot.wall,
      });
      this.camera.setMode('aim', { snap: true, ball: bp });
      this.state = 'setup';
      this.stateT = 0;
      this.ui.fade(false);
    };
    if (first) { go(); return; }
    this.ui.fade(true);
    setTimeout(go, 380);
  }

  // ------------------------------------------------------------------ input
  onSwipeMove(pts) {
    if (this.state !== 'aim' || this.mode !== 'practice') return;
    const g = analyzeSwipe(pts, innerHeight);
    if (!g || !g.valid) { this.preview.visible = false; return; }
    const shot = buildShot(g, this.engine.camera, this.ball.state.p, innerWidth, innerHeight, this.wind, true);
    const s = new BallState();
    s.p.copy(this.ball.state.p); s.v.copy(shot.v); s.w.copy(shot.w);
    const pts3 = sampleTrajectory(s, this.wind, 2.2, 1 / 24);
    const arr = this.preview.geometry.attributes.position.array;
    const n = arr.length / 3;
    for (let i = 0; i < n; i++) {
      const p = pts3[Math.min(i, pts3.length - 1)] || s.p;
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    }
    this.preview.geometry.attributes.position.needsUpdate = true;
    this.preview.visible = true;
  }

  onSwipe(pts) {
    if (this.state !== 'aim') return;
    this.preview.visible = false;
    const g = analyzeSwipe(pts, innerHeight);
    if (!g || !g.valid) {
      this.ui.hint(true, 'Kaleye doğru daha uzun kaydır');
      return;
    }
    this.shot = buildShot(g, this.engine.camera, this.ball.state.p, innerWidth, innerHeight, this.wind);
    this.state = 'runup';
    this.stateT = 0;
    this.input.enabled = false;
    this.ui.hint(false);
    if (this.hintShots > 0) { this.hintShots--; store.set('hinted', store.get('hinted', 0) + 1); }
    this.camera.setMode('runup');
    this.audio.setTension(0.25);
    this.kicker.go(() => this.launch(), (i) => {
      this.audio.play('step' + (i % 4), { vol: i === 9 ? 0.5 : 0.3, rate: 1.05 });
      // the wall reads the run-up and times its jump with the strike
      if (i === 9) this.wall.onKick();
    });
  }

  launch() {
    const bs = this.ball.state;
    const shot = this.shot;
    bs.v.copy(shot.v);
    bs.w.copy(shot.w);
    bs.knuckle = shot.knuckle;
    bs.knucklePhase = Math.random() * 10;
    bs.onGround = false;
    this.state = 'flight';
    this.stateT = 0;
    this.flightT = 0;
    this.ctx.ballLive = true;
    const power = clamp01((shot.V - 12) / 21);
    this.audio.play(power > 0.6 ? 'kick' : 'kick2', { vol: 0.55 + power * 0.45, rate: 1.1 - power * 0.2 });
    this.fx.turf(bs.p, shot.v.clone().normalize());
    buzz(12 + Math.round(power * 18));
    this.camera.kick(0.35 + power * 0.4);
    this.camera.setMode('flight');
    // a keeper is screened when the ball flies over or around the wall
    const screened = this.isScreened(shot);
    this.keeper.onKick(this.time, screened);
    this.ball.trail.active = true;
    const curl = Math.abs(shot.side) > 28;
    this.ball.trail.setColor(shot.knuckle > 0.3 ? 0x8ff3ff : curl ? 0xffd23f : shot.V > 29 ? 0xff8a3d : 0xffffff);
    this.flags = { curl, power: shot.V > 29.5, knuckle: shot.knuckle > 0.3, lob: shot.pitch > 0.42 };
    this.launchTime = this.time;
    this.ballStart = bs.p.clone();
    this.ctx.shotDir = new THREE.Vector3(shot.v.x, 0, shot.v.z).normalize();
  }

  isScreened(shot) {
    const w = this.wallInfo;
    if (!w || this.spot.wall < 3) return false;
    const mid = w.a.clone().add(w.b).multiplyScalar(0.5);
    const d = Math.hypot(mid.x - this.ball.state.p.x, mid.z - this.ball.state.p.z);
    const s = new BallState();
    s.copy(this.ball.state);
    const pts = sampleTrajectory(s, this.wind, d / Math.max(10, shot.V) + 0.2, 1 / 60);
    for (const p of pts) {
      const c = closestOnSegment(p, w.a, w.b, new THREE.Vector3());
      if (Math.hypot(p.x - c.x, p.z - c.z) < 0.4) return p.y < 3.2;
    }
    return false;
  }

  // ------------------------------------------------------------------ physics
  physics(dt) {
    const bs = this.ball.state;
    const step = PHYS.step;
    const n = Math.max(1, Math.ceil(dt / step - 1e-6));
    const h = dt / n;
    const prev = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      if (this.ball.attached) {
        bs.p.copy(this.keeper.holdPoint);
        bs.v.set(0, 0, 0);
        bs.w.multiplyScalar(0.9);
        continue;
      }
      prev.copy(bs.p);
      const impact = stepBall(bs, h, this.wind, this.flightT);
      this.flightT += h;
      if (impact > 1.6) this.audio.play('bounce', { vol: Math.min(0.8, impact / 10), pan: bs.p.x / 20 });

      if (collideBoards(bs)) this.audio.play('body', { vol: 0.35, rate: 1.3 });
      const post = collideGoalFrame(bs);
      if (post && post.impact > 0.8) {
        this.flags.post = post.part;
        this.flags.postT = this.flightT;
        this.audio.play(Math.random() < 0.5 ? 'post' : 'post2', { vol: Math.min(1, 0.4 + post.impact / 20), rate: 0.95 });
        this.camera.kick(Math.min(1, 0.4 + post.impact / 25));
        this.fx.chips(bs.p);
        this.net.poke(bs.p, 0.03);
        buzz([30, 30, 40]);
        if (!this.flags.goal) this.audio.crowd('ooh', 0.9);
      }

      for (const c of this.wall.colliders || []) {
        const imp = collideCapsule(bs, c, PHYS.bodyRestitution, c.vel);
        if (imp > 0.5) {
          this.flags.wall = true;
          this.flags.wallT = this.flightT;
          this.audio.play(c.part === 'head' ? 'glove' : 'body', { vol: Math.min(1, 0.3 + imp / 25), rate: c.part === 'head' ? 0.8 : 1 });
          this.fx.chips(bs.p);
        }
      }

      for (const c of this.keeper.colliders || []) {
        closestOnSegment(bs.p, c.a, c.b, tmp);
        if (tmp.distanceTo(bs.p) > R + c.r) continue;
        if (c.part === 'hand' || c.part === 'arm') {
          const res = this.keeper.handleTouch(bs, c);
          if (res === 'catch') {
            this.ball.attached = this.keeper;
            this.flags.caught = true;
            this.flags.keeper = true;
            this.audio.play('glove', { vol: 0.9, rate: 0.9 });
            break;
          }
        }
        const imp = collideCapsule(bs, c, c.part === 'hand' ? 0.42 : 0.3, c.vel);
        if (imp > 0.5) {
          this.flags.keeper = true;
          this.flags.parry = true;
          this.flags.parryT = this.flightT;
          if (c.part === 'hand' || c.part === 'arm') {
            // gloves push the ball away from goal
            bs.v.z = Math.max(bs.v.z, 1.5 + bs.v.length() * 0.12);
            bs.v.x += Math.sign(bs.p.x || 1) * 1.2;
          }
          this.audio.play(c.part === 'hand' ? 'glove' : 'body', { vol: Math.min(1, 0.4 + imp / 22) });
          this.camera.kick(0.35);
        }
      }

      const netHit = this.net.interactBall(bs, h);
      if (netHit > 3 && !this.flags.netSound) {
        this.flags.netSound = true;
        this.audio.play('net', { vol: Math.min(1, 0.4 + netHit / 25), rate: 0.9 });
      }

      // the whole ball over the line, between the posts and under the bar
      if (!this.flags.goal && prev.z >= -R && bs.p.z < -R && Math.abs(bs.p.x) < HW && bs.p.y < GH) {
        this.flags.goal = true;
        this.flags.goalAt = { x: bs.p.x, y: bs.p.y };
        this.onGoal();
      }
      if (!this.flags.crossed && prev.z > 0 && bs.p.z <= 0) {
        this.flags.crossed = { x: bs.p.x, y: bs.p.y, t: this.flightT };
      }
    }
  }

  // ------------------------------------------------------------------ outcomes
  onGoal() {
    const gx = this.flags.goalAt;
    const hitRing = Math.hypot(gx.x - this.ring.position.x, gx.y - this.ring.position.y) < 0.6;
    this.flags.ring = hitRing;
    this.stadium.cheer(1, 7);
    this.audio.crowd('goal', 1);
    this.audio.crowd('goal2', 0.55);
    this.audio.setTension(1);
    this.slowmo = 0.45;
    this.slowmoT = 0.5;
    this.camera.kick(0.5);
    buzz([40, 60, 80]);
    this.fx.confetti(new THREE.Vector3(0, 0, 0));
    this.resolve('goal');
  }

  checkEnd() {
    const bs = this.ball.state;
    const f = this.flags;
    if (this.outcome) return;
    if (f.caught) { this.resolve('caught'); return; }
    const stopped = bs.onGround && bs.v.lengthSq() < 0.5;
    const gone = bs.p.z < -2.6 || Math.abs(bs.p.x) > 30 || bs.p.z > this.spot.z + 12;
    const crossedLong = f.crossed && this.flightT > f.crossed.t + 0.5;
    const late = this.flightT > 5.5;
    // deflections that are clearly not going in end the play early
    const headingIn = bs.v.z < -1 && bs.p.z > -R && bs.p.z < 4 && Math.abs(bs.p.x) < HW + 0.5;
    const parryDone = f.parry && this.flightT > f.parryT + 1.1 && !headingIn;
    const wallDone = f.wall && !f.parry && this.flightT > f.wallT + 1.2 && !headingIn;
    if (stopped || gone || crossedLong || late || parryDone || wallDone) {
      if (f.parry) this.resolve('parry');
      else if (f.wall && !f.crossed) this.resolve('wall');
      else if (f.post) this.resolve('post');
      else if (f.crossed) this.resolve(f.crossed.y > GH + R ? 'over' : 'wide');
      else this.resolve('short');
    }
  }

  resolve(outcome) {
    this.outcome = outcome;
    this.state = 'result';
    this.stateT = 0;
    this.outcomeTime = this.time;
    this.camera.setMode('result');
    const goal = outcome === 'goal';
    const f = this.flags;
    let points = 0;
    const bonuses = [];
    if (goal) {
      this.goals++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      points = 100;
      if (f.ring) { points += 100; bonuses.push('Hedef +100'); }
      if (f.curl) { points += 50; bonuses.push('Falso +50'); }
      if (f.power) { points += 50; bonuses.push('Füze +50'); }
      if (f.knuckle) { points += 75; bonuses.push('Yaprak +75'); }
      if (f.post) { points += 75; bonuses.push('Direkten gol +75'); }
      if (f.keeper) { points += 25; bonuses.push('Kaleciye rağmen +25'); }
      const mult = Math.min(3, 1 + (this.streak - 1) * 0.5);
      if (mult > 1) bonuses.push('Seri x' + mult);
      points = Math.round(points * mult);
      this.score += points;
      this.ui.setScore(this.score);
      this.ui.setStreak(this.streak);
      const dist = Math.hypot(this.spot.x, this.spot.z);
      const big = f.ring || (f.curl && f.post) ? 'MUHTEŞEM!' : 'GOOOL!';
      this.ui.toast(big, `+${points} · ${dist.toFixed(0)} metreden`, 'goal', bonuses, 2.4);
      this.kicker.setReaction('goal');
      this.keeper.react('goal');
    } else {
      this.streak = 0;
      this.ui.setStreak(0);
      if (this.mode === 'career') { this.lives--; this.ui.setLives(this.lives); }
      const close = f.post || (f.crossed && Math.abs(Math.abs(f.crossed.x) - HW) < 0.9 && f.crossed.y < GH + 0.9);
      const msg = {
        caught: ['KURTARIŞ!', 'Kaleci topu kontrol etti'],
        parry: ['KURTARIŞ!', 'Kaleci son anda çeldi'],
        wall: ['BARAJ!', 'Top baraja çarptı'],
        post: [f.post === 'bar' ? 'ÜST DİREK!' : 'DİREK!', 'Kıl payı'],
        over: ['ÜSTTEN AUT', close ? 'Az farkla üstten' : 'Çok yükseldi'],
        wide: ['AUT', close ? 'Az farkla dışarıda' : 'Kaleyi bulmadı'],
        short: ['KISA KALDI', 'Daha hızlı kaydır'],
      }[outcome];
      this.ui.toast(msg[0], msg[1], 'bad', [], 2.0);
      this.kicker.setReaction(close ? 'close' : 'miss');
      if (outcome === 'caught' || outcome === 'parry') {
        this.keeper.react('save');
        this.stadium.cheer(0.45, 3);
        this.audio.crowd('applause', 0.6);
      } else if (close) {
        this.stadium.cheer(0.5, 2.5);
      } else {
        this.audio.crowd('miss', 0.8);
      }
      this.audio.setTension(0);
    }
    this.lastPoints = points;
  }

  afterResult() {
    const goal = this.outcome === 'goal';
    const spectacular = goal || this.outcome === 'post' || (this.outcome === 'parry' && this.flags.keeper);
    if (spectacular && this.recording.length > 30) { this.startReplay(); return; }
    this.advance();
  }

  advance() {
    if (this.mode === 'career' && this.lives <= 0) { this.gameOver(); return; }
    this.nextShot();
  }

  gameOver() {
    this.state = 'over';
    const newBest = this.score > this.best;
    if (newBest) { this.best = this.score; store.set('best', this.best); }
    this.ui.gameOver({ score: this.score, goals: this.goals, bestStreak: this.bestStreak, best: this.best, newBest });
  }

  // ------------------------------------------------------------------ replay
  record() {
    const b = this.ball;
    this.recording.push({
      t: this.time,
      p: b.state.p.clone(),
      q: b.mesh.quaternion.clone(),
      trail: b.trail.active,
      keeper: this.keeper.c.snapshot(),
      kicker: this.kicker.c.snapshot(),
      wall: this.wall.players.filter((p) => p.active).map((p) => p.c.snapshot()),
    });
    if (this.recording.length > 60 * 9) this.recording.shift();
  }

  startReplay() {
    this.state = 'replay';
    this.ui.fade(true);
    setTimeout(() => {
      if (this.state !== 'replay') return;
      this.ui.fade(false);
      this.ui.replay(true);
      this.replayT = Math.max(this.recording[0].t, (this.launchTime ?? 0) - 0.4);
      this.replayEnd = Math.min(this.recording[this.recording.length - 1].t, (this.outcomeTime ?? 0) + 1.3);
      this.replayProxy = new BallState();
      this.net.reset();
      this.ball.trail.reset();
      const angles = ['behind', 'side', 'chase'];
      const angle = this.outcome === 'goal' ? angles[Math.floor(Math.random() * 3)] : 'side';
      this.camera.setMode('replay', { angle, sideSign: Math.sign(this.spot.x || 1) * -1 || 1, cut: true });
      this.replaying = true;
    }, 380);
  }

  stopReplay() {
    if (this.state !== 'replay') return;
    this.replaying = false;
    this.ui.replay(false);
    this.advance();
  }

  playReplay(dt) {
    if (!this.replaying) return;
    this.replayT += dt * 0.5;
    const rec = this.recording;
    if (this.replayT >= this.replayEnd) { this.stopReplay(); return; }
    let i = 0;
    while (i < rec.length - 2 && rec[i + 1].t < this.replayT) i++;
    const a = rec[i], b = rec[i + 1] || a;
    const f = b.t > a.t ? clamp01((this.replayT - a.t) / (b.t - a.t)) : 0;
    const bs = this.ball.state;
    bs.p.lerpVectors(a.p, b.p, f);
    this.ball.mesh.quaternion.slerpQuaternions(a.q, b.q, f);
    this.ball.trail.active = a.trail;
    this.keeper.c.applySnapshot(a.keeper, b.keeper, f);
    this.kicker.c.applySnapshot(a.kicker, b.kicker, f);
    const act = this.wall.players.filter((p) => p.active);
    act.forEach((p, k) => { if (a.wall[k]) p.c.applySnapshot(a.wall[k], b.wall[k] || a.wall[k], f); });
    // let the net react to the replayed ball
    const px = this.replayProxy;
    px.v.subVectors(b.p, a.p).multiplyScalar(1 / Math.max(1e-3, b.t - a.t));
    px.p.copy(bs.p);
    this.net.interactBall(px, dt * 0.5);
  }

  // ------------------------------------------------------------------ frame
  update(dtReal) {
    const dtClamped = Math.min(dtReal, 1 / 20);
    if (this.paused) { this.render(dtReal); return; }
    if (this.slowmoT > 0) {
      this.slowmoT -= dtClamped;
      if (this.slowmoT <= 0) this.slowmo = 1;
    }
    this.timeScale += (this.slowmo - this.timeScale) * Math.min(1, dtClamped * 10);
    const dt = dtClamped * this.timeScale;
    this.time += dt;
    this.ctx.time = this.time;
    this.stateT = (this.stateT || 0) + dtClamped;

    switch (this.state) {
      case 'setup':
        if (this.stateT > 0.5 && !this.whistled) { this.whistled = true; this.audio.play('whistle', { vol: 0.5 }); }
        if (this.stateT > 0.9) {
          this.state = 'aim';
          this.whistled = false;
          this.input.enabled = true;
          if (this.hintShots > 0) this.ui.hint(true, 'Kaydır ve vur');
        }
        break;
      case 'flight': {
        const bs = this.ball.state;
        // dramatic slow motion for close calls at the goal mouth
        if (!this.slowmoUsed && bs.p.z < 3.4 && bs.p.z > 0.2 && bs.v.z < 0) {
          const palm = this.keeper.colliders?.find((c) => c.part === 'hand');
          const nearKeeper = palm && palm.a.distanceTo(bs.p) < 1.6;
          const nearPost = Math.abs(Math.abs(bs.p.x) - HW) < 0.7 && bs.p.y < GH + 0.5;
          const nearBar = Math.abs(bs.p.y - GH) < 0.5 && Math.abs(bs.p.x) < HW + 0.3;
          if (nearKeeper || nearPost || nearBar) { this.slowmoUsed = true; this.slowmo = 0.28; this.slowmoT = 0.5; }
        }
        const tension = clamp01(1 - bs.p.z / Math.max(8, this.spot.z));
        this.audio.setTension(0.3 + tension * 0.7);
        break;
      }
      case 'result':
        if (this.stateT > (this.outcome === 'goal' ? 2.6 : 2.1)) { this.state = 'post'; this.afterResult(); }
        break;
      default: break;
    }

    const replaying = this.state === 'replay' && this.replaying;
    if (replaying) {
      this.playReplay(dtClamped);
    } else {
      // characters first (they read the ball), then the ball against their new pose
      this.keeper.update(dt, this.ctx);
      this.wall.update(dt, this.ctx);
      this.kicker.update(dt, this.ctx);
      if (this.state === 'flight' || this.state === 'result' || this.state === 'post' || this.state === 'over') {
        if (this.ball.state.v.lengthSq() > 0 || this.ball.attached) this.physics(dt);
        if (this.state === 'flight') this.checkEnd();
      }
      if ((this.state === 'runup' || this.state === 'flight' || this.state === 'result') && this.stateT < 4) this.record();
      if (!this.ball.attached) this.ball.spin(dt);
      if (this.ball.state.onGround) this.ball.trail.active = false;
    }
    this.ball.sync();
    this.net.update(dt, this.ball.state.p);
    this.ball.trail.update(this.ball.state.p, this.engine.camera, dtClamped);
    if (this.state !== 'flight' && !replaying) this.ball.trail.active = false;

    // pulse the bonus ring
    if (this.ring.visible) {
      const s = 1 + Math.sin(this.time * 4) * 0.05;
      this.ring.scale.setScalar(s);
      this.ring.userData.mat.opacity = 0.6 + Math.sin(this.time * 4) * 0.25;
    }
    this.render(dtClamped, dt);
  }

  render(dtReal, dt = dtReal) {
    const e = this.engine;
    const pxScale = e.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(e.camera.fov) / 2));
    this.stadium.update(dt, this.time, pxScale);
    this.fx.update(dt, pxScale);
    this.camera.update(dtReal * (this.state === 'replay' ? 0.8 : 1), { ball: this.ball, focus: this.focusPoint(), aimBall: this.ball.state.p, shotDir: this.ctx.shotDir, ballStart: this.ballStart, wallDist: 9.15 });
    this.audio.update(dtReal);
    this.input.render(dtReal);
    this.ui.update(dtReal);
    if (!this.skipRender) e.render(this.time, 0);
  }

  focusPoint() {
    if (this.outcome === 'caught' || this.outcome === 'parry') return this.keeper.c.worldPos('spine2', new THREE.Vector3());
    return this.ball.state.p;
  }
}
