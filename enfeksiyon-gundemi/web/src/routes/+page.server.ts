import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export interface ReviewCard {
  id: number;
  impact: string;
  title_tr: string;
  hook: string;
  created_at: string;
  journal: string | null;
  journal_abbr: string | null;
  pub_date: string | null;
  is_preprint: number;
}

export interface NoteCard {
  id: number;
  title: string;
  title_tr: string | null;
  summary_tr: string;
  importance: number;
  journal_abbr: string | null;
  journal: string | null;
  pub_date: string | null;
  pmid: string | null;
  doi: string | null;
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');

  const [reviews, notes, issues, lastRuns] = await db.batch([
    db.prepare(
      `SELECT r.work_id AS id, r.impact, r.title_tr, r.hook, r.created_at, w.journal, w.journal_abbr, w.pub_date, w.is_preprint
       FROM reviews r JOIN works w ON w.id = r.work_id
       ORDER BY r.created_at DESC,
                CASE r.impact WHEN 'practice_changing' THEN 0 WHEN 'important' THEN 1 ELSE 2 END
       LIMIT 40`,
    ),
    db.prepare(
      `SELECT w.id, w.title, t.title_tr, t.summary_tr, t.importance, w.journal_abbr, w.journal, w.pub_date, w.pmid, w.doi
       FROM triage t JOIN works w ON w.id = t.work_id
       WHERE t.relevant = 1 AND t.importance >= 3 AND t.summary_tr IS NOT NULL AND w.status != 'reviewed'
       ORDER BY t.created_at DESC, t.importance DESC
       LIMIT 40`,
    ),
    db.prepare(
      `SELECT level, message, created_at FROM run_events
       WHERE level IN ('warn','error') AND created_at >= ?1 ORDER BY id DESC LIMIT 5`,
    ).bind(new Date(Date.now() - 2 * 864e5).toISOString()),
    db.prepare(
      `SELECT kind, MAX(finished_at) AS finished_at FROM runs WHERE status IN ('ok','partial') GROUP BY kind`,
    ),
  ]);

  return {
    reviews: (reviews.results ?? []) as unknown as ReviewCard[],
    notes: (notes.results ?? []) as unknown as NoteCard[],
    issues: (issues.results ?? []) as { level: string; message: string; created_at: string }[],
    lastRuns: Object.fromEntries(
      ((lastRuns.results ?? []) as { kind: string; finished_at: string }[]).map((r) => [r.kind, r.finished_at]),
    ),
  };
};
