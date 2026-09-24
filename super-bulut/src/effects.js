// Parçacıklar (tuğla kırıkları, toz, pırıltı) ve ekranda yükselen puan yazıları.
import * as THREE from 'three';

const fragGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
const fragMat = new THREE.MeshStandardMaterial({ color: '#C8553D', roughness: 0.8 });
const puffGeo = new THREE.SphereGeometry(0.16, 10, 8);
const sparkGeo = new THREE.OctahedronGeometry(0.1);

export class Effects {
  constructor(world, popupRoot) {
    this.world = world;
    this.popupRoot = popupRoot;
    this.items = [];
    this.popups = [];
    this.tmp = new THREE.Vector3();
  }

  clear() {
    for (const p of this.items) this.world.remove(p.obj);
    for (const p of this.popups) p.el.remove();
    this.items = [];
    this.popups = [];
  }

  #spawn(obj, props) {
    this.world.add(obj);
    this.items.push({ obj, age: 0, ...props });
  }

  bricks(x, y) {
    for (const [dx, dy, vx, vy] of [
      [-0.2, 0.2, -3, 11],
      [0.2, 0.2, 3, 11],
      [-0.2, -0.2, -2.5, 7],
      [0.2, -0.2, 2.5, 7],
    ]) {
      const m = new THREE.Mesh(fragGeo, fragMat);
      m.position.set(x + dx, y + dy, 0);
      m.castShadow = true;
      this.#spawn(m, { vx, vy, vz: (Math.random() - 0.5) * 3, spin: 8, life: 1.4, gravity: 40 });
    }
  }

  puff(x, y, color = '#FFFFFF', n = 6) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const m = new THREE.Mesh(puffGeo, mat);
      m.position.set(x, y, 0.2);
      this.#spawn(m, { vx: Math.cos(a) * 2.2, vy: Math.abs(Math.sin(a)) * 1.5 + 0.5, vz: 0, life: 0.45, gravity: 0, grow: 2.2, fade: mat });
    }
  }

  sparkle(x, y, color = '#FFE38A', n = 8) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const m = new THREE.Mesh(sparkGeo, mat);
      m.position.set(x, y, 0.3);
      const s = 2 + Math.random() * 2.5;
      this.#spawn(m, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 0, life: 0.5, gravity: 0, spin: 10, fade: mat });
    }
  }

  // Dünya koordinatında puan/yazı göster
  popup(text, x, y, cls = '') {
    const el = document.createElement('div');
    el.className = 'popup ' + cls;
    el.textContent = text;
    this.popupRoot.appendChild(el);
    this.popups.push({ el, x, y, age: 0 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      const o = p.obj;
      p.vy -= (p.gravity || 0) * dt;
      o.position.x += p.vx * dt;
      o.position.y += p.vy * dt;
      o.position.z += (p.vz || 0) * dt;
      if (p.spin) {
        o.rotation.x += p.spin * dt;
        o.rotation.z += p.spin * 0.7 * dt;
      }
      if (p.grow) o.scale.setScalar(1 + (p.age / p.life) * p.grow);
      if (p.fade) p.fade.opacity = Math.max(0, 1 - p.age / p.life);
      if (p.age >= p.life) {
        this.world.remove(o);
        this.items.splice(i, 1);
      }
    }
  }

  // Yazıları ekran koordinatına yerleştir (her karede)
  render(camera, width, height, dt) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      this.tmp.set(p.x, p.y + p.age * 2.2, 0.5).project(camera);
      p.el.style.transform = `translate(${((this.tmp.x + 1) / 2) * width}px, ${((1 - this.tmp.y) / 2) * height}px) translate(-50%, -50%)`;
      p.el.style.opacity = String(Math.max(0, 1 - Math.max(0, p.age - 0.5) / 0.4));
      if (p.age > 0.9) {
        p.el.remove();
        this.popups.splice(i, 1);
      }
    }
  }
}
