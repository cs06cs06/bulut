/* Konsültasyon Defteri — Enfeksiyon Hastalıkları konsültasyon notları.
 * Tüm veriler yalnızca bu cihazda (IndexedDB) tutulur; sunucuya gönderilmez. */
(function () {
  'use strict';

  const C = window.KONSULT_CATALOG;
  const APP = 'konsultasyon-defteri';
  const IN_ARTIFACT = !!(window.claude && typeof window.claude.use === 'function');
  if (IN_ARTIFACT) document.documentElement.classList.add('in-artifact');

  // ------------------------------------------------------------------ yardımcılar
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoOf(new Date());
  const pdate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = pdate(s); d.setDate(d.getDate() + n); return isoOf(d); };
  const ddiff = (a, b) => Math.round((pdate(a) - pdate(b)) / 864e5);
  const fd = (s, year = true) => { if (!s) return ''; const [Y, M, D] = s.split('-'); return year ? `${D}.${M}.${Y}` : `${D}.${M}`; };
  const hhmm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const isNum = (v) => v !== null && v !== undefined && v !== '' && !isNaN(v);
  function fmt(v, dec = 1, trim = false) {
    if (!isNum(v)) return '';
    let s = Number(v).toFixed(dec);
    if (trim && dec > 0) s = s.replace(/\.?0+$/, '');
    return s.replace('.', ',');
  }
  const relDay = (d) => (d === 0 ? 'Bugün' : d === 1 ? 'Dün' : `${d} gün önce`);
  const fwdDay = (d) => (d === 0 ? 'Bugün' : d === 1 ? 'Yarın' : `${d} gün sonra`);

  const I = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    set: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    note: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    cal: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    bksp: '<path d="M9 5h11v14H9l-6-7z"/><path d="M13 9l5 6M18 9l-5 6"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'
  };
  const ic = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

  // ------------------------------------------------------------------ yapılandırma kayıtları
  const CFG = {};
  C.VITALS.forEach((x) => { CFG['v:' + x.k] = x; });
  Object.keys(C.DEMO).forEach((k) => { CFG['d:' + k] = Object.assign({ k }, C.DEMO[k]); });
  const LABS = [];
  C.LAB_GROUPS.forEach((g) => g.items.forEach((x) => { CFG['l:' + x.k] = x; LABS.push(x); }));
  CFG.protocol = { label: 'Protokol / dosya no', digits: true, maxLen: 14, unit: '' };
  CFG.room = { label: 'Oda no', digits: true, maxLen: 5, unit: '' };
  const ORG = {}; C.ORGANISMS.forEach((o) => { ORG[o.n] = o.g; });
  const ABX = {}; C.ABX_GROUPS.forEach((g) => g.items.forEach((a) => { ABX[a.n] = a; }));
  const ALTERED = ['Konfüze', 'Letarjik', 'Stupor', 'Koma'];

  // ------------------------------------------------------------------ kayıt katmanı
  const Store = {
    mode: 'mem', db: null,
    async init() {
      try { this.db = await idbOpen(); this.mode = 'idb'; return; } catch (e) { /* devam */ }
      try { localStorage.setItem('kd:t', '1'); localStorage.removeItem('kd:t'); this.mode = 'ls'; } catch (e) { this.mode = 'mem'; }
    },
    async load() {
      if (this.mode === 'idb') {
        const patients = await idbDo('patients', 'readonly', (s) => s.getAll());
        const meta = await idbDo('meta', 'readonly', (s) => s.get('meta'));
        return { patients: patients || [], meta: meta || {} };
      }
      if (this.mode === 'ls') {
        try {
          return { patients: JSON.parse(localStorage.getItem('kd:patients') || '[]'), meta: JSON.parse(localStorage.getItem('kd:meta') || '{}') };
        } catch (e) { return { patients: [], meta: {} }; }
      }
      return { patients: [], meta: {} };
    },
    async putPatients(list) {
      if (this.mode === 'idb') {
        const copies = list.map((p) => JSON.parse(JSON.stringify(p)));
        await idbDo('patients', 'readwrite', (s) => { copies.forEach((p) => s.put(p)); });
      } else if (this.mode === 'ls') {
        localStorage.setItem('kd:patients', JSON.stringify(S.patients));
      }
    },
    async delPatient(id) {
      if (this.mode === 'idb') await idbDo('patients', 'readwrite', (s) => s.delete(id));
      else if (this.mode === 'ls') localStorage.setItem('kd:patients', JSON.stringify(S.patients));
    },
    async clearAll() {
      if (this.mode === 'idb') { await idbDo('patients', 'readwrite', (s) => s.clear()); await idbDo('meta', 'readwrite', (s) => s.clear()); }
      else if (this.mode === 'ls') { localStorage.removeItem('kd:patients'); localStorage.removeItem('kd:meta'); }
    },
    async putMeta(meta) {
      const copy = JSON.parse(JSON.stringify(meta));
      if (this.mode === 'idb') await idbDo('meta', 'readwrite', (s) => s.put(copy, 'meta'));
      else if (this.mode === 'ls') localStorage.setItem('kd:meta', JSON.stringify(copy));
    }
  };
  function idbOpen() {
    return new Promise((res, rej) => {
      if (!('indexedDB' in window)) { rej(new Error('IndexedDB yok')); return; }
      let rq;
      try { rq = indexedDB.open(APP, 1); } catch (e) { rej(e); return; }
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains('patients')) db.createObjectStore('patients', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
      rq.onblocked = () => rej(new Error('blocked'));
    });
  }
  function idbDo(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = Store.db.transaction(store, mode);
      const r = fn(tx.objectStore(store));
      tx.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }

  // ------------------------------------------------------------------ durum
  const S = { patients: [], meta: {} };
  const ui = {
    view: 'list', pid: null, vid: null, tab: 'kimlik', open: null,
    list: { tab: 'active', ward: null, q: '' }, noteMode: 'full', saveErr: false
  };
  const dirty = new Set();
  let saveTimer = null;

  function defaultMeta() {
    return { doctor: '', theme: 'auto', font: 'n', haptic: true, wake: false, pinHash: null, pinSalt: null, lockMin: 5, custom: {}, recentWards: [], recentDrugs: [], seeded: false, lastBackup: null, persisted: null };
  }
  function newVisit() {
    return { id: uid(), date: today(), time: hhmm(), vitals: {}, labs: {}, labDate: null, tit: [], exam: {}, examNote: '', dx: [], assessment: '', recs: [], nextDate: null, nextPrn: false, abxInNote: true };
  }
  function newPatient() {
    return {
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(), status: 'active', closedReason: null, closedAt: null,
      name: '', protocol: '', age: null, sex: null, weight: null, height: null, ward: '', room: '', bed: '', requester: '',
      admitDate: null, urgency: 'Rutin', reasons: [], reasonNote: '', comorb: [], risks: [], allergy: [], allergyNote: '',
      devices: [], cultures: [], abx: [], sero: {}, seroNote: '', imaging: [], visits: [newVisit()]
    };
  }
  function normalize(p) {
    const base = newPatient();
    Object.keys(base).forEach((k) => { if (p[k] === undefined) p[k] = base[k]; });
    ['reasons', 'comorb', 'risks', 'allergy', 'devices', 'cultures', 'abx', 'imaging'].forEach((k) => { if (!Array.isArray(p[k])) p[k] = []; });
    if (!p.sero || typeof p.sero !== 'object') p.sero = {};
    if (!Array.isArray(p.visits) || !p.visits.length) p.visits = [newVisit()];
    p.visits.forEach((v) => {
      const b = newVisit();
      Object.keys(b).forEach((k) => { if (v[k] === undefined) v[k] = k === 'id' ? uid() : b[k]; });
    });
    p.cultures.forEach((c) => { if (!Array.isArray(c.isolates) || !c.isolates.length) c.isolates = [{ id: uid(), resist: [], ast: {} }]; });
    sortVisits(p);
    return p;
  }
  function sortVisits(p) { p.visits.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); }

  const cur = () => S.patients.find((p) => p.id === ui.pid);
  function curVisit(p = cur()) {
    if (!p) return null;
    return p.visits.find((v) => v.id === ui.vid) || p.visits[p.visits.length - 1];
  }
  const lastVisit = (p) => p.visits[p.visits.length - 1];
  const custom = (cat) => (S.meta.custom && S.meta.custom[cat]) || [];

  // "V.vitals.temp", "cultures.#id.type" gibi yolları çözer
  function resolve(path, create = true) {
    const p = cur(); if (!p) return null;
    const segs = path.split('.');
    let o = p;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (s === 'V') { o = curVisit(p); continue; }
      if (s[0] === '#') { o = Array.isArray(o) ? o.find((x) => x.id === s.slice(1)) : null; if (!o) return null; continue; }
      if (o[s] == null) { if (!create) return null; o[s] = {}; }
      o = o[s];
    }
    return { o, k: segs[segs.length - 1] };
  }
  function getv(path) { const r = resolve(path, false); return r && r.o ? r.o[r.k] : undefined; }
  function setv(path, val) {
    const r = resolve(path); if (!r) return;
    if (val === null || val === undefined || val === '') delete r.o[r.k]; else r.o[r.k] = val;
    touch();
  }
  function touch(p = cur()) {
    if (!p) return;
    p.updatedAt = Date.now();
    if (p.demo && p.name && !p.name.startsWith('ÖRNEK')) p.demo = false;
    dirty.add(p.id);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 450);
  }
  async function flush() {
    clearTimeout(saveTimer);
    if (!dirty.size) return;
    const list = [...dirty].map((id) => S.patients.find((p) => p.id === id)).filter(Boolean);
    dirty.clear();
    try {
      await Store.putPatients(list);
      ui.saveErr = false;
      flashSaved();
    } catch (e) {
      list.forEach((p) => dirty.add(p.id));
      ui.saveErr = true;
      toast('Kayıt yapılamadı. Depolama dolu olabilir; yedek alın.');
    }
  }
  let metaTimer = null;
  function saveMeta() {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(() => { Store.putMeta(S.meta).catch(() => toast('Ayarlar kaydedilemedi.')); }, 200);
  }
  function flashSaved() {
    const el = $('#saved'); if (!el) return;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  // ------------------------------------------------------------------ hesaplamalar
  function latestLab(p, key, uptoVisit) {
    const idx = uptoVisit ? p.visits.indexOf(uptoVisit) : p.visits.length - 1;
    for (let i = idx; i >= 0; i--) {
      const v = p.visits[i];
      if (isNum(v.labs && v.labs[key])) return { v: Number(v.labs[key]), date: v.labDate || v.date, visit: v };
    }
    return null;
  }
  function prevLab(p, v, key) {
    const idx = p.visits.indexOf(v);
    for (let i = idx - 1; i >= 0; i--) {
      const x = p.visits[i];
      if (isNum(x.labs && x.labs[key])) return { v: Number(x.labs[key]), date: x.labDate || x.date };
    }
    return null;
  }
  function renal(p, v) {
    const L = latestLab(p, 'cr', v); if (!L || L.v <= 0) return null;
    const cr = L.v; const out = { cr, date: L.date, hd: p.comorb.includes('Hemodiyaliz') || p.comorb.includes('Periton diyalizi') };
    if (isNum(p.age) && p.sex) {
      const f = p.sex === 'K'; const k = f ? 0.7 : 0.9; const a = f ? -0.241 : -0.302;
      out.egfr = 142 * Math.pow(Math.min(cr / k, 1), a) * Math.pow(Math.max(cr / k, 1), -1.2) * Math.pow(0.9938, p.age) * (f ? 1.012 : 1);
      if (isNum(p.weight)) {
        let w = Number(p.weight); out.wl = 'gerçek kilo';
        if (isNum(p.height)) {
          const ibw = (f ? 45.5 : 50) + 0.9055 * (p.height - 152.4);
          if (ibw > 0 && w > 1.2 * ibw) { w = ibw + 0.4 * (w - ibw); out.wl = 'düzeltilmiş kilo'; }
        }
        out.crcl = ((140 - p.age) * w) / (72 * cr) * (f ? 0.85 : 1);
      }
    }
    return out;
  }
  function qsofa(v) {
    const vt = v.vitals || {}; let s = 0, known = 0; const miss = [];
    if (isNum(vt.rr)) { known++; if (vt.rr >= 22) s++; } else miss.push('SS');
    if (isNum(vt.sbp)) { known++; if (vt.sbp <= 100) s++; } else miss.push('TA');
    const bil = v.exam && v.exam.bil;
    if (isNum(vt.gcs) || bil) { known++; if ((isNum(vt.gcs) && vt.gcs < 15) || ALTERED.includes(bil)) s++; } else miss.push('bilinç');
    return { s, known, miss };
  }
  const mapOf = (vt) => (isNum(vt.sbp) && isNum(vt.dbp) ? (Number(vt.sbp) + 2 * Number(vt.dbp)) / 3 : null);
  function abxDay(a) {
    if (!a.start) return null;
    const end = a.status === 'off' && a.stopDate ? a.stopDate : today();
    return ddiff(end, a.start) + 1;
  }
  function apprEnd(a) {
    if (a.appr !== 'Onaylandı' || !a.apprDays || !a.apprDate) return null;
    return addDays(a.apprDate, Number(a.apprDays) - 1);
  }
  const activeAbx = (p) => p.abx.filter((a) => a.status !== 'off');
  function alerts(p) {
    const out = []; const t = today(); const lv = lastVisit(p);
    if (p.status !== 'active') return out;
    if (lv.nextDate && lv.nextDate <= t) out.push({ t: lv.nextDate < t ? `Kontrol gecikti (${fd(lv.nextDate, false)})` : 'Kontrol bugün', c: 'warn' });
    p.abx.forEach((a) => {
      if (a.status === 'off') return;
      const e = apprEnd(a); if (!e) return;
      if (e < t) out.push({ t: `${a.drug}: onay süresi doldu`, c: 'hi' });
      else if (e === t) out.push({ t: `${a.drug}: onay bugün bitiyor`, c: 'hi' });
      else if (e === addDays(t, 1)) out.push({ t: `${a.drug}: onay yarın bitiyor`, c: 'warn' });
    });
    const pend = p.cultures.filter((c) => !c.result || c.result === 'Bekleniyor').length;
    if (pend) out.push({ t: `${pend} kültür bekleniyor`, c: 'mute' });
    if (p.visits.some((v) => v.date === t)) out.push({ t: 'Bugün görüldü', c: 'ok' });
    return out;
  }
  const needsToday = (p) => p.status === 'active' && alerts(p).some((a) => a.c === 'hi' || a.c === 'warn');
  const ageSex = (p, short) => {
    const a = isNum(p.age) ? p.age : ''; const s = p.sex || '';
    if (short) return `${a}${s}` || '—';
    return [a !== '' ? `${a} yaş` : '', s === 'E' ? 'erkek' : s === 'K' ? 'kadın' : ''].filter(Boolean).join(', ');
  };
  const roomBed = (p) => (p.room ? `${p.room}${p.bed ? '-' + p.bed : ''}` : p.bed ? `Yatak ${p.bed}` : '');
  const locStr = (p) => [p.ward, roomBed(p)].filter(Boolean).join(' ');
  function labFlag(cfg, v) { if (!isNum(v)) return ''; if (isNum(cfg.lo) && v < cfg.lo) return 'lo'; if (isNum(cfg.hi) && v > cfg.hi) return 'hi'; return ''; }
  function vitalFlag(cfg, v) { if (!isNum(v)) return ''; if (v < cfg.lo) return 'lo'; if (v > cfg.hi) return 'hi'; return ''; }
  function gramOf(c, iso) {
    if (iso && iso.org && ORG[iso.org]) return ORG[iso.org];
    const g = c.gram || '';
    if (g.startsWith('Gram (+)')) return '+'; if (g.startsWith('Gram (−)')) return '-'; if (g.startsWith('Maya')) return 'f';
    return '-';
  }
  const orgCls = (g) => ({ '+': 'gp', '-': 'gn', f: 'fu', o: 'ot' }[g] || 'ot');

  // ------------------------------------------------------------------ bileşenler
  function withExtras(list, cat, selected) {
    const out = list.slice();
    custom(cat).forEach((x) => { if (!out.includes(x)) out.push(x); });
    (Array.isArray(selected) ? selected : selected ? [selected] : []).forEach((x) => { if (typeof x === 'string' && !out.includes(x)) out.push(x); });
    return out;
  }
  function chips(path, options, o = {}) {
    const val = getv(path);
    const multi = !o.single;
    const sel = multi ? (Array.isArray(val) ? val : []) : val;
    let h = `<div class="chips${o.cls ? ' ' + o.cls : ''}" data-path="${esc(path)}" data-mode="${multi ? 'm' : 's'}"${o.ex ? ` data-ex="${esc(o.ex)}"` : ''}${o.re ? ' data-re="1"' : ''}${o.num ? ' data-num="1"' : ''}${o.keep ? ' data-keep="1"' : ''}>`;
    options.forEach((op) => {
      const v = typeof op === 'object' ? op.v : op;
      const t = typeof op === 'object' ? (op.t != null ? op.t : op.v) : op;
      const on = multi ? sel.includes(v) : sel === v;
      h += `<button type="button" class="chip${op.cls ? ' ' + op.cls : ''}${on ? ' on' : ''}" data-act="chip" data-val="${esc(v)}">${esc(t)}</button>`;
    });
    if (o.add) h += `<button type="button" class="chip add" data-act="chip-add" data-cat="${o.add}">${ic('plus')}Ekle</button>`;
    return h + '</div>';
  }
  function syncChips(g) {
    const val = getv(g.dataset.path);
    const multi = g.dataset.mode === 'm';
    g.querySelectorAll('.chip[data-act="chip"]').forEach((b) => {
      let v = b.dataset.val; if (g.dataset.num) v = Number(v);
      b.classList.toggle('on', multi ? Array.isArray(val) && val.includes(v) : val === v);
    });
  }
  const field = (label, inner, extra = '') => `<div class="fld"><div class="lbl">${label}${extra}</div>${inner}</div>`;
  const sec = (title, inner, extra = '') => `<section class="sec"><h2 class="sec-h"><span>${title}</span>${extra}</h2>${inner}</section>`;
  const textIn = (path, ph, o = {}) => {
    const v = getv(path) || '';
    return o.multi
      ? `<textarea class="txt" rows="${o.rows || 3}" data-bind="${esc(path)}" placeholder="${esc(ph)}">${esc(v)}</textarea>`
      : `<input class="txt" type="text" data-bind="${esc(path)}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off"${o.caps ? ' autocapitalize="characters"' : ''}>`;
  };
  function slider(path, key) {
    const cfg = CFG[key]; const v = getv(path); const has = isNum(v);
    const span = cfg.max - cfg.min;
    const pos = ((Math.min(Math.max(has ? v : cfg.def, cfg.min), cfg.max) - cfg.min) / span) * 100;
    const band = cfg.lo != null ? `<div class="vs-band" style="left:${((cfg.lo - cfg.min) / span) * 100}%;width:${Math.max(((cfg.hi - cfg.lo) / span) * 100, 1.2)}%"></div>` : '';
    const flag = cfg.lo != null ? vitalFlag(cfg, v) : '';
    return `<div class="vs${has ? '' : ' empty'}${flag ? ' f-' + flag : ''}" data-path="${esc(path)}" data-cfg="${key}">
      <div class="vs-top"><span class="vs-l">${esc(cfg.label)}</span>
        <button type="button" class="vs-v" data-act="numpad" data-path="${esc(path)}" data-cfg="${key}"${path.startsWith('V.vitals') ? ' data-seq="vital"' : ''}><b>${has ? fmt(v, cfg.dec) : '—'}</b><small>${esc(cfg.unit)}</small></button></div>
      <div class="vs-row">
        <button type="button" class="vs-btn" data-step="-1" aria-label="${esc(cfg.label)} azalt">−</button>
        <div class="vs-track" role="slider" aria-label="${esc(cfg.label)}" aria-valuemin="${cfg.min}" aria-valuemax="${cfg.max}" aria-valuenow="${has ? v : ''}">${band}<div class="vs-rail"></div><div class="vs-thumb" style="left:${pos}%"></div></div>
        <button type="button" class="vs-btn" data-step="1" aria-label="${esc(cfg.label)} artır">+</button>
      </div></div>`;
  }
  function numTile(path, key, o = {}) {
    const cfg = CFG[key]; const v = getv(path);
    const show = cfg.digits ? (v || '—') : isNum(v) ? fmt(v, cfg.dec, true) : '—';
    return `<button type="button" class="ntile${v ? '' : ' empty'}" data-act="numpad" data-path="${esc(path)}" data-cfg="${key}"><span class="nt-l">${esc(o.label || cfg.label)}</span><b class="nt-v">${esc(show)}</b></button>`;
  }
  function dateQuick(path, o = {}) {
    const v = getv(path) || ''; const t = today();
    const days = o.days || [0, 1, 2, 3, 5, 7];
    const vals = days.map((d) => addDays(t, o.future ? d : -d));
    const matched = vals.includes(v);
    let h = `<div class="chips dq">`;
    days.forEach((d, i) => {
      const lbl = o.labels ? o.labels[i] : o.future ? fwdDay(d) : relDay(d);
      h += `<button type="button" class="chip${v === vals[i] ? ' on' : ''}" data-act="dq" data-path="${esc(path)}" data-val="${vals[i]}">${lbl}</button>`;
    });
    h += `<span class="chip dp${v && !matched ? ' on' : ''}">${ic('cal')}<span>${v && !matched ? fd(v) : 'Tarih'}</span><input type="date" class="dp-in" data-dq="${esc(path)}" value="${v}" aria-label="Tarih seç"></span></div>`;
    if (v && o.count) {
      const n = ddiff(o.countTo || t, v) + 1;
      h += `<div class="hint">${fd(v)} · ${n > 0 ? `${n}. gün` : 'ileri tarih'}</div>`;
    } else if (v && o.show) h += `<div class="hint">${fd(v)}</div>`;
    return h;
  }
  function toggleBtn(path, label) {
    const on = !!getv(path);
    return `<button type="button" class="tgl${on ? ' on' : ''}" data-act="toggle" data-path="${esc(path)}" aria-pressed="${on}"><span class="tgl-k"></span>${esc(label)}</button>`;
  }
  const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;

  // ------------------------------------------------------------------ görünümler
  const TABS = [
    { k: 'kimlik', t: 'Kimlik' }, { k: 'neden', t: 'Neden · Öykü' }, { k: 'vital', t: 'Vital' },
    { k: 'muayene', t: 'Muayene' }, { k: 'lab', t: 'Lab' }, { k: 'mikro', t: 'Mikro' },
    { k: 'abx', t: 'Antibiyotik' }, { k: 'plan', t: 'Plan' }, { k: 'not', t: 'Not' }
  ];
  function tabFilled(p, v, k) {
    switch (k) {
      case 'kimlik': return !!(p.name || isNum(p.age) || p.ward);
      case 'neden': return p.reasons.length > 0;
      case 'vital': return Object.keys(v.vitals).length > 0;
      case 'muayene': return Object.keys(v.exam).length > 0 || !!v.examNote;
      case 'lab': return Object.keys(v.labs).length > 0 || v.tit.length > 0;
      case 'mikro': return p.cultures.length > 0 || Object.keys(p.sero).length > 0 || p.imaging.length > 0;
      case 'abx': return p.abx.length > 0;
      case 'plan': return v.recs.length > 0 || v.dx.length > 0;
      default: return false;
    }
  }

  function render() {
    const app = $('#app');
    if (ui.view === 'patient' && cur()) app.innerHTML = viewPatient();
    else if (ui.view === 'settings') app.innerHTML = viewSettings();
    else { ui.view = 'list'; app.innerHTML = viewList(); renderList(); }
  }

  // --- liste
  function viewList() {
    const act = S.patients.filter((p) => p.status === 'active');
    const due = act.filter(needsToday);
    const closed = S.patients.filter((p) => p.status !== 'active');
    const dstr = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    const wards = [...new Set(act.map((p) => p.ward).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    const tabs = [['active', 'Aktif', act.length], ['due', 'Bugün bakılacak', due.length], ['closed', 'Kapalı', closed.length]];
    let warn = '';
    if (Store.mode === 'mem') warn = `<div class="banner hi">Bu tarayıcı kayıt yapmaya izin vermiyor. Girilen bilgiler sayfa kapanınca silinir.</div>`;
    else if (S.patients.some((p) => !p.demo)) {
      const lb = S.meta.lastBackup; const days = lb ? Math.floor((Date.now() - lb) / 864e5) : null;
      if (days === null || days >= 7) warn = `<button class="banner warn" data-act="go-settings">${days === null ? 'Henüz yedek alınmadı.' : `Son yedek ${days} gün önce.`} Telefon kaybolursa veya tarayıcı verisi silinirse notlar gider. <u>Yedek al</u></button>`;
    }
    return `<div class="screen list-screen">
      <header class="bar"><div class="bar-t"><b>Konsültasyon Defteri</b><span>${esc(dstr)}</span></div>
        <button class="ibtn" data-act="go-settings" aria-label="Ayarlar">${ic('set')}</button></header>
      <div class="wrap">
        ${warn}
        <div class="seg" role="tablist">${tabs.map(([k, t, n]) => `<button role="tab" class="seg-b${ui.list.tab === k ? ' on' : ''}" data-act="list-tab" data-k="${k}">${t}<em>${n}</em></button>`).join('')}</div>
        ${wards.length > 1 && ui.list.tab !== 'closed' ? `<div class="chips scroll wards">${['Tümü', ...wards].map((w) => `<button class="chip${(ui.list.ward || 'Tümü') === w ? ' on' : ''}" data-act="list-ward" data-val="${esc(w)}">${esc(w)}</button>`).join('')}</div>` : ''}
        <label class="search">${ic('search')}<input type="search" id="q" placeholder="Hasta, servis, oda ara" value="${esc(ui.list.q)}" autocomplete="off"></label>
        <div id="plist"></div>
      </div>
      <div class="dock"><button class="btn ghost" data-act="round">${ic('list')}Tur özeti</button><button class="btn primary grow" data-act="new-patient">${ic('plus')}Yeni konsültasyon</button></div>
    </div>`;
  }
  function renderList() {
    const box = $('#plist'); if (!box) return;
    const q = ui.list.q.trim().toLocaleLowerCase('tr');
    let list = S.patients.filter((p) => (ui.list.tab === 'closed' ? p.status !== 'active' : p.status === 'active'));
    if (ui.list.tab === 'due') list = list.filter(needsToday);
    if (ui.list.ward && ui.list.tab !== 'closed') list = list.filter((p) => p.ward === ui.list.ward);
    if (q) list = list.filter((p) => [p.name, p.ward, p.room, p.protocol, ...p.reasons].join(' ').toLocaleLowerCase('tr').includes(q));
    if (!list.length) {
      box.innerHTML = `<div class="empty-st">${ui.list.tab === 'closed' ? 'Takibi sonlanan hasta yok.' : q ? 'Aramaya uyan hasta yok.' : ui.list.tab === 'due' ? 'Bugün için bekleyen kontrol veya biten onay yok.' : 'Aktif konsültasyon yok. Alttaki butonla yeni hasta ekleyin.'}</div>`;
      return;
    }
    if (ui.list.tab === 'closed') {
      list.sort((a, b) => (b.closedAt || b.updatedAt) - (a.closedAt || a.updatedAt));
      box.innerHTML = `<ul class="plist">${list.map(card).join('')}</ul>`;
      return;
    }
    list.sort((a, b) => (a.ward || 'ÿ').localeCompare(b.ward || 'ÿ', 'tr') || (parseInt(a.room, 10) || 1e9) - (parseInt(b.room, 10) || 1e9) || String(a.bed).localeCompare(String(b.bed)));
    let h = ''; let lastW = null;
    list.forEach((p) => {
      const w = p.ward || 'Servis girilmedi';
      if (w !== lastW) { if (lastW !== null) h += '</ul>'; h += `<h3 class="grp">${esc(w)}</h3><ul class="plist">`; lastW = w; }
      h += card(p);
    });
    box.innerHTML = h + '</ul>';
  }
  function card(p) {
    const lv = lastVisit(p); const al = alerts(p); const q = qsofa(lv);
    const abx = activeAbx(p);
    const what = (lv.dx.length ? lv.dx : p.reasons).slice(0, 3).join(', ');
    const allergy = p.allergy.filter((a) => a !== 'Yok');
    return `<li><button class="pcard${q.s >= 2 ? ' sev' : ''}${p.urgency === 'Acil' && lv === p.visits[0] ? ' urgent' : ''}" data-act="open" data-id="${p.id}">
      <span class="pc-1"><b class="pc-n">${esc(p.name || 'İsimsiz hasta')}</b>${p.demo ? pill('ÖRNEK', 'demo') : ''}<span class="pc-loc">${esc(roomBed(p) || (ui.list.tab === 'closed' ? p.ward : ''))}</span></span>
      <span class="pc-2">${esc(ageSex(p, true))}${what ? ' · ' + esc(what) : ''}${p.status !== 'active' ? ' · ' + esc(p.closedReason || 'Kapalı') : ''}</span>
      ${abx.length || allergy.length ? `<span class="pc-3">${allergy.length ? pill('Alerji: ' + allergy.join(', '), 'hi') : ''}${abx.map((a) => `<span class="pill abx${a.status === 'start' ? ' plan' : a.status === 'stop' ? ' stop' : ''}">${esc(a.drug)} <b>${a.status === 'start' ? 'öneri' : 'G' + (abxDay(a) || '?')}</b></span>`).join('')}</span>` : ''}
      ${al.length ? `<span class="pc-3">${al.map((x) => pill(x.t, x.c)).join('')}</span>` : ''}
    </button></li>`;
  }

  // --- hasta
  function viewPatient() {
    const p = cur(); const v = curVisit(p);
    const vi = p.visits.indexOf(v);
    return `<div class="screen p-screen">
      <div class="p-head">
        <header class="bar">
          <button class="ibtn" data-act="back" aria-label="Listeye dön">${ic('back')}</button>
          <button class="p-id" data-act="tab" data-k="kimlik"><b>${esc(p.name || 'Yeni hasta')}</b><span>${esc([ageSex(p, true), locStr(p)].filter((x) => x && x !== '—').join(' · ') || 'Kimlik bilgisi girilmedi')}</span></button>
          <span id="saved" class="saved" aria-live="polite">${ic('check')}Kaydedildi</span>
          <button class="ibtn" data-act="p-menu" aria-label="Hasta menüsü">${ic('more')}</button>
        </header>
        <div class="p-sum" id="psum">${summaryChips(p, v)}</div>
        <nav class="tabs" id="tabs">${TABS.map((t) => `<button class="tab${ui.tab === t.k ? ' on' : ''}${tabFilled(p, v, t.k) ? ' has' : ''}" data-act="tab" data-k="${t.k}">${t.t}</button>`).join('')}</nav>
      </div>
      ${p.status !== 'active' ? `<div class="banner mute wrap-b">Takip sonlandı: ${esc(p.closedReason || '')} ${p.closedAt ? '· ' + fd(isoOf(new Date(p.closedAt))) : ''} <button class="lnk" data-act="reopen">Yeniden aç</button></div>` : ''}
      <main class="wrap tabbody" id="tabbody">${renderTab(p, v, vi)}</main>
      <div class="dock"><button class="btn ghost" data-act="tab-step" data-d="-1" aria-label="Önceki bölüm">${ic('back')}</button>
        <button class="btn primary grow" data-act="tab" data-k="not">${ic('note')}Notu oluştur</button>
        <button class="btn ghost" data-act="tab-step" data-d="1" aria-label="Sonraki bölüm">${ic('right')}</button></div>
    </div>`;
  }
  function summaryChips(p, v) {
    const out = [];
    const vi = p.visits.indexOf(v);
    out.push(`<button class="pill vis" data-act="visits">${vi === 0 ? 'İlk vizit' : `Vizit ${vi + 1}`} · ${fd(v.date, false)}${v.date !== today() ? ' ⚠' : ''} ▾</button>`);
    const allergy = p.allergy.filter((a) => a !== 'Yok');
    if (allergy.length) out.push(pill('Alerji: ' + allergy.join(', '), 'hi'));
    const r = renal(p, v);
    if (r) {
      if (r.hd) out.push(pill('Diyaliz', 'warn'));
      else if (r.crcl != null) out.push(pill(`CrCl ${Math.round(r.crcl)}`, r.crcl < 30 ? 'hi' : r.crcl < 60 ? 'warn' : 'ok'));
      else if (r.egfr != null) out.push(pill(`eGFR ${Math.round(r.egfr)}`, r.egfr < 30 ? 'hi' : r.egfr < 60 ? 'warn' : 'ok'));
      else out.push(pill(`Kre ${fmt(r.cr, 2, true)}`, r.cr > 1.2 ? 'warn' : ''));
    }
    const q = qsofa(v);
    if (q.known >= 2 || q.s >= 2) out.push(pill(`qSOFA ${q.s}`, q.s >= 2 ? 'hi' : ''));
    const vt = v.vitals;
    const tm = Math.max(isNum(vt.temp) ? vt.temp : -1, isNum(vt.tmax) ? vt.tmax : -1);
    if (tm > 0) out.push(pill(`${fmt(tm, 1)}°C`, tm >= 38 ? 'hi' : ''));
    activeAbx(p).forEach((a) => out.push(pill(`${a.drug} ${a.status === 'start' ? 'öneri' : 'G' + (abxDay(a) || '?')}`, 'abx')));
    return out.join('');
  }
  function refreshSummary() {
    const p = cur(); if (!p || ui.view !== 'patient') return;
    const v = curVisit(p);
    const s = $('#psum'); if (s) s.innerHTML = summaryChips(p, v);
    document.querySelectorAll('#tabs .tab').forEach((b) => b.classList.toggle('has', tabFilled(p, v, b.dataset.k)));
    document.querySelectorAll('[data-live]').forEach((el) => { el.innerHTML = liveBlock(el.dataset.live, p, v); });
    const pid = $('.p-id');
    if (pid) pid.innerHTML = `<b>${esc(p.name || 'Yeni hasta')}</b><span>${esc([ageSex(p, true), locStr(p)].filter((x) => x && x !== '—').join(' · ') || 'Kimlik bilgisi girilmedi')}</span>`;
  }
  function rerenderTab() {
    const p = cur(); if (!p) return;
    const v = curVisit(p); const tb = $('#tabbody'); if (!tb) return;
    const y = window.scrollY;
    tb.innerHTML = renderTab(p, v, p.visits.indexOf(v));
    window.scrollTo(0, y);
    refreshSummary();
  }
  function renderTab(p, v, vi) {
    const visitBanner = v.date !== today() && ['vital', 'muayene', 'lab', 'plan'].includes(ui.tab)
      ? `<div class="banner warn">Bu bölüm ${fd(v.date)} tarihli vizite ait. <button class="lnk" data-act="new-visit">Bugün için yeni vizit başlat</button></div>` : '';
    switch (ui.tab) {
      case 'kimlik': return tabKimlik(p, v);
      case 'neden': return tabNeden(p);
      case 'vital': return visitBanner + tabVital(p, v);
      case 'muayene': return visitBanner + tabMuayene(p, v, vi);
      case 'lab': return visitBanner + tabLab(p, v);
      case 'mikro': return tabMikro(p);
      case 'abx': return tabAbx(p);
      case 'plan': return visitBanner + tabPlan(p, v, vi);
      case 'not': return tabNot(p, v);
      default: return '';
    }
  }

  function tabKimlik(p) {
    const recent = (S.meta.recentWards || []).filter((w) => w !== p.ward).slice(0, 5);
    return sec('Hasta', `
        ${field('Ad soyad', textIn('name', 'Baş harfler yeterli (ör. A.Y.)', { caps: true }), '<span class="lbl-note">Gizlilik için baş harf önerilir</span>')}
        <div class="grid2">${numTile('protocol', 'protocol')}${chips('sex', [{ v: 'E', t: 'Erkek' }, { v: 'K', t: 'Kadın' }], { single: true, cls: 'big' })}</div>
        ${slider('age', 'd:age')}
        ${slider('weight', 'd:weight')}
        ${slider('height', 'd:height')}`) +
      sec('Yer', `
        ${recent.length ? field('Son kullanılan', chips('ward', recent, { single: true })) : ''}
        ${field('Servis', chips('ward', withExtras(C.WARDS, 'ward', p.ward), { single: true, add: 'ward', cls: 'wardchips' }))}
        <div class="grid2">${numTile('room', 'room')}<div>${chips('bed', C.BEDS, { single: true, cls: 'beds' })}</div></div>
        ${field('Yatış tarihi', dateQuick('admitDate', { days: [0, 1, 2, 3, 5, 7, 10, 14], count: true }))}
        ${field('İsteyen hekim / birim', textIn('requester', 'İsteğe bağlı'))}`) +
      sec('Aciliyet', chips('urgency', ['Rutin', 'Acil'], { single: true, cls: 'big', keep: true }));
  }

  function tabNeden(p) {
    const devs = withExtras(C.DEVICES, 'device', p.devices.map((d) => d.type));
    const devRows = p.devices.map((d) => `<div class="dev"><div class="dev-h"><b>${esc(d.type)}</b><button class="lnk" data-act="dev" data-val="${esc(d.type)}">Kaldır</button></div>
        ${dateQuick(`devices.#${d.id}.date`, { days: [0, 1, 2, 3, 5, 7, 10, 14], count: true })}</div>`).join('');
    return sec('Konsültasyon nedeni', C.REASON_GROUPS.map((g, i) => field(g.t, chips('reasons', i === C.REASON_GROUPS.length - 1 ? withExtras(g.items, 'reason', p.reasons.filter((r) => !C.REASON_GROUPS.some((x) => x.items.includes(r)))) : g.items, i === C.REASON_GROUPS.length - 1 ? { add: 'reason' } : {}))).join('') +
        field('Ek açıklama', textIn('reasonNote', 'Kısa not (isteğe bağlı)', { multi: true, rows: 2 }))) +
      sec('Alerji', chips('allergy', withExtras(['Yok', ...C.ALLERGY], 'allergy', p.allergy), { ex: 'Yok', add: 'allergy', cls: 'alg' }) +
        (p.allergy.some((a) => a !== 'Yok') ? field('Reaksiyon', textIn('allergyNote', 'Döküntü, anafilaksi vb.')) : '')) +
      sec('Özgeçmiş / komorbidite', chips('comorb', withExtras(C.COMORB, 'comorb', p.comorb), { add: 'comorb' })) +
      sec('Risk faktörleri', chips('risks', withExtras(C.RISKS, 'risk', p.risks), { add: 'risk' })) +
      sec('Kateter ve cihazlar', `<div class="chips">${devs.map((d) => `<button class="chip${p.devices.some((x) => x.type === d) ? ' on' : ''}" data-act="dev" data-val="${esc(d)}">${esc(d)}</button>`).join('')}<button type="button" class="chip add" data-act="chip-add" data-cat="device">${ic('plus')}Ekle</button></div>${devRows ? `<div class="devs">${devRows}</div>` : ''}`);
  }

  function tabVital(p, v) {
    return `<div class="live" data-live="vital">${liveBlock('vital', p, v)}</div>` +
      sec('Ölçümler', C.VITALS.map((x) => slider('V.vitals.' + x.k, 'v:' + x.k)).join('')) +
      sec('Oksijen desteği', chips('V.vitals.o2', C.O2, { single: true })) +
      sec('Vazopressör / inotrop', chips('V.vitals.press', C.PRESSORS)) +
      sec('İdrar çıkışı', chips('V.vitals.urine', C.URINE, { single: true }));
  }
  function liveBlock(k, p, v) {
    if (k === 'vital') {
      const q = qsofa(v); const m = mapOf(v.vitals);
      return `<div class="kpis">
        <div class="kpi${q.s >= 2 ? ' hi' : ''}"><span>qSOFA</span><b>${q.known ? q.s : '—'}<small>/3</small></b><em>${q.miss.length ? 'Eksik: ' + q.miss.join(', ') : q.s >= 2 ? 'Sepsis açısından yüksek risk' : 'Tam'}</em></div>
        <div class="kpi${m != null && m < 65 ? ' hi' : ''}"><span>Ortalama arter basıncı</span><b>${m != null ? Math.round(m) : '—'}<small>mmHg</small></b><em>${m != null && m < 65 ? 'OAB < 65' : 'Sistolik + diastolikten'}</em></div></div>`;
    }
    if (k === 'renal') {
      const r = renal(p, v);
      if (!r) return `<div class="kpis"><div class="kpi"><span>Böbrek fonksiyonu</span><b>—</b><em>Kreatinin girilince CrCl ve eGFR hesaplanır</em></div></div>`;
      const need = [!isNum(p.age) && 'yaş', !p.sex && 'cinsiyet', !isNum(p.weight) && 'kilo'].filter(Boolean);
      return `<div class="kpis">
        <div class="kpi${r.crcl != null && r.crcl < 30 ? ' hi' : r.crcl != null && r.crcl < 60 ? ' warn' : ''}"><span>CrCl · Cockcroft-Gault</span><b>${r.crcl != null ? Math.round(r.crcl) : '—'}<small>mL/dk</small></b><em>${r.crcl != null ? `${r.wl} ile · Kre ${fmt(r.cr, 2, true)} (${fd(r.date, false)})` : 'Gerekli: ' + need.join(', ')}</em></div>
        <div class="kpi${r.egfr != null && r.egfr < 30 ? ' hi' : r.egfr != null && r.egfr < 60 ? ' warn' : ''}"><span>eGFR · CKD-EPI 2021</span><b>${r.egfr != null ? Math.round(r.egfr) : '—'}<small>mL/dk/1,73m²</small></b><em>${r.hd ? 'Hasta diyalizde' : r.egfr != null ? 'Yaş ve cinsiyetten' : 'Gerekli: yaş, cinsiyet'}</em></div></div>`;
    }
    return '';
  }

  function tabMuayene(p, v, vi) {
    const prev = vi > 0 ? p.visits[vi - 1] : null;
    const tools = `<div class="row-btns"><button class="btn sm" data-act="exam-normal">${ic('check')}Tüm sistemler doğal</button>${prev && Object.keys(prev.exam).length ? `<button class="btn sm ghost" data-act="exam-copy">Önceki muayeneyi kopyala (${fd(prev.date, false)})</button>` : ''}</div>`;
    const ex = v.exam;
    return tools + C.EXAM.map((s) => {
      let extra = '';
      if (s.k === 'deri' && (ex.deri || []).includes('Diyabetik ayak ülseri')) extra += field('Wagner evresi', chips('V.exam.wagner', C.WAGNER, { single: true }));
      if (s.k === 'deri' && (ex.deri || []).includes('Bası yarası')) extra += field('Bası yarası evresi', chips('V.exam.pu', C.PU_STAGE, { single: true }));
      return sec(s.t, chips('V.exam.' + s.k, s.items, s.single ? { single: true } : { ex: s.ex, re: s.k === 'deri' }) + extra);
    }).join('') + sec('Muayene notu', textIn('V.examNote', 'Ek bulgular (klavyedeki mikrofonla dikte edebilirsiniz)', { multi: true, rows: 3 }));
  }

  function tabLab(p, v) {
    const tiles = (g) => `<div class="labs">${g.items.map((x) => {
      const val = v.labs[x.k]; const f = labFlag(x, val); const pr = prevLab(p, v, x.k);
      let trend = '';
      if (pr) {
        const arrow = isNum(val) ? (val > pr.v ? '↑' : val < pr.v ? '↓' : '=') : '';
        trend = `<span class="lab-p">${arrow} önceki ${fmt(pr.v, x.dec, true)}</span>`;
      }
      return `<button type="button" class="lab${isNum(val) ? '' : ' empty'}${f ? ' f-' + f : ''}" data-act="numpad" data-path="V.labs.${x.k}" data-cfg="l:${x.k}" data-seq="lab">
        <span class="lab-n">${esc(x.label)}</span><b class="lab-v">${isNum(val) ? fmt(val, x.dec, true) : '—'}</b><span class="lab-u">${esc(x.unit)}</span>${trend}</button>`;
    }).join('')}</div>`;
    const any = p.visits.some((x) => Object.keys(x.labs).length);
    return `<div class="row-btns"><button class="btn sm" data-act="numpad" data-path="V.labs.wbc" data-cfg="l:wbc" data-seq="lab">Sırayla gir</button>${any ? `<button class="btn sm ghost" data-act="trend">${ic('trend')}Trend tablosu</button>` : ''}</div>` +
      sec('Laboratuvar tarihi', dateQuick('V.labDate', { days: [0, 1, 2], show: true })) +
      C.LAB_GROUPS.map((g) => sec(g.t, tiles(g) + (g.t === 'Biyokimya' ? `<div class="live" data-live="renal">${liveBlock('renal', p, v)}</div>` : ''))).join('') +
      sec('Tam idrar tetkiki', chips('V.tit', C.URINALYSIS, { ex: 'Normal' }));
  }

  function resultPill(r) {
    if (!r || r === 'Bekleniyor') return pill('Bekleniyor', 'mute');
    if (r === 'Üreme yok' || r === 'Normal') return pill(r, 'ok');
    if (r === 'Kontaminasyon şüphesi') return pill('Kontaminasyon?', 'warn');
    return pill(r, 'hi');
  }
  function cultureCard(c) {
    const open = ui.open === c.id; const P = `cultures.#${c.id}`;
    const isos = c.isolates.filter((i) => i.org);
    const title = c.type || 'Örnek seçilmedi';
    const sub = [c.date ? fd(c.date, false) : '', c.bottles || '', isos.map((i) => i.org + (i.resist && i.resist.length ? ` (${i.resist.join(', ')})` : '')).join(' + ') || c.gram || ''].filter(Boolean).join(' · ');
    let h = `<div class="card${open ? ' open' : ''}"><button class="card-h" data-act="open-item" data-id="${c.id}"><span class="card-t"><b>${esc(title)}</b><span>${esc(sub)}</span></span>${resultPill(c.result)}</button>`;
    if (open) {
      h += `<div class="card-b">
        ${field('Örnek', chips(P + '.type', withExtras(C.SAMPLES, 'sample', c.type), { single: true, add: 'sample', re: 1, keep: true }))}
        ${field('Alınma tarihi', dateQuick(P + '.date', { days: [0, 1, 2, 3, 4, 5, 7], show: true }))}
        ${field('Sonuç', chips(P + '.result', C.CULTURE_RESULT, { single: true, re: 1, keep: true }))}
        ${c.type === 'Kan kültürü' && c.result && c.result !== 'Üreme yok' && c.result !== 'Bekleniyor' ? field('Pozitif şişe', chips(P + '.bottles', C.BOTTLES, { single: true })) : ''}
        ${c.result !== 'Üreme yok' ? field('Gram boyama', chips(P + '.gram', C.GRAM, { single: true, re: 1 })) : ''}
        ${c.result === 'Üreme var' || c.result === 'Kontaminasyon şüphesi' ? c.isolates.map((iso, n) => isolateUI(c, iso, n)).join('') + `<button class="btn sm ghost" data-act="add-isolate" data-id="${c.id}">${ic('plus')}İzolat ekle</button>` : ''}
        ${field('Not', textIn(P + '.note', 'Koloni sayısı, MİK, rapor notu'))}
        <div class="card-a"><button class="btn sm danger" data-act="del-item" data-list="cultures" data-id="${c.id}">${ic('trash')}Sil</button><button class="btn sm" data-act="open-item" data-id="">Tamam</button></div></div>`;
    }
    return h + '</div>';
  }
  function isolateUI(c, iso, n) {
    const IP = `cultures.#${c.id}.isolates.#${iso.id}`;
    const orgs = C.ORGANISMS.map((o) => ({ v: o.n, cls: orgCls(o.g) }));
    custom('org').forEach((x) => { if (!ORG[x]) orgs.push({ v: x, cls: 'ot' }); });
    if (iso.org && !orgs.some((o) => o.v === iso.org)) orgs.push({ v: iso.org, cls: 'ot' });
    const g = gramOf(c, iso);
    let h = `<div class="iso"><div class="iso-h"><b>İzolat ${n + 1}</b>${c.isolates.length > 1 ? `<button class="lnk" data-act="del-isolate" data-cid="${c.id}" data-id="${iso.id}">Kaldır</button>` : ''}</div>`;
    h += field('Mikroorganizma', `<div class="legend"><i class="gp"></i>Gram (+) <i class="gn"></i>Gram (−) <i class="fu"></i>Mantar</div>` + chips(IP + '.org', orgs, { single: true, add: 'org', re: 1, cls: 'orgs' }));
    if (iso.org) {
      h += field('Direnç', chips(IP + '.resist', withExtras(C.RESIST, 'resist', iso.resist), { add: 'resist' }));
      const drugs = withExtras(C.AST[g] || C.AST['-'], 'ast', Object.keys(iso.ast || {}));
      h += field('Antibiyogram', `<div class="hint">Her dokunuş: S → I → R → boş</div><div class="chips ast">${drugs.map((d) => {
        const st = (iso.ast || {})[d];
        return `<button type="button" class="chip a-${st || 'n'}" data-act="ast" data-path="${esc(IP)}.ast" data-key="${esc(d)}">${esc(d)}${st ? `<b>${st}</b>` : ''}</button>`;
      }).join('')}<button type="button" class="chip add" data-act="chip-add" data-cat="ast">${ic('plus')}Ekle</button></div>`);
    }
    return h + '</div>';
  }
  function imagingCard(m) {
    const open = ui.open === m.id; const P = `imaging.#${m.id}`;
    const sub = [m.date ? fd(m.date, false) : '', (m.find || []).join(', '), m.note || ''].filter(Boolean).join(' · ');
    let h = `<div class="card${open ? ' open' : ''}"><button class="card-h" data-act="open-item" data-id="${m.id}"><span class="card-t"><b>${esc(m.type || 'Tetkik seçilmedi')}</b><span>${esc(sub)}</span></span>${resultPill(m.result)}</button>`;
    if (open) {
      h += `<div class="card-b">
        ${field('Tetkik', chips(P + '.type', withExtras(C.IMAGING, 'imaging', m.type), { single: true, add: 'imaging', re: 1, keep: true }))}
        ${field('Tarih', dateQuick(P + '.date', { days: [0, 1, 2, 3, 5, 7], show: true }))}
        ${field('Sonuç', chips(P + '.result', C.IMAGING_RESULT, { single: true, re: 1, keep: true }))}
        ${m.result === 'Patolojik' ? field('Bulgular', chips(P + '.find', withExtras(C.IMAGING_FIND, 'find', m.find), { add: 'find' })) : ''}
        ${field('Not', textIn(P + '.note', 'Lokalizasyon, rapor özeti'))}
        <div class="card-a"><button class="btn sm danger" data-act="del-item" data-list="imaging" data-id="${m.id}">${ic('trash')}Sil</button><button class="btn sm" data-act="open-item" data-id="">Tamam</button></div></div>`;
    }
    return h + '</div>';
  }
  function tabMikro(p) {
    const tri = withExtras(C.SERO, 'sero', Object.keys(p.sero));
    return sec('Kültürler', `<div class="cards">${p.cultures.map(cultureCard).join('')}</div><button class="btn wide" data-act="add-culture">${ic('plus')}Kültür ekle</button>`) +
      sec('Seroloji ve hızlı testler', `<div class="hint">Her dokunuş: (+) → (−) → bekleniyor → boş</div><div class="tri">${tri.map((k) => {
        const st = p.sero[k];
        return `<button type="button" class="tr t-${st === '+' ? 'pos' : st === '-' ? 'neg' : st === '?' ? 'wait' : 'n'}" data-act="tri" data-key="${esc(k)}"><span>${esc(k)}</span><b>${st === '+' ? '(+)' : st === '-' ? '(−)' : st === '?' ? '…' : ''}</b></button>`;
      }).join('')}<button type="button" class="tr add" data-act="chip-add" data-cat="sero">${ic('plus')}Test ekle</button></div>` + field('Not', textIn('seroNote', 'Titre, HBV DNA düzeyi vb.'))) +
      sec('Görüntüleme', `<div class="cards">${p.imaging.map(imagingCard).join('')}</div><button class="btn wide" data-act="add-imaging">${ic('plus')}Görüntüleme ekle</button>`);
  }

  function abxCard(a) {
    const open = ui.open === a.id; const P = `abx.#${a.id}`;
    const st = C.ABX_STATUS.find((s) => s.k === a.status) || C.ABX_STATUS[0];
    const day = abxDay(a); const end = apprEnd(a);
    const stc = { on: 'abx', start: 'plan', stop: 'warn', off: 'mute' }[a.status] || '';
    const sub = [a.dose, a.route, a.ext ? 'uzatılmış inf.' : '', day ? (a.status === 'off' ? `${day} gün kullanıldı` : `${day}. gün`) : 'başlangıç tarihi yok', end ? `onay son gün ${fd(end, false)}` : ''].filter(Boolean).join(' · ');
    let h = `<div class="card${open ? ' open' : ''}"><button class="card-h" data-act="open-item" data-id="${a.id}"><span class="card-t"><b>${esc(a.drug)}</b><span>${esc(sub)}</span></span>${pill(st.t, stc)}</button>`;
    if (open) {
      const presets = (ABX[a.drug] && ABX[a.drug].d) || [];
      h += `<div class="card-b">
        ${field('Durum', chips(P + '.status', C.ABX_STATUS.map((s) => ({ v: s.k, t: s.t })), { single: true, re: 1, keep: true }))}
        ${field('Doz', chips(P + '.dose', withExtras(presets, '_', a.dose), { single: true, re: 1 }) + textIn(P + '.dose', 'Farklı doz yazın'), '<span class="lbl-note">Hazır dozlar normal böbrek fonksiyonu içindir</span>')}
        ${field('Yol', chips(P + '.route', C.ROUTES, { single: true }) + toggleBtn(P + '.ext', 'Uzatılmış infüzyon'))}
        ${field(a.status === 'start' ? 'Planlanan başlangıç' : 'Başlangıç tarihi', dateQuick(P + '.start', { days: [0, 1, 2, 3, 4, 5, 7, 10, 14], count: a.status !== 'off', show: a.status === 'off' }))}
        ${a.status === 'off' ? field('Kesilme tarihi', dateQuick(P + '.stopDate', { days: [0, 1, 2, 3, 5, 7], show: true })) : ''}
        ${field('Kısıtlı antibiyotik onayı', chips(P + '.appr', C.APPROVAL, { single: true, re: 1 }))}
        ${a.appr === 'Onaylandı' ? field('Onay süresi', chips(P + '.apprDays', C.APPROVAL_DAYS.map((n) => ({ v: n, t: n + ' gün' })), { single: true, num: true, re: 1 })) + field('Onay tarihi', dateQuick(P + '.apprDate', { days: [0, 1, 2, 3], show: true })) + (end ? `<div class="hint strong">Onayın son günü: ${fd(end)} (${ddiff(end, today()) >= 0 ? ddiff(end, today()) + ' gün kaldı' : 'süre doldu'})</div>` : '') : ''}
        ${field('Not', textIn(P + '.note', 'Endikasyon, düzey, yan etki'))}
        <div class="card-a"><button class="btn sm danger" data-act="del-item" data-list="abx" data-id="${a.id}">${ic('trash')}Sil</button><button class="btn sm" data-act="open-item" data-id="">Tamam</button></div></div>`;
    }
    return h + '</div>';
  }
  function tabAbx(p) {
    const allergy = p.allergy.filter((a) => a !== 'Yok');
    const act = p.abx.filter((a) => a.status !== 'off'); const past = p.abx.filter((a) => a.status === 'off');
    const r = renal(p, curVisit(p));
    return (allergy.length ? `<div class="banner hi">Alerji: ${esc(allergy.join(', '))}${p.allergyNote ? ' — ' + esc(p.allergyNote) : ''}</div>` : '') +
      (r && (r.crcl != null || r.hd) ? `<div class="banner mute">${r.hd ? 'Hasta diyalizde — dozları diyalize göre ayarlayın.' : `CrCl ${Math.round(r.crcl)} mL/dk (${fd(r.date, false)} kreatinini ile)`}</div>` : '') +
      sec('Güncel tedavi ve öneriler', `<div class="cards">${act.map(abxCard).join('') || '<div class="empty-st sm">Kayıtlı antibiyotik yok.</div>'}</div><button class="btn wide" data-act="add-abx">${ic('plus')}Antibiyotik ekle</button>`) +
      (past.length ? sec('Önceki antibiyotikler', `<div class="cards">${past.map(abxCard).join('')}</div>`) : '');
  }

  function tabPlan(p, v, vi) {
    const prev = vi > 0 ? p.visits[vi - 1] : null;
    const recList = v.recs.length ? `<ol class="recs">${v.recs.map((r, i) => `<li><button class="rec-t" data-act="rec-edit" data-i="${i}">${esc(r)}</button><button class="ibtn sm" data-act="rec-del" data-i="${i}" aria-label="Öneriyi sil">${ic('close')}</button></li>`).join('')}</ol>` : '<div class="empty-st sm">Aşağıdaki hazır önerilere dokunarak ekleyin.</div>';
    const abxLines = abxRecLines(p);
    const nx = v.nextDate || '';
    const t = today();
    const nextChips = C.NEXT.map((n) => { const d = addDays(v.date > t ? v.date : t, n.d); return `<button class="chip${nx === d ? ' on' : ''}" data-act="dq" data-path="V.nextDate" data-val="${d}">${n.t}</button>`; }).join('');
    return sec('Ön tanı', chips('V.dx', withExtras(C.DX, 'dx', v.dx), { add: 'dx' })) +
      sec('Değerlendirme', textIn('V.assessment', 'Kısa klinik değerlendirme (isteğe bağlı)', { multi: true, rows: 3 })) +
      sec('Öneriler', recList +
        `<div class="row-btns"><button class="btn sm" data-act="rec-new">${ic('plus')}Serbest öneri yaz</button>${prev && prev.recs.length ? `<button class="btn sm ghost" data-act="rec-copy">Önceki önerileri kopyala</button>` : ''}</div>` +
        C.REC_GROUPS.map((g, i) => field(g.t, chips('V.recs', i === C.REC_GROUPS.length - 1 ? withExtras(g.items, 'rec', []) : g.items, i === C.REC_GROUPS.length - 1 ? { add: 'rec', re: 1 } : { re: 1 }))).join('')) +
      sec('Antibiyotik önerileri', (abxLines.length ? `<ul class="abx-lines">${abxLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<div class="empty-st sm">Antibiyotik sekmesindeki durumlardan otomatik oluşur.</div>') + toggleBtn('V.abxInNote', 'Nota ekle')) +
      sec('Kontrol', `<div class="chips">${nextChips}<button class="chip${v.nextPrn ? ' on' : ''}" data-act="next-prn">Gerektiğinde</button><span class="chip dp${nx && !C.NEXT.some((n) => addDays(v.date > t ? v.date : t, n.d) === nx) ? ' on' : ''}">${ic('cal')}<span>Tarih</span><input type="date" class="dp-in" data-dq="V.nextDate" value="${nx}" aria-label="Kontrol tarihi"></span></div>${nx ? `<div class="hint strong">Kontrol: ${fd(nx)}</div>` : ''}`);
  }
  function abxRecLines(p) {
    const out = [];
    p.abx.forEach((a) => {
      const d = [a.drug, a.dose, a.route].filter(Boolean).join(' ') + (a.ext ? ' (uzatılmış infüzyon)' : '');
      const day = abxDay(a); const end = apprEnd(a);
      const ap = a.appr === 'Onaylandı' && a.apprDays ? ` Kısıtlı antibiyotik onayı ${a.apprDays} gün verilmiştir${end ? ` (son gün ${fd(end)})` : ''}.` : a.appr === 'Onaylandı' ? ' Onay verilmiştir.' : a.appr === 'Onaylanmadı' ? ' Onay verilmemiştir.' : a.appr === 'Değiştirildi' ? ' Tedavi değişikliği önerilmiştir.' : '';
      if (a.status === 'on') out.push(`${d} tedavisine devam edilmesi${day ? ` (bugün ${day}. gün)` : ''}.${ap}`);
      else if (a.status === 'start') out.push(`${d} başlanması.${ap}`);
      else if (a.status === 'stop') out.push(`${a.drug} tedavisinin kesilmesi${day ? ` (${day}. gün)` : ''}.${ap}`);
    });
    return out;
  }

  function tabNot(p, v) {
    const txt = buildNote(p, v, ui.noteMode);
    return `<div class="seg sm">${[['full', 'Tam not'], ['brief', 'Özet']].map(([k, t]) => `<button class="seg-b${ui.noteMode === k ? ' on' : ''}" data-act="note-mode" data-k="${k}">${t}</button>`).join('')}</div>
      <pre class="note" id="notetext">${esc(txt)}</pre>
      <div class="row-btns"><button class="btn primary grow" data-act="note-copy">${ic('copy')}Kopyala</button>${navigator.share && !IN_ARTIFACT ? `<button class="btn" data-act="note-share">${ic('share')}Paylaş</button>` : ''}</div>
      <p class="hint">Not metni girdiğiniz bilgilerden oluşur; düzenlemek için ilgili bölüme dönün. Paylaşırken hasta mahremiyetine dikkat edin.</p>`;
  }

  // --- ayarlar
  function viewSettings() {
    const m = S.meta;
    const counts = { all: S.patients.length, act: S.patients.filter((p) => p.status === 'active').length };
    const oldClosed = S.patients.filter((p) => p.status !== 'active' && (p.closedAt || p.updatedAt) < Date.now() - 30 * 864e5).length;
    const cust = Object.entries(m.custom || {}).filter(([, l]) => l.length);
    const storeTxt = { idb: 'Cihaz veritabanı (IndexedDB)', ls: 'Tarayıcı deposu (localStorage)', mem: 'Kalıcı depolama yok' }[Store.mode];
    return `<div class="screen">
      <header class="bar"><button class="ibtn" data-act="back" aria-label="Geri">${ic('back')}</button><div class="bar-t"><b>Ayarlar</b><span>${counts.all} kayıt · ${counts.act} aktif</span></div></header>
      <main class="wrap set">
        ${sec('Hekim', field('Not imzası', `<input class="txt" type="text" id="doctor" value="${esc(m.doctor)}" placeholder="Uzm. Dr. Ad Soyad" autocomplete="off">`))}
        ${sec('Yedekleme', `<p class="hint">Veriler yalnızca bu telefonda durur. Düzenli yedek alıp dosyayı güvenli bir yerde saklayın.${m.lastBackup ? ` Son yedek: ${new Date(m.lastBackup).toLocaleString('tr-TR')}.` : ''}</p>
          <div class="row-btns"><button class="btn primary" data-act="export">Yedek dosyası indir</button><button class="btn" data-act="export-copy">${ic('copy')}Panoya kopyala</button></div>
          <label class="btn wide file">Yedekten geri yükle<input type="file" id="importfile" accept=".json,application/json"></label>`)}
        ${sec('Güvenlik', `<p class="hint">PIN, uygulamayı açan kişiyi durdurur; veriler şifrelenmez. Telefon ekran kilidini mutlaka kullanın.</p>
          <div class="row-btns">${m.pinHash ? `<button class="btn" data-act="pin-set">PIN'i değiştir</button><button class="btn danger" data-act="pin-off">PIN'i kaldır</button>` : `<button class="btn primary" data-act="pin-set">${ic('lock')}4 haneli PIN belirle</button>`}</div>
          ${m.pinHash ? field('Arka planda kalınca kilitle', `<div class="chips">${[1, 5, 15, 60].map((n) => `<button class="chip${m.lockMin === n ? ' on' : ''}" data-act="lockmin" data-val="${n}">${n} dk</button>`).join('')}</div>`) : ''}`)}
        ${sec('Görünüm', field('Tema', `<div class="chips">${[['auto', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']].map(([k, t]) => `<button class="chip${m.theme === k ? ' on' : ''}" data-act="theme" data-val="${k}">${t}</button>`).join('')}</div>`) +
          field('Yazı boyutu', `<div class="chips">${[['n', 'Normal'], ['l', 'Büyük']].map(([k, t]) => `<button class="chip${m.font === k ? ' on' : ''}" data-act="font" data-val="${k}">${t}</button>`).join('')}</div>`) +
          `<div class="row-btns"><button class="tgl${m.haptic ? ' on' : ''}" data-act="pref" data-k="haptic"><span class="tgl-k"></span>Dokunuşta titreşim</button><button class="tgl${m.wake ? ' on' : ''}" data-act="pref" data-k="wake"><span class="tgl-k"></span>Ekran açık kalsın</button></div>`)}
        ${cust.length ? sec('Eklediğiniz seçenekler', `<p class="hint">Silmek için dokunun. Kayıtlı hastalardaki değerler değişmez.</p>${cust.map(([cat, l]) => `<div class="chips">${l.map((x) => `<button class="chip on" data-act="del-custom" data-cat="${esc(cat)}" data-val="${esc(x)}">${esc(x)} ${ic('close')}</button>`).join('')}</div>`).join('')}`) : ''}
        ${sec('Veri', `<p class="hint">Depolama: ${storeTxt}${m.persisted === true ? ' · kalıcı depolama izni verildi' : ''}.</p>
          <div class="row-btns">${oldClosed ? `<button class="btn" data-act="purge">30 günden eski ${oldClosed} kapalı kaydı sil</button>` : ''}<button class="btn danger" data-act="wipe">Tüm verileri sil</button></div>`)}
        <p class="hint center">Konsültasyon Defteri · Hesaplanan değerler (CrCl, eGFR, qSOFA) ve hazır dozlar yalnızca yardımcıdır; klinik karar hekime aittir.</p>
      </main></div>`;
  }

  // ------------------------------------------------------------------ not metni
  function buildNote(p, v, mode) {
    const L = []; const vi = p.visits.indexOf(v);
    const add = (label, val) => { if (val) L.push(label ? `${label}: ${val}` : val); };
    L.push('ENFEKSİYON HASTALIKLARI KONSÜLTASYONU');
    L.push(`${fd(v.date)} ${v.time || ''} · ${vi === 0 ? 'İlk değerlendirme' : `Takip (${vi + 1}. vizit; ilk: ${fd(p.visits[0].date)})`}`.trim());
    L.push('');
    const idl = [p.name || 'İsimsiz', ageSex(p)].filter(Boolean).join(', ');
    add('Hasta', [idl, [p.ward, p.room ? 'oda ' + roomBed(p) : p.bed ? 'yatak ' + p.bed : ''].filter(Boolean).join(', '), p.protocol ? 'protokol ' + p.protocol : ''].filter(Boolean).join(' | '));
    if (mode === 'full') {
      const extra = [p.admitDate ? `Yatış ${fd(p.admitDate)} (${ddiff(v.date, p.admitDate) + 1}. gün)` : '', isNum(p.weight) ? `${p.weight} kg` : '', isNum(p.height) ? `${p.height} cm` : '', p.requester ? `İsteyen: ${p.requester}` : ''].filter(Boolean).join(' | ');
      add('', extra);
    }
    add('Konsültasyon nedeni', [p.reasons.join(', '), p.reasonNote].filter(Boolean).join('. ') + (p.urgency === 'Acil' ? ' (ACİL)' : ''));
    const alg = p.allergy.filter((a) => a !== 'Yok');
    add('Alerji', alg.length ? alg.join(', ') + (p.allergyNote ? ` (${p.allergyNote})` : '') : p.allergy.includes('Yok') ? 'Bilinen ilaç alerjisi yok' : '');
    if (mode === 'full') {
      add('Özgeçmiş', p.comorb.join(', '));
      add('Risk faktörleri', p.risks.join(', '));
      add('Kateter/cihaz', p.devices.map((d) => d.type + (d.date ? ` (${fd(d.date, false)}, ${ddiff(v.date, d.date) + 1}. gün)` : '')).join(', '));
      // vital
      const vt = v.vitals; const vs = [];
      if (isNum(vt.temp)) vs.push(`Ateş ${fmt(vt.temp, 1)} °C`);
      if (isNum(vt.tmax)) vs.push(`24 saatte maks. ${fmt(vt.tmax, 1)} °C`);
      if (isNum(vt.hr)) vs.push(`Nabız ${vt.hr}/dk`);
      if (isNum(vt.sbp) || isNum(vt.dbp)) { const m = mapOf(vt); vs.push(`TA ${vt.sbp || '?'}/${vt.dbp || '?'} mmHg${m ? ` (OAB ${Math.round(m)})` : ''}`); }
      if (isNum(vt.rr)) vs.push(`SS ${vt.rr}/dk`);
      if (isNum(vt.spo2)) vs.push(`SpO₂ %${vt.spo2}${vt.o2 ? ` (${vt.o2})` : ''}`); else if (vt.o2) vs.push(vt.o2);
      if (isNum(vt.gcs)) vs.push(`GKS ${vt.gcs}`);
      if (vt.press && vt.press.length) vs.push(`Vazopressör: ${vt.press.join(', ')}`);
      if (vt.urine) vs.push(`İdrar çıkışı: ${vt.urine.toLocaleLowerCase('tr')}`);
      if (vs.length) { L.push(''); add('Vital bulgular', vs.join(' | ')); const q = qsofa(v); if (q.known >= 2) add('qSOFA', `${q.s}/3${q.miss.length ? ' (eksik: ' + q.miss.join(', ') + ')' : ''}`); }
      // muayene
      const ex = v.exam; const es = [];
      C.EXAM.forEach((s) => {
        const val = ex[s.k]; if (!val || (Array.isArray(val) && !val.length)) return;
        let t = `${s.t}: ${Array.isArray(val) ? val.join(', ') : val}`;
        if (s.k === 'deri' && ex.wagner) t += `, Wagner evre ${ex.wagner}`;
        if (s.k === 'deri' && ex.pu) t += `, bası yarası evre ${ex.pu}`;
        es.push(t);
      });
      if (es.length || v.examNote) { L.push(''); L.push('Fizik muayene: ' + [es.join('. '), v.examNote].filter(Boolean).join('. ') + '.'); }
      // lab
      const ls = [];
      LABS.forEach((x) => {
        const val = v.labs[x.k]; if (!isNum(val)) return;
        const pr = prevLab(p, v, x.k); const f = labFlag(x, val);
        ls.push(`${x.label} ${fmt(val, x.dec, true)}${f === 'hi' ? '↑' : f === 'lo' ? '↓' : ''}${pr ? ` (önceki ${fmt(pr.v, x.dec, true)})` : ''}`);
      });
      if (ls.length || v.tit.length) {
        L.push('');
        add(`Laboratuvar (${fd(v.labDate || v.date)})`, ls.join(', '));
        const r = renal(p, v);
        if (r && isNum(v.labs.cr)) {
          const rr = [r.crcl != null ? `CrCl (C-G, ${r.wl}) ${Math.round(r.crcl)} mL/dk` : '', r.egfr != null ? `eGFR (CKD-EPI 2021) ${Math.round(r.egfr)} mL/dk/1,73m²` : '', r.hd ? 'hasta diyalizde' : ''].filter(Boolean).join(', ');
          add('Böbrek fonksiyonu', rr);
        }
        add('TİT', v.tit.join(', '));
      }
    }
    // mikrobiyoloji
    const cult = p.cultures.map((c) => {
      const isos = c.isolates.filter((i) => i.org).map((i) => {
        const ast = i.ast || {}; const grp = (k) => Object.keys(ast).filter((d) => ast[d] === k);
        const parts = [i.org + (i.resist && i.resist.length ? ` [${i.resist.join(', ')}]` : '')];
        if (mode === 'full') {
          const s = grp('S'), ii = grp('I'), r = grp('R');
          if (s.length) parts.push('S: ' + s.join(', '));
          if (ii.length) parts.push('I: ' + ii.join(', '));
          if (r.length) parts.push('R: ' + r.join(', '));
        }
        return parts.join('; ');
      });
      const head = `${c.type || 'Kültür'}${c.date ? ` (${fd(c.date, false)}${c.bottles ? ', ' + c.bottles : ''})` : c.bottles ? ` (${c.bottles})` : ''}`;
      const res = isos.length ? isos.join(' + ') : [c.gram, c.result || 'Bekleniyor'].filter(Boolean).join(', ');
      return `• ${head}: ${res}${c.result === 'Kontaminasyon şüphesi' && isos.length ? ' (kontaminasyon şüphesi)' : ''}${c.note && mode === 'full' ? ` — ${c.note}` : ''}`;
    });
    if (cult.length) { L.push(''); L.push('Mikrobiyoloji:'); cult.forEach((x) => L.push(x)); }
    const sero = Object.entries(p.sero).map(([k, s]) => `${k} ${s === '+' ? '(+)' : s === '-' ? '(−)' : '(bekleniyor)'}`);
    if (sero.length || p.seroNote) add('Seroloji/testler', [sero.join(', '), p.seroNote].filter(Boolean).join('. '));
    if (mode === 'full' && p.imaging.length) {
      L.push(''); L.push('Görüntüleme:');
      p.imaging.forEach((m) => L.push(`• ${m.type || 'Görüntüleme'}${m.date ? ` (${fd(m.date, false)})` : ''}: ${[m.result || 'Bekleniyor', (m.find || []).join(', '), m.note].filter(Boolean).join(' — ')}`));
    }
    // antibiyotik
    if (p.abx.length) {
      L.push(''); L.push('Antibiyotik tedavisi:');
      p.abx.forEach((a) => {
        if (mode === 'brief' && a.status === 'off') return;
        const day = abxDay(a);
        const d = [a.drug, a.dose, a.route].filter(Boolean).join(' ') + (a.ext ? ' (uzatılmış inf.)' : '');
        const when = a.status === 'off' ? `${a.start ? fd(a.start, false) : '?'}–${a.stopDate ? fd(a.stopDate, false) : '?'}${day ? `, ${day} gün` : ''}` : a.start ? `başl. ${fd(a.start, false)}${day ? `, ${day}. gün` : ''}` : '';
        const st = { on: 'kullanıyor', start: 'başlanması önerildi', stop: 'kesilmesi önerildi', off: 'kesilmiş' }[a.status] || '';
        L.push(`• ${d}${when ? ` (${when})` : ''} — ${st}`);
      });
    }
    // değerlendirme ve öneriler
    L.push('');
    add('Ön tanı', v.dx.join(', '));
    add('Değerlendirme', v.assessment);
    const recs = [...(v.abxInNote ? abxRecLines(p) : []), ...v.recs];
    if (recs.length) { L.push('Öneriler:'); recs.forEach((r, i) => L.push(`${i + 1}. ${r.replace(/\.*$/, '')}.`)); }
    const ctl = [v.nextDate ? fd(v.nextDate) : '', v.nextPrn ? 'gerektiğinde tekrar konsülte edilebilir' : ''].filter(Boolean).join('; ');
    add('Kontrol', ctl);
    if (S.meta.doctor) { L.push(''); L.push(`${S.meta.doctor} — Enfeksiyon Hastalıkları ve Klinik Mikrobiyoloji`); }
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function roundSummary() {
    const act = S.patients.filter((p) => p.status === 'active').sort((a, b) => (a.ward || '').localeCompare(b.ward || '', 'tr') || (parseInt(a.room, 10) || 0) - (parseInt(b.room, 10) || 0));
    const L = [`KONSÜLTASYON TAKİP LİSTESİ — ${fd(today())} (${act.length} hasta)`];
    let w = null;
    act.forEach((p) => {
      if ((p.ward || 'Servis girilmedi') !== w) { w = p.ward || 'Servis girilmedi'; L.push(''); L.push(w.toLocaleUpperCase('tr')); }
      const lv = lastVisit(p);
      const parts = [(lv.dx.length ? lv.dx : p.reasons).join(', ')];
      const ab = activeAbx(p).map((a) => `${a.drug} ${a.status === 'start' ? '(öneri)' : a.status === 'stop' ? '(kesilecek)' : 'G' + (abxDay(a) || '?')}`);
      if (ab.length) parts.push(ab.join(', '));
      const pend = p.cultures.filter((c) => !c.result || c.result === 'Bekleniyor').map((c) => c.type || 'kültür');
      if (pend.length) parts.push('Bekleyen: ' + pend.join(', '));
      if (lv.nextDate) parts.push('Kontrol ' + fd(lv.nextDate, false));
      alerts(p).filter((a) => a.c === 'hi').forEach((a) => parts.push(a.t));
      L.push(`• ${[roomBed(p), p.name || 'İsimsiz', ageSex(p, true)].filter((x) => x && x !== '—').join(' ')} — ${parts.filter(Boolean).join('; ')}`);
    });
    return L.join('\n');
  }

  // ------------------------------------------------------------------ alt pencere (sheet)
  let sheetPushed = false; let ignorePop = false; let sheetOnClose = null;
  function openSheet(html, o = {}) {
    const wrap = $('#sheet-wrap'); const body = $('#sheet-body');
    body.innerHTML = html;
    wrap.className = 'sheet-wrap' + (o.cls ? ' ' + o.cls : '');
    wrap.hidden = false;
    document.body.classList.add('noscroll');
    sheetOnClose = o.onClose || null;
    if (!sheetPushed) { try { history.pushState({ sheet: 1 }, ''); sheetPushed = true; } catch (e) { /* çerçeve izin vermeyebilir */ } }
    const f = body.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 60);
  }
  function hideSheet() {
    const wrap = $('#sheet-wrap'); if (wrap.hidden) return;
    wrap.hidden = true; $('#sheet-body').innerHTML = '';
    document.body.classList.remove('noscroll');
    const cb = sheetOnClose; sheetOnClose = null; np = null;
    if (cb) cb();
  }
  function closeSheet() {
    if (sheetPushed) { sheetPushed = false; ignorePop = true; try { history.back(); } catch (e) { ignorePop = false; } }
    hideSheet();
  }
  const sheetOpen = () => !$('#sheet-wrap').hidden;

  function confirmSheet(msg, okText, onOk, danger = true) {
    openSheet(`<div class="sh-h"><b>${esc(msg)}</b></div><div class="row-btns"><button class="btn grow" data-act="sheet-close">Vazgeç</button><button class="btn grow ${danger ? 'danger solid' : 'primary'}" data-act="confirm-ok">${esc(okText)}</button></div>`);
    confirmCb = onOk;
  }
  let confirmCb = null;
  function promptSheet(title, value, onSave, o = {}) {
    openSheet(`<form class="prompt" data-form="prompt"><div class="sh-h"><b>${esc(title)}</b></div>
      ${o.multi ? `<textarea class="txt" id="prompt-in" rows="3" autofocus>${esc(value || '')}</textarea>` : `<input class="txt" id="prompt-in" type="text" value="${esc(value || '')}" autofocus autocomplete="off" placeholder="${esc(o.ph || '')}">`}
      ${o.hint ? `<p class="hint">${esc(o.hint)}</p>` : ''}
      <div class="row-btns"><button type="button" class="btn grow" data-act="sheet-close">Vazgeç</button><button type="submit" class="btn primary grow">Kaydet</button></div></form>`);
    promptCb = onSave;
  }
  let promptCb = null;

  // --- sayı tuş takımı
  let np = null;
  function openNumpad(path, key, seq) {
    const cfg = CFG[key]; const v = getv(path);
    np = { path, key, seq, str: cfg.digits ? (v || '') : isNum(v) ? fmt(v, cfg.dec, true) : '' };
    const html = numpadHTML();
    if (sheetOpen() && $('.numpad')) { $('#sheet-body').innerHTML = html; } else openSheet(html, { cls: 'np', onClose: () => { if (ui.view === 'patient') rerenderTab(); } });
  }
  function numpadHTML() {
    const cfg = CFG[np.key]; const p = cur(); const v = curVisit(p);
    let ref = '';
    if (!cfg.digits && cfg.lo != null) ref = `Referans ${fmt(cfg.lo, cfg.dec, true)}–${fmt(cfg.hi, cfg.dec, true)} ${cfg.unit}`;
    if (np.path.startsWith('V.labs.')) {
      const pr = prevLab(p, v, np.path.slice(7));
      if (pr) ref += `${ref ? ' · ' : ''}Önceki ${fmt(pr.v, cfg.dec, true)} (${fd(pr.date, false)})`;
    }
    const list = seqList(np.seq); const idx = list.findIndex((x) => x.path === np.path);
    const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', cfg.digits || cfg.dec === 0 ? '' : ',', '0', 'bk'];
    return `<div class="numpad"><div class="np-top"><div><span class="np-l">${esc(cfg.label)}</span><span class="np-r">${esc(ref)}</span></div><button class="ibtn" data-act="sheet-close" aria-label="Kapat">${ic('close')}</button></div>
      <div class="np-d"><b id="np-val">${esc(np.str) || '<i>—</i>'}</b><small>${esc(cfg.unit || '')}</small></div>
      <div class="np-k">${keys.map((k) => k === 'bk' ? `<button class="np-b fn" data-act="np-key" data-k="bk" aria-label="Sil">${ic('bksp')}</button>` : k ? `<button class="np-b" data-act="np-key" data-k="${k}">${k}</button>` : '<span></span>').join('')}</div>
      <div class="np-a"><button class="btn" data-act="np-clear">Temizle</button><button class="btn ${next ? '' : 'primary '}grow" data-act="np-ok">Tamam</button>${next ? `<button class="btn primary grow" data-act="np-next">${esc(CFG[next.key].label)} ${ic('right')}</button>` : ''}</div></div>`;
  }
  function seqList(seq) {
    if (seq === 'lab') return LABS.map((x) => ({ path: 'V.labs.' + x.k, key: 'l:' + x.k }));
    if (seq === 'vital') return C.VITALS.map((x) => ({ path: 'V.vitals.' + x.k, key: 'v:' + x.k }));
    return [];
  }
  function npCommit() {
    if (!np) return;
    const cfg = CFG[np.key];
    if (cfg.digits) setv(np.path, np.str);
    else if (np.str === '' || np.str === ',') setv(np.path, null);
    else { const n = Number(np.str.replace(',', '.')); if (!isNaN(n)) setv(np.path, n); }
  }

  // --- ilaç seçici
  function drugPicker() {
    const recent = (S.meta.recentDrugs || []).slice(0, 8);
    const groups = C.ABX_GROUPS.map((g) => ({ t: g.t, items: g.items.map((a) => a.n) }));
    const cust = custom('drug'); if (cust.length) groups.push({ t: 'Eklediklerim', items: cust });
    openSheet(`<div class="sh-h"><b>Antibiyotik ekle</b><button class="ibtn" data-act="sheet-close" aria-label="Kapat">${ic('close')}</button></div>
      <div class="seg sm" id="dp-mode"><button class="seg-b on" data-act="dp-mode" data-k="on">Kullanıyor</button><button class="seg-b" data-act="dp-mode" data-k="start">Başlansın (öneri)</button><button class="seg-b" data-act="dp-mode" data-k="off">Önceden kullanmış</button></div>
      <div class="sh-scroll">${recent.length ? field('Son kullanılan', `<div class="chips">${recent.map((d) => `<button class="chip" data-act="pick-drug" data-val="${esc(d)}">${esc(d)}</button>`).join('')}</div>`) : ''}
      ${groups.map((g) => field(g.t, `<div class="chips">${g.items.map((d) => `<button class="chip" data-act="pick-drug" data-val="${esc(d)}">${esc(d)}</button>`).join('')}</div>`)).join('')}
      <button class="btn wide" data-act="drug-custom">${ic('plus')}Listede yok, yaz</button></div>`, { cls: 'tall' });
    dpMode = 'on';
  }
  let dpMode = 'on';
  function addDrug(name) {
    const p = cur(); const a = { id: uid(), drug: name, dose: '', route: (ABX[name] && ABX[name].r) || 'IV', status: dpMode, start: dpMode === 'start' ? today() : null };
    if (dpMode === 'off') a.stopDate = null;
    p.abx.push(a); ui.open = a.id;
    S.meta.recentDrugs = [name, ...(S.meta.recentDrugs || []).filter((x) => x !== name)].slice(0, 12); saveMeta();
    touch(p); closeSheet(); rerenderTab();
  }

  // --- vizitler
  function visitsSheet() {
    const p = cur(); const v = curVisit(p);
    openSheet(`<div class="sh-h"><b>Vizitler</b><button class="ibtn" data-act="sheet-close" aria-label="Kapat">${ic('close')}</button></div>
      <ul class="vlist">${p.visits.map((x, i) => `<li><button class="vl${x === v ? ' on' : ''}" data-act="pick-visit" data-id="${x.id}"><b>${i === 0 ? 'İlk değerlendirme' : `${i + 1}. vizit`}</b><span>${fd(x.date)} ${x.time || ''}${x.date === today() ? ' · bugün' : ''}</span></button>${p.visits.length > 1 ? `<button class="ibtn sm" data-act="del-visit" data-id="${x.id}" aria-label="Viziti sil">${ic('trash')}</button>` : ''}</li>`).join('')}</ul>
      ${p.visits.some((x) => x.date === today()) ? '' : `<button class="btn primary wide" data-act="new-visit">${ic('plus')}Bugün için yeni vizit</button>`}
      <p class="hint">Yeni vizitte vital, lab, muayene ve plan boş başlar; önceki değerler karşılaştırma için gösterilir. Kimlik, öykü, kültür ve antibiyotikler hastaya aittir.</p>`);
  }
  function newVisitNow() {
    const p = cur(); const v = newVisit(); p.visits.push(v); sortVisits(p); ui.vid = v.id; touch(p);
    if (sheetOpen()) closeSheet();
    if (ui.tab === 'kimlik' || ui.tab === 'neden') ui.tab = 'vital';
    render(); toast('Yeni vizit başlatıldı');
  }

  function trendSheet() {
    const p = cur();
    const vs = p.visits.filter((v) => Object.keys(v.labs).length);
    const rows = LABS.filter((x) => vs.some((v) => isNum(v.labs[x.k])));
    openSheet(`<div class="sh-h"><b>Laboratuvar trendi</b><button class="ibtn" data-act="sheet-close" aria-label="Kapat">${ic('close')}</button></div>
      <div class="tscroll"><table class="trend"><thead><tr><th></th>${vs.map((v) => `<th>${fd(v.labDate || v.date, false)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((x) => `<tr><th>${esc(x.label)}</th>${vs.map((v) => { const val = v.labs[x.k]; const f = labFlag(x, val); return `<td class="${f ? 'f-' + f : ''}">${isNum(val) ? fmt(val, x.dec, true) : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`, { cls: 'tall' });
  }

  function patientMenu() {
    const p = cur();
    openSheet(`<div class="sh-h"><b>${esc(p.name || 'Hasta')}</b><button class="ibtn" data-act="sheet-close" aria-label="Kapat">${ic('close')}</button></div>
      <div class="menu">
        <button class="btn wide" data-act="visits">Vizitler (${p.visits.length})</button>
        ${p.status === 'active' ? `<div class="fld"><div class="lbl">Takibi sonlandır</div><div class="chips">${C.CLOSE_REASONS.map((r) => `<button class="chip" data-act="close-p" data-val="${esc(r)}">${esc(r)}</button>`).join('')}</div></div>` : `<button class="btn wide" data-act="reopen">Takibi yeniden aç</button>`}
        <button class="btn wide danger" data-act="del-patient">${ic('trash')}Hastayı sil</button>
      </div>`);
  }

  // ------------------------------------------------------------------ eylemler
  const A = {};
  A['sheet-close'] = () => closeSheet();
  A['confirm-ok'] = () => { const cb = confirmCb; confirmCb = null; closeSheet(); if (cb) cb(); };
  A.back = () => { if (history.state && history.state.view) { try { history.back(); return; } catch (e) { /* devam */ } } goList(); };
  A['go-settings'] = () => go('settings');
  A['list-tab'] = (el) => { ui.list.tab = el.dataset.k; render(); };
  A['list-ward'] = (el) => { ui.list.ward = el.dataset.val === 'Tümü' ? null : el.dataset.val; render(); };
  A.open = (el) => { ui.pid = el.dataset.id; ui.vid = null; ui.open = null; ui.tab = cur().demo ? 'kimlik' : 'vital'; go('patient'); };
  A['new-patient'] = () => {
    const p = newPatient(); S.patients.push(p); ui.pid = p.id; ui.vid = null; ui.tab = 'kimlik'; ui.open = null; touch(p); go('patient');
  };
  A.round = () => {
    const txt = roundSummary();
    openSheet(`<div class="sh-h"><b>Tur özeti</b><button class="ibtn" data-act="sheet-close" aria-label="Kapat">${ic('close')}</button></div><pre class="note sh-scroll" id="roundtext">${esc(txt)}</pre>
      <div class="row-btns"><button class="btn primary grow" data-act="copy-round">${ic('copy')}Kopyala</button>${navigator.share && !IN_ARTIFACT ? `<button class="btn" data-act="share-round">${ic('share')}Paylaş</button>` : ''}</div>`, { cls: 'tall' });
  };
  A['copy-round'] = () => copyText(roundSummary(), $('#roundtext'));
  A['share-round'] = () => shareText('Konsültasyon takip listesi', roundSummary());
  A.tab = (el) => { const k = el.dataset.k; if (ui.tab === k && k !== 'not') return; ui.tab = k; ui.open = null; render(); window.scrollTo(0, 0); scrollTabIntoView(); };
  A['tab-step'] = (el) => {
    const i = TABS.findIndex((t) => t.k === ui.tab); const n = Math.min(Math.max(i + Number(el.dataset.d), 0), TABS.length - 1);
    if (n === i) return; ui.tab = TABS[n].k; ui.open = null; render(); window.scrollTo(0, 0); scrollTabIntoView();
  };
  A.chip = (el) => {
    const g = el.closest('.chips'); const path = g.dataset.path; let v = el.dataset.val; if (g.dataset.num) v = Number(v);
    const cv = getv(path);
    if (g.dataset.mode === 's') {
      if (cv === v && g.dataset.keep) return;
      setv(path, cv === v ? null : v);
    } else {
      let arr = Array.isArray(cv) ? cv.slice() : [];
      const ex = g.dataset.ex;
      if (arr.includes(v)) arr = arr.filter((x) => x !== v);
      else { if (ex) arr = v === ex ? [] : arr.filter((x) => x !== ex); arr.push(v); }
      setv(path, arr);
    }
    afterSet(path, getv(path));
    buzz();
    if (g.dataset.re) rerenderTab(); else { document.querySelectorAll('.chips[data-path]').forEach((x) => { if (x.dataset.path === path) syncChips(x); }); refreshSummary(); }
  };
  A['chip-add'] = (el) => {
    const cat = el.dataset.cat; const g = el.closest('.chips'); const path = g ? g.dataset.path : null;
    promptSheet('Yeni seçenek', '', (val) => {
      val = val.trim(); if (!val) return;
      S.meta.custom = S.meta.custom || {}; const l = S.meta.custom[cat] = S.meta.custom[cat] || [];
      if (!l.includes(val)) l.push(val); saveMeta();
      const p = cur();
      if (cat === 'device') { if (!p.devices.some((d) => d.type === val)) p.devices.push({ id: uid(), type: val, date: null }); touch(p); }
      else if (cat === 'sero' || cat === 'ast') { /* yalnızca listeye eklenir */ }
      else if (path) {
        if (g.dataset.mode === 's') setv(path, val);
        else { const arr = (getv(path) || []).slice(); if (!arr.includes(val)) arr.push(val); setv(path, arr); }
        afterSet(path, getv(path));
      }
      rerenderTab();
    }, { hint: 'Bu seçenek sonraki hastalarda da listede görünür.' });
  };
  A.dq = (el) => { const path = el.dataset.path; setv(path, getv(path) === el.dataset.val ? null : el.dataset.val); afterSet(path, getv(path)); buzz(); rerenderTab(); };
  A.toggle = (el) => { const path = el.dataset.path; setv(path, !getv(path)); buzz(); rerenderTab(); };
  A.numpad = (el) => openNumpad(el.dataset.path, el.dataset.cfg, el.dataset.seq);
  A['np-key'] = (el) => {
    const cfg = CFG[np.key]; const k = el.dataset.k;
    if (k === 'bk') np.str = np.str.slice(0, -1);
    else if (k === ',') { if (!np.str.includes(',')) np.str = (np.str || '0') + ','; }
    else {
      if (cfg.digits) { if (np.str.length < (cfg.maxLen || 12)) np.str += k; }
      else {
        const [ip, dp] = np.str.split(',');
        if (dp !== undefined) { if (dp.length < Math.max(cfg.dec, 1)) np.str += k; }
        else if (ip.length < 6) np.str = ip === '0' ? k : np.str + k;
      }
    }
    buzz(4);
    const d = $('#np-val'); if (d) d.innerHTML = esc(np.str) || '<i>—</i>';
  };
  A['np-clear'] = () => { np.str = ''; const d = $('#np-val'); if (d) d.innerHTML = '<i>—</i>'; };
  A['np-ok'] = () => { npCommit(); afterSet(np.path, getv(np.path)); closeSheet(); };
  A['np-next'] = () => {
    npCommit(); const list = seqList(np.seq); const i = list.findIndex((x) => x.path === np.path);
    const n = list[i + 1]; if (!n) { closeSheet(); return; }
    openNumpad(n.path, n.key, np.seq);
  };
  A.dev = (el) => {
    const p = cur(); const t = el.dataset.val; const i = p.devices.findIndex((d) => d.type === t);
    if (i >= 0) p.devices.splice(i, 1); else p.devices.push({ id: uid(), type: t, date: null });
    touch(p); buzz(); rerenderTab();
  };
  A.tri = (el) => {
    const p = cur(); const k = el.dataset.key; const order = [undefined, '+', '-', '?'];
    const n = order[(order.indexOf(p.sero[k]) + 1) % order.length];
    if (n === undefined) delete p.sero[k]; else p.sero[k] = n;
    touch(p); buzz(); rerenderTab();
  };
  A.ast = (el) => {
    const path = el.dataset.path; const k = el.dataset.key; const ast = Object.assign({}, getv(path) || {});
    const order = [undefined, 'S', 'I', 'R']; const n = order[(order.indexOf(ast[k]) + 1) % order.length];
    if (n === undefined) delete ast[k]; else ast[k] = n;
    setv(path, ast); buzz();
    el.className = `chip a-${n || 'n'}`; el.innerHTML = `${esc(k)}${n ? `<b>${n}</b>` : ''}`;
  };
  A['open-item'] = (el) => { ui.open = ui.open === el.dataset.id ? null : el.dataset.id || null; rerenderTab(); if (ui.open) { const c = el.closest('.card'); if (c) setTimeout(() => c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30); } };
  A['add-culture'] = () => { const p = cur(); const c = { id: uid(), type: '', date: today(), result: 'Bekleniyor', isolates: [{ id: uid(), resist: [], ast: {} }] }; p.cultures.push(c); ui.open = c.id; touch(p); rerenderTab(); };
  A['add-isolate'] = (el) => { const p = cur(); const c = p.cultures.find((x) => x.id === el.dataset.id); c.isolates.push({ id: uid(), resist: [], ast: {} }); touch(p); rerenderTab(); };
  A['del-isolate'] = (el) => { const p = cur(); const c = p.cultures.find((x) => x.id === el.dataset.cid); c.isolates = c.isolates.filter((i) => i.id !== el.dataset.id); touch(p); rerenderTab(); };
  A['add-imaging'] = () => { const p = cur(); const m = { id: uid(), type: '', date: today(), result: 'Bekleniyor', find: [] }; p.imaging.push(m); ui.open = m.id; touch(p); rerenderTab(); };
  A['add-abx'] = () => drugPicker();
  A['dp-mode'] = (el) => { dpMode = el.dataset.k; document.querySelectorAll('#dp-mode .seg-b').forEach((b) => b.classList.toggle('on', b === el)); };
  A['pick-drug'] = (el) => addDrug(el.dataset.val);
  A['drug-custom'] = () => { const mode = dpMode; promptSheet('Antibiyotik adı', '', (val) => { val = val.trim(); if (!val) return; S.meta.custom = S.meta.custom || {}; const l = S.meta.custom.drug = S.meta.custom.drug || []; if (!l.includes(val)) l.push(val); saveMeta(); dpMode = mode; addDrug(val); }); };
  A['del-item'] = (el) => {
    const list = el.dataset.list; const id = el.dataset.id;
    confirmSheet({ cultures: 'Bu kültür silinsin mi?', imaging: 'Bu görüntüleme silinsin mi?', abx: 'Bu antibiyotik kaydı silinsin mi?' }[list], 'Sil', () => { const p = cur(); p[list] = p[list].filter((x) => x.id !== id); ui.open = null; touch(p); rerenderTab(); });
  };
  A.visits = () => visitsSheet();
  A['pick-visit'] = (el) => { ui.vid = el.dataset.id; closeSheet(); render(); };
  A['new-visit'] = () => newVisitNow();
  A['del-visit'] = (el) => {
    const id = el.dataset.id;
    confirmSheet('Bu vizit ve içindeki vital, lab, muayene ve plan silinsin mi?', 'Viziti sil', () => { const p = cur(); p.visits = p.visits.filter((v) => v.id !== id); if (ui.vid === id) ui.vid = null; touch(p); render(); });
  };
  A['exam-normal'] = () => {
    const v = curVisit(); ['bb', 'sol', 'kvs', 'bat', 'deri', 'nor'].forEach((k) => { v.exam[k] = ['Doğal']; });
    if (!v.exam.gd) v.exam.gd = 'İyi'; if (!v.exam.bil) v.exam.bil = 'Açık, oryante';
    delete v.exam.wagner; delete v.exam.pu; touch(); buzz(); rerenderTab();
  };
  A['exam-copy'] = () => {
    const p = cur(); const v = curVisit(p); const prev = p.visits[p.visits.indexOf(v) - 1];
    v.exam = JSON.parse(JSON.stringify(prev.exam)); if (!v.examNote) v.examNote = prev.examNote; touch(p); rerenderTab(); toast('Önceki muayene kopyalandı; değişenleri güncelleyin.');
  };
  A['rec-new'] = () => promptSheet('Öneri', '', (val) => { val = val.trim(); if (!val) return; const v = curVisit(); v.recs.push(val); touch(); rerenderTab(); }, { multi: true, hint: 'Klavyedeki mikrofonla dikte edebilirsiniz.' });
  A['rec-edit'] = (el) => { const v = curVisit(); const i = Number(el.dataset.i); promptSheet('Öneriyi düzenle', v.recs[i], (val) => { val = val.trim(); if (val) v.recs[i] = val; else v.recs.splice(i, 1); touch(); rerenderTab(); }, { multi: true }); };
  A['rec-del'] = (el) => { const v = curVisit(); v.recs.splice(Number(el.dataset.i), 1); touch(); buzz(); rerenderTab(); };
  A['rec-copy'] = () => { const p = cur(); const v = curVisit(p); const prev = p.visits[p.visits.indexOf(v) - 1]; prev.recs.forEach((r) => { if (!v.recs.includes(r)) v.recs.push(r); }); touch(p); rerenderTab(); };
  A['next-prn'] = () => { const v = curVisit(); v.nextPrn = !v.nextPrn; touch(); buzz(); rerenderTab(); };
  A.trend = () => trendSheet();
  A['note-mode'] = (el) => { ui.noteMode = el.dataset.k; rerenderTab(); };
  A['note-copy'] = () => { const p = cur(); copyText(buildNote(p, curVisit(p), ui.noteMode), $('#notetext')); };
  A['note-share'] = () => { const p = cur(); shareText('Konsültasyon notu', buildNote(p, curVisit(p), ui.noteMode)); };
  A['p-menu'] = () => patientMenu();
  A['close-p'] = (el) => { const p = cur(); p.status = 'closed'; p.closedReason = el.dataset.val; p.closedAt = Date.now(); touch(p); closeSheet(); toast(`Takip sonlandırıldı: ${el.dataset.val}`); goList(); };
  A.reopen = () => { const p = cur(); p.status = 'active'; p.closedReason = null; p.closedAt = null; touch(p); if (sheetOpen()) closeSheet(); render(); };
  A['del-patient'] = () => {
    const p = cur();
    confirmSheet(`${p.name || 'Bu hasta'} ve tüm vizitleri kalıcı olarak silinsin mi?`, 'Kalıcı olarak sil', async () => {
      S.patients = S.patients.filter((x) => x.id !== p.id); dirty.delete(p.id);
      try { await Store.delPatient(p.id); } catch (e) { toast('Silme kaydedilemedi.'); }
      toast('Hasta silindi'); goList();
    });
  };
  // ayarlar
  A.export = () => exportBackup('file');
  A['export-copy'] = () => exportBackup('copy');
  A.theme = (el) => { S.meta.theme = el.dataset.val; saveMeta(); applyPrefs(); render(); };
  A.font = (el) => { S.meta.font = el.dataset.val; saveMeta(); applyPrefs(); render(); };
  A.pref = (el) => { const k = el.dataset.k; S.meta[k] = !S.meta[k]; saveMeta(); applyPrefs(); render(); };
  A.lockmin = (el) => { S.meta.lockMin = Number(el.dataset.val); saveMeta(); render(); };
  A['del-custom'] = (el) => { const l = S.meta.custom[el.dataset.cat] || []; S.meta.custom[el.dataset.cat] = l.filter((x) => x !== el.dataset.val); saveMeta(); render(); };
  A['pin-set'] = () => pinSetup();
  A['pin-off'] = () => confirmSheet('PIN kilidi kaldırılsın mı?', 'Kaldır', () => { S.meta.pinHash = null; S.meta.pinSalt = null; saveMeta(); render(); toast('PIN kaldırıldı'); });
  A.purge = () => {
    const old = S.patients.filter((p) => p.status !== 'active' && (p.closedAt || p.updatedAt) < Date.now() - 30 * 864e5);
    confirmSheet(`${old.length} kapalı kayıt kalıcı olarak silinsin mi?`, 'Sil', async () => {
      S.patients = S.patients.filter((p) => !old.includes(p));
      for (const p of old) { try { await Store.delPatient(p.id); } catch (e) { /* devam */ } }
      toast(`${old.length} kayıt silindi`); render();
    });
  };
  A.wipe = () => confirmSheet('Bu telefondaki TÜM hasta kayıtları ve ayarlar silinsin mi? Bu işlem geri alınamaz.', 'Evet, tümünü sil', async () => {
    S.patients = []; dirty.clear();
    try { await Store.clearAll(); } catch (e) { /* devam */ }
    S.meta = Object.assign(defaultMeta(), { seeded: true }); saveMeta(); applyPrefs(); toast('Tüm veriler silindi'); goList();
  });
  A['import-ok'] = () => { const cb = importCb; importCb = null; closeSheet(); if (cb) cb(); };
  let importCb = null;

  function afterSet(path, val) {
    const p = cur(); if (!p) return;
    if (path === 'ward' && val) { S.meta.recentWards = [val, ...(S.meta.recentWards || []).filter((w) => w !== val)].slice(0, 8); saveMeta(); }
    const m = path.match(/^abx\.#([^.]+)\.(\w+)$/);
    if (m) {
      const a = p.abx.find((x) => x.id === m[1]); if (!a) return;
      if (m[2] === 'appr' && val === 'Onaylandı' && !a.apprDate) a.apprDate = today();
      if (m[2] === 'status' && val === 'off' && !a.stopDate) a.stopDate = today();
      if (m[2] === 'status' && val === 'start' && !a.start) a.start = today();
    }
  }

  // ------------------------------------------------------------------ gezinme
  function go(view) {
    ui.view = view; render(); window.scrollTo(0, 0);
    if (view === 'patient') scrollTabIntoView();
    try { if (history.state && history.state.view) history.replaceState({ view }, ''); else history.pushState({ view }, ''); } catch (e) { /* çerçeve izin vermeyebilir */ }
  }
  function goList() { flush(); ui.view = 'list'; ui.pid = null; ui.open = null; render(); window.scrollTo(0, 0); }
  function scrollTabIntoView() { const t = $('#tabs .tab.on'); if (t) t.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (sheetOpen()) { sheetPushed = false; hideSheet(); return; }
    if (ui.view !== 'list') goList();
  });

  // ------------------------------------------------------------------ olay yönetimi
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = A[el.dataset.act]; if (!fn) return;
    e.preventDefault();
    if (lockOn() && !el.closest('#lock')) return;
    fn(el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.bind) {
      setv(el.dataset.bind, el.value);
      if (el.dataset.bind === 'name' || el.dataset.bind === 'requester') refreshSummary();
      if (/\.dose$/.test(el.dataset.bind)) { const g = el.parentElement.querySelector('.chips'); if (g) syncChips(g); }
      return;
    }
    if (el.id === 'q') { ui.list.q = el.value; renderList(); return; }
    if (el.id === 'doctor') { S.meta.doctor = el.value; saveMeta(); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.dq) { setv(el.dataset.dq, el.value || null); afterSet(el.dataset.dq, el.value); rerenderTab(); return; }
    if (el.id === 'importfile' && el.files && el.files[0]) { importBackup(el.files[0]); el.value = ''; }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target; if (f.dataset.form !== 'prompt') return;
    e.preventDefault();
    const val = $('#prompt-in').value; const cb = promptCb; promptCb = null; closeSheet(); if (cb) cb(val);
  });
  document.addEventListener('click', (e) => {
    const inp = e.target.closest('.dp-in');
    if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch (err) { /* bazı tarayıcılar izin vermez */ } }
  });

  // --- slider sürükleme ve basılı tutma
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.vs-btn');
    if (btn) { e.preventDefault(); stepRepeat(btn, e); return; }
    const tr = e.target.closest('.vs-track');
    if (tr) dragSlider(tr, e);
  });
  function snap(v, cfg) {
    const s = cfg.step || 1; let x = Math.round((v - cfg.min) / s) * s + cfg.min;
    x = Math.min(Math.max(x, cfg.min), cfg.max);
    return Number(x.toFixed(cfg.dec || 0));
  }
  function setSlider(vs, v) {
    const cfg = CFG[vs.dataset.cfg]; const path = vs.dataset.path;
    if (getv(path) === v) return;
    setv(path, v);
    const pos = ((v - cfg.min) / (cfg.max - cfg.min)) * 100;
    vs.classList.remove('empty', 'f-hi', 'f-lo');
    const f = cfg.lo != null ? vitalFlag(cfg, v) : ''; if (f) vs.classList.add('f-' + f);
    vs.querySelector('.vs-thumb').style.left = pos + '%';
    vs.querySelector('.vs-v b').textContent = fmt(v, cfg.dec);
    vs.querySelector('.vs-track').setAttribute('aria-valuenow', v);
  }
  function stepRepeat(btn) {
    const vs = btn.closest('.vs'); const cfg = CFG[vs.dataset.cfg]; const dir = Number(btn.dataset.step);
    const step = () => { const c = getv(vs.dataset.path); setSlider(vs, isNum(c) ? snap(Number(c) + dir * cfg.step, cfg) : cfg.def); };
    step(); buzz();
    let t = setTimeout(function rep() { step(); t = setTimeout(rep, 70); }, 420);
    const stop = () => { clearTimeout(t); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); refreshSummary(); };
    window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
  }
  function dragSlider(tr, e) {
    const vs = tr.closest('.vs'); const cfg = CFG[vs.dataset.cfg];
    const rect = tr.getBoundingClientRect(); const c = getv(vs.dataset.path);
    const st = { x: e.clientX, y: e.clientY, v0: isNum(c) ? Number(c) : cfg.def, moved: false, id: e.pointerId };
    const move = (ev) => {
      if (ev.pointerId !== st.id) return;
      const dx = ev.clientX - st.x; const dy = ev.clientY - st.y;
      if (!st.moved) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) { done(); return; }
        st.moved = true; vs.classList.add('drag');
        try { tr.setPointerCapture(st.id); } catch (err) { /* yok say */ }
      }
      ev.preventDefault();
      setSlider(vs, snap(st.v0 + (dx / rect.width) * (cfg.max - cfg.min), cfg));
    };
    const up = (ev) => {
      if (ev.pointerId !== st.id) return;
      if (!st.moved && ev.type === 'pointerup') { const r = (ev.clientX - rect.left) / rect.width; setSlider(vs, snap(cfg.min + r * (cfg.max - cfg.min), cfg)); buzz(); }
      done(); refreshSummary();
    };
    const done = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); vs.classList.remove('drag'); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  // ------------------------------------------------------------------ pano, paylaşım, yedek
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function buzz(ms = 8) { if (!S.meta.haptic) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* yok say */ } }
  function selectText(el) { if (!el) return; try { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* yok say */ } }
  function copyText(txt, el) {
    const fallback = () => { selectText(el); toast('Metin seçildi; "Kopyala" ile panoya alın.'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast('Panoya kopyalandı'), fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  function shareText(title, text) { try { navigator.share({ title, text }).catch(() => {}); } catch (e) { copyText(text); } }
  function backupData() {
    const meta = Object.assign({}, S.meta); delete meta.pinHash; delete meta.pinSalt;
    return JSON.stringify({ app: APP, v: 1, exportedAt: new Date().toISOString(), patients: S.patients, meta }, null, 1);
  }
  let downloadsCap = null;
  async function exportBackup(how) {
    await flush();
    const data = backupData(); const name = `konsultasyon-yedek-${today()}.json`;
    const ok = () => { S.meta.lastBackup = Date.now(); saveMeta(); render(); };
    if (how === 'copy') {
      try { await navigator.clipboard.writeText(data); toast('Yedek panoya kopyalandı. Güvenli bir yere yapıştırın.'); ok(); }
      catch (e) { toast('Pano kullanılamadı; dosya olarak indirin.'); }
      return;
    }
    if (IN_ARTIFACT) {
      if (!downloadsCap) { try { downloadsCap = await window.claude.use('downloads'); } catch (e) { downloadsCap = null; } }
      if (!downloadsCap) { toast('Bu görünümde dosya indirilemiyor; "Panoya kopyala"yı kullanın.'); return; }
      try { await downloadsCap.save({ filename: name, data }); toast('Yedek dosyası kaydedildi'); ok(); }
      catch (e) { if (e && e.code === 'declined') toast('İndirme iptal edildi'); else toast('Dosya kaydedilemedi; "Panoya kopyala"yı kullanın.'); }
      return;
    }
    try {
      const blob = new Blob([data], { type: 'application/json' });
      const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: 'Konsültasyon yedeği' }); ok(); return;
      }
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Yedek dosyası indirildi'); ok();
    } catch (e) { if (!(e && e.name === 'AbortError')) toast('Yedek alınamadı'); }
  }
  function importBackup(file) {
    const rd = new FileReader();
    rd.onload = () => {
      let d; try { d = JSON.parse(rd.result); } catch (e) { toast('Dosya okunamadı: geçerli bir yedek değil.'); return; }
      if (!d || d.app !== APP || !Array.isArray(d.patients)) { toast('Bu dosya Konsültasyon Defteri yedeği değil.'); return; }
      let nNew = 0, nUpd = 0;
      d.patients.forEach((p) => { const ex = S.patients.find((x) => x.id === p.id); if (!ex) nNew++; else if ((p.updatedAt || 0) > (ex.updatedAt || 0)) nUpd++; });
      openSheet(`<div class="sh-h"><b>Yedekten geri yükle</b></div><p>${d.patients.length} kayıt bulundu (${d.exportedAt ? new Date(d.exportedAt).toLocaleString('tr-TR') : 'tarih yok'}). ${nNew} yeni hasta eklenecek, ${nUpd} kayıt daha yeni sürümüyle güncellenecek. Mevcut diğer kayıtlar korunur.</p>
        <div class="row-btns"><button class="btn grow" data-act="sheet-close">Vazgeç</button><button class="btn primary grow" data-act="import-ok">Geri yükle</button></div>`);
      importCb = async () => {
        const changed = [];
        d.patients.forEach((raw) => {
          const p = normalize(raw); const i = S.patients.findIndex((x) => x.id === p.id);
          if (i < 0) { S.patients.push(p); changed.push(p); } else if ((p.updatedAt || 0) > (S.patients[i].updatedAt || 0)) { S.patients[i] = p; changed.push(p); }
        });
        if (d.meta) {
          S.meta.custom = S.meta.custom || {};
          Object.entries(d.meta.custom || {}).forEach(([k, l]) => { const t = S.meta.custom[k] = S.meta.custom[k] || []; (l || []).forEach((x) => { if (!t.includes(x)) t.push(x); }); });
          if (!S.meta.doctor && d.meta.doctor) S.meta.doctor = d.meta.doctor;
          saveMeta();
        }
        try { await Store.putPatients(changed); toast(`${changed.length} kayıt geri yüklendi`); } catch (e) { toast('Geri yükleme kaydedilemedi.'); }
        render();
      };
    };
    rd.readAsText(file);
  }

  // ------------------------------------------------------------------ PIN kilidi
  let locked = false; let pinBuf = ''; let pinMode = null; let pinFirst = '';
  const lockOn = () => locked;
  async function hashPin(pin, salt) {
    const txt = salt + ':' + pin;
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 5381; for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0; return 'd' + (h >>> 0).toString(16);
    }
  }
  function lockHTML(title, sub) {
    return `<div class="lock-in"><div class="lock-ic">${ic('lock')}</div><b>${esc(title)}</b><span class="lock-sub">${esc(sub || '')}</span>
      <div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i < pinBuf.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="np-k">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'x', '0', 'bk'].map((k) => k === 'bk' ? `<button class="np-b fn" data-act="pin-key" data-k="bk" aria-label="Sil">${ic('bksp')}</button>` : k === 'x' ? (pinMode === 'unlock' ? `<button class="np-b fn sm" data-act="pin-forgot">Unuttum</button>` : `<button class="np-b fn sm" data-act="pin-cancel">Vazgeç</button>`) : `<button class="np-b" data-act="pin-key" data-k="${k}">${k}</button>`).join('')}</div></div>`;
  }
  function showLock() {
    locked = true; pinMode = 'unlock'; pinBuf = '';
    const l = $('#lock'); l.innerHTML = lockHTML('Konsültasyon Defteri', 'PIN girin'); l.hidden = false;
  }
  function pinSetup() {
    pinMode = 'set1'; pinBuf = ''; pinFirst = '';
    const l = $('#lock'); l.innerHTML = lockHTML('Yeni PIN', '4 hane girin'); l.hidden = false;
  }
  A['pin-key'] = async (el) => {
    const k = el.dataset.k;
    if (k === 'bk') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < 4) pinBuf += k;
    buzz(4);
    const l = $('#lock');
    l.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i < pinBuf.length));
    if (pinBuf.length < 4) return;
    if (pinMode === 'unlock') {
      const h = await hashPin(pinBuf, S.meta.pinSalt);
      if (h === S.meta.pinHash) { locked = false; pinMode = null; pinBuf = ''; l.hidden = true; l.innerHTML = ''; }
      else { pinBuf = ''; l.querySelector('.dots').classList.add('shake'); buzz(60); setTimeout(() => { l.innerHTML = lockHTML('Konsültasyon Defteri', 'PIN hatalı, tekrar deneyin'); }, 350); }
    } else if (pinMode === 'set1') {
      pinFirst = pinBuf; pinBuf = ''; pinMode = 'set2'; l.innerHTML = lockHTML('PIN tekrar', 'Onaylamak için aynı 4 haneyi girin');
    } else if (pinMode === 'set2') {
      if (pinBuf === pinFirst) {
        S.meta.pinSalt = uid(); S.meta.pinHash = await hashPin(pinBuf, S.meta.pinSalt); saveMeta();
        pinMode = null; pinBuf = ''; l.hidden = true; l.innerHTML = ''; toast('PIN belirlendi'); render();
      } else { pinMode = 'set1'; pinBuf = ''; l.innerHTML = lockHTML('Yeni PIN', 'PIN\'ler eşleşmedi, baştan girin'); }
    }
  };
  A['pin-cancel'] = () => { pinMode = null; pinBuf = ''; const l = $('#lock'); l.hidden = true; l.innerHTML = ''; };
  A['pin-forgot'] = () => {
    const l = $('#lock');
    l.innerHTML = `<div class="lock-in"><div class="lock-ic">${ic('lock')}</div><b>PIN'i unuttum</b><p class="lock-sub">Kilit ancak bu telefondaki tüm kayıtlar silinerek kaldırılabilir. Yedek dosyanız varsa sonra geri yükleyebilirsiniz.</p>
      <div class="row-btns"><button class="btn grow" data-act="pin-back">Geri</button><button class="btn danger solid grow" data-act="pin-wipe">Tümünü sil</button></div></div>`;
  };
  A['pin-back'] = () => showLock();
  A['pin-wipe'] = async () => {
    S.patients = []; dirty.clear(); try { await Store.clearAll(); } catch (e) { /* devam */ }
    S.meta = Object.assign(defaultMeta(), { seeded: true }); saveMeta();
    locked = false; const l = $('#lock'); l.hidden = true; l.innerHTML = ''; applyPrefs(); goList(); toast('Veriler silindi, kilit kaldırıldı');
  };

  // ------------------------------------------------------------------ yaşam döngüsü
  let hiddenAt = 0; let wakeLock = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); flush(); }
    else {
      if (S.meta.pinHash && !locked && pinMode === null && Date.now() - hiddenAt > (S.meta.lockMin || 5) * 60000) showLock();
      if (S.meta.wake) requestWake();
      if (ui.view === 'list') render();
    }
  });
  window.addEventListener('pagehide', () => { flush(); });
  async function requestWake() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); } } catch (e) { wakeLock = null; }
  }
  let themeSet = false;
  function applyPrefs() {
    const r = document.documentElement;
    if (S.meta.theme === 'light' || S.meta.theme === 'dark') { r.setAttribute('data-theme', S.meta.theme); themeSet = true; }
    else if (themeSet) { r.removeAttribute('data-theme'); themeSet = false; }
    r.classList.toggle('big', S.meta.font === 'l');
    if (S.meta.wake) requestWake(); else if (wakeLock) { try { wakeLock.release(); } catch (e) { /* yok say */ } wakeLock = null; }
  }

  function demoPatient() {
    const t = today(); const p = newPatient();
    Object.assign(p, {
      demo: true, name: 'ÖRNEK HASTA', protocol: '000000', age: 71, sex: 'E', weight: 72, height: 170, ward: 'Dahiliye', room: '312', bed: 'B',
      admitDate: addDays(t, -6), reasons: ['Ateş', 'Antibiyotik onayı'], comorb: ['DM', 'KBY'], risks: ['Son 90 gün antibiyotik'], allergy: ['Yok'],
      devices: [{ id: uid(), type: 'SVK', date: addDays(t, -4) }, { id: uid(), type: 'Üriner kateter', date: addDays(t, -6) }]
    });
    const v1 = p.visits[0]; v1.date = addDays(t, -2); v1.time = '10:20';
    Object.assign(v1, {
      vitals: { temp: 38.1, hr: 98, sbp: 118, dbp: 70, rr: 18, spo2: 95, o2: 'Oda havası', gcs: 15 },
      labs: { wbc: 11.2, neu: 9.1, hb: 10.4, plt: 188, crp: 95, pct: 0.8, cr: 1.5, ure: 64 },
      exam: { gd: 'Orta', bil: 'Açık, oryante', sol: ['Doğal'], bat: ['Doğal'], kat: ['Temiz'] },
      dx: ['Sepsis'], recs: ['2 set kan kültürü alınması (periferik + kateter)', 'İdrar tetkiki ve idrar kültürü'], nextDate: t
    });
    const v2 = newVisit(); v2.time = '09:40';
    Object.assign(v2, {
      vitals: { temp: 38.4, tmax: 39.1, hr: 112, sbp: 96, dbp: 58, rr: 23, spo2: 93, o2: 'Nazal kanül', gcs: 15, urine: 'Oligüri' },
      labs: { wbc: 15.2, neu: 13.1, lym: 0.8, hb: 9.8, plt: 142, crp: 182, pct: 4.6, cr: 1.8, ure: 88, alb: 2.9, lac: 2.4 },
      tit: ['Normal'],
      exam: { gd: 'Orta', bil: 'Açık, oryante', sol: ['Raller (sağ)'], kvs: ['Taşikardi'], bat: ['Doğal'], kat: ['Hiperemi', 'Hassasiyet'] },
      dx: ['KİKDE', 'Sepsis'],
      recs: ['Kateterin çıkarılması', 'Kateter ucu kültürü', 'Kontrol kan kültürü (48-72 saat sonra)', 'Temas izolasyonu', 'Dozların kreatinin klirensine göre ayarlanması'],
      nextDate: addDays(t, 1)
    });
    p.visits.push(v2);
    p.cultures = [
      { id: uid(), type: 'Kan kültürü', date: addDays(t, -2), result: 'Üreme var', bottles: '2/2 şişe', gram: 'Gram (−) basil', isolates: [{ id: uid(), org: 'K. pneumoniae', resist: ['OXA-48', 'ESBL'], ast: { Meropenem: 'R', 'Pip-tazo': 'R', 'Seftaz-avibaktam': 'S', Amikasin: 'S', Kolistin: 'S', Siprofloksasin: 'R' } }] },
      { id: uid(), type: 'İdrar kültürü', date: addDays(t, -2), result: 'Bekleniyor', isolates: [{ id: uid(), resist: [], ast: {} }] }
    ];
    p.sero = { HBsAg: '-', 'Anti-HCV': '-', 'Anti-HIV': '-' };
    p.abx = [
      { id: uid(), drug: 'Meropenem', dose: '1 g 2x1', route: 'IV', status: 'stop', start: addDays(t, -4) },
      { id: uid(), drug: 'Seftazidim-avibaktam', dose: '1,25 g 3x1', route: 'IV', ext: true, status: 'start', start: t, appr: 'Onaylandı', apprDays: 7, apprDate: t, note: 'CrCl 31-50 için doz ayarlı' }
    ];
    return normalize(p);
  }

  async function boot() {
    await Store.init();
    let data = { patients: [], meta: {} };
    try { data = await Store.load(); } catch (e) { toast('Kayıtlar okunamadı.'); }
    S.patients = (data.patients || []).map(normalize);
    S.meta = Object.assign(defaultMeta(), data.meta || {});
    if (!S.meta.seeded && !S.patients.length) { const d = demoPatient(); S.patients.push(d); dirty.add(d.id); flush(); }
    if (!S.meta.seeded) { S.meta.seeded = true; saveMeta(); }
    applyPrefs();
    if (S.meta.pinHash) showLock();
    render();
    try {
      if (navigator.storage && navigator.storage.persist && S.meta.persisted !== true) {
        navigator.storage.persist().then((ok) => { S.meta.persisted = ok; saveMeta(); }).catch(() => {});
      }
    } catch (e) { /* yok say */ }
    if (!IN_ARTIFACT && 'serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  boot();
})();
