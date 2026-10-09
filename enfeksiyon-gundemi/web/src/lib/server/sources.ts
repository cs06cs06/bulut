// Kaynak adları: config/sources.yaml'dan (tek kaynak) derleme sırasında okunur.
import { parse } from 'yaml';
import raw from '../../../../config/sources.yaml?raw';

interface Entry {
  id: string;
  name: string;
  enabled?: boolean;
}

const cfg = parse(raw) as {
  rss?: Entry[];
  agencies?: Entry[];
  pages?: Entry[];
  preprints?: Record<string, { enabled?: boolean }>;
};

const PREPRINT_NAME: Record<string, string> = {
  medrxiv: 'medRxiv',
  biorxiv: 'bioRxiv',
  europepmc: 'Diğer ön baskılar (Europe PMC)',
};

/** Etkin kaynakların görünen adları; anahtar source_state.source ile aynıdır */
export const SOURCE_NAME: Record<string, string> = { pubmed: 'PubMed' };
const add = (prefix: string, list: Entry[] | undefined, suffix = '') => {
  for (const e of list ?? []) if (e.enabled !== false) SOURCE_NAME[`${prefix}:${e.id}`] = `${e.name}${suffix}`;
};
add('rss', cfg.rss, ' (RSS)');
add('agency', cfg.agencies);
add('page', cfg.pages);
for (const [k, v] of Object.entries(cfg.preprints ?? {})) if (v?.enabled !== false) SOURCE_NAME[`preprint:${k}`] = PREPRINT_NAME[k] ?? k;

// ECDC iki ayrı beslemeden okunur
SOURCE_NAME['agency:ecdc_news'] = 'ECDC haberler';
SOURCE_NAME['agency:ecdc_publications'] = 'ECDC yayınlar';
