// config/*.yaml dosyalarını okur.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CONFIG_DIR = join(ROOT, 'config');

function load<T>(name: string): T {
  return parse(readFileSync(join(CONFIG_DIR, name), 'utf8')) as T;
}

export interface PubmedConfig {
  include: Record<string, string[]>;
  exclude: string[];
  languages: string[];
  overlap_days: number;
  backfill_days: number;
}

export interface LimitsConfig {
  collect: { max_new_records_per_run: number; low_volume_warning_ratio: number };
}

export function loadPubmedConfig(): PubmedConfig {
  return load<PubmedConfig>('pubmed.yaml');
}

export function loadLimits(): LimitsConfig {
  return load<LimitsConfig>('limits.yaml');
}

/** pubmed.yaml'daki blokları tek bir PubMed sorgusuna çevirir. */
export function buildPubmedQuery(cfg: PubmedConfig): string {
  const terms = Object.values(cfg.include).flat();
  if (terms.length === 0) throw new Error('pubmed.yaml: include boş olamaz');
  let q = `(${terms.join(' OR ')})`;
  for (const ex of cfg.exclude ?? []) q += ` NOT ${ex}`;
  if (cfg.languages?.length) q = `(${q}) AND (${cfg.languages.map((l) => `${l}[la]`).join(' OR ')})`;
  return q;
}

// ---------------------------------------------------------------------------
// Dergi katmanları

export interface JournalInfo {
  tier: 1 | 2;
  turkiye: boolean;
}

export const journalKey = (name: string) =>
  name.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

type JournalEntry = string | Record<string, { turkiye?: boolean } | null>;

export function loadJournalTiers(): Map<string, JournalInfo> {
  const raw = load<{ tier1?: JournalEntry[]; tier2?: JournalEntry[] }>('journals.yaml');
  const map = new Map<string, JournalInfo>();
  const add = (entries: JournalEntry[] | undefined, tier: 1 | 2) => {
    for (const e of entries ?? []) {
      if (typeof e === 'string') map.set(journalKey(e), { tier, turkiye: false });
      else
        for (const [name, opts] of Object.entries(e))
          map.set(journalKey(name), { tier, turkiye: !!opts?.turkiye });
    }
  };
  add(raw.tier1, 1);
  add(raw.tier2, 2);
  return map;
}

export function lookupJournal(
  tiers: Map<string, JournalInfo>,
  ...names: (string | undefined)[]
): JournalInfo | undefined {
  for (const n of names) {
    if (!n) continue;
    const hit = tiers.get(journalKey(n));
    if (hit) return hit;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Yapay zekâ ayarları, konu listesi ve istemler (prompts)

export interface ModelPrice {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
}

export interface AiConfig {
  triage: { model: string; effort: Effort; max_tokens: number; max_per_run: number };
  review: {
    model: string;
    effort: Effort;
    max_tokens: number;
    max_per_day: number;
    initial_backlog: number;
    min_importance: number;
    candidate_days: number;
    related_reviews: number;
  };
  budget: { monthly_usd: number };
  batch: { max_wait_minutes: number };
  prices: Record<string, ModelPrice>;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Topic {
  kod: string;
  ad: string;
  kapsam: string;
}

export function loadAiConfig(): AiConfig {
  return load<AiConfig>('ai.yaml');
}

export function loadTopics(): Topic[] {
  return load<Topic[]>('topics.yaml');
}

export function loadPrompt(name: string): string {
  return readFileSync(join(ROOT, 'prompts', `${name}.md`), 'utf8');
}
