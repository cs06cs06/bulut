-- 7. aşama: haftalık baskı ve yazılar arası ilişkiler

-- Haftalık "öne çıkanlar" baskısı (günlük baskılar yazıların tarihinden türetilir, ayrıca saklanmaz)
CREATE TABLE IF NOT EXISTS issues (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,            -- weekly
  issue_date  TEXT NOT NULL,            -- haftanın son günü (pazar, YYYY-MM-DD, Türkiye saati)
  start_date  TEXT NOT NULL,            -- haftanın ilk günü
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,            -- JSON: giriş yazısı ve öne çıkan üç yazı
  review_ids  TEXT NOT NULL,            -- JSON: haftanın tüm yazıları (reviews.id), önem sırasıyla
  model       TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (kind, issue_date)
);

-- Bir yazının önceki yazılarla ilişkisi (destekliyor, çelişiyor, ...). İki yönlü gösterim için ayrı tablo.
CREATE TABLE IF NOT EXISTS review_links (
  src_review_id INTEGER NOT NULL,       -- yeni yazı
  dst_review_id INTEGER NOT NULL,       -- daha önce sunulan yazı
  relation      TEXT NOT NULL,          -- supports | contradicts | extends | updates | similar
  note          TEXT,
  PRIMARY KEY (src_review_id, dst_review_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_review_links_dst ON review_links(dst_review_id);
