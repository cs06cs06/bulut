// Senaryoyu (episode.js) zaman çizelgesine çevirir.
// Saf JS: hem tarayıcıda (animasyon) hem Node'da (ses miksajı) kullanılır.

export const FPS = 24;

const GAP = 0.28; // iki replik arası nefes
const SCENE_TAIL = 0.35;
const TRANSITION = 0.9; // sahneler arası kararma
const WALK_SPEED = 1.25;

export const GESTURE_DUR = {
  point: 1.4, shrug: 1.3, raise: 1.6, explain: 0, facepalm: 2.0, cross: 0, hips: 0,
  wave: 1.5, scratch: 1.8, jump: 0.7, nod: 1.0, shake: 1.1, count1: 1.4, count2: 1.4,
  count3: 1.8, present: 1.6, stop: 1.3, hush: 1.6, flail: 1.5, heart: 1.8, think: 2.2,
  inspect: 1.8, shake_key: 1.4, sip: 1.6, glasses: 1.4, freeze: 1.6, work: 2.4,
  phoneShow: 1.6,
};

// Replik metninden TTS'ye gidecek temiz metin
export function speechText(text) {
  return text.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
}

export function lineId(sceneId, idx) {
  return `${sceneId}-${String(idx).padStart(3, '0')}`;
}

// Seslendirilecek bütün replikler (her ses için bir kayıt)
export function listLines(episode) {
  const out = [];
  for (const sc of episode.scenes) {
    sc.beats.forEach((b, i) => {
      if (b.type !== 'say') return;
      const id = lineId(sc.id, i);
      const whos = Array.isArray(b.who) ? b.who : [b.who];
      for (const w of whos) {
        out.push({
          id: whos.length > 1 ? `${id}~${w}` : id,
          who: w,
          text: speechText(b.text),
          voice: episode.cast[w].voice,
        });
      }
    });
  }
  return out;
}

const DEG = Math.PI / 180;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const angDiff = (a, b) => {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

// --- izleri değerlendirme (tarayıcı + node) ---------------------------------
export function lastKey(arr, t) {
  // arr t'ye göre sıralı; t'den küçük-eşit son anahtar
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function evalTween(arr, t, ang = false) {
  const i = lastKey(arr, t);
  if (i < 0) return arr.length ? arr[0].from : 0;
  const k = arr[i];
  const p = k.dur > 0 ? smooth((t - k.t) / k.dur) : 1;
  return ang ? k.from + angDiff(k.from, k.to) * p : k.from + (k.to - k.from) * p;
}

export function evalStep(arr, t, def = null) {
  const i = lastKey(arr, t);
  return i < 0 ? def : arr[i].v;
}

// Konum: {t,x,y,z,move} — move=true ise önceki anahtardan buna yürünür
export function evalPos(arr, t) {
  const i = lastKey(arr, t);
  if (i < 0) return { x: 0, y: 0, z: 0, walking: false, phase: 0 };
  const a = arr[i];
  const b = arr[i + 1];
  if (b && b.move && t < b.t) {
    const p = (t - a.t) / (b.t - a.t);
    const e = b.ease ? smooth(p) : p;
    return {
      x: a.x + (b.x - a.x) * e,
      y: a.y + (b.y - a.y) * e,
      z: a.z + (b.z - a.z) * e,
      walking: !b.noWalk,
      speed: b.sp,
      phase: (t - a.t) * b.sp,
    };
  }
  return { x: a.x, y: a.y, z: a.z, walking: false, phase: 0 };
}

// --- zaman çizelgesi --------------------------------------------------------
export function buildTimeline(episode, audio, sets) {
  // sets: layout.js içindeki `layout` nesnesi
  const tl = {
    fps: FPS,
    scenes: [],
    beats: [],
    lines: [],
    sfx: [],
    music: [],
    ambience: [],
    chars: {},
    doors: {},
    flags: {},
    van: [{ t: 0, from: -30, to: -30, dur: 0 }],
  };
  const ids = Object.keys(episode.cast);
  for (const id of ids) {
    tl.chars[id] = {
      pos: [], yaw: [], sit: [], vis: [], hold: [], pose: [], outfit: [], emo: [],
      look: [], gest: [], sleep: [], talk: [],
    };
  }
  const st = {}; // simülasyon durumu
  const origin = (setId) => sets[setId].origin;
  const T = tl.chars;

  const pushPos = (id, t, x, y, z, move = false, sp = 0, ease = false) => {
    T[id].pos.push({ t, x, y, z, move, sp, ease });
  };
  const yawTo = (id, t, to, dur = 0.4) => {
    const from = evalTween(T[id].yaw, t, true);
    T[id].yaw.push({ t, from, to, dur });
    st[id].yaw = to;
  };
  const sitTo = (id, t, to, dur, h) => {
    const from = evalTween(T[id].sit, t);
    T[id].sit.push({ t, from, to, dur, h: h ?? st[id].sitH });
    st[id].sit = to;
    if (h !== undefined) st[id].sitH = h;
  };
  const worldOf = (id, xz, y) => {
    const o = origin(st[id].set);
    return { x: o[0] + xz[0], y: (y ?? 0), z: o[2] + xz[1] };
  };
  const headOf = (id) => {
    const s = st[id];
    const h = s.sit ? (s.sitH > 0.3 ? 1.25 : 0.95) : 1.62;
    return [s.x, s.y + h, s.z];
  };
  const targetPoint = (id, at) => {
    if (typeof at === 'string') return headOf(at);
    const o = origin(st[id].set);
    if (at.length === 2) return [o[0] + at[0], 1.5, o[2] + at[1]];
    return [o[0] + at[0], at[1], o[2] + at[2]];
  };
  const yawToward = (id, at) => {
    if (typeof at === 'number') return at * DEG;
    const p = targetPoint(id, at);
    return Math.atan2(p[0] - st[id].x, p[2] - st[id].z);
  };
  const lookVal = (id, at) => (at == null ? null : typeof at === 'string' ? at : targetPoint(id, at));

  let t = 0;
  let prevSceneHad3D = false;

  episode.scenes.forEach((sc, si) => {
    const has3D = !!sc.set;
    if (si > 0) {
      if (prevSceneHad3D && has3D) {
        tl.music.push({ t: t - 0.25, name: 'sting' });
        t += TRANSITION;
      } else t += 0.4;
    }
    const scene = {
      id: sc.id, index: si, start: t, end: 0, set: sc.set || null, time: sc.time,
      ambience: sc.ambience, list: sc.list || 3, title: !!sc.title, credits: !!sc.credits,
    };
    tl.scenes.push(scene);

    if (sc.title) tl.music.push({ t, name: 'theme' });
    if (sc.credits) tl.music.push({ t, name: 'outro' });

    // oyuncuları yerleştir
    if (has3D) {
      for (const id of ids) {
        const c = sc.cast[id];
        const C = T[id];
        if (!c) {
          C.vis.push({ t, v: false });
          continue;
        }
        st[id] = {
          set: c.set || sc.set, yaw: (c.yaw || 0) * DEG, sit: c.sit ? 1 : 0,
          sitH: c.sit === 'floor' ? 0.12 : 0.46, busy: t,
        };
        const w = worldOf(id, c.pos, c.y);
        Object.assign(st[id], w);
        C.vis.push({ t, v: !c.hidden });
        st[id].vis = !c.hidden;
        pushPos(id, t, w.x, w.y, w.z);
        C.pos[C.pos.length - 1].jump = true;
        C.yaw.push({ t, from: st[id].yaw, to: st[id].yaw, dur: 0 });
        C.sit.push({ t, from: st[id].sit, to: st[id].sit, dur: 0, h: st[id].sitH });
        C.hold.push({ t, v: c.hold || null });
        C.pose.push({ t, v: null, prev: null });
        C.outfit.push({ t, v: c.outfit || 'normal' });
        C.emo.push({ t, v: 'neutral' });
        C.sleep.push({ t, v: !!c.sleep });
        C.look.push({ t, v: c.look ? lookVal(id, c.look) : null });
      }
      if (sc.flags) for (const [k, v] of Object.entries(sc.flags)) (tl.flags[k] ||= []).push({ t, v });
      for (const d of Object.keys(sets.doors)) (tl.doors[d] ||= []).push({ t, from: 0, to: 0, dur: 0 });
      tl.ambience.push({ start: t, end: 0, name: sc.ambience });
    }

    let lastSpeaker = null;
    let prevBeat = null;

    // tek bir işlem: başlama zamanı s, süresini döndürür
    const runOp = (op, s) => {
      const who = op.mv || op.face || op.sit || op.stand || op.hold || op.g || op.pose ||
        op.look || op.show || op.hide || op.fit || op.wake || op.emo;
      if ('wait' in op) return op.wait;
      if (op.sfx) { tl.sfx.push({ t: s, name: op.sfx }); return 0; }
      if (op.door) {
        const arr = tl.doors[op.door];
        const from = evalTween(arr, s);
        const dur = op.dur ?? 0.6;
        arr.push({ t: s, from, to: op.v, dur });
        return dur;
      }
      if (op.vis) { (tl.flags[op.vis] ||= []).push({ t: s, v: op.v }); return 0; }
      if (op.van) { tl.van.push({ t: s, from: -30, to: -8.8, dur: 3.2 }); return 0; }
      if (op.mv) {
        const id = op.mv;
        const start = Math.max(s, st[id].busy);
        const w = worldOf(id, op.to, op.y ?? (st[id].y || 0));
        if (op.y === undefined) w.y = st[id].y;
        const dist = Math.hypot(w.x - st[id].x, w.z - st[id].z, (w.y - st[id].y) * 0.6);
        const sp = op.sp || WALK_SPEED;
        const dur = Math.max(0.3, dist / sp);
        pushPos(id, start, st[id].x, st[id].y, st[id].z);
        pushPos(id, start + dur, w.x, w.y, w.z, true, sp);
        const dir = Math.atan2(w.x - st[id].x, w.z - st[id].z);
        if (dist > 0.05) yawTo(id, start, dir, 0.25);
        Object.assign(st[id], w);
        st[id].busy = start + dur;
        return start + dur - s;
      }
      if (op.face) {
        yawTo(op.face, s, yawToward(op.face, op.at), 0.4);
        return 0.4;
      }
      if (op.sit) {
        const id = op.sit;
        const w = worldOf(id, op.at, 0);
        pushPos(id, s, st[id].x, st[id].y, st[id].z);
        pushPos(id, s + 0.6, w.x, 0, w.z, true, 0.4, true);
        T[id].pos[T[id].pos.length - 1].noWalk = true;
        Object.assign(st[id], w);
        yawTo(id, s, (op.yaw ?? 0) * DEG, 0.5);
        sitTo(id, s, 1, 0.7, op.h === 'floor' ? 0.12 : 0.46);
        return 0.7;
      }
      if (op.stand) { sitTo(op.stand, s, 0, 0.6); return 0.6; }
      if (op.hold) { T[op.hold].hold.push({ t: s, v: op.v }); return 0; }
      if (op.fit) { T[op.fit].outfit.push({ t: s, v: op.v }); return 0; }
      if (op.wake) { T[op.wake].sleep.push({ t: s, v: false }); return 0; }
      if (op.emo) { T[op.emo].emo.push({ t: s, v: op.v }); return 0; }
      if (op.pose) {
        const P = T[op.pose].pose;
        P.push({ t: s, v: op.v, prev: P.length ? P[P.length - 1].v : null });
        return 0.3;
      }
      if (op.look) { T[op.look].look.push({ t: s, v: lookVal(op.look, op.at) }); return 0.3; }
      if (op.g) {
        const d = GESTURE_DUR[op.v] || 1.2;
        T[op.g].gest.push({ t: s, dur: d, g: op.v });
        return op.v === 'jump' ? 0 : d * 0.8;
      }
      if (op.show) {
        T[op.show].vis.push({ t: s, v: true });
        st[op.show].vis = true;
        return 0;
      }
      if (op.hide) {
        T[op.hide].vis.push({ t: s, v: false });
        st[op.hide].vis = false;
        return 0;
      }
      if (who) return 0;
      return 0;
    };

    // işlem listesini sırayla/paralel çalıştır; toplam süreyi döndür
    const runOps = (ops, s0) => {
      let cursor = s0;
      let prevStart = s0;
      let end = s0;
      for (const op of ops || []) {
        let s = op.par ? prevStart : cursor;
        if (op.time !== undefined) s = s0 + op.time;
        const startAt = s + (op.delay || 0);
        const d = runOp(op, startAt);
        prevStart = s;
        end = Math.max(end, startAt + d);
        if (!op.par && op.time === undefined) cursor = startAt + d;
        else cursor = Math.max(cursor, startAt + d);
      }
      return end - s0;
    };

    const sameSetVisible = (a, b) => st[a] && st[b] && st[a].vis && st[b].vis && st[a].set === st[b].set;

    sc.beats.forEach((b, bi) => {
      const beat = { scene: si, idx: bi, type: b.type, start: t, cam: b.cam };
      if (b.type === 'title' || b.type === 'credits' || b.type === 'card' || b.type === 'insert') {
        beat.dur = b.dur;
        beat.text = b.text;
        if (b.type === 'insert') {
          beat.insert = b;
          if (b.kind === 'pass') {
            tl.sfx.push({ t: t + 0.35, name: 'typing' });
            tl.sfx.push({ t: t + b.dur * 0.68, name: b.ok ? 'ok' : 'error' });
          } else if (b.kind === 'note') tl.sfx.push({ t: t + 0.1, name: 'page' });
          else tl.sfx.push({ t: t + 0.1, name: 'tap' });
        }
        t += b.dur;
      } else if (b.type === 'act') {
        const d = runOps(b.ops, t);
        beat.dur = Math.max(0.6, d + 0.15);
        beat.text = b.text;
        t += beat.dur;
      } else if (b.type === 'say') {
        const whos = Array.isArray(b.who) ? b.who : [b.who];
        const id = lineId(sc.id, bi);
        const auds = whos.map((w) => audio[whos.length > 1 ? `${id}~${w}` : id]);
        const dur = Math.max(...auds.map((a) => (a ? a.dur : 1.5)));
        const sp = whos[0];
        // muhatap
        let to = b.to;
        if (!to) {
          if (lastSpeaker && !whos.includes(lastSpeaker) && sameSetVisible(sp, lastSpeaker)) to = lastSpeaker;
          else {
            let best = null, bd = 1e9;
            for (const o of ids) {
              if (whos.includes(o) || !sameSetVisible(sp, o)) continue;
              const d = Math.hypot(st[o].x - st[sp].x, st[o].z - st[sp].z);
              if (d < bd) { bd = d; best = o; }
            }
            to = best;
          }
        }
        if (b.os) to = null;
        beat.who = whos;
        beat.to = to;
        beat.lineId = id;
        beat.text = b.text;
        beat.os = !!b.os;
        beat.dur = dur + GAP + (b.pause || 0);
        beat.speechDur = dur;
        beat.continueShot = prevBeat && prevBeat.type === 'say' && prevBeat.who.join() === whos.join() && !b.cam;

        for (const w of whos) {
          if (!st[w]) continue;
          const C = T[w];
          // yüzünü dön (ayakta ve uzaksa)
          if (to && !b.os && st[w].vis && !st[w].sit && sameSetVisible(w, to) && st[w].busy <= t && !b.noface) {
            const want = Math.atan2(st[to].x - st[w].x, st[to].z - st[w].z);
            if (Math.abs(angDiff(st[w].yaw, want)) > 55 * DEG) yawTo(w, t, want, 0.45);
          }
          C.talk.push({ t, end: t + dur, id: whos.length > 1 ? `${id}~${w}` : id });
          C.emo.push({ t, v: b.e || 'neutral' });
          C.emo.push({ t: t + beat.dur, v: 'neutral' });
          if (!b.os) C.look.push({ t, v: b.look ? lookVal(w, b.look) : to });
          if (b.g) {
            const gd = GESTURE_DUR[b.g] || dur;
            C.gest.push({ t: t + 0.12, dur: gd || Math.max(1.2, dur), g: b.g });
          }
        }
        // dinleyenler konuşana bakar
        if (!b.os) {
          for (const o of ids) {
            if (whos.includes(o) || !sameSetVisible(sp, o)) continue;
            if (b.look && whos.includes(sp)) { /* konuşan başka yere bakıyor; dinleyen yine ona */ }
            T[o].look.push({ t: t + 0.15, v: sp });
          }
        } else if (to === null && b.to) {
          // ekran dışı ses: dinleyenler kapıya bakar
        }
        if (b.react) for (const [o, e] of Object.entries(b.react)) T[o].emo.push({ t: t + 0.3, v: e });
        runOps(b.do, t);
        tl.lines.push({
          id, who: whos, start: t, dur, text: b.text, os: !!b.os,
          audio: whos.map((w) => (whos.length > 1 ? `${id}~${w}` : id)),
        });
        lastSpeaker = sp;
        t += beat.dur;
      }
      beat.end = t;
      tl.beats.push(beat);
      prevBeat = beat;
    });

    if (has3D) t += SCENE_TAIL;
    scene.end = t;
    if (has3D) tl.ambience[tl.ambience.length - 1].end = t;
    prevSceneHad3D = has3D;
  });

  tl.duration = t + 0.5;
  for (const c of Object.values(T)) {
    for (const k of Object.keys(c)) if (k !== 'pos') c[k].sort((a, b) => a.t - b.t);
  }
  return tl;
}

export function sceneAt(tl, t) {
  let s = tl.scenes[0];
  for (const sc of tl.scenes) if (sc.start <= t) s = sc;
  return s;
}

export function beatAt(tl, t) {
  const i = lastKey(tl.beats.map((b) => ({ t: b.start })), t);
  return i < 0 ? null : tl.beats[i];
}
