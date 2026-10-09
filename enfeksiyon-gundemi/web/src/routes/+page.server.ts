import { error } from '@sveltejs/kit';
import { CARD_SELECT, reviewFilter, toCard } from '$lib/server/reviews';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const f = url.searchParams.get('f');
  const filter = reviewFilter(f);

  const [hero, list, topics] = await db.batch([
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
    topicChips: [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([kod]) => kod),
  };
};
