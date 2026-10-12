// Zaman çizelgesi: sahne süreleri (kareye hizalı), bölüm zaman damgaları ve altyazı (SRT).

import type { Scene } from '../lib/script.ts';

export interface TimedScene {
  id: string;
  start: number; // saniye
  duration: number; // saniye (kare sayısı / fps)
  frames: number;
  audioOffset: number; // sahne içinde sesin başladığı an (J-cut'ta negatif: ses görüntüden önce başlar)
  audioDuration: number;
  audioStart: number; // sesin videodaki mutlak başlangıcı
}

export function buildTimeline(
  scenes: Pick<Scene, 'id'>[],
  audioDurations: Record<string, number>,
  opts: { fps: number; lead: number; tail: number },
): TimedScene[] {
  let frameCursor = 0;
  return scenes.map((s) => {
    const audio = audioDurations[s.id];
    if (audio === undefined) throw new Error(`Sahne sesi eksik: ${s.id}`);
    const frames = Math.ceil((opts.lead + audio + opts.tail) * opts.fps);
    const t: TimedScene = {
      id: s.id,
      start: frameCursor / opts.fps,
      duration: frames / opts.fps,
      frames,
      audioOffset: opts.lead,
      audioDuration: audio,
      audioStart: frameCursor / opts.fps + opts.lead,
    };
    frameCursor += frames;
    return t;
  });
}

/**
 * J-cut zaman çizelgesi: anlatımlar arka arkaya (aralarında kısa nefes) dizilir; görüntü bir sonraki sahneye,
 * o sahnenin sesi başladıktan `jcut` saniye SONRA geçer. Böylece ses görüntüden önce gelir, kesmeler fark edilmez.
 */
export function buildJcutTimeline(
  scenes: Pick<Scene, 'id'>[],
  audioDurations: Record<string, number>,
  opts: { fps: number; lead: number; gap: number; jcut: number; tail: number },
): TimedScene[] {
  const fps = opts.fps;
  const a: number[] = [];
  let cursor = opts.lead;
  for (const s of scenes) {
    const d = audioDurations[s.id];
    if (d === undefined) throw new Error(`Sahne sesi eksik: ${s.id}`);
    a.push(cursor);
    cursor += d + opts.gap;
  }
  const lastEnd = a[a.length - 1] + audioDurations[scenes[scenes.length - 1].id] + opts.tail;
  const cutFrames = scenes.map((_, i) => (i === 0 ? 0 : Math.round((a[i] + opts.jcut) * fps)));
  cutFrames.push(Math.ceil(lastEnd * fps));
  return scenes.map((s, i) => {
    const start = cutFrames[i] / fps;
    const frames = cutFrames[i + 1] - cutFrames[i];
    return { id: s.id, start, duration: frames / fps, frames, audioOffset: a[i] - start, audioDuration: audioDurations[s.id], audioStart: a[i] };
  });
}

export function totalDuration(tl: TimedScene[]): number {
  const last = tl[tl.length - 1];
  return last ? last.start + last.duration : 0;
}

/** 75 → "1:15", 3725 → "1:02:05" (YouTube bölüm biçimi). */
export function formatTimestamp(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * YouTube bölüm kuralları: ilki 0:00, en az 3 bölüm, her biri en az 10 saniye.
 * Kurallar sağlanmazsa boş liste döner (bölümsüz açıklama).
 */
export function chapters(scenes: Pick<Scene, 'id' | 'chapter'>[], tl: TimedScene[]): { time: string; title: string }[] {
  const marks: { start: number; title: string }[] = [];
  scenes.forEach((s, i) => {
    if (!s.chapter) return;
    const start = i === 0 ? 0 : tl[i].start;
    const prev = marks[marks.length - 1];
    if (prev && start - prev.start < 10) return; // çok kısa bölümü bir öncekine kat
    marks.push({ start, title: s.chapter });
  });
  if (marks.length && marks[0].start !== 0) marks.unshift({ start: 0, title: 'Intro' });
  const end = totalDuration(tl);
  if (marks.length && end - marks[marks.length - 1].start < 10) marks.pop();
  if (marks.length < 3) return [];
  return marks.map((m) => ({ time: formatTimestamp(m.start), title: m.title }));
}

/** Metni altyazı parçalarına böler (cümle ve virgül sınırlarında, en çok ~84 karakter). */
export function captionChunks(text: string, max = 84): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const out: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= max) {
      out.push(sentence);
      continue;
    }
    let cur = '';
    for (const word of sentence.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      const breakAtComma = cur.endsWith(',') && cur.length > max * 0.5;
      if ((next.length > max || breakAtComma) && cur) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function srtTime(t: number): string {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** Altyazı dosyası: her sahnenin sesi içinde parçalar karakter sayısına orantılı zamanlanır. */
export function buildSrt(scenes: Pick<Scene, 'id' | 'narration'>[], tl: TimedScene[]): string {
  const cues: string[] = [];
  scenes.forEach((s, i) => {
    const t = tl[i];
    const chunks = captionChunks(s.narration);
    const totalChars = chunks.reduce((n, c) => n + c.length, 0) || 1;
    let cursor = t.start + t.audioOffset;
    for (const c of chunks) {
      const d = (c.length / totalChars) * t.audioDuration;
      cues.push(`${cues.length + 1}\n${srtTime(cursor)} --> ${srtTime(cursor + d)}\n${c}\n`);
      cursor += d;
    }
  });
  return cues.join('\n');
}

/**
 * Görsel öğelerin (madde, tablo satırı, adım) anlatıma göre ne zaman belireceği:
 * n öğe sesin %10–%85 aralığına eşit dağıtılır.
 */
export function revealTimes(n: number, t: Pick<TimedScene, 'audioOffset' | 'audioDuration'>): number[] {
  if (n <= 0) return [];
  const from = t.audioOffset + t.audioDuration * 0.1;
  const to = t.audioOffset + t.audioDuration * 0.85;
  if (n === 1) return [from];
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}
