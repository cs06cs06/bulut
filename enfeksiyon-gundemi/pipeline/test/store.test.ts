import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadJournalTiers } from '../src/lib/config.ts';
import { storeRecords } from '../src/lib/store.ts';
import { freshDb, rec } from './helpers.ts';

const tiers = loadJournalTiers();

test('yeni kayıtlar eklenir, aynı PMID ikinci kez eklenmez', async () => {
  const db = await freshDb();
  const r1 = await storeRecords(db, [rec({ pmid: '1', journalAbbr: 'Clin Infect Dis' }), rec({ pmid: '2', title: 'Another completely different study of influenza vaccination in adults' })], tiers);
  assert.equal(r1.added, 2);
  const r2 = await storeRecords(db, [rec({ pmid: '1', journalAbbr: 'Clin Infect Dis' })], tiers);
  assert.equal(r2.added, 0);
  assert.equal(r2.unchanged, 1);
  const rows = await db.all<{ journal_tier: number }>('SELECT journal_tier FROM works WHERE pmid = ?', ['1']);
  assert.equal(rows[0].journal_tier, 1);
});

test('aynı DOI farklı kaynaktan gelirse birleştirilir', async () => {
  const db = await freshDb();
  await storeRecords(db, [rec({ pmid: '10', doi: '10.1/abc' })], tiers);
  const r = await storeRecords(db, [rec({ source: 'europepmc', sourceId: 'E1', doi: '10.1/abc', pmcid: 'PMC9' })], tiers);
  assert.equal(r.merged, 1);
  assert.equal(r.added, 0);
  const w = await db.all<{ pmcid: string }>('SELECT pmcid FROM works');
  assert.equal(w.length, 1);
  assert.equal(w[0].pmcid, 'PMC9');
  const src = await db.all('SELECT source FROM work_sources ORDER BY source');
  assert.deepEqual(src.map((s) => s.source), ['europepmc', 'pubmed']);
});

test('kimliksiz ama başlığı neredeyse aynı kayıt birleştirilir', async () => {
  const db = await freshDb();
  await storeRecords(db, [rec({ pmid: '20' })], tiers);
  const r = await storeRecords(
    db,
    [rec({ source: 'rss:cid', sourceId: 'u1', title: 'Ceftazidime-Avibactam versus Best Available Therapy for Carbapenem-Resistant Enterobacterales Bacteremia.' })],
    tiers,
  );
  assert.equal(r.merged, 1);
  assert.equal((await db.all('SELECT id FROM works')).length, 1);
});

test('başlık benzer ama PMID farklıysa ayrı yayın sayılır', async () => {
  const db = await freshDb();
  await storeRecords(db, [rec({ pmid: '30' })], tiers);
  const r = await storeRecords(db, [rec({ pmid: '31' })], tiers);
  assert.equal(r.added, 1);
});

test('aynı parti içindeki yinelenenler tek kayıt olur', async () => {
  const db = await freshDb();
  const r = await storeRecords(db, [rec({ pmid: '40', doi: '10.1/x' }), rec({ pmid: '40', doi: '10.1/x' }), rec({ source: 'rss:x', sourceId: 'z', doi: '10.1/x' })], tiers);
  assert.equal(r.added, 1);
  assert.equal((await db.all('SELECT id FROM works')).length, 1);
});

test('aynı DOI ama farklı PMID (mektup + yanıt) iki ayrı kayıt olur', async () => {
  const db = await freshDb();
  const r = await storeRecords(
    db,
    [
      rec({ pmid: '50', doi: '10.1056/nejmc1', title: 'A Multicomponent Intervention to Improve Maternal Infection Outcomes. Reply.' }),
      rec({ pmid: '51', doi: '10.1056/nejmc1', title: 'A Multicomponent Intervention to Improve Maternal Infection Outcomes.' }),
      rec({ pmid: '52', doi: '10.1056/nejmc1', title: 'A Multicomponent Intervention to Improve Maternal Infection Outcomes.' }),
    ],
    tiers,
  );
  assert.equal(r.added, 3);
  assert.equal((await db.all('SELECT * FROM work_sources')).length, 3);
});
