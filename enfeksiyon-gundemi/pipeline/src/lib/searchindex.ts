// Arşiv arama dizini (FTS5): triyajda alakalı bulunan yayınlar soru-cevap için dizinlenir.

import type { Db, Stmt } from './db.ts';

/** Türkçe "ı/İ" FTS5'in aksan temizliğinde "i"ye dönmez; dizin ve sorgu aynı biçimde katlanır. */
export const foldTr = (s: string) => s.replace(/[ıİ]/g, 'i');

const CURSOR_KEY = 'fts_cursor';

/**
 * Henüz dizinlenmemiş yayınları ekler. Yayınlar kimlik sırasıyla işlenir; triyajı bitmemiş
 * en küçük kimliğe kadar ilerlenir, böylece hiçbir alakalı yayın atlanmaz.
 */
export async function updateSearchIndex(db: Db, maxRows: number): Promise<number> {
  if (maxRows <= 0) return 0;
  const cursor = Number((await db.all<{ value: string }>(`SELECT value FROM app_state WHERE key = ?`, [CURSOR_KEY]))[0]?.value ?? 0);
  const [{ bound }] = await db.all<{ bound: number | null }>(
    `SELECT COALESCE((SELECT MIN(id) - 1 FROM works WHERE status IN ('new', 'triage_pending')), (SELECT MAX(id) FROM works), 0) AS bound`,
  );
  const upper = Number(bound ?? 0);
  if (upper <= cursor) return 0;

  const rows = await db.all<{ id: number; title: string; abstract: string | null; title_tr: string | null; summary_tr: string | null }>(
    `SELECT w.id, w.title, w.abstract, t.title_tr, t.summary_tr
     FROM works w JOIN triage t ON t.work_id = w.id
     WHERE w.id > ? AND w.id <= ? AND t.relevant = 1
     ORDER BY w.id LIMIT ?`,
    [cursor, upper, maxRows],
  );
  const next = rows.length === maxRows ? rows[rows.length - 1].id : upper;
  const stmts: Stmt[] = rows.map((r) => ({
    sql: 'INSERT INTO works_fts (rowid, title, abstract, tr) VALUES (?, ?, ?, ?)',
    params: [
      r.id,
      foldTr(r.title),
      foldTr((r.abstract ?? '').slice(0, 4000)),
      foldTr([r.title_tr, r.summary_tr].filter(Boolean).join('\n')),
    ],
  }));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await db.all(
    `INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [CURSOR_KEY, String(next)],
  );
  return rows.length;
}

const STOP = new Set(
  'with from that this were have been their among versus after before during between into than more less over under study trial patients patient adults children results using based analysis effect effects associated association risk outcomes outcome clinical among case report review systematic meta randomised randomized cohort retrospective prospective multicentre multicenter national single centre center years year infection infections'.split(
    ' ',
  ),
);

/** Başlığın ayırt edici kelimelerinden bir FTS5 sorgusu (benzer yazıları bulmak için) */
export function titleQuery(title: string): string | null {
  const words = [
    ...new Set(
      foldTr(title.toLowerCase())
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/[\s-]+/)
        .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)),
    ),
  ].slice(0, 10);
  return words.length >= 2 ? words.map((w) => `"${w}"`).join(' OR ') : null;
}

export interface TextRelated {
  id: number; // reviews.id
  title_tr: string;
  hook: string;
  created_at: string;
  after: string | null;
  topics: string | null;
}

/** Başlığı benzeyen, daha önce yazılmış editör yazıları (arama dizini üzerinden) */
export async function relatedByText(db: Db, title: string, workId: number, sinceIso: string, limit: number): Promise<TextRelated[]> {
  const q = titleQuery(title);
  if (!q) return [];
  try {
    return await db.all<TextRelated>(
      `SELECT r.id, r.title_tr, r.hook, r.created_at, json_extract(r.body, '$.after') AS after, r.topics
       FROM (SELECT rowid, bm25(works_fts, 3.0, 1.0, 2.0) AS score FROM works_fts WHERE works_fts MATCH ? ORDER BY score LIMIT 200) h
       JOIN reviews r ON r.work_id = h.rowid
       WHERE r.work_id != ? AND r.created_at >= ?
       ORDER BY h.score LIMIT ?`,
      [q, workId, sinceIso, limit],
    );
  } catch {
    return []; // dizin henüz boşsa ya da sorgu çözümlenemezse konu eşleşmesiyle devam edilir
  }
}
