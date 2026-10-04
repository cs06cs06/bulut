import * as THREE from 'three';

// Mail route: start at the post office, drop a letter at five mailboxes (slow down next to each),
// nearest-neighbour order, time bonus for a quick round.
export class PostalRoute {
  constructor({ scene, terrain, hud, audio, progress, glowTex, office, mailboxes }) {
    Object.assign(this, { terrain, hud, audio, progress, office, mailboxes });
    this.active = null;
    const mat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffe08a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beacon = new THREE.Group();
    for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(mat); sp.scale.setScalar(4.5 - i * 0.5); sp.position.y = 1.5 + i * 6; this.beacon.add(sp); }
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.officeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe08a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.officeGlow.scale.set(9, 9, 1);
    this.officeGlow.position.set(office.x, terrain.heightAt(office.x, office.z) + 1.6, office.z);
    scene.add(this.officeGlow);
    this.time = 0;
  }

  near(pos) { return !this.active && Math.hypot(pos.x - this.office.x, pos.z - this.office.z) < 10; }

  start() {
    // five random mailboxes, visited in nearest-neighbour order from the office
    const pool = this.mailboxes.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const pick = pool.slice(0, Math.min(5, pool.length));
    const order = [];
    let cx = this.office.x, cz = this.office.z;
    while (pick.length) {
      let bi = 0, bd = Infinity;
      pick.forEach((m, i) => { const d = Math.hypot(m.x - cx, m.z - cz); if (d < bd) { bd = d; bi = i; } });
      const m = pick.splice(bi, 1)[0]; order.push(m); cx = m.x; cz = m.z;
    }
    let len = 0, px = this.office.x, pz = this.office.z;
    for (const m of order) { len += Math.hypot(m.x - px, m.z - pz) * 1.35; px = m.x; pz = m.z; }
    this.active = { order, i: 0, t: 0, limit: Math.round(len / 15 + 40), pay: 0 };
    this._placeBeacon();
    this.audio.play('ui_switch', { bus: 'ui', volume: 0.8 });
    this.hud.toast('Posta Turu', `${order.length} posta kutusu`, 'Kutuların yanında yavaşla, mektup kendiliğinden atılır. Süre bonusu için acele et!');
  }

  cancel() {
    if (!this.active) return;
    this.active = null; this.beacon.visible = false; this.hud.objective(null);
  }

  _placeBeacon() {
    const m = this.active.order[this.active.i];
    this.beacon.position.set(m.x, this.terrain.heightAt(m.x, m.z), m.z);
    this.beacon.visible = true;
  }

  update(dt, vehicle) {
    this.time += dt;
    this.officeGlow.material.opacity = this.active ? 0.12 : 0.28 + Math.sin(this.time * 2.5) * 0.1;
    const a = this.active;
    if (!a) return null;
    a.t += dt;
    this.beacon.children.forEach((s, i) => { s.material.opacity = 0.35 + Math.sin(this.time * 4 + i) * 0.15; });
    const m = a.order[a.i];
    const pos = vehicle.position;
    const dist = Math.hypot(pos.x - m.x, pos.z - m.z);
    if (dist < 9 && vehicle.speed < 9) {
      const tip = Math.round(40 + Math.max(0, 9 - vehicle.speed) * 3);
      a.pay += tip;
      this.progress.addMoney(tip);
      this.hud.popup(`Posta teslim! <small>+$${tip}</small>`);
      this.audio.play('ui_click', { bus: 'ui', volume: 1, rate: 1.4 });
      a.i++;
      if (a.i >= a.order.length) {
        const bonus = a.t <= a.limit ? 250 : 0;
        if (bonus) this.progress.addMoney(bonus);
        this.progress.stat('mailRoutes', 1);
        this.progress.daily('mail');
        this.hud.toast('Posta Turu Bitti', `+$${a.pay + bonus}`, bonus ? `Süre bonusu: $${bonus}` : 'Süre bonusu kaçtı, bir dahakine!');
        this.audio.play('discover', { bus: 'ui', volume: 0.8 });
        this.cancel();
        return null;
      }
      this._placeBeacon();
    }
    const n = a.order[a.i], d2 = Math.hypot(pos.x - n.x, pos.z - n.z);
    const left = Math.max(0, a.limit - a.t);
    this.hud.objective({
      title: `Posta Turu · ${a.i}/${a.order.length}`,
      lines: [`Sıradaki kutu: ${d2 < 1000 ? Math.round(d2) + ' m' : (d2 / 1000).toFixed(1) + ' km'}`, left > 0 ? `Bonus için ${Math.ceil(left)} sn` : 'Bonus süresi doldu'],
    });
    return { target: [n.x, n.z] };
  }
}
