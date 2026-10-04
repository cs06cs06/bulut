import * as THREE from 'three';

// Spring chase camera with mouse/gamepad orbit, auto-recentre, speed FOV and terrain avoidance.
const MODES = [
  { name: 'Takip', dist: 9.5, height: 3.6, look: 1.6, fov: 62 },
  { name: 'Uzak', dist: 15, height: 5.5, look: 1.8, fov: 58 },
  { name: 'Kaput', dist: -0.6, height: 2.05, look: 1.9, fov: 72, hood: true },
];

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.mode = 0;
    this.yaw = 0; this.pitch = 0.08;
    this.orbitYaw = 0; this.orbitPitch = 0;
    this.idle = 10;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.shake = 0;
    this.initialized = false;
    this.dragging = false;
    dom.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.button === 2) { this.dragging = true; dom.setPointerCapture?.(e.pointerId); } });
    addEventListener('pointerup', () => { this.dragging = false; });
    addEventListener('pointermove', (e) => {
      if (!this.dragging && document.pointerLockElement !== dom) return;
      this.orbitYaw -= e.movementX * 0.005;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + e.movementY * 0.004, -0.35, 0.9);
      this.idle = 0;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => { this.zoom = THREE.MathUtils.clamp((this.zoom || 1) + Math.sign(e.deltaY) * 0.08, 0.6, 1.8); }, { passive: true });
  }

  cycle() { this.mode = (this.mode + 1) % MODES.length; this.initialized = false; return MODES[this.mode].name; }
  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

  update(dt, vehicle, terrain, input) {
    const m = MODES[this.mode];
    const obj = vehicle.object;
    const heading = vehicle.heading();
    const speed = vehicle.speed;
    // gamepad right stick orbit
    if (Math.abs(input.lookX) + Math.abs(input.lookY) > 0) {
      this.orbitYaw -= input.lookX * dt * 2.6;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + input.lookY * dt * 1.6, -0.35, 0.9);
      this.idle = 0;
    }
    this.idle += dt;
    if (this.idle > 1.6 && !this.dragging) {
      const k = Math.min(1, dt * (speed > 3 ? 2.2 : 0.6));
      this.orbitYaw += (0 - this.orbitYaw) * k;
      this.orbitPitch += (0 - this.orbitPitch) * k;
    }
    // reverse: look forward along motion
    let baseYaw = heading;
    if (vehicle.forwardSpeed < -3 && !m.hood) baseYaw += Math.PI;
    // smooth yaw follow (lags on fast turns → sense of motion)
    let dy = baseYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * (m.hood ? 20 : 3.4));
    const zoom = this.zoom || 1;

    const q = obj.quaternion;
    if (m.hood) {
      const p = new THREE.Vector3(0, m.height, m.dist).applyQuaternion(q).add(obj.position);
      const look = new THREE.Vector3(0, m.height - 0.15, 12).applyQuaternion(q).add(obj.position);
      this.camera.position.copy(p);
      this.camera.up.set(0, 1, 0).applyQuaternion(q).lerp(new THREE.Vector3(0, 1, 0), 0.6);
      this.camera.lookAt(look);
      this._fov(m.fov + Math.min(14, speed * 0.3), dt);
      return;
    }
    this.camera.up.set(0, 1, 0);
    const yaw = this.yaw + this.orbitYaw;
    const pitch = 0.18 + this.orbitPitch;
    const dist = (m.dist + Math.min(3.5, speed * 0.07)) * zoom;
    const desired = new THREE.Vector3(
      obj.position.x - Math.sin(yaw) * Math.cos(pitch) * dist,
      obj.position.y + m.height * zoom + Math.sin(pitch) * dist * 0.7,
      obj.position.z - Math.cos(yaw) * Math.cos(pitch) * dist);
    // keep above ground
    const gh = terrain.heightAt(desired.x, desired.z) + 1.2;
    if (desired.y < gh) desired.y = gh;
    if (!this.initialized) { this.pos.copy(desired); this.initialized = true; this.target.copy(obj.position); }
    // critically damped spring
    const k = 9, d = 2 * Math.sqrt(k);
    const acc = desired.clone().sub(this.pos).multiplyScalar(k).sub(this.vel.clone().multiplyScalar(d));
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);
    // hard limit on lag distance
    const off = this.pos.clone().sub(desired);
    if (off.length() > 6) this.pos.copy(desired).add(off.setLength(6));
    if (this.pos.y < gh) this.pos.y = gh;
    const lookTarget = obj.position.clone().add(new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(Math.min(4, speed * 0.15)));
    lookTarget.y += m.look;
    this.target.lerp(lookTarget, Math.min(1, dt * 10));
    this.camera.position.copy(this.pos);
    // shake (landings, crashes, rough ground)
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.25, t = performance.now() * 0.001;
      this.camera.position.x += Math.sin(t * 61) * s; this.camera.position.y += Math.sin(t * 73 + 1) * s; this.camera.position.z += Math.sin(t * 67 + 2) * s;
    }
    this.camera.lookAt(this.target);
    this._fov(m.fov + Math.min(16, Math.max(0, speed - 8) * 0.38) + (input.boost ? 4 : 0), dt);
  }

  _fov(f, dt) {
    this.camera.fov += (f - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();
  }
}
