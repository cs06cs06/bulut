// Arşiv arama dizini (FTS5): triyajda alakalı bulunan yayınlar soru-cevap için dizinlenir.

import type { Db, Stmt } from './db.ts';

/** Türkçe "ı/İ" FTS5'in aksan temizliğinde "i"ye dönmez; dizin ve sorgu aynı biçimde katlanır. */
export const foldTr = (s: string) => s.replace(/[ıİ]/g, 'i');

// İmleç: dizinlenen son triyaj kaydının zamanı ve yayın kimliği (triyaj bitiş sırasıyla ilerlenir)
const CURSOR_KEY = 'fts_cursor_v2';
const COUNT_KEY = 'fts_count';
// Eski (kimlik sıralı) imleç: eski kodun aynı yayınları ikinci kez eklememesi için "hepsi bitti" değerine çekilir
const LEGACY_KEY = 'fts_cursor';
const LEGACY_DONE = '1000000000000';

const upsert = (db: Db, key: string, value: string) =>
  db.all(`INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [key, value]);

/**
 * Henüz dizinlenmemiş alakalı yayınları ekler. Yayınlar triyajın bittiği sırayla işlenir; böylece
 * triyaj birikimi olsa da yeni değerlendirilen yayınlar hemen aranabilir olur.
 */
export async function updateSearchIndex(db: Db, maxRows: number): Promise<number> {
  if (maxRows <= 0) return 0;
  const state = Object.fromEntries(
    (await db.all<{ key: string; value: string }>(`SELECT key, value FROM app_state WHERE key IN (?, ?)`, [CURSOR_KEY, COUNT_KEY])).map((r) => [
      r.key,
      r.value,
    ]),
  );
  const cur = state[CURSOR_KEY] ? (JSON.parse(state[CURSOR_KEY]) as { at: string; id: number }) : { at: '', id: 0 };

  const rows = await db.all<{ id: number; at: string; title: string; abstract: string | null; title_tr: string | null; summary_tr: string | null }>(
    `SELECT w.id, t.created_at AS at, w.title, w.abstract, t.title_tr, t.summary_tr
     FROM triage t JOIN works w ON w.id = t.work_id
     WHERE t.relevant = 1 AND (t.created_at > ? OR (t.created_at = ? AND t.work_id > ?))
     ORDER BY t.created_at, t.work_id LIMIT ?`,
    [cur.at, cur.at, cur.id, maxRows],
  );
  if (!rows.length) return 0;
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
  const last = rows[rows.length - 1];
  await upsert(db, CURSOR_KEY, JSON.stringify({ at: last.at, id: last.id }));
  await upsert(db, COUNT_KEY, String(Number(state[COUNT_KEY] ?? 0) + rows.length));
  await upsert(db, LEGACY_KEY, LEGACY_DONE);
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
