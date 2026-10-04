// Every asset in the game was downloaded from these external sources.
export const CREDITS = [
  { h: 'Arazi Verisi', items: [
    ['Steptoe Butte & Palouse yükseklik verisi', 'AWS Terrain Tiles (Mapzen/Tilezen, USGS NED kaynaklı) — açık veri', 'https://registry.opendata.aws/terrain-tiles/'],
  ] },
  { h: '3B Modeller', items: [
    ['Farm Buildings, Ultimate Animated Animals, Stylized Nature MegaKit, Ultimate Stylized Nature, Ultimate Nature', 'Quaternius — CC0', 'https://quaternius.com'],
    ['Pikap (Free Low Poly Vehicles Pack)', 'Rgsdev — CC0', 'https://opengameart.org/content/free-low-poly-vehicles-pack'],
    ['Traktör (Low Poly Tractor)', 'Rubik Fish — CC0', 'https://rubikfish.itch.io/low-poly-tractor'],
    ['Cozy Farm (posta kutusu, saman, araba, gölet, tabela)', 'styloo — CC0', 'https://styloo.itch.io/farm'],
    ['Lowpoly Farm Pack (saman balyası, kasa, balkabağı)', 'xra7en — CC BY 4.0', 'https://xra7en.itch.io/lowpoly-farm-pack'],
    ['Lowpoly Farm V2 (ahır, sarnıç)', 'AutomataWorkshop — CC0 / CC BY 4.0', 'https://automataworkshop.itch.io/lowpoly-farm'],
    ['Tavuk', 'mess110 — CC0', 'https://opengameart.org/content/chicken-3'],
    ['City Kit Suburban (çiftlik evleri), Platformer Kit (bayrak, tabela)', 'Kenney — CC0', 'https://kenney.nl'],
  ] },
  { h: 'Dokular ve Gökyüzü', items: [
    ['2K Handpainted Style Textures (çimen, toprak, kaya)', 'rubberduck — CC0', 'https://opengameart.org/content/2k-handpainted-style-textures'],
    ['Kloofendal 48d Partly Cloudy (Pure Sky) HDRI', 'Poly Haven — CC0', 'https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky'],
    ['Kloppenheim 06 (Pure Sky) HDRI — gün batımı', 'Poly Haven — CC0', 'https://polyhaven.com/a/kloppenheim_06_puresky'],
    ['Particle Pack (toz, parıltı), Racing Pack (lastik izi)', 'Kenney — CC0', 'https://kenney.nl'],
    ['Rye, Barlow Condensed yazı tipleri', 'Google Fonts — SIL OFL', 'https://fonts.google.com'],
  ] },
  { h: 'Müzik', items: [
    ['“Hillbilly Swing”, “Still Pickin”, “River Valley Breakdown”, “Fireflies and Stardust”, “Bama Country”, “Guts and Bourbon”', 'Kevin MacLeod (incompetech.com) — Creative Commons: By Attribution 4.0', 'https://incompetech.com'],
    ['“Gone Fishin’”', 'memoraphile — CC0', 'https://opengameart.org/content/gone-fishin'],
    ['“Down the River”', 'Komiku — CC0', 'https://opengameart.org/content/down-the-river'],
  ] },
  { h: 'Ses Efektleri', items: [
    ['Car Engine Loop 96kHz, Car tire squeal skid loop', 'qubodup — CC BY 3.0', 'https://opengameart.org/users/qubodup'],
    ['Racing car engine sound loops', 'domasx2 — CC0', 'https://opengameart.org/content/racing-car-engine-sound-loops'],
    ['Crash Collision, Impact sesleri', 'qubodup — CC0', 'https://opengameart.org/content/crash-collision'],
    ['Car Engine Start 01', 'looneybits — CC0', 'https://opengameart.org/content/car-engine-start-01'],
    ['Freesound CC0: motor rölanti (RichieMcMullen), dizel döngü (qubodup), çakıl yolu (mpuffenbarger), patinaj (alexftw123), kuşlar (hargissssound), kır ambiyansı (brunoboselli), buğday tarlası (florianreichelt), rüzgâr (dhallcomposer), inek (felix.blume, Zozzy), tavuk (Breviceps), horoz (BenjaminNelan), korna (keweldog), vites (E-Audio), süspansiyon (nmscher), yere çarpma (leonelmail), metal çarpma (craigsmith), kapı (looneybits)', 'freesound.org — CC0', 'https://freesound.org'],
    ['Interface Sounds, Impact Sounds', 'Kenney — CC0', 'https://kenney.nl'],
  ] },
  { h: 'Teknoloji', items: [
    ['three.js, Rapier (fizik), postprocessing, N8AO', 'MIT / Apache-2.0 / Zlib', 'https://threejs.org'],
  ] },
];

export function creditsHTML() {
  return CREDITS.map((s) => `<h4>${s.h}</h4>` + s.items.map(([what, who, url]) => `<p><b>${what}</b><br>${who} · <a href="${url}" target="_blank" rel="noopener">${url.replace('https://', '')}</a></p>`).join('')).join('');
}
