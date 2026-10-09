import { error } from '@sveltejs/kit';
import { CARD_SELECT, reviewFilter, toCard } from '$lib/server/reviews';
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
  is_preprint: number;
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const f = url.searchParams.get('f');
  const filter = reviewFilter(f);
  const topic = f?.startsWith('konu:') ? f.slice(5) : null;

  const like = `%${likeEscape(q)}%`;
  const noteTopic = topic && /^[a-z_]+$/.test(topic) ? `%"${topic}"%` : '%';
  const preprintOnly = f === 'onbaski' ? 1 : 0;

  const [reviews, notes] = await db.batch([
    q || f
      ? db
          .prepare(
            `${CARD_SELECT}
             WHERE ${filter.where} ${q ? `AND (r.title_tr LIKE ? ESCAPE '\\' OR r.hook LIKE ? ESCAPE '\\' OR w.title LIKE ? ESCAPE '\\')` : ''}
             ORDER BY r.created_at DESC LIMIT 40`,
          )
          .bind(...filter.params, ...(q ? [like, like, like] : []))
      : db.prepare(`${CARD_SELECT} WHERE 0`),
    db
      .prepare(
        `SELECT w.id, w.title, t.title_tr, t.summary_tr, t.importance, COALESCE(w.journal_abbr, w.journal) AS journal,
                w.pub_date, w.pmid, w.doi, w.is_preprint
         FROM triage t JOIN works w ON w.id = t.work_id
         WHERE t.relevant = 1 AND w.status != 'reviewed' AND t.importance >= ?1
           AND COALESCE(t.topics, '') LIKE ?2 AND (?3 = 0 OR w.is_preprint = 1)
           ${q ? `AND (t.title_tr LIKE ?4 ESCAPE '\\' OR t.summary_tr LIKE ?4 ESCAPE '\\' OR w.title LIKE ?4 ESCAPE '\\')` : ''}
         ORDER BY t.created_at DESC, t.importance DESC LIMIT 50`,
      )
      .bind(q ? 2 : 3, noteTopic, preprintOnly, ...(q ? [like] : [])),
  ]);

  return {
    q,
    f,
    reviews: (reviews.results ?? []).map(toCard),
    notes: (notes.results ?? []) as unknown as NoteRow[],
  };
};
