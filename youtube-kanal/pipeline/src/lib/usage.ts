// Aylık maliyet takibi (data/usage.json) ve bütçe tavanı.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, type AiConfig, type ModelPrice } from './config.ts';

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null; web_fetch_requests?: number | null } | null;
}

export function costUsd(prices: AiConfig['prices'], model: string, u: UsageLike): number {
  const p = prices[model] as ModelPrice | undefined;
  const tokens = p
    ? (u.input_tokens * p.input +
        u.output_tokens * p.output +
        (u.cache_read_input_tokens ?? 0) * p.cache_read +
        (u.cache_creation_input_tokens ?? 0) * p.cache_write) /
      1e6
    : 0;
  const searches = ((u.server_tool_use?.web_search_requests ?? 0) * (prices.web_search_per_1000 ?? 10)) / 1000;
  return tokens + searches;
}

interface MonthUsage {
  usd: number;
  videos: number;
  tts_chars: number;
}

export const USAGE_PATH = join(ROOT, 'data', 'usage.json');

export class UsageLedger {
  private data: Record<string, MonthUsage>;
  constructor(private path = USAGE_PATH, private now = () => new Date()) {
    this.data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  }

  private month(): MonthUsage {
    const key = this.now().toISOString().slice(0, 7);
    return (this.data[key] ??= { usd: 0, videos: 0, tts_chars: 0 });
  }

  spentThisMonth(): number {
    return this.month().usd;
  }

  add(usd: number, extra: { video?: boolean; ttsChars?: number } = {}): void {
    const m = this.month();
    m.usd = Math.round((m.usd + usd) * 10000) / 10000;
    if (extra.video) m.videos++;
    if (extra.ttsChars) m.tts_chars += extra.ttsChars;
    writeFileSync(this.path, JSON.stringify(this.data, null, 2) + '\n');
  }
}
