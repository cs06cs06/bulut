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
  relations?: { review_id: number; relation: string; note: string }[];
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
      `SELECT r.work_id AS id, r.id AS review_id, r.impact, r.title_tr, r.hook, r.body, r.basis, r.model, r.created_at, r.topics,
              w.title, w.authors, w.journal, w.journal_abbr, w.pub_date, w.doi, w.pmid, w.pmcid, w.url, w.is_preprint, w.pub_types, w.kind,
              rs.read_at, rs.saved_at,
              l.id AS linked_id, l.is_preprint AS linked_is_preprint, COALESCE(l.journal_abbr, l.journal) AS linked_journal,
              l.doi AS linked_doi, l.pmid AS linked_pmid, l.url AS linked_url, lr.work_id AS linked_review
       FROM reviews r JOIN works w ON w.id = r.work_id
       LEFT JOIN reading_state rs ON rs.work_id = r.work_id
       LEFT JOIN works l ON l.id = w.linked_work_id
       LEFT JOIN reviews lr ON lr.work_id = l.id
       WHERE r.work_id = ?1`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) error(404, 'Yazı bulunamadı');

  const body = JSON.parse(String(row.body)) as ReviewBody;
  const reviewId = Number(row.review_id);

  // Bu yazının önceki yazılarla ilişkileri ve sonradan bu yazıya bağlanan yazılar
  const [out, back] = await db.batch([
    db
      .prepare(
        `SELECT l.relation, l.note, r.work_id, r.title_tr, r.created_at FROM review_links l JOIN reviews r ON r.id = l.dst_review_id
         WHERE l.src_review_id = ?1 ORDER BY r.created_at DESC`,
      )
      .bind(reviewId),
    db
      .prepare(
        `SELECT l.relation, l.note, r.work_id, r.title_tr, r.created_at FROM review_links l JOIN reviews r ON r.id = l.src_review_id
         WHERE l.dst_review_id = ?1 ORDER BY r.created_at DESC LIMIT 10`,
      )
      .bind(reviewId),
  ]);
  type Link = { relation: string | null; note: string | null; work_id: number; title_tr: string; created_at: string };
  let related = out.results as unknown as Link[];
  // Eski yazılar (ilişki türü olmadan): yalnızca kimlik listesi
  const oldIds = (body.related_review_ids ?? []).filter(Number.isInteger).slice(0, 10);
  if (!related.length && oldIds.length) {
    related = (
      await db
        .prepare(`SELECT NULL AS relation, NULL AS note, work_id, title_tr, created_at FROM reviews WHERE id IN (${oldIds.map((_, i) => `?${i + 1}`).join(',')})`)
        .bind(...oldIds)
        .all<Link>()
    ).results;
  }

  return { review: row, body, related, later: back.results as unknown as Link[] };
};
