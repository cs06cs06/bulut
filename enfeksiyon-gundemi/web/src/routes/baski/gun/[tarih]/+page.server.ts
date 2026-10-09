import { error } from '@sveltejs/kit';
import { TR_DAY } from '$lib/server/issues';
import { CARD_SELECT, toCard } from '$lib/server/reviews';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const day = params.tarih;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) error(404, 'Baskı bulunamadı');
  const [rows, num] = await db.batch([
    db
      .prepare(
        `${CARD_SELECT} WHERE ${TR_DAY} = ?1
         ORDER BY CASE r.impact WHEN 'practice_changing' THEN 0 WHEN 'important' THEN 1 ELSE 2 END, r.created_at`,
      )
      .bind(day),
    db.prepare(`SELECT COUNT(DISTINCT ${TR_DAY}) AS n FROM reviews r WHERE ${TR_DAY} <= ?1`).bind(day),
  ]);
  if (!rows.results.length) error(404, 'Bu tarihte baskı yok');
  return { day, number: Number((num.results[0] as { n: number }).n), cards: rows.results.map(toCard) };
};
