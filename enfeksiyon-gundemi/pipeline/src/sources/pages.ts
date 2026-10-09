// RSS'i olmayan kurum sayfalarını izleme: sayfadaki yeni bağlantılar kayıt olur.
// İlk çalıştırmada mevcut bağlantılar yalnızca "görüldü" diye işaretlenir (geçmiş arşiv eklenmez).

import type { PageSourceConfig } from '../lib/config.ts';
import { selectIn, type Stmt } from '../lib/db.ts';
import { extractLinks, summarizePage } from '../lib/html.ts';
import type { NormalizedRecord } from '../lib/normalize.ts';
import { baseRecord, getText, type Source } from './types.ts';

export type PageConfig = PageSourceConfig;

const MAX_DETAIL = 10;

export function pageSource(cfg: PageConfig): Source {
  const include = new RegExp(cfg.link);
  const exclude = cfg.exclude ? new RegExp(cfg.exclude) : null;
  const id = `page:${cfg.id}`;
  return {
    id,
    name: cfg.name,
    async fetch(ctx) {
      const html = await getText(cfg.url, 'text/html');
      const links = extractLinks(html, cfg.url).filter(
        (l) => include.test(l.url) && !(exclude && exclude.test(l.url)) && l.url.replace(/\/$/, '') !== cfg.url.replace(/\/$/, ''),
      );
      if (links.length === 0) {
        // Sayfa tasarımı değişmiş olabilir: sağlık panosu bunu "0 kayıt" olarak görür
        throw new Error(`${cfg.name} sayfasında beklenen bağlantılar bulunamadı (sayfa yapısı değişmiş olabilir).`);
      }
      const known = new Set(
        (await selectIn<{ url: string }>(ctx.db, (ph) => `SELECT url FROM page_links WHERE source = '${id}' AND url IN (${ph})`, links.map((l) => l.url))).map(
          (r) => r.url,
        ),
      );
      const fresh = links.filter((l) => !known.has(l.url));
      const stmts: Stmt[] = fresh.map((l) => ({
        sql: 'INSERT OR IGNORE INTO page_links (source, url, first_seen) VALUES (?, ?, ?)',
        params: [id, l.url, new Date().toISOString()],
      }));
      for (let i = 0; i < stmts.length; i += 50) await ctx.db.batch(stmts.slice(i, i + 50));

      if (ctx.firstRun) return { records: [], note: `${fresh.length} mevcut bağlantı izlemeye alındı` };

      const records: NormalizedRecord[] = [];
      for (const [i, l] of fresh.entries()) {
        // "… (May 2026)" gibi sondaki tarih eki atılır: dergi kaydıyla başlık eşleşmesi kolaylaşır
        const r = baseRecord(id, l.url, (l.text || l.url).replace(/\s*\([A-Za-zÇŞĞÜÖİçşğüöı]{3,9}\.? \d{4}\)$/, ''));
        r.url = l.url;
        r.journal = cfg.name;
        r.journalAbbr = cfg.name;
        r.pubDate = ctx.today;
        r.kind = cfg.kind ?? 'report';
        r.language = cfg.language;
        r.pubTypes = cfg.kind === 'guideline' ? ['Practice Guideline'] : ['Announcement'];
        if (cfg.fetch_detail !== false && i < MAX_DETAIL) {
          try {
            const page = summarizePage(await getText(l.url, 'text/html'));
            if (page.title) r.title = page.title.replace(/\s*[|–-]\s*[^|–-]{2,40}$/, '').trim() || r.title;
            r.abstract = [page.description, page.text].filter(Boolean).join('\n').slice(0, 6000) || undefined;
            if (page.published) r.pubDate = page.published;
          } catch {
            /* ayrıntı alınamazsa bağlantı metniyle devam */
          }
        }
        if (r.title.length >= 8) records.push(r);
      }
      return { records, note: `${links.length} bağlantı, ${fresh.length} yeni` };
    },
  };
}
