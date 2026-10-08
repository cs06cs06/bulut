// Günlük toplama işi.
// Önce son günleri (çakışmalı) tarar, kalan kotayla geriye dönük taramayı sürdürür.

import { pathToFileURL } from 'node:url';
import { buildPubmedQuery, loadJournalTiers, loadLimits, loadPubmedConfig } from '../lib/config.ts';
import { addDays, daysDesc, isoDay } from '../lib/dates.ts';
import { D1Rest, LocalSqlite, type Db } from '../lib/db.ts';
import { RunLog } from '../lib/runlog.ts';
import { storeRecords } from '../lib/store.ts';
import { PubmedClient } from '../sources/pubmed.ts';

const SOURCE = 'pubmed';

interface SourceState {
  synced_until: string | null;
  backfill_cursor: string | null;
}

export interface CollectSummary {
  days: { day: string; found: number; added: number; merged: number }[];
  added: number;
  failedDays: string[];
  backfillRemaining: boolean;
}

export async function collectPubmed(db: Db, client: PubmedClient, log: RunLog, today = isoDay(new Date())): Promise<CollectSummary> {
  const cfg = loadPubmedConfig();
  const limits = loadLimits();
  const tiers = loadJournalTiers();
  const query = buildPubmedQuery(cfg);

  const state =
    (await db.all<SourceState>('SELECT synced_until, backfill_cursor FROM source_state WHERE source = ?', [SOURCE]))[0] ??
    null;
  const isFirstRun = !state;
  const backfillEnd = addDays(today, -cfg.backfill_days);

  const recentFrom = state?.synced_until ? addDays(state.synced_until, -cfg.overlap_days) : addDays(today, -cfg.overlap_days);
  const recentDays = daysDesc(recentFrom < backfillEnd ? backfillEnd : recentFrom, today);
  let cursor = isFirstRun ? addDays(recentDays[recentDays.length - 1], -1) : state.backfill_cursor;

  const summary: CollectSummary = { days: [], added: 0, failedDays: [], backfillRemaining: false };
  const budget = limits.collect.max_new_records_per_run;

  const runDay = async (day: string): Promise<boolean> => {
    try {
      const search = await client.searchDay(query, day);
      let added = 0;
      let merged = 0;
      for await (const page of client.fetchAll(search)) {
        const r = await storeRecords(db, page, tiers);
        added += r.added;
        merged += r.merged;
      }
      summary.days.push({ day, found: search.count, added, merged });
      summary.added += added;
      await db.all(
        `INSERT INTO source_daily_counts (source, day, found, added) VALUES (?, ?, ?, ?)
         ON CONFLICT (source, day) DO UPDATE SET found = MAX(found, excluded.found), added = added + excluded.added`,
        [SOURCE, day, search.count, added],
      );
      console.log(`  ${day}: ${search.count} bulundu, ${added} yeni, ${merged} birleştirildi`);
      return true;
    } catch (e) {
      summary.failedDays.push(day);
      await log.event('error', SOURCE, `${day} günü indirilemedi; bir sonraki çalıştırmada yeniden denenecek.`, String(e));
      return false;
    }
  };

  // 1) Son günler
  let oldestFailed: string | null = null;
  for (const day of recentDays) {
    if (!(await runDay(day))) oldestFailed = day;
  }
  const syncedUntil = oldestFailed ? addDays(oldestFailed, -1) : today;

  // 2) Geriye dönük tarama (kota kalırsa)
  while (cursor && cursor >= backfillEnd) {
    if (summary.added >= budget) {
      summary.backfillRemaining = true;
      await log.event('info', SOURCE, `Geriye dönük tarama kotası doldu; ${cursor} ve öncesi sonraki çalıştırmada taranacak.`);
      break;
    }
    if (!(await runDay(cursor))) break; // sıradaki çalıştırmada aynı günden devam
    cursor = addDays(cursor, -1);
  }
  if (cursor && cursor < backfillEnd) cursor = null;

  const now = new Date().toISOString();
  const newSynced = state?.synced_until && state.synced_until > syncedUntil ? state.synced_until : syncedUntil;
  await db.all(
    `INSERT INTO source_state (source, last_success_at, last_attempt_at, last_error, synced_until, backfill_cursor, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (source) DO UPDATE SET
       last_success_at = COALESCE(excluded.last_success_at, last_success_at),
       last_attempt_at = excluded.last_attempt_at, last_error = excluded.last_error,
       synced_until = excluded.synced_until, backfill_cursor = excluded.backfill_cursor, updated_at = excluded.updated_at`,
    [
      SOURCE,
      summary.days.length > 0 ? now : null,
      now,
      summary.failedDays.length ? `${summary.failedDays.length} gün indirilemedi` : null,
      newSynced,
      cursor,
      now,
    ],
  );

  await checkVolume(db, log, today, limits.collect.low_volume_warning_ratio);
  return summary;
}

/** Son 3 günün ortalaması, önceki 14 günün ortalamasının belirgin altındaysa uyarır. */
async function checkVolume(db: Db, log: RunLog, today: string, ratio: number): Promise<void> {
  const rows = await db.all<{ day: string; found: number }>(
    'SELECT day, found FROM source_daily_counts WHERE source = ? AND day < ? AND day >= ? ORDER BY day DESC',
    [SOURCE, today, addDays(today, -18)],
  );
  if (rows.length < 10) return; // yeterli geçmiş yok
  const recent = rows.slice(0, 3);
  const base = rows.slice(3);
  const avg = (r: typeof rows) => r.reduce((s, x) => s + x.found, 0) / r.length;
  const a = avg(recent);
  const b = avg(base);
  if (b > 0 && a < b * ratio) {
    await log.event(
      'warn',
      SOURCE,
      `Son 3 günde gelen kayıt sayısı olağanın belirgin altında (günlük ort. ${Math.round(a)}, olağan ${Math.round(b)}). Kaynakta sorun olabilir.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Komut satırından çalıştırma

async function main() {
  const env = process.env;
  let db: Db;
  if (env.LOCAL_DB) {
    const local = await LocalSqlite.open(env.LOCAL_DB);
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { ROOT } = await import('../lib/config.ts');
    const dir = join(ROOT, 'db', 'migrations');
    for (const f of readdirSync(dir).sort()) local.exec(readFileSync(join(dir, f), 'utf8'));
    db = local;
  } else {
    const missing = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Eksik ortam değişkeni: ${missing.join(', ')}`);
    db = await D1Rest.connect(env.CLOUDFLARE_ACCOUNT_ID!, env.CLOUDFLARE_API_TOKEN!, env.D1_DATABASE_NAME ?? 'enfeksiyon-gundemi');
  }
  if (!env.NCBI_API_KEY) console.warn('Uyarı: NCBI_API_KEY yok, yavaş modda (3 istek/sn) çalışılacak.');

  const client = new PubmedClient({ apiKey: env.NCBI_API_KEY, email: env.NCBI_EMAIL });
  const log = await RunLog.start(db, 'collect');
  try {
    const s = await collectPubmed(db, client, log);
    const status = s.failedDays.length === 0 ? 'ok' : s.days.length > 0 ? 'partial' : 'failed';
    await log.event(
      status === 'ok' ? 'info' : 'warn',
      SOURCE,
      `PubMed: ${s.days.length} gün tarandı, ${s.added} yeni kayıt eklendi.` +
        (s.backfillRemaining ? ' Geriye dönük tarama sürüyor.' : ''),
    );
    await log.finish(status, { pubmed: s });
    if (status === 'failed') process.exitCode = 1;
  } catch (e) {
    await log.event('error', SOURCE, 'Toplama beklenmedik bir hatayla durdu.', String(e));
    await log.finish('failed', { error: String(e) });
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
