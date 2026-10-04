import * as THREE from 'three';
import { TOWERS, POIS } from '../world/layout.js';

// Map exploration (SnowRunner / Far Cry style): the map starts under a parchment fog that clears
// around you as you drive. Old lookout towers reveal a wide area at once.
const KEY = 'tozlu-yollar-fog-v1';
const N = 128;

export class Exploration {
  constructor({ scene, hud, audio, progress, terrain, glowTex, mapSize, foundPois = [] }) {
    Object.assign(this, { hud, audio, progress, terrain, mapSize });
    this.half = mapSize / 2;
    this.cell = mapSize / N;
    this.grid = new Uint8Array(N * N);
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = N;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(N, N);
    let loaded = false;
    try {
      const s = localStorage.getItem(KEY);
      if (s) { const bin = atob(s); for (let i = 0; i < bin.length && i < N * N; i++) this.grid[i] = bin.charCodeAt(i); loaded = true; }
    } catch { /* fresh map */ }
    if (!loaded) for (const p of POIS) if (foundPois.includes(p.id)) this.reveal(p.x, p.z, 300); // returning players keep what they know
    const st = progress.data;
    this.visited = st.towers || (st.towers = []);
    this.towers = TOWERS.map((t) => {
      const y = terrain.heightAt(t.x, t.z);
      const beacon = new THREE.Group();
      const mat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd36b, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
      for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(mat); sp.scale.setScalar(6 - i * 0.6); sp.position.y = 16 + i * 9; beacon.add(sp); }
      beacon.position.set(t.x, y, t.z);
      beacon.visible = !this.visited.includes(t.id);
      scene.add(beacon);
      return { ...t, beacon, visited: this.visited.includes(t.id) };
    });
    hud.towers = this.towers;
    hud.fog = this.canvas;
    this.anim = null;
    this._t = 0;
    this._redraw();
  }

  get visitedCount() { return this.visited.length; }

  reveal(x, z, r) {
    const c = this.cell, i0 = Math.max(0, Math.floor((x - r + this.half) / c)), i1 = Math.min(N - 1, Math.floor((x + r + this.half) / c));
    const j0 = Math.max(0, Math.floor((z - r + this.half) / c)), j1 = Math.min(N - 1, Math.floor((z + r + this.half) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * c - this.half, cz = (j + 0.5) * c - this.half;
      if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r && !this.grid[j * N + i]) { this.grid[j * N + i] = 1; this.dirty = true; }
    }
  }

  explored(x, z) {
    const i = Math.floor((x + this.half) / this.cell), j = Math.floor((z + this.half) / this.cell);
    return i < 0 || j < 0 || i >= N || j >= N ? false : !!this.grid[j * N + i];
  }

  get fraction() { let n = 0; for (const v of this.grid) n += v; return n / (N * N); }

  _redraw() {
    const d = this.img.data;
    for (let k = 0; k < N * N; k++) {
      const o = k * 4, on = this.grid[k];
      d[o] = 46; d[o + 1] = 34; d[o + 2] = 22; d[o + 3] = on ? 0 : 205;
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.dirty = false;
  }

  _save() { try { localStorage.setItem(KEY, btoa(String.fromCharCode(...this.grid))); } catch { /* quota */ } }

  update(dt, pos) {
    this._t += dt;
    if (this._t > 0.4) { this._t = 0; this.reveal(pos.x, pos.z, 210); }
    for (const t of this.towers) {
      if (!t.visited) t.beacon.children.forEach((s, i) => { s.material.opacity = 0.35 + Math.sin(this._t * 6 + i) * 0.05; });
      if (t.visited || Math.hypot(pos.x - t.x, pos.z - t.z) > 18) continue;
      t.visited = true; t.beacon.visible = false;
      this.visited.push(t.id);
      this.progress.addMoney(150);
      this.hud.toast('Gözetleme Kulesi', t.name, 'Etraftaki bölge haritada açıldı · +$150');
      this.audio.play('discover', { bus: 'ui', volume: 0.9, rate: 0.9 });
      this.anim = { x: t.x, z: t.z, r: 0 };
      this.onTower?.(t);
    }
    // tower reveal sweeps outwards
    if (this.anim) {
      this.anim.r += dt * 520;
      this.reveal(this.anim.x, this.anim.z, Math.min(720, this.anim.r));
      if (this.anim.r >= 720) this.anim = null;
    }
    if (this.dirty) { this._redraw(); this._unsaved = true; }
    this._saveT = (this._saveT || 0) + dt;
    if (this._unsaved && this._saveT > 6) { this._saveT = 0; this._unsaved = false; this._save(); }
  }
}
