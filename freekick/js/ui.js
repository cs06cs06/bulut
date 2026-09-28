const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), shot: $('hud-shot'), score: $('hud-score'), lives: $('hud-lives'), livesCell: $('hud-lives-cell'),
      streakCell: $('hud-streak-cell'), streak: $('hud-streak'), dist: $('hud-dist'), windArrow: $('hud-wind-arrow'),
      windV: $('hud-wind-v'), wind: $('hud-wind'), wall: $('hud-wall'), assist: $('hud-assist'), speed: $('hud-speed'),
      toast: $('toast'), big: $('toast-big'), small: $('toast-small'), bonus: $('toast-bonus'),
      hint: $('hint'), hintText: $('hint-text'), replay: $('replay-tag'), menu: $('menu'), best: $('menu-best'),
      pause: $('pause'), over: $('over'), loader: $('loader'), loadBar: $('load-bar'), loadLabel: $('load-label'),
      fade: $('fade'), app: $('app'),
    };
    this.toastTimer = 0;
    this.shownScore = 0;
    this.targetScore = 0;
  }

  progress(f, pending = []) {
    if (this.failed) return;
    const pct = Math.round(f * 100);
    this.el.loadBar.style.width = pct + '%';
    this.el.loadLabel.textContent = pending.length ? `${pct}% · ${pending.slice(0, 2).join(', ')}` : pct + '%';
  }

  stage(text) {
    if (!this.failed) this.el.loadLabel.textContent = text;
  }

  loaded() {
    this.el.loader.classList.add('done');
    setTimeout(() => { this.el.loader.hidden = true; }, 700);
  }

  loadError(msg) {
    this.failed = true;
    this.el.loadLabel.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'load-error';
    p.textContent = msg;
    this.el.loadLabel.appendChild(p);
  }

  showMenu(best) {
    this.el.menu.hidden = false;
    this.el.hud.hidden = true;
    this.el.best.textContent = best;
  }

  hideMenu() { this.el.menu.hidden = true; }

  showHud(mode) {
    this.el.hud.hidden = false;
    this.el.livesCell.hidden = mode !== 'career';
  }

  setScore(v, instant) {
    this.targetScore = v;
    if (instant) { this.shownScore = v; this.el.score.textContent = v; }
  }

  setShot(n) { this.el.shot.textContent = n; }

  setLives(n, max = 3) {
    this.el.lives.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const b = document.createElement('i');
      if (i >= n) b.className = 'lost';
      this.el.lives.appendChild(b);
    }
  }

  setStreak(n) {
    this.el.streakCell.hidden = n < 2;
    this.el.streak.textContent = 'x' + n;
  }

  setSpeed(ms) {
    const el = this.el.speed;
    if (!ms) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = `Şut ${Math.round(ms * 3.6)} km/sa`;
  }

  setShotInfo({ distance, wind, windAngle, wall, assist }) {
    if (assist) this.el.assist.textContent = assist;
    this.el.speed.hidden = true;
    this.el.dist.textContent = distance.toFixed(0) + ' m';
    const kmh = wind * 3.6;
    this.el.wind.hidden = kmh < 0.5;
    this.el.windV.textContent = kmh.toFixed(0);
    this.el.windArrow.style.transform = `rotate(${windAngle}rad)`;
    this.el.wall.textContent = wall > 0 ? `${wall}'lü baraj` : 'Baraj yok';
  }

  toast(big, small = '', kind = '', bonuses = [], hold = 1.8) {
    const t = this.el.toast;
    this.el.big.textContent = big;
    this.el.big.className = 'big ' + kind;
    // long words shrink to fit narrow phones
    const len = Math.max(4, big.length);
    this.el.big.style.fontSize = `min(${kind === 'bad' ? 110 : 150}px, calc((100vw - 32px) / ${(len * 0.56).toFixed(2)}))`;
    this.el.small.textContent = small;
    this.el.small.hidden = !small;
    this.el.bonus.innerHTML = '';
    bonuses.forEach((b, i) => {
      const s = document.createElement('span');
      s.textContent = b;
      s.style.animationDelay = (0.35 + i * 0.12) + 's';
      this.el.bonus.appendChild(s);
    });
    t.classList.remove('show', 'hide');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => {
      t.classList.remove('show'); t.classList.add('hide');
      setTimeout(() => { if (t.classList.contains('hide')) this.el.bonus.innerHTML = ''; }, 400);
    }, hold * 1000);
  }

  clearToast() {
    clearTimeout(this.toastT);
    this.el.bonus.innerHTML = '';
    this.el.toast.classList.remove('show');
    this.el.toast.classList.add('hide');
  }

  hint(on, text) {
    this.el.hint.hidden = !on;
    if (text) this.el.hintText.textContent = text;
  }

  replay(on) {
    this.el.replay.hidden = !on;
    this.el.app.classList.toggle('letterbox', on);
  }

  fade(on) { this.el.fade.classList.toggle('on', on); }

  pause(on) { this.el.pause.hidden = !on; }

  gameOver(stats) {
    $('over-score').textContent = stats.score;
    $('over-goals').textContent = stats.goals;
    $('over-streak').textContent = stats.bestStreak;
    $('over-best').textContent = stats.best;
    $('over-newbest').hidden = !stats.newBest;
    this.el.over.hidden = false;
  }

  hideOver() { this.el.over.hidden = true; }

  update(dt) {
    if (this.shownScore !== this.targetScore) {
      const d = this.targetScore - this.shownScore;
      this.shownScore += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 6)));
      if (Math.abs(this.targetScore - this.shownScore) < 1) this.shownScore = this.targetScore;
      this.el.score.textContent = this.shownScore;
    }
  }
}
