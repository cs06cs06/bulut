import { POIS, CHALLENGES } from '../world/layout.js';
import { fmt } from '../game/gameplay.js';

// DOM HUD: speedometer, minimap, world map, toasts, challenge timer, now-playing card.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = { hud: $('hud'), speed: $('speed'), gear: $('gear'), unit: $('speed-unit'), toast: $('toast'), hint: $('hint'), prompt: $('prompt'),
      disc: $('hud-disc'), coll: $('hud-coll'), chall: $('hud-challenge'), np: $('now-playing'), npT: $('np-title'), npA: $('np-artist'),
      money: $('hud-money'), obj: $('objective'), popups: $('popups') };
    this.boards = []; this.extraTarget = null;
    this.speedo = $('speedo-canvas').getContext('2d');
    this.mm = $('minimap').getContext('2d');
    this.big = $('bigmap');
    this.units = 'kmh';
    this.toastQueue = []; this.toastTimer = 0;
    this._lastSpeedo = '';
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  // Pre-render a stylised map texture from the terrain splat + hillshade
  buildMap(terrain) {
    const R = 768, c = document.createElement('canvas'); c.width = c.height = R;
    const ctx = c.getContext('2d', { willReadFrequently: true }), img = ctx.createImageData(R, R);
    const { a, b, R: SR } = terrain.splatData, H = terrain.H, G = terrain.G, sp = terrain.sp;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const si = Math.min(SR - 1, Math.floor((i + 0.5) / R * SR)), sj = Math.min(SR - 1, Math.floor((j + 0.5) / R * SR));
      const o = (sj * SR + si) * 4;
      const gi = Math.min(G - 2, Math.max(1, Math.round((i + 0.5) / R * (G - 1)))), gj = Math.min(G - 2, Math.max(1, Math.round((j + 0.5) / R * (G - 1))));
      const go = gj * G + gi;
      const nx = (H[go - 1] - H[go + 1]) / (2 * sp), nz = (H[go - G] - H[go + G]) / (2 * sp), inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      const shade = Math.max(0.45, Math.min(1.25, 0.75 + (-nx * 0.6 + nz * 0.6) * inv * 1.8 + inv * 0.25));
      let r = 108, g = 150, bl = 70;                                // meadow
      const mix = (w, cr, cg, cb) => { r += (cr - r) * w; g += (cg - g) * w; bl += (cb - bl) * w; };
      mix(a[o + 2] / 255, 222, 188, 102); mix(b[o] / 255, 120, 170, 64); mix(a[o + 3] / 255, 128, 94, 66); mix(b[o + 3] / 255, 196, 186, 120);
      mix(b[o + 2] / 255, 170, 140, 100); mix(a[o + 1] / 255, 140, 134, 124); mix(Math.min(1, a[o] / 255 * 1.5), 236, 214, 166);
      const k = (j * R + i) * 4;
      img.data[k] = Math.min(255, r * shade); img.data[k + 1] = Math.min(255, g * shade); img.data[k + 2] = Math.min(255, bl * shade); img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapCanvas = c; this.mapSize = terrain.size; this.mapHalf = terrain.half;
  }

  setMoney(n) {
    const el = this.el.money;
    const prev = this._money ?? n;
    this._money = n;
    el.textContent = '$' + n.toLocaleString('tr-TR');
    if (n !== prev) { el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); }
  }

  // floating feedback text (stunts, money, warnings)
  popup(text, kind = 'good') {
    const d = document.createElement('div');
    d.className = `popup ${kind}`;
    d.innerHTML = text;
    this.el.popups.appendChild(d);
    setTimeout(() => d.remove(), 2300);
  }

  objective(o) {
    const el = this.el.obj;
    if (!o) { el.classList.add('hidden'); this._objKey = ''; return; }
    const key = o.title + o.lines.join('|');
    if (key === this._objKey) return;
    this._objKey = key;
    el.classList.remove('hidden');
    el.innerHTML = `<div class="o-t">${o.title}</div>${o.lines.map((l) => `<div class="o-l">${l}</div>`).join('')}`;
  }

  updateCounts(gp) {
    this.el.disc.textContent = `${gp.save.found.length}/${gp.pois.length}`;
    this.el.coll.textContent = `${gp.collectedCount}/${gp.collectibleTotal}`;
  }

  toast(kicker, title, desc = '') {
    this.toastQueue.push({ kicker, title, desc });
    if (this.toastTimer <= 0) this._nextToast();
  }
  _nextToast() {
    const t = this.toastQueue.shift();
    if (!t) { this.el.toast.classList.remove('show'); return; }
    this.el.toast.innerHTML = `<div class="k">${t.kicker}</div><div class="v">${t.title}</div>${t.desc ? `<div class="d">${t.desc}</div>` : ''}`;
    this.el.toast.classList.add('show');
    this.toastTimer = 3.6;
  }

  hint(html, secs = 4) { this.el.hint.innerHTML = html; this.el.hint.classList.add('show'); this.hintTimer = secs; }
  prompt(html) { if (html) { this.el.prompt.innerHTML = html; this.el.prompt.classList.remove('hidden'); } else this.el.prompt.classList.add('hidden'); }

  challenge(c) {
    if (!c) { this.el.chall.classList.add('hidden'); return; }
    this.el.chall.classList.remove('hidden');
    this.el.chall.innerHTML = `${c.name}<span class="t">${c.time}</span><small>${c.sub || ''}</small>`;
  }

  nowPlaying(track) {
    this.el.npT.textContent = track.title; this.el.npA.textContent = track.artist;
    this.el.np.classList.add('show');
    clearTimeout(this._npT);
    this._npT = setTimeout(() => this.el.np.classList.remove('show'), 5500);
  }

  update(dt, vehicle, gp, heading) {
    // toasts / hint timers
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) { this.el.toast.classList.remove('show'); setTimeout(() => this._nextToast(), 450); } }
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) this.el.hint.classList.remove('show'); }
    const kmh = Math.abs(vehicle.forwardSpeed) * 3.6;
    const v = this.units === 'mph' ? kmh * 0.621 : kmh;
    this.el.speed.textContent = Math.round(v);
    this.el.gear.textContent = vehicle.gearLabel();
    this._drawSpeedo(v, vehicle.rpm, vehicle);
    this._drawMinimap(vehicle.position, heading, gp);
  }

  _drawSpeedo(v, rpm, vehicle) {
    const key = Math.round(v) + ':' + Math.round(rpm / 50) + ':' + (vehicle.boosting ? 1 : 0);
    if (key === this._lastSpeedo) return;
    this._lastSpeedo = key;
    const c = this.speedo, W = 240, cx = 120, cy = 124;
    c.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    // backing
    c.beginPath(); c.arc(cx, cy, 108, 0, Math.PI * 2); c.fillStyle = 'rgba(34,22,14,0.62)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(246,234,210,0.75)'; c.stroke();
    // rpm arc
    const rf = Math.min(1, (rpm - 800) / 5600);
    c.lineCap = 'round';
    c.beginPath(); c.arc(cx, cy, 92, a0, a1); c.lineWidth = 10; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.stroke();
    const grad = c.createLinearGradient(20, 0, 220, 0); grad.addColorStop(0, '#e8b04a'); grad.addColorStop(0.75, '#f0c060'); grad.addColorStop(1, '#d9442f');
    c.beginPath(); c.arc(cx, cy, 92, a0, a0 + (a1 - a0) * rf); c.strokeStyle = grad; c.stroke();
    // ticks
    const max = this.units === 'mph' ? 100 : 160;
    c.fillStyle = 'rgba(246,234,210,0.85)'; c.font = '700 14px "Barlow Condensed"'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let s = 0; s <= max; s += 10) {
      const a = a0 + (a1 - a0) * s / max, major = s % 20 === 0;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * (major ? 70 : 74), cy + Math.sin(a) * (major ? 70 : 74)); c.lineTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
      c.lineWidth = major ? 2.5 : 1.2; c.strokeStyle = 'rgba(246,234,210,0.8)'; c.stroke();
      if (major) c.fillText(String(s), cx + Math.cos(a) * 58, cy + Math.sin(a) * 58);
    }
    // needle
    const a = a0 + (a1 - a0) * Math.min(1.04, v / max);
    c.save(); c.translate(cx, cy); c.rotate(a);
    c.beginPath(); c.moveTo(-10, -3); c.lineTo(84, 0); c.lineTo(-10, 3); c.closePath(); c.fillStyle = '#d9442f'; c.fill();
    c.restore();
    c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fillStyle = '#f6ead2'; c.fill();
  }

  _w2m(x, z, cx, cz, scale, rot) {
    const dx = (x - cx) * scale, dz = (z - cz) * scale;
    const c = Math.cos(rot), s = Math.sin(rot);
    return [110 + dx * c - dz * s, 110 + dx * s + dz * c];
  }

  _drawMinimap(pos, heading, gp) {
    const c = this.mm, R = 110;
    if (!this.mapCanvas) return;
    const range = 320; // metres from centre to edge
    const scale = R / range;
    const rot = Math.PI + heading; // heading-up
    c.save();
    c.clearRect(0, 0, 220, 220);
    c.translate(110, 110); c.rotate(rot);
    const pxPerM = this.mapCanvas.width / this.mapSize;
    const sx = (pos.x + this.mapHalf) * pxPerM, sz = (pos.z + this.mapHalf) * pxPerM;
    const srcR = range * 1.5 * pxPerM;
    c.drawImage(this.mapCanvas, sx - srcR, sz - srcR, srcR * 2, srcR * 2, -range * 1.5 * scale, -range * 1.5 * scale, range * 3 * scale, range * 3 * scale);
    c.restore();
    // vignette ring
    const g = c.createRadialGradient(110, 110, 70, 110, 110, 112); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g; c.fillRect(0, 0, 220, 220);
    const icon = (x, z, txt, col, always = false) => {
      let [mx, my] = this._w2m(x, z, pos.x, pos.z, scale, rot);
      const d = Math.hypot(mx - 110, my - 110);
      if (d > 98) { if (!always) return; mx = 110 + (mx - 110) / d * 98; my = 110 + (my - 110) / d * 98; }
      c.font = '700 15px "Barlow Condensed"'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(txt, mx, my); c.fillStyle = col; c.fillText(txt, mx, my);
    };
    for (const p of POIS) icon(p.x, p.z, gp.isFound(p.id) ? p.icon : '?', gp.isFound(p.id) ? '#f6ead2' : '#e8b04a');
    for (const ch of CHALLENGES) icon(ch.start.x, ch.start.z, '⚑', '#ff7a50');
    for (const k of gp.pumpkins) if (k.g.visible && Math.hypot(k.x - pos.x, k.z - pos.z) < 150) icon(k.x, k.z, '●', '#ff9a2e');
    for (const b of this.boards) icon(b.x, b.z, '$', '#ffd36b', !this.extraTarget && !gp.nextTarget && this.showBoards);
    if (this.stuntZones) {
      for (const t of this.stuntZones.traps) icon(t.x, t.z, '»', '#7fd4ff');
      for (const j of this.stuntZones.jumps) icon(j.x, j.z, '⌃', '#ffa04a');
    }
    if (gp.nextTarget) icon(gp.nextTarget[0], gp.nextTarget[1], '◆', '#7fd4ff', true);
    if (this.extraTarget) icon(this.extraTarget[0], this.extraTarget[1], '▼', '#9fe0ff', true);
    if (this.waypoint) icon(this.waypoint[0], this.waypoint[1], '✚', '#b6ff9a', true);
    // player arrow
    c.save(); c.translate(110, 110);
    c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath();
    c.fillStyle = '#d9442f'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#f6ead2'; c.stroke();
    c.restore();
    // north marker position
    const n = document.querySelector('.mm-n');
    const na = rot - Math.PI / 2;
    if (n) {
      const k = (this.mm.canvas.clientWidth || 220) / 220;
      n.style.left = (110 + Math.cos(na) * 96) * k + 'px'; n.style.top = ((110 + Math.sin(na) * 96) * k - 9) + 'px';
    }
  }

  drawBigMap(pos, heading, gp) {
    const c = this.big.getContext('2d'), W = this.big.width;
    c.drawImage(this.mapCanvas, 0, 0, W, W);
    const toPx = (x, z) => [(x + this.mapHalf) / this.mapSize * W, (z + this.mapHalf) / this.mapSize * W];
    c.font = '700 22px "Barlow Condensed"'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of POIS) {
      const [x, y] = toPx(p.x, p.z); const f = gp.isFound(p.id);
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(f ? p.icon : '?', x, y); c.fillStyle = f ? '#f6ead2' : '#e8b04a'; c.fillText(f ? p.icon : '?', x, y);
      if (f) { c.font = '700 15px "Barlow Condensed"'; c.strokeText(p.name, x, y + 18); c.fillText(p.name, x, y + 18); c.font = '700 22px "Barlow Condensed"'; }
    }
    for (const ch of CHALLENGES) { const [x, y] = toPx(ch.start.x, ch.start.z); c.fillStyle = '#ff7a50'; c.strokeText('⚑', x, y); c.fillText('⚑', x, y); }
    for (const b of this.boards) { const [x, y] = toPx(b.x, b.z); c.fillStyle = '#ffd36b'; c.strokeText('$', x + 14, y - 10); c.fillText('$', x + 14, y - 10); }
    if (this.stuntZones) {
      for (const t of this.stuntZones.traps) { const [x, y] = toPx(t.x, t.z); c.fillStyle = '#7fd4ff'; c.strokeText('»', x, y); c.fillText('»', x, y); }
      for (const j of this.stuntZones.jumps) { const [x, y] = toPx(j.x, j.z); c.fillStyle = '#ffa04a'; c.strokeText('⌃', x, y); c.fillText('⌃', x, y); }
    }
    if (this.extraTarget) { const [x, y] = toPx(this.extraTarget[0], this.extraTarget[1]); c.fillStyle = '#9fe0ff'; c.strokeText('▼', x, y - 16); c.fillText('▼', x, y - 16); }
    if (this.waypoint) { const [x, y] = toPx(this.waypoint[0], this.waypoint[1]); c.font = '700 30px "Barlow Condensed"'; c.fillStyle = '#b6ff9a'; c.strokeText('✚', x, y); c.fillText('✚', x, y); }
    const [px, py] = toPx(pos.x, pos.z);
    c.save(); c.translate(px, py); c.rotate(-heading + Math.PI);
    c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath();
    c.fillStyle = '#d9442f'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#f6ead2'; c.stroke(); c.restore();
  }

  bigMapToWorld(ev) {
    const r = this.big.getBoundingClientRect();
    return [(ev.clientX - r.left) / r.width * this.mapSize - this.mapHalf, (ev.clientY - r.top) / r.height * this.mapSize - this.mapHalf];
  }

  fillPoiList(gp, onTeleport) {
    const ul = document.getElementById('poi-list');
    ul.innerHTML = '';
    for (const p of POIS) {
      const li = document.createElement('li');
      const f = gp.isFound(p.id);
      li.className = f ? 'found' : 'locked';
      li.innerHTML = `<span class="ico">${f ? p.icon : '?'}</span>${f ? p.name : 'Keşfedilmedi'}`;
      if (f) li.onclick = () => onTeleport(p);
      ul.appendChild(li);
    }
    for (const ch of CHALLENGES) {
      const li = document.createElement('li');
      const best = gp.save.best[ch.id];
      li.className = 'found';
      li.innerHTML = `<span class="ico" style="color:#ff7a50">⚑</span>${ch.name}${best ? ` <small style="opacity:.7">· ${fmt(best)}</small>` : ''}`;
      li.onclick = () => onTeleport({ x: ch.start.x, z: ch.start.z, heading: ch.start.heading });
      ul.appendChild(li);
    }
  }
}
