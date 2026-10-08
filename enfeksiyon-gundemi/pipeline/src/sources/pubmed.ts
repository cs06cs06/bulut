// PubMed (NCBI E-utilities) kaynağı.
// Belgeler: https://www.ncbi.nlm.nih.gov/books/NBK25497/
//  - API anahtarıyla saniyede en fazla 10 istek (anahtarsız 3).
//  - Her isteğe "tool" ve "email" parametreleri eklenir.

import { XMLParser } from 'fast-xml-parser';
import { fetchWithRetry, RateLimiter } from '../lib/http.ts';
import { normalizeDoi, stripTags, type NormalizedRecord } from '../lib/normalize.ts';

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL = 'enfeksiyon-gundemi';
const PAGE_SIZE = 200;

export interface PubmedClientOptions {
  apiKey?: string;
  email?: string;
}

export class PubmedClient {
  private limiter: RateLimiter;
  constructor(private opts: PubmedClientOptions) {
    // Sınırın biraz altında kalıyoruz.
    this.limiter = new RateLimiter(opts.apiKey ? 8 : 2);
  }

  private params(extra: Record<string, string>): URLSearchParams {
    const p = new URLSearchParams({ db: 'pubmed', tool: TOOL, ...extra });
    if (this.opts.email) p.set('email', this.opts.email);
    if (this.opts.apiKey) p.set('api_key', this.opts.apiKey);
    return p;
  }

  private async post(endpoint: string, params: URLSearchParams): Promise<string> {
    const res = await fetchWithRetry(
      `${EUTILS}/${endpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      },
      {
        limiter: this.limiter,
        timeoutMs: 120_000,
        // NCBI kendi iç zaman aşımlarını 400 koduyla bildiriyor ("Empty Response ... Status: Timeout")
        retryIf: (status, body) => status === 400 && /timeout|empty response|temporarily|try again/i.test(body),
      },
    );
    return res.text();
  }

  /**
   * Belirli bir PubMed giriş gününde (EDAT) sorguya uyan PMID'leri döndürür.
   * Geçici arama oturumu (WebEnv) yerine kimlik listesi kullanılır: oturum süresi dolması
   * gibi hatalar olmaz ve yarım kalan indirme güvenle tekrarlanabilir.
   */
  async searchDay(query: string, day: string): Promise<{ count: number; ids: string[] }> {
    const d = day.replaceAll('-', '/');
    const text = await this.post(
      'esearch.fcgi',
      this.params({ term: query, datetype: 'edat', mindate: d, maxdate: d, retmax: '9999', retmode: 'json' }),
    );
    const json = JSON.parse(text) as { esearchresult: { count: string; idlist: string[]; ERROR?: string } };
    const r = json.esearchresult;
    if (r.ERROR) throw new Error(`PubMed arama hatası: ${r.ERROR}`);
    const count = Number(r.count);
    if (count > r.idlist.length) {
      // Tek günde 9.999'dan fazla kayıt beklenmez; olursa eksik kalanı açıkça bildir.
      throw new Error(`PubMed bir günde ${count} kayıt döndürdü; en fazla ${r.idlist.length} indirilebilir.`);
    }
    return { count, ids: r.idlist };
  }

  /** Kayıtları 200'lük gruplar hâlinde indirir. */
  async *fetchAll(search: { ids: string[] }): AsyncGenerator<NormalizedRecord[]> {
    for (let i = 0; i < search.ids.length; i += PAGE_SIZE) {
      const ids = search.ids.slice(i, i + PAGE_SIZE);
      const xml = await this.post('efetch.fcgi', this.params({ id: ids.join(','), retmode: 'xml' }));
      yield parsePubmedXml(xml);
    }
  }
}

// ---------------------------------------------------------------------------
// XML ayrıştırma

// Bu düğümlerin içi ham XML olarak bırakılır (içlerinde <i>, <sup> gibi etiketler olabilir).
const RAW_NODES = ['AbstractText', 'ArticleTitle', 'VernacularTitle', 'CoiStatement', 'BookTitle'];

const ARRAY_NODES = new Set([
  'PubmedArticle',
  'PubmedBookArticle',
  'Author',
  'AbstractText',
  'ArticleId',
  'ELocationID',
  'PublicationType',
  'MeshHeading',
  'Keyword',
  'KeywordList',
  'Grant',
  'Language',
  'ISSN',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  stopNodes: RAW_NODES.map((n) => `*.${n}`),
  isArray: (name) => ARRAY_NODES.has(name),
  parseTagValue: false,
  trimValues: true,
});

type X = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const text = (v: X): string => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in v) return String(v['#text']);
  return '';
};

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function toDate(d: X): string | undefined {
  if (!d) return undefined;
  const y = text(d.Year);
  if (!y) {
    const m = /(\d{4})(?:\s+([A-Za-z]{3}))?/.exec(text(d.MedlineDate));
    if (!m) return undefined;
    return `${m[1]}-${MONTHS[m[2]?.toLowerCase() ?? ''] ?? '01'}-01`;
  }
  const mRaw = text(d.Month);
  const month = /^\d+$/.test(mRaw) ? mRaw.padStart(2, '0') : (MONTHS[mRaw.slice(0, 3).toLowerCase()] ?? '01');
  const day = (text(d.Day) || '01').padStart(2, '0');
  return `${y}-${month}-${day}`;
}

function parseAbstract(abs: X): string | undefined {
  const parts: X[] = abs?.AbstractText ?? [];
  if (parts.length === 0) return undefined;
  const out = parts
    .map((p) => {
      const body = stripTags(text(p));
      const label = typeof p === 'object' ? p['@Label'] : undefined;
      return label ? `${label}: ${body}` : body;
    })
    .filter(Boolean)
    .join('\n');
  return out || undefined;
}

function authorName(a: X): string | undefined {
  if (a.CollectiveName) return stripTags(text(a.CollectiveName));
  const last = text(a.LastName);
  if (!last) return undefined;
  const ini = text(a.Initials);
  return ini ? `${last} ${ini}` : last;
}

/** PubMed efetch XML'ini ortak kayıt biçimine çevirir. */
export function parsePubmedXml(xml: string): NormalizedRecord[] {
  const doc = parser.parse(xml);
  const articles: X[] = doc?.PubmedArticleSet?.PubmedArticle ?? [];
  const out: NormalizedRecord[] = [];

  for (const pa of articles) {
    const mc = pa.MedlineCitation;
    const art = mc?.Article;
    if (!art) continue;
    const pmid = text(mc.PMID);
    const title = stripTags(text(art.ArticleTitle)) || stripTags(text(art.VernacularTitle));
    if (!pmid || !title) continue;

    // Kimlikler: yalnızca makalenin kendi ArticleIdList'i (kaynakçadakiler değil)
    const ids: X[] = pa.PubmedData?.ArticleIdList?.ArticleId ?? [];
    const idOf = (type: string) => ids.find((i) => i?.['@IdType'] === type);
    const eloc: X[] = art.ELocationID ?? [];
    const doi =
      normalizeDoi(text(idOf('doi'))) ??
      normalizeDoi(text(eloc.find((e) => e?.['@EIdType'] === 'doi')));
    const pmcid = text(idOf('pmc')) || undefined;

    const journal = art.Journal ?? {};
    const issns: X[] = journal.ISSN ?? [];
    const pubTypes = (art.PublicationTypeList?.PublicationType ?? []).map(text).filter(Boolean);
    const mesh = (mc.MeshHeadingList?.MeshHeading ?? [])
      .map((m: X) => text(m.DescriptorName))
      .filter(Boolean);
    const keywords = (mc.KeywordList ?? [])
      .flatMap((kl: X) => kl.Keyword ?? [])
      .map((k: X) => stripTags(text(k)))
      .filter(Boolean);
    const grants = [
      ...new Set<string>((art.GrantList?.Grant ?? []).map((g: X) => text(g.Agency)).filter(Boolean)),
    ];
    const articleDate = Array.isArray(art.ArticleDate) ? art.ArticleDate[0] : art.ArticleDate;

    const isPreprint = pubTypes.includes('Preprint');
    out.push({
      source: 'pubmed',
      sourceId: pmid,
      pmid,
      doi,
      pmcid,
      title,
      abstract: parseAbstract(art.Abstract),
      authors: (art.AuthorList?.Author ?? []).map(authorName).filter(Boolean) as string[],
      journal: text(journal.Title) || undefined,
      journalAbbr: text(mc.MedlineJournalInfo?.MedlineTA) || text(journal.ISOAbbreviation) || undefined,
      issn: text(mc.MedlineJournalInfo?.ISSNLinking) || text(issns[0]) || undefined,
      pubDate: toDate(articleDate) ?? toDate(journal.JournalIssue?.PubDate),
      pubTypes,
      mesh,
      keywords,
      language: text((art.Language ?? [])[0]) || undefined,
      coi: stripTags(text(mc.CoiStatement)) || undefined,
      grants,
      isPreprint,
      kind: isPreprint ? 'preprint' : pubTypes.some((t: string) => /guideline|consensus/i.test(t)) ? 'guideline' : 'article',
    });
  }
  for (const pb of doc?.PubmedArticleSet?.PubmedBookArticle ?? []) {
    const r = parseBookArticle(pb);
    if (r) out.push(r);
  }
  return out;
}

/** Kitap bölümleri (GeneReviews, StatPearls vb.): düşük öncelikli ama kaybolmasın. */
function parseBookArticle(pb: X): NormalizedRecord | undefined {
  const bd = pb.BookDocument;
  const pmid = text(bd?.PMID);
  const bookTitle = stripTags(text(bd?.Book?.BookTitle));
  const title = stripTags(text(bd?.ArticleTitle)) || bookTitle;
  if (!pmid || !title) return undefined;
  const authorLists = Array.isArray(bd.AuthorList) ? bd.AuthorList : bd.AuthorList ? [bd.AuthorList] : [];
  const authors = authorLists
    .filter((l: X) => l?.['@Type'] !== 'editors')
    .flatMap((l: X) => l.Author ?? [])
    .map(authorName)
    .filter(Boolean) as string[];
  const revised = pb.PubmedBookData?.History?.PubMedPubDate;
  const lastDate = Array.isArray(revised) ? revised[revised.length - 1] : revised;
  return {
    source: 'pubmed',
    sourceId: pmid,
    pmid,
    title,
    abstract: parseAbstract(bd.Abstract),
    authors,
    journal: bookTitle || undefined,
    pubDate: toDate(lastDate) ?? toDate(bd.Book?.PubDate),
    pubTypes: ['Book Chapter'],
    mesh: [],
    keywords: [],
    grants: [],
    language: text((bd.Language ?? [])[0]) || undefined,
    isPreprint: false,
    kind: 'report',
  };
}
