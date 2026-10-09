// Açık erişimli tam metin: Europe PMC (PMC kimliği olan makaleler) ve medRxiv/bioRxiv JATS XML.
// Yalnızca editör yazısına seçilen birkaç yayın için indirilir.

import { stripTags } from '../lib/normalize.ts';
import { getText } from './types.ts';

export interface FullText {
  text: string;
  source: string; // ör. "Europe PMC"
  truncated: boolean;
}

/** Bölüm başlıklarını koruyarak JATS gövdesini düz metne çevirir */
function jatsBlock(xml: string): string {
  const marked = xml
    .replace(/\s+/g, ' ')
    .replace(/<(table-wrap|fig|disp-formula|supplementary-material|graphic|media|alternatives)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<xref\b[^>]*>[\s\S]*?<\/xref>/gi, '')
    .replace(/<title\b[^>]*>([\s\S]*?)<\/title>/gi, '\n## $1\n')
    .replace(/<\/?p\b[^>]*>/gi, '\n');
  // stripTags boşlukları tek satıra indirir: satır satır uygulanır
  return marked
    .split('\n')
    .map((l) =>
      stripTags(l)
        .replace(/\s*(\[\s*[,;–-]?\s*\]|\(\s*[,;–-]?\s*\))/g, '') // kaynak numaraları silinince kalan boş parantezler
        .replace(/\s+([.,;:])/g, '$1')
        .trim(),
    )
    .filter(Boolean)
    .map((l) => (l.startsWith('## ') ? `\n${l}` : l))
    .join('\n')
    .trim();
}

/** JATS XML'den gövde, finansman ve çıkar çatışması beyanını çıkarır */
export function parseJats(xml: string, maxChars: number): { text: string; truncated: boolean } | null {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xml)?.[1];
  if (!body) return null;
  let text = jatsBlock(body);
  // Kaynakça ve ek materyal bölümleri modele gönderilmez
  const tail = /\n## (References|Associated Data|Supplementary (Materials?|Data|Information))\b/i.exec(text);
  if (tail) text = text.slice(0, tail.index).trim();
  if (text.length < 1500) return null; // gövde yok ya da yalnızca bir paragraf: tam metin sayılmaz
  let truncated = false;
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n[… metin uzunluk sınırı nedeniyle kısaltıldı]`;
    truncated = true;
  }
  const extra: string[] = [];
  const funding = /<funding-group\b[^>]*>([\s\S]*?)<\/funding-group>/i.exec(xml)?.[1];
  if (funding) extra.push(`Finansman (tam metin): ${jatsBlock(funding).replace(/\s+/g, ' ').slice(0, 1500)}`);
  const coi =
    /<fn\b[^>]*fn-type=["'](?:conflict|COI-statement|competing-interests)["'][^>]*>([\s\S]*?)<\/fn>/i.exec(xml)?.[1] ??
    /<sec\b[^>]*>\s*<title>[^<]*(?:Competing|Conflicts? of interest|Declaration of interests?)[^<]*<\/title>([\s\S]*?)<\/sec>/i.exec(xml)?.[1];
  if (coi) extra.push(`Çıkar çatışması (tam metin): ${jatsBlock(coi).replace(/\s+/g, ' ').slice(0, 1500)}`);
  return { text: [text, ...extra].join('\n\n'), truncated };
}

export async function fetchFullText(
  w: { pmcid?: string | null; fulltext_url?: string | null },
  maxChars: number,
): Promise<FullText | null> {
  const tries: { url: string; source: string }[] = [];
  if (w.pmcid) {
    const id = w.pmcid.toUpperCase().startsWith('PMC') ? w.pmcid.toUpperCase() : `PMC${w.pmcid}`;
    tries.push({ url: `https://www.ebi.ac.uk/europepmc/webservices/rest/${id}/fullTextXML`, source: 'Europe PMC' });
  }
  if (w.fulltext_url) tries.push({ url: w.fulltext_url, source: new URL(w.fulltext_url).host.replace(/^www\./, '') });
  for (const t of tries) {
    try {
      const parsed = parseJats(await getText(t.url, 'application/xml, text/xml'), maxChars);
      if (parsed) return { ...parsed, source: t.source };
    } catch {
      /* açık erişim değil ya da ulaşılamadı: sıradakini dene */
    }
  }
  return null;
}
