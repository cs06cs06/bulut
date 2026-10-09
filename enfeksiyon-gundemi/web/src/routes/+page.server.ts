import { error } from '@sveltejs/kit';
import { TR_DAY, dateRange, weeklySummary, type WeeklyRow } from '$lib/server/issues';
import { CARD_SELECT, reviewFilter, toCard } from '$lib/server/reviews';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const f = url.searchParams.get('f');
  const filter = reviewFilter(f);

  const [hero, list, topics, weekly, edition] = await db.batch([
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
    // Son 7 günde hazırlanan haftalık baskı
    db
      .prepare(`SELECT id, issue_date, start_date, title, body, review_ids FROM issues WHERE kind = 'weekly' AND created_at >= ?1 ORDER BY issue_date DESC LIMIT 1`)
      .bind(new Date(Date.now() - 7 * 864e5).toISOString()),
    // Günlük baskı numarası: yazı yayımlanan gün sayısı
    db.prepare(`SELECT COUNT(DISTINCT ${TR_DAY}) AS n, MAX(${TR_DAY}) AS last FROM reviews r`),
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
  const w = (weekly.results?.[0] as WeeklyRow | undefined) ?? null;
  const ed = edition.results?.[0] as { n: number; last: string | null } | undefined;
  return {
    f,
    weekly: w && !f ? { ...weeklySummary(w), range: dateRange(w.start_date, w.issue_date) } : null,
    edition: ed?.last ? { number: Number(ed.n), day: ed.last } : null,
    hero: f ? [] : heroCards,
    list: (list.results ?? []).map(toCard).filter((c) => f || !heroIds.has(c.id)),
    topicChips: [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([kod]) => kod),
  };
};
