// Haftalık "öne çıkanlar" baskısı: her pazar (kaçarsa pazartesi) haftanın editör yazılarından
// en önemli üç gelişmeyi seçen kısa bir giriş yazısı hazırlanır. Tek bir model çağrısıdır.

import type Anthropic from '@anthropic-ai/sdk';
import type { AiClient } from '../ai/client.ts';
import type { UsageMeter } from '../ai/usage.ts';
import type { AiConfig } from '../lib/config.ts';
import type { Db } from '../lib/db.ts';
import type { RunLog } from '../lib/runlog.ts';

const TZ = 'Europe/Istanbul';
const DAY = 864e5;

/** Türkiye saatine göre gün (YYYY-AA-GG) */
export const trDay = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
const trWeekday = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);

/** Baskı günü: bugün pazarsa bugün, pazartesiyse dün; başka günlerde baskı hazırlanmaz */
export function issueDay(now: Date): string | null {
  const wd = trWeekday(now);
  if (wd === 'Sun') return trDay(now);
  if (wd === 'Mon') return trDay(new Date(now.getTime() - DAY));
  return null;
}

export const WEEKLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'intro', 'top'],
  properties: {
    title: { type: 'string' },
    intro: { type: 'string' },
    top: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['review_id', 'why'],
        properties: { review_id: { type: 'integer' }, why: { type: 'string' } },
      },
    },
  },
};

interface WeekReview {
  id: number;
  impact: string;
  title_tr: string;
  hook: string;
  after: string | null;
  in_practice: string | null;
  topics: string | null;
  journal: string | null;
  is_preprint: number;
}

const IMPACT_RANK: Record<string, number> = { practice_changing: 0, important: 1, informational: 2 };
const IMPACT_TR: Record<string, string> = { practice_changing: 'pratiği değiştirebilir', important: 'önemli', informational: 'bilgi için' };

export interface WeeklyDeps {
  db: Db;
  ai: AiClient;
  cfg: AiConfig;
  meter: UsageMeter;
  log: RunLog;
  prompt: string;
  now: Date;
  budgetLeft: () => Promise<number>;
}

/** Gerekiyorsa haftalık baskıyı hazırlar. Hazırlanan baskının kimliğini döndürür. */
export async function maybeWeekly(d: WeeklyDeps): Promise<number | null> {
  const day = issueDay(d.now);
  const wcfg = d.cfg.weekly;
  if (!day || !wcfg) return null;
  const exists = await d.db.all(`SELECT 1 FROM issues WHERE kind = 'weekly' AND issue_date = ?`, [day]);
  if (exists.length) return null;
  if ((await d.budgetLeft()) <= 0) return null;

  // Hafta: bir önceki haftalık baskıdan (yoksa son 7 günden) bu yana yazılanlar
  const prev = await d.db.all<{ created_at: string }>(`SELECT created_at FROM issues WHERE kind = 'weekly' ORDER BY issue_date DESC LIMIT 1`);
  const since = prev[0]?.created_at ?? new Date(d.now.getTime() - 7 * DAY).toISOString();
  const rows = await d.db.all<WeekReview>(
    `SELECT r.id, r.impact, r.title_tr, r.hook, json_extract(r.body, '$.after') AS after,
            json_extract(r.body, '$.in_practice') AS in_practice, r.topics,
            COALESCE(w.journal_abbr, w.journal) AS journal, w.is_preprint
     FROM reviews r JOIN works w ON w.id = r.work_id
     WHERE r.created_at > ? AND r.created_at <= ?
     ORDER BY r.created_at`,
    [since, d.now.toISOString()],
  );
  if (!rows.length) {
    await d.log.event('info', 'weekly', 'Bu hafta editör yazısı olmadığı için haftalık baskı hazırlanmadı.');
    return null;
  }
  const ordered = [...rows].sort((a, b) => (IMPACT_RANK[a.impact] ?? 3) - (IMPACT_RANK[b.impact] ?? 3));
  const start = trDay(new Date(Date.parse(`${day}T12:00:00Z`) - 6 * DAY));

  const list = ordered
    .map((r) =>
      [
        `[id ${r.id}] (${IMPACT_TR[r.impact] ?? r.impact}${r.is_preprint ? ', ÖN BASKI' : ''}${r.journal ? `, ${r.journal}` : ''}) ${r.title_tr}`,
        `Kanca: ${r.hook}`,
        r.after ? `Şimdi: ${r.after}` : '',
        r.in_practice ? `Pratikte: ${r.in_practice}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: wcfg.model,
    max_tokens: wcfg.max_tokens,
    system: d.prompt,
    messages: [{ role: 'user', content: `Hafta: ${start} – ${day}\nBu hafta ${rows.length} editör yazısı yayımlandı.\n\n${list}` }],
    output_config: { effort: wcfg.effort, format: { type: 'json_schema', schema: WEEKLY_SCHEMA } },
  };

  let msg: Anthropic.Message;
  try {
    msg = await d.ai.createWithFallback(params);
  } catch (e) {
    await d.log.event('warn', 'weekly', 'Haftalık baskı hazırlanamadı; sonraki çalıştırmada yeniden denenecek.', String(e));
    return null;
  }
  d.meter.add('weekly', msg.model, false, msg.usage);
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
  let out: { title?: unknown; intro?: unknown; top?: unknown } | null = null;
  try {
    out = msg.stop_reason === 'end_turn' && text ? JSON.parse(text) : null;
  } catch {
    out = null;
  }
  const ids = new Set(rows.map((r) => r.id));
  const top = (Array.isArray(out?.top) ? (out!.top as { review_id?: unknown; why?: unknown }[]) : [])
    .filter((t) => Number.isInteger(t.review_id) && ids.has(t.review_id as number) && typeof t.why === 'string')
    .filter((t, i, a) => a.findIndex((x) => x.review_id === t.review_id) === i)
    .slice(0, 3) as { review_id: number; why: string }[];
  if (!out || typeof out.title !== 'string' || typeof out.intro !== 'string' || !top.length) {
    await d.log.event('warn', 'weekly', 'Haftalık baskı yanıtı beklenen biçimde değildi; sonraki çalıştırmada yeniden denenecek.');
    return null;
  }

  const res = await d.db.all<{ id: number }>(
    `INSERT INTO issues (kind, issue_date, start_date, title, body, review_ids, model, created_at)
     VALUES ('weekly', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (kind, issue_date) DO NOTHING RETURNING id`,
    [day, start, out.title.trim(), JSON.stringify({ intro: out.intro.trim(), top }), JSON.stringify(ordered.map((r) => r.id)), msg.model, d.now.toISOString()],
  );
  await d.log.event('info', 'weekly', `Haftalık baskı hazırlandı: "${out.title.trim()}" (${rows.length} yazı).`);
  return res[0]?.id ?? null;
}
