// Sahne oluşturucu: Node tarafı mountScene(spec) ile sahneyi kurar, her kare için seek(t) çağırır ve
// ekran görüntüsü alır. Bütün animasyonlar yalnızca t'ye bağlıdır (CSS geçişi yok), bu yüzden her kare
// tekrarlanabilir. seek() görünümün durum anahtarını döndürür; değişmeyen kareler yeniden çekilmez.

(() => {
  const W = 1680; // tarayıcı penceresi iç genişliği
  const H = 945;
  const F = W / 1920; // ekran görüntüsü → pencere ölçeği

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const eOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const eInOut = (t) => {
    t = clamp(t);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  const lerp = (a, b, p) => a + (b - a) * p;
  const r2 = (x) => Math.round(x * 100) / 100;

  let key = [];
  const set = (el, prop, val) => {
    if (el.style[prop] !== val) el.style[prop] = val;
    key.push(val);
  };
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const ICONS = {
    tip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V17h5v-1.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>',
    stat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 6-6M16 8h4v4"/></svg>',
  };
  const CURSOR = '<svg viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6 4 7.4-3 1.5-4-7.4L4 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  let update = () => {};

  window.mountScene = (spec) => {
    const root = document.getElementById('root');
    root.innerHTML = '';
    const b = spec.brand;
    const css = document.documentElement.style;
    css.setProperty('--accent', b.accent);
    css.setProperty('--accent2', b.accent2);
    css.setProperty('--bg', b.background);
    css.setProperty('--text', b.text);
    css.setProperty('--font', `'${b.font}', 'Inter', 'DejaVu Sans', sans-serif`);

    const v = spec.visual;
    const D = spec.duration;
    const stage = el('div', 'layer');
    root.appendChild(stage);

    if (v.type !== 'outro' && v.type !== 'title') {
      const chip = el('div', 'chip', `<span class="dot"></span><span class="chan">${esc(spec.channel)}</span>${spec.chapter ? `<span class="chap">${esc(spec.chapter)}</span>` : ''}`);
      root.appendChild(chip);
    }

    // Sahne girişi/çıkışı: arka plan sabit kaldığı için sahneler arası geçiş yumuşak görünür.
    const envelope = (t) => eOut(t / 0.35) * (1 - eOut((t - (D - 0.22)) / 0.22));
    const builders = { title, bullets, steps, compare, code, callout, outro, browser };
    const inner = (builders[v.type] || title)(stage, v, spec);
    update = (t) => {
      set(stage, 'opacity', String(r2(envelope(t))));
      inner(t);
    };
    return true;
  };

  window.seek = (t) => {
    key = [];
    update(t);
    return key.join('|');
  };

  function title(stage, v) {
    const wrap = el('div', 'title-wrap');
    const h = el('div', 'title-h', v.heading.split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(''));
    const bar = el('div', 'title-bar');
    const sub = el('div', 'title-sub', esc(v.sub || ''));
    wrap.append(h, bar, sub);
    stage.appendChild(wrap);
    const words = [...h.querySelectorAll('.w')];
    return (t) => {
      words.forEach((w, i) => {
        const e = eOut((t - 0.1 - i * 0.07) / 0.5);
        set(w, 'opacity', String(r2(e)));
        set(w, 'transform', `translateY(${Math.round((1 - e) * 60)}px)`);
      });
      set(bar, 'transform', `scaleX(${r2(eOut((t - 0.35) / 0.6))})`);
      set(sub, 'opacity', String(r2(eOut((t - 0.6) / 0.5))));
    };
  }

  /** Sırayla belirme; bir sonraki öğe gelince öncekiler hafifçe söner. */
  function revealer(items, reveals, from = 'translateX(-40px)') {
    return (t) => {
      items.forEach((it, i) => {
        const e = eOut((t - reveals[i]) / 0.45);
        const next = reveals[i + 1];
        const dim = next === undefined ? 0 : eOut((t - next) / 0.45) * 0.4;
        set(it, 'opacity', String(r2(e * (1 - dim))));
        set(it, 'transform', e >= 1 ? 'none' : from.replace(/-?\d+px/, (m) => `${Math.round(parseFloat(m) * (1 - e))}px`));
      });
    };
  }

  /** Başlık + içerik bloğu ekranda dikey ortalanır. */
  function panel(stage) {
    const p = el('div', 'panel');
    stage.appendChild(p);
    return p;
  }

  function heading(stage, text) {
    const h = el('div', 'h2', esc(text));
    stage.appendChild(h);
    return (t) => {
      const e = eOut(t / 0.5);
      set(h, 'transform', `translateY(${Math.round((1 - e) * 30)}px)`);
    };
  }

  function bullets(root, v, spec) {
    const stage = panel(root);
    const hu = heading(stage, v.heading);
    const list = el('div', 'list');
    const items = v.items.map((txt) => el('div', 'item', `<span class="mark"></span><span>${esc(txt)}</span>`));
    list.append(...items);
    stage.appendChild(list);
    const rv = revealer(items, spec.reveals);
    return (t) => {
      hu(t);
      rv(t);
    };
  }

  function steps(root, v, spec) {
    const stage = panel(root);
    const hu = heading(stage, v.heading);
    const list = el('div', 'list');
    list.style.gap = '40px';
    const items = v.steps.map((s, i) =>
      el('div', 'step', `<span class="num">${i + 1}</span><div><div class="txt">${esc(s.text)}</div>${s.detail ? `<div class="det">${esc(s.detail)}</div>` : ''}</div>`),
    );
    list.append(...items);
    stage.appendChild(list);
    const rv = revealer(items, spec.reveals, 'translateY(30px)');
    return (t) => {
      hu(t);
      rv(t);
    };
  }

  function compare(root, v, spec) {
    const stage = panel(root);
    stage.style.gap = '40px';
    const hu = heading(stage, v.heading);
    const table = el('table');
    const head = el('tr', '', `<th></th>${v.columns.map((c) => `<th>${esc(c)}</th>`).join('')}`);
    table.appendChild(head);
    const rows = v.rows.map((r) => el('tr', '', `<td>${esc(r.label)}</td>${r.values.map((x) => `<td>${esc(x)}</td>`).join('')}`));
    table.append(...rows);
    stage.appendChild(table);
    const rv = revealer(rows, spec.reveals, 'translateY(24px)');
    return (t) => {
      hu(t);
      set(head, 'opacity', String(r2(eOut((t - 0.2) / 0.4))));
      rv(t);
    };
  }

  function code(stage, v, spec) {
    if (v.heading) stage.appendChild(el('div', 'h2 editor-h', esc(v.heading)));
    const ed = el('div', 'editor', `<div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span class="lang">${esc(v.language)}</span></div>`);
    if (!v.heading) ed.style.top = '160px';
    const pre = el('pre');
    const txt = document.createTextNode('');
    const caret = el('span', 'caret');
    pre.append(txt, caret);
    ed.appendChild(pre);
    stage.appendChild(ed);
    const total = v.code.length;
    const t0 = spec.audioOffset + 0.2;
    const span = Math.max(1.2, spec.audioDuration * 0.6);
    return (t) => {
      const n = Math.floor(total * clamp((t - t0) / span));
      const s = v.code.slice(0, n);
      if (txt.data !== s) txt.data = s;
      key.push(String(n));
      const blinkOn = n < total || Math.floor(t * 2) % 2 === 0;
      set(caret, 'opacity', blinkOn ? '1' : '0');
    };
  }

  function callout(stage, v) {
    const label = { tip: 'PRO TIP', warning: 'WATCH OUT', stat: 'KEY FACT' }[v.kind] || 'TIP';
    const card = el('div', 'callout', `${ICONS[v.kind] || ICONS.tip}<div><div class="k">${label}</div><div class="t">${esc(v.text)}</div></div>`);
    card.querySelector('svg').style.color = 'var(--accent)';
    stage.appendChild(card);
    const icon = card.querySelector('svg');
    return (t) => {
      const e = eOut(t / 0.5);
      set(card, 'transform', `translateY(-50%) scale(${r2(0.94 + 0.06 * e)})`);
      const p = eOut((t - 0.25) / 0.45);
      set(icon, 'transform', `scale(${r2(0.6 + 0.4 * p)}) rotate(${Math.round((1 - p) * -12)}deg)`);
    };
  }

  function outro(stage, v, spec) {
    const wrap = el('div', 'outro');
    const parts = [
      el('div', 'oh', esc(v.heading)),
      el('div', 'cta', esc(v.cta)),
      el('div', 'sub', 'SUBSCRIBE'),
      el('div', 'chan', esc(spec.channel)),
    ];
    wrap.append(...parts);
    stage.appendChild(wrap);
    return (t) => {
      parts.forEach((p, i) => {
        const e = eOut((t - 0.1 - i * 0.18) / 0.5);
        set(p, 'opacity', String(r2(e)));
        set(p, 'transform', `translateY(${Math.round((1 - e) * 40)}px) scale(${i === 2 ? r2(0.85 + 0.15 * e) : 1})`);
      });
    };
  }

  // ---------------------------------------------------------------------------
  // Görsel sahneleri (listicle) ffmpeg ile oluşturulur; buradan yalnızca yazı katmanları saydam PNG olarak alınır.

  /** Son kelimeyi vurgular: "UNTHINKABLE TODAY" → "UNTHINKABLE <b>TODAY</b>" */
  function accentLast(text) {
    const w = String(text).trim().split(/\s+/);
    if (w.length < 2) return `<b>${esc(text)}</b>`;
    const last = w.pop();
    return `${esc(w.join(' '))} <b>${esc(last)}</b>`;
  }

  /** Tek bir katmanı son (tam görünür) hâliyle saydam arka plan üzerinde çizer. */
  window.mountOverlay = (kind, spec) => {
    const b = spec.brand;
    const css = document.documentElement.style;
    css.setProperty('--accent', b.accent);
    css.setProperty('--font', `'${b.font}', 'Montserrat', 'DejaVu Sans', sans-serif`);
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.getElementById('bg').style.display = 'none';
    const root = document.getElementById('root');
    root.innerHTML = '';
    const v = spec.visual;
    if (kind === 'lt') root.appendChild(el('div', 'lt', `<div class="bar"><div class="num">#${v.number}</div><div class="ttl">${accentLast(v.heading)}</div></div>`));
    if (kind === 'chip') root.appendChild(el('div', 'numchip', `<b>#${v.number}</b>${spec.total ? ` / ${spec.total}` : ''}`));
    if (kind === 'title') root.appendChild(el('div', 'ovl-title', `<span>${accentLast(spec.videoTitle)}</span>`));
    if (kind === 'sub') root.appendChild(el('div', 'subpill', 'SUBSCRIBE'));
    return document.fonts.ready.then(() => true);
  };

  // ---------------------------------------------------------------------------
  // Tarayıcı sahnesi: ekran görüntüleri üzerinde kamera hareketi, vurgu, imleç ve tıklama.

  const WEIGHT = { show: 1, scroll: 1, highlight: 1.25, click: 0.9, after: 1 };

  /** (cx, cy) noktasını s ölçeğinde merkeze getiren, görüntü kenarlarını dışarıda bırakmayan dönüşüm. */
  function camera(s, cx, cy) {
    let tx = W / 2 - s * cx;
    let ty = H / 2 - s * cy;
    tx = clamp(tx, W - s * W, 0);
    ty = clamp(ty, H - s * H, 0);
    return { s, tx, ty };
  }

  function browser(stage, v, spec) {
    const win = el('div', 'win');
    let host = v.url;
    try {
      const u = new URL(v.url);
      host = u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
    } catch {}
    win.appendChild(el('div', 'bar', `<i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><div class="url">🔒&nbsp; ${esc(host)}</div>`));
    const vp = el('div', 'vp');
    win.appendChild(vp);
    stage.appendChild(win);

    const shots = spec.shots;
    const totalW = shots.reduce((n, s) => n + (WEIGHT[s.kind] || 1), 0);
    let acc = 0;
    const segs = shots.map((s) => {
      const start = (acc / totalW) * spec.duration;
      acc += WEIGHT[s.kind] || 1;
      return { ...s, start, end: (acc / totalW) * spec.duration };
    });

    const layers = segs.map((s) => {
      const layer = el('div', 'layer');
      const cam = el('div', 'cam');
      const img = el('img');
      img.src = s.src;
      cam.appendChild(img);
      let ring = null;
      if (s.box && (s.kind === 'highlight' || s.kind === 'click')) {
        ring = el('div', 'ring');
        const pad = 10;
        ring.style.left = `${s.box.x * F - pad}px`;
        ring.style.top = `${s.box.y * F - pad}px`;
        ring.style.width = `${s.box.w * F + pad * 2}px`;
        ring.style.height = `${s.box.h * F + pad * 2}px`;
        cam.appendChild(ring);
      }
      layer.appendChild(cam);
      vp.appendChild(layer);
      return { layer, cam, ring };
    });

    const cursor = el('div', 'cursor', CURSOR);
    const ripple = el('div', 'ripple');
    vp.append(cursor, ripple);
    const cap = el('div', 'cap');
    stage.appendChild(cap);

    return (t) => {
      let active = 0;
      segs.forEach((s, i) => {
        if (t >= s.start) active = i;
      });
      let cursorOn = false;
      let rippleOn = false;
      segs.forEach((s, i) => {
        const L = layers[i];
        const lt = t - s.start;
        const len = s.end - s.start;
        // görünürlük: aktif katman ve geçiş sırasında bir önceki
        const fadeIn = i === 0 ? 1 : eOut(lt / 0.3);
        const visible = i === active || (i === active - 1 && t - segs[active].start < 0.3);
        set(L.layer, 'opacity', visible ? String(r2(i === active ? fadeIn : 1)) : '0');
        set(L.layer, 'zIndex', String(i === active ? 2 : 1));
        if (!visible) return;

        let c;
        const p = clamp(lt / len);
        if ((s.kind === 'highlight' || s.kind === 'click') && s.box) {
          const bx = (s.box.x + s.box.w / 2) * F;
          const by = (s.box.y + s.box.h / 2) * F;
          const target = s.kind === 'click' ? 1.3 : clamp(Math.min((W * 0.5) / (s.box.w * F), (H * 0.42) / (s.box.h * F)), 1.35, 2.3);
          const zt = Math.min(0.8, len * 0.35);
          const e = eInOut((lt - 0.2) / zt);
          const sc = lerp(1, target, e);
          c = camera(sc, lerp(W / 2, bx, e), lerp(H / 2, by, e));
          if (L.ring) {
            const re = eOut((lt - 0.2 - zt * 0.7) / 0.35);
            set(L.ring, 'opacity', String(r2(re)));
            set(L.ring, 'borderWidth', `${r2(5 / sc)}px`);
          }
          if (s.kind === 'click' && i === active) {
            const ce = eInOut((lt - 0.15) / Math.min(0.9, len * 0.45));
            const sx = c.tx + c.s * bx;
            const sy = c.ty + c.s * by;
            const x = lerp(W * 0.66, sx, ce);
            const y = lerp(H * 0.82, sy, ce);
            cursorOn = true;
            set(cursor, 'transform', `translate(${Math.round(x - 6)}px, ${Math.round(y - 4)}px)`);
            const rt = lt - 0.15 - Math.min(0.9, len * 0.45);
            if (rt > 0 && rt < 0.5) {
              rippleOn = true;
              const re = eOut(rt / 0.5);
              set(ripple, 'transform', `translate(${Math.round(sx)}px, ${Math.round(sy)}px) scale(${r2(0.3 + re)})`);
              set(ripple, 'opacity', String(r2(1 - re)));
            }
          }
        } else if (s.kind === 'scroll') {
          const e = eOut(lt / 0.7);
          c = camera(1 + 0.04 * p, W / 2, H * 0.4);
          c.ty += Math.round((1 - e) * 180);
        } else {
          c = camera(1 + 0.05 * p, W / 2, H * 0.35);
        }
        set(L.cam, 'transform', `translate(${r2(c.tx)}px, ${r2(c.ty)}px) scale(${r2(c.s * 1000) / 1000})`);
      });
      set(cursor, 'opacity', cursorOn ? '1' : '0');
      set(ripple, 'opacity', rippleOn ? ripple.style.opacity : '0');

      const s = segs[active];
      const text = s.caption || '';
      if (cap.dataset.text !== text) {
        cap.dataset.text = text;
        cap.innerHTML = esc(text);
      }
      key.push(text);
      const ce = text ? eOut((t - s.start - 0.15) / 0.35) : 0;
      set(cap, 'opacity', String(r2(ce)));
      set(cap, 'transform', `translateX(-50%) translateY(${Math.round((1 - ce) * 20)}px)`);
    };
  }
})();
