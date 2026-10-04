import * as THREE from 'three';

// Winch (SnowRunner style): hook the nearest tree, pole or building within 30 m and reel in.
// The cable pulls on the front bumper, so you can drag yourself up a slope or out of a ditch.
const MAX_RANGE = 30, SNAP = 42, REEL = 3.2;
const _hook = new THREE.Vector3(), _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();

export class Winch {
  constructor({ scene, physics, RAPIER, audio, hud }) {
    Object.assign(this, { physics, R: RAPIER, audio, hud });
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 0.45, metalness: 0.6 }));
    this.rope.visible = false; this.rope.castShadow = true;
    scene.add(this.rope);
    this.active = null;
  }

  _hookPoint(v, out) {
    const bb = v.bodyBox;
    return out.set(0, bb.min.y + (bb.max.y - bb.min.y) * 0.3, bb.max.z - 0.1).applyMatrix4(v.object.matrixWorld);
  }

  toggle(v) {
    if (this.active) { this.release('Vinç bırakıldı'); return; }
    const hook = this._hookPoint(v, _hook);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.object.quaternion);
    let best = null, bestScore = Infinity;
    this.physics.intersectionsWithShape(hook, { x: 0, y: 0, z: 0, w: 1 }, new this.R.Ball(MAX_RANGE), (c) => {
      const k = c.userData?.kind;
      if (k !== 'tree' && k !== 'building' && k !== 'rock') return true;
      const pr = c.projectPoint(hook, true);
      const p = new THREE.Vector3(pr.point.x, pr.point.y, pr.point.z);
      const d = p.distanceTo(hook);
      if (d < 3) return true;
      const ahead = _dir.copy(p).sub(hook).normalize().dot(fwd);
      const score = d * (ahead < -0.2 ? 1.8 : 1);
      if (score < bestScore) { bestScore = score; best = { p, c }; }
      return true;
    });
    if (!best) { this.hud.hint('Yakında bağlanacak ağaç, direk ya da bina yok (30 m)', 2.5); return; }
    // tie off around the trunk at bumper height
    best.p.y = Math.max(best.p.y, hook.y);
    this.active = { anchor: best.p, len: best.p.distanceTo(hook) };
    this.rope.visible = true;
    this.audio.play('impact_metal', { volume: 0.5, rate: 1.4 });
    this.sound = this.sound || this.audio.loop('engine_diesel', 'sfx', { volume: 0 });
    this.hud.hint('Vinç bağlandı — kablo sarılıyor', 2);
  }

  release(msg) {
    if (!this.active) return;
    this.active = null; this.rope.visible = false;
    this.sound?.set(0, 1, 0.1);
    if (msg) this.hud.hint(msg, 1.8);
  }

  update(dt, v) {
    const a = this.active;
    if (!a) return;
    const hook = this._hookPoint(v, _hook);
    _dir.copy(a.anchor).sub(hook);
    const dist = _dir.length();
    if (dist > SNAP) { this.audio.play('impact_metal', { volume: 0.9, rate: 0.7 }); this.release('Kablo koptu!'); return; }
    if (dist < 4.5) { this.release('Vinç tamam'); return; }
    a.len = Math.max(4, Math.min(a.len, dist) - REEL * dt);
    _dir.divideScalar(dist);
    // pull on the bumper when the cable is taut
    const stretch = dist - a.len;
    if (stretch > 0) {
      const mass = v.body.mass(), F = Math.min(mass * 9.81 * 1.25, stretch * mass * 14);
      v.body.applyImpulseAtPoint({ x: _dir.x * F * dt, y: _dir.y * F * dt, z: _dir.z * F * dt }, { x: hook.x, y: hook.y, z: hook.z }, true);
    }
    this.sound?.set(0.22, 1.6 + Math.min(0.6, stretch * 0.3), 0.1);
    // cable mesh between bumper and anchor
    this.rope.position.copy(hook).addScaledVector(_dir, dist / 2);
    this.rope.quaternion.copy(_q.setFromUnitVectors(_up, _dir));
    this.rope.scale.set(1, dist, 1);
  }
}
