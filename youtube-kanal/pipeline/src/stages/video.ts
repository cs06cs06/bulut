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
import { generateMotionClips, selectMotionTargets, type MotionProvider } from '../media/motion.ts';
import { ensureDepthModel, generateParallaxClips, parallaxAvailable, pickParallaxTargets } from '../media/parallax.ts';
import { buildAudio, buildPlacedAudio, makePop, muxFinal, renderSegments, renderThumbnail, sceneSpecs, type SceneExtras } from '../media/render.ts';
import { buildJcutTimeline, buildSrt, buildTimeline, chapters, formatTimestamp, totalDuration, type TimedScene } from '../media/timeline.ts';
import {
  alignSentences,
  assColor,
  buildAss,
  captionEvents,
  detectSilences,
  highlight,
  phraseTime,
  splitSentences,
  windowEvents,
  writeAss,
  type CaptionEvent,
} from '../media/align.ts';
import { renderShorts } from '../media/shorts.ts';
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
  /** üretilen Veo klibi sayısı (maliyet takibi) */
  clipsGenerated: number;
  shorts: string[];
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
  motion?: MotionProvider;
  log?: (msg: string) => void;
}): Promise<VideoOutputs> {
  const { ep, browser, channel, script, meta, links, tts } = args;
  const log = args.log ?? console.log;
  const fps = channel.video.fps;

  log('🎙️  Seslendirme');
  const voice = await voiceScenes(ep, script, tts, channel.voice[tts.name as 'elevenlabs' | 'openai' | 'google'] ?? null);
  ep.finish('voice');
  const edit = channel.edit;
  const tl = edit
    ? buildJcutTimeline(script.scenes, voice.durations, {
        fps,
        lead: channel.voice.lead_in_seconds,
        gap: edit.gap_seconds,
        jcut: edit.jcut_seconds,
        tail: channel.voice.tail_seconds,
      })
    : buildTimeline(script.scenes, voice.durations, {
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

  let clipFiles: Record<string, Record<string, string>> = {};
  let clipSeconds: Record<string, Record<string, number>> = {};
  let clipsGenerated = 0;
  const addClips = (files: typeof clipFiles, secs: typeof clipSeconds) => {
    for (const [id, m] of Object.entries(files)) Object.assign((clipFiles[id] ??= {}), m);
    for (const [id, m] of Object.entries(secs)) Object.assign((clipSeconds[id] ??= {}), m);
  };

  // Derinlik efekti (ücretsiz): görsellerin bir kısmı "3D fotoğraf" klibine çevrilir, kalanı klasik kayma/yakınlaşma
  if (needsImages && channel.parallax) {
    if (!(await parallaxAvailable())) {
      log('   ⚠️ Derinlik efekti atlandı: Python paketleri (numpy, opencv-python-headless, onnxruntime) kurulu değil');
    } else {
      try {
        const targets = pickParallaxTargets(script, imageFiles, channel.parallax);
        log(`🌄 Derinlik efekti (${targets.length} görsel)`);
        const model = await ensureDepthModel(channel.parallax, log);
        const res = await generateParallaxClips(targets, channel.parallax, { model, dir: ep.workPath('parallax'), fps, log });
        addClips(res.files, res.seconds);
      } catch (e) {
        log(`   ⚠️ Derinlik efekti atlandı: ${(e as Error).message.slice(0, 200)}`);
      }
    }
  }

  // Hareketli sahneler (isteğe bağlı, Veo): seçili görseller kısa kliplere çevrilir
  if (needsImages && args.motion && channel.motion) {
    const targets = await selectMotionTargets(script, imageFiles, channel.motion, args.motion, ep.workPath('clips', 'screen.json'), log);
    if (targets.length) {
      log(`🎞️  Hareketli sahneler (${targets.length} klip)`);
      const res = await generateMotionClips(targets, args.motion, channel.motion, ep.workPath('clips'), (m) => {
        if (m.includes('⚠️') || m.startsWith(`   ${targets.length}/`)) log(m);
      });
      addClips(res.files, res.seconds);
      clipsGenerated = res.generated;
      log(`   ${targets.length - res.dropped} klip kullanılacak, ${res.dropped} klip kalite kontrolünden geçemedi`);
      ep.finish('clips');
    }
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

  // Kurgu zamanlamaları: cümle sınırları → altyazılar, vurgu (punch-in) ve abone çağrısı anları
  let captions: CaptionEvent[] = [];
  const extras: Record<string, SceneExtras> = {};
  for (const [id, clips] of Object.entries(clipFiles)) extras[id] = { clips, clipSeconds: clipSeconds[id] };
  const sfx: { file: string; start: number; volume?: number }[] = [];
  if (edit) {
    const timing = await sceneTiming(script, tl, voice.files);
    captions = timing.captions;
    const pop = await makePop(ep.workPath('audio', 'pop.wav'));
    script.scenes.forEach((sc, i) => {
      const t = tl[i];
      const rel = (abs: number | null) => (abs == null ? null : abs - t.start);
      const punch = rel(timing.punch[sc.id] ?? null);
      const sub = rel(timing.subscribe[sc.id] ?? null);
      extras[sc.id] = {
        ...extras[sc.id],
        punchAt: punch != null && punch > 0.6 && punch < t.duration - 0.8 ? punch : null,
        subscribeAt: sub != null && sub >= 0 && sub < t.duration ? sub : null,
      };
      if (extras[sc.id].subscribeAt != null) {
        const abs = t.start + extras[sc.id].subscribeAt!;
        sfx.push({ file: pop, start: abs, volume: 0.35 }, { file: pop, start: abs + 1.4, volume: 0.5 });
      }
    });
    if (edit.captions) {
      const accent = assColor(channel.brand.accent);
      const styled = captions.map((c) => ({ ...c, text: highlight(c.text, c.keywords ?? [], accent) }));
      mkdirSync(ep.workPath('captions'), { recursive: true });
      tl.forEach((t) => {
        const ev = windowEvents(styled, t.start, t.start + t.duration);
        if (ev.length) {
          extras[t.id].assFile = writeAss(
            ep.workPath('captions', `${t.id}.ass`),
            buildAss(ev, { width: channel.video.width, height: channel.video.height, fontSize: 66, marginV: 60, alignment: 2 }),
          );
        }
      });
    }
  }

  log('🎬 Video oluşturuluyor');
  const specs = sceneSpecs(channel, script.scenes, tl, captures, imageFiles, meta.titles[0] ?? script.title, extras);
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
  if (edit) {
    await buildPlacedAudio(voice.files.map((file, i) => ({ file, start: tl[i].audioStart })), totalDuration(tl), audio, sfx);
  } else {
    await buildAudio(voice.files, tl, ep.workPath('audio', 'parts'), audio, music);
  }
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
  writeFileSync(srt, captions.length ? srtFromEvents(captions) : buildSrt(script.scenes, tl));

  // Shorts (dikey, 15–45 sn): aynı görsellerden
  const shortFiles: string[] = [];
  if (edit?.shorts && script.shorts?.length) {
    log('📱 Shorts');
    const res = await renderShorts({ ep, browser, channel, script, tts, images: imageFiles, clips: clipFiles, clipSeconds, count: edit.shorts, log });
    shortFiles.push(...res);
  }
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
      ...(edit ? studioChecklist(meta, script, shortFiles) : []),
    ].join('\n'),
  );
  ep.write('description.txt', description + '\n');
  copyFileSync(uploadTxt, ep.path('upload.txt'));
  copyFileSync(thumbnail, ep.path('thumbnail.jpg'));
  ep.writeJson('timeline.json', tl.map((t, i) => ({ ...t, chapter: script.scenes[i].chapter, visual: specs[i].visual.type })));
  return { dir: outDir, video, thumbnail, srt, uploadTxt, duration, ttsChars: voice.chars, imagesGenerated, clipsGenerated, shorts: shortFiles };
}

/** Sahne sesleri için cümle sınırları; altyazı olayları, vurgu ve abone anlarının mutlak zamanları. */
async function sceneTiming(script: Script, tl: TimedScene[], audioFiles: string[]) {
  const captions: CaptionEvent[] = [];
  const punch: Record<string, number> = {};
  const subscribe: Record<string, number> = {};
  for (let i = 0; i < script.scenes.length; i++) {
    const sc = script.scenes[i];
    const t = tl[i];
    const sentences = splitSentences(sc.narration);
    const silences = await detectSilences(audioFiles[i]);
    const starts = alignSentences(sentences, silences, t.audioDuration);
    for (const ev of captionEvents(sc.narration, t.audioStart, t.audioDuration, starts)) captions.push({ ...ev, keywords: sc.keywords ?? [] });
    if (sc.punch) {
      const p = phraseTime(sc.narration, sc.punch, starts, t.audioDuration);
      if (p != null) punch[sc.id] = t.audioStart + p;
    }
    if (sc.subscribe) subscribe[sc.id] = t.audioStart + starts[starts.length - 1];
  }
  return { captions, punch, subscribe };
}

function srtTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
}

export function srtFromEvents(events: { start: number; end: number; text: string }[]): string {
  return events.map((e, i) => `${i + 1}\n${srtTime(e.start)} --> ${srtTime(e.end)}\n${e.text}\n`).join('\n');
}

/** YouTube Studio'da yapılacaklar: bitiş ekranı, oynatma listesi, altyazı çevirisi, Shorts, Topluluk gönderisi. */
function studioChecklist(meta: Metadata, script: Script, shorts: string[]): string[] {
  return [
    '\nYOUTUBE STUDIO CHECKLIST',
    '- End screen (last 20 s): add "Best for viewer" video + Subscribe element.' +
      (script.next_video ? ` The narration points to: "${script.next_video}".` : ''),
    meta.playlist ? `- Add to playlist: "${meta.playlist}" (create it if needed; series = binge-watching).` : '',
    '- Subtitles: upload captions.srt (English). YouTube auto-translates them into other languages automatically.',
    '- Chapters are in the description (each item is a chapter).',
    ...shorts.map((f, i) => `- Short ${i + 1}: ${f.split('/').pop()} — "${script.shorts?.[i]?.title ?? ''}" (link it to this video with "Related video").`),
    meta.community_post ? `\nCOMMUNITY POST (share 2–3 days after the video)\n${meta.community_post}` : '',
  ].filter(Boolean);
}
