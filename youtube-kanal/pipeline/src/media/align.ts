// Cümle zamanlaması ve altyazılar.
// Seslendirme servisi kelime zaman damgası vermediği için cümle sınırlarını sesteki duraklamalardan (ffmpeg
// silencedetect) buluruz; cümle içinde zamanlama karakter sayısına orantılıdır. Bu sayede altyazılar, vurgu
// (punch-in) ve abone çağrısı anları sesle uyumlu olur.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export interface Silence {
  start: number;
  end: number;
}

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["'”’)\]]*|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

export function parseSilences(stderr: string): Silence[] {
  const out: Silence[] = [];
  let start: number | null = null;
  for (const line of stderr.split('\n')) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    if (s) start = parseFloat(s[1]);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && start !== null) {
      out.push({ start, end: parseFloat(e[1]) });
      start = null;
    }
  }
  return out;
}

export function detectSilences(file: string, noiseDb = -35, minDur = 0.18): Promise<Silence[]> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDur}`, '-f', 'null', '-']);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(parseSilences(err)) : reject(new Error(`silencedetect hata verdi (${code})`))));
  });
}

/**
 * Her cümlenin ses içindeki başlangıç zamanı. Beklenen sınırlar karakter oranından hesaplanır; her biri için
 * yakınındaki (sırayı bozmayan) en uygun duraklama seçilir, bulunamazsa beklenen konum kullanılır.
 */
export function alignSentences(sentences: string[], silences: Silence[], duration: number): number[] {
  const lens = sentences.map((s) => Math.max(1, s.length));
  const total = lens.reduce((a, b) => a + b, 0);
  // Sesin çoğu "sessizlik" görünüyorsa (ör. sessiz deneme sesi) duraklamalara güvenme
  const silent = silences.reduce((a, s) => a + (s.end - s.start), 0);
  if (silent > duration * 0.6) silences = [];
  // Baştaki/sondaki sessizlikleri konuşma süresinden düş
  const lead = silences.length && silences[0].start <= 0.05 ? silences[0].end : 0;
  const lastS = silences[silences.length - 1];
  const tailStart = lastS && lastS.end >= duration - 0.05 ? lastS.start : duration;
  const speech = Math.max(0.1, tailStart - lead);
  const inner = silences.filter((s) => s.start > lead + 0.05 && s.end < tailStart - 0.05);

  const starts = [lead];
  let acc = 0;
  let minT = lead;
  for (let k = 1; k < sentences.length; k++) {
    acc += lens[k - 1];
    const expected = lead + (acc / total) * speech;
    const tol = Math.max(1.2, speech * 0.12);
    let best: Silence | undefined;
    for (const s of inner) {
      const mid = (s.start + s.end) / 2;
      if (s.end <= minT + 0.2 || Math.abs(mid - expected) > tol) continue;
      if (!best || Math.abs(mid - expected) < Math.abs((best.start + best.end) / 2 - expected)) best = s;
    }
    const t = best ? best.end : Math.max(expected, minT + 0.3);
    starts.push(t);
    minT = t;
  }
  return starts;
}

export interface CaptionEvent {
  start: number;
  end: number;
  text: string;
  keywords?: string[];
}

/** Cümleyi kısa altyazı parçalarına böler (en çok `maxWords` kelime, virgülde tercihen). */
export function chunkSentence(sentence: string, maxWords = 6, maxChars = 36): string[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    const next = [...cur, w].join(' ');
    if (cur.length && (cur.length >= maxWords || next.length > maxChars)) {
      out.push(cur.join(' '));
      cur = [];
    }
    cur.push(w);
    if (/[,;:—–]$/.test(w) && cur.length >= 3) {
      out.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) {
    // tek kelimelik son parçayı bir öncekine kat
    if (cur.length === 1 && out.length && (out[out.length - 1] + ' ' + cur[0]).length <= maxChars + 8) out[out.length - 1] += ' ' + cur[0];
    else out.push(cur.join(' '));
  }
  return out;
}

/** Sahne anlatımının altyazı olayları (mutlak zamanlar). */
export function captionEvents(
  narration: string,
  audioStart: number,
  audioDuration: number,
  sentenceStarts: number[],
  opts: { maxWords?: number; maxChars?: number } = {},
): CaptionEvent[] {
  const sentences = splitSentences(narration);
  const events: CaptionEvent[] = [];
  sentences.forEach((sent, k) => {
    const s0 = sentenceStarts[k] ?? 0;
    const s1 = sentenceStarts[k + 1] ?? audioDuration;
    const chunks = chunkSentence(sent, opts.maxWords, opts.maxChars);
    const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
    // cümle sonundaki duraklamayı altyazıdan düş (en çok 0,6 sn)
    const speak = Math.max(0.4, s1 - s0 - Math.min(0.6, (s1 - s0) * 0.15));
    let t = s0;
    for (const c of chunks) {
      const d = (c.length / total) * speak;
      events.push({ start: audioStart + t, end: audioStart + t + d, text: c });
      t += d;
    }
  });
  return events;
}

/** Anlatımda bir ifadenin geçtiği cümlenin başlangıç zamanı (ses içi). */
export function phraseTime(narration: string, phrase: string, sentenceStarts: number[], audioDuration: number): number | null {
  const sentences = splitSentences(narration);
  const p = phrase.toLowerCase();
  const k = sentences.findIndex((s) => s.toLowerCase().includes(p));
  if (k < 0) return null;
  const s0 = sentenceStarts[k] ?? 0;
  const s1 = sentenceStarts[k + 1] ?? audioDuration;
  const pos = sentences[k].toLowerCase().indexOf(p) / Math.max(1, sentences[k].length);
  return s0 + pos * (s1 - s0) * 0.9;
}

// ---------------------------------------------------------------------------
// ASS altyazı (libass ile videoya yakılır)

const assTime = (t: number) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

/** #RRGGBB → ASS &HBBGGRR& */
export function assColor(hex: string): string {
  const h = hex.replace('#', '');
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
}

const escapeAss = (t: string) => t.replace(/[{}]/g, '').replace(/\\/g, '');

/** Anahtar kelimeleri vurgu rengine boyar (büyük/küçük harf duyarsız, kelime sınırında). */
export function highlight(text: string, keywords: string[], color: string): string {
  let out = escapeAss(text);
  const kws = [...new Set(keywords.map((k) => k.trim()).filter((k) => k.length > 2))].sort((a, b) => b.length - a.length);
  for (const k of kws) {
    const re = new RegExp(`(^|[^\\w'])(${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=[^\\w]|$)`, 'gi');
    out = out.replace(re, (_m, pre, word) => `${pre}{\\c${color}}${word}{\\c&HFFFFFF&}`);
  }
  return out;
}

export interface AssStyle {
  width: number;
  height: number;
  fontSize: number;
  marginV: number;
  alignment: number; // 2 = alt orta, 5 = orta, 8 = üst orta
  font?: string;
}

export function buildAss(
  events: { start: number; end: number; text: string; style?: 'Main' | 'Top' }[],
  style: AssStyle,
  topStyle?: AssStyle,
): string {
  const font = style.font ?? 'Inter';
  const line = (name: string, st: AssStyle) =>
    `Style: ${name},${st.font ?? font},${st.fontSize},&H00FFFFFF,&H00FFFFFF,&H00101010,&H96000000,-1,0,0,0,100,100,0,0,1,${Math.round(st.fontSize / 14)},${Math.round(st.fontSize / 22)},${st.alignment},80,80,${st.marginV},1`;
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${style.width}`,
    `PlayResY: ${style.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    line('Main', style),
    line('Top', topStyle ?? { ...style, alignment: 8 }),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events
      .filter((e) => e.end > e.start)
      .map((e) => `Dialogue: 0,${assTime(e.start)},${assTime(e.end)},${e.style ?? 'Main'},,0,0,0,,{\\fad(80,80)}${e.text}`),
    '',
  ].join('\n');
}

/** Olayları [from, to) penceresine kırpıp pencere başına göre kaydırır (sahne başına ASS dosyası için). */
export function windowEvents<T extends { start: number; end: number }>(events: T[], from: number, to: number): T[] {
  return events
    .filter((e) => e.end > from && e.start < to)
    .map((e) => ({ ...e, start: Math.max(0, e.start - from), end: Math.min(to, e.end) - from }));
}

export function writeAss(file: string, content: string): string {
  writeFileSync(file, content);
  return file;
}
