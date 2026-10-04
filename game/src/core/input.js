// Keyboard + gamepad input with smoothed analog axes.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.throttle = 0; this.brake = 0; this.steer = 0; this.handbrake = false;
    this.lookX = 0; this.lookY = 0;
    this.usingGamepad = false;
    this._padPrev = {};
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code); this.usingGamepad = false;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.touch = {};
    this._initTouch();
    addEventListener('blur', () => this.keys.clear());
  }

  // on-screen buttons for phones/tablets
  _initTouch() {
    const root = document.getElementById('touch');
    if (!root) return;
    const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.touchEnabled = coarse;
    root.querySelectorAll('[data-t]').forEach((b) => {
      const on = (e) => { e.preventDefault(); this.touch[b.dataset.t] = true; b.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.touch[b.dataset.t] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    });
    root.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pressed.add(b.dataset.k); }));
  }

  wasPressed(code) { return this.pressed.has(code); }

  update(dt) {
    const k = this.keys;
    let thr = (k.has('KeyW') || k.has('ArrowUp')) ? 1 : 0;
    let brk = (k.has('KeyS') || k.has('ArrowDown')) ? 1 : 0;
    let st = ((k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0) - ((k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0);
    let hb = k.has('Space');
    const t = this.touch;
    if (t.gas) thr = 1;
    if (t.brake) brk = 1;
    if (t.left || t.right) st = (t.left ? 1 : 0) - (t.right ? 1 : 0);
    if (t.hb) hb = true;
    let lookX = 0, lookY = 0;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      const rt = p.buttons[7]?.value || 0, lt = p.buttons[6]?.value || 0;
      const sx = dz(p.axes[0] || 0);
      if (rt > 0.05 || lt > 0.05 || Math.abs(sx) > 0 || p.buttons[0]?.pressed) this.usingGamepad = true;
      if (this.usingGamepad) {
        thr = Math.max(thr, rt); brk = Math.max(brk, lt);
        if (Math.abs(sx) > 0) st = -sx;
        hb = hb || p.buttons[0]?.pressed || p.buttons[2]?.pressed;
        lookX = dz(p.axes[2] || 0); lookY = dz(p.axes[3] || 0);
        const map = { 3: 'KeyR', 9: 'Escape', 8: 'KeyM', 1: 'KeyH', 5: 'KeyC', 12: 'KeyF', 4: 'KeyB' };
        for (const [b, code] of Object.entries(map)) {
          const now = !!p.buttons[b]?.pressed;
          if (now && !this._padPrev[b]) this.pressed.add(code);
          if (now) this.keys.add('Pad' + code); else this.keys.delete('Pad' + code);
          this._padPrev[b] = now;
        }
      }
      break;
    }
    // keyboard steering is smoothed, gamepad is direct
    const steerRate = this.usingGamepad ? 12 : (st === 0 ? 5 : 3.2);
    this.steer += (st - this.steer) * Math.min(1, steerRate * dt);
    this.throttle += (thr - this.throttle) * Math.min(1, 10 * dt);
    this.brake += (brk - this.brake) * Math.min(1, 12 * dt);
    this.handbrake = hb;
    this.lookX = lookX; this.lookY = lookY;
    this.boost = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('PadKeyB');
  }

  endFrame() { this.pressed.clear(); }
}
