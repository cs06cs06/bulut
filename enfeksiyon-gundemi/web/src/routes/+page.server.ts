import { error } from '@sveltejs/kit';
import { CARD_SELECT, reviewFilter, toCard } from '$lib/server/reviews';
import type { PageServerLoad } from './$types';

export interface NoteCard {
  id: number;
  title: string;
  title_tr: string | null;
  summary_tr: string;
  journal: string | null;
  pub_date: string | null;
  pmid: string | null;
  doi: string | null;
}

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const f = url.searchParams.get('f');
  const filter = reviewFilter(f);

  const [hero, list, notes, topics] = await db.batch([
    // Günün önemli gelişmeleri: son 4 günün "pratiği değiştirebilir" ve "önemli" yazıları, okunmamışlar önde
    db.prepare(
      `${CARD_SELECT}
       WHERE r.impact IN ('practice_changing','important') AND r.created_at >= ?1
       ORDER BY (rs.read_at IS NOT NULL), CASE r.impact WHEN 'practice_changing' THEN 0 ELSE 1 END, r.created_at DESC
       LIMIT 6`,
    ).bind(new Date(Date.now() - 4 * 864e5).toISOString()),
    db.prepare(
      `${CARD_SELECT} WHERE ${filter.where}
       ORDER BY (rs.read_at IS NOT NULL), r.created_at DESC,
                CASE r.impact WHEN 'practice_changing' THEN 0 WHEN 'important' THEN 1 ELSE 2 END
       LIMIT 40`,
    ).bind(...filter.params),
    db.prepare(
      `SELECT w.id, w.title, t.title_tr, t.summary_tr, COALESCE(w.journal_abbr, w.journal) AS journal, w.pub_date, w.pmid, w.doi
       FROM triage t JOIN works w ON w.id = t.work_id
       WHERE t.relevant = 1 AND t.importance >= 3 AND t.summary_tr IS NOT NULL AND w.status != 'reviewed'
       ORDER BY t.created_at DESC, t.importance DESC LIMIT 5`,
    ),
    // Yazılarda geçen konular (çipler için)
    db.prepare(`SELECT topics FROM reviews ORDER BY created_at DESC LIMIT 200`),
  ]);

  const used = new Map<string, number>();
  for (const r of (topics.results ?? []) as { topics: string | null }[]) {
    try {
      for (const t of JSON.parse(r.topics ?? '[]') as string[]) used.set(t, (used.get(t) ?? 0) + 1);
    } catch {
      /* boş */
    }
  }

  const heroCards = (hero.results ?? []).map(toCard);
  const heroIds = new Set(heroCards.map((c) => c.id));
  return {
    f,
    hero: f ? [] : heroCards,
    list: (list.results ?? []).map(toCard).filter((c) => f || !heroIds.has(c.id)),
    notes: f ? [] : ((notes.results ?? []) as unknown as NoteCard[]),
    topicChips: [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([kod]) => kod),
  };
};
