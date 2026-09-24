// Klavye, dokunmatik ve oyun kolu girişlerini tek bir arayüzde birleştirir.
// isDown(eylem): tuş basılı mı; take(eylem): bu tuşa yeni basıldıysa bir kez true döner.

const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  KeyZ: 'jump',
  KeyK: 'jump',
  ArrowDown: 'down',
  KeyS: 'down',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyX: 'run',
  KeyJ: 'run',
  Enter: 'start',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = new Set();
    this.pad = new Set();
    this.latch = new Set();
    this.onAnyInput = null;
    this.touchVisible = false;

    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!e.repeat) this.#press(a, this.keys);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.keys.delete(a);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.clear();
    });
  }

  #press(action, set) {
    if (!set.has(action)) this.latch.add(action);
    set.add(action);
    this.onAnyInput?.(action);
  }

  isDown(a) {
    return this.keys.has(a) || this.touch.has(a) || this.pad.has(a);
  }

  take(a) {
    const had = this.latch.has(a);
    this.latch.delete(a);
    return had;
  }

  clearLatches() {
    this.latch.clear();
  }

  // Ekrandaki dokunmatik tuşları bağla
  bindTouch(root) {
    const show = () => {
      if (this.touchVisible) return;
      this.touchVisible = true;
      root.hidden = false;
      document.body.classList.add('has-touch');
    };
    if (window.matchMedia?.('(pointer: coarse)').matches) show();
    window.addEventListener('touchstart', show, { passive: true });

    const dpad = root.querySelector('[data-dpad]');
    const pointers = new Map();
    const updateDpad = () => {
      const dirs = new Set(pointers.values());
      for (const a of ['left', 'right', 'down']) {
        if (dirs.has(a)) {
          if (!this.touch.has(a)) this.#press(a, this.touch);
        } else this.touch.delete(a);
      }
      dpad.dataset.active = [...dirs].join(' ');
    };
    const dirFor = (e) => {
      const r = dpad.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      if (dy > 0.55 && Math.abs(dx) < 0.45) return 'down';
      return dx < 0 ? 'left' : 'right';
    };
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dpad.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, dirFor(e));
      updateDpad();
    });
    dpad.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, dirFor(e));
      updateDpad();
    });
    const release = (e) => {
      pointers.delete(e.pointerId);
      updateDpad();
    };
    dpad.addEventListener('pointerup', release);
    dpad.addEventListener('pointercancel', release);

    for (const btn of root.querySelectorAll('[data-act]')) {
      const a = btn.dataset.act;
      const ids = new Set();
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        ids.add(e.pointerId);
        btn.classList.add('down');
        this.#press(a, this.touch);
      });
      const up = (e) => {
        ids.delete(e.pointerId);
        if (ids.size === 0) {
          btn.classList.remove('down');
          this.touch.delete(a);
        }
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    }
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Oyun kolu (standart eşleme): sol çubuk/yön tuşları, A zıpla, X/B koş, Start duraklat
  poll() {
    const pads = navigator.getGamepads?.() || [];
    const now = new Set();
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      const b = (i) => p.buttons[i]?.pressed;
      if (ax < -0.4 || b(14)) now.add('left');
      if (ax > 0.4 || b(15)) now.add('right');
      if ((p.axes[1] || 0) > 0.6 || b(13)) now.add('down');
      if (b(0) || b(3)) now.add('jump');
      if (b(1) || b(2)) now.add('run');
      if (b(9)) now.add('pause');
      if (b(9) || b(0)) now.add('start');
    }
    for (const a of now) if (!this.pad.has(a)) this.#press(a, this.pad);
    for (const a of [...this.pad]) if (!now.has(a)) this.pad.delete(a);
  }
}
