// Arayüzde ortak biçimlendirme yardımcıları.

export const IMPACT_LABEL: Record<string, string> = {
  practice_changing: 'Pratiği değiştirebilir',
  important: 'Önemli gelişme',
  informational: 'Bilgi için',
};

export const MATURITY_LABEL: Record<string, string> = {
  mature: 'Sağlam kanıt',
  promising_early: 'Heyecan verici ama henüz erken',
  preliminary: 'Ön veri',
};

export const BASIS_NOTE: Record<string, string> = {
  abstract: 'Bu değerlendirme yalnızca yayının özetine dayanmaktadır.',
  full_text: 'Bu değerlendirme yayının tam metnine dayanmaktadır.',
  metadata: 'Bu değerlendirme yalnızca künye bilgisine dayanmaktadır.',
};

export function fmtDay(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

export function parseList(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function sourceLink(w: { pmid: string | null; doi: string | null }): string | null {
  return w.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${w.pmid}/` : w.doi ? `https://doi.org/${w.doi}` : null;
}
