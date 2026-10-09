import { error } from '@sveltejs/kit';
import { loadSources, sourceCard, type SourceCard } from '$lib/server/qa';
import type { PageServerLoad } from './$types';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  status: string | null;
  sources: SourceCard[];
}

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = platform?.env.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const chatParam = Number(url.searchParams.get('sohbet')) || 0;
  const workParam = Number(url.searchParams.get('yazi')) || 0;

  // Makale sayfasından gelindiyse o makalenin son sohbeti açılır
  const chat = chatParam
    ? await db.prepare(`SELECT id, work_id, title FROM chats WHERE id = ?1`).bind(chatParam).first<{ id: number; work_id: number | null; title: string }>()
    : workParam && url.searchParams.get('yeni') !== '1'
      ? await db
          .prepare(`SELECT id, work_id, title FROM chats WHERE work_id = ?1 ORDER BY updated_at DESC LIMIT 1`)
          .bind(workParam)
          .first<{ id: number; work_id: number | null; title: string }>()
      : null;
  if (chatParam && !chat) error(404, 'Sohbet bulunamadı');

  const workId = chat?.work_id ?? (workParam || null);
  const work = workId
    ? await db
        .prepare(
          `SELECT w.id, COALESCE(r.title_tr, t.title_tr, w.title) AS title, (r.work_id IS NOT NULL) AS reviewed
           FROM works w LEFT JOIN reviews r ON r.work_id = w.id LEFT JOIN triage t ON t.work_id = w.id WHERE w.id = ?1`,
        )
        .bind(workId)
        .first<{ id: number; title: string; reviewed: number }>()
    : null;
  if (workId && !work) error(404, 'Yayın bulunamadı');

  const messages: ChatMessage[] = [];
  if (chat) {
    const rows = (
      await db
        .prepare(`SELECT id, role, content, status, sources FROM chat_messages WHERE chat_id = ?1 ORDER BY id`)
        .bind(chat.id)
        .all<{ id: number; role: 'user' | 'assistant'; content: string; status: string | null; sources: string | null }>()
    ).results;
    const ids = [...new Set(rows.flatMap((r) => (JSON.parse(r.sources ?? '[]') as number[]).map(Number)))].slice(0, 90);
    const cards = new Map((await loadSources(db, ids)).map((s) => [s.id, sourceCard(s)]));
    for (const r of rows) {
      const src = (JSON.parse(r.sources ?? '[]') as number[]).map((id) => cards.get(Number(id))).filter((c): c is SourceCard => !!c);
      messages.push({ id: r.id, role: r.role, content: r.content, status: r.status, sources: src });
    }
  }

  const recent =
    !chat && !workId
      ? (
          await db
            .prepare(
              `SELECT c.id, c.title, c.updated_at, c.work_id, COALESCE(r.title_tr, t.title_tr, w.title) AS work_title
               FROM chats c LEFT JOIN works w ON w.id = c.work_id LEFT JOIN reviews r ON r.work_id = c.work_id
               LEFT JOIN triage t ON t.work_id = c.work_id
               ORDER BY c.updated_at DESC LIMIT 20`,
            )
            .all<{ id: number; title: string; updated_at: string; work_id: number | null; work_title: string | null }>()
        ).results
      : [];

  return { chat: chat ? { id: chat.id } : null, work, messages, recent };
};
