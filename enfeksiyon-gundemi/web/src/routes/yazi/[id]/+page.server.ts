import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export interface ReviewBody {
  before: string;
  after: string;
  in_practice: string;
  evidence: { design: string; results: string; maturity: string };
  limitations: string;
  funding_coi: string;
  context: string;
  related_review_ids: number[];
  turkey: string;
  guideline_changes: { before: string; after: string; significance: string }[];
  guideline_key_points: string[];
}

export const load: PageServerLoad = async ({ platform, params }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const id = Number(params.id);
  if (!Number.isInteger(id)) error(404, 'Yazı bulunamadı');

  const row = await db
    .prepare(
      `SELECT r.work_id AS id, r.impact, r.title_tr, r.hook, r.body, r.basis, r.model, r.created_at, r.topics,
              w.title, w.authors, w.journal, w.journal_abbr, w.pub_date, w.doi, w.pmid, w.pmcid, w.is_preprint, w.pub_types,
              rs.read_at, rs.saved_at
       FROM reviews r JOIN works w ON w.id = r.work_id
       LEFT JOIN reading_state rs ON rs.work_id = r.work_id
       WHERE r.work_id = ?1`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) error(404, 'Yazı bulunamadı');

  const body = JSON.parse(String(row.body)) as ReviewBody;
  const relatedIds = (body.related_review_ids ?? []).filter(Number.isInteger).slice(0, 10);
  const related = relatedIds.length
    ? (
        await db
          .prepare(
            `SELECT id, work_id, title_tr FROM reviews WHERE id IN (${relatedIds.map((_, i) => `?${i + 1}`).join(',')})`,
          )
          .bind(...relatedIds)
          .all<{ id: number; work_id: number; title_tr: string }>()
      ).results
    : [];

  return { review: row, body, related };
};
