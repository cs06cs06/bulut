// RSS 2.0 / RDF (RSS 1.0) / Atom besleme okuyucu.

import { XMLParser } from 'fast-xml-parser';
import { normalizeDoi, stripTags } from './normalize.ts';

export interface FeedItem {
  title: string;
  link?: string;
  description?: string;
  date?: string; // YYYY-MM-DD
  doi?: string;
  authors: string[];
  section?: string; // ör. Lancet'te [Articles]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ['item', 'entry', 'dc:creator', 'author', 'category', 'link'].includes(name),
});

type X = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const txt = (v: X): string => {
  if (v == null) return '';
  if (Array.isArray(v)) return txt(v[0]);
  if (typeof v === 'object') return String(v['#text'] ?? v['@href'] ?? '');
  return String(v);
};

export function toIsoDay(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function doiFrom(item: X): string | undefined {
  for (const v of [item['prism:doi'], item['dc:identifier']]) {
    const d = normalizeDoi(txt(v).replace(/^doi:/i, '').replace(/\?.*$/, ''));
    if (d) return d;
  }
  const link = txt(item.link) || txt(item.guid);
  const m = /doi(?:\.org)?\/(10\.\d{4,9}\/[^\s?#]+)/i.exec(link);
  return m ? normalizeDoi(decodeURIComponent(m[1])) : undefined;
}

export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml);
  const items: X[] = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item ?? doc?.feed?.entry ?? [];
  const out: FeedItem[] = [];
  for (const it of items) {
    let title = stripTags(txt(it.title) || txt(it['dc:title']));
    if (!title) continue;
    let section: string | undefined;
    const sec = /^\[([^\]]{2,40})\]\s*/.exec(title);
    if (sec) {
      section = sec[1];
      title = title.slice(sec[0].length);
    }
    const linkVal = Array.isArray(it.link) ? (it.link.find((l: X) => !l?.['@rel'] || l['@rel'] === 'alternate') ?? it.link[0]) : it.link;
    const authors = [...(it['dc:creator'] ?? []), ...(it.author ?? [])].map((a: X) => stripTags(txt(a?.name ?? a))).filter(Boolean);
    out.push({
      title,
      link: txt(linkVal) || txt(it.guid) || undefined,
      description: stripTags(txt(it['content:encoded']) || txt(it.description) || txt(it.summary) || txt(it.content)) || undefined,
      date: toIsoDay(txt(it['prism:publicationDate']) || txt(it['dc:date']) || txt(it.pubDate) || txt(it.published) || txt(it.updated)),
      doi: doiFrom(it),
      authors: authors.length === 1 && authors[0].includes(',') ? authors[0].split(/,\s*/) : authors,
      section: section ?? (stripTags(txt(it['prism:section'])) || undefined),
    });
  }
  return out;
}
