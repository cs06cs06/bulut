// Hareketli sahneler: seçili yapay zekâ görselleri Google Veo ile kısa kliplere çevrilir (görselden videoya).
// Klip, görselin kendisinden başladığı için renk ve tarz videonun geri kalanıyla aynı kalır. Veo sakin ve genel
// hareketlerde (yürüme, rüzgâr, ışık, gülümseme) güvenilir; klibin sonuna doğru hata yapabildiği için videoda
// yalnızca ilk birkaç saniye kullanılır (config: motion.use_seconds).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChannelConfig } from '../lib/config.ts';
import type { Script } from '../lib/script.ts';

export type MotionConfig = NonNullable<ChannelConfig['motion']>;

export interface MotionTarget {
  sceneId: string;
  index: number; // sahnedeki görsel sırası
  image: string; // yerel dosya
  prompt: string;
}

export interface MotionProvider {
  name: string;
  generate(target: MotionTarget, out: string): Promise<void>;
}

/** Klip seçimi: kancanın ilk N görseli + en güçlü maddelerin (#top_items … #1) ilk görseli. */
export function pickMotionTargets(script: Script, images: Record<string, string[]>, cfg: MotionConfig): MotionTarget[] {
  const out: MotionTarget[] = [];
  const add = (sceneId: string, index: number, desc: string) => {
    const image = images[sceneId]?.[index];
    if (!image) return;
    out.push({ sceneId, index, image, prompt: motionPrompt(cfg, desc) });
  };
  script.scenes.forEach((sc, i) => {
    const v = sc.visual;
    if (v.type !== 'photos') return;
    if (i === 0 && v.number === 0) {
      for (let k = 0; k < cfg.hook_clips; k++) add(sc.id, k, v.prompts[k] ?? '');
    } else if (v.number >= 1 && v.number <= cfg.top_items) {
      add(sc.id, 0, v.prompts[0] ?? '');
    }
  });
  return out;
}

/** Ortak hareket talimatı + görselin kısa tarifi (Veo görseli zaten görüyor; tarif yalnızca bağlam verir). */
export function motionPrompt(cfg: MotionConfig, desc: string): string {
  const d = desc.replace(/\s+/g, ' ').trim();
  const short = d.length > 320 ? d.slice(0, d.lastIndexOf(' ', 320)) + '…' : d;
  return `${cfg.prompt.trim()}${short ? ` Scene: ${short}` : ''}`;
}

const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

export function clipPath(dir: string, t: MotionTarget, provider: string): string {
  return join(dir, `${t.sceneId}-${t.index}-${sha(t.image + t.prompt + provider)}.mp4`);
}

/** Kliplerin üretimi (önbellekli, paralel). Başarısız klip atlanır; o görsel sabit fotoğraf olarak kalır. */
export async function generateMotionClips(
  targets: MotionTarget[],
  provider: MotionProvider,
  cfg: MotionConfig,
  dir: string,
  log: (m: string) => void = () => {},
): Promise<{ files: Record<string, Record<string, string>>; generated: number }> {
  mkdirSync(dir, { recursive: true });
  const files: Record<string, Record<string, string>> = {};
  let generated = 0;
  let done = 0;
  const queue = [...targets];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const out = clipPath(dir, t, provider.name);
      try {
        if (!existsSync(out)) {
          await provider.generate(t, out);
          generated++;
        }
        (files[t.sceneId] ??= {})[String(t.index)] = out;
      } catch (e) {
        log(`   ⚠️ ${t.sceneId} için klip üretilemedi (sabit görsel kalacak): ${(e as Error).message.split('\n')[0].slice(0, 160)}`);
      }
      log(`   ${++done}/${targets.length} klip`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, targets.length)) }, worker));
  return { files, generated };
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function veoProvider(cfg: MotionConfig, apiKey: string): MotionProvider {
  const headers = { 'x-goog-api-key': apiKey, 'content-type': 'application/json' };
  const call = async (url: string, body?: unknown) => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
      if (res.ok) return (await res.json()) as any;
      const text = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, attempt * 15_000));
        continue;
      }
      throw new Error(`Veo ${res.status}: ${text.slice(0, 300)}`);
    }
  };
  return {
    name: `google:${cfg.model}:${cfg.resolution}`,
    async generate(t, out) {
      const mimeType = /\.png$/i.test(t.image) ? 'image/png' : 'image/jpeg';
      const op = await call(`${BASE}/models/${cfg.model}:predictLongRunning`, {
        instances: [{ prompt: t.prompt, image: { bytesBase64Encoded: readFileSync(t.image).toString('base64'), mimeType } }],
        parameters: {
          aspectRatio: '16:9',
          durationSeconds: cfg.duration_seconds,
          resolution: cfg.resolution,
          personGeneration: 'allow_adult',
        },
      });
      const started = Date.now();
      let st = op;
      while (!st.done) {
        if (Date.now() - started > 12 * 60_000) throw new Error('Veo zaman aşımı (12 dk)');
        await new Promise((r) => setTimeout(r, 10_000));
        st = await call(`${BASE}/${op.name}`);
      }
      if (st.error) throw new Error(`Veo: ${JSON.stringify(st.error).slice(0, 300)}`);
      const resp = st.response?.generateVideoResponse;
      const uri = resp?.generatedSamples?.[0]?.video?.uri;
      if (!uri) throw new Error(`Veo video döndürmedi${resp?.raiMediaFilteredReasons ? `: ${resp.raiMediaFilteredReasons}` : ''}`);
      const dl = await fetch(uri, { headers: { 'x-goog-api-key': apiKey } });
      if (!dl.ok) throw new Error(`Veo indirme ${dl.status}`);
      writeFileSync(out, Buffer.from(await dl.arrayBuffer()));
    },
  };
}

/** Kanal ayarından sağlayıcı; anahtar yoksa undefined (videolar sabit görsellerle üretilir). */
export function motionFromConfig(channel: ChannelConfig): MotionProvider | undefined {
  const cfg = channel.motion;
  if (!cfg || cfg.provider !== 'google' || !process.env.GEMINI_API_KEY) return undefined;
  return veoProvider(cfg, process.env.GEMINI_API_KEY);
}
