// Oynanış sabitleri. Birim: 1 = bir blok, süre saniye.

export const STEP = 1 / 120; // sabit fizik adımı

export const PHYSICS = {
  gravity: 85, // düşerken / zıplama tuşu bırakılınca
  gravityHold: 34, // yükselirken zıplama tuşu basılıysa (değişken zıplama yüksekliği)
  maxFall: 24,
  walkMax: 6,
  runMax: 10,
  accelWalk: 28,
  accelRun: 34,
  accelAir: 22,
  friction: 22,
  skid: 50,
  jumpSpeed: 17,
  jumpRunBonus: 1.5, // tam hızda koşarken zıplamaya eklenen hız
  stompBounce: 11,
  stompBounceHold: 16,
  coyoteTime: 0.09, // kenardan düştükten sonra hâlâ zıplanabilen süre
  jumpBuffer: 0.12, // yere değmeden az önce basılan zıplamayı hatırlama süresi
};

export const PLAYER_SIZE = {
  small: { w: 0.62, h: 0.9 },
  big: { w: 0.72, h: 1.7 },
};
export const BIG_SCALE = 1.8; // büyük haldeyken modelin ölçeği

export const START_LIVES = 3;
export const TIME_UNIT = 0.5; // sayaçtaki 1 birim kaç saniye
export const HURRY_AT = 100;
export const INVULN_TIME = 2;
export const NAZAR_TIME = 9;

export const SCORE = {
  coin: 200,
  brick: 50,
  powerup: 1000,
  bumpKill: 200,
  nazarKill: 200,
  timeUnit: 50,
  stompChain: [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000],
};

// Ekranda en az bu kadar blok görünsün (kamera uzaklığı buna göre ayarlanır).
export const VIEW = { minTilesHigh: 13.5, minTilesWide: 17, fov: 35 };

export const ENEMY = {
  kestane: { w: 0.8, h: 0.8, speed: 2, stompable: true, turnAtEdges: false },
  kirpi: { w: 0.85, h: 0.7, speed: 1.5, stompable: false, turnAtEdges: true },
  ari: { w: 0.7, h: 0.65, speed: 1.4, stompable: true, flying: true },
};
