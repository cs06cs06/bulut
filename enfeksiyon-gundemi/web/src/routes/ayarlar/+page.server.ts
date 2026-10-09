import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [cost, counts] = await db.batch([
    db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM ai_usage WHERE created_at >= ?1`).bind(monthStart),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM reviews) AS reviews,
              (SELECT COUNT(*) FROM works WHERE status IN ('new','triage_pending')) AS pending,
              (SELECT MAX(id) FROM works) AS works`,
    ),
  ]);

  return {
    monthCost: Number((cost.results?.[0] as { usd: number } | undefined)?.usd ?? 0),
    counts: (counts.results?.[0] ?? { reviews: 0, pending: 0, works: 0 }) as { reviews: number; pending: number; works: number },
  };
};
