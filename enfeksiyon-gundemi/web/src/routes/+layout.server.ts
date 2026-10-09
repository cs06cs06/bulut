import { quickHealth, type Issue, type Level } from '$lib/server/health';
import type { LayoutServerLoad } from './$types';

export interface Status {
  unread: number;
  health: Level;
  issues: Issue[];
  lastCollect: string | null;
  newRecords: number | null;
}

/** Her sayfada gerekli küçük durum bilgisi: okunmamış yazı sayısı, son güncelleme ve sistem sağlığı özeti. */
export const load: LayoutServerLoad = async ({ platform, depends }) => {
  depends('app:durum');
  const db = platform?.env.DB;
  if (!db) return { status: { unread: 0, health: 'ok', issues: [], lastCollect: null, newRecords: null } satisfies Status };

  const [[unread, lastCollect], health] = await Promise.all([
    db.batch([
      db.prepare(
        `SELECT COUNT(*) AS n FROM reviews r LEFT JOIN reading_state rs ON rs.work_id = r.work_id WHERE rs.read_at IS NULL`,
      ),
      db.prepare(`SELECT finished_at, summary FROM runs WHERE kind = 'collect' AND status IN ('ok','partial') ORDER BY id DESC LIMIT 1`),
    ]),
    quickHealth(db).catch(() => null),
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
      health: health?.level ?? 'ok',
      issues: health?.issues ?? [],
      lastCollect: lc?.finished_at ?? null,
      newRecords,
    } satisfies Status,
  };
};
