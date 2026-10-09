import { error } from '@sveltejs/kit';
import { TR_DAY, dateRange, weeklySummary, type WeeklyRow } from '$lib/server/issues';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const [weekly, days, total] = await db.batch([
    db.prepare(`SELECT id, issue_date, start_date, title, body, review_ids FROM issues WHERE kind = 'weekly' ORDER BY issue_date DESC LIMIT 20`),
    db.prepare(
      `SELECT ${TR_DAY} AS day, COUNT(*) AS n, SUM(r.impact = 'practice_changing') AS pc,
              (SELECT r2.title_tr FROM reviews r2 WHERE date(r2.created_at, '+3 hours') = ${TR_DAY}
               ORDER BY CASE r2.impact WHEN 'practice_changing' THEN 0 WHEN 'important' THEN 1 ELSE 2 END LIMIT 1) AS lead
       FROM reviews r GROUP BY day ORDER BY day DESC LIMIT 30`,
    ),
    db.prepare(`SELECT COUNT(DISTINCT ${TR_DAY}) AS n FROM reviews r`),
  ]);
  const totalDays = Number((total.results[0] as { n: number }).n ?? 0);
  return {
    weekly: (weekly.results as unknown as WeeklyRow[]).map((w) => ({ ...weeklySummary(w), range: dateRange(w.start_date, w.issue_date) })),
    days: (days.results as unknown as { day: string; n: number; pc: number; lead: string }[]).map((d, i) => ({ ...d, number: totalDays - i })),
  };
};
