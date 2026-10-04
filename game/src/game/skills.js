// Skill chain (Forza Horizon style): drifts, jumps, near misses, speed runs, smashing fences and
// spooking cattle all feed one running score. Every trick adds +0.1 to the multiplier; the chain
// banks when you go 4 seconds without a trick and is lost if you crash.
const WINDOW = 4;

export class SkillChain {
  constructor({ hud, audio, progress }) {
    Object.assign(this, { hud, audio, progress });
    this.el = { box: document.getElementById('skill'), score: document.getElementById('sk-score'), mult: document.getElementById('sk-mult'),
      list: document.getElementById('sk-list'), bar: document.getElementById('sk-bar') };
    this.reset();
    this.best = progress.data.stats.bestChain || 0;
  }

  reset() { this.score = 0; this.mult = 1; this.timer = 0; this.tricks = []; this.active = false; this._render(); }

  // name shown in the chain, base points (multiplied), merge: same trick stacking (e.g. continuous drift)
  add(name, points, merge = false) {
    points = Math.round(points);
    if (points <= 0) return;
    const last = this.tricks[this.tricks.length - 1];
    if (merge && last && last.name === name && this.timer > WINDOW - 0.6) { last.pts += points; }
    else {
      this.tricks.push({ name, pts: points });
      if (this.tricks.length > 4) this.tricks.shift();
      this.mult = Math.min(5, +(this.mult + 0.1).toFixed(1));
      if (this.active) this.audio.play('ui_click', { bus: 'ui', volume: 0.35, rate: 1 + Math.min(1, (this.mult - 1) / 3) });
    }
    this.score += points * this.mult;
    this.timer = WINDOW;
    this.active = true;
    this._render();
  }

  // a crash throws the whole chain away
  crash() {
    if (!this.active || this.score < 50) return;
    this.hud.popup(`ZİNCİR KIRILDI <small>−${Math.round(this.score).toLocaleString('tr-TR')}</small>`, 'bad');
    this.audio.play('ui_click', { bus: 'ui', volume: 0.6, rate: 0.5 });
    this.reset();
  }

  _bank() {
    const s = Math.round(this.score);
    const money = Math.round(s / 22);
    if (money > 0) {
      this.progress.addMoney(money);
      this.hud.popup(`BECERİ ZİNCİRİ ${s.toLocaleString('tr-TR')} <small>+$${money}</small>`);
      this.audio.play('discover', { bus: 'ui', volume: 0.45, rate: 1.3 });
      if (s > this.best) { this.best = s; this.progress.stat('bestChain', s, 'max'); }
      this.onBank?.(s);
    }
    this.reset();
  }

  update(dt) {
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer <= 0) this._bank();
    else this.el.bar.style.width = (this.timer / WINDOW * 100).toFixed(1) + '%';
  }

  _render() {
    const e = this.el;
    e.box.classList.toggle('hidden', !this.active);
    if (!this.active) return;
    e.score.textContent = Math.round(this.score).toLocaleString('tr-TR');
    e.mult.textContent = '×' + this.mult.toFixed(1);
    e.list.innerHTML = this.tricks.slice().reverse().map((t, i) => `<div class="${i ? '' : 'new'}">${t.name} <b>+${t.pts}</b></div>`).join('');
  }
}
