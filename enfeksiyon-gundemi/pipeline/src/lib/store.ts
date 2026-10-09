// Kayıtları veritabanına yazar; yinelenenleri PMID, DOI ve başlık benzerliğiyle birleştirir.

import { lookupJournal, type JournalInfo } from './config.ts';
import { selectIn, type Db, type Stmt } from './db.ts';
import { titleFingerprint, titleKey, titleSimilarity, type NormalizedRecord } from './normalize.ts';

/** Bu benzerliğin üzerindeki başlıklar (aynı yıl ve uyumlu kimliklerle) aynı yayın sayılır. */
export const TITLE_MATCH_THRESHOLD = 0.93;

interface ExistingWork {
  id: number;
  pmid: string | null;
  doi: string | null;
  title_fp: string;
  pub_date: string | null;
  url: string | null;
}

export interface StoreResult {
  added: number;
  merged: number; // mevcut bir yayınla birleştirilen (yeni kaynak izi eklendi)
  unchanged: number; // zaten aynı kaynaktan kayıtlıydı
  addedIds: number[];
}

const json = (v: unknown[]) => (v.length ? JSON.stringify(v) : null);

/**
 * Bir kayıt grubunu veritabanına işler.
 * Yazma kotasını korumak için önce mevcut eşleşmeler okunur, sadece gerçekten yeni olanlar yazılır.
 */
export async function storeRecords(
  db: Db,
  records: NormalizedRecord[],
  tiers: Map<string, JournalInfo>,
  now = new Date().toISOString(),
): Promise<StoreResult> {
  const result: StoreResult = { added: 0, merged: 0, unchanged: 0, addedIds: [] };
  if (records.length === 0) return result;

  // Aynı parti içindeki yinelenenleri at
  const seen = new Set<string>();
  const batch = records.filter((r) => {
    const k = `${r.source}:${r.sourceId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 1) Olası eşleşmeleri toplu oku
  const pmids = batch.map((r) => r.pmid).filter(Boolean) as string[];
  const dois = batch.map((r) => r.doi).filter(Boolean) as string[];
  const fps = batch.map((r) => titleFingerprint(r.title));
  const keys = [...new Set(fps.map(titleKey))];
  const urls = batch.map((r) => r.url).filter(Boolean) as string[];
  const cols = 'id, pmid, doi, title_fp, pub_date, url';
  const candidates = new Map<number, ExistingWork>();
  for (const w of [
    ...(await selectIn<ExistingWork>(db, (ph) => `SELECT ${cols} FROM works WHERE pmid IN (${ph})`, pmids)),
    ...(await selectIn<ExistingWork>(db, (ph) => `SELECT ${cols} FROM works WHERE doi IN (${ph})`, dois)),
    ...(await selectIn<ExistingWork>(db, (ph) => `SELECT ${cols} FROM works WHERE title_key IN (${ph})`, keys)),
    ...(await selectIn<ExistingWork>(db, (ph) => `SELECT ${cols} FROM works WHERE url IN (${ph}) AND url IS NOT NULL`, urls)),
  ])
    candidates.set(w.id, w);

  const byPmid = new Map<string, ExistingWork>();
  const byDoi = new Map<string, ExistingWork>();
  const byKey = new Map<string, ExistingWork[]>();
  const byUrl = new Map<string, ExistingWork>();
  for (const w of candidates.values()) {
    if (w.pmid) byPmid.set(w.pmid, w);
    if (w.doi) byDoi.set(w.doi, w);
    if (w.url) byUrl.set(w.url, w);
    const k = titleKey(w.title_fp);
    byKey.set(k, [...(byKey.get(k) ?? []), w]);
  }

  // Mevcut kaynak izleri
  const knownSources = new Set(
    (
      await selectIn<{ work_id: number; source: string }>(
        db,
        (ph) => `SELECT work_id, source FROM work_sources WHERE work_id IN (${ph})`,
        [...candidates.keys()],
      )
    ).map((r) => `${r.work_id}:${r.source}`),
  );

  // 2) Her kayıt için eşleşme bul
  const inserts: { rec: NormalizedRecord; fp: string }[] = [];
  const stmts: Stmt[] = [];
  batch.forEach((rec, i) => {
    const fp = fps[i];
    const match = findMatch(rec, fp, byPmid, byDoi, byKey, byUrl);
    if (!match) {
      inserts.push({ rec, fp });
      // Aynı partideki sonraki kayıtlar bu yeni kayıtla eşleşebilsin
      const placeholder: ExistingWork = {
        id: -inserts.length, pmid: rec.pmid ?? null, doi: rec.doi ?? null, title_fp: fp, pub_date: rec.pubDate ?? null, url: rec.url ?? null,
      };
      if (rec.pmid) byPmid.set(rec.pmid, placeholder);
      if (rec.doi) byDoi.set(rec.doi, placeholder);
      if (rec.url) byUrl.set(rec.url, placeholder);
      byKey.set(titleKey(fp), [...(byKey.get(titleKey(fp)) ?? []), placeholder]);
      return;
    }
    if (match.id < 0) {
      result.unchanged++; // aynı partide zaten eklenecek
      return;
    }
    if (knownSources.has(`${match.id}:${rec.source}`)) {
      result.unchanged++;
      return;
    }
    knownSources.add(`${match.id}:${rec.source}`);
    result.merged++;
    stmts.push({
      sql: 'INSERT OR IGNORE INTO work_sources (work_id, source, source_id, first_seen_at) VALUES (?, ?, ?, ?)',
      params: [match.id, rec.source, rec.sourceId, now],
    });
    // Eksik kimlikleri tamamla (ör. önce DOI'siz geldiyse). Yalnızca bir şey değişecekse yazılır (D1 kotası).
    const fill = [
      match.pmid ? null : (rec.pmid ?? null),
      match.doi ? null : (rec.doi ?? null),
      rec.pmcid ?? null,
      rec.abstract ?? null, rec.abstract ?? null, rec.abstract ?? null,
      rec.url ?? null, rec.fulltextUrl ?? null, rec.publishedDoi ?? null,
    ];
    stmts.push({
      // Daha kısa bir özet (ör. RSS tanıtım metni) PubMed özetiyle değiştirilir; tersi yapılmaz.
      sql: `UPDATE works SET
              pmid = COALESCE(pmid, ?), doi = COALESCE(doi, ?), pmcid = COALESCE(pmcid, ?),
              abstract = CASE WHEN ? IS NOT NULL AND LENGTH(?) > COALESCE(LENGTH(abstract), 0) THEN ? ELSE abstract END,
              url = COALESCE(url, ?), fulltext_url = COALESCE(fulltext_url, ?), published_doi = COALESCE(published_doi, ?),
              updated_at = ?
            WHERE id = ? AND (
              (pmid IS NULL AND ? IS NOT NULL) OR (doi IS NULL AND ? IS NOT NULL) OR (pmcid IS NULL AND ? IS NOT NULL)
              OR (? IS NOT NULL AND LENGTH(?) > COALESCE(LENGTH(abstract), 0))
              OR (url IS NULL AND ? IS NOT NULL) OR (fulltext_url IS NULL AND ? IS NOT NULL) OR (published_doi IS NULL AND ? IS NOT NULL))`,
      params: [
        ...fill,
        now,
        match.id,
        ...fill.slice(0, 3),
        rec.abstract ?? null, rec.abstract ?? null,
        ...fill.slice(6),
      ],
    });
  });

  if (stmts.length) await db.batch(stmts);

  // 3) Yeni kayıtları ekle: önce works (RETURNING id), sonra work_sources
  const CHUNK = 25;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    const res = await db.batch(
      chunk.map(({ rec, fp }) => {
        const j = lookupJournal(tiers, rec.journalAbbr, rec.journal);
        return {
          sql: `INSERT INTO works (pmid, doi, pmcid, title, title_fp, title_key, abstract, authors, journal, journal_abbr,
                  issn, journal_tier, is_turkish_journal, pub_date, pub_types, mesh, keywords, language, coi, grants,
                  is_preprint, preprint_server, kind, url, fulltext_url, published_doi, status, first_seen_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?)
                ON CONFLICT DO NOTHING
                RETURNING id`,
          params: [
            rec.pmid ?? null, rec.doi ?? null, rec.pmcid ?? null, rec.title, fp, titleKey(fp),
            rec.abstract ?? null, json(rec.authors), rec.journal ?? null, rec.journalAbbr ?? null,
            rec.issn ?? null, j?.tier ?? null, j?.turkiye ? 1 : 0, rec.pubDate ?? null,
            json(rec.pubTypes), json(rec.mesh), json(rec.keywords), rec.language ?? null, rec.coi ?? null,
            json(rec.grants), rec.isPreprint ? 1 : 0, rec.preprintServer ?? null, rec.kind,
            rec.url ?? null, rec.fulltextUrl ?? null, rec.publishedDoi ?? null, now, now,
          ],
        };
      }),
    );
    const links: Stmt[] = [];
    res.forEach((rows, k) => {
      const id = rows[0]?.id as number | undefined;
      if (id == null) {
        result.unchanged++; // PMID başka bir çalıştırmada eklenmiş
        return;
      }
      result.added++;
      result.addedIds.push(id);
      const { rec } = chunk[k];
      links.push({
        sql: 'INSERT OR IGNORE INTO work_sources (work_id, source, source_id, first_seen_at) VALUES (?, ?, ?, ?)',
        params: [id, rec.source, rec.sourceId, now],
      });
    });
    if (links.length) await db.batch(links);
  }
  return result;
}

function findMatch(
  rec: NormalizedRecord,
  fp: string,
  byPmid: Map<string, ExistingWork>,
  byDoi: Map<string, ExistingWork>,
  byKey: Map<string, ExistingWork[]>,
  byUrl: Map<string, ExistingWork>,
): ExistingWork | undefined {
  if (rec.pmid && byPmid.has(rec.pmid)) return byPmid.get(rec.pmid);
  // Aynı DOI ama farklı PMID → ayrı yayın (ör. NEJM'de mektup ve yanıtı aynı DOI'yi paylaşır)
  const byDoiHit = rec.doi ? byDoi.get(rec.doi) : undefined;
  if (byDoiHit && !(rec.pmid && byDoiHit.pmid && rec.pmid !== byDoiHit.pmid)) return byDoiHit;
  // Aynı kaynak sayfası (DOI'siz kurum duyuruları, WHO bildirimleri)
  const byUrlHit = rec.url ? byUrl.get(rec.url) : undefined;
  if (byUrlHit && !(rec.pmid && byUrlHit.pmid && rec.pmid !== byUrlHit.pmid) && !(rec.doi && byUrlHit.doi && rec.doi !== byUrlHit.doi))
    return byUrlHit;
  // Başlık benzerliği: kimlikler çelişmemeli, yayın yılları en fazla 1 yıl farklı olmalı
  const year = rec.pubDate ? Number(rec.pubDate.slice(0, 4)) : undefined;
  for (const w of byKey.get(titleKey(fp)) ?? []) {
    if (rec.pmid && w.pmid && rec.pmid !== w.pmid) continue;
    if (rec.doi && w.doi && rec.doi !== w.doi) continue;
    const wy = w.pub_date ? Number(w.pub_date.slice(0, 4)) : undefined;
    if (year && wy && Math.abs(year - wy) > 1) continue;
    if (fp.length < 25) continue; // "Editorial", "Correction" gibi kısa başlıklar eşleşmez
    if (titleSimilarity(fp, w.title_fp) >= TITLE_MATCH_THRESHOLD) return w;
  }
  return undefined;
}
