-- Okuma takibi ve kaydedilenler (tek kullanıcı)
CREATE TABLE IF NOT EXISTS reading_state (
  work_id   INTEGER PRIMARY KEY,
  read_at   TEXT,
  saved_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_reading_saved ON reading_state(saved_at);
