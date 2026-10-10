// Yapay zekâ işleme işi: triyaj (Haiku) → seçim → editör yazısı (Opus).
// Anthropic Batch API kullanılır (%50 indirim). Bir çalıştırmada bitmeyen toplu işler
// veritabanında kayıtlı kalır ve sonraki çalıştırmada tamamlanır.

import { pathToFileURL } from 'node:url';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicAiClient, type AiClient, type BatchRequest } from '../ai/client.ts';
import {
  buildReviewParams,
  buildTriageParams,
  parseReview,
  parseTriage,
  ruleTriage,
  type RelatedReview,
  type WorkForAi,
} from '../ai/prompts.ts';
import { monthSpend, UsageMeter } from '../ai/usage.ts';
import { loadAiConfig, loadPrompt, loadTopics, type AiConfig, type Topic } from '../lib/config.ts';
import {
  D1Rest,
  DAILY_WRITE_LIMIT,
  exitOnError,
  LocalSqlite,
  MAX_PARAMS,
  QuotaExceededError,
  recordWrites,
  selectIn,
  writesToday,
  type Db,
  type Stmt,
} from '../lib/db.ts';
import { RunLog } from '../lib/runlog.ts';
import { relatedByText, updateSearchIndex } from '../lib/searchindex.ts';
import { fetchFullText, type FullText } from '../sources/fulltext.ts';
import { maybeWeekly, trDay } from './weekly.ts';

export const PROMPT_VERSION = 'editor-v2';
const SRC = 'ai';

export interface ProcessDeps {
  db: Db;
  ai: AiClient;
  log: RunLog;
  cfg?: AiConfig;
  topics?: Topic[];
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  fullText?: (w: WorkForAi, maxChars: number) => Promise<FullText | null>;
}

export interface ProcessSummary {
  triageSubmitted: number;
  triaged: number;
  ruleRejected: number;
  reviewSubmitted: number;
  reviewed: number;
  reviewFailed: number;
  pendingBatches: number;
  indexed: number;
  weeklyIssue: number | null;
  spentThisRun: number;
  monthSpent: number;
  budgetBlocked: boolean;
}

const WORK_COLS = `w.id, w.title, w.abstract, w.authors, w.journal, w.journal_abbr, w.journal_tier, w.is_turkish_journal,
  w.pub_date, w.pub_types, w.mesh, w.keywords, w.coi, w.grants, w.is_preprint, w.kind, w.doi, w.pmid, w.pmcid, w.fulltext_url`;

type Basis = 'abstract' | 'full_text';
// Toplu iş kimliğinin ilk harfi yazının dayanağını taşır: w = özet, f = tam metin
const basisOf = (customId: string): Basis => (customId.startsWith('f') ? 'full_text' : 'abstract');

async function runBatches(db: Db, stmts: Stmt[], size = 50): Promise<void> {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}

export async function runProcess(deps: ProcessDeps): Promise<ProcessSummary> {
  const { db, ai, log } = deps;
  const cfg = deps.cfg ?? loadAiConfig();
  const topics = deps.topics ?? loadTopics();
  const topicCodes = new Set(topics.map((t) => t.kod));
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const getFullText = deps.fullText ?? fetchFullText;
  const fullTextMax = cfg.review.fulltext_max_chars ?? 40_000;
  const meter = new UsageMeter(cfg.prices);
  const triagePrompt = loadPrompt('triage');
  const editorPrompt = loadPrompt('editor');

  const s: ProcessSummary = {
    triageSubmitted: 0, triaged: 0, ruleRejected: 0, reviewSubmitted: 0, reviewed: 0, reviewFailed: 0,
    pendingBatches: 0, indexed: 0, weeklyIssue: null, spentThisRun: 0, monthSpent: 0, budgetBlocked: false,
  };

  const budgetLeft = async () => cfg.budget.monthly_usd - ((await monthSpend(db, now())) + meter.total());
  const writesLeft = async () => DAILY_WRITE_LIMIT - (await writesToday(db));

  // ---- Toplu iş sonuçlarını işleyiciler ----------------------------------

  const refusedReviews: { id: number; basis: Basis }[] = [];

  async function handleTriageResults(batchId: string): Promise<void> {
    const stmts: Stmt[] = [];
    const ts = now().toISOString();
    for await (const r of ai.batchResults(batchId)) {
      const workId = Number(r.custom_id.slice(1));
      if (r.result.type !== 'succeeded') {
        // Sunucu hatası / süre doldu → sonraki çalıştırmada yeniden denenir
        stmts.push({ sql: `UPDATE works SET status = 'new' WHERE id = ? AND status = 'triage_pending'`, params: [workId] });
        continue;
      }
      const msg = r.result.message;
      meter.add('triage', msg.model, true, msg.usage);
      const parsed = parseTriage(msg, topicCodes);
      if (parsed.ok) {
        const t = parsed.value;
        stmts.push({
          sql: `INSERT OR REPLACE INTO triage (work_id, relevant, importance, topics, study_type, title_tr, summary_tr, reason, source, created_at)
                VALUES (?,?,?,?,?,?,?,?, 'model', ?)`,
          params: [workId, t.relevant ? 1 : 0, t.importance, JSON.stringify(t.topics), t.study_type, t.title_tr || null,
            t.importance >= 3 && t.summary_tr ? t.summary_tr : null, t.reason, ts],
        });
        stmts.push({ sql: `UPDATE works SET status = ? WHERE id = ?`, params: [t.relevant ? 'triaged' : 'rejected', workId] });
        s.triaged++;
      } else {
        // Model reddetti ya da yanıt bozuk: kayıt kaybolmasın, kural tabanlı orta öncelikle işaretle
        stmts.push({
          sql: `INSERT OR REPLACE INTO triage (work_id, relevant, importance, topics, study_type, title_tr, summary_tr, reason, source, created_at)
                VALUES (?, 1, 0, '[]', NULL, NULL, NULL, ?, ?, ?)`,
          params: [workId, parsed.error, parsed.refused ? 'refused' : 'error', ts],
        });
        stmts.push({ sql: `UPDATE works SET status = 'triaged' WHERE id = ?`, params: [workId] });
      }
    }
    await runBatches(db, stmts);
  }

  async function saveReview(workId: number, msg: Anthropic.Message, isBatch: boolean, basis: Basis): Promise<'ok' | 'refused' | 'error'> {
    meter.add('review', msg.model, isBatch, msg.usage);
    const parsed = parseReview(msg, topicCodes);
    if (!parsed.ok) {
      await log.event('warn', SRC, `Yazı ${workId}: ${parsed.error}`);
      return parsed.refused ? 'refused' : 'error';
    }
    const v = parsed.value;
    const body = {
      before: v.before, after: v.after, in_practice: v.in_practice,
      evidence: { design: v.evidence_design, results: v.evidence_results, maturity: v.evidence_maturity },
      limitations: v.limitations, funding_coi: v.funding_coi,
      context: v.context, relations: v.relations, related_review_ids: v.related_review_ids, turkey: v.turkey,
      guideline_changes: v.guideline_changes, guideline_key_points: v.guideline_key_points,
    };
    const [inserted] = await db.batch([
      {
        sql: `INSERT OR REPLACE INTO reviews (work_id, impact, title_tr, hook, body, topics, basis, model, prompt_version, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        params: [workId, v.impact, v.title_tr, v.hook, JSON.stringify(body), JSON.stringify(v.topics), basis, msg.model, PROMPT_VERSION, now().toISOString()],
      },
      { sql: `UPDATE works SET status = 'reviewed' WHERE id = ?`, params: [workId] },
    ]);
    // İlişkiler ayrı tabloya da yazılır: eski yazıda "sonradan gelen ilişkili yazılar" gösterilebilsin.
    // Yalnızca gerçekten var olan yazılara bağlanır (model uydurma kimlik yazarsa atılır).
    const reviewId = inserted?.[0]?.id as number | undefined;
    if (reviewId && v.relations.length) {
      await db.batch(
        v.relations
          .filter((r) => r.review_id !== reviewId)
          .map((r) => ({
            sql: `INSERT OR REPLACE INTO review_links (src_review_id, dst_review_id, relation, note)
                  SELECT ?, id, ?, ? FROM reviews WHERE id = ?`,
            params: [reviewId, r.relation, r.note, r.review_id],
          })),
      );
    }
    s.reviewed++;
    return 'ok';
  }

  async function handleReviewResults(batchId: string): Promise<void> {
    for await (const r of ai.batchResults(batchId)) {
      const workId = Number(r.custom_id.slice(1));
      if (r.result.type !== 'succeeded') {
        await db.all(`UPDATE works SET status = 'triaged' WHERE id = ? AND status = 'review_pending'`, [workId]);
        continue;
      }
      const basis = basisOf(r.custom_id);
      const outcome = await saveReview(workId, r.result.message, true, basis);
      if (outcome === 'refused') refusedReviews.push({ id: workId, basis });
      else if (outcome === 'error') {
        await db.all(`UPDATE works SET status = 'review_failed' WHERE id = ?`, [workId]);
        s.reviewFailed++;
      }
    }
  }

  /** Bekleyen toplu işleri, en fazla `waitMs` kadar bekleyerek tamamlar. */
  async function finishBatches(kind: 'triage' | 'review', waitMs: number): Promise<void> {
    const pending = await db.all<{ id: number; batch_id: string; created_at: string }>(
      `SELECT id, batch_id, created_at FROM ai_batches WHERE kind = ? AND status = 'submitted' ORDER BY id`,
      [kind],
    );
    const deadline = Date.now() + waitMs;
    for (const b of pending) {
      let status: string;
      try {
        status = await ai.batchStatus(b.batch_id);
        while (status !== 'ended' && Date.now() < deadline) {
          await sleep(Math.min(30_000, Math.max(0, deadline - Date.now())));
          status = await ai.batchStatus(b.batch_id);
        }
      } catch (e) {
        await log.event('warn', SRC, `Toplu iş durumu alınamadı (${kind}); sonra yeniden denenecek.`, String(e));
        continue;
      }
      if (status !== 'ended') {
        s.pendingBatches++;
        continue;
      }
      if (kind === 'triage') await handleTriageResults(b.batch_id);
      else await handleReviewResults(b.batch_id);
      await db.all(`UPDATE ai_batches SET status = 'processed', processed_at = ? WHERE id = ?`, [now().toISOString(), b.id]);
    }
  }

  /** Hiçbir aktif toplu işe ait olmayan "bekliyor" durumundaki kayıtları geri al. */
  async function sweepOrphans(): Promise<void> {
    for (const [kind, from, to] of [['triage', 'triage_pending', 'new'], ['review', 'review_pending', 'triaged']] as const) {
      if (!(await hasActive(kind))) await db.all(`UPDATE works SET status = ? WHERE status = ?`, [to, from]);
    }
  }

  /** Bu türden yanıtı beklenen bir toplu iş var mı? Aynı anda yalnızca biri gönderilir. */
  async function hasActive(kind: 'triage' | 'review'): Promise<boolean> {
    return (await db.all(`SELECT 1 FROM ai_batches WHERE kind = ? AND status = 'submitted' LIMIT 1`, [kind])).length > 0;
  }

  async function setStatus(ids: number[], status: string): Promise<void> {
    const stmts: Stmt[] = [];
    for (let i = 0; i < ids.length; i += MAX_PARAMS - 1) {
      const chunk = ids.slice(i, i + MAX_PARAMS - 1);
      stmts.push({ sql: `UPDATE works SET status = ? WHERE id IN (${chunk.map(() => '?').join(',')})`, params: [status, ...chunk] });
    }
    await runBatches(db, stmts);
  }

  async function submit(kind: 'triage' | 'review', requests: BatchRequest[], workIds: number[]): Promise<void> {
    if (!requests.length) return;
    // Önce "bekliyor" olarak işaretle: gönderim sırasında bir şey kırılırsa kayıtlar iki kez gönderilmez,
    // sahipsiz kalan işaretler sonraki çalıştırmada geri alınır.
    const pendingStatus = kind === 'triage' ? 'triage_pending' : 'review_pending';
    const previous = kind === 'triage' ? 'new' : 'triaged';
    await setStatus(workIds, pendingStatus);
    let id: string;
    try {
      ({ id } = await ai.createBatch(requests));
    } catch (e) {
      await setStatus(workIds, previous);
      throw e;
    }
    await db.all(`INSERT INTO ai_batches (kind, batch_id, status, request_count, created_at) VALUES (?, ?, 'submitted', ?, ?)`, [
      kind, id, requests.length, now().toISOString(),
    ]);
  }

  // ---- 1) Önceki çalıştırmalardan kalan işler -----------------------------
  await finishBatches('triage', 0);
  await finishBatches('review', 0);
  await sweepOrphans();

  // ---- 2) Triyaj ------------------------------------------------------------
  s.monthSpent = await monthSpend(db, now());
  if (await hasActive('triage')) {
    await log.event('info', SRC, 'Önceki triyaj toplu işi henüz bitmedi; yeni kayıtlar onun ardından gönderilecek.');
  } else if ((await budgetLeft()) <= 0) {
    s.budgetBlocked = true;
    await log.event('warn', SRC, `Aylık yapay zekâ bütçesi (${cfg.budget.monthly_usd} $) doldu; yeni değerlendirme yapılmayacak.`);
  } else {
    // Her triyaj kaydı yaklaşık 8 satır yazar (durum + sonuç + dizinler)
    const capByWrites = Math.floor(((await writesLeft()) - 5000) / 8);
    const limit = Math.max(0, Math.min(cfg.triage.max_per_run, capByWrites));
    if (limit < cfg.triage.max_per_run) await log.event('info', SRC, `Veritabanı yazma kotası nedeniyle triyaj ${limit} kayıtla sınırlandı.`);
    const queue = limit
      ? await db.all<WorkForAi>(
          `SELECT ${WORK_COLS} FROM works w WHERE w.status = 'new'
           ORDER BY CASE WHEN w.pub_types LIKE '%Guideline%' OR w.pub_types LIKE '%Consensus%' OR w.pub_types LIKE '%Randomized Controlled Trial%'
                           OR w.pub_types LIKE '%Meta-Analysis%' OR w.pub_types LIKE '%Systematic Review%' THEN 0 ELSE 1 END,
                    COALESCE(w.journal_tier, 3), w.first_seen_at DESC, w.id DESC
           LIMIT ?`,
          [limit],
        )
      : [];
    const ruleStmts: Stmt[] = [];
    const reqs: BatchRequest[] = [];
    const ids: number[] = [];
    for (const w of queue) {
      const rule = ruleTriage(w);
      if (rule) {
        ruleStmts.push(
          {
            sql: `INSERT OR REPLACE INTO triage (work_id, relevant, importance, topics, reason, source, created_at) VALUES (?, 0, 1, '[]', ?, 'rule', ?)`,
            params: [w.id, rule.reason, now().toISOString()],
          },
          { sql: `UPDATE works SET status = 'rejected' WHERE id = ?`, params: [w.id] },
        );
        s.ruleRejected++;
        continue;
      }
      reqs.push({ custom_id: `w${w.id}`, params: buildTriageParams(w, cfg, triagePrompt, topics) });
      ids.push(w.id);
    }
    await runBatches(db, ruleStmts);
    if (reqs.length) {
      await submit('triage', reqs, ids);
      s.triageSubmitted = reqs.length;
      await log.event('info', SRC, `${reqs.length} kayıt triyaja gönderildi.`);
    }
  }
  await finishBatches('triage', cfg.batch.max_wait_minutes * 60_000);

  // ---- 3) Seçim ve editör yazıları -----------------------------------------
  if (!s.budgetBlocked && !(await hasActive('review')) && (await budgetLeft()) > 0) {
    // Günlük tavan Türkiye gününe göre sayılır (günlük baskıyla aynı gün)
    const today = new Date(`${trDay(now())}T00:00:00+03:00`).toISOString();
    const [{ n: totalReviews }] = await db.all<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM reviews) + (SELECT COUNT(*) FROM ai_batches WHERE kind = 'review') AS n`,
    );
    const [{ n: todayCount }] = await db.all<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM reviews WHERE created_at >= ?) +
              (SELECT COUNT(*) FROM works WHERE status = 'review_pending') AS n`,
      [today],
    );
    const quota = totalReviews === 0 ? cfg.review.initial_backlog : Math.max(0, cfg.review.max_per_day - todayCount);
    const since = new Date(now().getTime() - cfg.review.candidate_days * 864e5).toISOString();
    const candidates = quota
      ? await db.all<WorkForAi & { title_tr: string | null; study_type: string | null; t_topics: string | null }>(
          `SELECT ${WORK_COLS}, t.title_tr, t.study_type, t.topics AS t_topics
           FROM works w JOIN triage t ON t.work_id = w.id
           WHERE w.status = 'triaged' AND t.relevant = 1 AND t.importance >= ? AND w.first_seen_at >= ?
             AND w.abstract IS NOT NULL AND (LENGTH(w.abstract) >= 400 OR w.pmcid IS NOT NULL OR w.fulltext_url IS NOT NULL)
             AND NOT (w.is_preprint = 1 AND w.linked_work_id IS NOT NULL) -- dergide yayımlanmış hâli varsa o değerlendirilir
           ORDER BY t.importance DESC, COALESCE(w.journal_tier, 3),
                    CASE WHEN w.pub_types LIKE '%Guideline%' OR w.pub_types LIKE '%Randomized Controlled Trial%'
                              OR w.pub_types LIKE '%Meta-Analysis%' THEN 0 ELSE 1 END,
                    w.pub_date DESC
           LIMIT ?`,
          [cfg.review.min_importance, since, quota],
        )
      : [];

    if (candidates.length) {
      const relatedSince = new Date(now().getTime() - 365 * 864e5).toISOString();
      const recent = await db.all<RelatedReview & { topics: string | null }>(
        `SELECT id, title_tr, hook, created_at, topics, json_extract(body, '$.after') AS after
         FROM reviews WHERE created_at >= ? ORDER BY created_at DESC LIMIT 300`,
        [relatedSince],
      );
      const reqs: BatchRequest[] = [];
      let withFullText = 0;
      for (const c of candidates) {
        const ft = c.pmcid || c.fulltext_url ? await getFullText(c, fullTextMax) : null;
        if (ft) {
          withFullText++;
          // Makaleye sonradan soru sorulduğunda da aynı metin kullanılır
          await db.all(`INSERT OR REPLACE INTO fulltexts (work_id, source, text, created_at) VALUES (?, ?, ?, ?)`, [
            c.id, ft.source, ft.text, now().toISOString(),
          ]);
        }
        // Bağlam: önce başlığı benzeyen yazılar (metin araması), kalan yer konu etiketi ortak olanlarla doldurulur
        const max = cfg.review.related_reviews;
        const byText = await relatedByText(db, c.title, c.id, relatedSince, Math.ceil(max / 2));
        const mine = new Set<string>(JSON.parse(c.t_topics ?? '[]'));
        const byTopic = recent
          .map((r) => ({ r, overlap: (JSON.parse(r.topics ?? '[]') as string[]).filter((t) => mine.has(t)).length }))
          .filter((x) => x.overlap > 0)
          .sort((a, b) => b.overlap - a.overlap)
          .map((x) => x.r);
        const related: RelatedReview[] = [];
        for (const r of [...byText, ...byTopic]) if (related.length < max && !related.some((x) => x.id === r.id)) related.push(r);
        reqs.push({ custom_id: `${ft ? 'f' : 'w'}${c.id}`, params: buildReviewParams(c, c, related, cfg, editorPrompt, topics, ft) });
      }
      await submit('review', reqs, candidates.map((c) => c.id));
      s.reviewSubmitted = reqs.length;
      await log.event(
        'info',
        SRC,
        `${reqs.length} yayın editör değerlendirmesine gönderildi` + (withFullText ? ` (${withFullText} tanesi tam metinle).` : '.'),
      );
    }
  }
  await finishBatches('review', cfg.batch.max_wait_minutes * 60_000);

  // ---- 4) Güvenlik filtresine takılan yazılar: yedek modelle tek tek yeniden dene
  for (const { id: workId, basis } of refusedReviews.slice(0, 5)) {
    const [w] = await selectIn<WorkForAi & { title_tr: string | null; study_type: string | null }>(
      db,
      (ph) => `SELECT ${WORK_COLS}, t.title_tr, t.study_type FROM works w JOIN triage t ON t.work_id = w.id WHERE w.id IN (${ph})`,
      [workId],
    );
    let outcome: 'ok' | 'refused' | 'error' = 'error';
    if (w) try {
      const ft = basis === 'full_text' ? await getFullText(w, fullTextMax) : null;
      const msg = await ai.createWithFallback(buildReviewParams(w, w, [], cfg, editorPrompt, topics, ft));
      outcome = await saveReview(workId, msg, false, ft ? 'full_text' : 'abstract');
    } catch (e) {
      await log.event('warn', SRC, `Yazı ${workId} yedek modelle de hazırlanamadı.`, String(e));
    }
    if (outcome !== 'ok') {
      await db.all(`UPDATE works SET status = 'review_failed' WHERE id = ?`, [workId]);
      s.reviewFailed++;
    }
  }
  for (const { id: workId } of refusedReviews.slice(5)) {
    await db.all(`UPDATE works SET status = 'triaged' WHERE id = ?`, [workId]); // sonraki çalıştırmaya
  }

  // ---- 5) Haftalık "öne çıkanlar" baskısı (pazar; kaçarsa pazartesi)
  try {
    s.weeklyIssue = await maybeWeekly({ db, ai, cfg, meter, log, prompt: loadPrompt('weekly'), now: now(), budgetLeft });
  } catch (e) {
    if (e instanceof QuotaExceededError) throw e;
    await log.event('warn', 'weekly', 'Haftalık baskı hazırlanırken hata oluştu.', String(e));
  }

  // ---- 6) Soru-cevap için arşiv arama dizini ---------------------------------
  // Dizin satırı başına birkaç satır yazıldığı varsayılır; kotanın sonunda yer bırakılır.
  s.indexed = await updateSearchIndex(db, Math.min(8000, Math.floor(((await writesLeft()) - 3000) / 10)));

  s.spentThisRun = meter.total();
  await meter.flush(db);
  s.monthSpent = await monthSpend(db, now());
  return s;
}

// ---------------------------------------------------------------------------
// Komut satırı

async function main() {
  const env = process.env;
  let db: Db;
  if (env.LOCAL_DB) {
    db = await LocalSqlite.open(env.LOCAL_DB);
  } else {
    db = await D1Rest.connect(env.CLOUDFLARE_ACCOUNT_ID!, env.CLOUDFLARE_API_TOKEN!, env.D1_DATABASE_NAME ?? 'enfeksiyon-gundemi');
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY tanımlı değil (GitHub Secrets).');
  const log = await RunLog.start(db, 'process');
  try {
    const s = await runProcess({ db, ai: new AnthropicAiClient(env.ANTHROPIC_API_KEY), log });
    await log.event(
      'info',
      SRC,
      `Triyaj: ${s.triaged} kayıt değerlendirildi (${s.ruleRejected} kural ile elendi). ` +
        `Editör: ${s.reviewed} yazı hazırlandı${s.reviewFailed ? `, ${s.reviewFailed} hazırlanamadı` : ''}. ` +
        (s.indexed ? `Arama dizinine ${s.indexed} yayın eklendi. ` : '') +
        `Bu çalıştırmanın maliyeti ~$${s.spentThisRun.toFixed(2)}, bu ay toplam ~$${s.monthSpent.toFixed(2)}.` +
        (s.pendingBatches ? ` ${s.pendingBatches} toplu iş sürüyor, sonraki çalıştırmada tamamlanacak.` : ''),
    );
    await log.finish(s.reviewFailed ? 'partial' : 'ok', s);
    await recordWrites(db);
  } catch (e) {
    if (!(e instanceof QuotaExceededError)) {
      await log.event('error', SRC, 'Yapay zekâ işlemi beklenmedik bir hatayla durdu.', String(e)).catch(() => {});
      await log.finish('failed', { error: String(e) }).catch(() => {});
    }
    await recordWrites(db).catch(() => {});
    exitOnError(e);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(exitOnError);
}
