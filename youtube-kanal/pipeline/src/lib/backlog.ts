// data/backlog.yaml: konu kuyruğu.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { ROOT, type VideoFormat } from './config.ts';

export type TopicStatus = 'bekliyor' | 'onaylı' | 'reddedildi' | 'üretiliyor' | 'üretildi';

export interface Topic {
  id: string;
  title: string;
  query?: string;
  tools?: string[];
  format?: VideoFormat;
  angle?: string;
  why?: string;
  score?: number;
  status: TopicStatus;
  added?: string;
  episode?: string;
  failures?: number; // üst üste başarısız üretim sayısı
  error?: string; // son hata
}

export const BACKLOG_PATH = join(ROOT, 'data', 'backlog.yaml');

const HEADER = `# Konu listesi
# ----------------------------------------------------------------------------
# Haftalık fikir işi buraya yeni konular ekler. Siz de elle konu ekleyebilirsiniz:
# yalnızca "title" ve "status: onaylı" yazmanız yeter.
#
# status değerleri:
#   bekliyor    — önerildi, henüz karar verilmedi
#   onaylı      — sıradaki üretimde öncelikli (en üstteki önce)
#   reddedildi  — üretilmeyecek
#   üretiliyor  — şu an üretimde (yarıda kaldıysa bir sonraki çalıştırma devam eder)
#   üretildi    — video hazır (episodes/ klasörüne bakın)
# ----------------------------------------------------------------------------
`;

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ı/g, 'i')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'konu'
  );
}

const STATUSES: TopicStatus[] = ['bekliyor', 'onaylı', 'reddedildi', 'üretiliyor', 'üretildi'];

/** Elle eklenen eksik alanları tamamlar (id, status). */
export function normalizeTopics(raw: unknown): Topic[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Topic[] = [];
  for (const r of raw as Partial<Topic>[]) {
    if (!r || typeof r.title !== 'string' || !r.title.trim()) continue;
    let id = typeof r.id === 'string' && r.id.trim() ? slugify(r.id) : slugify(r.title);
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    const status = STATUSES.includes(r.status as TopicStatus) ? (r.status as TopicStatus) : 'bekliyor';
    out.push({ ...r, id, title: r.title.trim(), status });
  }
  return out;
}

export function loadBacklog(path = BACKLOG_PATH): Topic[] {
  if (!existsSync(path)) return [];
  return normalizeTopics(parse(readFileSync(path, 'utf8')));
}

export function saveBacklog(topics: Topic[], path = BACKLOG_PATH): void {
  writeFileSync(path, HEADER + (topics.length ? stringify(topics, { lineWidth: 0 }) : '[]\n'));
}

/**
 * Üretilecek konuyu seçer:
 * 1. yarıda kalmış ("üretiliyor") konu, 2. listedeki ilk "onaylı" konu,
 * 3. auto_approve açıksa en yüksek puanlı "bekliyor" konu.
 */
export function pickTopic(topics: Topic[], autoApprove: boolean, wantedId?: string): Topic | undefined {
  if (wantedId) return topics.find((t) => t.id === wantedId && t.status !== 'üretildi');
  const resumed = topics.find((t) => t.status === 'üretiliyor');
  if (resumed) return resumed;
  const approved = topics.find((t) => t.status === 'onaylı');
  if (approved) return approved;
  if (!autoApprove) return undefined;
  return topics
    .filter((t) => t.status === 'bekliyor')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
}

/** Benzer başlık kontrolü için kaba bir anahtar. */
export function titleKey(title: string): string {
  const stop = new Set(['how', 'to', 'the', 'a', 'an', 'in', 'for', 'with', 'and', 'use', 'using', 'your', 'step', 'by', '2025', '2026', '2027']);
  return slugify(title)
    .split('-')
    .filter((w) => w && !stop.has(w))
    .sort()
    .join('-');
}
