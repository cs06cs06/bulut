import { error } from '@sveltejs/kit';
import { SOURCE_NAME } from '$lib/server/sources';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [sources, runs, cost, events, counts] = await db.batch([
    db.prepare(`SELECT source, last_success_at, last_attempt_at, last_error, backfill_cursor FROM source_state ORDER BY source`),
    db.prepare(`SELECT kind, started_at, finished_at, status FROM runs ORDER BY id DESC LIMIT 6`),
    db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM ai_usage WHERE created_at >= ?1`).bind(monthStart),
    db
      .prepare(`SELECT level, source, message, created_at FROM run_events WHERE level IN ('warn','error') ORDER BY id DESC LIMIT 8`),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM reviews) AS reviews,
              (SELECT COUNT(*) FROM works WHERE status IN ('new','triage_pending')) AS pending,
              (SELECT MAX(id) FROM works) AS works`,
    ),
  ]);

  return {
    sources: (
      (sources.results ?? []) as {
        source: string;
        last_success_at: string | null;
        last_attempt_at: string | null;
        last_error: string | null;
        backfill_cursor: string | null;
      }[]
    )
      .filter((x) => SOURCE_NAME[x.source]) // yapılandırmadan kaldırılan/kapatılan kaynaklar gösterilmez
      .map((x) => ({ ...x, name: SOURCE_NAME[x.source] }))
      .sort((a, b) => (a.source === 'pubmed' ? -1 : b.source === 'pubmed' ? 1 : a.name.localeCompare(b.name, 'tr'))),
    runs: (runs.results ?? []) as { kind: string; started_at: string; finished_at: string | null; status: string }[],
    monthCost: Number((cost.results?.[0] as { usd: number } | undefined)?.usd ?? 0),
    events: (events.results ?? []) as { level: string; source: string | null; message: string; created_at: string }[],
    counts: (counts.results?.[0] ?? { reviews: 0, pending: 0, works: 0 }) as { reviews: number; pending: number; works: number },
  };
};
