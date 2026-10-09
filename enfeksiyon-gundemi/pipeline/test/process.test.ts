import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import type { AiClient, BatchRequest } from '../src/ai/client.ts';
import { costUsd } from '../src/ai/usage.ts';
import { runProcess } from '../src/jobs/process.ts';
import { loadAiConfig, loadJournalTiers } from '../src/lib/config.ts';
import { RunLog } from '../src/lib/runlog.ts';
import { storeRecords } from '../src/lib/store.ts';
import { freshDb, rec } from './helpers.ts';

const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } as Anthropic.Usage;

function message(model: string, body: unknown, stop: Anthropic.StopReason = 'end_turn'): Anthropic.Message {
  return {
    id: 'msg', type: 'message', role: 'assistant', model, stop_reason: stop, stop_sequence: null,
    stop_details: stop === 'refusal' ? ({ type: 'refusal', category: 'bio', explanation: null } as never) : null,
    content: stop === 'refusal' ? [] : [{ type: 'text', text: JSON.stringify(body), citations: null }],
    usage,
  } as unknown as Anthropic.Message;
}

const reviewBody = {
  title_tr: 'Türkçe başlık', hook: 'Kanca cümlesi.', impact: 'important', before: 'önce', after: 'sonra',
  in_practice: 'pratik', evidence_design: 'RKÇ, n=500', evidence_results: 'RR 0,8', evidence_maturity: 'mature',
  limitations: 'tek merkez', funding_coi: 'endüstri', context: 'bağlam', related_review_ids: [], turkey: 'yerel veriyle karşılaştırılmalı',
  topics: ['sepsis'], guideline_changes: [], guideline_key_points: [],
};

/** Sahte Anthropic istemcisi: kurala göre yanıt üretir, toplu işleri isteğe göre "bitmemiş" tutar. */
class FakeAi implements AiClient {
  batches = new Map<string, BatchRequest[]>();
  unfinished = new Set<string>();
  refuseReview = new Set<string>(); // custom_id
  fallbackCalls = 0;
  holdNext = false;
  private n = 0;

  async createBatch(requests: BatchRequest[]) {
    const id = `b${++this.n}`;
    this.batches.set(id, requests);
    if (this.holdNext) this.unfinished.add(id);
    return { id };
  }
  async batchStatus(id: string) {
    return this.unfinished.has(id) ? ('in_progress' as const) : ('ended' as const);
  }
  async *batchResults(id: string) {
    for (const r of this.batches.get(id) ?? []) {
      const isTriage = r.params.model.includes('haiku');
      const user = String(r.params.messages[0].content);
      let msg: Anthropic.Message;
      if (isTriage) {
        const important = user.includes('sepsis');
        msg = message(r.params.model, {
          relevant: !user.includes('plant'), importance: important ? 5 : 2, topics: important ? ['sepsis', 'uydurma_kod'] : [],
          study_type: 'rct', title_tr: 'TR başlık', summary_tr: important ? 'kısa not' : '', reason: 'gerekçe',
        });
      } else {
        msg = message(r.params.model, reviewBody, this.refuseReview.has(r.custom_id) ? 'refusal' : 'end_turn');
      }
      yield { custom_id: r.custom_id, result: { type: 'succeeded' as const, message: msg } };
    }
  }
  async createWithFallback(params: Anthropic.MessageCreateParamsNonStreaming) {
    this.fallbackCalls++;
    return message('claude-opus-5', reviewBody);
  }
}

async function seed(n: number, extra: ReturnType<typeof rec>[] = []) {
  const db = await freshDb();
  const recs = [
    ...Array.from({ length: n }, (_, i) =>
      rec({ pmid: String(100 + i), title: `Early antibiotics in sepsis trial number ${i} with long title text`, abstract: `BACKGROUND: sepsis ${'outcomes in adults '.repeat(25)}`, journalAbbr: 'Clin Infect Dis', pubTypes: ['Randomized Controlled Trial'] }),
    ),
    ...extra,
  ];
  await storeRecords(db, recs, loadJournalTiers());
  return db;
}

const deps = (db: Awaited<ReturnType<typeof freshDb>>, ai: AiClient, log: RunLog) => ({
  db, ai, log, sleep: async () => {}, cfg: { ...loadAiConfig(), batch: { max_wait_minutes: 0 } },
});

test('triyaj → seçim → editör yazısı uçtan uca', async () => {
  const db = await seed(3, [
    rec({ pmid: '900', title: 'Erratum: something about a previous article in this journal' }),
    rec({ pmid: '901', title: 'Fungal pathogens of a plant species in greenhouse conditions', abstract: 'plant study' }),
  ]);
  const ai = new FakeAi();
  const log = await RunLog.start(db, 'process');
  const s = await runProcess(deps(db, ai, log));

  assert.equal(s.ruleRejected, 1, 'erratum kural ile elenir');
  assert.equal(s.triageSubmitted, 4);
  assert.equal(s.triaged, 4);
  assert.equal(s.reviewSubmitted, 3, 'önemli 3 yayın yazıya gönderilir (ilk kurulum kotası)');
  assert.equal(s.reviewed, 3);

  const statuses = await db.all<{ pmid: string; status: string }>('SELECT pmid, status FROM works ORDER BY pmid');
  assert.deepEqual(Object.fromEntries(statuses.map((r) => [r.pmid, r.status])), {
    '100': 'reviewed', '101': 'reviewed', '102': 'reviewed', '900': 'rejected', '901': 'rejected',
  });
  const t = await db.all<{ topics: string; summary_tr: string | null }>('SELECT topics, summary_tr FROM triage WHERE work_id = 1');
  assert.deepEqual(JSON.parse(t[0].topics), ['sepsis'], 'listede olmayan konu kodu atılır');
  assert.equal(t[0].summary_tr, 'kısa not');

  const r = await db.all<{ body: string; basis: string }>('SELECT body, basis FROM reviews LIMIT 1');
  assert.equal(JSON.parse(r[0].body).evidence.maturity, 'mature');
  assert.equal(r[0].basis, 'abstract');

  const u = await db.all<{ kind: string; requests: number; cost_usd: number }>('SELECT kind, requests, cost_usd FROM ai_usage ORDER BY kind');
  assert.deepEqual(u.map((x) => [x.kind, x.requests]), [['review', 3], ['triage', 4]]);
  assert.ok(u.every((x) => x.cost_usd > 0));
});

test('reddedilen yazı yedek modelle yeniden denenir', async () => {
  const db = await seed(2);
  const ai = new FakeAi();
  ai.refuseReview.add('w1');
  const log = await RunLog.start(db, 'process');
  const s = await runProcess(deps(db, ai, log));
  assert.equal(ai.fallbackCalls, 1);
  assert.equal(s.reviewed, 2);
  const rows = await db.all<{ model: string }>('SELECT model FROM reviews ORDER BY work_id');
  assert.deepEqual(rows.map((r) => r.model), ['claude-opus-5', 'claude-opus-5-5']);
});

test('bitmeyen toplu iş sonraki çalıştırmada tamamlanır, kayıtlar iki kez gönderilmez', async () => {
  const db = await seed(2);
  const ai = new FakeAi();
  ai.holdNext = true;
  const log = await RunLog.start(db, 'process');
  const s1 = await runProcess(deps(db, ai, log));
  assert.equal(s1.triageSubmitted, 2);
  assert.equal(s1.pendingBatches, 1);
  assert.equal(s1.triaged, 0);

  ai.holdNext = false;
  ai.unfinished.clear();
  const s2 = await runProcess(deps(db, ai, log));
  assert.equal(s2.triageSubmitted, 0, 'bekleyen kayıtlar yeniden gönderilmez');
  assert.equal(s2.triaged, 2);
  assert.equal(s2.reviewed, 2);
});

test('aylık bütçe dolduysa yeni iş başlatılmaz', async () => {
  const db = await seed(2);
  await db.all(
    `INSERT INTO ai_usage (created_at, kind, model, is_batch, requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?, 'review', 'claude-opus-5-5', 1, 1, 0, 0, 0, 0, 999)`,
    [new Date().toISOString()],
  );
  const ai = new FakeAi();
  const log = await RunLog.start(db, 'process');
  const s = await runProcess(deps(db, ai, log));
  assert.equal(s.budgetBlocked, true);
  assert.equal(ai.batches.size, 0);
});

test('maliyet hesabı: toplu işlemede %50 indirim', () => {
  const price = { input: 4, output: 20, cache_write: 5, cache_read: 0.2 };
  const u = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  assert.equal(costUsd(price, u, false), 6);
  assert.equal(costUsd(price, u, true), 3);
});

test('yüzlerce kayıt D1 parametre sınırına takılmadan gönderilir', async () => {
  const db = await seed(150);
  const ai = new FakeAi();
  ai.holdNext = true;
  const log = await RunLog.start(db, 'process');
  const s = await runProcess(deps(db, ai, log));
  assert.equal(s.triageSubmitted, 150);
  const [{ n }] = await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM works WHERE status = 'triage_pending'`);
  assert.equal(n, 150);
});

test('gönderim başarısız olursa kayıtlar geri alınır', async () => {
  const db = await seed(3);
  const ai = new FakeAi();
  ai.createBatch = async () => {
    throw new Error('API kapalı');
  };
  const log = await RunLog.start(db, 'process');
  await assert.rejects(runProcess(deps(db, ai, log)));
  const [{ n }] = await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM works WHERE status = 'new'`);
  assert.equal(n, 3);
});

test('açık erişimli tam metin varsa yazı tam metne dayanır; yayımlanmış hâli olan ön baskı seçilmez', async () => {
  const long = `Background ${'sepsis outcomes in adults '.repeat(25)}`;
  const db = await seed(0, [
    rec({ pmid: '500', pmcid: 'PMC123', title: 'Open access sepsis trial with a sufficiently long title here', abstract: long }),
    rec({ source: 'preprint:medrxiv', sourceId: '10.1101/x', doi: '10.1101/x', isPreprint: true, kind: 'preprint', publishedDoi: '10.1/pub',
      title: 'Preprint sepsis study which was later published in a journal', abstract: long }),
    rec({ pmid: '502', doi: '10.1/pub', title: 'Journal version of the sepsis study published in a journal', abstract: long }),
  ]);
  const { linkPreprints } = await import('../src/jobs/collect.ts');
  await linkPreprints(db);
  const ai = new FakeAi();
  const log = await RunLog.start(db, 'process');
  const asked: string[] = [];
  const s = await runProcess({
    ...deps(db, ai, log),
    fullText: async (w) => {
      asked.push(w.pmcid ?? '');
      return w.pmcid ? { text: 'METHODS ... RESULTS ...', source: 'Europe PMC', truncated: false } : null;
    },
  });
  assert.equal(s.reviewed, 2, 'ön baskı değil, dergi hâli yazılır');
  assert.deepEqual(asked, ['PMC123']);
  const rows = await db.all<{ pmid: string | null; basis: string }>('SELECT w.pmid, r.basis FROM reviews r JOIN works w ON w.id = r.work_id ORDER BY w.pmid');
  assert.deepEqual(rows.map((r) => [r.pmid, r.basis]), [['500', 'full_text'], ['502', 'abstract']]);
  const reviewReq = [...ai.batches.values()].flat().find((r) => r.custom_id.startsWith('f'));
  assert.ok(String(reviewReq?.params.messages[0].content).includes('## Tam metin'));
});
