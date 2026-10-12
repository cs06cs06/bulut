// Yapay zekâ görselleri (listicle kanalları). Her görsel tarifine kanalın ortak stili eklenir; aynı tarif
// ve ayarla daha önce üretilmiş görseller yeniden kullanılır.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChannelConfig } from '../lib/config.ts';
import type { Script } from '../lib/script.ts';
import { ffmpeg } from './ffmpeg.ts';

export type ImagesConfig = NonNullable<ChannelConfig['images']>;

export interface ImageProvider {
  name: string;
  /** Görseli üretip `out` (JPEG) dosyasına yazar. */
  generate(prompt: string, out: string): Promise<void>;
}

export class ImageRefusedError extends Error {}

/**
 * Yanıt içinde base64 görsel verisini arar. Gemini Interactions API (output_image.data, steps[].content[].data)
 * ve eski generateContent biçimini (candidates[].content.parts[].inlineData.data) birlikte destekler.
 */
export function findImageData(o: unknown): string | null {
  let found: string | null = null;
  const visit = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x);
      return;
    }
    const rec = v as Record<string, unknown>;
    const mime = (rec.mime_type ?? rec.mimeType) as string | undefined;
    const isImage = rec.type === 'image' || (typeof mime === 'string' && mime.startsWith('image/'));
    if (isImage && typeof rec.data === 'string' && rec.data.length > 100) found = rec.data; // sonuncusu kazanır
    for (const x of Object.values(rec)) visit(x);
  };
  visit(o);
  return found;
}

export function googleImages(cfg: ImagesConfig, apiKey: string): ImageProvider {
  return {
    name: `google:${cfg.model}`,
    async generate(prompt, out) {
      for (let attempt = 1; ; attempt++) {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            model: cfg.model,
            input: [{ type: 'text', text: prompt }],
            response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: cfg.aspect_ratio, image_size: cfg.size },
          }),
          signal: AbortSignal.timeout(180000),
        });
        const body = await res.text();
        if (res.ok) {
          const data = findImageData(JSON.parse(body));
          if (!data) throw new ImageRefusedError(`Görsel üretilmedi (güvenlik filtresi ya da boş yanıt): ${body.slice(0, 300)}`);
          writeFileSync(out, Buffer.from(data, 'base64'));
          return;
        }
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt >= 5) throw new Error(`Google görsel hatası (HTTP ${res.status}): ${body.slice(0, 500)}`);
        await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
      }
    },
  };
}

/** Anahtarsız deneme: tarifin kısa özetini taşıyan sıcak tonlu bir yer tutucu görsel. */
export function placeholderImages(): ImageProvider {
  const colors = ['0x6b4226', '0x8c5a2b', '0x4f5d2f', '0x7a3e2f', '0x5a4a3a', '0x946b2d'];
  return {
    name: 'placeholder',
    async generate(prompt, out) {
      const h = parseInt(createHash('sha1').update(prompt).digest('hex').slice(0, 6), 16);
      const c1 = colors[h % colors.length];
      const c2 = colors[(h >> 4) % colors.length];
      const text = prompt.replace(/[^\w\s,.-]/g, '').slice(0, 60).replace(/:/g, ' ');
      await ffmpeg([
        '-f', 'lavfi', '-i', `gradients=s=1376x768:c0=${c1}:c1=${c2}:x0=0:y0=0:x1=1376:y1=768:d=1`,
        '-frames:v', '1',
        '-vf', `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${text}':fontcolor=white@0.85:fontsize=30:x=(w-tw)/2:y=(h-th)/2`,
        out,
      ]);
    },
  };
}

export function imagesFromConfig(channel: ChannelConfig, env = process.env): ImageProvider {
  const cfg = channel.images;
  if (!cfg) throw new Error('config/channel.yaml: images ayarı yok');
  const provider = (env.IMAGE_PROVIDER as ImagesConfig['provider']) || cfg.provider;
  switch (provider) {
    case 'google':
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY tanımlı değil (GitHub → Settings → Secrets)');
      return googleImages(cfg, env.GEMINI_API_KEY);
    case 'placeholder':
      return placeholderImages();
    default:
      throw new Error(`Bilinmeyen görsel sağlayıcısı: ${provider}`);
  }
}

export function styledPrompt(prompt: string, style: string): string {
  return `${prompt.trim().replace(/\.?$/, '.')} ${style.trim()}`;
}

const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);

export interface GeneratedImages {
  /** sahne kimliği → görsel dosyaları (sırasıyla) */
  files: Record<string, string[]>;
  generated: number;
  failed: number;
}

/**
 * "photos" sahnelerinin bütün görsellerini üretir. Tek tek reddedilen görseller videoyu durdurmaz:
 * aynı sahnenin başka bir görseli (yoksa bir önceki sahnenin son görseli) yerine kullanılır.
 */
export async function generateSceneImages(
  script: Script,
  provider: ImageProvider,
  cfg: Pick<ImagesConfig, 'style' | 'concurrency'>,
  dir: string,
  log: (m: string) => void = () => {},
): Promise<GeneratedImages> {
  mkdirSync(dir, { recursive: true });
  type Job = { scene: string; index: number; prompt: string; file: string };
  const jobs: Job[] = [];
  for (const sc of script.scenes) {
    if (sc.visual.type !== 'photos') continue;
    sc.visual.prompts.forEach((p, i) => {
      const prompt = styledPrompt(p, cfg.style);
      jobs.push({ scene: sc.id, index: i, prompt, file: join(dir, `${sc.id}-${i + 1}-${sha(prompt + provider.name)}.jpg`) });
    });
  }
  const ok = new Set<string>();
  let generated = 0;
  let failed = 0;
  let firstError = '';
  const queue = jobs.filter((j) => {
    if (existsSync(j.file)) {
      ok.add(j.file);
      return false;
    }
    return true;
  });
  const total = queue.length;
  let done = 0;
  let lastPct = -1;
  await Promise.all(
    Array.from({ length: Math.max(1, cfg.concurrency) }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        try {
          await provider.generate(j.prompt, j.file);
          ok.add(j.file);
          generated++;
        } catch (e) {
          failed++;
          firstError ||= (e as Error).message;
          if (!(e instanceof ImageRefusedError)) {
            // Kimlik/kota gibi kalıcı hatalarda hepsini denemeye devam etmek boşuna; ilk üç hatadan sonra dur.
            if (failed >= 3 && generated === 0) {
              queue.length = 0;
            }
          }
        }
        done++;
        const pct = Math.floor((done / total) * 10) * 10;
        if (pct !== lastPct) log(`   %${pct} (${done}/${total} görsel)`);
        lastPct = pct;
      }
    }),
  );
  if (ok.size === 0) throw new Error(`Hiç görsel üretilemedi: ${firstError}`);
  if (failed) log(`   ⚠️ ${failed} görsel üretilemedi; yerine aynı sahnenin başka bir görseli kullanılacak (${firstError.slice(0, 160)})`);

  const files: Record<string, string[]> = {};
  let previous: string | undefined;
  for (const sc of script.scenes) {
    if (sc.visual.type !== 'photos') continue;
    const mine = jobs.filter((j) => j.scene === sc.id).map((j) => j.file);
    const good = mine.filter((f) => ok.has(f));
    const pool = good.length ? good : previous ? [previous] : [...ok].slice(0, 1);
    files[sc.id] = mine.map((f, i) => (ok.has(f) ? f : pool[i % pool.length]));
    previous = files[sc.id][files[sc.id].length - 1];
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(files, null, 2));
  return { files, generated, failed };
}

export function readImageIndex(dir: string): Record<string, string[]> | null {
  const p = join(dir, 'index.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
