// Soru-cevap: ayarlar, arşiv araması, modele verilecek bağlam ve maliyet kaydı.
import Anthropic from '@anthropic-ai/sdk';
import { parse } from 'yaml';
import aiRaw from '../../../../config/ai.yaml?raw';
import qaPrompt from '../../../../prompts/qa.md?raw';
import planPrompt from '../../../../prompts/qa-plan.md?raw';

interface Price {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
}

const ai = parse(aiRaw) as {
  qa: { model: string; effort: 'low' | 'medium' | 'high'; max_tokens: number; plan_model: string; max_sources: number; max_turns: number };
  budget: { monthly_usd: number };
  prices: Record<string, Price>;
};

export const QA = ai.qa;
export const QA_SYSTEM = qaPrompt;
export const PLAN_SYSTEM = planPrompt;

/** baseURL yalnızca yerel denemede sahte sunucu için kullanılır (ANTHROPIC_BASE_URL) */
export function client(apiKey: string | undefined, baseURL?: string): Anthropic {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY tanımlı değil');
  return new Anthropic({ apiKey, baseURL: baseURL || undefined, maxRetries: 2 });
}

// ---------------------------------------------------------------------------
// Maliyet

export interface UsageIn {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

export function costUsd(model: string, u: UsageIn): number {
  const p = ai.prices[model] ?? ai.prices[model.replace(/-\d{8}$/, '')];
  if (!p) return 0;
  return (
    (n(u.input_tokens) * p.input +
      n(u.output_tokens) * p.output +
      n(u.cache_read_input_tokens) * p.cache_read +
      n(u.cache_creation_input_tokens) * p.cache_write) /
    1e6
  );
}

export async function recordUsage(db: D1Database, model: string, u: UsageIn): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_usage (created_at, kind, model, is_batch, requests, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost_usd) VALUES (?1, 'qa', ?2, 0, 1, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(
      new Date().toISOString(),
      model,
      n(u.input_tokens),
      n(u.output_tokens),
      n(u.cache_read_input_tokens),
      n(u.cache_creation_input_tokens),
      costUsd(model, u),
    )
    .run();
}

/** Aylık bütçe dolduysa yeni soru alınmaz */
export async function budgetLeft(db: D1Database): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const row = await db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_usage WHERE created_at >= ?1`).bind(start).first<{ s: number }>();
  return ai.budget.monthly_usd - Number(row?.s ?? 0);
}

// ---------------------------------------------------------------------------
// Arşiv araması (FTS5)

/** Türkçe "ı/İ" dizinde "i" olarak tutulur (toplayıcıdaki foldTr ile aynı) */
export const foldTr = (s: string) => s.replace(/[ıİ]/g, 'i');

/** Arama terimlerinden güvenli bir FTS5 sorgusu kurar */
export function buildMatch(terms: string[]): string | null {
  const parts: string[] = [];
  for (const t of terms.slice(0, 16)) {
    // Önce Türkçe küçük harf (İ→i), sonra ı→i: "HIV" → "hiv", "Kızamık" → "kizamik"
    const words = foldTr(t.toLocaleLowerCase('tr'))
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 4);
    if (!words.length) continue;
    if (words.length === 1) {
      const w = words[0];
      // Kısa kısaltmalarda (CRE, HIV) önek araması gürültü getirir
      parts.push(w.length >= 5 ? `("${w}" OR "${w}"*)` : `"${w}"`);
    } else {
      parts.push(`"${words.join(' ')}"`);
    }
  }
  return parts.length ? [...new Set(parts)].join(' OR ') : null;
}

export interface SourceRow {
  id: number;
  title: string;
  abstract: string | null;
  journal: string | null;
  pub_date: string | null;
  pub_types: string | null;
  doi: string | null;
  pmid: string | null;
  url: string | null;
  is_preprint: number;
  kind: string;
  title_tr: string | null;
  summary_tr: string | null;
  importance: number | null;
  review_title: string | null;
  hook: string | null;
}

const SOURCE_COLS = `w.id, w.title, w.abstract, COALESCE(w.journal_abbr, w.journal) AS journal, w.pub_date, w.pub_types,
  w.doi, w.pmid, w.url, w.is_preprint, w.kind, t.title_tr, t.summary_tr, t.importance, r.title_tr AS review_title, r.hook`;

export async function searchWorks(db: D1Database, terms: string[], since: string | null, limit: number): Promise<SourceRow[]> {
  const match = buildMatch(terms);
  if (!match) return [];
  const rows = (
    await db
      .prepare(
        `SELECT ${SOURCE_COLS}, h.score
         FROM (SELECT rowid, bm25(works_fts, 3.0, 1.0, 2.0) AS score FROM works_fts WHERE works_fts MATCH ?1 ORDER BY score LIMIT 60) h
         JOIN works w ON w.id = h.rowid
         LEFT JOIN triage t ON t.work_id = w.id
         LEFT JOIN reviews r ON r.work_id = w.id
         WHERE (?2 IS NULL OR w.pub_date >= ?2)`,
      )
      .bind(match, since)
      .all<SourceRow & { score: number }>()
  ).results;
  // bm25 sırası esas alınır; editör yazısı olan ve önemli yayınlar biraz öne çekilir
  const ranked = rows
    .sort((a, b) => a.score - b.score)
    .map((r, i) => ({ r, s: i - (r.review_title ? 6 : 0) - (r.importance ?? 0) * 1.5 }))
    .sort((a, b) => a.s - b.s)
    .slice(0, limit)
    .map((x) => x.r);
  return ranked;
}

export async function loadSources(db: D1Database, ids: number[]): Promise<SourceRow[]> {
  if (!ids.length) return [];
  const rows = (
    await db
      .prepare(
        `SELECT ${SOURCE_COLS} FROM works w LEFT JOIN triage t ON t.work_id = w.id LEFT JOIN reviews r ON r.work_id = w.id
         WHERE w.id IN (${ids.map((_, i) => `?${i + 1}`).join(',')})`,
      )
      .bind(...ids)
      .all<SourceRow>()
  ).results;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is SourceRow => !!r);
}

/** Arayüzde gösterilecek kaynak kartı */
export function sourceCard(r: SourceRow) {
  return {
    id: r.id,
    title: r.review_title ?? r.title_tr ?? r.title,
    journal: r.journal,
    pub_date: r.pub_date,
    is_preprint: r.is_preprint,
    kind: r.kind,
    reviewed: !!r.review_title,
    link: r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : r.doi ? `https://doi.org/${r.doi}` : r.url,
  };
}
export type SourceCard = ReturnType<typeof sourceCard>;

// ---------------------------------------------------------------------------
// Modele verilen bağlam

const list = (json: string | null): string[] => {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

function header(r: SourceRow): string[] {
  const lines = [`[#${r.id}] ${r.title}`];
  if (r.title_tr) lines.push(`Türkçe başlık: ${r.title_tr}`);
  const meta = [r.journal, r.pub_date, list(r.pub_types).filter((t) => t !== 'Journal Article').join(', ')].filter(Boolean);
  if (meta.length) lines.push(meta.join(' · '));
  if (r.is_preprint) lines.push('ÖN BASKI (hakem değerlendirmesinden geçmemiş)');
  if (r.kind === 'guideline') lines.push('Klinik rehber / rehber duyurusu');
  else if (r.kind === 'report') lines.push('Kurum yayını / rapor');
  return lines;
}

/** Genel sorularda bulunan yayınların kısa künye + özetleri */
export function sourcesBlock(rows: SourceRow[]): string {
  const parts = rows.map((r) => {
    const lines = header(r);
    if (r.review_title) lines.push(`Editör yazısı var: ${r.review_title} — ${r.hook ?? ''}`);
    if (r.abstract) lines.push(`Özet: ${r.abstract.length > 1800 ? `${r.abstract.slice(0, 1800)}…` : r.abstract}`);
    else if (r.summary_tr) lines.push(`Kısa not: ${r.summary_tr}`);
    else lines.push('Özet yok (yalnızca künye).');
    return lines.join('\n');
  });
  return `## Arşivde bu soru için bulunan yayınlar\n\n${parts.join('\n\n')}`;
}

/** Makale sorularında: künye, özet, editör yazısı ve (varsa) tam metin */
export async function articleBlock(db: D1Database, workId: number): Promise<string | null> {
  const [r] = await loadSources(db, [workId]);
  if (!r) return null;
  const extra = await db
    .prepare(
      `SELECT w.authors, w.coi, w.grants, rv.body, rv.basis, f.text AS fulltext, f.source AS ft_source
       FROM works w LEFT JOIN reviews rv ON rv.work_id = w.id LEFT JOIN fulltexts f ON f.work_id = w.id WHERE w.id = ?1`,
    )
    .bind(workId)
    .first<{ authors: string | null; coi: string | null; grants: string | null; body: string | null; basis: string | null; fulltext: string | null; ft_source: string | null }>();
  const lines = ['## Soruların konusu olan yayın', '', ...header(r)];
  const authors = list(extra?.authors ?? null);
  if (authors.length) lines.push(`Yazarlar: ${authors.length > 6 ? `${authors.slice(0, 6).join(', ')} ve ark.` : authors.join(', ')}`);
  const grants = list(extra?.grants ?? null);
  if (grants.length) lines.push(`Finansman (kayıttaki): ${grants.join('; ')}`);
  if (extra?.coi) lines.push(`Çıkar çatışması beyanı: ${extra.coi}`);
  lines.push('', r.abstract ? `Özet:\n${r.abstract}` : 'Özet yok.');
  if (extra?.body) {
    try {
      const b = JSON.parse(extra.body);
      lines.push(
        '',
        `## Bu yayın için daha önce yazılan editör yazısı (dayanak: ${extra.basis === 'full_text' ? 'tam metin' : 'özet'})`,
        `Başlık: ${r.review_title}`,
        `Kanca: ${r.hook}`,
        `Önce: ${b.before}`,
        `Şimdi: ${b.after}`,
        `Pratikte: ${b.in_practice}`,
        `Kanıt: ${b.evidence?.design ?? ''} ${b.evidence?.results ?? ''}`,
        `Sınırlılıklar: ${b.limitations}`,
        `Finansman/çıkar çatışması: ${b.funding_coi}`,
        `Bağlam: ${b.context}`,
        `Türkiye: ${b.turkey}`,
      );
    } catch {
      /* bozuk yazı gövdesi: yalnızca özetle devam */
    }
  }
  if (extra?.fulltext) lines.push('', `## Tam metin (${extra.ft_source}; tablolar ve şekiller dahil değil)`, extra.fulltext);
  else lines.push('', '(Bu yayının tam metni elimizde yok; yalnızca özet ve editör yazısı var.)');
  return lines.join('\n');
}
