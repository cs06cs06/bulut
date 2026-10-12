// Senaryo veri yapısı, yapılandırılmış çıktı şeması ve doğrulama.
// API şemayı garanti eder; burada yine de savunmacı biçimde temizliyoruz.

export type BrowserAction = 'show' | 'highlight' | 'click' | 'scroll';

export interface BrowserStep {
  action: BrowserAction;
  target: string;
  caption: string;
}

export type Visual =
  | { type: 'title'; heading: string; sub: string }
  | { type: 'bullets'; heading: string; items: string[] }
  | { type: 'browser'; url: string; steps: BrowserStep[] }
  | { type: 'compare'; heading: string; columns: string[]; rows: { label: string; values: string[] }[] }
  | { type: 'steps'; heading: string; steps: { text: string; detail: string }[] }
  | { type: 'code'; heading: string; language: string; code: string }
  | { type: 'callout'; kind: 'tip' | 'warning' | 'stat'; text: string }
  | { type: 'outro'; heading: string; cta: string }
  /** Yapay zekâ görselleriyle anlatılan sahne (liste maddesi, giriş ya da kapanış). number 0 ise numara gösterilmez. */
  | { type: 'photos'; number: number; heading: string; prompts: string[] };

export type VisualType = Visual['type'];

export interface Scene {
  id: string;
  chapter: string;
  narration: string;
  visual: Visual;
}

export interface Script {
  title: string;
  format: string;
  tools: string[];
  scenes: Scene[];
}

const VISUAL_TYPES = ['title', 'bullets', 'browser', 'compare', 'steps', 'code', 'callout', 'outro'] as const;
const ACTIONS = ['show', 'highlight', 'click', 'scroll'] as const;

const str = { type: 'string' };
const strArr = { type: 'array', items: str };

/**
 * Yapılandırılmış çıktı şeması. Görsel türleri tek bir düz nesnede toplanır (her alan zorunlu,
 * kullanılmayanlar boş); bu, birleşik (anyOf) şemalardan daha sağlam sonuç verir.
 */
export const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'format', 'tools', 'scenes'],
  properties: {
    title: str,
    format: { type: 'string', enum: ['tutorial', 'comparison', 'listicle'] },
    tools: strArr,
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['chapter', 'narration', 'visual'],
        properties: {
          chapter: str,
          narration: str,
          visual: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'heading', 'sub', 'items', 'url', 'steps', 'columns', 'rows', 'language', 'code', 'kind', 'text', 'cta'],
            properties: {
              type: { type: 'string', enum: [...VISUAL_TYPES] },
              heading: str,
              sub: str,
              items: strArr,
              url: str,
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['action', 'target', 'caption', 'text', 'detail'],
                  properties: {
                    action: { type: 'string', enum: [...ACTIONS, 'none'] },
                    target: str,
                    caption: str,
                    text: str,
                    detail: str,
                  },
                },
              },
              columns: strArr,
              rows: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['label', 'values'],
                  properties: { label: str, values: strArr },
                },
              },
              language: str,
              code: str,
              kind: { type: 'string', enum: ['tip', 'warning', 'stat', ''] },
              text: str,
              cta: str,
            },
          },
        },
      },
    },
  },
} as const;

type RawStep = { action?: string; target?: string; caption?: string; text?: string; detail?: string };
type RawVisual = {
  type?: string;
  heading?: string;
  sub?: string;
  items?: string[];
  url?: string;
  steps?: RawStep[];
  columns?: string[];
  rows?: { label?: string; values?: string[] }[];
  language?: string;
  code?: string;
  kind?: string;
  text?: string;
  cta?: string;
};
type RawScript = {
  title?: string;
  format?: string;
  tools?: string[];
  scenes?: { chapter?: string; narration?: string; visual?: RawVisual }[];
};

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);

export function isPublicHttpUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const h = url.hostname;
    return h.includes('.') && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(h);
  } catch {
    return false;
  }
}

/** Ham görseli tür güvenli hâle getirir; kullanılamazsa anlatımı özetleyen bir madde kartına düşer. */
export function normalizeVisual(v: RawVisual | undefined, fallbackHeading: string): Visual {
  const type = s(v?.type);
  const heading = s(v?.heading);
  switch (type) {
    case 'title':
      return { type, heading: heading || fallbackHeading, sub: s(v?.sub) };
    case 'bullets': {
      const items = arr(v?.items).slice(0, 6);
      if (items.length) return { type, heading: heading || fallbackHeading, items };
      break;
    }
    case 'browser': {
      const url = s(v?.url);
      if (!isPublicHttpUrl(url)) break;
      const steps: BrowserStep[] = (v?.steps ?? [])
        .map((st) => ({
          action: (ACTIONS as readonly string[]).includes(s(st.action)) ? (s(st.action) as BrowserAction) : 'show',
          target: s(st.target),
          caption: s(st.caption),
        }))
        .map((st) => (st.action !== 'show' && !st.target ? { ...st, action: 'show' as const } : st))
        .slice(0, 6);
      return { type, url, steps: steps.length ? steps : [{ action: 'show', target: '', caption: '' }] };
    }
    case 'compare': {
      const columns = arr(v?.columns).slice(0, 4);
      const rows = (v?.rows ?? [])
        .map((r) => ({ label: s(r.label), values: (r.values ?? []).map(s) }))
        .filter((r) => r.label)
        .map((r) => ({ ...r, values: columns.map((_, i) => r.values[i] ?? '') }))
        .slice(0, 8);
      if (columns.length >= 2 && rows.length) return { type, heading: heading || fallbackHeading, columns, rows };
      break;
    }
    case 'steps': {
      const steps = (v?.steps ?? [])
        .map((st) => ({ text: s(st.text) || s(st.caption), detail: s(st.detail) }))
        .filter((st) => st.text)
        .slice(0, 7);
      if (steps.length) return { type, heading: heading || fallbackHeading, steps };
      break;
    }
    case 'code': {
      const code = typeof v?.code === 'string' ? v.code.replace(/\s+$/, '') : '';
      if (code) return { type, heading, language: s(v?.language) || 'text', code };
      break;
    }
    case 'callout': {
      const text = s(v?.text);
      const kind = s(v?.kind);
      if (text) return { type, kind: kind === 'warning' || kind === 'stat' ? kind : 'tip', text };
      break;
    }
    case 'outro':
      return { type, heading: heading || 'Thanks for watching', cta: s(v?.cta) || 'Links are in the description' };
  }
  return { type: 'title', heading: heading || fallbackHeading, sub: '' };
}

/** Modelin ham çıktısını doğrular ve sahnelere kimlik verir. */
export function normalizeScript(raw: RawScript): Script {
  const title = s(raw.title);
  const scenes: Scene[] = [];
  for (const sc of raw.scenes ?? []) {
    const narration = s(sc.narration);
    if (!narration) continue;
    scenes.push({
      id: `s${String(scenes.length + 1).padStart(2, '0')}`,
      chapter: s(sc.chapter),
      narration,
      visual: normalizeVisual(sc.visual, s(sc.chapter) || title),
    });
  }
  if (scenes.length < 3) throw new Error(`Senaryo çok kısa: ${scenes.length} sahne`);
  if (!scenes[0].chapter) scenes[0].chapter = 'Intro';
  const last = scenes[scenes.length - 1];
  if (last.visual.type !== 'outro') last.visual = { type: 'outro', heading: 'Thanks for watching', cta: 'Links are in the description' };
  return {
    title,
    format: s(raw.format) || 'tutorial',
    tools: arr(raw.tools),
    scenes,
  };
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function scriptWords(script: Script): number {
  return script.scenes.reduce((n, sc) => n + wordCount(sc.narration), 0);
}

// ---------------------------------------------------------------------------
// Numaralı liste (listicle) senaryosu: giriş + N madde + kapanış; her bölümde görsel tarifleri

export const LISTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'intro', 'items', 'outro'],
  properties: {
    title: str,
    intro: {
      type: 'object',
      additionalProperties: false,
      required: ['narration', 'image_prompts'],
      properties: { narration: str, image_prompts: strArr },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'narration', 'image_prompts'],
        properties: { title: str, narration: str, image_prompts: strArr },
      },
    },
    outro: {
      type: 'object',
      additionalProperties: false,
      required: ['narration', 'image_prompts'],
      properties: { narration: str, image_prompts: strArr },
    },
  },
} as const;

type RawPart = { title?: string; narration?: string; image_prompts?: string[] };
type RawListicle = { title?: string; intro?: RawPart; items?: RawPart[]; outro?: RawPart };

export interface ListicleShape {
  items: number;
  images_per_item: number;
  intro_images: number;
  outro_images: number;
}

/** Görsel tarifi sayısını hedefe getirir: fazlası atılır, eksikse var olanlar sırayla tekrar kullanılır. */
export function fitPrompts(prompts: string[], want: number, fallback: string): string[] {
  const p = prompts.length ? prompts : [fallback];
  return Array.from({ length: Math.max(1, want) }, (_, i) => p[i % p.length]);
}

export function normalizeListicle(raw: RawListicle, shape: ListicleShape): Script {
  const title = s(raw.title);
  const scenes: Scene[] = [];
  const push = (chapter: string, narration: string, visual: Visual) =>
    scenes.push({ id: `s${String(scenes.length + 1).padStart(2, '0')}`, chapter, narration, visual });

  const intro = s(raw.intro?.narration);
  if (intro) {
    push('Intro', intro, {
      type: 'photos',
      number: 0,
      heading: '',
      prompts: fitPrompts(arr(raw.intro?.image_prompts), shape.intro_images, title),
    });
  }
  const items = (raw.items ?? []).filter((it) => s(it.narration) && s(it.title));
  items.forEach((it, i) => {
    const heading = s(it.title).replace(/^#?\d+[.):\s-]+/, '');
    push(`${i + 1}. ${heading}`, s(it.narration), {
      type: 'photos',
      number: i + 1,
      heading,
      prompts: fitPrompts(arr(it.image_prompts), shape.images_per_item, heading),
    });
  });
  const outro = s(raw.outro?.narration);
  if (outro) {
    push('', outro, { type: 'photos', number: 0, heading: '', prompts: fitPrompts(arr(raw.outro?.image_prompts), shape.outro_images, title) });
  }
  if (items.length < 5) throw new Error(`Senaryo çok kısa: ${items.length} madde`);
  return { title, format: 'listicle', tools: [], scenes };
}
