// Yapay zekâ isteklerini kurar ve yanıtlarını çözümler.

import type Anthropic from '@anthropic-ai/sdk';
import type { AiConfig, Topic } from '../lib/config.ts';
import { reviewSchema, triageSchema, validateReview, validateTriage, type ReviewOutput, type TriageOutput } from './schemas.ts';

type Params = Anthropic.MessageCreateParamsNonStreaming;

/** İstemlerde kullanılan yayın bilgisi */
export interface WorkForAi {
  id: number;
  title: string;
  abstract: string | null;
  authors: string | null; // JSON
  journal: string | null;
  journal_abbr: string | null;
  journal_tier: number | null;
  is_turkish_journal: number;
  pub_date: string | null;
  pub_types: string | null; // JSON
  mesh: string | null; // JSON
  keywords: string | null; // JSON
  coi: string | null;
  grants: string | null; // JSON
  is_preprint: number;
  kind: string;
  doi: string | null;
  pmid: string | null;
  pmcid?: string | null;
  fulltext_url?: string | null;
}

const arr = (json: string | null): string[] => {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

function topicList(topics: Topic[]): string {
  return topics.map((t) => `- ${t.kod}: ${t.ad} (${t.kapsam})`).join('\n');
}

/** Yayının künye + özet metni (modele verilen veri) */
export function describeWork(w: WorkForAi, opts: { full?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`Başlık: ${w.title}`);
  const journal = [w.journal, w.journal_abbr && w.journal_abbr !== w.journal ? `(${w.journal_abbr})` : ''].filter(Boolean).join(' ');
  if (journal) lines.push(`Dergi: ${journal}`);
  lines.push(`Dergi katmanı: ${w.journal_tier ? `${w.journal_tier}. katman` : 'listede yok'}${w.is_turkish_journal ? ' (Türkiye kaynaklı dergi)' : ''}`);
  if (w.pub_date) lines.push(`Yayın tarihi: ${w.pub_date}`);
  const types = arr(w.pub_types);
  if (types.length) lines.push(`Yayın türü: ${types.join(', ')}`);
  if (w.is_preprint) lines.push('Not: Bu bir ÖN BASKIDIR (hakem değerlendirmesinden geçmemiş).');
  if (w.kind === 'report') lines.push('Not: Bu bir rapor / kurum yayını kaydıdır (hakemli dergi makalesi değil).');
  if (w.kind === 'guideline') lines.push('Not: Bu bir klinik rehber ya da rehber duyurusudur.');
  if (!w.pmid && !w.doi && w.kind !== 'article') lines.push('Not: Metin kurumun web sayfasından otomatik alınmıştır; menü vb. kalıntılar içerebilir.');
  const authors = arr(w.authors);
  if (opts.full && authors.length) lines.push(`Yazarlar: ${authors.length > 6 ? `${authors.slice(0, 6).join(', ')} ve ark.` : authors.join(', ')}`);
  const mesh = arr(w.mesh);
  if (mesh.length) lines.push(`MeSH: ${mesh.slice(0, 15).join('; ')}`);
  const kw = arr(w.keywords);
  if (kw.length) lines.push(`Anahtar kelimeler: ${kw.slice(0, 12).join('; ')}`);
  if (opts.full) {
    const grants = arr(w.grants);
    lines.push(`Finansman (kayıttaki): ${grants.length ? grants.join('; ') : 'belirtilmemiş'}`);
    lines.push(`Çıkar çatışması beyanı: ${w.coi ?? 'kayıtta yok'}`);
  }
  lines.push('');
  lines.push(w.abstract ? `Özet:\n${w.abstract}` : 'Özet: (özet yok)');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Triyaj

export function buildTriageParams(w: WorkForAi, cfg: AiConfig, systemPrompt: string, topics: Topic[]): Params {
  return {
    model: cfg.triage.model,
    max_tokens: cfg.triage.max_tokens,
    system: [
      {
        type: 'text',
        text: `${systemPrompt}\n\n## Konu kodları\n\n${topicList(topics)}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: describeWork(w) }],
    output_config: { effort: cfg.triage.effort, format: { type: 'json_schema', schema: triageSchema(topics) } },
  };
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; refused: boolean; error: string };

function parseJsonMessage<T>(msg: Anthropic.Message, validate: (v: unknown) => T | null): ParseResult<T> {
  if (msg.stop_reason === 'refusal') {
    return { ok: false, refused: true, error: `model yanıt vermeyi reddetti (${msg.stop_details?.category ?? 'kategori yok'})` };
  }
  if (msg.stop_reason === 'max_tokens') return { ok: false, refused: false, error: 'yanıt token sınırında kesildi' };
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
  if (!text) return { ok: false, refused: false, error: 'yanıtta metin yok' };
  try {
    const v = validate(JSON.parse(text));
    return v ? { ok: true, value: v } : { ok: false, refused: false, error: 'yanıt şemaya uymuyor' };
  } catch {
    return { ok: false, refused: false, error: 'yanıt JSON değil' };
  }
}

export function parseTriage(msg: Anthropic.Message, topicCodes: Set<string>): ParseResult<TriageOutput> {
  return parseJsonMessage(msg, (v) => validateTriage(v, topicCodes));
}

/** Kural tabanlı ön eleme: içeriksiz kayıtlar yapay zekâya gönderilmez. */
export function ruleTriage(w: WorkForAi): { reason: string } | null {
  const t = w.title.trim();
  if (/^(erratum|correction|corrigendum|addendum|publisher'?s note|expression of concern)\b/i.test(t) || /^(correction to|erratum to|erratum for)\b/i.test(t)) {
    return { reason: 'Düzeltme/erratum kaydı' };
  }
  const types = arr(w.pub_types);
  if (types.includes('Published Erratum')) return { reason: 'Düzeltme/erratum kaydı' };
  return null;
}

// ---------------------------------------------------------------------------
// Editör yazısı

export interface RelatedReview {
  id: number;
  title_tr: string;
  hook: string;
  created_at: string;
  after?: string | null; // yazının "Şimdi" bölümü: ilişkiyi (destek/çelişki) değerlendirmek için
}

export function buildReviewParams(
  w: WorkForAi,
  triage: { title_tr: string | null; study_type: string | null },
  related: RelatedReview[],
  cfg: AiConfig,
  systemPrompt: string,
  topics: Topic[],
  fullText?: { text: string; source: string; truncated: boolean } | null,
): Params {
  const parts: string[] = [];
  parts.push('Aşağıdaki yayın için editör yazısını hazırla.');
  parts.push('');
  parts.push(
    fullText
      ? `Dayanak: künye, özet ve TAM METİN (${fullText.source}${fullText.truncated ? '; uzunluk sınırı nedeniyle sonu kısaltıldı' : ''}). Tablolar ve şekiller metne dahil değildir.`
      : 'Dayanak: yalnızca aşağıdaki künye ve ÖZET (tam metin yok).',
  );
  if (triage.study_type) parts.push(`Ön değerlendirmedeki yayın türü: ${triage.study_type}`);
  parts.push('');
  parts.push(describeWork(w, { full: true }));
  parts.push('');
  if (fullText) {
    parts.push('## Tam metin');
    parts.push(fullText.text);
    parts.push('');
  }
  if (related.length) {
    parts.push('## Daha önce sunulan, konuca ilişkili olabilecek yazılar');
    for (const r of related) {
      const after = r.after ? ` (O yazıdaki sonuç: ${r.after.length > 300 ? `${r.after.slice(0, 300)}…` : r.after})` : '';
      parts.push(`- [id ${r.id}] ${r.created_at.slice(0, 10)} — ${r.title_tr}: ${r.hook}${after}`);
    }
  } else {
    parts.push('## Daha önce sunulan yazılar\n(Arşivde bu konuda henüz yazı yok.)');
  }
  return {
    model: cfg.review.model,
    max_tokens: cfg.review.max_tokens,
    system: [
      {
        type: 'text',
        text: `${systemPrompt}\n\n## Konu kodları\n\n${topicList(topics)}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: parts.join('\n') }],
    output_config: { effort: cfg.review.effort, format: { type: 'json_schema', schema: reviewSchema(topics) } },
  };
}

export function parseReview(msg: Anthropic.Message, topicCodes: Set<string>): ParseResult<ReviewOutput> {
  return parseJsonMessage(msg, (v) => validateReview(v, topicCodes));
}
