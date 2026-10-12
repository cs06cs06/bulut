// Görsel sahneleri (listicle) — v2.
// Her ~5 saniyede yeni bir çekim (B-roll temposu): her görselden geniş / orta / yakın kadrajlar alınır, çekimler
// arasında düz kesme yapılır. Vurgu cümlesinde aynı kadraj %15–20 ani yakınlaşır (punch-in). Yazı katmanları
// (madde rozeti, abone animasyonu, bitiş ekranı) tarayıcıda bir kez saydam PNG olarak çizilir; altyazılar libass ile
// yakılır. Film görünümü (ton, kenar kararması, gren) her görsele bir kez işlenir.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Browser } from 'playwright';
import type { ChannelConfig } from '../lib/config.ts';
import { ffmpeg } from './ffmpeg.ts';

const W0 = 3840; // pişirilmiş görsel boyutu (çıktının 2 katı: yumuşak hareket ve yakın kadrajlar için)
const H0 = 2160;

export type EditConfig = NonNullable<ChannelConfig['edit']>;

export interface PhotoSceneSpec {
  images: string[]; // file:// adresleri
  look?: ChannelConfig['look'];
  seed: number;
  first: boolean;
  last: boolean;
  total: number;
  videoTitle: string;
  duration: number;
  visual: { type: 'photos'; number: number; heading: string };
  brand: ChannelConfig['brand'];
  edit?: EditConfig;
  cadence?: number;
  /** sahne içi saniye */
  punchAt?: number | null;
  subscribeAt?: number | null;
  /** sahne zamanına göre ASS altyazı dosyası */
  assFile?: string;
  /** çıktı boyutu (varsayılan 1920×1080; Shorts 1080×1920) */
  outW?: number;
  outH?: number;
}

/** Görselin film görünümüyle pişirilmiş 4K kopyası (önbellekli). */
export async function bakeImage(src: string, look: ChannelConfig['look'], dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const filters = [`scale=${W0}:${H0}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${W0}:${H0}`];
  if (look?.grade?.trim()) filters.push(look.grade.trim());
  if (look && look.vignette > 0) filters.push(`vignette=angle=${((Math.min(1, look.vignette) * Math.PI) / 3).toFixed(3)}`);
  if (look && look.grain > 0) filters.push(`noise=alls=${Math.round(Math.min(0.3, look.grain) * 100)}:allf=0`);
  const vf = filters.join(',');
  const out = join(dir, `${createHash('sha1').update(src + vf).digest('hex').slice(0, 16)}.jpg`);
  if (!existsSync(out)) await ffmpeg(['-i', src, '-vf', vf, '-q:v', '3', out]);
  return out;
}

/** Tekrarlanabilir rastgele sayılar (aynı sahne her seferinde aynı çekimleri üretsin). */
function rng(seed: number) {
  let x = (seed * 2654435761) % 4294967296 || 1;
  return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

export interface Framing {
  z0: number;
  z1: number;
  cx: number;
  cy: number;
}

export interface Shot {
  image: number;
  frames: number;
  framing: Framing;
  punch?: boolean;
}

/** n parçayı tam sayılara böler (toplam korunur). */
export function splitEven(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

/**
 * Sahnenin çekim planı: ~`cadence` saniyede bir yeni kadraj. Her görsel önce geniş, sonra orta/yakın kadrajlarla
 * kullanılır. `punchAt` (sahne içi saniye) varsa o anda aynı kadraj `punchZoom` kat yakınlaşır.
 */
export function planShots(opts: {
  frames: number;
  fps: number;
  images: number;
  cadence: number;
  seed: number;
  punchAt?: number | null;
  punchZoom?: number;
}): Shot[] {
  const { frames, fps, images } = opts;
  const r = rng(opts.seed);
  const count = Math.max(images, Math.min(Math.round(frames / (opts.cadence * fps)), Math.floor(frames / (1.2 * fps)) || 1));
  const perImage = splitEven(count, images);
  const lengths = splitEven(frames, count);
  const shots: Shot[] = [];
  let k = 0;
  perImage.forEach((m, img) => {
    const dx = 0.06 + r() * 0.06;
    const side = r() < 0.5 ? -1 : 1;
    const cycle: Framing[] = [
      { z0: 1.03, z1: 1.09, cx: 0.5, cy: 0.5 }, // geniş, yavaş itme
      { z0: 1.34, z1: 1.4, cx: 0.5 + side * dx, cy: 0.46 }, // yakın
      { z0: 1.2, z1: 1.14, cx: 0.5 - side * dx * 0.7, cy: 0.5 }, // orta, hafif geri çekilme
      { z0: 1.42, z1: 1.48, cx: 0.5 - side * dx, cy: 0.44 }, // yakın (diğer taraf)
    ];
    for (let j = 0; j < m; j++) shots.push({ image: img, frames: lengths[k++], framing: { ...cycle[j % cycle.length] } });
  });

  if (opts.punchAt != null && opts.punchAt > 0) {
    const pz = opts.punchZoom ?? 1.18;
    const P = Math.round(opts.punchAt * fps);
    const minF = Math.round(1.0 * fps);
    let start = 0;
    for (let i = 0; i < shots.length; i++) {
      const sh = shots[i];
      const end = start + sh.frames;
      if (P >= start && P < end) {
        const scale = (f: Framing): Framing => ({ ...f, z0: Math.min(1.75, f.z0 * pz), z1: Math.min(1.75, f.z1 * pz) });
        if (P - start >= minF && end - P >= minF) {
          // aynı kadrajı ikiye böl: ikinci yarı ani yakınlaşma
          const a = P - start;
          const zMid = sh.framing.z0 + ((sh.framing.z1 - sh.framing.z0) * a) / sh.frames;
          const before: Shot = { ...sh, frames: a, framing: { ...sh.framing, z1: zMid } };
          const after: Shot = { ...sh, frames: end - P, framing: scale({ ...sh.framing, z0: zMid }), punch: true };
          shots.splice(i, 1, before, after);
        } else if (end - P < minF && shots[i + 1]) {
          shots[i + 1] = { ...shots[i + 1], framing: scale(shots[i + 1].framing), punch: true };
        } else {
          shots[i] = { ...sh, framing: scale(sh.framing), punch: true };
        }
        break;
      }
      start = end;
    }
  }
  return shots;
}

export type OverlayKind = 'badge' | 'chip' | 'title' | 'sub1' | 'sub2' | 'end';

export interface OverlayTiming {
  kind: OverlayKind;
  in: number;
  out: number; // saniye; >= duration ise sona kadar görünür
}

export function overlayTimings(
  spec: Pick<PhotoSceneSpec, 'visual' | 'first' | 'last' | 'videoTitle' | 'duration' | 'subscribeAt'> & { endScreen?: number },
): OverlayTiming[] {
  const D = spec.duration;
  const o: OverlayTiming[] = [];
  if (spec.visual.number > 0) {
    const out = Math.min(4.5, Math.max(2.5, D * 0.4));
    o.push({ kind: 'badge', in: 0.15, out });
    o.push({ kind: 'chip', in: out, out: D + 1 });
  }
  if (spec.first && spec.videoTitle) o.push({ kind: 'title', in: Math.max(1, D - 4), out: D + 1 });
  if (spec.subscribeAt != null && spec.subscribeAt >= 0) {
    const t = Math.min(spec.subscribeAt, Math.max(0, D - 3.8));
    o.push({ kind: 'sub1', in: t, out: t + 1.4 });
    o.push({ kind: 'sub2', in: t + 1.4, out: t + 3.6 });
  }
  if (spec.last && spec.endScreen) o.push({ kind: 'end', in: Math.max(0, D - spec.endScreen), out: D + 1 });
  return o.filter((x) => x.out > x.in);
}

async function renderOverlays(browser: Browser, spec: PhotoSceneSpec, timings: OverlayTiming[], dir: string): Promise<string[]> {
  if (!timings.length) return [];
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: spec.outW ?? 1920, height: spec.outH ?? 1080 }, deviceScaleFactor: 1 });
  const stage = pathToFileURL(join(fileURLToPath(new URL('../render/', import.meta.url)), 'stage.html')).href;
  try {
    const files: string[] = [];
    for (const t of timings) {
      await page.goto(stage);
      await page.evaluate(([k, s]) => (window as unknown as { mountOverlay: (k: string, s: unknown) => Promise<boolean> }).mountOverlay(k as string, s), [t.kind, spec] as const);
      const f = join(dir, `${t.kind}.png`);
      await page.screenshot({ path: f, type: 'png', omitBackground: true });
      files.push(f);
    }
    return files;
  } finally {
    await page.close();
  }
}

const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

export async function renderPhotoScene(
  browser: Browser,
  spec: PhotoSceneSpec,
  frames: number,
  fps: number,
  out: string,
  workDir: string,
): Promise<void> {
  const D = frames / fps;
  const OW = spec.outW ?? 1920;
  const OH = spec.outH ?? 1080;
  const sources = spec.images.map((u) => fileURLToPath(u));
  if (!sources.length) throw new Error('Görsel sahnesinde görsel yok');
  const baked: string[] = [];
  for (const s of sources) baked.push(await bakeImage(s, spec.look, join(workDir, 'baked')));

  const shots = planShots({
    frames,
    fps,
    images: baked.length,
    cadence: spec.cadence ?? spec.edit?.shot_seconds ?? 5,
    seed: spec.seed,
    punchAt: spec.punchAt,
    punchZoom: spec.edit?.punch_zoom,
  });

  const args: string[] = [];
  const filters: string[] = [];
  // Kırpma: çıktı en-boy oranında, kaynak içinde kalan en büyük alan / yakınlaşma
  const baseH = Math.min(H0, (W0 * OH) / OW);
  shots.forEach((sh, k) => {
    args.push('-i', baked[sh.image]);
    const F = Math.max(2, sh.frames);
    const { z0, z1, cx, cy } = sh.framing;
    const z = `(${z0.toFixed(4)}+${(z1 - z0).toFixed(4)}*n/${F - 1})`;
    const h = `${baseH.toFixed(1)}/${z}`;
    const w = `${baseH.toFixed(1)}*${(OW / OH).toFixed(5)}/${z}`;
    filters.push(
      `[${k}:v]loop=loop=-1:size=1:start=0,setpts=N/${fps}/TB,` +
        `crop=w='${w}':h='${h}':x='clip(${cx.toFixed(4)}*iw-ow/2,0,iw-ow)':y='clip(${cy.toFixed(4)}*ih-oh/2,0,ih-oh)',` +
        `scale=${OW}:${OH}:flags=bicubic,setsar=1,format=yuv420p,trim=end_frame=${sh.frames},setpts=PTS-STARTPTS[s${k}]`,
    );
  });
  filters.push(`${shots.map((_, k) => `[s${k}]`).join('')}concat=n=${shots.length}:v=1:a=0[base]`);
  let last = 'base';

  // Yazı katmanları
  const timings = overlayTimings({ ...spec, duration: D, endScreen: spec.edit?.end_screen_seconds });
  const pngs = await renderOverlays(browser, spec, timings, join(workDir, 'overlays', `${spec.seed}-${OW}x${OH}`));
  pngs.forEach((png, k) => {
    const idx = shots.length + k;
    args.push('-i', png);
    const t = timings[k];
    const fades = [`fade=t=in:st=${t.in.toFixed(3)}:d=0.25:alpha=1`];
    if (t.out < D) fades.push(`fade=t=out:st=${Math.max(t.in, t.out - 0.25).toFixed(3)}:d=0.25:alpha=1`);
    filters.push(`[${idx}:v]loop=loop=-1:size=1:start=0,setpts=N/${fps}/TB,format=rgba,${fades.join(',')}[o${k}]`);
    filters.push(`[${last}][o${k}]overlay=0:0:shortest=1:format=auto[b${k}]`);
    last = `b${k}`;
  });

  // Altyazılar ve yalnızca videonun başında/sonunda siyahtan geçiş (maddeler arası düz kesme)
  const tail: string[] = [];
  if (spec.assFile) tail.push(`subtitles=filename='${esc(spec.assFile)}'`);
  if (spec.first) tail.push('fade=t=in:st=0:d=0.5');
  if (spec.last) tail.push(`fade=t=out:st=${Math.max(0, D - 1).toFixed(3)}:d=1`);
  filters.push(`[${last}]${tail.length ? tail.join(',') + ',' : ''}format=yuv420p[out]`);

  await ffmpeg([
    ...args,
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-frames:v', String(frames),
    '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    out,
  ]);
}
