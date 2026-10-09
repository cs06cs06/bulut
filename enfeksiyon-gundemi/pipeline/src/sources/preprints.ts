// Ön baskılar: medRxiv / bioRxiv (resmî API) ve Europe PMC (diğer ön baskı sunucuları).
// API: https://api.biorxiv.org — details/{server}/{başlangıç}/{bitiş}/{imleç}
// Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search

import { normalizeDoi, stripTags, type NormalizedRecord } from '../lib/normalize.ts';
import { baseRecord, getJson, type Source } from './types.ts';

interface RxivItem {
  doi: string;
  title: string;
  authors: string;
  date: string;
  version: string;
  category: string;
  abstract: string;
  published: string;
  jatsxml?: string;
  server: string;
}

export interface RxivConfig {
  enabled?: boolean;
  categories: string[];
  keyword_categories: string[];
}

export function rxivSource(server: 'medrxiv' | 'biorxiv', cfg: RxivConfig): Source {
  const direct = new Set(cfg.categories.map((c) => c.toLowerCase()));
  const viaKeywords = new Set(cfg.keyword_categories.map((c) => c.toLowerCase()));
  const label = server === 'medrxiv' ? 'medRxiv' : 'bioRxiv';
  return {
    id: `preprint:${server}`,
    name: label,
    async fetch(ctx) {
      // Aynı ön baskının birden çok sürümü gelebilir: en son sürüm kalır
      const records = new Map<string, NormalizedRecord>();
      let cursor = 0;
      let total = Infinity;
      let scanned = 0;
      while (cursor < total && cursor < 5000) {
        const data = await getJson<{ messages: { total?: string; count?: number }[]; collection: RxivItem[] }>(
          `https://api.biorxiv.org/details/${server}/${ctx.since}/${ctx.today}/${cursor}`,
        );
        total = Number(data.messages?.[0]?.total ?? 0);
        const page = data.collection ?? [];
        if (page.length === 0) break;
        cursor += page.length;
        for (const it of page) {
          scanned++;
          const cat = (it.category ?? '').toLowerCase();
          const ok = direct.has(cat) || (viaKeywords.has(cat) && ctx.keywordFilter(`${it.title} ${it.abstract}`));
          if (!ok) continue;
          const doi = normalizeDoi(it.doi);
          if (!doi) continue;
          const r = baseRecord(`preprint:${server}`, doi, stripTags(it.title));
          r.doi = doi;
          r.abstract = stripTags(it.abstract).slice(0, 8000) || undefined;
          r.authors = it.authors.split(/;\s*/).filter(Boolean).slice(0, 50);
          r.journal = label;
          r.journalAbbr = label;
          r.pubDate = it.date;
          r.keywords = [it.category];
          r.pubTypes = ['Preprint'];
          r.isPreprint = true;
          r.preprintServer = label;
          r.kind = 'preprint';
          r.url = `https://www.${server}.org/content/${doi}v${it.version}`;
          r.fulltextUrl = it.jatsxml || undefined;
          r.publishedDoi = it.published && it.published !== 'NA' ? normalizeDoi(it.published) : undefined;
          records.set(doi, r);
        }
      }
      return { records: [...records.values()], note: `${scanned} ön baskı tarandı` };
    },
  };
}

interface EpmcResult {
  id: string;
  source: string;
  doi?: string;
  title: string;
  abstractText?: string;
  authorString?: string;
  firstPublicationDate?: string;
  bookOrReportDetails?: { publisher?: string };
}

export function europePmcPreprints(query: string, maxPerRun: number): Source {
  return {
    id: 'preprint:europepmc',
    name: 'Europe PMC ön baskıları',
    async fetch(ctx) {
      const records: NormalizedRecord[] = [];
      let cursor = '*';
      for (let pageNo = 0; pageNo < 20 && records.length < maxPerRun; pageNo++) {
        const q = new URLSearchParams({
          query: `SRC:PPR AND FIRST_PDATE:[${ctx.since} TO ${ctx.today}] AND ${query}`,
          format: 'json',
          resultType: 'core',
          pageSize: '100',
          cursorMark: cursor,
        });
        const data = await getJson<{ nextCursorMark?: string; resultList: { result: EpmcResult[] } }>(
          `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${q}`,
        );
        const page = data.resultList?.result ?? [];
        for (const it of page) {
          const publisher = it.bookOrReportDetails?.publisher ?? 'Ön baskı';
          // medRxiv/bioRxiv doğrudan kendi API'lerinden alınıyor
          if (/medrxiv|biorxiv/i.test(publisher)) continue;
          const r = baseRecord('preprint:europepmc', it.id, stripTags(it.title));
          r.doi = normalizeDoi(it.doi);
          r.abstract = it.abstractText ? stripTags(it.abstractText).slice(0, 8000) : undefined;
          r.authors = (it.authorString ?? '').replace(/\.$/, '').split(/,\s*/).filter(Boolean).slice(0, 50);
          r.journal = publisher;
          r.journalAbbr = publisher;
          r.pubDate = it.firstPublicationDate;
          r.pubTypes = ['Preprint'];
          r.isPreprint = true;
          r.preprintServer = publisher;
          r.kind = 'preprint';
          r.url = `https://europepmc.org/article/PPR/${it.id}`;
          records.push(r);
          if (records.length >= maxPerRun) break;
        }
        if (!data.nextCursorMark || data.nextCursorMark === cursor || page.length === 0) break;
        cursor = data.nextCursorMark;
      }
      return { records };
    },
  };
}
