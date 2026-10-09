// Editör yazısı kartları için ortak sorgular.
import { parseTopics } from '$lib/topics';

export interface ReviewCard {
  id: number;
  impact: string;
  title_tr: string;
  hook: string;
  topics: string[];
  created_at: string;
  journal: string | null;
  pub_date: string | null;
  is_preprint: number;
  doi: string | null;
  pmid: string | null;
  url: string | null;
  read: boolean;
  saved: boolean;
}

export const CARD_SELECT = `
  SELECT r.work_id AS id, r.impact, r.title_tr, r.hook, r.topics, r.created_at,
         COALESCE(w.journal_abbr, w.journal) AS journal, w.pub_date, w.is_preprint, w.doi, w.pmid, w.url,
         rs.read_at, rs.saved_at
  FROM reviews r
  JOIN works w ON w.id = r.work_id
  LEFT JOIN reading_state rs ON rs.work_id = r.work_id`;

export function toCard(raw: unknown): ReviewCard {
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    impact: String(row.impact),
    title_tr: String(row.title_tr),
    hook: String(row.hook),
    topics: parseTopics(row.topics as string),
    created_at: String(row.created_at),
    journal: (row.journal as string) ?? null,
    pub_date: (row.pub_date as string) ?? null,
    is_preprint: Number(row.is_preprint ?? 0),
    doi: (row.doi as string) ?? null,
    pmid: (row.pmid as string) ?? null,
    url: (row.url as string) ?? null,
    read: row.read_at != null,
    saved: row.saved_at != null,
  };
}

/** Filtre çipleri: yeni | pratik | onemli | bilgi | onbaski | konu:<kod> */
export function reviewFilter(f: string | null): { where: string; params: unknown[] } {
  switch (f) {
    case 'yeni':
      return { where: 'rs.read_at IS NULL', params: [] };
    case 'pratik':
      return { where: "r.impact = 'practice_changing'", params: [] };
    case 'onemli':
      return { where: "r.impact = 'important'", params: [] };
    case 'bilgi':
      return { where: "r.impact = 'informational'", params: [] };
    case 'onbaski':
      return { where: 'w.is_preprint = 1', params: [] };
  }
  if (f?.startsWith('konu:') && /^[a-z_]+$/.test(f.slice(5))) {
    return { where: 'r.topics LIKE ?', params: [`%"${f.slice(5)}"%`] };
  }
  return { where: '1 = 1', params: [] };
}
