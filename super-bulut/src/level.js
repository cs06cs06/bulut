// Harita çözümleme ve blok sorguları. Koordinatlar: tx sağa, ty yukarı doğru artar;
// (tx, ty) bloğu x∈[tx, tx+1], y∈[ty, ty+1] aralığını kaplar.

export const ROWS = 15;

export const T = {
  EMPTY: 0,
  GROUND: 1,
  BRICK: 2,
  MYSTERY: 3,
  USED: 4,
  STONE: 5,
  PLATFORM: 6,
  WALL: 7, // haritanın sol/sağ kenarındaki görünmez duvar
};

const SOLID = [false, true, true, true, true, true, false, true];

const TILE_CHARS = {
  '#': T.GROUND,
  B: T.BRICK,
  C: T.BRICK,
  '?': T.MYSTERY,
  M: T.MYSTERY,
  N: T.MYSTERY,
  S: T.STONE,
  '=': T.PLATFORM,
};

const CONTENT_CHARS = {
  '?': { type: 'coin', count: 1 },
  M: { type: 'simit', count: 1 },
  N: { type: 'nazar', count: 1 },
  C: { type: 'coin', count: 6 },
};

const ENEMY_CHARS = { k: 'kestane', h: 'kirpi', a: 'ari' };
const DECOR_CHARS = { T: 'tree', b: 'bush' };

export class Level {
  constructor(def) {
    this.def = def;
    const rows = Array.from({ length: ROWS }, () => '');
    for (const chunk of def.chunks) {
      if (chunk.length !== ROWS) throw new Error(`${def.id}: her parça ${ROWS} satır olmalı (${chunk.length} bulundu)`);
      const w = Math.max(...chunk.map((r) => r.length));
      for (let r = 0; r < ROWS; r++) rows[r] += chunk[r].padEnd(w, '.');
    }
    this.width = rows[0].length;
    this.height = ROWS;
    this.tiles = new Uint8Array(this.width * this.height);
    this.contents = new Map();
    this.enemies = [];
    this.coins = [];
    this.decor = [];
    this.start = { x: 2.5, y: 2 };
    this.flag = null;
    this.tower = null;

    for (let r = 0; r < ROWS; r++) {
      const ty = ROWS - 1 - r;
      for (let tx = 0; tx < this.width; tx++) {
        const ch = rows[r][tx];
        if (ch in TILE_CHARS) {
          this.tiles[this.idx(tx, ty)] = TILE_CHARS[ch];
          if (ch in CONTENT_CHARS) this.contents.set(this.idx(tx, ty), { ...CONTENT_CHARS[ch] });
        } else if (ch in ENEMY_CHARS) {
          this.enemies.push({ type: ENEMY_CHARS[ch], x: tx + 0.5, y: ty });
        } else if (ch in DECOR_CHARS) {
          this.decor.push({ type: DECOR_CHARS[ch], x: tx + 0.5, y: ty });
        } else if (ch === 'o') {
          this.coins.push({ x: tx + 0.5, y: ty + 0.5 });
        } else if (ch === 'P') {
          this.start = { x: tx + 0.5, y: ty };
        } else if (ch === 'F') {
          this.flag = { x: tx + 0.5, y: ty, height: 8 };
        } else if (ch === 'K') {
          this.tower = { x: tx + 0.5, y: ty };
        }
      }
    }
    this.checkpointX = this.#findCheckpoint();
  }

  idx(tx, ty) {
    return ty * this.width + tx;
  }

  get(tx, ty) {
    if (tx < 0 || tx >= this.width) return T.WALL;
    if (ty < 0 || ty >= this.height) return T.EMPTY;
    return this.tiles[ty * this.width + tx];
  }

  set(tx, ty, t) {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return;
    this.tiles[ty * this.width + tx] = t;
  }

  isSolid(tx, ty) {
    return SOLID[this.get(tx, ty)];
  }

  // Oyuncunun yeniden doğabileceği güvenli bir sütun (bölümün ortasına en yakın düz zemin).
  #findCheckpoint() {
    const mid = Math.floor(this.width / 2);
    for (let d = 0; d < this.width / 2; d++) {
      for (const tx of [mid + d, mid - d]) {
        if (tx < 4 || tx >= this.width - 4) continue;
        if (this.get(tx, 1) === T.GROUND && !this.isSolid(tx, 2) && !this.isSolid(tx, 3) && !this.isSolid(tx, 4)) {
          const nearEnemy = this.enemies.some((e) => Math.abs(e.x - tx) < 4);
          if (!nearEnemy) return tx + 0.5;
        }
      }
    }
    return null;
  }
}

export function isSolidType(t) {
  return SOLID[t];
}
