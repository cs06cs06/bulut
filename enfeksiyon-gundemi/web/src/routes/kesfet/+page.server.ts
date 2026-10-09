import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export interface NoteRow {
  id: number;
  title: string;
  title_tr: string | null;
  summary_tr: string | null;
  importance: number;
  journal: string | null;
  pub_date: string | null;
  pmid: string | null;
  doi: string | null;
  url: string | null;
  kind: string;
  is_preprint: number;
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const f = url.searchParams.get('f');
  const topic = f?.startsWith('konu:') ? f.slice(5) : null;

  const like = `%${likeEscape(q)}%`;
  const noteTopic = topic && /^[a-z_]+$/.test(topic) ? `%"${topic}"%` : '%';
  const preprintOnly = f === 'onbaski' ? 1 : 0;
  const agencyOnly = f === 'kurum' ? 1 : 0;
  // Gözden kaçmasın: triyaj düşük puan verse de güçlü kaynaktan gelen yayınlar (son 14 gün)
  const safetyNet = f === 'gozden';
  const SAFETY = `AND t.importance <= 3 AND w.first_seen_at >= '${new Date(Date.now() - 14 * 864e5).toISOString()}'
    AND (w.journal_tier = 1 OR w.kind = 'guideline' OR w.pub_types LIKE '%Guideline%' OR w.pub_types LIKE '%Consensus%'
         OR w.pub_types LIKE '%Randomized Controlled Trial%' OR w.pub_types LIKE '%Meta-Analysis%')`;

  const notes = await db
      .prepare(
        `SELECT w.id, w.title, t.title_tr, t.summary_tr, t.importance, COALESCE(w.journal_abbr, w.journal) AS journal,
                w.pub_date, w.pmid, w.doi, w.url, w.kind, w.is_preprint
         FROM triage t JOIN works w ON w.id = t.work_id
         WHERE t.relevant = 1 AND w.status != 'reviewed' AND t.importance >= ?1
           AND COALESCE(t.topics, '') LIKE ?2 AND (?3 = 0 OR w.is_preprint = 1) AND (?4 = 0 OR w.kind IN ('report', 'guideline'))
           AND NOT (w.is_preprint = 1 AND w.linked_work_id IS NOT NULL)
           ${safetyNet ? SAFETY : ''}
           ${q ? `AND (t.title_tr LIKE ?5 ESCAPE '\\' OR t.summary_tr LIKE ?5 ESCAPE '\\' OR w.title LIKE ?5 ESCAPE '\\')` : ''}
         ORDER BY t.created_at DESC, t.importance DESC LIMIT 50`,
      )
      .bind(safetyNet ? 1 : q ? 2 : 3, noteTopic, preprintOnly, agencyOnly, ...(q ? [like] : []))
      .all();

  return {
    q,
    f,
    notes: (notes.results ?? []) as unknown as NoteRow[],
  };
};
