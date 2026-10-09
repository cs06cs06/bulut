-- Enfeksiyon Gündemi: triyaj, editör yazıları ve yapay zekâ kullanımı

-- Triyaj sonucu (yayın başına bir satır)
CREATE TABLE IF NOT EXISTS triage (
  work_id     INTEGER PRIMARY KEY,
  relevant    INTEGER NOT NULL,          -- 0/1
  importance  INTEGER NOT NULL,          -- 1–5 (0: değerlendirilemedi)
  topics      TEXT,                      -- JSON dizi: konu kodları
  study_type  TEXT,
  title_tr    TEXT,
  summary_tr  TEXT,                      -- kısa not (önem >= 3)
  reason      TEXT,
  source      TEXT NOT NULL,             -- model | rule | refused
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_triage_importance ON triage(importance);

-- Editör yazıları
CREATE TABLE IF NOT EXISTS reviews (
  id            INTEGER PRIMARY KEY,
  work_id       INTEGER NOT NULL UNIQUE,
  impact        TEXT NOT NULL,           -- practice_changing | important | informational
  title_tr      TEXT NOT NULL,
  hook          TEXT NOT NULL,
  body          TEXT NOT NULL,           -- JSON: tüm bölümler
  topics        TEXT,                    -- JSON dizi
  basis         TEXT NOT NULL,           -- abstract | full_text | metadata
  model         TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at);

-- Anthropic toplu işleri (Batch API) — yarım kalan işler sonraki çalıştırmada tamamlanır
CREATE TABLE IF NOT EXISTS ai_batches (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL,           -- triage | review
  batch_id      TEXT NOT NULL UNIQUE,    -- Anthropic kimliği
  status        TEXT NOT NULL,           -- submitted | processed | failed
  request_count INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  processed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_batches_status ON ai_batches(status);

-- Her yapay zekâ çağrısının token ve maliyet kaydı
CREATE TABLE IF NOT EXISTS ai_usage (
  id            INTEGER PRIMARY KEY,
  created_at    TEXT NOT NULL,
  kind          TEXT NOT NULL,           -- triage | review | qa | weekly
  model         TEXT NOT NULL,
  is_batch      INTEGER NOT NULL,
  requests      INTEGER NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens  INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  cost_usd      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);

-- Günlük D1 yazma sayacı (ücretsiz kota: günde 100.000 satır)
CREATE TABLE IF NOT EXISTS db_writes (
  day   TEXT PRIMARY KEY,                -- UTC gün (YYYY-MM-DD), kota UTC gece yarısı sıfırlanır
  rows  INTEGER NOT NULL
) WITHOUT ROWID;
