import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import { Vehicle } from '../../src/game/vehicle.js';
await R.init();
const world = new R.World({ x: 0, y: -9.81, z: 0 });
// test ground: heightfield with gentle bumps + ramp
const N = 257, size = 600, hf = new Float32Array(N * N);
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = i / (N - 1) * size - size / 2, z = j / (N - 1) * size - size / 2; hf[i * N + j] = (process.env.BUMPY ? Math.sin(x * 0.4) * Math.cos(z * 0.35) * 0.3 : 0) + (z > 150 ? (z - 150) * 0.35 : 0); }
world.createCollider(R.ColliderDesc.heightfield(N - 1, N - 1, hf, { x: size, y: 1, z: size }));
// fake truck model with Kenney proportions (test only)
const m = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, 2.95)); body.position.set(0, 0.725, 0); body.name = 'body'; m.add(body);
for (const [n, x, z] of [['wheel-front-left', 0.425, 0.86], ['wheel-front-right', -0.425, 0.86], ['wheel-back-left', 0.425, -0.76], ['wheel-back-right', -0.425, -0.76]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.35).rotateZ(Math.PI / 2)); w.position.set(x, 0.3, z); w.name = n; m.add(w); }
const v = new Vehicle({ RAPIER: R, world, model: m, spawn: { x: 0, y: 2, z: -200 }, heading: 0 });
console.log('fwd axis', v.ctrl.indexForwardAxis, 'radius', v.cfg.radius);
const input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
const dt = 1 / 60; let t = 0;
const log = (lbl) => { const p = v.body.translation(); const r = v.body.rotation(); console.log(lbl, 't', t.toFixed(1), 'pos', p.x.toFixed(1), p.y.toFixed(2), p.z.toFixed(1), 'kmh', (v.forwardSpeed * 3.6).toFixed(1), 'gear', v.gearLabel(), 'rpm', v.rpm.toFixed(0), 'contacts', v.contacts, 'upY', new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(r.x,r.y,r.z,r.w)).y.toFixed(3)); };
const run = (sec, f, lbl) => { for (let k = 0; k < sec * 60; k++) { f?.(); v.savePrev(); v.step(dt, input, () => 'grass'); world.step(); t += dt; if (k % 60 === 59) log(lbl); } };
run(2, null, 'settle');
for (let i = 0; i < 4; i++) console.log('susp', i, v.ctrl.wheelSuspensionLength(i)?.toFixed(3));
input.throttle = 1; run(12, null, 'accel');
input.throttle = 0; input.brake = 1; run(4, null, 'brake');
input.brake = 0; input.throttle = 1; input.steer = 1; run(5, null, 'turn');
input.steer = 0; input.throttle = 0; input.brake = 1; run(5, null, 'reverse');
