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
