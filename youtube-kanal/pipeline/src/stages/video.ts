// Medya aşamaları: seslendirme → ekran görüntüleri → video → kapak → açıklama ve çıktı dosyaları.
// Her aşama sonucunu diske yazar; yarıda kalan bir çalıştırma kaldığı yerden devam eder.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import type { AffiliateLink, ChannelConfig } from '../lib/config.ts';
import { ROOT } from '../lib/config.ts';
import type { Episode } from '../lib/episode.ts';
import type { Script } from '../lib/script.ts';
import { captureAll, type SceneCapture } from '../media/capture.ts';
import { generateSceneImages, styledPrompt, type ImageProvider } from '../media/images.ts';
import { probeDuration } from '../media/ffmpeg.ts';
import { buildAudio, muxFinal, renderSegments, renderThumbnail, sceneSpecs } from '../media/render.ts';
import { buildSrt, buildTimeline, chapters, formatTimestamp, totalDuration } from '../media/timeline.ts';
import { speakable, type TtsProvider } from '../media/tts.ts';
import { buildDescription } from './describe.ts';
import type { Metadata } from './write.ts';

export interface VideoOutputs {
  dir: string;
  video: string;
  thumbnail: string;
  srt: string;
  uploadTxt: string;
  duration: number;
  ttsChars: number;
  /** bu çalıştırmada üretilen görsel sayısı (maliyet için) */
  imagesGenerated: number;
}

const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);

/** Her sahneyi seslendirir; metni ve ses ayarı değişmeyen sahneleri yeniden üretmez. */
export async function voiceScenes(
  ep: Episode,
  script: Script,
  tts: TtsProvider,
  voiceCfg: unknown,
): Promise<{ files: string[]; durations: Record<string, number>; chars: number }> {
  const dir = ep.workPath('audio');
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const durations: Record<string, number> = {};
  let chars = 0;
  for (const sc of script.scenes) {
    const text = speakable(sc.narration);
    const file = join(dir, `${sc.id}.mp3`);
    const marker = `${file}.hash`;
    const hash = sha(JSON.stringify({ text, provider: tts.name, voiceCfg }));
    if (!(existsSync(file) && existsSync(marker) && readFileSync(marker, 'utf8') === hash)) {
      await tts.synthesize(text, file);
      writeFileSync(marker, hash);
      chars += text.length;
    }
    files.push(file);
    durations[sc.id] = await probeDuration(file);
  }
  return { files, durations, chars };
}

export async function buildVideo(args: {
  ep: Episode;
  browser: Browser;
  channel: ChannelConfig;
  script: Script;
  meta: Metadata;
  links: AffiliateLink[];
  tts: TtsProvider;
  images?: ImageProvider;
  log?: (msg: string) => void;
}): Promise<VideoOutputs> {
  const { ep, browser, channel, script, meta, links, tts } = args;
  const log = args.log ?? console.log;
  const fps = channel.video.fps;

  log('🎙️  Seslendirme');
  const voice = await voiceScenes(ep, script, tts, channel.voice[tts.name as 'elevenlabs' | 'openai' | 'google'] ?? null);
  ep.finish('voice');
  const tl = buildTimeline(script.scenes, voice.durations, {
    fps,
    lead: channel.voice.lead_in_seconds,
    tail: channel.voice.tail_seconds,
  });
  log(`   ${script.scenes.length} sahne, toplam ${formatTimestamp(totalDuration(tl))}`);

  // Yapay zekâ görselleri (listicle kanalları)
  let imageFiles: Record<string, string[]> = {};
  let imagesGenerated = 0;
  const needsImages = script.scenes.some((s) => s.visual.type === 'photos');
  if (needsImages) {
    if (!args.images || !channel.images) throw new Error('Bu kanal görsel üretimi gerektiriyor (config/channel.yaml → images)');
    log('🎨 Görseller üretiliyor');
    const res = await generateSceneImages(script, args.images, channel.images, ep.workPath('images'), log);
    imageFiles = res.files;
    imagesGenerated += res.generated;
    ep.finish('images');
  }

  log('🌐 Web sayfalarının ekran görüntüleri');
  const capPath = ep.workPath('captures.json');
  const previous: SceneCapture[] = existsSync(capPath) ? JSON.parse(readFileSync(capPath, 'utf8')) : [];
  const captures = await captureAll(browser, script.scenes, ep.workPath('shots'), previous);
  writeFileSync(capPath, JSON.stringify(captures, null, 2));
  const failed = captures.filter((c) => !c.ok);
  if (failed.length) log(`   ⚠️ ${failed.length} sayfa yakalanamadı; bu sahneler metin kartına çevrildi`);
  ep.writeJson('captures.json', captures.map((c) => ({ scene: c.sceneId, url: c.url, ok: c.ok, error: c.error, shots: c.shots.length })));
  ep.finish('capture');

  log('🎬 Video oluşturuluyor');
  const specs = sceneSpecs(channel, script.scenes, tl, captures, imageFiles, meta.titles[0] ?? script.title);
  let lastPct = -1;
  const segments = await renderSegments(browser, specs, tl, fps, ep.workPath('segments'), (d, n) => {
    const pct = Math.floor((d / n) * 10) * 10;
    if (pct !== lastPct) log(`   %${pct} (${d}/${n} sahne)`);
    lastPct = pct;
  });
  const outDir = ep.workPath('out');
  mkdirSync(outDir, { recursive: true });
  const audio = ep.workPath('audio', 'final.m4a');
  const music = channel.voice.music ? { file: join(ROOT, channel.voice.music), volume: channel.voice.music_volume } : undefined;
  await buildAudio(voice.files, tl, ep.workPath('audio', 'parts'), audio, music);
  const video = join(outDir, 'video.mp4');
  const duration = await muxFinal(segments, audio, ep.workPath('segments'), video);
  ep.meta.duration_seconds = Math.round(duration);
  ep.finish('render');

  log('🖼️  Kapak');
  const firstShot = captures.find((c) => c.ok)?.shots.find((s) => s.kind === 'show' || s.kind === 'after') ?? captures.find((c) => c.ok)?.shots[0];
  let thumbImage = firstShot?.file;
  if (needsImages) {
    thumbImage = Object.values(imageFiles)[1]?.[0] ?? Object.values(imageFiles)[0]?.[0];
    if (meta.thumbnail_prompt && args.images && channel.images) {
      const f = ep.workPath('images', `thumbnail-${sha(meta.thumbnail_prompt + args.images.name)}.jpg`);
      try {
        if (!existsSync(f)) {
          await args.images.generate(styledPrompt(meta.thumbnail_prompt, channel.images.style), f);
          imagesGenerated++;
        }
        thumbImage = f;
      } catch (e) {
        log(`   ⚠️ Kapak görseli üretilemedi, videodan bir görsel kullanılıyor: ${(e as Error).message.slice(0, 160)}`);
      }
    }
  }
  const thumbnail = join(outDir, 'thumbnail.jpg');
  await renderThumbnail(
    browser,
    {
      brand: channel.brand,
      text: meta.thumbnail_text,
      badge: meta.thumbnail_badge,
      tool: script.tools[0] ?? '',
      image: thumbImage,
      style: channel.thumbnail?.style ?? 'browser',
    },
    thumbnail,
  );
  ep.finish('thumbnail');

  // Açıklama, altyazı ve yükleme notu
  const chaps = chapters(script.scenes, tl);
  const description = buildDescription({ channel, meta, script, links, chapters: chaps });
  const srt = join(outDir, 'captions.srt');
  writeFileSync(srt, buildSrt(script.scenes, tl));
  const uploadTxt = join(outDir, 'upload.txt');
  writeFileSync(
    uploadTxt,
    [
      'TITLE (copy one)',
      ...meta.titles.map((t, i) => `${i + 1}. ${t}`),
      '',
      'DESCRIPTION',
      description,
      '',
      'TAGS',
      meta.tags.join(', '),
      '',
      `Duration: ${formatTimestamp(duration)}`,
    ].join('\n'),
  );
  ep.write('description.txt', description + '\n');
  copyFileSync(uploadTxt, ep.path('upload.txt'));
  copyFileSync(thumbnail, ep.path('thumbnail.jpg'));
  ep.writeJson('timeline.json', tl.map((t, i) => ({ ...t, chapter: script.scenes[i].chapter, visual: specs[i].visual.type })));
  return { dir: outDir, video, thumbnail, srt, uploadTxt, duration, ttsChars: voice.chars, imagesGenerated };
}
