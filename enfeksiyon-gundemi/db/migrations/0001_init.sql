-- Enfeksiyon Gündemi: ilk şema
-- Tek bir yayın = tek bir "work". Aynı yayın farklı kaynaklardan gelirse
-- work_sources tablosunda iz bırakır ama works'te tek satırdır.

CREATE TABLE IF NOT EXISTS works (
  id              INTEGER PRIMARY KEY,
  pmid            TEXT UNIQUE,
  doi             TEXT,                 -- küçük harf, "https://doi.org/" öneki yok. Benzersiz DEĞİL:
                                        -- NEJM mektup + yanıt gibi farklı PMID'li kayıtlar aynı DOI'yi paylaşabilir.
  pmcid           TEXT,
  title           TEXT NOT NULL,
  title_fp        TEXT NOT NULL,        -- yineleme tespiti için normalize başlık
  title_key       TEXT NOT NULL,        -- title_fp'nin ilk 40 karakteri (hızlı aday arama)
  abstract        TEXT,
  authors         TEXT,                 -- JSON dizi: ["Smith J", ...]
  journal         TEXT,                 -- tam dergi adı
  journal_abbr    TEXT,                 -- NLM kısaltması
  issn            TEXT,
  journal_tier    INTEGER,              -- 1, 2 veya NULL
  is_turkish_journal INTEGER NOT NULL DEFAULT 0,
  pub_date        TEXT,                 -- YYYY-MM-DD (bilinen en iyi tarih)
  pub_types       TEXT,                 -- JSON dizi
  mesh            TEXT,                 -- JSON dizi
  keywords        TEXT,                 -- JSON dizi
  language        TEXT,
  coi             TEXT,                 -- çıkar çatışması beyanı (varsa)
  grants          TEXT,                 -- JSON dizi: finansman kuruluşları
  is_preprint     INTEGER NOT NULL DEFAULT 0,
  preprint_server TEXT,
  linked_work_id  INTEGER,              -- ön baskı <-> dergi yayını bağlantısı
  kind            TEXT NOT NULL DEFAULT 'article',  -- article | preprint | guideline | report
  status          TEXT NOT NULL DEFAULT 'new',      -- new | triaged | rejected | selected | reviewed
  first_seen_at   TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_works_doi        ON works(doi);
CREATE INDEX IF NOT EXISTS idx_works_title_key  ON works(title_key);
CREATE INDEX IF NOT EXISTS idx_works_first_seen ON works(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_works_status     ON works(status);
CREATE INDEX IF NOT EXISTS idx_works_pub_date   ON works(pub_date);

CREATE TABLE IF NOT EXISTS work_sources (
  work_id       INTEGER NOT NULL,
  source        TEXT NOT NULL,          -- pubmed | europepmc | medrxiv | rss:<ad> | ...
  source_id     TEXT,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (work_id, source)
) WITHOUT ROWID;

-- Çalıştırma kayıtları (sağlık panosu bunları okur)
CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,            -- collect | triage | review | ...
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL DEFAULT 'running',  -- running | ok | partial | failed
  summary     TEXT                      -- JSON
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);

CREATE TABLE IF NOT EXISTS run_events (
  id         INTEGER PRIMARY KEY,
  run_id     INTEGER NOT NULL,
  source     TEXT,
  level      TEXT NOT NULL,             -- info | warn | error
  message    TEXT NOT NULL,             -- sade Türkçe açıklama
  detail     TEXT,                      -- teknik ayrıntı
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id);

-- Her kaynağın durumu
CREATE TABLE IF NOT EXISTS source_state (
  source           TEXT PRIMARY KEY,
  last_success_at  TEXT,
  last_attempt_at  TEXT,
  last_error       TEXT,
  synced_until     TEXT,                -- bu tarihe kadar (dahil) tarandı (YYYY-MM-DD)
  backfill_cursor  TEXT,                -- geriye dönük taramada sıradaki gün
  updated_at       TEXT NOT NULL
);

-- Kaynak başına günlük kayıt sayısı (beklenti sapması uyarısı için)
CREATE TABLE IF NOT EXISTS source_daily_counts (
  source  TEXT NOT NULL,
  day     TEXT NOT NULL,                -- PubMed giriş günü (YYYY-MM-DD)
  found   INTEGER NOT NULL,             -- kaynakta bulunan
  added   INTEGER NOT NULL,             -- yeni eklenen
  PRIMARY KEY (source, day)
) WITHOUT ROWID;
