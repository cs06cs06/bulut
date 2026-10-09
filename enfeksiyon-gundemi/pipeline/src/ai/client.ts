// Anthropic API erişimi. Testlerde sahte bir uygulamayla değiştirilebilsin diye arayüz arkasında.

import Anthropic from '@anthropic-ai/sdk';

export type BatchRequest = { custom_id: string; params: Anthropic.MessageCreateParamsNonStreaming };

export interface AiClient {
  createBatch(requests: BatchRequest[]): Promise<{ id: string }>;
  batchStatus(id: string): Promise<'in_progress' | 'canceling' | 'ended'>;
  batchResults(id: string): AsyncIterable<Anthropic.Messages.MessageBatchIndividualResponse>;
  /**
   * Tek istek; güvenlik filtresi reddederse sunucu tarafında Anthropic'in önerdiği
   * yedek modelle yeniden dener (Batch API'de bu seçenek yok).
   */
  createWithFallback(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}

export class AnthropicAiClient implements AiClient {
  private client: Anthropic;
  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 4 });
  }

  async createBatch(requests: BatchRequest[]) {
    const b = await this.client.messages.batches.create({ requests });
    return { id: b.id };
  }

  async batchStatus(id: string) {
    const b = await this.client.messages.batches.retrieve(id);
    return b.processing_status;
  }

  async *batchResults(id: string) {
    for await (const r of await this.client.messages.batches.results(id)) yield r;
  }

  async createWithFallback(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    const res = await this.client.beta.messages.create({
      ...(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming),
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    return res as unknown as Anthropic.Message;
  }
}
