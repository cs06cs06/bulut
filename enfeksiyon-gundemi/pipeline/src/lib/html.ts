// Basit HTML yardımcıları (ek bağımlılık olmadan): bağlantılar, meta etiketleri, okunabilir metin.

import { stripTags } from './normalize.ts';

export interface PageLink {
  url: string;
  text: string;
}

// "Buradan okuyun", "PDF" gibi bilgi taşımayan bağlantı metinleri
const GENERIC_TEXT = /^(open access )?(publication|read|click|more|link|download|pdf|full text|here|devam|tıkla|detay|incele)\b|\bhere$/i;

/** Bağlantı metni anlamsızsa, bağlantının bulunduğu tablo satırı / liste öğesinin metni kullanılır */
function contextText(html: string, at: number, linkText: string): string | undefined {
  for (const tag of ['tr', 'li']) {
    const start = html.lastIndexOf(`<${tag}`, at);
    const end = html.indexOf(`</${tag}>`, at);
    if (start < 0 || end < 0 || end - start > 4000) continue;
    const text = stripTags(html.slice(start, end)).replace(linkText, '').trim();
    if (text.length >= 15) return text;
  }
  return undefined;
}

/** Sayfadaki <a href> bağlantıları (mutlak adrese çevrilmiş, yinelenenler ayıklanmış) */
export function extractLinks(html: string, base: string): PageLink[] {
  const seen = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try {
      url = new URL(m[1].replace(/&amp;/g, '&'), base).href;
    } catch {
      continue;
    }
    let text = stripTags(m[2]);
    if (!text || GENERIC_TEXT.test(text)) text = contextText(html, m.index, text) ?? text;
    if (!seen.has(url) || (!seen.get(url) && text)) seen.set(url, text);
  }
  return [...seen.entries()].map(([url, text]) => ({ url, text }));
}

function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']*)["']|<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${key}["']`,
    'i',
  );
  const m = re.exec(html);
  const v = m?.[1] ?? m?.[2];
  return v ? stripTags(v) : undefined;
}

export interface PageSummary {
  title?: string;
  description?: string;
  published?: string; // YYYY-MM-DD
  text: string;
}

/** Sayfanın başlığı, açıklaması, yayın tarihi ve ana metni (en fazla maxChars) */
export function summarizePage(html: string, maxChars = 5000): PageSummary {
  const title = metaContent(html, 'og:title') ?? (stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '') || undefined);
  const description = metaContent(html, 'og:description') ?? metaContent(html, 'description');
  const pub = metaContent(html, 'article:published_time') ?? metaContent(html, 'citation_publication_date') ?? metaContent(html, 'dc.date');
  const published = pub && /^\d{4}[-/]\d{2}[-/]\d{2}/.test(pub) ? pub.slice(0, 10).replaceAll('/', '-') : undefined;

  let body = html
    .replace(/<(head|title|script|style|noscript|svg|nav|header|footer|form|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const main = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(body)?.[2];
  if (main) body = main;
  const text = stripTags(body.replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n')).slice(0, maxChars);
  return { title, description, published, text };
}
