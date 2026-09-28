import * as THREE from 'three';
import { FIELD } from './config.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function dampV(cur, tgt, k, dt) { return cur.lerp(tgt, 1 - Math.exp(-k * dt)); }

/**
 * Broadcast-style camera: sits behind the ball for the aim, dollies in during the run-up,
 * chases the shot, holds on the goal mouth, and frames replays from reverse angles.
 */
export class CameraDirector {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'menu';
    this.pos = camera.position.clone();
    this.look = new THREE.Vector3(0, 1, 0);
    this.fov = 50;
    this.t = 0;
    this.shake = 0;
    this.shakeT = 0;
    this.orbit = 0;
  }

  aimFrame(ballPos) {
    // over the shooter's right shoulder: high enough that his run-up never hides the ball
    const toGoal = _v.set(-ballPos.x * 0.85, 0, -ballPos.z).normalize();
    const right = new THREE.Vector3(-toGoal.z, 0, toGoal.x);
    const back = ballPos.clone().addScaledVector(toGoal, -4.9).addScaledVector(right, 0.95);
    back.y = 2.15;
    const look = ballPos.clone().lerp(new THREE.Vector3(0, 0.9, 0), 0.64);
    look.y += 0.45;
    const dist = back.distanceTo(new THREE.Vector3(0, 1.2, 0));
    const aspect = this.cam.aspect;
    const hNeed = 2 * Math.atan((FIELD.goalHalfWidth + (aspect < 0.8 ? 2.4 : 3.6)) / dist);
    let vfov = 2 * Math.atan(Math.tan(hNeed / 2) / aspect);
    vfov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vfov), 44, 64);
    return { pos: back, look, fov: vfov };
  }

  setMode(mode, opts = {}) {
    this.mode = mode;
    this.t = 0;
    this.flightProg = undefined;
    Object.assign(this, { opts });
    if (opts.snap) {
      const f = this.aimFrame(opts.ball);
      this.pos.copy(f.pos); this.look.copy(f.look); this.fov = f.fov;
    }
  }

  kick(strength) {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1;
    this.shake = Math.max(this.shake, strength * calm);
  }

  update(dt, ctx) {
    this.t += dt;
    const ball = ctx.ball.state.p;
    let tPos, tLook, tFov, k = 4;
    switch (this.mode) {
      case 'menu': {
        this.orbit += dt * 0.07;
        const r = 30;
        tPos = _v.set(Math.sin(this.orbit) * r, 7 + Math.sin(this.orbit * 0.7) * 2, 16 + Math.cos(this.orbit) * r * 0.6);
        tLook = _w.set(0, 1.5, 4);
        tFov = 46; k = 1.5;
        break;
      }
      case 'aim': {
        const f = this.aimFrame(ctx.aimBall || ball);
        tPos = f.pos; tLook = f.look; tFov = f.fov;
        // handheld breathing
        tPos.x += Math.sin(this.t * 0.7) * 0.03; tPos.y += Math.sin(this.t * 0.9) * 0.02;
        tLook.x += Math.sin(this.t * 0.5 + 1) * 0.05;
        k = this.t < 0.1 ? 60 : 2.6;
        break;
      }
      case 'runup': {
        const f = this.aimFrame(ctx.aimBall || ball);
        const toGoal = _v.set(-ball.x, 0, -ball.z).normalize();
        tPos = f.pos.addScaledVector(toGoal, Math.min(1, this.t * 1.5) * 0.9);
        tPos.y -= 0.12;
        tLook = f.look; tFov = f.fov - 2;
        k = 3;
        break;
      }
      case 'flight': {
        // dolly along the original shot line, stopping short of the wall, and zoom
        const dir = _w.copy(ctx.shotDir || _v.set(-ball.x, 0, -ball.z)).setY(0).normalize();
        const start = ctx.ballStart || ball;
        const right = new THREE.Vector3(-dir.z, 0, dir.x);
        const ballProg = (ball.x - start.x) * dir.x + (ball.z - start.z) * dir.z;
        const maxProg = Math.max(0, (ctx.wallDist ?? 9.15) - 5.2);
        const prog = THREE.MathUtils.clamp(ballProg - 6.5, -4.6, maxProg);
        this.flightProg = Math.max(this.flightProg ?? -4.6, prog);
        const pr = this.flightProg;
        tPos = start.clone().addScaledVector(dir, pr).addScaledVector(right, 0.45);
        tPos.y = 1.75 + clamp01((pr + 4.6) / (maxProg + 4.6)) * 1.05 + Math.max(0, ball.y - 2) * 0.25;
        tLook = ball.clone().addScaledVector(ctx.ball.state.v, 0.05);
        tLook.y = Math.max(0.5, tLook.y * 0.8 + 0.3);
        const d = Math.max(2, tPos.distanceTo(ball));
        let hfov = 2 * Math.atan(6.5 / d);
        let vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / this.cam.aspect));
        tFov = THREE.MathUtils.clamp(vfov, 22, 64);
        k = 3.5;
        break;
      }
      case 'result': {
        const focus = ctx.focus || ball;
        tPos = this.pos.clone();
        tPos.lerp(new THREE.Vector3(focus.x * 0.6, 1.5, Math.max(6.5, this.pos.z - 1.2)), 0.02);
        tLook = focus.clone(); tLook.y = Math.max(0.7, focus.y);
        tFov = this.cam.aspect < 0.8 ? 50 : 38;
        k = 2;
        break;
      }
      case 'celebrate': {
        // broadcast close-up: running backwards in front of the scorer
        const hero = ctx.hero || ball;
        const dir = _w.copy(ctx.heroDir || _v.set(1, 0, 0)).setY(0).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        tPos = hero.clone().addScaledVector(dir, 4.6).addScaledVector(side, 1.4);
        tPos.y = 1.55;
        tLook = hero.clone();
        tLook.y = 1.1;
        tFov = this.cam.aspect < 0.8 ? 52 : 34;
        k = this.t < 0.05 ? 50 : 3.2;
        break;
      }
      case 'replay': {
        const shot = this.opts.angle || 'behind';
        const narrow = this.cam.aspect < 0.8;
        if (shot === 'strike') {
          // low, side-on beside the ball: the strike and the first part of the flight
          const dir = _w.copy(this.opts.shotDir || _v.set(0, 0, -1)).setY(0).normalize();
          const start = this.opts.ballStart || ball;
          const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.opts.sideSign || 1);
          tPos = start.clone().addScaledVector(side, 3.4).addScaledVector(dir, 1.2);
          tPos.y = 0.75;
          tLook = ball.clone();
          tLook.y = Math.max(0.35, tLook.y);
          tFov = narrow ? 58 : 38;
          k = 8;
        } else if (shot === 'behind') {
          // between the net and the advertising boards, looking out at the shot
          tPos = _v.set(ball.x * 0.3, 1.55, -4.3);
          tLook = ball.clone();
          tFov = narrow ? 52 : 34;
          k = 5;
        } else if (shot === 'goalside') {
          // on the goal-line extension: the ball arriving and the keeper's dive
          const s = this.opts.sideSign || 1;
          tPos = _v.set(s * 9.5, 1.25, 1.2);
          tLook = ball.clone().lerp(new THREE.Vector3(0, 1.2, 0), 0.25);
          tFov = narrow ? 56 : 36;
          k = 4;
        } else {
          const s = this.opts.sideSign || 1;
          tPos = _v.set(s * 17, 1.4, Math.max(3, ball.z * 0.55 + 1));
          tLook = ball.clone();
          tFov = narrow ? 50 : 34;
          k = 3;
        }
        break;
      }
      default:
        tPos = this.pos; tLook = this.look; tFov = this.fov;
    }
    if (this.opts?.cut) { this.pos.copy(tPos); this.look.copy(tLook); this.fov = tFov; this.opts.cut = false; }
    dampV(this.pos, tPos, k, dt);
    dampV(this.look, tLook, k * 1.6, dt);
    this.fov = damp(this.fov, tFov, 3, dt);

    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.shakeT += dt * 38;
    const s = this.shake * this.shake * 0.12;
    this.cam.position.copy(this.pos);
    this.cam.position.x += (Math.sin(this.shakeT * 1.1) + Math.sin(this.shakeT * 2.3) * 0.5) * s;
    this.cam.position.y += (Math.cos(this.shakeT * 1.7) + Math.sin(this.shakeT * 3.1) * 0.5) * s;
    this.cam.lookAt(this.look);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
