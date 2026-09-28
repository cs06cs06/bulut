import * as THREE from 'three';
import { BALL } from './config.js';
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

export function speedFromSwipe(g) {
  const v = 12 + 21.5 * (1 - Math.exp(-(g.speed - 0.3) / 1.55));
  return THREE.MathUtils.clamp(v, 11, 33.5);
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
  const S = distPx / (0.38 * viewH);
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
export function solveLaunch(ballPos, V, sideSpin, target, wind) {
  const dist = Math.hypot(target.x - ballPos.x, ballPos.z - target.z);
  let yaw = Math.atan2(target.x - ballPos.x, ballPos.z - target.z);
  let pitch = Math.atan2(target.y - ballPos.y, dist) + 0.02 + dist * 0.0022;
  const v0 = new THREE.Vector3(), w = new THREE.Vector3(), dirH = new THREE.Vector3();
  const topSpin = 3.5 + Math.abs(sideSpin) * 0.16;
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
  return { v: v0, w, yaw, pitch, flightTime: best ? best.t : 1.2, err: best ? best.err : 99 };
}

/** Full pipeline: gesture -> physical shot. */
export function buildShot(g, camera, ballPos, viewW, viewH, wind, exact = false) {
  const V = speedFromSwipe(g);
  const target = swipeTarget(g, camera, ballPos, viewW, viewH);
  // harder strikes are a little less precise
  const sloppy = exact ? 0 : Math.max(0, V - 22) * 0.034 + Math.min(1, Math.abs(g.curve) / 0.3) * 0.12;
  target.x += (Math.random() - 0.5) * 2 * sloppy;
  target.y = Math.max(R, target.y + (Math.random() - 0.5) * 2 * sloppy * 0.7);
  const side = THREE.MathUtils.clamp(-g.curve * 230, -72, 72);
  const sol = solveLaunch(ballPos, V, side, target, wind);
  const knuckle = Math.abs(g.curve) < 0.035 && V > 26.5 ? Math.min(1, (V - 26.5) / 5) : 0;
  return { ...sol, V, target, side, knuckle, curve: g.curve };
}
