/* Prosedürel karakter ve sahne çizimleri (vektör, her çözünürlükte keskin).
 * Tüm karakter fonksiyonları birim yarıçapta (r = 1) çizer; çağıran ölçekler.
 */
(function (root) {
  var TAU = Math.PI * 2;

  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }

  function radial(ctx, stops, fx, fy, r) {
    var g = ctx.createRadialGradient(fx == null ? -0.35 : fx, fy == null ? -0.45 : fy, 0.04, 0, 0, r || 1.05);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  function linear(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  function roundPoly(ctx, pts, rad) {
    var n = pts.length;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      var m0x = (p0.x + p1.x) / 2, m0y = (p0.y + p1.y) / 2;
      if (i === 0) ctx.moveTo(m0x, m0y);
      ctx.arcTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, rad);
    }
    ctx.closePath();
  }

  // ---------- Gözler ----------
  function eye(ctx, x, y, rx, ry, st, lidColor, opts) {
    opts = opts || {};
    var look = st.look || { x: 0, y: 0 };
    if (st.hurt) {
      // Sıkılmış gözler: > <
      ctx.strokeStyle = '#1a0a0a';
      ctx.lineWidth = 0.075;
      ctx.lineCap = 'round';
      ctx.beginPath();
      var s = opts.side || 1;
      ctx.moveTo(x - rx * 0.8 * s, y - ry * 0.6);
      ctx.lineTo(x + rx * 0.5 * s, y);
      ctx.lineTo(x - rx * 0.8 * s, y + ry * 0.6);
      ctx.stroke();
      return;
    }
    ell(ctx, x, y, rx, ry);
    ctx.fillStyle = linear(ctx, x, y - ry, x, y + ry, [[0, '#ffffff'], [0.7, '#f4f4f4'], [1, '#c9ccd4']]);
    ctx.fill();
    ctx.lineWidth = 0.045;
    ctx.strokeStyle = 'rgba(20,10,10,0.85)';
    ctx.stroke();
    var pr = opts.pupil || rx * 0.46;
    var px = x + look.x * rx * 0.42, py = y + look.y * ry * 0.38;
    ctx.save();
    ell(ctx, x, y, rx, ry); ctx.clip();
    ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU);
    ctx.fillStyle = opts.iris || '#111';
    ctx.fill();
    ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.33, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    // Göz kapağı (kırpma)
    var bl = st.blink || 0;
    if (opts.lid) bl = Math.max(bl, opts.lid);
    if (bl > 0.01) {
      ctx.fillStyle = lidColor;
      ctx.fillRect(x - rx - 0.1, y - ry - 0.1, rx * 2 + 0.2, (ry * 2 + 0.1) * bl + 0.05);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(x - rx, y - ry + (ry * 2) * bl);
      ctx.lineTo(x + rx, y - ry + (ry * 2) * bl);
      ctx.stroke();
    }
    ctx.restore();
  }

  function feather(ctx, x, y, ang, len, wid, fill, stroke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.5, wid, 0, 0);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  }

  function beak(ctx, st, ox, oy, len, h, colors) {
    var mouth = st.mouth || 0;
    colors = colors || ['#ffe067', '#f7a414', '#c46a00'];
    // Ağız içi
    if (mouth > 0.05) {
      ctx.beginPath();
      ctx.moveTo(ox + 0.02, oy + h * 0.5);
      ctx.lineTo(ox + len * 0.85, oy + h * 0.55);
      ctx.lineTo(ox + len * 0.5, oy + h * (0.8 + mouth * 1.1));
      ctx.closePath();
      ctx.fillStyle = '#5a0d12';
      ctx.fill();
    }
    // Alt gaga
    ctx.save();
    ctx.translate(ox + 0.04, oy + h * 0.52);
    ctx.rotate(mouth * 0.55);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.55, 0.02, len * 0.82, 0.02);
    ctx.quadraticCurveTo(len * 0.5, h * 0.55, len * 0.18, h * 0.42);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 0, 0, h * 0.5, [[0, colors[1]], [1, colors[2]]]);
    ctx.fill();
    ctx.lineWidth = 0.045; ctx.strokeStyle = '#6b3500'; ctx.stroke();
    ctx.restore();
    // Üst gaga
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo(ox + len * 0.6, oy - h * 0.12, ox + len, oy + h * 0.55);
    ctx.quadraticCurveTo(ox + len * 0.5, oy + h * 0.62, ox + 0.02, oy + h * 0.55);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, ox, oy, ox, oy + h * 0.6, [[0, colors[0]], [0.6, colors[1]], [1, colors[2]]]);
    ctx.fill();
    ctx.lineWidth = 0.045; ctx.strokeStyle = '#6b3500'; ctx.stroke();
    // Parlama
    ell(ctx, ox + len * 0.35, oy + h * 0.14, len * 0.18, h * 0.07, -0.1);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }

  function brow(ctx, pts, color) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = color;
    ctx.fill();
    ctx.stroke();
  }

  function specular(ctx, x, y, rx, ry, rot, a) {
    ell(ctx, x, y, rx, ry, rot);
    ctx.fillStyle = 'rgba(255,255,255,' + (a || 0.4) + ')';
    ctx.fill();
  }

  // ---------- Kuşlar ----------
  var BIRD_COL = {
    red: { hi: '#ff7a64', mid: '#e3261d', lo: '#8f0c10', line: '#3d0508' },
    yellow: { hi: '#fff27a', mid: '#ffcf1f', lo: '#c98600', line: '#5a3a00' },
    blue: { hi: '#a8e6ff', mid: '#3aa7ea', lo: '#1a5ea8', line: '#0b2a55' },
    black: { hi: '#6d6f7c', mid: '#2e2f38', lo: '#101116', line: '#000000' }
  };

  function drawRed(ctx, st) {
    var c = BIRD_COL.red;
    // Kuyruk
    feather(ctx, -0.78, 0.12, Math.PI - 0.35, 0.62, 0.16, '#2b0f10', '#120404');
    feather(ctx, -0.8, 0.2, Math.PI - 0.05, 0.68, 0.16, '#3a1416', '#120404');
    feather(ctx, -0.76, 0.3, Math.PI + 0.25, 0.58, 0.15, '#2b0f10', '#120404');
    // Tepe tüyleri
    feather(ctx, 0.0, -0.9, -Math.PI / 2 - 0.55, 0.5, 0.17, c.mid, c.line);
    feather(ctx, 0.12, -0.92, -Math.PI / 2 - 0.2, 0.44, 0.15, c.mid, c.line);
    // Gövde
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.fillStyle = radial(ctx, [[0, c.hi], [0.5, c.mid], [1, c.lo]]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Göbek
    ell(ctx, 0.22, 0.72, 0.8, 0.5);
    ctx.fillStyle = linear(ctx, 0, 0.3, 0, 1.1, [[0, '#fbe6c4'], [1, '#d6ac7d']]);
    ctx.fill();
    // Kenar gölgesi
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.fillStyle = radial(ctx, [[0.7, 'rgba(60,0,0,0)'], [1, 'rgba(60,0,0,0.45)']], 0, 0, 1);
    ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.lineWidth = 0.06; ctx.strokeStyle = c.line; ctx.stroke();
    // Gözler
    eye(ctx, 0.2, -0.14, 0.21, 0.25, st, c.mid, { side: 1 });
    eye(ctx, 0.6, -0.1, 0.2, 0.24, st, c.mid, { side: -1 });
    // Kaş (tek, V şeklinde)
    brow(ctx, [-0.12, -0.52, 0.4, -0.27, 0.9, -0.5, 0.92, -0.35, 0.4, -0.12, -0.1, -0.37], '#1c0607');
    // Gaga
    beak(ctx, st, 0.3, 0.04, 0.78, 0.46);
    specular(ctx, -0.38, -0.52, 0.3, 0.16, -0.6, 0.45);
  }

  function drawYellow(ctx, st) {
    var c = BIRD_COL.yellow;
    var pts = [{ x: -1.05, y: 0.82 }, { x: 1.08, y: 0.82 }, { x: -0.1, y: -1.12 }];
    // Tepe tüyü
    feather(ctx, -0.12, -0.74, -Math.PI / 2 - 0.9, 0.6, 0.14, '#231a00', '#000');
    feather(ctx, -0.08, -0.76, -Math.PI / 2 - 0.5, 0.65, 0.14, '#352700', '#000');
    // Kuyruk
    feather(ctx, -0.72, 0.5, Math.PI - 0.1, 0.55, 0.14, '#231a00', '#000');
    feather(ctx, -0.72, 0.64, Math.PI + 0.25, 0.5, 0.13, '#231a00', '#000');
    roundPoly(ctx, pts, 0.32);
    ctx.fillStyle = radial(ctx, [[0, c.hi], [0.55, c.mid], [1, c.lo]], -0.3, -0.25, 1.2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ell(ctx, 0.1, 0.95, 1.1, 0.42);
    ctx.fillStyle = linear(ctx, 0, 0.5, 0, 1, [[0, '#fff6c9'], [1, '#e8c77a']]);
    ctx.fill();
    roundPoly(ctx, pts, 0.32);
    ctx.fillStyle = radial(ctx, [[0.65, 'rgba(90,50,0,0)'], [1, 'rgba(90,50,0,0.4)']], 0, 0.1, 1.15);
    ctx.fill();
    ctx.restore();
    roundPoly(ctx, pts, 0.32);
    ctx.lineWidth = 0.06; ctx.strokeStyle = c.line; ctx.stroke();
    eye(ctx, 0.0, 0.02, 0.2, 0.24, st, c.mid, { side: 1 });
    eye(ctx, 0.38, 0.05, 0.19, 0.23, st, c.mid, { side: -1 });
    brow(ctx, [-0.28, -0.3, 0.2, -0.12, 0.62, -0.28, 0.64, -0.14, 0.2, 0.04, -0.26, -0.16], '#2a1c00');
    beak(ctx, st, 0.28, 0.2, 0.95, 0.4);
    specular(ctx, -0.25, -0.35, 0.22, 0.12, -1.0, 0.5);
  }

  function drawBlue(ctx, st) {
    var c = BIRD_COL.blue;
    feather(ctx, -0.05, -0.9, -Math.PI / 2 - 0.6, 0.55, 0.16, '#123a6a', '#061a33');
    feather(ctx, 0.08, -0.94, -Math.PI / 2 - 0.25, 0.48, 0.15, '#1a4f8c', '#061a33');
    feather(ctx, -0.82, 0.2, Math.PI - 0.1, 0.5, 0.14, '#123a6a', '#061a33');
    feather(ctx, -0.8, 0.34, Math.PI + 0.3, 0.44, 0.13, '#123a6a', '#061a33');
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.fillStyle = radial(ctx, [[0, c.hi], [0.55, c.mid], [1, c.lo]]);
    ctx.fill();
    ctx.save(); ctx.clip();
    ell(ctx, 0.2, 0.75, 0.78, 0.48);
    ctx.fillStyle = linear(ctx, 0, 0.3, 0, 1.1, [[0, '#e6f7ff'], [1, '#a8d4ee']]);
    ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.fillStyle = radial(ctx, [[0.7, 'rgba(0,20,60,0)'], [1, 'rgba(0,20,60,0.45)']], 0, 0, 1);
    ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.lineWidth = 0.07; ctx.strokeStyle = c.line; ctx.stroke();
    eye(ctx, 0.14, -0.15, 0.25, 0.29, st, c.mid, { side: 1 });
    eye(ctx, 0.62, -0.1, 0.23, 0.27, st, c.mid, { side: -1 });
    brow(ctx, [-0.12, -0.54, 0.38, -0.36, 0.86, -0.52, 0.88, -0.4, 0.38, -0.22, -0.1, -0.42], '#08203f');
    beak(ctx, st, 0.36, 0.14, 0.6, 0.38);
    specular(ctx, -0.36, -0.5, 0.28, 0.15, -0.6, 0.5);
  }

  function drawBlack(ctx, st) {
    var c = BIRD_COL.black;
    var t = st.t || 0;
    // Fitil
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.13;
    ctx.beginPath(); ctx.moveTo(0.05, -0.92); ctx.quadraticCurveTo(0.05, -1.3, 0.3, -1.38); ctx.stroke();
    ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(0.02, -0.95); ctx.quadraticCurveTo(0.02, -1.28, 0.27, -1.36); ctx.stroke();
    ctx.restore();
    // Fitil başlığı (altın halka)
    ell(ctx, 0.05, -0.93, 0.2, 0.09);
    ctx.fillStyle = linear(ctx, -0.15, -1, 0.25, -0.85, [[0, '#fff3a1'], [0.5, '#e7b322'], [1, '#8a5c00']]);
    ctx.fill(); ctx.lineWidth = 0.035; ctx.strokeStyle = '#4a3000'; ctx.stroke();
    if (st.fuse) {
      var fl = 0.12 + Math.sin(t * 40) * 0.04;
      var g = ctx.createRadialGradient(0.3, -1.38, 0, 0.3, -1.38, 0.45);
      g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(255,190,40,0.9)'); g.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0.3, -1.38, 0.45 + fl, 0, TAU); ctx.fill();
    }
    feather(ctx, -0.84, 0.2, Math.PI - 0.15, 0.5, 0.16, '#16161b', '#000');
    feather(ctx, -0.82, 0.34, Math.PI + 0.25, 0.46, 0.14, '#16161b', '#000');
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.fillStyle = radial(ctx, [[0, c.hi], [0.5, c.mid], [1, c.lo]]);
    ctx.fill();
    ctx.save(); ctx.clip();
    if (st.fuse) {
      var a = 0.25 + 0.25 * Math.sin(t * 22);
      ctx.fillStyle = 'rgba(255,40,20,' + a + ')';
      ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    }
    ell(ctx, 0.25, 0.8, 0.7, 0.4);
    ctx.fillStyle = 'rgba(120,120,135,0.35)';
    ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.lineWidth = 0.06; ctx.strokeStyle = '#000'; ctx.stroke();
    eye(ctx, 0.2, -0.16, 0.21, 0.25, st, c.mid, { side: 1, iris: '#1a0000' });
    eye(ctx, 0.6, -0.12, 0.2, 0.24, st, c.mid, { side: -1, iris: '#1a0000' });
    brow(ctx, [-0.12, -0.55, 0.4, -0.3, 0.9, -0.52, 0.92, -0.36, 0.4, -0.14, -0.1, -0.4], '#6e6f7a');
    beak(ctx, st, 0.34, 0.08, 0.66, 0.4);
    specular(ctx, -0.36, -0.5, 0.3, 0.16, -0.6, 0.3);
  }

  var BIRD_FN = { red: drawRed, yellow: drawYellow, blue: drawBlue, black: drawBlack };

  function drawBird(ctx, type, r, st) {
    ctx.save();
    ctx.scale(r, r);
    BIRD_FN[type](ctx, st || {});
    ctx.restore();
  }

  // ---------- Domuzlar ----------
  function drawPig(ctx, type, r, st) {
    st = st || {};
    var hp = st.hp == null ? 1 : st.hp;
    var t = st.t || 0;
    ctx.save();
    ctx.scale(r, r);
    var breathe = 1 + Math.sin(t * 2.2 + (st.seed || 0) * 10) * 0.018;
    var laugh = st.laugh ? Math.abs(Math.sin(t * 16)) * 0.06 : 0;
    ctx.scale(1 + laugh * 0.5, breathe - laugh);
    var line = '#24500b';
    // Kulaklar
    for (var s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.translate(s * 0.6, -0.78);
      ctx.rotate(s * 0.55);
      ctx.beginPath();
      ctx.moveTo(-0.26, 0.16); ctx.quadraticCurveTo(0, -0.62, 0.26, 0.16); ctx.closePath();
      ctx.fillStyle = '#7fcc34'; ctx.fill();
      ctx.lineWidth = 0.05; ctx.strokeStyle = line; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.13, 0.1); ctx.quadraticCurveTo(0, -0.36, 0.13, 0.1); ctx.closePath();
      ctx.fillStyle = '#4e9a1c'; ctx.fill();
      ctx.restore();
    }
    // Gövde
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.fillStyle = radial(ctx, [[0, '#d4fa84'], [0.5, '#8ad63c'], [1, '#3f8a14']]);
    ctx.fill();
    ctx.save(); ctx.clip();
    // Benekler
    var sd = st.seed || 0.3;
    ctx.fillStyle = 'rgba(40,110,10,0.22)';
    ell(ctx, -0.55 + sd * 0.2, 0.35, 0.18, 0.12, 0.4); ctx.fill();
    ell(ctx, 0.6, 0.5 - sd * 0.2, 0.13, 0.1, -0.3); ctx.fill();
    ell(ctx, 0.3 - sd * 0.3, -0.72, 0.12, 0.08, 0.2); ctx.fill();
    // Hasar: morluklar
    if (hp < 0.7) {
      ctx.fillStyle = 'rgba(110,60,140,0.45)';
      ell(ctx, -0.45, -0.05, 0.22, 0.16, 0.3); ctx.fill();
    }
    if (hp < 0.4) {
      ctx.fillStyle = 'rgba(90,40,120,0.5)';
      ell(ctx, 0.55, 0.3, 0.2, 0.14, -0.4); ctx.fill();
      ell(ctx, 0.1, -0.62, 0.16, 0.1, 0); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.fillStyle = radial(ctx, [[0.72, 'rgba(10,40,0,0)'], [1, 'rgba(10,40,0,0.4)']], 0, 0, 1);
    ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.lineWidth = 0.055; ctx.strokeStyle = line; ctx.stroke();

    // Gözler
    var eopts = { pupil: 0.085 };
    if (hp < 0.4) {
      // Morarmış göz halkası
      ell(ctx, 0.4, -0.28, 0.27, 0.28);
      ctx.fillStyle = 'rgba(60,30,80,0.55)'; ctx.fill();
    }
    var est = { look: st.look, blink: st.blink, hurt: st.hurt };
    eye(ctx, -0.4, -0.28, 0.2, 0.22, est, '#8ad63c', { pupil: 0.085, side: 1 });
    eye(ctx, 0.4, -0.28, 0.2, 0.22, est, '#8ad63c', { pupil: 0.085, side: -1, lid: hp < 0.4 ? 0.35 : 0 });
    // Kaşlar
    ctx.strokeStyle = '#2d5e0f'; ctx.lineWidth = 0.08; ctx.lineCap = 'round';
    ctx.beginPath();
    var bu = st.scared ? -0.1 : 0;
    ctx.moveTo(-0.62, -0.56 + bu); ctx.lineTo(-0.2, -0.52 - bu * 0.5);
    ctx.moveTo(0.62, -0.56 + bu); ctx.lineTo(0.2, -0.52 - bu * 0.5);
    ctx.stroke();

    // Burun
    ell(ctx, 0, 0.12, 0.4, 0.29);
    ctx.fillStyle = radial(ctx, [[0, '#e2ffa8'], [0.6, '#a6e45a'], [1, '#6fb52c']], -0.1, 0.02, 0.45);
    ctx.fill();
    ctx.lineWidth = 0.05; ctx.strokeStyle = line; ctx.stroke();
    ctx.fillStyle = '#1f4a08';
    ell(ctx, -0.14, 0.13, 0.07, 0.11, 0.15); ctx.fill();
    ell(ctx, 0.14, 0.13, 0.07, 0.11, -0.15); ctx.fill();
    specular(ctx, -0.12, 0.0, 0.14, 0.05, 0, 0.5);

    // Ağız
    ctx.lineCap = 'round';
    if (st.scared || st.hurt) {
      ell(ctx, 0.05, 0.58, 0.13, 0.11);
      ctx.fillStyle = '#2a1010'; ctx.fill();
    } else if (st.laugh) {
      ctx.beginPath();
      ctx.moveTo(-0.3, 0.5); ctx.quadraticCurveTo(0, 0.85, 0.3, 0.5); ctx.closePath();
      ctx.fillStyle = '#2a1010'; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-0.18, 0.5, 0.12, 0.08); ctx.fillRect(0.04, 0.5, 0.12, 0.08);
    } else {
      ctx.strokeStyle = '#1f4a08'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(-0.26, 0.54); ctx.quadraticCurveTo(0, 0.7, 0.28, 0.52); ctx.stroke();
      if (hp >= 0.4) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0.06, 0.56, 0.1, 0.08);
      }
    }
    specular(ctx, -0.42, -0.62, 0.26, 0.12, -0.5, 0.4);

    // Kask
    if (type === 'helmet') {
      ctx.save();
      ctx.translate(0, -0.3);
      ctx.scale(0.96, 0.9);
      ctx.beginPath();
      ctx.arc(0, -0.08, 1.1, Math.PI + 0.12, TAU - 0.12);
      ctx.quadraticCurveTo(1.12, -0.18, 0.95, -0.2);
      ctx.lineTo(-0.95, -0.2);
      ctx.quadraticCurveTo(-1.12, -0.18, -1.09, -0.21);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, -1, -1.1, 0.8, 0, [[0, '#f4f7fa'], [0.35, '#b9c2cc'], [0.75, '#7d8894'], [1, '#4d5661']]);
      ctx.fill();
      ctx.lineWidth = 0.06; ctx.strokeStyle = '#2a3038'; ctx.stroke();
      // Kenar bandı
      ctx.fillStyle = linear(ctx, 0, -0.34, 0, -0.14, [[0, '#9aa4ae'], [1, '#56606b']]);
      roundPoly(ctx, [{ x: -1.12, y: -0.36 }, { x: 1.12, y: -0.36 }, { x: 1.12, y: -0.14 }, { x: -1.12, y: -0.14 }], 0.08);
      ctx.fill(); ctx.stroke();
      // Perçinler
      for (var k = -3; k <= 3; k++) {
        ctx.beginPath(); ctx.arc(k * 0.3, -0.25, 0.045, 0, TAU);
        ctx.fillStyle = '#e8edf2'; ctx.fill();
        ctx.lineWidth = 0.02; ctx.stroke();
      }
      specular(ctx, -0.45, -0.85, 0.3, 0.1, -0.35, 0.7);
      if (hp < 0.6) {
        ctx.strokeStyle = '#2a3038'; ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(0.3, -1.05); ctx.lineTo(0.2, -0.8); ctx.lineTo(0.35, -0.65); ctx.lineTo(0.25, -0.4); ctx.stroke();
      }
      ctx.restore();
    }
    // Kral tacı ve bıyık
    if (type === 'king') {
      ctx.save();
      ctx.translate(0, -0.95);
      var cp = [{ x: -0.55, y: 0.2 }, { x: -0.62, y: -0.42 }, { x: -0.3, y: -0.12 }, { x: 0, y: -0.55 }, { x: 0.3, y: -0.12 }, { x: 0.62, y: -0.42 }, { x: 0.55, y: 0.2 }];
      roundPoly(ctx, cp, 0.05);
      ctx.fillStyle = linear(ctx, -0.6, -0.5, 0.6, 0.2, [[0, '#fff6b0'], [0.4, '#ffc928'], [1, '#b87800']]);
      ctx.fill();
      ctx.lineWidth = 0.05; ctx.strokeStyle = '#6b4300'; ctx.stroke();
      ctx.fillStyle = '#e8b21f';
      ctx.fillRect(-0.56, 0.05, 1.12, 0.16);
      ctx.strokeRect(-0.56, 0.05, 1.12, 0.16);
      var gems = [[-0.3, 0.13, '#e0203a'], [0, 0.13, '#2f7dff'], [0.3, 0.13, '#e0203a']];
      for (var g = 0; g < gems.length; g++) {
        ctx.beginPath(); ctx.arc(gems[g][0], gems[g][1], 0.06, 0, TAU);
        ctx.fillStyle = gems[g][2]; ctx.fill();
        ctx.lineWidth = 0.02; ctx.stroke();
      }
      [[-0.62, -0.42], [0, -0.55], [0.62, -0.42]].forEach(function (q) {
        ctx.beginPath(); ctx.arc(q[0], q[1], 0.07, 0, TAU);
        ctx.fillStyle = '#fff3a0'; ctx.fill(); ctx.lineWidth = 0.02; ctx.stroke();
      });
      specular(ctx, -0.25, -0.12, 0.2, 0.05, -0.3, 0.6);
      ctx.restore();
      // Bıyık
      ctx.fillStyle = '#6b4a1e'; ctx.strokeStyle = '#3a2508'; ctx.lineWidth = 0.035;
      for (var m = -1; m <= 1; m += 2) {
        ctx.beginPath();
        ctx.moveTo(0.02 * m, 0.4);
        ctx.quadraticCurveTo(0.35 * m, 0.32, 0.55 * m, 0.52);
        ctx.quadraticCurveTo(0.62 * m, 0.32, 0.72 * m, 0.4);
        ctx.quadraticCurveTo(0.6 * m, 0.62, 0.3 * m, 0.52);
        ctx.quadraticCurveTo(0.12 * m, 0.5, 0.02 * m, 0.48);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------- Sapan ----------
  var SL = {
    backTop: { x: -19, y: -130 }, frontTop: { x: 17, y: -128 },
    backBand: { x: -16, y: -121 }, frontBand: { x: 14, y: -119 }
  };

  function woodStroke(ctx, x0, y0, x1, y1, w0, w1, dark) {
    var ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
    ctx.save();
    ctx.translate(x0, y0); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -w0 / 2);
    ctx.lineTo(len, -w1 / 2);
    ctx.arc(len, 0, w1 / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, w0 / 2);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, -w0 / 2, 0, w0 / 2, dark
      ? [[0, '#6b4222'], [0.4, '#4e2e14'], [1, '#2a170a']]
      : [[0, '#c68a4e'], [0.35, '#9a6232'], [1, '#4f2e14']]);
    ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#2a1608'; ctx.stroke();
    // Kabuk çizgileri
    ctx.strokeStyle = 'rgba(40,20,5,0.45)'; ctx.lineWidth = 1;
    for (var i = 0.15; i < 0.95; i += 0.22) {
      ctx.beginPath();
      ctx.moveTo(len * i, -w0 * 0.25);
      ctx.quadraticCurveTo(len * (i + 0.06), 0, len * (i + 0.1), w0 * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function wrap(ctx, x, y, ang, w) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    for (var i = 0; i < 3; i++) {
      roundPoly(ctx, [{ x: -w / 2 - 1.5, y: i * 4.2 }, { x: w / 2 + 1.5, y: i * 4.2 - 1.5 }, { x: w / 2 + 1.5, y: i * 4.2 + 2.6 }, { x: -w / 2 - 1.5, y: i * 4.2 + 4 }], 1.2);
      ctx.fillStyle = linear(ctx, -w / 2, 0, w / 2, 0, [[0, '#3b2414'], [0.4, '#6d4527'], [1, '#2a180c']]);
      ctx.fill();
      ctx.lineWidth = 0.8; ctx.strokeStyle = '#1a0e05'; ctx.stroke();
    }
    ctx.restore();
  }

  function drawSlingBack(ctx) {
    // Arka kol
    woodStroke(ctx, -3, -72, SL.backTop.x, SL.backTop.y, 14, 11, true);
    wrap(ctx, -9, -104, -0.2, 12);
  }

  function drawSlingTrunk(ctx) {
    // Gövde
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-11, 2); ctx.quadraticCurveTo(-8, -40, -8, -70);
    ctx.quadraticCurveTo(0, -84, 8, -70);
    ctx.quadraticCurveTo(8, -40, 11, 2);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, -11, 0, 11, 0, [[0, '#c68a4e'], [0.4, '#9a6232'], [1, '#4f2e14']]);
    ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#2a1608'; ctx.stroke();
    ctx.strokeStyle = 'rgba(40,20,5,0.45)'; ctx.lineWidth = 1;
    for (var y = -10; y > -64; y -= 13) {
      ctx.beginPath(); ctx.moveTo(-6, y); ctx.quadraticCurveTo(0, y - 4, 5, y + 1); ctx.stroke();
    }
    // Budak
    ell(ctx, 2, -36, 2.6, 3.6); ctx.fillStyle = '#4a2a10'; ctx.fill();
    ctx.restore();
    wrap(ctx, 0, -66, 0, 16);
  }

  function drawSlingFront(ctx) {
    woodStroke(ctx, 3, -72, SL.frontTop.x, SL.frontTop.y, 14, 11, false);
    wrap(ctx, 9, -104, 0.2, 12);
  }

  function band(ctx, x0, y0, x1, y1, stretch) {
    var w = Math.max(3.2, 7.5 - stretch * 0.045);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e0f07'; ctx.lineWidth = w + 2.2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#5a2f17'; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,190,140,0.25)'; ctx.lineWidth = w * 0.3;
    ctx.beginPath(); ctx.moveTo(x0, y0 - w * 0.2); ctx.lineTo(x1, y1 - w * 0.2); ctx.stroke();
    ctx.restore();
  }

  function pouch(ctx, x, y, ang, r) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    roundPoly(ctx, [{ x: -r * 0.45, y: -r * 0.95 }, { x: r * 0.25, y: -r * 0.8 }, { x: r * 0.25, y: r * 0.8 }, { x: -r * 0.45, y: r * 0.95 }], r * 0.3);
    ctx.fillStyle = linear(ctx, -r * 0.5, 0, r * 0.3, 0, [[0, '#2a150a'], [0.6, '#5a3319'], [1, '#3a200e']]);
    ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#140a04'; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,180,0.25)'; ctx.setLineDash([2.5, 2.5]); ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.7); ctx.lineTo(-r * 0.3, r * 0.7); ctx.stroke();
    ctx.restore();
  }

  // ---------- Tüy parçacığı ----------
  function drawFeather(ctx, color, size) {
    ctx.save();
    ctx.scale(size, size);
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.quadraticCurveTo(0, -0.55, 1, 0);
    ctx.quadraticCurveTo(0, 0.55, -1, 0);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.moveTo(-1.1, 0); ctx.lineTo(0.9, 0); ctx.stroke();
    ctx.restore();
  }

  // ---------- Zemin dokuları ----------
  function noise(seed) {
    var s = seed || 1;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function makeGround(theme) {
    var W = 512, H = 360, rnd = noise(theme.seed || 7);
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, theme.dirt[0]); grd.addColorStop(0.35, theme.dirt[1]); grd.addColorStop(1, theme.dirt[2]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // Katmanlar
    for (var l = 0; l < 4; l++) {
      g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 6;
      g.beginPath();
      var yy = 70 + l * 70;
      for (var x = 0; x <= W; x += 16) g.lineTo(x, yy + Math.sin((x / W) * Math.PI * 2 * (l + 1)) * 8);
      g.stroke();
    }
    // Çakıllar
    for (var i = 0; i < 90; i++) {
      var px = rnd() * W, py = 30 + rnd() * (H - 30), pr = 2 + rnd() * 6;
      function peb(ox) {
        g.beginPath(); g.ellipse(px + ox, py, pr * 1.3, pr, rnd() * 3, 0, TAU);
        g.fillStyle = theme.pebble[Math.floor(rnd() * theme.pebble.length)]; g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath(); g.ellipse(px + ox - pr * 0.3, py - pr * 0.35, pr * 0.5, pr * 0.3, 0, 0, TAU); g.fill();
      }
      peb(0); if (px < 10) peb(W); if (px > W - 10) peb(-W);
    }
    // Benekler
    for (i = 0; i < 1400; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
      g.fillRect(rnd() * W, rnd() * H, 2, 2);
    }

    // Çim / kum sınırı
    var e = document.createElement('canvas'); e.width = W; e.height = 64;
    var eg = e.getContext('2d');
    var top = 18;
    eg.fillStyle = linear(eg, 0, top, 0, 44, [[0, theme.edge[0]], [1, theme.edge[1]]]);
    eg.beginPath(); eg.moveTo(0, 44);
    for (x = 0; x <= W; x += 8) eg.lineTo(x, top + Math.sin((x / W) * TAU * 4) * 2);
    eg.lineTo(W, 44);
    // Alt kenar dalgalı
    for (x = W; x >= 0; x -= 16) eg.lineTo(x, 40 + Math.sin((x / W) * TAU * 8) * 4 + 4);
    eg.closePath(); eg.fill();
    if (theme.blades) {
      for (i = 0; i < 260; i++) {
        var bx = rnd() * W, bh = 6 + rnd() * 14, lean = (rnd() - 0.5) * 8;
        var col = theme.blades[Math.floor(rnd() * theme.blades.length)];
        for (var rep = -1; rep <= 1; rep++) {
          var xx = bx + rep * W;
          if (xx < -20 || xx > W + 20) continue;
          eg.beginPath();
          eg.moveTo(xx - 2.2, top + 6);
          eg.quadraticCurveTo(xx + lean * 0.3, top - bh * 0.5, xx + lean, top - bh + 6);
          eg.quadraticCurveTo(xx + lean * 0.2 + 1, top - bh * 0.4, xx + 2.2, top + 6);
          eg.fillStyle = col; eg.fill();
        }
      }
    }
    // Üst parlaklık
    eg.fillStyle = 'rgba(255,255,255,0.2)';
    eg.fillRect(0, top + 1, W, 2);
    return { dirt: c, edge: e };
  }

  root.Art = {
    drawBird: drawBird, drawPig: drawPig, drawSlingBack: drawSlingBack, drawSlingTrunk: drawSlingTrunk,
    drawSlingFront: drawSlingFront, band: band, pouch: pouch, SL: SL, drawFeather: drawFeather,
    makeGround: makeGround, BIRD_COL: BIRD_COL, roundPoly: roundPoly, ell: ell
  };
})(window);
