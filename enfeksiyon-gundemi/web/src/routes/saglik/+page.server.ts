import { error } from '@sveltejs/kit';
import { fullHealth } from '$lib/server/health';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, depends }) => {
  depends('app:durum');
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  return { health: await fullHealth(db) };
};
