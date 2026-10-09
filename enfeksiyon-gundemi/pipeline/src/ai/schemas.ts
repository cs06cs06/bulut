// Yapılandırılmış çıktı (JSON şeması) tanımları ve doğrulama.
// API şeması garanti eder; burada yine de savunmacı biçimde kontrol ediyoruz.

import type { Topic } from '../lib/config.ts';

export const STUDY_TYPES = [
  'guideline',
  'consensus',
  'rct',
  'meta_analysis',
  'systematic_review',
  'cohort',
  'case_control',
  'cross_sectional',
  'diagnostic_accuracy',
  'surveillance',
  'outbreak_report',
  'modeling',
  'narrative_review',
  'basic_science',
  'case_report',
  'letter_comment',
  'other',
] as const;

export const IMPACTS = ['practice_changing', 'important', 'informational'] as const;
export const MATURITY = ['mature', 'promising_early', 'preliminary'] as const;

export function triageSchema(topics: Topic[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['relevant', 'importance', 'topics', 'study_type', 'title_tr', 'summary_tr', 'reason'],
    properties: {
      relevant: { type: 'boolean' },
      importance: { type: 'integer', enum: [1, 2, 3, 4, 5] },
      topics: { type: 'array', items: { type: 'string', enum: topics.map((t) => t.kod) } },
      study_type: { type: 'string', enum: [...STUDY_TYPES] },
      title_tr: { type: 'string' },
      summary_tr: { type: 'string' },
      reason: { type: 'string' },
    },
  };
}

export interface TriageOutput {
  relevant: boolean;
  importance: number;
  topics: string[];
  study_type: string;
  title_tr: string;
  summary_tr: string;
  reason: string;
}

export function reviewSchema(topics: Topic[]) {
  const str = { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'title_tr', 'hook', 'impact', 'before', 'after', 'in_practice', 'evidence_design', 'evidence_results',
      'evidence_maturity', 'limitations', 'funding_coi', 'context', 'related_review_ids', 'turkey', 'topics',
      'guideline_changes', 'guideline_key_points',
    ],
    properties: {
      title_tr: str,
      hook: str,
      impact: { type: 'string', enum: [...IMPACTS] },
      before: str,
      after: str,
      in_practice: str,
      evidence_design: str,
      evidence_results: str,
      evidence_maturity: { type: 'string', enum: [...MATURITY] },
      limitations: str,
      funding_coi: str,
      context: str,
      related_review_ids: { type: 'array', items: { type: 'integer' } },
      turkey: str,
      topics: { type: 'array', items: { type: 'string', enum: topics.map((t) => t.kod) } },
      guideline_changes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['before', 'after', 'significance'],
          properties: { before: str, after: str, significance: { type: 'string', enum: ['major', 'minor'] } },
        },
      },
      guideline_key_points: { type: 'array', items: str },
    },
  };
}

export interface ReviewOutput {
  title_tr: string;
  hook: string;
  impact: (typeof IMPACTS)[number];
  before: string;
  after: string;
  in_practice: string;
  evidence_design: string;
  evidence_results: string;
  evidence_maturity: (typeof MATURITY)[number];
  limitations: string;
  funding_coi: string;
  context: string;
  related_review_ids: number[];
  turkey: string;
  topics: string[];
  guideline_changes: { before: string; after: string; significance: 'major' | 'minor' }[];
  guideline_key_points: string[];
}

const isStr = (v: unknown): v is string => typeof v === 'string';

export function validateTriage(v: unknown, topicCodes: Set<string>): TriageOutput | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.relevant !== 'boolean' || typeof o.importance !== 'number') return null;
  if (![o.study_type, o.title_tr, o.summary_tr, o.reason].every(isStr) || !Array.isArray(o.topics)) return null;
  return {
    relevant: o.relevant,
    importance: Math.min(5, Math.max(1, Math.round(o.importance))),
    topics: (o.topics as unknown[]).filter((t): t is string => isStr(t) && topicCodes.has(t)).slice(0, 3),
    study_type: o.study_type as string,
    title_tr: (o.title_tr as string).trim(),
    summary_tr: (o.summary_tr as string).trim(),
    reason: (o.reason as string).trim(),
  };
}

export function validateReview(v: unknown, topicCodes: Set<string>): ReviewOutput | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const textFields = [
    'title_tr', 'hook', 'before', 'after', 'in_practice', 'evidence_design', 'evidence_results',
    'limitations', 'funding_coi', 'context', 'turkey',
  ];
  if (!textFields.every((k) => isStr(o[k]))) return null;
  if (!IMPACTS.includes(o.impact as never) || !MATURITY.includes(o.evidence_maturity as never)) return null;
  if (!(o.title_tr as string).trim() || !(o.hook as string).trim()) return null;
  return {
    ...(o as unknown as ReviewOutput),
    related_review_ids: Array.isArray(o.related_review_ids) ? (o.related_review_ids as unknown[]).filter(Number.isInteger) as number[] : [],
    topics: Array.isArray(o.topics) ? (o.topics as unknown[]).filter((t): t is string => isStr(t) && topicCodes.has(t)).slice(0, 3) : [],
    guideline_changes: Array.isArray(o.guideline_changes) ? (o.guideline_changes as ReviewOutput['guideline_changes']) : [],
    guideline_key_points: Array.isArray(o.guideline_key_points) ? (o.guideline_key_points as unknown[]).filter(isStr) : [],
  };
}
