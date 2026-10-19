// Derinlik (parallax) efekti: seçili görsellerden "3D fotoğraf" hissi veren kısa klipler (scripts/parallax.py).
// Ücretsizdir (derinlik haritası bilgisayarda, açık kaynak bir modelle çıkarılır) ve yeni nesne türetmediği için
// kalabalık sahnelerde de güvenlidir. Görsellerin bir kısmı bu efektle, kalanı klasik kayma/yakınlaşmayla gösterilir.
// Python paketleri ya da model yoksa uyarı verilir ve video yalnızca klasik hareketlerle üretilir.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChannelConfig } from '../lib/config.ts';
import type { Script } from '../lib/script.ts';

export type ParallaxConfig = NonNullable<ChannelConfig['parallax']>;
export type ParallaxMode = 'push' | 'pull' | 'left' | 'right';

export interface ParallaxTarget {
  sceneId: string;
  index: number;
  image: string;
  mode: ParallaxMode;
}

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'parallax.py');
const MODES: ParallaxMode[] = ['push', 'left', 'pull', 'right'];
const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

/**
 * Karışık seçim: her görsel sahnesinde görseller sırayla derinlik efektli / klasik olur; başlangıç sahneden sahneye
 * kayar (every = 2 → görsellerin yarısı). Hareket türü sırayla değişir (yaklaşma, sola kayma, uzaklaşma, sağa kayma).
 */
export function pickParallaxTargets(script: Script, images: Record<string, string[]>, cfg: ParallaxConfig): ParallaxTarget[] {
  const every = Math.max(1, Math.round(cfg.every));
  const out: ParallaxTarget[] = [];
  script.scenes.forEach((sc, i) => {
    if (sc.visual.type !== 'photos') return;
    (images[sc.id] ?? []).forEach((image, k) => {
      if ((i + k) % every === 0) out.push({ sceneId: sc.id, index: k, image, mode: MODES[out.length % MODES.length] });
    });
  });
  return out;
}

/** Derinlik modeli (önbellekte yoksa indirilir). */
export async function ensureDepthModel(cfg: ParallaxConfig, log: (m: string) => void = () => {}): Promise<string> {
  const file = process.env.PARALLAX_MODEL || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'yt-kanal', 'depth-anything-v2-small.onnx');
  if (existsSync(file)) return file;
  mkdirSync(dirname(file), { recursive: true });
  log('   derinlik modeli indiriliyor (~100 MB, bir kez)');
  const res = await fetch(cfg.model_url);
  if (!res.ok) throw new Error(`model indirilemedi (${res.status})`);
  const tmp = `${file}.part`;
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  renameSync(tmp, file);
  return file;
}

const run = (cmd: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `çıkış kodu ${c}`))));
  });

export const parallaxPython = () => process.env.PARALLAX_PYTHON || 'python3';

/** Gerekli Python paketleri kurulu mu? */
export async function parallaxAvailable(python = parallaxPython()): Promise<boolean> {
  try {
    await run(python, ['-c', 'import numpy, cv2, onnxruntime']);
    return true;
  } catch {
    return false;
  }
}

/** Klipleri üretir (önbellekli, paralel). Başarısız olan görsel klasik hareketle kalır. */
export async function generateParallaxClips(
  targets: ParallaxTarget[],
  cfg: ParallaxConfig,
  opts: { model: string; dir: string; fps: number; python?: string; log?: (m: string) => void },
): Promise<{ files: Record<string, Record<string, string>>; seconds: Record<string, Record<string, number>>; generated: number }> {
  const log = opts.log ?? (() => {});
  const python = opts.python ?? parallaxPython();
  mkdirSync(opts.dir, { recursive: true });
  const code = readFileSync(SCRIPT, 'utf8');
  const files: Record<string, Record<string, string>> = {};
  const seconds: Record<string, Record<string, number>> = {};
  let generated = 0;
  let failed = 0;
  const queue = [...targets];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const key = sha([t.image, t.mode, cfg.seconds, cfg.strength, opts.fps, code].join('|'));
      const out = join(opts.dir, `${t.sceneId}-${t.index}-${key}.mp4`);
      try {
        if (!existsSync(out)) {
          const tmp = `${out}.tmp.mp4`;
          await run(python, [SCRIPT, opts.model, t.image, tmp, '--mode', t.mode, '--seconds', String(cfg.seconds), '--fps', String(opts.fps), '--strength', String(cfg.strength)]);
          renameSync(tmp, out);
          generated++;
        }
        (files[t.sceneId] ??= {})[String(t.index)] = out;
        (seconds[t.sceneId] ??= {})[String(t.index)] = cfg.seconds;
      } catch (e) {
        failed++;
        if (failed <= 3) log(`   ⚠️ ${t.sceneId} derinlik efekti üretilemedi (klasik hareket kalacak): ${(e as Error).message.slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, targets.length)) }, worker));
  return { files, seconds, generated };
}
