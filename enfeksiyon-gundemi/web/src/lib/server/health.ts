// Sistem sağlığı: kaynak durumları, beklenti sapması, çalıştırmalar, yapay zekâ kuyruğu ve kotalar.
// Her şey okuma sırasında hesaplanır (veritabanına yazmaz).
import { parse } from 'yaml';
import limitsRaw from '../../../../config/limits.yaml?raw';
import aiRaw from '../../../../config/ai.yaml?raw';
import { SOURCE_NAME } from './sources';

const limits = parse(limitsRaw) as {
  health: {
    stale_hours: number;
    dead_hours: number;
    deviation_ratio_busy: number;
    deviation_ratio_sparse: number;
    budget_warn_ratio: number;
  };
};
const ai = parse(aiRaw) as { budget: { monthly_usd: number }; review: { max_per_day: number } };
const H = limits.health;
const DAY = 864e5;
const D1_DAILY_WRITES = 100_000;
const D1_MAX_BYTES = 500 * 1024 * 1024;

export type Light = 'green' | 'yellow' | 'red' | 'grey';
export type Level = 'ok' | 'warn' | 'error';

export interface SourceHealth {
  id: string;
  name: string;
  light: Light;
  lastSuccess: string | null;
  problem: string | null; // sade dille
  detail: string | null; // teknik ayrıntı
  deviation: string | null;
  series: number[]; // son 14 gün, eskiden yeniye
}

export interface Issue {
  level: 'warn' | 'error';
  text: string;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Teknik hata metnini sade Türkçeye çevirir */
export function plainError(raw: string | null): string | null {
  if (!raw) return null;
  if (/sayfa yapısı değişmiş|bağlantılar bulunamadı/i.test(raw)) return 'Sayfada beklenen bağlantılar bulunamadı; sitenin tasarımı değişmiş olabilir.';
  if (/HTTP 40[13]/.test(raw)) return 'Site erişimi engelledi.';
  if (/HTTP 404|HTTP 410/.test(raw)) return 'Adres bulunamadı; kaynağın adresi değişmiş olabilir.';
  if (/HTTP 429/.test(raw)) return 'Site çok sık istek gönderildiğini bildirdi; sonraki çalıştırmada yeniden denenecek.';
  if (/HTTP 5\d\d/.test(raw)) return 'Sitede geçici bir sunucu hatası var.';
  if (/timeout|timed out|aborted|zaman aşımı/i.test(raw)) return 'Site zamanında yanıt vermedi.';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|getaddrinfo/i.test(raw)) return 'Siteye bağlanılamadı.';
  if (/XML|JSON|Unexpected token|parse/i.test(raw)) return 'Kaynaktan gelen veri okunamadı; biçimi değişmiş olabilir.';
  if (/gün indirilemedi/.test(raw)) return raw;
  return 'Beklenmeyen bir hata oluştu.';
}

/** Son günlerdeki kayıt sayısı olağanın belirgin altında mı? */
export function deviation(counts: Map<string, number>, todayMs: number): string | null {
  const vals = (from: number, to: number) => {
    const out: number[] = [];
    for (let d = from; d <= to; d++) {
      const v = counts.get(day(todayMs - d * DAY));
      if (v !== undefined) out.push(v);
    }
    return out;
  };
  const prior = vals(8, 35); // 8–35 gün önce
  if (prior.length < 14) return null; // yeterli geçmiş yok
  const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const busy = avg >= 20;
  const window = busy ? 3 : 7;
  const recent = vals(1, window); // bugün henüz bitmediği için dahil değil
  if (recent.length < Math.ceil(window / 2)) return null;
  const expected = avg * recent.length;
  if (expected < 3) return null; // seyrek kaynak: sinyal yok
  const got = recent.reduce((a, b) => a + b, 0);
  const ratio = busy ? H.deviation_ratio_busy : H.deviation_ratio_sparse;
  if (got >= expected * ratio) return null;
  return `Son ${recent.length} günde ${got} kayıt geldi; olağan ~${Math.round(expected)}. Hata görünmüyor ama kaynakta bir sorun olabilir.`;
}

interface StateRow {
  source: string;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
}

async function sourceHealth(db: D1Database, now: number): Promise<SourceHealth[]> {
  const [states, counts] = await db.batch([
    db.prepare(`SELECT source, last_success_at, last_attempt_at, last_error FROM source_state`),
    db.prepare(`SELECT source, day, found FROM source_daily_counts WHERE day >= ?1`).bind(day(now - 36 * DAY)),
  ]);
  const byState = new Map((states.results as unknown as StateRow[]).map((s) => [s.source, s]));
  const bySource = new Map<string, Map<string, number>>();
  for (const r of counts.results as unknown as { source: string; day: string; found: number }[]) {
    if (!bySource.has(r.source)) bySource.set(r.source, new Map());
    bySource.get(r.source)!.set(r.day, r.found);
  }
  const out: SourceHealth[] = [];
  for (const [id, name] of Object.entries(SOURCE_NAME)) {
    const s = byState.get(id);
    const c = bySource.get(id) ?? new Map<string, number>();
    const series = Array.from({ length: 14 }, (_, i) => c.get(day(now - (13 - i) * DAY)) ?? 0);
    if (!s) {
      out.push({ id, name, light: 'grey', lastSuccess: null, problem: 'Henüz çalıştırılmadı.', detail: null, deviation: null, series });
      continue;
    }
    const age = s.last_success_at ? (now - Date.parse(s.last_success_at)) / 3600e3 : Infinity;
    const dev = deviation(c, now);
    let light: Light = 'green';
    let problem: string | null = null;
    if (age > H.dead_hours) {
      light = 'red';
      problem = s.last_success_at
        ? `${Math.round(age / 24)} gündür veri alınamıyor. ${plainError(s.last_error) ?? ''}`.trim()
        : `Hiç veri alınamadı. ${plainError(s.last_error) ?? ''}`.trim();
    } else if (s.last_error) {
      light = 'yellow';
      problem = `Son denemede: ${plainError(s.last_error)}`;
    } else if (age > H.stale_hours) {
      light = 'yellow';
      problem = 'Bir süredir yeni çekim yapılmadı.';
    } else if (dev) {
      light = 'yellow';
    }
    out.push({ id, name, light, lastSuccess: s.last_success_at, problem, detail: s.last_error, deviation: dev, series });
  }
  // Önce sorunlular, sonra PubMed, sonra ada göre
  const rank: Record<Light, number> = { red: 0, yellow: 1, grey: 2, green: 3 };
  return out.sort(
    (a, b) => rank[a.light] - rank[b.light] || (a.id === 'pubmed' ? -1 : b.id === 'pubmed' ? 1 : a.name.localeCompare(b.name, 'tr')),
  );
}

async function budget(db: D1Database, now: number) {
  const d = new Date(now);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const rows = (
    await db
      .prepare(`SELECT kind, COALESCE(SUM(cost_usd), 0) AS usd, COALESCE(SUM(requests), 0) AS n FROM ai_usage WHERE created_at >= ?1 GROUP BY kind`)
      .bind(start.toISOString())
      .all<{ kind: string; usd: number; n: number }>()
  ).results;
  const spent = rows.reduce((a, r) => a + r.usd, 0);
  const elapsedDays = Math.max(1, (now - start.getTime()) / DAY);
  return {
    limit: ai.budget.monthly_usd,
    spent,
    projected: (spent / elapsedDays) * daysInMonth,
    byKind: Object.fromEntries(rows.map((r) => [r.kind, { usd: r.usd, n: r.n }])) as Record<string, { usd: number; n: number }>,
  };
}

/** Başlıktaki nokta ve açılır kutu için kısa özet */
export async function quickHealth(db: D1Database, now = Date.now()) {
  const [sources, b, last] = await Promise.all([
    sourceHealth(db, now),
    budget(db, now),
    db
      .prepare(`SELECT finished_at FROM runs WHERE kind = 'collect' AND status IN ('ok', 'partial') ORDER BY id DESC LIMIT 1`)
      .first<{ finished_at: string }>(),
  ]);
  const issues: Issue[] = [];
  const lastAge = last ? (now - Date.parse(last.finished_at)) / 3600e3 : Infinity;
  if (lastAge > H.stale_hours)
    issues.push({ level: 'error', text: last ? `Otomatik toplama ${Math.round(lastAge)} saattir çalışmadı.` : 'Henüz başarılı bir toplama yapılmadı.' });
  const red = sources.filter((s) => s.light === 'red');
  const yellow = sources.filter((s) => s.light === 'yellow');
  if (red.length) issues.push({ level: 'error', text: `Veri alınamayan kaynak: ${red.map((s) => s.name).join(', ')}.` });
  if (yellow.length) issues.push({ level: 'warn', text: `Dikkat gerektiren kaynak: ${yellow.map((s) => s.name).join(', ')}.` });
  if (b.spent >= b.limit) issues.push({ level: 'error', text: `Aylık yapay zekâ bütçesi (${b.limit} $) doldu; yeni değerlendirme yapılmıyor.` });
  else if (b.spent >= b.limit * H.budget_warn_ratio)
    issues.push({ level: 'warn', text: `Aylık yapay zekâ bütçesinin %${Math.round((b.spent / b.limit) * 100)}'i kullanıldı.` });
  const level: Level = issues.some((i) => i.level === 'error') ? 'error' : issues.length ? 'warn' : 'ok';
  return { level, issues, sources, budget: b, lastCollect: last?.finished_at ?? null };
}

/** Sağlık sayfasının tamamı */
export async function fullHealth(db: D1Database, now = Date.now()) {
  const quick = await quickHealth(db, now);
  const since3 = new Date(now - 3 * DAY).toISOString();
  const [runs, events, queue, writes, state, index] = await db.batch([
    db.prepare(`SELECT id, kind, started_at, finished_at, status FROM runs ORDER BY id DESC LIMIT 12`),
    db
      .prepare(
        `SELECT level, source, message, detail, MAX(created_at) AS last_at, COUNT(*) AS n FROM run_events
         WHERE level IN ('warn', 'error') AND created_at >= ?1 GROUP BY level, source, message ORDER BY last_at DESC LIMIT 15`,
      )
      .bind(since3),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM works WHERE status IN ('new', 'triage_pending')) AS triage_waiting,
              (SELECT COUNT(*) FROM works WHERE status = 'review_pending') AS review_running,
              (SELECT COUNT(*) FROM ai_batches WHERE status = 'submitted') AS batches,
              (SELECT COUNT(*) FROM reviews WHERE created_at >= ?1) AS reviews_today,
              (SELECT COUNT(*) FROM works) AS works,
              (SELECT COUNT(*) FROM reviews) AS reviews,
              (SELECT COUNT(*) FROM chat_messages WHERE role = 'user' AND created_at >= ?2) AS questions_month`,
    ).bind(day(now), new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)).toISOString()),
    db.prepare(`SELECT day, rows FROM db_writes WHERE day >= ?1 ORDER BY day`).bind(day(now - 13 * DAY)),
    db.prepare(`SELECT key, value FROM app_state WHERE key IN ('db_size', 'fts_count')`),
    db.prepare(`SELECT COUNT(*) AS relevant FROM triage WHERE relevant = 1`),
  ]);

  const runRows = runs.results as unknown as { id: number; kind: string; started_at: string; finished_at: string | null; status: string }[];
  const runEvents = runRows.length
    ? (
        await db
          .prepare(
            `SELECT run_id, level, message FROM run_events WHERE run_id IN (${runRows.map((_, i) => `?${i + 1}`).join(',')}) ORDER BY id`,
          )
          .bind(...runRows.map((r) => r.id))
          .all<{ run_id: number; level: string; message: string }>()
      ).results
    : [];
  const stateMap = Object.fromEntries((state.results as unknown as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const q = queue.results[0] as Record<string, number>;
  const relevant = Number((index.results[0] as { relevant: number | null })?.relevant ?? 0);
  const writeRows = writes.results as unknown as { day: string; rows: number }[];

  return {
    ...quick,
    runs: runRows.map((r) => ({
      ...r,
      // 3 saatten uzun "sürüyor" görünen çalıştırma yarıda kesilmiştir
      status: r.status === 'running' && now - Date.parse(r.started_at) > 3 * 3600e3 ? 'interrupted' : r.status,
      events: runEvents.filter((e) => e.run_id === r.id).map((e) => ({ level: e.level, message: e.message })),
    })),
    events: events.results as unknown as { level: string; source: string | null; message: string; detail: string | null; last_at: string; n: number }[],
    ai: {
      triageWaiting: Number(q.triage_waiting),
      reviewRunning: Number(q.review_running),
      batches: Number(q.batches),
      reviewsToday: Number(q.reviews_today),
      reviewsPerDay: ai.review.max_per_day,
      questionsMonth: Number(q.questions_month),
    },
    data: {
      works: Number(q.works),
      reviews: Number(q.reviews),
      writesToday: writeRows.find((w) => w.day === day(now))?.rows ?? 0,
      writesLimit: D1_DAILY_WRITES,
      writes: writeRows,
      dbBytes: stateMap.db_size ? Number(stateMap.db_size) : null,
      dbLimit: D1_MAX_BYTES,
      // Arama dizini: dizinlenen alakalı yayınların oranı
      indexProgress: relevant ? Math.min(1, Number(stateMap.fts_count ?? 0) / relevant) : 0,
    },
  };
}
export type FullHealth = Awaited<ReturnType<typeof fullHealth>>;
