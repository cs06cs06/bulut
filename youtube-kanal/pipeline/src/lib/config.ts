// config/*.yaml dosyalarını ve prompts/*.md istemlerini okur.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
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
  niche: string;
  audience: string;
  seeds: string[];
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
    provider: 'elevenlabs' | 'openai' | 'silent';
    elevenlabs: { voice_id: string; model_id: string; stability: number; similarity_boost: number };
    openai: { model: string; voice: string; instructions: string };
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
