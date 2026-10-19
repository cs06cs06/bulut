// config/*.yaml dosyalarını ve prompts/*.md istemlerini okur.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/** youtube-kanal/ klasörü */
export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Her kanal kendi klasöründe yaşar: kanallar/<ad>/{config,prompts,data,episodes}.
 * Hangi kanalın çalışacağını KANAL ortam değişkeni belirler (varsayılan: nostalji).
 */
export const DEFAULT_KANAL = 'nostalji';
export const KANAL = process.env.KANAL || DEFAULT_KANAL;
export const ROOT = join(PROJECT_ROOT, 'kanallar', KANAL);
if (!existsSync(join(ROOT, 'config', 'channel.yaml'))) {
  throw new Error(`Kanal bulunamadı: kanallar/${KANAL}/config/channel.yaml (KANAL ortam değişkenini kontrol edin)`);
}
const CONFIG_DIR = join(ROOT, 'config');

function load<T>(name: string): T {
  return parse(readFileSync(join(CONFIG_DIR, name), 'utf8')) as T;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type VideoFormat = 'tutorial' | 'comparison' | 'listicle';

export interface ChannelConfig {
  name: string;
  tagline: string;
  language: string;
  /** tutorial: araç eğitimi (ekran görüntüleri); listicle: numaralı liste (yapay zekâ görselleri) */
  format?: 'tutorial' | 'listicle';
  niche: string;
  audience: string;
  seeds: string[];
  suggest_patterns?: string[];
  listicle?: { items: number; images_per_item: number; intro_images: number; outro_images: number };
  images?: {
    provider: 'google' | 'placeholder';
    model: string;
    size: '1K' | '2K';
    aspect_ratio: string;
    price_per_image: number;
    concurrency: number;
    style: string;
  };
  /** Derinlik (parallax) efekti: görsellerin bir kısmı "3D fotoğraf" klibine çevrilir (ücretsiz, bilgisayarda). */
  parallax?: {
    every: number;
    seconds: number;
    strength: number;
    concurrency: number;
    model_url: string;
  };
  /** Hareketli sahneler (isteğe bağlı, ücretli): seçili görseller Google Veo ile kısa kliplere çevrilir. */
  motion?: {
    provider: 'google';
    model: string;
    resolution: '720p' | '1080p';
    duration_seconds: number;
    use_seconds: number;
    price_per_second: number;
    hook_clips: number;
    /** video başına en çok klip (kanca dahil); maddeler #1'den başlayarak seçilir */
    max_clips: number;
    /** ön eleme: görselin hareketlendirme güvenliği (1–5, Gemini) en az bu olmalı; kalabalık sahneler Veo'ya gönderilmez */
    screen_min_safety?: number;
    concurrency: number;
    prompt: string;
    /** klip kalite kontrolü (Gemini görsel modeli): bozulmanın başladığı saniyeden sonrası kullanılmaz */
    qa_model?: string;
    /** temiz kısmı bundan kısa klip atılır (sabit görsel kalır) */
    min_seconds?: number;
  };
  /** Film görünümü: video kodlanırken ffmpeg ile uygulanır (tarayıcıda her karede hesaplamaktan çok daha hızlı). */
  look?: { grade: string; grain: number; vignette: number };
  thumbnail?: { style: 'browser' | 'bar' };
  /** listicle kurgu ayarları */
  edit?: {
    jcut_seconds: number;
    gap_seconds: number;
    shot_seconds: number;
    punch_zoom: number;
    captions: boolean;
    end_screen_seconds: number;
    shorts: number;
  };
  video: {
    target_minutes: number;
    min_minutes: number;
    words_per_minute: number;
    fps: number;
    width: number;
    height: number;
    formats: VideoFormat[];
  };
  brand: { accent: string; accent2: string; background: string; text: string; font: string };
  voice: {
    provider: 'elevenlabs' | 'openai' | 'google' | 'silent';
    elevenlabs: { voice_id: string; model_id: string; stability: number; similarity_boost: number };
    openai: { model: string; voice: string; instructions: string };
    google?: { model: string; voice: string; style: string };
    lead_in_seconds: number;
    tail_seconds: number;
    music: string;
    music_volume: number;
  };
  schedule: { days: Weekday[] };
  topics: { auto_approve: boolean; ideas_per_run: number };
  youtube: {
    upload: boolean;
    privacy: 'private' | 'unlisted' | 'public';
    category_id: string;
    made_for_kids: boolean;
    contains_synthetic_media: boolean;
    default_tags: string[];
  };
  description: { affiliate_disclosure: string; ai_disclosure: string; footer: string };
}

export interface ModelPrice {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
}

export interface StageAi {
  model: string;
  effort: Effort;
  max_tokens: number;
  web_searches?: number;
  web_fetches?: number;
}

export interface AiConfig {
  ideas: StageAi;
  research: StageAi;
  script: StageAi;
  metadata: StageAi;
  budget: { monthly_usd: number };
  prices: Record<string, ModelPrice> & { web_search_per_1000?: number };
}

export interface AffiliateLink {
  name: string;
  aliases?: string[];
  url: string;
  affiliate?: boolean;
  note?: string;
}

export function loadChannel(): ChannelConfig {
  return load<ChannelConfig>('channel.yaml');
}

export function loadAiConfig(): AiConfig {
  return load<AiConfig>('ai.yaml');
}

export function loadAffiliates(): AffiliateLink[] {
  return load<AffiliateLink[] | null>('affiliates.yaml') ?? [];
}

/** prompts/<name>.md dosyasını okur; {{ANAHTAR}} yer tutucularını doldurur. */
export function loadPrompt(name: string, vars: Record<string, string | number> = {}): string {
  let text = readFileSync(join(ROOT, 'prompts', `${name}.md`), 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, String(v));
  return text;
}

/** İstemlere eklenen kanal özeti. */
export const channelFormat = (ch: ChannelConfig) => ch.format ?? 'tutorial';

export function channelBrief(ch: ChannelConfig): string {
  return [
    `Name: ${ch.name} — ${ch.tagline}`,
    `Niche: ${ch.niche.trim()}`,
    `Audience: ${ch.audience.trim()}`,
    `Formats: ${ch.video.formats.join(', ')}`,
  ].join('\n');
}

export function targetWords(ch: ChannelConfig): { target: number; min: number } {
  return {
    target: Math.round(ch.video.target_minutes * ch.video.words_per_minute),
    min: Math.round(ch.video.min_minutes * ch.video.words_per_minute),
  };
}
