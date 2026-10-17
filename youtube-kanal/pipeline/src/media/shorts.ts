// Shorts: uzun videonun "hunisi". Her biri tek bir maddeden, dikey (1080×1920), 15–45 saniye; hızlı çekimler,
// büyük ve anahtar kelimeleri vurgulu altyazı, ilk 3 saniyede üstte kanca sorusu, sonda uzun videoya yönlendirme.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser } from 'playwright';
import type { ChannelConfig } from '../lib/config.ts';
import type { Episode } from '../lib/episode.ts';
import type { Script } from '../lib/script.ts';
import { alignSentences, assColor, buildAss, captionEvents, detectSilences, highlight, splitSentences, writeAss } from './align.ts';
import { ffmpeg, probeDuration } from './ffmpeg.ts';
import { renderPhotoScene } from './photoscene.ts';
import { buildPlacedAudio } from './render.ts';
import { speakable, type TtsProvider } from './tts.ts';

const LEAD = 0.3;
const TAIL = 0.7;
const MAX_SECONDS = 58;

export async function renderShorts(args: {
  ep: Episode;
  browser: Browser;
  channel: ChannelConfig;
  script: Script;
  tts: TtsProvider;
  images: Record<string, string[]>;
  clips?: Record<string, Record<string, string>>;
  clipSeconds?: Record<string, Record<string, number>>;
  count: number;
  log?: (m: string) => void;
}): Promise<string[]> {
  const { ep, browser, channel, script, tts } = args;
  const log = args.log ?? (() => {});
  const fps = channel.video.fps;
  const dir = ep.workPath('shorts');
  mkdirSync(dir, { recursive: true });
  const outs: string[] = [];
  const accent = assColor(channel.brand.accent);

  for (const [k, sh] of (script.shorts ?? []).slice(0, args.count).entries()) {
    const scene = script.scenes.find((s) => s.visual.type === 'photos' && s.visual.number === sh.number);
    const imgs = scene ? args.images[scene.id] ?? [] : [];
    if (!imgs.length) continue;
    try {
      // Seslendirme (metin değişmediyse yeniden üretilmez)
      const text = speakable(sh.narration);
      const audio = join(dir, `short-${k + 1}.mp3`);
      const hash = createHash('sha1').update(text + tts.name).digest('hex').slice(0, 12);
      if (!(existsSync(audio) && existsSync(`${audio}.hash`) && readFileSync(`${audio}.hash`, 'utf8') === hash)) {
        await tts.synthesize(text, audio);
        writeFileSync(`${audio}.hash`, hash);
      }
      const dur = Math.min(MAX_SECONDS - LEAD - TAIL, await probeDuration(audio));
      const total = LEAD + dur + TAIL;
      const frames = Math.ceil(total * fps);

      // Altyazı: büyük, ortanın altında; üstte kanca ve sonda yönlendirme
      const starts = alignSentences(splitSentences(sh.narration), await detectSilences(audio), dur);
      const words = captionEvents(sh.narration, LEAD, dur, starts, { maxWords: 4, maxChars: 22 }).map((e) => ({
        ...e,
        text: highlight(e.text, scene?.keywords ?? [], accent),
        style: 'Main' as const,
      }));
      const top = [
        { start: 0, end: Math.min(3, total), text: `{\\c${accent}}${sh.hook_text}`, style: 'Top' as const },
        { start: Math.max(0, total - 2.6), end: total, text: 'Full video on the channel', style: 'Top' as const },
      ];
      const ass = writeAss(
        join(dir, `short-${k + 1}.ass`),
        buildAss(
          [...words, ...top],
          { width: 1080, height: 1920, fontSize: 100, marginV: 460, alignment: 2 },
          { width: 1080, height: 1920, fontSize: 88, marginV: 220, alignment: 8 },
        ),
      );

      const video = join(dir, `short-${k + 1}-video.mp4`);
      await renderPhotoScene(
        browser,
        {
          images: imgs.map((f) => pathToFileURL(f).href),
          look: channel.look,
          seed: 100 + k,
          first: true,
          last: false,
          total: 0,
          videoTitle: '',
          duration: total,
          visual: { type: 'photos', number: 0, heading: '' },
          brand: channel.brand,
          edit: channel.edit,
          cadence: 2.2,
          assFile: ass,
          clips: scene ? args.clips?.[scene.id] : undefined,
          clipSeconds: scene ? args.clipSeconds?.[scene.id] : undefined,
          outW: 1080,
          outH: 1920,
        },
        frames,
        fps,
        video,
        ep.work,
      );
      const m4a = join(dir, `short-${k + 1}.m4a`);
      await buildPlacedAudio([{ file: audio, start: LEAD }], frames / fps, m4a);
      const out = ep.workPath('out', `short-${k + 1}.mp4`);
      await ffmpeg(['-i', video, '-i', m4a, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out]);
      outs.push(out);
      log(`   ✓ short-${k + 1}.mp4 (${Math.round(total)} sn) — ${sh.title}`);
    } catch (e) {
      log(`   ⚠️ Short ${k + 1} üretilemedi: ${(e as Error).message.split('\n')[0].slice(0, 200)}`);
    }
  }
  return outs;
}
