// Kaynaktan bağımsız ortak kayıt biçimi ve normalleştirme yardımcıları.

export interface NormalizedRecord {
  source: string; // pubmed, europepmc, ...
  sourceId: string;
  pmid?: string;
  doi?: string;
  pmcid?: string;
  title: string;
  abstract?: string;
  authors: string[];
  journal?: string;
  journalAbbr?: string;
  issn?: string;
  pubDate?: string; // YYYY-MM-DD
  pubTypes: string[];
  mesh: string[];
  keywords: string[];
  language?: string;
  coi?: string;
  grants: string[];
  isPreprint: boolean;
  preprintServer?: string;
  kind: 'article' | 'preprint' | 'guideline' | 'report';
}

export function normalizeDoi(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '');
  d = d.replace(/[.\s]+$/, '');
  return /^10\.\d{4,9}\/\S+$/.test(d) ? d : undefined;
}

/** Başlığı karşılaştırma için normalize eder: aksan, noktalama, büyük harf ve fazla boşluk atılır. */
export function titleFingerprint(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export const titleKey = (fp: string) => fp.slice(0, 40);

/** Karakter üçlüleri (trigram) üzerinden Dice benzerliği, 0..1 */
export function titleSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    const t = `  ${s} `;
    for (let i = 0; i < t.length - 2; i++) {
      const g = t.slice(i, i + 3);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of ga) {
    inter += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** XML iç içeriğinden (ör. <i>, <sup>) etiketleri atar ve HTML varlıklarını çözer. */
export function stripTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
