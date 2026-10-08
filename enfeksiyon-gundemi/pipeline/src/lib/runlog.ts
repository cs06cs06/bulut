// Çalıştırma kayıtları: hem konsola hem veritabanına (sağlık panosu için) yazar.

import type { Db } from './db.ts';

export type Level = 'info' | 'warn' | 'error';

export class RunLog {
  private constructor(
    private db: Db,
    public id: number,
  ) {}

  static async start(db: Db, kind: string): Promise<RunLog> {
    const rows = await db.all<{ id: number }>(
      'INSERT INTO runs (kind, started_at, status) VALUES (?, ?, ?) RETURNING id',
      [kind, new Date().toISOString(), 'running'],
    );
    return new RunLog(db, rows[0].id);
  }

  /** message: sade Türkçe açıklama; detail: teknik ayrıntı (isteğe bağlı) */
  async event(level: Level, source: string | null, message: string, detail?: string): Promise<void> {
    const line = `[${level.toUpperCase()}]${source ? ` [${source}]` : ''} ${message}${detail ? ` — ${detail}` : ''}`;
    (level === 'error' ? console.error : console.log)(line);
    try {
      await this.db.all(
        'INSERT INTO run_events (run_id, source, level, message, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [this.id, source, level, message, detail?.slice(0, 2000) ?? null, new Date().toISOString()],
      );
    } catch (e) {
      console.error('Kayıt yazılamadı:', e);
    }
  }

  async finish(status: 'ok' | 'partial' | 'failed', summary: unknown): Promise<void> {
    await this.db.all('UPDATE runs SET finished_at = ?, status = ?, summary = ? WHERE id = ?', [
      new Date().toISOString(),
      status,
      JSON.stringify(summary),
      this.id,
    ]);
  }
}
