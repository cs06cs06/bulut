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
  pole: 1, wires: 1, turbine: 35, water_tower2: 10, grain_bin: 9, warehouse: 1, jeep: 1, streetlight: 1,
  gas_canopy: 0.85, gas_shop: 0.8, gas_sign: 0.8, store: 1.6, house_s_a: 6.5, house_s_c: 6.5,
  shop_a: 5.5, shop_b: 5.5, shop_c: 5.5, shop_d: 5.5, shop_e: 5.5, shop_f: 5.5, shop_g: 5.5, shop_h: 5.5,
  bench: 5, hydrant: 5, trash: 5, picnic: 1.5, pallet: 1, fuel_barrels: 1, logs: 1, cone: 1, sign_stop: 5, sign_warning: 5, tractor_k: 1.9, bird: 1,
  diesel_a: 2.6, locomotive_a: 2.6, wagon_coal: 2.6, wagon_lumber: 2.6, wagon_tank: 2.6, wagon_box: 2.6, wagon_wood: 2.6, wagon_flatbed_wood: 2.6, track_single: 2.6, track: 2.6,
  char_m_a: 2.9, char_m_b: 2.9, char_m_c: 2.9, char_m_d: 2.9, char_m_e: 2.9, char_m_f: 2.9, char_f_a: 2.9, char_f_b: 2.9, char_f_c: 2.9, char_f_d: 2.9, char_f_e: 2.9, char_f_f: 2.9,
  tent: 4.5, tent2: 5.5, campfire: 3, log_seat: 3, canoe: 3.5, bedroll: 3, fish_stand: 3, bucket: 3, stall: 4.5, stall_green: 4.5, stall_red: 4.5, stall_bench: 4, stall_stool: 4, banner_red: 3.5, banner_green: 3.5, lantern: 1.7,
  k_sedan: 1.65, k_hatchback: 1.65, k_police: 1.65, k_delivery: 1.65, k_taxi: 1.65, chapel: 10, diner: 9, market: 7, wheelbarrow: 3, sack: 3, crate: 3,
  cow: 0.33, bull: 0.34, horse: 0.36, horse_white: 0.36, donkey: 0.3, alpaca: 0.32, deer: 0.33, chicken: 1.0,
};

export const ROADS = [
  // freight railway: carved like a road but with a much smoother grade; not drivable traffic road
  { name: 'Demiryolu', width: 5, rail: true, smooth: 32, points: [[800, -1660], [1000, 0], [1200, 1660]] },
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

// Steptoe town along the Palouse road. Entries: [model, t (m south of the anchor along the road), side (+1 right
// when heading south, -1 left), setback from the road edge to the building front, scaleMul, collider]
export const TOWN = {
  name: 'Steptoe Kasabası', road: 'Palouse Yolu', anchor: [422, 452], center: [392, 545], radius: 120,
  buildings: [
    ['shop_a', 48, -1, 4], ['shop_c', 63, -1, 4], ['shop_e', 79, -1, 4], ['store', 97, -1, 4], ['shop_g', 113, -1, 4], ['house_s_a', 134, -1, 6], ['house_s_c', 156, -1, 6],
    ['shop_b', 52, 1, 4], ['shop_d', 67, 1, 4], ['shop_f', 83, 1, 4], ['shop_h', 101, 1, 4], ['house_s_c', 124, 1, 6], ['house_s_a', 146, 1, 6],
    ['warehouse', 205, -1, 12], ['water_tower2', 190, 1, 14],
    ['diner', 30, -1, 7], ['chapel', 174, -1, 9], ['market', 170, 1, 5],
  ],
  props: [
    ['bench', 56, -1, 1.2, 0], ['bench', 90, 1, 1.2, 0], ['hydrant', 70, -1, 0.8, 0], ['hydrant', 95, 1, 0.8, 0], ['trash', 60, 1, 0.9, 0], ['trash', 104, -1, 0.9, 0],
    ['grain_bin', 230, -1, 10, 0], ['grain_bin', 246, -1, 10, 0], ['grain_bin', 238, -1, 26, 0],
    ['wheelbarrow', 162, 1, 4, 30], ['sack', 178, 1, 3.5, 0], ['sack', 179, 1, 4.5, 50], ['crate', 177, 1, 6, 15], ['bench', 168, -1, 4, 0],
    ['fuel_barrels', 196, -1, 4, 0], ['pallet', 214, -1, 3, 0], ['pallet', 217, -1, 3.5, 0], ['logs', 222, -1, 5, 0],
  ],
  postOffice: ['shop_d', 67, 1],
  gas: { t: 8, side: 1, setback: 10 },
};

// Road races against AI rivals: a stretch of one road (fractions of its length; from > to drives it backwards)
export const RACES = [
  { id: 'north', name: 'Kuzey Sprinti', road: 'Palouse Yolu', from: 0.40, to: 0.97, desc: 'Miller Çiftliği’nden kuzey ucuna, tepeler arasında dümdüz bir sprint.' },
  { id: 'west', name: 'Batı Kupası', road: 'Batı Yolu', from: 0.03, to: 0.93, desc: 'Batı ucundan kavşağa: uzun düzlükler, sert virajlar.' },
  { id: 'south', name: 'Güney Derbisi', road: 'Güney Yolu', from: 0.03, to: 0.96, desc: 'Su Kulesi tarlaları boyunca toz bulutu içinde bir derbi.' },
];

// Barn finds: rusted vehicles hidden in old barns; a rumour marks a search circle on the map
export const BARNS = [
  { id: 'grandpa', vehicle: 'semi', name: 'Dedenin Kamyonu', x: 313, z: 44, rot: 35, search: { dx: 70, dz: -50, r: 150 }, rumour: 'Walt Miller’ın eski kamyonu çiftliğin kuzeyindeki bir ahırda saklıymış.', story: true },
  { id: 'van', vehicle: 'van', name: 'Unutulmuş Minibüs', x: -1194, z: 469, rot: 120, search: { dx: -60, dz: 80, r: 170 }, rumour: 'Batı tepelerinde terk edilmiş bir ahırda eski bir minibüs çürüyormuş.' },
];

// Lookout towers (old fire-watch water towers): visiting one reveals the map around it
export const TOWERS = [
  { id: 'east', name: 'Doğu Gözetleme Kulesi', x: 1495, z: 783 },
  { id: 'north', name: 'Kuzey Gözetleme Kulesi', x: 871, z: -1426 },
  { id: 'west', name: 'Batı Gözetleme Kulesi', x: -1064, z: 448 },
  { id: 'summit', name: 'Zirve Gözetleme Kulesi', x: -778, z: -812 },
];

// Photo challenges: subject point in frame within `dist`, plus an optional condition
export const PHOTO_BOUNTIES = [
  { id: 'chapel', name: 'Kır Şapeli', desc: 'Kasabanın kırmızı çatılı şapelini çek.', x: 376, z: 623, y: 8, dist: 70, reward: 250 },
  { id: 'redbarn', name: 'Kırmızı Ahır', desc: 'Kırmızı Ahır’ı aracınla birlikte çek.', x: 1178, z: -262, y: 6, dist: 90, withCar: true, reward: 250 },
  { id: 'turbine', name: 'Dev Pervaneler', desc: 'Bir rüzgâr türbinini yakından çek.', turbine: true, dist: 160, reward: 300 },
  { id: 'summitSunset', name: 'Zirvede Akşam', desc: 'Steptoe Zirvesi’nde gün batımında ya da gece bir fotoğraf çek.', x: -805, z: -831, near: 140, dusk: true, reward: 400 },
  { id: 'townNight', name: 'Kasaba Işıkları', desc: 'Steptoe Kasabası’nı gece çek.', x: 392, z: 545, y: 6, dist: 180, night: true, reward: 350 },
  { id: 'airborne', name: 'Uçan Kamyon', desc: 'Aracın havadayken fotoğrafını çek.', airborne: true, reward: 400 },
  { id: 'train', name: 'Yük Treni', desc: 'Yük trenini yakından çek.', train: true, dist: 90, reward: 350 },
  { id: 'pond', name: 'Göl Kıyısı', desc: 'Söğüt Göleti’nde aracınla poz ver.', x: 0, z: 0, poi: 'pond', near: 40, withCar: true, reward: 200 },
];

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
  { id: 'town', name: 'Steptoe Kasabası', desc: 'Dükkânlar, posta ofisi ve tahıl deposu. Palouse’un kalbi.', x: 392, z: 545, r: 70, icon: '⌂' },
  { id: 'gas', name: 'Benzinlik', desc: 'Nitro deposunu doldur, aracını yıkat.', x: 403, z: 455, r: 30, icon: '⛽' },
  { id: 'camp', name: 'Göl Kampı', desc: 'Söğüt Göleti’nin kıyısında çadırlar ve çıtırdayan bir kamp ateşi.', x: -652, z: 902, r: 30, icon: '▲' },
  { id: 'fair', name: 'Kasaba Panayırı', desc: 'Tezgâhlar, fenerler, balkabakları: Steptoe’nun cumartesi panayırı.', x: 318, z: 566, r: 32, icon: '✦' },
  { id: 'picnic', name: 'Vadi Pikniği', desc: 'Kuzey Vadisi’nde piknik yapan bir aile.', x: 285, z: -1362, r: 25, icon: '♣' },
  { id: 'chapel', name: 'Kır Şapeli', desc: 'Kasabanın güney ucunda, kırmızı çatılı küçük şapel. Pazar tezgâhı hemen karşısında.', x: 376, z: 623, r: 28, icon: '✝' },
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
