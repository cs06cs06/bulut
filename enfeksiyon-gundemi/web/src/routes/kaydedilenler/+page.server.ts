import { error } from '@sveltejs/kit';
import { CARD_SELECT, toCard } from '$lib/server/reviews';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const res = await db.prepare(`${CARD_SELECT} WHERE rs.saved_at IS NOT NULL ORDER BY rs.saved_at DESC LIMIT 200`).all();
  return { cards: (res.results ?? []).map(toCard) };
};
