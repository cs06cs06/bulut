import type { LayoutServerLoad } from './$types';

export interface Status {
  unread: number;
  warnings: { level: string; message: string; created_at: string }[];
  lastCollect: string | null;
  newRecords: number | null;
}

/** Her sayfada gerekli küçük durum bilgisi: okunmamış yazı sayısı ve uyarılar (zil + şerit). */
export const load: LayoutServerLoad = async ({ platform, depends }) => {
  depends('app:durum');
  const db = platform?.env.DB;
  if (!db) return { status: { unread: 0, warnings: [], lastCollect: null, newRecords: null } satisfies Status };

  const [unread, warnings, lastCollect] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS n FROM reviews r LEFT JOIN reading_state rs ON rs.work_id = r.work_id WHERE rs.read_at IS NULL`,
    ),
    db
      .prepare(
        `SELECT level, message, created_at FROM run_events
         WHERE level IN ('warn','error') AND created_at >= ?1 ORDER BY id DESC LIMIT 5`,
      )
      .bind(new Date(Date.now() - 36 * 3600e3).toISOString()),
    db.prepare(`SELECT finished_at, summary FROM runs WHERE kind = 'collect' AND status IN ('ok','partial') ORDER BY id DESC LIMIT 1`),
  ]);

  const lc = lastCollect.results?.[0] as { finished_at: string; summary: string | null } | undefined;
  let newRecords: number | null = null;
  try {
    newRecords = lc?.summary ? Number(JSON.parse(lc.summary)?.pubmed?.added ?? null) : null;
  } catch {
    /* özet okunamadı */
  }

  return {
    status: {
      unread: Number((unread.results?.[0] as { n: number } | undefined)?.n ?? 0),
      warnings: (warnings.results ?? []) as Status['warnings'],
      lastCollect: lc?.finished_at ?? null,
      newRecords,
    } satisfies Status,
  };
};
