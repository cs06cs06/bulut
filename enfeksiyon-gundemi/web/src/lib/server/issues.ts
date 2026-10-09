// Baskılar: günlük baskılar yazıların tarihinden (Türkiye saati, UTC+3) türetilir; haftalık baskılar issues tablosunda.

/** Türkiye saatiyle gün (SQLite ifadesi) */
export const TR_DAY = `date(r.created_at, '+3 hours')`;

export interface WeeklyRow {
  id: number;
  issue_date: string;
  start_date: string;
  title: string;
  body: string;
  review_ids: string;
}

export function weeklySummary(w: WeeklyRow) {
  let intro = '';
  try {
    intro = String(JSON.parse(w.body).intro ?? '');
  } catch {
    /* boş */
  }
  return {
    id: w.id,
    title: w.title,
    start_date: w.start_date,
    issue_date: w.issue_date,
    excerpt: intro.split('\n')[0].slice(0, 220),
    count: (() => {
      try {
        return (JSON.parse(w.review_ids) as unknown[]).length;
      } catch {
        return 0;
      }
    })(),
  };
}

/** Kısa tarih aralığı: "5–11 Ekim" */
export function dateRange(a: string, b: string): string {
  const da = new Date(`${a}T12:00:00Z`);
  const db = new Date(`${b}T12:00:00Z`);
  const month = (d: Date) => d.toLocaleDateString('tr-TR', { month: 'long', timeZone: 'UTC' });
  return month(da) === month(db)
    ? `${da.getUTCDate()}–${db.getUTCDate()} ${month(db)}`
    : `${da.getUTCDate()} ${month(da)} – ${db.getUTCDate()} ${month(db)}`;
}
