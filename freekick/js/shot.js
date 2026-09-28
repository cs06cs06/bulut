import * as THREE from 'three';
import { BALL, FIELD } from './config.js';
import { BallState, stepBall } from './physics.js';

const R = BALL.radius;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Turns a raw swipe (CSS px points with timestamps) into gesture features.
 * All lengths are normalised by the viewport height so phones and desktops feel alike.
 */
export function analyzeSwipe(points, viewH) {
  if (points.length < 2) return null;
  // ignore the resting part before the flick really starts
  let s = 0;
  const p0 = points[0];
  while (s < points.length - 2 && Math.hypot(points[s].x - p0.x, points[s].y - p0.y) < 6) s++;
  s = Math.max(0, s - 1);
  const pts = points.slice(s);
  const a = pts[0], b = pts[pts.length - 1];
  const H = viewH;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  len /= H;
  const dur = Math.max(0.035, (b.t - a.t) / 1000);
  const chord = { x: (b.x - a.x) / H, y: -(b.y - a.y) / H };
  const cl = Math.hypot(chord.x, chord.y);
  if (cl < 0.04 || chord.y < 0.015) return { valid: false };
  const u = { x: chord.x / cl, y: chord.y / cl };
  const n = { x: -u.y, y: u.x }; // left of the swipe direction
  let best = 0;
  for (const p of pts) {
    const dx = (p.x - a.x) / H, dy = -(p.y - a.y) / H;
    const dev = dx * n.x + dy * n.y;
    if (Math.abs(dev) > Math.abs(best)) best = dev;
  }
  // peak speed over the last 70% of the path is what "power" feels like
  let peak = 0;
  for (let i = Math.floor(pts.length * 0.3) + 1; i < pts.length; i++) {
    const dt = Math.max(8, pts[i].t - pts[i - 1].t) / 1000;
    const sp = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / H / dt;
    peak = Math.max(peak, sp);
  }
  const avg = len / dur;
  const speed = avg * 0.7 + Math.min(peak, avg * 2.2) * 0.3;
  return {
    valid: true,
    start: a, end: b,
    chord, chordLen: cl,
    curve: best / cl, // + means the swipe bowed to the left
    length: len,
    duration: dur,
    speed,
  };
}

export function speedFromSwipe(g, assist) {
  const v = 12 + 21.5 * (1 - Math.exp(-(g.speed - 0.3) / 1.55));
  return THREE.MathUtils.clamp(v, assist?.minV ?? 11, assist?.maxV ?? 33.5);
}

/**
 * Swipe bow -> side spin. A small dead zone keeps a naturally curved thumb stroke from
 * adding accidental curl; past it the response ramps up quickly.
 */
export function spinFromSwipe(g, assist) {
  const dead = 0.03;
  const c = Math.sign(g.curve) * Math.max(0, Math.abs(g.curve) - dead);
  return THREE.MathUtils.clamp(-c * 285 * (assist?.curveGain ?? 1), -72, 72);
}

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _hit = new THREE.Vector3();

/** Where on the goal plane (z = 0) the swipe is pointing. */
export function swipeTarget(g, camera, ballPos, viewW, viewH) {
  const bs = ballPos.clone().project(camera);
  const bx = (bs.x * 0.5 + 0.5) * viewW, by = (-bs.y * 0.5 + 0.5) * viewH;
  const top = new THREE.Vector3(0, 2.44, 0).project(camera);
  const tx = (top.x * 0.5 + 0.5) * viewW, ty = (-top.y * 0.5 + 0.5) * viewH;
  const distPx = Math.hypot(tx - bx, ty - by);
  const S = distPx / (0.34 * viewH);
  const qx = bx + g.chord.x * viewH * S;
  const qy = by - g.chord.y * viewH * S;
  _ndc.set((qx / viewW) * 2 - 1, -(qy / viewH) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  const hit = _ray.ray.intersectPlane(_plane, _hit);
  if (!hit) return new THREE.Vector3(g.chord.x * 20, 1.5, 0);
  return new THREE.Vector3(THREE.MathUtils.clamp(hit.x, -16, 16), THREE.MathUtils.clamp(hit.y, R, 7), 0);
}

/** Spin vector for a given horizontal flight direction. */
export function spinVector(dirH, side, top) {
  const across = new THREE.Vector3().crossVectors(dirH, UP); // d x up
  return new THREE.Vector3().copy(UP).multiplyScalar(side).addScaledVector(across, -top);
}

const _s = new BallState();
function flyToPlane(p0, v0, w, wind) {
  _s.p.copy(p0); _s.v.copy(v0); _s.w.copy(w); _s.knuckle = 0; _s.onGround = false;
  const dt = 1 / 240;
  let t = 0, pz = _s.p.z, px = _s.p.x, py = _s.p.y;
  while (t < 4) {
    stepBall(_s, dt, wind, t);
    t += dt;
    if (_s.p.z <= 0 && pz > 0) {
      const f = pz / (pz - _s.p.z);
      return { x: px + (_s.p.x - px) * f, y: py + (_s.p.y - py) * f, t, ok: true };
    }
    pz = _s.p.z; px = _s.p.x; py = _s.p.y;
    if (_s.onGround && _s.v.lengthSq() < 0.05) break;
    if (_s.v.z > 0) break;
  }
  return { x: _s.p.x, y: _s.p.y, t, ok: false };
}

/**
 * Finds the launch direction so that a ball struck at speed V with the swipe's spin
 * crosses the goal plane at `target`. Spin still bends the flight on the way there, so
 * a curled swipe produces a curled path around the wall.
 */
export function solveLaunch(ballPos, V, sideSpin, target, wind, extraTop = 0) {
  const dist = Math.hypot(target.x - ballPos.x, ballPos.z - target.z);
  let yaw = Math.atan2(target.x - ballPos.x, ballPos.z - target.z);
  let pitch = Math.atan2(target.y - ballPos.y, dist) + 0.02 + dist * 0.0022;
  const v0 = new THREE.Vector3(), w = new THREE.Vector3(), dirH = new THREE.Vector3();
  const topSpin = 3.5 + Math.abs(sideSpin) * 0.16 + extraTop;
  let best = null;
  for (let it = 0; it < 14; it++) {
    dirH.set(Math.sin(yaw), 0, -Math.cos(yaw));
    v0.set(dirH.x * Math.cos(pitch), Math.sin(pitch), dirH.z * Math.cos(pitch)).multiplyScalar(V);
    w.copy(spinVector(dirH, sideSpin, topSpin));
    const r = flyToPlane(ballPos, v0, w, wind);
    if (!r.ok) {
      pitch = Math.min(0.8, pitch + 0.06);
      continue;
    }
    const ex = r.x - target.x, ey = r.y - target.y;
    const err = Math.hypot(ex, ey);
    if (!best || err < best.err) best = { err, yaw, pitch, t: r.t };
    if (err < 0.015) break;
    yaw -= (ex / dist) * 0.92;
    pitch -= (ey / dist) * 0.8;
    pitch = THREE.MathUtils.clamp(pitch, -0.04, 0.8);
  }
  if (best) { yaw = best.yaw; pitch = best.pitch; }
  dirH.set(Math.sin(yaw), 0, -Math.cos(yaw));
  v0.set(dirH.x * Math.cos(pitch), Math.sin(pitch), dirH.z * Math.cos(pitch)).multiplyScalar(V);
  w.copy(spinVector(dirH, sideSpin, topSpin));
  return { v: v0, w, yaw, pitch, topSpin, flightTime: best ? best.t : 1.2, err: best ? best.err : 99 };
}

/**
 * Height of a trajectory where it crosses the wall line, or null when it passes
 * beside the wall. `wall` = { a, b } spray-line endpoints on the ground.
 */
function heightAtWall(ballPos, v, w, wind, wall) {
  _s.p.copy(ballPos); _s.v.copy(v); _s.w.copy(w); _s.knuckle = 0; _s.onGround = false;
  const ax = wall.a.x, az = wall.a.z, bx = wall.b.x, bz = wall.b.z;
  const nx = -(bz - az), nz = bx - ax;
  const side = (x, z) => (x - ax) * nx + (z - az) * nz;
  let prev = side(_s.p.x, _s.p.z);
  for (let t = 0; t < 2; t += 1 / 240) {
    stepBall(_s, 1 / 240, wind, t);
    const cur = side(_s.p.x, _s.p.z);
    if (Math.sign(cur) !== Math.sign(prev)) {
      const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
      const u = ((_s.p.x - ax) * (bx - ax) + (_s.p.z - az) * (bz - az)) / len2;
      return u > -0.08 && u < 1.08 ? _s.p.y : null;
    }
    prev = cur;
  }
  return null;
}

/**
 * Full pipeline: gesture -> physical shot.
 * opts.assist tunes precision, curl and help; opts.wall enables the dip assist that adds
 * topspin until the ball clears a jumping wall.
 */
export function buildShot(g, camera, ballPos, viewW, viewH, wind, exact = false, opts = {}) {
  const assist = opts.assist;
  const V = speedFromSwipe(g, assist);
  const target = swipeTarget(g, camera, ballPos, viewW, viewH);
  // near misses get pulled back inside the frame on the easier settings
  const snap = assist?.snap ?? 0;
  if (snap > 0) {
    const HW = FIELD.goalHalfWidth, GH = FIELD.goalHeight;
    const outX = Math.abs(target.x) - (HW - 0.28);
    const outY = target.y - (GH - 0.22);
    if (outX > 0 && outX < snap + 0.28 && target.y < GH + snap) target.x = Math.sign(target.x) * (HW - 0.28);
    if (outY > 0 && outY < snap + 0.22 && Math.abs(target.x) < HW + snap) target.y = GH - 0.22;
  }
  // harder strikes are a little less precise
  const sloppy = exact ? 0 : (Math.max(0, V - 22) * 0.034 + Math.min(1, Math.abs(g.curve) / 0.3) * 0.12) * (assist?.sloppy ?? 1);
  target.x += (Math.random() - 0.5) * 2 * sloppy;
  target.y = Math.max(R, target.y + (Math.random() - 0.5) * 2 * sloppy * 0.7);
  const side = spinFromSwipe(g, assist);
  let sol = solveLaunch(ballPos, V, side, target, wind);
  let dipped = false;
  if (assist?.dip && opts.wall) {
    // a dipping shot: more topspin means a higher launch for the same target
    const clear = opts.wall.clear ?? 2.5;
    for (let extra = 8, i = 0; i < 5; i++, extra += 8) {
      const h = heightAtWall(ballPos, sol.v, sol.w, wind, opts.wall);
      if (h === null || h > clear || target.y < 0.6) break;
      const next = solveLaunch(ballPos, V, side, target, wind, extra);
      if (next.err > 0.3) break;
      sol = next;
      dipped = true;
    }
  }
  const knuckle = Math.abs(g.curve) < 0.035 && V > 26.5 ? Math.min(1, (V - 26.5) / 5) : 0;
  return { ...sol, V, target, side, knuckle, curve: g.curve, dipped };
}
