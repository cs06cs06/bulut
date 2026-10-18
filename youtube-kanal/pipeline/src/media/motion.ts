// Hareketli sahneler: seçili yapay zekâ görselleri Google Veo ile kısa kliplere çevrilir (görselden videoya).
// Klip, görselin kendisinden başladığı için renk ve tarz videonun geri kalanıyla aynı kalır. Veo sakin ve genel
// hareketlerde (yürüme, rüzgâr, ışık, gülümseme) güvenilir; klibin sonuna doğru hata yapabildiği için videoda
// yalnızca ilk birkaç saniye kullanılır (config: motion.use_seconds). Ayrıca her klip, Gemini'nin görsel modeline
// saniyede bir kare olarak (iki kez, bağımsız) gösterilir; bozulma (yüz/beden bozulması, beliren ya da kaybolan
// kişi/nesne) başladıysa klibin yalnızca öncesi kullanılır, temiz kısım çok kısaysa klip atılır.
// Veo kalabalık sahnelerde (çok kişi, iç içe bedenler) güvenilmez; bu yüzden klip üretmeden önce her aday görsel
// Gemini'ye puanlatılır (1–5) ve her maddenin en güvenli görseli seçilir, kalabalık görseller hiç gönderilmez.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

export interface ClipCheck {
  goodUntil: number; // bu saniyeye kadar bütün kareler temiz
  issue: string;
}

export interface MotionProvider {
  name: string;
  generate(target: MotionTarget, out: string): Promise<void>;
  /** klip kalite kontrolü (isteğe bağlı) */
  check?(file: string): Promise<ClipCheck>;
  /** ön eleme: görselin hareketlendirme güvenliği 1 (riskli) – 5 (güvenli) (isteğe bağlı) */
  screen?(image: string): Promise<number>;
}

/** Kontrol sonucuna göre klipten kullanılacak saniye; 0 = klip kullanılmaz. */
export function usableSeconds(cfg: MotionConfig, check: ClipCheck | null): number {
  const s = Math.min(cfg.use_seconds, check ? check.goodUntil : cfg.use_seconds);
  return s >= (cfg.min_seconds ?? 2) ? s : 0;
}

/** Aday görseller: kancanın görselleri (sırayla) ve maddelerin görselleri (#1, #2, … sırasıyla). */
export function motionCandidates(
  script: Script,
  images: Record<string, string[]>,
  cfg: MotionConfig,
): { hook: MotionTarget[]; items: MotionTarget[][] } {
  const target = (sceneId: string, index: number, desc: string): MotionTarget | null => {
    const image = images[sceneId]?.[index];
    return image ? { sceneId, index, image, prompt: motionPrompt(cfg, desc) } : null;
  };
  let hook: MotionTarget[] = [];
  const items: { n: number; list: MotionTarget[] }[] = [];
  script.scenes.forEach((sc, i) => {
    const v = sc.visual;
    if (v.type !== 'photos') return;
    const all = (images[sc.id] ?? []).map((_, k) => target(sc.id, k, v.prompts[k] ?? '')).filter((t): t is MotionTarget => !!t);
    if (i === 0 && v.number === 0) hook = all;
    else if (v.number >= 1) items.push({ n: v.number, list: all });
  });
  return { hook, items: items.sort((a, b) => a.n - b.n).map((x) => x.list) };
}

/** Ön elemesiz seçim: kancanın ilk N görseli + #1'den başlayarak maddelerin ilk görseli (en çok max_clips). */
export function pickMotionTargets(script: Script, images: Record<string, string[]>, cfg: MotionConfig): MotionTarget[] {
  const { hook, items } = motionCandidates(script, images, cfg);
  const out = hook.slice(0, cfg.hook_clips);
  for (const list of items) {
    if (out.length >= cfg.max_clips) break;
    if (list[0]) out.push(list[0]);
  }
  return out.slice(0, cfg.max_clips);
}

/**
 * Ön elemeli seçim: her aday görsel puanlanır (önbellekli). Kancadan güvenli ilk N görsel; sonra #1, #2, … için
 * maddenin en güvenli görseli (puan ≥ screen_min_safety) — toplam en çok max_clips. Puanlama yoksa pickMotionTargets.
 */
export async function selectMotionTargets(
  script: Script,
  images: Record<string, string[]>,
  cfg: MotionConfig,
  provider: MotionProvider,
  cacheFile: string,
  log: (m: string) => void = () => {},
): Promise<MotionTarget[]> {
  if (!provider.screen) return pickMotionTargets(script, images, cfg);
  const { hook, items } = motionCandidates(script, images, cfg);
  const cache: Record<string, number> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const all = [...hook, ...items.flat()];
  const queue = all.filter((t) => cache[t.image] === undefined);
  await Promise.all(
    Array.from({ length: Math.min(8, queue.length) }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          cache[t.image] = await provider.screen!(t.image);
        } catch (e) {
          log(`   ⚠️ ${t.sceneId} görseli puanlanamadı: ${(e as Error).message.slice(0, 120)}`);
          cache[t.image] = 0;
        }
      }
    }),
  );
  mkdirSync(join(cacheFile, '..'), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  const min = cfg.screen_min_safety ?? 4;
  const ok = (t: MotionTarget) => (cache[t.image] ?? 0) >= min;
  const out = hook.filter(ok).slice(0, cfg.hook_clips);
  for (const list of items) {
    if (out.length >= cfg.max_clips) break;
    const best = list.filter(ok).sort((a, b) => cache[b.image] - cache[a.image] || a.index - b.index)[0];
    if (best) out.push(best);
  }
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
): Promise<{ files: Record<string, Record<string, string>>; seconds: Record<string, Record<string, number>>; generated: number; dropped: number }> {
  mkdirSync(dir, { recursive: true });
  const files: Record<string, Record<string, string>> = {};
  const seconds: Record<string, Record<string, number>> = {};
  let generated = 0;
  let dropped = 0;
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
        let check: ClipCheck | null = null;
        if (provider.check) {
          const cache = `${out}.check.json`;
          try {
            check = existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')) : await provider.check(out);
            writeFileSync(cache, JSON.stringify(check));
          } catch (e) {
            log(`   ⚠️ ${t.sceneId} klibi denetlenemedi, ilk ${cfg.min_seconds ?? 2} sn kullanılacak: ${(e as Error).message.slice(0, 120)}`);
            check = { goodUntil: cfg.min_seconds ?? 2, issue: 'denetlenemedi' };
          }
        }
        const s = usableSeconds(cfg, check);
        if (!s) {
          dropped++;
          log(`   ⚠️ ${t.sceneId} klibi atlandı (sabit görsel kalacak): ${check?.issue ?? ''}`.slice(0, 220));
        } else {
          (files[t.sceneId] ??= {})[String(t.index)] = out;
          (seconds[t.sceneId] ??= {})[String(t.index)] = s;
        }
      } catch (e) {
        log(`   ⚠️ ${t.sceneId} için klip üretilemedi (sabit görsel kalacak): ${(e as Error).message.split('\n')[0].slice(0, 160)}`);
      }
      log(`   ${++done}/${targets.length} klip`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, targets.length)) }, worker));
  return { files, seconds, generated, dropped };
}

/** Klipten saniyede bir kare (t = 0, 1, 2 … sn; en çok 9), 640 px genişlik. */
async function sampleFrames(file: string): Promise<{ dir: string; frames: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'clipqa-'));
  await new Promise<void>((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'fps=1:round=down,scale=640:-1', '-frames:v', '9', join(dir, 'f%02d.jpg')]);
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg kare çıkarma hata verdi (${c})`))));
  });
  return { dir, frames: readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort().map((f) => join(dir, f)) };
}

const CHECK_PROMPT =
  'These are frames taken once per second (labelled t=0s, t=1s, …) from an AI-generated video clip that animates a still ' +
  'photograph; t=0s is the original photograph. Compare every frame with t=0s. Judge only visual coherence, not style. Find ' +
  'the first frame where something is clearly wrong: a person or face deforms or melts, limbs or bodies merge, a person or ' +
  'object appears, disappears, duplicates or changes clothing, an object morphs into another, or physically impossible ' +
  'motion. Minor motion blur is fine. Return good_until = the label (in seconds) of the LAST frame that is still completely ' +
  'clean (the last label if every frame is clean), and a short issue description ("none" if clean). Be strict: when in ' +
  'doubt, treat the frame as wrong.';

const SCREEN_PROMPT =
  'Rate how safely an image-to-video AI could animate this photo for a few seconds without errors (people duplicating, ' +
  'merging, appearing or vanishing, bodies deforming): 1 = risky (many people, crowds, overlapping bodies, hands busy with ' +
  'detailed tasks), 5 = safe (no people, or one or two clearly separated people, simple composition). Also count the people.';

async function geminiScreen(model: string, apiKey: string, image: string): Promise<number> {
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: SCREEN_PROMPT },
            { inline_data: { mime_type: /\.png$/i.test(image) ? 'image/png' : 'image/jpeg', data: readFileSync(image).toString('base64') } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { people: { type: 'INTEGER' }, safety: { type: 'INTEGER' } }, required: ['people', 'safety'] },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as any;
  const out = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}');
  const safety = Number(out.safety);
  if (!Number.isFinite(safety)) throw new Error('geçersiz puan');
  return Math.max(1, Math.min(5, Math.round(safety)));
}

async function geminiCheck(model: string, apiKey: string, file: string): Promise<ClipCheck> {
  const { dir, frames } = await sampleFrames(file);
  try {
    const parts: unknown[] = [{ text: CHECK_PROMPT }];
    frames.forEach((f, i) => parts.push({ text: `t=${i}s` }, { inline_data: { mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') } }));
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: { good_until: { type: 'INTEGER' }, issue: { type: 'STRING' } }, required: ['good_until', 'issue'] },
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as any;
    const out = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}');
    const goodUntil = Number(out.good_until);
    if (!Number.isFinite(goodUntil)) throw new Error('geçersiz denetim yanıtı');
    return { goodUntil: Math.max(0, Math.min(frames.length - 1, Math.round(goodUntil))), issue: String(out.issue ?? '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    screen: cfg.qa_model ? (image) => geminiScreen(cfg.qa_model!, apiKey, image) : undefined,
    // iki bağımsız denetim; daha temkinli olan (bozulmayı daha erken gören) kullanılır
    check: cfg.qa_model
      ? async (file) => {
          const [a, b] = await Promise.all([geminiCheck(cfg.qa_model!, apiKey, file), geminiCheck(cfg.qa_model!, apiKey, file)]);
          return a.goodUntil <= b.goodUntil ? a : b;
        }
      : undefined,
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
