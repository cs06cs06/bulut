// Anthropic API erişimi. Testlerde sahte bir uygulamayla değiştirilebilsin diye arayüz arkasında.

import Anthropic from '@anthropic-ai/sdk';
import type { StageAi } from '../lib/config.ts';
import type { UsageLike } from '../lib/usage.ts';

export interface AskOptions {
  stage: StageAi;
  system: string;
  user: string;
  /** Web araması ve sayfa okuma araçlarını aç (araştırma aşamaları). */
  web?: boolean;
  /** Yapılandırılmış çıktı şeması (web araçlarıyla birlikte kullanılmaz). */
  schema?: Record<string, unknown>;
}

export interface AskResult {
  text: string;
  usage: UsageLike;
  model: string;
}

export interface AiClient {
  ask(opts: AskOptions): Promise<AskResult>;
}

/** Birden çok yanıtın (pause_turn devamları) kullanımını toplar. */
function addUsage(a: UsageLike, b: Anthropic.Beta.Messages.BetaUsage): UsageLike {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    server_tool_use: {
      web_search_requests:
        (a.server_tool_use?.web_search_requests ?? 0) + (b.server_tool_use?.web_search_requests ?? 0),
      web_fetch_requests: (a.server_tool_use?.web_fetch_requests ?? 0) + (b.server_tool_use?.web_fetch_requests ?? 0),
    },
  };
}

export class AnthropicAiClient implements AiClient {
  private client: Anthropic;
  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 4 });
  }

  async ask(opts: AskOptions): Promise<AskResult> {
    const { stage } = opts;
    const tools: Anthropic.Beta.Messages.BetaToolUnion[] = opts.web
      ? [
          { type: 'web_search_20260209', name: 'web_search', max_uses: stage.web_searches ?? 5 },
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: stage.web_fetches ?? 5 },
        ]
      : [];
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: opts.user }];
    let usage: UsageLike = { input_tokens: 0, output_tokens: 0 };

    // Web araçlı uzun aramalarda sunucu turu duraklatabilir (pause_turn); kaldığı yerden devam ettiririz.
    for (let round = 0; round < 6; round++) {
      const res = await this.client.beta.messages
        .stream({
          model: stage.model,
          max_tokens: stage.max_tokens,
          system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
          messages,
          ...(tools.length ? { tools } : {}),
          output_config: {
            effort: stage.effort,
            ...(opts.schema ? { format: { type: 'json_schema' as const, schema: opts.schema } } : {}),
          },
          // Güvenlik filtresi yanlışlıkla reddederse Anthropic'in önerdiği modelle sunucu tarafında yeniden dener.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
        .finalMessage();
      usage = addUsage(usage, res.usage);

      if (res.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: res.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
        continue;
      }
      if (res.stop_reason === 'refusal') {
        throw new Error(`Model isteği reddetti (${res.stop_details?.category ?? 'kategori yok'})`);
      }
      if (res.stop_reason === 'max_tokens') {
        throw new Error(`Yanıt max_tokens sınırında kesildi (${stage.max_tokens}); config/ai.yaml'da artırın`);
      }
      // Web araçlı yanıtlarda metin birden çok bloğa bölünür (alıntılar); hepsini birleştiriyoruz.
      const text = res.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return { text, usage, model: res.model };
    }
    throw new Error('Model yanıtı çok sayıda duraklamadan sonra tamamlanmadı');
  }
}

/** Yapılandırılmış çıktıyı ayrıştırır. */
export function parseJson<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error('Model çıktısı JSON olarak ayrıştırılamadı');
  }
}
