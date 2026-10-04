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
  { id: 'trap', name: 'Radar Avcısı', desc: 'Bir hız kapanından 130 km/sa ile geç.', reward: 300, test: (s) => s.maxTrap >= 130 },
  { id: 'jump', name: 'Uçan Kamyon', desc: 'Bir atlama noktasında 45 metre uç.', reward: 400, test: (s) => s.maxJump >= 45 },
  { id: 'postman', name: 'Postacı', desc: '3 posta turu tamamla.', reward: 400, test: (s) => s.mailRoutes >= 3 },
  { id: 'winner', name: 'İlk Zafer', desc: 'Bir yarışı birinci bitir.', reward: 400, test: (s) => s.raceWins >= 1 },
  { id: 'champion', name: 'Palouse Şampiyonu', desc: 'Üç yarışın hepsini kazan.', reward: 1500, test: (s, g, p) => ['north', 'west', 'south'].every((id) => p.data.races?.[id] === 1) },
  { id: 'legend', name: 'Palouse’un Yeni Efsanesi', desc: 'Hikâyeyi tamamla.', reward: 1000, test: (s, g, p) => !!p.data.storyDone },
  { id: 'barnfind', name: 'Hurda Avcısı', desc: 'Bir ahır buluntusunu restore et.', reward: 400, test: (s, g, p) => p.data.owned.some((id) => ['semi', 'van'].includes(id)) },
  { id: 'towers', name: 'Gözcü', desc: 'Tüm gözetleme kulelerine çık.', reward: 500, test: (s, g, p) => (p.data.towers || []).length >= 4 },
  { id: 'hitch', name: 'Otostop Dostu', desc: '5 otostopçuyu gideceği yere bırak.', reward: 400, test: (s) => s.rides >= 5 },
  { id: 'rancher', name: 'Usta Kovboy', desc: 'Kaçan bir sürüyü ağıla geri getir.', reward: 350, test: (s) => s.herds >= 1 },
  { id: 'distance', name: 'Uzun Yol', desc: 'Toplam 40 km yol yap.', reward: 500, test: (s) => s.distance >= 40000 },
];

// Daily tasks: three per calendar day, picked deterministically from this pool
export const DAILY_POOL = [
  { id: 'deliver', name: 'Teslimat yap', goals: [2, 3], unit: '', reward: 250 },
  { id: 'dist', name: 'Yol yap', goals: [5, 8], unit: 'km', reward: 200, scale: 1000 },
  { id: 'air', name: 'Uzun atlayış yap (1 sn+)', goals: [3, 5], unit: '', reward: 200 },
  { id: 'drift', name: 'Drift yap (1,5 sn+)', goals: [4, 6], unit: '', reward: 180 },
  { id: 'fence', name: 'Çit devir', goals: [5, 10], unit: '', reward: 120 },
  { id: 'scare', name: 'Hayvan ürküt', goals: [4, 8], unit: '', reward: 120 },
  { id: 'trap', name: 'Hız kapanından geç (90+ km/sa)', goals: [2, 3], unit: '', reward: 200 },
  { id: 'race', name: 'Görev ya da yarış bitir', goals: [1, 2], unit: '', reward: 300 },
  { id: 'mail', name: 'Posta turu tamamla', goals: [1, 2], unit: '', reward: 250 },
  { id: 'ride', name: 'Otostopçu taşı', goals: [1, 2], unit: '', reward: 220 },
];
const DAILY_STAT = { deliveries: 'deliver', distance: 'dist', fences: 'fence', scared: 'scare' };

// Driver level: XP is everything you have ever earned. Paints unlock along the way.
export const PAINT_LEVELS = { green: 1, red: 1, blue: 1, cream: 2, orange: 3, black: 5, white: 6, gold: 8 };
export const levelXP = (L) => 250 * L * (L - 1); // total XP needed to reach level L
export function levelOf(xp) { let L = 1; while (xp >= levelXP(L + 1)) L++; return L; }

function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

export class Progress {
  constructor() {
    this.data = this._load();
    this.onChange = null;
    this.onAchievement = null;
  }

  _load() {
    const def = {
      money: 250, owned: ['pickup'], current: 'pickup', upgrades: { engine: 0, tires: 0, susp: 0 },
      stats: { deliveries: 0, perfect: 0, cargoLost: 0, maxAir: 0, maxDrift: 0, topSpeed: 0, distance: 0, fences: 0, scared: 0, golds: 0, earned: 0, maxTrap: 0, maxJump: 0, mailRoutes: 0, raceWins: 0, rides: 0, herds: 0 },
      achievements: [], daily: null,
    };
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { ...def, ...d, upgrades: { ...def.upgrades, ...(d.upgrades || {}) }, stats: { ...def.stats, ...(d.stats || {}) } };
    } catch { return def; }
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ } }

  get money() { return this.data.money; }
  get level() { return levelOf(this.data.stats.earned); }
  get xpInfo() { const L = this.level, a = levelXP(L), b = levelXP(L + 1); return { level: L, frac: (this.data.stats.earned - a) / (b - a), next: b - this.data.stats.earned }; }

  _checkLevel() {
    const L = this.level;
    if (this.data.level === undefined) { this.data.level = L; return; } // existing saves: no back-pay
    while (this.data.level < L) {
      this.data.level++;
      const reward = this.data.level * 100;
      this.data.money += reward;
      const paints = Object.entries(PAINT_LEVELS).filter(([, l]) => l === this.data.level).map(([k]) => k);
      this.onLevel?.(this.data.level, reward, paints);
    }
  }
  get stats() { return this.data.stats; }

  addMoney(n) {
    if (!n) return;
    this.data.money += n;
    if (n > 0) this.data.stats.earned += n;
    this._checkLevel();
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
    if (mode === 'add' && DAILY_STAT[key]) this.daily(DAILY_STAT[key], value);
  }

  // ------------------------------------------------------------ daily tasks
  get dailyTasks() {
    const day = today();
    if (!this.data.daily || this.data.daily.day !== day) {
      let seed = 0; for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      const pool = DAILY_POOL.slice(), tasks = [];
      while (tasks.length < 3) {
        const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
        tasks.push({ id: t.id, goal: t.goals[Math.floor(rnd() * t.goals.length)], value: 0, done: false });
      }
      this.data.daily = { day, tasks, bonus: false };
      this.save();
    }
    return this.data.daily;
  }

  daily(id, amount = 1) {
    const d = this.dailyTasks;
    for (const t of d.tasks) {
      if (t.id !== id || t.done) continue;
      const def = DAILY_POOL.find((p) => p.id === id);
      t.value += amount / (def.scale || 1);
      if (t.value >= t.goal) {
        t.value = t.goal; t.done = true;
        this.data.money += def.reward; this.data.stats.earned += def.reward;
        this.onDaily?.(def, t, false);
        if (!d.bonus && d.tasks.every((x) => x.done)) {
          d.bonus = true; this.data.money += 500; this.data.stats.earned += 500;
          this.onDaily?.(null, null, true);
        }
        this.onChange?.();
      }
      this._dirty = true;
    }
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
    this._checkLevel();
    if (this._dirty) { this._dirty = false; this.save(); }
  }

  reset() { localStorage.removeItem(KEY); this.data = this._load(); this.onChange?.(); }
}
