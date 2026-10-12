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
  /** Altyazıda vurgulanacak anahtar kelimeler (listicle) */
  keywords?: string[];
  /** Görüntünün %15–20 yakınlaşacağı (punch-in) vurgu ifadesi; anlatımdan birebir alıntı */
  punch?: string;
  /** Bu sahnenin son cümlesi abone çağrısıdır (animasyon + "pop" sesi) */
  subscribe?: boolean;
  /** Sahnede görüntü değişim aralığı (saniye); kancada kısa */
  cadence?: number;
}

export interface ShortSpec {
  title: string;
  /** Shorts'un ilk 3 saniyesinde ekranın üstünde duran büyük soru/kanca metni */
  hook_text: string;
  narration: string;
  /** Görsellerinin alınacağı madde numarası */
  number: number;
}

export interface Script {
  title: string;
  format: string;
  tools: string[];
  scenes: Scene[];
  shorts?: ShortSpec[];
  /** Kapanışta yönlendirilen sonraki video konusu (bitiş ekranı) */
  next_video?: string;
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
// Numaralı liste (listicle) senaryosu — v2
// Kanca (ilk 5 saniye: en çarpıcı anlardan kısa kesitler + açık döngü) → geri sayımlı maddeler
// (en güçlüsü #1, en sonda) → maddeler arasına yerleştirilmiş fayda odaklı abone çağrısı →
// sonraki videoya yönlendiren kapanış. Ayrıca aynı görsellerden 15–45 saniyelik Shorts senaryoları.

const part = (extra: Record<string, unknown> = {}) => ({
  type: 'object',
  additionalProperties: false,
  required: ['narration', 'image_prompts', ...Object.keys(extra)],
  properties: { narration: str, image_prompts: strArr, ...extra },
});

export const LISTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'hook', 'items', 'subscribe', 'outro', 'shorts'],
  properties: {
    title: str,
    hook: part(),
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'narration', 'image_prompts', 'keywords', 'punch'],
        properties: { title: str, narration: str, image_prompts: strArr, keywords: strArr, punch: str },
      },
    },
    subscribe: {
      type: 'object',
      additionalProperties: false,
      required: ['after_number', 'line'],
      properties: { after_number: { type: 'integer' }, line: str },
    },
    outro: part({ next_video: str }),
    shorts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'hook_text', 'narration', 'number'],
        properties: { title: str, hook_text: str, narration: str, number: { type: 'integer' } },
      },
    },
  },
} as const;

type RawPart = { title?: string; narration?: string; image_prompts?: string[]; keywords?: string[]; punch?: string; next_video?: string };
type RawListicle = {
  title?: string;
  hook?: RawPart;
  items?: RawPart[];
  subscribe?: { after_number?: number; line?: string };
  outro?: RawPart;
  shorts?: { title?: string; hook_text?: string; narration?: string; number?: number }[];
};

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

/** Vurgu ifadesi anlatımda birebir geçmiyorsa kullanılamaz (zamanlaması bulunamaz). */
function punchIn(narration: string, punch: string): string | undefined {
  const p = punch.trim().replace(/[.!?]+$/, '');
  return p && narration.toLowerCase().includes(p.toLowerCase()) ? p : undefined;
}

export function normalizeListicle(raw: RawListicle, shape: ListicleShape): Script {
  const title = s(raw.title);
  const scenes: Scene[] = [];
  const push = (sc: Omit<Scene, 'id'>) => scenes.push({ id: `s${String(scenes.length + 1).padStart(2, '0')}`, ...sc });

  const hook = s(raw.hook?.narration);
  if (hook) {
    push({
      chapter: 'Intro',
      narration: hook,
      cadence: 2,
      visual: { type: 'photos', number: 0, heading: '', prompts: fitPrompts(arr(raw.hook?.image_prompts), shape.intro_images, title) },
    });
  }
  const items = (raw.items ?? []).filter((it) => s(it.narration) && s(it.title));
  const n = items.length;
  if (n < 5) throw new Error(`Senaryo çok kısa: ${n} madde`);
  const subNumber = Math.round(Number(raw.subscribe?.after_number ?? 0));
  const subLine = s(raw.subscribe?.line);
  // Abone çağrısı en erken 3. maddeden sonra, en geç sondan bir önceki maddeden önce
  const subAt = subLine ? Math.min(n - 1, Math.max(3, subNumber >= 1 && subNumber <= n ? n - subNumber + 1 : Math.ceil(n * 0.45))) : 0;
  items.forEach((it, i) => {
    const number = n - i; // geri sayım: ilk madde en büyük numara, son madde #1
    const heading = s(it.title).replace(/^#?\d+[.):\s-]+/, '');
    let narration = s(it.narration);
    const subscribe = subAt === i + 1;
    if (subscribe) narration = `${narration} ${subLine}`;
    push({
      chapter: `#${number} ${heading}`,
      narration,
      keywords: arr(it.keywords).slice(0, 5),
      punch: punchIn(s(it.narration), s(it.punch)),
      subscribe: subscribe || undefined,
      visual: { type: 'photos', number, heading, prompts: fitPrompts(arr(it.image_prompts), shape.images_per_item, heading) },
    });
  });
  const outro = s(raw.outro?.narration);
  if (outro) {
    push({
      chapter: 'Up next',
      narration: outro,
      visual: { type: 'photos', number: 0, heading: '', prompts: fitPrompts(arr(raw.outro?.image_prompts), shape.outro_images, title) },
    });
  }
  const shorts: ShortSpec[] = (raw.shorts ?? [])
    .map((sh) => ({
      title: s(sh.title),
      hook_text: s(sh.hook_text),
      narration: s(sh.narration),
      number: Math.round(Number(sh.number ?? 0)),
    }))
    .filter((sh) => sh.narration && sh.number >= 1 && sh.number <= n)
    .slice(0, 3);
  return { title, format: 'listicle', tools: [], scenes, shorts, next_video: s(raw.outro?.next_video) || undefined };
}
