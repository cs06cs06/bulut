import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { collectSources, linkPreprints } from '../src/jobs/collect.ts';
import { loadJournalTiers, loadPubmedConfig } from '../src/lib/config.ts';
import { parseFeed } from '../src/lib/feed.ts';
import { extractLinks, summarizePage } from '../src/lib/html.ts';
import { buildKeywordFilter, europePmcClause } from '../src/lib/keywords.ts';
import { RunLog } from '../src/lib/runlog.ts';
import { storeRecords } from '../src/lib/store.ts';
import { enrichWorks, invertedToText } from '../src/sources/enrich.ts';
import { rssSource } from '../src/sources/feeds.ts';
import { parseJats } from '../src/sources/fulltext.ts';
import { pageSource } from '../src/sources/pages.ts';
import { rxivSource } from '../src/sources/preprints.ts';
import type { Source } from '../src/sources/types.ts';
import { freshDb, rec } from './helpers.ts';

// ---- Sahte ağ: adres → yanıt ------------------------------------------------
const realFetch = globalThis.fetch;
function mockFetch(routes: Record<string, string | number>) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    const v = key === undefined ? 404 : routes[key];
    return typeof v === 'number' ? new Response('yok', { status: v }) : new Response(v, { status: 200 });
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
});

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/">
<channel><title>Lancet</title>
<item>
  <title>[Articles] Cefiderocol for carbapenem-resistant infections: a randomised trial</title>
  <link>https://www.thelancet.com/journals/laninf/article/PIIS1473-3099(26)00001-1/fulltext</link>
  <description>&lt;p&gt;Background: Carbapenem-resistant infections are a major threat. We did a trial.&lt;/p&gt;</description>
  <dc:creator>Smith J, Doe A</dc:creator>
  <prism:doi>10.1016/S1473-3099(26)00001-1</prism:doi>
  <pubDate>Tue, 06 Oct 2026 23:30:00 GMT</pubDate>
</item>
<item>
  <title>[Correspondence] Heart failure in older adults</title>
  <link>https://www.thelancet.com/x2</link>
  <description>Cardiology letter.</description>
  <pubDate>Wed, 07 Oct 2026 10:00:00 GMT</pubDate>
</item>
<item>
  <title>Old item</title>
  <link>https://www.thelancet.com/x3</link>
  <pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Measles outbreak update</title><link rel="alternate" href="https://example.org/a"/><updated>2026-10-05T10:00:00Z</updated>
<summary>Measles cases rising.</summary><author><name>ECDC</name></author></entry></feed>`;

test('RSS ve Atom beslemeleri okunur; bölüm öneki ayrılır, DOI yalnızca açık alanlardan alınır', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 3);
  assert.equal(items[0].title, 'Cefiderocol for carbapenem-resistant infections: a randomised trial');
  assert.equal(items[0].section, 'Articles');
  assert.equal(items[0].doi, '10.1016/s1473-3099(26)00001-1');
  assert.equal(items[0].date, '2026-10-06');
  assert.deepEqual(items[0].authors, ['Smith J', 'Doe A']);
  assert.equal(items[1].doi, undefined);
  const atom = parseFeed(ATOM);
  assert.equal(atom[0].link, 'https://example.org/a');
  assert.equal(atom[0].date, '2026-10-05');
  assert.deepEqual(atom[0].authors, ['ECDC']);
});

test('anahtar kelime süzgeci alan dışı yayınları eler', () => {
  const f = buildKeywordFilter(loadPubmedConfig());
  assert.ok(f('Cefiderocol for carbapenem-resistant infections'));
  assert.ok(f('Antibiotic stewardship in primary care'));
  assert.ok(f('Bacteremia due to Staphylococcus'));
  assert.ok(!f('Heart failure in older adults'));
  assert.ok(!f('Statins and LDL cholesterol'));
  assert.match(europePmcClause(loadPubmedConfig()), /^TITLE_ABS:\(.+ OR .+\)$/);
});

test('RSS kaynağı tarih ve anahtar kelimeyle süzer, bölümü yayın türüne çevirir', async () => {
  mockFetch({ 'https://feed.test/': RSS });
  const src = rssSource({ id: 'lancet', name: 'Lancet', url: 'https://feed.test/rss', filter: 'keywords' }, 'rss');
  const db = await freshDb();
  const { records } = await src.fetch({ since: '2026-10-01', today: '2026-10-08', firstRun: false, db, keywordFilter: buildKeywordFilter(loadPubmedConfig()) });
  assert.equal(records.length, 1);
  assert.equal(records[0].source, 'rss:lancet');
  assert.deepEqual(records[0].pubTypes, ['Journal Article']);
  assert.equal(records[0].url, 'https://www.thelancet.com/journals/laninf/article/PIIS1473-3099(26)00001-1/fulltext');
  assert.ok(records[0].abstract?.startsWith('Background'));
});

test('sayfa izleme: ilk çalıştırma yalnızca mevcut bağlantıları kaydeder, sonra yalnızca yeniler eklenir', async () => {
  const listing = (extra = '') => `<html><body><nav><a href="/practice-guideline/all-practice-guidelines/">Tümü</a></nav>
    <a href="/practice-guideline/amr-guidance/">IDSA 2026 Guidance on the Treatment of Antimicrobial Resistant Infections</a>
    <a href="https://other.example/x">dış</a>${extra}</body></html>`;
  const cfg = {
    id: 'idsa', name: 'IDSA', url: 'https://www.idsociety.org/practice-guideline/all-practice-guidelines/',
    link: '^https://www\\.idsociety\\.org/practice-guideline/[a-z0-9-]+/?$',
    exclude: '(practice-guidelines|all-practice-guidelines|guidelines-in-development)/?$', kind: 'guideline' as const,
  };
  const db = await freshDb();
  const ctx = { since: '2026-10-01', today: '2026-10-08', db, keywordFilter: () => true };
  mockFetch({ 'https://www.idsociety.org/practice-guideline/all-practice-guidelines/': listing() });
  const first = await pageSource(cfg).fetch({ ...ctx, firstRun: true });
  assert.equal(first.records.length, 0);

  mockFetch({
    'https://www.idsociety.org/practice-guideline/all-practice-guidelines/': listing(
      '<a href="/practice-guideline/c-difficile-2026/">Clostridioides difficile Infection Guideline 2026 Update</a>',
    ),
    'https://www.idsociety.org/practice-guideline/c-difficile-2026/':
      '<html><head><meta property="og:title" content="Clinical Practice Guideline Update: C. difficile | IDSA"></head><body><main><p>Recommendation 1: fidaxomicin.</p></main></body></html>',
  });
  const second = await pageSource(cfg).fetch({ ...ctx, firstRun: false });
  assert.equal(second.records.length, 1);
  assert.equal(second.records[0].title, 'Clinical Practice Guideline Update: C. difficile');
  assert.equal(second.records[0].kind, 'guideline');
  assert.match(second.records[0].abstract ?? '', /fidaxomicin/);

  mockFetch({ 'https://www.idsociety.org/practice-guideline/all-practice-guidelines/': '<html><body>yeni tasarım</body></html>' });
  await assert.rejects(pageSource(cfg).fetch({ ...ctx, firstRun: false }), /sayfa yapısı değişmiş/);
});

test('HTML yardımcıları bağlantıları mutlak adrese çevirir ve sayfa özetini çıkarır', () => {
  const links = extractLinks('<a href="/a?x=1&amp;y=2">A</a><a href="/a?x=1&amp;y=2"></a><a href="#top">üst</a>', 'https://s.test/list/');
  assert.deepEqual(links, [{ url: 'https://s.test/a?x=1&y=2', text: 'A' }]);
  const p = summarizePage('<title>Başlık</title><meta name="description" content="Açıklama"><meta property="article:published_time" content="2026-10-03T08:00"><script>x()</script><p>Metin</p>');
  assert.equal(p.title, 'Başlık');
  assert.equal(p.description, 'Açıklama');
  assert.equal(p.published, '2026-10-03');
  assert.equal(p.text, 'Metin');
});

test('medRxiv: kategori süzgeci, en son sürüm ve yayımlanmış DOI', async () => {
  const item = (o: Record<string, string>) => ({
    doi: '10.1101/2026.10.01.1', title: 'Sepsis cohort', authors: 'Ali V.; Veli A.', date: '2026-10-02', version: '1',
    category: 'infectious diseases', abstract: 'A cohort of sepsis patients.', published: 'NA', server: 'medrxiv', jatsxml: '', ...o,
  });
  mockFetch({
    'https://api.biorxiv.org/details/medrxiv/2026-10-01/2026-10-08/0': JSON.stringify({
      messages: [{ total: '4' }],
      collection: [
        item({}),
        item({ version: '2', published: '10.1093/cid/ciab999', jatsxml: 'https://www.medrxiv.org/x.source.xml' }),
        item({ doi: '10.1101/2', category: 'cardiovascular medicine', title: 'Heart' }),
        item({ doi: '10.1101/3', category: 'epidemiology', title: 'Diabetes trends', abstract: 'No relevant terms.' }),
      ],
    }),
  });
  const src = rxivSource('medrxiv', { categories: ['infectious diseases'], keyword_categories: ['epidemiology'] });
  const db = await freshDb();
  const { records } = await src.fetch({ since: '2026-10-01', today: '2026-10-08', firstRun: false, db, keywordFilter: buildKeywordFilter(loadPubmedConfig()) });
  assert.equal(records.length, 1);
  assert.equal(records[0].url, 'https://www.medrxiv.org/content/10.1101/2026.10.01.1v2');
  assert.equal(records[0].publishedDoi, '10.1093/cid/ciab999');
  assert.equal(records[0].fulltextUrl, 'https://www.medrxiv.org/x.source.xml');
  assert.ok(records[0].isPreprint);
});

test('kaynak çalıştırıcısı: bozuk kaynak diğerlerini durdurmaz, durum ve yineleme doğru tutulur', async () => {
  const db = await freshDb();
  const log = await RunLog.start(db, 'collect');
  const sinceSeen: string[] = [];
  const good: Source = {
    id: 'agency:who_don', name: 'WHO',
    async fetch(ctx) {
      sinceSeen.push(ctx.since);
      return { records: [rec({ source: 'agency:who_don', sourceId: 'mpox', url: 'https://who.test/mpox', title: 'Mpox', kind: 'report' })] };
    },
  };
  const bad: Source = { id: 'rss:bad', name: 'Bozuk', fetch: async () => { throw new Error('HTTP 500'); } };
  const entries = [{ source: bad, lookbackDays: 14 }, { source: good, lookbackDays: 14 }];
  const r1 = await collectSources(db, entries, log, '2026-10-08');
  assert.deepEqual(r1.map((x) => [x.id, x.ok, x.added]), [['rss:bad', false, 0], ['agency:who_don', true, 1]]);
  // Kısa başlıklı (başlık eşleşmesi yapılmayan) kayıt adresinden tanınır ve tekrar eklenmez
  const r2 = await collectSources(db, entries, log, '2026-10-09');
  assert.equal(r2[1].added, 0);
  assert.deepEqual(sinceSeen, ['2026-09-24', '2026-10-05']);
  const st = await db.all<{ source: string; last_error: string | null; last_success_at: string | null }>(
    'SELECT source, last_error, last_success_at FROM source_state ORDER BY source',
  );
  assert.equal(st.find((s) => s.source === 'rss:bad')?.last_error, 'HTTP 500');
  assert.equal(st.find((s) => s.source === 'rss:bad')?.last_success_at, null);
  const ev = await db.all<{ message: string }>("SELECT message FROM run_events WHERE level = 'error'");
  assert.match(ev[0].message, /Bozuk kaynağından veri alınamadı/);
});

test('RSS kaydı sonradan gelen PubMed kaydıyla DOI üzerinden birleşir ve PMID kazanır', async () => {
  const db = await freshDb();
  const tiers = loadJournalTiers();
  await storeRecords(db, [rec({ source: 'rss:cid', sourceId: '10.1/abc', doi: '10.1/abc', url: 'https://oup.test/abc', abstract: 'Kısa.' })], tiers);
  const r = await storeRecords(db, [rec({ pmid: '777', doi: '10.1/abc', abstract: 'Uzun PubMed özeti '.repeat(10) })], tiers);
  assert.equal(r.merged, 1);
  const w = await db.all<{ pmid: string; url: string; abstract: string }>('SELECT pmid, url, abstract FROM works');
  assert.equal(w.length, 1);
  assert.equal(w[0].pmid, '777');
  assert.equal(w[0].url, 'https://oup.test/abc');
  assert.ok(w[0].abstract.startsWith('Uzun'));
});

test('ön baskı ile dergi yayını iki yönlü bağlanır', async () => {
  const db = await freshDb();
  const tiers = loadJournalTiers();
  await storeRecords(db, [
    rec({ source: 'preprint:medrxiv', sourceId: '10.1101/p', doi: '10.1101/p', isPreprint: true, kind: 'preprint', publishedDoi: '10.1/j', title: 'A preprint about sepsis in adults with long title' }),
    rec({ pmid: '1', doi: '10.1/j', title: 'The journal article about bacteremia in children' }),
  ], tiers);
  await linkPreprints(db);
  const rows = await db.all<{ id: number; linked_work_id: number }>('SELECT id, linked_work_id FROM works ORDER BY id');
  assert.deepEqual(rows.map((r) => r.linked_work_id), [rows[1].id, rows[0].id]);
});

test('zenginleştirme: eksik özet OpenAlex ters dizininden tamamlanır', async () => {
  assert.equal(invertedToText({ resistance: [1], Carbapenem: [0], rising: [2] }), 'Carbapenem resistance rising');
  const db = await freshDb();
  await storeRecords(db, [rec({ source: 'rss:jac', sourceId: '10.1/e', doi: '10.1/e', abstract: undefined })], loadJournalTiers());
  const words = Object.fromEntries('word '.repeat(120).trim().split(' ').map((w, i) => [`${w}${i}`, [i]]));
  mockFetch({ 'https://api.openalex.org/works/': JSON.stringify({ abstract_inverted_index: words, authorships: [{ author: { display_name: 'Ayşe Y' } }] }) });
  const s = await enrichWorks(db, 10);
  assert.deepEqual(s, { checked: 1, improved: 1 });
  const [w] = await db.all<{ abstract: string; authors: string; enriched_at: string }>('SELECT abstract, authors, enriched_at FROM works');
  assert.ok(w.abstract.startsWith('word0 word1'));
  assert.equal(w.authors, '["Ayşe Y"]');
  assert.ok(w.enriched_at);
  assert.deepEqual(await enrichWorks(db, 10), { checked: 0, improved: 0 }, 'aynı kayıt yeniden denenmez');
});

test('JATS tam metni bölüm başlıklarıyla, tablolar ve kaynakçasız çıkarılır', () => {
  const para = '<p>Patients received <italic>drug</italic> for sepsis [<xref ref-type="bibr">1</xref>]. '.repeat(30) + '</p>';
  const xml = `<article><front><funding-group><award-group><funding-source>NIH</funding-source></award-group></funding-group></front>
    <body><sec><title>Methods</title>${para}<table-wrap><table><tr><td>99</td></tr></table></table-wrap></sec>
    <sec><title>Results</title>${para}</sec></body>
    <back><fn-group><fn fn-type="conflict"><p>No conflicts.</p></fn></fn-group><ref-list><ref>Ref 1</ref></ref-list></back></article>`;
  const r = parseJats(xml, 100_000);
  assert.ok(r);
  assert.match(r.text, /## Methods\nPatients received drug for sepsis\./);
  assert.match(r.text, /## Results/);
  assert.ok(!r.text.includes('99'));
  assert.ok(!r.text.includes('Ref 1'));
  assert.ok(!r.text.includes('[1]') && !r.text.includes('[]'));
  assert.match(r.text, /Finansman \(tam metin\): NIH/);
  assert.match(r.text, /Çıkar çatışması \(tam metin\): No conflicts\./);
  assert.equal(parseJats('<article><body><p>kısa</p></body></article>', 1000), null);
  assert.ok(parseJats(xml, 2000)?.truncated);
});
