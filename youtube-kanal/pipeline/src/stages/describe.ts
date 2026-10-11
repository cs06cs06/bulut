// Video açıklaması: giriş metni + bağlantılar (affiliate) + bölüm zaman damgaları + beyanlar + hashtag.

import type { AffiliateLink, ChannelConfig } from '../lib/config.ts';
import type { Script } from '../lib/script.ts';
import type { Metadata } from './write.ts';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Senaryoda adı geçen bağlantıları bulur: araç listesinde büyük/küçük harf duyarsız, anlatımda ise
 * büyük/küçük harf duyarlı (marka adları büyük harfle yazılır; "make a page" Make.com ile eşleşmesin).
 */
export function matchAffiliates(script: Script, links: AffiliateLink[]): AffiliateLink[] {
  const tools = new Set(script.tools.map((t) => t.toLowerCase()));
  const narration = script.scenes.map((s) => s.narration).join('\n');
  return links.filter((l) =>
    [l.name, ...(l.aliases ?? [])].some(
      (n) => n && (tools.has(n.toLowerCase()) || new RegExp(`(^|[^\\w])${escapeRe(n)}([^\\w]|$)`).test(narration)),
    ),
  );
}

export function buildDescription(args: {
  channel: ChannelConfig;
  meta: Metadata;
  script: Script;
  links: AffiliateLink[];
  chapters: { time: string; title: string }[];
}): string {
  const { channel, meta, chapters } = args;
  const links = matchAffiliates(args.script, args.links);
  const parts: string[] = [meta.description_intro];

  if (links.length) {
    parts.push(
      '🔗 Tools mentioned\n' + links.map((l) => `• ${l.name}: ${l.url}${l.note ? ` (${l.note})` : ''}`).join('\n'),
    );
  }
  if (chapters.length) parts.push('⏱️ Chapters\n' + chapters.map((c) => `${c.time} ${c.title}`).join('\n'));

  const notes: string[] = [];
  if (links.some((l) => l.affiliate)) notes.push(channel.description.affiliate_disclosure.trim());
  if (channel.description.ai_disclosure?.trim()) notes.push(channel.description.ai_disclosure.trim());
  if (channel.description.footer?.trim()) notes.push(channel.description.footer.trim());
  if (notes.length) parts.push(notes.join('\n\n'));
  if (meta.hashtags.length) parts.push(meta.hashtags.join(' '));

  // YouTube açıklama sınırı 5000 karakter; < ve > karakterlerine izin verilmez.
  return parts.filter(Boolean).join('\n\n').replace(/[<>]/g, '').slice(0, 4900);
}
