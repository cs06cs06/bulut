// Soru hazırlığı: sohbeti açar, (genel sorularda) arşivde arar, soruyu ve bulunan kaynakları kaydeder.
// Gövde: { soru: string, sohbet?: number, yazi?: number }
import { error, json } from '@sveltejs/kit';
import { PLAN_SYSTEM, QA, budgetLeft, client, loadSources, recordUsage, searchWorks, sourceCard } from '$lib/server/qa';
import type { RequestHandler } from './$types';

const NOT_FOUND =
  'Arşivde bu soruyla ilgili yayın bulamadım. Soruyu farklı kelimelerle (ör. etken, ilaç ya da hastalık adıyla) yeniden sormayı deneyebilirsiniz.';

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    terms: { type: 'array', items: { type: 'string' } },
    since: { type: 'string', description: 'YYYY-MM-DD ya da boş metin' },
  },
  required: ['terms', 'since'],
  additionalProperties: false,
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;
  const db = env?.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const body = (await request.json().catch(() => null)) as { soru?: unknown; sohbet?: unknown; yazi?: unknown } | null;
  const question = typeof body?.soru === 'string' ? body.soru.trim() : '';
  if (question.length < 3 || question.length > 2000) error(400, 'Soru 3–2000 karakter arasında olmalı.');
  if ((await budgetLeft(db)) <= 0) error(429, 'Bu ayın yapay zekâ bütçesi doldu; yeni soru ay başında sorulabilir.');

  const now = new Date().toISOString();
  let chatId = Number(body?.sohbet) || 0;
  let workId: number | null = null;
  let previousQuestion: string | null = null;

  if (chatId) {
    const chat = await db.prepare(`SELECT id, work_id FROM chats WHERE id = ?1`).bind(chatId).first<{ id: number; work_id: number | null }>();
    if (!chat) error(404, 'Sohbet bulunamadı.');
    workId = chat.work_id;
    const turns = await db
      .prepare(`SELECT content, role FROM chat_messages WHERE chat_id = ?1 ORDER BY id DESC`)
      .bind(chatId)
      .all<{ content: string; role: string }>();
    const userTurns = turns.results.filter((t) => t.role === 'user');
    if (userTurns.length >= QA.max_turns) error(400, 'Bu sohbet çok uzadı; lütfen yeni bir sohbet başlatın.');
    // Yanıtı yarıda kalmış bir soru varsa yeni soru sorulmadan önce o tamamlanmalı
    if (turns.results[0]?.role === 'user') error(409, 'Önceki sorunun yanıtı henüz kaydedilmedi; sayfayı yenileyin.');
    previousQuestion = userTurns[0]?.content ?? null;
  } else {
    const yazi = Number(body?.yazi) || 0;
    if (yazi) {
      const w = await db.prepare(`SELECT id FROM works WHERE id = ?1`).bind(yazi).first<{ id: number }>();
      if (!w) error(404, 'Yayın bulunamadı.');
      workId = yazi;
    }
    const res = await db
      .prepare(`INSERT INTO chats (work_id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?3) RETURNING id`)
      .bind(workId, question.slice(0, 120), now)
      .first<{ id: number }>();
    chatId = res!.id;
  }

  // Kaynaklar: makale sohbetinde yayının kendisi, genel soruda arşiv araması
  let sourceIds: number[] = [];
  if (workId) {
    sourceIds = [workId];
  } else {
    const today = now.slice(0, 10);
    let terms: string[] = [];
    let since: string | null = null;
    try {
      const msg = await client(env.ANTHROPIC_API_KEY, env.ANTHROPIC_BASE_URL).messages.create({
        model: QA.plan_model,
        max_tokens: 2000,
        system: PLAN_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Bugünün tarihi: ${today}\n${previousQuestion ? `Önceki soru: ${previousQuestion}\n` : ''}Soru: ${question}`,
          },
        ],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      });
      await recordUsage(db, msg.model, msg.usage);
      const text = msg.content.find((b) => b.type === 'text');
      if (msg.stop_reason !== 'refusal' && text?.type === 'text') {
        const plan = JSON.parse(text.text) as { terms?: unknown; since?: unknown };
        if (Array.isArray(plan.terms)) terms = plan.terms.filter((t): t is string => typeof t === 'string');
        if (typeof plan.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(plan.since)) since = plan.since;
      }
    } catch (e) {
      console.error('Arama planı hazırlanamadı', e);
    }
    // Plan çıkarılamazsa sorunun kendi kelimeleriyle aranır
    if (!terms.length) terms = question.split(/\s+/).filter((w) => w.length >= 4);
    sourceIds = (await searchWorks(db, terms, since, QA.max_sources)).map((r) => r.id);
  }

  const userMsg = await db
    .prepare(`INSERT INTO chat_messages (chat_id, role, content, sources, created_at) VALUES (?1, 'user', ?2, ?3, ?4) RETURNING id`)
    .bind(chatId, question, JSON.stringify(sourceIds), now)
    .first<{ id: number }>();
  await db.prepare(`UPDATE chats SET updated_at = ?1 WHERE id = ?2`).bind(now, chatId).run();

  if (!sourceIds.length) {
    await db
      .prepare(`INSERT INTO chat_messages (chat_id, role, content, status, created_at) VALUES (?1, 'assistant', ?2, 'not_found', ?3)`)
      .bind(chatId, NOT_FOUND, now)
      .run();
    return json({ sohbet: chatId, mesaj: userMsg!.id, kaynaklar: [], yanit: NOT_FOUND });
  }

  const sources = await loadSources(db, sourceIds);
  return json({ sohbet: chatId, mesaj: userMsg!.id, kaynaklar: sources.map(sourceCard) });
};
