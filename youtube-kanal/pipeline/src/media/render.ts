// Video oluşturma: her sahne HTML olarak kurulur, kare kare ekran görüntüsü alınıp ffmpeg'e verilir;
// sahne parçaları ve ses izi birleştirilerek son video çıkar.

import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Browser } from 'playwright';
import type { ChannelConfig } from '../lib/config.ts';
import type { Scene, Visual } from '../lib/script.ts';
import type { SceneCapture } from './capture.ts';
import { ffmpeg, frameEncoder, probeDuration } from './ffmpeg.ts';
import { renderPhotoScene, type PhotoSceneSpec } from './photoscene.ts';
import { revealTimes, type TimedScene } from './timeline.ts';

const RENDER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'render');

/** Yakalanamayan browser sahnesini, açıklama metinlerinden bir karta çevirir. */
export function effectiveVisual(scene: Scene, capture: SceneCapture | undefined): Visual {
  const v = scene.visual;
  if (v.type !== 'browser' || capture?.ok) return v;
  let host = v.url;
  try {
    host = new URL(v.url).hostname.replace(/^www\./, '');
  } catch {
    /* adres olduğu gibi */
  }
  const captions = v.steps.map((s) => s.caption).filter(Boolean);
  if (captions.length >= 2) return { type: 'bullets', heading: host, items: captions };
  return { type: 'title', heading: captions[0] || host, sub: host };
}

function revealCount(v: Visual): number {
  switch (v.type) {
    case 'bullets':
      return v.items.length;
    case 'steps':
      return v.steps.length;
    case 'compare':
      return v.rows.length;
    default:
      return 0;
  }
}

export interface SceneSpec {
  brand: ChannelConfig['brand'];
  look?: ChannelConfig['look'];
  images: string[];
  seed: number;
  first: boolean;
  last: boolean;
  total: number;
  videoTitle: string;
  edit?: ChannelConfig['edit'];
  cadence?: number;
  punchAt?: number | null;
  subscribeAt?: number | null;
  assFile?: string;
  channel: string;
  chapter: string;
  visual: Visual;
  duration: number;
  audioOffset: number;
  audioDuration: number;
  reveals: number[];
  shots: { src: string; kind: string; box: unknown; caption: string }[];
}

export function sceneSpecs(
  channel: ChannelConfig,
  scenes: Scene[],
  tl: TimedScene[],
  captures: SceneCapture[],
  images: Record<string, string[]> = {},
  videoTitle = '',
  extras: Record<string, { punchAt?: number | null; subscribeAt?: number | null; assFile?: string }> = {},
): SceneSpec[] {
  const byId = new Map(captures.map((c) => [c.sceneId, c]));
  const total = scenes.filter((s) => s.visual.type === 'photos' && s.visual.number > 0).length;
  let chapter = '';
  return scenes.map((s, i) => {
    if (s.chapter) chapter = s.chapter;
    const cap = byId.get(s.id);
    const visual = effectiveVisual(s, cap);
    const t = tl[i];
    return {
      brand: channel.brand,
      look: channel.look,
      images: (images[s.id] ?? []).map((f) => pathToFileURL(f).href),
      seed: i + 1,
      first: i === 0,
      last: i === scenes.length - 1,
      total,
      videoTitle,
      edit: channel.edit,
      cadence: s.cadence,
      ...extras[s.id],
      channel: channel.name,
      chapter,
      visual,
      duration: t.duration,
      audioOffset: t.audioOffset,
      audioDuration: t.audioDuration,
      reveals: revealTimes(revealCount(visual), t),
      shots:
        visual.type === 'browser' && cap
          ? cap.shots.map((sh) => ({ src: pathToFileURL(sh.file).href, kind: sh.kind, box: sh.box, caption: sh.caption }))
          : [],
    };
  });
}

/** Tek sahneyi mp4 parçası olarak oluşturur. Değişmeyen kareler yeniden çekilmez. */
async function renderScene(browser: Browser, spec: SceneSpec, frames: number, fps: number, out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(join(RENDER_DIR, 'stage.html')).href);
    await page.evaluate((s) => (window as unknown as { mountScene: (s: unknown) => boolean }).mountScene(s), spec);
    await page.evaluate(() => document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {})))));
    const enc = frameEncoder(out, fps);
    let lastKey = '';
    let lastFrame: Buffer | null = null;
    for (let f = 0; f < frames; f++) {
      const key = await page.evaluate((t) => (window as unknown as { seek: (t: number) => string }).seek(t), f / fps);
      if (key !== lastKey || !lastFrame) {
        lastFrame = await page.screenshot({ type: 'jpeg', quality: 90, animations: 'disabled', caret: 'initial', scale: 'css' });
        lastKey = key;
      }
      await enc.write(lastFrame);
    }
    await enc.end();
  } finally {
    await page.close();
  }
}

function specHash(spec: SceneSpec, frames: number): string {
  const stage =
    readFileSync(join(RENDER_DIR, 'stage.js'), 'utf8') +
    readFileSync(join(RENDER_DIR, 'stage.html'), 'utf8') +
    readFileSync(new URL('./photoscene.ts', import.meta.url), 'utf8');
  return createHash('sha1').update(JSON.stringify({ spec, frames, stage })).digest('hex').slice(0, 16);
}

/** Bütün sahneleri paralel oluşturur; aynı içerikle daha önce oluşturulmuş parçaları yeniden kullanır. */
export async function renderSegments(
  browser: Browser,
  specs: SceneSpec[],
  tl: TimedScene[],
  fps: number,
  dir: string,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const files = specs.map((_, i) => join(dir, `${tl[i].id}.mp4`));
  const queue = specs.map((spec, i) => i);
  let done = 0;
  const workers = Math.max(1, Math.min(4, cpus().length - 1));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        const hash = specHash(specs[i], tl[i].frames);
        const marker = files[i] + '.hash';
        if (!(existsSync(files[i]) && existsSync(marker) && readFileSync(marker, 'utf8') === hash)) {
          if (specs[i].visual.type === 'photos') {
            await renderPhotoScene(browser, specs[i] as unknown as PhotoSceneSpec, tl[i].frames, fps, files[i], dir);
          } else {
            await renderScene(browser, specs[i], tl[i].frames, fps, files[i]);
          }
          writeFileSync(marker, hash);
        }
        onProgress(++done, specs.length);
      }
    }),
  );
  return files;
}

/** Sahne seslerini girişte/sonda sessizlikle tam sahne süresine getirip tek ses izinde birleştirir. */
export async function buildAudio(
  audioFiles: string[],
  tl: TimedScene[],
  dir: string,
  out: string,
  music?: { file: string; volume: number },
): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const parts: string[] = [];
  for (let i = 0; i < tl.length; i++) {
    const t = tl[i];
    const part = join(dir, `${t.id}.wav`);
    const delayMs = Math.round(t.audioOffset * 1000);
    await ffmpeg([
      '-i', audioFiles[i],
      '-af', `aresample=48000,adelay=${delayMs}:all=1,apad`,
      '-t', t.duration.toFixed(6),
      '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le',
      part,
    ]);
    parts.push(part);
  }
  const list = join(dir, 'audio.txt');
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const narration = join(dir, 'narration.wav');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', narration]);

  // YouTube ses seviyesi hedefi ≈ -14 LUFS
  if (music?.file && existsSync(music.file)) {
    await ffmpeg([
      '-i', narration, '-stream_loop', '-1', '-i', music.file,
      '-filter_complex',
      `[1:a]aresample=48000,volume=${music.volume}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
      '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', out,
    ]);
  } else {
    await ffmpeg(['-i', narration, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', out]);
  }
}

/** Kısa, tok bir "pop" ses efekti (abone animasyonu için). */
export async function makePop(out: string): Promise<string> {
  await ffmpeg([
    '-f', 'lavfi', '-i',
    "aevalsrc='0.55*sin(2*PI*1500*t)*exp(-t*40)+0.6*sin(2*PI*190*t)*exp(-t*22)':s=48000:d=0.3",
    '-af', 'pan=stereo|c0=c0|c1=c0', out,
  ]);
  return out;
}

/**
 * Anlatımları mutlak zamanlarına (J-cut zaman çizelgesi) yerleştirip ses efektlerini ekler; hafif ses işleme
 * (alçak frekans temizliği, sıkıştırma) ve YouTube ses seviyesi (-14 LUFS) uygular.
 */
export async function buildPlacedAudio(
  placements: { file: string; start: number }[],
  total: number,
  out: string,
  sfx: { file: string; start: number; volume?: number }[] = [],
): Promise<void> {
  const inputs = [...placements.map((p) => ({ ...p, volume: 1 })), ...sfx.map((s) => ({ ...s, volume: s.volume ?? 0.5 }))];
  const args: string[] = [];
  const parts: string[] = [];
  inputs.forEach((p, i) => {
    args.push('-i', p.file);
    const ms = Math.max(0, Math.round(p.start * 1000));
    parts.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${p.volume},adelay=${ms}:all=1[a${i}]`);
  });
  const mix = `${inputs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${inputs.length}:normalize=0:duration=longest:dropout_transition=0,apad,atrim=0:${total.toFixed(3)}`;
  const chain = 'highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2,loudnorm=I=-14:TP=-1.5:LRA=9';
  await ffmpeg([...args, '-filter_complex', `${parts.join(';')};${mix},${chain}[out]`, '-map', '[out]', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', out]);
}

export async function muxFinal(segments: string[], audio: string, dir: string, out: string): Promise<number> {
  const list = join(dir, 'video.txt');
  writeFileSync(list, segments.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  await ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', list,
    '-i', audio,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'copy',
    '-shortest', '-movflags', '+faststart',
    out,
  ]);
  return probeDuration(out);
}

/** 1280×720 kapak görseli (JPEG: YouTube kapak sınırı 2 MB). */
export async function renderThumbnail(
  browser: Browser,
  opts: { brand: ChannelConfig['brand']; text: string; badge: string; tool: string; image?: string; style?: 'browser' | 'bar' },
  out: string,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(join(RENDER_DIR, 'thumbnail.html')).href);
    await page.evaluate(
      (s) => (window as unknown as { mountThumb: (s: unknown) => Promise<unknown> }).mountThumb(s),
      { ...opts, image: opts.image ? pathToFileURL(opts.image).href : '' },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out, type: 'jpeg', quality: 92 });
  } finally {
    await page.close();
  }
}
