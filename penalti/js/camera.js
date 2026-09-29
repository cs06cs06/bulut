// Cinematic camera director: broadcast-style shots with critically damped follow, handheld sway, impact shake and focus data for DoF.
import * as THREE from 'three';

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class CameraDirector {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'menu';
    this.t = 0; this.modeT = 0;
    this.pos = v(0, 2, 20); this.look = v(0, 1, 0); this.fov = 36;
    this.wantPos = v(); this.wantLook = v(); this.wantFov = 36;
    this.k = 3; this.kLook = 4;
    this.shakeAmt = 0; this.shakeT = 0;
    this.focus = 8; this.aperture = 120; this.range = 1.2;
    this.snap = true;
    this.opts = {};
    this.rollDeg = 0;
    this.sway = 1;
    this.tmp = v();
  }
  shake(a, dur = 0.5) { this.shakeAmt = Math.max(this.shakeAmt, a); this.shakeT = dur; this.shakeDur = dur; }
  set(mode, opts = {}, cut = false) {
    this.mode = mode; this.modeT = 0; this.opts = opts; if (cut) this.snap = true;
  }
  // scene: { ball(Vector3), ballVel, kicker(Vector3 world chest), keeper, aim(Vector3 on goal plane), kickerRoot, ballRest }
  update(dt, S) {
    this.t += dt; this.modeT += dt;
    const P = this.wantPos, L = this.wantLook;
    let kPos = 3, kLook = 5, fov = 36, focus = 8, ap = 120, sway = 1, range = 1.2;
    const ball = S.ball, rest = S.ballRest || v(0, 0.111, 11);
    const time = this.t;
    switch (this.mode) {
      case 'menu': {
        const a = -0.55 + Math.sin(time * 0.07) * 0.35 + time * 0.012;
        const r = 15.5 + Math.sin(time * 0.11) * 1.5;
        P.set(Math.sin(a) * r, 2.1 + Math.sin(time * 0.17) * 0.5, 7.5 + Math.cos(a) * r * 0.7 + 2);
        L.set(0, 1.5, 1.8);
        fov = 34; kPos = 1.2; kLook = 2; focus = P.distanceTo(L); ap = 130; sway = 0.4; range = 0.9;
        break;
      }
      case 'intro': {
        const u = clamp(this.modeT / 4.2, 0, 1), e = u * u * (3 - 2 * u);
        const a = new THREE.Vector3(-17, 6.5, 26), b = S.aimCamPos.clone();
        P.copy(a).lerp(b, e); P.y += Math.sin(u * Math.PI) * 1.4;
        L.set(0, 1.2, 4).lerp(S.aimLook, e);
        fov = 44 - 8 * e; kPos = 6; kLook = 6; focus = P.distanceTo(L); ap = 130; sway = 0.6; range = 1.0;
        break;
      }
      case 'aim': {
        P.copy(S.aimCamPos);
        L.copy(S.aimLook);
        if (S.aim) L.x += S.aim.x * 0.16;
        const breathe = Math.sin(time * 0.9);
        P.y += breathe * 0.012; P.x += Math.sin(time * 0.37) * 0.03;
        fov = 36; kPos = 2.2; kLook = 3.2;
        focus = S.focusPoint ? P.distanceTo(S.focusPoint) : 8; ap = 130; sway = 1; range = 1.25;
        break;
      }
      case 'runup': {
        const u = clamp(this.modeT / 1.2, 0, 1);
        P.copy(S.aimCamPos).lerp(S.runCamPos, u * u * (3 - 2 * u));
        L.copy(S.kickerChest).lerp(S.goalMid, 0.55 + 0.25 * u);
        fov = 35 - 3 * u; kPos = 2.4; kLook = 4;
        focus = P.distanceTo(S.kickerChest) + 3.0; ap = 130; sway = 1.3; range = 1.1;
        break;
      }
      case 'flight': {
        // follow the ball loosely from behind, then settle before the goal
        const bz = ball.z;
        P.set(S.runCamPos.x * 0.6 + ball.x * 0.25, 1.7 + Math.max(0, ball.y) * 0.18, clamp(bz + 6.2, 5.2, S.runCamPos.z));
        L.copy(ball).addScaledVector(S.ballVel || v(), 0.1); L.y = Math.max(L.y, 0.4);
        fov = 32 - clamp((11 - bz) / 11, 0, 1) * 6; kPos = 2.6; kLook = 8;
        focus = P.distanceTo(ball) + 2.0; ap = 120; sway = 0.6; range = 1.0;
        break;
      }
      case 'goalcam': {
        // behind the goal, low, looking at the net and keeper
        const s = this.opts.side || 1;
        P.set(s * 3.6 + Math.sin(time * 0.3) * 0.15, 1.05, -4.6);
        L.set(-s * 0.6, 1.2, 0.6);
        if (S.ball) L.lerp(S.ball, 0.35);
        fov = 42; kPos = 6; kLook = 5; focus = P.distanceTo(L); ap = 140; sway = 1.4; range = 0.8;
        break;
      }
      case 'keepercam': {
        // defending: camera inside the goal net behind the keeper, looking at the kicker
        P.set(S.keeperX * 0.3, 1.62, -3.05);
        L.set(0, 1.05, 11).lerp(S.ball || v(0, 1, 11), this.opts.follow ? 0.55 : 0);
        L.x = damp(L.x, 0, 1, 1);
        fov = 43 - (this.opts.follow ? 8 : 0); kPos = 3; kLook = this.opts.follow ? 6 : 3.2;
        focus = P.distanceTo(S.kickerChest || L) * 0.8; ap = 120; sway = 0.9; range = 1.4;
        if (this.opts.follow) { focus = P.distanceTo(ball); ap = 110; range = 1.0; }
        break;
      }
      case 'celebrate': {
        const k = S.kickerPos, a = time * 0.55 + (this.opts.phase || 0);
        const r = 4.2 - Math.min(this.modeT, 2) * 0.35;
        P.set(k.x + Math.sin(a) * r, 1.25 + Math.sin(time * 0.9) * 0.15, k.z + 1.5 + Math.cos(a) * r * 0.8);
        L.set(k.x, 1.45, k.z);
        fov = 32; kPos = 2.6; kLook = 6; focus = P.distanceTo(L); ap = 180; sway = 1.5; range = 0.4;
        break;
      }
      case 'sadcam': {
        const k = S.kickerPos;
        P.set(k.x + 2.2, 1.35, k.z + 3.4); L.set(k.x, 1.35, k.z);
        fov = 30; kPos = 3; kLook = 6; focus = P.distanceTo(L); ap = 170; sway = 0.8; range = 0.4;
        break;
      }
      case 'savecam': {
        const k = S.keeperPos;
        P.set(k.x + (k.x >= 0 ? -3.6 : 3.6), 1.15, 3.6); L.set(k.x, 0.9, 0.3);
        fov = 36; kPos = 5; kLook = 6; focus = P.distanceTo(L); ap = 150; sway = 1.2; range = 0.6;
        break;
      }
      case 'replay': {
        const c = this.opts.cam || 'side';
        if (c === 'side') {
          const s = this.opts.side || 1;
          P.set(s * 9.0, 1.05, clamp(ball.z + 0.5, 1.5, 6));
          L.copy(ball).lerp(v(0, 1, 0), 0.2); fov = 30; kPos = 6; kLook = 8;
        } else if (c === 'net') {
          P.set(-2.4, 0.85, -5.4); L.copy(ball).lerp(v(0, 1.1, 0), 0.25); fov = 34; kPos = 8; kLook = 10;
        } else if (c === 'chase') {
          P.copy(ball).add(v(1.2, 0.5, 4.2)); P.y = Math.max(P.y, 0.7); L.copy(ball).addScaledVector(S.ballVel || v(), 0.05); fov = 30; kPos = 5; kLook = 10;
        } else if (c === 'high') {
          P.set(-6.5, 5.2, 9); L.copy(ball).lerp(v(0, 0.5, 3), 0.4); fov = 34; kPos = 4; kLook = 6;
        } else {
          P.copy(S.aimCamPos); L.copy(ball); fov = 30; kPos = 3; kLook = 6;
        }
        focus = P.distanceTo(ball); ap = 140; sway = 0.5; range = 0.7;
        break;
      }
      case 'orbit': {
        const a = time * 0.16, r = 12;
        P.set(Math.sin(a) * r, 3.2, 8 + Math.cos(a) * r); L.set(0, 1.2, 4); fov = 38; kPos = 2; kLook = 3; focus = P.distanceTo(L); ap = 130; range = 1.0;
        break;
      }
    }
    this.k = kPos; this.kLook = kLook; this.wantFov = fov; this.sway = sway;
    this.focusW = focus; this.apW = ap; this.rangeW = range;
    if (this.snap) { this.pos.copy(P); this.look.copy(L); this.fov = fov; this.focus = focus; this.aperture = ap; this.range = range; this.snap = false; }
    else {
      this.pos.x = damp(this.pos.x, P.x, kPos, dt); this.pos.y = damp(this.pos.y, P.y, kPos, dt); this.pos.z = damp(this.pos.z, P.z, kPos, dt);
      this.look.x = damp(this.look.x, L.x, kLook, dt); this.look.y = damp(this.look.y, L.y, kLook, dt); this.look.z = damp(this.look.z, L.z, kLook, dt);
      this.fov = damp(this.fov, fov, 3, dt);
      this.focus = damp(this.focus, focus, 6, dt); this.aperture = damp(this.aperture, ap, 3, dt); this.range = damp(this.range, range, 3, dt);
    }
    // handheld sway + shake
    const cam = this.cam;
    cam.position.copy(this.pos);
    let sx = Math.sin(time * 0.73) * 0.006 + Math.sin(time * 1.9) * 0.0025, sy = Math.sin(time * 0.61 + 1.3) * 0.005 + Math.sin(time * 2.3) * 0.002;
    sx *= this.sway; sy *= this.sway;
    if (this.shakeT > 0) {
      this.shakeT -= dt; const f = clamp(this.shakeT / (this.shakeDur || 0.5), 0, 1);
      const a = this.shakeAmt * f * f;
      sx += (Math.sin(time * 61) + Math.sin(time * 43.7)) * 0.5 * a; sy += (Math.sin(time * 57 + 2) + Math.sin(time * 39.1)) * 0.5 * a;
      cam.position.x += Math.sin(time * 47) * a * 0.15; cam.position.y += Math.sin(time * 53) * a * 0.15;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }
    cam.lookAt(this.look);
    cam.rotateX(sy); cam.rotateY(sx);
    cam.rotateZ(this.rollDeg * Math.PI / 180);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
