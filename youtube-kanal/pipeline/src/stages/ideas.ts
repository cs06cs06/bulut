// Haftalık konu fikirleri: arama önerileri + web'den güncel gelişmeler → puanlı konu listesi.

import type { AiClient } from '../ai/client.ts';
import { parseJson } from '../ai/client.ts';
import { slugify, titleKey, type Topic } from '../lib/backlog.ts';
import { channelBrief, loadPrompt, type AiConfig, type ChannelConfig, type VideoFormat } from '../lib/config.ts';
import { costUsd } from '../lib/usage.ts';

const IDEAS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'query', 'tools', 'format', 'angle', 'why', 'score'],
        properties: {
          title: { type: 'string' },
          query: { type: 'string' },
          tools: { type: 'array', items: { type: 'string' } },
          format: { type: 'string', enum: ['tutorial', 'comparison', 'listicle'] },
          angle: { type: 'string' },
          why: { type: 'string' },
          score: { type: 'integer' },
        },
      },
    },
  },
};

interface RawIdea {
  title: string;
  query: string;
  tools: string[];
  format: VideoFormat;
  angle: string;
  why: string;
  score: number;
}

export async function generateIdeas(args: {
  ai: AiClient;
  channel: ChannelConfig;
  aiCfg: AiConfig;
  existing: Topic[];
  suggestions: string[];
  today?: string;
}): Promise<{ topics: Topic[]; cost: number }> {
  const { ai, channel, aiCfg, existing, suggestions } = args;
  const today = args.today ?? new Date().toISOString().slice(0, 10);
  const system = loadPrompt('ideas', { CHANNEL: channelBrief(channel) });
  const existingList = existing.map((t) => `- ${t.title} [${t.status}]`).join('\n') || '(none yet)';
  const count = channel.topics.ideas_per_run;

  // 1) Güncel gelişmeler (web araması, serbest metin)
  const trends = await ai.ask({
    stage: aiCfg.ideas,
    system,
    web: true,
    user:
      `Today is ${today}. Search the web for what changed in the last 30–60 days for these tools and topics: ` +
      `${channel.seeds.join(', ')}. List new features, launches, pricing changes and trending use cases ` +
      `that people will search tutorials for. Short bullet notes with dates and source URLs.`,
  });

  // 2) Puanlı konu listesi (yapılandırılmış çıktı)
  const res = await ai.ask({
    stage: aiCfg.ideas,
    system,
    schema: IDEAS_SCHEMA,
    user: [
      `Today is ${today}. Propose ${count} new video topics.`,
      `\n## Real YouTube search suggestions (autocomplete)\n${suggestions.slice(0, 400).join('\n') || '(unavailable)'}`,
      `\n## Recent developments (web research)\n${trends.text}`,
      `\n## Existing topics (do not repeat)\n${existingList}`,
    ].join('\n'),
  });

  const cost =
    costUsd(aiCfg.prices, trends.model, trends.usage) + costUsd(aiCfg.prices, res.model, res.usage);
  const raw = parseJson<{ ideas: RawIdea[] }>(res.text).ideas ?? [];
  return { topics: mergeIdeas(existing, raw, today).slice(0, count), cost };
}

/** Yeni fikirlerden mevcutlarla çakışanları eler ve Topic'e çevirir. */
export function mergeIdeas(existing: Topic[], ideas: RawIdea[], today: string): Topic[] {
  const keys = new Set(existing.map((t) => titleKey(t.title)));
  const ids = new Set(existing.map((t) => t.id));
  const out: Topic[] = [];
  for (const i of ideas) {
    if (!i.title?.trim()) continue;
    const key = titleKey(i.title);
    if (keys.has(key)) continue;
    keys.add(key);
    let id = slugify(i.title);
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    out.push({
      id,
      title: i.title.trim(),
      query: i.query,
      tools: i.tools,
      format: i.format,
      angle: i.angle,
      why: i.why,
      score: Math.max(1, Math.min(10, Math.round(i.score))),
      status: 'bekliyor',
      added: today,
    });
  }
  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
