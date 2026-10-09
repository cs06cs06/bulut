// Okundu / kaydet durumunu günceller. Gövde: { id: number, read?: boolean, saved?: boolean }
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const body = (await request.json().catch(() => null)) as { id?: unknown; read?: unknown; saved?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) error(400, 'Geçersiz kimlik');

  const now = new Date().toISOString();
  const read = typeof body?.read === 'boolean' ? (body.read ? now : null) : undefined;
  const saved = typeof body?.saved === 'boolean' ? (body.saved ? now : null) : undefined;
  if (read === undefined && saved === undefined) error(400, 'Değişiklik yok');

  // Okundu bilgisi bir kez yazılır (ilk okuma zamanı korunur)
  await db
    .prepare(
      `INSERT INTO reading_state (work_id, read_at, saved_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (work_id) DO UPDATE SET
         read_at  = CASE WHEN ?4 THEN COALESCE(reading_state.read_at, excluded.read_at) ELSE reading_state.read_at END,
         saved_at = CASE WHEN ?5 THEN excluded.saved_at ELSE reading_state.saved_at END`,
    )
    .bind(id, read ?? null, saved ?? null, read !== undefined ? 1 : 0, saved !== undefined ? 1 : 0)
    .run();
  return json({ ok: true });
};
