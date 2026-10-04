import * as THREE from 'three';
import { PHOTO_BOUNTIES, POIS } from '../world/layout.js';

// Photo challenges (Forza Horizon style): each bounty pays once when a photo-mode shot meets it.
const _p = new THREE.Vector3();

export class PhotoBounties {
  constructor({ game }) {
    this.g = game;
    this.done = game.progress.data.photos || (game.progress.data.photos = []);
    this.list = PHOTO_BOUNTIES.map((b) => {
      if (!b.poi) return b;
      const p = POIS.find((q) => q.id === b.poi);
      return { ...b, x: p.x, z: p.z };
    });
    this.el = document.getElementById('ph-bounties');
    this.render();
  }

  render() {
    if (!this.el) return;
    this.el.innerHTML = `<div class="pb-h">Fotoğraf görevleri · ${this.done.length}/${this.list.length}</div>` +
      this.list.map((b) => `<div class="pb${this.done.includes(b.id) ? ' on' : ''}"><b>${this.done.includes(b.id) ? '✓' : '○'} ${b.name}</b><span>${b.desc} · $${b.reward}</span></div>`).join('');
  }

  _inFrame(x, y, z, maxDist) {
    const cam = this.g.rs.camera;
    if (cam.position.distanceTo(_p.set(x, y, z)) > maxDist) return false;
    _p.project(cam);
    return _p.z < 1 && Math.abs(_p.x) < 0.88 && Math.abs(_p.y) < 0.88;
  }

  // called when a photo is taken; returns the bounties completed by this shot
  check() {
    const g = this.g, v = g.vehicle, T = g.terrain, cam = g.rs.camera, hits = [];
    const carIn = () => this._inFrame(v.position.x, v.position.y + 1, v.position.z, 45);
    for (const b of this.list) {
      if (this.done.includes(b.id)) continue;
      let ok = true;
      if (b.turbine) ok = (g.world.turbines || []).some((t) => this._inFrame(t.x, T.heightAt(t.x, t.z) + 30, t.z, b.dist));
      else if (b.airborne) ok = v.contacts === 0 && v.position.y - T.heightAt(v.position.x, v.position.z) > 1.4 && carIn();
      else if (b.near) ok = Math.hypot(cam.position.x - b.x, cam.position.z - b.z) < b.near || Math.hypot(v.position.x - b.x, v.position.z - b.z) < b.near;
      else ok = this._inFrame(b.x, T.heightAt(b.x, b.z) + (b.y || 3), b.z, b.dist);
      if (ok && b.withCar) ok = carIn();
      if (ok && b.night) ok = g.rs.isNight;
      if (ok && b.dusk) { const h = g._hour; ok = g.rs.isNight || g.rs.timeOfDay === 'sunset' || (h !== undefined && h >= 18.3 && h <= 21); }
      if (ok) hits.push(b);
    }
    for (const b of hits) {
      this.done.push(b.id);
      g.progress.addMoney(b.reward);
      g.hud.toast('Fotoğraf Görevi', b.name, `Harika kare! +$${b.reward}`);
    }
    if (hits.length) { g.progress.save(); this.render(); g.audio.play('discover', { bus: 'ui', volume: 0.8 }); }
    return hits;
  }
}
