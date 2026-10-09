// Anahtar kelime süzgeci: genel tıp dergileri ve kurum yayınlarından yalnızca alanla ilgili
// olanları almak için. Kelimeler config/pubmed.yaml'daki terimlerden üretilir (tek kaynak).

import type { PubmedConfig } from './config.ts';

/** PubMed terimlerinden düz kelime/ifade listesi çıkarır: 'infection*[tiab]' → 'infection*' */
export function plainTerms(cfg: PubmedConfig): string[] {
  const out = new Set<string>();
  for (const term of Object.values(cfg.include).flat()) {
    const m = /^"?([^"[\]]+?)"?\s*\[(tiab|mesh)\]$/i.exec(term.trim());
    if (m) out.add(m[1].trim());
  }
  return [...out];
}

/** Başlık + özette en az bir alan terimi geçiyor mu? */
export function buildKeywordFilter(cfg: PubmedConfig): (text: string) => boolean {
  const parts = plainTerms(cfg).map((t) => {
    const escaped = t.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '\\w*').replace(/\s+/g, '[\\s-]+');
    return escaped;
  });
  const re = new RegExp(`\\b(?:${parts.join('|')})\\b`, 'i');
  return (text: string) => re.test(text);
}

/** Europe PMC sorgusu için TITLE_ABS ifadesi */
export function europePmcClause(cfg: PubmedConfig): string {
  const terms = plainTerms(cfg)
    .filter((t) => !/[-]/.test(t)) // tireli ifadeler Europe PMC'de sorun çıkarabiliyor
    .map((t) => (/\s/.test(t) ? `"${t}"` : t));
  return `TITLE_ABS:(${terms.join(' OR ')})`;
}
