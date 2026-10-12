// Metin aşamaları: araştırma notları, senaryo ve başlık/açıklama/kapak metni.

import type { AiClient } from '../ai/client.ts';
import { parseJson } from '../ai/client.ts';
import type { Topic } from '../lib/backlog.ts';
import {
  channelBrief,
  channelFormat,
  loadPrompt,
  targetWords,
  type AffiliateLink,
  type AiConfig,
  type ChannelConfig,
} from '../lib/config.ts';
import {
  LISTICLE_SCHEMA,
  normalizeListicle,
  normalizeScript,
  SCRIPT_SCHEMA,
  scriptWords,
  type Script,
} from '../lib/script.ts';
import { costUsd } from '../lib/usage.ts';

export interface StageResult<T> {
  value: T;
  cost: number;
}

function topicBrief(t: Topic): string {
  return [
    `Working title: ${t.title}`,
    t.query ? `Main search query: ${t.query}` : '',
    t.tools?.length ? `Tools: ${t.tools.join(', ')}` : '',
    t.format ? `Format: ${t.format}` : '',
    t.angle ? `Promise to the viewer: ${t.angle}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function research(
  ai: AiClient,
  channel: ChannelConfig,
  aiCfg: AiConfig,
  topic: Topic,
  today = new Date().toISOString().slice(0, 10),
): Promise<StageResult<string>> {
  const res = await ai.ask({
    stage: aiCfg.research,
    system: loadPrompt('research', { CHANNEL: channelBrief(channel) }),
    web: true,
    user: `Today is ${today}.\n\n${topicBrief(topic)}\n\nResearch this topic and write the notes in the required format.`,
  });
  if (res.text.trim().length < 400) throw new Error('Araştırma notları beklenenden kısa geldi');
  return { value: res.text.trim() + '\n', cost: costUsd(aiCfg.prices, res.model, res.usage) };
}

export async function writeScript(
  ai: AiClient,
  channel: ChannelConfig,
  aiCfg: AiConfig,
  topic: Topic,
  notes: string,
  affiliates: AffiliateLink[],
  packaging?: Packaging,
): Promise<StageResult<Script>> {
  const words = targetWords(channel);
  const listicle = channelFormat(channel) === 'listicle';
  const shape = channel.listicle ?? { items: 15, images_per_item: 3, intro_images: 4, outro_images: 2 };
  const system = loadPrompt('script', {
    CHANNEL: channelBrief(channel),
    TARGET_WORDS: words.target,
    TARGET_MINUTES: channel.video.target_minutes,
    MIN_WORDS: words.min,
    ITEMS: shape.items,
    IMAGES_PER_ITEM: shape.images_per_item,
    INTRO_IMAGES: shape.intro_images,
    OUTRO_IMAGES: shape.outro_images,
  });
  const schema = listicle ? LISTICLE_SCHEMA : SCRIPT_SCHEMA;
  const normalize = (raw: unknown) => (listicle ? normalizeListicle(raw as never, shape) : normalizeScript(raw as never));
  const partners = affiliates.filter((a) => a.affiliate).map((a) => a.name);
  const baseUser = [
    topicBrief(topic),
    partners.length ? `\nTools with a partner link in the description: ${partners.join(', ')}` : '',
    packaging ? `\n## Packaging (already decided — the video must pay off this promise)\n${packagingBrief(packaging)}` : '',
    `\n## Research notes\n${notes}`,
  ].join('\n');

  let cost = 0;
  let feedback = '';
  let last: Script | undefined;
  // Çok kısa senaryoda bir kez geri bildirimle yeniden yazdırırız.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ai.ask({ stage: aiCfg.script, system, schema, user: baseUser + feedback });
    cost += costUsd(aiCfg.prices, res.model, res.usage);
    last = normalize(parseJson(res.text));
    const n = scriptWords(last);
    if (n >= words.min) return { value: last, cost };
    feedback =
      `\n\n## Revision needed\nYour previous draft had only ${n} words of narration; the minimum is ${words.min} ` +
      `and the target is ${words.target}. Add genuinely useful depth (extra tips, common mistakes, alternatives), not filler.`;
  }
  console.warn(`Uyarı: senaryo hedefin altında kaldı (${scriptWords(last!)} kelime); yine de devam ediliyor.`);
  return { value: last!, cost };
}

export interface Metadata {
  titles: string[];
  description_intro: string;
  tags: string[];
  thumbnail_text: string;
  thumbnail_badge: string;
  /** Kapak fotoğrafı için görsel tarifi (yalnızca listicle kanallarında kullanılır) */
  thumbnail_prompt?: string;
  hashtags: string[];
  /** Videonun ait olduğu seri / oynatma listesi adı */
  playlist?: string;
  /** Video yüklenmeyen günler için Topluluk sekmesi gönderisi (anket) */
  community_post?: string;
}

// ---------------------------------------------------------------------------
// Paketleme: başlık ve kapak videodan ÖNCE tasarlanır. Merak boşluğu zayıfsa bir kez yeniden denenir.

export interface Packaging {
  titles: string[];
  thumbnail_text: string;
  thumbnail_prompt: string;
  curiosity_gap: string;
  open_loop: string;
  score: number;
}

const PACKAGING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titles', 'thumbnail_text', 'thumbnail_prompt', 'curiosity_gap', 'open_loop', 'score'],
  properties: {
    titles: { type: 'array', items: { type: 'string' } },
    thumbnail_text: { type: 'string' },
    thumbnail_prompt: { type: 'string' },
    curiosity_gap: { type: 'string' },
    open_loop: { type: 'string' },
    score: { type: 'integer' },
  },
};

export function packagingBrief(p: Packaging): string {
  return [
    `Title: ${p.titles[0]}`,
    `Thumbnail text: ${p.thumbnail_text}`,
    `Thumbnail image: ${p.thumbnail_prompt}`,
    `Curiosity gap: ${p.curiosity_gap}`,
    `Open loop to plant in the hook and pay off at #1: ${p.open_loop}`,
  ].join('\n');
}

export async function writePackaging(
  ai: AiClient,
  channel: ChannelConfig,
  aiCfg: AiConfig,
  topic: Topic,
  notes: string,
): Promise<StageResult<Packaging>> {
  const shape = channel.listicle ?? { items: 15, images_per_item: 3, intro_images: 4, outro_images: 2 };
  const system = loadPrompt('packaging', { CHANNEL: channelBrief(channel), ITEMS: shape.items });
  let cost = 0;
  let best: Packaging | undefined;
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ai.ask({
      stage: aiCfg.metadata,
      system,
      schema: PACKAGING_SCHEMA,
      user: `${topicBrief(topic)}\n\n## Research notes\n${notes}${feedback}`,
    });
    cost += costUsd(aiCfg.prices, res.model, res.usage);
    const p = parseJson<Packaging>(res.text);
    const pk: Packaging = {
      titles: (p.titles ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 3),
      thumbnail_text: (p.thumbnail_text ?? '').trim().toUpperCase(),
      thumbnail_prompt: (p.thumbnail_prompt ?? '').trim(),
      curiosity_gap: (p.curiosity_gap ?? '').trim(),
      open_loop: (p.open_loop ?? '').trim(),
      score: Math.max(1, Math.min(10, Math.round(p.score ?? 0))),
    };
    if (!pk.titles.length) pk.titles.push(topic.title);
    if (!best || pk.score > best.score) best = pk;
    if (pk.score >= 8) break;
    feedback = `\n\n## Revision needed\nYour previous packaging scored ${pk.score}/10: "${pk.titles[0]}" / "${pk.thumbnail_text}". Find a sharper curiosity gap.`;
  }
  return { value: best!, cost };
}

const METADATA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titles', 'description_intro', 'tags', 'thumbnail_text', 'thumbnail_badge', 'thumbnail_prompt', 'hashtags', 'playlist', 'community_post'],
  properties: {
    titles: { type: 'array', items: { type: 'string' } },
    description_intro: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    thumbnail_text: { type: 'string' },
    thumbnail_badge: { type: 'string' },
    thumbnail_prompt: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    playlist: { type: 'string' },
    community_post: { type: 'string' },
  },
};

export async function writeMetadata(
  ai: AiClient,
  channel: ChannelConfig,
  aiCfg: AiConfig,
  topic: Topic,
  script: Script,
  packaging?: Packaging,
): Promise<StageResult<Metadata>> {
  const narration = script.scenes.map((s) => s.narration).join('\n');
  const res = await ai.ask({
    stage: aiCfg.metadata,
    system: loadPrompt('metadata', { CHANNEL: channelBrief(channel) }),
    schema: METADATA_SCHEMA,
    user:
      `${topicBrief(topic)}\n\n## Script title\n${script.title}\n${itemList(script)}` +
      (packaging ? `\n## Packaging (keep these titles and thumbnail)\n${packagingBrief(packaging)}\n` : '') +
      `\n## Narration\n${narration}`,
  });
  const m = parseJson<Metadata>(res.text);
  const titles = (m.titles ?? []).map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 100));
  if (!titles.length) titles.push(script.title || topic.title);
  return {
    value: {
      titles,
      description_intro: (m.description_intro ?? '').trim(),
      tags: limitTags([...(m.tags ?? []), ...channel.youtube.default_tags]),
      thumbnail_text: (m.thumbnail_text ?? '').trim() || script.tools[0] || topic.title,
      thumbnail_badge: (m.thumbnail_badge ?? '').trim(),
      thumbnail_prompt: (m.thumbnail_prompt ?? '').trim(),
      hashtags: (m.hashtags ?? []).map((h) => h.trim()).filter((h) => /^#\w+$/.test(h)).slice(0, 3),
      playlist: (m.playlist ?? '').trim() || undefined,
      community_post: (m.community_post ?? '').trim() || undefined,
      // Paketleme önceden tasarlandıysa başlık ve kapak ondan gelir
      ...(packaging
        ? { titles: packaging.titles, thumbnail_text: packaging.thumbnail_text, thumbnail_prompt: packaging.thumbnail_prompt }
        : {}),
    },
    cost: costUsd(aiCfg.prices, res.model, res.usage),
  };
}

/** Listicle senaryosunda madde sayısı ve başlıkları (başlıktaki sayı bununla aynı olmalı). */
function itemList(script: Script): string {
  const items = script.scenes.flatMap((s) => (s.visual.type === 'photos' && s.visual.number > 0 ? [`#${s.visual.number} ${s.visual.heading}`] : []));
  return items.length ? `\n## Items (${items.length}, countdown order)\n${items.join('\n')}\n` : '';
}

/** YouTube etiket sınırı: toplam ~500 karakter; güvenli tarafta 450. */
export function limitTags(tags: string[], maxChars = 450): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const raw of tags) {
    const t = raw.replace(/[<>,]/g, '').trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    const len = t.length + (t.includes(' ') ? 2 : 0) + (out.length ? 1 : 0);
    if (total + len > maxChars) break;
    seen.add(key);
    out.push(t);
    total += len;
  }
  return out;
}
