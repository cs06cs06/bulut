// Görsel sahneleri (listicle): ffmpeg ile yavaş yakınlaştırma/kaydırma (Ken Burns), görseller arası çapraz
// geçiş ve tarayıcıda bir kez çizilen saydam yazı katmanları. Kare kare tarayıcı ekran görüntüsünden ~10 kat hızlı.
// Film görünümü (renk tonu, kenar kararması, gren) her görsele bir kez "pişirilir".

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Browser } from 'playwright';
import type { ChannelConfig } from '../lib/config.ts';
import { ffmpeg } from './ffmpeg.ts';

const W = 3840; // pişirilmiş görsel boyutu (çıktının 2 katı: yumuşak kaydırma için)
const H = 2160;

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
}

/** Görselin film görünümüyle pişirilmiş 4K kopyası (önbellekli). */
export async function bakeImage(src: string, look: ChannelConfig['look'], dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const filters = [`scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${W}:${H}`];
  if (look?.grade?.trim()) filters.push(look.grade.trim());
  if (look && look.vignette > 0) filters.push(`vignette=angle=${((Math.min(1, look.vignette) * Math.PI) / 3).toFixed(3)}`);
  if (look && look.grain > 0) filters.push(`noise=alls=${Math.round(Math.min(0.3, look.grain) * 100)}:allf=0`);
  const vf = filters.join(',');
  const out = join(dir, `${createHash('sha1').update(src + vf).digest('hex').slice(0, 16)}.jpg`);
  if (!existsSync(out)) await ffmpeg(['-i', src, '-vf', vf, '-q:v', '3', out]);
  return out;
}

/** Tekrarlanabilir rastgele sayılar (aynı sahne her seferinde aynı hareketi yapsın). */
function rng(seed: number) {
  let x = (seed * 2654435761) % 4294967296 || 1;
  return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

/** n görselin kare sayıları: toplamları, geçiş örtüşmeleri düşüldüğünde sahne kare sayısına eşit olur. */
export function clipFrames(frames: number, n: number, fadeFrames: number): number[] {
  const total = frames + (n - 1) * fadeFrames;
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

export interface OverlayTiming {
  kind: 'lt' | 'chip' | 'title' | 'sub';
  in: number;
  out: number; // saniye; >= duration ise sona kadar görünür
}

export function overlayTimings(spec: Pick<PhotoSceneSpec, 'visual' | 'first' | 'last' | 'videoTitle' | 'duration'>): OverlayTiming[] {
  const D = spec.duration;
  const o: OverlayTiming[] = [];
  if (spec.visual.number > 0) {
    const ltOut = Math.min(7, Math.max(3.5, D * 0.35));
    o.push({ kind: 'lt', in: 0.35, out: ltOut });
    o.push({ kind: 'chip', in: ltOut, out: D + 1 });
  }
  if (spec.first && spec.videoTitle) o.push({ kind: 'title', in: 0.2, out: Math.min(6, D * 0.5) });
  if (spec.last) o.push({ kind: 'sub', in: Math.max(0.5, D - 7), out: D - 1.2 });
  return o.filter((x) => x.out > x.in);
}

async function renderOverlays(browser: Browser, spec: PhotoSceneSpec, timings: OverlayTiming[], dir: string): Promise<string[]> {
  if (!timings.length) return [];
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
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

export async function renderPhotoScene(
  browser: Browser,
  spec: PhotoSceneSpec,
  frames: number,
  fps: number,
  out: string,
  workDir: string,
): Promise<void> {
  const D = frames / fps;
  const sources = spec.images.map((u) => fileURLToPath(u));
  if (!sources.length) throw new Error('Görsel sahnesinde görsel yok');
  const baked = [];
  for (const s of sources) baked.push(await bakeImage(s, spec.look, join(workDir, 'baked')));

  const n = baked.length;
  const fadeS = Math.min(1.0, (D / n) * 0.3);
  const fadeF = n > 1 ? Math.max(1, Math.round(fadeS * fps)) : 0;
  const clips = clipFrames(frames, n, fadeF);
  const r = rng(spec.seed);

  const args: string[] = [];
  const filters: string[] = [];
  baked.forEach((b, i) => {
    args.push('-i', b);
    const zoomIn = (i + spec.seed) % 2 === 0;
    const s0 = zoomIn ? 1.04 : 1.16;
    const s1 = zoomIn ? 1.16 : 1.04;
    const dx = (r() - 0.5) * 0.06;
    const dy = (r() - 0.5) * 0.04;
    const F = Math.max(2, clips[i]);
    const z = `(${s0}+${(s1 - s0).toFixed(4)}*n/${F - 1})`;
    filters.push(
      `[${i}:v]loop=loop=-1:size=1:start=0,setpts=N/${fps}/TB,` +
        `crop=w='${W}/${z}':h='${H}/${z}':` +
        `x='clip((iw-ow)/2+${dx.toFixed(4)}*iw*(n/${F - 1}-0.5),0,iw-ow)':` +
        `y='clip((ih-oh)/2+${dy.toFixed(4)}*ih*(n/${F - 1}-0.5),0,ih-oh)',` +
        `scale=1920:1080:flags=bicubic,setsar=1,format=yuv420p,trim=end_frame=${clips[i]},setpts=PTS-STARTPTS[v${i}]`,
    );
  });

  // Çapraz geçişler
  let last = 'v0';
  let acc = clips[0];
  for (let i = 1; i < n; i++) {
    const offset = (acc - fadeF) / fps;
    filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${(fadeF / fps).toFixed(4)}:offset=${offset.toFixed(4)}[x${i}]`);
    last = `x${i}`;
    acc += clips[i] - fadeF;
  }

  // Yazı katmanları
  const timings = overlayTimings({ ...spec, duration: D });
  const pngs = await renderOverlays(browser, spec, timings, join(workDir, 'overlays', String(spec.seed)));
  pngs.forEach((png, k) => {
    const idx = n + k;
    args.push('-i', png);
    const t = timings[k];
    const fades = [`fade=t=in:st=${t.in.toFixed(3)}:d=0.5:alpha=1`];
    if (t.out < D) fades.push(`fade=t=out:st=${t.out.toFixed(3)}:d=0.5:alpha=1`);
    filters.push(`[${idx}:v]loop=loop=-1:size=1:start=0,setpts=N/${fps}/TB,format=rgba,${fades.join(',')}[o${k}]`);
    filters.push(`[${last}][o${k}]overlay=0:0:shortest=1:format=auto[b${k}]`);
    last = `b${k}`;
  });

  // Sahne girişi/çıkışı (siyaha geçiş)
  const env: string[] = [];
  if (!spec.first) env.push(`fade=t=in:st=0:d=0.5`);
  const outD = spec.last ? 1.2 : 0.35;
  env.push(`fade=t=out:st=${Math.max(0, D - outD).toFixed(3)}:d=${outD}`);
  filters.push(`[${last}]${env.join(',')},format=yuv420p[out]`);

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
