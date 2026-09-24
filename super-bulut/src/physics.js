// Blok ızgarasına karşı eksen hizalı kutu (AABB) çarpışması.
// Gövde: x = merkez, y = ayak hizası, w/h = genişlik/yükseklik, vx/vy = hız.
import { T, isSolidType } from './level.js';

const EPS = 1e-4;
const CORNER = 0.28; // kafa bir bloğun köşesine bu kadar az değerse yana kaydır

export function moveBody(body, level, dt, opts = {}) {
  const res = { hitX: 0, ceiling: null, onGround: false };
  const hw = body.w / 2;

  // --- X ekseni
  if (body.vx !== 0) {
    body.x += body.vx * dt;
    const y0 = Math.floor(body.y + EPS);
    const y1 = Math.floor(body.y + body.h - EPS);
    if (body.vx > 0) {
      const tx = Math.floor(body.x + hw - EPS);
      for (let ty = y0; ty <= y1; ty++) {
        if (level.isSolid(tx, ty)) {
          body.x = tx - hw;
          res.hitX = 1;
          break;
        }
      }
    } else {
      const tx = Math.floor(body.x - hw + EPS);
      for (let ty = y0; ty <= y1; ty++) {
        if (level.isSolid(tx, ty)) {
          body.x = tx + 1 + hw;
          res.hitX = -1;
          break;
        }
      }
    }
    if (res.hitX) body.vx = 0;
  }

  // --- Y ekseni
  const prevY = body.y;
  body.y += body.vy * dt;
  let x0 = Math.floor(body.x - hw + EPS);
  let x1 = Math.floor(body.x + hw - EPS);

  if (body.vy <= 0) {
    const ty = Math.floor(body.y - EPS);
    for (let tx = x0; tx <= x1; tx++) {
      const t = level.get(tx, ty);
      const platform = t === T.PLATFORM && prevY >= ty + 1 - 0.02 && !body.dropThrough;
      if (isSolidType(t) || platform) {
        body.y = ty + 1;
        body.vy = 0;
        res.onGround = true;
        break;
      }
    }
  } else {
    const ty = Math.floor(body.y + body.h - EPS);
    let hits = [];
    for (let tx = x0; tx <= x1; tx++) if (level.isSolid(tx, ty)) hits.push(tx);

    // Köşe düzeltmesi: bloğun kenarına sürtünen kafayı yana it, zıplamayı kesme.
    if (opts.corner && hits.length === 1) {
      const tx = hits[0];
      const overlapLeft = body.x + hw - tx; // blok sağda
      const overlapRight = tx + 1 - (body.x - hw); // blok solda
      if (tx === x1 && overlapLeft < CORNER && !level.isSolid(tx - 1, ty)) {
        body.x = tx - hw - EPS;
        hits = [];
      } else if (tx === x0 && overlapRight < CORNER && !level.isSolid(tx + 1, ty)) {
        body.x = tx + 1 + hw + EPS;
        hits = [];
      }
    }

    if (hits.length) {
      body.y = ty - body.h;
      body.vy = 0;
      // Oyuncu merkezine en yakın blok vurulur.
      let best = hits[0];
      for (const tx of hits) if (Math.abs(tx + 0.5 - body.x) < Math.abs(best + 0.5 - body.x)) best = tx;
      res.ceiling = { tx: best, ty };
    }
  }
  return res;
}

// Gövdenin önündeki zeminde boşluk var mı? (kenarda dönen düşmanlar için)
export function edgeAhead(body, level, dir) {
  const tx = Math.floor(body.x + dir * (body.w / 2 + 0.05));
  const ty = Math.floor(body.y - 0.1);
  const t = level.get(tx, ty);
  return !(isSolidType(t) || t === T.PLATFORM);
}

export function overlap(a, b, shrink = 0) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - shrink && a.y < b.y + b.h - shrink && b.y < a.y + a.h - shrink;
}
