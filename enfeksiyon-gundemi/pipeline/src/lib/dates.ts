// Basit tarih yardımcıları (UTC, YYYY-MM-DD).

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

/** from..to (ikisi dahil) arasındaki günler, yeniden eskiye */
export function daysDesc(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) out.push(d);
  return out;
}
