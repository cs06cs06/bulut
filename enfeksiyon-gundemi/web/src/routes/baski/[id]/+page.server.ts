import { error } from '@sveltejs/kit';
import { dateRange, type WeeklyRow } from '$lib/server/issues';
import { CARD_SELECT, toCard } from '$lib/server/reviews';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const id = Number(params.id);
  if (!Number.isInteger(id)) error(404, 'Baskı bulunamadı');
  const issue = await db
    .prepare(`SELECT id, issue_date, start_date, title, body, review_ids FROM issues WHERE id = ?1 AND kind = 'weekly'`)
    .bind(id)
    .first<WeeklyRow>();
  if (!issue) error(404, 'Baskı bulunamadı');

  const body = JSON.parse(issue.body) as { intro: string; top: { review_id: number; why: string }[] };
  const ids = (JSON.parse(issue.review_ids) as number[]).filter(Number.isInteger).slice(0, 90);
  const rows = ids.length
    ? (await db.prepare(`${CARD_SELECT} WHERE r.id IN (${ids.map((_, i) => `?${i + 1}`).join(',')})`).bind(...ids).all()).results
    : [];
  // CARD_SELECT yayın kimliğini döndürür; yazı kimliğiyle eşlemek için ayrıca okunur
  const map = ids.length
    ? (
        await db
          .prepare(`SELECT id, work_id FROM reviews WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(',')})`)
          .bind(...ids)
          .all<{ id: number; work_id: number }>()
      ).results
    : [];
  const workOf = new Map(map.map((m) => [m.id, m.work_id]));
  const cards = new Map(rows.map((r) => toCard(r)).map((c) => [c.id, c]));
  const top = body.top
    .map((t, i) => ({ rank: i + 1, why: t.why, card: cards.get(workOf.get(t.review_id) ?? -1) }))
    .filter((t) => t.card);
  const topWorks = new Set(top.map((t) => t.card!.id));
  const others = ids.map((rid) => cards.get(workOf.get(rid) ?? -1)).filter((c) => c && !topWorks.has(c.id));

  return {
    issue: { id: issue.id, title: issue.title, range: dateRange(issue.start_date, issue.issue_date), intro: body.intro },
    top,
    others,
  };
};
