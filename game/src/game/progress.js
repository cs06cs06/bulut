// Player progression: money, garage (vehicles + upgrades), statistics and achievements.
const KEY = 'tozlu-yollar-progress-v1';

export const ACHIEVEMENTS = [
  { id: 'firstJob', name: 'İlk Teslimat', desc: 'Bir teslimatı tamamla.', reward: 150, test: (s) => s.deliveries >= 1 },
  { id: 'trucker', name: 'Usta Nakliyeci', desc: '10 teslimat tamamla.', reward: 600, test: (s) => s.deliveries >= 10 },
  { id: 'gentle', name: 'Pamuk Eller', desc: 'Hiç yük düşürmeden bir teslimat yap.', reward: 250, test: (s) => s.perfect >= 1 },
  { id: 'air2', name: 'Kartal', desc: '2,5 saniye havada kal.', reward: 300, test: (s) => s.maxAir >= 2.5 },
  { id: 'drift', name: 'Toz Bulutu', desc: '4 saniyelik bir drift yap.', reward: 250, test: (s) => s.maxDrift >= 4 },
  { id: 'speed', name: 'Hız Tutkunu', desc: '130 km/sa hıza ulaş.', reward: 200, test: (s) => s.topSpeed >= 130 },
  { id: 'summit', name: 'Zirvede', desc: 'Steptoe Zirvesi’ne çık.', reward: 200, test: (s, g) => g.isFound('summit') },
  { id: 'explorer', name: 'Kaşif', desc: 'Tüm keşif noktalarını bul.', reward: 800, test: (s, g) => g.save.found.length >= g.pois.length },
  { id: 'pumpkins', name: 'Balkabağı Avcısı', desc: 'Tüm balkabaklarını topla.', reward: 1000, test: (s, g) => g.collectedCount >= g.collectibleTotal },
  { id: 'gold', name: 'Altın Madalya', desc: 'Bir görevde altın madalya kazan.', reward: 400, test: (s) => s.golds >= 1 },
  { id: 'fences', name: 'Çit Kırıcı', desc: '25 çit parçası devir.', reward: 150, test: (s) => s.fences >= 25 },
  { id: 'cowboy', name: 'Kovboy', desc: 'Hayvanları 15 kez ürküt.', reward: 150, test: (s) => s.scared >= 15 },
  { id: 'garage', name: 'Garaj Sahibi', desc: 'Yeni bir araç satın al.', reward: 300, test: (s, g, p) => p.data.owned.length >= 2 },
  { id: 'distance', name: 'Uzun Yol', desc: 'Toplam 40 km yol yap.', reward: 500, test: (s) => s.distance >= 40000 },
];

export class Progress {
  constructor() {
    this.data = this._load();
    this.onChange = null;
    this.onAchievement = null;
  }

  _load() {
    const def = {
      money: 250, owned: ['pickup'], current: 'pickup', upgrades: { engine: 0, tires: 0, susp: 0 },
      stats: { deliveries: 0, perfect: 0, cargoLost: 0, maxAir: 0, maxDrift: 0, topSpeed: 0, distance: 0, fences: 0, scared: 0, golds: 0, earned: 0 },
      achievements: [],
    };
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { ...def, ...d, upgrades: { ...def.upgrades, ...(d.upgrades || {}) }, stats: { ...def.stats, ...(d.stats || {}) } };
    } catch { return def; }
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ } }

  get money() { return this.data.money; }
  get stats() { return this.data.stats; }

  addMoney(n) {
    if (!n) return;
    this.data.money += n;
    if (n > 0) this.data.stats.earned += n;
    this.save();
    this.onChange?.();
  }

  spend(n) {
    if (this.data.money < n) return false;
    this.data.money -= n; this.save(); this.onChange?.();
    return true;
  }

  stat(key, value, mode = 'add') {
    const s = this.data.stats;
    if (mode === 'max') { if (value <= s[key]) return; s[key] = value; } else s[key] += value;
    this._dirty = true;
  }

  // called a few times per second; unlocks achievements and persists stats
  check(gameplay) {
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements.includes(a.id)) continue;
      let ok = false;
      try { ok = a.test(this.data.stats, gameplay, this); } catch { ok = false; }
      if (ok) {
        this.data.achievements.push(a.id);
        this.data.money += a.reward; this.data.stats.earned += a.reward;
        this._dirty = true;
        this.onAchievement?.(a);
        this.onChange?.();
      }
    }
    if (this._dirty) { this._dirty = false; this.save(); }
  }

  reset() { localStorage.removeItem(KEY); this.data = this._load(); this.onChange?.(); }
}
