// Dergi ve kurum RSS beslemeleri, WHO salgın bildirimleri.

import { selectIn } from '../lib/db.ts';
import { parseFeed, toIsoDay } from '../lib/feed.ts';
import { summarizePage } from '../lib/html.ts';
import { stripTags, type NormalizedRecord } from '../lib/normalize.ts';
import type { FeedSourceConfig } from '../lib/config.ts';
import { baseRecord, getJson, getText, type Source, type SourceContext } from './types.ts';

export type FeedConfig = FeedSourceConfig;

/** Lancet'teki gibi bölüm adları (Correspondence, Comment…) yayın türüne çevrilir */
function sectionToTypes(section: string | undefined): string[] {
  if (!section) return [];
  const s = section.toLowerCase();
  if (/^(articles?|original articles?|research( articles?)?)$/.test(s)) return ['Journal Article'];
  if (/correspondence|letter/.test(s)) return ['Letter'];
  if (/comment|editorial|perspective|viewpoint|personal view/.test(s)) return ['Comment'];
  if (/review/.test(s)) return ['Review'];
  if (/case report|clinical picture|grand round/.test(s)) return ['Case Reports'];
  if (/guideline|policy/.test(s)) return ['Practice Guideline'];
  return [section];
}

export function rssSource(cfg: FeedConfig, prefix: 'rss' | 'agency'): Source {
  return {
    id: `${prefix}:${cfg.id}`,
    name: cfg.name,
    async fetch(ctx) {
      const items = parseFeed(await getText(cfg.url, 'application/rss+xml, application/xml, text/xml'));
      const records: NormalizedRecord[] = [];
      let filtered = 0;
      for (const it of items) {
        if (it.date && it.date < ctx.since) continue;
        if (cfg.filter === 'keywords' && !ctx.keywordFilter(`${it.title} ${it.description ?? ''}`)) {
          filtered++;
          continue;
        }
        const r = baseRecord(`${prefix}:${cfg.id}`, it.doi ?? it.link ?? it.title, it.title);
        r.doi = it.doi;
        r.url = it.link;
        r.abstract = it.description && it.description.length > 40 ? it.description.slice(0, 6000) : undefined;
        r.authors = it.authors.slice(0, 50);
        r.journal = cfg.name;
        r.journalAbbr = cfg.name;
        r.pubDate = it.date ?? ctx.today;
        r.pubTypes = sectionToTypes(it.section);
        r.kind = cfg.kind ?? 'article';
        r.language = cfg.language;
        records.push(r);
      }
      if (cfg.fetch_detail) await addPageText(records, ctx.db);
      return { records, note: `${items.length} öğe okundu${filtered ? `, ${filtered} alan dışı elendi` : ''}` };
    },
  };
}

const MAX_DETAIL = 10;

/** Açıklaması kısa olan yeni öğelerin sayfasını okuyup metnini özet olarak ekler */
async function addPageText(records: NormalizedRecord[], db: SourceContext['db']): Promise<void> {
  const short = records.filter((r) => r.url && (r.abstract?.length ?? 0) < 400);
  const known = new Set(
    (await selectIn<{ url: string }>(db, (ph) => `SELECT url FROM works WHERE url IN (${ph}) AND url IS NOT NULL`, short.map((r) => r.url!))).map(
      (x) => x.url,
    ),
  );
  for (const r of short.filter((x) => !known.has(x.url!)).slice(0, MAX_DETAIL)) {
    try {
      const page = summarizePage(await getText(r.url!, 'text/html'), 6000);
      const text = [r.abstract, page.text].filter(Boolean).join('\n');
      if (text.length > (r.abstract?.length ?? 0)) r.abstract = text.slice(0, 6000);
    } catch {
      /* sayfa okunamazsa beslemedeki metinle devam */
    }
  }
}

interface WhoDon {
  Title: string;
  OverrideTitle?: string;
  UrlName: string;
  PublicationDateAndTime: string;
  Summary?: string;
  Overview?: string;
  Assessment?: string;
}

/** WHO Disease Outbreak News (resmî JSON uç noktası) */
export function whoDonSource(cfg: FeedConfig): Source {
  return {
    id: `agency:${cfg.id}`,
    name: cfg.name,
    async fetch(ctx) {
      const q = new URLSearchParams({
        sf_culture: 'en',
        $orderby: 'PublicationDateAndTime desc',
        $top: '30',
        $filter: `PublicationDateAndTime ge ${ctx.since}T00:00:00Z`,
      });
      const data = await getJson<{ value: WhoDon[] }>(`${cfg.url}?${q}`);
      const records = data.value.map((d) => {
        const title = stripTags(d.OverrideTitle || d.Title);
        const r = baseRecord(`agency:${cfg.id}`, d.UrlName, title);
        r.url = `https://www.who.int/emergencies/disease-outbreak-news/item/${d.UrlName}`;
        const parts = [d.Summary, d.Overview, d.Assessment].map((p) => stripTags(p ?? '')).filter(Boolean);
        r.abstract = parts.join('\n').slice(0, 6000) || undefined;
        r.journal = cfg.name;
        r.journalAbbr = 'WHO DON';
        r.pubDate = toIsoDay(d.PublicationDateAndTime) ?? ctx.today;
        r.pubTypes = ['Outbreak Report'];
        r.kind = 'report';
        return r;
      });
      return { records };
    },
  };
}

