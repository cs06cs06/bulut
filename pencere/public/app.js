/* Pencere — hesap açmadan Instagram görüntüleyici (istemci) */
(() => {
  'use strict';

  // =========================================================================
  // Yardımcılar
  // =========================================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const app = $('#app');

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const nf = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
  const fmtNum = (n) => (typeof n === 'number' ? nf.format(n) : '—');
  const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });
  function timeAgo(ts) {
    if (!ts) return '';
    const diff = ts * 1000 - Date.now();
    const abs = Math.abs(diff) / 1000;
    const units = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];
    for (const [u, s] of units) if (abs >= s) return rtf.format(Math.round(diff / 1000 / s), u);
    return 'şimdi';
  }
  const fmtDur = (s) => {
    if (!s) return '';
    s = Math.round(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const vibrate = (ms = 10) => {
    try {
      navigator.vibrate?.(ms);
    } catch {}
  };
  const initials = (u) => esc((u || '?').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?');

  function linkify(text) {
    return esc(text)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[\s(])@([a-z0-9._]{1,30})/gi, '$1<a href="#/u/$2">@$2</a>');
  }

  // Satır içi ikonlar
  const P = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    bookmark: '<path d="M6 3.5h12V21l-6-4.2L6 21z"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    play: '<path class="fill" d="M7 4.5v15l12.5-7.5z"/>',
    carousel: '<rect x="7" y="7" width="13" height="13" rx="2.5"/><path d="M4 16V6.5A2.5 2.5 0 0 1 6.5 4H16"/>',
    reel: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 8.5h18M8 3l3 5.5M14 3l3 5.5"/><path d="m10 12 5 3-5 3z"/>',
    heart: '<path d="M12 20.5s-7.5-4.6-9.6-9.3A5.2 5.2 0 0 1 12 6.4a5.2 5.2 0 0 1 9.6 4.8c-2.1 4.7-9.6 9.3-9.6 9.3z"/>',
    comment: '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 12z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M12 3.5v12m0 0-5-5m5 5 5-5M5 20.5h14"/>',
    share: '<path d="M4.5 12.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6.5M16 7l-4-4-4 4M12 3v13"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    volOn: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    volOff: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 4v5h-5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    lock: '<rect x="4.5" y="11" width="15" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M9.2 3.5v17M14.8 3.5v17"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
    pin: '<path d="M12 16.5V22M8.5 3h7l-1 6 4 4.5h-13l4-4.5z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path class="fill" d="M12 3a9 9 0 0 1 0 18z"/>',
    exportI: '<path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4.5 14v5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/>',
    importI: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4.5 14v5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/>',
    wand: '<path d="m4 20 11-11M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3M19 3l.01.01"/>',
    feed: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18M9 21V9"/>',
  };
  const icon = (name, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${P[name] || ''}</svg>`;
  const verified = () =>
    '<svg class="verified" viewBox="0 0 24 24" aria-label="Doğrulanmış"><path d="M12 1.8l2.6 1.9 3.2-.2 1 3.1 2.7 1.8-1.1 3 1.1 3.1-2.7 1.8-1 3.1-3.2-.2L12 22.2l-2.6-1.9-3.2.2-1-3.1-2.7-1.8 1.1-3.1-1.1-3 2.7-1.8 1-3.1 3.2.2z"/><path d="m8.2 12.2 2.6 2.6 5-5.2" fill="none" stroke="#fff" stroke-width="2"/></svg>';

  // =========================================================================
  // Depolama
  // =========================================================================
  const LS = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('pencere.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem('pencere.' + key, JSON.stringify(val));
        return true;
      } catch {
        return false;
      }
    },
    del(key) {
      try {
        localStorage.removeItem('pencere.' + key);
      } catch {}
    },
    keys(prefix) {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith('pencere.' + prefix)) out.push(k.slice(8));
        }
      } catch {}
      return out;
    },
  };

  const settings = Object.assign({ theme: 'auto', autoplay: true, sound: true, proxy: false }, LS.get('settings', {}));
  const saveSettings = () => LS.set('settings', settings);
  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
  }
  applyTheme();

  const store = {
    saved: LS.get('saved', []),
    recent: LS.get('recent', []),
    isSaved: (u) => store.saved.some((s) => s.username === u),
    persistSaved: () => LS.set('saved', store.saved),
    toggleSave(user, posts) {
      const i = store.saved.findIndex((s) => s.username === user.username);
      if (i >= 0) {
        store.saved.splice(i, 1);
        store.persistSaved();
        return false;
      }
      store.saved.unshift({
        username: user.username,
        fullName: user.fullName,
        pic: user.pic,
        isVerified: user.isVerified,
        addedAt: Date.now(),
        lastSeenTs: newestTs(posts),
      });
      store.persistSaved();
      return true;
    },
    updateSaved(user, posts, { seen = false } = {}) {
      const s = store.saved.find((x) => x.username === user.username);
      if (!s) return;
      s.fullName = user.fullName;
      s.pic = user.pic || s.pic;
      s.isVerified = user.isVerified;
      s.latestTs = newestTs(posts) || s.latestTs;
      if (seen || s.lastSeenTs == null) s.lastSeenTs = s.latestTs;
      store.persistSaved();
    },
    addRecent(u) {
      store.recent = [u, ...store.recent.filter((x) => x !== u)].slice(0, 12);
      LS.set('recent', store.recent);
    },
    removeRecent(u) {
      store.recent = store.recent.filter((x) => x !== u);
      LS.set('recent', store.recent);
    },
    getSnap: (u) => LS.get('snap.' + u, null),
    setSnap(u, data) {
      const snap = { at: Date.now(), data: { ...data, posts: data.posts.slice(0, 24) } };
      for (let tries = 0; tries < 8; tries++) {
        if (LS.set('snap.' + u, snap)) return;
        // Kota doldu → en eski, kaydedilmemiş anlık görüntüleri sil
        const victims = LS.keys('snap.')
          .map((k) => ({ k, at: LS.get(k, { at: 0 }).at, u: k.slice(5) }))
          .sort((a, b) => (store.isSaved(a.u) - store.isSaved(b.u)) || a.at - b.at);
        if (!victims.length) return;
        LS.del(victims[0].k);
      }
    },
  };
  const newestTs = (posts) => (posts || []).reduce((m, p) => Math.max(m, p.timestamp || 0), 0) || null;

  // =========================================================================
  // API
  // =========================================================================
  async function api(path) {
    let res;
    try {
      res = await fetch(path, { signal: AbortSignal.timeout(25000) });
    } catch {
      throw { code: 'network', message: 'Bağlantı kurulamadı. İnternetini kontrol et.' };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw { code: data?.error || 'upstream', message: data?.message || `Sunucu hatası (${res.status})` };
    return data;
  }
  const inflightProfiles = new Map();
  function fetchProfile(username) {
    if (inflightProfiles.has(username)) return inflightProfiles.get(username);
    const p = api(`/api/profile/${encodeURIComponent(username)}`)
      .then((data) => {
        store.setSnap(username, data);
        store.updateSaved(data.user, data.posts);
        return data;
      })
      .finally(() => inflightProfiles.delete(username));
    inflightProfiles.set(username, p);
    return p;
  }
  const fetchMore = (userId, after) => api(`/api/user/${userId}/posts?after=${encodeURIComponent(after || '')}`);
  const postLoads = new Map();
  function ensureComplete(post) {
    if (post.complete || !post.shortcode) return Promise.resolve(post);
    if (postLoads.has(post.shortcode)) return postLoads.get(post.shortcode);
    const p = api(`/api/post/${post.shortcode}`)
      .then((d) => {
        post.items = d.items?.length ? d.items : post.items;
        post.complete = true;
        post.caption = post.caption || d.caption;
        post.views = post.views ?? d.views;
        post.likes = post.likes ?? d.likes;
        post.duration = post.duration ?? d.duration;
        post.owner = post.owner || d.owner;
        return post;
      })
      .finally(() => postLoads.delete(post.shortcode));
    postLoads.set(post.shortcode, p);
    return p;
  }

  const media = (url) => (!url ? '' : settings.proxy ? `/media?u=${encodeURIComponent(url)}` : url);
  const proxied = (url) => `/media?u=${encodeURIComponent(url)}`;

  // Doğrudan CDN yüklemesi başarısız olursa sunucu vekili üzerinden tekrar dene.
  document.addEventListener(
    'error',
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLImageElement) || !el.dataset.src) return;
      if (!el.dataset.retried && !settings.proxy) {
        el.dataset.retried = '1';
        el.src = proxied(el.dataset.src);
      } else {
        el.removeAttribute('src');
        el.classList.add('broken');
        el.dispatchEvent(new CustomEvent('broken', { bubbles: true }));
      }
    },
    true
  );
  document.addEventListener(
    'load',
    (e) => {
      if (e.target instanceof HTMLImageElement) e.target.classList.add('loaded');
    },
    true
  );
  const img = (url, attrs = '') =>
    url ? `<img src="${esc(media(url))}" data-src="${esc(url)}" referrerpolicy="no-referrer" decoding="async" ${attrs}>` : '';

  function avatarHtml(u, size = '', fresh = false) {
    return `<div class="avatar ${size} ${fresh ? 'fresh' : ''}"><div class="inner">${
      u?.pic ? img(u.pic, 'alt="" loading="lazy"') : initials(u?.username)
    }</div></div>`;
  }

  // =========================================================================
  // Bildirim, alt sayfa, geçmiş yığını
  // =========================================================================
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // Açılır katmanlar (görüntüleyici, alt sayfa) tarayıcı geçmişine eklenir;
  // böylece Android'deki geri tuşu önce katmanı kapatır.
  const overlays = [];
  let afterOverlaysClosed = null;
  function pushOverlay(close) {
    overlays.push(close);
    history.pushState({ ov: overlays.length }, '');
  }
  function popOverlay() {
    if (overlays.length) history.back();
  }
  function closeAllOverlays(then) {
    if (!overlays.length) return then?.();
    afterOverlaysClosed = then || null;
    history.go(-overlays.length);
  }
  window.addEventListener('popstate', (e) => {
    const depth = e.state?.ov || 0;
    while (overlays.length > depth) overlays.pop()();
    if (!overlays.length && afterOverlaysClosed) {
      const fn = afterOverlaysClosed;
      afterOverlaysClosed = null;
      setTimeout(fn, 0);
    }
  });

  function sheet({ title = '', html = '', options = [], hint = '' }) {
    const root = $('#sheet-root');
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    const el = document.createElement('div');
    el.className = 'sheet';
    el.setAttribute('role', 'dialog');
    el.innerHTML =
      `<div class="grab"></div>${title ? `<h3>${title}</h3>` : ''}${html}` +
      options
        .map((o, i) =>
          o === '-'
            ? '<div class="sep"></div>'
            : `<button class="opt ${o.danger ? 'danger' : ''}" data-i="${i}">${icon(o.icon)}<span>${esc(o.label)}</span>${
                o.value != null ? `<span class="val">${esc(o.value)}</span>` : ''
              }${o.toggle != null ? `<span class="switch ${o.toggle ? 'on' : ''}"></span>` : ''}</button>`
        )
        .join('') +
      (hint ? `<div class="hint">${hint}</div>` : '');
    root.append(back, el);
    requestAnimationFrame(() => {
      back.classList.add('show');
      el.classList.add('show');
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      back.classList.remove('show');
      el.classList.remove('show');
      setTimeout(() => {
        back.remove();
        el.remove();
      }, 300);
    };
    pushOverlay(close);
    back.addEventListener('click', popOverlay);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.opt');
      if (!b) return;
      const o = options[+b.dataset.i];
      vibrate();
      if (o.keepOpen) return o.onClick?.(b);
      closeAllOverlays(() => o.onClick?.(b));
    });
    // Aşağı kaydırarak kapat
    let sy = null;
    el.addEventListener('touchstart', (e) => (sy = el.scrollTop <= 0 ? e.touches[0].clientY : null), { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (sy == null) return;
      const dy = e.touches[0].clientY - sy;
      if (dy > 0) el.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (sy == null) return;
      const dy = e.changedTouches[0].clientY - sy;
      el.style.transform = '';
      if (dy > 90) popOverlay();
      sy = null;
    });
    return el;
  }

  // =========================================================================
  // Aşağı çekip yenile
  // =========================================================================
  let refreshHandler = null;
  (() => {
    const ptr = $('#ptr');
    let startY = null;
    let pull = 0;
    let busy = false;
    window.addEventListener('touchstart', (e) => {
      if (busy || !refreshHandler || overlays.length || window.scrollY > 0) return (startY = null);
      startY = e.touches[0].clientY;
      pull = 0;
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (startY == null) return;
      pull = Math.max(0, (e.touches[0].clientY - startY) * 0.5);
      if (pull > 0 && window.scrollY <= 0) {
        const p = Math.min(pull, 90);
        ptr.style.opacity = Math.min(1, p / 60);
        ptr.style.transform = `translateY(${p - 60}px) scale(${0.6 + Math.min(0.4, p / 150)}) rotate(${p * 4}deg)`;
      }
    }, { passive: true });
    window.addEventListener('touchend', async () => {
      if (startY == null) return;
      startY = null;
      if (pull > 65 && refreshHandler) {
        busy = true;
        vibrate(15);
        ptr.classList.add('loading');
        ptr.style.transform = 'translateY(10px) scale(1)';
        try {
          await refreshHandler();
        } catch {}
        busy = false;
        ptr.classList.remove('loading');
      }
      ptr.style.transition = 'transform .25s, opacity .25s';
      ptr.style.transform = '';
      ptr.style.opacity = '0';
      setTimeout(() => (ptr.style.transition = ''), 260);
    });
  })();

  // =========================================================================
  // Uzun basma
  // =========================================================================
  function onLongPress(root, selector, handler) {
    let timer = null;
    let start = null;
    let fired = false;
    root.addEventListener('pointerdown', (e) => {
      const el = e.target.closest(selector);
      if (!el) return;
      fired = false;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        fired = true;
        vibrate(20);
        handler(el);
      }, 480);
    });
    const cancel = () => clearTimeout(timer);
    root.addEventListener('pointermove', (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
    });
    root.addEventListener('pointerup', cancel);
    root.addEventListener('pointercancel', cancel);
    root.addEventListener('contextmenu', (e) => {
      if (e.target.closest(selector)) e.preventDefault();
    });
    root.addEventListener(
      'click',
      (e) => {
        if (fired && e.target.closest(selector)) {
          e.preventDefault();
          e.stopPropagation();
          fired = false;
        }
      },
      true
    );
  }

  // =========================================================================
  // Girdi çözümleme: kullanıcı adı, profil ya da gönderi bağlantısı
  // =========================================================================
  function parseInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const post = s.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    if (post) return { post: post[1] };
    const prof = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
    const u = (prof ? prof[1] : s).replace(/^@/, '').toLowerCase();
    return /^[a-z0-9._]{1,30}$/.test(u) ? { user: u } : { invalid: true };
  }
  function go(raw) {
    const r = parseInput(raw);
    if (!r) return;
    if (r.invalid) return toast('Geçerli bir kullanıcı adı ya da bağlantı yaz');
    if (r.post) return (location.hash = `#/p/${r.post}`);
    store.addRecent(r.user);
    location.hash = `#/u/${r.user}`;
  }

  function searchBox(autofocus = false) {
    return `<form class="search" data-search>
      ${icon('search')}
      <input type="search" name="q" placeholder="Kullanıcı adı ya da Instagram bağlantısı" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" ${autofocus ? 'autofocus' : ''} aria-label="Ara">
      <button class="go" type="submit" aria-label="Git">${icon('arrow')}</button>
    </form>`;
  }
  app.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-search]');
    if (!f) return;
    e.preventDefault();
    const q = f.q.value;
    f.q.blur();
    go(q);
  });

  // =========================================================================
  // Görünüm: Ana sayfa (kayıtlı hesaplar)
  // =========================================================================
  // Kayıtlı hesabın son (sabitlenmemiş) gönderileri, en yeniden eskiye
  function recentPostsOf(username) {
    const snap = store.getSnap(username);
    if (!snap) return [];
    const u = snap.data.user;
    const owner = { username: u.username, pic: u.pic, isVerified: u.isVerified };
    return snap.data.posts
      .filter((p) => !p.pinned)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .map((p) => ({ ...p, owner }));
  }

  function savedCard(s) {
    const posts = recentPostsOf(s.username);
    const latest = s.latestTs || newestTs(posts);
    const fresh = latest && s.lastSeenTs && latest > s.lastSeenTs;
    const newCount = fresh ? posts.filter((p) => p.timestamp > s.lastSeenTs).length : 0;
    return `<div class="saved-card" data-user="${esc(s.username)}" role="link" tabindex="0">
      <div class="sc-head">
        ${avatarHtml(s, 'sm', fresh)}
        <div class="meta">
          <div class="name">${esc(s.username)}${s.isVerified ? verified() : ''}${fresh ? ` <span class="badge-new">${newCount || ''} yeni</span>` : ''}</div>
          <div class="sub">${esc(s.fullName || '')}${latest ? `${s.fullName ? ' · ' : ''}${timeAgo(latest)}` : ''}</div>
        </div>
        <button class="icon-btn" data-more="${esc(s.username)}" aria-label="Seçenekler">${icon('more')}</button>
      </div>
      ${
        posts.length
          ? `<div class="sc-thumbs">${posts
              .slice(0, 4)
              .map(
                (p, i) => `<button class="sc-thumb" data-i="${i}" aria-label="Gönderi ${i + 1}">${img(p.thumb, 'alt="" loading="lazy"')}${
                  p.type === 'video' ? `<span class="ic">${icon('play')}</span>` : p.type === 'carousel' ? `<span class="ic">${icon('carousel')}</span>` : ''
                }${s.lastSeenTs && p.timestamp > s.lastSeenTs ? '<span class="dot-new"></span>' : ''}</button>`
              )
              .join('')}</div>`
          : ''
      }
    </div>`;
  }

  function viewHome() {
    document.title = 'Pencere';
    const saved = store.saved;
    app.innerHTML = `<section class="view">
      <header class="topbar large">
        <h1><span class="brand">Pencere</span></h1>
        <button class="icon-btn" data-action="settings" aria-label="Ayarlar">${icon('sliders')}</button>
      </header>
      ${searchBox()}
      <div class="section">
        <div class="section-head"><h2>Kaydedilenler</h2>${saved.length ? `<span class="muted small">${saved.length} hesap</span>` : ''}</div>
        ${
          saved.length
            ? `<div class="saved-list">${saved.map(savedCard).join('')}</div>
               <p class="muted small" style="text-align:center;margin-top:14px">Önizlemeye dokun → hemen izle · Karta uzun bas → seçenekler</p>`
            : `<div class="empty">
                <div class="art">${icon('bookmark')}</div>
                <h3>Henüz kayıtlı hesap yok</h3>
                <p>Bir kullanıcı adı ara, profilde <b>Kaydet</b>'e dokun. Tek dokunuşla paylaşımlarını görürsün.</p>
                <div class="chips">${['nasa', 'natgeo', 'bbcnews'].map((u) => `<a class="chip" href="#/u/${u}">${icon('user')}${u}</a>`).join('')}</div>
              </div>`
        }
      </div>
      ${
        store.recent.length
          ? `<div class="section"><div class="section-head"><h2>Son aramalar</h2><button class="link" data-action="clear-recent">Temizle</button></div>
             <div class="chips">${store.recent.map((u) => `<a class="chip" href="#/u/${esc(u)}">${icon('clock')}${esc(u)}</a>`).join('')}</div></div>`
          : ''
      }
    </section>`;

    const list = $('.saved-list', app);
    if (list) {
      onLongPress(list, '.saved-card', (el) => savedOptions(el.dataset.user));
      list.addEventListener('click', (e) => {
        const card = e.target.closest('.saved-card');
        if (!card) return;
        const username = card.dataset.user;
        const m = e.target.closest('[data-more]');
        if (m) return savedOptions(username);
        const th = e.target.closest('.sc-thumb');
        if (th) {
          // Önizlemeye dokun → doğrudan tam ekran aç
          const posts = recentPostsOf(username);
          const s = store.saved.find((x) => x.username === username);
          if (s && s.latestTs) {
            s.lastSeenTs = s.latestTs;
            store.persistSaved();
          }
          return openViewer(posts, +th.dataset.i);
        }
        location.hash = `#/u/${username}`;
      });
      list.addEventListener('keydown', (e) => {
        const card = e.target.closest('.saved-card');
        if (card && e.target === card && e.key === 'Enter') location.hash = `#/u/${card.dataset.user}`;
      });
      // Dokunur dokunmaz veriyi ısıt
      list.addEventListener('pointerdown', (e) => {
        const c = e.target.closest('.saved-card');
        if (c && !inflightProfiles.has(c.dataset.user)) {
          const snap = store.getSnap(c.dataset.user);
          if (!snap || Date.now() - snap.at > 60000) fetchProfile(c.dataset.user).catch(() => {});
        }
      });
    }
    refreshHandler = () => refreshSaved(true).then(() => route());
    backgroundRefresh();
  }

  function savedOptions(username) {
    const idx = store.saved.findIndex((s) => s.username === username);
    if (idx < 0) return;
    const s = store.saved[idx];
    sheet({
      title: `${avatarHtml(s, 'xs')} ${esc(username)}`,
      options: [
        { icon: 'grid', label: 'Profili aç', onClick: () => (location.hash = `#/u/${username}`) },
        idx > 0 && {
          icon: 'up',
          label: 'En üste taşı',
          onClick: () => {
            store.saved.splice(idx, 1);
            store.saved.unshift(s);
            store.persistSaved();
            route();
          },
        },
        { icon: 'external', label: "Instagram'da aç", onClick: () => window.open(`https://www.instagram.com/${username}/`, '_blank', 'noopener') },
        '-',
        {
          icon: 'trash',
          label: 'Kayıtlılardan kaldır',
          danger: true,
          onClick: () => {
            store.saved.splice(store.saved.indexOf(s), 1);
            store.persistSaved();
            toast(`${username} kaldırıldı`);
            route();
          },
        },
      ].filter(Boolean),
    });
  }

  // Kayıtlı hesapları arka planda sırayla yenile (yeni gönderi rozetleri için).
  let bgRunning = false;
  const lastAttempt = new Map(); // başarısız yenilemeleri tekrar tekrar denememek için
  function isStale(u, maxAgeMs) {
    const snap = store.getSnap(u);
    const age = snap ? Date.now() - snap.at : Infinity;
    return age > maxAgeMs && Date.now() - (lastAttempt.get(u) || 0) > maxAgeMs;
  }
  async function refreshSaved(force = false, maxAgeMs = 20 * 60 * 1000) {
    const queue = store.saved.map((s) => s.username).filter((u) => force || isStale(u, maxAgeMs));
    let done = 0;
    let ok = 0;
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift();
        lastAttempt.set(u, Date.now());
        try {
          await fetchProfile(u);
          ok++;
        } catch {}
        done++;
        onRefreshProgress?.(done);
      }
    };
    await Promise.all([worker(), worker()]);
    return ok;
  }
  let onRefreshProgress = null;
  async function backgroundRefresh() {
    if (bgRunning || !store.saved.length) return;
    bgRunning = true;
    const startRoute = location.hash;
    const n = await refreshSaved(false).catch(() => 0);
    bgRunning = false;
    if (n && location.hash === startRoute && !overlays.length && ['', '#/', '#/feed'].includes(location.hash)) softRerender();
  }
  function softRerender() {
    const y = window.scrollY;
    route();
    window.scrollTo(0, y);
  }

  // =========================================================================
  // Görünüm: Arama
  // =========================================================================
  function viewSearch() {
    document.title = 'Ara · Pencere';
    app.innerHTML = `<section class="view">
      <header class="topbar large"><h1>Ara</h1></header>
      ${searchBox(true)}
      <div class="section">
        <p class="muted small" style="margin:6px 2px 16px">Kullanıcı adı (ör. <b>nasa</b>), profil bağlantısı ya da bir gönderi/reels bağlantısı yapıştırabilirsin.</p>
        ${
          store.recent.length
            ? `<div class="section-head"><h2>Son aramalar</h2><button class="link" data-action="clear-recent">Temizle</button></div>
               <div class="saved-list">${store.recent
                 .map((u) => {
                   const snap = store.getSnap(u);
                   const user = snap?.data?.user || { username: u };
                   return `<a class="card" href="#/u/${esc(u)}">${avatarHtml(user, 'sm')}<div class="meta"><div class="name">${esc(u)}${
                     user.isVerified ? verified() : ''
                   }</div><div class="sub">${esc(user.fullName || '')}</div></div>
                   <button class="icon-btn" data-remove-recent="${esc(u)}" aria-label="Kaldır">${icon('close')}</button></a>`;
                 })
                 .join('')}</div>`
            : ''
        }
      </div>
    </section>`;
    const input = $('input', app);
    setTimeout(() => input?.focus(), 50);
    app.onclick = (e) => {
      const r = e.target.closest('[data-remove-recent]');
      if (r) {
        e.preventDefault();
        store.removeRecent(r.dataset.removeRecent);
        route();
      }
    };
    refreshHandler = null;
  }

  // =========================================================================
  // Görünüm: Profil
  // =========================================================================
  let profileState = null;

  function filteredPosts(st) {
    const posts = st.posts;
    if (st.filter === 'video') return posts.filter((p) => p.type === 'video' || p.items.some((i) => i.type === 'video'));
    if (st.filter === 'photo') return posts.filter((p) => p.type !== 'video');
    return posts;
  }

  function tileHtml(p, i) {
    let ic = '';
    if (p.type === 'carousel') ic = icon('carousel');
    else if (p.type === 'video') ic = p.isReel ? icon('reel') : icon('play');
    return `<button class="tile" data-i="${i}" aria-label="Gönderi ${i + 1}">
      ${img(p.thumb, 'alt="" loading="lazy"')}
      ${p.pinned ? `<span class="ic pin">${icon('pin')}</span>` : ''}
      ${ic ? `<span class="ic">${ic}</span>` : ''}
      ${p.type === 'video' && (p.views || p.duration) ? `<span class="views">${p.views ? icon('play') + fmtNum(p.views) : fmtDur(p.duration)}</span>` : ''}
    </button>`;
  }

  function profileSkeleton(username) {
    return `<div class="profile-head">
      <div class="ph-row"><div class="avatar xl"><div class="inner sk"></div></div>
      <div class="stats">${'<div><div class="sk sk-line" style="width:40px;margin:4px auto"></div><div class="sk sk-line" style="width:56px;margin:4px auto"></div></div>'.repeat(3)}</div></div>
      <div class="sk sk-line" style="width:40%;margin-top:14px"></div><div class="sk sk-line" style="width:70%"></div>
    </div><div class="grid" style="margin-top:14px">${'<div class="tile sk" style="border-radius:0"></div>'.repeat(12)}</div>
    <span hidden>${esc(username)}</span>`;
  }

  function viewProfile(username) {
    document.title = `@${username} · Pencere`;
    const snap = store.getSnap(username);
    const token = Symbol();
    profileState = {
      token,
      username,
      user: snap?.data?.user || null,
      posts: snap?.data?.posts || [],
      hasMore: snap?.data?.hasMore || false,
      source: snap?.data?.source,
      filter: 'all',
      loadingMore: false,
      moreBlocked: false,
      error: null,
      refreshing: true,
    };
    app.innerHTML = `<section class="view" id="profile-view">
      <header class="topbar">
        <button class="icon-btn" data-action="back" aria-label="Geri">${icon('back')}</button>
        <h1>${esc(username)}</h1>
        <button class="icon-btn" data-action="profile-more" aria-label="Seçenekler">${icon('more')}</button>
      </header>
      <div id="profile-body">${profileState.user ? '' : profileSkeleton(username)}</div>
    </section>`;
    if (profileState.user) renderProfileBody();
    loadProfile(token);
    refreshHandler = () => loadProfile(profileState.token, true);
  }

  async function loadProfile(token, manual = false) {
    const st = profileState;
    st.refreshing = true;
    try {
      const data = await fetchProfile(st.username);
      if (profileState?.token !== token) return;
      const hadUser = !!st.user;
      const prevIds = st.posts.slice(0, data.posts.length).map((p) => p.id).join();
      const sameFirstPage = hadUser && prevIds === data.posts.map((p) => p.id).join();
      Object.assign(st, { user: data.user, source: data.source, error: null });
      if (!sameFirstPage || manual) {
        // Oturumda sonradan yüklenen eski sayfaları koru, ilk sayfayı tazele
        const ids = new Set(data.posts.map((p) => p.id));
        const oldest = oldestNonPinned(data.posts);
        const rest = manual ? [] : st.posts.filter((p) => !ids.has(p.id) && !p.pinned && (p.timestamp || 0) < oldest);
        st.posts = [...data.posts, ...rest];
        st.hasMore = rest.length ? st.hasMore : data.hasMore;
      }
      if (manual) st.moreBlocked = false;
      store.addRecent(st.username);
      store.updateSaved(data.user, data.posts, { seen: true });
      if (!sameFirstPage || manual) renderProfileBody();
      else updateProfileHeader();
    } catch (err) {
      if (profileState?.token !== token) return;
      st.error = err;
      if (!st.user) renderProfileBody();
      else toast(err.message || 'Güncellenemedi');
    } finally {
      st.refreshing = false;
    }
  }
  const oldestNonPinned = (posts) =>
    posts.filter((p) => !p.pinned).reduce((m, p) => Math.min(m, p.timestamp || Infinity), Infinity);

  function profileHeaderHtml(st) {
    const u = st.user;
    const saved = store.isSaved(u.username);
    return `<div class="profile-head" id="profile-head">
      <div class="ph-row">
        <button data-action="avatar" aria-label="Profil fotoğrafı">${avatarHtml(u, 'xl', true)}</button>
        <div class="stats">
          <div><b>${fmtNum(u.postsCount)}</b><span>gönderi</span></div>
          <div><b>${fmtNum(u.followers)}</b><span>takipçi</span></div>
          <div><b>${fmtNum(u.following)}</b><span>takip</span></div>
        </div>
      </div>
      <div class="ph-name">${esc(u.fullName || u.username)}${u.isVerified ? verified() : ''}</div>
      ${u.category ? `<div class="ph-cat">${esc(u.category)}</div>` : ''}
      ${u.bio ? `<div class="ph-bio">${linkify(u.bio)}</div>` : ''}
      ${
        u.externalUrl
          ? `<a class="ph-link" href="${esc(u.externalUrl)}" target="_blank" rel="noopener noreferrer">${icon('link')}${esc(
              u.externalUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
            )}</a>`
          : ''
      }
      <div class="ph-actions">
        <button class="btn ${saved ? 'saved' : 'primary'}" data-action="toggle-save">${icon('bookmark')}${saved ? 'Kaydedildi' : 'Kaydet'}</button>
        <button class="btn" data-action="share-profile" aria-label="Paylaş">${icon('share')}</button>
      </div>
    </div>`;
  }

  function renderProfileBody() {
    const st = profileState;
    const body = $('#profile-body');
    if (!body) return;
    if (!st.user) {
      const e = st.error || {};
      const nf = e.code === 'not_found';
      body.innerHTML = `<div class="section"><div class="empty">
        <div class="art">${icon(nf ? 'user' : 'info')}</div>
        <h3>${nf ? 'Kullanıcı bulunamadı' : 'Profil yüklenemedi'}</h3>
        <p>${esc(e.message || '')}</p>
        ${nf ? '' : `<button class="btn primary" data-action="retry">${icon('refresh')}Tekrar dene</button>`}
      </div></div>`;
      return;
    }
    const list = filteredPosts(st);
    body.innerHTML = `${profileHeaderHtml(st)}
      ${
        st.user.isPrivate
          ? `<div class="section"><div class="empty"><div class="art">${icon('lock')}</div><h3>Bu hesap gizli</h3><p>Gizli hesapların paylaşımları yalnızca takipçilerine açıktır.</p></div></div>`
          : `<div class="segmented" role="tablist">
              <button role="tab" data-filter="all" aria-selected="${st.filter === 'all'}" aria-label="Tümü">${icon('grid')}</button>
              <button role="tab" data-filter="video" aria-selected="${st.filter === 'video'}" aria-label="Videolar">${icon('film')}</button>
              <button role="tab" data-filter="photo" aria-selected="${st.filter === 'photo'}" aria-label="Fotoğraflar">${icon('image')}</button>
            </div>
            <div class="grid" id="grid">${list.map(tileHtml).join('')}</div>
            ${!list.length ? '<p class="muted" style="text-align:center;padding:30px">Burada gösterilecek gönderi yok.</p>' : ''}
            <div class="load-more" id="sentinel"></div>`
      }`;
    setupSentinel();
  }

  function updateProfileHeader() {
    const head = $('#profile-head');
    if (head && profileState?.user) head.outerHTML = profileHeaderHtml(profileState);
  }

  let sentinelObserver = null;
  function setupSentinel() {
    sentinelObserver?.disconnect();
    const s = $('#sentinel');
    if (!s) return;
    renderSentinel();
    sentinelObserver = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '600px' });
    sentinelObserver.observe(s);
  }
  function renderSentinel() {
    const s = $('#sentinel');
    const st = profileState;
    if (!s || !st) return;
    if (st.loadingMore) s.innerHTML = '<div class="spinner"></div>';
    else if (st.moreBlocked)
      s.innerHTML = `<div class="notice" style="margin:0">${icon('info')}<span>Instagram, hesap açmadan şimdilik bu kadar gönderi gösteriyor. Daha sonra aşağı çekip yenilemeyi deneyebilirsin.</span></div>`;
    else if (!st.hasMore && st.posts.length) s.innerHTML = `<span class="muted small">Hepsi bu kadar · ${st.posts.length} gönderi</span>`;
    else s.innerHTML = '';
  }

  async function loadMore() {
    const st = profileState;
    if (!st || st.loadingMore || !st.hasMore || st.moreBlocked || !st.user?.id || st.user.isPrivate) return;
    const token = st.token;
    const last = [...st.posts].filter((p) => !p.pinned).pop() || st.posts[st.posts.length - 1];
    if (!last) return;
    st.loadingMore = true;
    renderSentinel();
    try {
      const r = await fetchMore(st.user.id, last.id);
      if (profileState?.token !== token) return;
      if (r.blocked) st.moreBlocked = true;
      const seen = new Set(st.posts.map((p) => p.id));
      const fresh = r.posts.filter((p) => !seen.has(p.id));
      st.posts.push(...fresh);
      st.hasMore = r.hasMore && fresh.length > 0;
      appendTiles(fresh);
      viewerInstance?.syncFromSource?.();
    } catch (err) {
      if (profileState?.token === token) {
        st.moreBlocked = true;
        toast(err.message || 'Daha fazla gönderi alınamadı');
      }
    } finally {
      if (profileState?.token === token) {
        st.loadingMore = false;
        renderSentinel();
      }
    }
  }

  function appendTiles(fresh) {
    const grid = $('#grid');
    if (!grid) return;
    const st = profileState;
    const list = filteredPosts(st);
    const newOnes = fresh.filter((p) => list.includes(p));
    const html = newOnes.map((p) => tileHtml(p, list.indexOf(p))).join('');
    grid.insertAdjacentHTML('beforeend', html);
  }

  function profileOptions() {
    const st = profileState;
    if (!st) return;
    const u = st.username;
    sheet({
      title: esc(u),
      options: [
        { icon: 'refresh', label: 'Yenile', onClick: () => loadProfile(st.token, true) },
        { icon: 'copy', label: 'Bağlantıyı kopyala', onClick: () => copy(`https://www.instagram.com/${u}/`) },
        { icon: 'external', label: "Instagram'da aç", onClick: () => window.open(`https://www.instagram.com/${u}/`, '_blank', 'noopener') },
      ],
    });
  }

  // =========================================================================
  // Görünüm: Akış (tüm kayıtlı hesapların son gönderileri)
  // =========================================================================
  let feedPosts = [];
  function collectFeed() {
    const out = [];
    for (const s of store.saved) {
      const snap = store.getSnap(s.username);
      if (!snap) continue;
      const u = snap.data.user;
      for (const p of snap.data.posts) {
        out.push({ ...p, owner: { username: u.username, pic: u.pic, isVerified: u.isVerified } });
      }
    }
    return out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 120);
  }

  function feedCard(p, i) {
    const w = p.width || 1080;
    const h = p.height || 1350;
    const ratio = Math.min(Math.max(h / w, 0.6), 1.25);
    const o = p.owner || {};
    return `<article class="post-card">
      <a class="pc-head" href="#/u/${esc(o.username)}">
        ${avatarHtml(o, 'xs')}
        <div class="who"><b>${esc(o.username)}${o.isVerified ? verified() : ''}</b><small>${timeAgo(p.timestamp)}</small></div>
      </a>
      <button class="pc-media" data-i="${i}" style="aspect-ratio:${1 / ratio}" aria-label="Gönderiyi aç">
        ${img(p.thumb, 'alt="" loading="lazy"')}
        ${p.type === 'carousel' ? `<span class="ic">${icon('carousel')}</span>` : ''}
        ${p.type === 'video' ? `<span class="play-big">${icon('play')}</span>` : ''}
      </button>
      <div class="pc-body">
        <div class="pc-stats">
          ${p.likes != null ? `<span>${icon('heart')}${fmtNum(p.likes)}</span>` : ''}
          ${p.comments != null ? `<span>${icon('comment')}${fmtNum(p.comments)}</span>` : ''}
          ${p.views ? `<span>${icon('eye')}${fmtNum(p.views)}</span>` : ''}
        </div>
        ${p.caption ? `<div class="pc-caption clamp">${linkify(p.caption)}</div>` : ''}
      </div>
    </article>`;
  }

  function viewFeed() {
    document.title = 'Akış · Pencere';
    const saved = store.saved;
    feedPosts = collectFeed();
    app.innerHTML = `<section class="view">
      <header class="topbar large"><h1>Akış</h1><span class="muted small" id="feed-status" style="padding-right:12px"></span></header>
      ${
        saved.length
          ? `<div class="rings">${saved
              .map((s) => {
                const fresh = s.latestTs && s.lastSeenTs && s.latestTs > s.lastSeenTs;
                return `<a class="ring" href="#/u/${esc(s.username)}">${avatarHtml(s, '', fresh)}<span>${esc(s.username)}</span></a>`;
              })
              .join('')}</div>`
          : ''
      }
      ${
        !saved.length
          ? `<div class="section"><div class="empty"><div class="art">${icon('feed')}</div><h3>Akışın boş</h3><p>Kaydettiğin hesapların son paylaşımları burada tarih sırasıyla görünür.</p><a class="btn primary" href="#/search">${icon('search')}Hesap ara</a></div></div>`
          : feedPosts.length
          ? `<div class="feed">${feedPosts.map(feedCard).join('')}</div>`
          : `<div class="load-more"><div class="spinner"></div></div>`
      }
    </section>`;

    const status = $('#feed-status');
    const stale = saved.filter((s) => isStale(s.username, 5 * 60 * 1000)).length;
    const doRefresh = async (force) => {
      const total = force ? saved.length : stale;
      if (!total) return;
      onRefreshProgress = (n) => status && (status.textContent = `${n}/${total} güncellendi`);
      await refreshSaved(force, 5 * 60 * 1000);
      onRefreshProgress = null;
      if (location.hash === '#/feed' && !overlays.length) softRerender();
    };
    refreshHandler = () => doRefresh(true);
    if (stale && !bgRunning) doRefresh(false);
  }

  // =========================================================================
  // Görünüm: Tek gönderi (bağlantıdan)
  // =========================================================================
  async function viewPost(code) {
    document.title = 'Gönderi · Pencere';
    app.innerHTML = `<section class="view"><header class="topbar"><button class="icon-btn" data-action="back" aria-label="Geri">${icon(
      'back'
    )}</button><h1>Gönderi</h1><span style="width:44px"></span></header><div class="load-more" id="post-body"><div class="spinner"></div></div></section>`;
    refreshHandler = null;
    try {
      const post = await api(`/api/post/${encodeURIComponent(code)}`);
      if (location.hash !== `#/p/${code}`) return;
      const o = post.owner;
      $('#post-body').outerHTML = `<div class="feed">${feedCard(post, 0)}</div>${
        o ? `<div class="section"><a class="btn block primary" href="#/u/${esc(o.username)}">${icon('user')}@${esc(o.username)} profilini aç</a></div>` : ''
      }`;
      $('.pc-media', app)?.addEventListener('click', () => openViewer([post], 0));
      openViewer([post], 0);
    } catch (err) {
      const b = $('#post-body');
      if (b) b.innerHTML = `<div class="empty" style="width:100%;margin:0 16px"><div class="art">${icon('info')}</div><h3>Gönderi açılamadı</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  // =========================================================================
  // Tam ekran görüntüleyici (dikey kaydırma, carousel, video)
  // =========================================================================
  let viewerInstance = null;
  let hintShown = false;

  function openViewer(posts, startIndex, { source } = {}) {
    if (viewerInstance) return;
    const root = $('#viewer-root');
    const el = document.createElement('div');
    el.className = 'viewer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Gönderi görüntüleyici');
    el.innerHTML = `<div class="v-top">
        <button class="icon-btn" data-v="close" aria-label="Kapat">${icon('close')}</button>
        <span class="v-count"></span>
        <button class="icon-btn" data-v="mute" aria-label="Ses">${icon(settings.sound ? 'volOn' : 'volOff')}</button>
      </div>
      <div class="v-scroll"></div>`;
    root.append(el);
    document.body.classList.add('lock', 'viewer-open');
    const scroller = $('.v-scroll', el);
    const count = $('.v-count', el);
    let list = posts;
    let active = -1;
    let muted = !settings.sound;

    const slideHtml = (p, i) => `<div class="v-slide" data-i="${i}"></div>`;
    scroller.innerHTML = list.map(slideHtml).join('');

    function ownerOf(p) {
      return p.owner || (profileState?.user ? { username: profileState.user.username, pic: profileState.user.pic, isVerified: profileState.user.isVerified } : null);
    }

    function fillSlide(slide, p) {
      const o = ownerOf(p);
      const items = p.items || [];
      slide.innerHTML = `<div class="v-track">${items
        .map(
          (it, k) => `<div class="v-item ${it.type === 'video' ? 'is-video paused' : ''}" data-k="${k}">
            <div class="v-bg" style="background-image:url('${esc(media(k === 0 ? p.thumb : it.url))}')"></div>
            ${
              it.type === 'video'
                ? it.videoUrl
                  ? `<video playsinline loop preload="none" poster="${esc(media(it.url || p.thumb))}" data-src="${esc(it.videoUrl)}"></video>
                     <div class="v-play">${icon('play')}</div>
                     <div class="v-progress"><div class="bar"><div class="fill"></div></div></div>`
                  : `${img(it.url || p.thumb, 'alt=""')}<div class="spinner"></div>`
                : img(it.url || p.thumb, `alt="${esc(it.alt || '')}"`)
            }
          </div>`
        )
        .join('')}</div>
        ${items.length > 1 ? `<div class="v-dots">${items.map((_, k) => `<i class="${k === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
        <div class="v-info">
          ${
            o
              ? `<a class="v-who" href="#/u/${esc(o.username)}" data-v="owner">${avatarHtml(o, 'xs')}<div><b>${esc(o.username)}${
                  o.isVerified ? verified() : ''
                }</b><small>${timeAgo(p.timestamp)}</small></div></a>`
              : ''
          }
          ${p.caption ? `<div class="v-caption clamp" data-v="caption">${linkify(p.caption)}</div>` : ''}
          <div class="v-stats">
            ${p.likes != null ? `<span>${icon('heart')}${fmtNum(p.likes)}</span>` : ''}
            ${p.comments != null ? `<span>${icon('comment')}${fmtNum(p.comments)}</span>` : ''}
            ${p.views ? `<span>${icon('eye')}${fmtNum(p.views)}</span>` : ''}
          </div>
        </div>
        <div class="v-actions">
          <button class="icon-btn" data-v="download" aria-label="İndir">${icon('download')}</button>
          <button class="icon-btn" data-v="share" aria-label="Paylaş">${icon('share')}</button>
          <button class="icon-btn" data-v="open" aria-label="Instagram'da aç">${icon('external')}</button>
        </div>`;
      slide.dataset.filled = '1';
      const track = $('.v-track', slide);
      let raf = 0;
      track.addEventListener('scroll', () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const k = Math.round(track.scrollLeft / track.clientWidth);
          if (slide.dataset.k == k) return;
          slide.dataset.k = k;
          $$('.v-dots i', slide).forEach((d, j) => d.classList.toggle('on', j === k));
          if (+slide.dataset.i === active) playActive();
        });
      }, { passive: true });
      $$('video', slide).forEach(wireVideo);
    }

    function wireVideo(v) {
      const item = v.closest('.v-item');
      const fill = $('.fill', item);
      const prog = $('.v-progress', item);
      v.addEventListener('timeupdate', () => {
        if (v.duration) fill.style.width = `${(v.currentTime / v.duration) * 100}%`;
      });
      v.addEventListener('play', () => item.classList.remove('paused'));
      v.addEventListener('pause', () => item.classList.add('paused'));
      v.addEventListener('error', () => {
        if (!v.dataset.retried && !settings.proxy && v.dataset.src) {
          v.dataset.retried = '1';
          v.src = proxied(v.dataset.src);
          if (item.closest('.v-slide')?.dataset.i == active) v.play().catch(() => {});
        }
      });
      const seek = (e) => {
        const r = prog.getBoundingClientRect();
        const x = Math.min(Math.max(0, e.clientX - r.left), r.width);
        if (v.duration) v.currentTime = (x / r.width) * v.duration;
      };
      prog.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        prog.setPointerCapture(e.pointerId);
        prog.classList.add('drag');
        seek(e);
      });
      prog.addEventListener('pointermove', (e) => prog.classList.contains('drag') && seek(e));
      prog.addEventListener('pointerup', () => prog.classList.remove('drag'));
      prog.addEventListener('pointercancel', () => prog.classList.remove('drag'));
      prog.addEventListener('click', (e) => e.stopPropagation());
    }

    function attachVideo(v) {
      if (!v.getAttribute('src') && v.dataset.src) {
        v.src = media(v.dataset.src);
        v.preload = 'auto';
      }
    }
    function detachVideos(slide) {
      $$('video', slide).forEach((v) => {
        v.pause();
        if (v.getAttribute('src')) {
          v.removeAttribute('src');
          v.load();
        }
      });
    }

    function ensureSlide(i) {
      const slide = scroller.children[i];
      const p = list[i];
      if (!slide || !p) return;
      if (!slide.dataset.filled) fillSlide(slide, p);
      if (!p.complete) {
        ensureComplete(p)
          .then(() => {
            if (!viewerInstance || !slide.isConnected) return;
            fillSlide(slide, p);
            if (i === active) playActive();
          })
          .catch(() => {});
      }
    }

    function currentVideo() {
      const slide = scroller.children[active];
      if (!slide) return null;
      const k = +(slide.dataset.k || 0);
      return $$('.v-item', slide)[k]?.querySelector('video') || null;
    }

    function playActive() {
      $$('video', scroller).forEach((v) => v.pause());
      const v = currentVideo();
      if (!v) return;
      attachVideo(v);
      v.muted = muted;
      if (!settings.autoplay) return;
      const pr = v.play();
      pr?.catch((err) => {
        if (err?.name === 'NotAllowedError' && !v.muted) {
          // Tarayıcı sesli otomatik oynatmaya izin vermedi → sessiz başlat
          v.muted = true;
          muted = true;
          updateMuteBtn();
          v.play().catch(() => {});
          showHint('Sesi açmak için 🔊 simgesine dokun');
        }
      });
    }

    function setActive(i) {
      if (i === active) return;
      active = i;
      count.textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
      for (let j = 0; j < scroller.children.length; j++) {
        const d = Math.abs(j - i);
        if (d <= 2) ensureSlide(j);
        else if (d > 4 && scroller.children[j].dataset.filled) detachVideos(scroller.children[j]);
      }
      playActive();
      if (source?.onNearEnd && i >= list.length - 3) source.onNearEnd();
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(+e.target.dataset.i);
      },
      { root: scroller, threshold: 0.6 }
    );
    $$('.v-slide', scroller).forEach((s) => io.observe(s));

    function updateMuteBtn() {
      $('[data-v="mute"]', el).innerHTML = icon(muted ? 'volOff' : 'volOn');
    }
    function showHint(text) {
      const h = document.createElement('div');
      h.className = 'v-hint';
      h.textContent = text;
      el.append(h);
      setTimeout(() => h.remove(), 2700);
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      const slide = e.target.closest('.v-slide');
      const p = slide ? list[+slide.dataset.i] : null;
      if (b) {
        const act = b.dataset.v;
        if (act === 'close') return popOverlay();
        if (act === 'mute') {
          muted = !muted;
          settings.sound = !muted;
          saveSettings();
          updateMuteBtn();
          const v = currentVideo();
          if (v) {
            v.muted = muted;
            if (v.paused) v.play().catch(() => {});
          }
          return;
        }
        if (act === 'owner') {
          e.preventDefault();
          const target = b.getAttribute('href');
          return closeAllOverlays(() => (location.hash === target ? route() : (location.hash = target)));
        }
        if (act === 'caption') return b.classList.toggle('clamp');
        if (!p) return;
        const k = +(slide.dataset.k || 0);
        const it = p.items[k] || p.items[0];
        if (act === 'download') return download(p, it, k);
        if (act === 'share') return sharePost(p);
        if (act === 'open') return window.open(`https://www.instagram.com/p/${p.shortcode}/`, '_blank', 'noopener');
        return;
      }
      const a = e.target.closest('a[href^="#/u/"]');
      if (a) {
        e.preventDefault();
        const target = a.getAttribute('href');
        return closeAllOverlays(() => (location.hash = target));
      }
      // Videoya dokun → oynat/duraklat; fotoğrafa dokun → arayüzü gizle/göster
      const item = e.target.closest('.v-item');
      if (!item) return;
      const v = $('video', item);
      if (v) {
        attachVideo(v);
        if (v.paused) {
          v.muted = muted;
          v.play().catch(() => {});
        } else v.pause();
      } else {
        el.classList.toggle('bare');
        $$('.v-info, .v-actions, .v-top, .v-dots', el).forEach((n) => (n.style.opacity = el.classList.contains('bare') ? '0' : ''));
      }
    });

    // Klavye (masaüstü)
    const onKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'j') scroller.scrollBy({ top: scroller.clientHeight, behavior: 'smooth' });
      else if (e.key === 'ArrowUp' || e.key === 'k') scroller.scrollBy({ top: -scroller.clientHeight, behavior: 'smooth' });
      else if (e.key === ' ') {
        e.preventDefault();
        const v = currentVideo();
        if (v) v.paused ? v.play().catch(() => {}) : v.pause();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const t = $('.v-track', scroller.children[active]);
        t?.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * t.clientWidth, behavior: 'smooth' });
      }
    };
    document.addEventListener('keydown', onKey);

    const close = () => {
      io.disconnect();
      document.removeEventListener('keydown', onKey);
      $$('video', el).forEach((v) => {
        v.pause();
        v.removeAttribute('src');
        v.load();
      });
      el.classList.add('closing');
      document.body.classList.remove('lock', 'viewer-open');
      viewerInstance = null;
      setTimeout(() => el.remove(), 200);
    };
    pushOverlay(close);

    viewerInstance = {
      syncFromSource() {
        if (!source?.getList) return;
        const next = source.getList();
        if (next.length <= list.length) return;
        const start = list.length;
        list = next;
        const frag = document.createDocumentFragment();
        for (let i = start; i < list.length; i++) {
          const d = document.createElement('div');
          d.className = 'v-slide';
          d.dataset.i = i;
          frag.append(d);
          io.observe(d);
        }
        scroller.append(frag);
        count.textContent = `${active + 1} / ${list.length}`;
        for (let j = Math.max(0, active - 2); j <= active + 2; j++) ensureSlide(j);
      },
    };

    // Başlangıç konumuna git
    ensureSlide(startIndex);
    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.children[startIndex]?.offsetTop || 0;
      setActive(startIndex);
    });
    if (!hintShown && list.length > 1) {
      hintShown = true;
      setTimeout(() => viewerInstance && showHint('↕ Sonraki gönderi için kaydır'), 400);
    }
  }

  function download(p, it, k) {
    const isVid = it.type === 'video' && it.videoUrl;
    const url = isVid ? it.videoUrl : it.url || p.thumb;
    if (!url) return toast('İndirilecek medya bulunamadı');
    const who = p.owner?.username || profileState?.username || 'instagram';
    const name = `${who}_${p.shortcode}${p.items.length > 1 ? `_${k + 1}` : ''}.${isVid ? 'mp4' : 'jpg'}`;
    const a = document.createElement('a');
    a.href = `/media?u=${encodeURIComponent(url)}&dl=${encodeURIComponent(name)}`;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    toast('İndirme başladı');
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Bağlantı kopyalandı');
    } catch {
      prompt('Bağlantıyı kopyala:', text);
    }
  }
  async function shareUrl(url, title) {
    if (navigator.share) {
      try {
        await navigator.share({ url, title });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    copy(url);
  }
  const sharePost = (p) => shareUrl(`https://www.instagram.com/p/${p.shortcode}/`, 'Instagram gönderisi');

  // =========================================================================
  // Ayarlar
  // =========================================================================
  function openSettings() {
    const themeLabel = { auto: 'Otomatik', dark: 'Koyu', light: 'Açık' };
    const el = sheet({
      title: 'Ayarlar',
      options: [
        {
          icon: 'theme',
          label: 'Tema',
          value: themeLabel[settings.theme],
          keepOpen: true,
          onClick: (b) => {
            const order = ['auto', 'dark', 'light'];
            settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length];
            saveSettings();
            applyTheme();
            $('.val', b).textContent = themeLabel[settings.theme];
          },
        },
        {
          icon: 'play',
          label: 'Videoları otomatik oynat',
          toggle: settings.autoplay,
          keepOpen: true,
          onClick: (b) => {
            settings.autoplay = !settings.autoplay;
            saveSettings();
            $('.switch', b).classList.toggle('on', settings.autoplay);
          },
        },
        {
          icon: 'volOn',
          label: 'Videoları sesli başlat',
          toggle: settings.sound,
          keepOpen: true,
          onClick: (b) => {
            settings.sound = !settings.sound;
            saveSettings();
            $('.switch', b).classList.toggle('on', settings.sound);
          },
        },
        {
          icon: 'wand',
          label: 'Medyayı sunucu üzerinden yükle',
          toggle: settings.proxy,
          keepOpen: true,
          onClick: (b) => {
            settings.proxy = !settings.proxy;
            saveSettings();
            $('.switch', b).classList.toggle('on', settings.proxy);
          },
        },
        '-',
        { icon: 'exportI', label: 'Kayıtlıları dışa aktar', onClick: exportSaved },
        { icon: 'importI', label: 'Kayıtlıları içe aktar', onClick: importSaved },
        {
          icon: 'trash',
          label: 'Önbelleği temizle',
          danger: true,
          onClick: () => {
            LS.keys('snap.').forEach(LS.del);
            toast('Önbellek temizlendi');
            route();
          },
        },
      ],
      hint:
        'Pencere yalnızca <b>herkese açık</b> profilleri gösterir; hiçbir Instagram hesabı gerektirmez. Kayıtlı hesapların bu cihazda saklanır. Görsel yüklenmiyorsa “sunucu üzerinden yükle” seçeneğini aç.',
    });
    return el;
  }

  function exportSaved() {
    const blob = new Blob([JSON.stringify({ app: 'pencere', version: 1, saved: store.saved }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pencere-kayitlilar-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importSaved() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,text/plain';
    input.onchange = async () => {
      try {
        const text = await input.files[0].text();
        let list;
        try {
          const data = JSON.parse(text);
          list = Array.isArray(data) ? data : data.saved;
        } catch {
          list = text.split(/[\s,]+/);
        }
        let added = 0;
        for (const item of list || []) {
          const username = String(typeof item === 'string' ? item : item?.username || '')
            .replace(/^@/, '')
            .toLowerCase();
          if (!/^[a-z0-9._]{1,30}$/.test(username) || store.isSaved(username)) continue;
          store.saved.push({ username, fullName: item.fullName || '', pic: item.pic || null, isVerified: !!item.isVerified, addedAt: Date.now() });
          added++;
        }
        store.persistSaved();
        toast(`${added} hesap eklendi`);
        route();
        backgroundRefresh();
      } catch {
        toast('Dosya okunamadı');
      }
    };
    input.click();
  }

  // =========================================================================
  // Genel eylemler
  // =========================================================================
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (t) {
      const act = t.dataset.action;
      if (act === 'back') {
        if (history.length > 1 && document.referrer !== 'none' && sessionStorage.getItem('pencere.nav')) history.back();
        else location.hash = '#/';
        return;
      }
      if (act === 'settings') return openSettings();
      if (act === 'clear-recent') {
        store.recent = [];
        LS.set('recent', []);
        return route();
      }
      if (act === 'retry') return profileState && loadProfile(profileState.token, true);
      if (act === 'profile-more') return profileOptions();
      if (act === 'share-profile') return profileState && shareUrl(`https://www.instagram.com/${profileState.username}/`, profileState.username);
      if (act === 'avatar' && profileState?.user?.pic) {
        const d = document.createElement('div');
        d.className = 'avatar-full';
        d.innerHTML = img(profileState.user.pic, 'alt=""');
        document.body.append(d);
        let gone = false;
        const close = () => {
          if (gone) return;
          gone = true;
          d.remove();
        };
        pushOverlay(close);
        d.onclick = popOverlay;
        return;
      }
      if (act === 'toggle-save' && profileState?.user) {
        const nowSaved = store.toggleSave(profileState.user, profileState.posts);
        vibrate(nowSaved ? 25 : 10);
        toast(nowSaved ? 'Kaydedildi — ana sayfadan tek dokunuşla açabilirsin' : 'Kayıtlılardan kaldırıldı');
        updateProfileHeader();
        return;
      }
    }
    const filt = e.target.closest('[data-filter]');
    if (filt && profileState) {
      profileState.filter = filt.dataset.filter;
      renderProfileBody();
      const seg = $('.segmented');
      if (seg && seg.getBoundingClientRect().top < 0) seg.scrollIntoView();
      return;
    }
    const tile = e.target.closest('.tile');
    if (tile && profileState) {
      const list = filteredPosts(profileState);
      return openViewer(list, +tile.dataset.i, {
        source: { getList: () => filteredPosts(profileState), onNearEnd: () => loadMore() },
      });
    }
    const card = e.target.closest('.pc-media');
    if (card && location.hash === '#/feed') return openViewer(feedPosts, +card.dataset.i);
  });

  // =========================================================================
  // Yönlendirici
  // =========================================================================
  const scrollMemory = new Map();
  let currentKey = null;
  function route() {
    const hash = location.hash || '#/';
    if (currentKey) scrollMemory.set(currentKey, window.scrollY);
    app.onclick = null;
    sentinelObserver?.disconnect();
    if (!hash.startsWith('#/u/')) profileState = null;

    let m;
    let tab = null;
    if ((m = hash.match(/^#\/u\/([^/?#]+)/))) {
      const u = decodeURIComponent(m[1]).toLowerCase();
      if (!profileState || profileState.username !== u) viewProfile(u);
      else renderProfileBody();
    } else if ((m = hash.match(/^#\/p\/([A-Za-z0-9_-]+)/))) viewPost(m[1]);
    else if (hash === '#/feed') {
      tab = 'feed';
      viewFeed();
    } else if (hash === '#/search') {
      tab = 'search';
      viewSearch();
    } else {
      tab = 'home';
      viewHome();
    }
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    currentKey = hash;
    const y = scrollMemory.get(hash) || 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }
  window.addEventListener('hashchange', () => {
    try {
      sessionStorage.setItem('pencere.nav', '1');
    } catch {}
    route();
  });
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // Paylaşım hedefi: /?share=<bağlantı> (PWA share_target) ya da /?u=kullanici
  const params = new URLSearchParams(location.search);
  const shared = params.get('share') || params.get('text') || params.get('url') || params.get('u');
  if (shared) {
    history.replaceState(null, '', location.pathname + location.hash);
    const r = parseInput(shared.match(/https?:\/\/\S+/)?.[0] || shared);
    if (r?.post) location.hash = `#/p/${r.post}`;
    else if (r?.user) location.hash = `#/u/${r.user}`;
  }

  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
