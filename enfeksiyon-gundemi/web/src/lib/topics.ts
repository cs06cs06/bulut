// Konu etiketleri: config/topics.yaml'dan (tek kaynak) derleme sırasında okunur.
import { parse } from 'yaml';
import raw from '../../../config/topics.yaml?raw';

export interface Topic {
  kod: string;
  ad: string;
}

export const TOPICS: Topic[] = (parse(raw) as { kod: string; ad: string }[]).map((t) => ({ kod: t.kod, ad: t.ad }));
export const TOPIC_NAME: Record<string, string> = Object.fromEntries(TOPICS.map((t) => [t.kod, t.ad]));

/** Kart çizimi: her konu bir motif ve renk tonu (HSL) alır. */
export type Motif = 'capsule' | 'shield' | 'droplet' | 'lungs' | 'virus' | 'rod' | 'spores' | 'globe' | 'syringe' | 'cell' | 'dish' | 'heart';

const VISUAL: Record<string, { motif: Motif; hue: number }> = {
  amr: { motif: 'capsule', hue: 32 },
  stewardship: { motif: 'capsule', hue: 40 },
  antimikrobiyal_tedavi: { motif: 'capsule', hue: 24 },
  hastane_enfeksiyonlari: { motif: 'shield', hue: 175 },
  enfeksiyon_kontrolu: { motif: 'shield', hue: 160 },
  sepsis: { motif: 'droplet', hue: 355 },
  solunum: { motif: 'lungs', hue: 205 },
  hiv: { motif: 'virus', hue: 280 },
  hepatit: { motif: 'virus', hue: 300 },
  viroloji: { motif: 'virus', hue: 265 },
  tuberkuloz: { motif: 'rod', hue: 18 },
  mikoloji: { motif: 'spores', hue: 120 },
  parazitoloji: { motif: 'globe', hue: 85 },
  tropikal_zoonoz: { motif: 'globe', hue: 95 },
  asilar: { motif: 'syringe', hue: 215 },
  immunsupresif: { motif: 'cell', hue: 330 },
  tanisal_mikrobiyoloji: { motif: 'dish', hue: 45 },
  organ_enfeksiyonlari: { motif: 'heart', hue: 345 },
  halk_sagligi: { motif: 'globe', hue: 190 },
};

export function visualFor(topics: string[] | null | undefined): { motif: Motif; hue: number } {
  for (const t of topics ?? []) if (VISUAL[t]) return VISUAL[t];
  return { motif: 'rod', hue: 40 };
}

export function parseTopics(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
