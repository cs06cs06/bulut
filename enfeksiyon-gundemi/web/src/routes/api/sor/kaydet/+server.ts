// Akış bittiğinde tarayıcının gönderdiği yanıt metnini ve kullanım bilgisini kaydeder.
// Gövde: { mesaj: number, metin: string, durum: 'ok'|'refused'|'incomplete', model: string, usage: {...} }
import { error, json } from '@sveltejs/kit';
import { recordUsage, type UsageIn } from '$lib/server/qa';
import type { RequestHandler } from './$types';

const STATUSES = new Set(['ok', 'refused', 'incomplete']);

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const body = (await request.json().catch(() => null)) as {
    mesaj?: unknown;
    metin?: unknown;
    durum?: unknown;
    model?: unknown;
    usage?: unknown;
  } | null;
  const msgId = Number(body?.mesaj);
  if (!Number.isInteger(msgId) || msgId <= 0) error(400, 'Geçersiz soru kimliği');
  const status = typeof body?.durum === 'string' && STATUSES.has(body.durum) ? body.durum : 'incomplete';
  const text = typeof body?.metin === 'string' ? body.metin.slice(0, 100_000) : '';
  const model = typeof body?.model === 'string' && /^[a-z0-9.-]{3,60}$/.test(body.model) ? body.model : null;

  const m = await db
    .prepare(
      `SELECT m.chat_id, (SELECT MAX(id) FROM chat_messages WHERE chat_id = m.chat_id) AS last_id
       FROM chat_messages m WHERE m.id = ?1 AND m.role = 'user'`,
    )
    .bind(msgId)
    .first<{ chat_id: number; last_id: number }>();
  if (!m) error(404, 'Soru bulunamadı.');
  if (m.last_id !== msgId) error(409, 'Bu soru zaten yanıtlanmış.');

  const content = text.trim() || (status === 'refused' ? 'Bu soru yanıtlanamadı (güvenlik filtresi).' : 'Yanıt alınamadı.');
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(`INSERT INTO chat_messages (chat_id, role, content, status, created_at) VALUES (?1, 'assistant', ?2, ?3, ?4)`)
      .bind(m.chat_id, content, status, now),
    db.prepare(`UPDATE chats SET updated_at = ?1 WHERE id = ?2`).bind(now, m.chat_id),
  ]);
  if (model && body?.usage && typeof body.usage === 'object') await recordUsage(db, model, body.usage as UsageIn);
  return json({ ok: true });
};
