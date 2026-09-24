// Ekran üstü arayüz: puan tablosu, menü ekranları ve yükleme durumu.

const $ = (id) => document.getElementById(id);

const SCREENS = ['title', 'intro', 'pause', 'gameover', 'win'];

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      score: $('hud-score'),
      coins: $('hud-coins'),
      world: $('hud-world'),
      time: $('hud-time'),
      lives: $('hud-lives'),
      start: $('btn-start'),
      status: $('asset-status'),
      best: $('best-score'),
      introWorld: $('intro-world'),
      introName: $('intro-name'),
      introLives: $('intro-lives'),
      finalScore: $('final-score'),
      winScore: $('win-score'),
      winBest: $('win-best'),
      mute: $('btn-mute'),
    };
    this.popupRoot = $('popups');
    this.last = {};
  }

  setLoading(p) {
    this.el.start.disabled = p < 1;
    this.el.start.textContent = p < 1 ? `Yükleniyor… %${Math.round(p * 100)}` : 'Başla';
  }

  showError(message) {
    this.el.start.disabled = true;
    this.el.start.textContent = 'Yüklenemedi';
    this.el.status.textContent = message;
  }

  setAssetStatus(stats, total) {
    const s = this.el.status;
    if (stats.meshy === 0) {
      s.textContent = `3D modeller: yer tutucu (${total}). Meshy AI modelleri üretildiğinde otomatik yüklenir.`;
    } else if (stats.meshy < total) {
      s.textContent = `3D modeller: ${stats.meshy}/${total} Meshy AI, geri kalanı yer tutucu.`;
    } else {
      s.textContent = `3D modeller: Meshy AI ile üretildi (${total}/${total}).`;
    }
    if (stats.failed.length) s.textContent += ` Yüklenemeyen: ${stats.failed.join(', ')}.`;
  }

  setMuted(muted) {
    this.el.mute.setAttribute('aria-pressed', String(muted));
    this.el.mute.classList.toggle('off', muted);
  }

  screen(name, data = {}) {
    for (const s of SCREENS) $('screen-' + s).hidden = s !== name;
    this.el.hud.hidden = name === 'title';
    if (name === 'title') this.el.best.textContent = String(data.best ?? 0);
    if (name === 'intro') {
      this.el.introWorld.textContent = data.id;
      this.el.introName.textContent = data.name;
      this.el.introLives.textContent = String(data.lives);
    }
    if (name === 'gameover') this.el.finalScore.textContent = String(data.score).padStart(6, '0');
    if (name === 'win') {
      this.el.winScore.textContent = String(data.score).padStart(6, '0');
      this.el.winBest.hidden = !data.newBest;
    }
  }

  update(g) {
    const v = {
      score: String(g.score).padStart(6, '0'),
      coins: String(g.coins).padStart(2, '0'),
      world: g.level?.def.id ?? '1-1',
      time: String(Math.max(0, g.time)).padStart(3, '0'),
      lives: String(g.lives),
    };
    for (const k in v) {
      if (this.last[k] !== v[k]) {
        this.el[k].textContent = v[k];
        this.last[k] = v[k];
      }
    }
    this.el.time.classList.toggle('hurry', g.time <= 100);
  }
}
