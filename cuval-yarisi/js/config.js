// Oyun ayarları: karakterler, zorluk seviyeleri, pist ölçüleri.

// Yarış müziği: yarış başlayınca çalar, döngüye girer, ana menüye dönünce susar.
// Varsayılan parça Santuri Ethem Efendi'nin "Şehnaz Longa"sının (Tosun Paşa filminde de çalan
// kamu malı beste) fasıl topluluğu düzenlemesidir; nota SymbTr'den (CC BY-NC-SA 4.0).
// Başka bir parça için url'yi değiştirin; bpm ve firstBeat (ilk güçlü vuruşun saniyesi)
// davulcuyu müziğe kilitler, loopBeats döngünün kaç vuruşta kapanacağıdır (0 = parça sonu).
export const THEME = { url: 'assets/audio/tema.mp3', bpm: 150, firstBeat: 0, loopBeats: 192, vol: 0.85 };

export const TRACK = {
  length: 50,        // metre: başlangıç çizgisinden bitiş ipine
  laneWidth: 1.7,
  lanes: 6,
};

// Fiziksel zıplama sabitleri (karakter istatistikleriyle ölçeklenir)
export const HOP = {
  baseDist: 1.05,     // kombo 0'daki zıplama mesafesi (m)
  comboGain: 0.085,   // her kombo seviyesinin mesafeye katkısı
  maxCombo: 7,
  height: 0.42,       // zıplama yüksekliği (m)
  goodWindow: 0.05,   // inişten sonra bu süreden önce basmak "acele"
  lateLimit: 0.62,    // bu süreden sonra kombo tamamen sıfırlanır
  bufferWindow: 0.11, // inişe bu kadar kala basılırsa tamponlanır
};

// Oyuncunun seçebileceği Tellioğlu kadınları (isimler filmdeki kadrodan)
export const HEROES = [
  {
    id: 'adile',
    name: 'Adile',
    family: 'Tellioğlu',
    title: 'Tellioğlu Adile',
    blurb: 'Güçlü ve inatçı. Bir kez hızlandı mı durdurana aşk olsun.',
    stats: { guc: 5, denge: 4, ceviklik: 2 },
    look: { build: 1.28, height: 1.0, dress: 0x7a1424, vest: 0x2b0f0a, trim: 0xd9a441, scarf: 0xf2ead7, scarfTrim: 0xc0392b, skin: 0xe9b995, hair: 0x2a1a12, brows: 0x2a1a12, cheeks: 0.55 },
  },
  {
    id: 'zekiye',
    name: 'Zekiye',
    family: 'Tellioğlu',
    title: 'Tellioğlu Zekiye',
    blurb: 'Çevik ama aceleci. Ritmi tutturursa kimse yetişemez.',
    stats: { guc: 3, denge: 3, ceviklik: 5 },
    look: { build: 0.95, height: 1.03, dress: 0xb3263a, vest: 0x4a1020, trim: 0xe8c36a, scarf: 0xe94e3c, scarfTrim: 0xf6d36b, skin: 0xf0c4a2, hair: 0x5a3020, brows: 0x4a2618, cheeks: 0.45 },
  },
  {
    id: 'hatice',
    name: 'Hatice',
    family: 'Tellioğlu',
    title: 'Tellioğlu Hatice',
    blurb: 'Sakin ve dengeli. Kombosunu kolay kolay kaybetmez.',
    stats: { guc: 4, denge: 5, ceviklik: 3 },
    look: { build: 1.08, height: 0.98, dress: 0x9c4a2f, vest: 0x3a1a0c, trim: 0xd9a441, scarf: 0xf3d9a4, scarfTrim: 0x8f1d21, skin: 0xe2ad88, hair: 0x1c120c, brows: 0x1c120c, cheeks: 0.4 },
  },
];

// Rakip Seferoğlu kadınları. Rukiye filmdeki kadrodan; diğer ikisi oyun için uyduruldu.
export const RIVALS = [
  {
    id: 'rukiye', name: 'Rukiye', family: 'Seferoğlu', title: 'Seferoğlu Rukiye',
    stats: { guc: 4, denge: 3, ceviklik: 4 }, personality: { aggression: 0.85, nerves: 0.5 },
    look: { build: 1.12, height: 1.0, dress: 0x1f4e79, vest: 0x0e2238, trim: 0xc9d1d9, scarf: 0x2e86c1, scarfTrim: 0xf4f6f7, skin: 0xe6b38f, hair: 0x2b1b10, brows: 0x2b1b10, cheeks: 0.4 },
  },
  {
    id: 'nazire', name: 'Nazire', family: 'Seferoğlu', title: 'Seferoğlu Nazire',
    stats: { guc: 3, denge: 4, ceviklik: 4 }, personality: { aggression: 0.55, nerves: 0.3 },
    look: { build: 0.98, height: 1.02, dress: 0x1e6b4f, vest: 0x0d3326, trim: 0xe6d690, scarf: 0x7fb3a0, scarfTrim: 0xffffff, skin: 0xf1c9a8, hair: 0x6b3b1f, brows: 0x5a2f18, cheeks: 0.45 },
  },
  {
    id: 'fitnat', name: 'Fitnat', family: 'Seferoğlu', title: 'Seferoğlu Fitnat',
    stats: { guc: 5, denge: 2, ceviklik: 3 }, personality: { aggression: 1.0, nerves: 0.75 },
    look: { build: 1.22, height: 0.97, dress: 0x4b2c6f, vest: 0x22123a, trim: 0xd0b46a, scarf: 0x6c3483, scarfTrim: 0xf5cba7, skin: 0xdba67f, hair: 0x140c08, brows: 0x140c08, cheeks: 0.5 },
  },
];

export const DIFFICULTIES = [
  { id: 'kolay', label: 'Kolay', skill: [0.45, 0.6], rubber: 0.2, sweet: 0.2, aiPace: 0.84 },
  { id: 'orta', label: 'Orta', skill: [0.66, 0.8], rubber: 0.12, sweet: 0.17, aiPace: 0.94 },
  { id: 'zor', label: 'Zor', skill: [0.8, 0.9], rubber: 0.05, sweet: 0.15, aiPace: 0.97 },
];

// Karakter istatistiklerini fiziksel parametrelere çevirir
export function derive(stats, sweetBase) {
  const g = stats.guc, d = stats.denge, c = stats.ceviklik;
  return {
    distMul: 0.86 + g * 0.055,            // güç: zıplama mesafesi
    comboMul: 0.85 + d * 0.05,            // denge: hızlandıkça kontrolü kaybetmeden kombo kazanma
    airTime: 0.5 - c * 0.022,             // çeviklik: daha kısa havada kalma = daha hızlı tempo
    wobbleGain: 1.35 - d * 0.13,          // denge: sallanma hassasiyeti
    wobbleDecay: 0.18 + d * 0.03,
    sweet: sweetBase + (c - 3) * 0.008 + (d - 3) * 0.006,
    recover: 1.75 - g * 0.06,             // düştükten sonra kalkma süresi
  };
}

export const POINTS = [6, 5, 4, 3, 2, 1];
