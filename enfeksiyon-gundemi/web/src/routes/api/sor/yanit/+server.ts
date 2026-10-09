// Yanıt akışı: sohbet geçmişi ve kaynaklarla modele sorar, yanıtı olay akışı (SSE) olarak
// doğrudan tarayıcıya aktarır. Yanıt bitince tarayıcı metni /api/sor/kaydet ile kaydeder.
// (Akışı sunucuda çözümlemek ücretsiz katmanın işlemci süresi sınırını zorlayabilir.)
// Gövde: { mesaj: number }  — /api/sor/hazirla'nın döndürdüğü soru kimliği
import { error } from '@sveltejs/kit';
import type Anthropic from '@anthropic-ai/sdk';
import { QA, QA_SYSTEM, articleBlock, budgetLeft, client, loadSources, sourcesBlock } from '$lib/server/qa';
import type { RequestHandler } from './$types';

type Block = Anthropic.Beta.Messages.BetaTextBlockParam;

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;
  const db = env?.DB;
  if (!db) error(500, 'Veritabanı bağlantısı yok.');
  const body = (await request.json().catch(() => null)) as { mesaj?: unknown } | null;
  const msgId = Number(body?.mesaj);
  if (!Number.isInteger(msgId) || msgId <= 0) error(400, 'Geçersiz soru kimliği');
  if ((await budgetLeft(db)) <= 0) error(429, 'Bu ayın yapay zekâ bütçesi doldu.');

  const target = await db
    .prepare(`SELECT m.chat_id, c.work_id FROM chat_messages m JOIN chats c ON c.id = m.chat_id WHERE m.id = ?1 AND m.role = 'user'`)
    .bind(msgId)
    .first<{ chat_id: number; work_id: number | null }>();
  if (!target) error(404, 'Soru bulunamadı.');
  const history = (
    await db
      .prepare(`SELECT id, role, content, sources FROM chat_messages WHERE chat_id = ?1 ORDER BY id`)
      .bind(target.chat_id)
      .all<{ id: number; role: string; content: string; sources: string | null }>()
  ).results;
  if (history[history.length - 1]?.id !== msgId) error(409, 'Bu soru zaten yanıtlanmış.');

  // Geçmiş aynı sırayla yeniden kurulur: önbellek (prompt caching) önceki turları yeniden kullanır
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [];
  const article = target.work_id ? await articleBlock(db, target.work_id) : null;
  if (target.work_id && !article) error(404, 'Yayın bulunamadı.');
  for (const [i, m] of history.entries()) {
    if (m.role === 'assistant') {
      messages.push({ role: 'assistant', content: m.content });
      continue;
    }
    const blocks: Block[] = [];
    if (article && i === 0) blocks.push({ type: 'text', text: article });
    if (!article) {
      const ids = (JSON.parse(m.sources ?? '[]') as unknown[]).map(Number).filter(Number.isInteger);
      blocks.push({ type: 'text', text: sourcesBlock(await loadSources(db, ids)) });
    }
    blocks.push({ type: 'text', text: `Soru: ${m.content}` });
    messages.push({ role: 'user', content: blocks });
  }
  const last = messages[messages.length - 1].content as Block[];
  last[last.length - 1].cache_control = { type: 'ephemeral' };

  let upstream: Response;
  try {
    upstream = await client(env.ANTHROPIC_API_KEY, env.ANTHROPIC_BASE_URL)
      .beta.messages.create({
        model: QA.model,
        max_tokens: QA.max_tokens,
        system: QA_SYSTEM,
        messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: QA.effort },
        stream: true,
        // Güvenlik filtresi reddederse Anthropic'in önerdiği yedek modelle aynı akışta yeniden dener
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
      .asResponse();
  } catch (e) {
    console.error('Yanıt başlatılamadı', e);
    error(502, 'Yapay zekâ hizmetine ulaşılamadı; biraz sonra yeniden deneyin.');
  }
  return new Response(upstream.body, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' },
  });
};
