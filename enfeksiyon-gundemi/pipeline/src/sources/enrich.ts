// Zenginleştirme: RSS/ön baskı gibi kaynaklardan özeti eksik ya da çok kısa gelen kayıtları
// OpenAlex ve Crossref'ten tamamlar (ikisi de ücretsiz, anahtar gerektirmez).

import type { Db, Stmt } from '../lib/db.ts';
import { stripTags } from '../lib/normalize.ts';
import { getJson } from './types.ts';

const SHORT_ABSTRACT = 400;

interface Candidate {
  id: number;
  doi: string;
  abstract: string | null;
  authors: string | null;
}

/** OpenAlex'in "ters dizin" özetini düz metne çevirir */
export function invertedToText(index: Record<string, number[]> | null | undefined): string | undefined {
  if (!index) return undefined;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  const text = words.filter((w) => w !== undefined).join(' ').trim();
  return text || undefined;
}

interface Found {
  abstract?: string;
  authors?: string[];
}

async function fromOpenAlex(doi: string): Promise<Found> {
  const data = await getJson<{
    abstract_inverted_index?: Record<string, number[]> | null;
    authorships?: { author?: { display_name?: string } }[];
  }>(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}?select=abstract_inverted_index,authorships`);
  return {
    abstract: invertedToText(data.abstract_inverted_index),
    authors: (data.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
  };
}

async function fromCrossref(doi: string): Promise<Found> {
  const data = await getJson<{ message: { abstract?: string; author?: { given?: string; family?: string; name?: string }[] } }>(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
  );
  const m = data.message ?? {};
  return {
    abstract: m.abstract ? stripTags(m.abstract).replace(/^abstract\s*/i, '') || undefined : undefined,
    authors: (m.author ?? []).map((a) => a.name ?? [a.family, a.given?.[0]].filter(Boolean).join(' ')).filter(Boolean),
  };
}

export interface EnrichSummary {
  checked: number;
  improved: number;
}

/** Henüz triyaja girmemiş, DOI'si olan ama özeti eksik kayıtları tamamlar. */
export async function enrichWorks(db: Db, maxPerRun: number, now = new Date()): Promise<EnrichSummary> {
  const since = new Date(now.getTime() - 14 * 864e5).toISOString();
  const rows = await db.all<Candidate>(
    `SELECT id, doi, abstract, authors FROM works
     WHERE status = 'new' AND doi IS NOT NULL AND pmid IS NULL AND enriched_at IS NULL AND first_seen_at >= ?
       AND (abstract IS NULL OR LENGTH(abstract) < ?)
     ORDER BY first_seen_at DESC LIMIT ?`,
    [since, SHORT_ABSTRACT, maxPerRun],
  );
  const summary: EnrichSummary = { checked: 0, improved: 0 };
  const stmts: Stmt[] = [];
  const ts = now.toISOString();
  for (const w of rows) {
    summary.checked++;
    let found: Found = {};
    try {
      found = await fromOpenAlex(w.doi);
    } catch {
      /* OpenAlex'te yok ya da erişilemedi */
    }
    if (!found.abstract || found.abstract.length < SHORT_ABSTRACT) {
      try {
        const cr = await fromCrossref(w.doi);
        if ((cr.abstract?.length ?? 0) > (found.abstract?.length ?? 0)) found.abstract = cr.abstract;
        if (!found.authors?.length) found.authors = cr.authors;
      } catch {
        /* Crossref'te yok */
      }
    }
    const abstract = found.abstract && found.abstract.length > (w.abstract?.length ?? 0) ? found.abstract.slice(0, 8000) : null;
    const authors = !w.authors && found.authors?.length ? JSON.stringify(found.authors.slice(0, 50)) : null;
    if (abstract || authors) summary.improved++;
    stmts.push({
      sql: `UPDATE works SET abstract = COALESCE(?, abstract), authors = COALESCE(?, authors), enriched_at = ?, updated_at = ? WHERE id = ?`,
      params: [abstract, authors, ts, ts, w.id],
    });
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return summary;
}
