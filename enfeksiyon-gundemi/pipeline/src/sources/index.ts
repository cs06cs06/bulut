// config/sources.yaml'dan etkin kaynak listesini kurar.

import type { PubmedConfig, SourcesConfig } from '../lib/config.ts';
import { europePmcClause } from '../lib/keywords.ts';
import { rssSource, whoDonSource } from './feeds.ts';
import { pageSource } from './pages.ts';
import { europePmcPreprints, rxivSource } from './preprints.ts';
import type { Source } from './types.ts';

export interface SourceEntry {
  source: Source;
  /** İlk çalıştırmada geriye kaç gün bakılır */
  lookbackDays: number;
}

export function buildSources(cfg: SourcesConfig, pubmed: PubmedConfig): SourceEntry[] {
  const on = (x: { enabled?: boolean }) => x.enabled !== false;
  const out: SourceEntry[] = [];
  for (const f of cfg.rss.filter(on)) out.push({ source: rssSource(f, 'rss'), lookbackDays: 14 });
  for (const a of cfg.agencies.filter(on))
    out.push({ source: a.type === 'who_don' ? whoDonSource(a) : rssSource(a, 'agency'), lookbackDays: 14 });
  for (const p of cfg.pages.filter(on)) out.push({ source: pageSource(p), lookbackDays: 14 });
  const pp = cfg.preprints;
  if (on(pp.medrxiv)) out.push({ source: rxivSource('medrxiv', pp.medrxiv), lookbackDays: 7 });
  if (on(pp.biorxiv)) out.push({ source: rxivSource('biorxiv', pp.biorxiv), lookbackDays: 7 });
  if (on(pp.europepmc))
    out.push({ source: europePmcPreprints(europePmcClause(pubmed), pp.europepmc.max_per_run), lookbackDays: 7 });
  return out;
}
