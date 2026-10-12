// YouTube arama önerileri (otomatik tamamlama): insanların şu an yazdığı gerçek arama ifadeleri.
// Resmî olmayan uç nokta; erişilemezse fikir üretimi önerisiz devam eder.

export type Fetcher = (url: string) => Promise<string>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

/** ["sorgu", ["öneri1", "öneri2", ...]] biçimindeki yanıtı ayrıştırır. */
export function parseSuggestions(body: string): string[] {
  try {
    const data = JSON.parse(body);
    return Array.isArray(data?.[1]) ? data[1].filter((s: unknown) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export const PATTERNS = ['{seed}', 'how to use {seed}', '{seed} tutorial', '{seed} vs', '{seed} new feature'];

export async function collectSuggestions(
  seeds: string[],
  fetcher: Fetcher = defaultFetcher,
  patterns: string[] = PATTERNS,
): Promise<string[]> {
  const out = new Set<string>();
  let failures = 0;
  for (const seed of seeds) {
    for (const p of patterns) {
      const q = p.replace('{seed}', seed);
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&gl=us&q=${encodeURIComponent(q)}`;
      try {
        for (const s of parseSuggestions(await fetcher(url))) out.add(s.toLowerCase());
      } catch {
        failures++;
        if (failures >= 5 && out.size === 0) return []; // uç nokta erişilemiyor; boşuna bekleme
      }
    }
  }
  return [...out];
}
