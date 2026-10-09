-- 5. aşama: soru-cevap
-- Sohbetler: makale bazında (work_id dolu) ya da genel arşiv sorusu (work_id NULL)
CREATE TABLE IF NOT EXISTS chats (
  id         INTEGER PRIMARY KEY,
  work_id    INTEGER,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chats_work ON chats(work_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY,
  chat_id    INTEGER NOT NULL,
  role       TEXT NOT NULL,             -- user | assistant
  content    TEXT NOT NULL,
  sources    TEXT,                      -- kullanıcı sorusu için bulunan yayınlar: JSON [work_id, ...]
  status     TEXT,                      -- yanıt: ok | refused | incomplete | not_found
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id);

-- Editör yazısında kullanılan açık erişimli tam metin (makale sorularında da kullanılır)
CREATE TABLE IF NOT EXISTS fulltexts (
  work_id    INTEGER PRIMARY KEY,
  source     TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Arşiv araması: yalnızca triyajda alakalı bulunan yayınlar dizinlenir.
-- İçeriksiz (content='') FTS5: metinler works tablosunda durur, burada yalnızca dizin tutulur.
-- tr = Türkçe başlık + kısa not. Türkçe "ı" dizinlemeden önce "i"ye çevrilir.
CREATE VIRTUAL TABLE IF NOT EXISTS works_fts USING fts5(
  title, abstract, tr,
  content = '',
  tokenize = 'porter unicode61 remove_diacritics 2'
);

-- Küçük durum değerleri (ör. arama dizininin nereye kadar güncellendiği)
CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
