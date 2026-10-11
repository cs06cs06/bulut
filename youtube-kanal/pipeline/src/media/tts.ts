// Seslendirme sağlayıcıları. Her sahne ayrı bir ses dosyası olur; süresi ffprobe ile ölçülür.

import { writeFileSync } from 'node:fs';
import type { ChannelConfig } from '../lib/config.ts';
import { wordCount } from '../lib/script.ts';
import { ffmpeg } from './ffmpeg.ts';

export interface TtsProvider {
  name: string;
  /** Metni seslendirip `out` (mp3) dosyasına yazar. */
  synthesize(text: string, out: string): Promise<void>;
}

async function postAudio(url: string, headers: Record<string, string>, body: unknown, label: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const msg = (await res.text()).slice(0, 500);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 4) throw new Error(`${label} seslendirme hatası (HTTP ${res.status}): ${msg}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

export function elevenLabs(cfg: ChannelConfig['voice']['elevenlabs'], apiKey: string): TtsProvider {
  return {
    name: 'elevenlabs',
    async synthesize(text, out) {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.voice_id)}?output_format=mp3_44100_128`;
      const audio = await postAudio(
        url,
        { 'xi-api-key': apiKey, accept: 'audio/mpeg' },
        {
          text,
          model_id: cfg.model_id,
          voice_settings: { stability: cfg.stability, similarity_boost: cfg.similarity_boost },
        },
        'ElevenLabs',
      );
      writeFileSync(out, audio);
    },
  };
}

export function openAi(cfg: ChannelConfig['voice']['openai'], apiKey: string): TtsProvider {
  return {
    name: 'openai',
    async synthesize(text, out) {
      const audio = await postAudio(
        'https://api.openai.com/v1/audio/speech',
        { authorization: `Bearer ${apiKey}` },
        { model: cfg.model, voice: cfg.voice, input: text, instructions: cfg.instructions, response_format: 'mp3' },
        'OpenAI',
      );
      writeFileSync(out, audio);
    },
  };
}

/** Anahtar gerektirmeyen sessiz önizleme: konuşma hızına göre süre hesaplanır (test ve deneme için). */
export function silent(wordsPerMinute: number): TtsProvider {
  return {
    name: 'silent',
    async synthesize(text, out) {
      const seconds = Math.max(1.5, (wordCount(text) / wordsPerMinute) * 60);
      await ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', seconds.toFixed(2), '-c:a', 'libmp3lame', '-b:a', '64k', out]);
    },
  };
}

export function ttsFromConfig(channel: ChannelConfig, env = process.env): TtsProvider {
  const v = channel.voice;
  // TTS_PROVIDER ortam değişkeni ayarı geçici olarak geçersiz kılar (ör. silent ile sessiz deneme).
  const provider = (env.TTS_PROVIDER as ChannelConfig['voice']['provider']) || v.provider;
  switch (provider) {
    case 'elevenlabs':
      if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY tanımlı değil (GitHub → Settings → Secrets)');
      return elevenLabs(v.elevenlabs, env.ELEVENLABS_API_KEY);
    case 'openai':
      if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY tanımlı değil (GitHub → Settings → Secrets)');
      return openAi(v.openai, env.OPENAI_API_KEY);
    case 'silent':
      return silent(channel.video.words_per_minute);
    default:
      throw new Error(`Bilinmeyen seslendirme sağlayıcısı: ${provider}`);
  }
}

/**
 * Anlatım metnini seslendirmeye uygun hâle getirir: URL'leri ve Markdown işaretlerini atar,
 * bazı sembolleri okunuşuna çevirir.
 */
export function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/→/g, ', then ')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}
