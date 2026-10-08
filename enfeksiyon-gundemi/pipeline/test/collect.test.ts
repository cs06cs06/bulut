import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectPubmed } from '../src/jobs/collect.ts';
import type { NormalizedRecord } from '../src/lib/normalize.ts';
import { RunLog } from '../src/lib/runlog.ts';
import type { PubmedClient } from '../src/sources/pubmed.ts';
import { freshDb, rec } from './helpers.ts';

/** Her gün için 3 kayıt döndüren sahte PubMed istemcisi */
function fakeClient(failDays: string[] = []) {
  const calls: string[] = [];
  const client = {
    async searchDay(_q: string, day: string) {
      calls.push(day);
      if (failDays.includes(day)) throw new Error('ağ hatası');
      return { count: 3, webEnv: day, queryKey: '1' };
    },
    async *fetchAll(s: { webEnv: string }): AsyncGenerator<NormalizedRecord[]> {
      yield [1, 2, 3].map((i) => rec({ pmid: `${s.webEnv.replaceAll('-', '')}${i}`, title: `Study number ${i} published on day ${s.webEnv} about sepsis outcomes` }));
    },
  };
  return { client: client as unknown as PubmedClient, calls };
}

test('ilk çalıştırma son günleri ve geriye dönük taramayı yapar, ikinci çalıştırma yalnızca çakışma penceresini tarar', async () => {
  const db = await freshDb();
  const log = await RunLog.start(db, 'collect');
  const { client, calls } = fakeClient();
  const s1 = await collectPubmed(db, client, log, '2026-10-08');
  // pubmed.yaml: backfill_days 30 → 31 gün (bugün dahil)
  assert.equal(calls.length, 31);
  assert.equal(s1.added, 93);
  assert.equal(s1.backfillRemaining, false);

  const { client: c2, calls: calls2 } = fakeClient();
  const s2 = await collectPubmed(db, c2, log, '2026-10-09');
  assert.deepEqual(calls2, ['2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05']);
  assert.equal(s2.added, 3); // yalnızca yeni gün
  const st = await db.all<{ synced_until: string; backfill_cursor: string | null }>('SELECT * FROM source_state');
  assert.equal(st[0].synced_until, '2026-10-09');
  assert.equal(st[0].backfill_cursor, null);
});

test('başarısız gün bir sonraki çalıştırmada yeniden denenir', async () => {
  const db = await freshDb();
  const log = await RunLog.start(db, 'collect');
  const s1 = await collectPubmed(db, fakeClient(['2026-10-07']).client, log, '2026-10-08');
  assert.deepEqual(s1.failedDays, ['2026-10-07']);
  const st = await db.all<{ synced_until: string }>('SELECT synced_until FROM source_state');
  assert.equal(st[0].synced_until, '2026-10-06');
  const events = await db.all<{ level: string }>("SELECT level FROM run_events WHERE level = 'error'");
  assert.equal(events.length, 1);

  const { client, calls } = fakeClient();
  await collectPubmed(db, client, log, '2026-10-08');
  assert.ok(calls.includes('2026-10-07'));
});
