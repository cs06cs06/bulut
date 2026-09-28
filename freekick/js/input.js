// Swipe capture + the glowing finger trail drawn on a 2D overlay canvas.
export class SwipeInput {
  constructor(el, canvas) {
    this.el = el;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.enabled = false;
    this.points = [];
    this.active = false;
    this.fade = [];
    this.onSwipe = null;
    this.onMove = null;
    this.onStart = null;
    this.resize();
    addEventListener('resize', () => this.resize());
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', () => this.cancel());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
  }
  down(e) {
    if (!this.enabled || this.active) return;
    this.active = true;
    this.pointerId = e.pointerId;
    this.el.setPointerCapture?.(e.pointerId);
    this.points = [{ x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() }];
    this.onStart?.();
  }
  move(e) {
    if (!this.active || e.pointerId !== this.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ce of evs) this.points.push({ x: ce.clientX, y: ce.clientY, t: ce.timeStamp || e.timeStamp || performance.now() });
    this.onMove?.(this.points);
    // a very long drag ends by itself
    if (this.points.length > 3 && this.points[this.points.length - 1].t - this.points[0].t > 1400) this.up(e);
  }
  up(e) {
    if (!this.active || (e && e.pointerId !== this.pointerId)) return;
    this.active = false;
    const pts = this.points;
    this.fade.push({ pts, life: 1 });
    this.points = [];
    if (pts.length >= 2) this.onSwipe?.(pts);
  }
  cancel() {
    if (!this.active) return;
    this.active = false;
    this.fade.push({ pts: this.points, life: 1 });
    this.points = [];
  }
  drawStroke(pts, alpha) {
    const g = this.ctx;
    if (pts.length < 2) return;
    const n = pts.length;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) {
        const f = i / (n - 1);
        const w = (pass === 0 ? 22 : 7) * (0.35 + 0.65 * f) * this.dpr;
        g.strokeStyle = pass === 0
          ? `rgba(255, 210, 63, ${0.22 * alpha * f})`
          : `rgba(255, 255, 255, ${0.92 * alpha * (0.3 + 0.7 * f)})`;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(pts[i - 1].x * this.dpr, pts[i - 1].y * this.dpr);
        g.lineTo(pts[i].x * this.dpr, pts[i].y * this.dpr);
        g.stroke();
      }
    }
    const last = pts[n - 1];
    const r = 13 * this.dpr;
    const grd = g.createRadialGradient(last.x * this.dpr, last.y * this.dpr, 0, last.x * this.dpr, last.y * this.dpr, r * 2);
    grd.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`);
    grd.addColorStop(0.4, `rgba(255,210,63,${0.35 * alpha})`);
    grd.addColorStop(1, 'rgba(255,210,63,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(last.x * this.dpr, last.y * this.dpr, r * 2, 0, Math.PI * 2); g.fill();
  }
  render(dt) {
    const g = this.ctx;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const f of this.fade) f.life -= dt * 2.2;
    this.fade = this.fade.filter((f) => f.life > 0);
    for (const f of this.fade) this.drawStroke(f.pts, f.life * f.life);
    if (this.active) this.drawStroke(this.points, 1);
  }
}
