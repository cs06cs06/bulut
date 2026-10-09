// PubMed dışındaki kaynaklar için ortak arayüz.

import type { Db } from '../lib/db.ts';
import { fetchWithRetry, RateLimiter } from '../lib/http.ts';
import type { NormalizedRecord } from '../lib/normalize.ts';

export interface SourceContext {
  /** Bu tarihten (dahil, YYYY-MM-DD) sonraki kayıtlar istenir */
  since: string;
  today: string;
  /** İlk çalıştırma mı (sayfa izlemede mevcut bağlantılar yalnızca kayda alınır) */
  firstRun: boolean;
  db: Db;
  keywordFilter: (text: string) => boolean;
}

export interface Source {
  id: string; // source_state anahtarı, ör. rss:cid
  name: string;
  fetch(ctx: SourceContext): Promise<{ records: NormalizedRecord[]; note?: string }>;
}

export const USER_AGENT = 'Mozilla/5.0 (compatible; EnfeksiyonGundemi/1.0; +https://github.com/cs06cs06/bulut)';

const limiters = new Map<string, RateLimiter>();

/** Aynı siteye saniyede en fazla 2 istek; yeniden denemeli */
export async function getText(url: string, accept = '*/*'): Promise<string> {
  const host = new URL(url).host;
  let lim = limiters.get(host);
  if (!lim) limiters.set(host, (lim = new RateLimiter(2)));
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept } }, { limiter: lim, retries: 3, timeoutMs: 45_000 });
  return res.text();
}

export async function getJson<T>(url: string): Promise<T> {
  return JSON.parse(await getText(url, 'application/json')) as T;
}

/** Ortak kayıt iskeleti */
export function baseRecord(source: string, sourceId: string, title: string): NormalizedRecord {
  return {
    source,
    sourceId,
    title,
    authors: [],
    pubTypes: [],
    mesh: [],
    keywords: [],
    grants: [],
    isPreprint: false,
    kind: 'article',
  };
}
