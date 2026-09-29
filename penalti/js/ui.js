// DOM HUD helpers.
const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'scoreH', 'scoreA', 'dotsH', 'dotsA', 'roundLabel', 'turnTag', 'turnTitle', 'turnSub', 'reticle', 'curveArrow', 'powerWrap', 'powerFill', 'powerCursor', 'powerSweet', 'curveWrap', 'curveKnob',
      'banner', 'bannerText', 'bannerSub', 'replayTag', 'toast', 'hint', 'touchUI', 'menu', 'how', 'end', 'endTitle', 'endScore', 'endStats', 'endKicker', 'pause', 'loading', 'loadFill', 'loadText', 'loadTip', 'fatal', 'fatalText', 'fps', 'btnPlay', 'btnDiff', 'btnQuality', 'btnSound', 'btnReplay', 'btnHow', 'btnHowClose', 'btnAgain', 'btnMenu', 'btnResume', 'btnPauseMenu', 'btnPause', 'btnShoot', 'btnCurveL', 'btnCurveR'])
      this.el[id] = $(id);
    this._toastT = 0;
  }
  show(id) { this.el[id].classList.remove('hidden'); }
  hide(id) { this.el[id].classList.add('hidden'); }
  setLoad(p, text) { this.el.loadFill.style.width = Math.round(p * 100) + '%'; if (text) this.el.loadText.textContent = text; }
  setTip(t) { this.el.loadTip.textContent = t; }
  score(h, a) { this.el.scoreH.textContent = h; this.el.scoreA.textContent = a; }
  dots(match) {
    const mk = (team, cont) => {
      const kicks = match[team].kicks; const n = Math.max(5, kicks.length + (match.turn === team ? 1 : 0));
      let html = '';
      for (let i = 0; i < n; i++) {
        const r = kicks[i];
        html += `<span class="dot ${r === undefined ? (match.turn === team && i === kicks.length && !match.over ? 'now' : '') : r ? 'goal' : 'miss'}"></span>`;
      }
      cont.innerHTML = html;
    };
    mk('home', this.el.dotsH); mk('away', this.el.dotsA);
    this.el.roundLabel.textContent = match.sudden ? `AYNI ANDA ÖLÜM • ${match.round}. TUR` : `${Math.min(match.round, 5)}. ATIŞ`;
  }
  turn(title, sub, defend = false) {
    this.el.turnTitle.textContent = title; this.el.turnSub.textContent = sub;
    this.el.turnTag.classList.toggle('defend', defend);
  }
  banner(text, sub = '', tint = '#ffd400') {
    const b = this.el.banner; this.el.bannerText.textContent = text; this.el.bannerSub.textContent = sub;
    b.style.setProperty('--tint', tint);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  toast(text, ms = 1800) {
    const t = this.el.toast; t.textContent = text; t.classList.add('show');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  hint(text) { const h = this.el.hint; if (!text) { h.classList.remove('show'); return; } h.textContent = text; h.classList.add('show'); }
  reticle(x, y, show, mode = '') {
    const r = this.el.reticle;
    r.classList.toggle('show', !!show);
    r.classList.toggle('defend', mode === 'defend'); r.classList.toggle('locked', mode === 'locked');
    r.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
  power(p, sweetLo = 0.68, sweetHi = 0.9) {
    this.el.powerFill.style.height = (p * 100).toFixed(1) + '%';
    this.el.powerCursor.style.bottom = `calc(${(p * 100).toFixed(1)}% - 2px)`;
    this.el.powerSweet.style.bottom = (sweetLo * 100) + '%'; this.el.powerSweet.style.height = ((sweetHi - sweetLo) * 100) + '%';
  }
  curve(c) { this.el.curveKnob.style.left = (50 + c * 46).toFixed(1) + '%'; }
  cinema(on) { document.body.classList.toggle('cinema', on); }
}
