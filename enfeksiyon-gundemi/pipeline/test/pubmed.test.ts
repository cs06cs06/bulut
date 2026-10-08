import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildPubmedQuery, loadJournalTiers, loadPubmedConfig, lookupJournal } from '../src/lib/config.ts';
import { normalizeDoi, stripTags, titleFingerprint } from '../src/lib/normalize.ts';
import { parsePubmedXml } from '../src/sources/pubmed.ts';

const xml = readFileSync(join(import.meta.dirname, 'fixtures', 'pubmed-sample.xml'), 'utf8');

test('PubMed XML ayrıştırılır', () => {
  const recs = parsePubmedXml(xml);
  assert.equal(recs.length, 8);
  for (const r of recs) {
    assert.match(r.pmid!, /^\d+$/);
    assert.ok(r.title.length > 10, 'başlık var');
    assert.ok(!r.title.includes('<'), 'başlıkta etiket kalmamalı');
    assert.ok(r.pubDate && /^\d{4}-\d{2}-\d{2}$/.test(r.pubDate), `tarih biçimi: ${r.pubDate}`);
    if (r.doi) assert.match(r.doi, /^10\./);
  }
  // Yapılandırılmış özet etiketleri korunur
  assert.ok(recs.some((r) => /^(BACKGROUND|OBJECTIVE): /m.test(r.abstract ?? '')));
  // Kaynakçadaki kimlikler makalenin kendisine karışmamalı: her kaydın tek bir DOI'si var
  const dois = recs.map((r) => r.doi).filter(Boolean);
  assert.equal(new Set(dois).size, dois.length);
  assert.ok(recs.some((r) => r.coi), 'en az bir çıkar çatışması beyanı');
  assert.ok(recs.every((r) => r.pubTypes.length > 0));
});

test('DOI normalleştirme', () => {
  assert.equal(normalizeDoi('https://doi.org/10.1093/CID/ciad123.'), '10.1093/cid/ciad123');
  assert.equal(normalizeDoi('doi: 10.1016/S1473-3099(24)00001-X'), '10.1016/s1473-3099(24)00001-x');
  assert.equal(normalizeDoi('not a doi'), undefined);
});

test('başlık parmak izi Türkçe karakterleri ve etiketleri sadeleştirir', () => {
  assert.equal(titleFingerprint('Kırım-Kongo <i>Kanamalı</i> Ateşi: Güncel Durum'), 'kirim kongo kanamali atesi guncel durum');
  assert.equal(stripTags('<i>E. coli</i> &amp; K. pneumoniae&#8217;s'), 'E. coli & K. pneumoniae’s');
});

test('sorgu ve dergi katmanları yapılandırmadan okunur', () => {
  const q = buildPubmedQuery(loadPubmedConfig());
  assert.ok(q.includes('"Sepsis"[Mesh]'));
  assert.ok(q.includes('NOT "Plant Diseases"[Mesh]'));
  const tiers = loadJournalTiers();
  assert.equal(lookupJournal(tiers, 'Clin Infect Dis')?.tier, 1);
  assert.equal(lookupJournal(tiers, undefined, 'The Lancet')?.tier, 1);
  assert.equal(lookupJournal(tiers, 'Klimik Derg')?.turkiye, true);
  assert.equal(lookupJournal(tiers, 'Some Unknown J'), undefined);
});
