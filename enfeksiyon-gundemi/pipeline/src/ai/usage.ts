// Token kullanımı ve maliyet takibi.

import type { ModelPrice } from '../lib/config.ts';
import type { Db } from '../lib/db.ts';

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costUsd(price: ModelPrice | undefined, u: UsageLike, isBatch: boolean): number {
  if (!price) return 0;
  const raw =
    u.input_tokens * price.input +
    u.output_tokens * price.output +
    (u.cache_read_input_tokens ?? 0) * price.cache_read +
    (u.cache_creation_input_tokens ?? 0) * price.cache_write;
  return (raw / 1e6) * (isBatch ? 0.5 : 1);
}

interface Bucket {
  kind: string;
  model: string;
  isBatch: boolean;
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

/** Çağrıları biriktirir, sonunda veritabanına tek satır/model olarak yazar. */
export class UsageMeter {
  private buckets = new Map<string, Bucket>();
  constructor(private prices: Record<string, ModelPrice>) {}

  add(kind: string, model: string, isBatch: boolean, u: UsageLike): void {
    const key = `${kind}|${model}|${isBatch}`;
    const b =
      this.buckets.get(key) ??
      ({ kind, model, isBatch, requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } as Bucket);
    b.requests++;
    b.input += u.input_tokens;
    b.output += u.output_tokens;
    b.cacheRead += u.cache_read_input_tokens ?? 0;
    b.cacheWrite += u.cache_creation_input_tokens ?? 0;
    b.cost += costUsd(this.prices[model] ?? this.prices[baseModel(model)], u, isBatch);
    this.buckets.set(key, b);
  }

  total(): number {
    let t = 0;
    for (const b of this.buckets.values()) t += b.cost;
    return t;
  }

  async flush(db: Db): Promise<void> {
    const now = new Date().toISOString();
    const stmts = [...this.buckets.values()].map((b) => ({
      sql: `INSERT INTO ai_usage (created_at, kind, model, is_batch, requests, input_tokens, output_tokens,
              cache_read_tokens, cache_write_tokens, cost_usd) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      params: [now, b.kind, b.model, b.isBatch ? 1 : 0, b.requests, b.input, b.output, b.cacheRead, b.cacheWrite, b.cost],
    }));
    if (stmts.length) await db.batch(stmts);
    this.buckets.clear();
  }
}

/** Yanıttaki model adı tarih eki taşıyabilir; fiyat tablosu için temel adı bulur. */
function baseModel(model: string): string {
  return model.replace(/-\d{8}$/, '');
}

/** Bu ayın (UTC) toplam yapay zekâ harcaması */
export async function monthSpend(db: Db, now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const rows = await db.all<{ s: number | null }>('SELECT SUM(cost_usd) AS s FROM ai_usage WHERE created_at >= ?', [start]);
  return rows[0]?.s ?? 0;
}
