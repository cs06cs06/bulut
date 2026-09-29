// Stadium bowl: stands, animated crowd, LED boards, roof with flood-light banks, big screen, flags, camera flashes.
import * as THREE from 'three';
import { PITCH } from './pitch.js';

const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

/* ---- rounded-rectangle path helpers ---- */
// simpler and exact: sample the rounded rectangle by arc length
function rrPoint(hx, hz, r, t) {
  // t in [0,1): perimeter parameter starting at (hx, 0) going counter-clockwise (toward +z)
  const a = 2 * (hz - r), b = 2 * (hx - r), c = Math.PI * r / 2;
  const P = 2 * a + 2 * b + 4 * c;
  let s = ((t % 1) + 1) % 1 * P;
  s += a / 2;                       // start at mid of right edge
  s %= P;
  const segs = [a, c, b, c, a, c, b, c];
  let k = 0; while (s > segs[k]) { s -= segs[k]; k++; }
  const sx = hx - r, sz = hz - r;
  switch (k) {
    case 0: return [hx, -sz + s, 1, 0];
    case 1: { const ang = s / r; return [sx + Math.cos(ang) * r, sz + Math.sin(ang) * r, Math.cos(ang), Math.sin(ang)]; }
    case 2: return [sx - s, hz, 0, 1];
    case 3: { const ang = Math.PI / 2 + s / r; return [-sx + Math.cos(ang) * r, sz + Math.sin(ang) * r, Math.cos(ang), Math.sin(ang)]; }
    case 4: return [-hx, sz - s, -1, 0];
    case 5: { const ang = Math.PI + s / r; return [-sx + Math.cos(ang) * r, -sz + Math.sin(ang) * r, Math.cos(ang), Math.sin(ang)]; }
    case 6: return [-sx + s, -hz, 0, -1];
    default: { const ang = Math.PI * 1.5 + s / r; return [sx + Math.cos(ang) * r, -sz + Math.sin(ang) * r, Math.cos(ang), Math.sin(ang)]; }
  }
}
/* ---- procedural textures ---- */
function seatColorTexture() {
  const W = 512, H = 40;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = rng(7);
  const red = [200, 16, 46], white = [235, 235, 240], dark = [30, 32, 40], navy = [12, 50, 140], gold = [242, 196, 0];
  const img = g.createImageData(W, H);
  const setPx = (x, y, col) => { const i = (y * W + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255; };
  // path param u: 0 = right edge middle, 0.25 = +z end (far end / behind kicker), 0.5 = left, 0.75 = -z end (behind goal)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W;
    let col;
    const block = Math.floor(x / 6 + y / 5) ;
    const rr = ((block * 2654435761) >>> 0) / 4294967296;
    const behindGoal = u > 0.6 && u < 0.9;
    const farEnd = u > 0.10 && u < 0.40;
    if (behindGoal) col = rr < 0.68 ? red : rr < 0.9 ? white : dark;
    else if (farEnd) col = rr < 0.66 ? navy : rr < 0.9 ? gold : white;
    else col = rr < 0.5 ? red : rr < 0.78 ? white : rr < 0.9 ? navy : dark;
    setPx(x, y, col);
  }
  g.putImageData(img, 0, 0);
  // mosaic text behind the goal
  g.save();
  g.imageSmoothingEnabled = false;
  const tc = document.createElement('canvas'); tc.width = 140; tc.height = 22;
  const tg = tc.getContext('2d'); tg.fillStyle = '#000'; tg.fillRect(0, 0, 140, 22);
  tg.fillStyle = '#fff'; tg.font = '700 21px "Barlow Condensed", Arial Narrow, sans-serif'; tg.textAlign = 'center'; tg.textBaseline = 'middle';
  tg.fillText('B U L U T', 70, 12);
  const td = tg.getImageData(0, 0, 140, 22).data;
  const ox = Math.floor(W * 0.75 - 70), oy = 9;
  for (let y = 0; y < 22; y++) for (let x = 0; x < 140; x++) if (td[(y * 140 + x) * 4] > 128) setPx2(g, ox + x, oy + y, white);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}
function setPx2(g, x, y, col) { g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; g.fillRect(x, y, 1, 1); }

function crowdAtlas() {
  const cols = 8, rows = 2, cw = 128, ch = 256;
  const mk = () => { const c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * rows; return c; };
  const color = mk(), mask = mk();
  const g = color.getContext('2d'), m = mask.getContext('2d');
  m.fillStyle = '#000'; m.fillRect(0, 0, color.width, color.height);
  const R = rng(11);
  const skins = ['#f2c9a5', '#e3b088', '#c98b5e', '#a8693f', '#7a4a2b', '#f6d7c0'];
  const hairs = ['#1a1310', '#2b1b12', '#5a3a1e', '#a67c3d', '#d9c08a', '#8a8a8a', '#101010', '#3b2a20'];
  for (let cell = 0; cell < cols * rows; cell++) {
    const cx = (cell % cols) * cw, cy = Math.floor(cell / cols) * ch;
    const skin = skins[Math.floor(R() * skins.length)], hair = hairs[Math.floor(R() * hairs.length)];
    const armsUp = cell % 4;       // 0 down, 1 left up, 2 right up, 3 both up
    const scarf = cell % 5 === 0, hat = cell % 7 === 3, phone = cell % 6 === 1;
    // torso (shirt) : rounded trapezoid
    const drawShape = (ctx, fill, fn) => { ctx.fillStyle = fill; ctx.beginPath(); fn(ctx); ctx.fill(); };
    const shirtPath = (ctx) => {
      ctx.moveTo(cx + 20, cy + ch); ctx.lineTo(cx + 24, cy + 118); ctx.quadraticCurveTo(cx + 26, cy + 96, cx + 50, cy + 92);
      ctx.lineTo(cx + 78, cy + 92); ctx.quadraticCurveTo(cx + 102, cy + 96, cx + 104, cy + 118); ctx.lineTo(cx + 108, cy + ch); ctx.closePath();
    };
    drawShape(g, '#cfcfcf', shirtPath); drawShape(m, '#fff', shirtPath);
    // shading
    const grad = g.createLinearGradient(cx, cy + 90, cx, cy + ch);
    grad.addColorStop(0, 'rgba(255,255,255,0.15)'); grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grad; g.beginPath(); shirtPath(g); g.fill();
    // arms
    const arm = (side, up) => {
      const sx = side < 0 ? cx + 26 : cx + 102; const dir = side;
      const path = (ctx) => {
        if (!up) { ctx.moveTo(sx, cy + 104); ctx.lineTo(sx + dir * 14, cy + 112); ctx.lineTo(sx + dir * 12, cy + 200); ctx.lineTo(sx - dir * 2, cy + 196); ctx.closePath(); }
        else { ctx.moveTo(sx, cy + 102); ctx.lineTo(sx + dir * 12, cy + 108); ctx.lineTo(sx + dir * 30, cy + 30); ctx.lineTo(sx + dir * 14, cy + 24); ctx.closePath(); }
      };
      drawShape(g, '#c4c4c4', path); drawShape(m, '#fff', path);
      // hand
      g.fillStyle = skin; g.beginPath();
      if (up) g.arc(sx + dir * 23, cy + 20, 9, 0, 7); else g.arc(sx + dir * 5, cy + 204, 8, 0, 7);
      g.fill();
    };
    arm(-1, armsUp === 1 || armsUp === 3); arm(1, armsUp === 2 || armsUp === 3);
    if (scarf) { // scarf held/wrapped
      g.fillStyle = cell % 2 ? '#c8102e' : '#ffffff'; g.fillRect(cx + 44, cy + 82, 40, 14);
      g.fillStyle = cell % 2 ? '#ffffff' : '#c8102e'; g.fillRect(cx + 44, cy + 86, 40, 4);
    }
    // neck + head
    g.fillStyle = skin; g.fillRect(cx + 56, cy + 78, 16, 18);
    g.beginPath(); g.ellipse(cx + 64, cy + 56, 21, 26, 0, 0, 7); g.fill();
    // hair
    g.fillStyle = hair; g.beginPath(); g.ellipse(cx + 64, cy + 44, 22, 17, 0, Math.PI, 0); g.fill();
    if (cell % 3 === 0) { g.fillRect(cx + 42, cy + 44, 8, 22); g.fillRect(cx + 78, cy + 44, 8, 22); }
    if (hat) { g.fillStyle = '#c8102e'; g.fillRect(cx + 40, cy + 34, 48, 10); g.beginPath(); g.ellipse(cx + 64, cy + 34, 24, 14, 0, Math.PI, 0); g.fill(); m.fillStyle = '#fff'; m.fillRect(cx + 40, cy + 34, 48, 10); m.beginPath(); m.ellipse(cx + 64, cy + 34, 24, 14, 0, Math.PI, 0); m.fill(); }
    // face hint
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(cx + 55, cy + 55, 4, 3); g.fillRect(cx + 69, cy + 55, 4, 3);
    g.fillStyle = 'rgba(120,40,40,0.5)'; g.fillRect(cx + 59, cy + 68, 10, 3);
    if (phone) { g.fillStyle = '#111'; g.fillRect(cx + 95, cy + 8, 14, 24); g.fillStyle = '#bfe0ff'; g.fillRect(cx + 97, cy + 10, 10, 20); }
  }
  const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; return t; };
  const tm = new THREE.CanvasTexture(mask); tm.generateMipmaps = true;
  return { color: tex(color), mask: tm, cols, rows };
}

function adBoardTexture(strip) {
  const W = 4096, H = 96;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const ads = [
    ['BULUT', '#0b5cff', '#ffffff'], ['NIMBUS SPOR', '#ffffff', '#c8102e'], ['ATMOS ENERJİ', '#101820', '#7dff6a'], ['KUMULUS', '#ff7a00', '#ffffff'],
    ['YILDIZ MOBİL', '#1c1c24', '#ffd400'], ['PENALTİ KUPASI', '#c8102e', '#ffffff'], ['AURA', '#00b6a4', '#0a2a30'], ['RÜZGÂR HAVAYOLLARI', '#0a2a6b', '#ffffff'],
  ];
  const seg = 512;
  for (let i = 0; i < W / seg; i++) {
    const a = ads[(i + strip * 3) % ads.length];
    g.fillStyle = a[1]; g.fillRect(i * seg, 0, seg, H);
    g.fillStyle = a[2]; g.font = '800 62px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(a[0], i * seg + seg / 2, H / 2 + 4);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(i * seg, H - 6, seg, 6);
    g.fillRect(i * seg, 0, 6, H);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function bannerTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 2048, 0); grad.addColorStop(0, bg[0]); grad.addColorStop(1, bg[1]);
  g.fillStyle = grad; g.fillRect(0, 0, 2048, 512);
  g.strokeStyle = fg; g.lineWidth = 14; g.strokeRect(20, 20, 2008, 472);
  g.fillStyle = fg; g.font = '800 300px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 1024, 270);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export class Stadium {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.time = 0;
    this.excite = 0.2;         // crowd excitement 0..1
    this.wave = 0;
    this.crowdCount = opts.crowdDensity ?? 1;
    this.seatTex = seatColorTexture();
    this.build(opts);
  }

  build(opts) {
    const L = PITCH.l, cz = L / 2;
    const hx0 = 43, hz0 = cz + 13, r0 = 16;
    const ROWS = 34, DEP = 0.86, RISE = 0.5, H0 = 0.9;
    this.bowl = { hx0, hz0, r0, ROWS, DEP, RISE, H0, cz };
    const rowAt = (i) => ({ hx: hx0 + i * DEP, hz: hz0 + i * DEP, r: r0 + i * DEP * 0.9, y: H0 + i * RISE });
    this.rowAt = rowAt;

    /* ---- concrete apron + wall */
    const tl = new THREE.TextureLoader();
    const cTex = {};
    for (const [k, f] of [['map', 'diff'], ['normalMap', 'nor'], ['roughnessMap', 'rough']]) {
      const t = tl.load(`./assets/textures/concrete_floor_02/concrete_floor_02_${f}_1k.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (k === 'map') t.colorSpace = THREE.SRGBColorSpace; cTex[k] = t;
    }
    const concrete = new THREE.MeshStandardMaterial({ ...cTex, color: 0x9aa0a8, roughness: 1, side: THREE.DoubleSide });

    /* ---- seating deck strips */
    const N = 720;
    const pos = [], uvs = [], nrm = [], idx = [];
    const seatUvScale = 1;
    for (let i = 0; i <= ROWS; i++) {
      const a = rowAt(i);
      for (let j = 0; j <= N; j++) {
        const t = j / N;
        const [x, z, nx, nz] = rrPoint(a.hx, a.hz, a.r, t);
        pos.push(x, a.y, z - cz + cz);
        uvs.push(t * 1.0, i / ROWS);
        nrm.push(-nx * 0.5, 0.85, -nz * 0.5);
      }
    }
    for (let i = 0; i < ROWS; i++) for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // path center is (0, cz): shift z by cz
    for (let k = 2; k < pos.length; k += 3) pos[k] += 0;
    const deckGeo = new THREE.BufferGeometry();
    for (let k = 0; k < pos.length; k += 3) pos[k + 2] += cz;   // rrPoint is centred on 0 -> move to pitch centre
    deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    deckGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    deckGeo.setIndex(idx);
    deckGeo.computeVertexNormals();
    const perim = 2 * (2 * (hz0 - r0)) + 2 * (2 * (hx0 - r0)) + 2 * Math.PI * r0;
    const seatsAround = Math.round(perim / 0.55);
    this.seatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide });
    this.seatMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSeatTex = { value: this.seatTex };
      shader.uniforms.uSeats = { value: seatsAround };
      shader.uniforms.uRows = { value: ROWS };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSeatUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeatUv = uv;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSeatUv; uniform sampler2D uSeatTex; uniform float uSeats; uniform float uRows;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 sp = vec2(vSeatUv.x * uSeats, vSeatUv.y * uRows);
            vec2 f = fract(sp);
            vec3 sc = texture2D(uSeatTex, vec2(vSeatUv.x, 1.0 - (floor(sp.y) + 0.5) / uRows)).rgb;
            // seat shape: backrest band + gap between seats
            float gap = smoothstep(0.0, 0.10, f.x) * (1.0 - smoothstep(0.90, 1.0, f.x));
            float back = smoothstep(0.55, 0.60, f.y);
            vec3 col = sc * (0.55 + 0.45 * back) * (0.35 + 0.65 * gap);
            // concrete rows between
            diffuseColor.rgb = mix(vec3(0.16,0.17,0.19), col, gap * smoothstep(0.02, 0.10, f.y));
          }`);
    };
    const deck = new THREE.Mesh(deckGeo, this.seatMat);
    deck.receiveShadow = true; deck.frustumCulled = false;
    this.group.add(deck);

    /* ---- front wall + apron ring (between boards and stands) */
    {
      const inner = { hx: hx0 - 2.2, hz: hz0 - 2.2, r: r0 - 2.2 }, outer = { hx: hx0, hz: hz0, r: r0 };
      const p = [], u = [], ix = [];
      const M = 480;
      for (let j = 0; j <= M; j++) {
        const t = j / M;
        const [x1, z1] = rrPoint(inner.hx, inner.hz, inner.r, t), [x2, z2] = rrPoint(outer.hx, outer.hz, outer.r, t);
        p.push(x1, 0.02, z1 + cz, x2, 0.02, z2 + cz, x2, H0, z2 + cz);
        u.push(t * 220, 0, t * 220, 1, t * 220, 2);
      }
      for (let j = 0; j < M; j++) { const a = j * 3; ix.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(ix); g.computeVertexNormals();
      const m = new THREE.Mesh(g, concrete); m.receiveShadow = true; this.group.add(m);
    }

    /* ---- crowd */
    this.buildCrowd(rowAt, ROWS, cz, seatsAround);

    /* ---- LED boards */
    this.buildBoards(cz);

    /* ---- roof + lights + big screen */
    this.buildRoof(rowAt, ROWS, cz);

    /* ---- back wall behind the top row */
    {
      const a = rowAt(ROWS), p = [], ix = [];
      const M = 360;
      for (let j = 0; j <= M; j++) {
        const t = j / M;
        const [x1, z1] = rrPoint(a.hx, a.hz, a.r, t), [x2, z2] = rrPoint(a.hx + 1.5, a.hz + 1.5, a.r + 1.5, t);
        p.push(x1, a.y, z1 + cz, x2, this.roofY + 1.6, z2 + cz);
      }
      for (let j = 0; j < M; j++) { const q = j * 2; ix.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals();
      this.group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x0c0e13, roughness: 0.9, side: THREE.DoubleSide })));
    }
    /* ---- flags & banners */
    this.buildBanners(rowAt, cz);

    /* ---- camera flashes */
    this.buildFlashes(rowAt, ROWS, cz);
  }

  buildCrowd(rowAt, ROWS, cz, seatsAround) {
    const atlas = crowdAtlas(); this.atlas = atlas;
    const R = rng(1234);
    const inst = [];
    for (let i = 1; i < ROWS; i++) {
      const a = rowAt(i);
      const perim = 2 * (2 * (a.hz - a.r)) + 2 * (2 * (a.hx - a.r)) + 2 * Math.PI * a.r;
      const n = Math.round(perim / 0.56);
      for (let j = 0; j < n; j++) {
        if (R() < 0.07) continue;
        const t = (j + R() * 0.3) / n;
        // stand behind people: place slightly in front of the seat deck
        const [x, z, nx, nz] = rrPoint(a.hx - 0.28, a.hz - 0.28, a.r, t);
        const yaw = Math.atan2(-nx, -nz);      // faces the pitch (inward)
        const sizeS = 0.9 + R() * 0.25;
        inst.push({ x, y: a.y + 0.02, z: z + cz, yaw, w: 0.62 * sizeS * (perim / n / 0.56), h: 1.02 * sizeS, cell: Math.floor(R() * 16), t, row: i, ph: R() });
      }
    }
    for (let i = inst.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [inst[i], inst[j]] = [inst[j], inst[i]]; }
    this.crowdN = inst.length;
    const count = inst.length;
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
    const iPos = new Float32Array(count * 3), iInfo = new Float32Array(count * 4), iTint = new Float32Array(count * 4), iSize = new Float32Array(count * 2);
    const seatCanvas = this.seatTex.image.getContext ? this.seatTex.image : null;
    const sd = seatCanvas ? seatCanvas.getContext('2d').getImageData(0, 0, seatCanvas.width, seatCanvas.height).data : null;
    inst.forEach((s, k) => {
      iPos.set([s.x, s.y, s.z], k * 3);
      iInfo.set([s.yaw, s.cell, s.ph, s.row / ROWS], k * 4);
      iSize.set([s.w, s.h], k * 2);
      // shirt colour: from the seat colour texture, sometimes replaced by neutral clothing
      let col = [0.6, 0.6, 0.6];
      if (sd) {
        const px = Math.min(seatCanvas.width - 1, Math.floor(s.t * seatCanvas.width)), py = Math.min(seatCanvas.height - 1, Math.floor(s.row / ROWS * seatCanvas.height));
        const o = (py * seatCanvas.width + px) * 4; col = [sd[o] / 255, sd[o + 1] / 255, sd[o + 2] / 255];
      }
      const rr = R();
      if (rr < 0.16) col = [0.08 + R() * 0.2, 0.08 + R() * 0.2, 0.1 + R() * 0.2];
      else if (rr < 0.24) col = [0.5 + R() * 0.4, 0.5 + R() * 0.4, 0.5 + R() * 0.4];
      const toLin = c => Math.pow(c, 2.2);
      iTint.set([toLin(col[0]), toLin(col[1]), toLin(col[2]), 0.75 + R() * 0.5], k * 4);
    });
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    geo.setAttribute('iInfo', new THREE.InstancedBufferAttribute(iInfo, 4));
    geo.setAttribute('iTint', new THREE.InstancedBufferAttribute(iTint, 4));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 2));
    geo.instanceCount = Math.floor(count * (this.crowdCount || 1));
    this.crowdMat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas.color }, uMask: { value: atlas.mask }, uTime: { value: 0 }, uExcite: { value: 0.3 }, uWave: { value: 0 },
        uLight: { value: 0.5 }, uFogColor: { value: new THREE.Color(0x0a1020) }, uFogDensity: { value: 0.0030 }, uBloomBoost: { value: 1.0 },
        uCells: { value: new THREE.Vector2(atlas.cols, atlas.rows) },
      },
      vertexShader: /* glsl */`
        attribute vec3 iPos; attribute vec4 iInfo; attribute vec4 iTint; attribute vec2 iSize;
        uniform float uTime, uExcite, uWave; uniform vec2 uCells;
        varying vec2 vUv; varying vec4 vTint; varying float vLight; varying float vDepth;
        void main(){
          float yaw = iInfo.x, cell = iInfo.y, ph = iInfo.z, rowN = iInfo.w;
          vec3 p = position * vec3(iSize.x, iSize.y, 1.0);
          float jump = uExcite * max(0.0, sin(uTime * (5.0 + 3.0*fract(ph*7.0)) + ph * 40.0)) * 0.22;
          float wave = uWave * max(0.0, sin(iPos.x * 0.07 + iPos.z * 0.07 - uTime * 5.0)) * 0.25;
          float bob = sin(uTime * 2.0 + ph * 30.0) * 0.006;
          p.y += jump + wave + bob;
          float c = cos(yaw), s = sin(yaw);
          vec3 w = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) + iPos;
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          vec2 cellXY = vec2(mod(cell, uCells.x), floor(cell / uCells.x));
          vUv = (cellXY + uv) / uCells;
          vTint = iTint;
          vLight = 0.5 + 0.5 * (1.0 - rowN * 0.85);
          vDepth = -mv.z;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uAtlas, uMask; uniform float uLight, uFogDensity; uniform vec3 uFogColor;
        varying vec2 vUv; varying vec4 vTint; varying float vLight; varying float vDepth;
        void main(){
          vec4 c = texture2D(uAtlas, vUv);
          float m = texture2D(uMask, vUv).r;
          if (c.a < 0.02) discard;
          vec3 shirt = vTint.rgb * (0.55 + 0.9 * dot(c.rgb, vec3(0.333)));
          vec3 col = mix(c.rgb * c.rgb * 1.2, shirt, m);
          col *= vLight * uLight * vTint.a;
          float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
          col = mix(col, uFogColor, f);
          gl_FragColor = vec4(col, c.a);
        }`,
      transparent: false, alphaToCoverage: true, side: THREE.DoubleSide, depthWrite: true,
    });
    // alpha-to-coverage cut-out: use alpha test in the shader (discard) + coverage
    this.crowd = new THREE.Mesh(geo, this.crowdMat);
    this.crowd.frustumCulled = false; this.crowd.layers.set(1);
    this.group.add(this.crowd);
  }

  buildBoards(cz) {
    const hw = 39.5, endZ = -6.6, farZ = PITCH.l + 6.6, H = 0.9;
    const mkBoard = (w, strip, uRepeat) => {
      const tex = adBoardTexture(strip);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTex: { value: tex }, uTime: { value: 0 }, uRep: { value: uRepeat }, uGain: { value: 3.2 }, uFogColor: { value: new THREE.Color(0x0a1020) }, uFogDensity: { value: 0.003 } },
        vertexShader: 'varying vec2 vUv; varying float vDepth; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vDepth=-mv.z; gl_Position = projectionMatrix*mv; }',
        fragmentShader: /* glsl */`
          uniform sampler2D uTex; uniform float uTime, uRep, uGain, uFogDensity; uniform vec3 uFogColor; varying vec2 vUv; varying float vDepth;
          void main(){
            vec2 uv = vec2(vUv.x * uRep + uTime * 0.012, vUv.y);
            vec3 c = texture2D(uTex, uv).rgb;
            // LED pixel grid
            vec2 g = fract(vec2(vUv.x * uRep * 4096.0 / 3.0, vUv.y * 96.0 / 3.0 * 0.0 + vUv.y * 32.0));
            vec2 cell = abs(g - 0.5);
            float led = smoothstep(0.5, 0.28, max(cell.x, cell.y));
            float ledMix = mix(led, 0.8, smoothstep(18.0, 60.0, vDepth));
            vec3 col = c * (0.55 + 0.45 * ledMix) * uGain;
            float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
            col = mix(col, uFogColor, f * 0.6);
            gl_FragColor = vec4(col, 1.0);
          }`,
        side: THREE.DoubleSide,
      });
      return mat;
    };
    this.boardMats = [];
    const addBoard = (len, x, z, ry, strip) => {
      const mat = mkBoard(len, strip, len / 32);
      this.boardMats.push(mat);
      const g = new THREE.PlaneGeometry(len, H);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, H / 2 + 0.04, z); m.rotation.y = ry;
      this.group.add(m);
    };
    // behind the goal (z<0), facing +z ; far end faces -z ; sides face inward
    addBoard(80, 0, endZ, 0, 0);
    const back2 = null; void back2;
    addBoard(80, 0, farZ, Math.PI, 1);
    addBoard(PITCH.l + 13, -hw, cz, Math.PI / 2, 2);
    addBoard(PITCH.l + 13, hw, cz, -Math.PI / 2, 3);
  }

  buildRoof(rowAt, ROWS, cz) {
    const top = rowAt(ROWS);
    const roofY = top.y + 5.5;
    const inward = 16;      // cantilever length
    const p = [], ix = [], uv = [];
    const M = 360;
    const inner = { hx: top.hx - inward, hz: top.hz - inward, r: Math.max(6, top.r - inward) };
    for (let j = 0; j <= M; j++) {
      const t = j / M;
      const [x1, z1] = rrPoint(top.hx + 1.5, top.hz + 1.5, top.r + 1.5, t), [x2, z2] = rrPoint(inner.hx, inner.hz, inner.r, t);
      p.push(x1, roofY + 1.6, z1 + cz, x2, roofY - 0.4, z2 + cz);
      uv.push(t * 100, 0, t * 100, 1);
    }
    for (let j = 0; j < M; j++) { const a = j * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide });
    const roof = new THREE.Mesh(g, roofMat); this.group.add(roof);
    this.roofInner = inner; this.roofY = roofY;
    // fascia (front edge) : dark panel + LED ribbon
    {
      const fp = [], fi = [], fu = [];
      for (let j = 0; j <= M; j++) {
        const t = j / M; const [x, z] = rrPoint(inner.hx, inner.hz, inner.r, t);
        fp.push(x, roofY - 0.4, z + cz, x, roofY - 1.6, z + cz, x, roofY - 2.2, z + cz);
        fu.push(t * 60, 0, t * 60, 0.5, t * 60, 1);
      }
      for (let j = 0; j < M; j++) { const a = j * 3; fi.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); fg.setIndex(fi); fg.computeVertexNormals();
      const ribbon = document.createElement('canvas'); ribbon.width = 2048; ribbon.height = 64;
      const rg = ribbon.getContext('2d'); rg.fillStyle = '#04070d'; rg.fillRect(0, 0, 2048, 64);
      rg.fillStyle = '#7fd0ff'; rg.font = '700 40px "Barlow Condensed", Arial Narrow'; rg.textBaseline = 'middle';
      let txt = ''; for (let k = 0; k < 6; k++) txt += 'BULUT ARENA  •  PENALTİ KUPASI  •  ';
      rg.fillText(txt, 0, 34);
      const rt = new THREE.CanvasTexture(ribbon); rt.wrapS = rt.wrapT = THREE.RepeatWrapping; rt.colorSpace = THREE.SRGBColorSpace;
      this.ribbonTex = rt;
      const fm = new THREE.MeshStandardMaterial({ color: 0x0d1016, roughness: 0.4, metalness: 0.5, emissive: 0xffffff, emissiveMap: rt, emissiveIntensity: 2.4, side: THREE.DoubleSide });
      const fascia = new THREE.Mesh(fg, fm); this.group.add(fascia);
    }
    // flood-light banks along the front edge of the roof
    const banks = [];
    const bankN = 34;
    for (let k = 0; k < bankN; k++) {
      const t = (k + 0.5) / bankN; const [x, z, nx, nz] = rrPoint(inner.hx, inner.hz, inner.r, t);
      banks.push({ x, z: z + cz, y: roofY - 0.9, nx, nz });
    }
    const bankGeo = new THREE.PlaneGeometry(3.2, 1.9);
    const bankMat = new THREE.ShaderMaterial({
      uniforms: { uGain: { value: 42.0 } }, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uGain; void main(){ vec2 g = fract(vUv*vec2(8.0,5.0)); vec2 d = abs(g-0.5); float lamp = smoothstep(0.5,0.18,max(d.x,d.y)); vec3 c = vec3(1.0,0.97,0.9)*uGain*(0.35+0.65*lamp); gl_FragColor = vec4(c,1.0); }`,
    });
    const bankMesh = new THREE.InstancedMesh(bankGeo, bankMat, banks.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
    banks.forEach((b, i) => {
      // face inward (toward pitch): normal points to -n
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-b.nx, -0.35, -b.nz).normalize());
      m4.compose(new THREE.Vector3(b.x, b.y, b.z), q, s1); bankMesh.setMatrixAt(i, m4);
    });
    bankMesh.frustumCulled = false; bankMesh.layers.set(1); this.group.add(bankMesh);
    this.banks = banks;
    // glare sprites
    const gl = document.createElement('canvas'); gl.width = gl.height = 128;
    const gg = gl.getContext('2d'); const gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,250,235,0.85)'); gr.addColorStop(0.3, 'rgba(210,225,255,0.22)'); gr.addColorStop(1, 'rgba(180,200,255,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
    const glareTex = new THREE.CanvasTexture(gl); glareTex.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = new THREE.SpriteMaterial({ map: glareTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(1, 0.96, 0.9).multiplyScalar(3.5), fog: false });
    for (const b of banks) {
      const sp = new THREE.Sprite(spriteMat); sp.position.set(b.x - b.nx * 0.5, b.y, b.z - b.nz * 0.5); sp.scale.setScalar(11); sp.layers.set(1); this.group.add(sp);
    }
    // big screen: on the roof fascia above the goal-end stand (behind the goal, z<0), facing the pitch (+z)
    {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 384; this.screenCanvas = c;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; this.screenTex = tex;
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(22, 8.25), mat);
      scr.position.set(0, roofY - 6.5, cz - (top.hz - inward) + 0.6 - 1.4 - 0.0);
      // sits below the roof edge, in front of the goal-end stand fascia
      scr.position.z = cz - inner.hz + 0.3; scr.position.y = roofY - 7.8;
      this.screen = scr; this.group.add(scr);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(22.8, 9.0, 0.5), new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.5, metalness: 0.7 }));
      frame.position.copy(scr.position); frame.position.z -= 0.3; this.group.add(frame);
      this.drawScreen({ home: 'BUL', away: 'RKP', hs: 0, as: 0, msg: 'PENALTİ KUPASI' });
    }
  }

  drawScreen({ home, away, hs, as, msg }) {
    const c = this.screenCanvas, g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 384); grad.addColorStop(0, '#0a1a3a'); grad.addColorStop(1, '#040814');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 384);
    g.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 0; y < 384; y += 4) g.fillRect(0, y, 1024, 1);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#7fd0ff'; g.font = '700 46px "Barlow Condensed", Arial Narrow'; g.fillText(msg || '', 512, 46);
    g.fillStyle = '#c8102e'; g.fillRect(90, 120, 200, 150); g.fillStyle = '#0d3b8e'; g.fillRect(734, 120, 200, 150);
    g.fillStyle = '#fff'; g.font = '800 96px "Barlow Condensed", Arial Narrow'; g.fillText(home, 190, 195); g.fillText(away, 834, 195);
    g.font = '800 190px "Barlow Condensed", Arial Narrow'; g.fillText(`${hs}`, 400, 200); g.fillText(`${as}`, 624, 200);
    g.font = '800 120px "Barlow Condensed", Arial Narrow'; g.fillText('–', 512, 196);
    g.fillStyle = '#ffd400'; g.font = '600 34px "Barlow Condensed", Arial Narrow'; g.fillText('SERİ PENALTI ATIŞLARI', 512, 330);
    this.screenTex.needsUpdate = true;
  }

  buildBanners(rowAt, cz) {
    // big tifo banner draped over the lower rows of the goal-end stand
    const rowC = rowAt(11);
    const tex = bannerTexture('BULUT', ['#c8102e', '#8b0a1f'], '#ffffff');
    const w = 36, h = 8.5;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 24, 4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, color: new THREE.Color(0.8, 0.8, 0.8) }));
    m.position.set(-14, rowC.y + 0.45, cz - rowC.hz + 0.35);
    m.rotation.x = -Math.atan2(1, Math.tan(Math.atan2(0.5, 0.86))) ;
    m.rotation.x = -(Math.PI / 2 - Math.atan2(0.5, 0.86));
    this.banner = m; this.group.add(m);
    this.bannerBase = m.geometry.attributes.position.array.slice();
    // flags along the front rows
    const flagGeo = new THREE.PlaneGeometry(1.1, 0.7, 8, 2); flagGeo.translate(0.55, 0, 0);
    const flagMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTex: { value: bannerTexture('BLT', ['#c8102e', '#c8102e'], '#ffffff') } },
      vertexShader: 'uniform float uTime; varying vec2 vUv; void main(){ vUv=uv; vec3 p=position; float w = sin(p.x*5.0 - uTime*6.0 + instanceMatrix[3][0]*0.7)*0.12*p.x; p.z += w; p.y += w*0.4; gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.0); }',
      fragmentShader: 'uniform sampler2D uTex; varying vec2 vUv; void main(){ vec3 c = texture2D(uTex, vUv).rgb; gl_FragColor = vec4(c*0.9, 1.0); }',
      side: THREE.DoubleSide,
    });
    const flagN = 60;
    const fm = new THREE.InstancedMesh(flagGeo, flagMat, flagN);
    const R = rng(5); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    for (let i = 0; i < flagN; i++) {
      const row = 3 + Math.floor(R() * 20); const r = rowAt(row);
      const t = 0.62 + R() * 0.26;
      const [x, z] = rrPoint(r.hx - 0.4, r.hz - 0.4, r.r, t);
      pv.set(x, r.y + 2.0 + R() * 0.8, z + cz);
      e.set(0, R() * Math.PI * 2, 0); q.setFromEuler(e);
      const sc = 0.9 + R() * 0.8; s1.set(sc, sc, sc);
      m4.compose(pv, q, s1); fm.setMatrixAt(i, m4);
    }
    fm.frustumCulled = false; fm.layers.set(1); this.flags = fm; this.flagMat = flagMat; this.group.add(fm);
  }

  buildFlashes(rowAt, ROWS, cz) {
    const N = 900, R = rng(99);
    const pos = new Float32Array(N * 3), ph = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const row = 2 + Math.floor(R() * (ROWS - 3)); const a = rowAt(row);
      const t = R();
      const [x, z] = rrPoint(a.hx - 0.3, a.hz - 0.3, a.r, t);
      pos.set([x, a.y + 1.2, z + cz], i * 3); ph.set([R() * 100, 0.4 + R() * 1.6], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 2));
    this.flashMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uRate: { value: 1.0 }, uScale: { value: 60 } },
      vertexShader: `attribute vec2 ph; uniform float uTime, uRate, uScale; varying float vI;
        void main(){ float t = fract((uTime * uRate + ph.x) / (3.0 + ph.y * 4.0)); float f = pow(max(0.0, 1.0 - abs(t - 0.5) * 60.0), 2.0) ; vI = f;
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (2.0 + f * 16.0) * uScale / max(1.0, -mv.z); }`,
      fragmentShader: `varying float vI; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); if (vI < 0.02) discard; gl_FragColor = vec4(vec3(0.85,0.92,1.0) * vI * 22.0, a * vI); }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.flashes = new THREE.Points(g, this.flashMat); this.flashes.frustumCulled = false; this.flashes.layers.set(1); this.group.add(this.flashes);
  }

  setScore(home, away, msg) { this.drawScreen({ home: 'BUL', away: 'RKP', hs: home, as: away, msg }); }
  update(dt, t) {
    this.time = t;
    const ex = this.excite;
    this.crowdMat.uniforms.uTime.value = t; this.crowdMat.uniforms.uExcite.value = ex; this.crowdMat.uniforms.uWave.value = this.wave;
    for (const m of this.boardMats) m.uniforms.uTime.value = t;
    this.flagMat.uniforms.uTime.value = t;
    this.flashMat.uniforms.uTime.value = t; this.flashMat.uniforms.uRate.value = 0.7 + ex * 2.6;
    if (this.ribbonTex) this.ribbonTex.offset.x = (t * 0.02) % 1;
    if (this.banner) {
      const p = this.banner.geometry.attributes.position, b = this.bannerBase;
      for (let i = 0; i < p.count; i++) p.setZ(i, b[i * 3 + 2] + Math.sin(b[i * 3] * 0.5 + t * 1.6) * 0.12 + Math.sin(b[i * 3 + 1] * 0.9 + t * 2.1) * 0.05);
      p.needsUpdate = true;
    }
  }
  setQuality(q) { }
}
