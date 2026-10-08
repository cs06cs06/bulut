// Veritabanı erişimi: üretimde Cloudflare D1 (REST API), testlerde yerel SQLite.

import { fetchWithRetry, HttpError, RateLimiter } from './http.ts';

export type Param = string | number | null;
export interface Stmt {
  sql: string;
  params?: Param[];
}
export type Row = Record<string, unknown>;

export interface Db {
  /** Bu bağlantıyla yazılan satır sayısı (D1 kotası takibi için) */
  rowsWritten: number;
  all<T = Row>(sql: string, params?: Param[]): Promise<T[]>;
  /** Birden çok ifadeyi tek seferde (tek işlem olarak) çalıştırır. */
  batch(stmts: Stmt[]): Promise<Row[][]>;
}

/** D1 sorgu başına en fazla 100 bağlı parametreye izin verir. */
export const MAX_PARAMS = 100;

/** "IN (?, ?, ...)" sorgularını parametre sınırına göre parçalar. */
export async function selectIn<T = Row>(
  db: Db,
  sqlWithIn: (placeholders: string) => string,
  values: Param[],
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += MAX_PARAMS) {
    const chunk = values.slice(i, i + MAX_PARAMS);
    const ph = chunk.map(() => '?').join(',');
    out.push(...(await db.all<T>(sqlWithIn(ph), chunk)));
  }
  return out;
}

/** Cloudflare D1 ücretsiz katmanının günlük yazma kotası doldu (UTC gece yarısı sıfırlanır). */
export class QuotaExceededError extends Error {
  constructor(detail: string) {
    super(`D1 günlük yazma kotası doldu: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Cloudflare D1 (REST)

interface D1Response {
  success: boolean;
  errors: { code: number; message: string }[];
  result: { success?: boolean; results?: Row[]; meta?: { rows_written?: number } }[];
}

export class D1Rest implements Db {
  rowsWritten = 0;
  private limiter = new RateLimiter(3);
  constructor(
    private accountId: string,
    private apiToken: string,
    private databaseId: string,
  ) {}

  static async connect(accountId: string, apiToken: string, name: string): Promise<D1Rest> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database?name=${encodeURIComponent(name)}`;
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${apiToken}` } });
    const json = (await res.json()) as { result: { uuid: string; name: string }[] };
    const db = json.result.find((d) => d.name === name);
    if (!db) throw new Error(`D1 veritabanı bulunamadı: ${name}. Önce kurulum (deploy) iş akışı çalışmalı.`);
    return new D1Rest(accountId, apiToken, db.uuid);
  }

  private async post(body: unknown): Promise<D1Response['result']> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
    let res: Response;
    try {
      res = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        { limiter: this.limiter },
      );
    } catch (e) {
      if (e instanceof HttpError) {
        if (/row write limit|exceeded D1's free tier/i.test(e.body)) throw new QuotaExceededError(e.body.slice(0, 200));
        throw new Error(`D1 hatası (${e.status}): ${e.body}`);
      }
      throw e;
    }
    const json = (await res.json()) as D1Response;
    if (!json.success) throw new Error(`D1 hatası: ${json.errors.map((e) => e.message).join('; ')}`);
    for (const r of json.result) this.rowsWritten += r.meta?.rows_written ?? 0;
    return json.result;
  }

  async all<T = Row>(sql: string, params: Param[] = []): Promise<T[]> {
    const result = await this.post({ sql, params });
    return (result[0]?.results ?? []) as T[];
  }

  async batch(stmts: Stmt[]): Promise<Row[][]> {
    if (stmts.length === 0) return [];
    const result = await this.post({ batch: stmts.map((s) => ({ sql: s.sql, params: s.params ?? [] })) });
    return result.map((r) => r.results ?? []);
  }
}

// ---------------------------------------------------------------------------
// Yerel SQLite (testler ve yerel deneme için)

export class LocalSqlite implements Db {
  rowsWritten = 0;
  // node:sqlite deneysel olduğu için dinamik yükleniyor.
  private constructor(private db: import('node:sqlite').DatabaseSync) {}

  static async open(path = ':memory:'): Promise<LocalSqlite> {
    const { DatabaseSync } = await import('node:sqlite');
    return new LocalSqlite(new DatabaseSync(path));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  /** D1 ile aynı davranmak için parametre sınırını burada da uygularız. */
  private check(params: Param[] | undefined): Param[] {
    const p = params ?? [];
    if (p.length > MAX_PARAMS) throw new Error(`too many SQL variables (${p.length} > ${MAX_PARAMS}, D1 sınırı)`);
    return p;
  }

  async all<T = Row>(sql: string, params: Param[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...this.check(params)) as T[];
  }

  async batch(stmts: Stmt[]): Promise<Row[][]> {
    const out: Row[][] = [];
    this.db.exec('BEGIN');
    try {
      for (const s of stmts) {
        const st = this.db.prepare(s.sql);
        const p = this.check(s.params);
        out.push(/^\s*(select|with)\b/i.test(s.sql) || /\breturning\b/i.test(s.sql) ? (st.all(...p) as Row[]) : (st.run(...p), []));
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Günlük yazma kotası

/** D1 ücretsiz katmanı: günde 100.000 satır yazma. Güvenlik payı bırakıyoruz. */
export const DAILY_WRITE_LIMIT = 85_000;

const utcDay = () => new Date().toISOString().slice(0, 10);

/** Bugün (UTC) daha önceki çalıştırmalarda yazılan satırlar + bu çalıştırmada yazılanlar */
export async function writesToday(db: Db): Promise<number> {
  const rows = await db.all<{ rows: number }>('SELECT rows FROM db_writes WHERE day = ?', [utcDay()]);
  return (rows[0]?.rows ?? 0) + db.rowsWritten;
}

/** Çalıştırma sonunda bu bağlantının yazdığı satırları günlük sayaca ekler. */
export async function recordWrites(db: Db): Promise<void> {
  const n = db.rowsWritten;
  console.log(`Veritabanına yazılan satır: ${n} (bugün toplam: ${await writesToday(db)}, ücretsiz kota: 100.000)`);
  await db.all(
    'INSERT INTO db_writes (day, rows) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET rows = rows + excluded.rows',
    [utcDay(), n],
  );
  db.rowsWritten = 0;
}

/**
 * Komut satırı işleri için: kota dolduysa işi hata vermeden durdurur (yarım kalan iş
 * bir sonraki çalıştırmada kaldığı yerden sürer), diğer hatalarda çıkış kodunu 1 yapar.
 */
export function exitOnError(e: unknown): void {
  if (e instanceof QuotaExceededError) {
    console.log(
      '::warning::Cloudflare veritabanının günlük ücretsiz yazma kotası doldu. ' +
        'İş, kota UTC gece yarısı (TR 03:00) sıfırlandıktan sonraki çalıştırmada kaldığı yerden devam edecek.',
    );
    return;
  }
  console.error(e);
  process.exitCode = 1;
}
