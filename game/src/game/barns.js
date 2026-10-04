import * as THREE from 'three';
import { BARNS } from '../world/layout.js';
import { VEHICLES } from './vehicle.js';

// Barn finds (Forza Horizon style): a rumour marks a search circle on the map; somewhere inside,
// an old barn hides a rusted vehicle. Finding it lets you restore the car in the garage.
const RUST = new THREE.Color(0x6e4126), DUST = new THREE.Color(0x8a7a62);

export class BarnFinds {
  constructor({ scene, lib, terrain, hud, audio, progress }) {
    Object.assign(this, { scene, lib, terrain, hud, audio, progress });
    const d = progress.data;
    this.state = d.barns || (d.barns = { found: [], rumours: [] });
    this.barns = BARNS.map((b) => ({ ...b, sx: b.x + b.search.dx, sz: b.z + b.search.dz, display: this._display(b) }));
    this.refresh();
  }

  // rusty, dusty copy of the vehicle parked inside the barn
  _display(b) {
    const spec = VEHICLES[b.vehicle];
    const o = this.lib.clone(spec.model);
    o.scale.setScalar(spec.scale || 1);
    const root = new THREE.Group();
    if (spec.yaw) o.rotation.y = spec.yaw;
    root.add(o);
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true;
      const fix = (mat) => {
        const c = mat.clone();
        if (/window|glass/i.test(c.name)) c.color.setHex(0x2c2a26);
        else c.color.lerp(/black|tire|wheel/i.test(c.name) ? DUST : RUST, /black|tire|wheel/i.test(c.name) ? 0.35 : 0.8);
        c.roughness = 1; c.metalness = 0.05;
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material);
    });
    root.position.set(b.x, this.terrain.heightAt(b.x, b.z) - 0.04, b.z);
    root.rotation.set(0.015, b.rot * Math.PI / 180 + Math.PI / 2, -0.02); // settled on flat tyres
    this.scene.add(root);
    return root;
  }

  isFound(id) { return this.state.found.includes(id); }
  rumourActive(b) { return !b.story || this.state.rumours.includes(b.id); }
  reveal(id) { if (!this.state.rumours.includes(id)) { this.state.rumours.push(id); this.progress.save(); this.refresh(); } }

  // map markers: search circles for open rumours, a barn icon once found
  refresh() {
    const owned = this.progress.data.owned;
    this.hud.searchAreas = this.barns.filter((b) => this.rumourActive(b) && !this.isFound(b.id)).map((b) => ({ x: b.sx, z: b.sz, r: b.search.r }));
    this.hud.barnIcons = this.barns.filter((b) => this.isFound(b.id) && !owned.includes(b.vehicle)).map((b) => ({ x: b.x, z: b.z }));
    for (const b of this.barns) b.display.visible = !owned.includes(b.vehicle);
  }

  update(dt, pos) {
    for (const b of this.barns) {
      if (this.isFound(b.id) || !this.rumourActive(b)) continue;
      if (Math.hypot(pos.x - b.x, pos.z - b.z) < 20) {
        this.state.found.push(b.id);
        this.progress.save();
        this.hud.toast('Ahır Buluntusu!', b.name, 'Paslanmış ama kurtarılabilir. Garajdan restore edebilirsin.');
        this.audio.play('discover', { bus: 'ui', volume: 0.9, rate: 0.8 });
        this.refresh();
        this.onFound?.(b);
      }
    }
  }
}
