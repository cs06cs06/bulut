-- 4. aşama: ek kaynaklar
ALTER TABLE works ADD COLUMN url TEXT;            -- DOI/PMID'si olmayan kayıtlar için kaynak sayfa (RSS, kurum sayfası)
ALTER TABLE works ADD COLUMN fulltext_url TEXT;   -- açık tam metin (ör. medRxiv JATS XML)
ALTER TABLE works ADD COLUMN published_doi TEXT;  -- ön baskının dergide yayımlanmış hâlinin DOI'si
ALTER TABLE works ADD COLUMN enriched_at TEXT;    -- Crossref/OpenAlex ile tamamlama zamanı
-- Kısmi dizinler: PubMed kayıtlarında bu alanlar boş olduğundan dizine girmezler (D1 yazma kotası)
CREATE INDEX IF NOT EXISTS idx_works_published_doi ON works(published_doi) WHERE published_doi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_works_url ON works(url) WHERE url IS NOT NULL;

-- Web sayfası izleme: görülen bağlantılar (yeni olanlar kayıt olarak eklenir)
CREATE TABLE IF NOT EXISTS page_links (
  source     TEXT NOT NULL,
  url        TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  PRIMARY KEY (source, url)
) WITHOUT ROWID;
