import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export interface WorkRow {
  id: number;
  pmid: string | null;
  doi: string | null;
  title: string;
  journal: string | null;
  journal_abbr: string | null;
  journal_tier: number | null;
  pub_date: string | null;
  pub_types: string | null;
  kind: string;
  is_preprint: number;
  status: string;
  title_tr: string | null;
  importance: number | null;
}

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');

  const tier = url.searchParams.get('katman');
  const page = Math.max(0, Number(url.searchParams.get('sayfa') ?? 0) || 0);
  const tierFilter = tier === '1' || tier === '2' ? Number(tier) : null;

  const listSql = `SELECT w.id, w.pmid, w.doi, w.title, w.journal, w.journal_abbr, w.journal_tier, w.pub_date, w.pub_types,
                          w.kind, w.is_preprint, w.status, t.title_tr, t.importance
                   FROM works w LEFT JOIN triage t ON t.work_id = w.id ${tierFilter ? 'WHERE w.journal_tier = ?1' : ''}
                   ORDER BY w.first_seen_at DESC, w.id DESC LIMIT ${PAGE_SIZE + 1} OFFSET ${page * PAGE_SIZE}`;
  const listStmt = tierFilter ? db.prepare(listSql).bind(tierFilter) : db.prepare(listSql);

  const [list, lastRun, sourceState, total, issues] = await db.batch([
    listStmt,
    db.prepare(`SELECT id, started_at, finished_at, status FROM runs WHERE kind = 'collect' ORDER BY id DESC LIMIT 1`),
    db.prepare(`SELECT source, last_success_at, synced_until, backfill_cursor, last_error FROM source_state`),
    db.prepare(`SELECT MAX(id) AS n FROM works`),
    db.prepare(
      `SELECT e.level, e.source, e.message, e.created_at FROM run_events e
       WHERE e.level IN ('warn','error') AND e.created_at >= ?1 ORDER BY e.id DESC LIMIT 5`,
    ).bind(new Date(Date.now() - 3 * 864e5).toISOString()),
  ]);

  const works = (list.results ?? []) as unknown as WorkRow[];
  return {
    works: works.slice(0, PAGE_SIZE),
    hasMore: works.length > PAGE_SIZE,
    page,
    tier: tierFilter,
    lastRun: (lastRun.results?.[0] ?? null) as { started_at: string; finished_at: string | null; status: string } | null,
    sources: (sourceState.results ?? []) as {
      source: string;
      last_success_at: string | null;
      synced_until: string | null;
      backfill_cursor: string | null;
      last_error: string | null;
    }[],
    total: Number((total.results?.[0] as { n: number | null } | undefined)?.n ?? 0),
    issues: (issues.results ?? []) as { level: string; source: string | null; message: string; created_at: string }[],
  };
};
