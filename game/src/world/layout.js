// Hand-designed world layout on top of the real Palouse / Steptoe Butte heightmap.
// Coordinates are metres; x = east, z = south. The butte summit is at (-805, -831).

export const SUMMIT = { x: -805, z: -831 };

// Base uniform scale per model (models are authored in different unit systems)
export const MODEL_SCALE = {
  pickup: 1.0, tractor: 1.55,
  barn: 1.15, barn_big: 1.2, barn_small: 1.1, barn_open: 1.1, silo: 1.25, silo_house: 1.25, windmill: 1.15, water_tower: 1.35,
  chicken_coop: 1.1, well: 1.2, fence: 1.0, fence2: 1.0, mill_tower: 1.0, farm_barn: 1.35, cistern: 1.2,
  mailbox: 1.4, hay_round: 0.75, hay_cube: 1.0, cart: 0.6, barrel: 1.1, pond: 3.2, haybale: 0.55, fence_rail: 1.0, crate_pumpkin: 0.5, pumpkin: 0.3,
  farmhouse_a: 7.5, farmhouse_c: 7.5, farmhouse_e: 7.5, farmhouse_g: 7.5, farmhouse_h: 7.5, farmhouse_k: 7.5, farmhouse_o: 7.5, farmhouse_r: 7.5,
  flag: 4.5, sign: 3.2, arrow: 3.2, billboard: 2.4,
  cow: 0.33, bull: 0.34, horse: 0.36, horse_white: 0.36, donkey: 0.3, alpaca: 0.32, deer: 0.33, chicken: 1.0,
};

export const ROADS = [
  { name: 'Palouse Yolu', width: 7, points: [[120, 1660], [160, 1300], [230, 1000], [330, 700], [420, 430], [440, 250], [380, 0], [300, -300], [420, -650], [650, -950], [880, -1250], [1000, -1660]] },
  { name: 'Doğu Yolu', width: 6, points: [[440, 250], [700, 200], [950, -50], [1120, -290], [1350, -500], [1660, -620]] },
  { name: 'Batı Yolu', width: 6, points: [[-1660, 620], [-1300, 560], [-900, 450], [-460, 330], [0, 300], [440, 250]] },
  { name: 'Güney Yolu', width: 6, points: [[230, 1000], [0, 1150], [-120, 1260], [-400, 1350], [-800, 1300], [-1200, 1450], [-1660, 1500]] },
  { name: 'Tepe Yolu', width: 6, points: [[330, 700], [700, 760], [1000, 720], [1250, 720], [1660, 780]] },
  { name: 'Değirmen Yolu', width: 5, points: [[1120, -290], [980, -470], [780, -620], [650, -950]] },
  { name: 'Butte Yolu', width: 6, points: [[300, -300], [50, -270], [-200, -300], [-330, -362]] },
  // contour-following spiral up the butte (resolved against the heightmap at load time)
  { name: 'Zirve Yolu', width: 6, spiral: { cx: SUMMIT.x, cz: SUMMIT.z, startX: -330, startZ: -362, turns: 1.72, endHeight: 352, dir: -1 } },
];

// Flattened building pads and farmyard dirt
export const FARMS = [
  { id: 'miller', name: 'Miller Çiftliği', x: 497, z: 335, r: 58, rot: 0 },
  { id: 'redbarn', name: 'Kırmızı Ahır', x: 1178, z: -262, r: 46, rot: 35 },
  { id: 'watertower', name: 'Su Kulesi Çiftliği', x: -120, z: 1300, r: 50, rot: -15 },
  { id: 'hillhouse', name: 'Tepe Evi', x: 1250, z: 680, r: 42, rot: 10 },
  { id: 'buttefoot', name: 'Butte Eteği', x: -460, z: 380, r: 38, rot: 80 },
  { id: 'grain', name: 'Doğu Tahıl Çiftliği', x: 1450, z: -440, r: 55, rot: -20 },
  { id: 'dairy', name: 'Kuzey Mandırası', x: 680, z: -1125, r: 50, rot: 40 },
  { id: 'poplar', name: 'Kavak Çiftliği', x: -830, z: 1215, r: 48, rot: 5 },
];

// Buildings per farm in farm-local coordinates [model, x, z, rotDeg, scaleMul]
export const FARM_BUILDINGS = {
  miller: [
    ['barn_big', 0, -22, 180], ['silo', 13, -28, 0], ['silo_house', -14, -30, 180], ['farmhouse_e', -30, 8, 90],
    ['windmill', 26, 12, -30], ['water_tower', 32, -12, 0], ['chicken_coop', -16, 26, 200], ['well', -12, 8, 0],
    ['tractor', 8, 6, 120], ['cart', 18, -6, 70], ['barrel', 10, -12, 0], ['barrel', 11.2, -11, 0], ['crate_pumpkin', -20, -6, 15],
    ['haybale', 20, 28, 0], ['haybale', 22.4, 28, 0], ['haybale', 21.2, 28, 0, 1, 1.1], ['hay_round', 28, 30, 40], ['mailbox', -8, 46, 180],
  ],
  redbarn: [
    ['barn', 0, -14, 180], ['barn_open', 18, -8, 270], ['farmhouse_h', -24, 6, 90], ['windmill', 16, 18, 10],
    ['hay_round', 26, -20, 0], ['hay_round', 30, -14, 80], ['hay_cube', 10, 8, 0], ['barrel', -8, -4, 0], ['mailbox', -6, 30, 180],
  ],
  watertower: [
    ['farm_barn', 0, -18, 180], ['water_tower', 20, -16, 0], ['cistern', 12, 6, 0], ['farmhouse_a', -26, 4, 90], ['silo', 8, 28, 0],
    ['haybale', 20, 10, 30], ['haybale', 21, 12, 30], ['cart', -10, 14, 200], ['well', 4, 14, 0], ['mailbox', -10, 34, 0],
  ],
  hillhouse: [
    ['farmhouse_r', 0, 0, 180], ['barn_small', 18, -10, 200], ['chicken_coop', -14, -10, 160], ['hay_round', 22, 10, 0], ['mailbox', 4, 22, 180],
  ],
  buttefoot: [
    ['farmhouse_g', 0, 0, 0], ['barn_open', 16, 8, 90], ['tractor', 12, -10, 40], ['haybale', -14, 10, 0], ['haybale', -14, 12.2, 0], ['mailbox', -4, -20, 0],
  ],
  grain: [
    ['silo', -14, -24, 0], ['silo', -4, -26, 0], ['silo', 6, -24, 0], ['silo_house', 18, -22, 180], ['barn_big', -26, 2, 90],
    ['farmhouse_h', 22, 14, 270], ['windmill', 34, -6, 15], ['tractor', 4, 6, 200], ['cart', 10, 10, 60], ['hay_round', -8, 24, 0], ['hay_round', -2, 28, 70],
    ['barrel', 14, -10, 0], ['mailbox', 8, 40, 180],
  ],
  dairy: [
    ['barn', 0, -16, 180], ['water_tower', -20, -18, 0], ['farmhouse_e', 24, 0, 270], ['silo', 14, -26, 0], ['chicken_coop', -22, 10, 120],
    ['well', 10, 8, 0], ['cistern', -10, 4, 0], ['haybale', 16, 18, 10], ['haybale', 17, 20.2, 10], ['mailbox', 4, 36, 180],
  ],
  poplar: [
    ['farm_barn', -4, -18, 180], ['farmhouse_a', 22, -4, 270], ['windmill', -24, -2, 30], ['barn_open', -22, 18, 90], ['chicken_coop', 10, 14, 200],
    ['crate_pumpkin', 4, 4, 15], ['crate_pumpkin', 5.5, 5, 40], ['pumpkin', 2, 7, 0], ['mailbox', 0, 34, 0],
  ],
};

// Job boards (farm-local x, z, rotDeg): pick up and drop off cargo here
export const BOARDS = { miller: [-40, 24, 90], redbarn: [-8, 18, 0], watertower: [-14, 24, 0], hillhouse: [-10, 18, 180], buttefoot: [6, -20, 0],
  grain: [-12, 34, 180], dairy: [-6, 30, 180], poplar: [-10, 30, 0] };

// Paddocks: fenced areas with animals [farmId, localX, localZ, w, d, animals]
export const PADDOCKS = [
  { farm: 'miller', x: 0, z: 62, w: 70, d: 44, fence: 'fence', animals: [['cow', 5], ['bull', 1]] },
  { farm: 'miller', x: -18, z: 26, w: 14, d: 12, fence: 'fence2', animals: [['chicken', 7]] },
  { farm: 'redbarn', x: 0, z: 46, w: 56, d: 36, fence: 'fence', animals: [['horse', 3], ['horse_white', 2]] },
  { farm: 'watertower', x: 40, z: 22, w: 46, d: 34, fence: 'fence', animals: [['donkey', 3], ['alpaca', 2]] },
  { farm: 'dairy', x: -58, z: 8, w: 40, d: 56, fence: 'fence', animals: [['cow', 6], ['bull', 1]] },
  { farm: 'poplar', x: 40, z: 30, w: 44, d: 32, fence: 'fence', animals: [['horse', 2], ['alpaca', 3]] },
  { farm: 'grain', x: -46, z: 30, w: 30, d: 24, fence: 'fence2', animals: [['donkey', 2]] },
  { farm: 'hillhouse', x: -30, z: -30, w: 34, d: 26, fence: 'fence2', animals: [['cow', 3]] },
];

// Discovery points
export const POIS = [
  { id: 'summit', name: 'Steptoe Zirvesi', desc: 'Palouse’un tepesi: 1102 metre. Buğday denizi ayaklarının altında.', x: -805, z: -831, r: 45, icon: '▲' },
  { id: 'miller', name: 'Miller Çiftliği', desc: 'Evine hoş geldin. İnekler seni bekliyor.', x: 497, z: 335, r: 60, icon: '⌂' },
  { id: 'redbarn', name: 'Kırmızı Ahır', desc: 'Atların koşturduğu eski ahır.', x: 1178, z: -262, r: 55, icon: '⌂' },
  { id: 'watertower', name: 'Su Kulesi Çiftliği', desc: 'Güney tarlalarının kalbi.', x: -120, z: 1300, r: 55, icon: '⌂' },
  { id: 'hillhouse', name: 'Tepe Evi', desc: 'Rüzgârlı sırtta yalnız bir ev.', x: 1250, z: 680, r: 50, icon: '⌂' },
  { id: 'buttefoot', name: 'Butte Eteği', desc: 'Dağın gölgesinde küçük bir çiftlik.', x: -460, z: 380, r: 45, icon: '⌂' },
  { id: 'grain', name: 'Doğu Tahıl Çiftliği', desc: 'Siloları buğdayla dolu, en büyük çiftlik.', x: 1450, z: -440, r: 55, icon: '⌂' },
  { id: 'dairy', name: 'Kuzey Mandırası', desc: 'Sütün ve peynirin geldiği yer.', x: 680, z: -1125, r: 50, icon: '⌂' },
  { id: 'poplar', name: 'Kavak Çiftliği', desc: 'Balkabağı tarlalarıyla ünlü.', x: -830, z: 1215, r: 50, icon: '⌂' },
  { id: 'windmill', name: 'Yalnız Değirmen', desc: 'Tepedeki değirmen hâlâ dönüyor.', x: 760, z: -610, r: 40, icon: '✣' },
  { id: 'pond', name: 'Söğüt Göleti', desc: 'Serin su, kurbağalar ve gölge.', x: -700, z: 930, r: 40, icon: '◍' },
  { id: 'tractor', name: 'Unutulmuş Traktör', desc: 'Biri onu yıllar önce burada bırakmış.', x: -1290, z: 1080, r: 35, icon: '⚙' },
  { id: 'northvalley', name: 'Kuzey Vadisi', desc: 'Rüzgâr vadiden aşağı akıyor.', x: 260, z: -1380, r: 60, icon: '≈' },
  { id: 'haystack', name: 'Saman Tepesi', desc: 'Hasat bitti, balyalar dizildi.', x: 1330, z: 1330, r: 45, icon: '▦' },
  { id: 'rocks', name: 'Kayalık Yamaç', desc: 'Butte’un batı yamacında dev kayalar.', x: -1280, z: -380, r: 50, icon: '◆' },
  { id: 'grove', name: 'Batı Korusu', desc: 'Çam ve huşlar arasında bir patika.', x: -1330, z: 760, r: 60, icon: '♣' },
];

// Extra props placed at POIs [poiId, model, dx, dz, rotDeg, scaleMul]
export const POI_PROPS = [
  ['windmill', 'windmill', 0, 0, 20, 1.15], ['windmill', 'barrel', 4, 3, 0, 1],
  ['pond', 'pond', 0, 0, 30, 1], ['pond', 'cart', 9, 7, 120, 1],
  ['tractor', 'tractor', 0, 0, 65, 1], ['tractor', 'barrel', 4, -3, 0, 1], ['tractor', 'hay_round', -6, 5, 0, 0.8],
  ['haystack', 'haybale', 0, 0, 0, 1], ['haystack', 'haybale', 1.2, 0, 0, 1], ['haystack', 'haybale', 0.6, 0, 0, 1, 1.1],
  ['haystack', 'haybale', 6, 4, 90, 1], ['haystack', 'haybale', 6, 5.2, 90, 1], ['haystack', 'hay_round', -6, 6, 0, 1], ['haystack', 'hay_round', -9, -2, 50, 1],
  ['summit', 'sign', 6, 4, 210, 1], ['northvalley', 'billboard', 0, 0, 160, 1],
];

export const CHALLENGES = [
  {
    id: 'hillclimb', name: 'Zirve Tırmanışı', desc: 'Spiral yoldan Steptoe Zirvesi’ne en hızlı sen çık!',
    start: { x: -318, z: -350, heading: 225 },
    checkpoints: 'spiral', finish: { x: -805, z: -831 },
  },
  {
    id: 'rally', name: 'Çiftlik Rallisi', desc: 'Çiftlikler arası toprak yol rallisi. Tüm kapılardan geç!',
    start: { x: 470, z: 255, heading: 80 },
    route: [[700, 200], [950, -50], [1120, -290], [980, -470], [780, -620], [650, -950], [420, -650], [300, -300], [380, 0], [440, 240]],
  },
  {
    id: 'valley', name: 'Vadi Turu', desc: 'Güney tarlalarından Tepe Evi’ne uzanan hızlı bir parkur.',
    start: { x: -80, z: 1222, heading: 132 },
    route: [[0, 1150], [230, 1000], [300, 820], [330, 700], [520, 740], [700, 760], [1000, 720], [1250, 720]],
  },
  {
    id: 'descent', name: 'Zirve İnişi', desc: 'Zirveden spiral yoldan aşağı! Frenlerine güven.',
    start: { x: -790, z: -812, heading: 120 },
    checkpoints: 'spiralDown', finish: { x: -330, z: -362 },
  },
];

// Dirt kickers sculpted into the road (x, z, approach direction dx, dz)
export const JUMPS = [[205, 1080, 0.2, -1], [560, 752, 1, 0.1], [-700, 392, 1, -0.25], [830, 70, 1, -1]];

// Small flattened pads under POI props
export const POI_FLATTEN = [['pond', 14], ['haystack', 14], ['tractor', 10], ['windmill', 8], ['summit', 12]];

// Wild animals
export const HERDS = [
  { model: 'deer', x: -1300, z: 720, n: 4 },
  { model: 'deer', x: 150, z: -1250, n: 3 },
  { model: 'deer', x: -400, z: -150, n: 3 },
];
